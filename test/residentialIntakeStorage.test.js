import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  caseIdFromSha256,
  quarantineArtifact,
  readCandidateBytes,
  writeJsonOnceOrVerify
} from '../src/training/residential/intake/index.js';

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-storage-'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  t.after(() => removeFixture(projectRoot));
  await fs.mkdir(path.join(projectRoot, '.local'));
  await initializeResidentialWorkspace({ root, projectRoot });
  return { projectRoot, root };
}

async function removeFixture(root) {
  const entry = await fs.lstat(root).catch(() => null);
  if (entry?.isDirectory() && !entry.isSymbolicLink()) {
    await fs.chmod(root, 0o700);
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries.map((item) => removeFixture(path.join(root, item.name))));
  }
  await fs.rm(root, { recursive: true, force: true });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('quarantine creates one immutable content identity and verifies reruns', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('immutable fixture');
  const exactSha256 = sha256(bytes);
  const first = await quarantineArtifact({ root, projectRoot, bytes, sha256: exactSha256 });
  const second = await quarantineArtifact({ root, projectRoot, bytes, sha256: exactSha256 });
  assert.equal(first.case_id, caseIdFromSha256(exactSha256));
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(
    await fs.readFile(path.join(first.directory, 'payload')),
    bytes
  );
  assert.equal((await fs.stat(path.join(first.directory, 'payload'))).mode & 0o777, 0o400);
  assert.equal((await fs.stat(path.join(first.directory, 'identity.json'))).mode & 0o777, 0o400);
});

test('quarantine rejects an existing conflicting identity', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('expected');
  const exactSha256 = sha256(bytes);
  const caseId = caseIdFromSha256(exactSha256);
  await fs.mkdir(path.join(root, 'quarantine', caseId));
  await fs.writeFile(
    path.join(root, 'quarantine', caseId, 'payload'),
    'conflict'
  );
  await assert.rejects(
    quarantineArtifact({ root, projectRoot, bytes, sha256: exactSha256 }),
    /QUARANTINE_CONFLICT/u
  );
});

test('quarantine validates the supplied exact hash before publication', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('expected');
  const incorrect = sha256(Buffer.from('different'));
  await assert.rejects(
    quarantineArtifact({ root, projectRoot, bytes, sha256: incorrect }),
    /SOURCE_HASH_MISMATCH/u
  );
  assert.deepEqual(await fs.readdir(path.join(root, 'quarantine')), []);
});

test('quarantine requires an explicit project root for an external workspace', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('inferred workspace root');
  await assert.rejects(
    quarantineArtifact({ root, bytes, sha256: sha256(bytes) }),
    /WORKSPACE_ROOT_OUTSIDE_RESIDENTIAL/u
  );
  const result = await quarantineArtifact({
    root,
    projectRoot,
    bytes,
    sha256: sha256(bytes)
  });
  assert.equal(result.created, true);
});

test('quarantine rejects a symlinked existing artifact directory', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('expected');
  const exactSha256 = sha256(bytes);
  const caseId = caseIdFromSha256(exactSha256);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-storage-outside-'));
  t.after(() => removeFixture(outside));
  await fs.symlink(outside, path.join(root, 'quarantine', caseId));
  await assert.rejects(
    quarantineArtifact({ root, projectRoot, bytes, sha256: exactSha256 }),
    /QUARANTINE_CONFLICT/u
  );
});

test('concurrent quarantine publication leaves one verified identity', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('same concurrent payload');
  const exactSha256 = sha256(bytes);
  const results = await Promise.all(
    Array.from({ length: 8 }, () => quarantineArtifact({
      root,
      projectRoot,
      bytes,
      sha256: exactSha256
    }))
  );
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(
    await fs.readFile(path.join(results[0].directory, 'payload'), 'utf8'),
    'same concurrent payload'
  );
});

test('quarantine leaves an existing abandoned temporary sibling untouched', async (t) => {
  const { root, projectRoot } = await fixture(t);
  const bytes = Buffer.from('preserve temporary sibling');
  const caseId = caseIdFromSha256(sha256(bytes));
  const abandoned = path.join(root, 'quarantine', `.${caseId}.tmp-abandoned`);
  await fs.mkdir(abandoned, { mode: 0o500 });
  await quarantineArtifact({ root, projectRoot, bytes, sha256: sha256(bytes) });
  assert.equal((await fs.lstat(abandoned)).isDirectory(), true);
});

test('candidate reads reject symlinks and raw-byte overflow', async (t) => {
  const { root } = await fixture(t);
  const source = path.join(root, 'source.schem');
  const link = path.join(root, 'link.schem');
  await fs.writeFile(source, '1234');
  await fs.symlink(source, link);
  await assert.rejects(readCandidateBytes(link), /SOURCE_FILE_SYMLINK/u);
  await assert.rejects(
    readCandidateBytes(source, { maxBytes: 3 }),
    /RAW_BYTES_LIMIT/u
  );
});

test('candidate reads reject empty and non-regular files', async (t) => {
  const { root } = await fixture(t);
  const empty = path.join(root, 'empty.schem');
  const directory = path.join(root, 'directory.schem');
  await fs.writeFile(empty, '');
  await fs.mkdir(directory);
  await assert.rejects(readCandidateBytes(empty), /SOURCE_FILE_EMPTY/u);
  await assert.rejects(readCandidateBytes(directory), /SOURCE_FILE_NOT_REGULAR/u);
});

test('case IDs require a lowercase exact SHA-256 value', () => {
  assert.throws(() => caseIdFromSha256('A'.repeat(64)), /SOURCE_HASH_INVALID/u);
  assert.throws(() => caseIdFromSha256('a'.repeat(63)), /SOURCE_HASH_INVALID/u);
});

test('write-once JSON accepts identical canonical content and rejects changes', async (t) => {
  const { root } = await fixture(t);
  const file = path.join(root, 'report.json');
  assert.equal(await writeJsonOnceOrVerify(file, { b: 2, a: 1 }), 'created');
  assert.equal(await writeJsonOnceOrVerify(file, { a: 1, b: 2 }), 'verified');
  await assert.rejects(
    writeJsonOnceOrVerify(file, { a: 1, b: 3 }),
    /IMMUTABLE_JSON_CONFLICT/u
  );
});

test('write-once JSON rejects symlink and malformed existing content', async (t) => {
  const { root } = await fixture(t);
  const target = path.join(root, 'target.json');
  const symlink = path.join(root, 'link.json');
  const malformed = path.join(root, 'malformed.json');
  await fs.writeFile(target, '{"a": 1}\n');
  await fs.symlink(target, symlink);
  await fs.writeFile(malformed, '{not-json');
  await assert.rejects(
    writeJsonOnceOrVerify(symlink, { a: 1 }),
    /IMMUTABLE_JSON_CONFLICT/u
  );
  await assert.rejects(
    writeJsonOnceOrVerify(malformed, { a: 1 }),
    /IMMUTABLE_JSON_CONFLICT/u
  );
});

test('quarantine rejects a non-workspace temporary directory even with quarantine', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-storage-unready-'));
  t.after(() => removeFixture(root));
  await fs.mkdir(path.join(root, 'quarantine'));
  const bytes = Buffer.from('unready root');
  await assert.rejects(
    quarantineArtifact({ root, bytes, sha256: sha256(bytes) }),
    /WORKSPACE_ROOT_OUTSIDE_RESIDENTIAL/u
  );
});
