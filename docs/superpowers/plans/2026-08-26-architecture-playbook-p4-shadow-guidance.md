# Architecture Playbook P4 Shadow Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, read-only shadow reviewer that evaluates every current `blueprint.json` against all 21 reviewed playbook rules and optionally asks an LLM to explain—but never alter—the authoritative result.

**Architecture:** An independent CLI validates one run under `out/`, projects a strict whitelist of blueprint facts, loads the three checked-in P3 corpus files, and dispatches one registered checker per rule. Deterministic review and prompt bytes are authoritative; mock or LLM explanation is validated separately before five owned artifacts are atomically installed under `<run>/playbook-shadow/`.

**Tech Stack:** Node.js 20+ ESM, `node:test`, `node:assert/strict`, Node filesystem/crypto APIs, the existing `createLlmClient()` adapter, Acorn/import-meta-resolve through the existing playbook dependency auditor, Markdown/JSON/JSONL checked-in corpus.

**Spec:** `docs/superpowers/specs/2026-08-26-architecture-playbook-p4-shadow-guidance-design.md`

## Global Constraints

- Keep `playbook_version = "0.1.0"`, `school_id = "heihui-jileniao"`, and `evaluator_version = "0.1.0"` fixed in this phase.
- The CLI only accepts `--run <path> --mode mock|llm`; do not add a version, school, filter, output, force, or overwrite flag.
- Read only `blueprint.json`; do not read previews, screenshots, media, worlds, datapacks, `.local/architecture-playbook/`, or private evidence.
- Do not import `src/construction/`, `src/pipeline.js`, `src/index.js`, Minecraft world/datapack I/O, or any P3-unpublished source.
- Treat the deterministic `review.json` as the sole authority. The LLM may explain exact existing IDs and facts, but cannot change statuses, add rules, invent repairs, produce patches, or decide architectural quality.
- Emit exactly 21 assessments in reviewed-rule JSONL order. The 15 core procedures use `satisfied | violated | unknown | not-applicable`; the six `manual-example-only` case patterns use only `unknown | not-applicable` and never carry repairs.
- Only `violated` core rules may expose the already-reviewed repair operation, target layer, and invalidated layers.
- Keep `space`, `materials`, `interior`, and `scene` explicitly `not-covered`; never produce a score, grade, winner, or aesthetic-quality claim.
- Mock mode must not create an LLM client or read model configuration and must produce byte-identical output for identical blueprint/corpus bytes.
- Write only the five fixed files in `<run>/playbook-shadow/`: `manifest.json`, `review.json`, `prompt-packet.json`, `explanation.json`, and `report.md`.
- Reject symlinks, paths outside the project `out/` root, unowned output directories, corrupt manifests, extra output files, and path drift; no `--force` escape hatch.
- Use TDD for every task: add one precise failing test, run it and observe the expected failure, add the minimum implementation, rerun the focused test, then commit.
- Add no npm dependencies and do not change current generation behavior. `playbook=off` is represented by never invoking this independent CLI.

## Target File Map

| Path | Responsibility |
| --- | --- |
| `src/playbook/shadow/constants.js` | Fixed versions, layer order, status enums, corpus paths, output allowlist, and safe error codes |
| `src/playbook/shadow/canonical.js` | Canonical JSON bytes, SHA-256, exact-object checks, cloning, and deep freezing |
| `src/playbook/shadow/contracts.js` | Strict review, prompt-packet, explanation, and manifest validation |
| `src/playbook/shadow/corpus.js` | Descriptor-safe loading and cross-validation of the three P3 public artifacts |
| `src/playbook/shadow/blueprintProjection.js` | Whitelisted, immutable `brief/massing/structure/roof/facade` projection |
| `src/playbook/shadow/checkers/*.js` | Four structural checkers plus explicit evidence-required entries for the remaining checks |
| `src/playbook/shadow/checkerRegistry.js` | Unique `check:*` registration and rule/layer/kind binding audit |
| `src/playbook/shadow/evaluateReview.js` | Applicability gate, four-state normalization, case-pattern restriction, coverage, and summary |
| `src/playbook/shadow/promptPacket.js` | Bounded deterministic LLM input derived from the authoritative review and reviewed rules |
| `src/playbook/shadow/explanation.js` | Deterministic mock explanation, LLM invocation, validation, and stable degradation |
| `src/playbook/shadow/report.js` | Human-readable report rendered only from validated artifacts |
| `src/playbook/shadow/storage.js` | Safe run admission, owned output validation, staging, atomic install, and rollback |
| `src/playbook/shadow/shadowDependencyBoundary.js` | P4 adapter over the existing AST/Node dependency audit |
| `src/playbook/shadow/runShadowReview.js` | Pure orchestration from admitted input bytes to five output byte buffers |
| `src/runArchitecturePlaybookShadow.js` | Argument parsing, default project root, CLI summary, and safe top-level errors |
| `test/fixtures/playbook-shadow/*.json` | Original medieval positive, medieval defect, and non-applicable control blueprints |
| `test/playbookShadow*.test.js` | Contracts, corpus/projection, checker, evaluator, explanation, storage, CLI, and final gate tests |
| `docs/architecture-playbook/reports/p4-shadow-guidance.md` | Honest P4 evidence report and remaining limitations |
| `docs/architecture-playbook/README.md` | P4 status, command entrypoints, outputs, and P5/P6 boundary |
| `package.json` | `playbook:shadow` script only |

---

### Task 1: Canonical bytes and strict output contracts

**Files:**

- Create: `src/playbook/shadow/constants.js`
- Create: `src/playbook/shadow/canonical.js`
- Create: `src/playbook/shadow/contracts.js`
- Test: `test/playbookShadowContracts.test.js`

**Interfaces:**

- Consumes: plain JSON-compatible values.
- Produces: `stableJson(value): string`, `sha256(bytes): string`, `deepFreeze(value): value`, `shadowError(code, detailCode?)`, `sanitizeShadowError(error, fallbackCode?)`, `validateReview(value)`, `validatePromptPacket(value)`, `validateExplanation(value, review)`, `validateManifest(value)`.
- Errors: `ArchitecturePlaybookShadowError` with one of the stable codes from the spec and an optional safe symbolic detail code, never an absolute filesystem path or raw exception text.

- [ ] **Step 1: Write failing tests for canonical serialization and exact contracts**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stableJson,
  sha256
} from '../src/playbook/shadow/canonical.js';
import {
  validateExplanation,
  validateReview
} from '../src/playbook/shadow/contracts.js';

test('stableJson sorts object keys recursively and emits one newline', () => {
  const bytes = stableJson({ z: 1, a: { y: 2, x: 3 } });
  assert.equal(bytes, '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
  assert.equal(sha256(bytes).length, 64);
});

test('review contract rejects unknown fields and a case-pattern repair', () => {
  const review = validReviewFixture();
  assert.throws(
    () => validateReview({ ...review, score: 99 }),
    /BLUEPRINT_INVALID|PLAYBOOK_CORPUS_INVALID/u
  );
  review.assessments[15].repair_operation_id = 'repair:massing:move-tower-to-joint';
  assert.throws(() => validateReview(review), /case-pattern/u);
});

test('explanation must preserve review hash, rule order, status, and repair IDs', () => {
  const review = validateReview(validReviewFixture());
  const explanation = validExplanationFixture(review);
  explanation.rule_explanations[0].status = 'violated';
  assert.throws(
    () => validateExplanation(explanation, review),
    /LLM_AUTHORITY_VIOLATION/u
  );
});
```

The test fixture builders in this file must construct all required fields explicitly; they may use `Array.from({ length: 21 }, ...)`, but must not read production corpus files.

- [ ] **Step 2: Run the contract test and observe missing-module failure**

Run: `node --test test/playbookShadowContracts.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/playbook/shadow/canonical.js`.

- [ ] **Step 3: Implement constants and canonical helpers**

```js
// src/playbook/shadow/constants.js
export const SHADOW_SCHEMA_VERSION = 1;
export const EVALUATOR_VERSION = '0.1.0';
export const PLAYBOOK_VERSION = '0.1.0';
export const SCHOOL_ID = 'heihui-jileniao';
export const ASSESSMENT_STATUSES = Object.freeze([
  'satisfied', 'violated', 'unknown', 'not-applicable'
]);
export const LAYER_ORDER = Object.freeze([
  'brief', 'massing', 'space', 'structure', 'roof',
  'facade', 'materials', 'interior', 'scene'
]);
export const EVALUATED_LAYERS = Object.freeze([
  'brief', 'massing', 'structure', 'roof', 'facade'
]);
export const NOT_COVERED_LAYERS = Object.freeze([
  'space', 'materials', 'interior', 'scene'
]);
export const SHADOW_OUTPUT_FILES = Object.freeze([
  'manifest.json', 'review.json', 'prompt-packet.json',
  'explanation.json', 'report.md'
]);

// src/playbook/shadow/canonical.js
import { createHash } from 'node:crypto';

export function stableJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key, sortValue(value[key])
  ]));
}
```

- [ ] **Step 4: Implement exact validators and authority checks**

Define exact field arrays in `contracts.js`; reject missing and additional keys at every owned object boundary. Enforce these invariants in executable code:

```js
export const REVIEW_FIELDS = Object.freeze([
  'schema_version', 'evaluator_version', 'playbook_version', 'school_id',
  'input', 'rule_corpus_sha256', 'coverage', 'assessments', 'summary'
]);

export const ASSESSMENT_FIELDS = Object.freeze([
  'rule_id', 'rule_version', 'teaching_role', 'admission_status',
  'design_layer', 'check_id', 'checker_kind', 'status',
  'evidence_json_pointers', 'observations', 'missing_signals', 'unknown_ids',
  'repair_operation_id', 'repair_target_layer', 'invalidates_layers'
]);

function validateAssessment(item, index) {
  assertExactObject(item, `review.assessments[${index}]`, ASSESSMENT_FIELDS);
  if (!ASSESSMENT_STATUSES.includes(item.status)) fail('BLUEPRINT_INVALID', 'status');
  if (item.teaching_role === 'case-pattern') {
    if (!['unknown', 'not-applicable'].includes(item.status)) {
      fail('PLAYBOOK_CORPUS_INVALID', `review.assessments[${index}]`, 'case-pattern status');
    }
    if (item.repair_operation_id !== null || item.repair_target_layer !== null) {
      fail('PLAYBOOK_CORPUS_INVALID', `review.assessments[${index}]`, 'case-pattern repair');
    }
  }
  if (item.status === 'violated') {
    assertNonEmptyStrings(item.evidence_json_pointers, 'evidence_json_pointers');
    assertNonEmptyStrings(item.observations, 'observations');
    assertId(item.repair_operation_id, /^repair:/u, 'repair_operation_id');
  } else if (item.repair_operation_id !== null || item.repair_target_layer !== null) {
    fail('PLAYBOOK_CORPUS_INVALID', `review.assessments[${index}]`, 'repair on non-violation');
  }
  if (item.status === 'unknown' && item.missing_signals.length + item.unknown_ids.length === 0) {
    fail('PLAYBOOK_CORPUS_INVALID', `review.assessments[${index}]`, 'unknown without missing evidence');
  }
}
```

`validateExplanation(value, review)` must first validate the exact explanation schema, then compare `review_hash`, rule count, order, `rule_id`, `status`, and `repair_operation_id`. Schema/length failures throw `LLM_OUTPUT_INVALID`; any comparison that attempts to alter authority throws `LLM_AUTHORITY_VIOLATION`.

An explanation has exact top-level fields `schema_version`, `review_hash`, `mode`, `provider`, `status`, `layer_explanations`, `rule_explanations`, `overall_unknowns`, and `error_code`. `provider` is a bounded string or `null`; `error_code` is `null` when available and one of the four LLM degradation codes when unavailable.

`shadowError` and `sanitizeShadowError` are the only public error constructors. The safe allowlist is the nine fatal CLI codes and four LLM degradation codes from the spec; an unrecognized exception becomes the caller's fixed fallback code.

- [ ] **Step 5: Run the focused tests**

Run: `node --test test/playbookShadowContracts.test.js`

Expected: PASS with all contract tests and zero failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/playbook/shadow/constants.js src/playbook/shadow/canonical.js src/playbook/shadow/contracts.js test/playbookShadowContracts.test.js
git commit -m "feat(playbook): define P4 shadow contracts"
```

---

### Task 2: Load the public corpus and project existing blueprint facts

**Files:**

- Create: `src/playbook/shadow/corpus.js`
- Create: `src/playbook/shadow/blueprintProjection.js`
- Test: `test/playbookShadowCorpusProjection.test.js`

**Interfaces:**

- Consumes: exact bytes at the three fixed corpus paths and a parsed `construction_method_v1` blueprint object.
- Produces: `loadShadowCorpus({ projectRoot, readFile? }): Promise<ShadowCorpus>` and `projectBlueprint(blueprint): ProjectedBlueprint`.
- `ShadowCorpus` contains `{ playbook_version, school_id, cards, coverage, corpus_sha256 }` and preserves reviewed-rule JSONL order.
- `ProjectedBlueprint` contains only `{ brief, massing, structure, roof, facade, pointers }`; `pointers` maps logical facts to original blueprint JSON Pointers.

- [ ] **Step 1: Write failing corpus/projection tests**

```js
test('loads exactly 21 ordered reviewed rules and binds all three corpus files', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  assert.equal(corpus.cards.length, 21);
  assert.equal(corpus.cards.filter((card) => card.teaching_role === 'core-procedure').length, 15);
  assert.equal(corpus.cards.filter((card) => card.runtime_projection.coverage_status === 'manual-example-only').length, 6);
  assert.equal(corpus.corpus_sha256.length, 64);
  assert.equal(Object.isFrozen(corpus.cards[0]), true);
});

test('corpus loader rejects policy/card drift', async () => {
  const files = await loadCorpusBytes(ROOT);
  const policy = JSON.parse(files.get(ADMISSION_PATH));
  policy.rule_admissions[0].runtime_projection.observable_checks[0] = 'check:massing:drift';
  files.set(ADMISSION_PATH, `${JSON.stringify(policy)}\n`);
  await assert.rejects(
    loadShadowCorpus({ projectRoot: ROOT, readFile: mapReader(files) }),
    /PLAYBOOK_CORPUS_INVALID/u
  );
});

test('projection copies only the approved five-layer whitelist', () => {
  const blueprint = minimalBlueprintFixture();
  blueprint.operations = [{ block: 'minecraft:diamond_block' }];
  blueprint.interior = { secret: true };
  const projected = projectBlueprint(blueprint);
  assert.equal(projected.brief.prompt, blueprint.prompt);
  assert.deepEqual(projected.massing.volumes, blueprint.architecture.volumes);
  assert.equal(JSON.stringify(projected).includes('diamond_block'), false);
  assert.equal(JSON.stringify(projected).includes('secret'), false);
  assert.equal(Object.isFrozen(projected), true);
});
```

- [ ] **Step 2: Run the focused test and observe missing-module failure**

Run: `node --test test/playbookShadowCorpusProjection.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/playbook/shadow/corpus.js`.

- [ ] **Step 3: Implement exact corpus loading and cross-validation**

Use only these paths, in this order:

```js
export const SHADOW_CORPUS_PATHS = Object.freeze([
  'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json',
  'docs/architecture-playbook/manual/coverage-v0.1.json'
]);
```

Parse JSONL as exactly 21 non-empty lines. Require `0.1.0` and `heihui-jileniao` in all three documents; require one unique `rule_id`, one unique `check:*`, and one `repair:*` per card; compare every card's `teaching_role` and `runtime_projection` byte-for-byte at the JSON value level with the matching `rule_admissions` entry. Require coverage layer order to equal `LAYER_ORDER`, five `advisory-partial` rows, four `not-covered` rows, and `runtime_authority: "none"` everywhere.

Before parsing, `lstat` every fixed corpus path, reject symlinks/non-files, then open with `O_RDONLY | O_NOFOLLOW` and read exact bytes from the descriptor. Map any missing, replacement, parse, version, school, order, or cross-file mismatch to `PLAYBOOK_CORPUS_INVALID` without including an OS message or absolute path.

Compute identity without canonicalizing away byte differences:

```js
function corpusHash(files) {
  const hash = createHash('sha256');
  for (const relativePath of SHADOW_CORPUS_PATHS) {
    hash.update(relativePath, 'utf8');
    hash.update('\0');
    hash.update(files.get(relativePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}
```

- [ ] **Step 4: Implement the immutable whitelist projection**

```js
export function projectBlueprint(blueprint) {
  if (!isPlainObject(blueprint) || blueprint.workflow !== 'construction_method_v1') {
    throw shadowError('BLUEPRINT_INVALID');
  }
  return deepFreeze(structuredClone({
    brief: {
      prompt: stringOrNull(blueprint.prompt),
      style: stringOrNull(blueprint.architecture?.style),
      style_family: stringOrNull(blueprint.architecture?.style_family),
      typology: stringOrNull(blueprint.architecture?.typology)
    },
    massing: {
      volumes: arrayOrNull(blueprint.architecture?.volumes),
      volume_boxes: arrayOrNull(blueprint.shell?.volumeBoxes),
      bounds: objectOrNull(blueprint.bounds)
    },
    structure: {
      system: stringOrNull(blueprint.structure?.system),
      structural_intent: objectOrNull(blueprint.structure?.structural_intent),
      foundation: objectOrNull(blueprint.structure?.foundation),
      load_paths: arrayOrNull(blueprint.structure?.load_paths),
      support_elements: arrayOrNull(blueprint.structure?.support_elements)
    },
    roof: {
      style: stringOrNull(blueprint.roof?.style),
      profile: stringOrNull(blueprint.roof?.profile),
      materials: objectOrNull(blueprint.roof?.materials),
      elements: arrayOrNull(blueprint.roof?.elements),
      overhang: finiteNumberOrNull(blueprint.roof?.overhang)
    },
    facade: {
      composition_strategy: objectOrNull(blueprint.facade?.composition_strategy),
      depth_layers: arrayOrNull(blueprint.facade?.facade_depth_layers),
      elements: arrayOrNull(blueprint.facade?.facade_elements),
      window_system: objectOrNull(blueprint.facade?.window_system)
    },
    pointers: fixedPointerMap()
  }));
}
```

`arrayOrNull` and `objectOrNull` clone only JSON data; wrong types become `null`, so checkers report `unknown` instead of receiving repaired/default values. `fixedPointerMap()` maps every non-null projected field to its source, such as `massing.volumes -> /architecture/volumes` and `structure.load_paths -> /structure/load_paths`.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/playbookShadowCorpusProjection.test.js`

Expected: PASS with corpus order/hash/drift and projection whitelist tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/playbook/shadow/corpus.js src/playbook/shadow/blueprintProjection.js test/playbookShadowCorpusProjection.test.js
git commit -m "feat(playbook): load P4 corpus and project blueprints"
```

---

### Task 3: Register and test all 21 deterministic checkers

**Files:**

- Create: `src/playbook/shadow/checkers/result.js`
- Create: `src/playbook/shadow/checkers/massing.js`
- Create: `src/playbook/shadow/checkers/structure.js`
- Create: `src/playbook/shadow/checkers/evidenceRequired.js`
- Create: `src/playbook/shadow/checkerRegistry.js`
- Test: `test/playbookShadowCheckerRegistry.test.js`
- Test: `test/playbookShadowCheckers.test.js`

**Interfaces:**

- Consumes: one projected blueprint and one reviewed rule card.
- Produces: `createCheckerRegistry(): ReadonlyMap<string, Checker>`, `validateCheckerRegistry(cards, registry): ReadonlyMap`, and `checker.evaluate(projected, card): RawCheckResult`.
- `RawCheckResult` is exactly `{ status, evidence_json_pointers, observations, missing_signals, unknown_ids }`; it never contains a repair.

- [ ] **Step 1: Write the failing registry coverage test**

```js
test('registry binds every reviewed check exactly once in corpus order', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  const registry = validateCheckerRegistry(corpus.cards, createCheckerRegistry());
  assert.equal(registry.size, 21);
  assert.deepEqual(
    [...registry.keys()],
    corpus.cards.map((card) => card.runtime_projection.observable_checks[0])
  );
});

test('registry fails closed on a missing, duplicate, wrong-rule, or wrong-layer checker', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  for (const mutate of [removeFirst, duplicateFirst, changeRuleId, changeLayer]) {
    assert.throws(
      () => validateCheckerRegistry(corpus.cards, mutate(createCheckerDefinitions())),
      /CHECK_REGISTRY_INCOMPLETE/u
    );
  }
});
```

- [ ] **Step 2: Run the registry test and observe missing-module failure**

Run: `node --test test/playbookShadowCheckerRegistry.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `checkerRegistry.js`.

- [ ] **Step 3: Implement the exact registry table**

Register these 21 rows in reviewed-rule order; do not infer registry entries from check ID strings:

| Check ID | Rule ID | Layer | Kind |
| --- | --- | --- | --- |
| `check:massing:three-volume-composition` | `rule:structure.compose-three-volumes` | `massing` | `structural` |
| `check:massing:continuous-blank-plane` | `rule:structure.layer-volumes-to-reduce-blankness` | `massing` | `evidence-required` |
| `check:massing:primary-secondary-hierarchy` | `rule:structure.create-primary-secondary-hierarchy` | `massing` | `structural` |
| `check:massing:subordinate-support-volume` | `rule:structure.keep-support-volumes-subordinate` | `structure` | `structural` |
| `check:roof:border-readability` | `rule:roof.border-with-material-contrast` | `roof` | `evidence-required` |
| `check:roof:slope-massing-fit` | `rule:roof.scale-slope-to-massing` | `roof` | `evidence-required` |
| `check:roof:large-flat-plane` | `rule:roof.break-large-flat-plane` | `roof` | `evidence-required` |
| `check:facade:opening-inside-frame` | `rule:facade.frame-before-openings` | `facade` | `evidence-required` |
| `check:facade:frame-infill-depth` | `rule:facade.offset-frame-for-depth` | `facade` | `evidence-required` |
| `check:facade:large-wall-partition` | `rule:facade.partition-large-wall` | `facade` | `evidence-required` |
| `check:facade:repetitive-bay-signature` | `rule:facade.break-repetitive-bays` | `facade` | `evidence-required` |
| `check:structure:purposeful-overhang` | `rule:medieval.extend-only-needed-facades` | `structure` | `evidence-required` |
| `check:structure:visible-load-path` | `rule:medieval.show-load-path` | `structure` | `structural` |
| `check:roof:overhang-axis-alignment` | `rule:medieval.align-roof-with-overhang` | `roof` | `evidence-required` |
| `check:structure:tall-timber-base-weight` | `rule:medieval.use-stone-base-for-height` | `structure` | `evidence-required` |
| `check:massing:tower-joint-continuity` | `rule:case.join-crossed-massing-with-tower` | `massing` | `evidence-required` |
| `check:facade:motif-unity-with-bay-variation` | `rule:case.repeat-motif-for-unity` | `facade` | `evidence-required` |
| `check:facade:connected-vegetation-path` | `rule:case.use-greenery-as-composition` | `facade` | `evidence-required` |
| `check:brief:viewpoint-detail-allocation` | `rule:case.allocate-detail-by-viewpoint` | `brief` | `evidence-required` |
| `check:roof:warm-dark-visual-balance` | `rule:case.balance-warm-mass-with-dark-roof` | `roof` | `evidence-required` |
| `check:brief:foreground-background-intent` | `rule:case.compose-context-depth` | `brief` | `evidence-required` |

`validateCheckerRegistry` must compare each row against the card's `rule_id`, `design_layer`, and sole `observable_checks[0]`; reject multiple observable checks, duplicate map keys, missing definitions, and extra definitions with `CHECK_REGISTRY_INCOMPLETE`.

- [ ] **Step 4: Write failing positive, negative, and missing-signal tests for each structural checker**

```js
for (const scenario of structuralCheckerScenarios()) {
  test(`${scenario.checkId} has positive, negative, and missing evidence branches`, () => {
    assert.equal(runChecker(scenario.checkId, scenario.positive).status, 'satisfied');
    assert.equal(runChecker(scenario.checkId, scenario.negative).status, 'violated');
    const missing = runChecker(scenario.checkId, scenario.missing);
    assert.equal(missing.status, 'unknown');
    assert.ok(missing.missing_signals.length > 0 || missing.unknown_ids.length > 0);
  });
}

test('every evidence-required checker returns an explicit unknown', () => {
  for (const checker of createCheckerRegistry().values()) {
    if (checker.kind !== 'evidence-required') continue;
    const result = checker.evaluate(projectBlueprint(minimalBlueprintFixture()), cardFor(checker));
    assert.equal(result.status, 'unknown');
    assert.ok(result.missing_signals.length > 0 || result.unknown_ids.length > 0);
  }
});
```

- [ ] **Step 5: Implement the four structural checker algorithms**

Implement only judgments supported by current structured fields:

1. `three-volume-composition`: `unknown` if volumes are missing or malformed; `not-applicable` for explicit non-residential typology; `satisfied` only for exactly three box volumes where one is centered/primary, two attach to it, scale arrays are finite/positive, and not all scales are equal; otherwise `violated` with `/architecture/volumes`.
2. `primary-secondary-hierarchy`: `unknown` if fewer than two well-formed volume facts or role/tag evidence is missing; `not-applicable` for explicit non-residential typology; `satisfied` for exactly one `primary-mass`/`main-building-envelope` volume and smaller attached secondary scale-products; `violated` for multiple explicit primaries or an attached secondary whose scale-product is greater than or equal to the primary.
3. `subordinate-support-volume`: `unknown` when an attached secondary exists but primary or scale evidence is absent; `not-applicable` when there is explicitly no attached secondary; `satisfied` when every attached secondary has lower scale-product than the primary; `violated` otherwise.
4. `visible-load-path`: `not-applicable` for an explicit non-medieval style family or an explicit one-floor non-overhanging building; `unknown` when medieval applicability or `load_paths` is missing; `satisfied` when every explicit path has non-empty `from`, `through`, and `to`; `violated` when an applicable blueprint explicitly has an empty path array or a broken path object.

Use constructors so every branch returns the same shape:

```js
export function checkResult(status, {
  evidence = [], observations = [], missing = [], unknowns = []
} = {}) {
  return deepFreeze({
    status,
    evidence_json_pointers: [...evidence],
    observations: [...observations],
    missing_signals: [...missing],
    unknown_ids: [...unknowns]
  });
}
```

For all 17 evidence-required entries, bind these exact missing signals and existing unknown IDs. Case-pattern entries do not invoke a generic structural evaluator.

| Check ID | Missing signals | Existing unknown IDs |
| --- | --- | --- |
| `check:massing:continuous-blank-plane` | `brief.primary_viewpoint`, `massing.blank_plane_regions` | `unknown:blank-plane-threshold` |
| `check:roof:border-readability` | `roof.surface_regions.visual_contrast` | `unknown:aesthetic-evaluator` |
| `check:roof:slope-massing-fit` | `roof.span_and_slope_ratio` | `unknown:roof-slope-table` |
| `check:roof:large-flat-plane` | `roof.surface_regions.area` | `unknown:blank-plane-threshold` |
| `check:facade:opening-inside-frame` | `structure.frames`, `facade.bay_grid`, `facade.opening_sequence` | none |
| `check:facade:frame-infill-depth` | `facade.frame_depth`, `facade.infill_depth` | none |
| `check:facade:large-wall-partition` | `facade.bay_grid`, `facade.wall_span` | `unknown:blank-plane-threshold` |
| `check:facade:repetitive-bay-signature` | `facade.bay_grid`, `facade.motif_signatures` | `unknown:repetition-limit` |
| `check:structure:purposeful-overhang` | `structure.overhangs`, `structure.support_paths` | `unknown:medieval-scale-generalization` |
| `check:roof:overhang-axis-alignment` | `structure.overhangs`, `structure.support_paths`, `roof.ridge_axis` | `unknown:medieval-scale-generalization` |
| `check:structure:tall-timber-base-weight` | `structure.base_strategy`, `massing.height_scale` | `unknown:medieval-scale-generalization` |
| `check:massing:tower-joint-continuity` | `case.source_identity`, `massing.volume_relations` | `unknown:cross-author-validity` |
| `check:facade:motif-unity-with-bay-variation` | `case.source_identity`, `facade.motif_signatures`, `facade.variation_axes` | `unknown:cross-author-validity` |
| `check:facade:connected-vegetation-path` | `case.source_identity`, `facade.vegetation_path` | `unknown:aesthetic-evaluator` |
| `check:brief:viewpoint-detail-allocation` | `case.source_identity`, `brief.primary_viewpoint`, `brief.detail_budget` | `unknown:aesthetic-evaluator` |
| `check:roof:warm-dark-visual-balance` | `case.source_identity`, `roof.surface_regions.visual_color_balance` | `unknown:aesthetic-evaluator` |
| `check:brief:foreground-background-intent` | `case.source_identity`, `brief.primary_viewpoint`, `brief.scene_intent` | `unknown:aesthetic-evaluator` |

Every `not-applicable` branch must include at least one source JSON Pointer and one stable observation naming the explicit exclusion fact, for example `typology=monument` or `style_family=modern`. A missing applicability field returns `unknown`, never `not-applicable`.

- [ ] **Step 6: Run both checker suites**

Run: `node --test test/playbookShadowCheckerRegistry.test.js test/playbookShadowCheckers.test.js`

Expected: PASS; registry size 21, all four structural checkers cover three branches, and all 17 evidence-required checkers produce explicit unknown evidence.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/playbook/shadow/checkers src/playbook/shadow/checkerRegistry.js test/playbookShadowCheckerRegistry.test.js test/playbookShadowCheckers.test.js
git commit -m "feat(playbook): register P4 shadow checkers"
```

---

### Task 4: Compile the authoritative review and bounded prompt packet

**Files:**

- Create: `src/playbook/shadow/evaluateReview.js`
- Create: `src/playbook/shadow/promptPacket.js`
- Test: `test/playbookShadowEvaluation.test.js`

**Interfaces:**

- Consumes: `{ blueprint, blueprintPath, blueprintSha256, corpus, registry }`.
- Produces: `evaluateShadowReview(input): Review`, `buildPromptPacket({ review, cards, blueprintPrompt }): PromptPacket`, and `reviewHash(review): string`.
- The evaluator, not individual checkers, attaches reviewed repairs and enforces the case-pattern ceiling.

- [ ] **Step 1: Write failing review compilation tests**

```js
test('evaluation emits 21 ordered assessments and exact nine-layer coverage', async () => {
  const { corpus, registry, blueprint } = await evaluationFixture('positive');
  const review = evaluateShadowReview({
    blueprint,
    blueprintPath: 'blueprint.json',
    blueprintSha256: sha256(stableJson(blueprint)),
    corpus,
    registry
  });
  assert.equal(review.assessments.length, 21);
  assert.deepEqual(review.assessments.map((item) => item.rule_id), corpus.cards.map((card) => card.rule_id));
  assert.deepEqual(review.coverage.map((row) => row.layer), LAYER_ORDER);
  assert.deepEqual(
    review.coverage.filter((row) => row.status === 'not-covered').map((row) => row.layer),
    ['space', 'materials', 'interior', 'scene']
  );
  assert.equal(Object.hasOwn(review.summary, 'score'), false);
});

test('only violated core rules receive the reviewed repair', async () => {
  const review = await reviewForFixture('defect');
  for (const assessment of review.assessments) {
    if (assessment.status === 'violated') {
      assert.equal(assessment.teaching_role, 'core-procedure');
      assert.match(assessment.repair_operation_id, /^repair:/u);
      assert.ok(assessment.evidence_json_pointers.length > 0);
      assert.ok(assessment.observations.length > 0);
    } else {
      assert.equal(assessment.repair_operation_id, null);
      assert.equal(assessment.repair_target_layer, null);
    }
  }
});

test('case patterns cannot be promoted by a malicious checker result', async () => {
  const { corpus, registry, blueprint } = await evaluationFixture('positive');
  const poisoned = replaceCaseChecker(registry, () => ({
    status: 'violated',
    evidence_json_pointers: ['/architecture/volumes'],
    observations: ['invented violation'],
    missing_signals: [],
    unknown_ids: []
  }));
  assert.throws(
    () => evaluateShadowReview({ blueprint, blueprintPath: 'blueprint.json', blueprintSha256: 'a'.repeat(64), corpus, registry: poisoned }),
    /CHECK_REGISTRY_INCOMPLETE|PLAYBOOK_CORPUS_INVALID/u
  );
});
```

- [ ] **Step 2: Run the evaluation test and observe missing-module failure**

Run: `node --test test/playbookShadowEvaluation.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `evaluateReview.js`.

- [ ] **Step 3: Implement assessment normalization and repair attachment**

```js
function assessmentFrom(card, checker, raw) {
  assertRawResult(raw, card);
  if (
    card.runtime_projection.coverage_status === 'manual-example-only'
    && !['unknown', 'not-applicable'].includes(raw.status)
  ) {
    throw shadowError('PLAYBOOK_CORPUS_INVALID');
  }
  const violated = raw.status === 'violated';
  const repair = violated ? card.runtime_projection.repair_operations[0] : null;
  return {
    rule_id: card.rule_id,
    rule_version: card.rule_version,
    teaching_role: card.teaching_role,
    admission_status: card.admission_status,
    design_layer: card.design_layer,
    check_id: card.runtime_projection.observable_checks[0],
    checker_kind: checker.kind,
    status: raw.status,
    evidence_json_pointers: stableUnique(raw.evidence_json_pointers),
    observations: stableUnique(raw.observations),
    missing_signals: stableUnique(raw.missing_signals),
    unknown_ids: stableUnique(raw.unknown_ids),
    repair_operation_id: repair,
    repair_target_layer: repair ? repair.split(':')[1] : null,
    invalidates_layers: repair ? [...card.runtime_projection.invalidates_layers] : []
  };
}
```

Preserve card order. Build coverage in `LAYER_ORDER`; copy P3 `status`, `rule_ids`, and `unknown_ids`, but do not copy `runtime_authority` as P4 authority. Instead add `assessment_counts` for the layer. Build summary with only:

```js
{
  assessment_count: 21,
  core_procedure_count: 15,
  case_pattern_count: 6,
  status_counts: { satisfied, violated, unknown, 'not-applicable' },
  layer_status_counts: [
    { layer: 'brief', satisfied, violated, unknown, 'not-applicable' }
  ],
  missing_evidence_rule_count
}
```

The input object is exactly `{ blueprint_path: 'blueprint.json', blueprint_sha256, workflow, seed }`. Reject any absolute `blueprintPath` and validate the finished review before returning a deep-frozen value.

- [ ] **Step 4: Write failing prompt-packet boundary tests**

```js
test('prompt packet is review-bound and excludes blueprint/media/private data', async () => {
  const { review, corpus, blueprint } = await completedEvaluationFixture();
  blueprint.operations = [{ command: 'setblock 0 0 0 diamond_block' }];
  const packet = buildPromptPacket({ review, cards: corpus.cards, blueprintPrompt: blueprint.prompt });
  assert.equal(packet.review_hash, sha256(stableJson(review)));
  assert.equal(packet.rules.length, 21);
  const bytes = stableJson(packet);
  assert.doesNotMatch(bytes, /setblock|preview|screenshot|\.local\//u);
  assert.doesNotMatch(bytes, /API_KEY|base_url/u);
  assert.equal(bytes.includes(blueprint.prompt), true);
});
```

- [ ] **Step 5: Implement the bounded prompt packet**

The exact top-level fields are:

```js
[
  'schema_version', 'review_hash', 'playbook_version', 'school_id',
  'allowed_layers', 'authority', 'blueprint_prompt_data', 'rules', 'output_contract'
]
```

For each card, copy only `rule_id`, authoritative `status`, authoritative `repair_operation_id`, observations, missing signals, `applicability`, `exclusions`, `intent`, `positive_signs`, and `failure_modes`. Cap every prose string at 800 Unicode code points, every prose array at 12 items, and the prompt data at 2,000 code points. `authority` must state in data fields that rule IDs, order, statuses, repairs, and review hash are immutable and that no coordinates, block IDs, patches, scores, or thresholds may be added.

- [ ] **Step 6: Run the evaluation and packet suite**

Run: `node --test test/playbookShadowEvaluation.test.js`

Expected: PASS; exact 21-rule order, correct repair permissions, nine-layer coverage, and bounded prompt contents.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/playbook/shadow/evaluateReview.js src/playbook/shadow/promptPacket.js test/playbookShadowEvaluation.test.js
git commit -m "feat(playbook): compile authoritative shadow reviews"
```

---

### Task 5: Add deterministic mock and constrained LLM explanations

**Files:**

- Create: `src/playbook/shadow/explanation.js`
- Test: `test/playbookShadowExplanation.test.js`

**Interfaces:**

- Consumes: `explainReview({ mode, review, promptPacket, createClient? }): Promise<Explanation>`.
- Produces: a validated explanation with exact rule order or a stable `unavailable` result.
- `createClient` defaults to `() => createLlmClient()` and must never be invoked in mock mode.

- [ ] **Step 1: Write failing mock and LLM authority tests**

```js
test('mock explanation is deterministic and never creates a client', async () => {
  const fixture = await explanationFixture();
  let factoryCalls = 0;
  const first = await explainReview({
    mode: 'mock', ...fixture,
    createClient: () => { factoryCalls += 1; throw new Error('must not run'); }
  });
  const second = await explainReview({ mode: 'mock', ...fixture });
  assert.equal(factoryCalls, 0);
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.status, 'available');
  assert.equal(first.provider, 'mock');
});

test('valid LLM explanation is accepted', async () => {
  const fixture = await explanationFixture();
  const result = await explainReview({
    mode: 'llm', ...fixture,
    createClient: () => fakeClient(validLlmPayload(fixture.review))
  });
  assert.equal(result.status, 'available');
  assert.equal(result.provider, 'fixture-llm');
});

test('LLM authority changes discard the whole explanation but preserve review bytes', async () => {
  const fixture = await explanationFixture();
  const before = stableJson(fixture.review);
  const payload = validLlmPayload(fixture.review);
  payload.rule_explanations[0].repair_operation_id = 'repair:invented';
  const result = await explainReview({
    mode: 'llm', ...fixture,
    createClient: () => fakeClient(payload)
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
  assert.equal(stableJson(fixture.review), before);
  assert.equal(JSON.stringify(result).includes('repair:invented'), false);
});
```

Add separate cases for unconfigured client, request rejection, malformed JSON-shaped object, unknown fields, missing rule, added rule, reordered rule, status drift, repair drift, and review-hash drift.

- [ ] **Step 2: Run the explanation suite and observe missing-module failure**

Run: `node --test test/playbookShadowExplanation.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `explanation.js`.

- [ ] **Step 3: Implement deterministic mock rendering**

```js
function mockRuleExplanation(assessment) {
  const evidence = assessment.observations.length > 0
    ? assessment.observations.join('；')
    : `缺少：${assessment.missing_signals.join('；')}`;
  return {
    rule_id: assessment.rule_id,
    status: assessment.status,
    repair_operation_id: assessment.repair_operation_id,
    explanation: `${assessment.status}：${evidence}`.slice(0, MAX_EXPLANATION_CODE_POINTS)
  };
}
```

Group layer explanations in `EVALUATED_LAYERS` order. Do not use timestamps, locale-dependent formatting, absolute paths, or model configuration.

- [ ] **Step 4: Implement LLM invocation, validation, and safe degradation**

```js
export async function explainReview({ mode, review, promptPacket, createClient = defaultFactory }) {
  if (mode === 'mock') return validateExplanation(mockExplanation(review), review);
  let client;
  try {
    client = createClient();
    if (!client?.isConfigured()) return unavailable(review, 'LLM_UNCONFIGURED');
  } catch {
    return unavailable(review, 'LLM_UNCONFIGURED');
  }
  let candidate;
  try {
    candidate = await client.chatJson({
      system: SYSTEM_INSTRUCTION,
      user: promptPacket
    });
  } catch {
    return unavailable(review, 'LLM_REQUEST_FAILED');
  }
  try {
    const content = validateLlmCandidateShape(candidate);
    return validateExplanation({
      schema_version: SHADOW_SCHEMA_VERSION,
      review_hash: content.review_hash,
      mode: 'llm',
      provider: client.name,
      status: 'available',
      layer_explanations: content.layer_explanations,
      rule_explanations: content.rule_explanations,
      overall_unknowns: content.overall_unknowns,
      error_code: null
    }, review);
  } catch (error) {
    const code = error?.code === 'LLM_AUTHORITY_VIOLATION'
      ? 'LLM_AUTHORITY_VIOLATION'
      : 'LLM_OUTPUT_INVALID';
    return unavailable(review, code);
  }
}
```

`validateLlmCandidateShape` accepts exactly `review_hash`, `layer_explanations`, `rule_explanations`, and `overall_unknowns`; the wrapper—not the model—sets schema version, mode, provider, availability, and error code. The unavailable explanation uses `provider = null` before a configured client exists and the bounded `client.name` after a request failure. It contains all authoritative rule IDs/statuses/repairs with empty explanation text, so downstream report rendering remains deterministic, and contains no thrown message or raw response.

- [ ] **Step 5: Run explanation tests**

Run: `node --test test/playbookShadowExplanation.test.js`

Expected: PASS with valid, invalid, unavailable, and mock isolation cases.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/playbook/shadow/explanation.js test/playbookShadowExplanation.test.js
git commit -m "feat(playbook): constrain P4 review explanations"
```

---

### Task 6: Add safe run admission and owned atomic output storage

**Files:**

- Create: `src/playbook/shadow/storage.js`
- Test: `test/playbookShadowStorage.test.js`

**Interfaces:**

- Consumes: `admitShadowRun({ projectRoot, runArg, fsImpl? })` and `installShadowArtifacts({ authority, files, fsImpl? })`.
- Produces: an open run authority with safe relative identity and exact blueprint bytes; returns `{ status, artifact_hashes }` after installation.
- The five `files` values are `Buffer` or UTF-8 strings keyed exactly by `SHADOW_OUTPUT_FILES`.

- [ ] **Step 1: Write failing admission and ownership tests**

```js
test('admits a nested candidate under out and reads exact blueprint bytes', async (t) => {
  const fixture = await storageFixture(t);
  const authority = await admitShadowRun({
    projectRoot: fixture.root,
    runArg: 'out/run/candidates/round-01/candidate-01'
  });
  t.after(() => authority.close());
  assert.equal(authority.run_relative_path, 'out/run/candidates/round-01/candidate-01');
  assert.deepEqual(authority.blueprint_bytes, fixture.blueprintBytes);
});

test('rejects outside, missing, non-directory, and every symlinked path component', async (t) => {
  const fixture = await storageFixture(t);
  for (const scenario of await invalidAdmissionScenarios(fixture)) {
    await assert.rejects(
      admitShadowRun({ projectRoot: fixture.root, runArg: scenario.runArg }),
      new RegExp(scenario.code, 'u')
    );
  }
});

test('refuses unowned output without changing any bytes', async (t) => {
  const fixture = await storageFixture(t, { foreignOutput: true });
  const before = await snapshotTree(fixture.root);
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());
  await assert.rejects(
    installShadowArtifacts({ authority, files: validArtifactFiles() }),
    /SHADOW_OUTPUT_OWNERSHIP/u
  );
  assert.deepEqual(await snapshotTree(fixture.root), before);
});
```

Add tests for extra file, corrupt manifest, path traversal in manifest, output symlink, target-file symlink, stage collision, failure on third write, failure after backup rename, rollback failure, successful create, successful replace, and unchanged identical bytes.

- [ ] **Step 2: Run storage tests and observe missing-module failure**

Run: `node --test test/playbookShadowStorage.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `storage.js`.

- [ ] **Step 3: Implement descriptor-bound run admission**

Resolve `projectRoot`, then open the real project and `out/` directories with `O_RDONLY | O_DIRECTORY | O_NOFOLLOW`. Resolve `runArg` relative to the project root, require it to be a strict descendant of `out/`, and walk each relative path component with `lstat` plus descriptor-relative opens through `/proc/self/fd/<fd>`. Reject symlinks at the project/out/run/blueprint/output boundaries. Open `blueprint.json` with `O_RDONLY | O_NOFOLLOW`, verify it is a regular file, read exact bytes through its descriptor, and retain `{ dev, ino }` for project, out, and run. Before every stage/install/rollback operation, re-stat the open descriptors and require identity equality.

Map a missing or non-directory run to `INVALID_ARGUMENT`; map only a missing/non-file blueprint to `BLUEPRINT_MISSING`. This keeps all admission failures inside the spec's published error-code set.

Use only these external error mappings:

```js
const ADMISSION_CODES = Object.freeze({
  outside: 'RUN_OUTSIDE_OUT_ROOT',
  symlink: 'SYMLINK_NOT_ALLOWED',
  missingBlueprint: 'BLUEPRINT_MISSING',
  invalidBlueprint: 'BLUEPRINT_INVALID'
});
```

Do not include OS error messages or resolved absolute paths in thrown errors.

- [ ] **Step 4: Implement exact owned-directory validation**

An existing `playbook-shadow/` is owned only when all conditions hold:

```js
function isOwnedOutput({ entries, manifest }) {
  const bodyFiles = SHADOW_OUTPUT_FILES.filter((name) => name !== 'manifest.json');
  return sameStrings([...entries].sort(), [...SHADOW_OUTPUT_FILES].sort())
    && manifest.schema_version === SHADOW_SCHEMA_VERSION
    && sameStrings([...manifest.managed_paths].sort(), [...SHADOW_OUTPUT_FILES].sort())
    && sameStrings(Object.keys(manifest.artifact_hashes).sort(), [...bodyFiles].sort());
}
```

Also require every entry to be a non-symlink regular file and every manifest path to be a plain basename exactly equal to the allowlist. Recompute the four non-manifest file hashes and compare them to the manifest before replacement. The manifest's own hash is not self-referential: `artifact_hashes` contains hashes for `review.json`, `prompt-packet.json`, `explanation.json`, and `report.md`; `managed_paths` still lists all five files.

- [ ] **Step 5: Implement staging, install, and rollback**

Create a private sibling directory with `mkdir(..., { recursive: false, mode: 0o700 })` and a process/monotonic-sequence name. Write every file with `O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW`, close it, re-read it through a descriptor, and verify its expected hash. Then:

```text
no old output: rename(stage, playbook-shadow)
owned old output: rename(playbook-shadow, backup)
                  rename(stage, playbook-shadow)
                  remove the verified owned backup
install failure:  remove only the verified owned stage/new output
                  rename(backup, playbook-shadow)
```

Never recursively remove an unverified path. Cleanup code receives the exact generated temporary basename and first proves it is a real directory in the admitted run, contains only the allowlist, and has no symlink. If rollback cannot restore the prior owned bytes, throw `SHADOW_INSTALL_FAILED`; tests must preserve and expose no raw injected error text.

- [ ] **Step 6: Run storage tests**

Run: `node --test test/playbookShadowStorage.test.js`

Expected: PASS, including symlink races, unowned collisions, complete rollback, and no temporary residue.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/playbook/shadow/storage.js test/playbookShadowStorage.test.js
git commit -m "feat(playbook): secure P4 shadow artifact storage"
```

---

### Task 7: Orchestrate artifacts and render the human report

**Files:**

- Create: `src/playbook/shadow/report.js`
- Create: `src/playbook/shadow/runShadowReview.js`
- Test: `test/playbookShadowRun.test.js`

**Interfaces:**

- Consumes: `buildShadowArtifacts({ projectRoot, blueprintBytes, blueprintRelativePath, mode, createClient? })` and `runShadowReview({ projectRoot, runArg, mode, createClient?, fsImpl? })`.
- Produces: a map of the exact five artifact byte buffers and an installed-run summary.
- `runShadowReview` owns closing the admitted descriptor authority in a `finally` block.

- [ ] **Step 1: Write a failing pure orchestration test**

```js
test('mock orchestration produces exactly five stable artifacts', async () => {
  const blueprintBytes = await fs.readFile(POSITIVE_FIXTURE);
  const first = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'mock'
  });
  const second = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'mock'
  });
  assert.deepEqual(Object.keys(first), SHADOW_OUTPUT_FILES);
  assert.deepEqual(first, second);
  const review = JSON.parse(first['review.json']);
  assert.equal(review.assessments.length, 21);
  const report = first['report.md'].toString('utf8');
  assert.match(report, /没有视觉输入/u);
  assert.match(report, /没有修改建筑/u);
  assert.doesNotMatch(report, /质量提升|评分：|获胜/u);
});

test('LLM failure changes no authoritative review or prompt bytes', async () => {
  const blueprintBytes = await fs.readFile(POSITIVE_FIXTURE);
  const mock = await buildShadowArtifacts({ projectRoot: ROOT, blueprintBytes, blueprintRelativePath: 'blueprint.json', mode: 'mock' });
  const failed = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'llm',
    createClient: () => fakeRejectingClient()
  });
  assert.deepEqual(failed['review.json'], mock['review.json']);
  assert.deepEqual(failed['prompt-packet.json'], mock['prompt-packet.json']);
  assert.equal(JSON.parse(failed['explanation.json']).error_code, 'LLM_REQUEST_FAILED');
});
```

- [ ] **Step 2: Run the run test and observe missing-module failure**

Run: `node --test test/playbookShadowRun.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `runShadowReview.js`.

- [ ] **Step 3: Implement report rendering from validated data only**

Render sections in a fixed order:

```text
# 建筑秘籍 P4 影子审查
## 边界声明
## 输入身份
## 九层覆盖
## 分层结论
## 逐规则记录
## 缺失证据
## 解释状态
```

The first section must include these exact facts:

```md
- 本次审查只读取结构化 `blueprint.json`，没有视觉输入。
- 本次工具没有修改建筑、生成命令、预览、世界或数据包。
- 状态是候选建议的结构化审查，不是审美分数，也不是质量提升证据。
```

Escape Markdown table pipes/newlines in all copied prose. Render only `blueprint.json` as the input path. Do not show API/provider errors beyond the stable explanation error code.

- [ ] **Step 4: Implement pure artifact construction**

```js
export async function buildShadowArtifacts({
  projectRoot,
  blueprintBytes,
  blueprintRelativePath,
  mode,
  createClient
}) {
  const blueprint = parseBlueprintBytes(blueprintBytes);
  const corpus = await loadShadowCorpus({ projectRoot });
  const registry = validateCheckerRegistry(corpus.cards, createCheckerRegistry());
  const review = evaluateShadowReview({
    blueprint,
    blueprintPath: blueprintRelativePath,
    blueprintSha256: sha256(blueprintBytes),
    corpus,
    registry
  });
  const packet = buildPromptPacket({
    review,
    cards: corpus.cards,
    blueprintPrompt: blueprint.prompt
  });
  const explanation = await explainReview({
    mode, review, promptPacket: packet, createClient
  });
  const bodyFiles = {
    'review.json': Buffer.from(stableJson(review)),
    'prompt-packet.json': Buffer.from(stableJson(packet)),
    'explanation.json': Buffer.from(stableJson(explanation)),
    'report.md': Buffer.from(renderShadowReport({ review, explanation }))
  };
  const manifest = createManifest({ review, explanation, mode, bodyFiles });
  return Object.freeze({
    'manifest.json': Buffer.from(stableJson(manifest)),
    ...bodyFiles
  });
}
```

`createManifest` lists all five `managed_paths` and hashes the four body files. It cannot hash its own final bytes because that would be self-referential; `validateManifest` and ownership checks use the same rule. It records schema/evaluator/playbook/school, blueprint hash, corpus hash, mode, and explanation status.

- [ ] **Step 5: Implement admitted-run orchestration and closure**

```js
export async function runShadowReview(options) {
  const authority = await admitShadowRun(options);
  try {
    const files = await buildShadowArtifacts({
      projectRoot: authority.project_root,
      blueprintBytes: authority.blueprint_bytes,
      blueprintRelativePath: 'blueprint.json',
      mode: options.mode,
      createClient: options.createClient
    });
    const installed = await installShadowArtifacts({
      authority, files, fsImpl: options.fsImpl
    });
    return deepFreeze({
      ...installed,
      mode: options.mode,
      run_relative_path: authority.run_relative_path,
      assessment_count: JSON.parse(files['review.json']).assessments.length,
      explanation_status: JSON.parse(files['explanation.json']).status
    });
  } finally {
    await authority.close();
  }
}
```

- [ ] **Step 6: Run orchestration tests**

Run: `node --test test/playbookShadowRun.test.js`

Expected: PASS; mock artifacts are byte-stable and LLM failure leaves authority bytes unchanged.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/playbook/shadow/report.js src/playbook/shadow/runShadowReview.js test/playbookShadowRun.test.js
git commit -m "feat(playbook): orchestrate P4 shadow reviews"
```

---

### Task 8: Expose the CLI, add three blueprint fixtures, and close the dependency gate

**Files:**

- Create: `src/runArchitecturePlaybookShadow.js`
- Create: `src/playbook/shadow/shadowDependencyBoundary.js`
- Modify: `src/playbook/manual/manualDependencyBoundary.js`
- Modify: `package.json`
- Create: `test/fixtures/playbook-shadow/medieval-positive.json`
- Create: `test/fixtures/playbook-shadow/medieval-defect.json`
- Create: `test/fixtures/playbook-shadow/non-applicable-control.json`
- Create: `test/architecturePlaybookShadowCli.test.js`
- Create: `test/playbookShadowGate.test.js`
- Test: `test/playbookP3Gate.test.js`

**Interfaces:**

- Consumes: `parseArchitecturePlaybookShadowArgs(argv)` and `main(argv, dependencies?)`.
- Produces: one stable stdout summary on success and one safe stable error code on failure.
- Produces: `auditShadowDependencyBoundary({ projectRoot }): Promise<DependencyAudit>`.

- [ ] **Step 1: Add the three original minimal fixture blueprints**

Each fixture uses only actual top-level generator fields. Write the positive file exactly as:

```json
{
  "workflow": "construction_method_v1",
  "seed": 41001,
  "prompt": "中世纪木框石基民居",
  "architecture": {
    "style": "西方中世纪",
    "style_family": "medieval",
    "typology": "house",
    "volumes": [
      { "id": "main", "shape": "box", "scale": [1, 1, 1], "placement": { "relation": "center" }, "purpose": "main-building-envelope", "tags": ["primary-mass"] },
      { "id": "wing", "shape": "box", "scale": [0.65, 0.75, 0.6], "placement": { "relation": "attached-east", "attach_to": "main" }, "purpose": "side-wing", "tags": ["secondary-mass"] },
      { "id": "porch", "shape": "box", "scale": [0.35, 0.4, 0.3], "placement": { "relation": "attached-south", "attach_to": "main" }, "purpose": "entry-support", "tags": ["support-volume"] }
    ]
  },
  "structure": {
    "system": "timber-frame-on-stone-base",
    "structural_intent": { "floor_count": 2, "supports": "visible-timber-frame" },
    "foundation": { "strategy": "stone-plinth", "material": "minecraft:stone_bricks" },
    "load_paths": [
      { "id": "roof-main-base", "from": "roof-frame", "through": "main-posts", "to": "stone-plinth" },
      { "id": "wing-main-base", "from": "wing-frame", "through": "corner-posts", "to": "stone-plinth" }
    ],
    "support_elements": [
      { "id": "main-posts", "kind": "timber-post-grid", "target": "main", "priority": "primary" }
    ]
  },
  "roof": {
    "style": "gable",
    "profile": "steep-gable",
    "materials": { "roof": "minecraft:dark_oak_stairs", "trim": "minecraft:spruce_stairs" },
    "elements": [{ "id": "main-gable", "kind": "primary-roof" }],
    "overhang": 1
  },
  "facade": {
    "composition_strategy": { "source": "original-p4-fixture" },
    "facade_depth_layers": ["wall-plane", "timber-frame", "window-trim"],
    "facade_elements": ["timber-frame", "wall-infill", "window-trim"],
    "window_system": { "rhythm": "varied-bays", "width": 2, "height": 3, "spacing": 4 }
  }
}
```

Write the defect file exactly as:

```json
{
  "workflow": "construction_method_v1",
  "seed": 41002,
  "prompt": "存在体块与承托缺陷的中世纪民居",
  "architecture": {
    "style": "西方中世纪",
    "style_family": "medieval",
    "typology": "house",
    "volumes": [
      { "id": "a", "shape": "box", "scale": [1, 1, 1], "placement": { "relation": "detached-west" }, "purpose": "main-building-envelope", "tags": ["primary-mass"] },
      { "id": "b", "shape": "box", "scale": [1, 1, 1], "placement": { "relation": "detached-center" }, "purpose": "main-building-envelope", "tags": ["primary-mass"] },
      { "id": "c", "shape": "box", "scale": [1, 1, 1], "placement": { "relation": "detached-east" }, "purpose": "side-wing", "tags": ["secondary-mass"] }
    ]
  },
  "structure": {
    "system": "timber-frame",
    "structural_intent": { "floor_count": 3, "supports": "unresolved" },
    "foundation": { "strategy": "narrow-timber-foot", "material": "minecraft:oak_planks" },
    "load_paths": [],
    "support_elements": []
  },
  "roof": {
    "style": "gable",
    "profile": "single-unresolved-gable",
    "materials": { "roof": "minecraft:dark_oak_stairs", "trim": "minecraft:dark_oak_stairs" },
    "elements": [],
    "overhang": 2
  },
  "facade": {
    "composition_strategy": { "source": "original-p4-fixture" },
    "facade_depth_layers": ["wall-plane"],
    "facade_elements": ["repeated-window"],
    "window_system": { "rhythm": "identical-bays", "width": 2, "height": 2, "spacing": 3 }
  }
}
```

Write the control file exactly as:

```json
{
  "workflow": "construction_method_v1",
  "seed": 41003,
  "prompt": "现代单体纪念碑",
  "architecture": {
    "style": "现代极简",
    "style_family": "modern",
    "typology": "monument",
    "volumes": [
      { "id": "monolith", "shape": "box", "scale": [1, 2, 1], "placement": { "relation": "center" }, "purpose": "monument", "tags": ["single-monolith"] }
    ]
  },
  "structure": {
    "system": "reinforced-monolith",
    "structural_intent": { "floor_count": 1, "supports": "solid-core" },
    "foundation": { "strategy": "slab", "material": "minecraft:smooth_stone" },
    "load_paths": [{ "id": "core-base", "from": "monolith", "through": "solid-core", "to": "slab" }],
    "support_elements": []
  },
  "roof": {
    "style": "flat",
    "profile": "flat-cap",
    "materials": { "roof": "minecraft:smooth_stone", "trim": "minecraft:smooth_stone" },
    "elements": [],
    "overhang": 0
  },
  "facade": {
    "composition_strategy": { "source": "original-p4-fixture" },
    "facade_depth_layers": ["wall-plane"],
    "facade_elements": [],
    "window_system": { "rhythm": "none", "width": 0, "height": 0, "spacing": 0 }
  }
}
```

Do not add rule-only fields such as `massing.blank_plane_regions`, `facade.bay_grid`, or `roof.ridge_axis` that the current generator does not emit.

- [ ] **Step 2: Write failing CLI parser and end-to-end fixture tests**

```js
test('CLI parser accepts each required option once and rejects every other shape', () => {
  assert.deepEqual(
    parseArchitecturePlaybookShadowArgs(['--run', 'out/run-1', '--mode', 'mock']),
    { run: 'out/run-1', mode: 'mock' }
  );
  for (const argv of [
    [], ['--run', 'out/x'], ['--mode', 'mock'],
    ['--run', 'out/x', '--run', 'out/y', '--mode', 'mock'],
    ['--run', 'out/x', '--mode', 'other'],
    ['--run', 'out/x', '--mode', 'mock', '--force']
  ]) {
    assert.throws(() => parseArchitecturePlaybookShadowArgs(argv), /INVALID_ARGUMENT/u);
  }
});

test('mock CLI installs five artifacts and changes no pre-existing run bytes', async (t) => {
  const fixture = await cliFixture(t, 'medieval-positive.json');
  const before = await snapshotTree(fixture.runPath);
  const output = captureWritable();
  const result = await main(
    ['--run', fixture.runRelative, '--mode', 'mock'],
    { projectRoot: fixture.root, stdout: output }
  );
  const after = await snapshotTree(fixture.runPath, { exclude: 'playbook-shadow' });
  assert.deepEqual(after, before);
  assert.equal(result.assessment_count, 21);
  assert.match(output.text(), /assessment_count=21/u);
  assert.deepEqual(
    (await fs.readdir(path.join(fixture.runPath, 'playbook-shadow'))).sort(),
    [...SHADOW_OUTPUT_FILES].sort()
  );
});
```

- [ ] **Step 3: Run CLI tests and observe missing-module/script failure**

Run: `node --test test/architecturePlaybookShadowCli.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `runArchitecturePlaybookShadow.js`.

- [ ] **Step 4: Implement strict CLI parsing and the package script**

```js
export function parseArchitecturePlaybookShadowArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) throw shadowError('INVALID_ARGUMENT');
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--run', '--mode'].includes(key) || parsed.has(key) || !value) {
      throw shadowError('INVALID_ARGUMENT');
    }
    parsed.set(key, value);
  }
  if (!['mock', 'llm'].includes(parsed.get('--mode'))) throw shadowError('INVALID_ARGUMENT');
  return Object.freeze({ run: parsed.get('--run'), mode: parsed.get('--mode') });
}
```

`main(argv, { projectRoot = DEFAULT_PROJECT_ROOT, stdout = process.stdout, createClient, fsImpl } = {})` calls `runShadowReview`, writes only:

```text
shadow_status=created|updated|unchanged
mode=mock|llm
assessment_count=21
explanation_status=available|unavailable
run=<safe project-relative path>
```

At the top-level `isMain` branch, sanitize all errors to the spec code set, write only `<CODE>\n` to stderr, and set exit code 1. Add this package script:

```json
"playbook:shadow": "node src/runArchitecturePlaybookShadow.js"
```

- [ ] **Step 5: Generalize the existing dependency auditor without weakening P3**

In `manualDependencyBoundary.js`, preserve `auditManualDependencyBoundary({ projectRoot })` and all its existing outputs/tests. Extract its traversal into this additional export:

```js
export async function auditPlaybookSourceBoundary({
  projectRoot,
  entryPaths,
  forbiddenPaths,
  factNamespace
})
```

`entryPaths` accepts explicit files/directories under the project; `forbiddenPaths` accepts exact files/directories and their real paths. Keep the existing Acorn parse, literal ESM/CJS resolution, realpath checks, dynamic-loader capability denial, builtin handling, fail-closed unresolved facts, and stable project-relative facts unchanged. The existing manual wrapper passes `src/playbook/manual` and `src/construction`, then maps generic fields back to the old P3 field names so all P3 tests remain byte/shape compatible.

Implement the P4 adapter as:

```js
export async function auditShadowDependencyBoundary({ projectRoot }) {
  return auditPlaybookSourceBoundary({
    projectRoot,
    entryPaths: [
      'src/playbook/shadow',
      'src/runArchitecturePlaybookShadow.js'
    ],
    forbiddenPaths: [
      'src/construction',
      'src/pipeline.js',
      'src/index.js',
      'src/lib/minecraftCommands.js',
      'src/lib/minecraftWorlds.js'
    ],
    factNamespace: 'SHADOW'
  });
}
```

- [ ] **Step 6: Write the final P4 gate tests**

```js
test('checked-in P4 dependency graph has no forbidden or unresolved edges', async () => {
  const audit = await auditShadowDependencyBoundary({ projectRoot: ROOT });
  assert.equal(audit.import_boundary_violation_count, 0);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('three fixtures exercise positive, defect, and non-applicable outcomes without visual claims', async () => {
  const positive = await reviewFixtureFile('medieval-positive.json');
  const defect = await reviewFixtureFile('medieval-defect.json');
  const control = await reviewFixtureFile('non-applicable-control.json');
  assert.ok(positive.assessments.some((item) => item.status === 'satisfied'));
  assert.ok(defect.assessments.some((item) => item.status === 'violated'));
  assert.ok(control.assessments.some((item) => item.status === 'not-applicable'));
  for (const review of [positive, defect, control]) {
    assert.equal(review.assessments.length, 21);
    assert.ok(review.assessments.some((item) => item.status === 'unknown'));
    assert.equal(review.assessments.filter((item) => item.teaching_role === 'case-pattern').every(
      (item) => ['unknown', 'not-applicable'].includes(item.status) && item.repair_operation_id === null
    ), true);
  }
});

test('mock rerun is byte-identical and never mutates old run files', async (t) => {
  const fixture = await gateRunFixture(t);
  const oldBytes = await snapshotTree(fixture.runPath);
  await runShadowReview({ projectRoot: fixture.root, runArg: fixture.runRelative, mode: 'mock' });
  const first = await snapshotTree(path.join(fixture.runPath, 'playbook-shadow'));
  await runShadowReview({ projectRoot: fixture.root, runArg: fixture.runRelative, mode: 'mock' });
  const second = await snapshotTree(path.join(fixture.runPath, 'playbook-shadow'));
  assert.deepEqual(second, first);
  assert.deepEqual(await snapshotTree(fixture.runPath, { exclude: 'playbook-shadow' }), oldBytes);
});
```

Add injected fixture modules proving direct, transitive, symlink-resolved, and dynamically loaded edges to every forbidden path block the gate. Re-run the existing P3 gate to prove the generic extraction did not change its behavior.

- [ ] **Step 7: Run CLI, P4 gate, and P3 compatibility tests**

Run: `node --test --test-isolation=none test/architecturePlaybookShadowCli.test.js test/playbookShadowGate.test.js test/playbookP3Gate.test.js`

Expected: PASS with zero failures; P4 graph clean and P3 gate still reports `passed`.

- [ ] **Step 8: Commit Task 8**

```bash
git add package.json src/runArchitecturePlaybookShadow.js src/playbook/manual/manualDependencyBoundary.js src/playbook/shadow/shadowDependencyBoundary.js test/architecturePlaybookShadowCli.test.js test/playbookShadowGate.test.js test/playbookP3Gate.test.js test/fixtures/playbook-shadow
git commit -m "feat(playbook): expose P4 shadow review CLI"
```

---

### Task 9: Publish the P4 evidence report and run the final regression gates

**Files:**

- Create: `docs/architecture-playbook/reports/p4-shadow-guidance.md`
- Modify: `docs/architecture-playbook/README.md`
- Test: `test/docsProjectStatus.test.js`
- Test: all P4 test files and the complete repository suite

**Interfaces:**

- Consumes: verified command output and committed implementation behavior.
- Produces: an honest public phase report and README status that open P5 only, not P6.

- [ ] **Step 1: Write the failing documentation-status test**

```js
test('architecture playbook docs describe the strict P4 boundary', async () => {
  const readme = await fs.readFile(path.join(ROOT, 'docs/architecture-playbook/README.md'), 'utf8');
  const report = await fs.readFile(path.join(ROOT, 'docs/architecture-playbook/reports/p4-shadow-guidance.md'), 'utf8');
  assert.match(readme, /P4.*影子指导.*通过/u);
  assert.match(readme, /npm run playbook:shadow -- --run/u);
  assert.match(report, /21 条规则/u);
  assert.match(report, /15 条核心程序/u);
  assert.match(report, /6 条案例模式/u);
  assert.match(report, /没有视觉输入/u);
  assert.match(report, /没有修改建筑/u);
  assert.match(report, /不证明.*质量提升/u);
  assert.match(report, /P5/u);
  assert.doesNotMatch(report, /P6 已开放|已改善建筑审美/u);
});
```

- [ ] **Step 2: Run the docs test and observe the missing report failure**

Run: `node --test test/docsProjectStatus.test.js`

Expected: FAIL because `p4-shadow-guidance.md` does not exist.

- [ ] **Step 3: Write the report and update the stable README entrypoint**

The report must contain these sections with values copied from fresh test output:

```text
# P4 可执行建筑语法与影子指导门禁报告
## 范围与结论
## 输入、语料与确定性
## 21 条规则与四态结果
## 三个原创夹具
## LLM 权限与降级
## 路径、所有权与原子事务
## 依赖隔离
## 测试证据
## P5 入口与 P6 保留项
```

State explicitly: no visual input, no building mutation, no generator integration, no aesthetic score, no demonstrated quality improvement, and no generalization of the six case patterns. Correct the old README/P3 wording that implied P4 would perform candidate generation, visual evaluation, or rework; those remain P5/P6 work under the approved macro-stage mapping.

- [ ] **Step 4: Run the complete focused P4 suite**

Run:

```bash
node --test --test-isolation=none test/playbookShadowContracts.test.js test/playbookShadowCorpusProjection.test.js test/playbookShadowCheckerRegistry.test.js test/playbookShadowCheckers.test.js test/playbookShadowEvaluation.test.js test/playbookShadowExplanation.test.js test/playbookShadowStorage.test.js test/playbookShadowRun.test.js test/architecturePlaybookShadowCli.test.js test/playbookShadowGate.test.js test/docsProjectStatus.test.js
```

Expected: all tests pass, zero failures.

- [ ] **Step 5: Verify the checked-in P3 corpus remains current**

Run: `npm run playbook:manual -- check`

Expected output includes:

```text
playbook_status=current
reviewed_rule_count=21
artifact_count=5
managed_artifact_drift_count=0
```

- [ ] **Step 6: Run the complete repository regression suite**

Run: `npm test`

Expected: exit code 0 and zero failed tests. Record the actual test/pass counts in the P4 report; do not predict or hard-code them before the run.

- [ ] **Step 7: Run final repository hygiene checks**

Run: `git diff --check`

Expected: exit code 0 and no output.

Run: `git status --short`

Expected: only the explicitly planned P4 implementation, tests, fixtures, package script, README, and report are present before the final commit.

Run: `git ls-files out .local/architecture-playbook`

Expected: no P4 runtime output or private playbook material is tracked.

- [ ] **Step 8: Commit Task 9**

```bash
git add docs/architecture-playbook/README.md docs/architecture-playbook/reports/p4-shadow-guidance.md test/docsProjectStatus.test.js
git commit -m "docs(playbook): report P4 shadow guidance gate"
```

- [ ] **Step 9: Verify the committed branch before handoff**

Run: `git status --short --branch`

Expected: the P4 branch is clean.

Run: `git log --oneline --decorate -10`

Expected: nine implementation commits follow the approved design/plan commits, one for each independently reviewed task.
