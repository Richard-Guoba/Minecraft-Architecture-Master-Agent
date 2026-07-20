import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import {
  compareConditionalFingerprints,
  fingerprintConditionalVolume
} from '../src/construction/learning/stage7ConditionalFingerprint.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('fingerprints are deterministic and contain four 128-value yaw views', () => {
  const prepared = prepare(lineBlocks(20));
  const first = fingerprintConditionalVolume(prepared);
  const second = fingerprintConditionalVolume(prepared);
  assert.deepEqual(second, first);
  assert.equal(first.views.length, 4);
  for (const view of first.views) {
    assert.equal(view.occupancy_minhash.length, 128);
    assert.equal(view.material_minhash.length, 128);
    assert.equal(view.lsh_buckets.length, 64);
  }
  assert.match(first.yaw_canonical_sha256, /^[a-f0-9]{64}$/u);
});

test('raw identity rejects exact bytes while padding differences are structural evidence only', () => {
  const first = prepare(lineBlocks(20, { padding: 0 }));
  const second = prepare(lineBlocks(20, { padding: 4 }));
  const a = fingerprintConditionalVolume(first);
  const b = fingerprintConditionalVolume(second);
  const same = compareConditionalFingerprints(a, a);
  const padded = compareConditionalFingerprints(a, b);
  assert.equal(same.exact_byte_duplicate, true);
  assert.equal(padded.exact_byte_duplicate, false);
  assert.equal(padded.structural_equivalent, true);
  assert.equal(padded.near_duplicate_proposed, true);
});

test('yaw rotation is equivalent without rotating retained prepared evidence', () => {
  const shape = [
    { pos: [0, 0, 0], state: 1 }, { pos: [1, 0, 0], state: 1 },
    { pos: [2, 0, 0], state: 2 }, { pos: [2, 0, 1], state: 2 }
  ];
  const rotated = shape.map((block) => ({ ...block, pos: [1 - block.pos[2], 0, block.pos[0]] }));
  const a = fingerprintConditionalVolume(prepare({ size: [3, 1, 2], blocks: shape }));
  const b = fingerprintConditionalVolume(prepare({ size: [2, 1, 3], blocks: rotated }));
  const comparison = compareConditionalFingerprints(a, b);
  assert.equal(comparison.structural_equivalent, true);
  assert.equal(comparison.near_duplicate_proposed, true);
});

test('a light material variant is proposed and an unrelated volume is not', () => {
  const base = lineBlocks(20);
  const variant = lineBlocks(20);
  variant.blocks[19] = { ...variant.blocks[19], state: 2 };
  const unrelated = {
    size: [20, 20, 1],
    blocks: Array.from({ length: 20 }, (_, y) => ({ pos: [0, y, 0], state: 1 }))
  };
  const near = compareConditionalFingerprints(
    fingerprintConditionalVolume(prepare(base)),
    fingerprintConditionalVolume(prepare(variant))
  );
  const far = compareConditionalFingerprints(
    fingerprintConditionalVolume(prepare(base)),
    fingerprintConditionalVolume(prepare(unrelated))
  );
  assert.ok(near.occupancy_similarity >= 0.85);
  assert.ok(near.material_similarity >= 0.75);
  assert.equal(near.near_duplicate_proposed, true);
  assert.equal(far.near_duplicate_proposed, false);
});

function lineBlocks(length, { padding = 0 } = {}) {
  return {
    size: [length + padding * 2, 1 + padding * 2, 1 + padding * 2],
    blocks: Array.from({ length }, (_, x) => ({ pos: [x + padding, padding, padding], state: 1 }))
  };
}

function prepare({
  size,
  blocks,
  palette = ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks']
}) {
  const bytes = structureNbt({ size, palette, blocks });
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const decoded = decodeBoundedNbt(bytes, { candidateId: ID });
  const volume = validateVanillaStructureNbt(decoded, { candidateId: ID });
  return prepareConditionalVolume({ candidateId: ID, contentSha256, volume });
}
