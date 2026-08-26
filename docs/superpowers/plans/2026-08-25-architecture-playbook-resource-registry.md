# Architecture Playbook Resource Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个可提交、严格校验、按来源隔离的 Minecraft 建筑教程资源登记册，并以两个来源、每站五个只读探针完成第一版评估，但不自动晋级或接入现有建筑秘籍流水线。

**Architecture:** 新功能只存在于 `src/playbook/resources/`、`test/playbookResource*.test.js` 和 `docs/architecture-playbook/resources/`。运行时合同采用仓库现有的 Node.js 手写严格校验模式；四份 JSON Schema 是面向人和外部工具的同构公开合同。加载器只读取资源根目录，统一校验路径、来源绑定、报告哈希、决定谱系和公开边界；每个来源继续在自己的目录内保存 profile、probe 和 assessment。

**Tech Stack:** Node.js 20 ESM、`node:test`、`node:fs/promises`、`node:crypto`、JSON Schema Draft 2020-12、JSON 与 Markdown；不新增 npm 依赖，不在测试中联网。

**Spec:** `docs/superpowers/specs/2026-08-25-architecture-playbook-resource-registry-design.md`

## Global Constraints

- 禁止修改 `docs/architecture-playbook/course/`、`docs/architecture-playbook/rules/`、现有 `src/playbook/course/`、现有证据处理代码、`src/construction/` 和黑辉极乐鸟正在使用的 `.local/architecture-playbook/{sources,transcripts,frames,evidence}/`。
- 第一版只写公开原创摘要、结构化观察、URL、权利不确定性和评估；不保存网页快照、完整正文、图片、媒体、投影、模型、逐层数据或批量材料数据。
- MCBlock 和中文 Minecraft Wiki 各固定五个 probe；通用合同仍允许 assessment 引用 3–5 个 probe。
- 两个来源最终状态都是 `assessed`，`decision_history` 都为空；第一版不得创建 `decisions/` 或任何 `approved-for-intake` 记录。
- AI 评估只写 `recommend-approve | recommend-defer | recommend-reject`。本计划固定首版建议为 `recommend-defer`：它表示资料价值已经可以评价，但稳定访问、权利或来源信息仍不足以启动站点处理器。
- 访问能力与使用权利必须分开。站点声明“免费”“可导出”不能推出训练、自动抓取、批量下载或再发布许可。
- `direct-page` 只用于实际直接看到的页面或列表内容；平台自述用 `site-claim`；搜索摘要用 `search-index`；项目归纳用 `project-inference`；无法核验用 `unverified`。
- 所有生产代码行为变更先写失败测试，再做最小实现。每个任务都以聚焦验证和独立提交结束。
- 本计划在执行前必须以精确提交消息 `docs(playbook): plan resource registry implementation` 独立提交；Task 8 用该提交作为隔离审计 baseline。若该提交不存在，先停止并恢复计划提交，不得猜测另一个 SHA。

---

### Task 1: 建立资源合同词汇、共享校验器和 Catalog 合同

**Files:**

- Create: `src/playbook/resources/contracts/vocabularies.js`
- Create: `src/playbook/resources/contracts/validation.js`
- Create: `src/playbook/resources/contracts/catalog.js`
- Create: `src/playbook/resources/contracts/index.js`
- Create: `test/helpers/playbookResourceFixtures.js`
- Create: `test/playbookResourceContracts.test.js`
- Create: `docs/architecture-playbook/resources/schemas/catalog.schema.json`

**Interfaces:**

- Export `RESOURCE_SCHEMA_VERSION = 1` and the frozen vocabularies named below.
- Export `validateResourceCatalog(value): Readonly<ResourceCatalog>`.
- Reuse `failPlaybookContract()` and `PlaybookContractError` from `src/playbook/contracts/playbookContractError.js`; do not introduce a second error class.
- `validation.js` exports clone/freeze, strict-object, timestamp, HTTPS URL, lowercase kebab ID, relative resource path, unique-array, nullable, SHA-256 and rating helpers used only by `src/playbook/resources/contracts/`.

The vocabulary module must define these exact values:

```js
export const RESOURCE_SCHEMA_VERSION = 1;
export const SOURCE_TYPES = [
  'case-catalog', 'author-course', 'collective-reference',
  'video-platform', 'mixed-resource-platform'
];
export const CREATOR_MODELS = [
  'single-author', 'multi-creator', 'collective-editorial', 'unknown'
];
export const ACCESS_OBSERVATION_STATUSES = [
  'observed-available', 'observed-unavailable', 'requires-login',
  'restricted', 'not-reviewed', 'unknown', 'not-applicable'
];
export const AVAILABILITY_STATUSES = [
  'reachable', 'partial-js-render', 'manual-or-api-review-required',
  'source-unavailable', 'unknown'
];
export const RIGHTS_STATUSES = [
  'observed-allowed', 'observed-prohibited', 'not-reviewed',
  'unknown', 'not-applicable'
];
export const LIFECYCLE_STATUSES = [
  'registered', 'probing', 'assessed',
  'approved-for-intake', 'deferred', 'rejected'
];
export const RECOMMENDATIONS = [
  'recommend-approve', 'recommend-defer', 'recommend-reject'
];
export const OBSERVATION_BASES = [
  'direct-page', 'site-claim', 'search-index',
  'project-inference', 'unverified'
];
export const RATING_DIMENSIONS = [
  'principles', 'construction_sequence', 'reference_case', 'materials',
  'survival_constraints', 'evaluation', 'provenance',
  'access_stability', 'rights_clarity'
];
export const DECISIONS = ['approved-for-intake', 'deferred', 'rejected'];
```

`ResourceCatalog` has exactly `schema_version`, `catalog_id`, `updated_at`, and `sources`. Each source entry has exactly `source_id`, `title`, `lifecycle_status`, `profile_path`, and nullable `assessment_path`. Catalog sources contain 1–1,024 entries; IDs contain 1–64 ASCII characters, titles 1–512 Unicode code points, and resource paths 1–512 Unicode code points. Enforce:

- `catalog_id === 'architecture-playbook-resource-catalog'`;
- source IDs and profile paths are unique;
- `profile_path === sources/<source_id>/source.json`;
- `assessment_path === null` for `registered | probing`;
- otherwise `assessment_path === sources/<source_id>/assessment.md`;
- catalog entries are sorted lexically by `source_id` so the file is deterministic.

- [ ] **Step 1: Write the failing shared and catalog tests**

```js
test('validates and freezes the minimal resource catalog', () => {
  const catalog = validateResourceCatalog(resourceCatalogFixture());
  assert.equal(catalog.catalog_id, 'architecture-playbook-resource-catalog');
  assert.ok(Object.isFrozen(catalog.sources[0]));
});

test('catalog rejects unknown fields and source path drift', () => {
  const unknown = resourceCatalogFixture();
  unknown.extra = true;
  assert.throws(() => validateResourceCatalog(unknown), /PLAYBOOK_RESOURCE_FIELD_UNKNOWN/u);

  const escaped = resourceCatalogFixture();
  escaped.sources[0].profile_path = '../course/course-manifest.json';
  assert.throws(() => validateResourceCatalog(escaped), /PLAYBOOK_RESOURCE_PATH_INVALID/u);
});

```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookResourceContracts.test.js`

Expected: FAIL because `src/playbook/resources/contracts/index.js` does not exist.

- [ ] **Step 3: Implement the shared validators and Catalog validator**

Use `structuredClone()` before validation and recursively freeze the validated clone. Every object uses an exact-field check; paths reject absolute paths, backslashes, empty segments, `.` and `..`; timestamps must round-trip through `Date.parse`; URLs must use HTTPS and contain no credentials.

Use stable `PLAYBOOK_RESOURCE_*` codes, including:

```text
PLAYBOOK_RESOURCE_FIELD_UNKNOWN
PLAYBOOK_RESOURCE_FIELD_REQUIRED
PLAYBOOK_RESOURCE_VERSION_INVALID
PLAYBOOK_RESOURCE_ID_INVALID
PLAYBOOK_RESOURCE_URL_INVALID
PLAYBOOK_RESOURCE_PATH_INVALID
PLAYBOOK_RESOURCE_CATALOG_ORDER_INVALID
PLAYBOOK_RESOURCE_LIFECYCLE_INVALID
PLAYBOOK_RESOURCE_RATING_INVALID
```

- [ ] **Step 4: Publish and check the strict Catalog JSON Schema**

Write Draft 2020-12 schema with `$id: "https://minecraft-constructing-agents.local/schemas/resource-catalog-v1.json"`, `additionalProperties: false` at every object layer, the same required fields and enums, path patterns, `minItems: 1`, and `uniqueItems: true` where JSON equality is meaningful. Add a test that parses the schema and confirms its top-level `required`, `const` version, lifecycle enum and `additionalProperties: false` match the runtime contract.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test test/playbookResourceContracts.test.js`

```bash
git add src/playbook/resources/contracts test/helpers/playbookResourceFixtures.js test/playbookResourceContracts.test.js docs/architecture-playbook/resources/schemas/catalog.schema.json
git commit -m "feat(playbook): define resource catalog contract"
```

### Task 2: 实现严格 SourceProfile 合同与 Schema

**Files:**

- Create: `src/playbook/resources/contracts/sourceProfile.js`
- Modify: `src/playbook/resources/contracts/index.js`
- Modify: `test/helpers/playbookResourceFixtures.js`
- Modify: `test/playbookResourceContracts.test.js`
- Create: `docs/architecture-playbook/resources/schemas/source-profile.schema.json`

**Interfaces:**

- Export `validateResourceSourceProfile(value): Readonly<ResourceSourceProfile>`.
- Export `SOURCE_PROFILE_FIELDS` so schema parity tests can compare required top-level names without duplicating a hidden list.
- Identity observation objects `operator` and `publisher` have exactly `{ name, url, basis }`; `url` is nullable HTTPS and `basis` is one observation-basis enum.
- Access observation objects have exactly `{ status, evidence_url, checked_at, note }`.
- Rights observation objects have exactly `{ status, evidence_url, checked_at, note }` but use `RIGHTS_STATUSES`.
- In both observation objects, `evidence_url` is nullable HTTPS, `checked_at` is a timestamp, and `note` is an original 1–1,024-code-point string; unknown/not-reviewed observations may use `null` and must never invent an evidence URL.
- Ratings have all nine dimensions exactly once; every dimension is `{ value, reason }`, where `value` is integer `0..4` or string `unknown`, and `reason` is an original 1–512-code-point sentence.

The top-level profile field list is exactly the field list in spec sections 7.1–7.6. Treat `content_hierarchy`, `content_unit_types`, `representation_modes`, `access_methods`, all coverage fields, extractable fields, operation lists, adapter requirements and risk flags as unique string arrays. Every item is 1–256 Unicode code points. Content/access/coverage/extractable/suitable-operation arrays contain 1–64 items; `prohibited_operations`, `adapter_requirements`, and `risk_flags` contain 0–64 items; `alternate_urls` and `decision_history` contain 0–64 items. Only `knowledge_modes` is closed to 1–6 values from:

```text
design-principles
construction-sequence
reference-case
materials
survival-constraints
visual-evaluation
```

Enforce the lifecycle matrix exactly:

| lifecycle | assessment | decision_history |
|---|---|---|
| `registered`, `probing` | `null` | empty |
| `assessed` | complete object | empty |
| `approved-for-intake`, `deferred`, `rejected` | complete object | nonempty |

The assessment object is exactly `{ path, sha256, completed_at, probe_ids, recommendation, ratings, risk_flags }`; it references 3–5 unique probes and its path is exactly `sources/<source_id>/assessment.md`. Every decision-history path is exactly `sources/<source_id>/decisions/YYYY-MM-DD-<decision>.json`. Cross-file content and chronology are deferred to the registry loader in Task 5.

- [ ] **Step 1: Add failing SourceProfile contract tests**

```js
test('assessed source requires a bound assessment and no owner decision', () => {
  const profile = validateResourceSourceProfile(resourceSourceProfileFixture());
  assert.equal(profile.lifecycle_status, 'assessed');
  assert.equal(profile.assessment.probe_ids.length, 5);
  assert.deepEqual(profile.decision_history, []);
});

test('registered source cannot carry an assessment', () => {
  const profile = resourceSourceProfileFixture({ lifecycle_status: 'registered' });
  profile.decision_history = [];
  assert.throws(
    () => validateResourceSourceProfile(profile),
    /PLAYBOOK_RESOURCE_ASSESSMENT_FORBIDDEN/u
  );
});

test('unknown rights cannot be silently rewritten as allowed', () => {
  const profile = resourceSourceProfileFixture();
  profile.model_training.status = true;
  assert.throws(
    () => validateResourceSourceProfile(profile),
    /PLAYBOOK_RESOURCE_RIGHTS_STATUS_INVALID/u
  );
});

test('platform can never be a school in the registry', () => {
  const profile = resourceSourceProfileFixture();
  profile.platform_is_school = true;
  assert.throws(
    () => validateResourceSourceProfile(profile),
    /PLAYBOOK_RESOURCE_PLATFORM_SCHOOL_FORBIDDEN/u
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookResourceContracts.test.js`

Expected: FAIL because `validateResourceSourceProfile` is not exported.

- [ ] **Step 3: Implement the profile validator and lifecycle invariants**

Validate tri-state fields as literal `true | false | 'unknown'`, canonical and alternate URL uniqueness after URL normalization, timestamps, source type, creator model and fixed `platform_is_school: false`. Require assessment risk flags to be a subset of the profile risk flags. Do not infer access rights from artifact access.

- [ ] **Step 4: Add `source-profile.schema.json` and schema parity tests**

Use `$id: "https://minecraft-constructing-agents.local/schemas/source-profile-v1.json"`, strict nested `$defs`, conditional `if/then` branches for lifecycle/assessment/decision-history, and the exact rating object. The schema and runtime validator must both reject an extra top-level or nested field.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test test/playbookResourceContracts.test.js`

```bash
git add src/playbook/resources/contracts/sourceProfile.js src/playbook/resources/contracts/index.js test/helpers/playbookResourceFixtures.js test/playbookResourceContracts.test.js docs/architecture-playbook/resources/schemas/source-profile.schema.json
git commit -m "feat(playbook): validate resource source profiles"
```

### Task 3: 实现 ProbeReport 合同与观察证据边界

**Files:**

- Create: `src/playbook/resources/contracts/probeReport.js`
- Modify: `src/playbook/resources/contracts/index.js`
- Modify: `test/helpers/playbookResourceFixtures.js`
- Modify: `test/playbookResourceContracts.test.js`
- Create: `docs/architecture-playbook/resources/schemas/probe-report.schema.json`

**Interfaces:**

- Export `validateResourceProbeReport(value): Readonly<ResourceProbeReport>`.
- `access_result` is exactly `{ status, http_status, final_url, note }`; `status` uses availability statuses and `http_status` is nullable integer `100..599`.
- `content_revision` is exactly `{ status, value, basis }`, where status is `known | unknown`; unknown requires `value: null`.
- `content_fingerprint` is exactly `{ status, sha256, basis }`, where status is `known | unknown`; unknown requires `sha256: null`.
- `creator_observation` is exactly `{ status, display_name, profile_url, bases }`; status is `known | unknown | conflicting | not-applicable`, profile URL is nullable HTTPS, and bases is a nonempty unique list.
- `rights_observations` contains the same six exact rights dimensions as SourceProfile.
- `knowledge_value` is the exact nine-dimension ratings object.

Enforce these semantic rules:

- known creator requires a nonempty display name; all other creator states require `display_name: null`;
- every creator basis must also appear in top-level `observation_bases`;
- `content_revision.status: known` requires a nonempty value;
- `content_fingerprint.status: known` requires a lowercase SHA-256;
- no title-derived hash or synthetic revision is accepted as known;
- `observed_structure`, `extractable_fields`, and `recommended_adapter_behavior` are unique arrays of 1–64 original strings; `blocking_conditions` contains 0–64 strings. Every item is 1–512 Unicode code points. `observation_bases` and creator `bases` contain 1–5 unique enum values;
- the report contains no `school_id`, copied page body, raw HTML, media URL, download payload or source-specific private object.

- [ ] **Step 1: Add failing ProbeReport boundary tests**

```js
test('unknown creator cannot carry an invented display name', () => {
  const probe = resourceProbeReportFixture();
  probe.creator_observation = {
    status: 'unknown',
    display_name: '猜测作者',
    profile_url: null,
    bases: ['project-inference']
  };
  assert.throws(
    () => validateResourceProbeReport(probe),
    /PLAYBOOK_RESOURCE_CREATOR_NAME_FORBIDDEN/u
  );
});

test('search-index evidence cannot be presented as direct-page evidence', () => {
  const probe = resourceProbeReportFixture();
  probe.observation_bases = ['search-index'];
  probe.creator_observation.bases = ['direct-page'];
  assert.throws(
    () => validateResourceProbeReport(probe),
    /PLAYBOOK_RESOURCE_CREATOR_BASIS_UNBOUND/u
  );
});

test('unknown fingerprint remains distinct from a real SHA-256', () => {
  const probe = resourceProbeReportFixture();
  probe.content_fingerprint = {
    status: 'unknown', sha256: '0'.repeat(64), basis: 'unverified'
  };
  assert.throws(
    () => validateResourceProbeReport(probe),
    /PLAYBOOK_RESOURCE_FINGERPRINT_UNKNOWN_INVALID/u
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookResourceContracts.test.js`

Expected: FAIL because `validateResourceProbeReport` is not exported.

- [ ] **Step 3: Implement the strict probe validator**

Use exact top-level fields from spec section 8. Keep `sample_role` as a stable lowercase kebab token and `selection_reason`/`summary` as original prose. Clone and deep-freeze results exactly like the other contracts.

- [ ] **Step 4: Add `probe-report.schema.json` and parity tests**

Use `$id: "https://minecraft-constructing-agents.local/schemas/probe-report-v1.json"`; set `additionalProperties: false` recursively and encode the known/unknown conditionals for creator, revision and fingerprint.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test test/playbookResourceContracts.test.js`

```bash
git add src/playbook/resources/contracts/probeReport.js src/playbook/resources/contracts/index.js test/helpers/playbookResourceFixtures.js test/playbookResourceContracts.test.js docs/architecture-playbook/resources/schemas/probe-report.schema.json
git commit -m "feat(playbook): validate resource probe reports"
```

### Task 4: 实现 PromotionDecision 合同，但不创建决定数据

**Files:**

- Create: `src/playbook/resources/contracts/promotionDecision.js`
- Modify: `src/playbook/resources/contracts/index.js`
- Modify: `test/helpers/playbookResourceFixtures.js`
- Modify: `test/playbookResourceContracts.test.js`
- Create: `docs/architecture-playbook/resources/schemas/promotion-decision.schema.json`

**Interfaces:**

- Export `validateResourcePromotionDecision(value): Readonly<ResourcePromotionDecision>`.
- The object has exactly `schema_version`, `decision_id`, `source_id`, `decision`, `decided_by`, `decided_at`, `assessment_path`, `assessment_sha256`, `probe_ids`, `conditions`, and `reason`.
- `decided_by` is exactly `project-owner`; `decision` uses `DECISIONS`; assessment path is exactly `sources/<source_id>/assessment.md`; probe IDs are 3–5 unique IDs; conditions is an ordered array of original short strings and may be empty.
- The validator checks document shape only. Task 5 checks source binding, hash, probe set, chronology and final lifecycle.

- [ ] **Step 1: Add failing owner-gate tests**

```js
test('promotion decision is reserved for the project owner', () => {
  const decision = resourcePromotionDecisionFixture();
  decision.decided_by = 'ai-agent';
  assert.throws(
    () => validateResourcePromotionDecision(decision),
    /PLAYBOOK_RESOURCE_DECIDER_INVALID/u
  );
});

test('promotion decision binds the exact source assessment path', () => {
  const decision = resourcePromotionDecisionFixture();
  decision.assessment_path = 'sources/other/assessment.md';
  assert.throws(
    () => validateResourcePromotionDecision(decision),
    /PLAYBOOK_RESOURCE_DECISION_SOURCE_MISMATCH/u
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/playbookResourceContracts.test.js`

Expected: FAIL because the decision validator is not exported.

- [ ] **Step 3: Implement the decision validator and strict Schema**

Create `promotion-decision.schema.json` with `$id: "https://minecraft-constructing-agents.local/schemas/promotion-decision-v1.json"`, exact required fields, fixed owner, exact decision enum, SHA-256 and path constraints. Add schema parity assertions to the contract test.

- [ ] **Step 4: Verify all four contract files together**

Run: `node --test test/playbookResourceContracts.test.js`

Expected: PASS. Confirm the test explicitly parses all four schema JSON files and all validated fixture objects are deeply frozen clones.

- [ ] **Step 5: Commit**

```bash
git add src/playbook/resources/contracts/promotionDecision.js src/playbook/resources/contracts/index.js test/helpers/playbookResourceFixtures.js test/playbookResourceContracts.test.js docs/architecture-playbook/resources/schemas/promotion-decision.schema.json
git commit -m "feat(playbook): enforce resource promotion decisions"
```

### Task 5: 建立只读 Registry Loader 与隔离审计

**Files:**

- Create: `src/playbook/resources/resourceRegistry.js`
- Create: `src/playbook/resources/index.js`
- Create: `test/playbookResourceRegistry.test.js`
- Modify: `test/helpers/playbookResourceFixtures.js`

**Interfaces:**

```js
export async function loadResourceRegistry({ projectRoot })
// -> Readonly<{
//   schema_version: 1,
//   catalog: ResourceCatalog,
//   sources: Array<{
//     entry, profile, probes,
//     assessment: null | { path, text, sha256 },
//     decisions
//   }>
// }>

export async function auditResourceRegistry({
  projectRoot,
  expectedProbeCounts = {}
})
// -> Readonly<{
//   schema_version: 1,
//   source_count, probe_count, decision_count,
//   cross_source_reference_count,
//   private_path_leak_count,
//   unexpected_file_count,
//   gate: { status: 'passed', blocker_codes: [] }
// }>
```

The fixture helper must export `resourceRegistryProjectFixture(t, options)`, `writeMalformedProtectedSentinels(projectRoot)`, `replaceAssessmentText(projectRoot, text)`, and `escapedResourceRegistryFixture(t)`. It writes only inside a `t`-managed temporary directory, computes real assessment hashes, and defaults to one assessed `fixture-source` with three probes and no decisions.

Both public functions throw `PlaybookContractError` on any structural, containment, binding, count, hash, lineage or public-boundary failure. `auditResourceRegistry()` returns the documented `gate.status: 'passed'` report only after all checks pass; it is not a best-effort linter and never returns a failed report.

Implement these exact cross-file checks:

1. Resolve the real resource root at `docs/architecture-playbook/resources/`; every referenced file must remain under its realpath and cannot be a symlink escape.
2. Parse and validate `catalog.json`, then each profile, sorted `probes/*.json`, optional assessment and referenced decisions.
3. Catalog entry ID, title, lifecycle, profile path and assessment path must equal its profile.
4. Canonical plus alternate URLs are unique across all profiles after URL normalization; clear fragments before comparison.
5. A probe's `source_id` matches its directory and profile. Its hostname must be one of the profile canonical/alternate hostnames.
6. Probe IDs and URLs are unique inside and across sources. Every assessment probe ID exists, and for assessed sources the assessment probe set equals the discovered probe set.
7. Compute SHA-256 over the exact UTF-8 assessment bytes and match `profile.assessment.sha256`.
8. Decision files are append-only references: discovered decision paths equal `decision_history`, are ordered by `decided_at`, bind the current assessment hash and exact probe set, and the last decision equals the profile lifecycle.
9. Allow only `README.md`, `catalog.json`, the four named schema files, and each source's `source.json`, `assessment.md`, `probes/*.json`, `decisions/*.json`. Reject snapshots, HTML, images, video, schematics, archives and unexpected files.
10. Scan persisted JSON string values and assessment Markdown for Unix home paths, Windows drive paths and concrete `.local/architecture-playbook/` artifact references. Only the registry README may document the standard `.local/architecture-playbook/resources/` boundary.
11. Never read `course/`, `rules/`, `.local/architecture-playbook/sources/`, or any network resource.

- [ ] **Step 1: Write failing temp-directory loader tests**

```js
test('loads a valid isolated resource registry without reading course or rules', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t, {
    sources: ['fixture-source'], probeCount: 3
  });
  await writeMalformedProtectedSentinels(projectRoot);

  const registry = await loadResourceRegistry({ projectRoot });
  assert.equal(registry.sources.length, 1);
  assert.equal(registry.sources[0].probes.length, 3);
});

test('rejects assessment hash drift', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await replaceAssessmentText(projectRoot, '# changed\n');
  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_ASSESSMENT_HASH_MISMATCH/u
  );
});

test('rejects cross-source probes and symlink escapes', async (t) => {
  const projectRoot = await escapedResourceRegistryFixture(t);
  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_PATH_ESCAPE|PLAYBOOK_RESOURCE_PROBE_SOURCE_MISMATCH/u
  );
});

test('generic audit accepts three probes but initial-count policy can require five', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t, { probeCount: 3 });
  const generic = await auditResourceRegistry({ projectRoot });
  assert.equal(generic.gate.status, 'passed');
  await assert.rejects(
    auditResourceRegistry({
      projectRoot,
      expectedProbeCounts: { 'fixture-source': 5 }
    }),
    /PLAYBOOK_RESOURCE_PROBE_COUNT_MISMATCH/u
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/playbookResourceRegistry.test.js`

Expected: FAIL because `resourceRegistry.js` does not exist.

- [ ] **Step 3: Implement contained reads and cross-file validation**

Use `node:fs/promises` only. Read exact known paths, sort directory entries, resolve realpaths before reading, and hash with `createHash('sha256').update(bytes).digest('hex')`. Do not add a CLI or npm script in this version.

- [ ] **Step 4: Add negative tests for the public boundary and decision lineage**

Cover an unexpected `.html`, an absolute `/home/guoba/private/snapshot.html` path in JSON, a concrete `.local` artifact path in assessment, duplicate canonical URLs, wrong probe host, unreferenced decision, stale assessment hash in a decision, and a last decision that disagrees with profile lifecycle.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test test/playbookResourceContracts.test.js test/playbookResourceRegistry.test.js`

```bash
git add src/playbook/resources test/helpers/playbookResourceFixtures.js test/playbookResourceRegistry.test.js
git commit -m "feat(playbook): load isolated resource registries"
```

### Task 6: 登记和评估 MCBlock 的五个只读探针

**Files:**

- Create: `docs/architecture-playbook/resources/sources/mcblock/source.json`
- Create: `docs/architecture-playbook/resources/sources/mcblock/probes/mcblock-teahouse-c8db481c.json`
- Create: `docs/architecture-playbook/resources/sources/mcblock/probes/mcblock-cinnamoroll-cafe-7583ff98.json`
- Create: `docs/architecture-playbook/resources/sources/mcblock/probes/mcblock-victorian-manor-6e5b406e.json`
- Create: `docs/architecture-playbook/resources/sources/mcblock/probes/mcblock-modern-office-four-06941222.json`
- Create: `docs/architecture-playbook/resources/sources/mcblock/probes/mcblock-sakura-witch-house-5f3aff4d.json`
- Create: `docs/architecture-playbook/resources/sources/mcblock/assessment.md`
- Create: `test/helpers/loadCommittedResourceSource.js`
- Create: `test/playbookResourceMcblockCorpus.test.js`

**Required source facts and boundaries:**

- `source_id: "mcblock"`, `source_type: "case-catalog"`, `creator_model: "multi-creator"`, `platform_is_school: false`, lifecycle `assessed`, empty decision history.
- Canonical source URL is `https://mcblock.top/buildings`; platform abilities such as 3D preview, layer-by-layer learning, quantities and export formats are `site-claim`, not download or training permission.
- MCBlock profile availability is `partial-js-render`; `requires_login` is `unknown`; `client_rendered` is `true`. Automated retrieval, artifact download, model training and redistribution remain `not-reviewed` or `unknown` with evidence-specific reasons.
- Every probe uses its canonical UUID URL. Revision and fingerprint remain explicit `unknown`; no title-derived hash is allowed.
- “维多利亚庄园” may use direct detail-page observations for title, difficulty, dimensions, tags and step summary. The other four must identify list/card observations separately and must not promote site-wide claims to item facts.
- Known creators: “茶坊” records `JPCore`; “玉桂狗咖啡厅” records `MassiveSpeck`. “现代办公楼·四” and “樱花女巫小屋” remain unknown. “维多利亚庄园” remains `unknown` unless an explicit author field is directly evidenced; “JPCore 的更多投影” is insufficient and may only be explained as an inference.
- Preserve observed list values only as short facts: 茶坊 `高级 / 约5.4K方块 / 34格高`; 玉桂狗咖啡厅 `新手 / 约3.2K / 32格高`; 维多利亚庄园 `高级 / 2.4万 / 35×85×47 / 中型、自然、庄园、中世纪`; 现代办公楼·四 `大师 / 约5.9万 / 113格高`; 樱花女巫小屋 `新手 / 约1.8K / 29格高`.
- Do not persist volatile site-wide totals because different entry points exposed inconsistent counts.

Use these exact sample roles, bases and per-probe rating values. Each stored rating still includes a one-sentence evidence-bound reason; `u` below means the literal JSON string `"unknown"`, never numeric zero.

| probe | sample_role | observation_bases | principles | sequence | case | materials | survival | evaluation | provenance | stability | rights |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 茶坊 | `style-and-roof-complexity` | `direct-page`, `site-claim`, `project-inference` | 1 | 3 | 4 | 2 | u | 2 | 3 | 2 | u |
| 玉桂狗咖啡厅 | `beginner-curved-color-case` | `direct-page`, `site-claim`, `project-inference` | 1 | 3 | 4 | 2 | u | 2 | 3 | 2 | u |
| 维多利亚庄园 | `large-medieval-detail-case` | `direct-page`, `site-claim`, `project-inference` | 1 | 4 | 4 | 3 | u | 3 | 2 | 3 | u |
| 现代办公楼·四 | `master-scale-modern-case` | `direct-page`, `site-claim`, `project-inference` | u | 3 | 4 | 2 | u | 2 | 1 | 1 | u |
| 樱花女巫小屋 | `small-beginner-case` | `direct-page`, `site-claim`, `project-inference` | u | 3 | 3 | 2 | u | 2 | 1 | 2 | u |

Use this exact assessment rating vector:

```json
{
  "principles": { "value": 1, "reason": "探针主要展示案例和操作入口，设计理由说明有限。" },
  "construction_sequence": { "value": 4, "reason": "站点明确以三维逐层学习为核心，但多数样本的详情数据尚未稳定直读。" },
  "reference_case": { "value": 4, "reason": "五个样本覆盖风格、难度和体量差异，案例参考价值高。" },
  "materials": { "value": 3, "reason": "站点声明提供方块数量或材料信息，详情可见性仍不一致。" },
  "survival_constraints": { "value": "unknown", "reason": "现有探针不足以确认生存模式成本或施工约束。" },
  "evaluation": { "value": 2, "reason": "难度、尺寸和方块量可辅助比较，但未观察到系统设计评价。" },
  "provenance": { "value": 2, "reason": "部分案例有作者字段，另一些作者未知且页面字段不稳定。" },
  "access_stability": { "value": 2, "reason": "列表可见但详情依赖动态渲染，五个页面的可读程度不一致。" },
  "rights_clarity": { "value": "unknown", "reason": "免费和可导出声明不能证明训练、批量下载或再发布权利。" }
}
```

Assessment recommendation is exactly `recommend-defer`. Its adapter scope, if later approved, is a site-specific read-only metadata/layer viewer adapter with rate, login, rights and export boundaries reviewed separately; it cannot feed course, rules or training directly.

- [ ] **Step 1: Create the test-only source reader, then write a failing committed-corpus test**

First implement `loadCommittedResourceSource(sourceId, { projectRoot } = {})` in the test helper. It must read only `sources/<sourceId>/source.json`, sorted `probes/*.json`, and `assessment.md`; validate the JSON through public resource contracts; compute the Markdown SHA-256; and return `{ profile, probes, assessment_text, assessment_sha256 }`. It is test support, not a second production registry. Its default `projectRoot` is `path.resolve(import.meta.dirname, '../..')` from `test/helpers/`.

```js
test('MCBlock corpus contains exactly the five approved probes', async () => {
  const corpus = await loadCommittedResourceSource('mcblock');
  assert.deepEqual(corpus.probes.map((probe) => probe.probe_id), [
    'mcblock-cinnamoroll-cafe-7583ff98',
    'mcblock-modern-office-four-06941222',
    'mcblock-sakura-witch-house-5f3aff4d',
    'mcblock-teahouse-c8db481c',
    'mcblock-victorian-manor-6e5b406e'
  ]);
  assert.equal(corpus.profile.lifecycle_status, 'assessed');
  assert.equal(corpus.profile.assessment.recommendation, 'recommend-defer');
  assert.deepEqual(corpus.profile.decision_history, []);
  assert.equal(corpus.assessment_sha256, corpus.profile.assessment.sha256);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/playbookResourceMcblockCorpus.test.js`

Expected: FAIL because the MCBlock source directory does not exist.

- [ ] **Step 3: Write five original probe reports and the human assessment**

The assessment Markdown must contain these headings: `定位`, `探针覆盖与局限`, `九维判断`, `技术与来源风险`, `AI 建议`, `获批后的适配器边界`. Keep every summary short and original; link to source pages rather than copying page text.

- [ ] **Step 4: Bind the exact assessment bytes into `source.json`**

Run:

```bash
sha256sum docs/architecture-playbook/resources/sources/mcblock/assessment.md
```

Copy the emitted lowercase 64-character hash into `source.json.assessment.sha256`; set `assessment.probe_ids` to the five exact IDs and use the fixed ratings above. This is an intentional two-edit binding, not a generated placeholder.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test test/playbookResourceContracts.test.js test/playbookResourceMcblockCorpus.test.js`

```bash
git add docs/architecture-playbook/resources/sources/mcblock test/helpers/loadCommittedResourceSource.js test/playbookResourceMcblockCorpus.test.js
git commit -m "docs(playbook): assess five MCBlock resource probes"
```

### Task 7: 登记和评估中文 Minecraft Wiki 的五个只读探针

**Files:**

- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/source.json`
- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/probes/zh-wiki-tutorial-index.json`
- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/probes/zh-wiki-best-building-materials.json`
- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/probes/zh-wiki-house-types.json`
- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/probes/zh-wiki-roof-construction-guide.json`
- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/probes/zh-wiki-roof-types.json`
- Create: `docs/architecture-playbook/resources/sources/zh-minecraft-wiki/assessment.md`
- Create: `test/playbookResourceZhMinecraftWikiCorpus.test.js`

**Required source facts and boundaries:**

- `source_id: "zh-minecraft-wiki"`, `source_type: "collective-reference"`, `creator_model: "collective-editorial"`, `platform_is_school: false`, lifecycle `assessed`, empty decision history.
- Treat all five content-unit creators as `not-applicable` or `unknown`; never assign a single-author school identity to collectively edited pages.
- Record the actual access route per probe. If direct browser/API access is prevented or not verified, use `search-index`/`unverified`, `manual-or-api-review-required`, and explicit unknown revision/fingerprint. Never label a search snippet `direct-page` and never bypass robots.
- The five probes cover navigation, material evaluation, house typology, roof construction guidance and roof typology. They are reference/tutorial units, not five authored course episodes.
- Do not copy article sections, images, templates or tables. Store only short original descriptions of observed or indexed subject matter and the canonical URLs from the spec.
- License, revision ID, API usability and redistribution status must remain evidence-bound. A general expectation about MediaWiki or wiki licensing is not evidence for this specific observation.
- The four pages other than “屋顶建造指南” keep revision status `unknown`. “屋顶建造指南” records revision value `1050593` with basis `search-index`; its content fingerprint remains `unknown` because a cached stable-link suffix is not the page-byte hash.

Use these exact sample roles, bases and per-probe rating values. Every probe uses `observation_bases: ["search-index", "unverified"]`, access status `manual-or-api-review-required`, HTTP status `403`, and a short note that the index cache was about 1.2 years old at observation time. `u` means the literal `"unknown"`.

| probe | sample_role | principles | sequence | case | materials | survival | evaluation | provenance | stability | rights |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 教程总入口 | `tutorial-navigation` | u | u | 2 | 2 | 3 | 2 | 2 | 1 | u |
| 最佳建筑材料 | `material-evaluation` | 3 | 2 | 2 | 4 | 4 | 4 | 2 | 1 | u |
| 房屋类型 | `survival-house-typology` | 2 | 3 | 3 | 3 | 4 | 2 | 1 | 1 | u |
| 屋顶建造指南 | `roof-construction-sequence` | 4 | 4 | 3 | 2 | 2 | 4 | 3 | 1 | u |
| 屋顶类型 | `roof-type-taxonomy` | 3 | 2 | 4 | 2 | 1 | 4 | 2 | 1 | u |

Keep the indexed observations bounded to these facts: the tutorial entry's internal category tree is not verified; the materials page exposes availability/durability/aesthetics dimensions; the house-types page carries maintenance/translation warnings and survival-oriented tiers; the roof guide exposes proportion/slope/connection topics and the `oldid`; the roof-types page is a roof taxonomy. Do not reproduce cached passages or exhaustive lists.

Use this exact assessment rating vector:

```json
{
  "principles": { "value": 3, "reason": "主题覆盖材料选择、房屋类型和屋顶构造，但本轮只能有限核验正文论证。" },
  "construction_sequence": { "value": 3, "reason": "屋顶建造指南具有流程潜力，当前访问依据不足以确认全部步骤细节。" },
  "reference_case": { "value": 2, "reason": "页面提供类型与做法参考，但不是结构化单体建筑案例库。" },
  "materials": { "value": 4, "reason": "最佳建筑材料页面直接对应材料选择与比较这一核心知识模式。" },
  "survival_constraints": { "value": 3, "reason": "综合教程与材料主题可能覆盖游戏条件，具体版本和限制仍需人工或 API 复核。" },
  "evaluation": { "value": 3, "reason": "材料和构件分类适合形成比较维度，但不能从索引摘要重建完整评价标准。" },
  "provenance": { "value": 2, "reason": "集体编辑来源可识别，但本轮未稳定取得每页修订与贡献谱系。" },
  "access_stability": { "value": 1, "reason": "自动直接访问受限，当前主要依赖搜索索引和后续人工或 API 核验。" },
  "rights_clarity": { "value": "unknown", "reason": "本轮没有直接核验适用于页面文本、图片和结构化再利用的具体许可证据。" }
}
```

Assessment recommendation is exactly `recommend-defer`. If later approved, the adapter scope is a MediaWiki-aware, revision-pinned, attribution-preserving read-only article adapter after robots/API/terms review; it must keep text, images and structured facts as separate rights classes.

- [ ] **Step 1: Write a failing committed-corpus test**

```js
test('Chinese Minecraft Wiki corpus contains exactly five collective-reference probes', async () => {
  const corpus = await loadCommittedResourceSource('zh-minecraft-wiki');
  assert.equal(corpus.probes.length, 5);
  assert.ok(corpus.probes.every((probe) =>
    ['unknown', 'not-applicable'].includes(probe.creator_observation.status)
  ));
  assert.ok(corpus.probes.every((probe) =>
    !probe.observation_bases.includes('direct-page')
  ));
  assert.equal(corpus.profile.assessment.recommendation, 'recommend-defer');
  assert.equal(corpus.assessment_sha256, corpus.profile.assessment.sha256);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/playbookResourceZhMinecraftWikiCorpus.test.js`

Expected: FAIL because the Wiki source directory does not exist.

- [ ] **Step 3: Write five truthful probe reports and the human assessment**

Use the same six assessment headings as MCBlock. Explicitly state that observed access limitations reduce evidence confidence but do not mean the resource itself is rejected or unavailable to a human browser.

- [ ] **Step 4: Bind the exact assessment hash**

Run:

```bash
sha256sum docs/architecture-playbook/resources/sources/zh-minecraft-wiki/assessment.md
```

Copy the exact emitted hash into the profile, bind the five exact probe IDs, and use the fixed ratings above.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test test/playbookResourceContracts.test.js test/playbookResourceZhMinecraftWikiCorpus.test.js`

```bash
git add docs/architecture-playbook/resources/sources/zh-minecraft-wiki test/playbookResourceZhMinecraftWikiCorpus.test.js
git commit -m "docs(playbook): assess five wiki resource probes"
```

### Task 8: 发布全局 Catalog、README 和第一版验收门

**Files:**

- Create: `docs/architecture-playbook/resources/catalog.json`
- Create: `docs/architecture-playbook/resources/README.md`
- Create: `test/playbookResourceCorpus.test.js`
- Modify: `test/playbookResourceRegistry.test.js`

**Catalog content:**

Create exactly two entries, lexically ordered `mcblock`, then `zh-minecraft-wiki`. Both have `lifecycle_status: "assessed"`, exact profile paths and exact assessment paths. Use `catalog_id: "architecture-playbook-resource-catalog"` and an ISO-8601 `updated_at` no earlier than either profile's `last_checked_at`.

**README content:**

Document, in Chinese, these exact sections:

1. 登记册用途与非目标；
2. 目录结构与每站隔离；
3. platform/publisher/creator/course/school/content-unit 边界；
4. `registered -> probing -> assessed -> owner decision` 生命周期；
5. 五种 observation basis；
6. access 与 rights 的独立维度；
7. 新来源 3–5 探针登记步骤；
8. project-owner 晋级门；
9. 公开目录与 `.local/architecture-playbook/resources/` 下各来源子目录的边界；
10. 首批两个 assessed 来源及 `recommend-defer` 不等于拒绝。

Do not add this registry to the current course/rules README if doing so would overlap the parallel black-bird tutorial work; the new README and catalog are the canonical entry points for this version.

- [ ] **Step 1: Write the failing committed-registry acceptance test**

At the top of `test/playbookResourceCorpus.test.js`, define `const projectRoot = path.resolve(import.meta.dirname, '..');` and import `path`, `readFile`, `loadResourceRegistry`, and `auditResourceRegistry` explicitly.

```js
test('committed first-version registry passes the isolated ten-probe gate', async () => {
  const audit = await auditResourceRegistry({
    projectRoot,
    expectedProbeCounts: {
      mcblock: 5,
      'zh-minecraft-wiki': 5
    }
  });

  assert.equal(audit.source_count, 2);
  assert.equal(audit.probe_count, 10);
  assert.equal(audit.decision_count, 0);
  assert.equal(audit.cross_source_reference_count, 0);
  assert.equal(audit.private_path_leak_count, 0);
  assert.equal(audit.unexpected_file_count, 0);
  assert.equal(audit.gate.status, 'passed');
});

test('first-version sources stop at assessed with no promotion records', async () => {
  const registry = await loadResourceRegistry({ projectRoot });
  assert.deepEqual(
    registry.sources.map(({ profile }) => profile.lifecycle_status),
    ['assessed', 'assessed']
  );
  assert.ok(registry.sources.every(({ decisions }) => decisions.length === 0));
});

test('first-version registry publishes exactly the four approved schemas', async () => {
  assert.deepEqual(await listCommittedResourceSchemas(projectRoot), [
    'catalog.schema.json',
    'probe-report.schema.json',
    'promotion-decision.schema.json',
    'source-profile.schema.json'
  ]);
  await assert.doesNotReject(
    readFile(path.join(projectRoot, 'docs/architecture-playbook/resources/README.md'), 'utf8')
  );
});
```

Define `listCommittedResourceSchemas(projectRoot)` locally in the acceptance test with `readdir()`, filter to regular `.json` files, sort lexically, and return only filenames.

- [ ] **Step 2: Run the committed-registry test and verify RED**

Run: `node --test test/playbookResourceCorpus.test.js`

Expected: FAIL because `catalog.json` and the registry README do not exist.

- [ ] **Step 3: Write the Catalog and README**

Keep catalog as the minimal index; do not duplicate URLs, rights, ratings or probe metadata from profiles. The README may mention only the standard private resource root, never a concrete snapshot or black-bird evidence path.

- [ ] **Step 4: Verify focused acceptance and protected-path isolation**

Run:

```bash
node --test test/playbookResourceContracts.test.js test/playbookResourceRegistry.test.js test/playbookResourceMcblockCorpus.test.js test/playbookResourceZhMinecraftWikiCorpus.test.js test/playbookResourceCorpus.test.js
```

Expected: PASS with `2` sources, `10` probes, `2` assessments, `4` schemas, `0` decisions and no public-boundary violations.

Also run:

```bash
resource_registry_baseline=$(git log -n 1 --format=%H --grep='^docs(playbook): plan resource registry implementation$')
test -n "$resource_registry_baseline"
git diff --name-only "$resource_registry_baseline" -- docs/architecture-playbook/course docs/architecture-playbook/rules src/playbook/course src/construction .local/architecture-playbook
git status --short --untracked-files=all -- docs/architecture-playbook/course docs/architecture-playbook/rules src/playbook/course src/construction
git check-ignore -q .local/architecture-playbook/resources
```

Expected: the baseline exists, no registry implementation commit modifies a protected tracked path, and the private resource root is covered by ignore rules. If unrelated concurrent black-bird work appears in the diff or status, preserve it and verify its commit/message ownership; never clean, stage, or alter it.

Also run these read-only code/path checks:

```bash
rg -n "writeFile|mkdir|rename|copyFile|createWriteStream" src/playbook/resources
rg -n "\.local/architecture-playbook/(sources|transcripts|frames|evidence)" src/playbook/resources test/playbookResource*.test.js docs/architecture-playbook/resources
```

Expected: no output. The registry production module exposes no filesystem writer and no new artifact refers to a black-bird private evidence root. It is intentionally invalid to demand that those private roots remain byte-for-byte unchanged while another authorized agent is processing them.

Inspect the registry-specific private root without modifying it:

```bash
if test -d .local/architecture-playbook/resources; then rg --files -uu .local/architecture-playbook/resources; fi
```

Expected for this first version: no files created by this implementation. Preserve and report any pre-existing user file instead of deleting it.

- [ ] **Step 5: Run full regression verification**

Run: `npm test`

Expected: PASS. If the sandbox blocks child `git` processes inside project-policy tests, rerun the exact same command with approved elevated execution; do not weaken or skip those tests.

- [ ] **Step 6: Scan for unfinished markers and commit**

Run:

```bash
rg -n "TODO|TBD|FIXME|PLACEHOLDER|example\.com|0{64}" src/playbook/resources test/playbookResource*.test.js docs/architecture-playbook/resources
```

Expected: no accidental placeholder or fake hash. Legitimate test fixtures that deliberately construct invalid hashes must use runtime expressions such as `'0'.repeat(64)` and remain in tests only.

```bash
git add docs/architecture-playbook/resources/catalog.json docs/architecture-playbook/resources/README.md test/playbookResourceCorpus.test.js test/playbookResourceRegistry.test.js
git commit -m "feat(playbook): publish resource registry v1"
```

## Completion Evidence

Before reporting completion, record these exact facts from fresh commands:

- focused resource tests pass;
- full `npm test` passes;
- catalog has exactly two source entries;
- the loader reports exactly ten probes and zero decisions;
- assessment hashes match exact Markdown bytes;
- no registry implementation commit or resource module introduces a change/reference to course, rules, construction or black-bird private evidence roots; any concurrent change there is preserved and attributed separately;
- `git status --short` contains no uncommitted implementation artifacts.
