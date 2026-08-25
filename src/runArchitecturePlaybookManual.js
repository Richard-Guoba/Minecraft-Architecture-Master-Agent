import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
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
const MANAGED_PARENT_PATHS = Object.freeze([
  ...new Set(P3_MANAGED_ARTIFACT_PATHS.map((artifactPath) =>
    path.posix.dirname(artifactPath)))
]);
const SAFE_ERROR_CODE = /^PLAYBOOK_[A-Z0-9_]+$/u;
const DESCRIPTOR_DIRECTORY = '/proc/self/fd';
const DIRECTORY_OPEN_FLAGS = fsConstants.O_RDONLY
  | fsConstants.O_DIRECTORY
  | fsConstants.O_NOFOLLOW;
const READ_OPEN_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
const EXCLUSIVE_WRITE_FLAGS = fsConstants.O_WRONLY
  | fsConstants.O_CREAT
  | fsConstants.O_EXCL
  | fsConstants.O_NOFOLLOW;
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
  const authority = await acquireManagedAuthority({
    projectRoot,
    fsImpl,
    createParents: true
  });
  return withManagedAuthority(authority, async () => {
    await assertAuthorityBindings(authority, fsImpl);
    const originals = await readOriginals(authority.targets, fsImpl);
    await assertAuthorityBindings(authority, fsImpl);
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
      for (const [index, target] of authority.targets.entries()) {
        const temporary = temporaryRecord(target, 'stage', index);
        staged.push(temporary);
        await stageBytes({
          fsImpl,
          temporary,
          bytes: artifactBytes[target.relativePath]
        });
        await assertAuthorityBindings(authority, fsImpl);
      }
    } catch (error) {
      const cleanupFailures = await cleanupOwnedTemporaries(fsImpl, staged);
      if (cleanupFailures.length > 0) {
        throwManualError('PLAYBOOK_MANUAL_CLEANUP_FAILED', cleanupFailures);
      }
      if (isManualError(error)) throw error;
      throwManualError('PLAYBOOK_MANUAL_STAGE_FAILED');
    }

    if (status === 'unchanged') {
      const cleanupFailures = await cleanupOwnedTemporaries(fsImpl, staged);
      if (cleanupFailures.length > 0) {
        throwManualError('PLAYBOOK_MANUAL_CLEANUP_FAILED', cleanupFailures);
      }
      await assertAuthorityBindings(authority, fsImpl);
      return writeSummary(status, artifactHashes);
    }

    let failedPath = null;
    let installError = null;
    try {
      await assertAuthorityBindings(authority, fsImpl);
      for (const temporary of staged) {
        failedPath = temporary.target.relativePath;
        await fsImpl.rename(
          temporary.authorityPath,
          temporary.target.authorityPath
        );
        temporary.owned = false;
        await assertAuthorityBindings(authority, fsImpl);
      }
      await assertAuthorityBindings(authority, fsImpl);
    } catch (error) {
      installError = error;
      const rollbackFailures = await rollbackOriginals({
        fsImpl,
        targets: authority.targets,
        originals
      });
      const cleanupFailures = await cleanupOwnedTemporaries(fsImpl, staged);
      const inconsistentPaths = fixedManagedOrder(new Set([
        ...rollbackFailures,
        ...cleanupFailures
      ]));
      if (inconsistentPaths.length > 0) {
        throwManualError('PLAYBOOK_MANUAL_ROLLBACK_FAILED', inconsistentPaths);
      }
      if (isManualError(installError)) throw installError;
      throwManualError('PLAYBOOK_MANUAL_INSTALL_FAILED', [failedPath]);
    }

    return writeSummary(status, artifactHashes);
  });
}

export async function checkManagedPlaybookArtifacts({ projectRoot, artifacts }) {
  const artifactBytes = validateArtifactSet(artifacts);
  const authority = await acquireManagedAuthority({
    projectRoot,
    fsImpl: fs,
    createParents: false
  });
  return withManagedAuthority(authority, async () => {
    await assertAuthorityBindings(authority, fs);
    const driftPaths = [];
    const checkedArtifacts = {};
    for (const target of authority.targets) {
      if (!target.parent) {
        driftPaths.push(target.relativePath);
        checkedArtifacts[target.relativePath] = '';
        continue;
      }
      const actual = await readManagedTarget(target, fs, {
        errorCode: 'PLAYBOOK_MANUAL_CHECK_FAILED'
      });
      checkedArtifacts[target.relativePath] = actual?.toString('utf8') ?? '';
      if (actual === null || !actual.equals(artifactBytes[target.relativePath])) {
        driftPaths.push(target.relativePath);
      }
    }
    await assertAuthorityBindings(authority, fs);
    driftPaths.sort();
    return Object.freeze({
      status: driftPaths.length === 0 ? 'current' : 'drift',
      artifact_count: P3_MANAGED_ARTIFACT_PATHS.length,
      managed_artifact_drift_count: driftPaths.length,
      drift_paths: Object.freeze(driftPaths),
      artifact_hashes: buildArtifactHashes(artifactBytes),
      checked_artifacts: Object.freeze(checkedArtifacts)
    });
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

async function acquireManagedAuthority({ projectRoot, fsImpl, createParents }) {
  let root;
  let rootReal;
  let rootHandle;
  const parents = new Map();
  try {
    root = path.resolve(projectRoot);
    rootReal = await fsImpl.realpath(root);
    rootHandle = await fsImpl.open(rootReal, DIRECTORY_OPEN_FLAGS);
    await assertDescriptorIdentity(rootHandle, fsImpl);
  } catch (error) {
    if (rootHandle) {
      try {
        await rootHandle.close();
      } catch {
        // The stable authority or root error remains primary.
      }
    }
    if (isManualError(error)) throw error;
    throwManualError('PLAYBOOK_MANUAL_PROJECT_ROOT_INVALID');
  }

  try {
    for (const parentRelativePath of MANAGED_PARENT_PATHS) {
      const handle = await openDirectoryTree({
        rootHandle,
        parentRelativePath,
        fsImpl,
        create: createParents
      });
      if (!handle) {
        parents.set(parentRelativePath, null);
        continue;
      }
      let transferredToParents = false;
      try {
        const stat = await handle.stat();
        parents.set(parentRelativePath, Object.freeze({
          relativePath: parentRelativePath,
          lexicalPath: path.join(rootReal, parentRelativePath),
          handle,
          descriptorPath: descriptorPath(handle),
          identity: directoryIdentity(stat)
        }));
        transferredToParents = true;
      } finally {
        if (!transferredToParents) await closeHandleIgnoringError(handle);
      }
    }
    const targets = P3_MANAGED_ARTIFACT_PATHS.map((relativePath) => {
      const absolutePath = path.resolve(rootReal, relativePath);
      const normalizedRelative = path.relative(rootReal, absolutePath)
        .split(path.sep)
        .join('/');
      if (normalizedRelative !== relativePath || !isWithin(absolutePath, rootReal)) {
        throwManualError('PLAYBOOK_MANUAL_PATH_INVALID');
      }
      const parentRelativePath = path.posix.dirname(relativePath);
      const parent = parents.get(parentRelativePath);
      const fileName = path.posix.basename(relativePath);
      return Object.freeze({
        relativePath,
        fileName,
        parent,
        authorityPath: parent
          ? path.join(parent.descriptorPath, fileName)
          : null
      });
    });
    const rootStat = await rootHandle.stat();
    return {
      root,
      rootReal,
      rootHandle,
      rootIdentity: directoryIdentity(rootStat),
      parents,
      targets
    };
  } catch (error) {
    await closeAuthorityHandles({ rootHandle, parents });
    if (isManualError(error)) throw error;
    throwManualError('PLAYBOOK_MANUAL_PATH_CHECK_FAILED');
  }
}

async function openDirectoryTree({
  rootHandle,
  parentRelativePath,
  fsImpl,
  create
}) {
  let currentHandle = rootHandle;
  let ownsCurrent = false;
  try {
    for (const component of parentRelativePath.split('/')) {
      const childPath = path.join(descriptorPath(currentHandle), component);
      let childHandle = null;
      let transferredToCurrent = false;
      try {
        try {
          childHandle = await fsImpl.open(childPath, DIRECTORY_OPEN_FLAGS);
        } catch (error) {
          if (error?.code === 'ENOENT' && !create) {
            if (ownsCurrent) await currentHandle.close();
            return null;
          }
          if (error?.code === 'ENOENT' && create) {
            try {
              await fsImpl.mkdir(childPath);
            } catch (mkdirError) {
              if (mkdirError?.code !== 'EEXIST') throw mkdirError;
            }
            childHandle = await fsImpl.open(childPath, DIRECTORY_OPEN_FLAGS);
          } else {
            if (error?.code === 'ELOOP' || error?.code === 'ENOTDIR') {
              throwManualError(
                'PLAYBOOK_MANUAL_SYMLINK_ESCAPE',
                managedPathsForParent(parentRelativePath)
              );
            }
            throw error;
          }
        }
        await assertDescriptorIdentity(childHandle, fsImpl);
        if (ownsCurrent) await currentHandle.close();
        currentHandle = childHandle;
        ownsCurrent = true;
        transferredToCurrent = true;
      } finally {
        if (childHandle && !transferredToCurrent) {
          await closeHandleIgnoringError(childHandle);
        }
      }
    }
    return currentHandle;
  } catch (error) {
    if (ownsCurrent) {
      await closeHandleIgnoringError(currentHandle);
    }
    throw error;
  }
}

async function closeHandleIgnoringError(handle) {
  try {
    await handle.close();
  } catch {
    // The stable path or authority error remains primary.
  }
}

async function assertDescriptorIdentity(handle, fsImpl) {
  try {
    const [handleStat, descriptorStat] = await Promise.all([
      handle.stat(),
      fsImpl.stat(descriptorPath(handle))
    ]);
    if (
      !handleStat.isDirectory()
      || !descriptorStat.isDirectory()
      || !sameIdentity(handleStat, descriptorStat)
    ) {
      throw new Error('descriptor identity mismatch');
    }
  } catch {
    throwManualError('PLAYBOOK_MANUAL_AUTHORITY_UNAVAILABLE');
  }
}

async function assertAuthorityBindings(authority, fsImpl) {
  let rootStat;
  try {
    rootStat = await fsImpl.stat(authority.root);
  } catch {
    throwManualError(
      'PLAYBOOK_MANUAL_SYMLINK_ESCAPE',
      P3_MANAGED_ARTIFACT_PATHS
    );
  }
  if (!sameIdentity(rootStat, authority.rootIdentity)) {
    throwManualError(
      'PLAYBOOK_MANUAL_SYMLINK_ESCAPE',
      P3_MANAGED_ARTIFACT_PATHS
    );
  }

  for (const [parentRelativePath, parent] of authority.parents) {
    if (!parent) {
      try {
        const unexpected = await fsImpl.open(
          path.join(authority.rootReal, parentRelativePath),
          DIRECTORY_OPEN_FLAGS
        );
        await unexpected.close();
        throwManualError(
          'PLAYBOOK_MANUAL_SYMLINK_ESCAPE',
          managedPathsForParent(parentRelativePath)
        );
      } catch (error) {
        if (isManualError(error)) throw error;
        if (error?.code === 'ENOENT') continue;
        throwManualError(
          'PLAYBOOK_MANUAL_SYMLINK_ESCAPE',
          managedPathsForParent(parentRelativePath)
        );
      }
    }
    let lexicalHandle;
    try {
      lexicalHandle = await fsImpl.open(parent.lexicalPath, DIRECTORY_OPEN_FLAGS);
      const lexicalStat = await lexicalHandle.stat();
      if (!sameIdentity(lexicalStat, parent.identity)) {
        throw new Error('managed parent identity changed');
      }
    } catch {
      throwManualError(
        'PLAYBOOK_MANUAL_SYMLINK_ESCAPE',
        managedPathsForParent(parentRelativePath)
      );
    } finally {
      if (lexicalHandle) {
        try {
          await lexicalHandle.close();
        } catch {
          // The binding decision has already been made.
        }
      }
    }
  }
}

async function withManagedAuthority(authority, operation) {
  let operationError = null;
  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const closeFailed = await closeAuthorityHandles(authority);
    if (closeFailed && !operationError) {
      throwManualError('PLAYBOOK_MANUAL_AUTHORITY_CLOSE_FAILED');
    }
  }
}

async function readOriginals(targets, fsImpl) {
  const originals = [];
  for (const target of targets) {
    if (!target.parent) {
      originals.push(null);
      continue;
    }
    originals.push(await readManagedTarget(target, fsImpl, {
      errorCode: 'PLAYBOOK_MANUAL_READ_FAILED'
    }));
  }
  return originals;
}

async function readManagedTarget(target, fsImpl, { errorCode }) {
  let handle;
  try {
    handle = await fsImpl.open(target.authorityPath, READ_OPEN_FLAGS);
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('managed target is not a file');
    return await handle.readFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error?.code === 'ELOOP') {
      throwManualError('PLAYBOOK_MANUAL_SYMLINK_ESCAPE', [target.relativePath]);
    }
    throwManualError(errorCode, [target.relativePath]);
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // A stable read error is reported by the caller if needed.
      }
    }
  }
}

async function stageBytes({ fsImpl, temporary, bytes }) {
  let handle = null;
  try {
    handle = await fsImpl.open(
      temporary.authorityPath,
      EXCLUSIVE_WRITE_FLAGS,
      0o666
    );
    temporary.owned = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Central cleanup owns the stable error decision.
      }
    }
    throw error;
  }
}

async function rollbackOriginals({ fsImpl, targets, originals }) {
  const failures = [];
  for (const [index, target] of targets.entries()) {
    const temporary = temporaryRecord(target, 'rollback', index);
    try {
      if (originals[index] === null) {
        await fsImpl.rm(target.authorityPath, { force: true });
        continue;
      }
      await stageBytes({ fsImpl, temporary, bytes: originals[index] });
      await fsImpl.rename(temporary.authorityPath, target.authorityPath);
      temporary.owned = false;
    } catch {
      failures.push(target.relativePath);
    } finally {
      const cleanupFailures = await cleanupOwnedTemporaries(
        fsImpl,
        [temporary]
      );
      failures.push(...cleanupFailures);
    }
  }
  return fixedManagedOrder(new Set(failures));
}

async function cleanupOwnedTemporaries(fsImpl, temporaries) {
  const failures = [];
  for (const temporary of temporaries) {
    if (!temporary.owned) continue;
    try {
      await fsImpl.rm(temporary.authorityPath, { force: true });
      temporary.owned = false;
    } catch {
      failures.push(temporary.target.relativePath);
    }
  }
  return fixedManagedOrder(new Set(failures));
}

function temporaryRecord(target, purpose, index) {
  temporarySequence += 1;
  const fileName = `${target.fileName}.playbook-manual-${purpose}-${process.pid}-${temporarySequence}-${index}.tmp`;
  return {
    target,
    authorityPath: path.join(target.parent.descriptorPath, fileName),
    owned: false
  };
}

function descriptorPath(handle) {
  return path.join(DESCRIPTOR_DIRECTORY, String(handle.fd));
}

function directoryIdentity(stat) {
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function managedPathsForParent(parentRelativePath) {
  return P3_MANAGED_ARTIFACT_PATHS.filter((artifactPath) =>
    path.posix.dirname(artifactPath) === parentRelativePath);
}

async function closeAuthorityHandles({ rootHandle, parents }) {
  let failed = false;
  const handles = [
    ...[...parents.values()].filter(Boolean).map((parent) => parent.handle),
    rootHandle
  ];
  for (const handle of handles) {
    if (!handle) continue;
    try {
      await handle.close();
    } catch {
      failed = true;
    }
  }
  return failed;
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
