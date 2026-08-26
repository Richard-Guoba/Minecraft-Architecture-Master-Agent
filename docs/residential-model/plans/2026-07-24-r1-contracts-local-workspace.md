# Residential Renderer R1 Contracts and Local Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested, versioned contracts and safe local workspace that every later residential source, annotation, dataset, model, evaluation, and runtime artifact must use.

**Architecture:** Add a focused Node.js contract package under `src/training/residential/` with strict unknown-field rejection, versioned controlled vocabularies, immutable validated outputs, and stable error codes. Add an atomic, idempotent workspace initializer and read-only inventory command constrained to `.local/residential-model/`; do not parse real houses, write training tensors, add model code, or change production generation.

**Tech Stack:** Node.js 20+ ES modules, built-in `node:test`, `node:assert/strict`, `node:fs/promises`, `node:path`, and existing repository scripts. No new npm or Python dependency.

## Global Constraints

- Target Minecraft Java version is exactly `1.21.1`; datapack `pack_format` remains `48`.
- Version-one HouseScene resolution is exactly `64 x 64 x 64`.
- R1 implements contracts and local workspace only. It must not implement source intake, NBT parsing, annotation, snapshot preparation, models, training, evaluation, or production inference.
- Learned-renderer work must not change `construction_method_v1`, current Stage 7 shadow behavior, or existing local training commands.
- `package.json` must continue exposing exactly four `training:*` scripts: `training:prepare`, `training:train`, `training:evaluate`, and `training:status`.
- The new command is named `residential:workspace`; it is not a `training:*` command.
- Real houses, source profiles, annotations, reviews, datasets, tensors, checkpoints, reconstructions, and case-level reports remain below `.local/residential-model/` and are never committed.
- Existing `.local/` content must not be deleted, moved, overwritten, published, or inspected by broad recursive operations.
- Do not create a repository-local `.venv`. Existing Python training continues to use Conda environment `mcagent-stage7`.
- Every behavior change starts with a failing test, receives the minimum implementation, and ends with a focused test plus `npm test`.
- Use strict schemas: reject unknown fields, wrong source/version, invalid enums, duplicate identifiers, out-of-range cells, and non-canonical artifact paths.
- Validators return deep-frozen structured clones and never mutate caller input.
- No timestamp enters the deterministic workspace manifest.

---

## File Structure

### New tracked files

```text
src/training/residential/
  contracts/
    contractError.js
    validation.js
    vocabularies.js
    houseSpec.js
    houseScene.js
    sourceProfile.js
    reviewRecord.js
    index.js
  workspace/
    paths.js
    workspace.js
    index.js

src/runResidentialWorkspace.js

test/
  fixtures/
    residentialContractFixtures.js
  residentialContractCore.test.js
  residentialHouseSpec.test.js
  residentialHouseScene.test.js
  residentialSourceReviewContracts.test.js
  residentialWorkspace.test.js
  residentialWorkspaceCli.test.js

docs/residential-model/
  README.md
```

### Existing files modified

```text
.gitignore
package.json
README.md
docs/architecture.md
test/docsProjectStatus.test.js
```

### Responsibility map

| Unit | Responsibility | Must not do |
| --- | --- | --- |
| `contracts/contractError.js` | Stable residential error type | Read files or infer defaults |
| `contracts/validation.js` | Shared strict scalar/object/array/cell/path assertions | Know HouseSpec or HouseScene semantics |
| `contracts/vocabularies.js` | Frozen source IDs, versions, enums, and required role lists | Validate whole documents |
| `contracts/houseSpec.js` | Validate and freeze semantic, coordinate-free LLM input | Generate rooms or coordinates |
| `contracts/houseScene.js` | Validate and freeze learned scene manifest and sparse objects | Read binary grids or repair scenes |
| `contracts/sourceProfile.js` | Validate immutable local source provenance/state history | Discover or parse source files |
| `contracts/reviewRecord.js` | Validate golden/selective/audit review records | Apply corrections to annotations |
| `workspace/paths.js` | Resolve and contain the only allowed local root | Create directories |
| `workspace/workspace.js` | Atomic init, manifest verification, read-only status counts | Ingest real data or repair conflicts |
| `runResidentialWorkspace.js` | Parse `init`/`status` CLI and render stable key/value output | Add training actions |

---

### Task 1: Shared contract kernel and controlled vocabularies

**Files:**

- Create: `src/training/residential/contracts/contractError.js`
- Create: `src/training/residential/contracts/validation.js`
- Create: `src/training/residential/contracts/vocabularies.js`
- Create: `test/residentialContractCore.test.js`

**Interfaces:**

- Produces: `ResidentialContractError(code, path, detail, metadata?)`
- Produces: `cloneDocument`, `deepFreeze`, `assertExactObject`, `assertString`, `assertBoolean`, `assertInteger`, `assertFiniteNumber`, `assertEnum`, `assertArray`, `assertUniqueStringArray`, `assertIntegerPair`, `assertCell`, `assertSha256`, `assertId`, `assertArtifactPath`, and `failContract`
- Produces: frozen version/source constants and version-one controlled vocabularies used by every later R1 task
- Consumes: no residential implementation code

- [ ] **Step 1: Write the failing core contract tests**

Create `test/residentialContractCore.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ResidentialContractError
} from '../src/training/residential/contracts/contractError.js';
import {
  assertArtifactPath,
  assertCell,
  assertExactObject,
  cloneDocument,
  deepFreeze
} from '../src/training/residential/contracts/validation.js';
import {
  HOUSE_SPEC_SOURCE,
  HOUSE_SCENE_SOURCE,
  MATERIAL_ROLES,
  OBJECT_ROLES,
  RESIDENTIAL_RESOLUTION,
  SOURCE_PROFILE_SOURCE,
  STRUCTURE_ROLES,
  SURVIVAL_BASELINE
} from '../src/training/residential/contracts/vocabularies.js';

test('residential vocabularies expose the frozen v1 contract', () => {
  assert.equal(HOUSE_SPEC_SOURCE, 'residential-housespec-v1');
  assert.equal(HOUSE_SCENE_SOURCE, 'residential-housescene-v1');
  assert.equal(SOURCE_PROFILE_SOURCE, 'residential-source-profile-v1');
  assert.deepEqual(RESIDENTIAL_RESOLUTION, [64, 64, 64]);
  assert.ok(STRUCTURE_ROLES.includes('wall'));
  assert.ok(MATERIAL_ROLES.includes('wall_primary'));
  assert.ok(OBJECT_ROLES.includes('painting'));
  assert.deepEqual(
    SURVIVAL_BASELINE,
    [
      'reachable_entrance',
      'connected_required_rooms',
      'connected_occupied_floors',
      'bed',
      'storage',
      'crafting',
      'cooking_or_smelting',
      'safe_lighting',
      'usable_clearance'
    ]
  );
  assert.ok(Object.isFrozen(STRUCTURE_ROLES));
  assert.ok(Object.isFrozen(RESIDENTIAL_RESOLUTION));
});

test('shared validation clones and deeply freezes caller data', () => {
  const input = { nested: { values: ['a'] } };
  const cloned = cloneDocument(input, 'fixture');
  assert.notEqual(cloned, input);
  assert.notEqual(cloned.nested, input.nested);
  assert.equal(deepFreeze(cloned), cloned);
  assert.ok(Object.isFrozen(cloned));
  assert.ok(Object.isFrozen(cloned.nested.values));
  input.nested.values.push('caller-mutation');
  assert.deepEqual(cloned.nested.values, ['a']);
});

test('shared validation rejects unknown fields, unsafe paths, and invalid cells', () => {
  assert.throws(
    () => assertExactObject(
      { allowed: true, extra: true },
      'fixture',
      ['allowed'],
      ['allowed']
    ),
    (error) => (
      error instanceof ResidentialContractError
      && error.code === 'CONTRACT_FIELD_UNKNOWN'
      && error.path === 'fixture.extra'
    )
  );
  for (const value of [
    '../escape.json',
    '/absolute.json',
    'nested/../../escape.json',
    'nested\\windows.json',
    '.',
    ''
  ]) {
    assert.throws(
      () => assertArtifactPath(value, 'artifact.file'),
      (error) => (
        error instanceof ResidentialContractError
        && error.code === 'CONTRACT_ARTIFACT_PATH_INVALID'
      ),
      value
    );
  }
  assert.equal(
    assertArtifactPath('grids/structure-role.bin', 'artifact.file'),
    'grids/structure-role.bin'
  );
  assert.deepEqual(assertCell([0, 63, 12], 'object.anchor'), [0, 63, 12]);
  assert.throws(
    () => assertCell([0, 64, 12], 'object.anchor'),
    (error) => (
      error instanceof ResidentialContractError
      && error.code === 'CONTRACT_CELL_INVALID'
    )
  );
});
```

- [ ] **Step 2: Run the test and verify the imports fail**

Run:

```bash
node --test test/residentialContractCore.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `contracts/contractError.js`.

- [ ] **Step 3: Implement the residential contract error**

Create `src/training/residential/contracts/contractError.js`:

```js
export class ResidentialContractError extends Error {
  constructor(code, path, detail, metadata = {}) {
    super(`${code}: ${path}: ${detail}`);
    this.name = 'ResidentialContractError';
    this.code = String(code);
    this.path = String(path);
    this.detail = String(detail);
    this.metadata = Object.freeze({ ...metadata });
  }
}

export function failContract(code, path, detail, metadata) {
  throw new ResidentialContractError(code, path, detail, metadata);
}
```

- [ ] **Step 4: Implement the shared strict validation primitives**

Create `src/training/residential/contracts/validation.js`:

```js
import path from 'node:path';
import { failContract } from './contractError.js';

const ID = /^[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function cloneDocument(value, documentPath = 'document') {
  try {
    return structuredClone(value);
  } catch (error) {
    failContract(
      'CONTRACT_DOCUMENT_UNCLONEABLE',
      documentPath,
      error?.message || 'structured clone failed'
    );
  }
}

export function deepFreeze(value) {
  if (
    value
    && typeof value === 'object'
    && !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertExactObject(
  value,
  objectPath,
  allowedFields,
  requiredFields = allowedFields
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    failContract('CONTRACT_OBJECT_INVALID', objectPath, 'expected object');
  }
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      failContract(
        'CONTRACT_FIELD_UNKNOWN',
        `${objectPath}.${field}`,
        'unknown field'
      );
    }
  }
  for (const field of requiredFields) {
    if (!Object.hasOwn(value, field)) {
      failContract(
        'CONTRACT_FIELD_REQUIRED',
        `${objectPath}.${field}`,
        'missing field'
      );
    }
  }
  return value;
}

export function assertString(
  value,
  valuePath,
  { minimum = 1, maximum = 4096 } = {}
) {
  if (
    typeof value !== 'string'
    || value.length < minimum
    || value.length > maximum
  ) {
    failContract(
      'CONTRACT_STRING_INVALID',
      valuePath,
      `expected string length ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertBoolean(value, valuePath) {
  if (typeof value !== 'boolean') {
    failContract('CONTRACT_BOOLEAN_INVALID', valuePath, 'expected boolean');
  }
  return value;
}

export function assertInteger(
  value,
  valuePath,
  { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}
) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    failContract(
      'CONTRACT_INTEGER_INVALID',
      valuePath,
      `expected safe integer ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertFiniteNumber(
  value,
  valuePath,
  { minimum = -Infinity, maximum = Infinity } = {}
) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    failContract(
      'CONTRACT_NUMBER_INVALID',
      valuePath,
      `expected finite number ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertEnum(value, valuePath, values) {
  if (!values.includes(value)) {
    failContract(
      'CONTRACT_ENUM_INVALID',
      valuePath,
      `expected one of ${values.join(',')}`
    );
  }
  return value;
}

export function assertArray(
  value,
  valuePath,
  { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}
) {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
  ) {
    failContract(
      'CONTRACT_ARRAY_INVALID',
      valuePath,
      `expected array length ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertUniqueStringArray(
  value,
  valuePath,
  { allowed, minimum = 0, maximum = 256 } = {}
) {
  assertArray(value, valuePath, { minimum, maximum });
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${valuePath}[${index}]`;
    assertString(value[index], itemPath, { maximum: 128 });
    if (allowed) assertEnum(value[index], itemPath, allowed);
    if (seen.has(value[index])) {
      failContract('CONTRACT_ARRAY_DUPLICATE', itemPath, value[index]);
    }
    seen.add(value[index]);
  }
  return value;
}

export function assertIntegerPair(
  value,
  valuePath,
  { minimum, maximum }
) {
  assertArray(value, valuePath, { minimum: 2, maximum: 2 });
  assertInteger(value[0], `${valuePath}[0]`, { minimum, maximum });
  assertInteger(value[1], `${valuePath}[1]`, { minimum, maximum });
  if (value[0] > value[1]) {
    failContract(
      'CONTRACT_RANGE_REVERSED',
      valuePath,
      `${value[0]} > ${value[1]}`
    );
  }
  return value;
}

export function assertCell(value, valuePath) {
  assertArray(value, valuePath, { minimum: 3, maximum: 3 });
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      !Number.isSafeInteger(value[axis])
      || value[axis] < 0
      || value[axis] > 63
    ) {
      failContract(
        'CONTRACT_CELL_INVALID',
        `${valuePath}[${axis}]`,
        'expected integer 0..63'
      );
    }
  }
  return value;
}

export function assertSha256(value, valuePath) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    failContract(
      'CONTRACT_SHA256_INVALID',
      valuePath,
      'expected lowercase SHA-256'
    );
  }
  return value;
}

export function assertId(value, valuePath) {
  if (typeof value !== 'string' || !ID.test(value)) {
    failContract(
      'CONTRACT_ID_INVALID',
      valuePath,
      'expected stable lowercase identifier'
    );
  }
  return value;
}

export function assertArtifactPath(value, valuePath) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || value === '.'
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    failContract(
      'CONTRACT_ARTIFACT_PATH_INVALID',
      valuePath,
      String(value)
    );
  }
  return value;
}

export function assertNullable(value, validate) {
  if (value !== null) validate(value);
  return value;
}
```

- [ ] **Step 5: Implement the immutable version-one vocabularies**

Create `src/training/residential/contracts/vocabularies.js`:

```js
const frozen = (values) => Object.freeze([...values]);

export const RESIDENTIAL_SCHEMA_VERSION = 1;
export const HOUSE_SPEC_SOURCE = 'residential-housespec-v1';
export const HOUSE_SCENE_SOURCE = 'residential-housescene-v1';
export const SOURCE_PROFILE_SOURCE = 'residential-source-profile-v1';
export const REVIEW_RECORD_SOURCE = 'residential-review-record-v1';
export const WORKSPACE_SOURCE = 'residential-workspace-v1';
export const RESIDENTIAL_MINECRAFT_VERSION = '1.21.1';
export const RESIDENTIAL_RESOLUTION = frozen([64, 64, 64]);

export const SIDES = frozen(['north', 'south', 'east', 'west']);
export const DENSITIES = frozen(['minimal', 'balanced', 'rich']);
export const ROOM_TYPES = frozen([
  'entry',
  'living_room',
  'dining_room',
  'kitchen',
  'bedroom',
  'primary_bedroom',
  'bathroom',
  'study',
  'storage',
  'utility',
  'workshop',
  'stairs',
  'corridor',
  'landing',
  'balcony',
  'porch',
  'garage',
  'sunroom'
]);
export const RELATIONSHIP_KINDS = frozen([
  'connected',
  'adjacent',
  'near',
  'separated',
  'above',
  'below',
  'opens_to',
  'shares_daylight_side'
]);
export const MATERIAL_ROLES = frozen([
  'foundation',
  'wall_primary',
  'wall_secondary',
  'floor_primary',
  'ceiling_primary',
  'roof_primary',
  'trim_primary',
  'wood_primary',
  'glass_primary',
  'door_primary',
  'stair_primary',
  'fabric_primary',
  'light_primary',
  'accent_primary',
  'landscape_primary'
]);
export const STRUCTURE_ROLES = frozen([
  'air',
  'outside',
  'ground',
  'foundation',
  'floor',
  'wall',
  'ceiling',
  'roof_full',
  'roof_stair',
  'roof_slab',
  'opening',
  'door',
  'window',
  'stair',
  'ladder',
  'railing',
  'support',
  'water',
  'circulation_reserve',
  'interaction_reserve'
]);
export const SPACE_ROLES = frozen([
  'outside',
  'room',
  'circulation',
  'vertical_circulation',
  'void',
  'site'
]);
export const OBJECT_ROLES = frozen([
  'bed',
  'storage',
  'crafting',
  'furnace',
  'smoker',
  'blast_furnace',
  'cooking_surface',
  'table',
  'seating',
  'bookshelf',
  'shelf',
  'lighting',
  'utility',
  'food_display',
  'carpet',
  'rug',
  'plant',
  'flower_pot',
  'painting',
  'item_frame',
  'mob_head',
  'wall_ornament',
  'curtain',
  'screen',
  'banner',
  'candle',
  'lantern',
  'sculpture',
  'display_object',
  'exterior_ornament'
]);
export const SCENE_GROUP_ROLES = frozen([
  'bed_ensemble',
  'cooking_station',
  'crafting_station',
  'dining_set',
  'reading_corner',
  'gallery_wall',
  'storage_wall',
  'lighting_cluster',
  'planting_cluster',
  'entrance_composition'
]);
export const SURVIVAL_BASELINE = frozen([
  'reachable_entrance',
  'connected_required_rooms',
  'connected_occupied_floors',
  'bed',
  'storage',
  'crafting',
  'cooking_or_smelting',
  'safe_lighting',
  'usable_clearance'
]);
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
node --test test/residentialContractCore.test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Commit the contract kernel**

```bash
git add src/training/residential/contracts/contractError.js \
  src/training/residential/contracts/validation.js \
  src/training/residential/contracts/vocabularies.js \
  test/residentialContractCore.test.js
git commit -m "feat(residential): define contract kernel"
```

---

### Task 2: HouseSpec v1 validator

**Files:**

- Create: `src/training/residential/contracts/houseSpec.js`
- Create: `test/fixtures/residentialContractFixtures.js`
- Create: `test/residentialHouseSpec.test.js`

**Interfaces:**

- Consumes: Task 1 validation helpers and vocabularies
- Produces: `validateHouseSpec(value): Readonly<HouseSpecV1>`
- Guarantees: strict top-level and nested fields, coordinate-free semantic input, complete material palette, unique room IDs, valid relationship references, complete survival baseline, deep-frozen cloned output

- [ ] **Step 1: Add a canonical valid HouseSpec fixture**

Create `test/fixtures/residentialContractFixtures.js` with this first export:

```js
export function validHouseSpecFixture() {
  return {
    source: 'residential-housespec-v1',
    schema_version: 1,
    minecraft_version: '1.21.1',
    request: {
      id: 'request-fixture',
      prompt: 'Build a warm two-floor survival house.',
      language: 'en',
      typology: 'residential_house'
    },
    generation: {
      seed: 18402933,
      seed_source: 'automatic',
      invariant_fields: [
        'envelope',
        'rooms',
        'relationships',
        'survival'
      ]
    },
    envelope: {
      max_width: 32,
      max_depth: 28,
      max_height: 24,
      floors: 2,
      floor_height_range: [4, 6],
      front_side: 'south',
      site_required: true,
      side_setback_range: [2, 5],
      front_setback_range: [3, 7],
      rear_setback_range: [3, 8]
    },
    style: {
      family: 'warm_modern',
      tags: ['wood', 'cozy'],
      mood: 'warm and inhabited',
      symmetry: 'balanced',
      ornament_level: 'rich',
      composition_intent: 'layered rooms around a bright living core'
    },
    palette: {
      foundation: 'minecraft:stone_bricks',
      wall_primary: 'minecraft:spruce_planks',
      wall_secondary: 'minecraft:white_concrete',
      floor_primary: 'minecraft:oak_planks',
      ceiling_primary: 'minecraft:stripped_spruce_log',
      roof_primary: 'minecraft:deepslate_tiles',
      trim_primary: 'minecraft:dark_oak_planks',
      wood_primary: 'minecraft:spruce_planks',
      glass_primary: 'minecraft:glass',
      door_primary: 'minecraft:spruce_door',
      stair_primary: 'minecraft:spruce_stairs',
      fabric_primary: 'minecraft:red_carpet',
      light_primary: 'minecraft:lantern',
      accent_primary: 'minecraft:flower_pot',
      landscape_primary: 'minecraft:moss_block'
    },
    rooms: [
      {
        id: 'entry',
        type: 'entry',
        floor: 0,
        required: true,
        target_area: [6, 12],
        importance: 'high',
        privacy: 'public',
        daylight: 'balanced',
        decoration_density: 'balanced',
        required_functions: ['entrance'],
        preferred_functions: ['storage'],
        forbidden_functions: [],
        required_objects: ['storage'],
        preferred_objects: ['plant', 'painting'],
        forbidden_objects: [],
        mood: 'welcoming',
        focal_points: ['front door']
      },
      {
        id: 'living',
        type: 'living_room',
        floor: 0,
        required: true,
        target_area: [28, 45],
        importance: 'high',
        privacy: 'public',
        daylight: 'high',
        decoration_density: 'rich',
        required_functions: ['seating'],
        preferred_functions: ['reading'],
        forbidden_functions: [],
        required_objects: ['seating', 'lighting'],
        preferred_objects: ['carpet', 'plant', 'painting'],
        forbidden_objects: [],
        mood: 'warm social focus',
        focal_points: ['gallery wall']
      },
      {
        id: 'bedroom_1',
        type: 'bedroom',
        floor: 1,
        required: true,
        target_area: [16, 28],
        importance: 'high',
        privacy: 'private',
        daylight: 'balanced',
        decoration_density: 'balanced',
        required_functions: ['sleeping', 'storage'],
        preferred_functions: ['reading'],
        forbidden_functions: [],
        required_objects: ['bed', 'storage', 'lighting'],
        preferred_objects: ['carpet', 'painting'],
        forbidden_objects: [],
        mood: 'quiet',
        focal_points: ['bed ensemble']
      }
    ],
    relationships: [
      { from: 'entry', to: 'living', kind: 'connected', required: true },
      { from: 'living', to: 'bedroom_1', kind: 'below', required: true }
    ],
    facade: {
      rhythm: 'balanced openings',
      transparency: 'medium',
      entrance_emphasis: 'strong',
      focal_elements: ['framed entry', 'living-room glazing']
    },
    roof: {
      character: 'layered pitched roof',
      overhang_range: [1, 3],
      preferred_forms: ['gable', 'cross_gable']
    },
    site: {
      mood: 'small inhabited garden',
      required_elements: ['entry_path'],
      preferred_elements: ['flowers', 'seating'],
      forbidden_elements: []
    },
    survival: {
      required: [
        'reachable_entrance',
        'connected_required_rooms',
        'connected_occupied_floors',
        'bed',
        'storage',
        'crafting',
        'cooking_or_smelting',
        'safe_lighting',
        'usable_clearance'
      ],
      optional: ['smoker', 'food_storage']
    },
    decoration: {
      default_density: 'rich',
      room_density: { entry: 'balanced', living: 'rich', bedroom_1: 'balanced' },
      required: ['lighting'],
      preferred: ['plants', 'paintings', 'carpets', 'warm_lights'],
      forbidden: [],
      themes: ['warm', 'inhabited'],
      focal_points: ['living gallery wall'],
      invent_optional_objects: true,
      max_clutter: 0.7,
      minimum_clearance: 1
    },
    constraints: {
      forbidden_features: ['blocked doors', 'unreachable stations'],
      must_preserve: ['survival', 'rooms', 'relationships'],
      maximum_full_candidates: 3
    }
  };
}
```

- [ ] **Step 2: Write the failing HouseSpec tests**

Create `test/residentialHouseSpec.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHouseSpec
} from '../src/training/residential/contracts/houseSpec.js';
import {
  validHouseSpecFixture
} from './fixtures/residentialContractFixtures.js';

test('HouseSpec v1 validates, clones, and freezes semantic input', () => {
  const input = validHouseSpecFixture();
  const result = validateHouseSpec(input);
  assert.notEqual(result, input);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.rooms));
  assert.equal(result.generation.seed, 18402933);
  assert.equal(result.rooms[1].id, 'living');
});

test('HouseSpec rejects coordinates and unknown fields', () => {
  const input = validHouseSpecFixture();
  input.rooms[0].anchor = [1, 2, 3];
  assert.throws(
    () => validateHouseSpec(input),
    /CONTRACT_FIELD_UNKNOWN: HouseSpec\.rooms\[0\]\.anchor/u
  );
});

test('HouseSpec rejects duplicate room IDs and dangling relationships', () => {
  const duplicate = validHouseSpecFixture();
  duplicate.rooms[1].id = 'entry';
  assert.throws(
    () => validateHouseSpec(duplicate),
    /HOUSE_SPEC_ROOM_DUPLICATE/u
  );

  const dangling = validHouseSpecFixture();
  dangling.relationships[0].to = 'missing_room';
  assert.throws(
    () => validateHouseSpec(dangling),
    /HOUSE_SPEC_RELATIONSHIP_ROOM_UNKNOWN/u
  );
});

test('HouseSpec requires the complete palette and survival baseline', () => {
  const palette = validHouseSpecFixture();
  delete palette.palette.wall_primary;
  assert.throws(
    () => validateHouseSpec(palette),
    /CONTRACT_FIELD_REQUIRED: HouseSpec\.palette\.wall_primary/u
  );

  const survival = validHouseSpecFixture();
  survival.survival.required = survival.survival.required
    .filter((value) => value !== 'crafting');
  assert.throws(
    () => validateHouseSpec(survival),
    /HOUSE_SPEC_SURVIVAL_REQUIRED/u
  );
});

test('HouseSpec enforces 64-cube bounds and signed 32-bit seed', () => {
  const dimensions = validHouseSpecFixture();
  dimensions.envelope.max_width = 65;
  assert.throws(
    () => validateHouseSpec(dimensions),
    /CONTRACT_INTEGER_INVALID/u
  );

  const seed = validHouseSpecFixture();
  seed.generation.seed = 2147483648;
  assert.throws(
    () => validateHouseSpec(seed),
    /CONTRACT_INTEGER_INVALID/u
  );
});
```

- [ ] **Step 3: Run the test and verify the validator is missing**

Run:

```bash
node --test test/residentialHouseSpec.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `contracts/houseSpec.js`.

- [ ] **Step 4: Implement strict HouseSpec validation**

Create `src/training/residential/contracts/houseSpec.js` with these public and internal functions:

```js
import { failContract } from './contractError.js';
import {
  assertArray,
  assertBoolean,
  assertEnum,
  assertExactObject,
  assertFiniteNumber,
  assertId,
  assertInteger,
  assertIntegerPair,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  DENSITIES,
  HOUSE_SPEC_SOURCE,
  MATERIAL_ROLES,
  OBJECT_ROLES,
  RELATIONSHIP_KINDS,
  RESIDENTIAL_MINECRAFT_VERSION,
  RESIDENTIAL_SCHEMA_VERSION,
  ROOM_TYPES,
  SIDES,
  SURVIVAL_BASELINE
} from './vocabularies.js';

const TOP_LEVEL = [
  'source',
  'schema_version',
  'minecraft_version',
  'request',
  'generation',
  'envelope',
  'style',
  'palette',
  'rooms',
  'relationships',
  'facade',
  'roof',
  'site',
  'survival',
  'decoration',
  'constraints'
];
const ROOM_FIELDS = [
  'id',
  'type',
  'floor',
  'required',
  'target_area',
  'importance',
  'privacy',
  'daylight',
  'decoration_density',
  'required_functions',
  'preferred_functions',
  'forbidden_functions',
  'required_objects',
  'preferred_objects',
  'forbidden_objects',
  'mood',
  'focal_points'
];
const BLOCK_ID = /^minecraft:[a-z0-9_./-]+$/u;

export function validateHouseSpec(value) {
  const document = cloneDocument(value, 'HouseSpec');
  assertExactObject(document, 'HouseSpec', TOP_LEVEL);
  if (document.source !== HOUSE_SPEC_SOURCE) {
    failContract('HOUSE_SPEC_SOURCE_INVALID', 'HouseSpec.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'HOUSE_SPEC_VERSION_INVALID',
      'HouseSpec.schema_version',
      document.schema_version
    );
  }
  if (document.minecraft_version !== RESIDENTIAL_MINECRAFT_VERSION) {
    failContract(
      'HOUSE_SPEC_MINECRAFT_VERSION_INVALID',
      'HouseSpec.minecraft_version',
      document.minecraft_version
    );
  }
  validateRequest(document.request);
  validateGeneration(document.generation);
  validateEnvelope(document.envelope);
  validateStyle(document.style);
  validatePalette(document.palette);
  const roomIds = validateRooms(document.rooms, document.envelope.floors);
  validateRelationships(document.relationships, roomIds);
  validateFacade(document.facade);
  validateRoof(document.roof);
  validateSite(document.site);
  validateSurvival(document.survival);
  validateDecoration(document.decoration, roomIds);
  validateConstraints(document.constraints);
  return deepFreeze(document);
}

function validateRequest(value) {
  assertExactObject(value, 'HouseSpec.request', [
    'id', 'prompt', 'language', 'typology'
  ]);
  assertId(value.id, 'HouseSpec.request.id');
  assertString(value.prompt, 'HouseSpec.request.prompt', { maximum: 16000 });
  assertEnum(value.language, 'HouseSpec.request.language', ['en', 'zh', 'mixed']);
  if (value.typology !== 'residential_house') {
    failContract(
      'HOUSE_SPEC_TYPOLOGY_INVALID',
      'HouseSpec.request.typology',
      value.typology
    );
  }
}

function validateGeneration(value) {
  assertExactObject(value, 'HouseSpec.generation', [
    'seed', 'seed_source', 'invariant_fields'
  ]);
  assertInteger(value.seed, 'HouseSpec.generation.seed', {
    minimum: -2147483648,
    maximum: 2147483647
  });
  assertEnum(
    value.seed_source,
    'HouseSpec.generation.seed_source',
    ['automatic', 'explicit']
  );
  assertUniqueStringArray(
    value.invariant_fields,
    'HouseSpec.generation.invariant_fields',
    {
      minimum: 1,
      allowed: ['envelope', 'rooms', 'relationships', 'survival', 'style']
    }
  );
}

function validateEnvelope(value) {
  const fields = [
    'max_width',
    'max_depth',
    'max_height',
    'floors',
    'floor_height_range',
    'front_side',
    'site_required',
    'side_setback_range',
    'front_setback_range',
    'rear_setback_range'
  ];
  assertExactObject(value, 'HouseSpec.envelope', fields);
  for (const field of ['max_width', 'max_depth', 'max_height']) {
    assertInteger(value[field], `HouseSpec.envelope.${field}`, {
      minimum: 1,
      maximum: 64
    });
  }
  assertInteger(value.floors, 'HouseSpec.envelope.floors', {
    minimum: 1,
    maximum: 5
  });
  assertIntegerPair(
    value.floor_height_range,
    'HouseSpec.envelope.floor_height_range',
    { minimum: 3, maximum: 16 }
  );
  assertEnum(value.front_side, 'HouseSpec.envelope.front_side', SIDES);
  assertBoolean(value.site_required, 'HouseSpec.envelope.site_required');
  for (const field of [
    'side_setback_range',
    'front_setback_range',
    'rear_setback_range'
  ]) {
    assertIntegerPair(value[field], `HouseSpec.envelope.${field}`, {
      minimum: 0,
      maximum: 32
    });
  }
}

function validateStyle(value) {
  assertExactObject(value, 'HouseSpec.style', [
    'family',
    'tags',
    'mood',
    'symmetry',
    'ornament_level',
    'composition_intent'
  ]);
  assertId(value.family, 'HouseSpec.style.family');
  assertUniqueStringArray(value.tags, 'HouseSpec.style.tags');
  assertString(value.mood, 'HouseSpec.style.mood', { maximum: 512 });
  assertEnum(
    value.symmetry,
    'HouseSpec.style.symmetry',
    ['asymmetric', 'balanced', 'symmetric']
  );
  assertEnum(
    value.ornament_level,
    'HouseSpec.style.ornament_level',
    DENSITIES
  );
  assertString(
    value.composition_intent,
    'HouseSpec.style.composition_intent',
    { maximum: 1024 }
  );
}

function validatePalette(value) {
  assertExactObject(
    value,
    'HouseSpec.palette',
    MATERIAL_ROLES,
    MATERIAL_ROLES
  );
  for (const role of MATERIAL_ROLES) {
    const block = value[role];
    if (typeof block !== 'string' || !BLOCK_ID.test(block)) {
      failContract(
        'HOUSE_SPEC_BLOCK_ID_INVALID',
        `HouseSpec.palette.${role}`,
        String(block)
      );
    }
  }
}

function validateRooms(value, floors) {
  assertArray(value, 'HouseSpec.rooms', { minimum: 1, maximum: 64 });
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const room = value[index];
    const roomPath = `HouseSpec.rooms[${index}]`;
    assertExactObject(room, roomPath, ROOM_FIELDS);
    assertId(room.id, `${roomPath}.id`);
    if (ids.has(room.id)) {
      failContract('HOUSE_SPEC_ROOM_DUPLICATE', `${roomPath}.id`, room.id);
    }
    ids.add(room.id);
    assertEnum(room.type, `${roomPath}.type`, ROOM_TYPES);
    assertInteger(room.floor, `${roomPath}.floor`, {
      minimum: 0,
      maximum: floors - 1
    });
    assertBoolean(room.required, `${roomPath}.required`);
    assertIntegerPair(room.target_area, `${roomPath}.target_area`, {
      minimum: 1,
      maximum: 4096
    });
    assertEnum(room.importance, `${roomPath}.importance`, ['low', 'medium', 'high']);
    assertEnum(room.privacy, `${roomPath}.privacy`, ['public', 'shared', 'private', 'service']);
    assertEnum(room.daylight, `${roomPath}.daylight`, ['low', 'balanced', 'high']);
    assertEnum(room.decoration_density, `${roomPath}.decoration_density`, DENSITIES);
    for (const field of [
      'required_functions',
      'preferred_functions',
      'forbidden_functions'
    ]) {
      assertUniqueStringArray(room[field], `${roomPath}.${field}`);
    }
    for (const field of [
      'required_objects',
      'preferred_objects',
      'forbidden_objects'
    ]) {
      assertUniqueStringArray(room[field], `${roomPath}.${field}`, {
        allowed: OBJECT_ROLES
      });
    }
    assertString(room.mood, `${roomPath}.mood`, { maximum: 512 });
    assertUniqueStringArray(room.focal_points, `${roomPath}.focal_points`);
  }
  return ids;
}

function validateRelationships(value, roomIds) {
  assertArray(value, 'HouseSpec.relationships', { maximum: 256 });
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const relation = value[index];
    const relationPath = `HouseSpec.relationships[${index}]`;
    assertExactObject(relation, relationPath, ['from', 'to', 'kind', 'required']);
    for (const field of ['from', 'to']) {
      assertId(relation[field], `${relationPath}.${field}`);
      if (!roomIds.has(relation[field])) {
        failContract(
          'HOUSE_SPEC_RELATIONSHIP_ROOM_UNKNOWN',
          `${relationPath}.${field}`,
          relation[field]
        );
      }
    }
    if (relation.from === relation.to) {
      failContract(
        'HOUSE_SPEC_RELATIONSHIP_SELF',
        relationPath,
        relation.from
      );
    }
    assertEnum(relation.kind, `${relationPath}.kind`, RELATIONSHIP_KINDS);
    assertBoolean(relation.required, `${relationPath}.required`);
    const key = `${relation.from}|${relation.to}|${relation.kind}`;
    if (seen.has(key)) {
      failContract('HOUSE_SPEC_RELATIONSHIP_DUPLICATE', relationPath, key);
    }
    seen.add(key);
  }
}

function validateFacade(value) {
  assertExactObject(value, 'HouseSpec.facade', [
    'rhythm', 'transparency', 'entrance_emphasis', 'focal_elements'
  ]);
  assertString(value.rhythm, 'HouseSpec.facade.rhythm', { maximum: 512 });
  assertEnum(
    value.transparency,
    'HouseSpec.facade.transparency',
    ['low', 'medium', 'high']
  );
  assertEnum(
    value.entrance_emphasis,
    'HouseSpec.facade.entrance_emphasis',
    ['subtle', 'balanced', 'strong']
  );
  assertUniqueStringArray(
    value.focal_elements,
    'HouseSpec.facade.focal_elements'
  );
}

function validateRoof(value) {
  assertExactObject(value, 'HouseSpec.roof', [
    'character', 'overhang_range', 'preferred_forms'
  ]);
  assertString(value.character, 'HouseSpec.roof.character', { maximum: 512 });
  assertIntegerPair(value.overhang_range, 'HouseSpec.roof.overhang_range', {
    minimum: 0,
    maximum: 8
  });
  assertUniqueStringArray(value.preferred_forms, 'HouseSpec.roof.preferred_forms');
}

function validateSite(value) {
  assertExactObject(value, 'HouseSpec.site', [
    'mood', 'required_elements', 'preferred_elements', 'forbidden_elements'
  ]);
  assertString(value.mood, 'HouseSpec.site.mood', { maximum: 512 });
  for (const field of [
    'required_elements',
    'preferred_elements',
    'forbidden_elements'
  ]) {
    assertUniqueStringArray(value[field], `HouseSpec.site.${field}`);
  }
}

function validateSurvival(value) {
  assertExactObject(value, 'HouseSpec.survival', ['required', 'optional']);
  assertUniqueStringArray(value.required, 'HouseSpec.survival.required');
  assertUniqueStringArray(value.optional, 'HouseSpec.survival.optional');
  for (const required of SURVIVAL_BASELINE) {
    if (!value.required.includes(required)) {
      failContract(
        'HOUSE_SPEC_SURVIVAL_REQUIRED',
        'HouseSpec.survival.required',
        required
      );
    }
  }
}

function validateDecoration(value, roomIds) {
  assertExactObject(value, 'HouseSpec.decoration', [
    'default_density',
    'room_density',
    'required',
    'preferred',
    'forbidden',
    'themes',
    'focal_points',
    'invent_optional_objects',
    'max_clutter',
    'minimum_clearance'
  ]);
  assertEnum(value.default_density, 'HouseSpec.decoration.default_density', DENSITIES);
  assertExactObject(
    value.room_density,
    'HouseSpec.decoration.room_density',
    [...roomIds],
    []
  );
  for (const [roomId, density] of Object.entries(value.room_density)) {
    assertEnum(density, `HouseSpec.decoration.room_density.${roomId}`, DENSITIES);
  }
  for (const field of ['required', 'preferred', 'forbidden', 'themes', 'focal_points']) {
    assertUniqueStringArray(value[field], `HouseSpec.decoration.${field}`);
  }
  assertBoolean(
    value.invent_optional_objects,
    'HouseSpec.decoration.invent_optional_objects'
  );
  if (!value.invent_optional_objects) {
    failContract(
      'HOUSE_SPEC_DECORATION_INVENTION_REQUIRED',
      'HouseSpec.decoration.invent_optional_objects',
      'version one requires true'
    );
  }
  assertFiniteNumber(value.max_clutter, 'HouseSpec.decoration.max_clutter', {
    minimum: 0,
    maximum: 1
  });
  assertInteger(
    value.minimum_clearance,
    'HouseSpec.decoration.minimum_clearance',
    { minimum: 1, maximum: 4 }
  );
}

function validateConstraints(value) {
  assertExactObject(value, 'HouseSpec.constraints', [
    'forbidden_features', 'must_preserve', 'maximum_full_candidates'
  ]);
  assertUniqueStringArray(
    value.forbidden_features,
    'HouseSpec.constraints.forbidden_features'
  );
  assertUniqueStringArray(value.must_preserve, 'HouseSpec.constraints.must_preserve');
  assertInteger(
    value.maximum_full_candidates,
    'HouseSpec.constraints.maximum_full_candidates',
    { minimum: 1, maximum: 3 }
  );
}
```

- [ ] **Step 5: Run both contract suites**

Run:

```bash
node --test \
  test/residentialContractCore.test.js \
  test/residentialHouseSpec.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit HouseSpec v1**

```bash
git add src/training/residential/contracts/houseSpec.js \
  test/fixtures/residentialContractFixtures.js \
  test/residentialHouseSpec.test.js
git commit -m "feat(residential): validate HouseSpec v1"
```

---

### Task 3: HouseScene v1 manifest and object contract

**Files:**

- Create: `src/training/residential/contracts/houseScene.js`
- Modify: `test/fixtures/residentialContractFixtures.js`
- Create: `test/residentialHouseScene.test.js`

**Interfaces:**

- Consumes: Task 1 helpers/vocabularies
- Produces: `validateHouseScene(value): Readonly<HouseSceneV1>`
- Guarantees: fixed `64^3` layer descriptors, canonical relative artifact paths, unique room indexes and object IDs, valid cells/orientation/attachment/roles, bound hashes, immutable validation/repair metadata

- [ ] **Step 1: Extend the fixture module with a valid HouseScene**

Append to `test/fixtures/residentialContractFixtures.js`:

```js
const HASH = 'a'.repeat(64);

export function validHouseSceneFixture() {
  return {
    source: 'residential-housescene-v1',
    schema_version: 1,
    minecraft_version: '1.21.1',
    resolution: [64, 64, 64],
    house_spec_hash: HASH,
    seed: 18402933,
    vocabularies: {
      structure_role: 1,
      space_role: 1,
      material_role: 1,
      object_role: 1
    },
    grids: [
      layer('structure_role', 'uint8', 'grids/structure-role.bin'),
      layer('room_id', 'uint16-le', 'grids/room-id.bin'),
      layer('space_role', 'uint8', 'grids/space-role.bin'),
      layer('material_role', 'uint8', 'grids/material-role.bin')
    ],
    room_index: [
      { index: 1, room_id: 'entry' },
      { index: 2, room_id: 'living' },
      { index: 3, room_id: 'bedroom_1' }
    ],
    objects: [
      {
        id: 'living_gallery_01',
        role: 'painting',
        room_id: 'living',
        anchor: [18, 6, 11],
        facing: 'west',
        attachment: 'wall',
        occupied_cells: [[18, 6, 11], [18, 7, 11]],
        support_cells: [[19, 6, 11], [19, 7, 11]],
        clearance_cells: [[17, 6, 11], [17, 7, 11]],
        material_role: 'accent_primary',
        group_id: 'gallery_wall',
        required: false,
        confidence: 0.91,
        provenance: 'decoration_model'
      }
    ],
    generation: {
      structure_model_version: 'fixture-structure-v1',
      structure_checkpoint_sha256: HASH,
      decoration_model_version: 'fixture-decoration-v1',
      decoration_checkpoint_sha256: HASH,
      dataset_sha256: HASH,
      split_sha256: HASH,
      sampling_protocol: 'fixture-mask-predict-v1',
      seed: 18402933
    },
    validation: {
      status: 'not_run',
      blockers: [],
      warnings: []
    },
    repair: {
      applied: false,
      changes: []
    }
  };

  function layer(name, encoding, file) {
    return {
      name,
      encoding,
      shape: [64, 64, 64],
      file,
      sha256: HASH
    };
  }
}
```

- [ ] **Step 2: Write failing HouseScene tests**

Create `test/residentialHouseScene.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHouseScene
} from '../src/training/residential/contracts/houseScene.js';
import {
  validHouseSceneFixture
} from './fixtures/residentialContractFixtures.js';

test('HouseScene validates fixed layers and sparse learned objects', () => {
  const input = validHouseSceneFixture();
  const result = validateHouseScene(input);
  assert.notEqual(result, input);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.objects[0].occupied_cells));
  assert.deepEqual(result.resolution, [64, 64, 64]);
  assert.equal(result.objects[0].role, 'painting');
});

test('HouseScene rejects missing, duplicate, and unsafe grid descriptors', () => {
  const missing = validHouseSceneFixture();
  missing.grids.pop();
  assert.throws(() => validateHouseScene(missing), /HOUSE_SCENE_GRID_MISSING/u);

  const duplicate = validHouseSceneFixture();
  duplicate.grids[1].name = 'structure_role';
  assert.throws(() => validateHouseScene(duplicate), /HOUSE_SCENE_GRID_DUPLICATE/u);

  const escape = validHouseSceneFixture();
  escape.grids[0].file = '../structure.bin';
  assert.throws(() => validateHouseScene(escape), /CONTRACT_ARTIFACT_PATH_INVALID/u);
});

test('HouseScene rejects out-of-range cells and unknown room references', () => {
  const cell = validHouseSceneFixture();
  cell.objects[0].anchor = [18, 64, 11];
  assert.throws(() => validateHouseScene(cell), /CONTRACT_CELL_INVALID/u);

  const room = validHouseSceneFixture();
  room.objects[0].room_id = 'missing_room';
  assert.throws(() => validateHouseScene(room), /HOUSE_SCENE_OBJECT_ROOM_UNKNOWN/u);
});

test('HouseScene requires unique object and room identifiers', () => {
  const object = validHouseSceneFixture();
  object.objects.push(structuredClone(object.objects[0]));
  assert.throws(() => validateHouseScene(object), /HOUSE_SCENE_OBJECT_DUPLICATE/u);

  const room = validHouseSceneFixture();
  room.room_index.push({ index: 4, room_id: 'living' });
  assert.throws(() => validateHouseScene(room), /HOUSE_SCENE_ROOM_DUPLICATE/u);
});
```

- [ ] **Step 3: Run the test and verify the validator is missing**

Run:

```bash
node --test test/residentialHouseScene.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `contracts/houseScene.js`.

- [ ] **Step 4: Implement HouseScene manifest validation**

Create `src/training/residential/contracts/houseScene.js`:

```js
import { failContract } from './contractError.js';
import {
  assertArray,
  assertArtifactPath,
  assertBoolean,
  assertCell,
  assertEnum,
  assertExactObject,
  assertFiniteNumber,
  assertId,
  assertInteger,
  assertSha256,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  HOUSE_SCENE_SOURCE,
  MATERIAL_ROLES,
  OBJECT_ROLES,
  RESIDENTIAL_MINECRAFT_VERSION,
  RESIDENTIAL_RESOLUTION,
  RESIDENTIAL_SCHEMA_VERSION,
  SIDES
} from './vocabularies.js';

const TOP_LEVEL = [
  'source',
  'schema_version',
  'minecraft_version',
  'resolution',
  'house_spec_hash',
  'seed',
  'vocabularies',
  'grids',
  'room_index',
  'objects',
  'generation',
  'validation',
  'repair'
];
const LAYERS = Object.freeze({
  structure_role: 'uint8',
  room_id: 'uint16-le',
  space_role: 'uint8',
  material_role: 'uint8'
});
const ATTACHMENTS = ['floor', 'wall', 'ceiling', 'free_standing'];

export function validateHouseScene(value) {
  const document = cloneDocument(value, 'HouseScene');
  assertExactObject(document, 'HouseScene', TOP_LEVEL);
  if (document.source !== HOUSE_SCENE_SOURCE) {
    failContract('HOUSE_SCENE_SOURCE_INVALID', 'HouseScene.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'HOUSE_SCENE_VERSION_INVALID',
      'HouseScene.schema_version',
      document.schema_version
    );
  }
  if (document.minecraft_version !== RESIDENTIAL_MINECRAFT_VERSION) {
    failContract(
      'HOUSE_SCENE_MINECRAFT_VERSION_INVALID',
      'HouseScene.minecraft_version',
      document.minecraft_version
    );
  }
  if (
    !Array.isArray(document.resolution)
    || document.resolution.length !== 3
    || document.resolution.some(
      (value, index) => value !== RESIDENTIAL_RESOLUTION[index]
    )
  ) {
    failContract(
      'HOUSE_SCENE_RESOLUTION_INVALID',
      'HouseScene.resolution',
      JSON.stringify(document.resolution)
    );
  }
  assertSha256(document.house_spec_hash, 'HouseScene.house_spec_hash');
  assertInteger(document.seed, 'HouseScene.seed', {
    minimum: -2147483648,
    maximum: 2147483647
  });
  validateVocabularies(document.vocabularies);
  validateGrids(document.grids);
  const roomIds = validateRoomIndex(document.room_index);
  validateObjects(document.objects, roomIds);
  validateGeneration(document.generation, document.seed);
  validateValidation(document.validation);
  validateRepair(document.repair);
  return deepFreeze(document);
}

function validateVocabularies(value) {
  const fields = [
    'structure_role', 'space_role', 'material_role', 'object_role'
  ];
  assertExactObject(value, 'HouseScene.vocabularies', fields);
  for (const field of fields) {
    if (value[field] !== 1) {
      failContract(
        'HOUSE_SCENE_VOCABULARY_VERSION_INVALID',
        `HouseScene.vocabularies.${field}`,
        value[field]
      );
    }
  }
}

function validateGrids(value) {
  assertArray(value, 'HouseScene.grids', { minimum: 4, maximum: 4 });
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const grid = value[index];
    const gridPath = `HouseScene.grids[${index}]`;
    assertExactObject(grid, gridPath, [
      'name', 'encoding', 'shape', 'file', 'sha256'
    ]);
    assertEnum(grid.name, `${gridPath}.name`, Object.keys(LAYERS));
    if (seen.has(grid.name)) {
      failContract('HOUSE_SCENE_GRID_DUPLICATE', `${gridPath}.name`, grid.name);
    }
    seen.add(grid.name);
    if (grid.encoding !== LAYERS[grid.name]) {
      failContract(
        'HOUSE_SCENE_GRID_ENCODING_INVALID',
        `${gridPath}.encoding`,
        grid.encoding
      );
    }
    if (
      !Array.isArray(grid.shape)
      || grid.shape.some(
        (dimension, axis) => dimension !== RESIDENTIAL_RESOLUTION[axis]
      )
    ) {
      failContract(
        'HOUSE_SCENE_GRID_SHAPE_INVALID',
        `${gridPath}.shape`,
        JSON.stringify(grid.shape)
      );
    }
    assertArtifactPath(grid.file, `${gridPath}.file`);
    assertSha256(grid.sha256, `${gridPath}.sha256`);
  }
  for (const layer of Object.keys(LAYERS)) {
    if (!seen.has(layer)) {
      failContract('HOUSE_SCENE_GRID_MISSING', 'HouseScene.grids', layer);
    }
  }
}

function validateRoomIndex(value) {
  assertArray(value, 'HouseScene.room_index', { minimum: 1, maximum: 65535 });
  const indexes = new Set();
  const roomIds = new Set();
  for (let item = 0; item < value.length; item += 1) {
    const record = value[item];
    const itemPath = `HouseScene.room_index[${item}]`;
    assertExactObject(record, itemPath, ['index', 'room_id']);
    assertInteger(record.index, `${itemPath}.index`, {
      minimum: 1,
      maximum: 65535
    });
    assertId(record.room_id, `${itemPath}.room_id`);
    if (indexes.has(record.index) || roomIds.has(record.room_id)) {
      failContract(
        'HOUSE_SCENE_ROOM_DUPLICATE',
        itemPath,
        `${record.index}:${record.room_id}`
      );
    }
    indexes.add(record.index);
    roomIds.add(record.room_id);
  }
  return roomIds;
}

function validateObjects(value, roomIds) {
  assertArray(value, 'HouseScene.objects', { maximum: 8192 });
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const object = value[index];
    const objectPath = `HouseScene.objects[${index}]`;
    assertExactObject(object, objectPath, [
      'id',
      'role',
      'room_id',
      'anchor',
      'facing',
      'attachment',
      'occupied_cells',
      'support_cells',
      'clearance_cells',
      'material_role',
      'group_id',
      'required',
      'confidence',
      'provenance'
    ]);
    assertId(object.id, `${objectPath}.id`);
    if (ids.has(object.id)) {
      failContract('HOUSE_SCENE_OBJECT_DUPLICATE', `${objectPath}.id`, object.id);
    }
    ids.add(object.id);
    assertEnum(object.role, `${objectPath}.role`, OBJECT_ROLES);
    assertId(object.room_id, `${objectPath}.room_id`);
    if (!roomIds.has(object.room_id)) {
      failContract(
        'HOUSE_SCENE_OBJECT_ROOM_UNKNOWN',
        `${objectPath}.room_id`,
        object.room_id
      );
    }
    assertCell(object.anchor, `${objectPath}.anchor`);
    assertEnum(object.facing, `${objectPath}.facing`, SIDES);
    assertEnum(object.attachment, `${objectPath}.attachment`, ATTACHMENTS);
    for (const field of [
      'occupied_cells', 'support_cells', 'clearance_cells'
    ]) {
      assertArray(object[field], `${objectPath}.${field}`, {
        minimum: field === 'occupied_cells' ? 1 : 0,
        maximum: 256
      });
      const cells = new Set();
      for (let cell = 0; cell < object[field].length; cell += 1) {
        assertCell(object[field][cell], `${objectPath}.${field}[${cell}]`);
        const key = object[field][cell].join(',');
        if (cells.has(key)) {
          failContract(
            'HOUSE_SCENE_OBJECT_CELL_DUPLICATE',
            `${objectPath}.${field}[${cell}]`,
            key
          );
        }
        cells.add(key);
      }
    }
    assertEnum(object.material_role, `${objectPath}.material_role`, MATERIAL_ROLES);
    if (object.group_id !== null) {
      assertId(object.group_id, `${objectPath}.group_id`);
    }
    assertBoolean(object.required, `${objectPath}.required`);
    assertFiniteNumber(object.confidence, `${objectPath}.confidence`, {
      minimum: 0,
      maximum: 1
    });
    assertEnum(
      object.provenance,
      `${objectPath}.provenance`,
      ['structure_model', 'decoration_model']
    );
  }
}

function validateGeneration(value, sceneSeed) {
  const fields = [
    'structure_model_version',
    'structure_checkpoint_sha256',
    'decoration_model_version',
    'decoration_checkpoint_sha256',
    'dataset_sha256',
    'split_sha256',
    'sampling_protocol',
    'seed'
  ];
  assertExactObject(value, 'HouseScene.generation', fields);
  for (const field of [
    'structure_model_version',
    'decoration_model_version',
    'sampling_protocol'
  ]) {
    assertId(value[field], `HouseScene.generation.${field}`);
  }
  for (const field of [
    'structure_checkpoint_sha256',
    'decoration_checkpoint_sha256',
    'dataset_sha256',
    'split_sha256'
  ]) {
    assertSha256(value[field], `HouseScene.generation.${field}`);
  }
  assertInteger(value.seed, 'HouseScene.generation.seed', {
    minimum: -2147483648,
    maximum: 2147483647
  });
  if (value.seed !== sceneSeed) {
    failContract(
      'HOUSE_SCENE_SEED_MISMATCH',
      'HouseScene.generation.seed',
      `${value.seed} != ${sceneSeed}`
    );
  }
}

function validateValidation(value) {
  assertExactObject(value, 'HouseScene.validation', [
    'status', 'blockers', 'warnings'
  ]);
  assertEnum(value.status, 'HouseScene.validation.status', [
    'not_run', 'passed', 'failed'
  ]);
  assertUniqueStringArray(value.blockers, 'HouseScene.validation.blockers');
  assertUniqueStringArray(value.warnings, 'HouseScene.validation.warnings');
}

function validateRepair(value) {
  assertExactObject(value, 'HouseScene.repair', ['applied', 'changes']);
  assertBoolean(value.applied, 'HouseScene.repair.applied');
  assertArray(value.changes, 'HouseScene.repair.changes', { maximum: 4096 });
  for (let index = 0; index < value.changes.length; index += 1) {
    const change = value.changes[index];
    const changePath = `HouseScene.repair.changes[${index}]`;
    assertExactObject(change, changePath, [
      'kind', 'object_id', 'cells', 'reason'
    ]);
    assertId(change.kind, `${changePath}.kind`);
    if (change.object_id !== null) assertId(change.object_id, `${changePath}.object_id`);
    assertArray(change.cells, `${changePath}.cells`, { maximum: 256 });
    for (let cell = 0; cell < change.cells.length; cell += 1) {
      assertCell(change.cells[cell], `${changePath}.cells[${cell}]`);
    }
    assertString(change.reason, `${changePath}.reason`, { maximum: 1024 });
  }
  if (value.applied !== (value.changes.length > 0)) {
    failContract(
      'HOUSE_SCENE_REPAIR_STATE_INVALID',
      'HouseScene.repair.applied',
      'applied must match non-empty changes'
    );
  }
}
```

- [ ] **Step 5: Run the HouseScene and earlier contract suites**

Run:

```bash
node --test \
  test/residentialContractCore.test.js \
  test/residentialHouseSpec.test.js \
  test/residentialHouseScene.test.js
```

Expected: PASS, 12 tests.

- [ ] **Step 6: Commit HouseScene v1**

```bash
git add src/training/residential/contracts/houseScene.js \
  test/fixtures/residentialContractFixtures.js \
  test/residentialHouseScene.test.js
git commit -m "feat(residential): validate HouseScene v1"
```

---

### Task 4: SourceProfile and review-record contracts

**Files:**

- Create: `src/training/residential/contracts/sourceProfile.js`
- Create: `src/training/residential/contracts/reviewRecord.js`
- Create: `src/training/residential/contracts/index.js`
- Modify: `test/fixtures/residentialContractFixtures.js`
- Create: `test/residentialSourceReviewContracts.test.js`

**Interfaces:**

- Consumes: Task 1 helpers/vocabularies
- Produces: `validateSourceProfile`, `validateReviewRecord`, and a stable residential contract barrel
- Guarantees: hashed immutable artifact identity, source/license context, bounded format enum, contiguous append-only status decisions, field-level review provenance, pending-versus-completed review consistency

- [ ] **Step 1: Add valid SourceProfile and ReviewRecord fixtures**

Append to `test/fixtures/residentialContractFixtures.js`:

```js
export function validSourceProfileFixture() {
  return {
    source: 'residential-source-profile-v1',
    schema_version: 1,
    case_id: 'house-fixture',
    batch_id: 'batch-001',
    title: 'Fixture Survival House',
    origin: {
      url: 'https://example.invalid/fixture-house',
      author: 'Fixture Author',
      license_status: 'recorded',
      license_text: 'Local training fixture permission.',
      allowed_uses: ['local-analysis', 'local-training'],
      acquired_at: '2026-07-24T12:00:00.000Z'
    },
    artifact: {
      original_filename: 'fixture-house.schem',
      format: 'schem',
      byte_size: 1024,
      sha256: 'b'.repeat(64)
    },
    lineage: {
      source_project: 'fixture-project',
      asset_family: 'fixture-family'
    },
    measurements: {
      occupied_bounds: {
        min: [0, 0, 0],
        max: [31, 23, 27],
        extent: [32, 24, 28]
      }
    },
    fingerprints: {
      exact_sha256: 'b'.repeat(64),
      structural_sha256: 'c'.repeat(64)
    },
    evidence: {
      complete_residence: 'pass',
      furnished: 'pass',
      survival_core: 'pass',
      supported_content: 'pass'
    },
    status: 'eligible',
    decisions: [
      {
        id: 'decision-001',
        at: '2026-07-24T12:00:01.000Z',
        actor: 'fixture-tool',
        action: 'quarantine',
        from_status: null,
        to_status: 'quarantined',
        reason: 'immutable source recorded'
      },
      {
        id: 'decision-002',
        at: '2026-07-24T12:00:02.000Z',
        actor: 'fixture-tool',
        action: 'parse',
        from_status: 'quarantined',
        to_status: 'parsed',
        reason: 'supported fixture parsed'
      },
      {
        id: 'decision-003',
        at: '2026-07-24T12:00:03.000Z',
        actor: 'fixture-reviewer',
        action: 'admit',
        from_status: 'parsed',
        to_status: 'eligible',
        reason: 'fixture evidence passes'
      }
    ]
  };
}

export function validReviewRecordFixture() {
  return {
    source: 'residential-review-record-v1',
    schema_version: 1,
    review_id: 'review-house-fixture-001',
    case_id: 'house-fixture',
    annotation_revision: 1,
    kind: 'golden',
    status: 'accepted',
    reviewer: 'fixture-reviewer',
    reviewed_at: '2026-07-24T13:00:00.000Z',
    field_decisions: [
      {
        path: 'HouseSpec.rooms[0].type',
        action: 'confirm',
        value: 'entry',
        reason: 'front threshold and door evidence agree'
      }
    ],
    notes: 'Fixture review accepted.'
  };
}
```

- [ ] **Step 2: Write failing source/review tests**

Create `test/residentialSourceReviewContracts.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateReviewRecord,
  validateSourceProfile
} from '../src/training/residential/contracts/index.js';
import {
  validReviewRecordFixture,
  validSourceProfileFixture
} from './fixtures/residentialContractFixtures.js';

test('SourceProfile validates immutable identity and contiguous decisions', () => {
  const result = validateSourceProfile(validSourceProfileFixture());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.status, 'eligible');
  assert.equal(result.decisions.at(-1).to_status, 'eligible');
});

test('SourceProfile rejects broken decision history and unsupported formats', () => {
  const history = validSourceProfileFixture();
  history.decisions[1].from_status = 'eligible';
  assert.throws(
    () => validateSourceProfile(history),
    /SOURCE_PROFILE_DECISION_DISCONTIGUOUS/u
  );

  const format = validSourceProfileFixture();
  format.artifact.format = 'litematic';
  assert.throws(
    () => validateSourceProfile(format),
    /CONTRACT_ENUM_INVALID/u
  );
});

test('ReviewRecord validates completed golden review evidence', () => {
  const result = validateReviewRecord(validReviewRecordFixture());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.kind, 'golden');
  assert.equal(result.field_decisions[0].action, 'confirm');
});

test('ReviewRecord enforces pending and completed reviewer fields', () => {
  const pending = validReviewRecordFixture();
  pending.status = 'pending';
  pending.reviewer = 'fixture-reviewer';
  pending.reviewed_at = null;
  pending.field_decisions = [];
  assert.throws(
    () => validateReviewRecord(pending),
    /REVIEW_RECORD_PENDING_REVIEWER/u
  );

  const complete = validReviewRecordFixture();
  complete.reviewer = '';
  assert.throws(
    () => validateReviewRecord(complete),
    /CONTRACT_STRING_INVALID/u
  );
});
```

- [ ] **Step 3: Run the test and verify missing modules**

Run:

```bash
node --test test/residentialSourceReviewContracts.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `contracts/index.js`.

- [ ] **Step 4: Implement SourceProfile validation**

Create `src/training/residential/contracts/sourceProfile.js`:

```js
import { failContract } from './contractError.js';
import {
  assertArray,
  assertCell,
  assertEnum,
  assertExactObject,
  assertId,
  assertInteger,
  assertSha256,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  SOURCE_PROFILE_SOURCE
} from './vocabularies.js';

const STATUSES = ['quarantined', 'parsed', 'eligible', 'deferred', 'rejected'];
const EVIDENCE = ['unknown', 'pass', 'fail'];

export function validateSourceProfile(value) {
  const document = cloneDocument(value, 'SourceProfile');
  assertExactObject(document, 'SourceProfile', [
    'source',
    'schema_version',
    'case_id',
    'batch_id',
    'title',
    'origin',
    'artifact',
    'lineage',
    'measurements',
    'fingerprints',
    'evidence',
    'status',
    'decisions'
  ]);
  if (document.source !== SOURCE_PROFILE_SOURCE) {
    failContract(
      'SOURCE_PROFILE_SOURCE_INVALID',
      'SourceProfile.source',
      document.source
    );
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'SOURCE_PROFILE_VERSION_INVALID',
      'SourceProfile.schema_version',
      document.schema_version
    );
  }
  assertId(document.case_id, 'SourceProfile.case_id');
  assertId(document.batch_id, 'SourceProfile.batch_id');
  assertString(document.title, 'SourceProfile.title', { maximum: 512 });
  validateOrigin(document.origin);
  validateArtifact(document.artifact);
  validateLineage(document.lineage);
  validateMeasurements(document.measurements);
  validateFingerprints(document.fingerprints, document.artifact.sha256);
  validateEvidence(document.evidence);
  assertEnum(document.status, 'SourceProfile.status', STATUSES);
  validateDecisions(document.decisions, document.status);
  return deepFreeze(document);
}

function validateOrigin(value) {
  assertExactObject(value, 'SourceProfile.origin', [
    'url',
    'author',
    'license_status',
    'license_text',
    'allowed_uses',
    'acquired_at'
  ]);
  assertString(value.url, 'SourceProfile.origin.url', { maximum: 4096 });
  let parsed;
  try {
    parsed = new URL(value.url);
  } catch {
    failContract('SOURCE_PROFILE_URL_INVALID', 'SourceProfile.origin.url', value.url);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    failContract(
      'SOURCE_PROFILE_URL_INVALID',
      'SourceProfile.origin.url',
      parsed.protocol
    );
  }
  assertString(value.author, 'SourceProfile.origin.author', {
    minimum: 0,
    maximum: 512
  });
  assertEnum(
    value.license_status,
    'SourceProfile.origin.license_status',
    ['recorded', 'unknown', 'restricted', 'public_domain']
  );
  assertString(value.license_text, 'SourceProfile.origin.license_text', {
    minimum: 0,
    maximum: 4096
  });
  assertUniqueStringArray(value.allowed_uses, 'SourceProfile.origin.allowed_uses', {
    allowed: ['local-analysis', 'local-training', 'external-release']
  });
  assertTimestamp(value.acquired_at, 'SourceProfile.origin.acquired_at');
}

function validateArtifact(value) {
  assertExactObject(value, 'SourceProfile.artifact', [
    'original_filename', 'format', 'byte_size', 'sha256'
  ]);
  assertString(value.original_filename, 'SourceProfile.artifact.original_filename', {
    maximum: 512
  });
  if (
    value.original_filename.includes('/')
    || value.original_filename.includes('\\')
    || value.original_filename === '.'
    || value.original_filename === '..'
  ) {
    failContract(
      'SOURCE_PROFILE_FILENAME_INVALID',
      'SourceProfile.artifact.original_filename',
      value.original_filename
    );
  }
  assertEnum(value.format, 'SourceProfile.artifact.format', [
    'schem', 'schematic', 'structure_nbt'
  ]);
  assertInteger(value.byte_size, 'SourceProfile.artifact.byte_size', {
    minimum: 1,
    maximum: 64 * 1024 * 1024
  });
  assertSha256(value.sha256, 'SourceProfile.artifact.sha256');
}

function validateLineage(value) {
  assertExactObject(value, 'SourceProfile.lineage', [
    'source_project', 'asset_family'
  ]);
  assertId(value.source_project, 'SourceProfile.lineage.source_project');
  assertId(value.asset_family, 'SourceProfile.lineage.asset_family');
}

function validateMeasurements(value) {
  assertExactObject(value, 'SourceProfile.measurements', ['occupied_bounds']);
  const bounds = value.occupied_bounds;
  assertExactObject(bounds, 'SourceProfile.measurements.occupied_bounds', [
    'min', 'max', 'extent'
  ]);
  assertCell(bounds.min, 'SourceProfile.measurements.occupied_bounds.min');
  assertCell(bounds.max, 'SourceProfile.measurements.occupied_bounds.max');
  assertArray(bounds.extent, 'SourceProfile.measurements.occupied_bounds.extent', {
    minimum: 3,
    maximum: 3
  });
  for (let axis = 0; axis < 3; axis += 1) {
    assertInteger(
      bounds.extent[axis],
      `SourceProfile.measurements.occupied_bounds.extent[${axis}]`,
      { minimum: 1, maximum: 64 }
    );
    if (bounds.max[axis] - bounds.min[axis] + 1 !== bounds.extent[axis]) {
      failContract(
        'SOURCE_PROFILE_BOUNDS_INVALID',
        'SourceProfile.measurements.occupied_bounds',
        `axis ${axis}`
      );
    }
  }
}

function validateFingerprints(value, artifactHash) {
  assertExactObject(value, 'SourceProfile.fingerprints', [
    'exact_sha256', 'structural_sha256'
  ]);
  assertSha256(value.exact_sha256, 'SourceProfile.fingerprints.exact_sha256');
  assertSha256(
    value.structural_sha256,
    'SourceProfile.fingerprints.structural_sha256'
  );
  if (value.exact_sha256 !== artifactHash) {
    failContract(
      'SOURCE_PROFILE_EXACT_HASH_MISMATCH',
      'SourceProfile.fingerprints.exact_sha256',
      `${value.exact_sha256} != ${artifactHash}`
    );
  }
}

function validateEvidence(value) {
  const fields = [
    'complete_residence', 'furnished', 'survival_core', 'supported_content'
  ];
  assertExactObject(value, 'SourceProfile.evidence', fields);
  for (const field of fields) {
    assertEnum(value[field], `SourceProfile.evidence.${field}`, EVIDENCE);
  }
}

function validateDecisions(value, finalStatus) {
  assertArray(value, 'SourceProfile.decisions', { minimum: 1, maximum: 1024 });
  const ids = new Set();
  let previous = null;
  for (let index = 0; index < value.length; index += 1) {
    const decision = value[index];
    const decisionPath = `SourceProfile.decisions[${index}]`;
    assertExactObject(decision, decisionPath, [
      'id', 'at', 'actor', 'action', 'from_status', 'to_status', 'reason'
    ]);
    assertId(decision.id, `${decisionPath}.id`);
    if (ids.has(decision.id)) {
      failContract('SOURCE_PROFILE_DECISION_DUPLICATE', `${decisionPath}.id`, decision.id);
    }
    ids.add(decision.id);
    assertTimestamp(decision.at, `${decisionPath}.at`);
    assertId(decision.actor, `${decisionPath}.actor`);
    assertId(decision.action, `${decisionPath}.action`);
    if (decision.from_status !== previous) {
      failContract(
        'SOURCE_PROFILE_DECISION_DISCONTIGUOUS',
        `${decisionPath}.from_status`,
        `${decision.from_status} != ${previous}`
      );
    }
    assertEnum(decision.to_status, `${decisionPath}.to_status`, STATUSES);
    assertString(decision.reason, `${decisionPath}.reason`, { maximum: 2048 });
    previous = decision.to_status;
  }
  if (previous !== finalStatus) {
    failContract(
      'SOURCE_PROFILE_STATUS_MISMATCH',
      'SourceProfile.status',
      `${finalStatus} != ${previous}`
    );
  }
}

function assertTimestamp(value, valuePath) {
  assertString(value, valuePath, { maximum: 64 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failContract('CONTRACT_TIMESTAMP_INVALID', valuePath, value);
  }
}
```

- [ ] **Step 5: Implement ReviewRecord validation**

Create `src/training/residential/contracts/reviewRecord.js`:

```js
import { failContract } from './contractError.js';
import {
  assertArray,
  assertEnum,
  assertExactObject,
  assertId,
  assertInteger,
  assertString,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  REVIEW_RECORD_SOURCE
} from './vocabularies.js';

export function validateReviewRecord(value) {
  const document = cloneDocument(value, 'ReviewRecord');
  assertExactObject(document, 'ReviewRecord', [
    'source',
    'schema_version',
    'review_id',
    'case_id',
    'annotation_revision',
    'kind',
    'status',
    'reviewer',
    'reviewed_at',
    'field_decisions',
    'notes'
  ]);
  if (document.source !== REVIEW_RECORD_SOURCE) {
    failContract(
      'REVIEW_RECORD_SOURCE_INVALID',
      'ReviewRecord.source',
      document.source
    );
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'REVIEW_RECORD_VERSION_INVALID',
      'ReviewRecord.schema_version',
      document.schema_version
    );
  }
  assertId(document.review_id, 'ReviewRecord.review_id');
  assertId(document.case_id, 'ReviewRecord.case_id');
  assertInteger(
    document.annotation_revision,
    'ReviewRecord.annotation_revision',
    { minimum: 1, maximum: Number.MAX_SAFE_INTEGER }
  );
  assertEnum(document.kind, 'ReviewRecord.kind', [
    'golden', 'selective', 'audit'
  ]);
  assertEnum(document.status, 'ReviewRecord.status', [
    'pending', 'accepted', 'correction_required', 'rejected'
  ]);
  if (document.status === 'pending') {
    if (document.reviewer !== '') {
      failContract(
        'REVIEW_RECORD_PENDING_REVIEWER',
        'ReviewRecord.reviewer',
        document.reviewer
      );
    }
    if (document.reviewed_at !== null || document.field_decisions.length !== 0) {
      failContract(
        'REVIEW_RECORD_PENDING_EVIDENCE',
        'ReviewRecord',
        'pending review must be empty'
      );
    }
  } else {
    assertString(document.reviewer, 'ReviewRecord.reviewer', { maximum: 128 });
    assertTimestamp(document.reviewed_at, 'ReviewRecord.reviewed_at');
  }
  validateFieldDecisions(document.field_decisions);
  assertString(document.notes, 'ReviewRecord.notes', {
    minimum: 0,
    maximum: 4096
  });
  return deepFreeze(document);
}

function validateFieldDecisions(value) {
  assertArray(value, 'ReviewRecord.field_decisions', { maximum: 4096 });
  for (let index = 0; index < value.length; index += 1) {
    const decision = value[index];
    const decisionPath = `ReviewRecord.field_decisions[${index}]`;
    assertExactObject(decision, decisionPath, [
      'path', 'action', 'value', 'reason'
    ]);
    assertString(decision.path, `${decisionPath}.path`, { maximum: 512 });
    assertEnum(decision.action, `${decisionPath}.action`, [
      'confirm', 'correct', 'reject', 'defer'
    ]);
    if (
      decision.value !== null
      && typeof decision.value !== 'string'
      && typeof decision.value !== 'number'
      && typeof decision.value !== 'boolean'
    ) {
      failContract(
        'REVIEW_RECORD_VALUE_INVALID',
        `${decisionPath}.value`,
        typeof decision.value
      );
    }
    assertString(decision.reason, `${decisionPath}.reason`, { maximum: 2048 });
  }
}

function assertTimestamp(value, valuePath) {
  assertString(value, valuePath, { maximum: 64 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failContract('CONTRACT_TIMESTAMP_INVALID', valuePath, value);
  }
}
```

- [ ] **Step 6: Add the public contract barrel**

Create `src/training/residential/contracts/index.js`:

```js
export {
  ResidentialContractError
} from './contractError.js';
export {
  validateHouseScene
} from './houseScene.js';
export {
  validateHouseSpec
} from './houseSpec.js';
export {
  validateReviewRecord
} from './reviewRecord.js';
export {
  validateSourceProfile
} from './sourceProfile.js';
export * from './vocabularies.js';
```

- [ ] **Step 7: Run all residential contract tests**

Run:

```bash
node --test \
  test/residentialContractCore.test.js \
  test/residentialHouseSpec.test.js \
  test/residentialHouseScene.test.js \
  test/residentialSourceReviewContracts.test.js
```

Expected: PASS, 16 tests.

- [ ] **Step 8: Commit the profile and review contracts**

```bash
git add src/training/residential/contracts/sourceProfile.js \
  src/training/residential/contracts/reviewRecord.js \
  src/training/residential/contracts/index.js \
  test/fixtures/residentialContractFixtures.js \
  test/residentialSourceReviewContracts.test.js
git commit -m "feat(residential): define source and review contracts"
```

---

### Task 5: Safe atomic local workspace and read-only inventory

**Files:**

- Create: `src/training/residential/workspace/paths.js`
- Create: `src/training/residential/workspace/workspace.js`
- Create: `src/training/residential/workspace/index.js`
- Create: `test/residentialWorkspace.test.js`

**Interfaces:**

- Consumes: `ResidentialContractError`, `WORKSPACE_SOURCE`, schema version
- Produces: `RESIDENTIAL_WORKSPACE_DIRECTORIES`
- Produces: `resolveResidentialWorkspaceRoot(value, { cwd? })`
- Produces: `validateResidentialWorkspaceRoot(root, { projectRoot? })`
- Produces: `initializeResidentialWorkspace({ root, projectRoot? })`
- Produces: `readResidentialWorkspaceStatus({ root, projectRoot? })`
- Guarantees: exact `.local/residential-model` containment, no symlink component, atomic first creation, deterministic manifest, idempotent valid re-init, refusal on partial/conflicting state, read-only counts

- [ ] **Step 1: Write failing workspace tests**

Create `test/residentialWorkspace.test.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace,
  readResidentialWorkspaceStatus,
  RESIDENTIAL_WORKSPACE_DIRECTORIES,
  validateResidentialWorkspaceRoot
} from '../src/training/residential/workspace/index.js';

async function projectFixture(t) {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-workspace-')
  );
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  return {
    projectRoot,
    root: path.join(projectRoot, '.local', 'residential-model')
  };
}

test('workspace initialization is atomic, deterministic, and idempotent', async (t) => {
  const fixture = await projectFixture(t);
  const first = await initializeResidentialWorkspace(fixture);
  const manifestPath = path.join(fixture.root, 'workspace.json');
  const firstBytes = await fs.readFile(manifestPath);
  const second = await initializeResidentialWorkspace(fixture);
  const secondBytes = await fs.readFile(manifestPath);

  assert.equal(first.state, 'ready');
  assert.deepEqual(second, first);
  assert.deepEqual(secondBytes, firstBytes);
  assert.deepEqual(first.directories, RESIDENTIAL_WORKSPACE_DIRECTORIES);
  for (const relative of RESIDENTIAL_WORKSPACE_DIRECTORIES) {
    assert.equal(
      (await fs.lstat(path.join(fixture.root, relative))).isDirectory(),
      true,
      relative
    );
  }
});

test('workspace status is read-only and reports local inventory counts', async (t) => {
  const fixture = await projectFixture(t);
  assert.equal(
    (await readResidentialWorkspaceStatus(fixture)).state,
    'not_initialized'
  );
  await initializeResidentialWorkspace(fixture);
  await fs.writeFile(
    path.join(fixture.root, 'sources', 'one.json'),
    '{}\n'
  );
  await fs.writeFile(
    path.join(fixture.root, 'annotations', 'one.json'),
    '{}\n'
  );
  await fs.writeFile(
    path.join(fixture.root, 'reviews', 'golden', 'one.json'),
    '{}\n'
  );
  const status = await readResidentialWorkspaceStatus(fixture);
  assert.deepEqual(status.counts, {
    inbox_batches: 0,
    quarantined_cases: 0,
    source_profiles: 1,
    annotations: 1,
    golden_reviews: 1,
    selective_reviews: 0,
    snapshots: 0,
    runs: 0,
    reports: 0
  });
});

test('workspace root rejects outside paths, symlinks, and conflicting files', async (t) => {
  const fixture = await projectFixture(t);
  await assert.rejects(
    validateResidentialWorkspaceRoot(
      path.join(fixture.projectRoot, '.local', 'other'),
      fixture
    ),
    /WORKSPACE_ROOT_OUTSIDE_RESIDENTIAL/u
  );

  const symlinkTarget = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-symlink-target-')
  );
  t.after(() => fs.rm(symlinkTarget, { recursive: true, force: true }));
  await fs.symlink(
    symlinkTarget,
    path.join(fixture.projectRoot, '.local', 'residential-model')
  );
  await assert.rejects(
    initializeResidentialWorkspace(fixture),
    /WORKSPACE_ROOT_SYMLINK/u
  );
});

test('workspace init never repairs an incomplete existing root', async (t) => {
  const fixture = await projectFixture(t);
  await fs.mkdir(fixture.root);
  await fs.writeFile(path.join(fixture.root, 'sentinel.txt'), 'keep');
  await assert.rejects(
    initializeResidentialWorkspace(fixture),
    /WORKSPACE_CONFLICT/u
  );
  assert.equal(
    await fs.readFile(path.join(fixture.root, 'sentinel.txt'), 'utf8'),
    'keep'
  );
  assert.deepEqual(await fs.readdir(fixture.root), ['sentinel.txt']);
});
```

- [ ] **Step 2: Run the tests and verify missing workspace modules**

Run:

```bash
node --test test/residentialWorkspace.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `workspace/index.js`.

- [ ] **Step 3: Implement workspace path containment**

Create `src/training/residential/workspace/paths.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { failContract } from '../contracts/contractError.js';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../..');

export function resolveResidentialWorkspaceRoot(
  value = '.local/residential-model',
  { cwd = process.cwd() } = {}
) {
  return path.resolve(cwd, String(value));
}

export async function validateResidentialWorkspaceRoot(
  root,
  { projectRoot = PROJECT_ROOT } = {}
) {
  const project = path.resolve(projectRoot);
  const candidate = path.resolve(root);
  const allowed = path.join(project, '.local', 'residential-model');
  if (candidate !== allowed) {
    failContract(
      'WORKSPACE_ROOT_OUTSIDE_RESIDENTIAL',
      'workspace.root',
      candidate
    );
  }
  await rejectSymlinks(project, candidate);
  const entry = await safeLstat(candidate);
  if (entry?.isSymbolicLink()) {
    failContract('WORKSPACE_ROOT_SYMLINK', 'workspace.root', candidate);
  }
  if (entry && !entry.isDirectory()) {
    failContract('WORKSPACE_ROOT_NOT_DIRECTORY', 'workspace.root', candidate);
  }
  return candidate;
}

export async function safeLstat(value) {
  try {
    return await fs.lstat(value);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function rejectSymlinks(projectRoot, candidate) {
  const relative = path.relative(projectRoot, candidate);
  let current = projectRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const entry = await safeLstat(current);
    if (!entry) return;
    if (entry.isSymbolicLink()) {
      failContract('WORKSPACE_ROOT_SYMLINK', 'workspace.root', current);
    }
  }
}
```

- [ ] **Step 4: Implement atomic initialization and read-only status**

Create `src/training/residential/workspace/workspace.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { failContract } from '../contracts/contractError.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  WORKSPACE_SOURCE
} from '../contracts/vocabularies.js';
import {
  safeLstat,
  validateResidentialWorkspaceRoot
} from './paths.js';

export const RESIDENTIAL_WORKSPACE_DIRECTORIES = Object.freeze([
  'inbox',
  'quarantine',
  'sources',
  'annotations',
  'reviews/golden',
  'reviews/selective',
  'snapshots',
  'runs',
  'reports'
]);

const MANIFEST = Object.freeze({
  source: WORKSPACE_SOURCE,
  schema_version: RESIDENTIAL_SCHEMA_VERSION,
  directories: RESIDENTIAL_WORKSPACE_DIRECTORIES
});

export async function initializeResidentialWorkspace(options) {
  const root = await validateResidentialWorkspaceRoot(
    options.root,
    options
  );
  const existing = await safeLstat(root);
  if (existing) return readReadyWorkspace(root);

  const parent = path.dirname(root);
  await fs.mkdir(parent, { recursive: true });
  const parentEntry = await fs.lstat(parent);
  if (!parentEntry.isDirectory() || parentEntry.isSymbolicLink()) {
    failContract('WORKSPACE_PARENT_INVALID', 'workspace.root', parent);
  }
  const temporary = await fs.mkdtemp(
    path.join(parent, '.residential-model.tmp-')
  );
  let removeTemporary = true;
  try {
    for (const relative of RESIDENTIAL_WORKSPACE_DIRECTORIES) {
      await fs.mkdir(path.join(temporary, relative), { recursive: true });
    }
    await writeExclusiveJson(path.join(temporary, 'workspace.json'), MANIFEST);
    try {
      await fs.rename(temporary, root);
      removeTemporary = false;
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      return readReadyWorkspace(root);
    }
    return readReadyWorkspace(root);
  } finally {
    if (removeTemporary) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
}

export async function readResidentialWorkspaceStatus(options) {
  const root = await validateResidentialWorkspaceRoot(
    options.root,
    options
  );
  if (!await safeLstat(root)) {
    return Object.freeze({
      state: 'not_initialized',
      root,
      directories: RESIDENTIAL_WORKSPACE_DIRECTORIES,
      counts: emptyCounts()
    });
  }
  const ready = await readReadyWorkspace(root);
  return Object.freeze({
    ...ready,
    counts: Object.freeze({
      inbox_batches: await countDirectories(path.join(root, 'inbox')),
      quarantined_cases: await countDirectories(path.join(root, 'quarantine')),
      source_profiles: await countJson(path.join(root, 'sources')),
      annotations: await countJson(path.join(root, 'annotations')),
      golden_reviews: await countJson(path.join(root, 'reviews', 'golden')),
      selective_reviews: await countJson(path.join(root, 'reviews', 'selective')),
      snapshots: await countDirectories(path.join(root, 'snapshots')),
      runs: await countDirectories(path.join(root, 'runs')),
      reports: await countJson(path.join(root, 'reports'))
    })
  });
}

async function readReadyWorkspace(root) {
  const entry = await safeLstat(root);
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    failContract('WORKSPACE_CONFLICT', 'workspace.root', root);
  }
  let manifest;
  try {
    const manifestPath = path.join(root, 'workspace.json');
    if ((await fs.lstat(manifestPath)).isSymbolicLink()) {
      failContract('WORKSPACE_CONFLICT', 'workspace.manifest', 'symlink');
    }
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code?.startsWith?.('WORKSPACE_')) throw error;
    failContract(
      'WORKSPACE_CONFLICT',
      'workspace.manifest',
      error?.message || 'unreadable manifest'
    );
  }
  if (
    JSON.stringify(manifest) !== JSON.stringify(MANIFEST)
  ) {
    failContract(
      'WORKSPACE_CONFLICT',
      'workspace.manifest',
      'manifest mismatch'
    );
  }
  for (const relative of RESIDENTIAL_WORKSPACE_DIRECTORIES) {
    const child = await safeLstat(path.join(root, relative));
    if (!child?.isDirectory() || child.isSymbolicLink()) {
      failContract('WORKSPACE_CONFLICT', `workspace.${relative}`, 'missing or unsafe');
    }
  }
  return Object.freeze({
    state: 'ready',
    root,
    directories: RESIDENTIAL_WORKSPACE_DIRECTORIES
  });
}

async function writeExclusiveJson(filePath, value) {
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function countJson(directory) {
  return countEntries(directory, (entry) => (
    entry.isFile() && entry.name.endsWith('.json')
  ));
}

async function countDirectories(directory) {
  return countEntries(directory, (entry) => entry.isDirectory());
}

async function countEntries(directory, accept) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => !entry.isSymbolicLink() && accept(entry)).length;
}

function emptyCounts() {
  return Object.freeze({
    inbox_batches: 0,
    quarantined_cases: 0,
    source_profiles: 0,
    annotations: 0,
    golden_reviews: 0,
    selective_reviews: 0,
    snapshots: 0,
    runs: 0,
    reports: 0
  });
}
```

- [ ] **Step 5: Add the workspace barrel**

Create `src/training/residential/workspace/index.js`:

```js
export {
  PROJECT_ROOT,
  resolveResidentialWorkspaceRoot,
  validateResidentialWorkspaceRoot
} from './paths.js';
export {
  initializeResidentialWorkspace,
  readResidentialWorkspaceStatus,
  RESIDENTIAL_WORKSPACE_DIRECTORIES
} from './workspace.js';
```

- [ ] **Step 6: Run workspace and contract tests**

Run:

```bash
node --test \
  test/residentialContractCore.test.js \
  test/residentialHouseSpec.test.js \
  test/residentialHouseScene.test.js \
  test/residentialSourceReviewContracts.test.js \
  test/residentialWorkspace.test.js
```

Expected: PASS, 20 tests.

- [ ] **Step 7: Commit the local workspace**

```bash
git add src/training/residential/workspace/paths.js \
  src/training/residential/workspace/workspace.js \
  src/training/residential/workspace/index.js \
  test/residentialWorkspace.test.js
git commit -m "feat(residential): initialize local workspace"
```

---

### Task 6: Workspace CLI, package command, and ignore boundary

**Files:**

- Create: `src/runResidentialWorkspace.js`
- Create: `test/residentialWorkspaceCli.test.js`
- Modify: `package.json:6-31`
- Modify: `.gitignore:1-22`

**Interfaces:**

- Consumes: Task 5 workspace API
- Produces: `parseResidentialWorkspaceArgs(argv, { cwd? })`
- Produces: `main(argv?)`
- Produces command: `npm run residential:workspace -- init`
- Produces command: `npm run residential:workspace -- status`
- Guarantees: no unknown/duplicate/missing options, stable stdout, stable error codes, no new `training:*` command

- [ ] **Step 1: Write failing CLI and policy tests**

Create `test/residentialWorkspaceCli.test.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  parseResidentialWorkspaceArgs
} from '../src/runResidentialWorkspace.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(ROOT, 'src', 'runResidentialWorkspace.js');

test('residential workspace parser accepts init and status only', () => {
  assert.equal(
    parseResidentialWorkspaceArgs(['init'], { cwd: ROOT }).command,
    'init'
  );
  assert.equal(
    parseResidentialWorkspaceArgs(['status'], { cwd: ROOT }).command,
    'status'
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['train'], { cwd: ROOT }),
    /ARGUMENT_COMMAND_INVALID/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['status', '--unknown', 'x'], { cwd: ROOT }),
    /ARGUMENT_UNKNOWN/u
  );
});

test('residential workspace CLI initializes and reports a fixture project', async (t) => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-cli-project-')
  );
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');

  const initialized = runCli(['init', '--root', root], {
    RESIDENTIAL_PROJECT_ROOT: projectRoot
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.match(initialized.stdout, /^workspace_status=ready$/mu);
  assert.match(initialized.stdout, /source_profiles=0/u);

  const status = runCli(['status', '--root', root], {
    RESIDENTIAL_PROJECT_ROOT: projectRoot
  });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout, initialized.stdout);
});

test('package exposes a non-training workspace command and ignores local data', async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')
  );
  const ignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  assert.equal(
    packageJson.scripts['residential:workspace'],
    'node src/runResidentialWorkspace.js'
  );
  assert.match(ignore, /^\.local\/residential-model\/$/mu);
  assert.deepEqual(
    Object.keys(packageJson.scripts)
      .filter((name) => name.startsWith('training:'))
      .sort(),
    [
      'training:evaluate',
      'training:prepare',
      'training:status',
      'training:train'
    ]
  );
});

function runCli(args, environment = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...environment }
  });
}
```

- [ ] **Step 2: Run the CLI test and verify the runner is missing**

Run:

```bash
node --test test/residentialWorkspaceCli.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/runResidentialWorkspace.js`.

- [ ] **Step 3: Implement the CLI**

Create `src/runResidentialWorkspace.js`:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrainingDataError } from './training/trainingError.js';
import {
  initializeResidentialWorkspace,
  readResidentialWorkspaceStatus,
  resolveResidentialWorkspaceRoot
} from './training/residential/workspace/index.js';

const COMMANDS = new Set(['init', 'status']);
const OPTIONS = new Set(['--root']);

export function parseResidentialWorkspaceArgs(
  argv,
  { cwd = process.cwd() } = {}
) {
  const command = argv[0];
  if (!COMMANDS.has(command)) fail('ARGUMENT_COMMAND_INVALID', command);
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!OPTIONS.has(flag)) fail('ARGUMENT_UNKNOWN', flag);
    if (Object.hasOwn(values, flag)) fail('ARGUMENT_DUPLICATE', flag);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail('ARGUMENT_VALUE_MISSING', flag);
    }
    values[flag] = value;
    index += 1;
  }
  return Object.freeze({
    command,
    root: resolveResidentialWorkspaceRoot(
      values['--root'] ?? '.local/residential-model',
      { cwd }
    )
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseResidentialWorkspaceArgs(argv);
  const projectRoot = process.env.RESIDENTIAL_PROJECT_ROOT
    ? path.resolve(process.env.RESIDENTIAL_PROJECT_ROOT)
    : path.resolve(import.meta.dirname, '..');
  const status = options.command === 'init'
    ? await initializeResidentialWorkspace({
      root: options.root,
      projectRoot
    })
    : await readResidentialWorkspaceStatus({
      root: options.root,
      projectRoot
    });
  const counts = status.counts ?? {
    inbox_batches: 0,
    quarantined_cases: 0,
    source_profiles: 0,
    annotations: 0,
    golden_reviews: 0,
    selective_reviews: 0,
    snapshots: 0,
    runs: 0,
    reports: 0
  };
  process.stdout.write([
    `workspace_status=${status.state}`,
    `root=${status.root}`,
    ...Object.entries(counts).map(([name, count]) => `${name}=${count}`)
  ].join('\n') + '\n');
}

function fail(code, detail) {
  throw new TrainingDataError(code, String(detail));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const code = error?.code || 'RESIDENTIAL_WORKSPACE_FAILED';
    const detail = error?.detail || error?.message || String(error);
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Add the package command and ignore root**

In `package.json`, add this script immediately before `training:prepare`:

```json
"residential:workspace": "node src/runResidentialWorkspace.js",
```

In `.gitignore`, add:

```gitignore
# Local residential renderer sources, annotations, datasets, and model evidence
.local/residential-model/
```

- [ ] **Step 5: Run the CLI test**

Run:

```bash
node --test test/residentialWorkspaceCli.test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Verify real default status is read-only**

Run:

```bash
npm run residential:workspace -- status
```

Expected when no root exists:

```text
workspace_status=not_initialized
root=<repository>/.local/residential-model
inbox_batches=0
quarantined_cases=0
source_profiles=0
annotations=0
golden_reviews=0
selective_reviews=0
snapshots=0
runs=0
reports=0
```

Do not run `init` against a real existing `.local/residential-model` until its exact target has been inspected. The automated test already proves initialization in an isolated project root.

- [ ] **Step 7: Commit CLI and ignore policy**

```bash
git add src/runResidentialWorkspace.js \
  test/residentialWorkspaceCli.test.js \
  package.json \
  .gitignore
git commit -m "feat(residential): expose workspace command"
```

---

### Task 7: Current documentation, policy coverage, and R1 verification

**Files:**

- Create: `docs/residential-model/README.md`
- Modify: `README.md:1-80`
- Modify: `docs/architecture.md:1-90`
- Modify: `test/docsProjectStatus.test.js:1-18`

**Interfaces:**

- Consumes: all prior R1 commands and contracts
- Produces: current user-facing foundation status and command documentation
- Guarantees: documents say R1 is foundation only; no claim of a trained/integrated residential model; existing production and local completion truth remains intact

- [ ] **Step 1: Add failing current-document tests**

Extend `test/docsProjectStatus.test.js`:

```js
test('project docs describe the residential renderer as a foundation only', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const residential = read('docs/residential-model/README.md');
  assert.match(readme, /Residential learned renderer/iu);
  assert.match(readme, /contracts and local workspace/iu);
  assert.match(architecture, /does not change production generation/iu);
  assert.match(residential, /npm run residential:workspace -- status/u);
  assert.match(residential, /R1/u);
  assert.match(residential, /not a trained model/iu);
});
```

- [ ] **Step 2: Run the documentation test and verify it fails**

Run:

```bash
node --test test/docsProjectStatus.test.js
```

Expected: FAIL because `docs/residential-model/README.md` does not exist and current docs lack the R1 text.

- [ ] **Step 3: Write the R1 residential-model README**

Create `docs/residential-model/README.md`:

```markdown
# Residential Learned Renderer

The residential learned renderer is a planned two-stage `HouseSpec -> HouseScene` system. Its long-term role is to learn whole-house structure and room-aware decoration while deterministic code validates Minecraft legality, usability, bounded repairs, and datapack export.

Current implementation status is R1: contracts and local workspace. R1 is not a trained model, source-ingestion pipeline, dataset, checkpoint, or production provider.

## Current commands

Inspect status without creating or changing the local workspace:

```bash
npm run residential:workspace -- status
```

Initialize the exact ignored local root when it does not already exist:

```bash
npm run residential:workspace -- init
```

The root is `.local/residential-model/`. Real houses, source profiles, annotations, reviews, snapshots, runs, and reports remain local and ignored.

## Contracts

R1 defines strict version-one contracts for:

- HouseSpec semantic input;
- HouseScene learned output;
- SourceProfile provenance and state;
- golden/selective/audit review records; and
- the deterministic workspace manifest.

The full approved program design is [design.md](design.md). Later work proceeds through separate gated implementation plans. R2 source intake and R6 model infrastructure are outside R1.
```

- [ ] **Step 4: Add truthful top-level documentation**

Add this section after the current-status list in `README.md`:

```markdown
## Residential learned renderer

The approved next-generation direction is a residential `HouseSpec -> HouseScene` learned renderer with separate structure and room-decoration stages. Its current implementation scope is contracts and local workspace only; it is not trained or connected to production. See [the residential renderer design](docs/residential-model/design.md).
```

Add this section before `## Ownership boundaries` in `docs/architecture.md`:

```markdown
## Residential renderer foundation

The approved residential renderer program will eventually learn whole-house structure and room-aware decoration from paired HouseSpec/HouseScene data. R1 establishes only versioned contracts and an ignored local workspace. It does not change production generation, activate a model, process real sources, or alter the current Stage 7 completion baseline.
```

- [ ] **Step 5: Run documentation and policy tests**

Run:

```bash
node --test \
  test/docsProjectStatus.test.js \
  test/projectPolicy.test.js
```

Expected: PASS. When the sandbox blocks `projectPolicy.test.js` from spawning `git`, rerun the same command with the repository's normal approved test execution rather than editing or weakening the test.

- [ ] **Step 6: Run the complete Node suite**

Run:

```bash
npm test
```

Expected: PASS with zero failures.

- [ ] **Step 7: Verify the supported command policy**

Run:

```bash
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts).filter(k=>k.startsWith('training:')).sort().join('\\n'))"
```

Expected exactly:

```text
training:evaluate
training:prepare
training:status
training:train
```

- [ ] **Step 8: Verify no real residential artifacts are tracked**

Run:

```bash
git ls-files '.local/residential-model/**'
```

Expected: no output.

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended R1 documentation/test changes remain before the final commit.

- [ ] **Step 9: Commit R1 documentation**

```bash
git add docs/residential-model/README.md \
  README.md \
  docs/architecture.md \
  test/docsProjectStatus.test.js
git commit -m "docs(residential): record R1 foundation"
```

- [ ] **Step 10: Final R1 evidence capture**

Run:

```bash
git status --short
npm test
npm run residential:workspace -- status
```

Expected:

- clean working tree;
- complete Node suite passes;
- status command reports either `not_initialized` with zero counts or an already valid `ready` workspace without changing it; and
- no source intake, annotation, dataset, Python model, training, or production-integration artifact exists.

---

## Plan Self-Review Checklist

Before execution handoff, verify:

- Every master-design R1 deliverable maps to Tasks 1-7.
- No task implements R2 source discovery/parsing or R6 model/training code.
- Public names are consistent: `HouseSpec`, `HouseScene`, `SourceProfile`, `ReviewRecord`, `residential:workspace`, `.local/residential-model/`.
- All document sources and versions are fixed at v1.
- The HouseSpec has no coordinate field.
- The HouseScene uses fixed `64^3` grids and sparse object instances.
- The SourceProfile supports only `.schem`, `.schematic`, and vanilla structure NBT identifiers in R1.
- Workspace initialization is deterministic and never repairs an existing conflict.
- The status path is read-only.
- Existing `training:*` command count remains exactly four.
- No placeholder instruction, unspecified error handling, or unnamed test remains.
