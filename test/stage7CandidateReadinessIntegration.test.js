import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readQuarantinedNbt } from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import { fingerprintConditionalVolume } from '../src/construction/learning/stage7ConditionalFingerprint.js';
import { createSyntheticReadinessEvent } from '../src/construction/learning/stage7CandidateReadinessState.js';
import {
  appendSyntheticReadinessEvent,
  readSyntheticReadinessLedger
} from '../src/construction/learning/stage7CandidateReadinessStore.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('two synthetic quarantine-to-audit runs are hash-identical and root-contained', async (t) => {
  const first = await runPipeline(t);
  const second = await runPipeline(t);
  assert.deepEqual(second.binding, first.binding);
  assert.deepEqual(second.ledger, first.ledger);
  for (const result of [first, second]) {
    assert.deepEqual((await readdir(result.root)).sort(), ['manifests', 'quarantine']);
    assert.deepEqual(await readdir(join(result.root, 'manifests')), ['acquisition-events.jsonl']);
    assert.equal((await readdir(join(result.root, 'quarantine', ID))).length, 1);
  }
});

async function runPipeline(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-candidate-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'quarantine', ID), { recursive: true });
  await mkdir(join(root, 'manifests'));
  const bytes = structureNbt({
    compression: 'gzip',
    size: [5, 3, 5],
    palette: [
      'minecraft:air', 'minecraft:stone_bricks',
      'minecraft:oak_planks', 'minecraft:glass'
    ],
    blocks: [
      { pos: [0, 0, 0], state: 1 }, { pos: [4, 0, 0], state: 1 },
      { pos: [0, 0, 4], state: 2 }, { pos: [4, 0, 4], state: 2 },
      { pos: [2, 2, 2], state: 3 }
    ]
  });
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const relativePath = `quarantine/${ID}/${contentSha256}.nbt`;
  await writeFile(join(root, ...relativePath.split('/')), bytes);
  const quarantined = await readQuarantinedNbt({ root, candidateId: ID, relativePath }, {
    assertRoot: async (value) => value
  });
  const decoded = decodeBoundedNbt(quarantined.bytes, { candidateId: ID });
  const volume = validateVanillaStructureNbt(decoded, { candidateId: ID });
  const prepared = prepareConditionalVolume({ candidateId: ID, contentSha256, volume });
  const fingerprint = fingerprintConditionalVolume(prepared);
  const states = [
    ['admission_contract_ready', 'named_batch_approved', { metadata_sha256: '1'.repeat(64) }],
    ['named_batch_approved', 'acquired_quarantine', { content_sha256: contentSha256 }],
    ['acquired_quarantine', 'bytes_verified', { content_sha256: contentSha256 }],
    ['bytes_verified', 'format_validated', { content_sha256: contentSha256 }],
    ['format_validated', 'structure_validated', { content_sha256: contentSha256 }],
    ['structure_validated', 'completeness_validated', { fixture_sha256: '2'.repeat(64) }],
    ['completeness_validated', 'prepared', { preparation_sha256: prepared.record.preparation_sha256 }],
    ['prepared', 'fingerprinted', { structural_sha256: fingerprint.yaw_canonical_sha256 }],
    ['fingerprinted', 'duplicate_clustered', { structural_sha256: fingerprint.yaw_canonical_sha256 }],
    ['duplicate_clustered', 'pilot_ready', { preparation_sha256: prepared.record.preparation_sha256 }]
  ];
  let previous = null;
  for (const [index, [before, after, evidenceHashes]] of states.entries()) {
    const event = createSyntheticReadinessEvent({
      candidateId: ID,
      revision: index + 1,
      eventType: after,
      stateBefore: before,
      stateAfter: after,
      recordedAt: `2026-07-20T01:00:${String(index + 1).padStart(2, '0')}.000Z`,
      recordedBy: 'synthetic-integration',
      reasonCodes: [],
      evidenceHashes,
      previousEventSha256: previous
    });
    await appendSyntheticReadinessEvent(root, event);
    previous = event.event_sha256;
  }
  const ledger = await readSyntheticReadinessLedger(root);
  return {
    root,
    ledger,
    binding: {
      content_sha256: contentSha256,
      voxel_sha256: prepared.record.voxel_sha256,
      preparation_sha256: prepared.record.preparation_sha256,
      structural_sha256: fingerprint.yaw_canonical_sha256,
      latest_event_sha256: ledger.at(-1).event_sha256
    }
  };
}
