import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadP2PublicCorpus } from '../knowledge/publicCandidateCorpus.js';
import {
  P3_MANAGED_ARTIFACT_PATHS,
  validateP3AdmissionPolicy
} from './p3AdmissionPolicy.js';
import { buildReviewedRuleCards } from './reviewedRuleCard.js';

const execFileAsync = promisify(execFile);
const MANUAL_PATH = 'docs/architecture-playbook/manual/v0.1.md';
const TERMINOLOGY_PATH = 'docs/architecture-playbook/manual/terminology-v0.1.json';
const COVERAGE_PATH = 'docs/architecture-playbook/manual/coverage-v0.1.json';
const CARDS_PATH = 'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl';
const INDEX_PATH = 'docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json';
const POLICY_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json';
const SPECIAL_CHAPTER_IDS = new Set([
  'method-and-boundaries',
  'failure-and-repair',
  'agent-workflow',
  'unknowns-and-coverage'
]);
const PUBLIC_HTTPS_URL = /https:\/\/[^\s`"'<>|)]+/gimu;
const UNIX_ABSOLUTE_PATH = /(?<![A-Za-z0-9:/.])\/(?!\/)[A-Za-z0-9._~@+-]+(?:\/[A-Za-z0-9._~@+()-]+)*/gimu;
const WINDOWS_ABSOLUTE_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/](?:[^\\/\s`"'<>|]+[\\/])*[^\\/\s`"'<>|]+/gimu;
const PRIVATE_SOURCE_DIRECTORY = /(?<![A-Za-z0-9._-])(?:\.{1,2}[\\/])*(?:frames?|screenshots?|source-frames?|private-source)(?:[\\/][^\s`"'<>|)]+)+/gimu;
const LOCAL_PRIVATE_PATH = /(?<![A-Za-z0-9._-])(?:\.{1,2}[\\/])?\.local(?![A-Za-z0-9._-])(?:[\\/][^\s`"'<>|)]+)*/gimu;
const PRIVATE_SOURCE_FIELD = /"(?:segments|words|frames|frame_path|frame_paths|screenshot_path|source_frame_path)"/gimu;
const FRAME_IMAGE_REFERENCE = /(?:frame|screenshot)-\d+\.(?:png|jpe?g|webp)/gimu;
const PRIVATE_SOURCE_MARKER = /draft-transcript|(?:source-frame|private-source)(?=[:\s])/gimu;
const PUBLIC_LEAK_MATCHERS = Object.freeze([
  UNIX_ABSOLUTE_PATH,
  WINDOWS_ABSOLUTE_PATH,
  PRIVATE_SOURCE_DIRECTORY,
  LOCAL_PRIVATE_PATH,
  PRIVATE_SOURCE_FIELD,
  FRAME_IMAGE_REFERENCE,
  PRIVATE_SOURCE_MARKER
]);

export function compilePlaybookV01({ corpus, policy }) {
  assertCompilerInput(corpus, policy);
  const p2GateEvidence = compileP2GateEvidence(corpus);
  const p2GateStatus = deriveP2GateStatus(p2GateEvidence, {
    schoolId: policy.school_id,
    candidateCount: corpus.candidates.length,
    conflictCount: corpus.conflicts.length,
    unknownCount: corpus.unknowns.length
  });
  if (p2GateStatus !== 'passed') {
    throw new Error('PLAYBOOK_P3_P2_GATE_BLOCKED: validated P2 evidence is required');
  }

  const cards = buildReviewedRuleCards(corpus.candidates, policy);
  const sourceCorpusHash = hashCanonicalValues([
    corpus.evidence_index,
    corpus.candidates,
    corpus.conflicts,
    corpus.unknowns,
    policy
  ]);
  const terminology = compileTerminology(cards, policy);
  const coverage = compileCoverage(policy);
  const ruleIndex = compileRuleIndex({
    cards,
    corpus,
    policy,
    sourceCorpusHash
  });
  const manual = renderPlaybookManual({
    cards,
    terminology,
    coverage,
    corpus,
    policy
  });
  const artifacts = {
    [MANUAL_PATH]: manual,
    [TERMINOLOGY_PATH]: renderJson(terminology),
    [COVERAGE_PATH]: renderJson(coverage),
    [CARDS_PATH]: renderJsonl(cards),
    [INDEX_PATH]: renderJson(ruleIndex)
  };
  assertManagedArtifacts(artifacts);
  if (countPublicLeaks(artifacts) !== 0) {
    throw new Error('PLAYBOOK_P3_PUBLIC_LEAK: generated artifact contains a private-source marker');
  }

  const artifactHashes = Object.fromEntries(
    P3_MANAGED_ARTIFACT_PATHS.map((artifactPath) => [
      artifactPath,
      sha256(artifacts[artifactPath])
    ])
  );
  const summary = {
    p2_gate_status: p2GateStatus,
    reviewed_rule_count: cards.length,
    core_procedure_count: cards.filter(
      (card) => card.teaching_role === 'core-procedure'
    ).length,
    case_pattern_count: cards.filter(
      (card) => card.teaching_role === 'case-pattern'
    ).length,
    resolved_term_count: terminology.resolved_terms.length,
    unresolved_term_count: terminology.unresolved_terms.length,
    coverage_layer_count: coverage.layers.length,
    conflict_count: ruleIndex.conflicts.length,
    unknown_count: ruleIndex.unknowns.length,
    artifact_count: Object.keys(artifacts).length
  };

  return deepFreeze({
    playbook_version: policy.playbook_version,
    school_id: policy.school_id,
    source_corpus_hash: sourceCorpusHash,
    p2_gate_evidence: p2GateEvidence,
    cards,
    terminology,
    coverage,
    rule_index: ruleIndex,
    summary,
    artifact_hashes: artifactHashes,
    artifacts
  });
}

export function renderPlaybookManual({
  cards,
  terminology,
  coverage,
  corpus,
  policy
}) {
  const evidenceBvids = new Map(
    corpus.evidence_index.episodes.flatMap((episode) =>
      episode.evidence_ids.map((evidenceId) => [evidenceId, episode.bvid]))
  );
  const lines = [
    '# Minecraft 建筑秘籍 v0.1',
    '',
    '> 学派：黑辉极乐鸟（`heihui-jileniao`）。本秘籍是有证据血缘的候选建议，不是已验证效果的通用规律。',
    '> P3 只编译公开知识产品，不生成住宅，不修改生产生成器，也不授予任何设计层运行时权限。',
    ''
  ];

  for (const chapter of policy.chapters) {
    lines.push(
      `## ${chapter.order}. ${chapter.title} (\`${chapter.chapter_id}\`)`,
      '',
      chapter.introduction,
      ''
    );
    switch (chapter.chapter_id) {
      case 'method-and-boundaries':
        renderMethodBoundary(lines);
        break;
      case 'failure-and-repair':
        renderFailureIndex(lines, cards, policy);
        break;
      case 'agent-workflow':
        renderAgentWorkflow(lines);
        break;
      case 'unknowns-and-coverage':
        renderUnknownsAndCoverage(lines, {
          terminology,
          coverage,
          corpus
        });
        break;
      default:
        for (const card of cards) {
          if (primaryTeachingChapter(card) === chapter.chapter_id) {
            renderRuleCard(lines, card, evidenceBvids);
          }
        }
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function auditPlaybookV01(
  compilation,
  { managedArtifactDriftCount = 0 } = {}
) {
  if (!Number.isInteger(managedArtifactDriftCount) || managedArtifactDriftCount < 0) {
    throw new TypeError('managedArtifactDriftCount must be a non-negative integer');
  }
  const cards = Array.isArray(compilation?.cards) ? compilation.cards : [];
  const coverageRows = Array.isArray(compilation?.coverage?.layers)
    ? compilation.coverage.layers
    : [];
  const p2GateStatus = deriveP2GateStatus(compilation?.p2_gate_evidence, {
    schoolId: compilation?.school_id,
    candidateCount: cards.length,
    conflictCount: compilation?.rule_index?.conflicts?.length,
    unknownCount: compilation?.rule_index?.unknowns?.length
  });
  const counters = {
    p2_gate_status: p2GateStatus,
    reviewed_rule_count: cards.length,
    core_procedure_count: cards.filter(
      (card) => card?.teaching_role === 'core-procedure'
    ).length,
    case_pattern_count: cards.filter(
      (card) => card?.teaching_role === 'case-pattern'
    ).length,
    dangling_reference_count: countDanglingReferences(compilation, cards),
    cross_school_count: cards.filter(
      (card) => card?.primary_school !== compilation?.school_id
    ).length + (compilation?.rule_index?.conflicts ?? []).filter(
      (conflict) => conflict?.primary_school !== compilation?.school_id
    ).length,
    authority_escalation_count: cards.filter(
      (card) => card?.authority !== 'advisory'
    ).length,
    maturity_escalation_count: cards.filter(
      (card) => card?.maturity !== 'candidate'
    ).length,
    covered_runtime_layer_count: coverageRows.filter(
      (row) => row?.runtime_authority !== 'none'
    ).length,
    public_leak_count: countPublicLeaks(compilation?.artifacts ?? {}),
    managed_artifact_drift_count: managedArtifactDriftCount
  };
  const blockerCodes = auditBlockerCodes(counters);
  return deepFreeze({
    ...counters,
    gate: {
      status: blockerCodes.length === 0 ? 'passed' : 'blocked',
      next_phase: blockerCodes.length === 0 ? 'P4' : null,
      blocker_codes: blockerCodes
    }
  });
}

export async function auditCheckedInPlaybookV01({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const corpus = await loadP2PublicCorpus({ projectRoot: root });
  const policy = validateP3AdmissionPolicy(
    JSON.parse(await fs.readFile(path.join(root, POLICY_PATH), 'utf8')),
    {
      candidateRuleIds: new Set(
        corpus.candidates.map((candidate) => candidate.rule_id)
      )
    }
  );
  const compilation = compilePlaybookV01({ corpus, policy });
  const { checkManagedPlaybookArtifacts } = await import(
    '../../runArchitecturePlaybookManual.js'
  );
  const checked = await checkManagedPlaybookArtifacts({
    projectRoot: root,
    artifacts: compilation.artifacts
  });
  const checkedInArtifacts = await readCheckedInArtifacts(root);
  const [trackedManagedArtifactPaths, manualConstructionImports] =
    await Promise.all([
      listTrackedManagedArtifactPaths(root),
      findManualConstructionImports(root)
    ]);
  const checkedInCoverage = parseJsonOrNull(checkedInArtifacts[COVERAGE_PATH]);
  const coverageNotCoveredLayers = Array.isArray(checkedInCoverage?.layers)
    ? checkedInCoverage.layers
      .filter((row) => row?.status === 'not-covered')
      .map((row) => row.layer)
    : [];
  const checkedInManual = checkedInArtifacts[MANUAL_PATH];
  const manualNotCoveredLayers = coverageNotCoveredLayers.filter((layer) =>
    checkedInManual.includes(`- \`${layer}\`：状态 \`not-covered\``));
  const audit = auditPlaybookV01(
    { ...compilation, artifacts: checkedInArtifacts },
    { managedArtifactDriftCount: checked.managed_artifact_drift_count }
  );

  return deepFreeze({
    ...audit,
    source_corpus_hash: compilation.source_corpus_hash,
    tracked_managed_artifact_paths: trackedManagedArtifactPaths,
    manual_construction_imports: manualConstructionImports,
    coverage_not_covered_layers: coverageNotCoveredLayers,
    manual_not_covered_layers: manualNotCoveredLayers
  });
}

async function readCheckedInArtifacts(projectRoot) {
  return Object.fromEntries(await Promise.all(
    P3_MANAGED_ARTIFACT_PATHS.map(async (artifactPath) => {
      try {
        return [
          artifactPath,
          await fs.readFile(path.join(projectRoot, artifactPath), 'utf8')
        ];
      } catch (error) {
        if (error?.code === 'ENOENT') return [artifactPath, ''];
        throw error;
      }
    })
  ));
}

async function listTrackedManagedArtifactPaths(projectRoot) {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--', ...P3_MANAGED_ARTIFACT_PATHS],
    { cwd: projectRoot, encoding: 'utf8' }
  );
  const tracked = new Set(stdout.split(/\r?\n/u).filter(Boolean));
  return P3_MANAGED_ARTIFACT_PATHS.filter((artifactPath) =>
    tracked.has(artifactPath));
}

async function findManualConstructionImports(projectRoot) {
  const sourceRoot = path.join(projectRoot, 'src/playbook/manual');
  const sourcePaths = await listJavaScriptFiles(sourceRoot);
  const matches = [];
  const importPatterns = [
    /\b(?:from|import)\s*['"]([^'"]+)['"]/gmu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gmu
  ];
  for (const sourcePath of sourcePaths) {
    const source = await fs.readFile(sourcePath, 'utf8');
    for (const pattern of importPatterns) {
      for (const match of source.matchAll(pattern)) {
        if (/(?:^|\/)construction(?:\/|$)/u.test(match[1])) {
          matches.push(`${path.relative(projectRoot, sourcePath)}:${match[1]}`);
        }
      }
    }
  }
  return matches.sort();
}

async function listJavaScriptFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const nestedPaths = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  }));
  return nestedPaths.flat().sort();
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertCompilerInput(corpus, policy) {
  if (
    !corpus
    || typeof corpus !== 'object'
    || !Array.isArray(corpus.candidates)
    || !Array.isArray(corpus.conflicts)
    || !Array.isArray(corpus.unknowns)
    || !corpus.evidence_index
    || !policy
    || typeof policy !== 'object'
  ) {
    throw new TypeError('compilePlaybookV01 requires validated corpus and policy');
  }
}

function compileP2GateEvidence(corpus) {
  return {
    school_id: corpus.school_id,
    declared_episode_count: corpus.episode_count,
    declared_evidence_note_count: corpus.evidence_note_count,
    declared_candidate_rule_count: corpus.candidate_rule_count,
    declared_conflict_count: corpus.conflict_count,
    declared_unknown_count: corpus.unknown_count,
    indexed_episode_count: corpus.evidence_index.episode_count,
    indexed_note_count: corpus.evidence_index.note_count,
    episodes: corpus.evidence_index.episodes.map((episode) => ({
      bvid: episode.bvid,
      accepted_for_public_candidates: episode.accepted_for_public_candidates,
      shape_claims_without_dual_evidence: episode.shape_claims_without_dual_evidence,
      evidence_ids: structuredClone(episode.evidence_ids)
    }))
  };
}

function deriveP2GateStatus(evidence, {
  schoolId,
  candidateCount,
  conflictCount,
  unknownCount
}) {
  const episodes = evidence?.episodes;
  const evidenceIds = Array.isArray(episodes)
    ? episodes.flatMap((episode) =>
      Array.isArray(episode?.evidence_ids) ? episode.evidence_ids : [])
    : [];
  const bvids = Array.isArray(episodes)
    ? episodes.map((episode) => episode?.bvid)
    : [];
  const passed = evidence?.school_id === schoolId
    && evidence?.school_id === 'heihui-jileniao'
    && Array.isArray(episodes)
    && evidence.declared_episode_count === episodes.length
    && evidence.indexed_episode_count === episodes.length
    && evidence.declared_evidence_note_count === evidenceIds.length
    && evidence.indexed_note_count === evidenceIds.length
    && evidence.declared_candidate_rule_count === candidateCount
    && evidence.declared_conflict_count === conflictCount
    && evidence.declared_unknown_count === unknownCount
    && new Set(bvids).size === bvids.length
    && new Set(evidenceIds).size === evidenceIds.length
    && episodes.every((episode) =>
      typeof episode?.bvid === 'string'
      && episode.bvid.length > 0
      && Array.isArray(episode.evidence_ids)
      && episode.evidence_ids.length > 0
      && episode.accepted_for_public_candidates === true
      && episode.shape_claims_without_dual_evidence === 0);
  return passed ? 'passed' : 'blocked';
}

function compileTerminology(cards, policy) {
  return {
    schema_version: 1,
    playbook_version: policy.playbook_version,
    school_id: policy.school_id,
    resolved_terms: structuredClone(policy.terminology.resolved_terms),
    unresolved_terms: structuredClone(policy.terminology.unresolved_terms),
    source_rule_ids: cards.map((card) => card.rule_id)
  };
}

function compileCoverage(policy) {
  return {
    schema_version: 1,
    playbook_version: policy.playbook_version,
    school_id: policy.school_id,
    layers: structuredClone(policy.coverage)
  };
}

function compileRuleIndex({ cards, corpus, policy, sourceCorpusHash }) {
  return {
    schema_version: 1,
    playbook_version: policy.playbook_version,
    school_id: policy.school_id,
    source_corpus_hash: sourceCorpusHash,
    chapters: policy.chapters.map((chapter) => ({
      chapter_id: chapter.chapter_id,
      title: chapter.title,
      order: chapter.order,
      rule_ids: cards
        .filter((card) => card.chapter_ids.includes(chapter.chapter_id))
        .map((card) => card.rule_id)
    })),
    layers: policy.coverage.map((row) => ({
      layer: row.layer,
      status: row.status,
      runtime_authority: row.runtime_authority,
      rule_ids: structuredClone(row.rule_ids)
    })),
    rules: cards.map((card) => ({
      rule_id: card.rule_id,
      teaching_role: card.teaching_role,
      design_layer: card.design_layer,
      chapter_ids: structuredClone(card.chapter_ids),
      evidence_ids: structuredClone(card.evidence_ids),
      source_episode_bvids: structuredClone(card.source_episode_bvids),
      conflict_ids: structuredClone(card.conflict_ids)
    })),
    evidence_lineage: corpus.evidence_index.episodes.flatMap((episode) =>
      episode.evidence_ids.map((evidenceId) => ({
        evidence_id: evidenceId,
        bvid: episode.bvid,
        rule_ids: cards
          .filter((card) => card.evidence_ids.includes(evidenceId))
          .map((card) => card.rule_id)
      }))),
    conflicts: structuredClone(corpus.conflicts),
    unknowns: structuredClone(corpus.unknowns)
  };
}

function renderMethodBoundary(lines) {
  lines.push(
    '- 权限固定为建议；所有规则效果均尚未验证。',
    '- 只使用已提交的 P2 公开证据、候选、冲突、未知项与 P3 准入政策。',
    '- 案例模式只用于解释和未来验证，不冒充通用程序。',
    '- 九个设计层的运行时权限全部为 `none`。',
    ''
  );
}

function renderFailureIndex(lines, cards, policy) {
  const chapterTitles = new Map(
    policy.chapters.map((chapter) => [chapter.chapter_id, chapter.title])
  );
  for (const card of cards.filter((item) =>
    item.chapter_ids.includes('failure-and-repair'))) {
    const chapterId = primaryTeachingChapter(card);
    lines.push(
      `- \`${card.rule_id}\`：见“${chapterTitles.get(chapterId)}”；观察标识 ${inlineCodeList(card.runtime_projection.observable_checks)}；修复标识 ${inlineCodeList(card.runtime_projection.repair_operations)}。`
    );
  }
  lines.push('');
}

function renderAgentWorkflow(lines) {
  lines.push(
    '只允许工作流：read → match → propose → observe → recommend。P3 不能应用补丁，也不能写入 architecture、topology、blueprint 或 voxel grid。',
    ''
  );
}

function renderUnknownsAndCoverage(lines, { terminology, coverage, corpus }) {
  lines.push('### 已解决术语', '');
  for (const term of terminology.resolved_terms) {
    lines.push(
      `- **${term.display_name}**（\`${term.term_id}\`）：${term.definition} 范围：${term.scope_note}`
    );
  }
  lines.push('', '### 未解决术语组', '');
  for (const term of terminology.unresolved_terms) {
    lines.push(
      `- \`${term.term_group_id}\`（${term.display_name}）：${term.impact} 处理：${term.handling_policy}`
    );
  }
  lines.push('', '### 条件冲突', '');
  for (const conflict of corpus.conflicts) {
    lines.push(
      `- \`${conflict.conflict_id}\`：${conflict.condition_note} 规则：${inlineCodeList(conflict.rule_ids)}；证据：${inlineCodeList(conflict.evidence_ids)}。`
    );
  }
  lines.push('', '### P2 公开未知项', '');
  for (const unknown of corpus.unknowns) {
    lines.push(
      `- \`${unknown.unknown_id}\`：${unknown.question} 阻塞参数：${inlineCodeList(unknown.blocked_parameters)}；下一证据：${unknown.next_evidence}`
    );
  }
  lines.push('', '### 九层覆盖', '');
  for (const row of coverage.layers) {
    const capabilities = row.known_capabilities.length > 0
      ? row.known_capabilities.join('；')
      : '无';
    const unknowns = row.unknown_ids.length > 0
      ? inlineCodeList(row.unknown_ids)
      : '无';
    lines.push(
      `- \`${row.layer}\`：状态 \`${row.status}\`；已知能力：${capabilities}；未知项：${unknowns}；运行时权限 \`${row.runtime_authority}\`。`
    );
  }
  lines.push('');
}

function renderRuleCard(lines, card, evidenceBvids) {
  const evidence = card.evidence_ids.map((evidenceId) => {
    const bvid = evidenceBvids.get(evidenceId);
    return `\`${evidenceId}\`（课次 \`${bvid}\`）`;
  }).join('；');
  lines.push(
    `### ${card.intent} (\`${card.rule_id}\`)`,
    '',
    `- 类型：${card.teaching_role === 'core-procedure' ? '核心程序' : '案例模式'}`,
    `- 层：\`${card.design_layer}\``,
    '- 权限：建议；效果尚未验证',
    `- 证据：${evidence}`,
    `- 适用：${humanList(card.applicability)}`,
    `- 前置：${humanList(card.prerequisites)}`,
    `- 动作：${card.action}`,
    `- 观察：${humanList(card.positive_signs)}`,
    `- 失败：${humanList(card.failure_modes)}`,
    `- 修复：${humanList(card.repairs)}`,
    ''
  );
}

function primaryTeachingChapter(card) {
  return card.chapter_ids.find((chapterId) => !SPECIAL_CHAPTER_IDS.has(chapterId));
}

function humanList(values) {
  return values.length > 0 ? values.join('；') : '无';
}

function inlineCodeList(values) {
  return values.map((value) => `\`${value}\``).join('、');
}

function countDanglingReferences(compilation, cards) {
  const ruleIds = new Set(cards.map((card) => card?.rule_id));
  const evidenceLineage = compilation?.rule_index?.evidence_lineage ?? [];
  const evidenceIds = new Set(evidenceLineage.map((entry) => entry?.evidence_id));
  const conflicts = compilation?.rule_index?.conflicts ?? [];
  const conflictIds = new Set(conflicts.map((conflict) => conflict?.conflict_id));
  const unknowns = compilation?.rule_index?.unknowns ?? [];
  const unknownIds = new Set(unknowns.map((unknown) => unknown?.unknown_id));
  let count = 0;

  for (const card of cards) {
    count += (card?.evidence_ids ?? []).filter((id) => !evidenceIds.has(id)).length;
    count += (card?.conflict_ids ?? []).filter((id) => !conflictIds.has(id)).length;
  }
  for (const entry of evidenceLineage) {
    count += (entry?.rule_ids ?? []).filter((id) => !ruleIds.has(id)).length;
  }
  for (const conflict of conflicts) {
    count += (conflict?.rule_ids ?? []).filter((id) => !ruleIds.has(id)).length;
    count += (conflict?.evidence_ids ?? []).filter((id) => !evidenceIds.has(id)).length;
  }
  for (const term of [
    ...(compilation?.terminology?.resolved_terms ?? []),
    ...(compilation?.terminology?.unresolved_terms ?? [])
  ]) {
    count += (term?.rule_ids ?? []).filter((id) => !ruleIds.has(id)).length;
  }
  count += (compilation?.terminology?.source_rule_ids ?? [])
    .filter((id) => !ruleIds.has(id)).length;
  for (const row of compilation?.coverage?.layers ?? []) {
    count += (row?.rule_ids ?? []).filter((id) => !ruleIds.has(id)).length;
    count += (row?.unknown_ids ?? []).filter((id) => !unknownIds.has(id)).length;
  }
  return count;
}

function auditBlockerCodes(counters) {
  const requirements = [
    ['p2_gate_status', 'passed', 'P2_GATE_NOT_PASSED'],
    ['reviewed_rule_count', 21, 'REVIEWED_RULE_COUNT_INVALID'],
    ['core_procedure_count', 15, 'CORE_PROCEDURE_COUNT_INVALID'],
    ['case_pattern_count', 6, 'CASE_PATTERN_COUNT_INVALID'],
    ['dangling_reference_count', 0, 'DANGLING_REFERENCE'],
    ['cross_school_count', 0, 'CROSS_SCHOOL_REFERENCE'],
    ['authority_escalation_count', 0, 'AUTHORITY_ESCALATION'],
    ['maturity_escalation_count', 0, 'MATURITY_ESCALATION'],
    ['covered_runtime_layer_count', 0, 'RUNTIME_AUTHORITY_ASSIGNED'],
    ['public_leak_count', 0, 'PUBLIC_SOURCE_LEAK'],
    ['managed_artifact_drift_count', 0, 'MANAGED_ARTIFACT_DRIFT']
  ];
  return requirements
    .filter(([field, expected]) => counters[field] !== expected)
    .map(([, , code]) => code);
}

function assertManagedArtifacts(artifacts) {
  const actualPaths = Object.keys(artifacts).sort();
  const expectedPaths = [...P3_MANAGED_ARTIFACT_PATHS].sort();
  if (
    JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)
    || actualPaths.some((artifactPath) =>
      typeof artifacts[artifactPath] !== 'string'
      || !artifacts[artifactPath].endsWith('\n')
      || artifacts[artifactPath].endsWith('\n\n'))
  ) {
    throw new Error('PLAYBOOK_P3_ARTIFACT_SET_INVALID: expected five newline-terminated artifacts');
  }
}

function countPublicLeaks(artifacts) {
  let count = 0;
  for (const value of Object.values(artifacts)) {
    if (typeof value !== 'string') continue;
    count += countDistinctLeakRanges(value);
  }
  return count;
}

function countDistinctLeakRanges(value) {
  const publicUrlRanges = matchRanges(value, PUBLIC_HTTPS_URL);
  const ranges = PUBLIC_LEAK_MATCHERS.flatMap((matcher) =>
    matchRanges(value, matcher))
    .filter((range) => !publicUrlRanges.some((publicUrlRange) =>
      range.start >= publicUrlRange.start && range.end <= publicUrlRange.end))
    .sort((left, right) => left.start - right.start || right.end - left.end);
  let count = 0;
  let coveredUntil = -1;
  for (const range of ranges) {
    if (range.start < coveredUntil) {
      coveredUntil = Math.max(coveredUntil, range.end);
      continue;
    }
    count += 1;
    coveredUntil = range.end;
  }
  return count;
}

function matchRanges(value, matcher) {
  return [...value.matchAll(matcher)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length
  }));
}

function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderJsonl(values) {
  return `${values.map((value) => JSON.stringify(canonicalize(value))).join('\n')}\n`;
}

function hashCanonicalValues(values) {
  const hash = createHash('sha256');
  for (const value of values) hash.update(JSON.stringify(canonicalize(value)));
  return hash.digest('hex');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
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
