import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { BlueprintQAAgent } from '../../construction/agents/blueprintQaAgent.js';
import { operationToCommand } from '../../construction/workflow.js';
import { candidateSeedFor } from '../../construction/candidatePipelineSupport.js';
import { buildDeterministicShadowReview } from '../shadow/runShadowReview.js';
import { sha256, stableJson } from '../shadow/canonical.js';
import { P6_FIXED_REQUEST, P6_MINECRAFT_VERSION } from './constants.js';
import { p6Error } from './contracts.js';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const DUP_DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY;
const WRITE_FLAGS = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const SAFE_BASENAME = /^[A-Za-z0-9._-]+$/u;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_BUILD_BYTES = 64 * 1024 * 1024;
const MOVE_BINARY = '/usr/bin/mv';
const OWNER_NAME = '.p6-baseline-owned.json';
const OWNER_BYTES = Buffer.from(stableJson({ schema_version: 1, kind: 'p6-baseline-authority-root' }));
const FILE_NAMES = Object.freeze({
  blueprint: 'blueprint.json', operations: 'operation-list.json',
  build_function: 'build.mcfunction', hard_qa: 'hard-qa.json', review: 'review.json'
});

export async function prepareP6BaselineAuthority({ projectRoot, sourceRun, baselineRun, fsImpl } = {}) {
  let sourceAuthority;
  try {
    if (!safeAbsolute(projectRoot) || !safeAbsolute(sourceRun) || !safeAbsolute(baselineRun)
      || sourceRun === baselineRun || !SAFE_BASENAME.test(path.basename(baselineRun))) invalid();
    await assertAbsent(baselineRun);
    sourceAuthority = await openAbsoluteAuthority(sourceRun);
    const receiptSnapshot = await readBoundFile(sourceAuthority, 'generation-authority.json', MAX_JSON_BYTES);
    const receipt = validateGenerationReceipt(receiptSnapshot.bytes);
    await fsImpl?.afterGenerationAuthorityRead?.();
    await assertAbsoluteAuthority(sourceAuthority);
    const selectionSnapshot = await readBoundFile(sourceAuthority, receipt.files.selection.relative_path, MAX_JSON_BYTES);
    if (selectionSnapshot.sha256 !== receipt.files.selection.sha256) invalid();
    const selection = parseJson(selectionSnapshot.bytes);
    const selected = validateSelection(selection);
    const candidatePrefix = `candidates/round-${pad(selected.round)}/candidate-${pad(selected.index)}-seed-${selected.seed}`;
    if (receipt.selected_candidate_id !== selected.id || receipt.selected_relative_path !== candidatePrefix) invalid();
    const blueprintSnapshot = await readBoundFile(sourceAuthority, receipt.files.blueprint.relative_path, MAX_JSON_BYTES);
    const buildSnapshot = await readBoundFile(sourceAuthority,
      receipt.files.build_function.relative_path, MAX_BUILD_BYTES);
    if (receipt.files.blueprint.relative_path !== `${candidatePrefix}/blueprint.json`
      || receipt.files.build_function.relative_path !== `${candidatePrefix}/architect_datapack/data/architect/function/build.mcfunction`
      || blueprintSnapshot.sha256 !== receipt.files.blueprint.sha256
      || buildSnapshot.sha256 !== receipt.files.build_function.sha256) invalid();
    const blueprint = parseJson(blueprintSnapshot.bytes);
    validateSelectedBlueprint(blueprint, selection, selected);
    const operationBytes = Buffer.from(stableJson(blueprint.operations));
    if (!buildSnapshot.bytes.equals(compileBuild(blueprint.operations, P6_MINECRAFT_VERSION))) invalid();
    const hardQa = new BlueprintQAAgent().run(blueprint);
    if (hardQa.ok !== true) invalid();
    const review = await buildDeterministicShadowReview({
      projectRoot, blueprintBytes: blueprintSnapshot.bytes, blueprintRelativePath: 'blueprint.json'
    });
    await assertAbsoluteAuthority(sourceAuthority);
    const files = {
      blueprint: Buffer.from(blueprintSnapshot.bytes),
      operations: operationBytes,
      build_function: Buffer.from(buildSnapshot.bytes),
      hard_qa: Buffer.from(stableJson(hardQa)),
      review: Buffer.from(stableJson(review))
    };
    const options = baselineOptionsFromReceipt(receipt.options);
    const sourceAuthoritySha256 = sha256(stableJson({
      selection_sha256: selectionSnapshot.sha256,
      generation_authority_sha256: receiptSnapshot.sha256,
      selected_candidate_id: selected.id,
      blueprint_sha256: blueprintSnapshot.sha256,
      build_function_sha256: buildSnapshot.sha256
    }));
    const manifest = {
      schema_version: 1,
      kind: 'p6-baseline-authority',
      run_id: `baseline-${sourceAuthoritySha256.slice(0, 24)}`,
      generator_commit: P6_FIXED_REQUEST.generator_commit,
      minecraft_version: P6_MINECRAFT_VERSION,
      options: { ...options, playbook: 'off' },
      provenance: {
        corpus_sha256: P6_FIXED_REQUEST.playbook_corpus_sha256,
        rule_version: P6_FIXED_REQUEST.playbook_version,
        generator_commit: P6_FIXED_REQUEST.generator_commit,
        minecraft_version: P6_MINECRAFT_VERSION,
        options,
        source_authority_sha256: sourceAuthoritySha256,
        source_selection_sha256: selectionSnapshot.sha256,
        source_generation_authority_sha256: receiptSnapshot.sha256,
        source_build_compiler_profile: P6_MINECRAFT_VERSION
      },
      files: Object.fromEntries(Object.entries(FILE_NAMES).map(([field, relative_path]) => [field, {
        relative_path, sha256: sha256(files[field])
      }]))
    };
    const manifestBytes = Buffer.from(stableJson(manifest));
    const installed = await publishNewAuthority({ baselineRun, files, manifestBytes, hooks: fsImpl });
    return Object.freeze({
      status: 'created', run_id: manifest.run_id,
      authority_sha256: sha256(manifestBytes), output: path.basename(installed)
    });
  } catch (error) {
    if (error?.code === 'P6_AUTHORITY_INVALID') throw error;
    invalid();
  } finally { await closeAbsoluteAuthority(sourceAuthority); }
}

function validateGenerationReceipt(bytes) {
  if (stableJson(parseJson(bytes)) !== bytes.toString('utf8')) invalid();
  const value = parseJson(bytes);
  if (!plain(value) || value.schema_version !== 1 || value.kind !== 'construction-generation-authority'
    || !plain(value.options) || !plain(value.files) || typeof value.authority_sha256 !== 'string') invalid();
  const { authority_sha256, ...body } = value;
  if (authority_sha256 !== sha256(stableJson(body))) invalid();
  const expected = {
    prompt: P6_FIXED_REQUEST.prompt, root_seed: P6_FIXED_REQUEST.root_seed,
    mode: P6_FIXED_REQUEST.mode, minecraft_version: P6_MINECRAFT_VERSION,
    candidate_count: P6_FIXED_REQUEST.candidate_count, candidate_rounds: P6_FIXED_REQUEST.candidate_rounds,
    candidate_force_rounds: P6_FIXED_REQUEST.candidate_force_rounds,
    concepts: P6_FIXED_REQUEST.concepts, concept_strategy: P6_FIXED_REQUEST.concept_strategy,
    critics: P6_FIXED_REQUEST.critics, neural_retrieval: P6_FIXED_REQUEST.neural_retrieval,
    coarse_voxel_mode: P6_FIXED_REQUEST.coarse_voxel_mode,
    coarse_voxel_provider: P6_FIXED_REQUEST.coarse_voxel_provider,
    coarse_voxel_plan: P6_FIXED_REQUEST.coarse_voxel_plan, playbook: 'off'
  };
  if (stableJson(value.options) !== stableJson(expected)) invalid();
  for (const field of ['selection', 'blueprint', 'build_function']) {
    const binding = value.files[field];
    if (!plain(binding) || !safeRelative(binding.relative_path) || !/^[a-f0-9]{64}$/u.test(binding.sha256)) invalid();
  }
  return value;
}

function validateSelection(value) {
  if (!plain(value) || value.active !== true || value.source !== 'local-candidate-optimization-pipeline'
    || value.strategy !== 'template-aesthetic-plus-template-law-coverage-plus-assimilation-audit'
    || value.candidate_optimization !== true || value.target_score !== 95
    || value.candidate_count !== 3 || value.candidate_count_per_round !== 3
    || value.successful_count !== 3 || value.failed_count !== 0
    || value.requested_round_count !== 1 || value.round_count !== 1 || value.force_rounds !== false
    || value.base_seed !== P6_FIXED_REQUEST.root_seed || value.base_seed_source !== 'manual'
    || value.concept_count !== P6_FIXED_REQUEST.concepts
    || value.concept_strategy !== P6_FIXED_REQUEST.concept_strategy
    || !Array.isArray(value.candidates) || value.candidates.length !== 3
    || !Array.isArray(value.ranking) || value.ranking.length !== 3
    || !Array.isArray(value.rounds) || value.rounds.length !== 1) invalid();
  const candidates = [...value.candidates].sort((a, b) => a.index - b.index);
  for (let index = 1; index <= 3; index += 1) {
    const row = candidates[index - 1]; const seed = candidateSeedFor(P6_FIXED_REQUEST.root_seed, 1, index);
    if (!plain(row) || row.ok !== true || row.round !== 1 || row.index !== index || row.seed !== seed
      || row.candidate_id !== `r1-c${index}-seed-${seed}` || row.prompt !== P6_FIXED_REQUEST.prompt) invalid();
  }
  const selected = candidates.find(row => row.candidate_id === value.selected_candidate_id);
  const rankedIds = value.ranking.map((row, index) => {
    if (!plain(row) || row.rank !== index + 1 || typeof row.candidate_id !== 'string') invalid();
    return row.candidate_id;
  });
  if (new Set(rankedIds).size !== 3 || rankedIds.some(id => !candidates.some(row => row.candidate_id === id))
    || rankedIds[0] !== value.selected_candidate_id) invalid();
  if (!selected || value.selected_round !== selected.round || value.selected_index !== selected.index
    || value.selected_seed !== selected.seed || value.rounds[0]?.prompt !== P6_FIXED_REQUEST.prompt
    || value.rounds[0]?.selected_candidate_id !== selected.candidate_id) invalid();
  return { id: selected.candidate_id, round: selected.round, index: selected.index, seed: selected.seed };
}

function validateSelectedBlueprint(blueprint, selection, selected) {
  if (!plain(blueprint) || blueprint.workflow !== 'construction_method_v1'
    || blueprint.prompt !== P6_FIXED_REQUEST.prompt || blueprint.seed !== selected.seed
    || blueprint.seedSource !== 'manual-candidate' || blueprint.llmUsage?.mode !== 'mock'
    || blueprint.llmUsage?.called !== false || blueprint.llmUsage?.used !== false
    || !Array.isArray(blueprint.operations) || blueprint.operations.length === 0
    || plain(blueprint.playbookExecution) || plain(blueprint.criticCouncil)
    || blueprint.conceptStudio?.active === true || blueprint.stage7?.active === true
    || blueprint.candidateSelection?.selected_candidate_id !== selection.selected_candidate_id
    || blueprint.candidateSelection?.selected_seed !== selection.selected_seed
    || blueprint.candidateSelection?.candidate_count !== 3) invalid();
}

function compileBuild(operations, minecraftVersion) {
  let commands;
  try { commands = operations.map(operation => operationToCommand(operation, minecraftVersion)); }
  catch { invalid(); }
  return Buffer.from(`${[
    '# Generated by MC Architect Agent construction_method_v1',
    '# Run with: /function architect:build', ...commands
  ].join('\n')}\n`);
}

async function readBoundFile(authority, relativePath, maxBytes) {
  if (!safeRelative(relativePath)) invalid();
  await assertAbsoluteAuthority(authority);
  let handle = await fs.open(descriptor(authority.leaf), DUP_DIRECTORY_FLAGS);
  try {
    const parts = relativePath.split('/');
    for (const part of parts.slice(0, -1)) {
      const before = await fs.lstat(path.join(descriptor(handle), part));
      if (before.isSymbolicLink() || !before.isDirectory()) invalid();
      const child = await fs.open(path.join(descriptor(handle), part), DIRECTORY_FLAGS);
      if (!sameIdentity(before, await child.stat())) { await child.close(); invalid(); }
      await handle.close(); handle = child;
    }
    const name = parts.at(-1);
    const before = await fs.lstat(path.join(descriptor(handle), name));
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
      || before.size <= 0 || before.size > maxBytes) invalid();
    const file = await fs.open(path.join(descriptor(handle), name), READ_FLAGS);
    try {
      const opened = await file.stat();
      if (!sameIdentity(before, opened) || opened.nlink !== 1) invalid();
      const bytes = await file.readFile();
      const after = await file.stat();
      if (!sameIdentity(opened, after) || after.nlink !== 1 || after.size !== bytes.length) invalid();
      await assertAbsoluteAuthority(authority);
      return { bytes, sha256: sha256(bytes) };
    } finally { await file.close(); }
  } finally { await handle.close(); }
}

async function publishNewAuthority({ baselineRun, files, manifestBytes, hooks }) {
  const parent = path.dirname(baselineRun); const targetName = path.basename(baselineRun);
  const parentAuthority = await openAbsoluteAuthority(parent);
  const parentHandle = parentAuthority.leaf;
  let stageHandle;
  let stageIdentity;
  const nodes = [];
  let installed = false;
  const stageName = `.p6-baseline-stage-${randomBytes(16).toString('hex')}`;
  try {
    await assertAbsoluteAuthority(parentAuthority);
    await assertAbsent(path.join(descriptor(parentHandle), targetName));
    await fs.mkdir(path.join(descriptor(parentHandle), stageName), { mode: 0o700 });
    const stageBefore = await fs.lstat(path.join(descriptor(parentHandle), stageName));
    stageHandle = await fs.open(path.join(descriptor(parentHandle), stageName), DIRECTORY_FLAGS);
    if (!sameIdentity(stageBefore, await stageHandle.stat())) invalid();
    stageIdentity = identity(stageBefore);
    const addStageFile = async (name, bytes) => {
      nodes.push(await writeExclusive(stageHandle, name, bytes));
      await hooks?.afterStageFileWritten?.({ name, stagePath: path.join(parent, stageName) });
    };
    await addStageFile(OWNER_NAME, OWNER_BYTES);
    for (const [field, name] of Object.entries(FILE_NAMES)) await addStageFile(name, files[field]);
    await addStageFile('p6-baseline-authority.json', manifestBytes);
    await hooks?.afterStageFilesWritten?.({ stagePath: path.join(parent, stageName) });
    await verifyStageNodes(stageHandle, nodes, manifestBytes);
    await stageHandle.sync();
    await parentHandle.sync();
    if (!sameIdentity(await stageHandle.stat(), stageIdentity)) invalid();
    await assertAbsoluteAuthority(parentAuthority);
    await moveNoClobber(path.join(descriptor(parentHandle), stageName), path.join(descriptor(parentHandle), targetName));
    const target = await fs.lstat(path.join(descriptor(parentHandle), targetName));
    if (!target.isDirectory() || !sameIdentity(stageIdentity, target)) invalid();
    installed = true;
    await hooks?.afterAuthorityPromotion?.({ targetPath: baselineRun });
    await verifyStageNodes(stageHandle, nodes, manifestBytes);
    await parentHandle.sync();
    await assertAbsoluteAuthority(parentAuthority);
    return baselineRun;
  } catch (error) {
    if (!installed && stageHandle && stageIdentity) {
      await cleanupOwnedStage({ parentAuthority, parentHandle, stageHandle, stageName,
        stageIdentity, nodes });
    }
    throw error;
  } finally {
    await Promise.allSettled(nodes.map(node => node.handle.close()));
    await stageHandle?.close();
    await closeAbsoluteAuthority(parentAuthority);
  }
}

async function cleanupOwnedStage({ parentAuthority, parentHandle, stageHandle, stageName,
  stageIdentity, nodes }) {
  try {
    await assertAbsoluteAuthority(parentAuthority);
    const namedStage = await fs.lstat(path.join(descriptor(parentHandle), stageName));
    if (!namedStage.isDirectory() || !sameIdentity(namedStage, stageIdentity)
      || !sameIdentity(await stageHandle.stat(), stageIdentity)) return;
    const names = (await fs.readdir(descriptor(stageHandle))).sort();
    if (names.length !== nodes.length
      || names.some((name, index) => name !== nodes.map(node => node.name).sort()[index])) return;
    await verifyExactNodes(stageHandle, nodes);
    for (const node of [...nodes].reverse()) {
      const named = await fs.lstat(path.join(descriptor(stageHandle), node.name));
      if (!sameIdentity(named, node.identity)) return;
      await fs.unlink(path.join(descriptor(stageHandle), node.name));
    }
    await stageHandle.sync();
    const emptyStage = await fs.lstat(path.join(descriptor(parentHandle), stageName));
    if (!sameIdentity(emptyStage, stageIdentity)) return;
    await fs.rmdir(path.join(descriptor(parentHandle), stageName));
    await parentHandle.sync();
    await assertAbsoluteAuthority(parentAuthority);
  } catch {
    // Cleanup is best effort and only removes the exact stage this process created.
  }
}

async function openAbsoluteAuthority(absolutePath) {
  if (!safeAbsolute(absolutePath)) invalid();
  const handles = [await fs.open(path.parse(absolutePath).root, DIRECTORY_FLAGS)];
  const names = [];
  const identities = [identity(await handles[0].stat())];
  try {
    for (const part of absolutePath.slice(path.parse(absolutePath).root.length).split(path.sep).filter(Boolean)) {
      if (!SAFE_BASENAME.test(part) || part === '.' || part === '..') invalid();
      const parent = handles.at(-1);
      const before = await fs.lstat(path.join(descriptor(parent), part));
      if (before.isSymbolicLink() || !before.isDirectory()) invalid();
      const child = await fs.open(path.join(descriptor(parent), part), DIRECTORY_FLAGS);
      if (!sameIdentity(before, await child.stat())) { await child.close(); invalid(); }
      handles.push(child); names.push(part); identities.push(identity(before));
    }
    const authority = { handles, names, identities, leaf: handles.at(-1) };
    await assertAbsoluteAuthority(authority);
    return authority;
  } catch (error) {
    await Promise.allSettled(handles.map(handle => handle.close()));
    throw error;
  }
}

async function assertAbsoluteAuthority(authority) {
  if (!authority || !Array.isArray(authority.handles) || authority.handles.length !== authority.identities.length
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

async function writeExclusive(directory, name, bytes) {
  const handle = await fs.open(path.join(descriptor(directory), name), WRITE_FLAGS, 0o400);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.chmod(0o400);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== bytes.length) invalid();
    return { name, handle, identity: identity(stat), bytes: Buffer.from(bytes), sha256: sha256(bytes) };
  } catch (error) { await handle.close(); throw error; }
}

async function verifyStageNodes(directory, nodes, manifestBytes) {
  await verifyExactNodes(directory, nodes);
  const parsed = parseJson(manifestBytes);
  if (stableJson(parsed) !== manifestBytes.toString('utf8')) invalid();
  for (const [field, binding] of Object.entries(parsed.files)) {
    const node = nodes.find(item => item.name === binding.relative_path);
    if (!node || binding.sha256 !== node.sha256 || FILE_NAMES[field] !== node.name) invalid();
  }
}

async function verifyExactNodes(directory, nodes) {
  for (const node of nodes) {
    const opened = await node.handle.stat();
    const named = await fs.lstat(path.join(descriptor(directory), node.name));
    if (!opened.isFile() || opened.nlink !== 1 || named.isSymbolicLink() || !named.isFile()
      || named.nlink !== 1 || !sameIdentity(opened, node.identity) || !sameIdentity(named, node.identity)
      || opened.size !== node.bytes.length) invalid();
    const buffer = Buffer.alloc(node.bytes.length);
    const { bytesRead } = await node.handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== buffer.length || !buffer.equals(node.bytes) || sha256(buffer) !== node.sha256) invalid();
  }
}

async function moveNoClobber(source, target) {
  await new Promise((resolve, reject) => {
    const child = spawn(MOVE_BINARY, ['--no-clobber', '--no-target-directory', source, target], {
      stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('move failed')));
  });
}

async function assertAbsent(filename) {
  try { await fs.lstat(filename); invalid(); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
function parseJson(bytes) { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { invalid(); } }
function baselineOptionsFromReceipt(options) { return {
  mode: options.mode, candidate_count: options.candidate_count,
  candidate_rounds: options.candidate_rounds, candidate_force_rounds: options.candidate_force_rounds,
  concepts: options.concepts, concept_strategy: options.concept_strategy,
  critics: options.critics, neural_retrieval: options.neural_retrieval,
  coarse_voxel_mode: options.coarse_voxel_mode, coarse_voxel_provider: options.coarse_voxel_provider,
  coarse_voxel_plan: options.coarse_voxel_plan
}; }
function safeAbsolute(value) { return typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value; }
function safeRelative(value) { return typeof value === 'string' && value.split('/').every(part => SAFE_BASENAME.test(part) && part !== '.' && part !== '..'); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function descriptor(handle) { return `/proc/${process.pid}/fd/${handle.fd}`; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function pad(value) { return String(value).padStart(2, '0'); }
function invalid() { throw p6Error('P6_AUTHORITY_INVALID'); }
