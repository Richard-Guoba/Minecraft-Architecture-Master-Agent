import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const SAFE_PART = /^[A-Za-z0-9._-]+$/u;

export async function publishGenerationAuthority({
  runDir, options, selectionPath, selectedCandidateId, selectedDir,
  blueprintPath, buildFunctionPath
} = {}) {
  const relative = value => {
    const result = path.relative(runDir, value).replaceAll(path.sep, '/');
    if (!safeRelative(result)) throw new Error('GENERATION_AUTHORITY_INVALID');
    return result;
  };
  const bindings = {
    selection: await snapshotRegular(selectionPath),
    blueprint: await snapshotRegular(blueprintPath),
    build_function: await snapshotRegular(buildFunctionPath)
  };
  const body = {
    schema_version: 1,
    kind: 'construction-generation-authority',
    options: canonicalOptions(options),
    selected_candidate_id: selectedCandidateId,
    selected_relative_path: relative(selectedDir),
    files: {
      selection: binding(relative(selectionPath), bindings.selection),
      blueprint: binding(relative(blueprintPath), bindings.blueprint),
      build_function: binding(relative(buildFunctionPath), bindings.build_function)
    }
  };
  const authority = { ...body, authority_sha256: digest(stable(body)) };
  const bytes = Buffer.from(stable(authority));
  const root = await fs.open(runDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const stage = `.generation-authority-${randomBytes(16).toString('hex')}`;
  const rootDescriptor = `/proc/${process.pid}/fd/${root.fd}`;
  let handle;
  let opened;
  let installed = false;
  try {
    handle = await fs.open(path.join(rootDescriptor, stage), WRITE_FLAGS, 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.chmod(0o400);
    opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size !== bytes.length) throw new Error('GENERATION_AUTHORITY_INVALID');
    await fs.link(path.join(rootDescriptor, stage), path.join(rootDescriptor, 'generation-authority.json'));
    await fs.unlink(path.join(rootDescriptor, stage));
    installed = true;
    const published = await fs.lstat(path.join(rootDescriptor, 'generation-authority.json'));
    if (!published.isFile() || published.isSymbolicLink() || published.nlink !== 1
      || !sameIdentity(opened, published) || published.size !== bytes.length) {
      throw new Error('GENERATION_AUTHORITY_INVALID');
    }
    await root.sync();
  } finally {
    if (!installed && opened) {
      try {
        const named = await fs.lstat(path.join(rootDescriptor, stage));
        if (sameIdentity(named, opened)) {
          await fs.unlink(path.join(rootDescriptor, stage));
          await root.sync();
        }
      } catch {}
    }
    await handle?.close(); await root.close();
  }
  return Object.freeze({ path: path.join(runDir, 'generation-authority.json'), sha256: digest(bytes) });
}

function canonicalOptions(value) {
  const result = {
    prompt: value.prompt, root_seed: value.rootSeed, mode: value.mode,
    minecraft_version: value.minecraftVersion,
    candidate_count: value.candidateCount, candidate_rounds: value.candidateRounds,
    candidate_force_rounds: value.candidateForceRounds,
    concepts: value.concepts, concept_strategy: value.conceptStrategy,
    critics: value.critics, neural_retrieval: value.neuralRetrieval,
    coarse_voxel_mode: value.coarseVoxelMode,
    coarse_voxel_provider: value.coarseVoxelProvider,
    coarse_voxel_plan: value.coarseVoxelPlan ?? null,
    playbook: value.playbook
  };
  if (typeof result.prompt !== 'string' || !Number.isInteger(result.root_seed)
    || !Number.isInteger(result.candidate_count) || !Number.isInteger(result.candidate_rounds)) {
    throw new Error('GENERATION_AUTHORITY_INVALID');
  }
  return result;
}
async function snapshotRegular(filename) {
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('GENERATION_AUTHORITY_INVALID');
  const handle = await fs.open(filename, READ_FLAGS);
  try {
    const opened = await handle.stat(); const bytes = await handle.readFile(); const after = await handle.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || after.dev !== opened.dev
      || after.ino !== opened.ino || after.nlink !== 1 || after.size !== bytes.length) throw new Error('GENERATION_AUTHORITY_INVALID');
    return { bytes, sha256: digest(bytes) };
  } finally { await handle.close(); }
}
function binding(relative_path, snapshot) { return { relative_path, sha256: snapshot.sha256 }; }
function safeRelative(value) { return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && value.split('/').every(part => SAFE_PART.test(part) && part !== '.' && part !== '..'); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function stable(value) { const sort = item => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item; return `${JSON.stringify(sort(value), null, 2)}\n`; }
