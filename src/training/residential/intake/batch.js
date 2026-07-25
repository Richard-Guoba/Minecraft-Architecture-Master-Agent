import fs from 'node:fs/promises';
import path from 'node:path';
import { failContract } from '../contracts/contractError.js';
import {
  SOURCE_BATCH_SOURCE,
  SOURCE_LANES,
  RESIDENTIAL_SCHEMA_VERSION
} from '../contracts/vocabularies.js';
import {
  validateSourceBatchManifest
} from '../contracts/sourceBatch.js';
import {
  readResidentialWorkspaceStatus,
  validateResidentialWorkspaceRoot
} from '../workspace/index.js';
import { canonicalSha256 } from './canonicalJson.js';

const BATCH_ROOT_ENTRIES = Object.freeze([
  'batch-manifest.json',
  ...SOURCE_LANES
]);

export async function initializeSourceBatch(options) {
  const root = await readyRoot(options);
  const seed = validateSourceBatchManifest({
    source: SOURCE_BATCH_SOURCE,
    schema_version: RESIDENTIAL_SCHEMA_VERSION,
    batch_id: options.batchId,
    source_project: options.sourceProject,
    candidates: []
  });
  const target = path.join(root, 'inbox', seed.batch_id);
  const existing = await safeLstat(target);
  if (existing) {
    const inventory = await inventorySourceBatch(options);
    if (inventory.manifest.source_project !== seed.source_project) {
      failContract(
        'SOURCE_BATCH_CONFLICT',
        'SourceBatch.source_project',
        inventory.manifest.source_project
      );
    }
    return inventory;
  }
  const temporary = await fs.mkdtemp(
    path.join(root, 'inbox', `.${seed.batch_id}.tmp-`)
  );
  let cleanup = true;
  try {
    for (const lane of SOURCE_LANES) {
      await fs.mkdir(path.join(temporary, lane));
    }
    await writeExclusive(
      path.join(temporary, 'batch-manifest.json'),
      JSON.stringify(seed, null, 2) + '\n'
    );
    try {
      await fs.rename(temporary, target);
      cleanup = false;
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
  } finally {
    if (cleanup) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  return inventorySourceBatch(options);
}

export async function inventorySourceBatch(options) {
  const root = await readyRoot(options);
  const batchId = String(options.batchId || '');
  if (!/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(batchId)) {
    failContract('CONTRACT_ID_INVALID', 'SourceBatch.batch_id', batchId);
  }
  const batchPath = path.join(root, 'inbox', batchId);
  const batchEntry = await safeLstat(batchPath);
  if (!batchEntry?.isDirectory() || batchEntry.isSymbolicLink()) {
    failContract('SOURCE_BATCH_DIRECTORY_INVALID', 'SourceBatch.directory', batchPath);
  }
  await validateRootEntries(batchPath);
  const manifestPath = path.join(batchPath, 'batch-manifest.json');
  const manifestEntry = await safeLstat(manifestPath);
  if (!manifestEntry?.isFile() || manifestEntry.isSymbolicLink()) {
    failContract('SOURCE_BATCH_MANIFEST_INVALID', 'SourceBatch.manifest', manifestPath);
  }
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    failContract(
      'SOURCE_BATCH_MANIFEST_INVALID',
      'SourceBatch.manifest',
      error?.message || 'invalid JSON'
    );
  }
  const manifest = validateSourceBatchManifest(raw);
  if (manifest.batch_id !== batchId) {
    failContract(
      'SOURCE_BATCH_ID_MISMATCH',
      'SourceBatch.batch_id',
      `${manifest.batch_id} != ${batchId}`
    );
  }
  const discovered = await discoverPayloads(batchPath);
  const listed = manifest.candidates
    .map((item) => item.relative_path)
    .sort((left, right) => left.localeCompare(right));
  for (const relative of discovered) {
    if (!listed.includes(relative)) {
      failContract(
        'SOURCE_BATCH_UNLISTED_PAYLOAD',
        'SourceBatch.candidates',
        relative
      );
    }
  }
  for (const relative of listed) {
    if (!discovered.includes(relative)) {
      failContract(
        'SOURCE_BATCH_PAYLOAD_MISSING',
        'SourceBatch.candidates',
        relative
      );
    }
  }
  const byPath = new Map(
    manifest.candidates.map((item) => [item.relative_path, item])
  );
  return Object.freeze({
    batch_path: batchPath,
    manifest,
    manifest_sha256: canonicalSha256(manifest),
    candidates: Object.freeze(listed.map((relative) => Object.freeze({
      relative_path: relative,
      absolute_path: path.join(batchPath, ...relative.split('/')),
      submitted: byPath.get(relative)
    })))
  });
}

async function readyRoot(options) {
  const root = await validateResidentialWorkspaceRoot(options.root, options);
  const status = await readResidentialWorkspaceStatus({ ...options, root });
  if (status.state !== 'ready') {
    failContract('WORKSPACE_NOT_READY', 'workspace.root', root);
  }
  return root;
}

async function validateRootEntries(batchPath) {
  const entries = await fs.readdir(batchPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const names = new Set();
  for (const entry of entries) {
    names.add(entry.name);
    if (entry.isSymbolicLink()) {
      failContract('SOURCE_BATCH_SYMLINK', 'SourceBatch.entry', entry.name);
    }
    if (!BATCH_ROOT_ENTRIES.includes(entry.name)) {
      failContract('SOURCE_BATCH_ROOT_ENTRY_INVALID', 'SourceBatch.entry', entry.name);
    }
    const shouldBeDirectory = SOURCE_LANES.includes(entry.name);
    if (shouldBeDirectory ? !entry.isDirectory() : !entry.isFile()) {
      failContract('SOURCE_BATCH_ROOT_ENTRY_INVALID', 'SourceBatch.entry', entry.name);
    }
  }
  for (const name of BATCH_ROOT_ENTRIES) {
    if (!names.has(name)) {
      failContract('SOURCE_BATCH_ROOT_ENTRY_INVALID', 'SourceBatch.entry', name);
    }
  }
}

async function discoverPayloads(batchPath) {
  const discovered = [];
  for (const lane of SOURCE_LANES) {
    const entries = await fs.readdir(path.join(batchPath, lane), {
      withFileTypes: true
    });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = `${lane}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        failContract('SOURCE_BATCH_SYMLINK', 'SourceBatch.payload', relative);
      }
      if (entry.isDirectory()) {
        failContract('SOURCE_BATCH_NESTED_DIRECTORY', 'SourceBatch.payload', relative);
      }
      if (!entry.isFile()) {
        failContract('SOURCE_BATCH_ENTRY_INVALID', 'SourceBatch.payload', relative);
      }
      discovered.push(relative);
    }
  }
  return discovered.sort((left, right) => left.localeCompare(right));
}

async function writeExclusive(filePath, value) {
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(value, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
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
