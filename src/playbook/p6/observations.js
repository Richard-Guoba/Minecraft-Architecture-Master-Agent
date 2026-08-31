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
  'gate_ready', 'authority', 'authority_sha256', 'observations'
]);
const SET_AUTHORITY_FIELDS = Object.freeze([
  'schema_version', 'cohort_sha256', 'capture_manifest_hash',
  'capture_manifest', 'solutions'
]);
const SET_SOLUTION_AUTHORITY_FIELDS = Object.freeze([
  'opaque_solution_id', 'solution_authority_hash', 'build_function_sha256'
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
  /\b(?:solution|candidate|option)\s+(?:clearly\s+)?(?:wins?|loses?)\b/iu,
  /\b(?:design|it|this)\s+(?:clearly\s+)?(?:wins?|loses?)(?=\s*$|\s+(?:overall|on|against|over|despite|because|the\s+(?:comparison|pair))\b)/iu,
  /\b(?:wins?|loses?)\s+(?:the\s+)?(?:comparison|pair|preference)\b/iu,
  /\b(?:best|worst)\s+(?:solution|candidate|option|design)\b/iu,
  /\b(?:solution|candidate|option|design)\s+(?:is|looks?|appears?)\s+(?:the\s+)?(?:best|worst)\b/iu
]);
const PROHIBITED_HIDDEN_CLAIMS = Object.freeze([
  /\b(?:architect|designer|builder)(?:'s)?(?:\s+[\p{L}'-]+){0,5}\s+(?:intend(?:ed|s|ing)?|intent(?:ion|ions)?|meant)\b/iu,
  /\b(?:building|design|volume|facade|façade|roof|structure|interior|layout)\s+(?:(?:is|was)\s+)?(?:intend(?:ed|s)?|meant|designed)\s+(?:to|for)\b/iu,
  /\b(?:historically\s+(?:authentic|accurate)|authentic(?:ally)?\s+medieval|true\s+medieval)\b/iu,
  /\b(?:structurally\s+(?:sound|safe|stable)|engineering(?:ly)?\s+(?:sound|true|valid))\b/iu,
  /\b(?:unseen\s+interior\s+(?:is|are|has|have|shows?|provides?|contains?|supports?)|interior\s+(?:is|are|has|have|shows?|provides?|contains?|supports?))\b/iu
]);
const INSUFFICIENT_EVIDENCE = Object.freeze([
  /\b(?:does\s+not|cannot|can't)\s+(?:establish|determine|show|confirm|verify)\b/iu,
  /\b(?:not\s+visible|insufficient\s+(?:visual\s+)?evidence|outside\s+the\s+(?:frame|view))\b/iu,
  /\b(?:evidence\s+(?:is|remains|appears)\s+unclear|unclear\s+(?:visual\s+)?evidence)\b/iu
]);
const CLAUSE_BOUNDARY = /(?:[.!?;\n]+|,\s*(?=(?:but|however|although|yet|while)\b)|\b(?:but|however|although|yet|while)\b)/iu;

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
    const authority = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      cohort_sha256: authorities.cohortHash,
      capture_manifest_hash: authorities.captureManifestHash,
      capture_manifest: authorities.captureManifest,
      solutions: authorities.solutionAuthorityOrder.map((solutionAuthorityHash, index) => ({
        opaque_solution_id: OPAQUE_SOLUTION_ORDER[index],
        solution_authority_hash: solutionAuthorityHash,
        build_function_sha256: authorities.cohort.solutions[index].build_function_sha256
      }))
    });
    const observationSet = deepFreeze({
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      status: complete ? 'complete' : 'partial',
      cohort_sha256: authorities.cohortHash,
      capture_manifest_hash: authorities.captureManifestHash,
      observation_count: rows.length,
      required_observation_count: required,
      gate_ready: complete,
      authority,
      authority_sha256: sha256(stableJson(authority)),
      observations: rows
    });
    return observationSet;
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
    || !HASH.test(value.authority_sha256)
    || !Number.isSafeInteger(value.observation_count) || value.observation_count < 0
    || value.required_observation_count !== 36
    || typeof value.gate_ready !== 'boolean'
    || !Array.isArray(value.observations)
    || value.observations.length !== value.observation_count
    || value.gate_ready !== (value.status === 'complete')
    || (value.status === 'complete') !== (value.observation_count === value.required_observation_count)) invalid();
  const authority = validateSetAuthority(value);
  const observationIds = new Set();
  const subjects = new Set();
  let previousCanonicalIndex = -1;
  for (const rawObservation of value.observations) {
    const observation = validateObservation(rawObservation);
    assertObservationSemantics(observation);
    if (observation.capture_manifest_hash !== value.capture_manifest_hash
      || observationIds.has(observation.observation_id)) invalid();
    const subject = `${observation.solution_authority_hash}:${observation.criterion}`;
    if (subjects.has(subject)) invalid();
    observationIds.add(observation.observation_id);
    subjects.add(subject);

    const solutionIndex = authority.solutionOrder.indexOf(observation.solution_authority_hash);
    const criterionIndex = P6_OBSERVATION_CRITERIA.indexOf(observation.criterion);
    if (solutionIndex < 0) invalid();
    const canonicalIndex = solutionIndex * P6_OBSERVATION_CRITERIA.length + criterionIndex;
    if (canonicalIndex <= previousCanonicalIndex) invalid();
    previousCanonicalIndex = canonicalIndex;
    assertObservationEvidence(observation, authority);
  }
  if (value.status === 'complete' && subjects.size !== value.required_observation_count) invalid();
}

function validateSetAuthority(value) {
  const authority = value.authority;
  if (!plain(authority) || !sameKeys(authority, SET_AUTHORITY_FIELDS)
    || authority.schema_version !== P6_SCHEMA_VERSION
    || authority.cohort_sha256 !== value.cohort_sha256
    || authority.capture_manifest_hash !== value.capture_manifest_hash
    || value.authority_sha256 !== sha256(stableJson(authority))) invalid();
  const captureManifest = validateCaptureManifest(authority.capture_manifest);
  if (sha256(stableJson(captureManifest)) !== authority.capture_manifest_hash
    || captureManifest.cohort_sha256 !== authority.cohort_sha256
    || !Array.isArray(authority.solutions)
    || authority.solutions.length !== OPAQUE_SOLUTION_ORDER.length) invalid();
  const imagesByScreenshot = new Map(captureManifest.images.map(image => [image.screenshot_id, image]));
  const authorityByOpaqueSolution = new Map();
  const solutionOrder = [];
  for (const [index, solution] of authority.solutions.entries()) {
    if (!plain(solution) || !sameKeys(solution, SET_SOLUTION_AUTHORITY_FIELDS)
      || solution.opaque_solution_id !== OPAQUE_SOLUTION_ORDER[index]
      || !HASH.test(solution.solution_authority_hash)
      || !HASH.test(solution.build_function_sha256)
      || solutionOrder.includes(solution.solution_authority_hash)) invalid();
    const images = captureManifest.images.filter(image => image.solution_id === solution.opaque_solution_id);
    if (images.length !== P6_VIEW_IDS.length
      || images.some(image => image.build_function_sha256 !== solution.build_function_sha256)) invalid();
    solutionOrder.push(solution.solution_authority_hash);
    authorityByOpaqueSolution.set(solution.opaque_solution_id, solution.solution_authority_hash);
  }
  return { imagesByScreenshot, authorityByOpaqueSolution, solutionOrder };
}

function assertObservationEvidence(observation, authority) {
  const citedImages = observation.evidence_regions.map(region => {
    const image = authority.imagesByScreenshot.get(region.screenshot_id);
    if (!image) invalid();
    return image;
  });
  const citedSolutions = new Set(citedImages.map(image => (
    authority.authorityByOpaqueSolution.get(image.solution_id)
  )));
  if (citedSolutions.size !== 1 || !citedSolutions.has(observation.solution_authority_hash)) invalid();
  const citedViews = new Set(citedImages.map(image => image.camera.view_id));
  if (observation.view_ids.length !== citedViews.size
    || observation.view_ids.some(viewId => !citedViews.has(viewId))) invalid();
}

function assertObservationSemantics(observation) {
  if (observation.design_layer !== CRITERION_LAYERS[observation.criterion]
    || observation.limitations.length === 0) invalid();
  const prose = [observation.observable_paraphrase, ...observation.limitations];
  for (const text of prose) {
    for (const segment of text.split(CLAUSE_BOUNDARY).filter(Boolean)) {
      if (PROHIBITED_PREFERENCE.some(pattern => pattern.test(segment))) invalid();
      if (hasUnlicensedHiddenClaim(segment)) invalid();
    }
  }
  if (prose.some(text => INSUFFICIENT_EVIDENCE.some(pattern => pattern.test(text)))
    && observation.rating !== 'unknown') invalid();
  for (const region of observation.evidence_regions) assertNormalizedRegion(region);
}

function hasUnlicensedHiddenClaim(segment) {
  for (const pattern of PROHIBITED_HIDDEN_CLAIMS) {
    const expression = new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of segment.matchAll(expression)) {
      if (!claimIsExplicitlyNegated(segment, match.index)) return true;
    }
  }
  return false;
}

function claimIsExplicitlyNegated(segment, claimIndex) {
  const prefix = segment.slice(Math.max(0, claimIndex - 160), claimIndex);
  const bridge = String.raw`(?:\s+(?:the|an?|any|claimed|apparent|architect(?:'s)?|designer(?:'s)?|builder(?:'s)?|about|for|regarding)){0,8}\s*$`;
  return new RegExp(
    String.raw`\b(?:does\s+not|cannot|can't)\s+(?:establish|determine|show|confirm|verify)${bridge}`,
    'iu'
  ).test(prefix) || new RegExp(
    String.raw`\b(?:evidence\s+(?:is|remains|appears)\s+unclear|insufficient\s+(?:visual\s+)?evidence)${bridge}`,
    'iu'
  ).test(prefix);
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
