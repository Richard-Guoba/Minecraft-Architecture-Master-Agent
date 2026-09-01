import {
  validateCaptureManifest,
  validateCohortManifest,
  validateComparisonManifest,
  validatePreferenceRecord,
  p6Error,
  sanitizeP6Error
} from './contracts.js';
import {
  P6_COMPARISON_ALIASES,
  P6_PROTOCOL_VERSION,
  P6_SCHEMA_VERSION,
  P6_VIEW_IDS
} from './constants.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

const PAIRS = Object.freeze([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
const REVIEWER_PSEUDONYM = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const HASH = /^[a-f0-9]{64}$/u;
const REAL_SOLUTION_IDS = Object.freeze([
  'playbook-candidate-01', 'playbook-candidate-02', 'playbook-candidate-03', 'baseline-current'
]);

export function compileBlindComparison({
  cohort, captureManifest, randomBytes, generatedAt = new Date().toISOString()
} = {}) {
  try {
    validateCohortManifest(cohort);
    validateCaptureManifest(captureManifest);
    if (captureManifest.cohort_sha256 !== sha256(stableJson(cohort))) invalid();
    if (typeof randomBytes !== 'function') invalid();
    assertIsoUtc(generatedAt);

    const captureByBuild = new Map();
    for (const image of captureManifest.images) {
      const prior = captureByBuild.get(image.build_function_sha256);
      if (prior && prior !== image.solution_id) invalid();
      captureByBuild.set(image.build_function_sha256, image.solution_id);
    }
    const identities = cohort.solutions.map(solution => {
      const captureSolutionId = captureByBuild.get(solution.build_function_sha256);
      if (!captureSolutionId) invalid();
      return { solution_id: solution.solution_id, capture_solution_id: captureSolutionId };
    });
    if (new Set(identities.map(row => row.capture_solution_id)).size !== 4) invalid();

    const random = randomSampler(randomBytes);
    shuffle(identities, random.index);
    const mappings = P6_COMPARISON_ALIASES.map((solution_code, index) => ({
      solution_code,
      solution_id: identities[index].solution_id,
      capture_solution_id: identities[index].capture_solution_id
    }));
    const privateIdentityMap = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      cohort_sha256: captureManifest.cohort_sha256,
      capture_manifest_hash: sha256(stableJson(captureManifest)),
      mappings
    });

    const pairs = PAIRS.map(([leftIndex, rightIndex], index) => {
      const swapped = random.index(2) === 1;
      return {
        pair_id: `pair-${String(index + 1).padStart(2, '0')}`,
        left_code: P6_COMPARISON_ALIASES[swapped ? rightIndex : leftIndex],
        right_code: P6_COMPARISON_ALIASES[swapped ? leftIndex : rightIndex],
        view_ids: [...P6_VIEW_IDS]
      };
    });
    const presentationPairs = [...pairs];
    shuffle(presentationPairs, random.index);
    const privateRandomization = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      random_bytes_hex: Buffer.from(random.transcript).toString('hex')
    });
    const publicManifest = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      cohort_sha256: captureManifest.cohort_sha256,
      capture_manifest_hash: privateIdentityMap.capture_manifest_hash,
      identity_map_sha256: sha256(stableJson(privateIdentityMap)),
      randomization_sha256: sha256(stableJson(privateRandomization)),
      solution_codes: [...P6_COMPARISON_ALIASES],
      pairs,
      generated_at: generatedAt
    });
    validateComparisonManifest(publicManifest);

    const comparisonManifestHash = sha256(stableJson(publicManifest));
    const publicComparisons = presentationPairs.map(pair => deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      filename: `${pair.pair_id}.json`,
      pair_id: pair.pair_id,
      comparison_manifest_hash: comparisonManifestHash,
      left: publicSide(pair.left_code, mappings, captureManifest),
      right: publicSide(pair.right_code, mappings, captureManifest)
    }));
    const publicPresentation = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      comparison_manifest_hash: comparisonManifestHash,
      pair_ids: publicComparisons.map(row => row.pair_id)
    });
    return deepFreeze({
      publicManifest, publicComparisons, publicPresentation, privateIdentityMap, privateRandomization
    });
  } catch (error) {
    throw p6Error('P6_COMPARISON_INVALID');
  }
}

export function validatePreferenceAgainstManifest(record, publicManifest) {
  try {
    validateComparisonManifest(publicManifest);
    validatePreferenceRecord(record);
    const manifestHash = sha256(stableJson(publicManifest));
    if (record.comparison_manifest_hash !== manifestHash
      || !publicManifest.pairs.some(pair => pair.pair_id === record.pair_id)) invalid();
    return record;
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_COMPARISON_INVALID');
  }
}

export function sealPreferences({ publicManifest, records, reviewerPseudonym } = {}) {
  try {
    validateComparisonManifest(publicManifest);
    if (!Array.isArray(records) || records.length < publicManifest.pairs.length) {
      throw p6Error('P6_HUMAN_PREFERENCE_REQUIRED');
    }
    if (records.length !== publicManifest.pairs.length
      || typeof reviewerPseudonym !== 'string' || !REVIEWER_PSEUDONYM.test(reviewerPseudonym)) invalid();
    const byPair = new Map();
    for (const record of records) {
      validatePreferenceAgainstManifest(record, publicManifest);
      if (byPair.has(record.pair_id)) invalid();
      byPair.set(record.pair_id, record);
    }
    const ordered = publicManifest.pairs.map(pair => byPair.get(pair.pair_id));
    if (ordered.some(record => !record)) throw p6Error('P6_HUMAN_PREFERENCE_REQUIRED');
    return deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      status: 'sealed',
      comparison_manifest_hash: sha256(stableJson(publicManifest)),
      identity_map_sha256: publicManifest.identity_map_sha256,
      reviewer_pseudonym: reviewerPseudonym,
      pairs: publicManifest.pairs,
      records: ordered,
      sealed_preference_hashes: ordered.map(record => sha256(stableJson(record)))
    });
  } catch (error) {
    if (error?.code === 'P6_HUMAN_PREFERENCE_REQUIRED') throw error;
    throw sanitizeP6Error(error, 'P6_COMPARISON_INVALID');
  }
}

export function revealPreferenceResults({ sealedPreferences, privateIdentityMap } = {}) {
  try {
    if (!plain(sealedPreferences) || sealedPreferences.status !== 'sealed'
      || !sameExactKeys(sealedPreferences, [
        'schema_version', 'protocol_version', 'status', 'comparison_manifest_hash',
        'identity_map_sha256', 'reviewer_pseudonym', 'pairs', 'records',
        'sealed_preference_hashes'
      ])
      || sealedPreferences.schema_version !== P6_SCHEMA_VERSION
      || sealedPreferences.protocol_version !== P6_PROTOCOL_VERSION
      || !HASH.test(sealedPreferences.comparison_manifest_hash)
      || !HASH.test(sealedPreferences.identity_map_sha256)
      || !REVIEWER_PSEUDONYM.test(sealedPreferences.reviewer_pseudonym)
      || !Array.isArray(sealedPreferences.records) || sealedPreferences.records.length !== 6
      || !Array.isArray(sealedPreferences.pairs) || sealedPreferences.pairs.length !== 6
      || !Array.isArray(sealedPreferences.sealed_preference_hashes)
      || sealedPreferences.sealed_preference_hashes.length !== 6) {
      throw p6Error('P6_HUMAN_PREFERENCE_REQUIRED');
    }
    if (!plain(privateIdentityMap)
      || !sameExactKeys(privateIdentityMap, [
        'schema_version', 'protocol_version', 'cohort_sha256', 'capture_manifest_hash', 'mappings'
      ])
      || privateIdentityMap.schema_version !== P6_SCHEMA_VERSION
      || privateIdentityMap.protocol_version !== P6_PROTOCOL_VERSION
      || !HASH.test(privateIdentityMap.cohort_sha256)
      || !HASH.test(privateIdentityMap.capture_manifest_hash)
      || sha256(stableJson(privateIdentityMap)) !== sealedPreferences.identity_map_sha256
      || !Array.isArray(privateIdentityMap.mappings) || privateIdentityMap.mappings.length !== 4) invalid();
    for (const [index, row] of privateIdentityMap.mappings.entries()) {
      if (!plain(row) || !sameExactKeys(row, ['solution_code', 'solution_id', 'capture_solution_id'])
        || row.solution_code !== P6_COMPARISON_ALIASES[index]
        || !REAL_SOLUTION_IDS.includes(row.solution_id)
        || !/^opaque-solution-[a-z0-9]+$/u.test(row.capture_solution_id)) invalid();
    }
    const identity = new Map(privateIdentityMap.mappings.map(row => [row.solution_code, row.solution_id]));
    if (identity.size !== 4
      || new Set(identity.values()).size !== 4
      || new Set(privateIdentityMap.mappings.map(row => row.capture_solution_id)).size !== 4) invalid();
    const counts = { left: 0, right: 0, tie: 0 };
    const pairDecisions = sealedPreferences.records.map((record, index) => {
      const pair = sealedPreferences.pairs[index];
      const [first, second] = PAIRS[index];
      if (!plain(pair) || !sameExactKeys(pair, ['pair_id', 'left_code', 'right_code', 'view_ids'])
        || pair.pair_id !== `pair-${String(index + 1).padStart(2, '0')}`
        || [pair.left_code, pair.right_code].sort().join(',')
          !== [P6_COMPARISON_ALIASES[first], P6_COMPARISON_ALIASES[second]].sort().join(',')
        || stableJson(pair.view_ids) !== stableJson(P6_VIEW_IDS)) invalid();
      validatePreferenceRecord(record);
      if (record.pair_id !== pair.pair_id
        || record.comparison_manifest_hash !== sealedPreferences.comparison_manifest_hash
        || sha256(stableJson(record)) !== sealedPreferences.sealed_preference_hashes[index]) invalid();
      counts[record.choice] += 1;
      return {
        pair_id: pair.pair_id,
        left_solution_id: identity.get(pair.left_code),
        right_solution_id: identity.get(pair.right_code),
        decision: record.choice,
        preferred_solution_id: record.choice === 'left' ? identity.get(pair.left_code)
          : record.choice === 'right' ? identity.get(pair.right_code) : null,
        confidence: record.confidence,
        reason_tags: [...record.reason_tags]
      };
    });
    return deepFreeze({ categorical_counts: counts, pair_decisions: pairDecisions });
  } catch (error) {
    if (error?.code === 'P6_HUMAN_PREFERENCE_REQUIRED') throw error;
    throw sanitizeP6Error(error, 'P6_COMPARISON_INVALID');
  }
}

function publicSide(solutionCode, mappings, captureManifest) {
  const mapping = mappings.find(row => row.solution_code === solutionCode);
  if (!mapping) invalid();
  const screenshots = P6_VIEW_IDS.map(viewId => {
    const image = captureManifest.images.find(row => (
      row.solution_id === mapping.capture_solution_id && row.camera.view_id === viewId
    ));
    if (!image) invalid();
    return { screenshot_id: image.screenshot_id, view_id: viewId, image_sha256: image.image_sha256 };
  });
  return { solution_code: solutionCode, screenshots };
}

function randomSampler(randomBytes) {
  const transcript = [];
  return {
    transcript,
    index(maxExclusive) {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 256) invalid();
      const ceiling = 256 - (256 % maxExclusive);
      for (;;) {
        const bytes = randomBytes(1);
        if (!Buffer.isBuffer(bytes) || bytes.length !== 1) invalid();
        transcript.push(bytes[0]);
        if (bytes[0] < ceiling) return bytes[0] % maxExclusive;
      }
    }
  };
}

function shuffle(values, randomIndex) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1);
    [values[index], values[other]] = [values[other], values[index]];
  }
}

function assertIsoUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) invalid();
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameExactKeys(value, fields) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function invalid() { throw p6Error('P6_COMPARISON_INVALID'); }
