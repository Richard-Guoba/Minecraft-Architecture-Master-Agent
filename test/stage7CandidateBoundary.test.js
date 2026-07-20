import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  readQuarantinedNbt
} from '../src/construction/learning/stage7CandidateBoundary.js';

const CANDIDATE_ID = 'synthetic-source:house-01';

test('quarantine reader returns the exact hash-bound synthetic bytes', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const result = await readQuarantinedNbt(fixture.input, fixture.dependencies);
  assert.equal(result.candidate_id, CANDIDATE_ID);
  assert.equal(result.basename, `${fixture.sha256}.nbt`);
  assert.equal(result.content_sha256, fixture.sha256);
  assert.equal(result.raw_byte_count, fixture.bytes.length);
  assert.deepEqual(result.bytes, fixture.bytes);
  assert.deepEqual(CANDIDATE_NBT_LIMITS, {
    maxRawBytes: 16 * 1024 * 1024,
    maxInflatedBytes: 64 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxDepth: 32,
    maxEntries: 1_500_000,
    maxStringBytes: 32 * 1024,
    maxBlocks: 64 ** 3,
    maxPaletteEntries: 4096,
    maxBlockEntities: 16_384
  });
});

test('quarantine reader rejects path escape, wrong candidate directory, and non-hash names', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  for (const relativePath of [
    '../escape.nbt',
    `quarantine/other:house-01/${fixture.sha256}.nbt`,
    `quarantine/${CANDIDATE_ID}/payload.nbt`,
    `quarantine/${CANDIDATE_ID}/${fixture.sha256}.NBT`
  ]) {
    await assert.rejects(
      readQuarantinedNbt({ ...fixture.input, relativePath }, fixture.dependencies),
      isCandidateError
    );
  }
});

test('quarantine reader rejects a final symlink and an oversized regular file', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const outside = join(fixture.repositoryRoot, 'outside.nbt');
  await writeFile(outside, fixture.bytes);
  await rm(fixture.absolute);
  await symlink(outside, fixture.absolute);
  await assert.rejects(
    readQuarantinedNbt(fixture.input, fixture.dependencies),
    hasCode('QUARANTINE_PATH_SYMLINK')
  );

  await rm(fixture.absolute);
  await writeFile(fixture.absolute, Buffer.alloc(9));
  await assert.rejects(
    readQuarantinedNbt({
      ...fixture.input,
      limits: { ...CANDIDATE_NBT_LIMITS, maxRawBytes: 8 }
    }, fixture.dependencies),
    hasCode('RAW_BYTES_LIMIT')
  );
});

test('quarantine reader rejects a symlink parent and a non-regular final entry', async (t) => {
  const linked = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const candidateDirectory = join(linked.root, 'quarantine', CANDIDATE_ID);
  const outsideDirectory = join(linked.repositoryRoot, 'outside-directory');
  await mkdir(outsideDirectory);
  await writeFile(join(outsideDirectory, `${linked.sha256}.nbt`), linked.bytes);
  await rm(candidateDirectory, { recursive: true });
  await symlink(outsideDirectory, candidateDirectory, 'dir');
  await assert.rejects(
    readQuarantinedNbt(linked.input, linked.dependencies),
    hasCode('QUARANTINE_PATH_SYMLINK')
  );

  const directory = await candidateFile(t, Buffer.from([10, 0, 0, 1]));
  await rm(directory.absolute);
  await mkdir(directory.absolute);
  await assert.rejects(
    readQuarantinedNbt(directory.input, directory.dependencies),
    hasCode('QUARANTINE_NOT_REGULAR')
  );
});

test('quarantine reader rejects a content-addressed filename whose bytes changed', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  await writeFile(fixture.absolute, Buffer.from([10, 0, 0, 0, 0]));
  await assert.rejects(
    readQuarantinedNbt(fixture.input, fixture.dependencies),
    hasCode('CONTENT_HASH_NAME_MISMATCH')
  );
});

test('quarantine reader rejects descriptor identity drift', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const realOpen = fixture.dependencies.openFile;
  fixture.dependencies.openFile = async (...args) => {
    const handle = await realOpen(...args);
    let calls = 0;
    return {
      async stat() {
        const stat = await handle.stat();
        calls += 1;
        return calls === 1 ? stat : Object.assign(Object.create(stat), stat, { ino: stat.ino + 1 });
      },
      readFile: (...readArgs) => handle.readFile(...readArgs),
      close: () => handle.close()
    };
  };
  await assert.rejects(
    readQuarantinedNbt(fixture.input, fixture.dependencies),
    hasCode('FILE_IDENTITY_CHANGED')
  );
});

test('candidate errors expose only a typed safe-detail object', () => {
  const error = new CandidateReadinessError(
    'SAMPLE', 'boundary', CANDIDATE_ID, { basename: 'sample.nbt', byte_count: 4 }
  );
  assert.equal(error.message, `SAMPLE:boundary:${CANDIDATE_ID}`);
  assert.deepEqual(error.safe_detail, { basename: 'sample.nbt', byte_count: 4 });
  assert.equal(Object.isFrozen(error.safe_detail), true);
});

async function candidateFile(t, bytes) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-candidate-boundary-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const root = join(repositoryRoot, '.local', 'stage7-source-expansion');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const relativePath = `quarantine/${CANDIDATE_ID}/${sha256}.nbt`;
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(join(root, 'quarantine', CANDIDATE_ID), { recursive: true });
  await writeFile(absolute, bytes);
  return {
    repositoryRoot, root, sha256, relativePath, absolute, bytes,
    input: { root, candidateId: CANDIDATE_ID, relativePath },
    dependencies: {
      assertRoot: async (value) => value,
      openFile: open
    }
  };
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}

function isCandidateError(error) {
  return error instanceof CandidateReadinessError;
}
