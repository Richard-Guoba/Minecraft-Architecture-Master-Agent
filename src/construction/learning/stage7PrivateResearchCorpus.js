import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeSchematicBlockVolume } from '../templates/schematicBlockVolume.js';
import {
  PrivateResearchBoundaryError,
  assertFormalDatasetBoundary,
  assertPrivateAcknowledgement,
  assertPrivateCandidate,
  canonicalJson
} from './stage7PrivateResearchBoundary.js';

const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_BYTES = 128 * 1024 * 1024;
const MARKERS = Object.freeze({ rights_state: 'unverified', distribution: 'prohibited', purpose: 'local-private-research-only' });
export const PRIVATE_TAXONOMY_VERSION = 'private-raw-material-family-v1';

export async function importPrivateSources({ cwd = process.cwd(), root, obtainedAt, sourceUrl = '' } = {}) {
  if (typeof obtainedAt !== 'string' || Number.isNaN(Date.parse(obtainedAt))) throw new PrivateResearchBoundaryError('OBTAINED_AT_INVALID', String(obtainedAt));
  if (typeof sourceUrl !== 'string') throw new PrivateResearchBoundaryError('SOURCE_URL_INVALID', String(sourceUrl));
  await assertPrivateAcknowledgement(root);
  await assertFormalDatasetBoundary(cwd);
  const sourceRoot = await assertPrivateCandidate(root, path.join(root, 'source'));
  const manifestRoot = await assertPrivateCandidate(root, path.join(root, 'manifests'));
  const existingPath = path.join(manifestRoot, 'sources.jsonl');
  const existing = await readRecords(existingPath);
  const byPath = new Map(existing.map((record) => [record.source_path, record]));
  const byHash = new Map(existing.map((record) => [record.content_sha256, record]));
  const entries = (await fs.readdir(sourceRoot, { withFileTypes: true })).filter((entry) => entry.isFile()).sort((a, b) => a.name.localeCompare(b.name));
  const records = [];
  for (const entry of entries) {
    const extension = path.extname(entry.name).toLowerCase();
    if (extension !== '.schem' && extension !== '.schematic') throw new PrivateResearchBoundaryError('SOURCE_FORMAT_UNSUPPORTED', entry.name);
    const filePath = await assertPrivateCandidate(root, path.join(sourceRoot, entry.name));
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_SOURCE_BYTES) throw new PrivateResearchBoundaryError('SOURCE_TOO_LARGE', entry.name);
    const bytes = await fs.readFile(filePath);
    let volume;
    try { volume = decodeSchematicBlockVolume(bytes, { maxInflatedBytes: MAX_INFLATED_BYTES }); } catch (error) { throw new PrivateResearchBoundaryError('SOURCE_MALFORMED', `${entry.name}: ${error.message}`); }
    const sourcePath = `source/${entry.name}`;
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    const priorPath = byPath.get(sourcePath);
    if (priorPath && priorPath.content_sha256 !== contentSha256) throw new PrivateResearchBoundaryError('SOURCE_HASH_CHANGED', sourcePath);
    const priorHash = byHash.get(contentSha256);
    if (priorHash && priorHash.source_path !== sourcePath) throw new PrivateResearchBoundaryError('DUPLICATE_SOURCE', sourcePath);
    records.push(priorPath || Object.freeze({
      source_id: `pr-${contentSha256.slice(0, 16)}`, source_path: sourcePath, source_url: sourceUrl,
      obtained_at: obtainedAt, content_sha256: contentSha256, format: extension.slice(1), ...MARKERS,
      dimensions: { x: volume.width, y: volume.height, z: volume.length }
    }));
  }
  const sorted = records.sort((a, b) => a.source_path.localeCompare(b.source_path));
  await fs.writeFile(existingPath, sorted.map((record) => JSON.stringify(record)).join('\n') + (sorted.length ? '\n' : ''), 'utf8');
  return Object.freeze({ records: Object.freeze(sorted) });
}

export async function preparePrivateCorpus({ cwd = process.cwd(), root, splitSeed } = {}) {
  if (!Number.isInteger(splitSeed)) throw new PrivateResearchBoundaryError('SPLIT_SEED_INVALID', String(splitSeed));
  await assertPrivateAcknowledgement(root);
  await assertFormalDatasetBoundary(cwd);
  const sourceRoot = await assertPrivateCandidate(root, path.join(root, 'source'));
  const manifestRoot = await assertPrivateCandidate(root, path.join(root, 'manifests'));
  const preparedRoot = await assertPrivateCandidate(root, path.join(root, 'prepared'));
  const splitsRoot = await assertPrivateCandidate(root, path.join(root, 'splits'));
  const sources = await readRecords(path.join(manifestRoot, 'sources.jsonl'));
  const records = [];
  for (const source of sources.sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    const sourceFile = await assertPrivateCandidate(root, path.join(sourceRoot, path.basename(source.source_path)));
    const bytes = await fs.readFile(sourceFile);
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    if (sourceHash !== source.content_sha256) throw new PrivateResearchBoundaryError('SOURCE_HASH_CHANGED', source.source_path);
    let volume;
    try { volume = decodeSchematicBlockVolume(bytes, { maxInflatedBytes: MAX_INFLATED_BYTES }); } catch (error) { throw new PrivateResearchBoundaryError('SOURCE_MALFORMED', `${source.source_path}: ${error.message}`); }
    const voxels = rasterizeVolume(volume, source.source_path);
    const voxelPath = path.join(preparedRoot, `${source.source_id}.voxels.bin`);
    const metadataPath = path.join(preparedRoot, `${source.source_id}.json`);
    const voxelSha256 = createHash('sha256').update(voxels).digest('hex');
    const record = {
      source_id: source.source_id, source_sha256: sourceHash, taxonomy_version: PRIVATE_TAXONOMY_VERSION,
      shape: [64, 64, 64], voxel_path: path.relative(root, voxelPath).replaceAll('\\', '/'),
      metadata_path: path.relative(root, metadataPath).replaceAll('\\', '/'), voxel_sha256: voxelSha256, ...MARKERS
    };
    await fs.writeFile(voxelPath, voxels);
    await fs.writeFile(metadataPath, canonicalJson(record), 'utf8');
    records.push(record);
  }
  const sorted = records.sort((a, b) => a.source_id.localeCompare(b.source_id));
  await fs.writeFile(path.join(manifestRoot, 'prepared.jsonl'), sorted.map((record) => JSON.stringify(record)).join('\n') + (sorted.length ? '\n' : ''), 'utf8');
  const caseIds = sorted.map((record) => record.source_id);
  const split = { source: 'stage7-private-research-split-v1', split_seed: splitSeed, case_ids: caseIds, train_case_ids: [], validation_case_ids: [] };
  for (const record of sorted) {
    const bucket = createHash('sha256').update(`${splitSeed}:${record.source_sha256}`).digest()[0] % 5;
    (bucket === 0 ? split.validation_case_ids : split.train_case_ids).push(record.source_id);
  }
  await fs.writeFile(path.join(splitsRoot, 'split.json'), canonicalJson(split), 'utf8');
  return { records: sorted, split };
}

export function mapPrivateToken(block) {
  if (block.air) return 0;
  if (block.category === 'earth') return 1;
  if (block.category === 'rock') return 2;
  if (block.category === 'wood') return 3;
  if (block.category === 'glass') return 4;
  if (block.category === 'stair' || block.category === 'slab') return 5;
  if (block.category === 'water') return 7;
  if (['light', 'fence', 'opening', 'decor', 'vegetation'].includes(block.category)) return 6;
  return 8;
}

function rasterizeVolume(volume, sourcePath) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -1, maxY = -1, maxZ = -1;
  for (let y = 0; y < volume.height; y += 1) for (let z = 0; z < volume.length; z += 1) for (let x = 0; x < volume.width; x += 1) {
    if (!volume.blockAt(x, y, z).air) { minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z); }
  }
  if (maxX < 0) throw new PrivateResearchBoundaryError('SOURCE_EMPTY', sourcePath);
  const extents = [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1];
  if (extents.some((extent) => extent > 64)) throw new PrivateResearchBoundaryError('VOLUME_TOO_LARGE', sourcePath);
  const offsets = extents.map((extent) => Math.floor((64 - extent) / 2));
  const voxels = new Uint8Array(64 ** 3);
  for (let y = minY; y <= maxY; y += 1) for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
    const targetY = offsets[1] + y - minY, targetZ = offsets[2] + z - minZ, targetX = offsets[0] + x - minX;
    voxels[targetY * 64 * 64 + targetZ * 64 + targetX] = mapPrivateToken(volume.blockAt(x, y, z));
  }
  return voxels;
}

async function readRecords(filePath) {
  try {
    return (await fs.readFile(filePath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new PrivateResearchBoundaryError('MANIFEST_INVALID', filePath);
  }
}
