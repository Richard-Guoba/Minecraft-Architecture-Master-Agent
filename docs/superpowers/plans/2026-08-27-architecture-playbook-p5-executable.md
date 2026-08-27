# Minecraft Architecture Playbook P5 Executable Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in, deterministic P5 design-layer controller that produces exactly three candidates, records five replayable checkpoints, performs at most one allowlisted repair transaction per candidate, filters through hard QA and P4 eligibility, and selects through the unchanged existing ranker.

**Architecture:** Keep `playbook=off` on the current pipeline and refactor the single production workflow into provider preparation, pure five-layer compilation, and downstream compilation seams. The P5 orchestrator composes those seams with immutable checkpoint storage, deterministic P4 review, typed repair compilers, targeted replay, rollback, and existing candidate ranking; it does not create a second generator.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, `node:assert/strict`, `node:fs/promises`, `node:crypto`, existing P4 canonical/contracts/storage patterns, existing construction agents, and Acorn/import-meta-resolve dependency auditing.

**Spec:** `docs/superpowers/specs/2026-08-27-architecture-playbook-p5-executable-design.md`

## Global Constraints

- The implementation base is reviewed P4 commit `ece476d39f63b5d0d4e6489a0f3154464b2496bd`; the approved design commit is `eef2a4472dec3f1e4da8cbad284d2059e9df8248`.
- `playbook` accepts exactly `off` and `execute`; omission equals `off`.
- The off path must preserve provider creation/call order, fixed-seed outputs, errors, ranking, installation behavior, and normalized artifact bytes.
- Execute mode accepts exactly three candidates, one initial round, and no forced reflection rounds.
- The design-layer order is exactly `brief`, `massing`, `structure`, `roof`, `facade`.
- Hard QA, P4 eligibility, and existing candidate ranking remain separate authorities.
- Only fifteen reviewed core procedures affect eligibility; case patterns, `unknown`, and `not-applicable` are neutral.
- Only the four checked-in structural P4 checks have executable repair compilers in v0.1.
- A candidate has one atomic repair budget; no replay may create or invoke an LLM client.
- General JSON Patch, arbitrary paths/values, coordinates, blocks, commands, voxel edits, visual evaluation, P6 scoring, and new evidence thresholds are forbidden.
- Versioned checkpoint/chain bodies are canonical, hash-bound, immutable, and read-only after promotion; only the managed current pointer may be atomically replaced.
- Candidate runs and replay never install into a world. Installation happens once, after selected-authority revalidation.
- No `out/`, `.local/`, provider transcript, checkpoint, generated datapack, or world artifact may be tracked.
- Tests must assert literal independent expectations; production validators, serializers, repair compilers, and rankers cannot compute their own expected results.
- Every task follows focused RED → minimal GREEN → focused regression → self-review → commit. Every task is independently reviewed before the next task begins.

---

## File and interface map

| File | Single responsibility |
| --- | --- |
| `src/playbook/execute/constants.js` | P5 versions, exact modes/layers/statuses/errors, invalidation graph, executable repair tuples and variants |
| `src/playbook/execute/contracts.js` | Exact-shape validation, deep freezing, canonical envelopes, and sanitized P5 errors |
| `src/playbook/execute/designEnvelope.js` | Mock/LLM P5-specific initial intent and repair-preference wrapper; never emits a patch |
| `src/construction/designStages.js` | Existing-provider preparation, five pure design-layer compilers, frozen generator context, and replay materialization |
| `src/playbook/execute/checkpoints.js` | Checkpoint envelopes, ordered upstream hashes, immutable chain manifests, and eligibility records |
| `src/playbook/execute/storage.js` | Descriptor-constrained owned P5 tree installation, immutable versions, current-pointer replacement, and selection promotion |
| `src/playbook/execute/eligibility.js` | P4 deterministic review adapter and score-free hard-QA/core-rule eligibility |
| `src/playbook/execute/repairRegistry.js` | Exact rule/check/repair/compiler tuple validation and frozen registry |
| `src/playbook/execute/repairCompilers/massing.js` | Three massing-owned typed repair operations |
| `src/playbook/execute/repairCompilers/structure.js` | Known-anchor load-path repair operation |
| `src/playbook/execute/repairTransaction.js` | Preference resolution, canonical ordering, semantic preconditions, conflict rejection, and atomic effect application |
| `src/playbook/execute/replay.js` | Earliest-layer deterministic replay, no-provider enforcement, QA/re-review, and rollback result |
| `src/playbook/execute/orchestrator.js` | Exactly-three candidate lifecycle, one repair budget, eligibility filtering, existing-ranker selection, and final revalidation |
| `src/playbook/execute/report.js` | Stable P5 selection JSON/Markdown rendering with no quality claim |
| `src/playbook/execute/executeDependencyBoundary.js` | P4 one-way dependency preservation and P6/visual-authority prohibition |

The plan deliberately does not add a P5-specific geometry engine, evaluator, ranker, or LLM client.

---

### Task 1: Exact P5 contracts and frozen P4 compatibility vectors

**Files:**
- Create: `src/playbook/execute/constants.js`
- Create: `src/playbook/execute/contracts.js`
- Create: `test/fixtures/playbook-execute/off-compatibility-v1.json`
- Create: `test/fixtures/playbookExecuteFixtures.js`
- Create: `test/playbookExecuteContracts.test.js`
- Create: `test/playbookExecuteOffCompatibility.test.js`

**Interfaces:**
- Consumes: `stableJson()`, `sha256()`, and `deepFreeze()` from `src/playbook/shadow/canonical.js`; reviewed rule IDs and runtime projections loaded only in tests at this task.
- Produces: `EXECUTE_SCHEMA_VERSION`, `EXECUTE_COMPILER_VERSION`, `PLAYBOOK_MODES`, `DESIGN_LAYER_ORDER`, `INVALIDATES_BY_LAYER`, `CHECKPOINT_STATUSES`, `P5_ERROR_CODES`, `EXECUTABLE_REPAIR_ROWS`, `executeError(code)`, `sanitizeExecuteError(error, fallback)`, and exact validators used by every later task.

- [ ] **Step 1: Add literal pre-P5 compatibility data captured from `ece476d`**

Create `test/fixtures/playbook-execute/off-compatibility-v1.json` with these exact values:

```json
{
  "schema_version": 1,
  "base_commit": "ece476d39f63b5d0d4e6489a0f3154464b2496bd",
  "prompt": "建造一座两层中世纪民居，三体块、深色坡屋顶、木框架与石质基座",
  "seed": 424242,
  "single": {
    "summary_sha256": "74fef7910970046f743a74e6ee312d3513d054e6895d4d40a158ebaea29ab5f9",
    "artifact_hashes": {
      "blueprint": "82c169bfc8d78f1a92da8d55c29475c97bbf93d8de91d6b8665b28d7503d9174",
      "buildFunction": "68ff458dd7b5bbf22249a8b6d1f418fc637fe1499971eae062ea85f4600cd829",
      "clearFunction": "0539309cac15917ba87a596b8afd0ef5c9e912c625740d80dbd9484012277e23",
      "runFunction": "568b2b7f3a56bd18743ddba22e6def4d56003dd536c3e18c9668fee7ad6d2631",
      "rawBuild": "2fb6917b76242d3154b8d4367bb2a24f02f5b9b860c8d2ab034a8fc3a58834b9",
      "previewHtml": "501e3964faf75f5879c221d6cd3e34edd4283dae87e05e363894eb27a1a060ff",
      "report": "ecb1c84b2e40ab0e1baa0217fa41f0f582dc9ee58de2c079d0057157139af3a3",
      "architectureScorecard": "19cc29a3854fe27559043ec5c0b4fc663a5f5eccd8e90d9e64cf2b8f6e2017db"
    }
  },
  "candidate": {
    "summary_sha256": "bca94f371933e4d330a78576a2f2a992f6eb9c270b5f2b51a2cce8504b8e7a4c",
    "artifact_hashes": {
      "blueprint": "20cff94d5bf5ba897cdf0c1fe983e097e9d9b1cdf82ad40ff2159995b33119c3",
      "buildFunction": "631973cf34ded1e5cbadc2e109ef05b48fc102b36c21c28b4486381ce73539c4",
      "clearFunction": "220bd03d4a4034541032922a7e4a6fd97dc57ec75dc70d0865f32b10cf424653",
      "runFunction": "568b2b7f3a56bd18743ddba22e6def4d56003dd536c3e18c9668fee7ad6d2631",
      "rawBuild": "351a3a9c2ea79b18a23654fbcf906173caeb61ed0b10693e2465626dee058b58",
      "previewHtml": "fd7df1886c8e480fd271fa5b497002787c406c9fb516ce2511a1c47dc22ccb9f",
      "report": "11b48e9262ee0edede72bfba8fe62005c0751dfcbd82b642b4a535305c2c65cf",
      "architectureScorecard": "ae8edd0e274d9c8d0234afa77e097b6b66394d8d344ac865c7db0a29a174f482",
      "candidateSelection": "36b93029145a623872225781901d3ca00e496d1959300318cb3cde8922f572ef",
      "candidateSelectionReport": "092e4dded81e6f304ee9e603f7445fe1a306b4a356f02449195d04bf1f2e4b6b"
    }
  }
}
```

- [ ] **Step 2: Write fixture normalization and baseline tests**

`test/fixtures/playbookExecuteFixtures.js` must export this exact normalizer and
capture shape (with the stated imports from `node:crypto`, `node:fs/promises`,
`node:path`, and P4 canonical JSON):

```js
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableJson } from '../../src/playbook/shadow/canonical.js';

export const OFF_COMPAT_PROMPT = '建造一座两层中世纪民居，三体块、深色坡屋顶、木框架与石质基座';
export const OFF_COMPAT_SEED = 424242;

const ARTIFACT_KEYS = [
  'blueprint', 'buildFunction', 'clearFunction', 'runFunction', 'rawBuild',
  'previewHtml', 'report', 'architectureScorecard', 'candidateSelection',
  'candidateSelectionReport'
];

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function normalizeOffCompatibility(value, { outRoot, runDir }) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOffCompatibility(item, { outRoot, runDir }));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      normalizeOffCompatibility(item, { outRoot, runDir })
    ]));
  }
  if (typeof value !== 'string') return value;
  return value
    .split(path.resolve(runDir)).join('<RUN>')
    .split(path.resolve(outRoot)).join('<ROOT>')
    .replaceAll('\\\\', '/');
}

export async function captureOffCompatibility(result, { outRoot, runDir }) {
  const artifact_hashes = {};
  for (const key of ARTIFACT_KEYS.filter((name) => result.artifacts[name])) {
    const filePath = result.artifacts[key];
    const raw = await fs.readFile(filePath);
    const normalized = path.extname(filePath) === '.json'
      ? stableJson(normalizeOffCompatibility(JSON.parse(raw.toString('utf8')), { outRoot, runDir }))
      : normalizeOffCompatibility(raw.toString('utf8'), { outRoot, runDir });
    artifact_hashes[key] = digest(Buffer.from(normalized));
  }
  const summary = normalizeOffCompatibility({
    workflow: result.workflow,
    runtime: result.runtime,
    seed: result.seed,
    seedSource: result.seedSource,
    llmProvider: result.llmProvider,
    llmUsage: result.llmUsage,
    validationOk: result.validation?.ok,
    candidateSelection: result.candidateSelection ? {
      candidate_count: result.candidateSelection.candidate_count,
      successful_count: result.candidateSelection.successful_count,
      selected_candidate_id: result.candidateSelection.selected_candidate_id,
      selected_seed: result.candidateSelection.selected_seed,
      ranking: result.candidateSelection.ranking.map((row) => ({
        rank: row.rank,
        candidate_id: row.candidate_id,
        seed: row.seed,
        selection_score: row.selection_score
      }))
    } : undefined
  }, { outRoot, runDir });
  return { summary_sha256: digest(Buffer.from(stableJson(summary))), artifact_hashes };
}
```

The implementation must replace exact absolute `runDir` with `<RUN>`, exact
absolute `outRoot` with `<ROOT>`, and Windows separators with `/`. It must parse
JSON before recursively normalizing string values; it must not delete fields,
sort arrays, round numbers, or call production P5 code.

`test/playbookExecuteOffCompatibility.test.js` runs the unmodified pipeline twice:

```js
await runPipeline({ prompt: OFF_COMPAT_PROMPT, mode: 'mock', seed: 424242, outRoot, cwd: process.cwd() });
await runPipeline({ prompt: OFF_COMPAT_PROMPT, mode: 'mock', seed: 424242, outRoot, cwd: process.cwd(), candidates: 3, candidateRounds: 1, candidateTargetScore: 95, candidateForceRounds: false });
```

Assert the exact summary and artifact hashes above, and assert explicit
`playbook: 'off'` produces the same values once that option exists.

- [ ] **Step 3: Prove the frozen P4 baseline before production work**

Run:

```bash
node --test --test-isolation=none test/playbookExecuteOffCompatibility.test.js
```

Expected: both single and three-candidate baseline cases pass; no P5 production
module exists yet. Treat any mismatch as a base/environment investigation, not
permission to update the fixture.

- [ ] **Step 4: Write exact contract RED tests**

In `test/playbookExecuteContracts.test.js`, import the not-yet-created exports
and assert:

```js
assert.deepEqual(PLAYBOOK_MODES, ['off', 'execute']);
assert.deepEqual(DESIGN_LAYER_ORDER, ['brief', 'massing', 'structure', 'roof', 'facade']);
assert.deepEqual(INVALIDATES_BY_LAYER.massing, ['structure', 'roof', 'facade']);
assert.deepEqual(INVALIDATES_BY_LAYER.structure, ['roof', 'facade']);
assert.equal(EXECUTABLE_REPAIR_ROWS.length, 4);
assert.throws(() => validatePlaybookMode('shadow'), { code: 'P5_MODE_INVALID' });
assert.throws(() => validateExecuteOptions({ playbook: 'execute', candidates: 2 }), { code: 'P5_OPTIONS_INCOMPATIBLE' });
```

Add table-driven exact-shape mutations for the frozen envelope, frozen generator
context, checkpoint payload/envelope, chain manifest, eligibility, repair
preference/request/resolved patch, and selection record. For every schema,
delete each required field, add `extra`, replace every scalar with the wrong
type, reorder every authoritative array, duplicate every ID row, and mutate each
hash away from `/^[a-f0-9]{64}$/u`.

- [ ] **Step 5: Run the contract RED test**

Run:

```bash
node --test --test-isolation=none test/playbookExecuteContracts.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/playbook/execute/constants.js`.

- [ ] **Step 6: Implement constants, errors, and exact validators**

`constants.js` must freeze literal arrays/objects and define the four rows from
spec section 10. `contracts.js` must use own enumerable data-property checks,
reject accessors/symbols/cycles/non-finite numbers, clone only JSON values,
validate exact key sets, call P4 `stableJson()`/`sha256()`, and return deeply
frozen values.

The error surface is:

```js
export class PlaybookExecuteError extends Error {
  constructor(code) { super(code); this.name = 'PlaybookExecuteError'; this.code = code; }
}
export function executeError(code) { return new PlaybookExecuteError(code); }
export function sanitizeExecuteError(error, fallback) {
  return error instanceof PlaybookExecuteError && P5_ERROR_CODES.includes(error.code)
    ? error
    : executeError(fallback);
}
```

No validator may repair, coerce, sort, deduplicate, truncate, or default an
already-present invalid value.

- [ ] **Step 7: Run focused GREEN and compatibility regression**

Run:

```bash
node --test --test-isolation=none test/playbookExecuteContracts.test.js test/playbookExecuteOffCompatibility.test.js test/playbookShadowContracts.test.js
```

Expected: all tests pass and the literal P4 hashes remain unchanged.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/playbook/execute/constants.js src/playbook/execute/contracts.js test/fixtures/playbook-execute/off-compatibility-v1.json test/fixtures/playbookExecuteFixtures.js test/playbookExecuteContracts.test.js test/playbookExecuteOffCompatibility.test.js
git commit -m "feat(playbook): define P5 executable contracts"
```

---

### Task 2: Frozen initial design envelope and bounded provider preference

**Files:**
- Create: `src/playbook/execute/designEnvelope.js`
- Create: `test/playbookExecuteDesignEnvelope.test.js`
- Modify: `src/playbook/execute/contracts.js`

**Interfaces:**
- Consumes: Task 1 exact constants/validators, the exact 21-card reviewed corpus supplied by the caller, and an existing client object exposing `name`, `isConfigured()`, and `chatJson()`.
- Produces: `createFrozenDesignEnvelope({ mode, candidateId, seed, prompt, cards, client }) -> Promise<FrozenDesignEnvelope>` and `buildDesignEnvelopePrompt({ candidateId, seed, prompt, cards }) -> deep-frozen packet`.

- [ ] **Step 1: Write mock and LLM RED tests**

Use literal candidate `candidate-01`, seed `1432164`, and the checked-in corpus.
Assert mock mode never reads `client` and returns all five layer rows in fixed
order. Assert LLM mode sends one exact bounded packet and accepts only:

```js
{
  schema_version: 1,
  candidate_id: 'candidate-01',
  seed: 1432164,
  brief_intent: 'medieval-residence',
  layer_intents: [
    { layer: 'brief', intent: 'residential-brief' },
    { layer: 'massing', intent: 'three-volume-hierarchy' },
    { layer: 'structure', intent: 'visible-support-path' },
    { layer: 'roof', intent: 'roof-follows-massing' },
    { layer: 'facade', intent: 'frame-before-openings' }
  ],
  selected_rule_ids: ['rule:structure.compose-three-volumes'],
  rejected_rule_ids: [],
  repair_variant_preferences: [
    {
      repair_operation_id: 'repair:massing:strengthen-primary-volume',
      variant_id: 'promote-largest-stable'
    }
  ]
}
```

Mutate candidate ID, seed, layer order, rule order/membership, case-pattern
repair preference, operation/variant pairs, duplicate preferences, prose over
800 Unicode code points, and every extra field. Each invalid LLM response must
reject the candidate with `P5_DESIGN_INVALID`; it must not keep a partial row.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test --test-isolation=none test/playbookExecuteDesignEnvelope.test.js
```

Expected: FAIL with missing `designEnvelope.js`.

- [ ] **Step 3: Implement the wrapper-controlled prompt and mock envelope**

The prompt packet publishes only candidate/seed, bounded prompt intent, exact
reviewed rule IDs and teaching roles, exact executable operation/variant rows,
five required layer rows, and an exact output contract. It contains no
blueprint, coordinates, blocks, world path, environment value, or raw private
corpus field.

Use one system instruction:

```text
Select design intents, reviewed rule IDs, and optional repair variant preferences from the supplied exact lists. Return no patch, path, value, coordinate, block, command, score, threshold, or extra field. Preserve candidate ID, seed, five layer rows, and canonical reviewed order.
```

Mock mode uses fixed local intent labels and deterministic default preferences;
it does not create or inspect a client.

- [ ] **Step 4: Implement whole-envelope degradation**

For LLM mode, require `client.isConfigured() === true`, call `chatJson()` once,
then validate the entire candidate. Configuration, request, or output failure
throws only `P5_DESIGN_INVALID`; provider name/body/error text never appears in
the public error. Do not fall back from invalid LLM output to mock intent.

- [ ] **Step 5: Run focused GREEN and authority mutations**

Run:

```bash
node --test --test-isolation=none test/playbookExecuteDesignEnvelope.test.js test/playbookExecuteContracts.test.js
```

Expected: all tests pass; client call count is exactly zero in mock and exactly
one in configured LLM success/failure cases.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/playbook/execute/designEnvelope.js src/playbook/execute/contracts.js test/playbookExecuteDesignEnvelope.test.js
git commit -m "feat(playbook): freeze P5 design preferences"
```

---

### Task 3: Pure production workflow seams with off-path byte parity

**Files:**
- Create: `src/construction/designStages.js`
- Create: `test/constructionDesignStages.test.js`
- Modify: `src/construction/workflow.js`
- Modify: `src/construction/agents/roofAgent.js`
- Modify: `test/exteriorDecoration.test.js`
- Test: `test/playbookExecuteOffCompatibility.test.js`

**Interfaces:**
- Consumes: Existing construction agents and Task 1 validators for frozen generator context/layer payloads.
- Produces:
  - `prepareConstructionDesign(options) -> Promise<PreparedConstructionDesign>`
  - `compileDesignLayers({ prepared, layerPayloads, resolvedEffectsByLayer }) -> CompiledDesignLayers`
  - `compilePreparedConstruction({ prepared, compiledLayers, outputDir, mcVersion, cwd, minecraftDir, world, datapacksDir, autoBuild }) -> Promise<existing workflow result>`
  - unchanged `runConstructionWorkflow(options) -> Promise<existing workflow result>` delegating through the three seams.

- [ ] **Step 1: Write layer-order and frozen-context RED tests**

Use an injected configured mock client whose calls append labels. Assert
`prepareConstructionDesign()` preserves the existing architect → planner →
creative call trace, returns plain canonicalizable data, and rejects a client,
function, accessor, symbol, cycle, or mutable grid inside the persisted frozen
context.

Assert `compileDesignLayers()` returns exact keys:

```js
['brief', 'massing', 'structure', 'roof', 'facade', 'runtime']
```

and calls local agents in `structure`, `roof`, `facade` order. Assert `RoofAgent`
produces identical output with its old ignored facade argument and the new
facade-free internal call.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test --test-isolation=none test/constructionDesignStages.test.js
```

Expected: FAIL because `designStages.js` does not exist.

- [ ] **Step 3: Extract provider preparation without changing its order**

Move the existing workflow segment from client creation through architecture,
style/material derivation, template knowledge, planner, concept studio,
creative design, Stage 7 shadow, and LLM usage into
`prepareConstructionDesign()`. Accept optional `llmClient`; when absent create
exactly one client using the current factory. Return both runtime-only objects
and the validated `frozen_generator_context`; never serialize the client.

The default `runConstructionWorkflow()` must still create one client at the same
point and perform the same calls when `playbook` is absent/off.

- [ ] **Step 4: Extract five pure layer compilers**

Define and export exact internal functions:

```js
compileBriefLayer({ prepared, previousLayer, effects })
compileMassingLayer({ prepared, brief, previousLayer, effects })
compileStructureLayer({ prepared, brief, massing, previousLayer, effects })
compileRoofLayer({ prepared, brief, massing, structure, previousLayer, effects })
compileFacadeLayer({ prepared, brief, massing, structure, roof, previousLayer, effects })
```

Each returns a validated plain payload plus the current runtime agent value. An
effect-free call must preserve current architecture/buildSpec/structure/roof/
facade values exactly. Effects are accepted as an array but Task 3 supports only
an empty array; a non-empty effect fails `P5_REPAIR_INVALID` until Task 7 adds
the typed applicator.

- [ ] **Step 5: Extract downstream compilation and retain the public result**

Move site, CSG, BSP, openings, paths, interior, decoration, repairs, optimizer,
blueprint, review/scorecard/critic, artifact export, and return assembly into
`compilePreparedConstruction()`. It consumes runtime values materialized from
the five layers and returns the exact existing result shape.

Keep `runConstructionWorkflow(options)` as:

```js
const prepared = await prepareConstructionDesign(options);
const compiledLayers = compileDesignLayers({ prepared, layerPayloads: undefined, resolvedEffectsByLayer: {} });
return compilePreparedConstruction({ ...options, prepared, compiledLayers });
```

- [ ] **Step 6: Run focused GREEN and literal compatibility vectors**

Run:

```bash
node --test --test-isolation=none test/constructionDesignStages.test.js test/exteriorDecoration.test.js test/playbookExecuteOffCompatibility.test.js test/pipeline.test.js test/candidatePipeline.test.js
```

Expected: every Task 1 literal hash passes unchanged, provider call traces are
unchanged, and all existing pipeline tests pass.

- [ ] **Step 7: Mutation self-review**

Temporarily reverse roof/facade compilation, create a second client, remove a
frozen-context field, and pass a mutable reference through a payload. Confirm
the new tests fail for each mutation, then restore production code.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/construction/designStages.js src/construction/workflow.js src/construction/agents/roofAgent.js test/constructionDesignStages.test.js test/exteriorDecoration.test.js
git commit -m "refactor(construction): expose replayable design stages"
```

---

### Task 4: Canonical checkpoints, chain manifests, and score-free eligibility records

**Files:**
- Create: `src/playbook/execute/checkpoints.js`
- Create: `test/playbookExecuteCheckpoints.test.js`
- Modify: `src/playbook/execute/contracts.js`

**Interfaces:**
- Consumes: Task 1 canonical validators/constants and Task 3 five layer payloads/frozen hashes.
- Produces:
  - `createCheckpointEnvelope(input) -> { checkpoint_sha256, checkpoint }`
  - `checkpointBytes(envelope) -> Buffer`
  - `createChainManifest(input) -> deep-frozen manifest`
  - `chainManifestBytes(manifest) -> Buffer`
  - `chainManifestHash(manifest) -> lowercase SHA-256`
  - `createEligibilityRecord(input) -> exact score-free record`

- [ ] **Step 1: Write literal checkpoint RED vectors**

Construct a five-layer fixture with independent 64-character hashes (`'1'.repeat(64)` through `'5'.repeat(64)`). Assert brief has no upstream rows,
massing has exactly brief, structure has brief+massing, roof has three rows, and
facade has four rows in fixed order.

Use `node:crypto` directly in the test to hash one literal canonical payload and
assert `createCheckpointEnvelope()` matches it. Do not call production
`checkpointBytes()` to compute the expected hash.

Mutate revision, status, upstream order, selected/rejected overlap, layer-owned
recipe shape, field-patch type, hard-QA hash, review hash, replay origin,
invalidation array, envelope self-hash, and chain parent hash.

- [ ] **Step 2: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteCheckpoints.test.js
```

Expected: FAIL with missing `checkpoints.js`.

- [ ] **Step 3: Implement immutable checkpoint envelopes**

Build the checkpoint object in spec field order, validate it, serialize with
P4 `stableJson()`, hash those exact bytes, then validate the outer envelope.
Return a deep-frozen clone. Never include `checkpoint_sha256` inside the hashed
checkpoint payload.

The exact upstream rows are derived from `DESIGN_LAYER_ORDER.slice(0, index)` and
the supplied preceding envelopes; callers cannot supply a different order.

- [ ] **Step 4: Implement chain manifests and eligibility records**

Require exactly five `{ layer, checkpoint_sha256 }` rows. Require exact hashes
for frozen design, frozen generator context, blueprint, hard QA, P4 review, and
nullable repair transaction. Eligibility is exactly:

```js
{
  status: 'eligible',
  hard_qa_ok: true,
  unresolved_violated_core_rule_ids: [],
  neutral_unknown_rule_ids: [],
  neutral_not_applicable_rule_ids: [],
  repair_budget_used: 0
}
```

Allowed non-eligible statuses are the five values in spec section 9.3. No
`score`, `points`, `percent`, `grade`, `threshold`, or arbitrary reason text is
allowed anywhere in this record.

- [ ] **Step 5: Run focused GREEN**

```bash
node --test --test-isolation=none test/playbookExecuteCheckpoints.test.js test/playbookExecuteContracts.test.js
```

Expected: all exact hash, ordering, mutation, and score-prohibition tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/playbook/execute/checkpoints.js src/playbook/execute/contracts.js test/playbookExecuteCheckpoints.test.js
git commit -m "feat(playbook): add immutable P5 checkpoints"
```

---

### Task 5: Descriptor-constrained P5 owned storage and atomic pointers

**Files:**
- Create: `src/playbook/execute/storage.js`
- Create: `test/playbookExecuteStorage.test.js`
- Modify: `src/playbook/execute/contracts.js`
- Test: `test/playbookShadowStorage.test.js`

**Interfaces:**
- Consumes: Task 4 validated immutable bytes/manifests and a pipeline-created absolute run directory.
- Produces:
  - `admitExecuteRun({ runDir, fsImpl }) -> authority`
  - `installCandidateSnapshot({ authority, candidateId, files, currentChain, expectedPreviousChainSha256, fsImpl }) -> installed result`
  - `readCurrentCandidateSnapshot({ authority, candidateId, fsImpl }) -> validated immutable bytes`
  - `installExecuteSelection({ authority, files, fsImpl }) -> installed result`
  - `authority.close() -> Promise<void>`

- [ ] **Step 1: Write admission and ownership RED tests**

Create a real temporary run directory. Assert admission rejects a missing run,
non-directory, every symlinked component, control/line-separator characters,
and a directory swapped between `lstat` and descriptor open. Assert candidate
IDs accept only `candidate-01`, `candidate-02`, and `candidate-03`.

Assert all public failures are exact P5 codes and contain no absolute path,
fixture bytes, provider text, or raw OS error.

- [ ] **Step 2: Write promotion/rollback RED tests**

Use a five-file minimal candidate snapshot plus manifest. Cover:

- first exclusive installation;
- identical snapshot is inode-for-inode unchanged;
- owned replacement with expected previous chain hash;
- stale previous hash;
- extra/missing/non-Buffer files;
- corrupt/hash-drifted manifest;
- unowned destination and unknown files;
- target file/output symlinks and source swaps;
- stage and backup name collisions;
- injected failure on every exclusive write, chmod, sync, directory sync,
  backup rename, final no-replace rename, pointer replacement, and cleanup;
- rollback cleanup failure leaves the verified backup recoverable;
- unrelated run/world bytes remain identical.

- [ ] **Step 3: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteStorage.test.js
```

Expected: FAIL with missing `storage.js`.

- [ ] **Step 4: Implement descriptor-relative authority**

Follow the P4 storage threat model without importing P5 into P4. Open the
absolute run and its parent with `O_DIRECTORY | O_NOFOLLOW`, compare device/inode
before and after every authority-sensitive mutation, and use generated ASCII
basenames only. Keep authority internals in a `WeakMap`; expose no handles or
mutable buffers.

Use fixed prefixes:

```text
.playbook-execute.stage-
.playbook-execute.backup-
```

Use the reviewed Linux no-replace primitive
`/usr/bin/mv --no-clobber --no-target-directory` with descriptor-relative
`/proc/self/fd/<fd>/<basename>` paths. Missing GNU support fails closed with
`P5_INSTALL_FAILED`.

- [ ] **Step 5: Implement whole-candidate snapshot promotion**

Every candidate update stages a complete owned `candidate-0N` snapshot,
including all prior immutable bodies plus new versioned bodies and one
`current-chain.json`. Validate the staged tree from descriptor reads, chmod
versioned bodies read-only, sync files/directories, reserve a no-replace backup,
and atomically promote the complete directory. On failure restore the exact old
directory before surfacing a sanitized code.

Selection files are installed only after all candidate snapshots and use their
own exact managed manifest.

- [ ] **Step 6: Run focused GREEN and P4 regression**

```bash
node --test --test-isolation=none test/playbookExecuteStorage.test.js test/playbookShadowStorage.test.js
```

Expected: all P5 mutation/rollback tests and all existing P4 storage tests pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/playbook/execute/storage.js src/playbook/execute/contracts.js test/playbookExecuteStorage.test.js
git commit -m "feat(playbook): install immutable P5 evidence safely"
```

---

### Task 6: Deterministic P4 review adapter and score-free eligibility

**Files:**
- Create: `src/playbook/execute/eligibility.js`
- Create: `test/playbookExecuteEligibility.test.js`
- Modify: `src/playbook/shadow/runShadowReview.js`
- Modify: `test/playbookShadowRun.test.js`
- Test: `test/playbookShadowGate.test.js`

**Interfaces:**
- Consumes: Task 4 eligibility contracts, exact blueprint bytes, checked-in P4 corpus, and existing P4 checker registry.
- Produces: `buildDeterministicShadowReview({ projectRoot, blueprintBytes, blueprintRelativePath }) -> Promise<Review>`, `evaluateExecuteEligibility({ review, hardQa, repairBudgetUsed }) -> EligibilityRecord`, and `executableViolations(review) -> ordered assessment rows`.

- [ ] **Step 1: Write P4 extraction RED tests**

For a fixed blueprint fixture, compare the proposed deterministic review
byte-for-byte with `review.json` from existing
`buildShadowArtifacts({ mode: 'mock' })`. Inject a client factory that throws if
touched. Rerun existing shadow artifacts twice and assert all five P4 output
files remain byte-identical after extraction.

- [ ] **Step 2: Write eligibility RED tests**

Build literal 21-row reviews in checked-in card order and assert:

```js
assert.equal(evaluateExecuteEligibility({ review: allNeutral, hardQa: { ok: true }, repairBudgetUsed: 0 }).status, 'eligible');
assert.equal(evaluateExecuteEligibility({ review: oneCoreViolation, hardQa: { ok: true }, repairBudgetUsed: 0 }).status, 'unresolved-core-violation');
assert.equal(evaluateExecuteEligibility({ review: allSatisfied, hardQa: { ok: false }, repairBudgetUsed: 0 }).status, 'hard-qa-failed');
```

Because P4 forbids a case-pattern violation, mutate one immediately before the
P5 adapter and assert `P5_AUTHORITY_INVALID`, not eligibility. Add mutations for
14/16 core rows, 5/7 case rows, reordered assessments, invented rule/check/repair
IDs, wrong corpus hash, repair on `unknown`, core violation without its reviewed
repair, and every score-like extra field.

- [ ] **Step 3: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteEligibility.test.js test/playbookShadowRun.test.js
```

Expected: FAIL because the deterministic review export and P5 adapter do not
exist.

- [ ] **Step 4: Extract the pure P4 review builder**

Move only blueprint parse, corpus load, registry validation, and
`evaluateShadowReview()` into the new export. Refactor `buildShadowArtifacts()`
to call it before prompt/explanation/report creation. Do not change manifest
fields, hashes, output order, explanation behavior, or storage.

- [ ] **Step 5: Implement exact eligibility classification**

Validate the complete P4 review. Require exact 15/6 teaching-role counts. Treat
only core `violated` as unresolved, preserve core unknown/not-applicable IDs in
reviewed order, and copy no prose. `executableViolations()` additionally
requires one of Task 1's four exact tuples. A violated evidence-required core
row remains unresolved but cannot enter the repair registry.

- [ ] **Step 6: Run focused GREEN and P4 byte regression**

```bash
node --test --test-isolation=none test/playbookExecuteEligibility.test.js test/playbookShadowRun.test.js test/playbookShadowGate.test.js test/playbookShadowContracts.test.js
```

Expected: all tests pass; P4 bytes and dependency boundary remain unchanged.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/playbook/execute/eligibility.js src/playbook/shadow/runShadowReview.js test/playbookExecuteEligibility.test.js test/playbookShadowRun.test.js
git commit -m "feat(playbook): gate P5 with deterministic reviews"
```

---

### Task 7: Exact repair registry, typed compilers, and atomic transaction planning

**Files:**
- Create: `src/playbook/execute/repairRegistry.js`
- Create: `src/playbook/execute/repairCompilers/massing.js`
- Create: `src/playbook/execute/repairCompilers/structure.js`
- Create: `src/playbook/execute/repairTransaction.js`
- Create: `test/playbookExecuteRepairRegistry.test.js`
- Create: `test/playbookExecuteRepairCompilers.test.js`
- Create: `test/playbookExecuteRepairTransaction.test.js`
- Modify: `src/playbook/execute/contracts.js`

**Interfaces:**
- Consumes: Task 1 tuples/preferences, Task 3 layer payloads, Task 4 accepted chain hashes, Task 6 ordered executable violations, and checked-in P4 card/checker definitions.
- Produces: `createExecutableRepairRegistry()`, `validateExecutableRepairRegistry({ cards, checkerDefinitions, registry })`, `compileMassingRepair(input)`, `compileStructureRepair(input)`, `buildRepairTransaction(input)`, and `applyLayerEffects(input)`.

- [ ] **Step 1: Write registry authority RED tests**

Assert exact operation/variant pairs:

```text
repair:massing:resize-or-reposition-volume
  center-primary-and-reattach-secondaries
  differentiate-equal-secondary-scale
repair:massing:strengthen-primary-volume
  promote-largest-stable
  reduce-nondominant-secondary
repair:massing:reduce-support-volume-prominence
  reduce-attached-support-scale
repair:structure:connect-support-path
  connect-known-structural-anchors
```

Reject missing/extra/duplicate operations, wrong rule/check/design layer,
wrong invalidation, mutable map methods, a `forEach` backing-map leak, replaced
compiler, evidence-required checker, case-pattern row, and runtime-added variant.

- [ ] **Step 2: Write each variant's RED matrix**

For massing, use literal boxes `main`, `side-a`, and `side-b` with positive
integer scales and explicit placements. Verify centered reattachment preserves
all IDs; equal-scale differentiation changes exactly one axis by the smallest
positive amount; largest promotion uses lexicographic ID tie-break; and scale
reduction stops at the first strictly-smaller integer product. Reject malformed,
detached, non-three-volume, zero-scale, and non-repairable inputs.

For structure, use exact anchors:

```js
{
  upper: { id: 'roof-main', hash: 'a'.repeat(64) },
  frame: { id: 'frame-main', hash: 'b'.repeat(64) },
  base: { id: 'foundation-main', hash: 'c'.repeat(64) }
}
```

The only valid result is a typed `set-load-path` using those IDs. Reject missing,
duplicate, changed, accessor-backed, or coordinate-bearing anchors.

- [ ] **Step 3: Write transaction RED tests**

Assert request rows are constructed locally from review + frozen preferences;
provider fields cannot override candidate/rule/operation/base hash. Omitted
preference calls deterministic `chooseDefault()`; an explicitly selected
inapplicable variant fails instead of falling back.

Assert canonical layer/corpus order, one budget, same-field conflict even for
equal values, no partial output, original-chain base binding, and replay-time
anchor validation. Allow only:

```text
set-volume-role
set-volume-placement
set-volume-scale-axis
set-load-path
```

Reject `path`, `pointer`, `coordinate`, `block`, `command`, `score`, `threshold`,
unknown keys, non-finite values, and overlong text.

- [ ] **Step 4: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteRepairRegistry.test.js test/playbookExecuteRepairCompilers.test.js test/playbookExecuteRepairTransaction.test.js
```

Expected: FAIL with missing repair modules.

- [ ] **Step 5: Implement the frozen registry and typed compilers**

Use frozen definition rows whose compilers close over no mutable state. Return
effects in candidate volume/path order, never object enumeration order. Compute
precondition hashes over canonical minimal semantic anchors.

`applyLayerEffects()` clones the validated layer payload, applies only the four
typed effect forms to owned fields, revalidates the full payload, and returns a
deep-frozen result without mutating the original.

- [ ] **Step 6: Implement all-or-nothing transaction planning**

Compile all executable violations against one original chain, collect effects,
reject conflicts, then validate this exact shape:

```js
{
  schema_version: 1,
  compiler_version: 1,
  candidate_id,
  base_chain_sha256,
  repair_budget: 1,
  earliest_target_layer,
  operations,
  invalidates_layers
}
```

No function/client/runtime object may survive canonical validation.

- [ ] **Step 7: Run focused GREEN and checker regressions**

```bash
node --test --test-isolation=none test/playbookExecuteRepairRegistry.test.js test/playbookExecuteRepairCompilers.test.js test/playbookExecuteRepairTransaction.test.js test/playbookShadowCheckerRegistry.test.js test/playbookShadowCheckers.test.js
```

Expected: all tests pass; removing any precondition, conflict, or ownership check
causes a focused failure.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/playbook/execute/repairRegistry.js src/playbook/execute/repairCompilers/massing.js src/playbook/execute/repairCompilers/structure.js src/playbook/execute/repairTransaction.js src/playbook/execute/contracts.js test/playbookExecuteRepairRegistry.test.js test/playbookExecuteRepairCompilers.test.js test/playbookExecuteRepairTransaction.test.js
git commit -m "feat(playbook): compile bounded P5 repairs"
```

---

### Task 8: Targeted replay, deterministic recompile, and rollback

**Files:**
- Create: `src/playbook/execute/replay.js`
- Create: `test/playbookExecuteReplay.test.js`
- Modify: `src/construction/designStages.js`
- Modify: `src/playbook/execute/storage.js`
- Test: `test/constructionDesignStages.test.js`
- Test: `test/playbookExecuteStorage.test.js`

**Interfaces:**
- Consumes: Task 3 preparation/layer/downstream compilers, Task 4 checkpoint builders, Task 5 snapshot storage, Task 6 review/eligibility, and Task 7 transaction/effect applicator.
- Produces: `replayCandidate({ authority, candidate, transaction, projectRoot, compilePrepared, fsImpl, faultInjector }) -> Promise<ReplayResult>`.

The in-memory `candidate` key set is exact:

```js
{
  candidate_id,
  seed,
  frozen_design,
  frozen_generator_context,
  prepared_design,
  current_chain,
  checkpoint_envelopes,
  initial_result,
  hard_qa,
  p4_review,
  playbook_eligibility
}
```

Only `prepared_design` and `initial_result` are runtime values; neither is
written directly. Every persisted field is rebuilt through Task 1/4 contracts.

- [ ] **Step 1: Write massing and structure replay RED fixtures**

Build one accepted candidate with five checkpoints, frozen context, exact
blueprint/QA/P4 bytes, and a temporary snapshot. For massing replay assert only
brief stays byte-identical. For structure replay assert brief+massing stay
byte-identical. Target/downstream revisions increment exactly one and
`replay_origin` binds base chain + transaction hashes.

- [ ] **Step 2: Write no-provider and deterministic replay RED tests**

Install a client factory that throws `provider-created-during-replay`. Replay
the same frozen input/patch/seed in separate roots and assert identical
checkpoint, chain, blueprint, operation, build-function, and datapack hashes.
Reject any function/client inserted into frozen context before output.

- [ ] **Step 3: Write rollback RED tests**

Inject failure at `apply-effects`, each layer compile, downstream compile,
blueprint, hard QA, P4 review, hashing, stage/write/sync/promote/pointer/cleanup.
For every case assert original current-chain bytes/hash/inode remain authoritative,
no partial revision is current, sanitized evidence is retained when safe, no
datapack installs, and unrelated run/world bytes remain identical.

- [ ] **Step 4: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteReplay.test.js
```

Expected: FAIL with missing `replay.js`.

- [ ] **Step 5: Enable non-empty typed effects in design stages**

Replace Task 3's temporary rejection with `applyLayerEffects()`. At each layer:
compile/materialize, revalidate live anchors, apply that layer's effects once,
revalidate/freeze, then pass the exact result downstream. No layer reads a later
layer and `compilePreparedConstruction()` uses no provider path.

- [ ] **Step 6: Implement replay and re-review**

Validate authority/current chain/transaction, replay from earliest target,
build new envelopes/chain in memory, compile into a private attempt directory,
run `BlueprintQAAgent`, build deterministic P4 review over exact blueprint bytes,
and evaluate eligibility with `repairBudgetUsed: 1`.

Always pass `world: undefined`, `datapacksDir: undefined`, and
`minecraftDir: undefined` to replay compilation. A replay test must fail if any
world resolver or datapack installer is invoked.

Only a complete validated snapshot can be promoted. A successful-but-still-
violated replay is retained as ineligible evidence without a second attempt.

- [ ] **Step 7: Run focused GREEN and regressions**

```bash
node --test --test-isolation=none test/playbookExecuteReplay.test.js test/constructionDesignStages.test.js test/playbookExecuteStorage.test.js test/playbookExecuteRepairTransaction.test.js
```

Expected: all replay, deterministic, mutation, and rollback tests pass.

- [ ] **Step 8: Commit Task 8**

```bash
git add src/playbook/execute/replay.js src/construction/designStages.js src/playbook/execute/storage.js test/playbookExecuteReplay.test.js test/constructionDesignStages.test.js test/playbookExecuteStorage.test.js
git commit -m "feat(playbook): replay P5 layers with rollback"
```

---

### Task 9: Exactly-three orchestration, eligibility filtering, and unchanged ranking

**Files:**
- Create: `src/playbook/execute/orchestrator.js`
- Create: `src/playbook/execute/report.js`
- Create: `src/construction/candidatePipelineSupport.js`
- Create: `test/playbookExecuteOrchestrator.test.js`
- Create: `test/fixtures/playbook-execute/medieval-repairable.json`
- Create: `test/fixtures/playbook-execute/medieval-no-eligible.json`
- Modify: `src/pipeline.js`
- Modify: `test/candidatePipeline.test.js`
- Test: `test/playbookExecuteOffCompatibility.test.js`

**Interfaces:**
- Consumes: Tasks 2–8, existing `CandidateSelectionAgent`, existing seed/install behavior, and normal pipeline options.
- Produces: `candidateSeedFor()`, `installSelectedDatapack()`, `runExecutablePlaybookPipeline(options, dependencies) -> Promise<existing result + playbookExecution>`, `renderExecuteSelectionReport(selection) -> stable Markdown`, and `runPipeline({ playbook, ...existing })` with unchanged off results.

`dependencies` is an optional test seam with this exact key set and production
defaults; unknown keys are rejected:

```js
{
  createClient,
  createEnvelope: createFrozenDesignEnvelope,
  prepareDesign: prepareConstructionDesign,
  compileLayers: compileDesignLayers,
  compilePrepared: compilePreparedConstruction,
  buildReview: buildDeterministicShadowReview,
  buildTransaction: buildRepairTransaction,
  replay: replayCandidate,
  createSelectionAgent: () => new CandidateSelectionAgent(),
  installSelected: installSelectedDatapack
}
```

- [ ] **Step 1: Write option-boundary RED tests**

Call `runPipeline()` with spies. Invalid mode, candidates 1/2/4, rounds 2, forced
rounds, and incompatible Stage 7 artifact provider must fail before timestamp/
output, client, candidate, world, or install work. Omitted execute candidates/
rounds normalize to 3/1. Omitted playbook and explicit off retain current
clamping and Task 1 literal hashes.

Change the programmatic signatures so omission remains observable: remove the
parameter defaults from `candidates` and `candidateRounds`, then normalize inside
the selected mode. Off mode maps `undefined` to 1/1 exactly as before; execute
maps `undefined` to 3/1 and rejects every explicit non-3/non-1 value. The CLI
Task 10 must likewise track whether each option was explicitly supplied.

- [ ] **Step 2: Write three-candidate lifecycle RED tests**

Inject results so candidate 01 is immediately eligible, candidate 02 becomes
eligible after one massing replay, and candidate 03 remains violated after one
replay. Assert stable IDs/seeds, three evidence trees, five layers each, one
total repair attempt for 02/03, zero replay client creation, and only 01/02 reach
the ranker.

- [ ] **Step 3: Write ranking and installation RED tests**

Give ineligible candidate 03 the highest existing heuristic score and prove it
cannot rank. For 01/02 assert the selected ID/ranking exactly match a direct
unchanged `CandidateSelectionAgent` call.

Assert no P5 artifact contains `playbook_score`, `quality_improvement`, or a new
score/threshold. Mutate each selected authority hash before install and assert
`P5_INSTALL_FAILED` with zero world changes. For no eligible candidates assert
`P5_NO_ELIGIBLE_CANDIDATE`, evidence retained, no selection pointer, and no
installation.

- [ ] **Step 4: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteOrchestrator.test.js
```

Expected: FAIL with missing orchestrator.

- [ ] **Step 5: Implement the candidate lifecycle**

First extract the existing `candidateSeedFor()` and
`installSelectedDatapack()` implementations unchanged into
`src/construction/candidatePipelineSupport.js`. Re-export `candidateSeedFor`
from `src/pipeline.js` for current callers. Both off and execute pipelines import
the support module, preventing an orchestrator↔pipeline circular dependency.

For indexes 1..3:

1. derive the existing stable seed;
2. create/reuse one initial client only in non-mock mode;
3. create the frozen P5 envelope before workflow preparation;
4. prepare, compile five layers, and compile the full initial candidate without
   world/datapack targets;
5. run hard QA and deterministic review; when hard QA passes, create/install the
   initial accepted structural chain, otherwise install only an immutable failed
   evidence snapshot with no current accepted-chain pointer;
6. classify eligibility;
7. when executable violations exist, build exactly one transaction and replay;
8. retain candidate-local stable failure evidence and continue unless corpus,
   registry, or output ownership is run-wide invalid.

Do not enter the old reflection-round loop in execute mode.

- [ ] **Step 6: Filter before the unchanged ranker**

Use this exact boundary:

```js
const eligibleRecords = records.filter(
  (record) => record.playbookEligibility.status === 'eligible'
);
const ranked = new CandidateSelectionAgent().run(eligibleRecords, {
  targetScore,
  scope: 'playbook-execute'
});
```

Keep all three rows in P5 audit output. Revalidate the selected current snapshot
through Task 5 immediately before calling the existing installer exactly once.

- [ ] **Step 7: Implement stable P5 report artifacts**

`selection.json` contains exact IDs, seeds, chain/review/QA hashes, eligibility,
repair attempt counts, selected ID, and existing ranker result. Markdown states
four executable repairs, eleven evidence-required core rules, neutral case
patterns, no playbook score, and no quality claim. It contains no raw provider
error or path outside the run.

The returned addition is exactly:

```js
playbookExecution: {
  mode: 'execute',
  candidate_count: 3,
  selected_candidate_id,
  selected_chain_sha256,
  repair_attempt_count,
  candidates
}
```

and `artifacts` adds only `playbookExecutionManifest`,
`playbookExecutionSelection`, and `playbookExecutionReport`. Off mode adds none
of these keys.

- [ ] **Step 8: Run focused GREEN plus off regression**

```bash
node --test --test-isolation=none test/playbookExecuteOrchestrator.test.js test/candidatePipeline.test.js test/playbookExecuteOffCompatibility.test.js test/pipeline.test.js
```

Expected: P5 lifecycle passes, current candidate selection remains unchanged,
and every frozen P4 off hash still matches.

- [ ] **Step 9: Commit Task 9**

```bash
git add src/playbook/execute/orchestrator.js src/playbook/execute/report.js src/construction/candidatePipelineSupport.js src/pipeline.js test/playbookExecuteOrchestrator.test.js test/candidatePipeline.test.js test/fixtures/playbook-execute/medieval-repairable.json test/fixtures/playbook-execute/medieval-no-eligible.json
git commit -m "feat(playbook): orchestrate executable P5 candidates"
```

---

### Task 10: CLI, dependency gates, acceptance fixtures, documentation, and full evidence

**Files:**
- Create: `src/playbook/execute/executeDependencyBoundary.js`
- Create: `test/playbookExecuteCli.test.js`
- Create: `test/playbookExecuteGate.test.js`
- Create: `test/fixtures/playbook-execute/medieval-positive.json`
- Create: `docs/architecture-playbook/reports/p5-executable-design-layer.md`
- Modify: `src/index.js`
- Modify: `package.json`
- Modify: `docs/architecture-playbook/README.md`
- Modify: `README.md`
- Modify: `test/docsProjectStatus.test.js`
- Test: every P4 suite and the full repository suite

**Interfaces:**
- Consumes: completed P5 orchestrator and all spec acceptance gates.
- Produces: public `--playbook off|execute`, `npm run playbook:execute`, checked-in P5 gate, dependency auditor, phase report, and truthful project status.

- [ ] **Step 1: Write CLI RED tests**

Spawn the real CLI. Omitted/off retain existing behavior. Execute prints selected
candidate, chain hash, eligibility, repair usage, and report path. Missing value,
duplicate option, `shadow`, mixed case, wrong candidate/round values, forced
rounds, and incompatible Stage 7 options fail before output. Stdout/stderr never
expose provider bodies, environment values, input bytes, or external paths.
No-eligible exits nonzero, retains run evidence, and installs nothing.

- [ ] **Step 2: Write dependency-gate RED tests**

Parse ESM edges through Acorn/import-meta-resolve. P5 may reach production
construction, pipeline support, P4 deterministic review, and existing preview/
structured heuristic ranking required by compilation. P4 must still not reach
pipeline, construction, world, or datapack I/O. P5 must not reach any
`src/playbook/p6/`, image-model, screenshot/camera, fixed-view, blind-selection,
human-preference, or new visual-scoring module.

Computed import, `createRequire`, unresolved edge, symlink/realpath escape, and
dynamic forbidden import fail closed. Existing HTML preview and structured
heuristic ranker are explicitly allowed but cannot become eligibility authority.

- [ ] **Step 3: Write the acceptance-gate RED test**

Run three original mock fixtures:

1. positive: three eligible candidates, no repair;
2. repairable: a massing repair, exact downstream replay, eligible result;
3. no-eligible: all three invalid/unresolved after one attempt, no install.

Assert three trees × five layers, hard QA on ranked rows, no unresolved decidable
violation on ranked rows, upstream replay invariants, rollback proof, zero replay
provider calls, byte-identical rerun, checkpoint-to-artifact replay equality,
and no quality/P6 claim.

- [ ] **Step 4: Run RED**

```bash
node --test --test-isolation=none test/playbookExecuteCli.test.js test/playbookExecuteGate.test.js
```

Expected: CLI option/script/dependency gate/report are missing.

- [ ] **Step 5: Implement CLI and package entry point**

Add `playbook: 'off'` to CLI defaults, parse `--playbook` exactly once, validate
P5 combinations before `runPipeline()`, forward it, and add help/status text
that execute is opt-in and P6 remains closed.

Track `candidatesExplicit` and `candidateRoundsExplicit` booleans during parse.
After all arguments are read, execute mode assigns 3/1 only when the respective
flag is false; explicit values are passed unchanged to the exact validator. Off
mode continues to expose 1/1 defaults.

Add exactly:

```json
"playbook:execute": "node src/index.js --playbook execute --candidates 3 --candidate-rounds 1"
```

Do not change existing scripts or start defaults.

- [ ] **Step 6: Implement dependency auditor and acceptance gate**

Reuse the existing P4 gate's supported edge shapes and fail-closed policy with
separate exact P5 allow/deny sets. The acceptance gate uses temporary output/
world roots and snapshots every pre-existing byte before/after.

- [ ] **Step 7: Run focused P5 GREEN**

```bash
node --test --test-isolation=none \
  test/playbookExecuteContracts.test.js \
  test/playbookExecuteOffCompatibility.test.js \
  test/playbookExecuteDesignEnvelope.test.js \
  test/constructionDesignStages.test.js \
  test/playbookExecuteCheckpoints.test.js \
  test/playbookExecuteStorage.test.js \
  test/playbookExecuteEligibility.test.js \
  test/playbookExecuteRepairRegistry.test.js \
  test/playbookExecuteRepairCompilers.test.js \
  test/playbookExecuteRepairTransaction.test.js \
  test/playbookExecuteReplay.test.js \
  test/playbookExecuteOrchestrator.test.js \
  test/playbookExecuteCli.test.js \
  test/playbookExecuteGate.test.js
```

Expected: all P5 tests pass; record exact counts for documentation.

- [ ] **Step 8: Run exact P4 and P3 compatibility gates**

```bash
node --test --test-isolation=none \
  test/playbookShadowContracts.test.js \
  test/playbookShadowCorpusProjection.test.js \
  test/playbookShadowCheckerRegistry.test.js \
  test/playbookShadowCheckers.test.js \
  test/playbookShadowEvaluation.test.js \
  test/playbookShadowExplanation.test.js \
  test/playbookShadowStorage.test.js \
  test/playbookShadowRun.test.js \
  test/architecturePlaybookShadowCli.test.js \
  test/playbookShadowGate.test.js \
  test/docsProjectStatus.test.js
npm run playbook:manual -- check
```

Expected: P4 passes; P3 reports 21 reviewed rules, 15 core procedures, 6 case
patterns, 5 artifacts, and zero managed drift.

- [ ] **Step 9: Run full regression and hygiene**

```bash
npm test -- --test-reporter=dot
git diff --check
git ls-files out .local/architecture-playbook
git status --short --branch
```

Expected: full suite exits 0, diff/output queries are empty, and only intended
changes remain before commit.

- [ ] **Step 10: Write truthful documentation from fresh evidence**

The report records final range, exact P5/P4/full counts, fixture/replay hashes,
rollback evidence, four executable operations, eleven evidence-required core
rules, neutral case patterns, off compatibility, dependency/P3 results, and
hygiene. Public READMEs state opt-in/default-off, no playbook score, no aesthetic
proof, ignored real outputs, and P6 still closed.

- [ ] **Step 11: Re-run docs and gates after inserting actual counts**

```bash
node --test --test-isolation=none test/docsProjectStatus.test.js test/playbookExecuteGate.test.js test/playbookShadowGate.test.js
git diff --check
```

Expected: public counts/ranges match the final working tree.

- [ ] **Step 12: Commit Task 10**

```bash
git add src/playbook/execute/executeDependencyBoundary.js src/index.js package.json test/playbookExecuteCli.test.js test/playbookExecuteGate.test.js test/fixtures/playbook-execute/medieval-positive.json docs/architecture-playbook/reports/p5-executable-design-layer.md docs/architecture-playbook/README.md README.md test/docsProjectStatus.test.js
git commit -m "feat(playbook): complete P5 executable design layer"
```

---

## Spec coverage matrix

| Spec sections | Implemented and proved by |
| --- | --- |
| 1–3 purpose, decisions, scope | Tasks 1, 2, 6, 7, 9, 10 |
| 4 production seam | Task 3 plus Task 1 off vectors |
| 5 invocation/options | Tasks 1, 9, 10 |
| 6 orchestration/data flow | Task 9 |
| 7 layer ownership/invalidation | Tasks 1, 3, 8 |
| 8 frozen design/context | Tasks 2 and 3 |
| 9 checkpoint/chain contract | Task 4 |
| 10 P4 authority | Tasks 6 and 7 |
| 11 typed repairs/conflicts | Task 7 |
| 12 replay | Task 8 |
| 13 selection | Task 9 |
| 14 storage | Task 5 |
| 15 failure/rollback | Tasks 1, 5, 8, 9 |
| 16 off compatibility | Tasks 1, 3, 9, 10 |
| 17 test strategy | Focused tests in Tasks 1–10 |
| 18 acceptance gate | Task 10 |
| 19 public claims | Task 10 |
| 20 implementation sequencing | Task order and review checkpoints below |

## Review checkpoints

- After Task 1: schemas, errors, and frozen `ece476d` compatibility vectors are immutable authority.
- After Task 2: provider output selects only reviewed IDs and published variants; no model-authored patch exists.
- After Task 3: production replay seams exist and all off hashes remain unchanged.
- After Task 4: checkpoint/chain hashes and score-free eligibility records are independently validated.
- After Task 5: P5 evidence/current pointers survive mutation and failure injection without weakening P4.
- After Task 6: P5 consumes deterministic P4 review only; explanation prose and case patterns have no authority.
- After Task 7: four reviewed repairs compile only into typed, conflict-free semantic effects.
- After Task 8: replay changes target/downstream only, makes no provider call, and rolls back atomically.
- After Task 9: three candidates are eligibility-filtered before the unchanged ranker; install follows revalidation.
- After Task 10: CLI, dependency, acceptance, docs, P4/P3, full regression, and hygiene evidence are fresh.

## Final whole-branch review

After all ten task reviews are clean:

1. Generate a review package from `eef2a4472dec3f1e4da8cbad284d2059e9df8248` to final P5 `HEAD`.
2. Assign a fresh strongest-model reviewer to the full spec, plan, task reports, rulings, and whole-branch diff.
3. Triage every Critical/Important/Minor finding against the binding spec; do not silently defer load-bearing findings.
4. If findings exist, use one unified implementer fix wave with focused RED/GREEN, then one fresh scoped re-review.
5. At the reviewed head, rerun exact P5/P4 suites, standalone dependency gates, P3 zero-drift, full regression, diff/output hygiene, and clean status.
6. Do not merge, push, create a PR, install a real datapack, or remove worktrees without explicit user authorization.

## Execution handoff

Use one fresh implementer per task and a fresh spec/quality reviewer before the
next task. The controller maintains the decision ledger, resolves cross-task
ambiguity before dispatch, and never edits implementation code to fix reviewer
findings.
