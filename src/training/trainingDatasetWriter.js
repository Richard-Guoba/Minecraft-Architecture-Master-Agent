import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  decodeSchematicBlockVolume
} from '../construction/templates/schematicBlockVolume.js';
import { catalogTrainingSources } from './sourceCatalog.js';
import { buildSourceSplit } from './sourceSplit.js';
import { TOKEN_NAMES } from './tokenTaxonomy.js';
import { TrainingDataError } from './trainingError.js';
import {
  PATCH_SIZE,
  PATCH_STRIDE,
  PREPARATION_VERSION,
  prepareTrainingVolume
} from './volumePreparation.js';

const DATASET_SOURCE = 'minecraft-architecture-training-dataset-v1';
const MAX_INFLATED_BYTES = 128 * 1024 * 1024;

export async function writeTrainingDataset({
  sourceRoot,
  outputRoot,
  seed = 7101
} = {}) {
  const roots = validateRoots(sourceRoot, outputRoot);
  const catalog = await catalogTrainingSources({
    sourceRoot: roots.sourceRoot
  });
  const split = buildSourceSplit({
    sources: catalog.accepted,
    seed
  });

  await fs.mkdir(path.dirname(roots.outputRoot), { recursive: true });
  const temporaryRoot = await fs.mkdtemp(path.join(
    path.dirname(roots.outputRoot),
    `.${path.basename(roots.outputRoot)}.tmp-`
  ));
  let keepTemporaryRoot = true;
  try {
    const summary = await buildDatasetTree({
      sourceRoot: roots.sourceRoot,
      outputRoot: roots.outputRoot,
      temporaryRoot,
      seed,
      catalog,
      split
    });
    if (await pathExists(roots.outputRoot)) {
      if (!await treesEqual(temporaryRoot, roots.outputRoot)) {
        throw new TrainingDataError(
          'DATASET_OUTPUT_CONFLICT',
          roots.outputRoot
        );
      }
      await fs.rm(temporaryRoot, { recursive: true, force: true });
      keepTemporaryRoot = false;
      return deepFreeze(summary);
    }
    try {
      await fs.rename(temporaryRoot, roots.outputRoot);
      keepTemporaryRoot = false;
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      if (!await treesEqual(temporaryRoot, roots.outputRoot)) {
        throw new TrainingDataError(
          'DATASET_OUTPUT_CONFLICT',
          roots.outputRoot
        );
      }
      await fs.rm(temporaryRoot, { recursive: true, force: true });
      keepTemporaryRoot = false;
    }
    return deepFreeze(summary);
  } finally {
    if (keepTemporaryRoot) {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

async function buildDatasetTree({
  sourceRoot,
  outputRoot,
  temporaryRoot,
  seed,
  catalog,
  split
}) {
  const samplesDirectory = path.join(
    temporaryRoot,
    'dataset',
    'samples'
  );
  const wholeDirectory = path.join(temporaryRoot, 'dataset', 'whole');
  const splitsDirectory = path.join(temporaryRoot, 'splits');
  const reportsDirectory = path.join(temporaryRoot, 'reports');
  await Promise.all([
    fs.mkdir(samplesDirectory, { recursive: true }),
    fs.mkdir(wholeDirectory, { recursive: true }),
    fs.mkdir(splitsDirectory, { recursive: true }),
    fs.mkdir(reportsDirectory, { recursive: true })
  ]);

  const sources = [];
  const samples = [];
  const preparationReports = [];
  let wholeCount = 0;
  for (const source of catalog.accepted) {
    const volume = await readUnchangedSource(sourceRoot, source);
    const prepared = prepareTrainingVolume({ source, volume });
    const assignment = split.assignments[source.source_id];
    const whole = prepared.whole
      ? await writeWhole(wholeDirectory, prepared.whole)
      : null;
    if (whole) wholeCount += 1;
    for (const patch of prepared.patches) {
      samples.push(await writePatch(
        samplesDirectory,
        patch,
        assignment
      ));
    }
    sources.push({
      ...source,
      split: assignment,
      whole
    });
    preparationReports.push(prepared.report);
  }
  samples.sort((left, right) => (
    left.sample_id.localeCompare(right.sample_id)
  ));
  sources.sort((left, right) => (
    left.source_id.localeCompare(right.source_id)
  ));
  preparationReports.sort((left, right) => (
    left.source_id.localeCompare(right.source_id)
  ));

  const manifest = {
    source: DATASET_SOURCE,
    preparation_version: PREPARATION_VERSION,
    token_names: TOKEN_NAMES,
    patch_shape: [PATCH_SIZE, PATCH_SIZE, PATCH_SIZE],
    patch_stride: PATCH_STRIDE,
    seed,
    sources,
    samples
  };
  const splitDocument = {
    seed,
    ...split
  };
  const report = {
    source: 'minecraft-architecture-training-preparation-v1',
    preparation_version: PREPARATION_VERSION,
    seed,
    accepted_source_count: catalog.accepted.length,
    rejected_source_count: catalog.rejected.length,
    whole_count: wholeCount,
    patch_count: samples.length,
    split_counts: splitCounts(split),
    rejected_sources: catalog.rejected,
    sources: preparationReports
  };
  await Promise.all([
    writeCanonicalJson(
      path.join(temporaryRoot, 'dataset', 'manifest.json'),
      manifest
    ),
    writeCanonicalJson(
      path.join(splitsDirectory, 'split.json'),
      splitDocument
    ),
    writeCanonicalJson(
      path.join(reportsDirectory, 'preparation.json'),
      report
    )
  ]);
  return {
    accepted_source_count: report.accepted_source_count,
    rejected_source_count: report.rejected_source_count,
    whole_count: report.whole_count,
    patch_count: report.patch_count,
    split_counts: report.split_counts,
    report_path: path.join(outputRoot, 'reports', 'preparation.json')
  };
}

async function readUnchangedSource(sourceRoot, source) {
  const absolute = path.resolve(
    sourceRoot,
    ...source.relative_path.split('/')
  );
  if (!isInside(sourceRoot, absolute)) {
    throw new TrainingDataError(
      'SOURCE_PATH_ESCAPE',
      source.relative_path
    );
  }
  const entry = await fs.lstat(absolute);
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new TrainingDataError(
      'SOURCE_CHANGED',
      source.relative_path
    );
  }
  const bytes = await fs.readFile(absolute);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== source.content_sha256) {
    throw new TrainingDataError(
      'SOURCE_CHANGED',
      source.relative_path
    );
  }
  try {
    return decodeSchematicBlockVolume(bytes, {
      maxInflatedBytes: MAX_INFLATED_BYTES
    });
  } catch {
    throw new TrainingDataError(
      'SOURCE_CHANGED',
      source.relative_path
    );
  }
}

async function writeWhole(directory, whole) {
  const file = `dataset/whole/${whole.source_id}.bin`;
  const sha256 = createHash('sha256')
    .update(whole.voxels)
    .digest('hex');
  await writeDurable(
    path.join(directory, `${whole.source_id}.bin`),
    whole.voxels
  );
  return {
    file,
    sample_id: whole.sample_id,
    sha256,
    shape: whole.shape,
    translation_offset: whole.translation_offset,
    token_counts: whole.token_counts,
    non_air_count: whole.non_air_count
  };
}

async function writePatch(directory, patch, split) {
  const file = `dataset/samples/${patch.sample_id}.bin`;
  const sha256 = createHash('sha256')
    .update(patch.voxels)
    .digest('hex');
  await writeDurable(
    path.join(directory, `${patch.sample_id}.bin`),
    patch.voxels
  );
  return {
    file,
    sample_id: patch.sample_id,
    source_id: patch.source_id,
    split,
    sha256,
    origin: patch.origin,
    shape: patch.shape,
    token_counts: patch.token_counts,
    non_air_count: patch.non_air_count
  };
}

async function writeCanonicalJson(filePath, value) {
  await writeDurable(
    filePath,
    `${JSON.stringify(sortKeys(value), null, 2)}\n`
  );
}

async function writeDurable(filePath, value) {
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function validateRoots(sourceRoot, outputRoot) {
  if (!sourceRoot || !outputRoot) {
    throw new TrainingDataError(
      'DATASET_ROOT_INVALID',
      'sourceRoot and outputRoot are required'
    );
  }
  const source = path.resolve(String(sourceRoot));
  const output = path.resolve(String(outputRoot));
  if (source === output || isInside(source, output)) {
    throw new TrainingDataError(
      'DATASET_ROOT_OVERLAP',
      `${source}:${output}`
    );
  }
  return { sourceRoot: source, outputRoot: output };
}

function splitCounts(split) {
  return {
    train: split.train_source_ids.length,
    validation: split.validation_source_ids.length,
    test: split.test_source_ids.length
  };
}

async function treesEqual(leftRoot, rightRoot) {
  const leftEntry = await safeLstat(leftRoot);
  const rightEntry = await safeLstat(rightRoot);
  if (!leftEntry?.isDirectory() || !rightEntry?.isDirectory()) return false;
  const leftFiles = await fileInventory(leftRoot);
  const rightFiles = await fileInventory(rightRoot);
  if (
    leftFiles.length !== rightFiles.length
    || leftFiles.some((value, index) => value !== rightFiles[index])
  ) {
    return false;
  }
  for (const relative of leftFiles) {
    const [left, right] = await Promise.all([
      fs.readFile(path.join(leftRoot, relative)),
      fs.readFile(path.join(rightRoot, relative))
    ]);
    if (!left.equals(right)) return false;
  }
  return true;
}

async function fileInventory(root) {
  const files = [];
  await visit(root, '');
  return files.sort();

  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childRelative = path.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        files.push(`${childRelative}.symlink`);
      } else if (entry.isDirectory()) {
        await visit(absolute, childRelative);
      } else if (entry.isFile()) {
        files.push(childRelative);
      } else {
        files.push(`${childRelative}.special`);
      }
    }
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

async function pathExists(value) {
  return Boolean(await safeLstat(value));
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(
        (key) => [key, sortKeys(value[key])]
      )
    );
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
