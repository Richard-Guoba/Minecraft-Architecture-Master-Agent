import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  EXPECTED_DATASET_HASHES,
  assertFormalDatasetBoundary
} from './stage7PrivateResearchBoundary.js';
import { validatePilotBatchDocument } from './stage7PilotBatch.js';
import { SOURCE_EXPANSION_ROOT_RELATIVE } from './stage7SourceExpansionBoundary.js';

const execFile = promisify(execFileCallback);
const EXPECTED_BRANCH = 'codex/stage7-dataset-v3-extraction';
const PRIVATE_ROOT_RELATIVE = '.local/stage7-private-research';
const PRIVATE_PREFLIGHT_CODE = "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(p.case_count)";

export class PilotPreflightError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PilotPreflightError';
    this.code = code;
  }
}

export async function runPilotPreflight({
  repositoryRoot,
  root,
  batchDocument,
  execFileImpl = execFile,
  assertDatasetBoundary = assertFormalDatasetBoundary,
  today = new Date().toISOString().slice(0, 10),
  reviewRecovery = false
}) {
  const repository = path.resolve(repositoryRoot);
  const publicRoot = path.resolve(root);
  const privateRoot = path.join(repository, PRIVATE_ROOT_RELATIVE);
  const batch = validatePilotBatchDocument(batchDocument);
  await assertDirectory(repository, 'repository');
  if (publicRoot !== path.join(repository, SOURCE_EXPANSION_ROOT_RELATIVE)) {
    fail('PREFLIGHT_ROOT_INVALID', 'public-root');
  }
  await assertDirectory(publicRoot, 'public-root');
  const repositoryReal = await fs.realpath(repository);
  if (await fs.realpath(publicRoot) !== path.join(repositoryReal, SOURCE_EXPANSION_ROOT_RELATIVE)) {
    fail('PREFLIGHT_ROOT_INVALID', 'public-root');
  }
  await assertDirectory(privateRoot, 'private-root');
  if (await fs.realpath(privateRoot) !== path.join(repositoryReal, PRIVATE_ROOT_RELATIVE)) {
    fail('PREFLIGHT_ROOT_INVALID', 'private-root');
  }
  const allowsPastBatch = reviewRecovery === true && batch.batch.as_of < today;
  if (batch.batch.as_of !== today && !allowsPastBatch) {
    fail('PREFLIGHT_DATE_DRIFT', 'batch-as-of');
  }

  const status = await gitSuccess(execFileImpl, repository, [
    'status', '--porcelain=v1', '--untracked-files=no'
  ], 'GIT_STATUS_FAILED');
  if (text(status.stdout) !== '') fail('GIT_TRACKED_DIRTY', 'tracked-worktree');
  const branch = text((await gitSuccess(
    execFileImpl, repository, ['branch', '--show-current'], 'GIT_BRANCH_FAILED'
  )).stdout).trim();
  if (branch !== EXPECTED_BRANCH) fail('GIT_BRANCH_DRIFT', 'branch');
  const head = text((await gitSuccess(
    execFileImpl, repository, ['rev-parse', 'HEAD'], 'GIT_HEAD_FAILED'
  )).stdout).trim();
  const descendant = reviewRecovery === true && await gitSucceeds(
    execFileImpl,
    repository,
    ['merge-base', '--is-ancestor', batch.batch.code_revision, head]
  );
  if (head !== batch.batch.code_revision && !descendant) {
    fail('GIT_HEAD_DRIFT', 'batch-code-revision');
  }

  for (const [label, candidate] of [
    ['public-root', publicRoot],
    ['private-root', privateRoot]
  ]) {
    await gitSuccess(execFileImpl, repository,
      ['check-ignore', '--quiet', '--', candidate], 'GIT_IGNORE_DRIFT');
    if (await gitSucceeds(execFileImpl, repository,
      ['ls-files', '--error-unmatch', '--', candidate])) {
      fail('GIT_TRACKED_ROOT_DRIFT', label);
    }
  }

  const aggregate = await privateAggregate(privateRoot);
  const expectedAggregate = {
    source_files: 22,
    deferred_oversized: 42,
    source_records: 22,
    prepared_records: 22,
    prepared_binary_count: 22,
    all_prepared_64_cubed: true,
    train_cases: 15,
    validation_cases: 7,
    run_directories: 3,
    acknowledgement_valid: true
  };
  if (JSON.stringify(aggregate) !== JSON.stringify(expectedAggregate)) {
    fail('PRIVATE_AGGREGATE_DRIFT', 'private-aggregate');
  }

  const python = await commandSuccess(execFileImpl, 'conda', [
    'run', '-n', 'mcagent-stage7', '--cwd', 'training/stage7',
    'python', '-c', PRIVATE_PREFLIGHT_CODE
  ], { cwd: repository }, 'PRIVATE_PYTHON_PREFLIGHT_FAILED');
  if (text(python.stdout).trim() !== '22') {
    fail('PRIVATE_PYTHON_COUNT_DRIFT', 'private-case-count');
  }

  const dataset = await assertDatasetBoundary(repository);
  if (JSON.stringify(dataset.dataset_hashes) !== JSON.stringify(EXPECTED_DATASET_HASHES)
    || dataset.dataset_v3_gate?.ready_for_m3_real_data !== false
    || dataset.dataset_v3_gate?.training_eligible_count !== 0) {
    fail('FORMAL_DATASET_DRIFT', 'dataset-boundary');
  }
  return deepFreeze({
    git_head: head,
    private_case_count: 22,
    run_directory_count: 3,
    dataset_hashes: { ...dataset.dataset_hashes },
    dataset_v3_gate: { ...dataset.dataset_v3_gate }
  });
}

async function privateAggregate(root) {
  await assertDirectory(root, 'private-root');
  const acknowledgement = await readJson(path.join(root, 'PRIVATE_RESEARCH_ACK.json'));
  const source = await safeEntries(path.join(root, 'source'));
  const oversized = await safeEntries(path.join(root, 'deferred', 'oversized'));
  const prepared = await safeEntries(path.join(root, 'prepared'));
  const runs = await safeEntries(path.join(root, 'runs'));
  const unsafeSource = source.some((entry) => entry.isSymbolicLink());
  const unsafeOversized = oversized.some((entry) => entry.isSymbolicLink());
  const unsafePrepared = prepared.some((entry) => entry.isSymbolicLink());
  const unsafeRuns = runs.some((entry) => entry.isSymbolicLink() || !entry.isDirectory());
  const preparedBinaries = prepared.filter((entry) =>
    entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.voxels.bin'));
  let allPrepared64Cubed = !unsafePrepared;
  for (const entry of preparedBinaries) {
    const stat = await fs.lstat(path.join(root, 'prepared', entry.name));
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== 64 ** 3) {
      allPrepared64Cubed = false;
    }
  }
  const split = await readJson(path.join(root, 'splits', 'split.json'));
  const train = Array.isArray(split.train_case_ids) ? split.train_case_ids : [];
  const validation = Array.isArray(split.validation_case_ids) ? split.validation_case_ids : [];
  const splitUnique = new Set([...train, ...validation]).size === train.length + validation.length;
  return {
    source_files: unsafeSource ? -1 : source.filter((entry) =>
      entry.isFile() && !entry.isSymbolicLink()).length,
    deferred_oversized: unsafeOversized ? -1 : oversized.filter((entry) =>
      entry.isFile() && !entry.isSymbolicLink()).length,
    source_records: await lineCount(path.join(root, 'manifests', 'sources.jsonl')),
    prepared_records: await lineCount(path.join(root, 'manifests', 'prepared.jsonl')),
    prepared_binary_count: preparedBinaries.length,
    all_prepared_64_cubed: allPrepared64Cubed,
    train_cases: splitUnique ? train.length : -1,
    validation_cases: splitUnique ? validation.length : -1,
    run_directories: unsafeRuns ? -1 : runs.length,
    acknowledgement_valid: acknowledgement.scope === 'stage7-private-research-only'
      && acknowledgement.distribution_prohibited === true
      && acknowledgement.dataset_v3_unchanged === true
      && acknowledgement.m4_apply_mode_unchanged === true
  };
}

async function assertDirectory(value, label) {
  let stat;
  try {
    stat = await fs.lstat(value);
  } catch {
    fail('PREFLIGHT_PATH_INVALID', label);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PREFLIGHT_PATH_INVALID', label);
}

async function safeEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    fail('PRIVATE_AGGREGATE_DRIFT', 'private-aggregate');
  }
}

async function readJson(file) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    fail('PRIVATE_AGGREGATE_DRIFT', 'private-aggregate');
  }
}

async function lineCount(file) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe');
    const value = await fs.readFile(file, 'utf8');
    return value.split(/\r?\n/u).filter((line) => line.length > 0).length;
  } catch {
    fail('PRIVATE_AGGREGATE_DRIFT', 'private-aggregate');
  }
}

async function gitSuccess(execFileImpl, repository, args, code) {
  return commandSuccess(execFileImpl, 'git', args, { cwd: repository }, code);
}

async function gitSucceeds(execFileImpl, repository, args) {
  try {
    await execFileImpl('git', args, { cwd: repository });
    return true;
  } catch {
    return false;
  }
}

async function commandSuccess(execFileImpl, command, args, options, code) {
  try {
    return await execFileImpl(command, args, options);
  } catch {
    fail(code, command);
  }
}

function text(value) {
  return value === undefined ? '' : String(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, detail) {
  throw new PilotPreflightError(code, detail);
}
