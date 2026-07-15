# Stage 7 Private-Research Pretraining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch parallel agents: the project owner requires sequential, quota-conscious execution.

**Goal:** Build a local-only, Git-ignored pipeline that manually imports `.schem`/`.schematic` buildings, prepares bounded raw voxel volumes, and runs a quarantined masked-reconstruction smoke training job without changing Dataset v1/v2/v3, M3, or M4.

**Architecture:** Node owns private-root containment, safe schematic import, deterministic raw-volume preparation, provenance manifests, and source-group splits. Python consumes only prepared private binary volumes and performs preflight-gated masked reconstruction training; its checkpoints and reports remain under the private root. Neither runtime imports Dataset v3 cases nor connects to the authoritative construction pipeline.

**Tech Stack:** Node.js 24 ESM and the existing NBT/schematic decoder; Python 3.12, NumPy, PyTorch, pytest; no new runtime dependencies and no network services.

## Global Constraints

- Keep Dataset v1/v2/v3 byte-identical; verify SHA-256 values `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`, `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`, and `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082` before and after each private command.
- Keep Dataset v3 `ready_for_m3_real_data=false` and `training_eligible_count=0`; do not enable M4 Apply Mode.
- All private state is under `.local/stage7-private-research/`, must be Git-ignored and untracked, and must never be pushed, shared, uploaded, or packaged.
- Do not download or scrape data. The owner manually places local `.schem` or `.schematic` inputs in `source/`.
- Reject `.litematic`, malformed NBT, input files over 64 MiB, decompressed NBT over 128 MiB, symbolic-link escapes, tracked paths, non-ignored paths, duplicate source hashes, and non-air bounding boxes larger than `64 × 64 × 64`.
- Private data always records `rights_state: "unverified"`, `distribution: "prohibited"`, and `purpose: "local-private-research-only"`; never infer author or permission details.
- All default training is offline, has no experiment-tracker integration, and writes only below `runs/`.
- Use committed synthetic fixtures only in automated tests. Never commit an external building or private manifest.
- Use `/home/guoba/.nvm/versions/node/v24.18.0/bin/node` for Node commands when nested subprocess tests require the sandbox escalation.

---

## File structure

| Path | Responsibility |
|---|---|
| `.gitignore` | Ignores the entire private-research root. |
| `src/construction/templates/nbt.js` | Adds bounded optional decompression to the existing parser without changing default behavior. |
| `src/construction/learning/stage7PrivateResearchBoundary.js` | Defines private-root, acknowledgement, Git, path, formal-dataset, and manifest-boundary checks. |
| `src/construction/learning/stage7PrivateResearchCorpus.js` | Imports source files, maps blocks to private token IDs, writes prepared binary volumes, and creates deterministic source-group splits. |
| `src/runStage7PrivateResearch.js` | Node CLI with `init`, `import`, and `prepare` subcommands; does not train. |
| `test/stage7PrivateResearchBoundary.test.js` | Node refusal and immutability tests. |
| `test/stage7PrivateResearchCorpus.test.js` | Node synthetic-schematic import, preparation, deduplication, dimensions, and split tests. |
| `test/stage7PrivateResearchCli.test.js` | Node CLI tests against temporary, ignored test roots. |
| `package.json` | Adds explicit private import/preparation and training scripts. |
| `training/stage7/mcagent_stage7/private_research.py` | Python contracts, prepared-volume loading, offline preflight, deterministic masking, and local-only path checks. |
| `training/stage7/mcagent_stage7/private_research_model.py` | Small categorical 3-D masked reconstruction model and masked loss. |
| `training/stage7/mcagent_stage7/private_research_checkpoints.py` | Local-only checkpoint and manifest serialization, separate from fixture checkpoint code. |
| `training/stage7/mcagent_stage7/train_private_research.py` | Preflight-gated CPU/CUDA training CLI and run-artifact writing. |
| `training/stage7/tests/test_private_research.py` | Python preflight, binary corpus, masking, and path-boundary tests using generated test files. |
| `training/stage7/tests/test_private_research_model.py` | Model shape, finite-loss, and masked-loss tests. |
| `training/stage7/tests/test_train_private_research.py` | End-to-end one-step synthetic private run and refusal tests. |
| `training/stage7/README.md` | Documents the private workflow as local-only and non-release, separately from M3. |

## Private file contracts

`PRIVATE_RESEARCH_ACK.json` is owner-created and local-only:

```json
{
  "scope": "stage7-private-research-only",
  "distribution_prohibited": true,
  "dataset_v3_unchanged": true,
  "m4_apply_mode_unchanged": true,
  "acknowledged_at": "2026-07-15T00:00:00.000Z",
  "acknowledged_by": "local-owner"
}
```

Each imported source record is one canonical JSON line in `manifests/sources.jsonl`:

```json
{
  "source_id": "pr-0123456789abcdef",
  "source_path": "source/example.schematic",
  "source_url": "",
  "obtained_at": "2026-07-15T00:00:00.000Z",
  "content_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "format": "schematic",
  "rights_state": "unverified",
  "distribution": "prohibited",
  "purpose": "local-private-research-only",
  "dimensions": { "x": 16, "y": 8, "z": 16 }
}
```

Every prepared case has a one-byte-per-voxel file at `prepared/pr-0123456789abcdef.voxels.bin` in `y,z,x` order and a JSON sidecar containing `source_id`, source hash, taxonomy version `private-raw-material-family-v1`, `shape: [64,64,64]`, `voxel_sha256`, and the three mandatory local-only markers. Token IDs are stable: `0 air`, `1 terrain`, `2 structural-stone`, `3 structural-wood`, `4 glass`, `5 roof`, `6 decorative`, `7 fluid`, `8 other-solid`.

## Task 1: Establish the private-root boundary and bounded NBT decoding

**Files:**
- Modify: `.gitignore`
- Modify: `src/construction/templates/nbt.js`
- Create: `src/construction/learning/stage7PrivateResearchBoundary.js`
- Test: `test/stage7PrivateResearchBoundary.test.js`

**Interfaces:**
- Produces `PRIVATE_ROOT_RELATIVE`, `PRIVATE_SCOPE`, `assertPrivateRoot`, `assertPrivateAcknowledgement`, `assertPrivateCandidate`, `assertFormalDatasetBoundary`, `readCanonicalJson`, and `writeCanonicalJson` for later Node corpus commands.
- Extends `parseNbt(buffer, { maxInflatedBytes } = {})` and preserves `parseNbt(buffer)` compatibility for existing callers.

- [ ] **Step 1: Write the failing Node boundary tests**

```js
test('private boundary rejects a missing acknowledgement and a tracked or escaped path', async () => {
  const root = await makePrivateRoot();
  await assert.rejects(assertPrivateAcknowledgement(root), /PRIVATE_RESEARCH_ACK/);
  await writeAck(root);
  await assert.rejects(assertPrivateCandidate(root, path.resolve('package.json')), /outside private root|Git-tracked/);
  await assert.rejects(assertPrivateCandidate(root, root / 'linked-source'), /symbolic link/);
});

test('formal dataset boundary verifies all immutable hashes and false/zero gate', async () => {
  const result = await assertFormalDatasetBoundary(process.cwd());
  assert.deepEqual(result.dataset_hashes, EXPECTED_DATASET_HASHES);
  assert.deepEqual(result.dataset_v3_gate, {
    ready_for_m3_real_data: false,
    training_eligible_count: 0
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the module does not exist**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchBoundary.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7PrivateResearchBoundary.js`.

- [ ] **Step 3: Add the ignore rule and bounded NBT option**

Append this exact ignore rule:

```gitignore
# Local-only, non-distributable Stage 7 private-research corpus and outputs
.local/stage7-private-research/
```

Change the NBT entry points so callers may set a decompression cap while legacy callers keep existing behavior:

```js
export function parseNbt(buffer, { maxInflatedBytes } = {}) {
  const source = inflateNbt(buffer, maxInflatedBytes);
  // retain existing compound parsing
}

function inflateNbt(buffer, maxInflatedBytes) {
  const options = Number.isSafeInteger(maxInflatedBytes) && maxInflatedBytes > 0
    ? { maxOutputLength: maxInflatedBytes }
    : undefined;
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return zlib.gunzipSync(buffer, options);
  if (buffer.length >= 2 && buffer[0] === 0x78) {
    try { return zlib.inflateSync(buffer, options); } catch { return buffer; }
  }
  if (options && buffer.length > options.maxOutputLength) throw new Error('NBT input exceeds maximum decoded size.');
  return buffer;
}
```

- [ ] **Step 4: Implement `stage7PrivateResearchBoundary.js`**

Use canonical JSON serialization and the following stable surface:

```js
export const PRIVATE_ROOT_RELATIVE = '.local/stage7-private-research';
export const PRIVATE_SCOPE = 'stage7-private-research-only';
export const EXPECTED_DATASET_HASHES = Object.freeze({
  v1: 'fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749',
  v2: 'af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654',
  v3: '5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082'
});

export function resolvePrivateRoot(cwd = process.cwd()) { return path.resolve(cwd, PRIVATE_ROOT_RELATIVE); }
export async function assertPrivateAcknowledgement(root) {
  const ack = await readCanonicalJson(path.join(root, 'PRIVATE_RESEARCH_ACK.json'));
  if (ack.scope !== PRIVATE_SCOPE || ack.distribution_prohibited !== true || ack.dataset_v3_unchanged !== true || ack.m4_apply_mode_unchanged !== true) {
    throw new PrivateResearchBoundaryError('ACK_INVALID', 'private acknowledgement does not confirm every required boundary');
  }
  return ack;
}
export async function assertPrivateCandidate(root, candidate) {
  const rootReal = await fs.realpath(root);
  const entry = await fs.lstat(candidate);
  if (entry.isSymbolicLink()) throw new PrivateResearchBoundaryError('PATH_SYMLINK', String(candidate));
  const actual = await fs.realpath(candidate);
  if (path.relative(rootReal, actual).startsWith('..') || path.isAbsolute(path.relative(rootReal, actual))) throw new PrivateResearchBoundaryError('PATH_OUTSIDE_PRIVATE_ROOT', actual);
  await assertGitIgnoredAndUntracked(actual);
  return actual;
}
export async function assertFormalDatasetBoundary(cwd = process.cwd()) {
  const datasetHashes = await readAndHashFormalDatasetManifests(cwd);
  if (JSON.stringify(datasetHashes) !== JSON.stringify(EXPECTED_DATASET_HASHES)) throw new PrivateResearchBoundaryError('DATASET_HASH_MISMATCH', JSON.stringify(datasetHashes));
  const manifest = await readCanonicalJson(path.resolve(cwd, 'mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'));
  if (manifest.ready_for_m3_real_data !== false || manifest.training_eligible_count !== 0) throw new PrivateResearchBoundaryError('DATASET_GATE_CHANGED', 'Dataset v3 must stay false/zero');
  return Object.freeze({ dataset_hashes: datasetHashes, dataset_v3_gate: { ready_for_m3_real_data: false, training_eligible_count: 0 } });
}
export function canonicalJson(value) { return `${JSON.stringify(value, Object.keys(value).sort(), 2)}\n`; }
```

Use `fs.lstat`, `fs.realpath`, `path.relative`, `git check-ignore --quiet -- candidate-path`, and `git ls-files --error-unmatch -- candidate-path` via `execFile`. Return a stable `PrivateResearchBoundaryError` with codes such as `ACK_MISSING`, `ACK_INVALID`, `PATH_OUTSIDE_PRIVATE_ROOT`, `PATH_SYMLINK`, `PATH_NOT_IGNORED`, `PATH_GIT_TRACKED`, `DATASET_HASH_MISMATCH`, and `DATASET_GATE_CHANGED`.

- [ ] **Step 5: Run focused Node tests and regression decoder tests**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchBoundary.test.js test/schematicBlockVolume.test.js`
Expected: all tests pass.

- [ ] **Step 6: Commit the self-contained boundary task**

```bash
git add .gitignore src/construction/templates/nbt.js src/construction/learning/stage7PrivateResearchBoundary.js test/stage7PrivateResearchBoundary.test.js
git commit -m "feat(stage7): isolate private research root"
```

## Task 2: Import and prepare bounded raw voxel volumes

**Files:**
- Create: `src/construction/learning/stage7PrivateResearchCorpus.js`
- Test: `test/stage7PrivateResearchCorpus.test.js`
- Modify: `src/construction/templates/schematicBlockVolume.js`

**Interfaces:**
- Consumes Task 1 boundary checks and existing `decodeSchematicBlockVolume`.
- Produces `importPrivateSources({ cwd, root, obtainedAt })`, `preparePrivateCorpus({ cwd, root, splitSeed })`, `PRIVATE_TAXONOMY_VERSION`, and `mapPrivateToken(block)`.

- [ ] **Step 1: Write synthetic schematic and corpus tests**

Create raw MCEdit NBT test bytes in the test file; do not read `mc_templates` or commit an external building. Assert all of the following:

```js
const imported = await importPrivateSources({ cwd, root, obtainedAt: '2026-07-15T00:00:00.000Z' });
assert.equal(imported.records.length, 1);
assert.equal(imported.records[0].rights_state, 'unverified');
await assert.rejects(importPrivateSources({ cwd, root, obtainedAt }), /DUPLICATE_SOURCE/);

const prepared = await preparePrivateCorpus({ cwd, root, splitSeed: 7101 });
assert.equal(prepared.records[0].shape.join(','), '64,64,64');
assert.equal((await fs.stat(prepared.records[0].voxel_path)).size, 64 ** 3);
assert.equal(prepared.records[0].taxonomy_version, 'private-raw-material-family-v1');
assert.deepEqual(prepared.split.case_ids, [...prepared.split.case_ids].sort());
```

Also create cases that assert rejection for `.litematic`, a file over 64 MiB (mock `stat`), malformed NBT, dimensions `65×1×1`, and an input changed after import.

- [ ] **Step 2: Run the focused corpus tests and verify they fail**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchCorpus.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7PrivateResearchCorpus.js`.

- [ ] **Step 3: Add an optional NBT limit to the schematic decoder**

Preserve existing callers and add an options argument:

```js
export function decodeSchematicBlockVolume(buffer, { maxInflatedBytes } = {}) {
  const parsed = parseNbt(buffer, { maxInflatedBytes });
  // existing normalized volume result unchanged
}

export async function readSchematicBlockVolume(filePath, options = {}) {
  return decodeSchematicBlockVolume(await fs.readFile(filePath), options);
}
```

- [ ] **Step 4: Implement deterministic import**

`importPrivateSources` must first call `assertPrivateAcknowledgement`, `assertFormalDatasetBoundary`, and `assertPrivateCandidate` for `source/`, `manifests/`, and every source file. Read extensions only from `.schem` and `.schematic`, sort relative paths with `localeCompare`, cap raw bytes at `64 * 1024 * 1024`, and decode using `maxInflatedBytes: 128 * 1024 * 1024`.

For each source, derive `source_id` from the first 16 characters of its SHA-256. Write `manifests/sources.jsonl` only when the complete sorted set has passed validation. Refuse an existing equal hash with `DUPLICATE_SOURCE` and a changed source with `SOURCE_HASH_CHANGED`; do not overwrite a prior manifest silently.

- [ ] **Step 5: Implement preparation and split**

Use this token mapper exactly:

```js
export function mapPrivateToken(block) {
  if (block.air) return 0;
  if (block.category === 'earth') return 1;
  if (block.category === 'rock') return 2;
  if (block.category === 'wood') return 3;
  if (block.category === 'glass') return 4;
  if (block.category === 'stair' || block.category === 'slab') return 5;
  if (block.category === 'water') return 7;
  if (['light', 'fence', 'opening', 'decor', 'vegetation'].includes(block.category)) return 6;
  return 8;
}
```

Find the non-air bounding box, reject an empty source with `SOURCE_EMPTY`, and reject any extent above 64 with `VOLUME_TOO_LARGE`. Center the unscaled volume with lower-offset `Math.floor((64 - extent) / 2)` and write a 262,144-byte `Uint8Array` in `y,z,x` order. Hash the binary bytes, write a canonical JSON sidecar, and only then write the deterministic split manifest. Derive validation membership from `sha256(`${splitSeed}:${source_sha256}`)[0] % 5 === 0`; all other cases are train. Preserve the source SHA as the source group ID.

- [ ] **Step 6: Run focused Node tests**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchBoundary.test.js test/schematicBlockVolume.test.js`
Expected: all tests pass, including each stable refusal code.

- [ ] **Step 7: Commit the corpus task**

```bash
git add src/construction/templates/schematicBlockVolume.js src/construction/learning/stage7PrivateResearchCorpus.js test/stage7PrivateResearchCorpus.test.js
git commit -m "feat(stage7): prepare private raw voxel corpus"
```

## Task 3: Add the Node private-corpus CLI and user-facing commands

**Files:**
- Create: `src/runStage7PrivateResearch.js`
- Modify: `package.json`
- Create: `test/stage7PrivateResearchCli.test.js`
- Modify: `training/stage7/README.md`

**Interfaces:**
- Consumes Task 1 and Task 2 public functions.
- Produces three non-training CLI commands: `init`, `import`, and `prepare`.

- [ ] **Step 1: Write failing CLI tests**

```js
test('private CLI init writes only an ignored skeleton and does not create an acknowledgement', () => {
  const result = runCli(['init', '--root', root]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PRIVATE_RESEARCH_ACK.json must be completed by the owner/);
  assert.equal(fs.existsSync(path.join(root, 'PRIVATE_RESEARCH_ACK.json')), false);
});

test('private CLI import requires owner acknowledgement and prepare never trains', () => {
  assert.match(runCli(['import', '--root', root]).stderr, /ACK_MISSING/);
  writeAck(root);
  assert.equal(runCli(['prepare', '--root', root, '--seed', '7101']).status, 0);
  assert.equal(fs.existsSync(path.join(root, 'runs')), false);
});
```

- [ ] **Step 2: Run CLI test and verify it fails**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchCli.test.js`
Expected: FAIL because `src/runStage7PrivateResearch.js` is absent.

- [ ] **Step 3: Implement the CLI**

Use `node:util` `parseArgs`. `init` creates `source`, `manifests`, `prepared`, `splits`, and `runs` under the resolved root only, then prints the exact acknowledgement JSON schema without writing it. `import` accepts `--root`, `--obtained-at`, and `--source-url` only; it calls `importPrivateSources`. `prepare` accepts `--root` and integer `--seed`; it calls `preparePrivateCorpus`. All errors print their stable error code to stderr and exit 1. No subcommand accepts a URL for network fetching and no subcommand imports or invokes Python.

Add scripts:

```json
"private-research:stage7": "node src/runStage7PrivateResearch.js",
"train:stage7:private-research": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.train_private_research"
```

Document the isolation boundary, owner-created acknowledgement, manual input step, and the fact that `private-research:stage7` never trains.

- [ ] **Step 4: Run CLI and project documentation tests**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchCli.test.js test/docsProjectStatus.test.js`
Expected: all tests pass.

- [ ] **Step 5: Commit the CLI task**

```bash
git add src/runStage7PrivateResearch.js package.json test/stage7PrivateResearchCli.test.js training/stage7/README.md
git commit -m "feat(stage7): add private research corpus CLI"
```

## Task 4: Add Python private-corpus contracts, dataset, and masked model

**Files:**
- Create: `training/stage7/mcagent_stage7/private_research.py`
- Create: `training/stage7/mcagent_stage7/private_research_model.py`
- Create: `training/stage7/tests/test_private_research.py`
- Create: `training/stage7/tests/test_private_research_model.py`

**Interfaces:**
- Consumes the private prepared binary/JSON/split contracts from Task 2.
- Produces `PrivatePreparedDataset`, `PrivateResearchPreflight`, `run_private_preflight`, `make_masked_batch`, `TinyMaskedVoxelAutoencoder`, and `masked_reconstruction_loss`.

- [ ] **Step 1: Write failing Python contract tests**

```python
def test_private_preflight_requires_acknowledged_untracked_root_and_unchanged_formal_dataset(tmp_path: Path) -> None:
    root = make_private_root(tmp_path)
    write_ack(root)
    write_prepared_case(root, case_id="pr-a")
    preflight = run_private_preflight(root=root, repo_root=REPO_ROOT)
    assert preflight.case_count == 1
    assert preflight.dataset_v3_gate == {"ready_for_m3_real_data": False, "training_eligible_count": 0}

def test_private_dataset_returns_categorical_volume_and_deterministic_mask(tmp_path: Path) -> None:
    root = make_private_root(tmp_path)
    write_ack(root); write_prepared_case(root, case_id="pr-a")
    dataset = PrivatePreparedDataset(root=root, split="train", seed=7101)
    target, visible, mask = dataset[0]
    assert target.shape == visible.shape == mask.shape == (64, 64, 64)
    assert target.dtype is torch.long and mask.any()
    assert torch.equal(dataset[0][2], dataset[0][2])
```

- [ ] **Step 2: Run focused Python tests and verify they fail**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research.py tests/test_private_research_model.py`
Expected: FAIL with missing `mcagent_stage7.private_research` modules.

- [ ] **Step 3: Implement private contracts and dataset**

Define these constants and dataclasses:

```python
PRIVATE_SCOPE = "stage7-private-research-only"
PRIVATE_TAXONOMY_VERSION = "private-raw-material-family-v1"
PRIVATE_SHAPE = (64, 64, 64)
PRIVATE_TOKEN_COUNT = 9

@dataclass(frozen=True)
class PrivateResearchPreflight:
    root: Path
    case_count: int
    sources_manifest_sha256: str
    prepared_manifest_sha256: str
    split_sha256: str
    dataset_hashes: dict[str, str]
    dataset_v3_gate: dict[str, bool | int]
```

`run_private_preflight` independently validates the acknowledgement, all mandatory case markers, root containment, no symlink escape, binary size exactly `64**3`, sidecar and binary SHA-256 values, source-group split uniqueness, formal dataset hashes, and false/zero gate. Use `subprocess.run(["git", "check-ignore", "-q", "--", str(path)], check=False)` and `git ls-files --error-unmatch` to ensure every path remains ignored and untracked. Fail with `PrivateResearchError` codes matching the Node boundary names.

`PrivatePreparedDataset` reads binary values using `numpy.frombuffer`, reshapes to `(64, 64, 64)`, and returns target IDs plus deterministic visible/mask tensors. `make_masked_batch(targets, seed, ratio=0.25)` must never mask zero voxels: generate with a CPU `torch.Generator`, force one masked flat index when needed, and replace masked visible values with token ID `9`.

- [ ] **Step 4: Implement the minimal masked model and loss**

```python
class TinyMaskedVoxelAutoencoder(nn.Module):
    def __init__(self, token_count: int = PRIVATE_TOKEN_COUNT) -> None:
        super().__init__()
        self.embedding = nn.Embedding(token_count + 1, 8)
        self.encoder = nn.Sequential(nn.Conv3d(8, 12, 3, 2, 1), nn.SiLU(), nn.Conv3d(12, 16, 3, 2, 1), nn.SiLU())
        self.decoder = nn.Sequential(nn.ConvTranspose3d(16, 12, 4, 2, 1), nn.SiLU(), nn.ConvTranspose3d(12, 8, 4, 2, 1), nn.SiLU())
        self.head = nn.Conv3d(8, token_count, 1)

    def forward(self, visible: torch.Tensor) -> torch.Tensor:
        features = self.embedding(visible).permute(0, 4, 1, 2, 3)
        return self.head(self.decoder(self.encoder(features)))

def masked_reconstruction_loss(logits: torch.Tensor, targets: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    return F.cross_entropy(logits.permute(0, 2, 3, 4, 1)[mask], targets[mask])
```

Validate ranks, `(batch,64,64,64)` shapes, token ranges, a non-empty mask, and finite scalar loss. Add tests for output `(batch,9,64,64,64)`, token-range failures, empty-mask failure, and finite backward gradients.

- [ ] **Step 5: Run focused Python tests**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research.py tests/test_private_research_model.py`
Expected: all tests pass.

- [ ] **Step 6: Commit the Python data/model task**

```bash
git add training/stage7/mcagent_stage7/private_research.py training/stage7/mcagent_stage7/private_research_model.py training/stage7/tests/test_private_research.py training/stage7/tests/test_private_research_model.py
git commit -m "feat(stage7): add private masked voxel dataset"
```

## Task 5: Add private-only trainer, checkpoint metadata, and smoke-run tests

**Files:**
- Create: `training/stage7/mcagent_stage7/private_research_checkpoints.py`
- Create: `training/stage7/mcagent_stage7/train_private_research.py`
- Create: `training/stage7/tests/test_train_private_research.py`

**Interfaces:**
- Consumes Task 4 preflight, data, masks, and model.
- Produces `PrivateTrainConfig`, `train_private_research`, `PrivateRunArtifacts`, and a `stage7-private-research-checkpoint-v1` manifest.

- [ ] **Step 1: Write failing trainer tests**

```python
def test_one_step_private_smoke_run_writes_only_private_non_distributable_artifacts(tmp_path: Path) -> None:
    root = make_ready_private_root(tmp_path, case_count=2)
    artifacts = train_private_research(PrivateTrainConfig(root=root, repo_root=REPO_ROOT, seed=7101, steps=1, batch_size=1, learning_rate=1e-3, device="cpu", run_id="smoke", code_revision="test"))
    assert artifacts.checkpoint_path.is_relative_to(root / "runs")
    assert artifacts.manifest["training_scope"] == "private-research-only"
    assert artifacts.manifest["distribution"] == "prohibited"
    assert artifacts.final_loss > 0

def test_trainer_refuses_output_outside_private_root(tmp_path: Path) -> None:
    root = make_ready_private_root(tmp_path, case_count=1)
    config = PrivateTrainConfig(root=root, repo_root=REPO_ROOT, seed=7101, steps=1, batch_size=1, learning_rate=1e-3, device="cpu", run_id="../escape", code_revision="test")
    with pytest.raises(PrivateResearchError, match="RUN_ID_INVALID|PATH_OUTSIDE_PRIVATE_ROOT"):
        train_private_research(config)
```

- [ ] **Step 2: Run the trainer tests and verify they fail**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_train_private_research.py`
Expected: FAIL with missing `train_private_research` module.

- [ ] **Step 3: Implement checkpoint serialization separate from fixture M3**

Serialize an ordered CPU-only model state dict and a canonical manifest. The manifest must contain:

```python
{
  "source": "stage7-private-research-checkpoint-v1",
  "schema_version": 1,
  "training_scope": "private-research-only",
  "distribution": "prohibited",
  "private_research_only": True,
  "input_manifest_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "prepared_taxonomy_version": "private-raw-material-family-v1",
  "split_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "seed": 7101,
  "device": "cpu",
  "checkpoint_sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
}
```

Do not call or modify `checkpoints.py`; its `fixture-only` constants must remain exclusive to M3.

- [ ] **Step 4: Implement the trainer and CLI**

`PrivateTrainConfig` validates a safe `run_id` (`^[a-z0-9][a-z0-9_-]{0,63}$`), positive steps/batch size/learning rate, seed range, and device in `{cpu,cuda}`. `cuda` requires `torch.cuda.is_available()`; both modes set the seed and deterministic algorithms. The trainer calls `run_private_preflight` before creating any output, reads only the train split, uses SGD, writes `metrics.jsonl`, `checkpoint.pt`, `checkpoint_manifest.json`, and one `reconstruction.bin` into `runs/smoke/`, and reruns the formal dataset/gate check after writing artifacts.

The CLI requires `--root`, `--run-id`, and an explicit `--private-research-only` acknowledgement flag. It defaults to `--device cpu --steps 1 --batch-size 1 --seed 7101`. It has no inference, export, upload, source-download, M3, M4, or primary-provider options.

- [ ] **Step 5: Run focused trainer tests**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_train_private_research.py tests/test_private_research.py tests/test_private_research_model.py`
Expected: all tests pass with no external network access or external templates.

- [ ] **Step 6: Commit the trainer task**

```bash
git add training/stage7/mcagent_stage7/private_research_checkpoints.py training/stage7/mcagent_stage7/train_private_research.py training/stage7/tests/test_train_private_research.py
git commit -m "feat(stage7): train isolated private research model"
```

## Task 6: Verify integration, documentation, and isolation evidence

**Files:**
- Modify: `training/stage7/README.md` only if Task 3 did not include all final commands and refusal boundaries.
- Modify: `docs/benchmarks/stage7-private-research-pretraining.md` to document fixture-only integration evidence; do not add external results.
- Test: full existing Node and Stage 7 Python suites.

**Interfaces:**
- Consumes all prior tasks.
- Produces a committed, reproducible fixture-only verification record, not a real-data training record.

- [ ] **Step 1: Write the benchmark evidence skeleton before final checks**

Document exact commands, expected local-only refusal checks, formal dataset hashes, false/zero gate, M4 unavailable result, and the fact that only generated synthetic test data was used. Do not include a private source path, source URL, raw hash, checkpoint, trained weights, or sample output.

- [ ] **Step 2: Run focused Node checks**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js test/schematicBlockVolume.test.js test/stage7M3Fixtures.test.js test/stage7PythonProvider.test.js`
Expected: all tests pass; no test creates a non-ignored root or changes Dataset v3.

- [ ] **Step 3: Run focused Python checks**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research.py tests/test_private_research_model.py tests/test_train_private_research.py tests/test_dataset.py tests/test_acceptance.py`
Expected: all tests pass; fixture M3 gate tests continue to reject real-data readiness changes.

- [ ] **Step 4: Run full task-boundary suites**

Run: `npm test`
Expected: exit 0.

Run: `npm run test:stage7:m3`
Expected: exit 0; fixture-only M3 remains unchanged.

- [ ] **Step 5: Capture formal boundary evidence without creating private training data**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'); const crypto=require('crypto'); const p=['mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json','mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json','mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json']; console.log(JSON.stringify(p.map(x=>[x,crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex')]))); const m=JSON.parse(fs.readFileSync(p[2],'utf8')); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"
```

Expected: the three global-constraint hashes and `{"ready_for_m3_real_data":false,"training_eligible_count":0}`.

- [ ] **Step 6: Review the diff for data leakage and commit evidence**

Run:

```bash
git status --short
git diff --check
git ls-files .local/stage7-private-research
```

Expected: no path below `.local/stage7-private-research` is tracked; no whitespace errors.

Commit:

```bash
git add training/stage7/README.md docs/benchmarks/stage7-private-research-pretraining.md
git commit -m "docs(stage7): record private research isolation evidence"
```

## Spec-to-plan coverage review

| Approved specification requirement | Planned tasks |
|---|---|
| Separate local root, owner acknowledgement, ignored/untracked enforcement | Task 1, Task 3 |
| No Dataset v1/v2/v3 mutation; false/zero gate; M4 unavailable | Tasks 1, 4, 5, 6 |
| Manual `.schem`/`.schematic` only; no download; provenance and hashes | Tasks 2, 3 |
| Bounded `64³` unscaled raw volumes and stable nine-token taxonomy | Task 2 |
| Deterministic source-group split and hash validation | Tasks 2, 4 |
| Offline private masked reconstruction; local-only checkpoint metadata | Tasks 4, 5 |
| Refusal for paths, symlinks, tracking, formats, duplicates, changes, leaks | Tasks 1–5 |
| Fixtures only in committed tests; full regression evidence | Task 6 |

## Plan self-review

- **Spec coverage:** Every section of the approved isolation design maps to at least one task above. The plan intentionally excludes `.litematic`, automatic downloads, semantic labels, M3/M4 integration, public export, and real external-data execution.
- **No placeholders:** File paths, interfaces, stable IDs, token values, commands, expected outcomes, and commit boundaries are specified. The timestamp and owner identifier remain runtime values in the local acknowledgement by design; they are not unresolved implementation decisions.
- **Type consistency:** Node emits one-byte `y,z,x` binary volumes plus JSON sidecars; Python loads the same shape and token range. Both use the same scope string, taxonomy version, nine target tokens, private root, and formal Dataset hashes.

## Execution handoff

Plan saved at `docs/superpowers/plans/2026-07-15-stage-7-private-research-pretraining.md`.

Execution must be **inline and sequential** because the owner has prohibited parallel agents. The executor must invoke `superpowers:executing-plans`, finish one task at a time, present fresh verification evidence at each task boundary, and never start a real external-data training run without a later explicit operational instruction after implementation and local import succeed.
