# Training Pipeline Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a four-command local voxel-training workflow that prepares all 64 local templates, learns non-air structure with a balanced two-head objective, reports complete metrics, and removes the remaining private-research/fixture-only workflow.

**Architecture:** Node.js owns schematic discovery, categorical voxel preparation, deduplication, source-level splitting, patch extraction, and canonical dataset artifacts. PyTorch owns data loading, balanced masking, a small occupancy-plus-semantics completion model, checkpoint/resume, evaluation, and the two progress gates. New artifacts live only below `.local/training/`.

**Tech Stack:** Node.js 20+ ESM, `node:test`, Python 3.12, NumPy 2.5.1, PyTorch 2.13, pytest, Conda environment `mcagent-stage7`.

## Global Constraints

- All 64 existing local templates are eligible for local training without per-file approval.
- No command accepts or checks Dataset v1/v2/v3, R1/R2/R3, human review, owner acknowledgement, `ready_for_m3_real_data`, or `training_eligible_count`.
- New local artifacts write only below `.local/training/`.
- Do not delete, modify, move, publish, or expose existing ignored artifacts below `.local/stage7-private-research/` or `.local/stage7-source-expansion/`.
- Split source buildings before patch extraction and augmentation.
- Use categorical tokens `0..8`, where `0` is air and `1..8` are non-air material families.
- Whole-building shape is `64 x 64 x 64`.
- Training patch shape is `32 x 32 x 32` with stride 16.
- Use a deterministic 70/15/15 source-building split with seed 7101 by default.
- Gate 1 uses four deterministic training patches and requires supported non-air macro-F1 `>= 0.90`.
- Gate 2 requires supported non-air macro-F1 `>= 0.20`, macro-IoU `>= 0.10`, strict improvement over both baselines, and predicted non-air fraction within `0.5..2.0` times the target fraction.
- The learned model remains outside primary Minecraft generation.
- Keep Node.js `>=20`, Minecraft Java 1.21/1.21.1, and datapack `pack_format: 48`.
- Before editing, run `git fetch origin`, compare `HEAD` with `origin/main`, and stop rather than overwriting unrelated changes.

---

### Task 1: Extract Reusable NBT and Fingerprint Mechanics

**Files:**
- Create: `src/training/trainingError.js`
- Move: `src/construction/learning/stage7BoundedNbt.js` -> `src/training/boundedNbt.js`
- Move: `src/construction/learning/stage7VanillaStructureNbt.js` -> `src/training/vanillaStructureNbt.js`
- Move: `src/construction/learning/stage7ConditionalVoxelPreparation.js` -> `src/training/structureVolumePreparation.js`
- Move: `src/construction/learning/stage7ConditionalFingerprint.js` -> `src/training/structuralFingerprint.js`
- Move: `test/stage7BoundedNbt.test.js` -> `test/trainingBoundedNbt.test.js`
- Move: `test/stage7VanillaStructureNbt.test.js` -> `test/trainingVanillaStructureNbt.test.js`
- Move: `test/stage7ConditionalVoxelPreparation.test.js` -> `test/trainingStructureVolumePreparation.test.js`
- Move: `test/stage7ConditionalFingerprint.test.js` -> `test/trainingStructuralFingerprint.test.js`
- Delete: `src/construction/learning/stage7CandidateBoundary.js`
- Delete: `src/construction/learning/stage7SourceExpansionBoundary.js`
- Delete: `src/construction/learning/stage7SourceExpansionContracts.js`
- Delete: `test/stage7CandidateBoundary.test.js`
- Delete: `test/stage7SourceExpansionContracts.test.js`

**Interfaces:**
- Consumes: `Buffer` NBT payloads and categorical `Uint8Array`/`Buffer` volumes.
- Produces: `TrainingDataError`, `decodeBoundedNbt`, `validateVanillaStructureNbt`, `prepareStructureVolume`, `fingerprintCategoricalEntries`, and `compareFingerprints`.

- [ ] **Step 1: Write the failing decoupling tests**

Add assertions to the moved tests that errors use the new neutral type:

```js
import { TrainingDataError } from '../src/training/trainingError.js';

assert.throws(
  () => decodeBoundedNbt(Buffer.alloc(0), { sourceId: 'fixture' }),
  (error) => error instanceof TrainingDataError && error.code === 'NBT_ROOT_INVALID'
);
```

Change fixture options and record fields from `candidateId`/`candidate_id` to `sourceId`/`source_id`. Add an oversized categorical-entry fixture and prove fingerprinting accepts extents above 64. Assert fingerprints do not contain `authorizes_acquisition`, `authorizes_training`, `authorizes_dataset_admission`, or `synthetic_only`.

- [ ] **Step 2: Run the moved focused tests to verify RED**

Run:

```bash
node --test test/trainingBoundedNbt.test.js test/trainingVanillaStructureNbt.test.js test/trainingStructureVolumePreparation.test.js test/trainingStructuralFingerprint.test.js
```

Expected: FAIL because the neutral modules and error type do not exist.

- [ ] **Step 3: Implement the neutral error and interfaces**

Create:

```js
export class TrainingDataError extends Error {
  constructor(code, detail, metadata = {}) {
    super(`${code}: ${detail}`);
    this.name = 'TrainingDataError';
    this.code = code;
    this.detail = String(detail);
    this.metadata = Object.freeze({ ...metadata });
  }
}

export function assertSourceId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(value)) {
    throw new TrainingDataError('SOURCE_ID_INVALID', String(value));
  }
  return value;
}
```

Move the four modules and replace governance imports with `TrainingDataError` and `assertSourceId`. Rename public versions to:

```js
export const BOUNDED_NBT_VERSION = 'bounded-nbt-v1';
export const VANILLA_STRUCTURE_ADAPTER_VERSION = 'java-structure-nbt-v1';
export const STRUCTURE_PREPARATION_VERSION = 'categorical-structure-volume-v1';
export const STRUCTURAL_FINGERPRINT_VERSION = 'categorical-structural-fingerprint-v1';
```

`prepareStructureVolume` returns:

```js
{
  record: {
    source_id,
    content_sha256,
    preparation_version: STRUCTURE_PREPARATION_VERSION,
    shape: [64, 64, 64],
    non_air_count,
    token_counts
  },
  voxels
}
```

Generalize fingerprint input so schematic and Java Structure sources share the same implementation:

```js
fingerprintCategoricalEntries({
  sourceId,
  contentSha256,
  extent: { x, y, z },
  entries: [{ x, y, z, token }]
})
```

Encode extents and coordinates as unsigned 16-bit big-endian integers before hashing so oversized buildings are supported. Canonicalize four yaw views and return raw-content, canonical-structure, occupancy-minhash, and material-minhash fields without governance flags.

- [ ] **Step 4: Run the focused tests**

Run the command from Step 2.

Expected: all four files pass.

- [ ] **Step 5: Delete the transitional governance dependencies**

Delete the three production dependencies and two tests listed in this task. Verify no source import references them:

```bash
rg -n "stage7CandidateBoundary|stage7SourceExpansionBoundary|stage7SourceExpansionContracts" src test
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add src test
git commit -m "refactor: extract reusable training data mechanics"
```

---

### Task 2: Define the Training Taxonomy and Source Catalog

**Files:**
- Create: `src/training/tokenTaxonomy.js`
- Create: `src/training/sourceCatalog.js`
- Create: `test/trainingSourceCatalog.test.js`

**Interfaces:**
- Consumes: a source root containing `.schematic` or `.schem` files and `decodeSchematicBlockVolume(buffer)`.
- Produces: `mapTrainingToken(block): number` and `catalogTrainingSources({ sourceRoot }): Promise<{ accepted, rejected }>`.

- [ ] **Step 1: Write failing taxonomy and catalog tests**

Create generated schematic fixtures in an operating-system temporary directory and assert:

```js
test('catalog considers every tracked local schematic', async () => {
  const result = await catalogTrainingSources({ sourceRoot: path.join(ROOT, 'mc_templates') });
  assert.equal(result.accepted.length + result.rejected.length, 64);
});

test('taxonomy maps air to zero and every solid category to 1..8', () => {
  assert.equal(mapTrainingToken({ air: true, category: 'air' }), 0);
  for (const category of ['earth', 'rock', 'wood', 'glass', 'stair', 'decor', 'water', 'other']) {
    assert.ok(mapTrainingToken({ air: false, category }) >= 1);
  }
});
```

Also assert unsupported extensions are ignored, corrupt schematic files appear in `rejected` with `SOURCE_MALFORMED`, and duplicate bytes receive the same `content_sha256`.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
node --test test/trainingSourceCatalog.test.js
```

Expected: FAIL with missing module exports.

- [ ] **Step 3: Implement the nine-token taxonomy**

```js
export const TOKEN_NAMES = Object.freeze([
  'air', 'earth', 'rock', 'wood', 'glass',
  'architectural-shape', 'detail', 'water', 'other'
]);

export function mapTrainingToken(block) {
  if (block.air) return 0;
  if (block.category === 'earth') return 1;
  if (block.category === 'rock') return 2;
  if (block.category === 'wood') return 3;
  if (block.category === 'glass') return 4;
  if (block.category === 'stair' || block.category === 'slab') return 5;
  if (['light', 'fence', 'opening', 'decor', 'vegetation'].includes(block.category)) return 6;
  if (block.category === 'water') return 7;
  return 8;
}
```

- [ ] **Step 4: Implement recursive source cataloging**

`catalogTrainingSources` must:

1. resolve and validate a real directory;
2. recursively list `.schematic` and `.schem` regular files in relative-path order;
3. reject symlinks;
4. cap raw bytes at 64 MiB and inflated bytes at 128 MiB;
5. decode with `decodeSchematicBlockVolume`;
6. calculate SHA-256 and occupied bounds; and
7. return deeply frozen accepted/rejected records without writing.

Accepted records use:

```js
{
  source_id: `source-${createHash('sha256').update(relative_path).digest('hex').slice(0, 16)}`,
  relative_path,
  content_sha256: sha256,
  format: volume.format,
  dimensions: { x: volume.width, y: volume.height, z: volume.length },
  occupied_bounds,
  token_counts,
  structural_fingerprint
}
```

Derive `source_id` from SHA-256 of the normalized relative path so byte-identical files remain separate source records and can be grouped as duplicates. Build categorical tight entries while measuring bounds and call `fingerprintCategoricalEntries`; two byte-identical sources must share `content_sha256` but have distinct `source_id` values.

- [ ] **Step 5: Run the tests**

Run the command from Step 2.

Expected: all tests pass and the repository integration assertion reports 64 considered templates.

- [ ] **Step 6: Commit**

```bash
git add src/training test/trainingSourceCatalog.test.js
git commit -m "feat: catalog local training sources"
```

---

### Task 3: Prepare Whole Volumes and Overlapping Patches

**Files:**
- Create: `src/training/volumePreparation.js`
- Create: `test/trainingVolumePreparation.test.js`

**Interfaces:**
- Consumes: a decoded schematic volume, accepted source record, patch size 32, and stride 16.
- Produces: `prepareTrainingVolume({ source, volume }): { whole, patches, report }`.

- [ ] **Step 1: Write failing geometry tests**

Cover:

```js
assert.deepEqual(result.whole.shape, [64, 64, 64]);
assert.ok(result.patches.every((patch) => patch.shape.join(',') === '32,32,32'));
assert.ok(result.patches.every((patch) => patch.non_air_count > 0));
assert.equal(new Set(result.patches.map((patch) => patch.sample_id)).size, result.patches.length);
```

Use synthetic occupied bounds of `20x10x20`, exactly `64x64x64`, and `80x40x80`. Assert the first two produce a centered whole volume, the oversized source has `whole === null`, patch origins advance by 16, boundary origins include `extent - 32`, and every occupied voxel is covered by at least one patch.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
node --test test/trainingVolumePreparation.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement deterministic preparation**

Implement these constants and interface:

```js
export const WHOLE_SIZE = 64;
export const PATCH_SIZE = 32;
export const PATCH_STRIDE = 16;
export const PREPARATION_VERSION = 'training-voxel-preparation-v1';

export function axisOrigins(extent, size = PATCH_SIZE, stride = PATCH_STRIDE) {
  if (extent <= size) return [0];
  const values = [];
  for (let value = 0; value + size < extent; value += stride) values.push(value);
  values.push(extent - size);
  return [...new Set(values)].sort((a, b) => a - b);
}
```

Rasterize occupied bounds once into a tight categorical buffer. Center it into `64^3` when all extents fit. Extract each `32^3` patch from the tight buffer with zero padding only where an extent is smaller than 32. Reject empty patches. Compute each `sample_id` from source hash, origin, shape, and preparation version.

- [ ] **Step 4: Run the tests**

Run the command from Step 2.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/training/volumePreparation.js test/trainingVolumePreparation.test.js
git commit -m "feat: prepare whole volumes and structural patches"
```

---

### Task 4: Deduplicate and Split Before Derivatives

**Files:**
- Create: `src/training/sourceSplit.js`
- Create: `test/trainingSourceSplit.test.js`

**Interfaces:**
- Consumes: source records with raw and structural fingerprints.
- Produces: `buildSourceSplit({ sources, seed }): { train_source_ids, validation_source_ids, test_source_ids, assignments }`.

- [ ] **Step 1: Write failing split tests**

Assert:

```js
assert.deepEqual(buildSourceSplit({ sources, seed: 7101 }), buildSourceSplit({ sources, seed: 7101 }));
assert.equal(new Set(Object.keys(split.assignments)).size, sources.length);
assertNoOverlap(split.train_source_ids, split.validation_source_ids, split.test_source_ids);
assertDuplicateGroupsStayTogether(sources, split.assignments);
```

For 64 unique sources, assert counts `45/10/9`. For fewer than three duplicate groups, assert `SPLIT_TOO_SMALL`.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
node --test test/trainingSourceSplit.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement source-group splitting**

Group exact-byte and structural duplicates first. Sort groups by:

```js
createHash('sha256').update(`${seed}:${group.canonical_source_id}`).digest('hex')
```

Allocate target source counts with largest remainder:

```js
const targets = { train: 45, validation: 10, test: 9 };
```

For non-64 fixtures, calculate `0.70/0.15/0.15`, floor each value, distribute remaining sources by descending fractional remainder with validation winning the validation/test tie, and guarantee at least one group per split. Assign a whole duplicate group to the split with the largest remaining target.

- [ ] **Step 4: Run the tests**

Run the command from Step 2.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/training/sourceSplit.js test/trainingSourceSplit.test.js
git commit -m "feat: split training data by source building"
```

---

### Task 5: Write the Dataset and `training:prepare` CLI

**Files:**
- Create: `src/training/trainingDatasetWriter.js`
- Create: `src/runTrainingPrepare.js`
- Create: `test/trainingDatasetWriter.test.js`
- Create: `test/trainingPrepareCli.test.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `--source-root`, `--output-root`, and `--seed`.
- Produces: `.local/training/dataset/manifest.json`, sample binaries, `splits/split.json`, and `reports/preparation.json`.

- [ ] **Step 1: Write failing writer and CLI tests**

Use temporary roots and assert the exact inventory:

```text
dataset/manifest.json
dataset/samples/{sample_id}.bin
dataset/whole/{source_id}.bin
splits/split.json
reports/preparation.json
```

Assert every sample binary is exactly `32 ** 3` bytes, whole binaries are `64 ** 3` bytes, all derivatives use their source assignment, corrupt sources appear in `reports/preparation.json`, and rerunning produces byte-identical JSON and binaries.

CLI parsing must reject unknown flags, a tracked output root, output outside `.local/training`, and a non-integer seed.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
node --test test/trainingDatasetWriter.test.js test/trainingPrepareCli.test.js
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement canonical dataset writing**

The function must:

1. catalog and fingerprint every source;
2. build duplicate groups and the source split;
3. only then call `prepareTrainingVolume` for each accepted source;
4. attach the precomputed source assignment to every whole sample and patch; and
5. write artifacts.

It must never use a prepared patch to decide a split. Export:

```js
export async function writeTrainingDataset({
  sourceRoot,
  outputRoot,
  seed = 7101
}) {}
```

Write into a sibling temporary directory, fsync files, atomically rename the completed directory, and refuse to overwrite an existing non-identical dataset. JSON uses recursively sorted object keys and a trailing newline. The manifest includes:

```js
{
  source: 'minecraft-architecture-training-dataset-v1',
  preparation_version: PREPARATION_VERSION,
  token_names: TOKEN_NAMES,
  patch_shape: [32, 32, 32],
  patch_stride: 16,
  seed,
  sources,
  samples
}
```

- [ ] **Step 4: Implement strict CLI parsing**

`src/runTrainingPrepare.js` accepts:

```text
--source-root PATH      default mc_templates
--output-root PATH      default .local/training
--seed UINT32           default 7101
```

Print accepted/rejected sources, whole/patch counts, split counts, and the report path. Do not print source contents.

- [ ] **Step 5: Add package and ignore entries**

Add:

```json
"training:prepare": "node src/runTrainingPrepare.js"
```

Ensure `.gitignore` contains:

```gitignore
.local/training/
```

- [ ] **Step 6: Run tests and a real dry preparation**

Run:

```bash
node --test test/trainingDatasetWriter.test.js test/trainingPrepareCli.test.js
npm run training:prepare -- --source-root mc_templates --output-root .local/training --seed 7101
```

Expected: tests pass; preparation considers 64 sources and writes only below `.local/training/`.

- [ ] **Step 7: Commit**

```bash
git add src/training src/runTrainingPrepare.js test package.json .gitignore
git commit -m "feat: add automatic training dataset preparation"
```

---

### Task 6: Load Patches and Build Balanced Masks

**Files:**
- Create: `training/stage7/mcagent_stage7/training_data.py`
- Create: `training/stage7/tests/test_training_data.py`

**Interfaces:**
- Consumes: the Node-written manifest, split, and `32^3` sample binaries.
- Produces: `TrainingError`, `TrainingPatchDataset`, and `make_balanced_mask(targets, seed, ratio=0.25)`.

- [ ] **Step 1: Write failing dataset tests**

Assert:

```python
dataset = TrainingPatchDataset(root, split="train", seed=7101)
target = dataset[0]
assert target.dtype == torch.long
assert target.shape == (32, 32, 32)
visible, mask = make_balanced_mask(target.unsqueeze(0), seed=7101)
assert visible.shape == target.unsqueeze(0).shape
assert mask.dtype == torch.bool
assert torch.any(mask & (target.unsqueeze(0) == 0))
assert torch.any(mask & (target.unsqueeze(0) != 0))
```

Also reject path escape, wrong byte length, hash mismatch, split leakage, missing non-air supervision, and token values outside `0..8`.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_training_data.py
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the dataset**

Use:

```python
PATCH_SHAPE = (32, 32, 32)
TOKEN_COUNT = 9
MASK_TOKEN = 9

class TrainingError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code

class TrainingPatchDataset(Dataset[torch.Tensor]):
    def __init__(self, root: Path, split: str, seed: int = 7101) -> None:
        ...

    def __getitem__(self, index: int) -> torch.Tensor:
        values = np.frombuffer(path.read_bytes(), dtype=np.uint8).copy()
        return torch.from_numpy(values.reshape(PATCH_SHAPE)).long()
```

Validate the manifest source/version, sample hashes, exact split membership, and that no `source_id` appears in multiple splits.

- [ ] **Step 4: Implement balanced masking**

For each batch item, select `ceil(ratio * numel / 2)` deterministic air positions and the same number of deterministic non-air positions, capped by available positions. Always select at least one of each. Replace selected positions with token 9.

- [ ] **Step 5: Run tests**

Run the command from Step 2.

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add training/stage7/mcagent_stage7/training_data.py training/stage7/tests/test_training_data.py
git commit -m "feat: load patches with balanced masking"
```

---

### Task 7: Implement the Two-Head Completion Model

**Files:**
- Create: `training/stage7/mcagent_stage7/voxel_model.py`
- Create: `training/stage7/tests/test_voxel_model.py`

**Interfaces:**
- Consumes: visible token tensor `[B,32,32,32]`, targets, and a boolean mask.
- Produces: `VoxelModelOutput`, `VoxelLoss`, `TinyVoxelCompletionModel`, `voxel_loss`, and `predict_tokens`.

- [ ] **Step 1: Write failing shape, loss, and anti-collapse tests**

Assert:

```python
model = TinyVoxelCompletionModel()
output = model(visible)
assert output.occupancy_logits.shape == (2, 2, 32, 32, 32)
assert output.semantic_logits.shape == (2, 8, 32, 32, 32)
loss = voxel_loss(output, targets, mask)
assert torch.isfinite(loss.total)
assert torch.isfinite(loss.occupancy)
assert torch.isfinite(loss.semantic)
```

Construct logits that predict air everywhere and assert semantic loss remains nonzero and `predict_tokens` returns all air only when the occupancy head selects air.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_voxel_model.py
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the model**

Use this fixed topology:

```python
class TinyVoxelCompletionModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.embedding = nn.Embedding(10, 8)
        self.encoder = nn.Sequential(
            nn.Conv3d(8, 16, 3, stride=2, padding=1), nn.SiLU(),
            nn.Conv3d(16, 24, 3, stride=2, padding=1), nn.SiLU(),
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose3d(24, 16, 4, stride=2, padding=1), nn.SiLU(),
            nn.ConvTranspose3d(16, 12, 4, stride=2, padding=1), nn.SiLU(),
        )
        self.occupancy_head = nn.Conv3d(12, 2, 1)
        self.semantic_head = nn.Conv3d(12, 8, 1)

    def forward(self, visible: torch.Tensor) -> VoxelModelOutput:
        features = self.embedding(visible).permute(0, 4, 1, 2, 3)
        decoded = self.decoder(self.encoder(features))
        return VoxelModelOutput(
            occupancy_logits=self.occupancy_head(decoded),
            semantic_logits=self.semantic_head(decoded),
        )
```

- [ ] **Step 4: Implement the coupled loss**

```python
selected = mask
occupancy_targets = (targets != 0).long()
occupancy = F.cross_entropy(
    output.occupancy_logits.permute(0, 2, 3, 4, 1)[selected],
    occupancy_targets[selected],
)
semantic_selected = selected & (targets != 0)
if not bool(semantic_selected.any()):
    raise TrainingError("SEMANTIC_SUPERVISION_EMPTY", "mask")
semantic = F.cross_entropy(
    output.semantic_logits.permute(0, 2, 3, 4, 1)[semantic_selected],
    targets[semantic_selected] - 1,
)
total = occupancy + semantic
```

Reject non-finite components. `predict_tokens` uses the occupancy argmax and fills non-air positions with semantic argmax plus one.

- [ ] **Step 5: Run tests**

Run the command from Step 2.

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add training/stage7/mcagent_stage7/voxel_model.py training/stage7/tests/test_voxel_model.py
git commit -m "feat: add balanced voxel completion model"
```

---

### Task 8: Implement Complete Metrics and Progress Gates

**Files:**
- Create: `training/stage7/mcagent_stage7/training_metrics.py`
- Create: `training/stage7/tests/test_training_metrics.py`

**Interfaces:**
- Consumes: target/prediction tensors and loss sums.
- Produces: `MetricAccumulator.summary()`, `build_baselines`, `gate1_result`, and `gate2_result`.

- [ ] **Step 1: Write failing metric tests**

Use exact hand-calculated tensors and assert occupancy precision/recall/F1/IoU, per-class values, supported non-air macro values, confusion matrices, target/predicted non-air fractions, and finite loss averages.

Assert:

```python
assert gate1_result({"non_air_macro_f1": 0.90})["passed"] is True
assert gate1_result({"non_air_macro_f1": 0.899})["passed"] is False
assert gate2_result(trained, untrained, prior)["passed"] is True
```

Add a failure case for all-air trained predictions.

- [ ] **Step 2: Run to verify RED**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_training_metrics.py
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement metric accumulation**

Maintain a `9x9` semantic confusion matrix and a `2x2` occupancy confusion matrix. Report for occupancy and each supported class:

```python
precision = tp / (tp + fp) if tp + fp else 0.0
recall = tp / (tp + fn) if tp + fn else 0.0
f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0
iou = tp / (tp + fp + fn) if tp + fp + fn else 0.0
```

Macro values include supported target classes `1..8` only.

- [ ] **Step 4: Implement the exact gates**

```python
def gate1_result(metrics):
    return {"passed": metrics["non_air_macro_f1"] >= 0.90}

def gate2_result(trained, untrained, class_prior):
    ratio = trained["predicted_non_air_fraction"] / trained["target_non_air_fraction"]
    checks = {
        "f1_minimum": trained["non_air_macro_f1"] >= 0.20,
        "iou_minimum": trained["non_air_macro_iou"] >= 0.10,
        "f1_beats_untrained": trained["non_air_macro_f1"] > untrained["non_air_macro_f1"],
        "f1_beats_prior": trained["non_air_macro_f1"] > class_prior["non_air_macro_f1"],
        "iou_beats_untrained": trained["non_air_macro_iou"] > untrained["non_air_macro_iou"],
        "iou_beats_prior": trained["non_air_macro_iou"] > class_prior["non_air_macro_iou"],
        "non_air_fraction": 0.5 <= ratio <= 2.0,
    }
    return {**checks, "passed": all(checks.values())}
```

If target non-air fraction is zero, raise `EVALUATION_NO_NON_AIR_SUPPORT`.

- [ ] **Step 5: Run tests**

Run the command from Step 2.

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add training/stage7/mcagent_stage7/training_metrics.py training/stage7/tests/test_training_metrics.py
git commit -m "feat: report voxel learning metrics and gates"
```

---

### Task 9: Add Checkpointed Training, Evaluation, and Status

**Files:**
- Create: `training/stage7/mcagent_stage7/training_checkpoint.py`
- Create: `training/stage7/mcagent_stage7/training_loop.py`
- Create: `training/stage7/mcagent_stage7/train.py`
- Create: `training/stage7/mcagent_stage7/evaluate.py`
- Create: `training/stage7/mcagent_stage7/status.py`
- Create: `training/stage7/tests/test_training_checkpoint.py`
- Create: `training/stage7/tests/test_training_loop.py`
- Create: `training/stage7/tests/test_training_commands.py`
- Modify: `package.json`

**Interfaces:**
- Consumes: `.local/training`, run ID, seed, device, steps, batch size, and learning rate.
- Produces: atomic checkpoints, metrics JSONL, `gate1.json`, `evaluation.json`, reconstruction binaries, and four supported npm commands.

- [ ] **Step 1: Write failing checkpoint/resume tests**

Train a generated temporary dataset for three steps, interrupt after step two, resume, and assert optimizer steps are exactly `[1,2,3]`. Assert checkpoint loading uses `torch.load(..., weights_only=True)`, checks dataset/split hashes, and rejects NaN weights, wrong shapes, and path escape.

- [ ] **Step 2: Write failing command tests**

Assert:

```text
python -m mcagent_stage7.train --root /tmp/training-fixture --run-id smoke --steps 3 --device cpu
python -m mcagent_stage7.evaluate --root /tmp/training-fixture --run-id smoke --device cpu
python -m mcagent_stage7.status --root /tmp/training-fixture
```

None of their help text or accepted arguments may contain `private`, `acknowledgement`, `metadata-only`, `Dataset`, `R1`, `R2`, or `R3`.

- [ ] **Step 3: Run to verify RED**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_training_checkpoint.py tests/test_training_loop.py tests/test_training_commands.py
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Implement atomic checkpointing**

Each run writes:

```text
runs/{run_id}/
  checkpoint.pt
  checkpoint.json
  metrics.jsonl
  gate1.json              only for tiny-overfit runs
  evaluation.json         after evaluation
  reconstruction.bin     after evaluation
```

`checkpoint.json` records run ID, model version, completed/target steps, seed, device, batch size, learning rate, dataset manifest SHA-256, split SHA-256, checkpoint SHA-256, and status. Save to temporary files, fsync, then `os.replace`.

- [ ] **Step 5: Implement training**

`train.py` arguments:

```text
--root .local/training
--run-id RUN_ID
--steps POSITIVE_INT
--batch-size POSITIVE_INT       default 2
--learning-rate POSITIVE_FLOAT  default 0.001
--device auto|cpu|cuda            default auto
--seed UINT32                     default 7101
--tiny-overfit                    optional
```

`auto` selects CUDA when `torch.cuda.is_available()`, otherwise CPU. Tiny-overfit uses the first four sorted training sample IDs, evaluates every 100 steps, stops successfully once Gate 1 passes, and fails after 5,000 steps if it has not passed.

- [ ] **Step 6: Implement evaluation and baselines**

Evaluate every validation patch with deterministic balanced masks. Build:

- an untrained model with seed 7101; and
- a class-prior baseline whose occupancy and semantic predictions are the most frequent training targets for each head.

Write complete metrics and Gate 2 checks to `evaluation.json`. Write the first validation reconstruction as exactly `32 ** 3` bytes.

- [ ] **Step 7: Implement status**

Print dataset source/sample/split counts, latest run ID, status, completed/target steps, latest Gate 1 result, and latest Gate 2 result. Missing dataset or runs must be reported as `not_prepared` or `no_runs`, not as an exception traceback.

- [ ] **Step 8: Replace package scripts**

Remove every transitional private/fixture script and add exactly:

```json
"training:prepare": "node src/runTrainingPrepare.js",
"training:train": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.train",
"training:evaluate": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.evaluate",
"training:status": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.status",
"test:training": "conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider ."
```

- [ ] **Step 9: Run tests**

Run the command from Step 3.

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add training/stage7/mcagent_stage7 training/stage7/tests package.json
git commit -m "feat: add resumable local voxel training"
```

---

### Task 10: Remove the Legacy Private and Fixture Training Stack

**Files:**
- Delete: `src/runStage7PrivateResearch.js`
- Delete: `src/construction/learning/stage7PrivateResearchBoundary.js`
- Delete: `src/construction/learning/stage7PrivateResearchCorpus.js`
- Delete: `src/construction/learning/pythonCoarseSemanticVoxelProvider.js`
- Modify: `src/construction/learning/coarseSemanticVoxelShadow.js`
- Modify: `src/construction/workflow.js`
- Modify: `src/pipeline.js`
- Modify: `src/index.js`
- Delete: `test/stage7PrivateResearchBoundary.test.js`
- Delete: `test/stage7PrivateResearchCli.test.js`
- Delete: `test/stage7PrivateResearchCorpus.test.js`
- Delete: `test/stage7PythonProvider.test.js`
- Delete: `test/stage7M3Fixtures.test.js`
- Modify: `test/stage7Cli.test.js`
- Modify: `test/stage7Pipeline.test.js`
- Delete: `training/stage7/fixtures/m3/`
- Delete: legacy Python modules and their dedicated tests listed below.
- Modify: `training/stage7/pyproject.toml`

**Interfaces:**
- Consumes: the complete replacement from Tasks 5-9.
- Produces: one Python training stack and no private-research/fixture-only public workflow.

- [ ] **Step 1: Write the failing shadow-boundary cleanup tests**

Update `test/stage7Cli.test.js` so help advertises only:

```text
--coarse-voxel-provider baseline|artifact
```

Assert `--coarse-voxel-checkpoint` and provider `python` are rejected as unknown/invalid options. Remove Python-specific cases from `test/stage7Pipeline.test.js` while retaining off-mode parity, baseline shadow, artifact acceptance/rejection, and primary-operation parity.

- [ ] **Step 2: Run the focused Node tests to verify RED**

Run:

```bash
node --test test/stage7Cli.test.js test/stage7Pipeline.test.js
```

Expected: FAIL because the Python provider and checkpoint option still exist.

- [ ] **Step 3: Remove the fixture-only Python shadow provider**

Delete `pythonCoarseSemanticVoxelProvider.js`. In `coarseSemanticVoxelShadow.js`, remove its import, provider branch, Python invocation options, and Python-specific provenance; preserve `baseline` and `artifact`. Remove `coarseVoxelCheckpoint`, `coarseVoxelCheckpointManifest`, `coarseVoxelPythonExecutable`, and `coarseVoxelPythonInvoke` plumbing from `workflow.js` and `pipeline.js`. Remove the checkpoint CLI option and `python` provider choice from `src/index.js`.

Delete `test/stage7PythonProvider.test.js`, `test/stage7M3Fixtures.test.js`, and `training/stage7/fixtures/m3/`.

- [ ] **Step 4: Run the focused Node tests**

Run the command from Step 2.

Expected: all tests pass.

- [ ] **Step 5: Prove the new stack has no legacy imports**

Run:

```bash
rg -n "private_research|train_fixture|acceptance|fixture_assets|mcagent_stage7\\.model|mcagent_stage7\\.dataset" training/stage7/mcagent_stage7/training_*.py training/stage7/mcagent_stage7/train.py training/stage7/mcagent_stage7/evaluate.py training/stage7/mcagent_stage7/status.py
```

Expected: no matches.

- [ ] **Step 6: Delete the Node legacy stack**

Delete the six Node files listed in this task.

- [ ] **Step 7: Delete legacy Python modules**

Delete:

```text
training/stage7/mcagent_stage7/acceptance.py
training/stage7/mcagent_stage7/checkpoints.py
training/stage7/mcagent_stage7/contracts.py
training/stage7/mcagent_stage7/dataset.py
training/stage7/mcagent_stage7/encoding.py
training/stage7/mcagent_stage7/evaluate_private_research.py
training/stage7/mcagent_stage7/fixture_assets.py
training/stage7/mcagent_stage7/infer.py
training/stage7/mcagent_stage7/model.py
training/stage7/mcagent_stage7/monitor_private_research.py
training/stage7/mcagent_stage7/pause_private_research.py
training/stage7/mcagent_stage7/private_research.py
training/stage7/mcagent_stage7/private_research_checkpoints.py
training/stage7/mcagent_stage7/private_research_evaluation.py
training/stage7/mcagent_stage7/private_research_model.py
training/stage7/mcagent_stage7/private_research_runtime.py
training/stage7/mcagent_stage7/private_research_snapshots.py
training/stage7/mcagent_stage7/private_research_training.py
training/stage7/mcagent_stage7/resume_private_research.py
training/stage7/mcagent_stage7/tensors.py
training/stage7/mcagent_stage7/train_fixture.py
training/stage7/mcagent_stage7/train_private_research.py
```

- [ ] **Step 8: Delete legacy Python tests**

Delete every existing `training/stage7/tests/test_*.py` except:

```text
test_training_data.py
test_voxel_model.py
test_training_metrics.py
test_training_checkpoint.py
test_training_loop.py
test_training_commands.py
```

Delete `private_research_test_support.py`. Retain `conftest.py` only after removing legacy imports and fixtures.

- [ ] **Step 9: Rename the Python project**

Change:

```toml
[project]
name = "minecraft-architecture-training"
version = "1.0.0"
```

Keep Python and dependency pins unchanged and keep `packages = ["mcagent_stage7"]` until a future package-only rename; the public npm commands no longer expose Stage 7 naming.

- [ ] **Step 10: Run all training tests**

Run:

```bash
npm run test:training
```

Expected: all remaining Python tests pass.

- [ ] **Step 11: Commit**

```bash
git add src test training/stage7 package.json
git commit -m "refactor: remove legacy private training stack"
```

---

### Task 11: Run Gate 1 and Gate 2 on Real Local Data

**Files:**
- Local-only outputs below `.local/training/`; no tracked source modification unless a genuine defect is found.

**Interfaces:**
- Consumes: all 64 local templates and the four supported commands.
- Produces: a real preparation report, a passing Gate 1 run, and an honest Gate 2 evaluation.

- [ ] **Step 1: Prepare all sources**

Run:

```bash
npm run training:prepare -- --source-root mc_templates --output-root .local/training --seed 7101
```

Expected: `accepted + rejected = 64`; every rejection has a technical reason; every accepted source has a source split and at least one patch.

- [ ] **Step 2: Run the tiny-overfit gate**

Run:

```bash
npm run training:train -- --root .local/training --run-id tiny-overfit-7101 --tiny-overfit --steps 5000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101
```

Expected: exit 0 only after supported non-air macro-F1 reaches at least `0.90`. If it fails, stop the larger run, inspect visible metrics, fix the model/data defect with a failing regression test, and repeat Gate 1.

- [ ] **Step 3: Run the held-out training experiment**

Run:

```bash
npm run training:train -- --root .local/training --run-id held-out-7101 --steps 50000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101
```

Expected: a completed checkpoint with 50,000 optimizer steps. This command has no approval or acknowledgement prompt.

- [ ] **Step 4: Evaluate Gate 2**

Run:

```bash
npm run training:evaluate -- --root .local/training --run-id held-out-7101 --device auto --seed 7101
```

Expected: `evaluation.json` contains all trained, untrained, and prior metrics plus every Gate 2 check. Report the real pass/fail result; do not change thresholds after seeing it.

- [ ] **Step 5: Show concise status**

Run:

```bash
npm run training:status -- --root .local/training
```

Expected: dataset counts, latest completed steps, Gate 1 pass, and the real Gate 2 decision.

- [ ] **Step 6: Commit only defect fixes**

Do not commit `.local/training/`. If Gate 1 required a tracked defect fix, add the exact source/test files and commit:

```bash
git commit -m "fix: make non-air voxel learning effective"
```

---

### Task 12: Finalize the Three Sources of Truth

**Files:**
- Modify: `README.md`
- Modify: `AGENT.md`
- Modify: `docs/architecture.md`
- Modify: `docs/training.md`
- Modify: `docs/index.html`
- Delete: `docs/superpowers/specs/2026-07-23-training-first-project-reset-design.md`
- Delete: `docs/superpowers/plans/2026-07-23-governance-cleanup.md`
- Delete: `docs/superpowers/plans/2026-07-23-training-pipeline-reset.md`

**Interfaces:**
- Consumes: actual commands, real preparation counts, Gate 1 result, and Gate 2 result.
- Produces: final current-tree documentation with no implementation-history archive.

- [ ] **Step 1: Update command and result documentation**

Document only the four supported training commands. Replace transitional wording with the observed preparation counts and real Gate 1/Gate 2 decisions. State failures plainly if Gate 2 did not pass.

- [ ] **Step 2: Delete the temporary implementation artifacts**

Delete the three 2026-07-23 files listed above. Remove empty `docs/superpowers` directories. Git history remains the archive.

- [ ] **Step 3: Strengthen the policy test**

Add to `test/projectPolicy.test.js`:

```js
test('working tree has no process-document archive', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'docs/superpowers')), false);
});

test('exactly four training commands are supported', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'))).scripts;
  assert.deepEqual(
    Object.keys(scripts).filter((name) => name.startsWith('training:')).sort(),
    ['training:evaluate', 'training:prepare', 'training:status', 'training:train']
  );
});
```

- [ ] **Step 4: Run policy tests**

Run:

```bash
node --test test/projectPolicy.test.js test/docsProjectStatus.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENT.md docs package.json test/projectPolicy.test.js
git commit -m "docs: finalize the training-first project"
```

---

### Task 13: Complete Verification

**Files:**
- Modify only when a verification failure identifies a real defect.

**Interfaces:**
- Consumes: the complete reset.
- Produces: verified construction, preparation, training, evaluation, documentation, and repository boundaries.

- [ ] **Step 1: Run the complete Node suite**

Run:

```bash
npm test
```

Expected: all tests pass. Rerun with normal local child-process permission if the restricted sandbox produces known false failures.

- [ ] **Step 2: Run the complete training suite**

Run:

```bash
npm run test:training
```

Expected: all tests pass.

- [ ] **Step 3: Run normal mock generation**

Run:

```bash
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
```

Expected: exit 0 with a datapack, preview, report, and scorecard.

- [ ] **Step 4: Verify policy and command absence**

Run:

```bash
rg -n "ready_for_m3_real_data|training_eligible_count|private-research-only|audit:stage7|pilot:stage7|review-pack:stage7|dataset:stage7|R[123].*(approval|admission)" README.md AGENT.md docs src test training package.json
```

Expected: no matches.

- [ ] **Step 5: Verify local data remains untracked**

Run:

```bash
git status --short --ignored .local/training .local/stage7-private-research .local/stage7-source-expansion
```

Expected: ignored (`!!`) entries only.

- [ ] **Step 6: Verify diff hygiene and final status**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and no uncommitted tracked changes.
