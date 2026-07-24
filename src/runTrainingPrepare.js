import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeTrainingDataset
} from './training/trainingDatasetWriter.js';
import { TrainingDataError } from './training/trainingError.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const LOCAL_TRAINING_ROOT = path.join(PROJECT_ROOT, '.local', 'training');
const OPTIONS = new Set(['--source-root', '--output-root', '--root', '--seed']);

export function parseTrainingPrepareArgs(
  argv,
  { cwd = process.cwd() } = {}
) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!OPTIONS.has(flag)) fail('ARGUMENT_UNKNOWN', flag);
    if (Object.hasOwn(values, flag)) fail('ARGUMENT_DUPLICATE', flag);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail('ARGUMENT_VALUE_MISSING', flag);
    }
    values[flag] = value;
    index += 1;
  }
  const seedValue = values['--seed'] ?? '7101';
  if (!/^\d+$/u.test(seedValue)) fail('SEED_INVALID', seedValue);
  const seed = Number(seedValue);
  if (!Number.isSafeInteger(seed) || seed > 0xffffffff) {
    fail('SEED_INVALID', seedValue);
  }
  if (values['--root'] !== undefined && values['--output-root'] !== undefined) {
    fail('ARGUMENT_DUPLICATE', '--root/--output-root');
  }
  return Object.freeze({
    sourceRoot: path.resolve(cwd, values['--source-root'] ?? 'mc_templates'),
    outputRoot: path.resolve(
      cwd,
      values['--root'] ?? values['--output-root'] ?? '.local/training'
    ),
    seed
  });
}

export async function validateTrainingOutputRoot(
  outputRoot,
  { projectRoot = PROJECT_ROOT } = {}
) {
  const output = path.resolve(outputRoot);
  const relative = path.relative(projectRoot, output);
  if (isInsideRelative(relative) && isTracked(projectRoot, relative)) {
    fail('OUTPUT_ROOT_TRACKED', output);
  }
  const allowed = path.resolve(projectRoot, '.local', 'training');
  if (output !== allowed && !isInside(allowed, output)) {
    fail('OUTPUT_ROOT_OUTSIDE_LOCAL_TRAINING', output);
  }
  await rejectSymlinkPath(projectRoot, output);
  const entry = await safeLstat(output);
  if (entry && !entry.isDirectory()) {
    fail('OUTPUT_ROOT_NOT_DIRECTORY', output);
  }
  return output;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseTrainingPrepareArgs(argv);
  await validateTrainingOutputRoot(options.outputRoot);
  const summary = await writeTrainingDataset(options);
  process.stdout.write([
    `accepted_sources=${summary.accepted_source_count}`,
    `rejected_sources=${summary.rejected_source_count}`,
    `whole_samples=${summary.whole_count}`,
    `patch_samples=${summary.patch_count}`,
    `split_train=${summary.split_counts.train}`,
    `split_validation=${summary.split_counts.validation}`,
    `split_test=${summary.split_counts.test}`,
    `report=${summary.report_path}`
  ].join('\n') + '\n');
}

function isTracked(projectRoot, relative) {
  const result = spawnSync(
    'git',
    ['-C', projectRoot, 'ls-files', '--', relative],
    { encoding: 'utf8' }
  );
  if (result.error) fail('GIT_CHECK_FAILED', result.error.message);
  if (result.status !== 0) fail('GIT_CHECK_FAILED', result.stderr.trim());
  return result.stdout.trim().length > 0;
}

async function rejectSymlinkPath(projectRoot, output) {
  const relative = path.relative(projectRoot, output);
  let current = projectRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const entry = await safeLstat(current);
    if (!entry) return;
    if (entry.isSymbolicLink()) fail('OUTPUT_ROOT_SYMLINK', current);
  }
}

async function safeLstat(value) {
  try {
    return await fs.lstat(value);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function isInside(root, candidate) {
  return isInsideRelative(path.relative(root, candidate));
}

function isInsideRelative(relative) {
  return relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function fail(code, detail) {
  throw new TrainingDataError(code, detail);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const code = error?.code || 'TRAINING_PREPARE_FAILED';
    const detail = error?.detail || error?.message || String(error);
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 1;
  });
}
