# Architecture Playbook P6 Fixed-View Blind Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P6 evaluation prerequisite: a frozen four-solution cohort, deterministic six-view reference renders, validated Minecraft capture imports, image-grounded categorical observations, six anonymous pairwise preferences, and a gate report that decides whether P7 may begin.

**Architecture:** Add a one-way `src/playbook/p6/` consumer of immutable P5 and baseline artifacts. Keep protocol validation and evaluation logic pure; isolate filesystem authority in `storage.js`; use a dependency-free deterministic PNG renderer for automated evidence; and make Minecraft capture and human preference collection explicit stop points. P6 never enters the default construction pipeline and never mutates a Minecraft world without authorization for the exact disposable target.

**Tech Stack:** Node.js 20+ ESM, `node:test`, existing canonical JSON/SHA-256 helpers, existing P5 owned-tree/storage primitives, `node:zlib` for PNG encoding, Markdown/JSON protocol assets.

**Spec:** `docs/superpowers/specs/2026-08-30-architecture-playbook-p6-fixed-view-blind-comparison-design.md`

## Global Constraints

- Work only on branch `agent/architecture-playbook-p6` in `.worktrees/architecture-playbook-p6`.
- Follow red/green/refactor for every behavior change. Record the expected red failure before implementation and rerun the focused test after implementation.
- Use fresh implementation agents task-by-task. After every task, run an independent spec-compliance review and then an independent code-quality review; resolve findings before the next task.
- P6 may import P5 and canonical helpers. P5, P4, `src/pipeline.js`, and the default CLI must not import P6.
- No test may call a live model, open Minecraft, write to a user world, or depend on WSL v9fs behavior.
- No scalar aesthetic score may be introduced. Visual ratings remain `strong | usable | weak | fail | unknown`; preferences remain `left | right | tie`.
- Generated run data, screenshots, private identity maps, and worlds remain under ignored `out/` paths. Checked-in files contain only protocol definitions, schemas, tests, code, and the final evidence report once real evidence exists.
- All persisted JSON uses `stableJson`; all authority bindings use SHA-256 over exact bytes.
- Reject unknown object fields and fail closed with a stable P6 error code. Public errors must not expose host paths, private identities, or raw filesystem errors.
- Real-world capture and human pairwise choices are operational checkpoints. Stop and request authorization/input at those steps.

## Public Contracts and Error Vocabulary

The modules below share these exact exports unless a task's tests demonstrate a necessary correction:

```js
export const P6_SCHEMA_VERSION = 1;
export const P6_PROTOCOL_VERSION = '0.1.0';
export const P6_MINECRAFT_VERSION = '1.21.9';
export const P6_ROOT_SEED = 424242;
export const P6_VIEW_IDS = Object.freeze([
  'front-south', 'side-east', 'quarter-southeast',
  'quarter-southwest', 'roof-birdseye', 'entry-eye'
]);
export const P6_RATINGS = Object.freeze(['strong', 'usable', 'weak', 'fail', 'unknown']);
export const P6_PREFERENCES = Object.freeze(['left', 'right', 'tie']);

export class PlaybookP6Error extends Error {}
export function p6Error(code) {}
export function sanitizeP6Error(error, fallback = 'P6_GATE_FAILED') {}
```

Stable error codes:

```text
P6_OPTIONS_INVALID
P6_COHORT_INCOMPLETE
P6_AUTHORITY_INVALID
P6_CAMERA_PROTOCOL_INVALID
P6_RENDER_FAILED
P6_CAPTURE_AUTHORIZATION_REQUIRED
P6_CAPTURE_INVALID
P6_OBSERVATION_INVALID
P6_COMPARISON_INVALID
P6_HUMAN_PREFERENCE_REQUIRED
P6_GATE_FAILED
P6_INSTALL_FAILED
```

---

## Task 1: Check In the Frozen Protocol and Strict Contracts

**Files:**

- Create: `src/playbook/p6/constants.js`
- Create: `src/playbook/p6/contracts.js`
- Create: `docs/architecture-playbook/evaluation/p6-v0.1/fixed-request.json`
- Create: `docs/architecture-playbook/evaluation/p6-v0.1/visual-settings.json`
- Create: `docs/architecture-playbook/evaluation/p6-v0.1/observation-criteria.json`
- Create: `docs/architecture-playbook/evaluation/p6-v0.1/camera-protocol.json`
- Create: `docs/architecture-playbook/evaluation/p6-v0.1/reason-tags.json`
- Create: `docs/architecture-playbook/evaluation/p6-v0.1/schemas/*.schema.json`
- Create: `test/playbookP6Contracts.test.js`

- [ ] **Step 1: Write failing contract tests**

Cover exact-field rejection, stable errors, canonical round trips, immutable returns, the frozen prompt/seed/version, six unique view IDs, categorical-only ratings, three preference values, and protocol-file hashes. Include a test that scans P6 sources and checked-in protocol JSON for forbidden score fields such as `aesthetic_score`, `visual_score`, and `weighted_score`.

```js
test('fixed request is exact and immutable', () => {
  const request = validateFixedRequest(P6_FIXED_REQUEST);
  assert.equal(request.prompt, P6_FIXED_PROMPT);
  assert.equal(request.root_seed, 424242);
  assert.equal(request.minecraft_version, '1.21.9');
  assert.throws(() => { request.root_seed = 1; }, TypeError);
});

test('unknown fields fail closed', () => {
  assert.throws(
    () => validateFixedRequest({ ...P6_FIXED_REQUEST, score: 99 }),
    error => error.code === 'P6_OPTIONS_INVALID'
  );
});
```

- [ ] **Step 2: Run the focused test and confirm red**

Run: `node --test --test-isolation=none test/playbookP6Contracts.test.js`

Expected: FAIL because `src/playbook/p6/contracts.js` does not exist.

- [ ] **Step 3: Implement constants, strict validators, and protocol JSON**

Use `deepFreeze`, `stableJson`, and `sha256` from `src/playbook/shadow/canonical.js`. Implement exact-key validation locally rather than loosening P5 validators.

Required exports:

```js
export function validateFixedRequest(value) {}
export function validateVisualSettings(value) {}
export function validateCohortManifest(value) {}
export function validateCameraManifest(value) {}
export function validateCaptureManifest(value) {}
export function validateObservation(value) {}
export function validateComparisonManifest(value) {}
export function validatePreferenceRecord(value) {}
export function validateGateResult(value) {}
export function canonicalP6(value, validator) {
  const validated = validator(value);
  const bytes = stableJson(validated);
  return deepFreeze({ value: validated, bytes, sha256: sha256(bytes) });
}
```

The request JSON must contain the exact approved prompt, root seed `424242`, playbook version `0.1.0`, Minecraft version `1.21.9`, mode `mock`, `candidate_count: 3`, `candidate_rounds: 1`, and `candidate_force_rounds: false`. The settings JSON must encode 1920×1080, horizontal FOV 70, clear weather, time 6000, 16:9, fancy graphics, clouds off, default resources/no shaders, and hidden overlays. `camera-protocol.json` records the six formulas and decimal policy. `reason-tags.json` contains exactly `massing`, `hierarchy`, `silhouette`, `roof`, `facade`, `materials`, `detail`, `scene`, `style-consistency`, and `capture-uncertainty`. JSON Schemas mirror every persisted public contract and set `additionalProperties: false`.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `node --test --test-isolation=none test/playbookP6Contracts.test.js`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `feat: define P6 evaluation protocol contracts`

---

## Task 2: Compile and Preflight the Four-Solution Cohort

**Files:**

- Create: `src/playbook/p6/cohort.js`
- Create: `test/fixtures/playbookP6.js`
- Create: `test/playbookP6Cohort.test.js`
- Modify: `src/playbook/p6/contracts.js`

- [ ] **Step 1: Build disposable P5/baseline fixture authorities**

The fixture helper must construct files beneath `t.mock`/`mkdtemp` roots using the same P5 contracts and storage APIs as production. It returns byte snapshots, not mutable paths, and can independently corrupt a slot, checkpoint, hard-QA result, entry, hash, symlink, or baseline provenance.

```js
export async function createP6CohortFixture(t, overrides = {}) {
  const authorities = [playbookAuthority, baselineAuthority];
  return Object.freeze({
    fixedRequest,
    playbookAuthority,
    baselineAuthority,
    close: async () => {
      for (const authority of authorities) await authority.close();
    }
  });
}
```

- [ ] **Step 2: Write failing cohort tests**

Cover the exact IDs `playbook-candidate-01..03` and `baseline-current`; one P5 run only; identical request/seed/commit/Minecraft/options; P5 current chain and all five checkpoints; hard QA; canonical blueprint/operations/build function; south entry; regular non-symlink authority files; explicit `playbook=off`; input hashes; selection rank as informational only; and every blocking error in the design.

```js
test('compileP6Cohort binds the exact four solutions', async t => {
  const fixture = await createP6CohortFixture(t);
  const cohort = compileP6Cohort({
    fixedRequest: fixture.fixedRequest,
    playbook: fixture.playbookAuthority,
    baseline: fixture.baselineAuthority
  });
  assert.deepEqual(cohort.solutions.map(row => row.solution_id), [
    'playbook-candidate-01', 'playbook-candidate-02',
    'playbook-candidate-03', 'baseline-current'
  ]);
  assert.equal(cohort.solutions.length, 4);
});
```

- [ ] **Step 3: Run tests and confirm red**

Run: `node --test --test-isolation=none test/playbookP6Cohort.test.js`

Expected: FAIL because `compileP6Cohort` is unavailable.

- [ ] **Step 4: Implement pure cohort compilation**

```js
export function compileP6Cohort({ fixedRequest, playbook, baseline }) {}
export function validateP6SolutionAuthority(value, expected) {}
export function resolveSouthEntry({ blueprint, operations }) {}
export function hashCohortInputs({ fixedRequest, solutions }) {}
```

The authority objects supplied to the pure compiler must already contain exact bytes and stat evidence captured by storage code. `compileP6Cohort` must never read from ambient paths. Record advisory rule eligibility without treating it as preference or hard-QA authority. Reject a missing P5 slot; never backfill it.

- [ ] **Step 5: Add one-way dependency regression tests**

Extend the test to walk imports reachable from `src/playbook/execute/`, `src/playbook/review/`, and `src/pipeline.js`; assert none resolve under `src/playbook/p6/`. Also assert the baseline route remains `playbook=off` and imports no P6 evaluator.

- [ ] **Step 6: Run focused and upstream tests**

Run:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js test/playbookP6Cohort.test.js
node --test --test-isolation=none test/playbookExecuteGate.test.js test/playbookExecuteOrchestrator.test.js
```

Expected: PASS.

- [ ] **Step 7: Review and commit**

Commit: `feat: freeze and validate P6 comparison cohort`

---

## Task 3: Derive the Six Cameras and Render Deterministic PNG References

**Files:**

- Create: `src/playbook/p6/cameras.js`
- Create: `src/playbook/p6/png.js`
- Create: `src/playbook/p6/offlineRenderer.js`
- Create: `test/playbookP6Cameras.test.js`
- Create: `test/playbookP6OfflineRenderer.test.js`

- [ ] **Step 1: Write failing camera tests**

Test inclusive bounds, six-decimal strings, exact approved formulas, player eye height for `entry-eye`, south orientation, identical per-view framing expansion across all four solutions, and invalid/empty geometry. Use asymmetric bounds so east/west mistakes are visible.

```js
const manifest = deriveFixedViewManifest({
  solutionId: 'playbook-candidate-01',
  blueprintSha256: 'a'.repeat(64),
  bounds: { minX: 0, minY: 4, minZ: 10, maxX: 20, maxY: 19, maxZ: 34 },
  mainEntry: { x: 10, y: 5, z: 34, facing: 'south' },
  sharedFraming: null
});
assert.deepEqual(manifest.views.map(view => view.view_id), P6_VIEW_IDS);
```

- [ ] **Step 2: Confirm camera tests red**

Run: `node --test --test-isolation=none test/playbookP6Cameras.test.js`

Expected: FAIL because `cameras.js` does not exist.

- [ ] **Step 3: Implement camera derivation**

```js
export function deriveSharedFraming({ solutions, horizontalFovDegrees = 70, aspect = '16:9' }) {}
export function deriveFixedViewManifest({
  solutionId, blueprintSha256, bounds, mainEntry, sharedFraming
}) {}
export function decimal6(number) {
  if (!Number.isFinite(number)) throw p6Error('P6_CAMERA_PROTOCOL_INVALID');
  return number.toFixed(6);
}
```

Compute shared framing before individual manifests. Any clipping correction is one uniform multiplier per view ID across the cohort and is recorded in every camera manifest.

- [ ] **Step 4: Write failing renderer and PNG tests**

Assert valid PNG signature/IHDR, exact 1920×1080, deterministic bytes and hash across two runs, different hashes after a visible operation change, non-background pixels, six images per solution, frozen material-role colors, stable depth ordering, and rejection of operations outside validated bounds. Add a compact golden hash fixture for one tiny blueprint; store only the expected hash in the test.

- [ ] **Step 5: Confirm renderer tests red**

Run: `node --test --test-isolation=none test/playbookP6OfflineRenderer.test.js`

Expected: FAIL because `offlineRenderer.js` does not exist.

- [ ] **Step 6: Implement a dependency-free deterministic renderer**

`png.js` must implement PNG signature, IHDR, unfiltered RGBA scanlines, zlib compression with fixed options, IDAT, IEND, and CRC32. The renderer rasterizes exposed faces of canonical block/cuboid operations using a deterministic perspective projection derived from the fixed camera and the frozen 70-degree horizontal FOV, a z-buffer, integer pixel coverage, and a frozen role palette. It must not use browser canvas, GPU APIs, fonts, Minecraft assets, timestamps, random values, or host-dependent metadata.

```js
export function encodeRgbaPng({ width, height, rgba }) {}
export function inspectPngHeader(bytes) {}

export function renderReferenceView({
  blueprint, operations, camera, settings, palette = P6_REFERENCE_PALETTE
}) {}

export function renderReferenceViews({
  solution, cameraManifest, settings
}) {
  // Returns [{ view_id, filename, bytes, sha256, width, height }].
}
```

To control memory, allocate one RGBA buffer and one depth buffer per view, release them before the next solution, and never retain decoded pixels in the manifest.

- [ ] **Step 7: Run focused tests twice**

Run:

```bash
node --test --test-isolation=none test/playbookP6Cameras.test.js test/playbookP6OfflineRenderer.test.js
node --test --test-isolation=none test/playbookP6OfflineRenderer.test.js
```

Expected: both runs PASS with the same golden hash.

- [ ] **Step 8: Review and commit**

Commit: `feat: render deterministic P6 reference views`

---

## Task 4: Publish P6 Outputs Under Hardened Ownership

**Files:**

- Create: `src/playbook/p6/storage.js`
- Create: `test/playbookP6Storage.test.js`
- Modify: `src/playbook/p6/cohort.js`

- [ ] **Step 1: Write adversarial storage tests**

Cover creation beneath a caller-supplied run directory, immutable `generation-000001` publication, atomic `current` pointer replacement, no-overwrite moves, exact managed paths, regular-file checks, symlink/hardlink substitution, ancestor replacement, stale handles, crash-before-publish, competing publishers, unknown files, path redaction, and recursive cleanup only for directories bound by P6 ownership markers.

- [ ] **Step 2: Confirm red**

Run: `node --test --test-isolation=none test/playbookP6Storage.test.js`

Expected: FAIL because P6 storage exports are missing.

- [ ] **Step 3: Implement storage using existing primitives**

Reuse `createBoundDirectory`, `openBoundDirectory`, `retireBoundEntry`, and `removeOwnedTree` from `src/playbook/execute/ownedTree.js`, plus `moveIdentityNoReplace` from `src/playbook/execute/storageTransaction.js`. Do not copy or weaken their checks.

```js
export async function createP6Run({ runDir, fsImpl } = {}) {}
export async function admitP6Run({ p6Dir, fsImpl } = {}) {}
export async function readP6InputAuthority({ authority, relativePath }) {}
export async function publishP6Generation({ authority, kind, files }) {}
export async function readCurrentP6Generation({ authority, kind }) {}
```

Kinds map exactly to the approved output directories: `cohort`, `reference-renders`, `capture-session`, `minecraft-captures`, `observations`, `blind-comparison`, and `gate`. Preference drafts, sealed preferences, and identity files live under marked private or public generations within `blind-comparison` as appropriate; the identity map and drafts are excluded from public manifests and reports.

- [ ] **Step 4: Connect cohort admission to snapshotted bytes**

Add:

```js
export async function admitP6CohortInputs({
  p6Authority, playbookRunDir, baselineRunDir, fixedRequestPath
}) {}
```

Open P5 authorities using `admitExecuteRun`; capture stat/identity evidence and bytes while the handles are live; close them in `finally`; pass only snapshots into `compileP6Cohort`.

- [ ] **Step 5: Run focused and P5 storage regressions**

Run:

```bash
node --test --test-isolation=none test/playbookP6Storage.test.js test/playbookP6Cohort.test.js
node --test --test-isolation=none test/playbookExecuteStorage.test.js
```

Expected: PASS.

- [ ] **Step 6: Review and commit**

Commit: `feat: add owned P6 output publication`

---

## Task 5: Add the Safe P6 CLI and Reference-Preparation Flow

**Files:**

- Create: `src/runArchitecturePlaybookP6.js`
- Create: `test/playbookP6Cli.test.js`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write failing CLI tests**

Test `prepare` with explicit `--playbook-run`, `--baseline-run`, and `--run-dir`; fixed protocol only; sanitized errors; non-zero failure; JSON summary on success; no default-pipeline mutation; no Minecraft launch; and refusal of `capture` without exact authorization. Spawn tests must use disposable POSIX paths.

```text
npm run playbook:p6 -- prepare \
  --playbook-run <p5-run> \
  --baseline-run <baseline-run> \
  --run-dir <run-dir>
```

- [ ] **Step 2: Confirm red**

Run: `node --test --test-isolation=none test/playbookP6Cli.test.js`

Expected: FAIL because the CLI entry point does not exist.

- [ ] **Step 3: Implement CLI orchestration**

```js
export async function runP6Cli(argv, deps = defaultDependencies) {}
export function parseP6Args(argv) {}
```

The `prepare` action admits inputs, compiles and publishes the cohort, derives shared cameras, renders and publishes 24 reference PNGs, and prepares—but does not execute—the Minecraft capture session. It emits only hashes, relative output names, and the next required action. Add `"playbook:p6": "node src/runArchitecturePlaybookP6.js"`.

Any action capable of changing a world must require all of:

```text
--authorize-disposable-world
--world <exact path>
--expected-world-identity <sha256>
```

In this task, such an action still returns `P6_CAPTURE_AUTHORIZATION_REQUIRED`; actual capture is deliberately outside automated implementation.

- [ ] **Step 4: Document the boundary**

README instructions must distinguish `reference-render` from formal Minecraft evidence, state that the command does not launch Minecraft, identify ignored output locations, and explain the later authorization and human-choice checkpoints.

- [ ] **Step 5: Run tests and help smoke check**

Run:

```bash
node --test --test-isolation=none test/playbookP6Cli.test.js test/playbookP6Storage.test.js
npm run playbook:p6 -- --help
```

Expected: tests PASS and help exits zero without filesystem mutation.

- [ ] **Step 6: Review and commit**

Commit: `feat: prepare P6 evaluation runs safely`

---

## Task 6: Prepare and Validate Formal Minecraft Captures

**Files:**

- Create: `src/playbook/p6/captures.js`
- Create: `test/playbookP6Captures.test.js`
- Modify: `src/runArchitecturePlaybookP6.js`

- [ ] **Step 1: Write failing capture tests**

Cover four isolated plots, identical ground/spacing/biome/lighting, build and camera commands, 24 anonymous filenames, exact environment metadata, world identity binding, default textures/no shaders, PNG signature and 1920×1080 IHDR, regular files, no symlinks/hardlinks, exact-once `(solution, view)` pairs, a single environment hash, image hashes, label leakage, and missing/extra/corrupt images.

- [ ] **Step 2: Confirm red**

Run: `node --test --test-isolation=none test/playbookP6Captures.test.js`

Expected: FAIL because `captures.js` is missing.

- [ ] **Step 3: Implement capture-session preparation and import**

```js
export function createCaptureSession({
  cohort, cameraManifests, settings, worldIdentityHash, plotOrigin
}) {}
export function renderCaptureChecklist(session) {}
export async function validateImportedCaptures({
  authority, session, captureRoot
}) {}
```

The session contains commands/checklists only. It cannot launch a client, send keystrokes, or install a datapack. Import validates owned files via handles, parses only PNG signature/IHDR for dimensions, hashes exact bytes, and publishes a public capture manifest with opaque screenshot IDs.

- [ ] **Step 4: Add explicit CLI import action**

`import-captures` requires `--capture-root` and a current capture session. It performs read-only validation of submitted files and publishes only after all 24 validate. It must not accept a partial batch.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/playbookP6Captures.test.js test/playbookP6Cli.test.js`

Expected: PASS.

- [ ] **Step 6: Review and commit**

Commit: `feat: validate formal P6 Minecraft captures`

---

## Task 7: Record Image-Grounded Categorical Observations

**Files:**

- Create: `src/playbook/p6/observations.js`
- Create: `test/playbookP6Observations.test.js`
- Modify: `src/runArchitecturePlaybookP6.js`

- [ ] **Step 1: Write failing observation tests**

Test the nine allowed criteria; allowed ratings; at least one valid screenshot citation; region forms (`whole-frame` or normalized rectangle); criterion-to-design-layer mapping; optional rule IDs; explicit limitations; reviewer kind; capture/solution authority hashes; exact fields; no preference language; no score/weight/rank fields; and `unknown` for claims unsupported by the cited exterior view.

- [ ] **Step 2: Confirm red**

Run: `node --test --test-isolation=none test/playbookP6Observations.test.js`

Expected: FAIL because the observation compiler is unavailable.

- [ ] **Step 3: Implement validation and deterministic report rendering**

```js
export function createObservation(value, { captureManifest, cohort }) {}
export function compileObservationSet({ cohort, captureManifest, observations }) {}
export function renderObservationReport(observationSet) {}
```

`observable_paraphrase` must describe visible evidence and must not assert hidden intent, historical authenticity, engineering truth, or unseen interiors. Implement bounded lexical guards for explicit prohibited claims, while requiring reviewers to use `unknown` plus a limitation when evidence is insufficient. Do not auto-generate ratings.

- [ ] **Step 4: Add CLI import action**

`import-observations --file <json>` validates a complete or explicitly partial observation set. Partial sets may be published for review but keep the gate blocked.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/playbookP6Observations.test.js test/playbookP6Contracts.test.js`

Expected: PASS.

- [ ] **Step 6: Review and commit**

Commit: `feat: record image-grounded P6 observations`

---

## Task 8: Generate and Seal the Six Blind Pairwise Comparisons

**Files:**

- Create: `src/playbook/p6/comparisons.js`
- Create: `test/playbookP6Comparisons.test.js`
- Modify: `src/runArchitecturePlaybookP6.js`

- [ ] **Step 1: Write failing anonymization tests**

Assert all `4 choose 2 = 6` unordered solution pairs occur exactly once; left/right order is independently randomized; public aliases and filenames reveal neither candidate IDs, playbook state, nor selection rank; injected random bytes make tests deterministic; the identity map is private; public manifest hashes bind capture/cohort; and regenerating against the same authority conflicts instead of silently changing order.

- [ ] **Step 2: Write failing preference tests**

Assert one record per comparison, choices only `left | right | tie`, confidence only `low | medium | high`, zero or more frozen reason tags, unique IDs, public screenshot bindings, reviewer pseudonym, timestamp, optional bounded original rationale, no real solution IDs, no inferred missing choices, and sealing only after all six records validate.

```js
const bundle = compileBlindComparison({
  cohort,
  captureManifest,
  randomBytes: length => Buffer.alloc(length, 7)
});
assert.equal(bundle.publicManifest.comparisons.length, 6);
assert.equal(JSON.stringify(bundle.publicManifest).includes('playbook-candidate'), false);
```

- [ ] **Step 3: Confirm red**

Run: `node --test --test-isolation=none test/playbookP6Comparisons.test.js`

Expected: FAIL because `comparisons.js` does not exist.

- [ ] **Step 4: Implement separation of public and private authority**

```js
export function compileBlindComparison({ cohort, captureManifest, randomBytes }) {}
export function validatePreferenceAgainstManifest(record, publicManifest) {}
export function sealPreferences({ publicManifest, records }) {}
export function revealPreferenceResults({ sealedPreferences, privateIdentityMap }) {}
```

Use rejection sampling when mapping random bytes to a choice so left/right order has no modulo bias. Generate opaque alias IDs and comparison IDs from random bytes, but make the published bundle immutable once installed. `revealPreferenceResults` runs only after sealing and returns categorical counts and pair decisions, never a weighted score.

- [ ] **Step 5: Add CLI prepare/import actions**

`prepare-comparisons` publishes public comparison files and a private identity generation. `import-preferences --file <json>` validates all six before sealing. CLI output before sealing must not reveal the private map.

- [ ] **Step 6: Run focused tests**

Run: `node --test --test-isolation=none test/playbookP6Comparisons.test.js test/playbookP6Storage.test.js`

Expected: PASS.

- [ ] **Step 7: Review and commit**

Commit: `feat: add blind P6 pairwise preferences`

---

## Task 9: Evaluate the P6 Gate and Produce the Operating Report

**Files:**

- Create: `src/playbook/p6/report.js`
- Create: `test/playbookP6Report.test.js`
- Create: `docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md`
- Modify: `src/runArchitecturePlaybookP6.js`
- Modify: `README.md`

- [ ] **Step 1: Write failing gate matrix tests**

Test each prerequisite independently: exact cohort, 24 reference images, 24 formal captures, valid environment, observations, six public comparisons, six sealed preferences, successful required regression suites, and private reveal. A missing prerequisite yields `blocked`, never `pass`. Outcome wording must cover playbook win, baseline win, all ties, and mixed/inconclusive results without changing the pass decision once the evidence package is complete.

```js
const gate = evaluateP6Gate(evidence);
assert.equal(gate.status, 'pass');
assert.equal(gate.p7_allowed, true);
assert.equal(gate.next_action.kind, 'start-p7');
```

- [ ] **Step 2: Confirm red**

Run: `node --test --test-isolation=none test/playbookP6Report.test.js`

Expected: FAIL because `report.js` is missing.

- [ ] **Step 3: Implement deterministic gate and report**

```js
export function evaluateP6Gate({
  cohort, referenceManifest, captureManifest, observationSet,
  comparisonManifest, sealedPreferences, revealedResults, regressions
}) {}
export function renderP6Report({ gate, evidenceHashes }) {}
```

`p7_allowed` is true only for a complete, internally consistent evidence package. Preference outcome changes the correction advice, not evidence completeness. A baseline win or inconclusive result must recommend reviewing the cited weak/fail observations and P5 artifacts before more episodes; it must not automatically expand the playbook.

- [ ] **Step 4: Add CLI report action and checked-in report shell**

`report` reads only current immutable generations, evaluates hashes, publishes `report.json` and `report.md`, and prints the gate status. The checked-in report initially states `blocked: formal evidence not yet collected` and lists the eventual evidence hashes; it must not claim a result prematurely.

- [ ] **Step 5: Run focused and compatibility tests**

Run:

```bash
node --test --test-isolation=none \
  test/playbookP6Contracts.test.js \
  test/playbookP6Cohort.test.js \
  test/playbookP6Cameras.test.js \
  test/playbookP6OfflineRenderer.test.js \
  test/playbookP6Storage.test.js \
  test/playbookP6Cli.test.js \
  test/playbookP6Captures.test.js \
  test/playbookP6Observations.test.js \
  test/playbookP6Comparisons.test.js \
  test/playbookP6Report.test.js
node --test --test-isolation=none test/playbookShadow*.test.js test/playbookReview*.test.js test/playbookExecute*.test.js
node --test --test-isolation=none test/playbookExecuteOffCompatibility.test.js test/pipeline.test.js
npm run playbook:manual -- check
git diff --check
```

Expected: all commands PASS; manual check reports no drift.

- [ ] **Step 6: Review and commit**

Commit: `feat: gate P7 on complete P6 visual evidence`

---

## Task 10: Full Verification and Operational Evidence Collection

**Files:**

- Modify after evidence exists: `docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md`
- Generated only: `out/<run>/playbook-p6/**`

- [ ] **Step 1: Run the complete automated verification in the supported environment**

Run:

```bash
npm test -- --test-reporter=dot
npm run playbook:manual -- check
git diff --check
git status --short
```

Expected: exit code 0 for all tests and checks; no tracked generated output.

- [ ] **Step 2: Prepare the frozen cohort and offline references**

Generate one deterministic P5 mock run and one same-request `playbook=off` baseline in a disposable output root, then run `playbook:p6 prepare`. Record the exact commands, commit, corpus hash, run hashes, and reference manifest hash in the report. If any P5 candidate slot fails preflight, stop with `P6_COHORT_INCOMPLETE`; correct P5 in a separately reviewed change instead of substituting a solution.

- [ ] **Step 3: Stop for exact disposable-world authorization**

Present the resolved world path, its identity hash, Minecraft version, generated datapacks, four plot bounds, and the planned mutations. Do not create, install, open, or change the world until the user explicitly authorizes that exact target.

- [ ] **Step 4: After authorization, capture and import all 24 Minecraft screenshots**

Use Minecraft Java 1.21.9 with the frozen visual settings. Follow the generated checklist, keep all four plots isolated and equivalent, and import the complete batch. If any environmental metadata differs, recapture the entire affected batch rather than mixing environment hashes.

- [ ] **Step 5: Record image-grounded observations**

Review the formal screenshots, cite screenshot IDs and bounded regions, use only categorical ratings, and make unsupported criteria `unknown`. Publish the observation generation.

- [ ] **Step 6: Stop for six anonymous human choices**

Present only the six public A/B image sets. Collect exactly one `left`, `right`, or `tie` choice for each comparison, plus optional rationale. Do not reveal identities or selection ranks until all six choices are sealed.

- [ ] **Step 7: Seal, reveal, and publish the final gate report**

Import the completed preference records, reveal through the private identity map, rerun all regressions, publish the immutable report generation, and update the checked-in report with evidence hashes and the explicit next action.

- [ ] **Step 8: Perform final independent reviews**

Request one fresh reviewer for full spec compliance and a different fresh reviewer for code quality/security. Resolve all findings, rerun the complete verification, and request a final review of the fixes.

- [ ] **Step 9: Finish the development branch**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Present the verified branch state and integration choices; do not merge or delete the worktree without the user's selected integration action.

## Required Evidence at Completion

The completion message must include:

- branch and final commit;
- exact full-suite commands and exit results;
- cohort, reference, capture, observation, comparison, preference, and report hashes;
- confirmation that 4 solutions × 6 views and all 6 unordered pairs are present;
- the categorical preference outcome without a synthetic score;
- the gate status and next action;
- the authorized disposable world identity used, or an explicit statement that the work remains blocked before world capture;
- confirmation that no real/user world was changed without authorization and no generated output is tracked.
