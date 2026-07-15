import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeSchematicBlockVolume } from '../templates/schematicBlockVolume.js';
import {
  PrivateResearchBoundaryError,
  assertFormalDatasetBoundary,
  assertPrivateAcknowledgement,
  assertPrivateCandidate
} from './stage7PrivateResearchBoundary.js';

const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_BYTES = 128 * 1024 * 1024;
const MARKERS = Object.freeze({ rights_state: 'unverified', distribution: 'prohibited', purpose: 'local-private-research-only' });

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

async function readRecords(filePath) {
  try {
    return (await fs.readFile(filePath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new PrivateResearchBoundaryError('MANIFEST_INVALID', filePath);
  }
}
