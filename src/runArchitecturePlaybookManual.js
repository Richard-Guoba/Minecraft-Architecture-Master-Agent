import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadP2PublicCorpus } from './playbook/knowledge/publicCandidateCorpus.js';
import {
  P3_MANAGED_ARTIFACT_PATHS,
  validateP3AdmissionPolicy
} from './playbook/manual/p3AdmissionPolicy.js';
import { compilePlaybookV01 } from './playbook/manual/playbookV01Compiler.js';

const POLICY_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json';
const MANAGED_PATH_SET = new Set(P3_MANAGED_ARTIFACT_PATHS);
const SAFE_ERROR_CODE = /^PLAYBOOK_[A-Z0-9_]+$/u;
let temporarySequence = 0;

export function parseArchitecturePlaybookManualArgs(argv) {
  if (
    !Array.isArray(argv)
    || argv.length !== 1
    || !['build', 'check'].includes(argv[0])
  ) {
    throwManualError('PLAYBOOK_MANUAL_ARGUMENT_INVALID');
  }
  return Object.freeze({ command: argv[0] });
}

export async function writeManagedPlaybookArtifacts({
  projectRoot,
  artifacts,
  fsImpl = fs
}) {
  const artifactBytes = validateArtifactSet(artifacts);
  const targets = await resolveManagedTargets({
    projectRoot,
    fsImpl,
    createParents: true
  });
  const originals = await readOriginals(targets, fsImpl);
  const artifactHashes = buildArtifactHashes(artifactBytes);
  const status = originals.every((original) => original === null)
    ? 'created'
    : originals.every((original, index) =>
      original !== null
      && original.equals(artifactBytes[P3_MANAGED_ARTIFACT_PATHS[index]]))
      ? 'unchanged'
      : 'updated';
  const staged = [];

  try {
    for (const [index, target] of targets.entries()) {
      const temporary = temporarySibling(target.absolutePath, 'stage', index);
      await stageBytes({
        fsImpl,
        temporary,
        bytes: artifactBytes[target.relativePath]
      });
      staged.push({ temporary, target });
    }
  } catch (error) {
    await cleanupTemporaries(fsImpl, staged.map((item) => item.temporary));
    if (isManualError(error)) throw error;
    throwManualError('PLAYBOOK_MANUAL_STAGE_FAILED');
  }

  if (status === 'unchanged') {
    const cleanupFailures = await cleanupTemporaries(
      fsImpl,
      staged.map((item) => item.temporary)
    );
    if (cleanupFailures.length > 0) {
      throwManualError('PLAYBOOK_MANUAL_STAGE_FAILED', cleanupFailures);
    }
    return writeSummary(status, artifactHashes);
  }

  let failedPath = null;
  try {
    for (const item of staged) {
      failedPath = item.target.relativePath;
      await fsImpl.rename(item.temporary, item.target.absolutePath);
    }
  } catch {
    const rollbackFailures = await rollbackOriginals({
      fsImpl,
      targets,
      originals
    });
    const cleanupFailures = await cleanupTemporaries(
      fsImpl,
      staged.map((item) => item.temporary)
    );
    const inconsistentPaths = fixedManagedOrder(new Set([
      ...rollbackFailures,
      ...cleanupFailures
    ]));
    if (inconsistentPaths.length > 0) {
      throwManualError('PLAYBOOK_MANUAL_ROLLBACK_FAILED', inconsistentPaths);
    }
    throwManualError('PLAYBOOK_MANUAL_INSTALL_FAILED', [failedPath]);
  }

  return writeSummary(status, artifactHashes);
}

export async function checkManagedPlaybookArtifacts({ projectRoot, artifacts }) {
  const artifactBytes = validateArtifactSet(artifacts);
  const targets = await resolveManagedTargets({
    projectRoot,
    fsImpl: fs,
    createParents: false
  });
  const driftPaths = [];
  for (const target of targets) {
    let actual;
    try {
      actual = await fs.readFile(target.absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
        driftPaths.push(target.relativePath);
        continue;
      }
      throwManualError('PLAYBOOK_MANUAL_CHECK_FAILED', [target.relativePath]);
    }
    if (!actual.equals(artifactBytes[target.relativePath])) {
      driftPaths.push(target.relativePath);
    }
  }
  driftPaths.sort();
  return Object.freeze({
    status: driftPaths.length === 0 ? 'current' : 'drift',
    artifact_count: P3_MANAGED_ARTIFACT_PATHS.length,
    managed_artifact_drift_count: driftPaths.length,
    drift_paths: Object.freeze(driftPaths),
    artifact_hashes: buildArtifactHashes(artifactBytes)
  });
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArchitecturePlaybookManualArgs(argv);
    const projectRoot = process.env.PLAYBOOK_PROJECT_ROOT
      ? path.resolve(process.env.PLAYBOOK_PROJECT_ROOT)
      : path.resolve(import.meta.dirname, '..');
    const compilation = await loadCheckedCompilation(projectRoot);
    const result = options.command === 'build'
      ? await writeManagedPlaybookArtifacts({
        projectRoot,
        artifacts: compilation.artifacts
      })
      : await checkManagedPlaybookArtifacts({
        projectRoot,
        artifacts: compilation.artifacts
      });
    if (options.command === 'check' && result.managed_artifact_drift_count > 0) {
      throwManualError('PLAYBOOK_MANUAL_ARTIFACT_DRIFT', result.drift_paths);
    }
    process.stdout.write(renderSummary(options.command, compilation, result));
    return result;
  } catch (error) {
    throw sanitizeManualError(error);
  }
}

async function loadCheckedCompilation(projectRoot) {
  let corpus;
  try {
    corpus = await loadP2PublicCorpus({ projectRoot });
  } catch (error) {
    throw sanitizeManualError(error, 'PLAYBOOK_MANUAL_CORPUS_INVALID');
  }
  let document;
  try {
    const bytes = await fs.readFile(path.join(projectRoot, POLICY_PATH), 'utf8');
    document = JSON.parse(bytes);
  } catch {
    throwManualError('PLAYBOOK_MANUAL_POLICY_INVALID');
  }
  let policy;
  try {
    policy = validateP3AdmissionPolicy(document, {
      candidateRuleIds: new Set(corpus.candidates.map((candidate) => candidate.rule_id))
    });
  } catch (error) {
    throw sanitizeManualError(error, 'PLAYBOOK_MANUAL_POLICY_INVALID');
  }
  try {
    return compilePlaybookV01({ corpus, policy });
  } catch (error) {
    throw sanitizeManualError(error, 'PLAYBOOK_MANUAL_COMPILE_FAILED');
  }
}

function validateArtifactSet(artifacts) {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    throwManualError('PLAYBOOK_MANUAL_ARTIFACT_SET_INVALID');
  }
  const actualPaths = Object.keys(artifacts);
  if (actualPaths.some((artifactPath) => !MANAGED_PATH_SET.has(artifactPath))) {
    throwManualError('PLAYBOOK_MANUAL_PATH_INVALID');
  }
  if (
    actualPaths.length !== P3_MANAGED_ARTIFACT_PATHS.length
    || P3_MANAGED_ARTIFACT_PATHS.some((artifactPath) =>
      !Object.hasOwn(artifacts, artifactPath)
      || typeof artifacts[artifactPath] !== 'string')
  ) {
    throwManualError('PLAYBOOK_MANUAL_ARTIFACT_SET_INVALID');
  }
  return Object.fromEntries(P3_MANAGED_ARTIFACT_PATHS.map((artifactPath) => [
    artifactPath,
    Buffer.from(artifacts[artifactPath], 'utf8')
  ]));
}

async function resolveManagedTargets({ projectRoot, fsImpl, createParents }) {
  let root;
  let rootReal;
  try {
    root = path.resolve(projectRoot);
    rootReal = await fsImpl.realpath(root);
  } catch {
    throwManualError('PLAYBOOK_MANUAL_PROJECT_ROOT_INVALID');
  }
  const targets = P3_MANAGED_ARTIFACT_PATHS.map((relativePath) => {
    const absolutePath = path.resolve(root, relativePath);
    const normalizedRelative = path.relative(root, absolutePath)
      .split(path.sep)
      .join('/');
    if (normalizedRelative !== relativePath || !isWithin(absolutePath, root)) {
      throwManualError('PLAYBOOK_MANUAL_PATH_INVALID');
    }
    return Object.freeze({
      relativePath,
      absolutePath,
      parentPath: path.dirname(absolutePath)
    });
  });

  for (const target of targets) {
    await assertExistingStorageWithinRoot({ target, rootReal, fsImpl });
  }
  if (createParents) {
    for (const target of targets) {
      try {
        await fsImpl.mkdir(target.parentPath, { recursive: true });
      } catch {
        throwManualError('PLAYBOOK_MANUAL_PATH_PREPARE_FAILED', [
          target.relativePath
        ]);
      }
    }
  }
  for (const target of targets) {
    await assertFinalStorageWithinRoot({
      target,
      rootReal,
      fsImpl,
      parentMustExist: createParents
    });
  }
  return targets;
}

async function assertExistingStorageWithinRoot({ target, rootReal, fsImpl }) {
  let nearest;
  let nearestReal;
  try {
    nearest = await nearestExistingAncestor(target.parentPath, fsImpl);
    nearestReal = await fsImpl.realpath(nearest);
  } catch {
    throwManualError('PLAYBOOK_MANUAL_PATH_CHECK_FAILED', [target.relativePath]);
  }
  if (!isWithin(nearestReal, rootReal)) {
    throwManualError('PLAYBOOK_MANUAL_SYMLINK_ESCAPE', [target.relativePath]);
  }
}

async function assertFinalStorageWithinRoot({
  target,
  rootReal,
  fsImpl,
  parentMustExist
}) {
  let parentReal;
  try {
    parentReal = await fsImpl.realpath(target.parentPath);
  } catch (error) {
    if (error?.code === 'ENOENT' && !parentMustExist) return;
    throwManualError('PLAYBOOK_MANUAL_PATH_CHECK_FAILED', [target.relativePath]);
  }
  if (!isWithin(parentReal, rootReal)) {
    throwManualError('PLAYBOOK_MANUAL_SYMLINK_ESCAPE', [target.relativePath]);
  }
  try {
    const targetStat = await fsImpl.lstat(target.absolutePath);
    if (targetStat.isSymbolicLink()) {
      throwManualError('PLAYBOOK_MANUAL_SYMLINK_ESCAPE', [target.relativePath]);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    if (isManualError(error)) throw error;
    throwManualError('PLAYBOOK_MANUAL_PATH_CHECK_FAILED', [target.relativePath]);
  }
}

async function nearestExistingAncestor(start, fsImpl) {
  let current = path.resolve(start);
  while (true) {
    try {
      await fsImpl.lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error('no existing ancestor');
    current = parent;
  }
}

async function readOriginals(targets, fsImpl) {
  const originals = [];
  for (const target of targets) {
    try {
      originals.push(await fsImpl.readFile(target.absolutePath));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        originals.push(null);
        continue;
      }
      throwManualError('PLAYBOOK_MANUAL_READ_FAILED', [target.relativePath]);
    }
  }
  return originals;
}

async function stageBytes({ fsImpl, temporary, bytes }) {
  let handle = null;
  try {
    handle = await fsImpl.open(temporary, 'wx');
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // The caller reports the stable stage or rollback failure code.
      }
    }
    try {
      await fsImpl.rm(temporary, { force: true });
    } catch {
      // The caller reports the stable stage or rollback failure code.
    }
    throw error;
  }
}

async function rollbackOriginals({ fsImpl, targets, originals }) {
  const failures = [];
  for (const [index, target] of targets.entries()) {
    let temporary = null;
    try {
      if (originals[index] === null) {
        await fsImpl.rm(target.absolutePath, { force: true });
        continue;
      }
      temporary = temporarySibling(target.absolutePath, 'rollback', index);
      await stageBytes({ fsImpl, temporary, bytes: originals[index] });
      await fsImpl.rename(temporary, target.absolutePath);
      temporary = null;
    } catch {
      failures.push(target.relativePath);
    } finally {
      if (temporary) {
        try {
          await fsImpl.rm(temporary, { force: true });
        } catch {
          failures.push(target.relativePath);
        }
      }
    }
  }
  return fixedManagedOrder(new Set(failures));
}

async function cleanupTemporaries(fsImpl, temporaries) {
  const failures = [];
  for (const temporary of temporaries) {
    try {
      await fsImpl.rm(temporary, { force: true });
    } catch {
      const target = P3_MANAGED_ARTIFACT_PATHS.find((artifactPath) =>
        temporary.startsWith(`${path.resolve(path.dirname(temporary), path.basename(artifactPath))}.`));
      if (target) failures.push(target);
    }
  }
  return fixedManagedOrder(new Set(failures));
}

function temporarySibling(target, purpose, index) {
  temporarySequence += 1;
  return `${target}.playbook-manual-${purpose}-${process.pid}-${temporarySequence}-${index}.tmp`;
}

function buildArtifactHashes(artifactBytes) {
  return Object.freeze(Object.fromEntries(P3_MANAGED_ARTIFACT_PATHS.map(
    (artifactPath) => [artifactPath, sha256(artifactBytes[artifactPath])]
  )));
}

function writeSummary(status, artifactHashes) {
  return Object.freeze({
    status,
    artifact_count: P3_MANAGED_ARTIFACT_PATHS.length,
    artifact_hashes: artifactHashes
  });
}

function renderSummary(command, compilation, result) {
  const lines = [
    `playbook_status=${result.status}`,
    `playbook_version=${compilation.playbook_version}`,
    `reviewed_rule_count=${compilation.summary.reviewed_rule_count}`,
    `core_procedure_count=${compilation.summary.core_procedure_count}`,
    `case_pattern_count=${compilation.summary.case_pattern_count}`,
    `artifact_count=${result.artifact_count}`
  ];
  if (command === 'check') {
    lines.push(
      `managed_artifact_drift_count=${result.managed_artifact_drift_count}`
    );
  }
  return `${lines.join('\n')}\n`;
}

function fixedManagedOrder(paths) {
  return P3_MANAGED_ARTIFACT_PATHS.filter((artifactPath) => paths.has(artifactPath));
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function newManualError(code, managedPaths = []) {
  const safePaths = fixedManagedOrder(new Set(
    managedPaths.filter((artifactPath) => MANAGED_PATH_SET.has(artifactPath))
  ));
  const error = new Error(
    safePaths.length > 0 ? `${code}: ${safePaths.join(',')}` : code
  );
  error.name = 'ArchitecturePlaybookManualError';
  error.code = code;
  error.managedPaths = Object.freeze(safePaths);
  return error;
}

function throwManualError(code, managedPaths = []) {
  throw newManualError(code, managedPaths);
}

function isManualError(error) {
  return error?.name === 'ArchitecturePlaybookManualError'
    && SAFE_ERROR_CODE.test(error?.code);
}

function sanitizeManualError(error, fallbackCode = 'PLAYBOOK_MANUAL_FAILED') {
  if (isManualError(error)) return error;
  const explicitCode = typeof error?.code === 'string'
    && SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : null;
  const messageCode = typeof error?.message === 'string'
    ? error.message.match(/^(PLAYBOOK_[A-Z0-9_]+)/u)?.[1]
    : null;
  return newManualError(explicitCode ?? messageCode ?? fallbackCode);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const safe = sanitizeManualError(error);
    process.stderr.write(`${safe.message}\n`);
    process.exitCode = 1;
  });
}
