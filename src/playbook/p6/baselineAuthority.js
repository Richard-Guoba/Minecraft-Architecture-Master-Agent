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
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
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

export async function prepareP6BaselineAuthority({ projectRoot, sourceRun, baselineRun } = {}) {
  try {
    if (!safeAbsolute(projectRoot) || !safeAbsolute(sourceRun) || !safeAbsolute(baselineRun)
      || sourceRun === baselineRun || !SAFE_BASENAME.test(path.basename(baselineRun))) invalid();
    await assertAbsent(baselineRun);
    const selectionSnapshot = await readBoundFile(sourceRun, 'candidate_selection.json', MAX_JSON_BYTES);
    const selection = parseJson(selectionSnapshot.bytes);
    const selected = validateSelection(selection);
    const candidatePrefix = `candidates/round-${pad(selected.round)}/candidate-${pad(selected.index)}-seed-${selected.seed}`;
    const blueprintSnapshot = await readBoundFile(sourceRun, `${candidatePrefix}/blueprint.json`, MAX_JSON_BYTES);
    const buildSnapshot = await readBoundFile(sourceRun,
      `${candidatePrefix}/architect_datapack/data/architect/function/build.mcfunction`, MAX_BUILD_BYTES);
    const blueprint = parseJson(blueprintSnapshot.bytes);
    validateSelectedBlueprint(blueprint, selection, selected);
    const operationBytes = Buffer.from(stableJson(blueprint.operations));
    const sourceBuildCompilerProfile = ['1.21.9', '1.21'].find(version => (
      buildSnapshot.bytes.equals(compileBuild(blueprint.operations, version))
    ));
    if (!sourceBuildCompilerProfile) invalid();
    const hardQa = new BlueprintQAAgent().run(blueprint);
    if (hardQa.ok !== true) invalid();
    const review = await buildDeterministicShadowReview({
      projectRoot, blueprintBytes: blueprintSnapshot.bytes, blueprintRelativePath: 'blueprint.json'
    });
    const files = {
      blueprint: Buffer.from(blueprintSnapshot.bytes),
      operations: operationBytes,
      build_function: Buffer.from(buildSnapshot.bytes),
      hard_qa: Buffer.from(stableJson(hardQa)),
      review: Buffer.from(stableJson(review))
    };
    const options = fixedBaselineOptions();
    const sourceAuthoritySha256 = sha256(stableJson({
      selection_sha256: selectionSnapshot.sha256,
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
        source_build_compiler_profile: sourceBuildCompilerProfile
      },
      files: Object.fromEntries(Object.entries(FILE_NAMES).map(([field, relative_path]) => [field, {
        relative_path, sha256: sha256(files[field])
      }]))
    };
    const manifestBytes = Buffer.from(stableJson(manifest));
    const installed = await publishNewAuthority({ baselineRun, files, manifestBytes });
    return Object.freeze({
      status: 'created', run_id: manifest.run_id,
      authority_sha256: sha256(manifestBytes), output: path.basename(installed)
    });
  } catch (error) {
    if (error?.code === 'P6_AUTHORITY_INVALID') throw error;
    invalid();
  }
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

async function readBoundFile(root, relativePath, maxBytes) {
  if (!safeRelative(relativePath)) invalid();
  let handle = await openBoundAbsoluteDirectory(root);
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
      return { bytes, sha256: sha256(bytes) };
    } finally { await file.close(); }
  } finally { await handle.close(); }
}

async function publishNewAuthority({ baselineRun, files, manifestBytes }) {
  const parent = path.dirname(baselineRun); const targetName = path.basename(baselineRun);
  const parentHandle = await openBoundAbsoluteDirectory(parent);
  let stageHandle;
  const stageName = `.p6-baseline-stage-${randomBytes(16).toString('hex')}`;
  try {
    await assertAbsent(path.join(descriptor(parentHandle), targetName));
    await fs.mkdir(path.join(descriptor(parentHandle), stageName), { mode: 0o700 });
    const stageBefore = await fs.lstat(path.join(descriptor(parentHandle), stageName));
    stageHandle = await fs.open(path.join(descriptor(parentHandle), stageName), DIRECTORY_FLAGS);
    if (!sameIdentity(stageBefore, await stageHandle.stat())) invalid();
    await writeExclusive(stageHandle, OWNER_NAME, OWNER_BYTES);
    for (const [field, name] of Object.entries(FILE_NAMES)) await writeExclusive(stageHandle, name, files[field]);
    await writeExclusive(stageHandle, 'p6-baseline-authority.json', manifestBytes);
    await stageHandle.sync();
    const stageIdentity = await stageHandle.stat();
    await moveNoClobber(path.join(descriptor(parentHandle), stageName), path.join(descriptor(parentHandle), targetName));
    const target = await fs.lstat(path.join(descriptor(parentHandle), targetName));
    if (!target.isDirectory() || !sameIdentity(stageIdentity, target)) invalid();
    return baselineRun;
  } finally {
    await stageHandle?.close();
    await parentHandle.close();
  }
}

async function openBoundAbsoluteDirectory(absolutePath) {
  if (!safeAbsolute(absolutePath)) invalid();
  let handle = await fs.open(path.parse(absolutePath).root, DIRECTORY_FLAGS);
  try {
    for (const part of absolutePath.slice(path.parse(absolutePath).root.length).split(path.sep).filter(Boolean)) {
      if (!SAFE_BASENAME.test(part) || part === '.' || part === '..') invalid();
      const before = await fs.lstat(path.join(descriptor(handle), part));
      if (before.isSymbolicLink() || !before.isDirectory()) invalid();
      const child = await fs.open(path.join(descriptor(handle), part), DIRECTORY_FLAGS);
      if (!sameIdentity(before, await child.stat())) { await child.close(); invalid(); }
      await handle.close(); handle = child;
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function writeExclusive(directory, name, bytes) {
  const handle = await fs.open(path.join(descriptor(directory), name), WRITE_FLAGS, 0o400);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  const stat = await fs.lstat(path.join(descriptor(directory), name));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== bytes.length) invalid();
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
function fixedBaselineOptions() { return {
  mode: P6_FIXED_REQUEST.mode, candidate_count: P6_FIXED_REQUEST.candidate_count,
  candidate_rounds: P6_FIXED_REQUEST.candidate_rounds, candidate_force_rounds: P6_FIXED_REQUEST.candidate_force_rounds,
  concepts: P6_FIXED_REQUEST.concepts, concept_strategy: P6_FIXED_REQUEST.concept_strategy,
  critics: P6_FIXED_REQUEST.critics, neural_retrieval: P6_FIXED_REQUEST.neural_retrieval,
  coarse_voxel_mode: P6_FIXED_REQUEST.coarse_voxel_mode, coarse_voxel_provider: P6_FIXED_REQUEST.coarse_voxel_provider,
  coarse_voxel_plan: P6_FIXED_REQUEST.coarse_voxel_plan
}; }
function safeAbsolute(value) { return typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value; }
function safeRelative(value) { return typeof value === 'string' && value.split('/').every(part => SAFE_BASENAME.test(part) && part !== '.' && part !== '..'); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function descriptor(handle) { return `/proc/${process.pid}/fd/${handle.fd}`; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function pad(value) { return String(value).padStart(2, '0'); }
function invalid() { throw p6Error('P6_AUTHORITY_INVALID'); }
