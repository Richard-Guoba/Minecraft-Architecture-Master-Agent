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
const MAX_RANDOM_ATTEMPTS = 128;
const BLIND_SCREENSHOT_ID = /^blind-shot-[a-f0-9]{32}$/u;

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
    const identityNonceHex = random.bytes(32).toString('hex');
    shuffle(identities, random.index);
    const mappings = P6_COMPARISON_ALIASES.map((solution_code, index) => ({
      solution_code,
      solution_id: identities[index].solution_id,
      capture_solution_id: identities[index].capture_solution_id
    }));
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
    const screenshotMappings = [];
    const allocatedScreenshotIds = new Set();
    const publicScreenshotsByCode = new Map(mappings.map(mapping => [
      mapping.solution_code,
      P6_VIEW_IDS.map(viewId => createPublicScreenshot(
        mapping, viewId, captureManifest, random, allocatedScreenshotIds, screenshotMappings
      ))
    ]));
    const publicComparisons = presentationPairs.map(pair => deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      filename: `${pair.pair_id}.json`,
      pair_id: pair.pair_id,
      left: publicSide(pair.left_code, publicScreenshotsByCode),
      right: publicSide(pair.right_code, publicScreenshotsByCode)
    }));
    const publicPresentation = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      pair_ids: publicComparisons.map(row => row.pair_id)
    });
    const privateIdentityMap = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      identity_nonce_hex: identityNonceHex,
      cohort_sha256: captureManifest.cohort_sha256,
      capture_manifest_hash: sha256(stableJson(captureManifest)),
      mappings,
      screenshot_mappings: screenshotMappings
    });
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
      pair_artifact_hashes: Object.fromEntries(
        [...publicComparisons]
          .sort((left, right) => left.pair_id.localeCompare(right.pair_id))
          .map(row => [row.pair_id, sha256(stableJson(row))])
      ),
      presentation_order_sha256: sha256(stableJson(publicPresentation)),
      solution_codes: [...P6_COMPARISON_ALIASES],
      pairs,
      generated_at: generatedAt
    });
    validateComparisonManifest(publicManifest);

    const bundle = deepFreeze({
      publicManifest, publicComparisons, publicPresentation, privateIdentityMap, privateRandomization
    });
    validateBlindComparisonPackage(bundle);
    return bundle;
  } catch (error) {
    throw p6Error('P6_COMPARISON_INVALID');
  }
}

export function validateBlindComparisonPackage(value) {
  try {
    if (!plain(value) || !plain(value.publicManifest)
      || !Array.isArray(value.publicComparisons) || value.publicComparisons.length !== 6
      || !plain(value.publicPresentation)) invalid();
    validateComparisonManifest(value.publicManifest);
    if (!sameExactKeys(value.publicPresentation, ['schema_version', 'protocol_version', 'pair_ids'])
      || value.publicPresentation.schema_version !== P6_SCHEMA_VERSION
      || value.publicPresentation.protocol_version !== P6_PROTOCOL_VERSION
      || sha256(stableJson(value.publicPresentation)) !== value.publicManifest.presentation_order_sha256
      || !Array.isArray(value.publicPresentation.pair_ids)
      || value.publicPresentation.pair_ids.length !== 6) invalid();
    const pairById = new Map(value.publicManifest.pairs.map(row => [row.pair_id, row]));
    const seenPairs = new Set();
    const seenScreenshots = new Map();
    for (const artifact of value.publicComparisons) {
      if (!plain(artifact) || !sameExactKeys(artifact, [
        'schema_version', 'protocol_version', 'filename', 'pair_id', 'left', 'right'
      ]) || artifact.schema_version !== P6_SCHEMA_VERSION
        || artifact.protocol_version !== P6_PROTOCOL_VERSION
        || artifact.filename !== `${artifact.pair_id}.json`
        || seenPairs.has(artifact.pair_id)
        || sha256(stableJson(artifact)) !== value.publicManifest.pair_artifact_hashes[artifact.pair_id]) invalid();
      const pair = pairById.get(artifact.pair_id);
      if (!pair) invalid();
      seenPairs.add(artifact.pair_id);
      validatePublicSide(artifact.left, pair.left_code, seenScreenshots);
      validatePublicSide(artifact.right, pair.right_code, seenScreenshots);
    }
    if (seenPairs.size !== 6 || seenScreenshots.size !== 24
      || stableJson(value.publicPresentation.pair_ids)
        !== stableJson(value.publicComparisons.map(row => row.pair_id))
      || new Set(value.publicPresentation.pair_ids).size !== 6
      || value.publicPresentation.pair_ids.some(pairId => !pairById.has(pairId))) invalid();
    return value;
  } catch (error) {
    throw p6Error('P6_COMPARISON_INVALID');
  }
}

export function validatePrivateComparisonAuthority({
  publicManifest, publicComparisons, publicPresentation,
  privateIdentityMap, privateRandomization, cohort, captureManifest
} = {}) {
  try {
    validateBlindComparisonPackage({ publicManifest, publicComparisons, publicPresentation });
    validateCohortManifest(cohort);
    validateCaptureManifest(captureManifest);
    if (sha256(stableJson(cohort)) !== publicManifest.cohort_sha256
      || sha256(stableJson(captureManifest)) !== publicManifest.capture_manifest_hash
      || captureManifest.cohort_sha256 !== publicManifest.cohort_sha256
      || sha256(stableJson(privateIdentityMap)) !== publicManifest.identity_map_sha256
      || sha256(stableJson(privateRandomization)) !== publicManifest.randomization_sha256) invalid();
    validatePrivateMapShape(privateIdentityMap);
    if (!plain(privateRandomization)
      || !sameExactKeys(privateRandomization, ['schema_version', 'protocol_version', 'random_bytes_hex'])
      || privateRandomization.schema_version !== P6_SCHEMA_VERSION
      || privateRandomization.protocol_version !== P6_PROTOCOL_VERSION
      || typeof privateRandomization.random_bytes_hex !== 'string'
      || !/^[a-f0-9]+$/u.test(privateRandomization.random_bytes_hex)
      || privateRandomization.random_bytes_hex.length < 64
      || privateRandomization.random_bytes_hex.length % 2 !== 0) invalid();

    const aliasMap = new Map(privateIdentityMap.mappings.map(row => [row.solution_code, row]));
    for (const mapping of privateIdentityMap.mappings) {
      const solution = cohort.solutions.find(row => row.solution_id === mapping.solution_id);
      const captures = captureManifest.images.filter(row => row.solution_id === mapping.capture_solution_id);
      if (!solution || captures.length !== 6
        || captures.some(row => row.build_function_sha256 !== solution.build_function_sha256)) invalid();
    }
    const publicScreenshots = new Map();
    for (const artifact of publicComparisons) {
      for (const side of ['left', 'right']) {
        for (const screenshot of artifact[side].screenshots) {
          const authority = {
            view_id: screenshot.view_id,
            presentation_filename: screenshot.filename,
            solution_code: artifact[side].solution_code
          };
          const prior = publicScreenshots.get(screenshot.screenshot_id);
          if (prior && stableJson(prior) !== stableJson(authority)) invalid();
          publicScreenshots.set(screenshot.screenshot_id, authority);
        }
      }
    }
    const seenPresentation = new Set();
    for (const mapping of privateIdentityMap.screenshot_mappings) {
      if (!plain(mapping) || !sameExactKeys(mapping, [
        'solution_code', 'view_id', 'presentation_screenshot_id', 'presentation_filename',
        'source_screenshot_id', 'source_filename', 'source_image_sha256'
      ]) || !P6_COMPARISON_ALIASES.includes(mapping.solution_code)
        || !P6_VIEW_IDS.includes(mapping.view_id)
        || !BLIND_SCREENSHOT_ID.test(mapping.presentation_screenshot_id)
        || mapping.presentation_filename !== `${mapping.presentation_screenshot_id}.png`
        || !HASH.test(mapping.source_image_sha256)
        || seenPresentation.has(mapping.presentation_screenshot_id)) invalid();
      seenPresentation.add(mapping.presentation_screenshot_id);
      const publicRow = publicScreenshots.get(mapping.presentation_screenshot_id);
      const alias = aliasMap.get(mapping.solution_code);
      const source = captureManifest.images.find(row => row.screenshot_id === mapping.source_screenshot_id);
      if (!publicRow || !alias || !source
        || publicRow.solution_code !== mapping.solution_code || publicRow.view_id !== mapping.view_id
        || publicRow.presentation_filename !== mapping.presentation_filename
        || source.solution_id !== alias.capture_solution_id
        || source.camera.view_id !== mapping.view_id
        || source.image_sha256 !== mapping.source_image_sha256
        || mapping.source_filename !== `${source.screenshot_id}.png`) invalid();
    }
    if (seenPresentation.size !== 24 || publicScreenshots.size !== 24) invalid();
    return true;
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
        'schema_version', 'protocol_version', 'identity_nonce_hex', 'cohort_sha256',
        'capture_manifest_hash', 'mappings', 'screenshot_mappings'
      ])
      || privateIdentityMap.schema_version !== P6_SCHEMA_VERSION
      || privateIdentityMap.protocol_version !== P6_PROTOCOL_VERSION
      || !HASH.test(privateIdentityMap.cohort_sha256)
      || !HASH.test(privateIdentityMap.capture_manifest_hash)
      || !/^[a-f0-9]{64}$/u.test(privateIdentityMap.identity_nonce_hex)
      || sha256(stableJson(privateIdentityMap)) !== sealedPreferences.identity_map_sha256
      || !Array.isArray(privateIdentityMap.mappings) || privateIdentityMap.mappings.length !== 4
      || !Array.isArray(privateIdentityMap.screenshot_mappings)
      || privateIdentityMap.screenshot_mappings.length !== 24) invalid();
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

function publicSide(solutionCode, publicScreenshotsByCode) {
  const screenshots = publicScreenshotsByCode.get(solutionCode);
  if (!screenshots) invalid();
  return { solution_code: solutionCode, screenshots };
}

function createPublicScreenshot(mapping, viewId, captureManifest, random, allocated, screenshotMappings) {
  const image = captureManifest.images.find(row => (
    row.solution_id === mapping.capture_solution_id && row.camera.view_id === viewId
  ));
  if (!image) invalid();
  const screenshotId = uniqueScreenshotId(random, allocated, screenshotMappings.length);
  const filename = `${screenshotId}.png`;
  screenshotMappings.push({
    solution_code: mapping.solution_code,
    view_id: viewId,
    presentation_screenshot_id: screenshotId,
    presentation_filename: filename,
    source_screenshot_id: image.screenshot_id,
    source_filename: `${image.screenshot_id}.png`,
    source_image_sha256: image.image_sha256
  });
  return { screenshot_id: screenshotId, filename, view_id: viewId };
}

function validatePublicSide(value, expectedCode, seenScreenshots) {
  if (!plain(value) || !sameExactKeys(value, ['solution_code', 'screenshots'])
    || value.solution_code !== expectedCode
    || !Array.isArray(value.screenshots) || value.screenshots.length !== P6_VIEW_IDS.length) invalid();
  for (const [index, screenshot] of value.screenshots.entries()) {
    if (!plain(screenshot) || !sameExactKeys(screenshot, ['screenshot_id', 'filename', 'view_id'])
      || !BLIND_SCREENSHOT_ID.test(screenshot.screenshot_id)
      || screenshot.filename !== `${screenshot.screenshot_id}.png`
      || screenshot.view_id !== P6_VIEW_IDS[index]) invalid();
    const prior = seenScreenshots.get(screenshot.screenshot_id);
    if (prior && stableJson(prior) !== stableJson(screenshot)) invalid();
    seenScreenshots.set(screenshot.screenshot_id, screenshot);
  }
}

function validatePrivateMapShape(value) {
  if (!plain(value) || !sameExactKeys(value, [
    'schema_version', 'protocol_version', 'identity_nonce_hex', 'cohort_sha256',
    'capture_manifest_hash', 'mappings', 'screenshot_mappings'
  ]) || value.schema_version !== P6_SCHEMA_VERSION
    || value.protocol_version !== P6_PROTOCOL_VERSION
    || !/^[a-f0-9]{64}$/u.test(value.identity_nonce_hex)
    || !HASH.test(value.cohort_sha256) || !HASH.test(value.capture_manifest_hash)
    || !Array.isArray(value.mappings) || value.mappings.length !== 4
    || !Array.isArray(value.screenshot_mappings) || value.screenshot_mappings.length !== 24) invalid();
  for (const [index, row] of value.mappings.entries()) {
    if (!plain(row) || !sameExactKeys(row, ['solution_code', 'solution_id', 'capture_solution_id'])
      || row.solution_code !== P6_COMPARISON_ALIASES[index]
      || !REAL_SOLUTION_IDS.includes(row.solution_id)
      || !/^opaque-solution-[a-z0-9]+$/u.test(row.capture_solution_id)) invalid();
  }
  if (new Set(value.mappings.map(row => row.solution_id)).size !== 4
    || new Set(value.mappings.map(row => row.capture_solution_id)).size !== 4) invalid();
}

function uniqueScreenshotId(random, allocated, sequence) {
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const sequenceBytes = Buffer.alloc(8);
    sequenceBytes.writeBigUInt64BE(BigInt(sequence));
    const value = `blind-shot-${sha256(Buffer.concat([
      random.bytes(16), sequenceBytes, Buffer.from([attempt])
    ])).slice(0, 32)}`;
    if (!allocated.has(value)) {
      allocated.add(value);
      return value;
    }
  }
  invalid();
}

function randomSampler(randomBytes) {
  const transcript = [];
  const readBytes = length => {
    if (!Number.isSafeInteger(length) || length < 1 || length > 64) invalid();
    const bytes = randomBytes(length);
    if (!Buffer.isBuffer(bytes) || bytes.length !== length) invalid();
    transcript.push(...bytes);
    return Buffer.from(bytes);
  };
  return {
    transcript,
    bytes: readBytes,
    index(maxExclusive) {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 256) invalid();
      const ceiling = 256 - (256 % maxExclusive);
      for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
        const bytes = readBytes(1);
        if (bytes[0] < ceiling) return bytes[0] % maxExclusive;
      }
      invalid();
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
