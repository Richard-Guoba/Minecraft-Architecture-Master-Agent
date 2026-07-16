# Stage 7 Source-Expansion Metadata Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents: the owner explicitly requires sequential work.

**Goal:** Build a deterministic, local-only Node workflow that validates manually researched public candidate metadata and rights evidence, ranks rights-cleared candidates, and generates the two-wave 50-card owner review pack without downloading building or preview payloads.

**Architecture:** Separate pure contract, rights, ranking, and review modules from a strict ignored-root boundary and a small CLI. A human-curated JSONL adapter is the pilot's only discovery adapter; source-specific automated adapters are deferred until the pilot proves a high-yield source. The implementation has no HTTP client, source crawler, schematic parser, Dataset writer, trainer, or candidate-promotion path. Reports are canonical fresh directories below `.local/stage7-source-expansion/`, and every operation rechecks the formal Dataset boundary.

**Tech Stack:** Node.js 24.18.0 ESM; built-in `node:assert`, `node:crypto`, `node:fs/promises`, `node:path`, `node:test`, and `node:util`; existing `assertFormalDatasetBoundary`; no new dependency and no Python import.

## Global Constraints

- Execute sequentially; do not use subagents, parallel commands, concurrent acquisition jobs, or concurrent private runs.
- During the active private training run, implement and test only this metadata workflow. Do not download payloads, parse schematics, convert voxels, or run resource-intensive full suites.
- Add no HTTP client, browser automation, crawler, archive reader, schematic reader, image downloader, authentication flow, payment flow, or retry loop.
- Accept only manually researched public metadata, authoritative rights evidence URLs, and explicit human decisions.
- Write operational state only below `.local/stage7-source-expansion/`; reject symbolic links, path escapes, tracked roots, non-ignored roots, unknown report files, and overwrites.
- Never read from or write to `.local/stage7-private-research/`; do not alter its manifests, split, runs, artifacts, or the 42 deferred oversized buildings.
- Never modify Dataset v1/v2/v3. Preserve exact manifest SHA-256 values `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`, `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`, and `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`; Dataset v3 remains false/zero.
- Do not change normal Node generation, the Stage 7 primary provider, training code, or M4 Apply Mode.
- Rights conclusions remain human decisions. Validation may block an inconsistent `verified` record but must not invent permission or claim to provide legal advice.
- Rights evidence is valid for acquisition planning only when revalidated no more than 30 calendar days before the explicit `--as-of` date; all output is metadata-only and authorizes no acquisition or training.
- Target exactly 30 discovery cards with at most five per source, then 20 yield-confirmation cards with at most 15 total cards per source across both waves. Stop short rather than admit a rights-ambiguous candidate.
- Do not create the later download/quarantine/parser subsystem in this plan. That requires the current training run to complete, owner-accepted cards, and a second implementation plan.

---

## File map

- Create `src/construction/learning/stage7SourceExpansionContracts.js`: immutable schemas, strict JSONL parsing, canonical IDs, dates, URLs, signals, and decision validation.
- Create `src/construction/learning/stage7SourceExpansionRights.js`: latest-revision selection, 30-day evidence freshness, rights hard-gate reason codes, and candidate states.
- Create `src/construction/learning/stage7SourceExpansionRanking.js`: source/year cohort percentiles, weighted score, evidence coverage, duplicate penalty, and deterministic lanes/order.
- Create `src/construction/learning/stage7SourceExpansionReview.js`: discovery/yield selection, decision application, final metadata-only summary, canonical JSON, and Markdown cards containing links but no copied images.
- Create `src/construction/learning/stage7SourceExpansionBoundary.js`: exact ignored-root containment, regular UTF-8 input reads, Git ignored/untracked checks, and fresh atomic report-directory writes.
- Create `src/auditStage7SourceExpansion.js`: `init`, `discovery`, `yield`, and `finalize` command orchestration with mandatory `--metadata-only`.
- Create `test/fixtures/stage7SourceExpansionFixtures.js`: synthetic public-metadata, rights, and decision factories only.
- Create `test/stage7SourceExpansionContracts.test.js`, `test/stage7SourceExpansionRights.test.js`, `test/stage7SourceExpansionRanking.test.js`, `test/stage7SourceExpansionReview.test.js`, and `test/stage7SourceExpansionCli.test.js`: focused TDD coverage.
- Modify `package.json`: add only `audit:stage7:sources`.
- Modify `README.md`: document the metadata-only command and non-authorization boundary.

---

### Task 1: Establish strict metadata, rights, and review contracts

**Files:**
- Create: `src/construction/learning/stage7SourceExpansionContracts.js`
- Create: `test/fixtures/stage7SourceExpansionFixtures.js`
- Create: `test/stage7SourceExpansionContracts.test.js`

**Interfaces:**
- Produces: `SourceExpansionContractError`, `parseValidatedJsonl(text, validator)`, `validateDiscoveryRecord(record)`, `validateRightsRecord(record)`, `validateReviewDecision(record)`, `validateIsoDate(value, label)`, and frozen schema constants.
- Consumes later: validated records with exact field names shown in this task.

- [ ] **Step 1: Write failing contract tests and synthetic factories**

Create the fixture exports with no real source names or URLs:

```js
export function candidateFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    source_id: 'source-a',
    asset_id: 'castle-01',
    canonical_url: 'https://example.invalid/source-a/castle-01',
    preview_url: 'https://example.invalid/source-a/castle-01/preview',
    author: 'synthetic-author',
    title: 'Synthetic Castle 01',
    observed_at: '2026-07-16',
    published_at: '2025-05-02',
    claimed_format: 'schematic',
    public_dimensions: { x: 40, y: 32, z: 48 },
    building_type: 'castle',
    style: 'medieval',
    signals: {
      popularity: 100,
      reception: 20,
      preview_completeness: 1,
      building_completeness: 1,
      technical_compatibility: 1,
      scarcity: 0.5,
      duplicate_risk: 0
    },
    ...overrides
  };
}

export function rightsFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    revision: 1,
    observed_at: '2026-07-16',
    reviewed_by: 'synthetic-reviewer',
    scope: 'asset',
    authoritative_urls: ['https://example.invalid/source-a/license'],
    author_chain: ['synthetic-author'],
    permissions: {
      download: true,
      copy: true,
      transform: true,
      training: true,
      derivative_research_artifacts: true,
      local_retention: true
    },
    conditions: [],
    ai_ml_restriction: false,
    platform_conflict: false,
    upstream_conflict: false,
    conclusion: 'verified',
    reason_codes: [],
    ...overrides
  };
}

export function decisionFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    wave: 'discovery',
    revision: 1,
    decided_at: '2026-07-16',
    decided_by: 'owner',
    decision: 'accept',
    ...overrides
  };
}
```

Create tests that accept each fixture, freeze the returned copy, and reject duplicate candidate IDs, non-HTTPS URLs, invalid dates, negative popularity/reception, signals outside `0..1`, dimensions above `64`, missing authors, unsupported decisions, and unknown top-level keys:

```js
test('contracts accept complete synthetic metadata and freeze copies', () => {
  const candidate = validateDiscoveryRecord(candidateFixture());
  const rights = validateRightsRecord(rightsFixture());
  const decision = validateReviewDecision(decisionFixture());
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(rights.permissions), true);
  assert.equal(decision.decision, 'accept');
});

test('contract failures have stable codes and oversized metadata is deferred', () => {
  assert.throws(
    () => validateDiscoveryRecord(candidateFixture({ canonical_url: 'http://example.invalid/item' })),
    (error) => error instanceof SourceExpansionContractError && error.code === 'URL_NOT_HTTPS'
  );
  const oversized = validateDiscoveryRecord(candidateFixture({ public_dimensions: { x: 65, y: 1, z: 1 } }));
  assert.equal(oversized.oversized, true);
});
```

- [ ] **Step 2: Run the contracts test to verify RED**

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionContracts.test.js
```

Expected: failure because `stage7SourceExpansionContracts.js` does not exist.

- [ ] **Step 3: Implement the exact strict contracts**

Use these exported constants and validators:

```js
export const SOURCE_EXPANSION_SCHEMA_VERSION = 1;
export const CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
export const LOCAL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
export const RIGHTS_CONCLUSIONS = Object.freeze(['verified', 'deferred', 'private_research_only', 'rejected']);
export const REVIEW_DECISIONS = Object.freeze(['accept', 'defer', 'reject']);
export const REVIEW_WAVES = Object.freeze(['discovery', 'yield']);

export class SourceExpansionContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'SourceExpansionContractError';
    this.code = code;
  }
}

export function parseValidatedJsonl(text, validator) {
  if (typeof text !== 'string') throw new SourceExpansionContractError('JSONL_INVALID', 'text required');
  const records = text.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
    try { return validator(JSON.parse(line)); }
    catch (error) {
      if (error instanceof SourceExpansionContractError) throw error;
      throw new SourceExpansionContractError('JSONL_INVALID', `line ${index + 1}`);
    }
  });
  const ids = new Set();
  for (const record of records) {
    const key = `${record.candidate_id}:${record.revision ?? 'base'}`;
    if (ids.has(key)) throw new SourceExpansionContractError('RECORD_DUPLICATE', key);
    ids.add(key);
  }
  return Object.freeze(records);
}
```

Implement `validateDiscoveryRecord`, `validateRightsRecord`, and `validateReviewDecision` by first calling `rejectUnknownKeys(record, allowedKeys, code)`, then requiring the fixture fields exactly. Discovery input permits exactly `schema_version`, `candidate_id`, `source_id`, `asset_id`, `canonical_url`, `preview_url`, `author`, `title`, `observed_at`, `published_at`, `claimed_format`, `public_dimensions`, `building_type`, `style`, and `signals`. Rights and decision input permit exactly the fields shown by `rightsFixture` and `decisionFixture`. Use these helper contracts:

```js
function requireId(value, label) {
  if (typeof value !== 'string' || !CANDIDATE_ID_PATTERN.test(value)) {
    throw new SourceExpansionContractError('ID_INVALID', label);
  }
  return value;
}

export function validateIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new SourceExpansionContractError('DATE_INVALID', label);
  }
  return value;
}

function requireHttps(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new SourceExpansionContractError('URL_INVALID', label); }
  if (parsed.protocol !== 'https:') throw new SourceExpansionContractError('URL_NOT_HTTPS', label);
  return parsed.href;
}

function requireUnit(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new SourceExpansionContractError('SIGNAL_INVALID', label);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SourceExpansionContractError(code, 'object required');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
  if (unknown.length) throw new SourceExpansionContractError(code, unknown.join(','));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
```

Discovery validation must require `source_id` and `asset_id` to match `LOCAL_ID_PATTERN` and require `candidate_id` to equal the colon-joined `source_id` and `asset_id`; this binds identity to canonical public source identity rather than a local filename. Allow `null` for `published_at`, `public_dimensions`, and every signal. Dimensions, when present, require positive safe integers but may exceed 64 because known oversized candidates must remain visible as deferred metadata. Add derived output field `oversized: public_dimensions !== null && [x, y, z].some((value) => value > 64)`; reject `oversized` if supplied by input. Popularity and reception require finite non-negative numbers or `null`; the remaining signals use `requireUnit(..., { nullable: true })`. Apply `rejectUnknownKeys` to `public_dimensions` with exactly `x/y/z`, to `signals` with exactly the seven fixture signal keys, and to `permissions` with exactly the six fixture permission keys. Rights validation requires positive integer `revision`, one or more authoritative HTTPS URLs, one or more non-empty author-chain strings, all six exact permission booleans, boolean conflicts/restriction, string conditions/reason codes, and one listed conclusion. Decision validation requires positive integer revision, one listed wave/decision, and non-empty `decided_by`.

- [ ] **Step 4: Run the contracts test to verify GREEN**

Run the command from Step 2. Expected: all contract tests pass with `0` failures, skips, or todos.

- [ ] **Step 5: Commit the contracts**

```bash
git add src/construction/learning/stage7SourceExpansionContracts.js test/fixtures/stage7SourceExpansionFixtures.js test/stage7SourceExpansionContracts.test.js
git commit -m "feat(stage7): add source expansion metadata contracts"
```

### Task 2: Implement the human-bound rights hard gate

**Files:**
- Create: `src/construction/learning/stage7SourceExpansionRights.js`
- Create: `test/stage7SourceExpansionRights.test.js`

**Interfaces:**
- Consumes: validated discovery and rights records from Task 1 plus explicit `asOf: YYYY-MM-DD`.
- Produces: `latestUniqueRevision(records, candidateId)`, `evaluateRightsEvidence({ candidate, evidence, asOf })`, and `evaluateRightsLedger({ candidates, rightsRecords, asOf })`.

- [ ] **Step 1: Write failing tests for every rights blocker and state**

Use table-driven assertions for these stable codes: `RIGHTS_MISSING`, `RIGHTS_STALE`, `RIGHTS_FUTURE_DATED`, `RIGHTS_SCOPE_INVALID`, `RIGHTS_AUTHOR_CHAIN_EMPTY`, `RIGHTS_DOWNLOAD_DENIED`, `RIGHTS_COPY_DENIED`, `RIGHTS_TRANSFORM_DENIED`, `RIGHTS_TRAINING_DENIED`, `RIGHTS_DERIVATIVE_DENIED`, `RIGHTS_RETENTION_DENIED`, `RIGHTS_AI_ML_RESTRICTED`, `RIGHTS_PLATFORM_CONFLICT`, `RIGHTS_UPSTREAM_CONFLICT`, `RIGHTS_CONCLUSION_NOT_VERIFIED`, and `RIGHTS_REVISION_AMBIGUOUS`.

```js
test('fresh complete human-reviewed evidence reaches rights_verified', () => {
  const result = evaluateRightsEvidence({
    candidate: validateDiscoveryRecord(candidateFixture()),
    evidence: validateRightsRecord(rightsFixture()),
    asOf: '2026-07-16'
  });
  assert.deepEqual(result, {
    candidate_id: 'source-a:castle-01',
    state: 'rights_verified',
    rights_verified: true,
    evidence_revision: 1,
    blockers: []
  });
});

test('verified label cannot override an AI restriction or stale evidence', () => {
  const restricted = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ observed_at: '2026-05-01', ai_ml_restriction: true }),
    asOf: '2026-07-16'
  });
  assert.equal(restricted.rights_verified, false);
  assert.deepEqual(restricted.blockers, ['RIGHTS_AI_ML_RESTRICTED', 'RIGHTS_STALE']);
});
```

- [ ] **Step 2: Run the rights test to verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionRights.test.js
```

Expected: failure because the rights module does not exist.

- [ ] **Step 3: Implement latest revision and fail-closed evaluation**

```js
const REQUIRED_PERMISSIONS = Object.freeze({
  download: 'RIGHTS_DOWNLOAD_DENIED',
  copy: 'RIGHTS_COPY_DENIED',
  transform: 'RIGHTS_TRANSFORM_DENIED',
  training: 'RIGHTS_TRAINING_DENIED',
  derivative_research_artifacts: 'RIGHTS_DERIVATIVE_DENIED',
  local_retention: 'RIGHTS_RETENTION_DENIED'
});

export function latestUniqueRevision(records, candidateId) {
  const matches = records.filter((record) => record.candidate_id === candidateId);
  if (!matches.length) return null;
  const revision = Math.max(...matches.map((record) => record.revision));
  const latest = matches.filter((record) => record.revision === revision);
  if (latest.length !== 1) throw new SourceExpansionContractError('RIGHTS_REVISION_AMBIGUOUS', candidateId);
  return latest[0];
}

export function evaluateRightsEvidence({ candidate, evidence, asOf }) {
  const blockers = [];
  if (!evidence) blockers.push('RIGHTS_MISSING');
  if (evidence) {
    const ageDays = dayNumber(asOf) - dayNumber(evidence.observed_at);
    if (ageDays < 0) blockers.push('RIGHTS_FUTURE_DATED');
    if (ageDays > 30) blockers.push('RIGHTS_STALE');
    if (!['asset', 'uniform-family'].includes(evidence.scope)) blockers.push('RIGHTS_SCOPE_INVALID');
    if (!evidence.author_chain.length) blockers.push('RIGHTS_AUTHOR_CHAIN_EMPTY');
    for (const [permission, code] of Object.entries(REQUIRED_PERMISSIONS)) {
      if (evidence.permissions[permission] !== true) blockers.push(code);
    }
    if (evidence.ai_ml_restriction) blockers.push('RIGHTS_AI_ML_RESTRICTED');
    if (evidence.platform_conflict) blockers.push('RIGHTS_PLATFORM_CONFLICT');
    if (evidence.upstream_conflict) blockers.push('RIGHTS_UPSTREAM_CONFLICT');
    if (evidence.conclusion !== 'verified') blockers.push('RIGHTS_CONCLUSION_NOT_VERIFIED');
  }
  const sorted = [...new Set(blockers)].sort();
  return Object.freeze({
    candidate_id: candidate.candidate_id,
    state: sorted.length ? stateForConclusion(evidence?.conclusion) : 'rights_verified',
    rights_verified: sorted.length === 0,
    evidence_revision: evidence?.revision ?? null,
    blockers: Object.freeze(sorted)
  });
}

function dayNumber(value) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

function stateForConclusion(conclusion) {
  if (conclusion === 'private_research_only') return 'private_research_only';
  if (conclusion === 'rejected') return 'rejected';
  return 'deferred';
}

export function evaluateRightsLedger({ candidates, rightsRecords, asOf }) {
  validateIsoDate(asOf, 'asOf');
  const candidateIds = candidates.map((candidate) => candidate.candidate_id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new SourceExpansionContractError('CANDIDATE_DUPLICATE', 'candidate_id');
  }
  const known = new Set(candidateIds);
  const orphan = rightsRecords.find((record) => !known.has(record.candidate_id));
  if (orphan) throw new SourceExpansionContractError('RIGHTS_ORPHAN', orphan.candidate_id);
  return Object.freeze([...candidates].sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)).map((candidate) =>
    evaluateRightsEvidence({
      candidate,
      evidence: latestUniqueRevision(rightsRecords, candidate.candidate_id),
      asOf
    })
  ));
}
```

Import `validateIsoDate` from Task 1. The ledger never mutates either input array.

- [ ] **Step 4: Run contracts and rights tests to verify GREEN**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionContracts.test.js test/stage7SourceExpansionRights.test.js
```

Expected: both files pass with `0` failures.

- [ ] **Step 5: Commit the rights gate**

```bash
git add src/construction/learning/stage7SourceExpansionRights.js test/stage7SourceExpansionRights.test.js
git commit -m "feat(stage7): enforce source expansion rights gate"
```

### Task 3: Add deterministic source-relative ranking

**Files:**
- Create: `src/construction/learning/stage7SourceExpansionRanking.js`
- Create: `test/stage7SourceExpansionRanking.test.js`

**Interfaces:**
- Consumes: discovery candidates and the rights-ledger results from Task 2.
- Produces: `rankRightsVerifiedCandidates({ candidates, rightsResults })` with `score`, `coverage`, `lane`, percentiles, penalty, and deterministic order.

- [ ] **Step 1: Write failing ranking tests**

Cover same-source percentile ordering, same-year cohorts only when the cohort has at least 10 records, source-wide fallback, tied values, missing signals, coverage below 60 percent, all-signals-missing `unranked`, duplicate penalty, rights-failed exclusion, known-oversized deferral, input-order independence, and candidate-ID tie-breaking.

```js
test('ranking is source-relative, coverage-aware, and deterministic', () => {
  const candidates = [
    candidateFixture({ candidate_id: 'source-a:item-b', asset_id: 'item-b', signals: { ...candidateFixture().signals, popularity: 10 } }),
    candidateFixture({ candidate_id: 'source-a:item-a', asset_id: 'item-a', signals: { ...candidateFixture().signals, popularity: 100 } })
  ];
  const rightsResults = candidates.map((item) => ({ candidate_id: item.candidate_id, rights_verified: true }));
  const first = rankRightsVerifiedCandidates({ candidates, rightsResults });
  const second = rankRightsVerifiedCandidates({ candidates: [...candidates].reverse(), rightsResults: [...rightsResults].reverse() });
  assert.deepEqual(first, second);
  assert.equal(first[0].candidate_id, 'source-a:item-a');
  assert.equal(first[0].lane, 'ranked');
  assert.equal(first[0].coverage, 100);
});
```

- [ ] **Step 2: Run the ranking test to verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionRanking.test.js
```

Expected: failure because the ranking module does not exist.

- [ ] **Step 3: Implement the exact weights, percentiles, coverage, and ordering**

```js
const WEIGHTS = Object.freeze({
  popularity: 30,
  reception: 20,
  preview_completeness: 15,
  building_completeness: 15,
  technical_compatibility: 10,
  scarcity: 10
});

const LANE_ORDER = Object.freeze({ ranked: 0, low_evidence: 1, unranked: 2, deferred_oversized: 3 });

export function rankRightsVerifiedCandidates({ candidates, rightsResults }) {
  const allowed = new Set(rightsResults.filter((item) => item.rights_verified).map((item) => item.candidate_id));
  const verified = candidates.filter((item) => allowed.has(item.candidate_id));
  const rows = verified.map((candidate) => scoreCandidate(candidate, verified));
  return Object.freeze(rows.sort((left, right) =>
    LANE_ORDER[left.lane] - LANE_ORDER[right.lane]
      || (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY)
      || right.coverage - left.coverage
      || left.candidate_id.localeCompare(right.candidate_id)
  ).map(Object.freeze));
}

function scoreCandidate(candidate, candidates) {
  if (candidate.oversized) {
    return {
      candidate_id: candidate.candidate_id,
      source_id: candidate.source_id,
      candidate: Object.freeze(structuredClone(candidate)),
      score: null,
      coverage: 0,
      lane: 'deferred_oversized',
      review_eligible: false,
      percentiles: { popularity: null, reception: null },
      duplicate_penalty: null
    };
  }
  const normalized = {
    popularity: percentile(candidate, candidates, 'popularity'),
    reception: percentile(candidate, candidates, 'reception'),
    preview_completeness: candidate.signals.preview_completeness,
    building_completeness: candidate.signals.building_completeness,
    technical_compatibility: candidate.signals.technical_compatibility,
    scarcity: candidate.signals.scarcity
  };
  const present = Object.entries(normalized).filter(([, value]) => value !== null);
  const coverage = present.reduce((sum, [name]) => sum + WEIGHTS[name], 0);
  const weighted = coverage
    ? present.reduce((sum, [name, value]) => sum + value * WEIGHTS[name], 0) / coverage * 100
    : 0;
  const duplicatePenalty = 25 * (candidate.signals.duplicate_risk ?? 0);
  const score = Math.max(0, Math.min(100, weighted - duplicatePenalty));
  return {
    candidate_id: candidate.candidate_id,
    source_id: candidate.source_id,
    candidate: Object.freeze(structuredClone(candidate)),
    score: coverage === 0 ? null : round(score),
    coverage,
    lane: coverage === 0 ? 'unranked' : coverage < 60 ? 'low_evidence' : 'ranked',
    review_eligible: true,
    percentiles: { popularity: normalized.popularity, reception: normalized.reception },
    duplicate_penalty: round(duplicatePenalty)
  };
}

function percentile(candidate, candidates, signal) {
  const own = candidate.signals[signal];
  if (own === null) return null;
  const source = candidates.filter((item) => item.source_id === candidate.source_id && item.signals[signal] !== null);
  const year = candidate.published_at?.slice(0, 4) ?? null;
  const cohort = year ? source.filter((item) => item.published_at?.startsWith(year)) : [];
  const population = cohort.length >= 10 ? cohort : source;
  if (!population.length) return null;
  const below = population.filter((item) => item.signals[signal] < own).length;
  const equal = population.filter((item) => item.signals[signal] === own).length;
  return round((below + equal / 2) / population.length);
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
```

Do not place raw rights evidence or license text in ranking rows. Signal-free candidates use `lane: "unranked"` and `score: null`; they remain review-eligible and are never assigned a fabricated zero. Known oversized rows remain in `rights-and-ranking.json` with `lane: "deferred_oversized"`, `review_eligible: false`, and `score: null`; their quality signals are not computed, they never enter either review wave, and they never connect to the existing 42 private deferred buildings.

- [ ] **Step 4: Run focused ranking dependencies to verify GREEN**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionContracts.test.js test/stage7SourceExpansionRights.test.js test/stage7SourceExpansionRanking.test.js
```

Expected: all focused tests pass with `0` failures.

- [ ] **Step 5: Commit the ranking engine**

```bash
git add src/construction/learning/stage7SourceExpansionRanking.js test/stage7SourceExpansionRanking.test.js
git commit -m "feat(stage7): rank rights-cleared source candidates"
```

### Task 4: Build two-wave owner review cards and decision summaries

**Files:**
- Create: `src/construction/learning/stage7SourceExpansionReview.js`
- Create: `test/stage7SourceExpansionReview.test.js`

**Interfaces:**
- Consumes: ranked rows, latest rights evidence, discovery/yield decisions.
- Produces: `selectDiscoveryWave`, `selectYieldWave`, `applyReviewDecisions`, `buildFinalReviewSummary`, `canonicalSourceExpansionJson`, `renderSourceExpansionCardsMarkdown`, and `renderFinalReviewSummaryMarkdown`.

- [ ] **Step 1: Write failing wave, rendering, and decision tests**

Generate at least 60 synthetic rights-cleared candidates across 10 synthetic sources. Prove that discovery returns exactly 30 cards with no source above five; yield returns exactly 20 unseen cards with no source above 15 total; a short rights-cleared pool stops short; cards contain ordinary Markdown links but no `![` image syntax; and only the uniquely latest decision revision applies.

Define the test-only helpers directly in `test/stage7SourceExpansionReview.test.js`:

```js
function rankedFixture({ sources = 10, candidatesPerSource = 8 } = {}) {
  const rows = [];
  for (let source = 1; source <= sources; source += 1) {
    for (let item = 1; item <= candidatesPerSource; item += 1) {
      const sourceId = `source-${String(source).padStart(2, '0')}`;
      const assetId = `item-${String(item).padStart(2, '0')}`;
      const candidate = candidateFixture({
        candidate_id: `${sourceId}:${assetId}`,
        source_id: sourceId,
        asset_id: assetId,
        title: `Synthetic ${sourceId} ${assetId}`
      });
      rows.push(Object.freeze({
        candidate_id: candidate.candidate_id,
        source_id: sourceId,
        candidate,
        score: 100 - item,
        coverage: 100,
        lane: 'ranked',
        review_eligible: true,
        percentiles: { popularity: 1 - item / 100, reception: 1 - item / 100 },
        duplicate_penalty: 0
      }));
    }
  }
  return Object.freeze(rows.sort((left, right) => right.score - left.score || left.candidate_id.localeCompare(right.candidate_id)));
}

function rightsMapFixture(cards = rankedFixture()) {
  return new Map(cards.map((row) => [row.candidate_id, rightsFixture({ candidate_id: row.candidate_id })]));
}

function maximumBySource(rows) {
  return Math.max(0, ...countBySource(rows).values());
}

function countBySource(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.source_id, (counts.get(row.source_id) || 0) + 1);
  return counts;
}
```

```js
test('discovery and yield waves enforce distinct deterministic caps', () => {
  const ranked = rankedFixture({ sources: 10, candidatesPerSource: 8 });
  const discovery = selectDiscoveryWave(ranked);
  assert.equal(discovery.length, 30);
  assert.ok(maximumBySource(discovery) <= 5);
  const decisions = discovery.map((row) => decisionFixture({ candidate_id: row.candidate_id, decision: 'accept' }));
  const yieldCards = selectYieldWave({ ranked, discoveryCards: discovery, discoveryDecisions: decisions });
  assert.equal(yieldCards.length, 20);
  assert.equal(new Set([...discovery, ...yieldCards].map((row) => row.candidate_id)).size, 50);
  assert.ok(maximumBySource([...discovery, ...yieldCards]) <= 15);
});

test('Markdown links to previews without copying images or authorizing download', () => {
  const markdown = renderSourceExpansionCardsMarkdown({ wave: 'discovery', cards: [rankedFixture()[0]], rightsByCandidate: rightsMapFixture() });
  assert.match(markdown, /\[Public preview\]\(https:\/\//u);
  assert.doesNotMatch(markdown, /!\[/u);
  assert.match(markdown, /does not authorize download, Dataset admission, or training/iu);
});
```

- [ ] **Step 2: Run the review test to verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionReview.test.js
```

Expected: failure because the review module does not exist.

- [ ] **Step 3: Implement discovery and yield selection**

```js
export function selectDiscoveryWave(ranked, { limit = 30, perSource = 5 } = {}) {
  const counts = new Map();
  const selected = [];
  for (const row of ranked) {
    if (row.review_eligible !== true) continue;
    const count = counts.get(row.source_id) || 0;
    if (count >= perSource) continue;
    selected.push(row);
    counts.set(row.source_id, count + 1);
    if (selected.length === limit) break;
  }
  return Object.freeze(selected);
}

export function selectYieldWave({ ranked, discoveryCards, discoveryDecisions, limit = 20, totalPerSource = 15 }) {
  const accepted = applyReviewDecisions({ cards: discoveryCards, decisions: discoveryDecisions, wave: 'discovery' })
    .filter((item) => item.state === 'human_accepted');
  const scoreById = new Map(discoveryCards.map((row) => [row.candidate_id, row.score]));
  const sourceStats = new Map();
  for (const item of accepted) {
    const current = sourceStats.get(item.source_id) || { accepted: 0, scoreTotal: 0 };
    current.accepted += 1;
    current.scoreTotal += scoreById.get(item.candidate_id) || 0;
    sourceStats.set(item.source_id, current);
  }
  const sourceOrder = [...sourceStats.entries()].sort((left, right) =>
    right[1].accepted - left[1].accepted
      || right[1].scoreTotal / right[1].accepted - left[1].scoreTotal / left[1].accepted
      || left[0].localeCompare(right[0])
  ).map(([sourceId]) => sourceId);
  const priorIds = new Set(discoveryCards.map((row) => row.candidate_id));
  const totalCounts = countBySource(discoveryCards);
  const selected = [];
  for (const sourceId of sourceOrder) {
    for (const row of ranked.filter((item) => item.review_eligible === true && item.source_id === sourceId && !priorIds.has(item.candidate_id))) {
      if ((totalCounts.get(sourceId) || 0) >= totalPerSource) break;
      selected.push(row);
      totalCounts.set(sourceId, (totalCounts.get(sourceId) || 0) + 1);
      if (selected.length === limit) return Object.freeze(selected);
    }
  }
  return Object.freeze(selected);
}
```

If the discovery decisions contain no accepted source, `selectYieldWave` returns an empty frozen array. It must never pull from a rights-failed row because ranking already excluded those records.

- [ ] **Step 4: Implement decision application, final summary, and renderers**

```js
export function applyReviewDecisions({ cards, decisions, wave }) {
  const cardIds = new Set(cards.map((card) => card.candidate_id));
  const latest = latestDecisionMap(decisions, wave);
  for (const candidateId of latest.keys()) {
    if (!cardIds.has(candidateId)) throw new SourceExpansionContractError('DECISION_OUTSIDE_WAVE', candidateId);
  }
  return Object.freeze(cards.map((card) => {
    const decision = latest.get(card.candidate_id) || null;
    return Object.freeze({
      candidate_id: card.candidate_id,
      source_id: card.source_id,
      decision_revision: decision?.revision ?? null,
      decision: decision?.decision ?? 'pending',
      state: decision?.decision === 'accept' ? 'human_accepted'
        : decision?.decision === 'reject' ? 'rejected'
          : decision?.decision === 'defer' ? 'deferred' : 'human_review_pending'
    });
  }));
}

export function buildFinalReviewSummary({ discovery, yieldCards, discoveryDecisions, yieldDecisions }) {
  const reviewed = [
    ...applyReviewDecisions({ cards: discovery, decisions: discoveryDecisions, wave: 'discovery' }),
    ...applyReviewDecisions({ cards: yieldCards, decisions: yieldDecisions, wave: 'yield' })
  ];
  const accepted = reviewed.filter((item) => item.state === 'human_accepted');
  const acceptedBySource = countBySource(accepted);
  return Object.freeze({
    source: 'stage7-source-expansion-metadata-pilot-v1',
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    discovery_card_count: discovery.length,
    yield_card_count: yieldCards.length,
    accepted_count: accepted.length,
    has_twenty_accepted: accepted.length >= 20,
    has_ten_from_one_source: [...acceptedBySource.values()].some((count) => count >= 10),
    ready_for_acquisition_design_review: accepted.length >= 20 && [...acceptedBySource.values()].some((count) => count >= 10),
    states: reviewed
  });
}

export function canonicalSourceExpansionJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function renderFinalReviewSummaryMarkdown(summary) {
  const acceptedBySource = countBySource(summary.states.filter((item) => item.state === 'human_accepted'));
  const rows = [...acceptedBySource.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceId, count]) => `| ${escapeMarkdown(sourceId)} | ${count} |`).join('\n') || '| none | 0 |';
  return `# Stage 7 Source-Expansion Metadata Pilot Summary

- Metadata only: yes
- Authorizes download: no
- Authorizes training: no
- Discovery cards: ${summary.discovery_card_count}
- Yield cards: ${summary.yield_card_count}
- Accepted candidates: ${summary.accepted_count}
- At least 20 accepted: ${summary.has_twenty_accepted ? 'yes' : 'no'}
- At least 10 from one source: ${summary.has_ten_from_one_source ? 'yes' : 'no'}

| Source | Accepted |
| --- | ---: |
${rows}

This report does not authorize download, Dataset admission, or training.
`;
}

function latestDecisionMap(decisions, wave) {
  const grouped = new Map();
  for (const decision of decisions) {
    if (decision.wave !== wave) throw new SourceExpansionContractError('DECISION_WAVE_MISMATCH', decision.candidate_id);
    const records = grouped.get(decision.candidate_id) || [];
    records.push(decision);
    grouped.set(decision.candidate_id, records);
  }
  const latest = new Map();
  for (const [candidateId, records] of grouped) {
    const revision = Math.max(...records.map((record) => record.revision));
    const matches = records.filter((record) => record.revision === revision);
    if (matches.length !== 1) throw new SourceExpansionContractError('DECISION_REVISION_AMBIGUOUS', candidateId);
    latest.set(candidateId, matches[0]);
  }
  return latest;
}

function countBySource(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.source_id, (counts.get(item.source_id) || 0) + 1);
  return counts;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}
```

`renderSourceExpansionCardsMarkdown` must render title, author, source, type/style, public dimensions, score, coverage, lane, popularity/reception percentiles, rights scope/revision/evidence URLs, conditions, warnings, canonical source link, and public preview link. Render links only for validated HTTPS values, include `Accept / Defer / Reject` fields, and state that the pack authorizes no download, Dataset admission, or training. Escape Markdown labels with:

```js
function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}\[\]()#+.!|>-]/gu, '\\$&');
}
```

- [ ] **Step 5: Run all focused review dependencies to verify GREEN**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionContracts.test.js test/stage7SourceExpansionRights.test.js test/stage7SourceExpansionRanking.test.js test/stage7SourceExpansionReview.test.js
```

Expected: all four files pass with `0` failures. Then commit:

```bash
git add src/construction/learning/stage7SourceExpansionReview.js test/stage7SourceExpansionReview.test.js
git commit -m "feat(stage7): build source expansion review waves"
```

### Task 5: Enforce the ignored local boundary and add the metadata-only CLI

**Files:**
- Create: `src/construction/learning/stage7SourceExpansionBoundary.js`
- Create: `src/auditStage7SourceExpansion.js`
- Create: `test/stage7SourceExpansionCli.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1–4 functions and existing `assertFormalDatasetBoundary(repositoryRoot)`.
- Produces: `assertSourceExpansionRoot`, `readSourceExpansionJsonl`, `readSourceExpansionJson`, `assertExactInventory`, `writeFreshReportDirectory`, `parseStage7SourceExpansionArgs`, and `runStage7SourceExpansionCli`.

- [ ] **Step 1: Write failing boundary and command tests**

Tests must cover exact root `.local/stage7-source-expansion`, ignored/untracked checks, root/file symlinks, path escape, invalid UTF-8, missing inputs, report overwrite, atomic cleanup after an injected write failure, missing `--metadata-only`, unknown/duplicate flags, and all four commands. Use a temporary synthetic repository root and inject `gitStatus` and `assertDatasetBoundary` callbacks; never touch the real `.local` roots.

Define the CLI-test context and populate it only with synthetic JSONL:

```js
async function fixtureContext(t) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-source-expansion-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const context = {
    repositoryRoot,
    root: join(repositoryRoot, '.local', 'stage7-source-expansion'),
    datasetChecks: 0,
    gitStatus: async (args) => args[0] === 'check-ignore' ? 0 : 1,
    assertDatasetBoundary: async () => {
      context.datasetChecks += 1;
      return {
        dataset_hashes: { v1: 'a'.repeat(64), v2: 'b'.repeat(64), v3: 'c'.repeat(64) },
        dataset_v3_gate: { ready_for_m3_real_data: false, training_eligible_count: 0 }
      };
    }
  };
  return context;
}

async function populatedFixtureContext(t) {
  const context = await fixtureContext(t);
  for (const directory of ['metadata', 'evidence', 'reviews', 'reports']) {
    await mkdir(join(context.root, directory), { recursive: true });
  }
  const candidates = [];
  const rights = [];
  for (let source = 1; source <= 10; source += 1) {
    for (let item = 1; item <= 8; item += 1) {
      const sourceId = `source-${String(source).padStart(2, '0')}`;
      const assetId = `item-${String(item).padStart(2, '0')}`;
      const candidateId = `${sourceId}:${assetId}`;
      candidates.push(candidateFixture({ candidate_id: candidateId, source_id: sourceId, asset_id: assetId }));
      rights.push(rightsFixture({ candidate_id: candidateId }));
    }
  }
  const jsonl = (records) => `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  await writeFile(join(context.root, 'metadata', 'candidates.jsonl'), jsonl(candidates), 'utf8');
  await writeFile(join(context.root, 'evidence', 'rights.jsonl'), jsonl(rights), 'utf8');
  return context;
}
```

```js
test('CLI refuses operation without the metadata-only acknowledgement', async (t) => {
  const context = await fixtureContext(t);
  await assert.rejects(
    runStage7SourceExpansionCli(['discovery', '--root', '.local/stage7-source-expansion', '--as-of', '2026-07-16'], context),
    (error) => error.code === 'METADATA_ONLY_REQUIRED'
  );
});

test('discovery writes only the canonical local report trio', async (t) => {
  const context = await populatedFixtureContext(t);
  const result = await runStage7SourceExpansionCli([
    'discovery', '--root', '.local/stage7-source-expansion', '--as-of', '2026-07-16', '--metadata-only'
  ], context);
  assert.equal(result.card_count, 30);
  assert.deepEqual((await readdir(join(context.root, 'reports', 'discovery'))).sort(), [
    'review-cards.json', 'review-cards.md', 'rights-and-ranking.json'
  ]);
  assert.equal(context.datasetChecks, 2);
});
```

- [ ] **Step 2: Run the CLI test to verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionCli.test.js
```

Expected: failure because the boundary and CLI do not exist.

- [ ] **Step 3: Implement exact-root, ignored/untracked, and fresh-write boundaries**

```js
export const SOURCE_EXPANSION_ROOT_RELATIVE = '.local/stage7-source-expansion';
export const SOURCE_EXPANSION_DIRECTORIES = Object.freeze(['metadata', 'evidence', 'reviews', 'reports']);

export class SourceExpansionBoundaryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'SourceExpansionBoundaryError';
    this.code = code;
  }
}

export async function assertSourceExpansionRoot(root, {
  repositoryRoot = process.cwd(),
  gitStatus = defaultGitStatus
} = {}) {
  const repository = path.resolve(repositoryRoot);
  const expected = path.resolve(repository, SOURCE_EXPANSION_ROOT_RELATIVE);
  const absolute = path.resolve(root);
  if (absolute !== expected) throw new SourceExpansionBoundaryError('ROOT_INVALID', absolute);
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SourceExpansionBoundaryError('ROOT_INVALID', absolute);
  if (await gitStatus(['check-ignore', '--quiet', '--', absolute], repository) !== 0) {
    throw new SourceExpansionBoundaryError('ROOT_NOT_IGNORED', absolute);
  }
  if (await gitStatus(['ls-files', '--error-unmatch', '--', absolute], repository) === 0) {
    throw new SourceExpansionBoundaryError('ROOT_TRACKED', absolute);
  }
  return absolute;
}

export async function readSourceExpansionJsonl(root, relativePath, validator) {
  const absolute = await resolveRegularInside(root, relativePath);
  const bytes = await fs.readFile(absolute);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new SourceExpansionBoundaryError('INPUT_INVALID_UTF8', relativePath); }
  return parseValidatedJsonl(text, validator);
}

export async function readSourceExpansionJson(root, relativePath) {
  const absolute = await resolveRegularInside(root, relativePath);
  const bytes = await fs.readFile(absolute);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new SourceExpansionBoundaryError('INPUT_INVALID_UTF8', relativePath); }
  try { return JSON.parse(text); }
  catch { throw new SourceExpansionBoundaryError('INPUT_INVALID_JSON', relativePath); }
}

export async function assertExactInventory(root, relativePath, expected) {
  const directory = path.resolve(root, relativePath);
  await assertInsideWithoutSymlinks(root, directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new SourceExpansionBoundaryError('REPORT_INVENTORY_INVALID', relativePath);
  }
  const actual = entries.map((entry) => entry.name).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new SourceExpansionBoundaryError('REPORT_INVENTORY_INVALID', `${relativePath}:${actual.join(',')}`);
  }
}

export async function writeFreshReportDirectory(root, name, files, { rename = fs.rename } = {}) {
  const reports = path.join(root, 'reports');
  const output = path.join(reports, name);
  await assertInsideWithoutSymlinks(root, reports);
  try { await fs.lstat(output); throw new SourceExpansionBoundaryError('REPORT_EXISTS', name); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(reports, `.${name}.tmp-${process.pid}`);
  try { await fs.lstat(temporary); throw new SourceExpansionBoundaryError('TEMP_EXISTS', temporary); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(temporary);
  try {
    for (const [filename, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      if (!/^[a-z0-9][a-z0-9.-]*$/u.test(filename)) throw new SourceExpansionBoundaryError('REPORT_FILENAME_INVALID', filename);
      await fs.writeFile(path.join(temporary, filename), content, { encoding: 'utf8', flag: 'wx' });
    }
    await rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return output;
}
```

Use these containment and Git helpers. `assertExactInventory` must run before either discovery or yield reports are consumed.

```js
function isEqualOrInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function assertInsideWithoutSymlinks(root, candidate) {
  const sourceRoot = path.resolve(root);
  const absolute = path.resolve(candidate);
  if (!isEqualOrInside(sourceRoot, absolute)) throw new SourceExpansionBoundaryError('PATH_ESCAPE', absolute);
  const relative = path.relative(sourceRoot, absolute);
  let current = sourceRoot;
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) {
      if (error.code === 'ENOENT') throw new SourceExpansionBoundaryError('INPUT_MISSING', current);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new SourceExpansionBoundaryError('PATH_SYMLINK', current);
  }
  return absolute;
}

async function resolveRegularInside(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  await assertInsideWithoutSymlinks(root, absolute);
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink()) throw new SourceExpansionBoundaryError('PATH_SYMLINK', relativePath);
  if (!stat.isFile()) throw new SourceExpansionBoundaryError('INPUT_NOT_REGULAR', relativePath);
  return absolute;
}

async function defaultGitStatus(args, cwd) {
  try { await execFile('git', args, { cwd }); return 0; }
  catch (error) { return Number.isInteger(error.code) ? error.code : 1; }
}
```

- [ ] **Step 4: Implement the four-command CLI without any payload path**

Use `parseArgs` from `node:util` with only `root`, `as-of`, `metadata-only`, and `help`. Reject every other option. Require the exact root for all commands and `--metadata-only` for `discovery`, `yield`, and `finalize`. Import the Task 1–4 exports explicitly; do not import any private-corpus, training, provider, schematic, archive, image, or network module.

```js
export function parseStage7SourceExpansionArgs(argv = []) {
  const [command, ...rest] = argv;
  for (const flag of ['--root', '--as-of', '--metadata-only', '--help']) {
    if (rest.filter((item) => item === flag).length > 1) {
      throw new SourceExpansionBoundaryError('CLI_OPTION_DUPLICATE', flag);
    }
  }
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        root: { type: 'string' },
        'as-of': { type: 'string' },
        'metadata-only': { type: 'boolean' },
        help: { type: 'boolean' }
      },
      strict: true
    }));
  } catch (error) {
    throw new SourceExpansionBoundaryError('CLI_USAGE', error.message);
  }
  if (values.help) return Object.freeze({ help: true });
  if (!['init', 'discovery', 'yield', 'finalize'].includes(command)) {
    throw new SourceExpansionBoundaryError('CLI_COMMAND_INVALID', command || 'missing');
  }
  if (values.root !== SOURCE_EXPANSION_ROOT_RELATIVE) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', values.root || 'missing');
  }
  if (command === 'init' && (values['as-of'] !== undefined || values['metadata-only'] !== undefined)) {
    throw new SourceExpansionBoundaryError('CLI_USAGE', 'init accepts only --root');
  }
  if (command !== 'init' && values['metadata-only'] !== true) {
    throw new SourceExpansionBoundaryError('METADATA_ONLY_REQUIRED', command);
  }
  if (command !== 'init') validateIsoDate(values['as-of'], '--as-of');
  return Object.freeze({ command, root: values.root, asOf: values['as-of'] || null, metadataOnly: values['metadata-only'] === true, help: false });
}

export async function runStage7SourceExpansionCli(argv = process.argv.slice(2), context = {}) {
  const options = parseStage7SourceExpansionArgs(argv);
  if (options.help) return Object.freeze({ help: helpText() });
  const repositoryRoot = path.resolve(context.repositoryRoot || process.cwd());
  const root = path.resolve(repositoryRoot, options.root);
  const assertDataset = context.assertDatasetBoundary || assertFormalDatasetBoundary;
  await assertDataset(repositoryRoot);
  let result;
  if (options.command === 'init') {
    result = await initializeRoot({ root, repositoryRoot, gitStatus: context.gitStatus });
  } else {
    await assertSourceExpansionRoot(root, { repositoryRoot, gitStatus: context.gitStatus });
    result = options.command === 'discovery'
      ? await runDiscovery({ root, asOf: options.asOf })
      : options.command === 'yield'
        ? await runYield({ root, asOf: options.asOf })
        : await runFinalize({ root, asOf: options.asOf });
  }
  await assertDataset(repositoryRoot);
  return result;
}
```

Implement initialization exactly as follows. It creates no acknowledgement, candidate, rights, decision, report, payload, or Dataset file.

```js
async function initializeRoot({ root, repositoryRoot, gitStatus }) {
  try { await fs.lstat(root); throw new SourceExpansionBoundaryError('ROOT_EXISTS', root); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(root), { recursive: true });
  await fs.mkdir(root);
  for (const directory of SOURCE_EXPANSION_DIRECTORIES) await fs.mkdir(path.join(root, directory));
  await assertSourceExpansionRoot(root, { repositoryRoot, gitStatus });
  return Object.freeze({ command: 'init', root: SOURCE_EXPANSION_ROOT_RELATIVE, metadata_only: true, authorizes_download: false, authorizes_training: false });
}
```

`runDiscovery` reads `metadata/candidates.jsonl` and `evidence/rights.jsonl`, evaluates rights, ranks verified candidates, selects the discovery wave, and atomically writes exactly:

```text
reports/discovery/rights-and-ranking.json
reports/discovery/review-cards.json
reports/discovery/review-cards.md
```

Use this exact orchestration shape; `loadCurrentAudit` always revalidates rights against the current `--as-of` date:

```js
async function loadCurrentAudit(root, asOf) {
  const candidates = await readSourceExpansionJsonl(root, 'metadata/candidates.jsonl', validateDiscoveryRecord);
  const rightsRecords = await readSourceExpansionJsonl(root, 'evidence/rights.jsonl', validateRightsRecord);
  const rightsResults = evaluateRightsLedger({ candidates, rightsRecords, asOf });
  const ranking = rankRightsVerifiedCandidates({ candidates, rightsResults });
  const rightsByCandidate = new Map(candidates.map((candidate) => [
    candidate.candidate_id,
    latestUniqueRevision(rightsRecords, candidate.candidate_id)
  ]));
  return { candidates, rightsRecords, rightsResults, ranking, rightsByCandidate };
}

function reportEnvelope(fields) {
  return Object.freeze({
    source: 'stage7-source-expansion-metadata-pilot-v1',
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    ...fields
  });
}

async function runDiscovery({ root, asOf }) {
  const audit = await loadCurrentAudit(root, asOf);
  const cards = selectDiscoveryWave(audit.ranking);
  const rightsAndRanking = reportEnvelope({ as_of: asOf, rights: audit.rightsResults, ranking: audit.ranking });
  const cardReport = reportEnvelope({ as_of: asOf, wave: 'discovery', card_count: cards.length, cards });
  await writeFreshReportDirectory(root, 'discovery', {
    'rights-and-ranking.json': canonicalSourceExpansionJson(rightsAndRanking),
    'review-cards.json': canonicalSourceExpansionJson(cardReport),
    'review-cards.md': renderSourceExpansionCardsMarkdown({ wave: 'discovery', cards, rightsByCandidate: audit.rightsByCandidate })
  });
  return Object.freeze({ command: 'discovery', card_count: cards.length, metadata_only: true, authorizes_download: false, authorizes_training: false });
}

function cardIds(report, wave) {
  if (report?.source !== 'stage7-source-expansion-metadata-pilot-v1' || report.wave !== wave || !Array.isArray(report.cards)) {
    throw new SourceExpansionBoundaryError('REPORT_INVALID', wave);
  }
  return report.cards.map((card) => card.candidate_id);
}

function assertSameCardIds(report, cards, wave) {
  const actual = cardIds(report, wave);
  const expected = cards.map((card) => card.candidate_id);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new SourceExpansionBoundaryError('REPORT_DRIFT', wave);
}

async function runYield({ root, asOf }) {
  await assertExactInventory(root, 'reports/discovery', ['rights-and-ranking.json', 'review-cards.json', 'review-cards.md']);
  const audit = await loadCurrentAudit(root, asOf);
  const discovery = selectDiscoveryWave(audit.ranking);
  const savedDiscovery = await readSourceExpansionJson(root, 'reports/discovery/review-cards.json');
  assertSameCardIds(savedDiscovery, discovery, 'discovery');
  const discoveryDecisions = await readSourceExpansionJsonl(root, 'reviews/discovery-decisions.jsonl', validateReviewDecision);
  const cards = selectYieldWave({ ranked: audit.ranking, discoveryCards: discovery, discoveryDecisions });
  const cardReport = reportEnvelope({ as_of: asOf, wave: 'yield', card_count: cards.length, cards });
  const sourceSummary = reportEnvelope({ as_of: asOf, wave: 'yield', source_ids: [...new Set(cards.map((card) => card.source_id))].sort() });
  await writeFreshReportDirectory(root, 'yield', {
    'review-cards.json': canonicalSourceExpansionJson(cardReport),
    'review-cards.md': renderSourceExpansionCardsMarkdown({ wave: 'yield', cards, rightsByCandidate: audit.rightsByCandidate }),
    'source-summary.json': canonicalSourceExpansionJson(sourceSummary)
  });
  return Object.freeze({ command: 'yield', card_count: cards.length, metadata_only: true, authorizes_download: false, authorizes_training: false });
}

async function runFinalize({ root, asOf }) {
  await assertExactInventory(root, 'reports/discovery', ['rights-and-ranking.json', 'review-cards.json', 'review-cards.md']);
  await assertExactInventory(root, 'reports/yield', ['review-cards.json', 'review-cards.md', 'source-summary.json']);
  const audit = await loadCurrentAudit(root, asOf);
  const discoveryDecisions = await readSourceExpansionJsonl(root, 'reviews/discovery-decisions.jsonl', validateReviewDecision);
  const yieldDecisions = await readSourceExpansionJsonl(root, 'reviews/yield-decisions.jsonl', validateReviewDecision);
  const discovery = selectDiscoveryWave(audit.ranking);
  const yieldCards = selectYieldWave({ ranked: audit.ranking, discoveryCards: discovery, discoveryDecisions });
  assertSameCardIds(await readSourceExpansionJson(root, 'reports/discovery/review-cards.json'), discovery, 'discovery');
  assertSameCardIds(await readSourceExpansionJson(root, 'reports/yield/review-cards.json'), yieldCards, 'yield');
  const summary = buildFinalReviewSummary({ discovery, yieldCards, discoveryDecisions, yieldDecisions });
  await writeFreshReportDirectory(root, 'final', {
    'review-summary.json': canonicalSourceExpansionJson({ ...summary, as_of: asOf }),
    'review-summary.md': renderFinalReviewSummaryMarkdown({ ...summary, as_of: asOf })
  });
  return Object.freeze({ command: 'finalize', ...summary });
}
```

Every root report must retain `metadata_only: true`, `authorizes_download: false`, and `authorizes_training: false`. The final Markdown must not render license text, private paths, payload data, or a download command.

Use this exact help and terminal disclosure boundary:

```js
export function helpText() {
  return `Usage: npm run audit:stage7:sources -- <init|discovery|yield|finalize> --root .local/stage7-source-expansion [--as-of YYYY-MM-DD] [--metadata-only]\n`;
}

async function main() {
  try {
    const result = await runStage7SourceExpansionCli();
    if (result.help) console.log(result.help);
    else console.log(JSON.stringify({
      command: result.command,
      metadata_only: result.metadata_only,
      authorizes_download: false,
      authorizes_training: false,
      card_count: result.card_count ?? null,
      accepted_count: result.accepted_count ?? null
    }));
  } catch (error) {
    console.error(`${error.code || 'SOURCE_EXPANSION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Call `main()` only when `process.argv[1]` resolves to `fileURLToPath(import.meta.url)`. Interactive output contains counts and non-authorization booleans only; it never prints candidate records, rights text, private data, or payload content.

Add this only script to `package.json`:

```json
"audit:stage7:sources": "node src/auditStage7SourceExpansion.js"
```

- [ ] **Step 5: Run the complete focused metadata suite and commit**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionContracts.test.js test/stage7SourceExpansionRights.test.js test/stage7SourceExpansionRanking.test.js test/stage7SourceExpansionReview.test.js test/stage7SourceExpansionCli.test.js
```

Expected: all five files pass with `0` failures, skips, or todos. Commit:

```bash
git add src/construction/learning/stage7SourceExpansionBoundary.js src/auditStage7SourceExpansion.js test/stage7SourceExpansionCli.test.js package.json
git commit -m "feat(stage7): add metadata-only source audit CLI"
```

### Task 6: Document the operator boundary and prove repository isolation

**Files:**
- Modify: `README.md`
- Modify: `test/stage7SourceExpansionCli.test.js`
- Verify only: Dataset v1/v2/v3, `.local/stage7-private-research/`, normal Node generation, and M4 status.

**Interfaces:**
- Consumes: the completed metadata-only CLI.
- Produces: executable documentation, immutable-boundary regression evidence, and a handoff for a later public-metadata pilot run.

- [ ] **Step 1: Add failing documentation and immutable-boundary tests**

```js
test('README documents metadata-only source audit without acquisition authority', async () => {
  const readme = await readFile('README.md', 'utf8');
  assert.match(readme, /npm run audit:stage7:sources -- discovery/u);
  assert.match(readme, /metadata-only/u);
  assert.match(readme, /does not authorize download, Dataset admission, or training/iu);
});

test('synthetic source audit leaves formal Dataset manifests byte-identical', async (t) => {
  const before = await formalDatasetBytes();
  const context = await populatedFixtureContext(t);
  await runStage7SourceExpansionCli([
    'discovery', '--root', '.local/stage7-source-expansion', '--as-of', '2026-07-16', '--metadata-only'
  ], context);
  assert.deepEqual(await formalDatasetBytes(), before);
});

async function formalDatasetBytes() {
  return Promise.all(['v1', 'v2', 'v3'].map(async (version) => ({
    version,
    bytes: (await readFile(`mc_templates/datasets/coarse_semantic_voxels/${version}/manifest.json`)).toString('base64')
  })));
}
```

Add this defense-in-depth static test; contract tests remain authoritative:

```js
test('source expansion metadata implementation has no payload or network surface', async () => {
  const files = [
    'src/construction/learning/stage7SourceExpansionContracts.js',
    'src/construction/learning/stage7SourceExpansionRights.js',
    'src/construction/learning/stage7SourceExpansionRanking.js',
    'src/construction/learning/stage7SourceExpansionReview.js',
    'src/construction/learning/stage7SourceExpansionBoundary.js',
    'src/auditStage7SourceExpansion.js'
  ];
  const forbidden = [
    'http.request', 'https.request', 'fetch(', 'axios', 'playwright', 'puppeteer',
    '.schematic', '.litematic', '.mcstructure', 'child_process.spawn', 'training/stage7'
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const token of forbidden) assert.equal(source.includes(token), false, `${file} contains ${token}`);
  }
});
```

- [ ] **Step 2: Run the documentation test to verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionCli.test.js
```

Expected: the README assertion fails before README is changed.

- [ ] **Step 3: Add the exact README operator sequence**

Document these commands and no acquisition command:

```bash
npm run audit:stage7:sources -- init --root .local/stage7-source-expansion
npm run audit:stage7:sources -- discovery --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
npm run audit:stage7:sources -- yield --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
npm run audit:stage7:sources -- finalize --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
```

State the four manual input paths, the two-wave 30/20 and 5/15 caps, 30-day rights freshness, and the fact that cards link to public preview pages without downloading images. State verbatim: `This workflow does not authorize download, Dataset admission, or training.` State that the 42 deferred oversized private buildings, normal Node generation, M4 Apply Mode, and Dataset v1/v2/v3 remain outside this workflow.

- [ ] **Step 4: Run focused verification during training**

Run sequentially:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7SourceExpansionContracts.test.js test/stage7SourceExpansionRights.test.js test/stage7SourceExpansionRanking.test.js test/stage7SourceExpansionReview.test.js test/stage7SourceExpansionCli.test.js
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js test/stage7PythonProvider.test.js test/docsProjectStatus.test.js
git diff --exit-code -- mc_templates/datasets/coarse_semantic_voxels/v1 mc_templates/datasets/coarse_semantic_voxels/v2 mc_templates/datasets/coarse_semantic_voxels/v3 training/stage7 src/pipeline.js src/index.js
```

Expected: both Node commands have `0` failures; protected paths have no diff. If restricted execution reports child-process `EPERM`, rerun only the exact second Node command with narrowly approved normal child-process permission.

- [ ] **Step 5: Wait for completed private training before full verification**

Do not run the full Node suite while the CPU training run is active. After the run reaches `completed` and its required post-run audit passes, execute:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test
npm run test:stage7:m3
conda run -n mcagent-stage7 --cwd training/stage7 python -c "import json; from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; result=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(json.dumps({'preflight':'passed','case_count':result.case_count,'dataset_v3_gate':result.dataset_v3_gate},sort_keys=True,separators=(',',':')))"
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
```

Expected: full Node and complete Stage 7 Python suites have `0` failures; preflight reports 22 cases and false/zero; hashes exactly match the three Global Constraint values. Do not print private records, run Loss, private hashes, filenames, metrics, or content.

- [ ] **Step 6: Commit documentation and boundary proof**

```bash
git add README.md test/stage7SourceExpansionCli.test.js
git commit -m "docs(stage7): document source expansion metadata pilot"
```

## Execution completion gate

Implementation is complete only when every focused RED/GREEN cycle is evidenced, the protected-path diff is empty, the full post-training verification passes, and the branch contains only the planned source, test, package, README, specification, and plan changes.

Do not populate real candidate or rights JSONL automatically after implementation. The next operational action is a separately owner-approved, metadata-only public-source audit that manually records authoritative evidence and produces the 30-card discovery pack. Do not begin the acquisition/quarantine/parser plan until the current private run is completed, the owner has reviewed both waves, at least 20 candidates are accepted, and at least one source contributes 10 accepted candidates.
