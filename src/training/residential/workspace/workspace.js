import fs from 'node:fs/promises';
import path from 'node:path';
import { failContract } from '../contracts/contractError.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  WORKSPACE_SOURCE
} from '../contracts/vocabularies.js';
import {
  safeLstat,
  validateResidentialWorkspaceRoot
} from './paths.js';

export const RESIDENTIAL_WORKSPACE_DIRECTORIES = Object.freeze([
  'inbox',
  'quarantine',
  'sources',
  'annotations',
  'reviews/golden',
  'reviews/selective',
  'snapshots',
  'runs',
  'reports'
]);

const MANIFEST = Object.freeze({
  source: WORKSPACE_SOURCE,
  schema_version: RESIDENTIAL_SCHEMA_VERSION,
  directories: RESIDENTIAL_WORKSPACE_DIRECTORIES
});

export async function initializeResidentialWorkspace(options) {
  const root = await validateResidentialWorkspaceRoot(
    options.root,
    options
  );
  const existing = await safeLstat(root);
  if (existing) return readReadyWorkspace(root);

  const parent = path.dirname(root);
  await fs.mkdir(parent, { recursive: true });
  const parentEntry = await fs.lstat(parent);
  if (!parentEntry.isDirectory() || parentEntry.isSymbolicLink()) {
    failContract('WORKSPACE_PARENT_INVALID', 'workspace.root', parent);
  }
  const temporary = await fs.mkdtemp(
    path.join(parent, '.residential-model.tmp-')
  );
  let removeTemporary = true;
  try {
    for (const relative of RESIDENTIAL_WORKSPACE_DIRECTORIES) {
      await fs.mkdir(path.join(temporary, relative), { recursive: true });
    }
    await writeExclusiveJson(path.join(temporary, 'workspace.json'), MANIFEST);
    try {
      await fs.rename(temporary, root);
      removeTemporary = false;
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      return readReadyWorkspace(root);
    }
    return readReadyWorkspace(root);
  } finally {
    if (removeTemporary) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
}

export async function readResidentialWorkspaceStatus(options) {
  const root = await validateResidentialWorkspaceRoot(
    options.root,
    options
  );
  if (!await safeLstat(root)) {
    return Object.freeze({
      state: 'not_initialized',
      root,
      directories: RESIDENTIAL_WORKSPACE_DIRECTORIES,
      counts: emptyCounts()
    });
  }
  const ready = await readReadyWorkspace(root);
  return Object.freeze({
    ...ready,
    counts: Object.freeze({
      inbox_batches: await countDirectories(path.join(root, 'inbox')),
      quarantined_cases: await countDirectories(path.join(root, 'quarantine')),
      source_profiles: await countJson(path.join(root, 'sources')),
      annotations: await countJson(path.join(root, 'annotations')),
      golden_reviews: await countJson(path.join(root, 'reviews', 'golden')),
      selective_reviews: await countJson(path.join(root, 'reviews', 'selective')),
      snapshots: await countDirectories(path.join(root, 'snapshots')),
      runs: await countDirectories(path.join(root, 'runs')),
      reports: await countJson(path.join(root, 'reports'))
    })
  });
}

async function readReadyWorkspace(root) {
  const entry = await safeLstat(root);
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    failContract('WORKSPACE_CONFLICT', 'workspace.root', root);
  }
  let manifest;
  try {
    const manifestPath = path.join(root, 'workspace.json');
    if ((await fs.lstat(manifestPath)).isSymbolicLink()) {
      failContract('WORKSPACE_CONFLICT', 'workspace.manifest', 'symlink');
    }
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code?.startsWith?.('WORKSPACE_')) throw error;
    failContract(
      'WORKSPACE_CONFLICT',
      'workspace.manifest',
      error?.message || 'unreadable manifest'
    );
  }
  if (JSON.stringify(manifest) !== JSON.stringify(MANIFEST)) {
    failContract(
      'WORKSPACE_CONFLICT',
      'workspace.manifest',
      'manifest mismatch'
    );
  }
  for (const relative of RESIDENTIAL_WORKSPACE_DIRECTORIES) {
    const child = await safeLstat(path.join(root, relative));
    if (!child?.isDirectory() || child.isSymbolicLink()) {
      failContract(
        'WORKSPACE_CONFLICT',
        `workspace.${relative}`,
        'missing or unsafe'
      );
    }
  }
  return Object.freeze({
    state: 'ready',
    root,
    directories: RESIDENTIAL_WORKSPACE_DIRECTORIES
  });
}

async function writeExclusiveJson(filePath, value) {
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function countJson(directory) {
  return countEntries(directory, (entry) => (
    entry.isFile() && entry.name.endsWith('.json')
  ));
}

async function countDirectories(directory) {
  return countEntries(directory, (entry) => entry.isDirectory());
}

async function countEntries(directory, accept) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => !entry.isSymbolicLink() && accept(entry)).length;
}

function emptyCounts() {
  return Object.freeze({
    inbox_batches: 0,
    quarantined_cases: 0,
    source_profiles: 0,
    annotations: 0,
    golden_reviews: 0,
    selective_reviews: 0,
    snapshots: 0,
    runs: 0,
    reports: 0
  });
}
