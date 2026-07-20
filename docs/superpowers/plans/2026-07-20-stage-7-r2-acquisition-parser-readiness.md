# Stage 7 R2 Acquisition and Parser Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents: the owner explicitly requires sequential work.

**Goal:** Build a synthetic-only, fail-closed R2 readiness library for quarantine containment, bounded Java Structure NBT parsing, deterministic nine-token preparation, duplicate fingerprints, and append-only readiness evidence without acquiring or processing a real candidate.

**Architecture:** Add seven focused pure/local modules beside the existing Stage 7 learning contracts. Each stage consumes the immutable validated result of the previous stage; no downloader, operational payload CLI, Dataset writer, or trainer is introduced. All tests use generated NBT below operating-system temporary roots, and the existing generic NBT parser and private research lane remain unchanged.

**Tech Stack:** Node.js 24.18.0 ESM; built-in `node:assert`, `node:crypto`, `node:fs/promises`, `node:os`, `node:path`, `node:test`, `node:util`, and `node:zlib`; no new dependency and no Python import.

## Global Constraints

- Execute sequentially. Do not use subagents, parallel commands, concurrent acquisition, or concurrent training.
- R2 is synthetic-only. It must not download, copy, inspect, parse, prepare, or fingerprint a real public candidate.
- Do not write any new payload, prepared artifact, fingerprint, or acquisition record below the operational `.local/stage7-source-expansion/` root.
- Do not record a real taxonomy, owner approval, acquisition, completeness, duplicate, quality, Dataset, split, or training decision.
- Do not modify `src/construction/templates/nbt.js`, `src/construction/templates/schematicBlockVolume.js`, the private research corpus or trainer, any formal Dataset reader or manifest, normal Node provider behavior, M3, or M4 Apply Mode.
- Do not modify Dataset v1/v2/v3. Their manifest SHA-256 values must remain:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

- Dataset v3 must remain exactly `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Preserve the private aggregate boundary: 22 active sources, 42 deferred oversized files, 22 source records, 22 prepared records, 22 `64^3` binaries, deterministic 15/7 split, and three existing run directories.
- Do not process the 42 private oversized buildings. Do not crop, scale, resample, tile, split, rotate retained evidence, infer missing modules, or assemble structures.
- R2 supports only independently parseable Minecraft Java Structure NBT. It does not add archive, `.schematic`, `.schem`, `.litematic`, `.mcstructure`, world-save, repository, or multi-file ingestion.
- Keep the production limits exact: 16 MiB raw bytes, 64 MiB inflated bytes, 200:1 compression, depth 32, 1,500,000 tags/container entries, 32 KiB strings, 262,144 block entries, 4,096 palette entries, 16,384 block-entity-bearing entries, and at most 64 actual non-air blocks per axis.
- Preserve the approved nine tokens: 0 air, 1 earth, 2 rock/masonry, 3 wood, 4 glass, 5 stairs/slabs, 6 architectural detail, 7 water, and 8 other/unmapped.
- Token 8 may occupy no more than 10 percent of non-air voxels; a larger share fails closed without a prepared artifact.
- Exact-byte equality is rejected. Structural and MinHash similarity only proposes a near-duplicate for later human review.
- Every R2 record must declare `synthetic_only: true`, `authorizes_acquisition: false`, `authorizes_training: false`, and `authorizes_dataset_admission: false`.
- Do not add an npm script or operational CLI for R2. R3 must receive a separate design, exact five-candidate approval, and implementation plan.
- Use test-driven development for every task: observe the focused test fail before implementation, observe it pass after implementation, then run all prior R2 tests before committing.
- Before every task and at the final gate, run the handoff's read-only Git/private/formal boundary checks. Stop on any drift.

---


## File map

- Create `src/construction/learning/stage7CandidateBoundary.js`: typed safe errors, fixed limits, exact synthetic/operational quarantine path validation, stable descriptor reads, and raw byte hashing.
- Create `src/construction/learning/stage7BoundedNbt.js`: isolated bounded gzip/zlib/uncompressed NBT decoder with complete-consumption and immutable decoded values.
- Create `src/construction/learning/stage7VanillaStructureNbt.js`: strict one-palette Java Structure NBT validation and immutable sparse block-volume output.
- Create `src/construction/learning/stage7ConditionalVoxelPreparation.js`: reviewed nine-token mapping, tight non-air bounds, deterministic centered `64^3` preparation, and content binding.
- Create `src/construction/learning/stage7ConditionalFingerprint.js`: exact structural hashes, four-yaw equivalence, 128-value MinHash signatures, LSH buckets, and evidence-only comparison.
- Create `src/construction/learning/stage7CandidateReadinessState.js`: legal synthetic readiness transitions, terminal failure states, canonical event creation, and event hashing.
- Create `src/construction/learning/stage7CandidateReadinessStore.js`: synthetic-root-only canonical JSONL ledger with per-candidate contiguous revisions, hash-chain validation, and atomic replace.
- Create `test/fixtures/stage7CandidateReadinessFixtures.js`: deterministic NBT encoding helpers, valid Java Structure fixtures, and reusable candidate/event builders.
- Create `test/stage7CandidateBoundary.test.js`: containment, symlink, extension, hash-name, size, and stable-file tests.
- Create `test/stage7BoundedNbt.test.js`: normal compression, grammar, budget, UTF-8, truncation, and trailing-byte tests.
- Create `test/stage7VanillaStructureNbt.test.js`: required shape, coordinates, palette, dependency, and safe-review tests.
- Create `test/stage7ConditionalVoxelPreparation.test.js`: bounds, centering, mapping, determinism, and no-partial-output tests.
- Create `test/stage7ConditionalFingerprint.test.js`: byte, structure, yaw, MinHash, threshold, and non-resampling tests.
- Create `test/stage7CandidateReadinessState.test.js`: legal/illegal transitions, non-authorization, and event-hash tests.
- Create `test/stage7CandidateReadinessStore.test.js`: canonical ledger, hash chain, symlink, revision, and injected-failure tests.
- Create `test/stage7CandidateReadinessIntegration.test.js`: two-run synthetic quarantine-to-audit determinism and exact temporary inventory.
- Create `test/stage7CandidateReadinessBoundary.test.js`: no-network/no-CLI/no-private/no-Dataset/no-training source and documentation boundary.
- Modify `README.md:170-190`: document R2 as a synthetic-only library with no operational command and a separate R3 approval gate.
- Create `docs/superpowers/handoffs/2026-07-20-stage-7-r2-acquisition-parser-readiness-complete.md`: aggregate-only R2 continuation boundary after all verification passes.

---

### Task 1: Quarantine boundary, fixed limits, and safe errors

**Files:**
- Create: `src/construction/learning/stage7CandidateBoundary.js`
- Create: `test/stage7CandidateBoundary.test.js`

**Interfaces:**
- Consumes: `assertSourceExpansionRoot(root, options)` and `CANDIDATE_ID_PATTERN` from the existing source-expansion modules.
- Produces: `CandidateReadinessError`, `CANDIDATE_NBT_LIMITS`, `assertCandidateId`, and `readQuarantinedNbt({ root, candidateId, relativePath, limits }, dependencies)`.
- `readQuarantinedNbt` returns `{ candidate_id, basename, bytes, content_sha256, raw_byte_count }`; `bytes` is the exact buffer later passed to `decodeBoundedNbt`.

- [ ] **Step 1: Write the failing boundary tests**

Create `test/stage7CandidateBoundary.test.js` with the following tests and local helpers:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  readQuarantinedNbt
} from '../src/construction/learning/stage7CandidateBoundary.js';

const CANDIDATE_ID = 'synthetic-source:house-01';

test('quarantine reader returns the exact hash-bound synthetic bytes', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const result = await readQuarantinedNbt(fixture.input, fixture.dependencies);
  assert.equal(result.candidate_id, CANDIDATE_ID);
  assert.equal(result.basename, `${fixture.sha256}.nbt`);
  assert.equal(result.content_sha256, fixture.sha256);
  assert.equal(result.raw_byte_count, fixture.bytes.length);
  assert.deepEqual(result.bytes, fixture.bytes);
  assert.deepEqual(CANDIDATE_NBT_LIMITS, {
    maxRawBytes: 16 * 1024 * 1024,
    maxInflatedBytes: 64 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxDepth: 32,
    maxEntries: 1_500_000,
    maxStringBytes: 32 * 1024,
    maxBlocks: 64 ** 3,
    maxPaletteEntries: 4096,
    maxBlockEntities: 16_384
  });
});

test('quarantine reader rejects path escape, wrong candidate directory, and non-hash names', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  for (const relativePath of [
    '../escape.nbt',
    `quarantine/other:house-01/${fixture.sha256}.nbt`,
    `quarantine/${CANDIDATE_ID}/payload.nbt`,
    `quarantine/${CANDIDATE_ID}/${fixture.sha256}.NBT`
  ]) {
    await assert.rejects(
      readQuarantinedNbt({ ...fixture.input, relativePath }, fixture.dependencies),
      isCandidateError
    );
  }
});

test('quarantine reader rejects a final symlink and an oversized regular file', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const outside = join(fixture.repositoryRoot, 'outside.nbt');
  await writeFile(outside, fixture.bytes);
  await rm(fixture.absolute);
  await symlink(outside, fixture.absolute);
  await assert.rejects(
    readQuarantinedNbt(fixture.input, fixture.dependencies),
    hasCode('QUARANTINE_PATH_SYMLINK')
  );

  await rm(fixture.absolute);
  await writeFile(fixture.absolute, Buffer.alloc(9));
  await assert.rejects(
    readQuarantinedNbt({
      ...fixture.input,
      limits: { ...CANDIDATE_NBT_LIMITS, maxRawBytes: 8 }
    }, fixture.dependencies),
    hasCode('RAW_BYTES_LIMIT')
  );
});

test('quarantine reader rejects a symlink parent and a non-regular final entry', async (t) => {
  const linked = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const candidateDirectory = join(linked.root, 'quarantine', CANDIDATE_ID);
  const outsideDirectory = join(linked.repositoryRoot, 'outside-directory');
  await mkdir(outsideDirectory);
  await writeFile(join(outsideDirectory, `${linked.sha256}.nbt`), linked.bytes);
  await rm(candidateDirectory, { recursive: true });
  await symlink(outsideDirectory, candidateDirectory, 'dir');
  await assert.rejects(
    readQuarantinedNbt(linked.input, linked.dependencies),
    hasCode('QUARANTINE_PATH_SYMLINK')
  );

  const directory = await candidateFile(t, Buffer.from([10, 0, 0, 1]));
  await rm(directory.absolute);
  await mkdir(directory.absolute);
  await assert.rejects(
    readQuarantinedNbt(directory.input, directory.dependencies),
    hasCode('QUARANTINE_NOT_REGULAR')
  );
});

test('quarantine reader rejects a content-addressed filename whose bytes changed', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  await writeFile(fixture.absolute, Buffer.from([10, 0, 0, 0, 0]));
  await assert.rejects(
    readQuarantinedNbt(fixture.input, fixture.dependencies),
    hasCode('CONTENT_HASH_NAME_MISMATCH')
  );
});

test('quarantine reader rejects descriptor identity drift', async (t) => {
  const fixture = await candidateFile(t, Buffer.from([10, 0, 0, 0]));
  const realOpen = fixture.dependencies.openFile;
  fixture.dependencies.openFile = async (...args) => {
    const handle = await realOpen(...args);
    let calls = 0;
    return {
      async stat() {
        const stat = await handle.stat();
        calls += 1;
        return calls === 1 ? stat : Object.assign(Object.create(stat), stat, { ino: stat.ino + 1 });
      },
      readFile: (...readArgs) => handle.readFile(...readArgs),
      close: () => handle.close()
    };
  };
  await assert.rejects(
    readQuarantinedNbt(fixture.input, fixture.dependencies),
    hasCode('FILE_IDENTITY_CHANGED')
  );
});

test('candidate errors expose only a typed safe-detail object', () => {
  const error = new CandidateReadinessError(
    'SAMPLE', 'boundary', CANDIDATE_ID, { basename: 'sample.nbt', byte_count: 4 }
  );
  assert.equal(error.message, `SAMPLE:boundary:${CANDIDATE_ID}`);
  assert.deepEqual(error.safe_detail, { basename: 'sample.nbt', byte_count: 4 });
  assert.equal(Object.isFrozen(error.safe_detail), true);
});

async function candidateFile(t, bytes) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-candidate-boundary-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const root = join(repositoryRoot, '.local', 'stage7-source-expansion');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const relativePath = `quarantine/${CANDIDATE_ID}/${sha256}.nbt`;
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(join(root, 'quarantine', CANDIDATE_ID), { recursive: true });
  await writeFile(absolute, bytes);
  return {
    repositoryRoot, root, sha256, relativePath, absolute, bytes,
    input: { root, candidateId: CANDIDATE_ID, relativePath },
    dependencies: {
      assertRoot: async (value) => value,
      openFile: open
    }
  };
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}

function isCandidateError(error) {
  return error instanceof CandidateReadinessError;
}
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7CandidateBoundary.js`.

- [ ] **Step 3: Implement the quarantine boundary**

Create `src/construction/learning/stage7CandidateBoundary.js` with this implementation shape:

```js
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSourceExpansionRoot } from './stage7SourceExpansionBoundary.js';
import { CANDIDATE_ID_PATTERN } from './stage7SourceExpansionContracts.js';

export const CANDIDATE_NBT_LIMITS = Object.freeze({
  maxRawBytes: 16 * 1024 * 1024,
  maxInflatedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxDepth: 32,
  maxEntries: 1_500_000,
  maxStringBytes: 32 * 1024,
  maxBlocks: 64 ** 3,
  maxPaletteEntries: 4096,
  maxBlockEntities: 16_384
});

export class CandidateReadinessError extends Error {
  constructor(code, stage, candidateId, safeDetail = {}) {
    super(`${code}:${stage}:${candidateId}`);
    this.name = 'CandidateReadinessError';
    this.code = code;
    this.stage = stage;
    this.candidate_id = candidateId;
    this.safe_detail = Object.freeze({ ...safeDetail });
  }
}

export function assertCandidateId(candidateId) {
  if (typeof candidateId !== 'string' || !CANDIDATE_ID_PATTERN.test(candidateId)) {
    fail('CANDIDATE_ID_INVALID', 'boundary', String(candidateId));
  }
  return candidateId;
}

export async function readQuarantinedNbt({
  root,
  candidateId,
  relativePath,
  limits = CANDIDATE_NBT_LIMITS
}, {
  assertRoot = assertSourceExpansionRoot,
  lstat = fs.lstat,
  realpath = fs.realpath,
  openFile = fs.open
} = {}) {
  const id = assertCandidateId(candidateId);
  const validatedRoot = path.resolve(await assertRoot(root));
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  const match = /^([a-f0-9]{64})\.nbt$/u.exec(basename);
  if (!match) fail('QUARANTINE_NAME_INVALID', 'boundary', id, { basename });
  const expected = `quarantine/${id}/${basename}`;
  if (normalized !== expected) {
    fail('QUARANTINE_PATH_INVALID', 'boundary', id, { basename });
  }
  const absolute = path.resolve(validatedRoot, ...normalized.split('/'));
  if (!isInside(validatedRoot, absolute)) {
    fail('QUARANTINE_PATH_ESCAPE', 'boundary', id, { basename });
  }
  await assertParents(validatedRoot, absolute, id, lstat);
  const entry = await safeLstat(absolute, id, basename, lstat);
  if (entry.isSymbolicLink()) {
    fail('QUARANTINE_PATH_SYMLINK', 'boundary', id, { basename });
  }
  if (!entry.isFile()) fail('QUARANTINE_NOT_REGULAR', 'boundary', id, { basename });
  const canonicalRoot = await realpath(validatedRoot);
  const canonicalFile = await realpath(absolute);
  if (!isInside(canonicalRoot, canonicalFile)) {
    fail('QUARANTINE_PATH_ESCAPE', 'boundary', id, { basename });
  }

  const noFollow = Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await openFile(absolute, constants.O_RDONLY | noFollow);
  } catch (error) {
    fail('QUARANTINE_OPEN_FAILED', 'boundary', id, { basename, error_code: error.code || 'UNKNOWN' });
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('QUARANTINE_NOT_REGULAR', 'boundary', id, { basename });
    if (before.size > limits.maxRawBytes) {
      fail('RAW_BYTES_LIMIT', 'boundary', id, { basename, byte_count: before.size });
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameIdentity(before, after) || bytes.length !== before.size) {
      fail('FILE_IDENTITY_CHANGED', 'boundary', id, { basename });
    }
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    if (contentSha256 !== match[1]) {
      fail('CONTENT_HASH_NAME_MISMATCH', 'boundary', id, { basename });
    }
    return Object.freeze({
      candidate_id: id,
      basename,
      bytes,
      content_sha256: contentSha256,
      raw_byte_count: bytes.length
    });
  } finally {
    await handle.close();
  }
}

async function assertParents(root, absolute, candidateId, lstat) {
  const parent = path.dirname(absolute);
  const relative = path.relative(root, parent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const entry = await safeLstat(current, candidateId, path.basename(current), lstat);
    if (entry.isSymbolicLink()) {
      fail('QUARANTINE_PATH_SYMLINK', 'boundary', candidateId, { basename: path.basename(current) });
    }
    if (!entry.isDirectory()) {
      fail('QUARANTINE_PARENT_INVALID', 'boundary', candidateId, { basename: path.basename(current) });
    }
  }
}

async function safeLstat(value, candidateId, basename, lstat) {
  try { return await lstat(value); }
  catch (error) {
    fail('QUARANTINE_PATH_MISSING', 'boundary', candidateId, {
      basename,
      error_code: error.code || 'UNKNOWN'
    });
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
  );
}

function fail(code, stage, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, stage, candidateId, safeDetail);
}
```

Keep the function content-safe: do not place `absolute`, `canonicalFile`, raw bytes, or caught error messages in `safe_detail`.

- [ ] **Step 4: Run the focused test and verify the green state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js
```

Expected: all seven tests pass, zero failures.

- [ ] **Step 5: Run the existing source-expansion boundary tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionCli.test.js test/stage7ConditionalAdmissionBoundary.test.js
```

Expected: exit 0 and no change to existing metadata-only behavior.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/construction/learning/stage7CandidateBoundary.js test/stage7CandidateBoundary.test.js
git commit -m "feat(stage7): add candidate quarantine boundary"
```

---

### Task 2: Bounded NBT decoder and deterministic fixture encoder

**Files:**
- Create: `test/fixtures/stage7CandidateReadinessFixtures.js`
- Create: `src/construction/learning/stage7BoundedNbt.js`
- Create: `test/stage7BoundedNbt.test.js`

**Interfaces:**
- Consumes: `CandidateReadinessError` and `CANDIDATE_NBT_LIMITS` from Task 1.
- Produces: `BOUNDED_NBT_VERSION` and `decodeBoundedNbt(buffer, { candidateId, limits })` returning `{ version, compression, raw_byte_count, inflated_byte_count, root_name, value }`.
- Fixture helpers produce valid deterministic NBT only; no fixture reads a repository or operational payload.

- [ ] **Step 1: Add the synthetic NBT fixture encoder**

Create `test/fixtures/stage7CandidateReadinessFixtures.js` with these exported builders:

```js
import { gzipSync, deflateSync } from 'node:zlib';

const TAG = Object.freeze({
  end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6,
  byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12
});

export function nbtInt(value) { return { type: TAG.int, value }; }
export function nbtString(value) { return { type: TAG.string, value }; }
export function nbtList(childType, value) { return { type: TAG.list, childType, value }; }
export function nbtCompound(value) { return { type: TAG.compound, value }; }

export function encodeNbtRoot(fields, { compression = 'none', rootName = '' } = {}) {
  const raw = Buffer.concat([
    Buffer.from([TAG.compound]), encodeString(rootName), encodeCompoundPayload(fields)
  ]);
  if (compression === 'gzip') return gzipSync(raw, { mtime: 0 });
  if (compression === 'zlib') return deflateSync(raw);
  if (compression !== 'none') throw new Error(`unsupported fixture compression: ${compression}`);
  return raw;
}

export function structureNbt({
  size = [3, 2, 3],
  palette = ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks'],
  blocks = [
    { pos: [0, 0, 0], state: 1 },
    { pos: [1, 0, 0], state: 2 },
    { pos: [2, 1, 2], state: 1 }
  ],
  entities = [],
  extraRoot = {},
  compression = 'none'
} = {}) {
  const paletteTags = palette.map((entry) => nbtCompound({
    Name: nbtString(typeof entry === 'string' ? entry : entry.Name),
    ...(typeof entry === 'object' && entry.Properties
      ? { Properties: nbtCompound(Object.fromEntries(
        Object.entries(entry.Properties).map(([key, value]) => [key, nbtString(value)])
      )) }
      : {})
  }));
  const blockTags = blocks.map((block) => nbtCompound({
    state: nbtInt(block.state),
    pos: nbtList(TAG.int, block.pos.map(nbtInt)),
    ...(block.nbt ? { nbt: nbtCompound(block.nbt) } : {})
  }));
  return encodeNbtRoot({
    DataVersion: nbtInt(3955),
    size: nbtList(TAG.int, size.map(nbtInt)),
    palette: nbtList(TAG.compound, paletteTags),
    blocks: nbtList(TAG.compound, blockTags),
    entities: nbtList(TAG.compound, entities.map((entry) => nbtCompound(entry))),
    ...extraRoot
  }, { compression });
}

function encodeNamed(name, tag) {
  return Buffer.concat([Buffer.from([tag.type]), encodeString(name), encodePayload(tag)]);
}

function encodePayload(tag) {
  if (tag.type === TAG.int) {
    const output = Buffer.alloc(4); output.writeInt32BE(tag.value); return output;
  }
  if (tag.type === TAG.string) return encodeString(tag.value);
  if (tag.type === TAG.list) {
    const length = Buffer.alloc(4); length.writeInt32BE(tag.value.length);
    return Buffer.concat([
      Buffer.from([tag.childType]), length, ...tag.value.map((entry) => encodePayload(entry))
    ]);
  }
  if (tag.type === TAG.compound) return encodeCompoundPayload(tag.value);
  throw new Error(`unsupported fixture tag type: ${tag.type}`);
}

function encodeCompoundPayload(fields) {
  return Buffer.concat([
    ...Object.entries(fields).map(([name, tag]) => encodeNamed(name, tag)),
    Buffer.from([TAG.end])
  ]);
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(2); length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}
```

Do not add file/network helpers to this fixture module.

- [ ] **Step 2: Write the failing bounded-decoder tests**

Create `test/stage7BoundedNbt.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateReadinessError, CANDIDATE_NBT_LIMITS } from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { encodeNbtRoot, nbtCompound, nbtInt, nbtList, nbtString } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('bounded decoder accepts deterministic gzip, zlib, and uncompressed roots', () => {
  for (const compression of ['none', 'gzip', 'zlib']) {
    const bytes = encodeNbtRoot({ value: nbtInt(7) }, { compression });
    const result = decodeBoundedNbt(bytes, { candidateId: ID });
    assert.equal(result.compression, compression);
    assert.equal(result.value.value, 7);
    assert.equal(Object.isFrozen(result.value), true);
    assert.ok(result.inflated_byte_count >= 4);
  }
});

test('bounded decoder refuses depth and entry budgets before unbounded work', () => {
  const deep = encodeNbtRoot({
    a: nbtCompound({ b: nbtCompound({ c: nbtInt(1) }) })
  });
  assert.throws(
    () => decodeBoundedNbt(deep, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxDepth: 2 }
    }),
    hasCode('NBT_DEPTH_LIMIT')
  );
  const list = encodeNbtRoot({ values: nbtList(3, [nbtInt(1), nbtInt(2), nbtInt(3)]) });
  assert.throws(
    () => decodeBoundedNbt(list, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxEntries: 2 }
    }),
    hasCode('NBT_ENTRY_LIMIT')
  );
});

test('bounded decoder refuses oversized strings, invalid UTF-8, truncation, and trailing bytes', () => {
  const string = encodeNbtRoot({ value: nbtString('abcd') });
  assert.throws(
    () => decodeBoundedNbt(string, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxStringBytes: 3 }
    }),
    hasCode('NBT_STRING_LIMIT')
  );
  const invalidUtf8 = Buffer.from([10, 0, 0, 8, 0, 1, 0x61, 0, 1, 0xff, 0]);
  assert.throws(() => decodeBoundedNbt(invalidUtf8, { candidateId: ID }), hasCode('NBT_UTF8_INVALID'));
  assert.throws(() => decodeBoundedNbt(string.subarray(0, -1), { candidateId: ID }), hasCode('NBT_TRUNCATED'));
  assert.throws(
    () => decodeBoundedNbt(Buffer.concat([string, Buffer.from([1])]), { candidateId: ID }),
    hasCode('NBT_TRAILING_BYTES')
  );
});

test('bounded decoder refuses duplicate compound names and invalid tag types', () => {
  const duplicate = Buffer.from([
    10, 0, 0,
    3, 0, 1, 0x61, 0, 0, 0, 1,
    3, 0, 1, 0x61, 0, 0, 0, 2,
    0
  ]);
  assert.throws(() => decodeBoundedNbt(duplicate, { candidateId: ID }), hasCode('NBT_DUPLICATE_NAME'));
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([10, 0, 0, 99, 0, 0, 0]), { candidateId: ID }),
    hasCode('NBT_TAG_INVALID')
  );
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([0x78, 0x9c, 0xff]), { candidateId: ID }),
    hasCode('NBT_DECOMPRESSION_FAILED')
  );
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([0x50, 0x4b, 0x03, 0x04]), { candidateId: ID }),
    hasCode('NBT_CONTAINER_UNSUPPORTED')
  );
});

test('bounded decoder refuses hostile declared array and list lengths before allocation', () => {
  const hugeIntArray = Buffer.from([
    10, 0, 0, 11, 0, 1, 0x61, 0x7f, 0xff, 0xff, 0xff
  ]);
  assert.throws(
    () => decodeBoundedNbt(hugeIntArray, { candidateId: ID }),
    hasCode('NBT_ENTRY_LIMIT')
  );
  const negativeList = Buffer.from([
    10, 0, 0, 9, 0, 1, 0x61, 3, 0xff, 0xff, 0xff, 0xff
  ]);
  assert.throws(
    () => decodeBoundedNbt(negativeList, { candidateId: ID }),
    hasCode('NBT_LIST_LENGTH_INVALID')
  );
});

test('bounded decoder refuses inflated-byte and compression-ratio limits', () => {
  const bytes = encodeNbtRoot({ value: nbtString('x'.repeat(2048)) }, { compression: 'gzip' });
  assert.throws(
    () => decodeBoundedNbt(bytes, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxInflatedBytes: 128 }
    }),
    hasCode('NBT_INFLATED_LIMIT')
  );
  assert.throws(
    () => decodeBoundedNbt(bytes, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxCompressionRatio: 2 }
    }),
    hasCode('NBT_COMPRESSION_RATIO')
  );
});

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
```

- [ ] **Step 3: Run the decoder test and verify the red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7BoundedNbt.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7BoundedNbt.js`.

- [ ] **Step 4: Implement the isolated bounded decoder**

Create `src/construction/learning/stage7BoundedNbt.js`. The implementation must use this public contract and these exact refusal codes:

```js
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { gunzipSync, inflateSync } from 'node:zlib';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  assertCandidateId
} from './stage7CandidateBoundary.js';

export const BOUNDED_NBT_VERSION = 'stage7-bounded-nbt-v1';

const TAG = Object.freeze({
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12
});
const VALID_TYPES = new Set(Object.values(TAG));
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export function decodeBoundedNbt(buffer, {
  candidateId,
  limits = CANDIDATE_NBT_LIMITS
} = {}) {
  const id = assertCandidateId(candidateId);
  if (!Buffer.isBuffer(buffer)) fail('NBT_INPUT_INVALID', id);
  if (buffer.length > limits.maxRawBytes) {
    fail('RAW_BYTES_LIMIT', id, { byte_count: buffer.length });
  }
  const inflated = inflateBounded(buffer, limits, id);
  const ratio = inflated.bytes.length / Math.max(1, buffer.length);
  if (ratio > limits.maxCompressionRatio) {
    fail('NBT_COMPRESSION_RATIO', id, {
      raw_byte_count: buffer.length,
      inflated_byte_count: inflated.bytes.length
    });
  }
  const reader = new Reader(inflated.bytes, limits, id);
  const type = reader.u8();
  if (type !== TAG.COMPOUND) fail('NBT_ROOT_INVALID', id, { tag_type: type });
  const rootName = reader.string();
  const value = reader.payload(TAG.COMPOUND, 1, false);
  if (reader.offset !== inflated.bytes.length) {
    fail('NBT_TRAILING_BYTES', id, { trailing_byte_count: inflated.bytes.length - reader.offset });
  }
  return Object.freeze({
    version: BOUNDED_NBT_VERSION,
    compression: inflated.compression,
    raw_byte_count: buffer.length,
    inflated_byte_count: inflated.bytes.length,
    root_name: rootName,
    value
  });
}

function inflateBounded(buffer, limits, candidateId) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) fail('NBT_CONTAINER_UNSUPPORTED', candidateId);
  const options = { maxOutputLength: limits.maxInflatedBytes };
  try {
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return { compression: 'gzip', bytes: gunzipSync(buffer, options) };
    }
    if (isZlib(buffer)) {
      return { compression: 'zlib', bytes: inflateSync(buffer, options) };
    }
  } catch (error) {
    if (error.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|larger than/u.test(error.message || '')) {
      fail('NBT_INFLATED_LIMIT', candidateId, { max_inflated_bytes: limits.maxInflatedBytes });
    }
    fail('NBT_DECOMPRESSION_FAILED', candidateId);
  }
  if (buffer.length > limits.maxInflatedBytes) {
    fail('NBT_INFLATED_LIMIT', candidateId, { max_inflated_bytes: limits.maxInflatedBytes });
  }
  return { compression: 'none', bytes: buffer };
}

function isZlib(buffer) {
  if (buffer.length < 2) return false;
  const header = (buffer[0] << 8) | buffer[1];
  return (buffer[0] & 0x0f) === 8 && header % 31 === 0;
}

class Reader {
  constructor(buffer, limits, candidateId) {
    this.buffer = buffer;
    this.limits = limits;
    this.candidateId = candidateId;
    this.offset = 0;
    this.entries = 0;
  }

  payload(type, depth, charge = true) {
    if (!VALID_TYPES.has(type) || type === TAG.END) fail('NBT_TAG_INVALID', this.candidateId, { tag_type: type });
    if (depth > this.limits.maxDepth) fail('NBT_DEPTH_LIMIT', this.candidateId, { depth });
    if (charge) this.charge(1);
    if (type === TAG.BYTE) return this.i8();
    if (type === TAG.SHORT) return this.i16();
    if (type === TAG.INT) return this.i32();
    if (type === TAG.LONG) return this.i64();
    if (type === TAG.FLOAT) return this.f32();
    if (type === TAG.DOUBLE) return this.f64();
    if (type === TAG.STRING) return this.string();
    if (type === TAG.BYTE_ARRAY) return this.arrayDescriptor('byte', 1);
    if (type === TAG.INT_ARRAY) return this.arrayDescriptor('int', 4);
    if (type === TAG.LONG_ARRAY) return this.arrayDescriptor('long', 8);
    if (type === TAG.LIST) return this.list(depth);
    if (type === TAG.COMPOUND) return this.compound(depth);
    fail('NBT_TAG_INVALID', this.candidateId, { tag_type: type });
  }

  list(depth) {
    const childType = this.u8();
    const length = this.length('NBT_LIST_LENGTH_INVALID');
    if (length > 0 && (!VALID_TYPES.has(childType) || childType === TAG.END)) {
      fail('NBT_TAG_INVALID', this.candidateId, { tag_type: childType });
    }
    this.charge(length);
    const output = [];
    for (let index = 0; index < length; index += 1) {
      output.push(this.payload(childType, depth + 1, false));
    }
    return Object.freeze(output);
  }

  compound(depth) {
    const output = {};
    while (true) {
      const type = this.u8();
      if (type === TAG.END) return Object.freeze(output);
      if (!VALID_TYPES.has(type)) fail('NBT_TAG_INVALID', this.candidateId, { tag_type: type });
      const name = this.string();
      if (Object.hasOwn(output, name)) fail('NBT_DUPLICATE_NAME', this.candidateId);
      output[name] = this.payload(type, depth + 1);
    }
  }

  arrayDescriptor(kind, width) {
    const length = this.length('NBT_ARRAY_LENGTH_INVALID');
    this.charge(length);
    const byteLength = length * width;
    if (!Number.isSafeInteger(byteLength)) fail('NBT_ARRAY_LENGTH_INVALID', this.candidateId);
    this.ensure(byteLength);
    const start = this.offset;
    this.offset += byteLength;
    return Object.freeze({
      nbt_array: kind,
      length,
      sha256: createHash('sha256').update(this.buffer.subarray(start, this.offset)).digest('hex')
    });
  }

  string() {
    const length = this.u16();
    if (length > this.limits.maxStringBytes) {
      fail('NBT_STRING_LIMIT', this.candidateId, { string_byte_count: length });
    }
    this.ensure(length);
    const bytes = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    try { return UTF8.decode(bytes); }
    catch { fail('NBT_UTF8_INVALID', this.candidateId, { string_byte_count: length }); }
  }

  length(code) {
    const value = this.i32();
    if (value < 0) fail(code, this.candidateId, { declared_length: value });
    return value;
  }

  charge(count) {
    if (!Number.isSafeInteger(count) || count < 0 || this.entries + count > this.limits.maxEntries) {
      fail('NBT_ENTRY_LIMIT', this.candidateId, { entry_count: this.entries + count });
    }
    this.entries += count;
  }

  ensure(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.buffer.length) {
      fail('NBT_TRUNCATED', this.candidateId, { byte_offset: this.offset });
    }
  }

  u8() { this.ensure(1); const value = this.buffer.readUInt8(this.offset); this.offset += 1; return value; }
  i8() { this.ensure(1); const value = this.buffer.readInt8(this.offset); this.offset += 1; return value; }
  u16() { this.ensure(2); const value = this.buffer.readUInt16BE(this.offset); this.offset += 2; return value; }
  i16() { this.ensure(2); const value = this.buffer.readInt16BE(this.offset); this.offset += 2; return value; }
  i32() { this.ensure(4); const value = this.buffer.readInt32BE(this.offset); this.offset += 4; return value; }
  i64() { this.ensure(8); const value = this.buffer.readBigInt64BE(this.offset); this.offset += 8; return value; }
  f32() { this.ensure(4); const value = this.buffer.readFloatBE(this.offset); this.offset += 4; return value; }
  f64() { this.ensure(8); const value = this.buffer.readDoubleBE(this.offset); this.offset += 8; return value; }
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'nbt', candidateId, safeDetail);
}
```

Do not import or modify `src/construction/templates/nbt.js`. Array payloads remain immutable hash/length descriptors because R2 does not need their contents.

- [ ] **Step 5: Run the bounded-decoder and boundary tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js
```

Expected: all Task 1 and Task 2 tests pass, zero failures.

- [ ] **Step 6: Commit Task 2**

```bash
git add test/fixtures/stage7CandidateReadinessFixtures.js src/construction/learning/stage7BoundedNbt.js test/stage7BoundedNbt.test.js
git commit -m "feat(stage7): add bounded candidate NBT decoder"
```

---

### Task 3: Java Structure NBT adapter

**Files:**
- Create: `src/construction/learning/stage7VanillaStructureNbt.js`
- Create: `test/stage7VanillaStructureNbt.test.js`

**Interfaces:**
- Consumes: immutable decoded root from `decodeBoundedNbt` and fixed limits from Task 1.
- Produces: `VANILLA_STRUCTURE_ADAPTER_VERSION`, `isAirIdentifier(name)`, and `validateVanillaStructureNbt(decoded, { candidateId, limits })`.
- The returned sparse volume contains declared size, canonical palette entries, blocks, entity counts, block-entity count, actual non-air bounds, and `source_orientation: 'source'`.

- [ ] **Step 1: Write the failing Java Structure adapter tests**

Create `test/stage7VanillaStructureNbt.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError
} from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { nbtString, structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('adapter validates one independent sparse Java structure', () => {
  const volume = decode(structureNbt({
    palette: [
      'minecraft:air',
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'north' } },
      'minecraft:stone_bricks'
    ],
    blocks: [
      { pos: [0, 0, 0], state: 0 },
      { pos: [1, 0, 0], state: 1 },
      { pos: [2, 1, 2], state: 2, nbt: { Custom: nbtString('ignored') } }
    ]
  }));
  assert.deepEqual(volume.declared_size, { x: 3, y: 2, z: 3 });
  assert.equal(volume.palette[1].canonical_state, 'minecraft:oak_stairs[facing=north]');
  assert.equal(volume.blocks.length, 3);
  assert.equal(volume.block_entity_count, 1);
  assert.deepEqual(volume.non_air_bounds, {
    min: { x: 1, y: 0, z: 0 },
    max: { x: 2, y: 1, z: 2 },
    extent: { x: 2, y: 2, z: 3 }
  });
  assert.equal(volume.source_orientation, 'source');
});

test('adapter rejects missing, multi-palette, empty, coordinate, and palette failures', () => {
  const valid = decodeBoundedNbt(structureNbt(), { candidateId: ID });
  for (const [code, value] of [
    ['STRUCTURE_FIELDS_INVALID', { ...valid, value: { ...valid.value, blocks: undefined } }],
    ['STRUCTURE_MULTI_PALETTE', { ...valid, value: { ...valid.value, palettes: [], palette: undefined } }]
  ]) {
    assert.throws(() => validateVanillaStructureNbt(value, { candidateId: ID }), hasCode(code));
  }
  assert.throws(
    () => decode(structureNbt({ blocks: [{ pos: [3, 0, 0], state: 1 }] })),
    hasCode('STRUCTURE_COORDINATE_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({ blocks: [{ pos: [0, 0, 0], state: 99 }] })),
    hasCode('STRUCTURE_PALETTE_INDEX_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({ blocks: [{ pos: [0, 0, 0], state: 0 }] })),
    hasCode('STRUCTURE_EMPTY')
  );
});

test('adapter rejects duplicate coordinates and over-budget palette or blocks', () => {
  assert.throws(
    () => decode(structureNbt({
      blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [0, 0, 0], state: 1 }]
    })),
    hasCode('STRUCTURE_COORDINATE_DUPLICATE')
  );
  assert.throws(
    () => validateVanillaStructureNbt(
      decodeBoundedNbt(structureNbt(), { candidateId: ID }),
      { candidateId: ID, limits: { maxPaletteEntries: 1, maxBlocks: 1, maxBlockEntities: 1 } }
    ),
    (error) => ['STRUCTURE_PALETTE_LIMIT', 'STRUCTURE_BLOCK_LIMIT'].includes(error.code)
  );
  const withBlockEntity = decodeBoundedNbt(structureNbt({
    blocks: [{ pos: [0, 0, 0], state: 1, nbt: { Custom: nbtString('ignored') } }]
  }), { candidateId: ID });
  assert.throws(
    () => validateVanillaStructureNbt(withBlockEntity, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxBlockEntities: 0 }
    }),
    hasCode('STRUCTURE_BLOCK_ENTITY_LIMIT')
  );
});

test('adapter defers jigsaw, structure-block, and command-block evidence without reading commands', () => {
  for (const [identifier, code] of [
    ['minecraft:jigsaw', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:structure_block', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:command_block', 'SECURITY_REVIEW_REQUIRED']
  ]) {
    assert.throws(
      () => decode(structureNbt({ palette: ['minecraft:air', identifier], blocks: [{ pos: [0, 0, 0], state: 1 }] })),
      hasCode(code)
    );
  }
});

test('adapter rejects invalid resource identifiers and unsafe property shapes', () => {
  assert.throws(
    () => decode(structureNbt({ palette: ['minecraft:air', '../stone'], blocks: [{ pos: [0, 0, 0], state: 1 }] })),
    hasCode('STRUCTURE_BLOCK_ID_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({
      palette: [
        'minecraft:air',
        { Name: 'minecraft:stone', Properties: { facing: 'north\nunsafe' } }
      ],
      blocks: [{ pos: [0, 0, 0], state: 1 }]
    })),
    hasCode('STRUCTURE_PROPERTIES_INVALID')
  );
});

function decode(bytes) {
  return validateVanillaStructureNbt(
    decodeBoundedNbt(bytes, { candidateId: ID }),
    { candidateId: ID }
  );
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
```

- [ ] **Step 2: Run the adapter test and verify the red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7VanillaStructureNbt.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7VanillaStructureNbt.js`.

- [ ] **Step 3: Implement strict one-palette validation**

Create `src/construction/learning/stage7VanillaStructureNbt.js`:

```js
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  assertCandidateId
} from './stage7CandidateBoundary.js';
import { BOUNDED_NBT_VERSION } from './stage7BoundedNbt.js';

export const VANILLA_STRUCTURE_ADAPTER_VERSION = 'stage7-java-structure-nbt-v1';
const RESOURCE_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/u;
const PROPERTY_NAME = /^[a-z0-9_]+$/u;
const PROPERTY_VALUE = /^[a-z0-9_.-]+$/u;
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const EXTERNAL = new Set(['minecraft:jigsaw', 'minecraft:structure_block']);
const COMMAND = new Set([
  'minecraft:command_block',
  'minecraft:chain_command_block',
  'minecraft:repeating_command_block'
]);

export function isAirIdentifier(value) { return AIR.has(value); }

export function validateVanillaStructureNbt(decoded, {
  candidateId,
  limits = CANDIDATE_NBT_LIMITS
} = {}) {
  const id = assertCandidateId(candidateId);
  if (!decoded || decoded.version !== BOUNDED_NBT_VERSION || !plain(decoded.value)) {
    fail('STRUCTURE_INPUT_INVALID', id);
  }
  const root = decoded.value;
  if (root.palettes !== undefined) fail('STRUCTURE_MULTI_PALETTE', id);
  if (!Array.isArray(root.size) || !Array.isArray(root.palette) || !Array.isArray(root.blocks)) {
    fail('STRUCTURE_FIELDS_INVALID', id);
  }
  const size = dimensions(root.size, id);
  if (root.palette.length === 0 || root.palette.length > limits.maxPaletteEntries) {
    fail('STRUCTURE_PALETTE_LIMIT', id, { palette_count: root.palette.length });
  }
  if (root.blocks.length === 0 || root.blocks.length > limits.maxBlocks) {
    fail('STRUCTURE_BLOCK_LIMIT', id, { block_count: root.blocks.length });
  }
  const palette = Object.freeze(root.palette.map((entry) => paletteEntry(entry, id)));
  const seen = new Set();
  let blockEntityCount = 0;
  const blocks = root.blocks.map((entry) => {
    if (!plain(entry) || !Number.isSafeInteger(entry.state) || !Array.isArray(entry.pos)
      || entry.pos.length !== 3 || !entry.pos.every(Number.isSafeInteger)) {
      fail('STRUCTURE_BLOCK_INVALID', id);
    }
    if (entry.state < 0 || entry.state >= palette.length) {
      fail('STRUCTURE_PALETTE_INDEX_INVALID', id, { palette_index: entry.state });
    }
    const [x, y, z] = entry.pos;
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) {
      fail('STRUCTURE_COORDINATE_INVALID', id, { x, y, z });
    }
    const key = `${x},${y},${z}`;
    if (seen.has(key)) fail('STRUCTURE_COORDINATE_DUPLICATE', id, { x, y, z });
    seen.add(key);
    const name = palette[entry.state].name;
    if (EXTERNAL.has(name)) fail('STRUCTURE_EXTERNAL_DEPENDENCY', id);
    if (COMMAND.has(name)) fail('SECURITY_REVIEW_REQUIRED', id);
    const blockEntityPresent = entry.nbt !== undefined;
    if (blockEntityPresent && !plain(entry.nbt)) fail('STRUCTURE_BLOCK_ENTITY_INVALID', id);
    if (blockEntityPresent) blockEntityCount += 1;
    return Object.freeze({ x, y, z, palette_index: entry.state, block_entity_present: blockEntityPresent });
  });
  if (blockEntityCount > limits.maxBlockEntities) {
    fail('STRUCTURE_BLOCK_ENTITY_LIMIT', id, { block_entity_count: blockEntityCount });
  }
  const nonAir = blocks.filter((block) => !isAirIdentifier(palette[block.palette_index].name));
  if (nonAir.length === 0) fail('STRUCTURE_EMPTY', id);
  const bounds = boundsOf(nonAir);
  return Object.freeze({
    version: VANILLA_STRUCTURE_ADAPTER_VERSION,
    parser_version: decoded.version,
    candidate_id: id,
    source_orientation: 'source',
    declared_size: Object.freeze(size),
    palette,
    blocks: Object.freeze(blocks),
    entity_count: Array.isArray(root.entities) ? root.entities.length : 0,
    block_entity_count: blockEntityCount,
    non_air_bounds: bounds
  });
}

function dimensions(value, candidateId) {
  if (value.length !== 3 || !value.every((item) => Number.isSafeInteger(item) && item > 0)) {
    fail('STRUCTURE_SIZE_INVALID', candidateId);
  }
  return { x: value[0], y: value[1], z: value[2] };
}

function paletteEntry(entry, candidateId) {
  if (!plain(entry) || typeof entry.Name !== 'string' || !RESOURCE_ID.test(entry.Name)
    || entry.Name.split(':')[1].split('/').includes('..')) {
    fail('STRUCTURE_BLOCK_ID_INVALID', candidateId);
  }
  const properties = entry.Properties === undefined ? {} : entry.Properties;
  if (!plain(properties) || Object.entries(properties).some(([key, value]) =>
    !PROPERTY_NAME.test(key) || typeof value !== 'string' || !PROPERTY_VALUE.test(value))) {
    fail('STRUCTURE_PROPERTIES_INVALID', candidateId);
  }
  const sorted = Object.entries(properties).sort(([left], [right]) => left.localeCompare(right));
  const suffix = sorted.length
    ? `[${sorted.map(([key, value]) => `${key}=${value}`).join(',')}]`
    : '';
  return Object.freeze({
    name: entry.Name,
    properties: Object.freeze(Object.fromEntries(sorted)),
    canonical_state: `${entry.Name}${suffix}`
  });
}

function boundsOf(blocks) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -1, y: -1, z: -1 };
  for (const block of blocks) {
    min.x = Math.min(min.x, block.x); min.y = Math.min(min.y, block.y); min.z = Math.min(min.z, block.z);
    max.x = Math.max(max.x, block.x); max.y = Math.max(max.y, block.y); max.z = Math.max(max.z, block.z);
  }
  return Object.freeze({
    min: Object.freeze(min),
    max: Object.freeze(max),
    extent: Object.freeze({
      x: max.x - min.x + 1,
      y: max.y - min.y + 1,
      z: max.z - min.z + 1
    })
  });
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'structure', candidateId, safeDetail);
}
```

Do not expose block-entity or entity contents. Only their counts and per-block presence flags survive.

- [ ] **Step 4: Run Tasks 1-3 tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js
```

Expected: all focused tests pass, zero failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/construction/learning/stage7VanillaStructureNbt.js test/stage7VanillaStructureNbt.test.js test/fixtures/stage7CandidateReadinessFixtures.js
git commit -m "feat(stage7): validate Java structure NBT"
```

---
### Task 4: Deterministic nine-token voxel preparation

**Files:**
- Create: `src/construction/learning/stage7ConditionalVoxelPreparation.js`
- Create: `test/stage7ConditionalVoxelPreparation.test.js`

**Interfaces:**
- Consumes: the sparse immutable volume returned by Task 3 and a 64-character `contentSha256` from Task 1.
- Produces: `CONDITIONAL_MATERIAL_MAPPING_VERSION`, `CONDITIONAL_PREPARATION_VERSION`, `CONDITIONAL_MATERIAL_MAPPING_SHA256`, `mapConditionalMaterial(identifier)`, and `prepareConditionalVolume({ candidateId, contentSha256, volume })`.
- Returns `{ voxels, record }`; `voxels` is an unwritten 262,144-byte Buffer and `record` binds bounds, offsets, material profile, versions, and hashes.

- [ ] **Step 1: Write the failing preparation tests**

Create `test/stage7ConditionalVoxelPreparation.test.js`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import {
  CONDITIONAL_MATERIAL_MAPPING_SHA256,
  prepareConditionalVolume
} from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('preparation centers tight bounds without retaining empty source padding', () => {
  const prepared = prepare({
    size: [20, 20, 20],
    palette: ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks'],
    blocks: [
      { pos: [8, 7, 9], state: 1 },
      { pos: [9, 8, 10], state: 2 }
    ]
  });
  assert.equal(prepared.voxels.length, 64 ** 3);
  assert.deepEqual(prepared.record.actual_extent, { x: 2, y: 2, z: 2 });
  assert.deepEqual(prepared.record.translation_offset, { x: 31, y: 31, z: 31 });
  assert.equal(prepared.voxels[index(31, 31, 31)], 2);
  assert.equal(prepared.voxels[index(32, 32, 32)], 3);
  assert.equal(prepared.record.mapping_sha256, CONDITIONAL_MATERIAL_MAPPING_SHA256);

  const oddExtent = prepare({
    size: [7, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [
      { pos: [2, 0, 0], state: 1 },
      { pos: [3, 0, 0], state: 1 },
      { pos: [4, 0, 0], state: 1 }
    ]
  });
  assert.deepEqual(oddExtent.record.translation_offset, { x: 30, y: 31, z: 31 });
  assert.deepEqual(oddExtent.record.actual_extent, { x: 3, y: 1, z: 1 });
});

test('preparation maps every approved token class and is byte deterministic', () => {
  const palette = [
    'minecraft:air', 'minecraft:dirt', 'minecraft:stone_bricks',
    'minecraft:oak_planks', 'minecraft:glass', 'minecraft:oak_stairs',
    'minecraft:lantern', 'minecraft:water', 'modded:unknown_machine'
  ];
  const blocks = [
    ...palette.slice(1).map((name, x) => ({ pos: [x, 0, 0], state: x + 1 })),
    { pos: [8, 0, 0], state: 2 },
    { pos: [9, 0, 0], state: 2 }
  ];
  const first = prepare({ size: [10, 1, 1], palette, blocks });
  const second = prepare({ size: [10, 1, 1], palette, blocks });
  const tokens = [...first.voxels].filter((value) => value !== 0);
  assert.deepEqual(tokens, [1, 2, 3, 4, 5, 6, 7, 8, 2, 2]);
  assert.deepEqual(second.voxels, first.voxels);
  assert.deepEqual(second.record, first.record);
  assert.match(first.record.voxel_sha256, /^[a-f0-9]{64}$/u);
  assert.match(first.record.preparation_sha256, /^[a-f0-9]{64}$/u);
});

test('preparation permits exactly ten percent token 8 and rejects more', () => {
  const ten = Array.from({ length: 10 }, (_, x) => ({ pos: [x, 0, 0], state: x === 9 ? 2 : 1 }));
  const valid = prepare({
    size: [10, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone', 'modded:unknown'],
    blocks: ten
  });
  assert.equal(valid.record.token_counts[8], 1);
  assert.equal(valid.record.token_8_share, 0.1);
  const eleven = Array.from({ length: 10 }, (_, x) => ({ pos: [x, 0, 0], state: x >= 8 ? 2 : 1 }));
  assert.throws(
    () => prepare({
      size: [10, 1, 1],
      palette: ['minecraft:air', 'minecraft:stone', 'modded:unknown'],
      blocks: eleven
    }),
    hasCode('MATERIAL_UNMAPPED_LIMIT')
  );
});

test('preparation accepts extent 64 and defers extent 65 without an artifact', () => {
  assert.doesNotThrow(() => prepare({
    size: [64, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [63, 0, 0], state: 1 }]
  }));
  assert.throws(() => prepare({
    size: [65, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [64, 0, 0], state: 1 }]
  }), hasCode('VOLUME_TOO_LARGE'));
});

function prepare(options) {
  const bytes = structureNbt(options);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const decoded = decodeBoundedNbt(bytes, { candidateId: ID });
  const volume = validateVanillaStructureNbt(decoded, { candidateId: ID });
  return prepareConditionalVolume({ candidateId: ID, contentSha256, volume });
}

function index(x, y, z) { return y * 64 * 64 + z * 64 + x; }
function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
```

- [ ] **Step 2: Run the preparation test and verify the red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalVoxelPreparation.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7ConditionalVoxelPreparation.js`.

- [ ] **Step 3: Implement versioned mapping and centered preparation**

Create `src/construction/learning/stage7ConditionalVoxelPreparation.js` with this exact public behavior:

```js
import { createHash } from 'node:crypto';
import {
  CandidateReadinessError,
  assertCandidateId
} from './stage7CandidateBoundary.js';
import {
  VANILLA_STRUCTURE_ADAPTER_VERSION,
  isAirIdentifier
} from './stage7VanillaStructureNbt.js';

export const CONDITIONAL_MATERIAL_MAPPING_VERSION = 'stage7-conditional-material-map-v1';
export const CONDITIONAL_PREPARATION_VERSION = 'stage7-conditional-voxel-preparation-v1';
const GRID = 64;
const RULES = Object.freeze([
  { token: 7, source: '(water|bubble_column)$' },
  { token: 5, source: '(stairs?|slab)$' },
  { token: 4, source: '(glass|glass_pane|stained_glass|stained_glass_pane)$' },
  { token: 6, source: '(torch|lantern|lamp|fence|wall|bars|door|trapdoor|gate|button|pressure_plate|ladder|leaves|vine|flower|banner|bed|chest|barrel|bookshelf|carpet|chain)$' },
  { token: 1, source: '(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|soul_sand|red_sand|terracotta|farmland)$' },
  { token: 2, source: '(stone|cobblestone|deepslate|blackstone|basalt|tuff|calcite|andesite|diorite|granite|bricks|stone_bricks|quartz_block|sandstone|prismarine|end_stone|netherrack|obsidian|purpur_block)$' },
  { token: 3, source: '(planks|log|wood|stem|hyphae|stripped_[a-z0-9_]+|wool)$' }
]);
const COMPILED_RULES = RULES.map((rule) => ({ token: rule.token, pattern: new RegExp(rule.source, 'u') }));
export const CONDITIONAL_MATERIAL_MAPPING_SHA256 = createHash('sha256')
  .update(JSON.stringify({ version: CONDITIONAL_MATERIAL_MAPPING_VERSION, rules: RULES }))
  .digest('hex');

export function mapConditionalMaterial(identifier) {
  if (isAirIdentifier(identifier)) return Object.freeze({ token: 0, mapped: true });
  const local = String(identifier).split(':')[1] || '';
  const match = COMPILED_RULES.find((rule) => rule.pattern.test(local));
  return Object.freeze(match
    ? { token: match.token, mapped: true }
    : { token: 8, mapped: false });
}

export function prepareConditionalVolume({ candidateId, contentSha256, volume }) {
  const id = assertCandidateId(candidateId);
  if (!/^[a-f0-9]{64}$/u.test(contentSha256 || '')) fail('CONTENT_HASH_INVALID', id);
  if (!volume || volume.version !== VANILLA_STRUCTURE_ADAPTER_VERSION
    || volume.candidate_id !== id) fail('PREPARATION_INPUT_INVALID', id);
  const extent = volume.non_air_bounds.extent;
  if ([extent.x, extent.y, extent.z].some((value) => value > GRID)) {
    fail('VOLUME_TOO_LARGE', id, { x: extent.x, y: extent.y, z: extent.z });
  }
  const offset = Object.freeze({
    x: Math.floor((GRID - extent.x) / 2),
    y: Math.floor((GRID - extent.y) / 2),
    z: Math.floor((GRID - extent.z) / 2)
  });
  const voxels = Buffer.alloc(GRID ** 3);
  const counts = Array(9).fill(0);
  let nonAirCount = 0;
  for (const block of volume.blocks) {
    const palette = volume.palette[block.palette_index];
    const mapping = mapConditionalMaterial(palette.name);
    if (mapping.token === 0) continue;
    const x = offset.x + block.x - volume.non_air_bounds.min.x;
    const y = offset.y + block.y - volume.non_air_bounds.min.y;
    const z = offset.z + block.z - volume.non_air_bounds.min.z;
    voxels[y * GRID * GRID + z * GRID + x] = mapping.token;
    counts[mapping.token] += 1;
    nonAirCount += 1;
  }
  if (nonAirCount === 0) fail('VOLUME_EMPTY', id);
  counts[0] = GRID ** 3 - nonAirCount;
  const token8Share = counts[8] / nonAirCount;
  if (token8Share > 0.1 + Number.EPSILON) {
    fail('MATERIAL_UNMAPPED_LIMIT', id, {
      non_air_count: nonAirCount,
      token_8_count: counts[8]
    });
  }
  const voxelSha256 = createHash('sha256').update(voxels).digest('hex');
  const binding = {
    source: CONDITIONAL_PREPARATION_VERSION,
    candidate_id: id,
    content_sha256: contentSha256,
    parser_version: volume.parser_version,
    adapter_version: volume.version,
    mapping_version: CONDITIONAL_MATERIAL_MAPPING_VERSION,
    mapping_sha256: CONDITIONAL_MATERIAL_MAPPING_SHA256,
    declared_size: volume.declared_size,
    actual_bounds: volume.non_air_bounds,
    actual_extent: extent,
    translation_offset: offset,
    source_orientation: volume.source_orientation,
    shape: [GRID, GRID, GRID],
    token_counts: counts,
    token_proportions: counts.map((count) => count / (GRID ** 3)),
    non_air_count: nonAirCount,
    token_8_share: token8Share,
    entity_count: volume.entity_count,
    block_entity_count: volume.block_entity_count,
    voxel_sha256: voxelSha256,
    synthetic_only: true,
    authorizes_acquisition: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  };
  const preparationSha256 = createHash('sha256').update(canonical(binding)).digest('hex');
  return Object.freeze({
    voxels,
    record: deepFreeze({ ...binding, preparation_sha256: preparationSha256 })
  });
}

function canonical(value) {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'preparation', candidateId, safeDetail);
}
```

The implementation intentionally does not expose a write function. A rejected mapping or oversize case therefore cannot leave a partial prepared file.

- [ ] **Step 4: Run Tasks 1-4 tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js test/stage7ConditionalVoxelPreparation.test.js
```

Expected: all focused tests pass, zero failures.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/construction/learning/stage7ConditionalVoxelPreparation.js test/stage7ConditionalVoxelPreparation.test.js
git commit -m "feat(stage7): prepare conditional voxel candidates"
```

---

### Task 5: Structural, yaw, MinHash, and LSH fingerprints

**Files:**
- Create: `src/construction/learning/stage7ConditionalFingerprint.js`
- Create: `test/stage7ConditionalFingerprint.test.js`

**Interfaces:**
- Consumes: `{ voxels, record }` from Task 4.
- Produces: `CONDITIONAL_FINGERPRINT_VERSION`, `fingerprintConditionalVolume(prepared)`, and `compareConditionalFingerprints(left, right)`.
- Comparison returns exact-byte evidence, structural-equivalence evidence, best estimated similarities, shared-LSH evidence, and `near_duplicate_proposed`; it never creates or mutates a cluster.

- [ ] **Step 1: Write the failing fingerprint tests**

Create `test/stage7ConditionalFingerprint.test.js`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import {
  compareConditionalFingerprints,
  fingerprintConditionalVolume
} from '../src/construction/learning/stage7ConditionalFingerprint.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('fingerprints are deterministic and contain four 128-value yaw views', () => {
  const prepared = prepare(lineBlocks(20));
  const first = fingerprintConditionalVolume(prepared);
  const second = fingerprintConditionalVolume(prepared);
  assert.deepEqual(second, first);
  assert.equal(first.views.length, 4);
  for (const view of first.views) {
    assert.equal(view.occupancy_minhash.length, 128);
    assert.equal(view.material_minhash.length, 128);
    assert.equal(view.lsh_buckets.length, 64);
  }
  assert.match(first.yaw_canonical_sha256, /^[a-f0-9]{64}$/u);
});

test('raw identity rejects exact bytes while padding differences are structural evidence only', () => {
  const first = prepare(lineBlocks(20, { padding: 0 }));
  const second = prepare(lineBlocks(20, { padding: 4 }));
  const a = fingerprintConditionalVolume(first);
  const b = fingerprintConditionalVolume(second);
  const same = compareConditionalFingerprints(a, a);
  const padded = compareConditionalFingerprints(a, b);
  assert.equal(same.exact_byte_duplicate, true);
  assert.equal(padded.exact_byte_duplicate, false);
  assert.equal(padded.structural_equivalent, true);
  assert.equal(padded.near_duplicate_proposed, true);
});

test('yaw rotation is equivalent without rotating retained prepared evidence', () => {
  const shape = [
    { pos: [0, 0, 0], state: 1 }, { pos: [1, 0, 0], state: 1 },
    { pos: [2, 0, 0], state: 2 }, { pos: [2, 0, 1], state: 2 }
  ];
  const rotated = shape.map((block) => ({ ...block, pos: [1 - block.pos[2], 0, block.pos[0]] }));
  const a = fingerprintConditionalVolume(prepare({ size: [3, 1, 2], blocks: shape }));
  const b = fingerprintConditionalVolume(prepare({ size: [2, 1, 3], blocks: rotated }));
  const comparison = compareConditionalFingerprints(a, b);
  assert.equal(comparison.structural_equivalent, true);
  assert.equal(comparison.near_duplicate_proposed, true);
});

test('a light material variant is proposed and an unrelated volume is not', () => {
  const base = lineBlocks(20);
  const variant = lineBlocks(20);
  variant.blocks[19] = { ...variant.blocks[19], state: 2 };
  const unrelated = {
    size: [20, 20, 1],
    blocks: Array.from({ length: 20 }, (_, y) => ({ pos: [0, y, 0], state: 1 }))
  };
  const near = compareConditionalFingerprints(
    fingerprintConditionalVolume(prepare(base)),
    fingerprintConditionalVolume(prepare(variant))
  );
  const far = compareConditionalFingerprints(
    fingerprintConditionalVolume(prepare(base)),
    fingerprintConditionalVolume(prepare(unrelated))
  );
  assert.ok(near.occupancy_similarity >= 0.85);
  assert.ok(near.material_similarity >= 0.75);
  assert.equal(near.near_duplicate_proposed, true);
  assert.equal(far.near_duplicate_proposed, false);
});

function lineBlocks(length, { padding = 0 } = {}) {
  return {
    size: [length + padding * 2, 1 + padding * 2, 1 + padding * 2],
    blocks: Array.from({ length }, (_, x) => ({ pos: [x + padding, padding, padding], state: 1 }))
  };
}

function prepare({
  size,
  blocks,
  palette = ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks']
}) {
  const bytes = structureNbt({ size, palette, blocks });
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const decoded = decodeBoundedNbt(bytes, { candidateId: ID });
  const volume = validateVanillaStructureNbt(decoded, { candidateId: ID });
  return prepareConditionalVolume({ candidateId: ID, contentSha256, volume });
}
```

- [ ] **Step 2: Run the fingerprint test and verify the red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7ConditionalFingerprint.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7ConditionalFingerprint.js`.

- [ ] **Step 3: Implement direct-coordinate, non-resampling fingerprints**

Create `src/construction/learning/stage7ConditionalFingerprint.js`:

```js
import { createHash } from 'node:crypto';
import { CandidateReadinessError } from './stage7CandidateBoundary.js';

export const CONDITIONAL_FINGERPRINT_VERSION = 'stage7-conditional-fingerprint-v1';
const GRID = 64;
const SIGNATURE_LENGTH = 128;
const BAND_SIZE = 4;

export function fingerprintConditionalVolume(prepared) {
  assertPrepared(prepared);
  const source = tightEntries(prepared.voxels, prepared.record.candidate_id);
  const views = Object.freeze(Array.from({ length: 4 }, (_, yaw) => viewFingerprint(source, yaw)));
  const structural = views.map((view) => view.structural_sha256).sort();
  return deepFreeze({
    version: CONDITIONAL_FINGERPRINT_VERSION,
    candidate_id: prepared.record.candidate_id,
    content_sha256: prepared.record.content_sha256,
    preparation_sha256: prepared.record.preparation_sha256,
    source_orientation_sha256: views[0].structural_sha256,
    yaw_sha256: views.map((view) => view.structural_sha256),
    yaw_canonical_sha256: structural[0],
    views,
    synthetic_only: true,
    authorizes_acquisition: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

export function compareConditionalFingerprints(left, right) {
  assertFingerprint(left);
  assertFingerprint(right);
  let best = { occupancy: 0, material: 0, shared: false };
  for (const a of left.views) for (const b of right.views) {
    const occupancy = equalShare(a.occupancy_minhash, b.occupancy_minhash);
    const material = equalShare(a.material_minhash, b.material_minhash);
    const shared = a.lsh_buckets.some((value) => b.lsh_buckets.includes(value));
    if (occupancy + material > best.occupancy + best.material) {
      best = { occupancy, material, shared };
    }
  }
  const exactByteDuplicate = left.content_sha256 === right.content_sha256;
  const structuralEquivalent = left.yaw_sha256.some((value) => right.yaw_sha256.includes(value));
  const thresholdProposal = best.shared && best.occupancy >= 0.85 && best.material >= 0.75;
  return Object.freeze({
    exact_byte_duplicate: exactByteDuplicate,
    structural_equivalent: structuralEquivalent,
    occupancy_similarity: best.occupancy,
    material_similarity: best.material,
    shares_lsh_bucket: best.shared,
    near_duplicate_proposed: !exactByteDuplicate && (structuralEquivalent || thresholdProposal)
  });
}

function viewFingerprint(source, yaw) {
  const rotated = source.entries.map((entry) => rotate(entry, source.extent, yaw));
  const extent = yaw % 2 === 0
    ? source.extent
    : { x: source.extent.z, y: source.extent.y, z: source.extent.x };
  rotated.sort(compareEntry);
  const bytes = Buffer.alloc(3 + rotated.length * 4);
  bytes.set([extent.x, extent.y, extent.z], 0);
  rotated.forEach((entry, index) => bytes.set([entry.x, entry.y, entry.z, entry.token], 3 + index * 4));
  const occupancyKeys = rotated.map((entry) => pack(entry.x, entry.y, entry.z, 0));
  const materialKeys = rotated.map((entry) => pack(entry.x, entry.y, entry.z, entry.token));
  const occupancy = minhash(occupancyKeys);
  const material = minhash(materialKeys);
  return deepFreeze({
    yaw,
    extent,
    structural_sha256: createHash('sha256').update(bytes).digest('hex'),
    occupancy_minhash: occupancy,
    material_minhash: material,
    lsh_buckets: lshBuckets(occupancy, 'o').concat(lshBuckets(material, 'm'))
  });
}

function tightEntries(voxels, candidateId) {
  const entries = [];
  let minX = GRID, minY = GRID, minZ = GRID, maxX = -1, maxY = -1, maxZ = -1;
  for (let y = 0; y < GRID; y += 1) for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const token = voxels[y * GRID * GRID + z * GRID + x];
      if (token === 0) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
      entries.push({ x, y, z, token });
    }
  }
  if (entries.length === 0) fail('FINGERPRINT_VOLUME_EMPTY', candidateId);
  return {
    extent: { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 },
    entries: entries.map((entry) => ({
      x: entry.x - minX, y: entry.y - minY, z: entry.z - minZ, token: entry.token
    }))
  };
}

function rotate(entry, extent, yaw) {
  if (yaw === 0) return { ...entry };
  if (yaw === 1) return { x: extent.z - 1 - entry.z, y: entry.y, z: entry.x, token: entry.token };
  if (yaw === 2) return { x: extent.x - 1 - entry.x, y: entry.y, z: extent.z - 1 - entry.z, token: entry.token };
  return { x: entry.z, y: entry.y, z: extent.x - 1 - entry.x, token: entry.token };
}

function minhash(keys) {
  const output = Array(SIGNATURE_LENGTH).fill(0xffffffff);
  for (const key of keys) for (let index = 0; index < SIGNATURE_LENGTH; index += 1) {
    const value = mix32((key ^ seed(index)) >>> 0);
    if (value < output[index]) output[index] = value;
  }
  return Object.freeze(output);
}

function lshBuckets(signature, prefix) {
  const output = [];
  for (let start = 0; start < signature.length; start += BAND_SIZE) {
    const bytes = Buffer.alloc(1 + BAND_SIZE * 4);
    bytes[0] = start / BAND_SIZE;
    for (let index = 0; index < BAND_SIZE; index += 1) {
      bytes.writeUInt32BE(signature[start + index] >>> 0, 1 + index * 4);
    }
    output.push(`${prefix}:${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`);
  }
  return Object.freeze(output);
}

function seed(index) { return mix32((0x9e3779b9 * (index + 1)) >>> 0); }
function mix32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
function pack(x, y, z, token) { return (x | (y << 6) | (z << 12) | (token << 18)) >>> 0; }
function compareEntry(a, b) { return a.y - b.y || a.z - b.z || a.x - b.x || a.token - b.token; }
function equalShare(left, right) {
  return left.reduce((count, value, index) => count + (value === right[index] ? 1 : 0), 0) / left.length;
}
function assertPrepared(prepared) {
  if (!prepared || !Buffer.isBuffer(prepared.voxels) || prepared.voxels.length !== GRID ** 3
    || prepared.voxels.some((token) => token > 8)
    || !prepared.record || !/^[a-f0-9]{64}$/u.test(prepared.record.content_sha256 || '')) {
    fail('FINGERPRINT_INPUT_INVALID', prepared?.record?.candidate_id || 'synthetic');
  }
}
function assertFingerprint(value) {
  if (!value || value.version !== CONDITIONAL_FINGERPRINT_VERSION || !Array.isArray(value.views)
    || value.views.length !== 4) fail('FINGERPRINT_RECORD_INVALID', value?.candidate_id || 'synthetic');
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function fail(code, candidateId) {
  throw new CandidateReadinessError(code, 'fingerprint', candidateId);
}
```

Do not add any resized, downsampled, tiled, or dense alternate representation. Fingerprints operate only on direct accepted coordinates.

- [ ] **Step 4: Run Tasks 1-5 tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js
```

Expected: all focused tests pass, zero failures.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/construction/learning/stage7ConditionalFingerprint.js test/stage7ConditionalFingerprint.test.js
git commit -m "feat(stage7): fingerprint conditional candidates"
```

---

### Task 6: Synthetic readiness state and append-only hash-chain store

**Files:**
- Create: `src/construction/learning/stage7CandidateReadinessState.js`
- Create: `src/construction/learning/stage7CandidateReadinessStore.js`
- Create: `test/stage7CandidateReadinessState.test.js`
- Create: `test/stage7CandidateReadinessStore.test.js`

**Interfaces:**
- Consumes: candidate IDs and evidence hashes from Tasks 1-5.
- Produces: `READINESS_SCHEMA_VERSION`, `READINESS_TERMINAL_STATES`, `createSyntheticReadinessEvent(input)`, `validateReadinessEvent(record)`, `reduceCandidateReadiness(records, candidateId)`, `READINESS_LEDGER_RELATIVE`, `readSyntheticReadinessLedger(root)`, and `appendSyntheticReadinessEvent(root, event, dependencies)`.
- Store writes are permitted only below a fresh operating-system temporary directory whose basename begins `stage7-candidate-readiness-`.

- [ ] **Step 1: Write failing state-contract tests**

Create `test/stage7CandidateReadinessState.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import {
  createSyntheticReadinessEvent,
  reduceCandidateReadiness,
  validateReadinessEvent
} from '../src/construction/learning/stage7CandidateReadinessState.js';

const ID = 'synthetic-source:house-01';
const HASH = 'a'.repeat(64);

test('synthetic events bind mandatory non-authorization and a stable hash', () => {
  const event = eventFixture();
  assert.deepEqual(validateReadinessEvent(event), event);
  assert.equal(event.synthetic_only, true);
  assert.equal(event.authorizes_acquisition, false);
  assert.equal(event.authorizes_training, false);
  assert.equal(event.authorizes_dataset_admission, false);
  assert.match(event.event_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(event), true);
});

test('reducer permits the ordered readiness evidence path', () => {
  const states = [
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
    'format_validated', 'structure_validated', 'completeness_validated',
    'prepared', 'fingerprinted', 'duplicate_clustered', 'pilot_ready'
  ];
  const events = [];
  let before = 'admission_contract_ready';
  let previous = null;
  states.forEach((after, index) => {
    const event = eventFixture({
      revision: index + 1,
      stateBefore: before,
      stateAfter: after,
      previousEventSha256: previous
    });
    events.push(event);
    before = after;
    previous = event.event_sha256;
  });
  assert.deepEqual(reduceCandidateReadiness(events, ID), {
    candidate_id: ID,
    revision: 10,
    state: 'pilot_ready',
    terminal: false,
    latest_event_sha256: previous
  });
});

test('every R2 terminal state is fail-closed from its exact allowed predecessor', () => {
  for (const [stateBefore, terminalState] of [
    ['admission_contract_ready', 'deferred_rights'],
    ['admission_contract_ready', 'deferred_label'],
    ['acquired_quarantine', 'quarantined_technical'],
    ['structure_validated', 'deferred_incomplete'],
    ['structure_validated', 'deferred_oversized_public'],
    ['fingerprinted', 'rejected_duplicate'],
    ['duplicate_clustered', 'rejected_quality']
  ]) {
    const events = pathTo(stateBefore);
    const terminal = eventFixture({
      revision: events.length + 1,
      stateBefore,
      stateAfter: terminalState,
      previousEventSha256: events.at(-1)?.event_sha256 ?? null
    });
    const reduced = reduceCandidateReadiness([...events, terminal], ID);
    assert.equal(reduced.state, terminalState);
    assert.equal(reduced.terminal, true);
  }
});

test('reducer rejects skipped, reversed, broken-chain, and post-terminal transitions', () => {
  assert.throws(() => reduceCandidateReadiness([
    eventFixture({ stateAfter: 'format_validated' })
  ], ID), hasCode('READINESS_TRANSITION_INVALID'));
  const terminal = eventFixture({ stateAfter: 'deferred_rights' });
  const later = eventFixture({
    revision: 2,
    stateBefore: 'deferred_rights',
    stateAfter: 'named_batch_approved',
    previousEventSha256: terminal.event_sha256
  });
  assert.throws(() => reduceCandidateReadiness([terminal, later], ID), hasCode('READINESS_TRANSITION_INVALID'));
  const broken = eventFixture({ revision: 2, stateBefore: 'named_batch_approved', stateAfter: 'acquired_quarantine' });
  assert.throws(() => reduceCandidateReadiness([eventFixture(), broken], ID), hasCode('READINESS_PREVIOUS_HASH_INVALID'));
});

test('validation rejects any authorization marker or event-hash tampering', () => {
  const event = eventFixture();
  assert.throws(() => validateReadinessEvent({ ...event, authorizes_training: true }), hasCode('READINESS_MARKERS_INVALID'));
  assert.throws(() => validateReadinessEvent({ ...event, event_sha256: 'b'.repeat(64) }), hasCode('READINESS_EVENT_HASH_INVALID'));
});

function eventFixture({
  revision = 1,
  stateBefore = 'admission_contract_ready',
  stateAfter = 'named_batch_approved',
  previousEventSha256 = null
} = {}) {
  return createSyntheticReadinessEvent({
    candidateId: ID,
    revision,
    eventType: stateAfter,
    stateBefore,
    stateAfter,
    recordedAt: `2026-07-20T00:00:${String(revision).padStart(2, '0')}.000Z`,
    recordedBy: 'synthetic-test',
    reasonCodes: [],
    evidenceHashes: { fixture_sha256: HASH },
    previousEventSha256
  });
}

function pathTo(target) {
  const path = [
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
    'format_validated', 'structure_validated', 'completeness_validated',
    'prepared', 'fingerprinted', 'duplicate_clustered', 'pilot_ready'
  ];
  if (target === 'admission_contract_ready') return [];
  const end = path.indexOf(target);
  const events = [];
  let before = 'admission_contract_ready';
  let previous = null;
  for (let index = 0; index <= end; index += 1) {
    const event = eventFixture({
      revision: index + 1,
      stateBefore: before,
      stateAfter: path[index],
      previousEventSha256: previous
    });
    events.push(event);
    before = path[index];
    previous = event.event_sha256;
  }
  return events;
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
```

- [ ] **Step 2: Write failing append-only store tests**

Create `test/stage7CandidateReadinessStore.test.js`:

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import { createSyntheticReadinessEvent } from '../src/construction/learning/stage7CandidateReadinessState.js';
import {
  READINESS_LEDGER_RELATIVE,
  appendSyntheticReadinessEvent,
  readSyntheticReadinessLedger
} from '../src/construction/learning/stage7CandidateReadinessStore.js';

const ID = 'synthetic-source:house-01';

test('store appends canonical contiguous hash-chained candidate events', async (t) => {
  const root = await rootFixture(t);
  const first = eventFixture();
  await appendSyntheticReadinessEvent(root, first);
  const second = eventFixture({
    revision: 2,
    stateBefore: 'named_batch_approved',
    stateAfter: 'acquired_quarantine',
    previousEventSha256: first.event_sha256
  });
  await appendSyntheticReadinessEvent(root, second);
  assert.deepEqual(await readSyntheticReadinessLedger(root), [first, second]);
  const text = await readFile(join(root, READINESS_LEDGER_RELATIVE), 'utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.split('\n').filter(Boolean).length, 2);
});

test('store refuses non-temporary roots, revision gaps, and symlink ledgers', async (t) => {
  const root = await rootFixture(t);
  await assert.rejects(
    appendSyntheticReadinessEvent(join(process.cwd(), '.local', 'stage7-source-expansion'), eventFixture()),
    hasCode('SYNTHETIC_ROOT_INVALID')
  );
  await assert.rejects(
    appendSyntheticReadinessEvent(root, eventFixture({ revision: 2 })),
    hasCode('READINESS_REVISION_NOT_NEXT')
  );
  const ledger = join(root, READINESS_LEDGER_RELATIVE);
  const outside = join(root, 'outside.jsonl');
  await writeFile(outside, '', 'utf8');
  await symlink(outside, ledger);
  await assert.rejects(readSyntheticReadinessLedger(root), hasCode('READINESS_LEDGER_SYMLINK'));
});

test('injected rename failure preserves the original ledger and removes temp output', async (t) => {
  const root = await rootFixture(t);
  const first = eventFixture();
  await appendSyntheticReadinessEvent(root, first);
  const before = await readFile(join(root, READINESS_LEDGER_RELATIVE));
  const second = eventFixture({
    revision: 2,
    stateBefore: 'named_batch_approved',
    stateAfter: 'acquired_quarantine',
    previousEventSha256: first.event_sha256
  });
  await assert.rejects(
    appendSyntheticReadinessEvent(root, second, {
      rename: async () => { throw new Error('injected rename failure'); }
    }),
    /injected rename failure/u
  );
  assert.deepEqual(await readFile(join(root, READINESS_LEDGER_RELATIVE)), before);
  assert.deepEqual((await readdir(join(root, 'manifests'))).sort(), ['acquisition-events.jsonl']);
});

async function rootFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-candidate-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'manifests'));
  return root;
}

function eventFixture({
  revision = 1,
  stateBefore = 'admission_contract_ready',
  stateAfter = 'named_batch_approved',
  previousEventSha256 = null
} = {}) {
  return createSyntheticReadinessEvent({
    candidateId: ID,
    revision,
    eventType: stateAfter,
    stateBefore,
    stateAfter,
    recordedAt: `2026-07-20T00:00:${String(revision).padStart(2, '0')}.000Z`,
    recordedBy: 'synthetic-test',
    reasonCodes: [],
    evidenceHashes: { fixture_sha256: 'a'.repeat(64) },
    previousEventSha256
  });
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
```

- [ ] **Step 3: Run the state/store tests and verify the red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessStore.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the readiness modules.

- [ ] **Step 4: Implement the state contract**

Create `src/construction/learning/stage7CandidateReadinessState.js`:

```js
import { createHash } from 'node:crypto';
import { CandidateReadinessError, assertCandidateId } from './stage7CandidateBoundary.js';

export const READINESS_SCHEMA_VERSION = 1;
export const READINESS_TERMINAL_STATES = Object.freeze([
  'deferred_rights', 'deferred_incomplete', 'deferred_oversized_public',
  'quarantined_technical', 'rejected_duplicate', 'deferred_label', 'rejected_quality'
]);
const FORWARD = Object.freeze({
  admission_contract_ready: 'named_batch_approved',
  named_batch_approved: 'acquired_quarantine',
  acquired_quarantine: 'bytes_verified',
  bytes_verified: 'format_validated',
  format_validated: 'structure_validated',
  structure_validated: 'completeness_validated',
  completeness_validated: 'prepared',
  prepared: 'fingerprinted',
  fingerprinted: 'duplicate_clustered',
  duplicate_clustered: 'pilot_ready'
});
const FAILURE_FROM = Object.freeze({
  deferred_rights: new Set(['admission_contract_ready', 'named_batch_approved']),
  deferred_incomplete: new Set(['structure_validated']),
  deferred_oversized_public: new Set(['structure_validated']),
  quarantined_technical: new Set([
    'acquired_quarantine', 'bytes_verified', 'format_validated',
    'structure_validated', 'completeness_validated', 'prepared', 'fingerprinted'
  ]),
  rejected_duplicate: new Set(['fingerprinted']),
  deferred_label: new Set(['admission_contract_ready']),
  rejected_quality: new Set(['duplicate_clustered', 'pilot_ready'])
});
const EVENT_KEYS = new Set([
  'schema_version', 'candidate_id', 'revision', 'event_type', 'state_before',
  'state_after', 'recorded_at', 'recorded_by', 'reason_codes', 'evidence_hashes',
  'previous_event_sha256', 'event_sha256', 'synthetic_only',
  'authorizes_acquisition', 'authorizes_training', 'authorizes_dataset_admission'
]);

export function createSyntheticReadinessEvent({
  candidateId, revision, eventType, stateBefore, stateAfter, recordedAt,
  recordedBy, reasonCodes = [], evidenceHashes, previousEventSha256 = null
}) {
  const value = {
    schema_version: READINESS_SCHEMA_VERSION,
    candidate_id: assertCandidateId(candidateId),
    revision,
    event_type: eventType,
    state_before: stateBefore,
    state_after: stateAfter,
    recorded_at: recordedAt,
    recorded_by: recordedBy,
    reason_codes: [...reasonCodes],
    evidence_hashes: { ...evidenceHashes },
    previous_event_sha256: previousEventSha256,
    synthetic_only: true,
    authorizes_acquisition: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  };
  const eventSha256 = hashEvent(value);
  return validateReadinessEvent({ ...value, event_sha256: eventSha256 });
}

export function validateReadinessEvent(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).some((key) => !EVENT_KEYS.has(key))
    || Object.keys(record).length !== EVENT_KEYS.size) fail('READINESS_RECORD_INVALID', 'unknown');
  const id = assertCandidateId(record.candidate_id);
  if (record.schema_version !== READINESS_SCHEMA_VERSION
    || !Number.isSafeInteger(record.revision) || record.revision <= 0
    || typeof record.event_type !== 'string' || record.event_type !== record.state_after
    || typeof record.state_before !== 'string' || typeof record.state_after !== 'string'
    || Number.isNaN(Date.parse(record.recorded_at))
    || new Date(record.recorded_at).toISOString() !== record.recorded_at
    || typeof record.recorded_by !== 'string' || record.recorded_by.trim().length === 0
    || !Array.isArray(record.reason_codes)
    || record.reason_codes.some((value) => typeof value !== 'string' || value.length === 0)
    || !validHashes(record.evidence_hashes)
    || !(record.previous_event_sha256 === null || /^[a-f0-9]{64}$/u.test(record.previous_event_sha256))) {
    fail('READINESS_RECORD_INVALID', id);
  }
  if (record.synthetic_only !== true || record.authorizes_acquisition !== false
    || record.authorizes_training !== false || record.authorizes_dataset_admission !== false) {
    fail('READINESS_MARKERS_INVALID', id);
  }
  const expected = hashEvent(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'event_sha256')
  ));
  if (record.event_sha256 !== expected) fail('READINESS_EVENT_HASH_INVALID', id);
  return deepFreeze(structuredClone(record));
}

export function reduceCandidateReadiness(records, candidateId) {
  const id = assertCandidateId(candidateId);
  const selected = records.filter((record) => record.candidate_id === id)
    .map(validateReadinessEvent)
    .sort((left, right) => left.revision - right.revision);
  if (selected.length === 0) return null;
  let expectedBefore = 'admission_contract_ready';
  let previous = null;
  selected.forEach((event, index) => {
    if (event.revision !== index + 1) fail('READINESS_REVISION_GAP', id);
    if (event.previous_event_sha256 !== previous) fail('READINESS_PREVIOUS_HASH_INVALID', id);
    if (event.state_before !== expectedBefore || !allowed(event.state_before, event.state_after)) {
      fail('READINESS_TRANSITION_INVALID', id, {
        state_before: event.state_before,
        state_after: event.state_after
      });
    }
    expectedBefore = event.state_after;
    previous = event.event_sha256;
  });
  return Object.freeze({
    candidate_id: id,
    revision: selected.length,
    state: expectedBefore,
    terminal: READINESS_TERMINAL_STATES.includes(expectedBefore),
    latest_event_sha256: previous
  });
}

function allowed(before, after) {
  return FORWARD[before] === after || FAILURE_FROM[after]?.has(before) === true;
}
function validHashes(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([key, hash]) => /^[a-z0-9_]+$/u.test(key)
      && /^[a-f0-9]{64}$/u.test(hash));
}
function hashEvent(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function canonicalReadinessJson(value) { return `${canonical(value)}\n`; }
function canonical(value) { return JSON.stringify(sortKeys(value)); }
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
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
function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'state', candidateId, safeDetail);
}
```

- [ ] **Step 5: Implement the temporary-root-only append store**

Create `src/construction/learning/stage7CandidateReadinessStore.js`:

```js
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CandidateReadinessError } from './stage7CandidateBoundary.js';
import {
  canonicalReadinessJson,
  reduceCandidateReadiness,
  validateReadinessEvent
} from './stage7CandidateReadinessState.js';

export const READINESS_LEDGER_RELATIVE = 'manifests/acquisition-events.jsonl';

export async function readSyntheticReadinessLedger(root) {
  const target = await ledgerPath(root);
  let text;
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) fail('READINESS_LEDGER_SYMLINK');
    if (!stat.isFile()) fail('READINESS_LEDGER_NOT_REGULAR');
    text = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  const records = text.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return validateReadinessEvent(JSON.parse(line)); }
    catch (error) {
      if (error instanceof CandidateReadinessError) throw error;
      fail('READINESS_LEDGER_INVALID', { line: index + 1 });
    }
  });
  const canonical = records.map(canonicalReadinessJson).join('');
  if (text !== canonical) fail('READINESS_LEDGER_NONCANONICAL');
  for (const candidateId of new Set(records.map((record) => record.candidate_id))) {
    reduceCandidateReadiness(records, candidateId);
  }
  return Object.freeze(records);
}

export async function appendSyntheticReadinessEvent(root, input, {
  rename = fs.rename,
  writeFile = fs.writeFile,
  remove = fs.rm
} = {}) {
  const event = validateReadinessEvent(input);
  const target = await ledgerPath(root);
  const existing = await readSyntheticReadinessLedger(root);
  const prior = existing.filter((record) => record.candidate_id === event.candidate_id);
  if (event.revision !== prior.length + 1) fail('READINESS_REVISION_NOT_NEXT');
  const expectedPrevious = prior.at(-1)?.event_sha256 ?? null;
  if (event.previous_event_sha256 !== expectedPrevious) fail('READINESS_PREVIOUS_HASH_INVALID');
  reduceCandidateReadiness([...existing, event], event.candidate_id);
  const output = [...existing, event].map(canonicalReadinessJson).join('');
  const temporary = path.join(path.dirname(target), `.acquisition-events.jsonl.tmp-${process.pid}`);
  try {
    await fs.lstat(temporary);
    fail('READINESS_TEMP_EXISTS');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' });
    const handle = await fs.open(temporary, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
    const directory = await fs.open(path.dirname(target), 'r');
    try { await directory.sync(); } catch (error) {
      if (!['EINVAL', 'ENOTSUP'].includes(error.code)) throw error;
    } finally { await directory.close(); }
  } catch (error) {
    await remove(temporary, { force: true });
    throw error;
  }
  return event;
}

async function ledgerPath(root) {
  const absolute = path.resolve(root);
  const relativeToTmp = path.relative(path.resolve(tmpdir()), absolute);
  if (relativeToTmp === '..' || relativeToTmp.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToTmp)
    || !path.basename(absolute).startsWith('stage7-candidate-readiness-')) {
    fail('SYNTHETIC_ROOT_INVALID');
  }
  const rootStat = await fs.lstat(absolute);
  const manifests = path.join(absolute, 'manifests');
  const manifestsStat = await fs.lstat(manifests);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || manifestsStat.isSymbolicLink() || !manifestsStat.isDirectory()) {
    fail('SYNTHETIC_ROOT_INVALID');
  }
  return path.join(manifests, 'acquisition-events.jsonl');
}

function fail(code, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'store', 'synthetic', safeDetail);
}
```

- [ ] **Step 6: Run all Tasks 1-6 tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessStore.test.js
```

Expected: all focused tests pass, zero failures.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/construction/learning/stage7CandidateReadinessState.js src/construction/learning/stage7CandidateReadinessStore.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessStore.test.js
git commit -m "feat(stage7): record synthetic candidate readiness"
```

---

### Task 7: End-to-end synthetic quarantine-to-audit integration

**Files:**
- Create: `test/stage7CandidateReadinessIntegration.test.js`

**Interfaces:**
- Consumes: every Task 1-6 public interface.
- Produces: no new runtime interface. The test proves two fresh temporary roots produce identical content, preparation, structural, and audit hashes and that no prepared or fingerprint payload is written.

- [ ] **Step 1: Write the full synthetic integration test**

Create `test/stage7CandidateReadinessIntegration.test.js`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readQuarantinedNbt } from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import { fingerprintConditionalVolume } from '../src/construction/learning/stage7ConditionalFingerprint.js';
import { createSyntheticReadinessEvent } from '../src/construction/learning/stage7CandidateReadinessState.js';
import {
  appendSyntheticReadinessEvent,
  readSyntheticReadinessLedger
} from '../src/construction/learning/stage7CandidateReadinessStore.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('two synthetic quarantine-to-audit runs are hash-identical and root-contained', async (t) => {
  const first = await runPipeline(t);
  const second = await runPipeline(t);
  assert.deepEqual(second.binding, first.binding);
  assert.deepEqual(second.ledger, first.ledger);
  for (const result of [first, second]) {
    assert.deepEqual((await readdir(result.root)).sort(), ['manifests', 'quarantine']);
    assert.deepEqual(await readdir(join(result.root, 'manifests')), ['acquisition-events.jsonl']);
    assert.equal((await readdir(join(result.root, 'quarantine', ID))).length, 1);
  }
});

async function runPipeline(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-candidate-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'quarantine', ID), { recursive: true });
  await mkdir(join(root, 'manifests'));
  const bytes = structureNbt({
    compression: 'gzip',
    size: [5, 3, 5],
    palette: [
      'minecraft:air', 'minecraft:stone_bricks',
      'minecraft:oak_planks', 'minecraft:glass'
    ],
    blocks: [
      { pos: [0, 0, 0], state: 1 }, { pos: [4, 0, 0], state: 1 },
      { pos: [0, 0, 4], state: 2 }, { pos: [4, 0, 4], state: 2 },
      { pos: [2, 2, 2], state: 3 }
    ]
  });
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const relativePath = `quarantine/${ID}/${contentSha256}.nbt`;
  await writeFile(join(root, ...relativePath.split('/')), bytes);
  const quarantined = await readQuarantinedNbt({ root, candidateId: ID, relativePath }, {
    assertRoot: async (value) => value
  });
  const decoded = decodeBoundedNbt(quarantined.bytes, { candidateId: ID });
  const volume = validateVanillaStructureNbt(decoded, { candidateId: ID });
  const prepared = prepareConditionalVolume({ candidateId: ID, contentSha256, volume });
  const fingerprint = fingerprintConditionalVolume(prepared);
  const states = [
    ['admission_contract_ready', 'named_batch_approved', { metadata_sha256: '1'.repeat(64) }],
    ['named_batch_approved', 'acquired_quarantine', { content_sha256: contentSha256 }],
    ['acquired_quarantine', 'bytes_verified', { content_sha256: contentSha256 }],
    ['bytes_verified', 'format_validated', { content_sha256: contentSha256 }],
    ['format_validated', 'structure_validated', { content_sha256: contentSha256 }],
    ['structure_validated', 'completeness_validated', { fixture_sha256: '2'.repeat(64) }],
    ['completeness_validated', 'prepared', { preparation_sha256: prepared.record.preparation_sha256 }],
    ['prepared', 'fingerprinted', { structural_sha256: fingerprint.yaw_canonical_sha256 }],
    ['fingerprinted', 'duplicate_clustered', { structural_sha256: fingerprint.yaw_canonical_sha256 }],
    ['duplicate_clustered', 'pilot_ready', { preparation_sha256: prepared.record.preparation_sha256 }]
  ];
  let previous = null;
  for (const [index, [before, after, evidenceHashes]] of states.entries()) {
    const event = createSyntheticReadinessEvent({
      candidateId: ID,
      revision: index + 1,
      eventType: after,
      stateBefore: before,
      stateAfter: after,
      recordedAt: `2026-07-20T01:00:${String(index + 1).padStart(2, '0')}.000Z`,
      recordedBy: 'synthetic-integration',
      reasonCodes: [],
      evidenceHashes,
      previousEventSha256: previous
    });
    await appendSyntheticReadinessEvent(root, event);
    previous = event.event_sha256;
  }
  const ledger = await readSyntheticReadinessLedger(root);
  return {
    root,
    ledger,
    binding: {
      content_sha256: contentSha256,
      voxel_sha256: prepared.record.voxel_sha256,
      preparation_sha256: prepared.record.preparation_sha256,
      structural_sha256: fingerprint.yaw_canonical_sha256,
      latest_event_sha256: ledger.at(-1).event_sha256
    }
  };
}
```

- [ ] **Step 2: Run the integration test against the completed modules**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateReadinessIntegration.test.js
```

Expected: one integration test passes, two roots have identical binding and ledger values, and each root contains only `quarantine/` and `manifests/`.

- [ ] **Step 3: Prove integration test sensitivity**

Temporarily change the second pipeline fixture's final glass block state from `3` to `2`, run the focused test, and confirm it fails at `assert.deepEqual(second.binding, first.binding)`. Restore the test exactly, rerun it, and confirm it passes. Do not commit the temporary mutation.

Run after restoration:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateReadinessIntegration.test.js
```

Expected: PASS after restoration; `git diff --check` reports no temporary edit beyond the new integration test.

- [ ] **Step 4: Run every R2 test together**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessStore.test.js test/stage7CandidateReadinessIntegration.test.js
```

Expected: all R2 tests pass, zero failures.

- [ ] **Step 5: Commit Task 7**

```bash
git add test/stage7CandidateReadinessIntegration.test.js
git commit -m "test(stage7): verify synthetic candidate pipeline"
```

---

### Task 8: Boundary test and operator documentation

**Files:**
- Create: `test/stage7CandidateReadinessBoundary.test.js`
- Modify: `README.md:170-190`

**Interfaces:**
- Consumes: all R2 source modules and package metadata.
- Produces: a durable regression check that R2 has no downloader, network client, operational CLI, private-lane reference, Dataset writer, Python/trainer hook, archive path, or alternate representation.

- [ ] **Step 1: Write the failing boundary/documentation test**

Create `test/stage7CandidateReadinessBoundary.test.js`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const IMPLEMENTATION_FILES = [
  'src/construction/learning/stage7CandidateBoundary.js',
  'src/construction/learning/stage7BoundedNbt.js',
  'src/construction/learning/stage7VanillaStructureNbt.js',
  'src/construction/learning/stage7ConditionalVoxelPreparation.js',
  'src/construction/learning/stage7ConditionalFingerprint.js',
  'src/construction/learning/stage7CandidateReadinessState.js',
  'src/construction/learning/stage7CandidateReadinessStore.js'
];

test('R2 exposes no network, downloader, archive, private, Dataset, Python, trainer, or M4 surface', async () => {
  const forbidden = [
    'fetch(', 'http.request', 'https.request', 'axios', 'playwright', 'puppeteer',
    'child_process', 'execFile', 'spawn', 'git clone', 'unzip', 'tar.extract',
    '.schematic', '.schem', '.litematic', '.mcstructure', 'level.dat',
    '.local/stage7-private-research', 'training/stage7', 'torch', 'python',
    'buildCoarseSemanticVoxelDataset', 'ready_for_m3_real_data=true',
    'training_eligible_count=1', 'Apply Mode', '../templates/nbt.js'
  ];
  for (const filename of IMPLEMENTATION_FILES) {
    const source = await readFile(filename, 'utf8');
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${filename} contains ${token}`);
    }
  }
});

test('R2 has no npm command and documents its synthetic-only R3 gate', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const readme = await readFile('README.md', 'utf8');
  assert.equal(Object.keys(pkg.scripts).some((name) => /candidate.*readiness|readiness.*candidate/u.test(name)), false);
  assert.match(readme, /Stage 7 Candidate Readiness R2/u);
  assert.match(readme, /synthetic-only/iu);
  assert.match(readme, /no operational npm command/iu);
  assert.match(readme, /does not authorize acquisition, Dataset admission, or training/iu);
  assert.match(readme, /five exact candidates/iu);
});

test('all record-producing R2 modules hard-code non-authorization', async () => {
  for (const filename of [
    'src/construction/learning/stage7ConditionalVoxelPreparation.js',
    'src/construction/learning/stage7ConditionalFingerprint.js',
    'src/construction/learning/stage7CandidateReadinessState.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.match(source, /synthetic_only:\s*true/u);
    assert.match(source, /authorizes_acquisition:\s*false/u);
    assert.match(source, /authorizes_training:\s*false/u);
    assert.match(source, /authorizes_dataset_admission:\s*false/u);
  }
});

test('payload stages have no write API and the store is temporary-root-only', async () => {
  for (const filename of [
    'src/construction/learning/stage7CandidateBoundary.js',
    'src/construction/learning/stage7BoundedNbt.js',
    'src/construction/learning/stage7VanillaStructureNbt.js',
    'src/construction/learning/stage7ConditionalVoxelPreparation.js',
    'src/construction/learning/stage7ConditionalFingerprint.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.equal(/writeFile|appendFile|createWriteStream/u.test(source), false, filename);
  }
  const store = await readFile('src/construction/learning/stage7CandidateReadinessStore.js', 'utf8');
  assert.match(store, /tmpdir\(\)/u);
  assert.match(store, /stage7-candidate-readiness-/u);
  assert.doesNotMatch(store, /stage7-source-expansion/u);
});
```

- [ ] **Step 2: Run the boundary test and verify the documentation red state**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateReadinessBoundary.test.js
```

Expected: the source-boundary tests pass, but the README test fails because the R2 section is missing.

- [ ] **Step 3: Add the R2 README section**

Insert the following immediately after the R1 paragraph ending “R1 has no downloader, payload reader, parser, voxel preparer, model, or trainer.” and before `## Boundaries`:

```markdown
### Stage 7 Candidate Readiness R2

R2 is a synthetic-only safety and parser-readiness library for a later public-candidate pilot. It tests quarantine containment, bounded Minecraft Java Structure NBT decoding, complete-single-structure validation, deterministic centered `64 x 64 x 64` nine-token preparation, structural fingerprints, and append-only readiness evidence using generated fixtures under operating-system temporary directories.

R2 intentionally has no operational npm command, downloader, archive reader, or real-payload entry point. It does not write a payload or prepared volume under `.local/stage7-source-expansion/`, and it does not authorize acquisition, Dataset admission, or training. R3 remains blocked until five exact candidates are named, rights are refreshed, and the owner explicitly approves those exact assets under a separate design and plan.
```

- [ ] **Step 4: Run the boundary, integration, and existing R1 boundary tests**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateReadinessBoundary.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7ConditionalAdmissionBoundary.test.js
```

Expected: all boundary and integration tests pass, zero failures.

- [ ] **Step 5: Run the entire R2 focused suite**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateBoundary.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessStore.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7CandidateReadinessBoundary.test.js
```

Expected: all R2 focused tests pass, zero failures.

- [ ] **Step 6: Commit Task 8**

```bash
git add README.md test/stage7CandidateReadinessBoundary.test.js
git commit -m "docs(stage7): document R2 synthetic boundary"
```

---

### Task 9: Full verification and durable R2 completion handoff

**Files:**
- Create: `docs/superpowers/handoffs/2026-07-20-stage-7-r2-acquisition-parser-readiness-complete.md`

**Interfaces:**
- Consumes: completed Tasks 1-8 and fresh verification output.
- Produces: an aggregate-only continuation record giving the exact pre-handoff implementation HEAD, observed test totals, unchanged formal hashes/gate, unchanged private aggregate counts, zero operational R2 artifacts, and the exact R3 owner gate. The post-handoff final HEAD is reported after the handoff commit.

- [ ] **Step 1: Run the exact read-only continuation protocol**

Run sequentially:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -12
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
```

Expected: clean worktree; branch `codex/stage7-dataset-v3-extraction`; no tracked private path; ignored-root check exits 0. Any unexpected output stops the task.

- [ ] **Step 2: Run the full Node suite with pinned Node**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/npm test
```

Expected: exit 0, all tests pass, zero failures. If the restricted sandbox alone causes nested child-process `EPERM`, rerun this exact command with narrowly scoped normal child-process permission; do not weaken or omit tests.

- [ ] **Step 3: Run the complete Stage 7 Python suite**

Run:

```bash
npm run test:stage7:m3
```

Expected: exit 0, all tests pass, zero failures, no training process and no run artifact.

- [ ] **Step 4: Verify private aggregates and formal Dataset boundaries without printing records**

Run the exact aggregate-only command:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path'); const repo=process.cwd(); const root=path.join(repo,'.local/stage7-private-research'); const lines=(f)=>fs.readFileSync(f,'utf8').trim().split(/\\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((n)=>n.endsWith('.voxels.bin')); const hashes=['v1','v2','v3'].map((v)=>[v,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels',v,'manifest.json'))).digest('hex')]); const v3=JSON.parse(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'),'utf8')); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((n)=>n.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((n)=>n.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((n)=>fs.statSync(path.join(root,'prepared',n)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_artifacts:fs.readdirSync(path.join(root,'runs')).length,dataset_hashes:hashes,dataset_v3_gate:{ready_for_m3_real_data:v3.ready_for_m3_real_data,training_eligible_count:v3.training_eligible_count}}));"
```

Expected aggregate output:

```json
{"source_files":22,"deferred_oversized":42,"source_records":22,"prepared_records":22,"prepared_binary_count":22,"all_prepared_64_cubed":true,"train_cases":15,"validation_cases":7,"run_artifacts":3,"dataset_hashes":[["v1","fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749"],["v2","af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654"],["v3","5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082"]],"dataset_v3_gate":{"ready_for_m3_real_data":false,"training_eligible_count":0}}
```

- [ ] **Step 5: Verify R2 left no operational candidate payload or prepared artifact**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),path=require('path'); const base=path.resolve('.local/stage7-source-expansion'); const count=(dir)=>{if(!fs.existsSync(dir))return 0; let total=0; for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const child=path.join(dir,entry.name); if(entry.isDirectory())total+=count(child); else if(entry.isFile())total+=1; else total+=1;} return total;}; console.log(JSON.stringify({quarantine_files:count(path.join(base,'quarantine')),prepared_files:count(path.join(base,'prepared')),fingerprint_files:count(path.join(base,'fingerprints'))}));"
```

Expected:

```json
{"quarantine_files":0,"prepared_files":0,"fingerprint_files":0}
```

If any count is nonzero, stop and report only the aggregate count without printing filenames or contents.

Then run:

```bash
git diff --check b6cff1e9705a51592bfd6ab959391dc95441a7df..HEAD
git diff --name-only b6cff1e9705a51592bfd6ab959391dc95441a7df..HEAD
git status --short
```

Expected: no whitespace errors; one R2 plan plus only the files in this plan's file map; no `.local`, Dataset manifest, existing generic NBT parser, private file, training file, provider file, or M4 file; clean worktree before the handoff document is added.

- [ ] **Step 6: Write the aggregate-only completion handoff**

Use `apply_patch` to create `docs/superpowers/handoffs/2026-07-20-stage-7-r2-acquisition-parser-readiness-complete.md`. Write the title `Stage 7 R2 Acquisition and Parser Readiness Completion Handoff` and these six sections:

1. **Scope completed:** state that R2 added only synthetic quarantine containment, bounded Java Structure NBT decoding, deterministic nine-token preparation, structural/MinHash fingerprints, append-only readiness events, and boundary tests. State that no real candidate was acquired, parsed, prepared, fingerprinted, admitted, split, or trained.
2. **Git state:** write the exact branch and the literal implementation HEAD observed in Step 1 before this handoff is added. List the plan commit plus the literal Task 1-8 commit subjects. State that the handoff commit follows this implementation HEAD and that nothing was pushed.
3. **Verification evidence:** write the literal Node and Python pass totals observed in Steps 2 and 3 and zero failures. Do not estimate or copy an earlier run.
4. **Preserved boundaries:** write the aggregate private values 22 active, 42 deferred oversized, 22 source records, 22 prepared records, 22 `64^3` binaries, 15/7 split, and three existing run directories. Write all three exact formal Dataset hashes and the false/zero v3 gate. Do not include a private filename, URL, raw hash, prepared hash, metric, checkpoint, or output.
5. **R2 operational state:** write the literal zero counts observed in Step 5. State that R2 added no npm command, downloader, archive reader, Dataset writer, Python hook, trainer, or M4 surface and used only generated temporary fixtures.
6. **Next owner gate:** state that R3 remains blocked until five exact admission-contract-ready Java Structure NBT candidates across multiple independent sources and building categories are named, rights are refreshed, and the owner explicitly approves those exact assets. State that R3 does not authorize training and any later training requires a new literal device and positive optimizer-step budget.

The finished handoff must contain only literal observed values and complete prose. Do not leave an instruction sentence, template token, estimated count, private content, or operational filename listing in the committed file.

- [ ] **Step 7: Run documentation and boundary verification after adding the handoff**

Run:

```bash
git diff --check
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateReadinessBoundary.test.js test/stage7ConditionalAdmissionBoundary.test.js
```

Expected: no whitespace errors; all boundary tests pass, zero failures.

- [ ] **Step 8: Commit Task 9**

```bash
git add docs/superpowers/handoffs/2026-07-20-stage-7-r2-acquisition-parser-readiness-complete.md
git commit -m "docs(stage7): record R2 acquisition readiness"
```

- [ ] **Step 9: Run final post-commit verification and stop**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline -11
git diff-tree --no-commit-id --name-status -r HEAD
```

Expected: clean worktree; one plan commit plus exactly nine intentional Task 1-9 commits after design commit `b6cff1e9705a51592bfd6ab959391dc95441a7df`; final commit changes only the R2 completion handoff.

Report the exact final HEAD, observed test totals, unchanged formal hashes/gate, unchanged private aggregate counts, and absence of operational R2 payloads. Stop. Do not nominate or acquire the five real candidates, create an R3 plan, or train automatically.

---

## Execution completion gate

This plan is complete only after all nine task commits and every Task 9 verification command pass with fresh output. No partial passing suite, earlier output, expected result, or clean diff substitutes for the required full Node, full Python, aggregate-boundary, operational-inventory, and final Git checks.

If any command reports drift or any unplanned file appears, stop immediately and report only safe aggregate evidence. Do not repair a formal Dataset, delete a private artifact, remove an unexpected candidate payload, relax a parser limit, or continue to R3 without owner direction.
