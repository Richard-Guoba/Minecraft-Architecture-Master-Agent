# Stage 7 Real-Case Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch agents: this task is explicitly sequential.

**Goal:** Build a deterministic, read-only Node tool that audits the six Dataset v3 pilots and emits canonical JSON/Markdown blocker reports without authorizing training.

**Architecture:** A pure learning-layer module safely reads and validates v3 metadata, review records, and optional local plan evidence into one canonical audit object. A minimal CLI parses paths and atomically writes the JSON/Markdown rendering outside Dataset roots. The renderer derives only from the audit object; all training, Dataset, provider, and Apply behavior remains untouched.

**Tech Stack:** Node.js ESM, built-in `node:assert`, `node:crypto`, `node:fs/promises`, `node:path`, and the existing Stage 7 review/scope/schema contracts.

## Global Constraints

- Use Node.js `24.18.0`; add no runtime dependency and no Python import.
- Audit exactly `STAGE7_PILOT_CASE_IDS`, in declared order; reject any case-selection option.
- Every root result must contain `advisory_only: true`, `mutates_dataset: false`, and `authorizes_training: false`.
- Never modify Dataset v1/v2/v3, review records, `ready_for_m3_real_data`, `training_eligible_count`, training eligibility, primary operations, or M4 Apply Mode.
- Reject symbolic links, non-regular input files, invalid UTF-8, path escape, malformed JSON/JSONL, duplicate/missing pilots, and ambiguous reviews fail-closed.
- Every assertion has stable code, normalized repository-relative source path, input-byte SHA-256, and JSON pointer when the source was parsed.
- Output goes only to an explicit `--out` directory outside all Dataset roots; no push, no real-data tensors/training, and no parallel agents.

---

### Task 1: Establish the canonical audit contract and deterministic renderer

**Files:**
- Create: `src/construction/learning/stage7RealCaseReadinessAudit.js`
- Create: `test/stage7RealCaseReadinessAudit.test.js`

**Interfaces:**
- Produces: `auditStage7RealCaseReadiness(options)`, `canonicalizeStage7RealCaseReadinessAudit(audit)`, and `renderStage7RealCaseReadinessMarkdown(audit)`.
- Consumes later: a canonical audit object with root claims, `inputs`, `global_blockers`, `cases`, and `summary`.

- [ ] **Step 1: Write the first failing deterministic-contract test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeStage7RealCaseReadinessAudit,
  renderStage7RealCaseReadinessMarkdown
} from '../src/construction/learning/stage7RealCaseReadinessAudit.js';

test('canonical readiness audit serialization and Markdown are deterministic', () => {
  const audit = {
    advisory_only: true, mutates_dataset: false, authorizes_training: false,
    inputs: [], global_blockers: [], cases: [],
    summary: { gate_contribution_count: 0, ready_for_m3_real_data: false, training_eligible_count: 0 }
  };
  const first = canonicalizeStage7RealCaseReadinessAudit(audit);
  assert.equal(first, canonicalizeStage7RealCaseReadinessAudit(structuredClone(audit)));
  assert.match(first, /\n$/);
  assert.match(renderStage7RealCaseReadinessMarkdown(audit), /Advisory only: yes/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7RealCaseReadinessAudit.test.js
```

Expected: failure because `stage7RealCaseReadinessAudit.js` does not exist.

- [ ] **Step 3: Implement the smallest pure canonicalization and renderer**

```js
export function canonicalizeStage7RealCaseReadinessAudit(audit = {}) {
  return `${JSON.stringify(audit, null, 2)}\n`;
}

export function renderStage7RealCaseReadinessMarkdown(audit = {}) {
  return `# Stage 7 Real-Case Readiness Audit\n\n- Advisory only: ${audit.advisory_only ? 'yes' : 'no'}\n- Mutates Dataset: ${audit.mutates_dataset ? 'yes' : 'no'}\n- Authorizes training: ${audit.authorizes_training ? 'yes' : 'no'}\n`;
}
```

Keep this renderer free of evidence loading and gate computation.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run the command from Step 2. Expected: `1` passing test, `0` failures.

- [ ] **Step 5: Commit the contract**

```bash
git add src/construction/learning/stage7RealCaseReadinessAudit.js test/stage7RealCaseReadinessAudit.test.js
git commit -m "feat(stage7): add readiness audit contract"
```

### Task 2: Add validated v3 evidence loading and per-case blocker derivation

**Files:**
- Modify: `src/construction/learning/stage7RealCaseReadinessAudit.js`
- Modify: `test/stage7RealCaseReadinessAudit.test.js`

**Interfaces:**
- Consumes: `STAGE7_PILOT_CASE_IDS`, strict overlay parse/merge, v3 review-scope evaluation, and canonical hashing.
- Produces: `await auditStage7RealCaseReadiness({ datasetRoot, reviewOverlayPath, artifactRoot, repositoryRoot })` with six ordered cases and sorted blocker assertions.

- [ ] **Step 1: Add failing tests for current v3 metadata and independent blocker categories**

```js
test('audit reports current pilots as advisory and preserves the closed Dataset gate', async () => {
  const audit = await auditStage7RealCaseReadiness({
    datasetRoot: 'mc_templates/datasets/coarse_semantic_voxels/v3',
    reviewOverlayPath: 'mc_templates/curation/stage7_dataset_reviews.jsonl',
    artifactRoot: '.tmp/stage7-audit-missing-artifacts', repositoryRoot: process.cwd()
  });
  assert.equal(audit.cases.length, 6);
  assert.equal(audit.authorizes_training, false);
  assert.equal(audit.summary.ready_for_m3_real_data, false);
  assert.equal(audit.summary.training_eligible_count, 0);
  for (const item of audit.cases) {
    assert.equal(item.gate_contribution, false);
    assert.ok(item.blockers.some((blocker) => blocker.code === 'REVIEW_DECISION_NOT_POSITIVE'));
    assert.ok(item.blockers.some((blocker) => blocker.code === 'LICENSE_LOCAL_TRAINING_NOT_ALLOWED'));
    assert.ok(item.blockers.some((blocker) => blocker.source.path));
    assert.match(item.blockers[0].source.sha256, /^[a-f0-9]{64}$/);
  }
});
```

Add focused temporary-fixture tests for `REVIEWER_IDENTITY_MISSING`, each three `LEARNING_LAYER_*_NOT_APPROVED` code, `SEMANTIC_ACCEPTANCE_NOT_ACCEPTED`, each `V3_REVIEW_*` mismatch, duplicate/missing pilot, invalid UTF-8, invalid JSONL, and ambiguous latest review.

- [ ] **Step 2: Run the focused file to verify RED**

Run the command from Task 1 Step 2. Expected: failure because `auditStage7RealCaseReadiness` is not exported.

- [ ] **Step 3: Implement the evidence boundary and audit derivation**

Implement these helpers in the audit module:

```js
class AuditInputError extends Error {
  constructor(code, source, detail) {
    super(detail);
    this.code = code;
    this.source = source;
  }
}

function assertion(code, source, expected, actual) {
  return {
    code, severity: 'blocker',
    source: { path: source.path, sha256: source.sha256, pointer: source.pointer || '' },
    expected, actual
  };
}

function sourceFor(file, bytes = Buffer.alloc(0), repositoryRoot = process.cwd()) {
  const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
  return {
    path: relative,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pointer: ''
  };
}

async function readRegularUtf8File(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new AuditInputError('INPUT_PATH_ESCAPE', { path: relativePath, sha256: '', pointer: '' }, 'path escapes root');
  }
  const stat = await fs.lstat(resolved);
  if (stat.isSymbolicLink()) throw new AuditInputError('INPUT_SYMLINK', sourceFor(resolved), 'symbolic links are forbidden');
  if (!stat.isFile()) throw new AuditInputError('INPUT_NOT_REGULAR_FILE', sourceFor(resolved), 'regular file required');
  const bytes = await fs.readFile(resolved);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new AuditInputError('INPUT_INVALID_UTF8', sourceFor(resolved, bytes), 'valid UTF-8 required'); }
  return { bytes, text, source: sourceFor(resolved, bytes) };
}

function parseCanonicalJson(text, source) {
  try { return JSON.parse(text); }
  catch { throw new AuditInputError('INPUT_INVALID_JSON', source, 'valid JSON required'); }
}

function parseCanonicalJsonl(text, source) {
  return text.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new AuditInputError('INPUT_INVALID_JSONL', { ...source, pointer: `/line=${index + 1}` }, 'valid JSONL required'); }
  });
}

function auditPilot(record, review, source) {
  const blockers = [];
  const add = (code, pointer, expected, actual) => blockers.push(assertion(code, { ...source, pointer }, expected, actual));
  if (!record.review?.reviewed_by) add('REVIEWER_IDENTITY_MISSING', '/review/reviewed_by', 'non-empty reviewer identity', record.review?.reviewed_by || '');
  if (!['approved', 'limited'].includes(record.review?.status)) add('REVIEW_DECISION_NOT_POSITIVE', '/review/status', 'approved or limited', record.review?.status || 'missing');
  if (!record.source?.license_evidence) add('LICENSE_EVIDENCE_MISSING', '/source/license_evidence', 'non-empty evidence', record.source?.license_evidence || '');
  if (!record.source?.allowed_uses?.includes('local-training')) add('LICENSE_LOCAL_TRAINING_NOT_ALLOWED', '/source/allowed_uses', 'contains local-training', record.source?.allowed_uses || []);
  for (const layer of ['envelope', 'space', 'site']) if (!record.review?.approved_learning_areas?.includes(layer)) add(`LEARNING_LAYER_${layer.toUpperCase()}_NOT_APPROVED`, '/review/approved_learning_areas', `contains ${layer}`, record.review?.approved_learning_areas || []);
  if (!record.review?.canonical_front_side) add('CANONICAL_FRONT_MISSING', '/review/canonical_front_side', 'north, south, east, or west', record.review?.canonical_front_side || null);
  if (record.extraction?.semantic_status !== 'accepted') add('SEMANTIC_ACCEPTANCE_NOT_ACCEPTED', '/extraction/semantic_status', 'accepted', record.extraction?.semantic_status || 'missing');
  return { case_id: record.case_id, blockers: blockers.sort((a, b) => a.code.localeCompare(b.code)) };
}
```

Use `parseStage7DatasetReviewOverlay(text, { strict: true })` then `mergeStage7DatasetReviews(records)`. Validate that each v3 pilot appears exactly once. Derive exact scope blockers by calling `evaluateStage7V3ReviewScope` with the record's source hash, extractor version, and `review_plan_sha256`; map its existing blocker strings to the documented `V3_REVIEW_*` vocabulary. Record `DATASET_GATE_CLOSED`, `GATE_CASE_NOT_ELIGIBLE`, and `GATE_THRESHOLD_UNMET` without mutating or re-computing the manifest gate.

- [ ] **Step 4: Run the focused file to verify GREEN**

Run the command from Task 1 Step 2. Expected: all Task 1/2 tests pass with no skip or todo.

- [ ] **Step 5: Commit the evidence audit**

```bash
git add src/construction/learning/stage7RealCaseReadinessAudit.js test/stage7RealCaseReadinessAudit.test.js
git commit -m "feat(stage7): audit real-case readiness evidence"
```

### Task 3: Verify local plan evidence and implement the safe CLI

**Files:**
- Modify: `src/construction/learning/stage7RealCaseReadinessAudit.js`
- Create: `src/auditStage7RealCaseReadiness.js`
- Modify: `package.json`
- Modify: `test/stage7RealCaseReadinessAudit.test.js`

**Interfaces:**
- Consumes: the Task 2 audit object plus local `artifacts.local_plan_path` and `artifacts.plan_sha256`.
- Produces: `parseStage7RealCaseReadinessArgs(argv)`, exported `main(argv)`, and a CLI that writes the exact JSON/Markdown pair atomically.

- [ ] **Step 1: Add failing artifact and CLI tests**

```js
test('local artifact canonical hash mismatch cannot contribute to readiness', async () => {
  const audit = await auditStage7RealCaseReadiness({ ...fixturePaths, artifactRoot: fixturePaths.artifactRoot });
  assert.ok(audit.cases[0].blockers.some((item) => item.code === 'LOCAL_ARTIFACT_CANONICAL_HASH_MISMATCH'));
  assert.equal(audit.cases[0].gate_contribution, false);
});

test('CLI rejects Dataset output and leaves Dataset bytes unchanged', async () => {
  const before = await datasetBytes();
  await assert.rejects(() => main(['--out', fixturePaths.datasetRoot]), /outside Dataset roots/);
  assert.deepEqual(await datasetBytes(), before);
});
```

Also cover missing artifact root, escaped `local_plan_path`, symlink artifact, malformed artifact JSON, a successful temporary output pair, and byte-identical repeat output.

- [ ] **Step 2: Run the focused file to verify RED**

Run the command from Task 1 Step 2. Expected: failure because no artifact verifier or CLI exists.

- [ ] **Step 3: Implement local artifact checks and CLI**

For every local plan path, resolve it under `artifactRoot`, read it through the Task 2 regular-file guard, parse UTF-8 JSON, compute raw-byte SHA-256, and compare `hashCanonicalValue(parsedPlan)` to the v3 record `plan_sha256`. Emit only `LOCAL_ARTIFACT_*` blockers on failure.

Implement CLI parsing with this exact help surface:

```text
Usage: npm run audit:stage7:readiness -- --out <directory> [options]

  --dataset-root <directory>
  --review-overlay <file>
  --artifact-root <directory>
  --out <directory>
  --help
```

Reject unknown, duplicate, missing-value, and case-selection flags. Resolve and reject every output path inside `coarse_semantic_voxels/v1`, `/v2`, or `/v3`. Write the canonical JSON and Markdown to a sibling temporary directory, then rename it into `--out`; remove only the temporary directory created by this invocation on failure. Add:

```json
"audit:stage7:readiness": "node src/auditStage7RealCaseReadiness.js"
```

to `package.json`.

- [ ] **Step 4: Run focused tests and CLI to verify GREEN**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7RealCaseReadinessAudit.test.js
/home/guoba/.nvm/versions/node/v24.18.0/bin/node src/auditStage7RealCaseReadiness.js --out .tmp/stage7-real-case-readiness-audit
```

Expected: focused tests have `0` failures and the CLI reports advisory-only, false authorization; the Dataset roots remain unmodified.

- [ ] **Step 5: Commit the CLI**

```bash
git add src/construction/learning/stage7RealCaseReadinessAudit.js src/auditStage7RealCaseReadiness.js package.json test/stage7RealCaseReadinessAudit.test.js
git commit -m "feat(stage7): add real-case readiness audit CLI"
```

### Task 4: Prove immutable inputs and complete project verification

**Files:**
- Modify: `test/stage7RealCaseReadinessAudit.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: final CLI and canonical report pair.
- Produces: explicit executable documentation and regression tests that prove the audit is advisory-only and Dataset bytes remain unchanged.

- [ ] **Step 1: Add failing immutable-input and documentation assertions**

```js
test('module and CLI preserve every Dataset v1 v2 and v3 byte and pilot approval', async () => {
  const before = await snapshotDatasetBytesAndPilotFields();
  await auditStage7RealCaseReadiness(fixturePaths);
  await main(['--out', fixturePaths.outputRoot, ...fixtureArgs]);
  assert.deepEqual(await snapshotDatasetBytesAndPilotFields(), before);
});
```

Add an assertion that the public README command includes `audit:stage7:readiness` and states that the report cannot authorize training.

- [ ] **Step 2: Run the focused test to verify RED**

Run the command from Task 1 Step 2. Expected: failure because README does not document the audit command.

- [ ] **Step 3: Add minimal documentation and complete the regression test**

Document the Node-only command, required `--out`, advisory-only claims, and explicit prohibition on Dataset mutation/real training in the Stage 7 section of `README.md`. Do not revise existing gate values or M4 wording.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7RealCaseReadinessAudit.test.js
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
git diff --exit-code -- mc_templates/datasets/coarse_semantic_voxels/v1 mc_templates/datasets/coarse_semantic_voxels/v2 mc_templates/datasets/coarse_semantic_voxels/v3
git diff --check
```

Expected: focused and full Node suites have `0` failures; manifest hashes remain `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`, `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`, and `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`; Dataset diff and whitespace check exit 0.

- [ ] **Step 5: Commit the regression proof and docs**

```bash
git add test/stage7RealCaseReadinessAudit.test.js README.md
git commit -m "docs(stage7): document readiness audit safeguards"
```
