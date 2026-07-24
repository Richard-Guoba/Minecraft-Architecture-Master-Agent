import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  decodeSchematicBlockVolume
} from '../construction/templates/schematicBlockVolume.js';
import {
  fingerprintCategoricalEntries
} from './structuralFingerprint.js';
import { TrainingDataError } from './trainingError.js';
import { mapTrainingToken } from './tokenTaxonomy.js';

const MAX_RAW_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_BYTES = 128 * 1024 * 1024;
const MAX_VOXELS = 128 * 1024 * 1024;
const SUPPORTED = new Set(['.schem', '.schematic']);

export async function catalogTrainingSources({ sourceRoot } = {}) {
  const root = path.resolve(String(sourceRoot || ''));
  const rootEntry = await safeLstat(root, 'SOURCE_ROOT_MISSING');
  if (rootEntry.isSymbolicLink()) {
    throw new TrainingDataError('SOURCE_ROOT_SYMLINK', root);
  }
  if (!rootEntry.isDirectory()) {
    throw new TrainingDataError('SOURCE_ROOT_NOT_DIRECTORY', root);
  }
  const candidates = await discoverSources(root);
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    if (candidate.symlink) {
      rejected.push(rejection(candidate.relativePath, 'SOURCE_SYMLINK'));
      continue;
    }
    try {
      accepted.push(await catalogOne(root, candidate));
    } catch (error) {
      rejected.push(rejection(
        candidate.relativePath,
        error instanceof TrainingDataError ? error.code : 'SOURCE_MALFORMED'
      ));
    }
  }
  return deepFreeze({
    accepted: accepted.sort(compareRelativePath),
    rejected: rejected.sort(compareRelativePath)
  });
}

async function discoverSources(root) {
  const output = [];
  await visit(root, '');
  return output.sort(compareRelativePath);

  async function visit(directory, relativeDirectory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = normalizeRelative(
        path.join(relativeDirectory, entry.name)
      );
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) {
          output.push({ relativePath, symlink: true });
        }
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolute, relativePath);
        continue;
      }
      if (
        entry.isFile()
        && SUPPORTED.has(path.extname(entry.name).toLowerCase())
      ) {
        output.push({ relativePath, symlink: false });
      }
    }
  }
}

async function catalogOne(root, candidate) {
  const absolute = path.resolve(root, ...candidate.relativePath.split('/'));
  if (!isInside(root, absolute)) {
    throw new TrainingDataError('SOURCE_PATH_ESCAPE', candidate.relativePath);
  }
  const entry = await safeLstat(absolute, 'SOURCE_MISSING');
  if (entry.isSymbolicLink()) {
    throw new TrainingDataError('SOURCE_SYMLINK', candidate.relativePath);
  }
  if (!entry.isFile()) {
    throw new TrainingDataError('SOURCE_NOT_REGULAR', candidate.relativePath);
  }
  if (entry.size > MAX_RAW_BYTES) {
    throw new TrainingDataError('SOURCE_TOO_LARGE', candidate.relativePath, {
      byte_count: entry.size
    });
  }
  const bytes = await fs.readFile(absolute);
  let volume;
  try {
    volume = decodeSchematicBlockVolume(bytes, {
      maxInflatedBytes: MAX_INFLATED_BYTES
    });
  } catch (error) {
    throw new TrainingDataError('SOURCE_MALFORMED', candidate.relativePath, {
      parser_error: error?.name || 'Error'
    });
  }
  const voxelCount = volume.width * volume.height * volume.length;
  if (
    !Number.isSafeInteger(voxelCount)
    || voxelCount <= 0
    || voxelCount > MAX_VOXELS
    || volume.block_count !== voxelCount
  ) {
    throw new TrainingDataError(
      'SOURCE_DIMENSIONS_INVALID',
      candidate.relativePath
    );
  }

  const measured = measureVolume(volume);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const sourceId = `source-${createHash('sha256')
    .update(candidate.relativePath)
    .digest('hex')
    .slice(0, 16)}`;
  const structuralFingerprint = fingerprintCategoricalEntries({
    sourceId,
    contentSha256,
    extent: measured.occupiedBounds.extent,
    entries: measured.tightEntries
  });
  return deepFreeze({
    source_id: sourceId,
    relative_path: candidate.relativePath,
    content_sha256: contentSha256,
    format: volume.format,
    dimensions: {
      x: volume.width,
      y: volume.height,
      z: volume.length
    },
    occupied_bounds: measured.occupiedBounds,
    token_counts: measured.tokenCounts,
    structural_fingerprint: structuralFingerprint
  });
}

function measureVolume(volume) {
  const tokenCounts = Array(9).fill(0);
  const absoluteEntries = [];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -1, y: -1, z: -1 };
  const layerSize = volume.width * volume.length;
  for (let index = 0; index < volume.block_count; index += 1) {
    const block = volume.blockAtIndex(index);
    const token = mapTrainingToken(block);
    tokenCounts[token] += 1;
    if (token === 0) continue;
    const x = index % volume.width;
    const z = Math.floor(index / volume.width) % volume.length;
    const y = Math.floor(index / layerSize);
    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
    absoluteEntries.push({ x, y, z, token });
  }
  if (absoluteEntries.length === 0) {
    throw new TrainingDataError('SOURCE_EMPTY', 'no non-air voxels');
  }
  const extent = {
    x: max.x - min.x + 1,
    y: max.y - min.y + 1,
    z: max.z - min.z + 1
  };
  return {
    tokenCounts,
    occupiedBounds: {
      min,
      max,
      extent
    },
    tightEntries: absoluteEntries.map((entry) => ({
      x: entry.x - min.x,
      y: entry.y - min.y,
      z: entry.z - min.z,
      token: entry.token
    }))
  };
}

function rejection(relativePath, code) {
  return Object.freeze({
    relative_path: relativePath,
    code
  });
}

async function safeLstat(value, missingCode) {
  try {
    return await fs.lstat(value);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new TrainingDataError(missingCode, value);
    }
    throw error;
  }
}

function normalizeRelative(value) {
  return value.split(path.sep).join('/');
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

function compareRelativePath(left, right) {
  return left.relativePath?.localeCompare(right.relativePath)
    || left.relative_path?.localeCompare(right.relative_path)
    || 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
