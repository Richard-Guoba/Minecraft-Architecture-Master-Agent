import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSourceSplit } from '../src/training/sourceSplit.js';

test('64 unique sources split deterministically into 45/10/9', () => {
  const sources = Array.from(
    { length: 64 },
    (_, index) => sourceRecord(index)
  );
  const first = buildSourceSplit({ sources, seed: 7101 });
  const second = buildSourceSplit({
    sources: [...sources].reverse(),
    seed: 7101
  });

  assert.deepEqual(second, first);
  assert.equal(first.train_source_ids.length, 45);
  assert.equal(first.validation_source_ids.length, 10);
  assert.equal(first.test_source_ids.length, 9);
  assert.equal(new Set(Object.keys(first.assignments)).size, sources.length);
  assertNoOverlap(
    first.train_source_ids,
    first.validation_source_ids,
    first.test_source_ids
  );
});

test('exact-byte and yaw-equivalent structural duplicates stay together', () => {
  const sources = Array.from(
    { length: 12 },
    (_, index) => sourceRecord(index)
  );
  sources[1] = sourceRecord(1, {
    contentSha256: sources[0].content_sha256
  });
  sources[3] = sourceRecord(3, {
    structuralSha256: sources[2].structural_fingerprint
      .canonical_structure_sha256
  });

  const split = buildSourceSplit({ sources, seed: 7101 });

  assert.equal(split.assignments[sources[0].source_id], split.assignments[sources[1].source_id]);
  assert.equal(split.assignments[sources[2].source_id], split.assignments[sources[3].source_id]);
  assertNoOverlap(
    split.train_source_ids,
    split.validation_source_ids,
    split.test_source_ids
  );
  for (const assignment of Object.values(split.assignments)) {
    assert.match(assignment, /^(train|validation|test)$/u);
  }
});

test('three duplicate groups guarantee at least one group per split', () => {
  const sources = [
    sourceRecord(0),
    sourceRecord(1, { contentSha256: hashFor(0, 'content') }),
    sourceRecord(2, { contentSha256: hashFor(0, 'content') }),
    sourceRecord(3),
    sourceRecord(4, { contentSha256: hashFor(3, 'content') }),
    sourceRecord(5),
    sourceRecord(6, { contentSha256: hashFor(5, 'content') })
  ];
  const split = buildSourceSplit({ sources, seed: 99 });

  assert.ok(split.train_source_ids.length > 0);
  assert.ok(split.validation_source_ids.length > 0);
  assert.ok(split.test_source_ids.length > 0);
});

test('fewer than three duplicate groups cannot form a safe split', () => {
  const sources = [
    sourceRecord(0),
    sourceRecord(1, { contentSha256: hashFor(0, 'content') }),
    sourceRecord(2),
    sourceRecord(3, { structuralSha256: hashFor(2, 'structure') })
  ];

  assert.throws(
    () => buildSourceSplit({ sources, seed: 7101 }),
    (error) => error.code === 'SPLIT_TOO_SMALL'
  );
});

function sourceRecord(index, {
  contentSha256 = hashFor(index, 'content'),
  structuralSha256 = hashFor(index, 'structure')
} = {}) {
  return {
    source_id: `source-${String(index).padStart(3, '0')}`,
    content_sha256: contentSha256,
    structural_fingerprint: {
      canonical_structure_sha256: structuralSha256
    }
  };
}

function hashFor(index, kind) {
  const value = kind === 'content' ? index : index + 1000;
  return value.toString(16).padStart(64, '0');
}

function assertNoOverlap(train, validation, testIds) {
  const all = [...train, ...validation, ...testIds];
  assert.equal(new Set(all).size, all.length);
}
