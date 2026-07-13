import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  STAGE7_PILOT_CASE_IDS,
  mergeStage7DatasetReviews,
  parseStage7DatasetReviewOverlay
} from './stage7DatasetReviewOverlay.js';
import { evaluateStage7V3ReviewScope } from './stage7DatasetReviewScopeV3.js';
import { hashCanonicalValue } from './coarseSemanticVoxelSchema.js';

const DEFAULT_DATASET_ROOT = 'mc_templates/datasets/coarse_semantic_voxels/v3';
const DEFAULT_REVIEW_OVERLAY = 'mc_templates/curation/stage7_dataset_reviews.jsonl';
const DEFAULT_ARTIFACT_ROOT = '.tmp/stage7-dataset/v3';
const TARGET_LAYERS = Object.freeze(['envelope', 'space', 'site']);
const SCOPE_CODE_MAP = Object.freeze({
  'v3-semantic-review-unbound': 'V3_REVIEW_UNBOUND',
  'v3-review-source-mismatch': 'V3_REVIEW_SOURCE_MISMATCH',
  'v3-review-extractor-mismatch': 'V3_REVIEW_EXTRACTOR_MISMATCH',
  'v3-review-plan-mismatch': 'V3_REVIEW_PLAN_MISMATCH',
  'v3-semantic-review-rejected': 'V3_REVIEW_LAYERS_REJECTED'
});

export async function auditStage7RealCaseReadiness({
  repositoryRoot = process.cwd(),
  datasetRoot = DEFAULT_DATASET_ROOT,
  reviewOverlayPath = DEFAULT_REVIEW_OVERLAY,
  artifactRoot = DEFAULT_ARTIFACT_ROOT
} = {}) {
  const root = path.resolve(repositoryRoot);
  const inputs = [];
  const globalBlockers = [];
  const manifestInput = await readInput({ root, requestedPath: path.join(datasetRoot, 'manifest.json'), inputs, globalBlockers });
  const casesInput = await readInput({ root, requestedPath: path.join(datasetRoot, 'cases.jsonl'), inputs, globalBlockers });
  const reviewInput = await readInput({ root, requestedPath: reviewOverlayPath, inputs, globalBlockers });
  const manifest = manifestInput ? parseJson(manifestInput, globalBlockers) : null;
  const records = casesInput ? parseJsonl(casesInput, globalBlockers) : null;
  const reviews = reviewInput ? parseReviews(reviewInput, globalBlockers) : null;
  const artifacts = await inspectArtifactRoot(root, artifactRoot);

  if (!manifest || !records || !reviews) return buildAudit({ inputs, globalBlockers, manifest, cases: [] });
  for (const caseId of ambiguousLatestReviewCaseIds(reviews)) {
    globalBlockers.push(blocker(
      'INPUT_AMBIGUOUS_REVIEW',
      reviewInput.source,
      `/case_id=${caseId}/reviewed_at`,
      'one uniquely latest review record',
      'multiple records share the latest reviewed_at'
    ));
  }
  const recordMap = new Map();
  for (const record of records) {
    const id = String(record?.case_id || '');
    if (!recordMap.has(id)) recordMap.set(id, []);
    recordMap.get(id).push(record);
  }
  const byReviewCase = mergeStage7DatasetReviews(reviews);
  const cases = [];
  for (const caseId of STAGE7_PILOT_CASE_IDS) {
    const matches = recordMap.get(caseId) || [];
    if (matches.length !== 1) {
      globalBlockers.push(blocker(
        matches.length ? 'INPUT_DUPLICATE_PILOT' : 'INPUT_MISSING_PILOT',
        casesInput.source,
        `/case_id=${caseId}`,
        'exactly one Dataset v3 pilot record',
        matches.length
      ));
      continue;
    }
    cases.push(await auditCase({
      record: matches[0],
      review: byReviewCase.get(caseId) || null,
      casesSource: casesInput.source,
      reviewSource: reviewInput.source,
      manifest,
      manifestSource: manifestInput.source,
      artifacts
    }));
  }
  return buildAudit({ inputs, globalBlockers, manifest, cases });
}

export function canonicalizeStage7RealCaseReadinessAudit(audit = {}) {
  return `${JSON.stringify(audit, null, 2)}\n`;
}

export function renderStage7RealCaseReadinessMarkdown(audit = {}) {
  const cases = (audit.cases || []).map((item) =>
    `| ${item.case_id} | ${item.gate_contribution ? 'yes' : 'no'} | ${(item.blockers || []).map((blocker) => blocker.code).join(', ') || 'none'} |`
  ).join('\n') || '| none | no | no evidence |';
  return `# Stage 7 Real-Case Readiness Audit

- Advisory only: ${audit.advisory_only ? 'yes' : 'no'}
- Mutates Dataset: ${audit.mutates_dataset ? 'yes' : 'no'}
- Authorizes training: ${audit.authorizes_training ? 'yes' : 'no'}
- Dataset v3 ready for M3 real data: ${audit.summary?.ready_for_m3_real_data ? 'yes' : 'no'}
- Dataset v3 training eligible count: ${audit.summary?.training_eligible_count ?? 0}

## Pilot blockers

| Case | Gate contribution | Blockers |
| --- | --- | --- |
${cases}
`;
}

function buildAudit({ inputs = [], globalBlockers = [], manifest = null, cases = [] }) {
  const eligibleAndAccepted = cases.filter((item) => item.training_eligible && item.semantic_accepted).length;
  const summary = {
    pilot_count: STAGE7_PILOT_CASE_IDS.length,
    present_count: cases.length,
    gate_contribution_count: cases.filter((item) => item.gate_contribution).length,
    required_eligible_semantic_accepted_count: 3,
    ready_for_m3_real_data: manifest?.ready_for_m3_real_data === true,
    training_eligible_count: Number(manifest?.training_eligible_count || 0),
    eligible_semantic_accepted_count: eligibleAndAccepted
  };
  return {
    source: 'stage7-real-case-readiness-audit-v1',
    schema_version: 1,
    advisory_only: true,
    mutates_dataset: false,
    authorizes_training: false,
    inputs: [...inputs].sort((left, right) => left.path.localeCompare(right.path)),
    global_blockers: [...globalBlockers].sort(compareBlockers),
    cases,
    summary
  };
}

async function auditCase({ record, review, casesSource, reviewSource, manifest, manifestSource, artifacts }) {
  const pointer = `/case_id=${record.case_id}`;
  const blockers = [];
  const addCase = (code, suffix, expected, actual) => blockers.push(blocker(code, casesSource, `${pointer}${suffix}`, expected, actual));
  const addReview = (code, suffix, expected, actual) => blockers.push(blocker(code, reviewSource, `${pointer}${suffix}`, expected, actual));
  if (!record.review?.reviewed_by) addCase('REVIEWER_IDENTITY_MISSING', '/review/reviewed_by', 'non-empty reviewer identity', record.review?.reviewed_by || '');
  if (!['approved', 'limited'].includes(record.review?.status)) addCase('REVIEW_DECISION_NOT_POSITIVE', '/review/status', 'approved or limited', record.review?.status || 'missing');
  if (!record.source?.license_evidence) addCase('LICENSE_EVIDENCE_MISSING', '/source/license_evidence', 'non-empty license evidence', record.source?.license_evidence || '');
  if (!record.source?.allowed_uses?.includes('local-training')) addCase('LICENSE_LOCAL_TRAINING_NOT_ALLOWED', '/source/allowed_uses', 'contains local-training', record.source?.allowed_uses || []);
  if (!record.review?.canonical_front_side) addCase('CANONICAL_FRONT_MISSING', '/review/canonical_front_side', 'north, south, east, or west', record.review?.canonical_front_side || null);
  for (const layer of TARGET_LAYERS) {
    if (!record.review?.approved_learning_areas?.includes(layer)) {
      addCase(`LEARNING_LAYER_${layer.toUpperCase()}_NOT_APPROVED`, '/review/approved_learning_areas', `contains ${layer}`, record.review?.approved_learning_areas || []);
    }
  }
  if (record.extraction?.semantic_status !== 'accepted') addCase('SEMANTIC_ACCEPTANCE_NOT_ACCEPTED', '/extraction/semantic_status', 'accepted', record.extraction?.semantic_status || 'missing');
  const scope = evaluateStage7V3ReviewScope({
    reviewRecord: review,
    sourceSha256: record.source?.sha256,
    extractorVersion: record.extraction?.extractor_version,
    reviewPlanSha256: record.artifacts?.review_plan_sha256
  });
  for (const code of scope.blockers) {
    addReview(SCOPE_CODE_MAP[code] || 'V3_REVIEW_UNBOUND', '', 'exact applicable Dataset v3 review scope', code);
  }
  if (manifest.ready_for_m3_real_data !== true) blockers.push(blocker('DATASET_GATE_CLOSED', manifestSource, '/ready_for_m3_real_data', true, manifest.ready_for_m3_real_data));
  if (record.training?.eligible !== true) addCase('GATE_CASE_NOT_ELIGIBLE', '/training/eligible', true, record.training?.eligible === true);
  const trainingEligible = record.training?.eligible === true;
  const semanticAccepted = record.extraction?.semantic_status === 'accepted';
  if (!(trainingEligible && semanticAccepted)) blockers.push(blocker('GATE_THRESHOLD_UNMET', manifestSource, '/training_eligible_count', 'at least three eligible and semantic-accepted pilot cases', 0));
  blockers.push(...await artifactBlockers(record, artifacts));
  return {
    case_id: record.case_id,
    training_eligible: trainingEligible,
    semantic_accepted: semanticAccepted,
    gate_contribution: false,
    blockers: blockers.sort(compareBlockers)
  };
}

async function inspectArtifactRoot(root, requestedPath) {
  const absolute = path.resolve(root, requestedPath);
  const source = sourceFor(root, absolute);
  if (!inside(root, absolute)) return { state: 'escape', absolute, source };
  let stat;
  try { stat = await fs.lstat(absolute); }
  catch { return { state: 'missing', absolute, source }; }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return { state: 'missing', absolute, source };
  return { state: 'ready', absolute, source, root };
}

async function artifactBlockers(record, artifacts) {
  const pointer = `/case_id=${record.case_id}/artifacts/local_plan_path`;
  if (artifacts.state === 'missing') return [blocker('LOCAL_ARTIFACT_ROOT_MISSING', artifacts.source, pointer, 'existing regular artifact root', 'missing')];
  if (artifacts.state === 'escape') return [blocker('LOCAL_ARTIFACT_PATH_ESCAPE', artifacts.source, pointer, 'artifact root inside repository root', artifacts.source.path)];
  const relative = String(record.artifacts?.local_plan_path || '');
  const absolute = path.resolve(artifacts.absolute, relative);
  if (!relative || !inside(artifacts.absolute, absolute)) {
    return [blocker('LOCAL_ARTIFACT_PATH_ESCAPE', artifacts.source, pointer, 'relative path inside artifact root', relative)];
  }
  const source = sourceFor(artifacts.root, absolute);
  let stat;
  try { stat = await fs.lstat(absolute); }
  catch { return [blocker('LOCAL_ARTIFACT_MISSING', source, pointer, 'existing regular local plan artifact', relative)]; }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return [blocker('LOCAL_ARTIFACT_PATH_ESCAPE', source, pointer, 'non-symbolic regular local plan artifact', relative)];
  }
  const bytes = await fs.readFile(absolute);
  let plan;
  try { plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return [blocker('LOCAL_ARTIFACT_INVALID_JSON', sourceFor(artifacts.root, absolute, bytes), pointer, 'valid UTF-8 JSON local plan artifact', relative)]; }
  const actualHash = hashCanonicalValue(plan);
  if (actualHash !== record.artifacts?.plan_sha256) {
    return [blocker('LOCAL_ARTIFACT_CANONICAL_HASH_MISMATCH', sourceFor(artifacts.root, absolute, bytes), pointer, record.artifacts?.plan_sha256 || 'recorded plan SHA-256', actualHash)];
  }
  return [];
}

async function readInput({ root, requestedPath, inputs, globalBlockers }) {
  const absolute = path.resolve(root, requestedPath);
  const source = sourceFor(root, absolute);
  if (!inside(root, absolute)) {
    globalBlockers.push(blocker('INPUT_PATH_ESCAPE', source, '', 'path inside repository root', requestedPath));
    return null;
  }
  let stat;
  try { stat = await fs.lstat(absolute); }
  catch {
    globalBlockers.push(blocker('INPUT_NOT_REGULAR_FILE', source, '', 'existing regular file', requestedPath));
    return null;
  }
  if (stat.isSymbolicLink()) {
    globalBlockers.push(blocker('INPUT_SYMLINK', source, '', 'non-symbolic regular file', requestedPath));
    return null;
  }
  if (!stat.isFile()) {
    globalBlockers.push(blocker('INPUT_NOT_REGULAR_FILE', source, '', 'regular file', requestedPath));
    return null;
  }
  const bytes = await fs.readFile(absolute);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch {
    globalBlockers.push(blocker('INPUT_INVALID_UTF8', sourceFor(root, absolute, bytes), '', 'valid UTF-8', 'invalid bytes'));
    return null;
  }
  const evidence = { path: sourceFor(root, absolute, bytes).path, sha256: sha256(bytes) };
  inputs.push(evidence);
  return { text, source: evidence };
}

function parseJson(input, globalBlockers) {
  try { return JSON.parse(input.text); }
  catch {
    globalBlockers.push(blocker('INPUT_INVALID_JSON', input.source, '', 'valid JSON', 'invalid JSON'));
    return null;
  }
}

function parseJsonl(input, globalBlockers) {
  try {
    return input.text.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
  } catch {
    globalBlockers.push(blocker('INPUT_INVALID_JSONL', input.source, '', 'valid JSONL', 'invalid JSONL'));
    return null;
  }
}

function parseReviews(input, globalBlockers) {
  try { return parseStage7DatasetReviewOverlay(input.text, { strict: true }).records; }
  catch {
    globalBlockers.push(blocker('INPUT_INVALID_JSONL', input.source, '', 'valid strict review JSONL', 'invalid review overlay'));
    return null;
  }
}

function ambiguousLatestReviewCaseIds(records) {
  const byCase = new Map();
  for (const record of records) {
    const caseId = String(record.case_id || '');
    if (!byCase.has(caseId)) byCase.set(caseId, []);
    byCase.get(caseId).push(record);
  }
  return [...byCase.entries()]
    .filter(([, items]) => {
      const latest = items.map((item) => item.reviewed_at).sort().at(-1);
      return items.filter((item) => item.reviewed_at === latest).length > 1;
    })
    .map(([caseId]) => caseId)
    .sort();
}

function blocker(code, source, pointer, expected, actual) {
  return {
    code,
    severity: 'blocker',
    source: { path: source.path, sha256: source.sha256, pointer },
    expected,
    actual
  };
}

function sourceFor(root, absolute, bytes = Buffer.alloc(0)) {
  return { path: path.relative(root, absolute).split(path.sep).join('/'), sha256: sha256(bytes) };
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function inside(root, candidate) { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }
function compareBlockers(left, right) { return left.code.localeCompare(right.code) || left.source.pointer.localeCompare(right.source.pointer); }
