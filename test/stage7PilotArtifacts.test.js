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
import { join } from 'node:path';
import test from 'node:test';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import { fingerprintConditionalVolume } from '../src/construction/learning/stage7ConditionalFingerprint.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import {
  PilotArtifactError,
  appendPilotFingerprint,
  persistPilotPrepared,
  readPilotFingerprints,
  readPilotPreparedIndex
} from '../src/construction/learning/stage7PilotArtifacts.js';
import {
  ensurePilotLayout,
  readPilotJson,
  writePilotJsonIdempotent
} from '../src/construction/learning/stage7PilotFilesystem.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'source-a:house-01';

function hasCode(code) {
  return (error) => (error instanceof PilotArtifactError || error instanceof CandidateReadinessError)
    && error.code === code;
}

async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-pilot-artifacts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = { assertRoot: async () => root };
  await ensurePilotLayout(root, deps);
  return { root, deps };
}

function preparedFixture({ candidateId = ID, bytes = structureNbt() } = {}) {
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const decoded = decodeBoundedNbt(bytes, { candidateId });
  const volume = validateVanillaStructureNbt(decoded, { candidateId });
  return prepareConditionalVolume({
    candidateId,
    contentSha256,
    volume,
    evidenceMode: 'operational'
  });
}

test('persists exact operational prepared artifacts and repairs only a missing index', async (t) => {
  const { root, deps } = await context(t);
  const prepared = preparedFixture();
  const sha = prepared.record.preparation_sha256;
  const result = await persistPilotPrepared(root, prepared, deps);
  await persistPilotPrepared(root, prepared, deps);
  assert.deepEqual(result, prepared.record);
  assert.deepEqual((await readdir(join(root, 'prepared', ID))).sort(), [
    `${sha}.json`, `${sha}.voxels.bin`
  ]);
  assert.equal((await readFile(join(root, 'prepared', ID, `${sha}.voxels.bin`))).length, 64 ** 3);
  assert.deepEqual(await readPilotJson(root, `prepared/${ID}/${sha}.json`, deps), prepared.record);
  assert.deepEqual(await readPilotPreparedIndex(root, deps), [prepared.record]);
  await rm(join(root, 'manifests', 'prepared-cases.jsonl'));
  assert.deepEqual(await persistPilotPrepared(root, prepared, deps), prepared.record);
  assert.deepEqual(await readPilotPreparedIndex(root, deps), [prepared.record]);
  assert.equal(prepared.record.synthetic_only, false);
  assert.equal(prepared.record.authorizes_training, false);
  assert.equal(prepared.record.authorizes_dataset_admission, false);
});

test('prepared persistence refuses synthetic, hash drift, orphan, link, and temporary state', async (t) => {
  let current = await context(t);
  const operational = preparedFixture();
  const synthetic = prepareConditionalVolume({
    candidateId: ID,
    contentSha256: operational.record.content_sha256,
    volume: validateVanillaStructureNbt(
      decodeBoundedNbt(structureNbt(), { candidateId: ID }), { candidateId: ID }
    )
  });
  await assert.rejects(persistPilotPrepared(current.root, synthetic, current.deps),
    hasCode('OPERATIONAL_PREPARED_REQUIRED'));
  const changedVoxels = Buffer.from(operational.voxels);
  changedVoxels[0] = 1;
  await assert.rejects(persistPilotPrepared(current.root, {
    voxels: changedVoxels,
    record: operational.record
  }, current.deps), hasCode('PREPARED_VOXEL_HASH_INVALID'));

  current = await context(t);
  const sha = operational.record.preparation_sha256;
  await mkdir(join(current.root, 'prepared', ID));
  await writeFile(join(current.root, 'prepared', ID, `${sha}.voxels.bin`), operational.voxels);
  await assert.rejects(persistPilotPrepared(current.root, operational, current.deps),
    hasCode('PREPARED_ARTIFACT_ORPHAN'));

  current = await context(t);
  await writePilotJsonIdempotent(
    current.root, `prepared/${ID}/${sha}.json`, operational.record, current.deps
  );
  await assert.rejects(persistPilotPrepared(current.root, operational, current.deps),
    hasCode('PREPARED_ARTIFACT_ORPHAN'));

  current = await context(t);
  await persistPilotPrepared(current.root, operational, current.deps);
  await writeFile(
    join(current.root, 'prepared', ID, `${sha}.voxels.bin`), Buffer.alloc(64 ** 3)
  );
  await assert.rejects(persistPilotPrepared(current.root, operational, current.deps),
    hasCode('PILOT_FILE_CONFLICT'));

  current = await context(t);
  await symlink(join(current.root, 'manifests'), join(current.root, 'prepared', ID));
  await assert.rejects(persistPilotPrepared(current.root, operational, current.deps),
    hasCode('PILOT_PATH_SYMLINK'));

  current = await context(t);
  await mkdir(join(current.root, 'prepared', ID));
  await writeFile(join(current.root, 'prepared', ID,
    `.${sha}.voxels.bin.tmp-${process.pid}`), 'occupied');
  await assert.rejects(persistPilotPrepared(current.root, operational, current.deps),
    hasCode('PREPARED_INVENTORY_INVALID'));
});

test('fingerprint ledger validates exact operational four-yaw evidence and is idempotent', async (t) => {
  const { root, deps } = await context(t);
  const prepared = preparedFixture();
  await persistPilotPrepared(root, prepared, deps);
  const fingerprint = fingerprintConditionalVolume(prepared);
  await appendPilotFingerprint(root, fingerprint, deps);
  await appendPilotFingerprint(root, fingerprint, deps);
  assert.deepEqual(await readPilotFingerprints(root, deps), [fingerprint]);
  assert.equal(fingerprint.views.length, 4);
  for (const view of fingerprint.views) {
    assert.equal(view.occupancy_minhash.length, 128);
    assert.equal(view.material_minhash.length, 128);
  }
  await assert.rejects(appendPilotFingerprint(root, {
    ...fingerprint,
    yaw_canonical_sha256: '0'.repeat(64)
  }, deps), hasCode('FINGERPRINT_BINDING_INVALID'));
  await assert.rejects(appendPilotFingerprint(root, {
    ...fingerprint,
    synthetic_only: true
  }, deps), hasCode('OPERATIONAL_FINGERPRINT_REQUIRED'));
});

test('fingerprints refuse missing prepared bindings and noncanonical ledgers', async (t) => {
  let current = await context(t);
  const fingerprint = fingerprintConditionalVolume(preparedFixture());
  await assert.rejects(appendPilotFingerprint(current.root, fingerprint, current.deps),
    hasCode('FINGERPRINT_PREPARED_BINDING_MISSING'));

  current = await context(t);
  await writeFile(
    join(current.root, 'fingerprints', 'structural-fingerprints.jsonl'),
    '{"z":1,"a":2}\n',
    'utf8'
  );
  await assert.rejects(readPilotFingerprints(current.root, current.deps),
    hasCode('PILOT_JSONL_NONCANONICAL'));
});
