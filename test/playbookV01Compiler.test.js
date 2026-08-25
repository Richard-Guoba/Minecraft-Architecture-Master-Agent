import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadP2PublicCorpus } from '../src/playbook/knowledge/publicCandidateCorpus.js';
import {
  P3_MANAGED_ARTIFACT_PATHS,
  validateP3AdmissionPolicy
} from '../src/playbook/manual/p3AdmissionPolicy.js';
import {
  auditPlaybookV01,
  compilePlaybookV01,
  renderPlaybookManual
} from '../src/playbook/manual/playbookV01Compiler.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const POLICY_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json'
);
const MANUAL_PATH = 'docs/architecture-playbook/manual/v0.1.md';
const TERMINOLOGY_PATH = 'docs/architecture-playbook/manual/terminology-v0.1.json';
const COVERAGE_PATH = 'docs/architecture-playbook/manual/coverage-v0.1.json';
const CARDS_PATH = 'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl';
const INDEX_PATH = 'docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json';

const CHAPTER_HEADINGS = [
  '## 1. 方法与边界 (`method-and-boundaries`)',
  '## 2. 体块基础 (`massing-foundations`)',
  '## 3. 主次与结构 (`hierarchy-and-structure`)',
  '## 4. 屋顶形态 (`roof-form`)',
  '## 5. 立面层次 (`facade-layers`)',
  '## 6. 中世纪民居 (`medieval-residence`)',
  '## 7. 完整案例 (`complete-case`)',
  '## 8. 失败与修复 (`failure-and-repair`)',
  '## 9. 未来 Agent 工作流 (`agent-workflow`)',
  '## 10. 未知项与覆盖 (`unknowns-and-coverage`)'
];

const RESOLVED_TERM_NAMES = [
  '体块', '主体', '次体', '连接体', '主次', '框架', '墙芯', '墙间',
  '包边', '坡度', '外挑', '横架', '斜撑', '石质基座', '主要观景面'
];

const UNRESOLVED_TERM_IDS = [
  'unresolved:composition-framework-author-wording',
  'unresolved:parallel-volume-relation-term',
  'unresolved:conical-roof-component-name',
  'unresolved:slatted-wall-and-block-name',
  'unresolved:asr-trapdoor-fence-gate-confusion'
];

const UNKNOWN_IDS = [
  'unknown:massing-ratio-thresholds',
  'unknown:blank-plane-threshold',
  'unknown:repetition-limit',
  'unknown:roof-slope-table',
  'unknown:medieval-scale-generalization',
  'unknown:aesthetic-evaluator',
  'unknown:cross-author-validity'
];

let checkedInInputPromise;

test('compiler emits five stable artifacts with all twenty-one rules', async () => {
  const input = await checkedInCompilerFixture();
  const first = compilePlaybookV01(input);
  const second = compilePlaybookV01(input);

  assert.deepEqual(first.artifacts, second.artifacts);
  assert.equal(first.summary.reviewed_rule_count, 21);
  assert.equal(first.summary.core_procedure_count, 15);
  assert.equal(first.summary.case_pattern_count, 6);
  assert.deepEqual(
    Object.keys(first.artifacts).sort(),
    [...P3_MANAGED_ARTIFACT_PATHS].sort()
  );
  for (const artifactPath of P3_MANAGED_ARTIFACT_PATHS) {
    const bytes = first.artifacts[artifactPath];
    assert.equal(bytes.endsWith('\n'), true, artifactPath);
    assert.equal(bytes.endsWith('\n\n'), false, artifactPath);
    assert.equal(
      first.artifact_hashes[artifactPath],
      createHash('sha256').update(bytes).digest('hex'),
      artifactPath
    );
  }
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.cards), true);
  assert.equal(Object.isFrozen(first.artifacts), true);
});

test('manual exposes literal rule and evidence lineage without private leakage', async () => {
  const compilation = compilePlaybookV01(await checkedInCompilerFixture());
  const manual = compilation.artifacts[MANUAL_PATH];

  for (const card of compilation.cards) {
    assert.match(manual, new RegExp(escapeRegExp(card.rule_id), 'u'));
    for (const evidenceId of card.evidence_ids) {
      assert.match(manual, new RegExp(escapeRegExp(evidenceId), 'u'));
    }
  }
  assert.match(manual, /### 用少量体块建立非火柴盒轮廓 \(`rule:structure\.compose-three-volumes`\)\n\n- 类型：核心程序\n- 层：`massing`\n- 权限：建议；效果尚未验证\n- 证据：`ev:bv1fnkgybeyy:three-volumes`（课次 `BV1fNkgYBEyy`）\n- 适用：住宅初始体块规划；尚未生成框架时\n- 前置：已知占地和基本室内空间需求\n- 动作：生成一个较高主体、一个较低次体和一个连接或辅助体/u);
  assert.doesNotMatch(
    manual,
    /\.local\/|draft-transcript|"segments"|"words"|\/home\//u
  );
});

test('manual keeps the exact ten-chapter order and special chapters stay advisory', async () => {
  const compilation = compilePlaybookV01(await checkedInCompilerFixture());
  const manual = compilation.artifacts[MANUAL_PATH];
  const headings = manual.match(/^## \d+\..+$/gmu);

  assert.deepEqual(headings, CHAPTER_HEADINGS);
  for (const card of compilation.cards) {
    assert.equal(
      countMatches(manual, new RegExp(`^### .*${escapeRegExp(card.rule_id)}.*$`, 'gmu')),
      1,
      card.rule_id
    );
  }
  assert.match(manual, /read → match → propose → observe → recommend/u);
  assert.match(manual, /P3 不能应用补丁/u);
  assert.doesNotMatch(manual, /P3 (?:写入|执行|应用) architecture/u);

  const failureChapter = chapterBody(manual, CHAPTER_HEADINGS[7], CHAPTER_HEADINGS[8]);
  assert.match(failureChapter, /`rule:structure\.layer-volumes-to-reduce-blankness`/u);
  assert.doesNotMatch(failureChapter, /^### /mu);
});

test('terminology, unknowns, conflict, and nine inert coverage rows are all published', async () => {
  const compilation = compilePlaybookV01(await checkedInCompilerFixture());
  const terminology = JSON.parse(compilation.artifacts[TERMINOLOGY_PATH]);
  const coverage = JSON.parse(compilation.artifacts[COVERAGE_PATH]);
  const ruleIndex = JSON.parse(compilation.artifacts[INDEX_PATH]);
  const manual = compilation.artifacts[MANUAL_PATH];

  assert.deepEqual(
    terminology.resolved_terms.map((term) => term.display_name),
    RESOLVED_TERM_NAMES
  );
  assert.deepEqual(
    terminology.unresolved_terms.map((term) => term.term_group_id),
    UNRESOLVED_TERM_IDS
  );
  assert.equal(terminology.source_rule_ids.length, 21);
  assert.deepEqual(coverage.layers.map((row) => [
    row.layer,
    row.status,
    row.runtime_authority
  ]), [
    ['brief', 'advisory-partial', 'none'],
    ['massing', 'advisory-partial', 'none'],
    ['space', 'not-covered', 'none'],
    ['structure', 'advisory-partial', 'none'],
    ['roof', 'advisory-partial', 'none'],
    ['facade', 'advisory-partial', 'none'],
    ['materials', 'not-covered', 'none'],
    ['interior', 'not-covered', 'none'],
    ['scene', 'not-covered', 'none']
  ]);
  assert.deepEqual(ruleIndex.conflicts.map((item) => item.conflict_id), [
    'conflict:motif-unity-vs-bay-repetition'
  ]);
  assert.deepEqual(ruleIndex.unknowns.map((item) => item.unknown_id), UNKNOWN_IDS);

  for (const id of [...UNRESOLVED_TERM_IDS, ...UNKNOWN_IDS]) {
    assert.match(manual, new RegExp(escapeRegExp(id), 'u'), id);
  }
  assert.match(manual, /conflict:motif-unity-vs-bay-repetition/u);
});

test('rule index preserves every rule and evidence lineage in candidate order', async () => {
  const { corpus, ...input } = await checkedInCompilerFixture();
  const compilation = compilePlaybookV01({ corpus, ...input });
  const ruleIndex = JSON.parse(compilation.artifacts[INDEX_PATH]);

  assert.deepEqual(
    ruleIndex.rules.map((rule) => rule.rule_id),
    corpus.candidates.map((candidate) => candidate.rule_id)
  );
  assert.equal(ruleIndex.rules.length, 21);
  assert.equal(ruleIndex.evidence_lineage.length, 21);
  assert.deepEqual(ruleIndex.evidence_lineage[0], {
    evidence_id: 'ev:bv1fnkgybeyy:three-volumes',
    bvid: 'BV1fNkgYBEyy',
    rule_ids: ['rule:structure.compose-three-volumes']
  });
  assert.equal(
    new Set(ruleIndex.evidence_lineage.flatMap((entry) => entry.rule_ids)).size,
    21
  );
});

test('source corpus hash is exact, canonical, and sensitive to source content', async () => {
  const input = await checkedInCompilerFixture();
  const original = compilePlaybookV01(input);
  const changedCorpus = structuredClone(input.corpus);
  changedCorpus.unknowns[0].question += '变';
  const changed = compilePlaybookV01({ corpus: changedCorpus, policy: input.policy });

  assert.equal(
    original.source_corpus_hash,
    'acb642b19f36ecc3633728e3d74a08225d0496c41d00184d3c5f782c7c4a7087'
  );
  assert.equal(
    changed.source_corpus_hash,
    '3248b7cc192e7d700eec5711297c98ef0b0e30d54808f6dbb7b75fe1ef61763c'
  );
  assert.notEqual(changed.source_corpus_hash, original.source_corpus_hash);

  const reorderedCorpus = recursivelyReverseObjectKeys(input.corpus);
  const reorderedPolicy = recursivelyReverseObjectKeys(input.policy);
  assert.equal(
    compilePlaybookV01({ corpus: reorderedCorpus, policy: reorderedPolicy }).source_corpus_hash,
    original.source_corpus_hash
  );
});

test('reviewed card JSONL is canonical and has one final newline', async () => {
  const compilation = compilePlaybookV01(await checkedInCompilerFixture());
  const jsonl = compilation.artifacts[CARDS_PATH];
  const lines = jsonl.slice(0, -1).split('\n');

  assert.equal(lines.length, 21);
  assert.equal(jsonl.includes('\r'), false);
  assert.equal(jsonl.endsWith('\n'), true);
  assert.equal(jsonl.endsWith('\n\n'), false);
  assert.match(
    lines[0],
    /^\{"action":"生成一个较高主体、一个较低次体和一个连接或辅助体；.+","admission_status":"admitted-advisory","applicability":/u
  );
  for (const line of lines) {
    assert.equal(line, JSON.stringify(independentlyCanonicalize(JSON.parse(line))));
  }
});

test('manual renderer is pure and matches the compiler artifact', async () => {
  const input = await checkedInCompilerFixture();
  const compilation = compilePlaybookV01(input);
  const rendered = renderPlaybookManual({
    cards: compilation.cards,
    terminology: compilation.terminology,
    coverage: compilation.coverage,
    corpus: input.corpus,
    policy: input.policy
  });

  assert.equal(rendered, compilation.artifacts[MANUAL_PATH]);
  assert.equal(rendered.endsWith('\n'), true);
});

test('pure audit derives all passing gate counters from compiled content', async () => {
  const compilation = compilePlaybookV01(await checkedInCompilerFixture());
  const audit = auditPlaybookV01(compilation);

  assert.deepEqual(audit, {
    p2_gate_status: 'passed',
    reviewed_rule_count: 21,
    core_procedure_count: 15,
    case_pattern_count: 6,
    dangling_reference_count: 0,
    cross_school_count: 0,
    authority_escalation_count: 0,
    maturity_escalation_count: 0,
    covered_runtime_layer_count: 0,
    public_leak_count: 0,
    managed_artifact_drift_count: 0,
    gate: { status: 'passed', next_phase: 'P4', blocker_codes: [] }
  });
  assert.ok(compilation.p2_gate_evidence, 'compiler must retain P2 source gate evidence');
  assert.equal(Object.isFrozen(compilation.p2_gate_evidence), true);
  assert.equal(Object.isFrozen(compilation.p2_gate_evidence.episodes), true);
  assert.equal(Object.isFrozen(audit), true);
  assert.equal(Object.isFrozen(audit.gate), true);
});

test('pure audit blocks generic absolute and private frame source references', async () => {
  const base = compilePlaybookV01(await checkedInCompilerFixture());
  const leakMarkers = [
    '/tmp/private/frames/frame-001.png',
    'C:\\private\\frames\\frame-001.png',
    'frames/frame-001.png',
    'private-source/captures/angle-01.webp'
  ];

  for (const marker of leakMarkers) {
    const compilation = structuredClone(base);
    compilation.artifacts[MANUAL_PATH] += `${marker}\n`;
    const audit = auditPlaybookV01(compilation);

    assert.equal(audit.public_leak_count, 1, marker);
    assert.equal(audit.gate.status, 'blocked', marker);
    assert.equal(audit.gate.next_phase, null, marker);
    assert.deepEqual(audit.gate.blocker_codes, ['PUBLIC_SOURCE_LEAK'], marker);
  }

  const safe = structuredClone(base);
  safe.artifacts[MANUAL_PATH] += [
    '[秘籍](docs/architecture-playbook/manual/v0.1.md)',
    '`rule:structure.compose-three-volumes`',
    '`BV1fNkgYBEyy`'
  ].join('\n');
  assert.equal(auditPlaybookV01(safe).public_leak_count, 0);
});

test('pure audit distinguishes dot-relative Markdown targets from absolute paths', async () => {
  const base = compilePlaybookV01(await checkedInCompilerFixture());
  const safeTargets = [
    './guide.md',
    '../guide.md',
    '[本地指南](./guide.md)',
    '[上级指南](../guide.md)'
  ];

  for (const target of safeTargets) {
    const compilation = structuredClone(base);
    compilation.artifacts[MANUAL_PATH] += `${target}\n`;
    const audit = auditPlaybookV01(compilation);

    assert.equal(audit.public_leak_count, 0, target);
    assert.equal(audit.gate.status, 'passed', target);
    assert.equal(audit.gate.next_phase, 'P4', target);
  }

  const absolutePaths = [
    '/guide.md',
    '/tmp/private/guide.md',
    'C:\\private\\guide.md'
  ];
  for (const absolutePath of absolutePaths) {
    const compilation = structuredClone(base);
    compilation.artifacts[MANUAL_PATH] += `${absolutePath}\n`;
    const audit = auditPlaybookV01(compilation);

    assert.equal(audit.public_leak_count, 1, absolutePath);
    assert.equal(audit.gate.status, 'blocked', absolutePath);
    assert.deepEqual(audit.gate.blocker_codes, ['PUBLIC_SOURCE_LEAK'], absolutePath);
  }

  const mixed = structuredClone(base);
  mixed.artifacts[MANUAL_PATH] += './guide.md /tmp/private/frame.png\n';
  assert.equal(auditPlaybookV01(mixed).public_leak_count, 1);
});

test('pure audit blocks private source directories through dot-relative notation', async () => {
  const base = compilePlaybookV01(await checkedInCompilerFixture());
  const privateTargets = [
    './private-source/captures/angle-01.webp',
    '../private-source/captures/angle-01.webp',
    './screenshots/overview.webp',
    '../frames/overview.webp'
  ];

  for (const target of privateTargets) {
    const compilation = structuredClone(base);
    compilation.artifacts[MANUAL_PATH] += `${target}\n`;
    const audit = auditPlaybookV01(compilation);

    assert.equal(audit.public_leak_count, 1, target);
    assert.equal(audit.gate.status, 'blocked', target);
    assert.deepEqual(audit.gate.blocker_codes, ['PUBLIC_SOURCE_LEAK'], target);
  }

  for (const target of ['./guide.md', '../guide.md']) {
    const compilation = structuredClone(base);
    compilation.artifacts[MANUAL_PATH] += `${target}\n`;
    assert.equal(auditPlaybookV01(compilation).public_leak_count, 0, target);
  }
});

test('pure audit ignores a stale P2 summary and rederives status from source gate evidence', async () => {
  const compilation = structuredClone(
    compilePlaybookV01(await checkedInCompilerFixture())
  );
  compilation.summary.p2_gate_status = 'blocked';

  const audit = auditPlaybookV01(compilation);

  assert.equal(audit.p2_gate_status, 'passed');
  assert.equal(audit.gate.status, 'passed');
  assert.equal(audit.gate.next_phase, 'P4');
});

test('pure audit rejects a forged passing P2 summary when source gate evidence is blocked', async () => {
  const compilation = structuredClone(
    compilePlaybookV01(await checkedInCompilerFixture())
  );
  compilation.summary.p2_gate_status = 'passed';
  assert.ok(
    compilation.p2_gate_evidence,
    'compiler must retain immutable P2 source gate evidence'
  );
  compilation.p2_gate_evidence.episodes[0].shape_claims_without_dual_evidence = 1;

  const audit = auditPlaybookV01(compilation);

  assert.equal(audit.p2_gate_status, 'blocked');
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.deepEqual(audit.gate.blocker_codes, ['P2_GATE_NOT_PASSED']);
});

test('pure audit reports tampered counters truthfully instead of trusting the summary', async () => {
  const compilation = structuredClone(
    compilePlaybookV01(await checkedInCompilerFixture())
  );
  compilation.summary.reviewed_rule_count = 21;
  compilation.summary.core_procedure_count = 15;
  compilation.summary.case_pattern_count = 6;
  compilation.summary.p2_gate_status = 'passed';
  compilation.cards[0].authority = 'executable';
  compilation.cards[1].maturity = 'validated';
  compilation.cards[2].evidence_ids = ['ev:missing:lineage'];
  compilation.cards[3].primary_school = 'another-school';
  compilation.coverage.layers[0].runtime_authority = 'advisory';
  compilation.artifacts[MANUAL_PATH] += '.local/architecture-playbook/draft-transcript\n';

  const audit = auditPlaybookV01(compilation, { managedArtifactDriftCount: 2 });

  assert.equal(audit.reviewed_rule_count, 21);
  assert.equal(audit.core_procedure_count, 15);
  assert.equal(audit.case_pattern_count, 6);
  assert.equal(audit.dangling_reference_count, 1);
  assert.equal(audit.cross_school_count, 1);
  assert.equal(audit.authority_escalation_count, 1);
  assert.equal(audit.maturity_escalation_count, 1);
  assert.equal(audit.covered_runtime_layer_count, 1);
  assert.equal(audit.public_leak_count, 1);
  assert.equal(audit.managed_artifact_drift_count, 2);
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.notDeepEqual(audit.gate.blocker_codes, []);
});

async function checkedInCompilerFixture() {
  if (!checkedInInputPromise) {
    checkedInInputPromise = (async () => {
      const corpus = await loadP2PublicCorpus({ projectRoot: ROOT });
      const policy = validateP3AdmissionPolicy(
        JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')),
        { candidateRuleIds: new Set(corpus.candidates.map((item) => item.rule_id)) }
      );
      return { corpus, policy };
    })();
  }
  return checkedInInputPromise;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function chapterBody(manual, heading, nextHeading) {
  return manual.slice(
    manual.indexOf(heading) + heading.length,
    manual.indexOf(nextHeading)
  );
}

function independentlyCanonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => independentlyCanonicalize(item));
  if (value instanceof Set) return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, independentlyCanonicalize(value[key])])
    );
  }
  return value;
}

function recursivelyReverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map((item) => recursivelyReverseObjectKeys(item));
  if (value instanceof Set) return new Set(value);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .reverse()
        .map((key) => [key, recursivelyReverseObjectKeys(value[key])])
    );
  }
  return value;
}
