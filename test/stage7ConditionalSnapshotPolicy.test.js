import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateSnapshotPolicy,
  validateLockedSplit,
  validatePolicyCase
} from '../src/construction/learning/stage7ConditionalSnapshotPolicy.js';
import {
  policyCaseFixture,
  splitAssignmentFixture
} from './fixtures/stage7ConditionalAdmissionFixtures.js';

const FUNCTIONS = [
  ['residential', 15], ['religious_public', 15],
  ['defensive_military', 15], ['production_agriculture', 10],
  ['transport_infrastructure', 10], ['exploration_challenge', 15],
  ['monument_ruin', 10], ['fantastical_special', 10]
];

function hundredCases() {
  const styles = ['medieval', 'rustic', 'fantasy', 'classical_ancient', 'regional_biome'];
  const scales = [...Array(30).fill('compact'), ...Array(45).fill('standard'), ...Array(25).fill('large')];
  const cases = [];
  let index = 0;
  for (const [primaryFunction, count] of FUNCTIONS) {
    for (let offset = 0; offset < count; offset += 1) {
      const source = `source-${String(index % 5 + 1).padStart(2, '0')}`;
      cases.push(validatePolicyCase(policyCaseFixture({
        candidate_id: `${source}:item-${String(index).padStart(3, '0')}`,
        primary_function: primaryFunction,
        style_family: styles[index % styles.length],
        scale_bin: scales[index],
        source_group: source,
        asset_family: `family-${String(index).padStart(3, '0')}`,
        author_entity: `author-${String(index % 10).padStart(2, '0')}`,
        batch_id: `batch-${String(Math.floor(index / 10)).padStart(3, '0')}`
      })));
      index += 1;
    }
  }
  return cases;
}

function assignmentsFor(cases, counts) {
  const splits = [
    ...Array(counts.train).fill('train'),
    ...Array(counts.validation).fill('validation'),
    ...Array(counts.test).fill('test')
  ];
  return cases.map((item, index) => splitAssignmentFixture({
    candidate_id: item.candidate_id,
    split: splits[index]
  }));
}

function fiveHundredCases() {
  return Array.from({ length: 500 }, (_, index) => {
    const source = index >= 475
      ? 'source-12'
      : `source-${String(index % 12).padStart(2, '0')}`;
    return validatePolicyCase(policyCaseFixture({
      candidate_id: `${source}:item-${String(index).padStart(4, '0')}`,
      primary_function: FUNCTIONS[index % FUNCTIONS.length][0],
      source_group: source,
      asset_family: `family-${String(index).padStart(4, '0')}`,
      author_entity: `author-${String(index % 20).padStart(2, '0')}`,
      second_reviewed: index < 100,
      batch_id: `batch-${String(Math.floor(index / 100)).padStart(3, '0')}`
    }));
  });
}

function twoThousandCases() {
  return Array.from({ length: 2000 }, (_, index) => {
    const source = index >= 1900
      ? 'source-30'
      : `source-${String(index % 30).padStart(2, '0')}`;
    return validatePolicyCase(policyCaseFixture({
      candidate_id: `${source}:item-${String(index).padStart(4, '0')}`,
      primary_function: FUNCTIONS[index % FUNCTIONS.length][0],
      source_group: source,
      asset_family: `family-${String(index).padStart(4, '0')}`,
      author_entity: `author-${String(index % 40).padStart(2, '0')}`,
      second_reviewed: index % 10 === 0,
      batch_id: `batch-${String(Math.floor(index / 100)).padStart(3, '0')}`
    }));
  });
}

test('balanced synthetic 100-case snapshot passes every exact pilot gate', () => {
  const report = evaluateSnapshotPolicy(hundredCases(), 100);
  assert.equal(report.passed, true);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.scale_counts, { compact: 30, large: 25, standard: 45 });
  assert.throws(
    () => validatePolicyCase(policyCaseFixture({ style_family: 'unknown' })),
    (error) => error.code === 'POLICY_VALUE_INVALID'
  );
});

test('snapshot policy reports deterministic quota, source, style, duplicate, and review failures', () => {
  const cases = hundredCases();
  const broken = cases.map((item, index) => ({
    ...item,
    source_group: 'source-01',
    style_family: 'medieval',
    human_reviewed: index !== 0,
    near_duplicate_cluster: index < 12 ? 'near-001' : null
  }));
  const report = evaluateSnapshotPolicy(broken, 100);
  assert.equal(report.passed, false);
  assert.deepEqual(report.violations, [
    'HUMAN_REVIEW_INCOMPLETE',
    'NEAR_DUPLICATE_CAP_EXCEEDED',
    'SOURCE_CAP_EXCEEDED',
    'SOURCE_COUNT_INSUFFICIENT',
    'STYLE_CAP_EXCEEDED',
    'STYLE_COUNT_INSUFFICIENT'
  ]);
});

test('100-case split requires 70/15/15 and keeps asset families together', () => {
  const cases = hundredCases();
  const valid = validateLockedSplit({
    cases,
    assignments: assignmentsFor(cases, { train: 70, validation: 15, test: 15 }),
    priorAssignments: [],
    snapshotTier: 100
  });
  assert.equal(valid.passed, true);
  const grouped = cases.map((item, index) => index < 2
    ? { ...item, asset_family: 'shared-family' }
    : item);
  const assignments = assignmentsFor(grouped, { train: 70, validation: 15, test: 15 });
  assignments[1] = { ...assignments[1], split: 'test' };
  assert.equal(validateLockedSplit({
    cases: grouped, assignments, priorAssignments: [], snapshotTier: 100
  }).violations.includes('ASSET_FAMILY_SPLIT_LEAK'), true);
});

test('prior assignments remain present and unchanged in every later snapshot', () => {
  const cases = hundredCases();
  const assignments = assignmentsFor(cases, { train: 70, validation: 15, test: 15 });
  const prior = [{ candidate_id: cases[99].candidate_id, split: 'test' }];
  assignments[99] = { ...assignments[99], split: 'train' };
  assert.equal(validateLockedSplit({
    cases, assignments, priorAssignments: prior, snapshotTier: 100
  }).violations.includes('PRIOR_ASSIGNMENT_CHANGED'), true);
  const missingPrior = validateLockedSplit({
    cases,
    assignments: assignmentsFor(cases, { train: 70, validation: 15, test: 15 }),
    priorAssignments: [{ candidate_id: 'source-z:removed', split: 'test' }],
    snapshotTier: 100
  });
  assert.equal(missingPrior.violations.includes('PRIOR_ASSIGNMENT_MISSING'), true);
});

test('500 and 2000 tiers enforce source-project holdout counts', () => {
  const cases500 = fiveHundredCases();
  assert.equal(evaluateSnapshotPolicy(cases500, 500).passed, true);
  const assignments500 = assignmentsFor(cases500, { train: 350, validation: 75, test: 75 });
  const report500 = validateLockedSplit({
    cases: cases500, assignments: assignments500,
    priorAssignments: [], snapshotTier: 500
  });
  assert.equal(report500.passed, true);
  assert.equal(report500.source_holdout_test_count, 25);

  const cases2000 = twoThousandCases();
  assert.equal(evaluateSnapshotPolicy(cases2000, 2000).passed, true);
  const assignments2000 = assignmentsFor(cases2000, { train: 1600, validation: 200, test: 200 });
  const report2000 = validateLockedSplit({
    cases: cases2000, assignments: assignments2000,
    priorAssignments: [], snapshotTier: 2000
  });
  assert.equal(report2000.passed, true);
  assert.equal(report2000.source_holdout_test_count, 100);
});
