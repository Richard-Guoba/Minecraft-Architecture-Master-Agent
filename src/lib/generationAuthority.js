import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const DUP_DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY;
const WRITE_FLAGS = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const SAFE_PART = /^[A-Za-z0-9._-]+$/u;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const MAX_SELECTION_BYTES = 64 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const RECEIPT_NAME = 'generation-authority.json';

export async function publishGenerationAuthority({ runDir, options, fsImpl } = {}) {
  let authority;
  const boundFiles = [];
  try {
    if (!safeAbsolute(runDir)) invalid();
    const canonical = canonicalOptions(options);
    authority = await openAbsoluteAuthority(runDir);
    const selection = await bindRelativeFile(authority, 'candidate_selection.json', MAX_SELECTION_BYTES);
    boundFiles.push(selection);
    const selectionSnapshot = await readBoundFile(authority, selection);
    const selected = validateSelection(selectionSnapshot.bytes, canonical);
    const selectedRelativePath = `candidates/round-${pad(selected.round)}/candidate-${pad(selected.index)}-seed-${selected.seed}`;
    const blueprintRelativePath = `${selectedRelativePath}/blueprint.json`;
    const buildRelativePath = `${selectedRelativePath}/architect_datapack/data/architect/function/build.mcfunction`;
    const blueprint = await bindRelativeFile(authority, blueprintRelativePath, MAX_ARTIFACT_BYTES);
    const buildFunction = await bindRelativeFile(authority, buildRelativePath, MAX_ARTIFACT_BYTES);
    boundFiles.push(blueprint, buildFunction);

    await fsImpl?.afterSelectedArtifactsBound?.();
    await assertAbsoluteAuthority(authority);
    const blueprintSnapshot = await readBoundFile(authority, blueprint);
    const buildSnapshot = await readBoundFile(authority, buildFunction);
    await fsImpl?.afterSelectedArtifactsRead?.();
    const body = {
      schema_version: 1,
      kind: 'construction-generation-authority',
      options: canonical,
      selected_candidate_id: selected.id,
      selected_relative_path: selectedRelativePath,
      files: {
        selection: binding('candidate_selection.json', selectionSnapshot),
        blueprint: binding(blueprintRelativePath, blueprintSnapshot),
        build_function: binding(buildRelativePath, buildSnapshot)
      }
    };
    const receipt = { ...body, authority_sha256: digest(stable(body)) };
    const bytes = Buffer.from(stable(receipt));
    for (const bound of boundFiles) await assertBoundFile(authority, bound);
    await publishReceipt(authority, bytes, fsImpl);
    return Object.freeze({ path: path.join(runDir, RECEIPT_NAME), sha256: digest(bytes) });
  } catch (error) {
    if (error?.message === 'GENERATION_AUTHORITY_INVALID') throw error;
    invalid();
  } finally {
    await Promise.allSettled(boundFiles.map(closeBoundFile));
    await closeAbsoluteAuthority(authority);
  }
}

async function publishReceipt(authority, bytes, hooks) {
  const root = authority.leaf;
  const stageName = `.generation-authority-${randomBytes(16).toString('hex')}`;
  let handle;
  let node;
  let linked = false;
  try {
    await assertAbsoluteAuthority(authority);
    await assertAbsent(path.join(descriptor(root), RECEIPT_NAME));
    handle = await fs.open(path.join(descriptor(root), stageName), WRITE_FLAGS, 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.chmod(0o400);
    const stat = await handle.stat();
    node = { name: stageName, identity: identity(stat), bytes: Buffer.from(bytes), sha256: digest(bytes) };
    await verifyOpenFile(root, handle, node);
    await hooks?.afterReceiptStageWritten?.({ stagePath: path.join(authority.absolutePath, stageName) });
    await verifyOpenFile(root, handle, node);
    await root.sync();
    await assertAbsoluteAuthority(authority);
    await fs.link(path.join(descriptor(root), stageName), path.join(descriptor(root), RECEIPT_NAME));
    linked = true;
    const linkedStat = await fs.lstat(path.join(descriptor(root), RECEIPT_NAME));
    if (!sameIdentity(linkedStat, node.identity) || linkedStat.nlink !== 2) invalid();
    await root.sync();
    await fs.unlink(path.join(descriptor(root), stageName));
    node.name = RECEIPT_NAME;
    await verifyOpenFile(root, handle, node);
    await root.sync();
    await assertAbsoluteAuthority(authority);
  } catch (error) {
    if (!linked && handle && node) await cleanupExactStage(authority, handle, node);
    throw error;
  } finally {
    await handle?.close();
  }
}

async function cleanupExactStage(authority, handle, node) {
  try {
    await assertAbsoluteAuthority(authority);
    await verifyOpenFile(authority.leaf, handle, node);
    await fs.unlink(path.join(descriptor(authority.leaf), node.name));
    await authority.leaf.sync();
  } catch {}
}

async function bindRelativeFile(authority, relativePath, maxBytes) {
  if (!safeRelative(relativePath)) invalid();
  await assertAbsoluteAuthority(authority);
  const handles = [await fs.open(descriptor(authority.leaf), DUP_DIRECTORY_FLAGS)];
  const names = [];
  const identities = [identity(await handles[0].stat())];
  let file;
  try {
    if (!sameIdentity(identities[0], authority.identities.at(-1))) invalid();
    const parts = relativePath.split('/');
    for (const part of parts.slice(0, -1)) {
      const parent = handles.at(-1);
      const before = await fs.lstat(path.join(descriptor(parent), part));
      if (before.isSymbolicLink() || !before.isDirectory()) invalid();
      const child = await fs.open(path.join(descriptor(parent), part), DIRECTORY_FLAGS);
      if (!sameIdentity(before, await child.stat())) { await child.close(); invalid(); }
      handles.push(child); names.push(part); identities.push(identity(before));
    }
    const name = parts.at(-1);
    const before = await fs.lstat(path.join(descriptor(handles.at(-1)), name));
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
      || before.size <= 0 || before.size > maxBytes) invalid();
    file = await fs.open(path.join(descriptor(handles.at(-1)), name), READ_FLAGS);
    if (!sameIdentity(before, await file.stat())) invalid();
    const result = {
      relativePath, handles, names, identities, file, fileName: name,
      fileIdentity: identity(before), maxBytes
    };
    await assertBoundFile(authority, result);
    return result;
  } catch (error) {
    await file?.close();
    await Promise.allSettled([...handles].reverse().map(handle => handle.close()));
    throw error;
  }
}

async function readBoundFile(authority, bound) {
  await assertBoundFile(authority, bound);
  const before = await bound.file.stat();
  const bytes = await bound.file.readFile();
  const after = await bound.file.stat();
  if (!sameIdentity(before, after) || !sameIdentity(after, bound.fileIdentity)
    || after.nlink !== 1 || after.size !== bytes.length || bytes.length > bound.maxBytes) invalid();
  await assertBoundFile(authority, bound);
  return { bytes, sha256: digest(bytes) };
}

async function assertBoundFile(authority, bound) {
  await assertAbsoluteAuthority(authority);
  if (!bound || bound.handles.length !== bound.identities.length
    || bound.names.length !== bound.handles.length - 1
    || !sameIdentity(await bound.handles[0].stat(), authority.identities.at(-1))) invalid();
  for (let index = 0; index < bound.handles.length; index += 1) {
    if (!sameIdentity(await bound.handles[index].stat(), bound.identities[index])) invalid();
    if (index > 0) {
      const named = await fs.lstat(path.join(descriptor(bound.handles[index - 1]), bound.names[index - 1]));
      if (named.isSymbolicLink() || !named.isDirectory() || !sameIdentity(named, bound.identities[index])) invalid();
    }
  }
  const opened = await bound.file.stat();
  const named = await fs.lstat(path.join(descriptor(bound.handles.at(-1)), bound.fileName));
  if (!opened.isFile() || opened.nlink !== 1 || named.isSymbolicLink() || !named.isFile()
    || named.nlink !== 1 || !sameIdentity(opened, bound.fileIdentity)
    || !sameIdentity(named, bound.fileIdentity) || opened.size <= 0 || opened.size > bound.maxBytes) invalid();
}

async function closeBoundFile(bound) {
  await bound?.file?.close();
  if (bound?.handles) await Promise.allSettled([...bound.handles].reverse().map(handle => handle.close()));
}

async function openAbsoluteAuthority(absolutePath) {
  const handles = [await fs.open(path.parse(absolutePath).root, DIRECTORY_FLAGS)];
  const names = [];
  const identities = [identity(await handles[0].stat())];
  try {
    for (const part of absolutePath.slice(path.parse(absolutePath).root.length).split(path.sep).filter(Boolean)) {
      if (!safeAncestorPart(part)) invalid();
      const parent = handles.at(-1);
      const before = await fs.lstat(path.join(descriptor(parent), part));
      if (before.isSymbolicLink() || !before.isDirectory()) invalid();
      const child = await fs.open(path.join(descriptor(parent), part), DIRECTORY_FLAGS);
      if (!sameIdentity(before, await child.stat())) { await child.close(); invalid(); }
      handles.push(child); names.push(part); identities.push(identity(before));
    }
    const authority = { absolutePath, handles, names, identities, leaf: handles.at(-1) };
    await assertAbsoluteAuthority(authority);
    return authority;
  } catch (error) {
    await Promise.allSettled([...handles].reverse().map(handle => handle.close()));
    throw error;
  }
}

async function assertAbsoluteAuthority(authority) {
  if (!authority || authority.handles.length !== authority.identities.length
    || authority.names.length !== authority.handles.length - 1) invalid();
  for (let index = 0; index < authority.handles.length; index += 1) {
    if (!sameIdentity(await authority.handles[index].stat(), authority.identities[index])) invalid();
    if (index > 0) {
      const named = await fs.lstat(path.join(descriptor(authority.handles[index - 1]), authority.names[index - 1]));
      if (named.isSymbolicLink() || !named.isDirectory() || !sameIdentity(named, authority.identities[index])) invalid();
    }
  }
}

async function closeAbsoluteAuthority(authority) {
  if (authority?.handles) await Promise.allSettled([...authority.handles].reverse().map(handle => handle.close()));
}

async function verifyOpenFile(directory, handle, node) {
  const opened = await handle.stat();
  const named = await fs.lstat(path.join(descriptor(directory), node.name));
  if (!opened.isFile() || opened.nlink !== 1 || named.isSymbolicLink() || !named.isFile()
    || named.nlink !== 1 || !sameIdentity(opened, node.identity) || !sameIdentity(named, node.identity)
    || opened.size !== node.bytes.length) invalid();
  const buffer = Buffer.alloc(node.bytes.length);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
  if (bytesRead !== buffer.length || !buffer.equals(node.bytes) || digest(buffer) !== node.sha256) invalid();
}

function validateSelection(bytes, options) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalid(); }
  if (!plain(value) || value.source !== 'local-candidate-optimization-pipeline'
    || value.active !== true || value.candidate_optimization !== true
    || value.base_seed !== options.root_seed || value.candidate_count_per_round !== options.candidate_count
    || value.requested_round_count !== options.candidate_rounds
    || value.force_rounds !== options.candidate_force_rounds
    || value.concept_count !== options.concepts || value.concept_strategy !== options.concept_strategy
    || !Array.isArray(value.candidates) || !Array.isArray(value.ranking) || !Array.isArray(value.rounds)) invalid();
  const round = value.selected_round; const index = value.selected_index; const seed = value.selected_seed;
  const id = `r${round}-c${index}-seed-${seed}`;
  const firstRounds = value.rounds.filter(row => row?.round === 1);
  const selectedRounds = value.rounds.filter(row => row?.round === round);
  if (!Number.isInteger(round) || round < 1 || round > options.candidate_rounds
    || !Number.isInteger(index) || index < 1 || index > options.candidate_count
    || !Number.isInteger(seed) || value.selected_candidate_id !== id
    || firstRounds.length !== 1 || firstRounds[0].prompt !== options.prompt
    || selectedRounds.length !== 1) invalid();
  const matches = value.candidates.filter(row => plain(row) && row.candidate_id === id
    && row.round === round && row.index === index && row.seed === seed && row.ok === true
    && row.prompt === selectedRounds[0].prompt);
  if (matches.length !== 1 || value.ranking[0]?.candidate_id !== id
    || selectedRounds[0].selected_candidate_id !== id) invalid();
  return { id, round, index, seed };
}

function canonicalOptions(value) {
  if (!plain(value)) invalid();
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
    || !Number.isInteger(result.candidate_count) || !Number.isInteger(result.candidate_rounds)) invalid();
  return result;
}

async function assertAbsent(filename) {
  try { await fs.lstat(filename); invalid(); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
function binding(relative_path, snapshot) { return { relative_path, sha256: snapshot.sha256 }; }
function safeAbsolute(value) { return typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value; }
function safeRelative(value) { return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && value.split('/').every(safePart); }
function safePart(value) { return SAFE_PART.test(value) && value !== '.' && value !== '..'; }
function safeAncestorPart(value) { return value.length > 0 && value !== '.' && value !== '..' && !UNSAFE_PATH_CHARACTER.test(value); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function descriptor(handle) { return `/proc/${process.pid}/fd/${handle.fd}`; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function pad(value) { return String(value).padStart(2, '0'); }
function stable(value) { const sort = item => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item; return `${JSON.stringify(sort(value), null, 2)}\n`; }
function invalid() { throw new Error('GENERATION_AUTHORITY_INVALID'); }
