import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertPrivatePlaybookStorage,
  resolvePrivatePlaybookPath
} from '../src/playbook/storage/privatePlaybookPath.js';

test('private playbook storage creates contained episode directories', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-private-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  const target = resolvePrivatePlaybookPath(
    '.local/architecture-playbook/sources/BV1fNkgYBEyy/source-360p.mp4',
    { projectRoot }
  );
  await assertPrivatePlaybookStorage(target, {
    projectRoot,
    createParent: true
  });

  assert.equal(
    target,
    path.join(
      projectRoot,
      '.local/architecture-playbook/sources/BV1fNkgYBEyy/source-360p.mp4'
    )
  );
  const parent = await fs.realpath(path.dirname(target));
  assert.ok(parent.startsWith(await fs.realpath(projectRoot)));
});

test('private playbook storage rejects lexical and symlink escapes', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-private-'));
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-outside-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(outsideRoot, { recursive: true, force: true }));

  assert.throws(
    () => resolvePrivatePlaybookPath('../outside.mp4', { projectRoot }),
    /PLAYBOOK_PRIVATE_PATH_INVALID/u
  );

  const privateRoot = path.join(projectRoot, '.local/architecture-playbook');
  await fs.mkdir(privateRoot, { recursive: true });
  await fs.symlink(outsideRoot, path.join(privateRoot, 'sources'), 'dir');
  const escaped = resolvePrivatePlaybookPath(
    '.local/architecture-playbook/sources/BV1fNkgYBEyy/source-360p.mp4',
    { projectRoot }
  );

  await assert.rejects(
    assertPrivatePlaybookStorage(escaped, {
      projectRoot,
      createParent: true
    }),
    /PLAYBOOK_PRIVATE_PATH_ESCAPE/u
  );
  await assert.rejects(fs.access(path.join(outsideRoot, 'BV1fNkgYBEyy')));
});
