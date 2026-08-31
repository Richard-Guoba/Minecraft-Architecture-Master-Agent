import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import {
  P6_OBSERVATION_CRITERIA,
  P6_PROTOCOL_VERSION,
  P6_SCHEMA_VERSION,
  P6_VIEW_IDS
} from './constants.js';
import {
  p6Error,
  sanitizeP6Error,
  validateCaptureManifest,
  validateCohortManifest,
  validateObservation
} from './contracts.js';

const HASH = /^[a-f0-9]{64}$/u;
const OPAQUE_SOLUTION_ORDER = Object.freeze([
  'opaque-solution-alpha',
  'opaque-solution-bravo',
  'opaque-solution-charlie',
  'opaque-solution-delta'
]);
const SET_FIELDS = Object.freeze([
  'schema_version', 'protocol_version', 'status', 'cohort_sha256',
  'capture_manifest_hash', 'observation_count', 'required_observation_count',
  'gate_ready', 'observations'
]);
const CRITERION_LAYERS = deepFreeze({
  'massing-hierarchy': 'massing',
  'structural-legibility': 'structure',
  silhouette: 'massing',
  'roof-composition': 'roof',
  'facade-rhythm-depth': 'facade',
  'material-role-legibility': 'materials',
  'detail-density': 'facade',
  'scene-integration': 'scene',
  'style-consistency': 'facade'
});
const PROHIBITED_PREFERENCE = Object.freeze([
  /\b(?:prefer(?:red|s|ence)?|better|worse|winner|superior|inferior|outperform(?:s|ed)?|rank(?:ed|ing)?)\b/iu,
  /\b(?:solution|candidate|option|design|it|this)\s+(?:wins?|loses?)\b/iu,
  /\b(?:best|worst)\s+(?:solution|candidate|option|design)\b/iu,
  /\b(?:solution|candidate|option|design)\s+(?:is|looks?|appears?)\s+(?:the\s+)?(?:best|worst)\b/iu
]);
const PROHIBITED_HIDDEN_CLAIMS = Object.freeze([
  /\b(?:intend(?:ed|s|ing)?|intent(?:ion|ions|ional|ionally)?|designed\s+to|purpose\s+(?:is|was))\b/iu,
  /\b(?:historically\s+(?:authentic|accurate)|authentic(?:ally)?\s+medieval|true\s+medieval)\b/iu,
  /\b(?:structurally\s+(?:sound|safe|stable)|engineering(?:ly)?\s+(?:sound|true|valid))\b/iu,
  /\b(?:unseen\s+interior\s+(?:is|are|has|have|shows?|provides?|contains?|supports?)|interior\s+(?:is|are|has|have|shows?|provides?|contains?|supports?))\b/iu
]);
const INSUFFICIENT_EVIDENCE = Object.freeze([
  /\b(?:does\s+not|cannot|can't)\s+(?:establish|determine|show|confirm|verify)\b/iu,
  /\b(?:not\s+visible|insufficient\s+(?:visual\s+)?evidence|outside\s+the\s+(?:frame|view))\b/iu,
  /\b(?:evidence\s+(?:is|remains|appears)\s+unclear|unclear\s+(?:visual\s+)?evidence)\b/iu
]);
const EXPLICIT_CAVEAT = Object.freeze([
  /\b(?:does\s+not|cannot|can't)\s+(?:establish|determine|show|confirm|verify)\b/iu,
  /\b(?:not\s+visible|insufficient\s+(?:visual\s+)?evidence|evidence\s+(?:is|remains|appears)\s+unclear)\b/iu
]);

export function createObservation(value, { captureManifest, cohort } = {}) {
  try {
    const authorities = validateAuthorities(captureManifest, cohort);
    const observation = validateObservation(value);
    assertObservationSemantics(observation);

    const citedImages = observation.evidence_regions.map(region => {
      assertNormalizedRegion(region);
      const image = authorities.imagesByScreenshot.get(region.screenshot_id);
      if (!image) invalid();
      return image;
    });
    const buildHashes = new Set(citedImages.map(image => image.build_function_sha256));
    const opaqueSolutions = new Set(citedImages.map(image => image.solution_id));
    if (buildHashes.size !== 1 || opaqueSolutions.size !== 1) invalid();
    const solution = authorities.solutionsByAuthority.get(observation.solution_authority_hash);
    if (!solution || !buildHashes.has(solution.build_function_sha256)) invalid();
    if (authorities.authorityByOpaqueSolution.get(citedImages[0].solution_id)
      !== observation.solution_authority_hash) invalid();
    if (observation.capture_manifest_hash !== authorities.captureManifestHash) invalid();

    const citedViews = new Set(citedImages.map(image => image.camera.view_id));
    if (observation.view_ids.length !== citedViews.size
      || observation.view_ids.some(viewId => !citedViews.has(viewId))) invalid();
    return observation;
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_OBSERVATION_INVALID');
  }
}

export function compileObservationSet({ cohort, captureManifest, observations } = {}) {
  try {
    const authorities = validateAuthorities(captureManifest, cohort);
    if (!Array.isArray(observations)) invalid();
    const rows = observations.map(value => createObservation(value, { captureManifest, cohort }));
    const seenIds = new Set();
    const seenSubjects = new Set();
    for (const observation of rows) {
      const solutionIndex = authorities.solutionAuthorityOrder.indexOf(observation.solution_authority_hash);
      if (solutionIndex < 0 || seenIds.has(observation.observation_id)) invalid();
      const subject = `${observation.solution_authority_hash}:${observation.criterion}`;
      if (seenSubjects.has(subject)) invalid();
      seenIds.add(observation.observation_id);
      seenSubjects.add(subject);
    }
    rows.sort((left, right) => {
      const leftSolution = authorities.solutionAuthorityOrder.indexOf(left.solution_authority_hash);
      const rightSolution = authorities.solutionAuthorityOrder.indexOf(right.solution_authority_hash);
      return leftSolution - rightSolution
        || P6_OBSERVATION_CRITERIA.indexOf(left.criterion) - P6_OBSERVATION_CRITERIA.indexOf(right.criterion)
        || left.observation_id.localeCompare(right.observation_id, 'en');
    });
    const required = authorities.solutionAuthorityOrder.length * P6_OBSERVATION_CRITERIA.length;
    const complete = rows.length === required;
    return deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      status: complete ? 'complete' : 'partial',
      cohort_sha256: authorities.cohortHash,
      capture_manifest_hash: authorities.captureManifestHash,
      observation_count: rows.length,
      required_observation_count: required,
      gate_ready: complete,
      observations: rows
    });
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_OBSERVATION_INVALID');
  }
}

export function renderObservationReport(observationSet) {
  try {
    assertObservationSet(observationSet);
    const lines = [
      '# P6 image-grounded observation report',
      '',
      `Status: ${observationSet.status}`,
      `Gate ready: ${observationSet.gate_ready ? 'yes' : 'no'}`,
      `Coverage: ${observationSet.observation_count} of ${observationSet.required_observation_count}`,
      `Cohort SHA-256: ${observationSet.cohort_sha256}`,
      `Capture manifest SHA-256: ${observationSet.capture_manifest_hash}`,
      '',
      'Categorical observations describe cited pixels only. They do not score, rank, or choose solutions.',
      ''
    ];
    for (const observation of observationSet.observations) {
      const citations = observation.evidence_regions.map(region => (
        region.region_kind === 'whole-frame'
          ? `${region.screenshot_id} (whole frame)`
          : `${region.screenshot_id} (rect ${region.region.x},${region.region.y},${region.region.width},${region.region.height})`
      )).join('; ');
      lines.push(
        `## ${observation.observation_id}`,
        '',
        `- Criterion: ${observation.criterion}`,
        `- Design layer: ${observation.design_layer}`,
        `- Rating: ${observation.rating}`,
        `- Views: ${observation.view_ids.join(', ')}`,
        `- Evidence: ${citations}`,
        `- Visible description: ${observation.observable_paraphrase}`,
        `- Limitations: ${observation.limitations.join('; ')}`,
        ''
      );
    }
    return `${lines.join('\n').trimEnd()}\n`;
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_OBSERVATION_INVALID');
  }
}

function validateAuthorities(captureValue, cohortValue) {
  const cohort = validateCohortManifest(cohortValue);
  const captureManifest = validateCaptureManifest(captureValue);
  const cohortHash = sha256(stableJson(cohort));
  const captureManifestHash = sha256(stableJson(captureManifest));
  if (captureManifest.cohort_sha256 !== cohortHash) invalid();
  const solutionsByAuthority = new Map();
  const authorityByOpaqueSolution = new Map();
  const solutionAuthorityOrder = [];
  for (const [index, solution] of cohort.solutions.entries()) {
    const authority = sha256(stableJson(solution));
    if (solutionsByAuthority.has(authority)) invalid();
    const opaqueId = OPAQUE_SOLUTION_ORDER[index];
    const solutionImages = captureManifest.images.filter(image => image.solution_id === opaqueId);
    if (solutionImages.length !== P6_VIEW_IDS.length
      || solutionImages.some(image => image.build_function_sha256 !== solution.build_function_sha256)) invalid();
    solutionsByAuthority.set(authority, solution);
    authorityByOpaqueSolution.set(opaqueId, authority);
    solutionAuthorityOrder.push(authority);
  }
  return {
    cohort,
    captureManifest,
    cohortHash,
    captureManifestHash,
    imagesByScreenshot: new Map(captureManifest.images.map(image => [image.screenshot_id, image])),
    solutionsByAuthority,
    authorityByOpaqueSolution,
    solutionAuthorityOrder
  };
}

function assertNormalizedRegion(evidence) {
  if (evidence.region_kind !== 'rect') return;
  const { x, y, width, height } = evidence.region;
  if (![x, y, width, height].every(Number.isFinite)
    || x < 0 || y < 0 || width <= 0 || height <= 0
    || x > 1 || y > 1 || width > 1 || height > 1
    || x + width > 1 || y + height > 1) invalid();
}

function assertObservationSet(value) {
  if (!plain(value) || !sameKeys(value, SET_FIELDS)
    || value.schema_version !== P6_SCHEMA_VERSION
    || value.protocol_version !== P6_PROTOCOL_VERSION
    || !['complete', 'partial'].includes(value.status)
    || !HASH.test(value.cohort_sha256) || !HASH.test(value.capture_manifest_hash)
    || !Number.isSafeInteger(value.observation_count) || value.observation_count < 0
    || value.required_observation_count !== 36
    || typeof value.gate_ready !== 'boolean'
    || !Array.isArray(value.observations)
    || value.observations.length !== value.observation_count
    || value.gate_ready !== (value.status === 'complete')
    || (value.status === 'complete') !== (value.observation_count === value.required_observation_count)) invalid();
  const observationIds = new Set();
  const subjects = new Set();
  const seenSolutions = new Set();
  const solutionCriteria = new Map();
  let currentSolution = null;
  let previousCriterionIndex = -1;
  for (const rawObservation of value.observations) {
    const observation = validateObservation(rawObservation);
    assertObservationSemantics(observation);
    if (observation.capture_manifest_hash !== value.capture_manifest_hash
      || observationIds.has(observation.observation_id)) invalid();
    const subject = `${observation.solution_authority_hash}:${observation.criterion}`;
    if (subjects.has(subject)) invalid();
    observationIds.add(observation.observation_id);
    subjects.add(subject);

    const criterionIndex = P6_OBSERVATION_CRITERIA.indexOf(observation.criterion);
    if (observation.solution_authority_hash !== currentSolution) {
      if (seenSolutions.has(observation.solution_authority_hash)) invalid();
      currentSolution = observation.solution_authority_hash;
      seenSolutions.add(currentSolution);
      solutionCriteria.set(currentSolution, []);
      previousCriterionIndex = -1;
    }
    if (criterionIndex <= previousCriterionIndex) invalid();
    previousCriterionIndex = criterionIndex;
    solutionCriteria.get(currentSolution).push(observation.criterion);
  }
  if (value.status === 'complete') {
    if (solutionCriteria.size !== 4) invalid();
    for (const criteria of solutionCriteria.values()) {
      if (stableJson(criteria) !== stableJson(P6_OBSERVATION_CRITERIA)) invalid();
    }
  }
}

function assertObservationSemantics(observation) {
  if (observation.design_layer !== CRITERION_LAYERS[observation.criterion]
    || observation.limitations.length === 0) invalid();
  const prose = [observation.observable_paraphrase, ...observation.limitations];
  for (const text of prose) {
    for (const segment of text.split(/[.!?;\n]+/u).filter(Boolean)) {
      if (PROHIBITED_PREFERENCE.some(pattern => pattern.test(segment))) invalid();
      if (PROHIBITED_HIDDEN_CLAIMS.some(pattern => pattern.test(segment))
        && !EXPLICIT_CAVEAT.some(pattern => pattern.test(segment))) invalid();
    }
  }
  if (prose.some(text => INSUFFICIENT_EVIDENCE.some(pattern => pattern.test(text)))
    && observation.rating !== 'unknown') invalid();
  for (const region of observation.evidence_regions) assertNormalizedRegion(region);
}

function sameKeys(value, fields) {
  const keys = Object.keys(value).sort();
  return keys.length === fields.length && keys.every((key, index) => key === [...fields].sort()[index]);
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function invalid() { throw p6Error('P6_OBSERVATION_INVALID'); }
