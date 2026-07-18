# Stage 7 R1 Conditional Admission Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents: the owner explicitly requires sequential work.

**Goal:** Build a deterministic, metadata-only R1 contract that validates controlled building taxonomy assessments, derives pre-acquisition admission states, records assessment revisions append-only, and audits future 100/500/2,000-case balance and locked-split policies without downloading or training on any building.

**Architecture:** Add four focused pure/local modules beside the existing source-expansion modules: taxonomy contracts, admission-state reduction, an atomic append-only assessment ledger, and future snapshot/split policy validation. Add a small metadata-only CLI that consumes the existing candidate, rights, and review ledgers plus the new taxonomy ledger and emits a non-authorizing report. Reuse the current exact `.local/stage7-source-expansion/` boundary and formal Dataset pre/postflight; introduce no payload reader, NBT parser, trainer, HTTP client, or formal Dataset writer.

**Tech Stack:** Node.js 24.18.0 ESM; built-in `node:assert`, `node:fs/promises`, `node:path`, `node:test`, `node:url`, and `node:util`; existing source-expansion contracts, rights evaluator, review decisions, ignored-root boundary, canonical report helpers, and formal Dataset boundary; no new dependency and no Python import.

## Global Constraints

- Execute sequentially. Do not use subagents, parallel commands, concurrent acquisition, or concurrent training.
- R1 is metadata-only. It must not download a building or preview, open an archive, parse NBT or schematic bytes, prepare voxels, create a candidate Dataset snapshot, instantiate Torch, or start training.
- Do not mutate the current `.local/stage7-source-expansion/` operational records while implementing or testing. Tests use synthetic roots below the operating-system temporary directory.
- Operational writes are limited to a caller-approved taxonomy assessment revision below `.local/stage7-source-expansion/reviews/` and fresh metadata-only reports below `.local/stage7-source-expansion/reports/`.
- Every operational result declares `metadata_only: true`, `authorizes_download: false`, `authorizes_training: false`, and `authorizes_dataset_admission: false`.
- Keep the existing 22 private cases, 15/7 split, three run directories, and 42 deferred oversized private buildings untouched. Never read private filenames, hashes, metrics, tensors, checkpoints, reconstructions, or outputs in R1.
- Preserve exact formal Dataset manifest SHA-256 values `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`, `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`, and `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`.
- Dataset v3 remains exactly `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Do not change normal Node generation, the Stage 7 primary provider, private trainer, M3 provider, or M4 Apply Mode.
- Preserve the current source-expansion discovery, yield, and finalize schemas and behavior. R1 adds separate version-one conditional-admission schemas rather than changing the existing source-expansion schema version.
- Rights conclusions remain human-reviewed evidence. R1 reuses `evaluateRightsLedger`; it must not infer a permission or provide legal advice.
- Human visual acceptance does not authorize acquisition. `admission_contract_ready` means only that metadata, rights, review, completeness, and taxonomy fields are ready for a later named acquisition proposal.
- Only `complete` structures with `high` or `medium` label confidence may receive an accepted taxonomy assessment. Modules, fragments, low-confidence labels, and unknown required type/style labels must be deferred—not rejected—with the matching controlled reason code.
- R1 taxonomy assessments contain only pre-acquisition human metadata. `deriveScaleBin` and policy-case `scale_bin` are contracts for later validated non-air bounds; public dimensions are not silently promoted to verified bounds. The deterministic nine-token `material_profile` remains a later preparation output and must not be guessed or added by R1.
- Do not implement R2 quarantine, acquisition, parser, material mapping, fingerprinting, voxel preparation, or the five-real-candidate pilot in this plan.

---

## File map

- Create `src/construction/learning/stage7ConditionalTaxonomy.js`: controlled vocabularies, building-type parent registry, strict assessment validation, scale derivation, and rare-leaf support floors.
- Create `src/construction/learning/stage7ConditionalAdmission.js`: latest unique review/assessment reduction, pre-acquisition state machine, metadata-only summary, and Markdown rendering.
- Create `src/construction/learning/stage7ConditionalAdmissionStore.js`: canonical append-only taxonomy ledger with contiguous revisions and atomic replace.
- Create `src/construction/learning/stage7ConditionalSnapshotPolicy.js`: synthetic/future case balance gates and immutable group-aware split validation for 100/500/2,000 tiers.
- Create `src/auditStage7ConditionalAdmission.js`: `record` and `audit` commands with exact root, mandatory metadata-only acknowledgement, formal Dataset checks, and fresh reports.
- Create `test/fixtures/stage7ConditionalAdmissionFixtures.js`: synthetic taxonomy, policy-case, and split-assignment factories.
- Create `test/stage7ConditionalTaxonomy.test.js`: taxonomy and cross-field contract tests.
- Create `test/stage7ConditionalAdmission.test.js`: rights/review/taxonomy state-reduction and report tests.
- Create `test/stage7ConditionalAdmissionStore.test.js`: append-only revision, canonical ledger, atomic failure, and symlink tests.
- Create `test/stage7ConditionalSnapshotPolicy.test.js`: 100/500/2,000 quota, group, holdout, and prior-assignment tests.
- Create `test/stage7ConditionalAdmissionCli.test.js`: CLI parsing, boundary, formal Dataset pre/postflight, exact report, and non-authorization tests.
- Modify `package.json:24-27`: add only `audit:stage7:conditional-admission`.
- Modify `README.md:148-174`: document R1 record/audit commands, required inputs, and non-authorization boundary.

---

## Mandatory execution opening gate

Run this gate before Task 1 and before creating or modifying any implementation file. Every command is read-only. If any unexpected tracked/untracked path, branch, ignored-root state, aggregate count, hash, preflight result, or false/zero gate differs, stop and report the drift to the owner; do not "repair" it as part of R1.

- [ ] **Confirm the exact Git and ignored-root state**

Run sequentially:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --format=%s
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
git ls-files .local/stage7-source-expansion
git check-ignore -q .local/stage7-source-expansion
```

Expected: clean status; branch `codex/stage7-dataset-v3-extraction`; the HEAD is the locally announced R1 plan commit with subject `docs(stage7): plan conditional admission contract`; both `git ls-files` outputs are empty; both ignore checks exit zero.

- [ ] **Confirm private aggregate and formal Dataset invariants without private records**

Run the continuation-protocol aggregate check exactly:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path'); const repo=process.cwd(); const root=path.join(repo,'.local/stage7-private-research'); const lines=(f)=>fs.readFileSync(f,'utf8').trim().split(/\\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((n)=>n.endsWith('.voxels.bin')); const hashes=['v1','v2','v3'].map((v)=>[v,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels',v,'manifest.json'))).digest('hex')]); const v3=JSON.parse(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'),'utf8')); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((n)=>n.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((n)=>n.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((n)=>fs.statSync(path.join(root,'prepared',n)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_artifacts:fs.readdirSync(path.join(root,'runs')).length,dataset_hashes:hashes,dataset_v3_gate:{ready_for_m3_real_data:v3.ready_for_m3_real_data,training_eligible_count:v3.training_eligible_count}}));"
```

Expected aggregate values: 22 sources, 42 deferred oversized, 22 source records, 22 prepared records, 22 prepared binaries, all `64^3`, 15 train, 7 validation, and 3 existing run directories. Expected formal hashes are the three values in Global Constraints and Dataset v3 remains false/zero. The three run directories are existing owner-approved local runs; R1 neither reads their contents nor creates another.

- [ ] **Run complete private preflight without exposing records**

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print({'preflight':'ok','case_count':p.case_count,'dataset_v3_gate':p.dataset_v3_gate})"
```

Expected: `preflight` is `ok`, aggregate case count is 22, and the Dataset v3 gate is false/zero. This is verification only and must not start or resume training.

---

### Task 1: Define the controlled conditional taxonomy contract

**Files:**
- Create: `src/construction/learning/stage7ConditionalTaxonomy.js`
- Create: `test/fixtures/stage7ConditionalAdmissionFixtures.js`
- Create: `test/stage7ConditionalTaxonomy.test.js`

**Interfaces:**
- Consumes: candidate IDs accepted by `CANDIDATE_ID_PATTERN` and local group IDs accepted by `LOCAL_ID_PATTERN` from `stage7SourceExpansionContracts.js`.
- Produces: `ConditionalAdmissionContractError`, `CONDITIONAL_ADMISSION_SCHEMA_VERSION`, frozen vocabularies, `validateTaxonomyAssessment(record)`, `deriveScaleBin(dimensions)`, `conditionSupportFloor(snapshotTier)`, and `resolveSupportedBuildingCondition({ buildingType, trainingSupport, snapshotTier })`.
- Later tasks rely on the exact validated assessment fields and error codes defined here.

- [ ] **Step 1: Write the synthetic fixture and failing taxonomy tests**

Create `test/fixtures/stage7ConditionalAdmissionFixtures.js`:

```js
export function taxonomyAssessmentFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    revision: 1,
    assessed_at: '2026-07-18',
    assessed_by: 'owner',
    assessment_decision: 'accept',
    reason_codes: [],
    primary_function: 'defensive_military',
    secondary_functions: ['residential'],
    building_type: 'castle',
    building_type_parent: 'fortification',
    style_family: 'medieval',
    style_tags: ['fantasy'],
    environment: 'overworld',
    biome_theme: 'none',
    completeness: 'complete',
    label_confidence: 'high',
    source_group: 'source-a',
    asset_family: 'castle-family-01',
    ...overrides
  };
}

export function policyCaseFixture(overrides = {}) {
  return {
    candidate_id: 'source-a:castle-01',
    primary_function: 'defensive_military',
    style_family: 'medieval',
    scale_bin: 'standard',
    source_group: 'source-a',
    asset_family: 'castle-family-01',
    author_entity: 'author-a',
    near_duplicate_cluster: null,
    exact_duplicate_of: null,
    human_reviewed: true,
    second_reviewed: false,
    batch_id: 'batch-001',
    ...overrides
  };
}

export function splitAssignmentFixture(overrides = {}) {
  return {
    candidate_id: 'source-a:castle-01',
    split: 'train',
    ...overrides
  };
}
```

Create `test/stage7ConditionalTaxonomy.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILDING_TYPE_PARENTS,
  COMPLETENESS_VALUES,
  CONDITIONAL_ADMISSION_SCHEMA_VERSION,
  ConditionalAdmissionContractError,
  PRIMARY_FUNCTIONS,
  deriveScaleBin,
  conditionSupportFloor,
  resolveSupportedBuildingCondition,
  validateTaxonomyAssessment
} from '../src/construction/learning/stage7ConditionalTaxonomy.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

function hasCode(code) {
  return (error) => error instanceof ConditionalAdmissionContractError
    && error.code === code;
}

test('accepted complete assessment validates, normalizes arrays, and deeply freezes', () => {
  const input = taxonomyAssessmentFixture({
    secondary_functions: ['residential'],
    style_tags: ['rustic', 'fantasy']
  });
  const result = validateTaxonomyAssessment(input);
  assert.equal(CONDITIONAL_ADMISSION_SCHEMA_VERSION, 1);
  assert.equal(result.building_type_parent, BUILDING_TYPE_PARENTS.castle);
  assert.deepEqual(result.style_tags, ['fantasy', 'rustic']);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.style_tags), true);
  input.style_tags.push('gothic');
  assert.deepEqual(result.style_tags, ['fantasy', 'rustic']);
});

test('controlled vocabularies contain the approved primary functions and completeness values', () => {
  assert.deepEqual(PRIMARY_FUNCTIONS, [
    'residential', 'religious_public', 'defensive_military',
    'production_agriculture', 'transport_infrastructure',
    'exploration_challenge', 'monument_ruin', 'fantastical_special'
  ]);
  assert.deepEqual(COMPLETENESS_VALUES, ['complete', 'module', 'fragment']);
});

test('accepted assessments refuse incomplete and low-confidence records', () => {
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({ completeness: 'module' })),
    hasCode('ASSESSMENT_ACCEPT_INVALID')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({ label_confidence: 'low' })),
    hasCode('ASSESSMENT_ACCEPT_INVALID')
  );
});

test('deferred and rejected assessments require reason codes', () => {
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', reason_codes: []
    })),
    hasCode('ASSESSMENT_REASON_REQUIRED')
  );
  const deferred = validateTaxonomyAssessment(taxonomyAssessmentFixture({
    assessment_decision: 'defer', completeness: 'module',
    reason_codes: ['INCOMPLETE_MODULE']
  }));
  assert.equal(deferred.assessment_decision, 'defer');
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', completeness: 'module',
      reason_codes: ['QUALITY_REJECTED']
    })),
    hasCode('ASSESSMENT_REASON_MISMATCH')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'reject', completeness: 'module',
      reason_codes: ['INCOMPLETE_MODULE']
    })),
    hasCode('ASSESSMENT_DEFER_REQUIRED')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', reason_codes: ['FREE_TEXT_REASON']
    })),
    hasCode('ASSESSMENT_VALUE_INVALID')
  );
});

test('assessment rejects unknown keys, duplicate tags, primary-as-secondary, and wrong type parent', () => {
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({ unexpected: true })),
    hasCode('ASSESSMENT_KEYS_INVALID')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      secondary_functions: ['residential', 'residential']
    })),
    hasCode('ASSESSMENT_ARRAY_DUPLICATE')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      secondary_functions: ['defensive_military']
    })),
    hasCode('ASSESSMENT_FUNCTION_DUPLICATE')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      building_type_parent: 'dwelling'
    })),
    hasCode('BUILDING_TYPE_PARENT_MISMATCH')
  );
});

test('scale bins and rare-condition floors are exact', () => {
  assert.equal(deriveScaleBin({ x: 24, y: 10, z: 20 }), 'compact');
  assert.equal(deriveScaleBin({ x: 25, y: 10, z: 20 }), 'standard');
  assert.equal(deriveScaleBin({ x: 41, y: 10, z: 20 }), 'large');
  assert.throws(() => deriveScaleBin({ x: 65, y: 1, z: 1 }), hasCode('DIMENSIONS_INVALID'));
  assert.equal(conditionSupportFloor(100), 5);
  assert.equal(conditionSupportFloor(500), 10);
  assert.equal(conditionSupportFloor(2000), 20);
  assert.throws(() => conditionSupportFloor(101), hasCode('SNAPSHOT_TIER_INVALID'));
  assert.deepEqual(resolveSupportedBuildingCondition({
    buildingType: 'castle', trainingSupport: 4, snapshotTier: 100
  }), {
    building_type: 'castle', parent_condition: 'fortification',
    active_condition: 'fortification', fell_back_to_parent: true,
    support_floor: 5, training_support: 4
  });
  assert.deepEqual(resolveSupportedBuildingCondition({
    buildingType: 'castle', trainingSupport: 5, snapshotTier: 100
  }), {
    building_type: 'castle', parent_condition: 'fortification',
    active_condition: 'castle', fell_back_to_parent: false,
    support_floor: 5, training_support: 5
  });
});
```

- [ ] **Step 2: Run the taxonomy test and verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalTaxonomy.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7ConditionalTaxonomy.js`.

- [ ] **Step 3: Implement the strict taxonomy module**

Create `src/construction/learning/stage7ConditionalTaxonomy.js`:

```js
import {
  CANDIDATE_ID_PATTERN,
  LOCAL_ID_PATTERN,
  validateIsoDate
} from './stage7SourceExpansionContracts.js';

export const CONDITIONAL_ADMISSION_SCHEMA_VERSION = 1;
export const PRIMARY_FUNCTIONS = Object.freeze([
  'residential',
  'religious_public',
  'defensive_military',
  'production_agriculture',
  'transport_infrastructure',
  'exploration_challenge',
  'monument_ruin',
  'fantastical_special'
]);
export const ASSESSMENT_DECISIONS = Object.freeze(['accept', 'defer', 'reject']);
export const ASSESSMENT_REASON_CODES = Object.freeze([
  'COLLECTION_UNSEPARATED',
  'COMPLETENESS_UNCLEAR',
  'INCOMPLETE_FRAGMENT',
  'INCOMPLETE_MODULE',
  'LABEL_LOW_CONFIDENCE',
  'MULTIPART_ASSEMBLY_REQUIRED',
  'OUT_OF_SCOPE',
  'QUALITY_REJECTED',
  'STYLE_UNKNOWN',
  'TYPE_UNKNOWN'
]);
export const COMPLETENESS_VALUES = Object.freeze(['complete', 'module', 'fragment']);
export const LABEL_CONFIDENCE_VALUES = Object.freeze(['high', 'medium', 'low']);
export const STYLE_FAMILIES = Object.freeze([
  'vanilla_traditional', 'medieval', 'classical_ancient', 'rustic',
  'gothic_dark', 'fantasy', 'industrial_steampunk',
  'prehistoric_earthwork', 'regional_biome', 'modern', 'unknown'
]);
export const STYLE_TAGS = Object.freeze([
  'ancient', 'aquatic', 'cherry', 'classical', 'dark', 'desert',
  'earthwork', 'fantasy', 'gothic', 'ice', 'industrial', 'jungle',
  'medieval', 'nether', 'prehistoric', 'red_sandstone', 'rustic',
  'steampunk', 'vanilla'
]);
export const ENVIRONMENTS = Object.freeze([
  'overworld', 'nether', 'end', 'aquatic', 'underground', 'aerial', 'unknown'
]);
export const BIOME_THEMES = Object.freeze([
  'none', 'plains', 'forest', 'taiga', 'jungle', 'desert', 'badlands',
  'savanna', 'swamp', 'cherry', 'snow_ice', 'mushroom', 'ocean',
  'nether_crimson', 'nether_warped', 'nether_soul_sand', 'end', 'unknown'
]);
export const BUILDING_TYPE_PARENTS = Object.freeze({
  house: 'dwelling',
  cottage: 'dwelling',
  manor: 'dwelling',
  village_building: 'dwelling',
  temple: 'worship',
  shrine: 'worship',
  altar: 'worship',
  public_hall: 'civic',
  castle: 'fortification',
  fortress: 'fortification',
  fort: 'fortification',
  citadel: 'fortification',
  lookout: 'fortification',
  tower: 'tower',
  workshop: 'production',
  windmill: 'production',
  farm: 'production',
  industrial_facility: 'production',
  ship: 'transport',
  airship: 'transport',
  bridge: 'infrastructure',
  station: 'infrastructure',
  dungeon: 'challenge',
  catacomb: 'challenge',
  tomb: 'challenge',
  burial_mound: 'challenge',
  maze: 'challenge',
  monument: 'monument',
  memorial: 'monument',
  ruin: 'ruin',
  megalith: 'monument',
  portal: 'special',
  laboratory: 'special',
  other_complete: 'special',
  unknown: 'unknown'
});

const ASSESSMENT_KEYS = Object.freeze([
  'schema_version', 'candidate_id', 'revision', 'assessed_at', 'assessed_by',
  'assessment_decision', 'reason_codes', 'primary_function',
  'secondary_functions', 'building_type', 'building_type_parent',
  'style_family', 'style_tags', 'environment', 'biome_theme',
  'completeness', 'label_confidence', 'source_group', 'asset_family'
]);

export class ConditionalAdmissionContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'ConditionalAdmissionContractError';
    this.code = code;
  }
}

export function validateTaxonomyAssessment(record) {
  rejectUnknownKeys(record, ASSESSMENT_KEYS, 'ASSESSMENT_KEYS_INVALID');
  if (record.schema_version !== CONDITIONAL_ADMISSION_SCHEMA_VERSION) {
    throw new ConditionalAdmissionContractError('SCHEMA_VERSION_INVALID', 'schema_version');
  }
  const candidateId = requirePattern(record.candidate_id, CANDIDATE_ID_PATTERN, 'candidate_id');
  const decision = requireMember(record.assessment_decision, ASSESSMENT_DECISIONS, 'assessment_decision');
  const primary = requireMember(record.primary_function, PRIMARY_FUNCTIONS, 'primary_function');
  const secondary = uniqueSortedMembers(
    record.secondary_functions, PRIMARY_FUNCTIONS, 'secondary_functions'
  );
  if (secondary.includes(primary)) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_FUNCTION_DUPLICATE', primary
    );
  }
  const buildingType = requireMember(
    record.building_type, Object.keys(BUILDING_TYPE_PARENTS), 'building_type'
  );
  const expectedParent = BUILDING_TYPE_PARENTS[buildingType];
  if (record.building_type_parent !== expectedParent) {
    throw new ConditionalAdmissionContractError(
      'BUILDING_TYPE_PARENT_MISMATCH', buildingType
    );
  }
  const styleFamily = requireMember(record.style_family, STYLE_FAMILIES, 'style_family');
  const completeness = requireMember(
    record.completeness, COMPLETENESS_VALUES, 'completeness'
  );
  const confidence = requireMember(
    record.label_confidence, LABEL_CONFIDENCE_VALUES, 'label_confidence'
  );
  const reasons = uniqueSortedMembers(
    record.reason_codes, ASSESSMENT_REASON_CODES, 'reason_codes'
  );
  if (decision === 'accept' && (
    completeness !== 'complete'
      || confidence === 'low'
      || buildingType === 'unknown'
      || styleFamily === 'unknown'
  )) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_ACCEPT_INVALID', candidateId
    );
  }
  if (decision === 'accept' && reasons.length !== 0) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REASON_UNEXPECTED', candidateId
    );
  }
  if (decision !== 'accept' && reasons.length === 0) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REASON_REQUIRED', candidateId
    );
  }
  if (decision === 'reject' && (
    completeness !== 'complete'
      || confidence === 'low'
      || buildingType === 'unknown'
      || styleFamily === 'unknown'
  )) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_DEFER_REQUIRED', candidateId
    );
  }
  const requiredReasons = [
    completeness === 'module' ? 'INCOMPLETE_MODULE' : null,
    completeness === 'fragment' ? 'INCOMPLETE_FRAGMENT' : null,
    confidence === 'low' ? 'LABEL_LOW_CONFIDENCE' : null,
    buildingType === 'unknown' ? 'TYPE_UNKNOWN' : null,
    styleFamily === 'unknown' ? 'STYLE_UNKNOWN' : null
  ].filter(Boolean);
  if (decision === 'defer' && requiredReasons.some((code) => !reasons.includes(code))) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REASON_MISMATCH', candidateId
    );
  }
  return deepFreeze({
    schema_version: CONDITIONAL_ADMISSION_SCHEMA_VERSION,
    candidate_id: candidateId,
    revision: requirePositiveInteger(record.revision, 'revision'),
    assessed_at: validateIsoDate(record.assessed_at, 'assessed_at'),
    assessed_by: requireString(record.assessed_by, 'assessed_by'),
    assessment_decision: decision,
    reason_codes: reasons,
    primary_function: primary,
    secondary_functions: secondary,
    building_type: buildingType,
    building_type_parent: expectedParent,
    style_family: styleFamily,
    style_tags: uniqueSortedMembers(record.style_tags, STYLE_TAGS, 'style_tags'),
    environment: requireMember(record.environment, ENVIRONMENTS, 'environment'),
    biome_theme: requireMember(record.biome_theme, BIOME_THEMES, 'biome_theme'),
    completeness,
    label_confidence: confidence,
    source_group: requirePattern(record.source_group, LOCAL_ID_PATTERN, 'source_group'),
    asset_family: requirePattern(record.asset_family, LOCAL_ID_PATTERN, 'asset_family')
  });
}

export function deriveScaleBin(dimensions) {
  rejectUnknownKeys(dimensions, ['x', 'y', 'z'], 'DIMENSIONS_INVALID');
  const values = ['x', 'y', 'z'].map((axis) =>
    requirePositiveInteger(dimensions[axis], `dimensions.${axis}`)
  );
  const largest = Math.max(...values);
  if (largest > 64) {
    throw new ConditionalAdmissionContractError('DIMENSIONS_INVALID', 'oversized');
  }
  if (largest <= 24) return 'compact';
  if (largest <= 40) return 'standard';
  return 'large';
}

export function conditionSupportFloor(snapshotTier) {
  const floors = new Map([[100, 5], [500, 10], [2000, 20]]);
  if (!floors.has(snapshotTier)) {
    throw new ConditionalAdmissionContractError(
      'SNAPSHOT_TIER_INVALID', String(snapshotTier)
    );
  }
  return floors.get(snapshotTier);
}

export function resolveSupportedBuildingCondition({
  buildingType,
  trainingSupport,
  snapshotTier
}) {
  const type = requireMember(
    buildingType, Object.keys(BUILDING_TYPE_PARENTS), 'building_type'
  );
  if (!Number.isSafeInteger(trainingSupport) || trainingSupport < 0) {
    throw new ConditionalAdmissionContractError(
      'TRAINING_SUPPORT_INVALID', String(trainingSupport)
    );
  }
  const supportFloor = conditionSupportFloor(snapshotTier);
  const parent = BUILDING_TYPE_PARENTS[type];
  const fellBack = trainingSupport < supportFloor;
  return deepFreeze({
    building_type: type,
    parent_condition: parent,
    active_condition: fellBack ? parent : type,
    fell_back_to_parent: fellBack,
    support_floor: supportFloor,
    training_support: trainingSupport
  });
}

function uniqueSortedMembers(value, allowed, label) {
  if (!Array.isArray(value)) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_ARRAY_INVALID', label);
  }
  const output = value.map((entry) => requireMember(entry, allowed, label));
  if (new Set(output).size !== output.length) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_ARRAY_DUPLICATE', label);
  }
  return output.sort();
}

function requireMember(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_VALUE_INVALID', label);
  }
  return value;
}

function requirePattern(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_ID_INVALID', label);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_INTEGER_INVALID', label);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_STRING_INVALID', label);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionalAdmissionContractError(code, 'object required');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0) throw new ConditionalAdmissionContractError(code, unknown.join(','));
  if (missing.length > 0) {
    throw new ConditionalAdmissionContractError(code, `missing:${missing.join(',')}`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
```

- [ ] **Step 4: Run the taxonomy test and verify GREEN**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalTaxonomy.test.js
```

Expected: all tests in `stage7ConditionalTaxonomy.test.js` pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/construction/learning/stage7ConditionalTaxonomy.js test/fixtures/stage7ConditionalAdmissionFixtures.js test/stage7ConditionalTaxonomy.test.js
git commit -m "feat(stage7): define conditional admission taxonomy"
```

---

### Task 2: Reduce rights, human review, and taxonomy to non-authorizing admission states

**Files:**
- Create: `src/construction/learning/stage7ConditionalAdmission.js`
- Create: `test/stage7ConditionalAdmission.test.js`

**Interfaces:**
- Consumes: validated candidate records, outputs from `evaluateRightsLedger`, validated existing review decisions, and validated taxonomy assessments.
- Produces: `latestUniqueAssessment(records, candidateId)`, `evaluateConditionalAdmission(...)`, `buildConditionalAdmissionSummary(results)`, and `renderConditionalAdmissionMarkdown(summary)`.
- State `admission_contract_ready` explicitly does not mean acquired, parsed, training-eligible, or Dataset-eligible.

- [ ] **Step 1: Write failing state-machine tests**

Create `test/stage7ConditionalAdmission.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDiscoveryRecord, validateReviewDecision } from '../src/construction/learning/stage7SourceExpansionContracts.js';
import { evaluateRightsLedger } from '../src/construction/learning/stage7SourceExpansionRights.js';
import { validateTaxonomyAssessment } from '../src/construction/learning/stage7ConditionalTaxonomy.js';
import {
  buildConditionalAdmissionSummary,
  evaluateConditionalAdmission,
  latestUniqueAssessment,
  renderConditionalAdmissionMarkdown
} from '../src/construction/learning/stage7ConditionalAdmission.js';
import { candidateFixture, decisionFixture, rightsFixture } from './fixtures/stage7SourceExpansionFixtures.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

const AS_OF = '2026-07-18';

function auditInputs(overrides = {}) {
  const candidates = [validateDiscoveryRecord(candidateFixture())];
  const rightsResults = evaluateRightsLedger({
    candidates,
    rightsRecords: [rightsFixture({ observed_at: AS_OF })],
    asOf: AS_OF
  });
  return {
    candidates,
    rightsResults,
    reviewDecisions: [validateReviewDecision(decisionFixture({ decided_at: AS_OF }))],
    assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture())],
    ...overrides
  };
}

test('fresh rights, owner acceptance, and accepted complete taxonomy reach contract-ready only', () => {
  const [result] = evaluateConditionalAdmission(auditInputs());
  assert.equal(result.state, 'admission_contract_ready');
  assert.equal(result.authorizes_download, false);
  assert.equal(result.authorizes_training, false);
  assert.equal(result.authorizes_dataset_admission, false);
  assert.equal(result.taxonomy_revision, 1);
});

test('state machine fails closed at each missing or negative gate', () => {
  const base = auditInputs();
  assert.equal(evaluateConditionalAdmission({ ...base, rightsResults: [{
    ...base.rightsResults[0], rights_verified: false, state: 'deferred'
  }] })[0].state, 'rights_pending');
  assert.equal(evaluateConditionalAdmission({ ...base, reviewDecisions: [] })[0].state, 'human_review_pending');
  assert.equal(evaluateConditionalAdmission({
    ...base,
    reviewDecisions: [validateReviewDecision(decisionFixture({ decision: 'defer' }))]
  })[0].state, 'human_deferred');
  assert.equal(evaluateConditionalAdmission({ ...base, assessments: [] })[0].state, 'taxonomy_pending');
  assert.equal(evaluateConditionalAdmission({
    ...base,
    assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', completeness: 'module',
      reason_codes: ['INCOMPLETE_MODULE']
    }))]
  })[0].state, 'deferred_incomplete');
});

test('latest assessment is unique and revision-selected', () => {
  const one = validateTaxonomyAssessment(taxonomyAssessmentFixture({ revision: 1 }));
  const two = validateTaxonomyAssessment(taxonomyAssessmentFixture({ revision: 2 }));
  assert.equal(latestUniqueAssessment([one, two], one.candidate_id), two);
  assert.throws(
    () => latestUniqueAssessment([two, two], one.candidate_id),
    (error) => error.code === 'ASSESSMENT_REVISION_AMBIGUOUS'
  );
});

test('orphan rights, reviews, or assessments fail instead of disappearing', () => {
  const base = auditInputs();
  assert.throws(
    () => evaluateConditionalAdmission({
      ...base,
      assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture({
        candidate_id: 'source-z:unknown'
      }))]
    }),
    (error) => error.code === 'ASSESSMENT_ORPHAN'
  );
  assert.throws(
    () => evaluateConditionalAdmission({
      ...base,
      assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture({
        source_group: 'source-z'
      }))]
    }),
    (error) => error.code === 'ASSESSMENT_SOURCE_MISMATCH'
  );
});

test('summary is aggregate, metadata-only, deterministic, and explicit about non-authorization', () => {
  const results = evaluateConditionalAdmission(auditInputs());
  const summary = buildConditionalAdmissionSummary(results);
  assert.equal(summary.contract_ready_count, 1);
  assert.equal(summary.metadata_only, true);
  assert.equal(summary.authorizes_download, false);
  assert.equal(summary.authorizes_training, false);
  assert.equal(summary.authorizes_dataset_admission, false);
  const markdown = renderConditionalAdmissionMarkdown(summary);
  assert.match(markdown, /does not authorize download, Dataset admission, or training/iu);
  assert.doesNotMatch(markdown, /\.schematic|checkpoint|loss/iu);
});
```

- [ ] **Step 2: Run the state-machine test and verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalAdmission.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7ConditionalAdmission.js`.

- [ ] **Step 3: Implement admission reduction and reports**

Create `src/construction/learning/stage7ConditionalAdmission.js`:

```js
import { ConditionalAdmissionContractError } from './stage7ConditionalTaxonomy.js';

export function latestUniqueAssessment(records, candidateId) {
  const matches = records.filter((record) => record.candidate_id === candidateId);
  if (matches.length === 0) return null;
  const revision = Math.max(...matches.map((record) => record.revision));
  const latest = matches.filter((record) => record.revision === revision);
  if (latest.length !== 1) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REVISION_AMBIGUOUS', candidateId
    );
  }
  return latest[0];
}

export function evaluateConditionalAdmission({
  candidates,
  rightsResults,
  reviewDecisions,
  assessments
}) {
  const candidateIds = candidates.map((candidate) => candidate.candidate_id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new ConditionalAdmissionContractError('CANDIDATE_DUPLICATE', 'candidate_id');
  }
  const known = new Set(candidateIds);
  rejectOrphan(rightsResults, known, 'RIGHTS_ORPHAN');
  rejectOrphan(reviewDecisions, known, 'REVIEW_ORPHAN');
  rejectOrphan(assessments, known, 'ASSESSMENT_ORPHAN');
  const rightsById = uniqueByCandidate(rightsResults, 'RIGHTS_RESULT_AMBIGUOUS');
  const reviewById = latestUniqueMap(reviewDecisions, 'REVIEW_REVISION_AMBIGUOUS');
  return Object.freeze([...candidates]
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id))
    .map((candidate) => {
      const rights = rightsById.get(candidate.candidate_id) || null;
      const review = reviewById.get(candidate.candidate_id) || null;
      const assessment = latestUniqueAssessment(assessments, candidate.candidate_id);
      if (assessment && assessment.source_group !== candidate.source_id) {
        throw new ConditionalAdmissionContractError(
          'ASSESSMENT_SOURCE_MISMATCH', candidate.candidate_id
        );
      }
      const state = admissionState(rights, review, assessment);
      return deepFreeze({
        candidate_id: candidate.candidate_id,
        source_id: candidate.source_id,
        state,
        rights_verified: rights?.rights_verified === true,
        review_decision: review?.decision ?? 'pending',
        review_revision: review?.revision ?? null,
        taxonomy_revision: assessment?.revision ?? null,
        primary_function: assessment?.primary_function ?? null,
        style_family: assessment?.style_family ?? null,
        completeness: assessment?.completeness ?? null,
        label_confidence: assessment?.label_confidence ?? null,
        blockers: blockersFor(rights, review, assessment, state),
        metadata_only: true,
        authorizes_download: false,
        authorizes_training: false,
        authorizes_dataset_admission: false
      });
    }));
}

export function buildConditionalAdmissionSummary(results) {
  const stateCounts = countBy(results, (item) => item.state);
  const functionCounts = countBy(
    results.filter((item) => item.primary_function !== null),
    (item) => item.primary_function
  );
  const styleCounts = countBy(
    results.filter((item) => item.style_family !== null),
    (item) => item.style_family
  );
  return deepFreeze({
    source: 'stage7-conditional-admission-r1-v1',
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    authorizes_dataset_admission: false,
    candidate_count: results.length,
    contract_ready_count: results.filter(
      (item) => item.state === 'admission_contract_ready'
    ).length,
    state_counts: Object.fromEntries([...stateCounts].sort()),
    function_counts: Object.fromEntries([...functionCounts].sort()),
    style_counts: Object.fromEntries([...styleCounts].sort()),
    states: results
  });
}

export function renderConditionalAdmissionMarkdown(summary) {
  const stateRows = Object.entries(summary.state_counts)
    .map(([state, count]) => `| ${state} | ${count} |`)
    .join('\n') || '| none | 0 |';
  return `# Stage 7 Conditional Admission R1 Audit

- Metadata only: yes
- Candidate records: ${summary.candidate_count}
- Admission-contract ready: ${summary.contract_ready_count}

| State | Count |
| --- | ---: |
${stateRows}

This report does not authorize download, Dataset admission, or training.
`;
}

function admissionState(rights, review, assessment) {
  if (rights?.state === 'rejected' || review?.decision === 'reject'
    || assessment?.assessment_decision === 'reject') return 'rejected';
  if (rights?.state === 'private_research_only') return 'private_research_only';
  if (rights?.rights_verified !== true) return 'rights_pending';
  if (!review) return 'human_review_pending';
  if (review.decision === 'defer') return 'human_deferred';
  if (review.decision !== 'accept') return 'human_review_pending';
  if (!assessment) return 'taxonomy_pending';
  if (assessment.assessment_decision === 'defer') {
    if (assessment.completeness !== 'complete') return 'deferred_incomplete';
    if (assessment.label_confidence === 'low') return 'deferred_label';
    return 'taxonomy_deferred';
  }
  return 'admission_contract_ready';
}

function blockersFor(rights, review, assessment, state) {
  const blockers = [...(rights?.blockers || [])];
  if (!review) blockers.push('HUMAN_REVIEW_MISSING');
  if (review?.decision === 'defer') blockers.push('HUMAN_REVIEW_DEFERRED');
  if (review?.decision === 'reject') blockers.push('HUMAN_REVIEW_REJECTED');
  if (!assessment) blockers.push('TAXONOMY_ASSESSMENT_MISSING');
  if (assessment?.assessment_decision !== 'accept') {
    blockers.push(...(assessment?.reason_codes || []));
  }
  if (state === 'admission_contract_ready') return Object.freeze([]);
  return Object.freeze([...new Set(blockers)].sort());
}

function rejectOrphan(records, known, code) {
  const orphan = records.find((record) => !known.has(record.candidate_id));
  if (orphan) throw new ConditionalAdmissionContractError(code, orphan.candidate_id);
}

function uniqueByCandidate(records, code) {
  const output = new Map();
  for (const record of records) {
    if (output.has(record.candidate_id)) {
      throw new ConditionalAdmissionContractError(code, record.candidate_id);
    }
    output.set(record.candidate_id, record);
  }
  return output;
}

function latestUniqueMap(records, code) {
  const grouped = new Map();
  for (const record of records) {
    const current = grouped.get(record.candidate_id) || [];
    current.push(record);
    grouped.set(record.candidate_id, current);
  }
  const output = new Map();
  for (const [candidateId, candidates] of grouped) {
    const revision = Math.max(...candidates.map((record) => record.revision));
    const latest = candidates.filter((record) => record.revision === revision);
    if (latest.length !== 1) {
      throw new ConditionalAdmissionContractError(code, candidateId);
    }
    output.set(candidateId, latest[0]);
  }
  return output;
}

function countBy(records, key) {
  const counts = new Map();
  for (const record of records) {
    const value = key(record);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
```

- [ ] **Step 4: Run state-machine tests and verify GREEN**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalAdmission.test.js
```

Expected: all tests in `stage7ConditionalAdmission.test.js` pass with zero failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/construction/learning/stage7ConditionalAdmission.js test/stage7ConditionalAdmission.test.js
git commit -m "feat(stage7): derive conditional admission states"
```

---

### Task 3: Add the atomic append-only taxonomy assessment ledger

**Files:**
- Create: `src/construction/learning/stage7ConditionalAdmissionStore.js`
- Create: `test/stage7ConditionalAdmissionStore.test.js`

**Interfaces:**
- Consumes: an already asserted source-expansion root and an untrusted assessment object.
- Produces: `TAXONOMY_LEDGER_RELATIVE`, `readTaxonomyAssessmentLedger(root)`, and `appendTaxonomyAssessment(root, record, services?)`.
- Guarantees: exact relative path, no symlink, canonical JSONL, contiguous per-candidate revisions, temp-file cleanup, and original-ledger preservation on failure.

- [ ] **Step 1: Write failing append-only ledger tests**

Create `test/stage7ConditionalAdmissionStore.test.js`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  TAXONOMY_LEDGER_RELATIVE,
  appendTaxonomyAssessment,
  readTaxonomyAssessmentLedger
} from '../src/construction/learning/stage7ConditionalAdmissionStore.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

async function rootFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-conditional-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'reviews'));
  return root;
}

test('append creates canonical ledger and requires the next candidate revision', async (t) => {
  const root = await rootFixture(t);
  await appendTaxonomyAssessment(root, taxonomyAssessmentFixture({ revision: 1 }));
  await appendTaxonomyAssessment(root, taxonomyAssessmentFixture({
    revision: 2,
    assessment_decision: 'defer',
    completeness: 'module',
    reason_codes: ['INCOMPLETE_MODULE']
  }));
  const records = await readTaxonomyAssessmentLedger(root);
  assert.deepEqual(records.map((record) => record.revision), [1, 2]);
  const text = await readFile(join(root, TAXONOMY_LEDGER_RELATIVE), 'utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.split('\n').filter(Boolean).length, 2);
  await assert.rejects(
    appendTaxonomyAssessment(root, taxonomyAssessmentFixture({ revision: 4 })),
    (error) => error.code === 'ASSESSMENT_REVISION_NOT_NEXT'
  );
});

test('append rejects noncanonical existing content and symlink ledgers', async (t) => {
  const root = await rootFixture(t);
  const ledger = join(root, TAXONOMY_LEDGER_RELATIVE);
  await writeFile(ledger, `${JSON.stringify(taxonomyAssessmentFixture())}\n`, 'utf8');
  await assert.rejects(readTaxonomyAssessmentLedger(root),
    (error) => error.code === 'ASSESSMENT_LEDGER_NONCANONICAL');
  await rm(ledger);
  const outside = join(root, 'outside.jsonl');
  await writeFile(outside, '', 'utf8');
  await symlink(outside, ledger);
  await assert.rejects(readTaxonomyAssessmentLedger(root),
    (error) => error.code === 'ASSESSMENT_LEDGER_SYMLINK');
});

test('injected rename failure preserves the original ledger and removes temp output', async (t) => {
  const root = await rootFixture(t);
  await appendTaxonomyAssessment(root, taxonomyAssessmentFixture());
  const ledger = join(root, TAXONOMY_LEDGER_RELATIVE);
  const before = await readFile(ledger);
  await assert.rejects(
    appendTaxonomyAssessment(root, taxonomyAssessmentFixture({ revision: 2 }), {
      rename: async () => { throw new Error('injected rename failure'); }
    }),
    /injected rename failure/u
  );
  assert.deepEqual(await readFile(ledger), before);
  assert.deepEqual((await readdir(join(root, 'reviews'))).sort(), [
    'conditional-taxonomy.jsonl'
  ]);
});
```

- [ ] **Step 2: Run ledger tests and verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalAdmissionStore.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7ConditionalAdmissionStore.js`.

- [ ] **Step 3: Implement canonical atomic append**

Create `src/construction/learning/stage7ConditionalAdmissionStore.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ConditionalAdmissionContractError,
  validateTaxonomyAssessment
} from './stage7ConditionalTaxonomy.js';

export const TAXONOMY_LEDGER_RELATIVE = 'reviews/conditional-taxonomy.jsonl';

export async function readTaxonomyAssessmentLedger(root) {
  const target = await ledgerPath(root);
  let text;
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) fail('ASSESSMENT_LEDGER_SYMLINK', target);
    if (!stat.isFile()) fail('ASSESSMENT_LEDGER_NOT_REGULAR', target);
    text = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  const records = parseLedger(text);
  if (text !== canonicalLedger(records)) {
    fail('ASSESSMENT_LEDGER_NONCANONICAL', target);
  }
  assertContiguous(records);
  return Object.freeze(records);
}

export async function appendTaxonomyAssessment(root, record, {
  rename = fs.rename,
  writeFile = fs.writeFile,
  remove = fs.rm
} = {}) {
  const validated = validateTaxonomyAssessment(record);
  const target = await ledgerPath(root);
  const existing = await readTaxonomyAssessmentLedger(root);
  const candidateRecords = existing.filter(
    (item) => item.candidate_id === validated.candidate_id
  );
  const expectedRevision = candidateRecords.length + 1;
  if (validated.revision !== expectedRevision) {
    fail('ASSESSMENT_REVISION_NOT_NEXT', validated.candidate_id);
  }
  const output = Object.freeze([...existing, validated]);
  const temporary = path.join(
    path.dirname(target), `.conditional-taxonomy.jsonl.tmp-${process.pid}`
  );
  try {
    await fs.lstat(temporary);
    fail('ASSESSMENT_TEMP_EXISTS', temporary);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(temporary, canonicalLedger(output), { encoding: 'utf8', flag: 'wx' });
    const handle = await fs.open(temporary, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } catch (error) {
    await remove(temporary, { force: true });
    throw error;
  }
  return validated;
}

async function ledgerPath(root) {
  const absoluteRoot = path.resolve(root);
  const reviews = path.join(absoluteRoot, 'reviews');
  const rootStat = await fs.lstat(absoluteRoot);
  const reviewsStat = await fs.lstat(reviews);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || reviewsStat.isSymbolicLink() || !reviewsStat.isDirectory()) {
    fail('ASSESSMENT_ROOT_INVALID', absoluteRoot);
  }
  const target = path.resolve(absoluteRoot, TAXONOMY_LEDGER_RELATIVE);
  if (path.dirname(target) !== reviews) fail('ASSESSMENT_PATH_ESCAPE', target);
  return target;
}

function parseLedger(text) {
  if (typeof text !== 'string') fail('ASSESSMENT_LEDGER_INVALID', 'text');
  return text.split(/\r?\n/u).filter((line) => line.length > 0).map((line, index) => {
    try { return validateTaxonomyAssessment(JSON.parse(line)); }
    catch (error) {
      if (error instanceof ConditionalAdmissionContractError) throw error;
      fail('ASSESSMENT_LEDGER_INVALID', `line ${index + 1}`);
    }
  });
}

function assertContiguous(records) {
  const grouped = new Map();
  for (const record of records) {
    const revisions = grouped.get(record.candidate_id) || [];
    revisions.push(record.revision);
    grouped.set(record.candidate_id, revisions);
  }
  for (const [candidateId, revisions] of grouped) {
    revisions.sort((a, b) => a - b);
    if (revisions.some((revision, index) => revision !== index + 1)) {
      fail('ASSESSMENT_REVISION_GAP', candidateId);
    }
  }
}

function canonicalLedger(records) {
  return records.map((record) => `${JSON.stringify(sortKeys(record))}\n`).join('');
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function fail(code, detail) {
  throw new ConditionalAdmissionContractError(code, detail);
}
```

- [ ] **Step 4: Run ledger tests and verify GREEN**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalAdmissionStore.test.js
```

Expected: all tests in `stage7ConditionalAdmissionStore.test.js` pass with zero failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/construction/learning/stage7ConditionalAdmissionStore.js test/stage7ConditionalAdmissionStore.test.js
git commit -m "feat(stage7): add append-only taxonomy ledger"
```

---

### Task 4: Encode milestone balance and immutable split policy

**Files:**
- Create: `src/construction/learning/stage7ConditionalSnapshotPolicy.js`
- Create: `test/stage7ConditionalSnapshotPolicy.test.js`

**Interfaces:**
- Consumes: synthetic or future technically admitted policy cases and exact split assignments.
- Produces: `validatePolicyCase(record)`, `evaluateSnapshotPolicy(cases, snapshotTier)`, and `validateLockedSplit({ cases, assignments, priorAssignments, snapshotTier })`.
- R1 does not build or admit a real snapshot. These pure functions are contracts consumed later by R5.

- [ ] **Step 1: Write failing policy tests using deterministic case builders**

Create `test/stage7ConditionalSnapshotPolicy.test.js` with these helpers and assertions:

```js
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
    // The final 25 cases belong to one source absent from train. Sequential
    // 350/75/75 assignment therefore supplies the exact 25-case test holdout.
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
    // The final 100 cases belong to one source absent from train. Sequential
    // 80/10/10 assignment therefore supplies half of the test split as holdout.
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
```

- [ ] **Step 2: Run policy tests and verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalSnapshotPolicy.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7ConditionalSnapshotPolicy.js`.

- [ ] **Step 3: Implement exact policy and split validation**

Create `src/construction/learning/stage7ConditionalSnapshotPolicy.js`. Use the exact record schema and policy constants below; every violation array is de-duplicated and sorted before return:

```js
import {
  ConditionalAdmissionContractError,
  PRIMARY_FUNCTIONS,
  STYLE_FAMILIES
} from './stage7ConditionalTaxonomy.js';
import { CANDIDATE_ID_PATTERN, LOCAL_ID_PATTERN } from './stage7SourceExpansionContracts.js';

const POLICY_KEYS = Object.freeze([
  'candidate_id', 'primary_function', 'style_family', 'scale_bin',
  'source_group', 'asset_family', 'author_entity', 'near_duplicate_cluster',
  'exact_duplicate_of', 'human_reviewed', 'second_reviewed', 'batch_id'
]);
const ASSIGNMENT_KEYS = Object.freeze(['candidate_id', 'split']);
const SPLITS = Object.freeze(['train', 'validation', 'test']);
const FUNCTION_TARGET_100 = Object.freeze({
  residential: 15,
  religious_public: 15,
  defensive_military: 15,
  production_agriculture: 10,
  transport_infrastructure: 10,
  exploration_challenge: 15,
  monument_ruin: 10,
  fantastical_special: 10
});

export function validatePolicyCase(record) {
  exactKeys(record, POLICY_KEYS, 'POLICY_CASE_KEYS_INVALID');
  const styleFamily = member(record.style_family, STYLE_FAMILIES, 'style_family');
  if (styleFamily === 'unknown') {
    throw new ConditionalAdmissionContractError(
      'POLICY_VALUE_INVALID', 'style_family'
    );
  }
  return deepFreeze({
    candidate_id: patterned(record.candidate_id, CANDIDATE_ID_PATTERN, 'candidate_id'),
    primary_function: member(record.primary_function, PRIMARY_FUNCTIONS, 'primary_function'),
    style_family: styleFamily,
    scale_bin: member(record.scale_bin, ['compact', 'standard', 'large'], 'scale_bin'),
    source_group: patterned(record.source_group, LOCAL_ID_PATTERN, 'source_group'),
    asset_family: patterned(record.asset_family, LOCAL_ID_PATTERN, 'asset_family'),
    author_entity: patterned(record.author_entity, LOCAL_ID_PATTERN, 'author_entity'),
    near_duplicate_cluster: nullablePattern(record.near_duplicate_cluster, 'near_duplicate_cluster'),
    exact_duplicate_of: nullablePattern(record.exact_duplicate_of, 'exact_duplicate_of', CANDIDATE_ID_PATTERN),
    human_reviewed: boolean(record.human_reviewed, 'human_reviewed'),
    second_reviewed: boolean(record.second_reviewed, 'second_reviewed'),
    batch_id: patterned(record.batch_id, LOCAL_ID_PATTERN, 'batch_id')
  });
}

export function evaluateSnapshotPolicy(inputCases, snapshotTier) {
  tier(snapshotTier);
  const cases = inputCases.map(validatePolicyCase);
  const violations = [];
  const expectedExact = snapshotTier === 2000 ? null : snapshotTier;
  if ((expectedExact !== null && cases.length !== expectedExact)
    || (snapshotTier === 2000 && cases.length < 2000)) {
    violations.push('SNAPSHOT_COUNT_INVALID');
  }
  const ids = cases.map((item) => item.candidate_id);
  if (new Set(ids).size !== ids.length) violations.push('CANDIDATE_DUPLICATE');
  if (cases.some((item) => item.exact_duplicate_of !== null)) {
    violations.push('EXACT_DUPLICATE_PRESENT');
  }
  const functionCounts = countBy(cases, 'primary_function');
  if (snapshotTier === 100) {
    for (const [name, target] of Object.entries(FUNCTION_TARGET_100)) {
      const value = functionCounts.get(name) || 0;
      if (Math.abs(value - target) > 3 || value < 8 || value > 20) {
        violations.push('FUNCTION_QUOTA_INVALID');
      }
    }
  } else {
    const minimum = snapshotTier === 500 ? 40 : 150;
    const maximum = snapshotTier === 500 ? 100 : Number.POSITIVE_INFINITY;
    for (const name of PRIMARY_FUNCTIONS) {
      const value = functionCounts.get(name) || 0;
      if (value < minimum) violations.push('FUNCTION_MINIMUM_MISSED');
      if (value > maximum) violations.push('FUNCTION_MAXIMUM_EXCEEDED');
    }
  }
  const sourceCounts = countBy(cases, 'source_group');
  const sourceMinimum = snapshotTier === 100 ? 5 : snapshotTier === 500 ? 12 : 30;
  const sourceCap = snapshotTier === 500 ? 0.15 : 0.10;
  const effectiveSourceCap = snapshotTier === 100 ? 0.20 : sourceCap;
  if (sourceCounts.size < sourceMinimum) violations.push('SOURCE_COUNT_INSUFFICIENT');
  if ([...sourceCounts.values()].some((count) => count > cases.length * effectiveSourceCap)) {
    violations.push('SOURCE_CAP_EXCEEDED');
  }
  if (snapshotTier === 100) {
    const familyCounts = countBy(cases, 'asset_family');
    const styleCounts = countBy(cases, 'style_family');
    const scaleCounts = countBy(cases, 'scale_bin');
    if ([...familyCounts.values()].some((count) => count > 10)) {
      violations.push('ASSET_FAMILY_CAP_EXCEEDED');
    }
    if (styleCounts.size < 5) violations.push('STYLE_COUNT_INSUFFICIENT');
    if ([...styleCounts.values()].some((count) => count > 30)) {
      violations.push('STYLE_CAP_EXCEEDED');
    }
    if ((scaleCounts.get('compact') || 0) !== 30
      || (scaleCounts.get('standard') || 0) !== 45
      || (scaleCounts.get('large') || 0) !== 25) {
      violations.push('SCALE_TARGET_MISSED');
    }
    const nearExtras = duplicateExtras(cases);
    if (nearExtras > 10) violations.push('NEAR_DUPLICATE_CAP_EXCEEDED');
  }
  if (cases.some((item) => item.human_reviewed !== true)) {
    violations.push('HUMAN_REVIEW_INCOMPLETE');
  }
  if (snapshotTier === 500
    && cases.filter((item) => item.second_reviewed).length < 100) {
    violations.push('SECOND_REVIEW_INSUFFICIENT');
  }
  if (snapshotTier === 2000) {
    const authorCounts = countBy(cases, 'author_entity');
    if ([...authorCounts.values()].some((count) => count > cases.length * 0.05)) {
      violations.push('AUTHOR_CAP_EXCEEDED');
    }
    for (const batch of grouped(cases, 'batch_id').values()) {
      if (batch.length > 100) violations.push('BATCH_SIZE_EXCEEDED');
      if (batch.filter((item) => item.second_reviewed).length < Math.ceil(batch.length * 0.10)) {
        violations.push('BATCH_REVIEW_INSUFFICIENT');
      }
    }
  }
  const sorted = Object.freeze([...new Set(violations)].sort());
  return deepFreeze({
    snapshot_tier: snapshotTier,
    case_count: cases.length,
    passed: sorted.length === 0,
    violations: sorted,
    function_counts: mapObject(functionCounts),
    source_counts: mapObject(sourceCounts),
    style_counts: mapObject(countBy(cases, 'style_family')),
    scale_counts: mapObject(countBy(cases, 'scale_bin'))
  });
}

export function validateLockedSplit({ cases: inputCases, assignments, priorAssignments, snapshotTier }) {
  tier(snapshotTier);
  const cases = inputCases.map(validatePolicyCase);
  const normalized = assignments.map(validateAssignment);
  const prior = priorAssignments.map(validateAssignment);
  const violations = [];
  if ((snapshotTier !== 2000 && cases.length !== snapshotTier)
    || (snapshotTier === 2000 && cases.length < 2000)) {
    violations.push('SNAPSHOT_COUNT_INVALID');
  }
  const caseIds = new Set(cases.map((item) => item.candidate_id));
  const assignmentIds = normalized.map((item) => item.candidate_id);
  if (new Set(assignmentIds).size !== assignmentIds.length
    || assignmentIds.length !== caseIds.size
    || assignmentIds.some((id) => !caseIds.has(id))) {
    violations.push('ASSIGNMENT_COVERAGE_INVALID');
  }
  const expected = splitCounts(cases.length, snapshotTier);
  const actual = countBy(normalized, 'split');
  for (const name of SPLITS) {
    if ((actual.get(name) || 0) !== expected[name]) violations.push('SPLIT_COUNT_INVALID');
  }
  const splitById = new Map(normalized.map((item) => [item.candidate_id, item.split]));
  const priorIds = prior.map((item) => item.candidate_id);
  if (new Set(priorIds).size !== priorIds.length) {
    violations.push('PRIOR_ASSIGNMENT_AMBIGUOUS');
  }
  for (const old of prior) {
    if (!splitById.has(old.candidate_id)) {
      violations.push('PRIOR_ASSIGNMENT_MISSING');
    } else if (splitById.get(old.candidate_id) !== old.split) {
      violations.push('PRIOR_ASSIGNMENT_CHANGED');
    }
  }
  assertGroupSplit(cases, splitById, 'asset_family', 'ASSET_FAMILY_SPLIT_LEAK', violations);
  assertGroupSplit(
    cases.filter((item) => item.near_duplicate_cluster !== null),
    splitById,
    'near_duplicate_cluster',
    'NEAR_DUPLICATE_SPLIT_LEAK',
    violations
  );
  const trainSources = new Set(cases
    .filter((item) => splitById.get(item.candidate_id) === 'train')
    .map((item) => item.source_group));
  const sourceHoldoutTestCount = cases.filter((item) =>
    splitById.get(item.candidate_id) === 'test' && !trainSources.has(item.source_group)
  ).length;
  if (snapshotTier === 500 && sourceHoldoutTestCount < 25) {
    violations.push('SOURCE_HOLDOUT_INSUFFICIENT');
  }
  if (snapshotTier === 2000 && sourceHoldoutTestCount < expected.test / 2) {
    violations.push('SOURCE_HOLDOUT_INSUFFICIENT');
  }
  const sorted = Object.freeze([...new Set(violations)].sort());
  return deepFreeze({
    snapshot_tier: snapshotTier,
    passed: sorted.length === 0,
    violations: sorted,
    split_counts: mapObject(actual),
    source_holdout_test_count: sourceHoldoutTestCount
  });
}

function splitCounts(count, snapshotTier) {
  if (snapshotTier === 100) return { train: 70, validation: 15, test: 15 };
  if (snapshotTier === 500) return { train: 350, validation: 75, test: 75 };
  const train = Math.floor(count * 0.80);
  const validation = Math.floor(count * 0.10);
  return { train, validation, test: count - train - validation };
}

function validateAssignment(record) {
  exactKeys(record, ASSIGNMENT_KEYS, 'ASSIGNMENT_KEYS_INVALID');
  return deepFreeze({
    candidate_id: patterned(record.candidate_id, CANDIDATE_ID_PATTERN, 'candidate_id'),
    split: member(record.split, SPLITS, 'split')
  });
}

function assertGroupSplit(cases, splitById, field, code, violations) {
  for (const members of grouped(cases, field).values()) {
    const splits = new Set(members.map((item) => splitById.get(item.candidate_id)));
    if (splits.size > 1) violations.push(code);
  }
}

function duplicateExtras(cases) {
  let extras = 0;
  for (const [key, members] of grouped(
    cases.filter((item) => item.near_duplicate_cluster !== null),
    'near_duplicate_cluster'
  )) {
    if (key !== null) extras += Math.max(0, members.length - 1);
  }
  return extras;
}

function tier(value) {
  if (![100, 500, 2000].includes(value)) {
    throw new ConditionalAdmissionContractError('SNAPSHOT_TIER_INVALID', String(value));
  }
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) counts.set(record[field], (counts.get(record[field]) || 0) + 1);
  return counts;
}

function grouped(records, field) {
  const output = new Map();
  for (const record of records) {
    const values = output.get(record[field]) || [];
    values.push(record);
    output.set(record[field], values);
  }
  return output;
}

function mapObject(value) {
  return Object.fromEntries([...value.entries()].sort(([left], [right]) =>
    String(left).localeCompare(String(right))
  ));
}

function exactKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionalAdmissionContractError(code, 'object required');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    throw new ConditionalAdmissionContractError(code, [...unknown, ...missing].sort().join(','));
  }
}

function member(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ConditionalAdmissionContractError('POLICY_VALUE_INVALID', label);
  }
  return value;
}

function patterned(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ConditionalAdmissionContractError('POLICY_ID_INVALID', label);
  }
  return value;
}

function nullablePattern(value, label, pattern = LOCAL_ID_PATTERN) {
  return value === null ? null : patterned(value, pattern, label);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new ConditionalAdmissionContractError('POLICY_BOOLEAN_INVALID', label);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
```

- [ ] **Step 4: Run policy tests and verify GREEN**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalSnapshotPolicy.test.js
```

Expected: all tests pass. The fixed builders produce exactly 25 source-held-out 500-tier test cases and exactly 100 source-held-out 2,000-tier test cases; do not weaken `SOURCE_HOLDOUT_INSUFFICIENT`.

- [ ] **Step 5: Run all four R1 module test files**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test --test-concurrency=1 test/stage7ConditionalTaxonomy.test.js test/stage7ConditionalAdmission.test.js test/stage7ConditionalAdmissionStore.test.js test/stage7ConditionalSnapshotPolicy.test.js
```

Expected: all four files pass with zero failures.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/construction/learning/stage7ConditionalSnapshotPolicy.js test/stage7ConditionalSnapshotPolicy.test.js
git commit -m "feat(stage7): encode conditional snapshot policy"
```

---

### Task 5: Add the metadata-only conditional admission CLI

**Files:**
- Create: `src/auditStage7ConditionalAdmission.js`
- Create: `test/stage7ConditionalAdmissionCli.test.js`
- Modify: `package.json:24-27`

**Interfaces:**
- CLI record command: `npm run audit:stage7:conditional-admission -- record --root .local/stage7-source-expansion --input reviews/taxonomy-input.json --metadata-only`.
- CLI audit command: `npm run audit:stage7:conditional-admission -- audit --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only`.
- Record reads one regular JSON file inside the ignored root, validates it, and appends only the canonical assessment ledger.
- Audit requires existing candidate, rights, discovery-decision, yield-decision, and taxonomy JSONL files, then writes exactly `summary.json` and `summary.md` below a fresh `reports/conditional-admission-YYYY-MM-DD/` directory.

- [ ] **Step 1: Write failing CLI tests**

Create `test/stage7ConditionalAdmissionCli.test.js` with a temporary repository context patterned after `test/stage7SourceExpansionCli.test.js`. Include these exact assertions:

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SOURCE_EXPANSION_DIRECTORIES, SOURCE_EXPANSION_ROOT_RELATIVE } from '../src/construction/learning/stage7SourceExpansionBoundary.js';
import {
  parseStage7ConditionalAdmissionArgs,
  runStage7ConditionalAdmissionCli
} from '../src/auditStage7ConditionalAdmission.js';
import { appendTaxonomyAssessment } from '../src/construction/learning/stage7ConditionalAdmissionStore.js';
import { candidateFixture, decisionFixture, rightsFixture } from './fixtures/stage7SourceExpansionFixtures.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

function hasCode(code) { return (error) => error.code === code; }

test('argument parsing accepts only exact record and audit metadata-only shapes', () => {
  assert.deepEqual(parseStage7ConditionalAdmissionArgs([
    'record', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--input', 'reviews/taxonomy-input.json', '--metadata-only'
  ]), {
    command: 'record', root: SOURCE_EXPANSION_ROOT_RELATIVE,
    input: 'reviews/taxonomy-input.json', asOf: null, metadataOnly: true
  });
  assert.deepEqual(parseStage7ConditionalAdmissionArgs([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-18', '--metadata-only'
  ]), {
    command: 'audit', root: SOURCE_EXPANSION_ROOT_RELATIVE,
    input: null, asOf: '2026-07-18', metadataOnly: true
  });
  assert.throws(() => parseStage7ConditionalAdmissionArgs([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE, '--as-of', '2026-07-18'
  ]), hasCode('METADATA_ONLY_REQUIRED'));
  assert.throws(() => parseStage7ConditionalAdmissionArgs([
    'record', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--input', '../escape.json', '--metadata-only'
  ]), hasCode('INPUT_PATH_INVALID'));
  assert.throws(() => parseStage7ConditionalAdmissionArgs([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    `--root=${SOURCE_EXPANSION_ROOT_RELATIVE}`,
    '--as-of', '2026-07-18', '--metadata-only'
  ]), hasCode('CLI_OPTION_DUPLICATE'));
});

test('record appends one validated revision and checks formal boundaries twice', async (t) => {
  const context = await populatedContext(t);
  await writeFile(join(context.root, 'reviews', 'taxonomy-input.json'),
    `${JSON.stringify(taxonomyAssessmentFixture())}\n`, 'utf8');
  const result = await runStage7ConditionalAdmissionCli([
    'record', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--input', 'reviews/taxonomy-input.json', '--metadata-only'
  ], context);
  assert.equal(result.recorded_revision, 1);
  assert.equal(result.authorizes_download, false);
  assert.equal(context.datasetChecks, 2);
});

test('audit writes exactly two non-authorizing reports and checks formal boundaries twice', async (t) => {
  const context = await populatedContext(t);
  await appendTaxonomyAssessment(context.root, taxonomyAssessmentFixture());
  const result = await runStage7ConditionalAdmissionCli([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-18', '--metadata-only'
  ], context);
  assert.equal(result.contract_ready_count, 1);
  assert.equal(result.authorizes_download, false);
  assert.deepEqual((await readdir(join(
    context.root, 'reports', 'conditional-admission-2026-07-18'
  ))).sort(), ['summary.json', 'summary.md']);
  const summary = JSON.parse(await readFile(join(
    context.root, 'reports', 'conditional-admission-2026-07-18', 'summary.json'
  ), 'utf8'));
  assert.equal(summary.metadata_only, true);
  assert.equal(summary.authorizes_download, false);
  assert.equal(summary.authorizes_training, false);
  assert.equal(summary.authorizes_dataset_admission, false);
  assert.equal(context.datasetChecks, 2);
});

async function populatedContext(t) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-conditional-cli-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const root = join(repositoryRoot, SOURCE_EXPANSION_ROOT_RELATIVE);
  for (const directory of SOURCE_EXPANSION_DIRECTORIES) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeJsonl(join(root, 'metadata', 'candidates.jsonl'), [candidateFixture()]);
  await writeJsonl(join(root, 'evidence', 'rights.jsonl'), [rightsFixture({ observed_at: '2026-07-18' })]);
  await writeJsonl(join(root, 'reviews', 'discovery-decisions.jsonl'), [
    decisionFixture({ decided_at: '2026-07-18' })
  ]);
  await writeJsonl(join(root, 'reviews', 'yield-decisions.jsonl'), []);
  const context = {
    repositoryRoot,
    root,
    datasetChecks: 0,
    gitStatus: async (args) => args[0] === 'check-ignore' ? 0 : 1,
    assertDatasetBoundary: async () => {
      context.datasetChecks += 1;
      return { dataset_v3_gate: {
        ready_for_m3_real_data: false, training_eligible_count: 0
      } };
    }
  };
  return context;
}

async function writeJsonl(filename, records) {
  await writeFile(filename, records.length === 0
    ? ''
    : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}
```

- [ ] **Step 2: Run CLI tests and verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalAdmissionCli.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `auditStage7ConditionalAdmission.js`.

- [ ] **Step 3: Implement strict CLI parsing and orchestration**

Create `src/auditStage7ConditionalAdmission.js` with these exported surfaces and exact behaviors:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertFormalDatasetBoundary } from './construction/learning/stage7PrivateResearchBoundary.js';
import {
  SOURCE_EXPANSION_ROOT_RELATIVE,
  SourceExpansionBoundaryError,
  assertSourceExpansionRoot,
  readSourceExpansionJson,
  readSourceExpansionJsonl,
  writeFreshReportDirectory
} from './construction/learning/stage7SourceExpansionBoundary.js';
import {
  validateDiscoveryRecord,
  validateIsoDate,
  validateReviewDecision,
  validateRightsRecord
} from './construction/learning/stage7SourceExpansionContracts.js';
import { evaluateRightsLedger } from './construction/learning/stage7SourceExpansionRights.js';
import { canonicalSourceExpansionJson } from './construction/learning/stage7SourceExpansionReview.js';
import { validateTaxonomyAssessment } from './construction/learning/stage7ConditionalTaxonomy.js';
import {
  buildConditionalAdmissionSummary,
  evaluateConditionalAdmission,
  renderConditionalAdmissionMarkdown
} from './construction/learning/stage7ConditionalAdmission.js';
import {
  appendTaxonomyAssessment,
  readTaxonomyAssessmentLedger
} from './construction/learning/stage7ConditionalAdmissionStore.js';

const COMMANDS = Object.freeze(['record', 'audit']);

export function parseStage7ConditionalAdmissionArgs(argv = []) {
  const [command, ...rest] = argv;
  for (const flag of ['--root', '--input', '--as-of', '--metadata-only']) {
    const count = rest.filter(
      (item) => item === flag || item.startsWith(`${flag}=`)
    ).length;
    if (count > 1) {
      throw new SourceExpansionBoundaryError('CLI_OPTION_DUPLICATE', flag);
    }
  }
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        root: { type: 'string' },
        input: { type: 'string' },
        'as-of': { type: 'string' },
        'metadata-only': { type: 'boolean' }
      },
      strict: true
    }));
  } catch (error) {
    throw new SourceExpansionBoundaryError('CLI_USAGE', error.message);
  }
  if (!COMMANDS.includes(command)) {
    throw new SourceExpansionBoundaryError('CLI_COMMAND_INVALID', command || 'missing');
  }
  if (values.root !== SOURCE_EXPANSION_ROOT_RELATIVE) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', values.root || 'missing');
  }
  if (values['metadata-only'] !== true) {
    throw new SourceExpansionBoundaryError('METADATA_ONLY_REQUIRED', command);
  }
  if (command === 'record') {
    if (values['as-of'] !== undefined
      || values.input !== 'reviews/taxonomy-input.json') {
      throw new SourceExpansionBoundaryError('INPUT_PATH_INVALID', values.input || 'missing');
    }
  } else {
    if (values.input !== undefined) {
      throw new SourceExpansionBoundaryError('CLI_USAGE', 'audit does not accept --input');
    }
    validateIsoDate(values['as-of'], '--as-of');
  }
  return Object.freeze({
    command,
    root: values.root,
    input: command === 'record' ? values.input : null,
    asOf: command === 'audit' ? values['as-of'] : null,
    metadataOnly: true
  });
}

export async function runStage7ConditionalAdmissionCli(argv, context = {}) {
  const options = parseStage7ConditionalAdmissionArgs(argv);
  const repositoryRoot = path.resolve(context.repositoryRoot || process.cwd());
  const root = path.resolve(repositoryRoot, options.root);
  const assertDataset = context.assertDatasetBoundary || assertFormalDatasetBoundary;
  await assertDataset(repositoryRoot);
  await assertSourceExpansionRoot(root, {
    repositoryRoot,
    gitStatus: context.gitStatus
  });
  const result = options.command === 'record'
    ? await recordAssessment(root, options.input)
    : await auditAdmission(root, options.asOf);
  await assertDataset(repositoryRoot);
  return result;
}

async function recordAssessment(root, input) {
  const record = validateTaxonomyAssessment(
    await readSourceExpansionJson(root, input)
  );
  const appended = await appendTaxonomyAssessment(root, record);
  return Object.freeze({
    command: 'record',
    candidate_id: appended.candidate_id,
    recorded_revision: appended.revision,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

async function auditAdmission(root, asOf) {
  const candidates = await readSourceExpansionJsonl(
    root, 'metadata/candidates.jsonl', validateDiscoveryRecord
  );
  const rightsRecords = await readSourceExpansionJsonl(
    root, 'evidence/rights.jsonl', validateRightsRecord
  );
  const reviewDecisions = Object.freeze([
    ...await readSourceExpansionJsonl(
      root, 'reviews/discovery-decisions.jsonl', validateReviewDecision
    ),
    ...await readSourceExpansionJsonl(
      root, 'reviews/yield-decisions.jsonl', validateReviewDecision
    )
  ]);
  const assessments = await readTaxonomyAssessmentLedger(root);
  const rightsResults = evaluateRightsLedger({ candidates, rightsRecords, asOf });
  const states = evaluateConditionalAdmission({
    candidates, rightsResults, reviewDecisions, assessments
  });
  const summary = buildConditionalAdmissionSummary(states);
  await writeFreshReportDirectory(root, `conditional-admission-${asOf}`, {
    'summary.json': canonicalSourceExpansionJson({ ...summary, as_of: asOf }),
    'summary.md': renderConditionalAdmissionMarkdown(summary)
  });
  return Object.freeze({ command: 'audit', ...summary, as_of: asOf });
}

async function main() {
  try {
    const result = await runStage7ConditionalAdmissionCli(process.argv.slice(2));
    console.log(JSON.stringify({
      command: result.command,
      metadata_only: true,
      authorizes_download: false,
      authorizes_training: false,
      authorizes_dataset_admission: false,
      recorded_revision: result.recorded_revision ?? null,
      contract_ready_count: result.contract_ready_count ?? null
    }));
  } catch (error) {
    console.error(`${error.code || 'CONDITIONAL_ADMISSION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
```

- [ ] **Step 4: Add the package script**

Add after `audit:stage7:sources` in `package.json`:

```json
"audit:stage7:conditional-admission": "node src/auditStage7ConditionalAdmission.js",
```

- [ ] **Step 5: Run CLI and all focused R1 tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test --test-concurrency=1 test/stage7ConditionalTaxonomy.test.js test/stage7ConditionalAdmission.test.js test/stage7ConditionalAdmissionStore.test.js test/stage7ConditionalSnapshotPolicy.test.js test/stage7ConditionalAdmissionCli.test.js
```

Expected: all focused R1 tests pass with zero failures.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/auditStage7ConditionalAdmission.js test/stage7ConditionalAdmissionCli.test.js package.json
git commit -m "feat(stage7): add conditional admission audit CLI"
```

---

### Task 6: Document the R1 operator boundary and prove repository isolation

**Files:**
- Modify: `README.md:148-174`
- Create: `test/stage7ConditionalAdmissionBoundary.test.js`

**Interfaces:**
- Documents only the metadata-only record and audit operations.
- Tests ensure the R1 implementation has no network, payload, private-root, Python, trainer, Dataset writer, or M4 surface.

- [ ] **Step 1: Write failing documentation and boundary tests**

Create `test/stage7ConditionalAdmissionBoundary.test.js`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const IMPLEMENTATION_FILES = [
  'src/construction/learning/stage7ConditionalTaxonomy.js',
  'src/construction/learning/stage7ConditionalAdmission.js',
  'src/construction/learning/stage7ConditionalAdmissionStore.js',
  'src/construction/learning/stage7ConditionalSnapshotPolicy.js',
  'src/auditStage7ConditionalAdmission.js'
];

test('package and README document exact metadata-only R1 operations', async () => {
  const packageText = await readFile('package.json', 'utf8');
  const readme = await readFile('README.md', 'utf8');
  const pkg = JSON.parse(packageText);
  assert.equal(
    pkg.scripts['audit:stage7:conditional-admission'],
    'node src/auditStage7ConditionalAdmission.js'
  );
  assert.match(readme, /audit:stage7:conditional-admission -- record/u);
  assert.match(readme, /audit:stage7:conditional-admission -- audit/u);
  assert.match(readme, /admission_contract_ready/u);
  assert.match(readme, /does not authorize download, Dataset admission, or training/iu);
});

test('R1 implementation exposes no payload, network, private, Python, trainer, or Dataset writer surface', async () => {
  const forbidden = [
    'fetch(', 'http.request', 'https.request', 'axios', 'playwright', 'puppeteer',
    '.schematic', '.litematic', '.mcstructure', 'level.dat', 'archive',
    '.local/stage7-private-research', 'training/stage7', 'torch', 'python',
    'buildCoarseSemanticVoxelDataset', 'ready_for_m3_real_data=true',
    'training_eligible_count=1', 'Apply Mode'
  ];
  for (const filename of IMPLEMENTATION_FILES) {
    const source = await readFile(filename, 'utf8');
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${filename} contains ${token}`);
    }
  }
});

test('R1 implementation hard-codes non-authorization in every report-producing module', async () => {
  for (const filename of [
    'src/construction/learning/stage7ConditionalAdmission.js',
    'src/auditStage7ConditionalAdmission.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.match(source, /metadata_only:\s*true/u);
    assert.match(source, /authorizes_download:\s*false/u);
    assert.match(source, /authorizes_training:\s*false/u);
    assert.match(source, /authorizes_dataset_admission:\s*false/u);
  }
});
```

- [ ] **Step 2: Run boundary test and verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalAdmissionBoundary.test.js
```

Expected: FAIL because README does not yet document the R1 commands.

- [ ] **Step 3: Add the exact README section**

Append this subsection after the current source-expansion metadata-pilot section and before `## Boundaries`:

````markdown
### Stage 7 Conditional Admission R1

R1 adds a metadata-only controlled taxonomy and pre-acquisition admission audit. Prepare one assessment at the exact ignored-root input path, append it as the next revision, then create a fresh dated audit:

```bash
npm run audit:stage7:conditional-admission -- record --root .local/stage7-source-expansion --input reviews/taxonomy-input.json --metadata-only
npm run audit:stage7:conditional-admission -- audit --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
```

The audit consumes the existing candidate and rights ledgers, both review-decision ledgers, and `reviews/conditional-taxonomy.jsonl`. It validates the eight controlled primary functions, complete-building rule, label confidence, building-type parent, style, environment, biome, source group, and asset family. It also exposes pure future 100/500/2,000 balance and locked-split contracts for later snapshot builders.

`admission_contract_ready` means only that the metadata contract can enter a later named acquisition proposal. It does not authorize download, Dataset admission, or training. R1 has no downloader, payload reader, parser, voxel preparer, model, or trainer.
````

- [ ] **Step 4: Run the boundary and documentation tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test --test-concurrency=1 test/stage7ConditionalAdmissionBoundary.test.js test/docsProjectStatus.test.js
```

Expected: both files pass with zero failures.

- [ ] **Step 5: Run all source-expansion and R1 focused tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test --test-concurrency=1 test/stage7SourceExpansionContracts.test.js test/stage7SourceExpansionRights.test.js test/stage7SourceExpansionRanking.test.js test/stage7SourceExpansionReview.test.js test/stage7SourceExpansionCli.test.js test/stage7ConditionalTaxonomy.test.js test/stage7ConditionalAdmission.test.js test/stage7ConditionalAdmissionStore.test.js test/stage7ConditionalSnapshotPolicy.test.js test/stage7ConditionalAdmissionCli.test.js test/stage7ConditionalAdmissionBoundary.test.js test/docsProjectStatus.test.js
```

Expected: every listed test passes with zero failures.

- [ ] **Step 6: Re-run the formal/private boundaries before the task commit**

Run the complete private preflight without printing private records:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print({'preflight':'ok','case_count':p.case_count,'dataset_v3_gate':p.dataset_v3_gate})"
```

Expected: `preflight` is `ok`, `case_count` is `22`, and the gate is false/zero.

Run:

```bash
git status --short
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
git ls-files .local/stage7-source-expansion
git check-ignore -q .local/stage7-source-expansion
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
```

Expected: Git status shows only R1 implementation files; neither `.local` root is tracked; both ignore checks exit zero; hashes exactly match the three values in Global Constraints.

- [ ] **Step 7: Commit Task 6**

```bash
git add README.md test/stage7ConditionalAdmissionBoundary.test.js
git commit -m "docs(stage7): document conditional admission boundary"
```

---

## Execution completion gate

After the six task commits, run these commands sequentially. Do not combine them with acquisition, corpus mutation, or training.

- [ ] Run the complete Node suite with the pinned runtime:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test --test-concurrency=1
```

Expected: zero failures. If the restricted sandbox returns `EPERM` for existing child-process tests, request narrowly scoped normal child-process permission for this exact command; do not weaken or skip tests.

- [ ] Run the complete Stage 7 Python suite:

```bash
npm run test:stage7:m3
```

Expected: zero failures and no real training artifacts.

- [ ] Run private preflight and formal Dataset checks again:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print({'preflight':'ok','case_count':p.case_count,'dataset_v3_gate':p.dataset_v3_gate})"
```

Expected: 22 cases and false/zero with no private record output.

```bash
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
```

Expected:

```text
fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749  mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json
af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654  mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json
5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082  mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
```

- [ ] Inspect final scope:

```bash
git status --short
git log --oneline -8
git diff --check eb4184a7305b72e1afc9a75ed5877447b07d1ea6..HEAD
git diff --name-only eb4184a7305b72e1afc9a75ed5877447b07d1ea6..HEAD
```

Expected: clean worktree; one R1 plan commit plus exactly six intentional R1 implementation commits after design commit `eb4184a7305b72e1afc9a75ed5877447b07d1ea6`; only this plan and the files listed in its file map changed; no `.local` path, Dataset manifest, private file, training file, Node provider file, or M4 file appears.

- [ ] Report the exact final HEAD, test counts, unchanged formal hashes/gate, unchanged private aggregate counts, and the fact that R2, real candidate recording, acquisition, parsing, and training remain blocked pending a separate design and owner approval. Do not create or export a package of reports or private artifacts.

- [ ] Stop. Do not record real taxonomy decisions, download the five candidates, start R2, or train automatically.
