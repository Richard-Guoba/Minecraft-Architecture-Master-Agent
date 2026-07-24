import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace,
  readResidentialWorkspaceStatus,
  RESIDENTIAL_WORKSPACE_DIRECTORIES,
  validateResidentialWorkspaceRoot
} from '../src/training/residential/workspace/index.js';

async function projectFixture(t) {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-workspace-')
  );
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  return {
    projectRoot,
    root: path.join(projectRoot, '.local', 'residential-model')
  };
}

test('workspace initialization is atomic, deterministic, and idempotent', async (t) => {
  const fixture = await projectFixture(t);
  const first = await initializeResidentialWorkspace(fixture);
  const manifestPath = path.join(fixture.root, 'workspace.json');
  const firstBytes = await fs.readFile(manifestPath);
  const second = await initializeResidentialWorkspace(fixture);
  const secondBytes = await fs.readFile(manifestPath);

  assert.equal(first.state, 'ready');
  assert.deepEqual(second, first);
  assert.deepEqual(secondBytes, firstBytes);
  assert.deepEqual(first.directories, RESIDENTIAL_WORKSPACE_DIRECTORIES);
  for (const relative of RESIDENTIAL_WORKSPACE_DIRECTORIES) {
    assert.equal(
      (await fs.lstat(path.join(fixture.root, relative))).isDirectory(),
      true,
      relative
    );
  }
});

test('workspace status is read-only and reports local inventory counts', async (t) => {
  const fixture = await projectFixture(t);
  assert.equal(
    (await readResidentialWorkspaceStatus(fixture)).state,
    'not_initialized'
  );
  await initializeResidentialWorkspace(fixture);
  await fs.writeFile(
    path.join(fixture.root, 'sources', 'one.json'),
    '{}\n'
  );
  await fs.writeFile(
    path.join(fixture.root, 'annotations', 'one.json'),
    '{}\n'
  );
  await fs.writeFile(
    path.join(fixture.root, 'reviews', 'golden', 'one.json'),
    '{}\n'
  );
  const status = await readResidentialWorkspaceStatus(fixture);
  assert.deepEqual(status.counts, {
    inbox_batches: 0,
    quarantined_cases: 0,
    source_profiles: 1,
    annotations: 1,
    golden_reviews: 1,
    selective_reviews: 0,
    snapshots: 0,
    runs: 0,
    reports: 0
  });
});

test('workspace root rejects outside paths, symlinks, and conflicting files', async (t) => {
  const fixture = await projectFixture(t);
  await assert.rejects(
    validateResidentialWorkspaceRoot(
      path.join(fixture.projectRoot, '.local', 'other'),
      fixture
    ),
    /WORKSPACE_ROOT_OUTSIDE_RESIDENTIAL/u
  );

  const symlinkTarget = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-symlink-target-')
  );
  t.after(() => fs.rm(symlinkTarget, { recursive: true, force: true }));
  await fs.symlink(
    symlinkTarget,
    path.join(fixture.projectRoot, '.local', 'residential-model')
  );
  await assert.rejects(
    initializeResidentialWorkspace(fixture),
    /WORKSPACE_ROOT_SYMLINK/u
  );

  const linkParent = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-project-link-')
  );
  t.after(() => fs.rm(linkParent, { recursive: true, force: true }));
  const linkedTarget = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-project-target-')
  );
  t.after(() => fs.rm(linkedTarget, { recursive: true, force: true }));
  await fs.mkdir(path.join(linkedTarget, '.local'));
  const linkedProject = path.join(linkParent, 'project');
  await fs.symlink(linkedTarget, linkedProject);
  await assert.rejects(
    validateResidentialWorkspaceRoot(
      path.join(linkedProject, '.local', 'residential-model'),
      { projectRoot: linkedProject }
    ),
    /WORKSPACE_ROOT_SYMLINK/u
  );
});

test('workspace init never repairs an incomplete existing root', async (t) => {
  const fixture = await projectFixture(t);
  await fs.mkdir(fixture.root);
  await fs.writeFile(path.join(fixture.root, 'sentinel.txt'), 'keep');
  await assert.rejects(
    initializeResidentialWorkspace(fixture),
    /WORKSPACE_CONFLICT/u
  );
  assert.equal(
    await fs.readFile(path.join(fixture.root, 'sentinel.txt'), 'utf8'),
    'keep'
  );
  assert.deepEqual(await fs.readdir(fixture.root), ['sentinel.txt']);
});
