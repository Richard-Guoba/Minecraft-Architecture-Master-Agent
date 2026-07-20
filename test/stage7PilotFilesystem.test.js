import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  PILOT_MANAGED_DIRECTORIES,
  PilotFilesystemError,
  appendPilotJsonlIdempotent,
  ensurePilotLayout,
  readPilotJson,
  readPilotJsonl,
  writePilotBytesIdempotent,
  writePilotJsonIdempotent
} from '../src/construction/learning/stage7PilotFilesystem.js';

function hasCode(code) {
  return (error) => error instanceof PilotFilesystemError && error.code === code;
}

async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-pilot-filesystem-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = { assertRoot: async () => root };
  await ensurePilotLayout(root, deps);
  return { root, deps };
}

test('managed layout and canonical JSON are exact and idempotent', async (t) => {
  const { root, deps } = await context(t);
  for (const relative of PILOT_MANAGED_DIRECTORIES) {
    assert.equal((await readdir(join(root, relative))).length, 0);
  }
  const value = { z: 1, a: { y: 2, x: 3 } };
  await writePilotJsonIdempotent(root, 'manifests/named-batch.json', value, deps);
  await writePilotJsonIdempotent(root, 'manifests/named-batch.json', value, deps);
  assert.equal(await readFile(join(root, 'manifests', 'named-batch.json'), 'utf8'),
    '{"a":{"x":3,"y":2},"z":1}\n');
  assert.deepEqual(await readPilotJson(root, 'manifests/named-batch.json', deps), value);
  await assert.rejects(
    writePilotJsonIdempotent(root, 'manifests/named-batch.json', { a: 2 }, deps),
    hasCode('PILOT_FILE_CONFLICT')
  );
});

test('content-addressed bytes refuse hash mismatch and conflicting content', async (t) => {
  const { root, deps } = await context(t);
  const bytes = Buffer.from('pilot-bytes');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const relative = `quarantine/source-a:house-01/${sha}.nbt`;
  await writePilotBytesIdempotent(root, relative, bytes, sha, deps);
  await writePilotBytesIdempotent(root, relative, bytes, sha, deps);
  assert.deepEqual(await readFile(join(root, ...relative.split('/'))), bytes);
  await assert.rejects(
    writePilotBytesIdempotent(root, relative, Buffer.from('changed'),
      createHash('sha256').update('changed').digest('hex'), deps),
    hasCode('PILOT_FILE_CONFLICT')
  );
  await assert.rejects(
    writePilotBytesIdempotent(root, 'quarantine/source-a:house-01/bad.nbt', bytes,
      '0'.repeat(64), deps),
    hasCode('PILOT_HASH_MISMATCH')
  );
});

test('JSONL append is canonical, sorted, and identity-idempotent', async (t) => {
  const { root, deps } = await context(t);
  const identityOf = (record) => record.id;
  const options = { ...deps, identityOf };
  await appendPilotJsonlIdempotent(root, 'manifests/test.jsonl',
    { id: 'b', value: 2 }, 'b', options);
  await appendPilotJsonlIdempotent(root, 'manifests/test.jsonl',
    { id: 'a', value: 1 }, 'a', options);
  await appendPilotJsonlIdempotent(root, 'manifests/test.jsonl',
    { id: 'a', value: 1 }, 'a', options);
  assert.deepEqual(await readPilotJsonl(root, 'manifests/test.jsonl', deps), [
    { id: 'a', value: 1 },
    { id: 'b', value: 2 }
  ]);
  assert.equal(await readFile(join(root, 'manifests', 'test.jsonl'), 'utf8'),
    '{"id":"a","value":1}\n{"id":"b","value":2}\n');
  await assert.rejects(
    appendPilotJsonlIdempotent(root, 'manifests/test.jsonl',
      { id: 'a', value: 9 }, 'a', options),
    hasCode('PILOT_LEDGER_CONFLICT')
  );
});

test('path escapes, symlink parents, and noncanonical ledgers fail closed', async (t) => {
  const { root, deps } = await context(t);
  await assert.rejects(
    writePilotJsonIdempotent(root, '../escape.json', { safe: false }, deps),
    hasCode('PILOT_PATH_INVALID')
  );
  await rm(join(root, 'prepared'), { recursive: true });
  await symlink(join(root, 'manifests'), join(root, 'prepared'));
  await assert.rejects(
    writePilotJsonIdempotent(root, 'prepared/source-a:house-01/value.json', { safe: false }, deps),
    hasCode('PILOT_PATH_SYMLINK')
  );
  await writeFile(join(root, 'manifests', 'bad.jsonl'), '{"z":1,"a":2}\n', 'utf8');
  await assert.rejects(
    readPilotJsonl(root, 'manifests/bad.jsonl', deps),
    hasCode('PILOT_JSONL_NONCANONICAL')
  );
});

test('final symlinks and non-regular targets fail closed', async (t) => {
  const { root, deps } = await context(t);
  await writeFile(join(root, 'manifests', 'real.json'), '{}\n', 'utf8');
  await symlink(join(root, 'manifests', 'real.json'), join(root, 'manifests', 'link.json'));
  await assert.rejects(
    readPilotJson(root, 'manifests/link.json', deps),
    hasCode('PILOT_PATH_SYMLINK')
  );
  await mkdir(join(root, 'manifests', 'directory.json'));
  await assert.rejects(
    readPilotJson(root, 'manifests/directory.json', deps),
    hasCode('PILOT_NOT_REGULAR')
  );
});

test('temporary conflicts and rename failures clean only the owned temporary file', async (t) => {
  const { root, deps } = await context(t);
  const target = join(root, 'manifests', 'failure.json');
  const temporary = join(root, 'manifests', `.failure.json.tmp-${process.pid}`);
  await writeFile(temporary, 'occupied', 'utf8');
  await assert.rejects(
    writePilotJsonIdempotent(root, 'manifests/failure.json', { value: 1 }, deps),
    hasCode('PILOT_TEMP_EXISTS')
  );
  assert.equal(await readFile(temporary, 'utf8'), 'occupied');
  await rm(temporary);
  await assert.rejects(
    writePilotJsonIdempotent(root, 'manifests/failure.json', { value: 1 }, {
      ...deps,
      rename: async () => { throw Object.assign(new Error('rename failed'), { code: 'EIO' }); }
    }),
    (error) => error.code === 'EIO'
  );
  assert.equal((await readdir(join(root, 'manifests'))).some(
    (name) => name.startsWith(`.${basename(target)}.tmp-`)
  ), false);
});
