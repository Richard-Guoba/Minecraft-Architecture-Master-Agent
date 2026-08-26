import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFingerprints,
  fingerprintCategoricalEntries
} from '../src/training/structuralFingerprint.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('fingerprints are deterministic and contain four yaw views', () => {
  const input = lineEntries(20);
  const first = fingerprintCategoricalEntries(input);
  const second = fingerprintCategoricalEntries(input);
  assert.deepEqual(second, first);
  assert.equal(first.views.length, 4);
  assert.equal(first.content_sha256, HASH_A);
  for (const view of first.views) {
    assert.equal(view.occupancy_minhash.length, 128);
    assert.equal(view.material_minhash.length, 128);
    assert.equal(view.lsh_buckets.length, 64);
  }
  for (const key of [
    'synthetic_only',
    'authorizes_acquisition',
    'authorizes_training',
    'authorizes_dataset_admission'
  ]) {
    assert.equal(Object.hasOwn(first, key), false, key);
  }
});

test('fingerprinting supports extents above 64 with unsigned 16-bit coordinates', () => {
  const result = fingerprintCategoricalEntries({
    sourceId: 'oversized-source',
    contentSha256: HASH_A,
    extent: { x: 300, y: 80, z: 96 },
    entries: [
      { x: 0, y: 0, z: 0, token: 2 },
      { x: 299, y: 79, z: 95, token: 3 }
    ]
  });
  assert.deepEqual(result.views[0].extent, { x: 300, y: 80, z: 96 });
  assert.match(result.yaw_canonical_sha256, /^[a-f0-9]{64}$/u);
});

test('raw duplicates, yaw equivalents, and unrelated structures compare correctly', () => {
  const base = fingerprintCategoricalEntries(lineEntries(20));
  const byteDuplicate = fingerprintCategoricalEntries(lineEntries(20));
  const rotated = fingerprintCategoricalEntries({
    sourceId: 'source-rotated',
    contentSha256: HASH_B,
    extent: { x: 1, y: 1, z: 20 },
    entries: Array.from({ length: 20 }, (_, z) => ({ x: 0, y: 0, z, token: 2 }))
  });
  const unrelated = fingerprintCategoricalEntries({
    sourceId: 'source-unrelated',
    contentSha256: HASH_B,
    extent: { x: 20, y: 20, z: 1 },
    entries: Array.from({ length: 20 }, (_, y) => ({ x: 0, y, z: 0, token: 2 }))
  });

  assert.equal(compareFingerprints(base, byteDuplicate).exact_byte_duplicate, true);
  assert.equal(compareFingerprints(base, rotated).structural_equivalent, true);
  assert.equal(compareFingerprints(base, rotated).near_duplicate_proposed, true);
  assert.equal(compareFingerprints(base, unrelated).near_duplicate_proposed, false);
});

function lineEntries(length) {
  return {
    sourceId: 'source-line',
    contentSha256: HASH_A,
    extent: { x: length, y: 1, z: 1 },
    entries: Array.from({ length }, (_, x) => ({ x, y: 0, z: 0, token: 2 }))
  };
}
