import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadP2PublicCorpus } from '../knowledge/publicCandidateCorpus.js';
import { auditManualDependencyBoundary } from './manualDependencyBoundary.js';
import {
  P3_MANAGED_ARTIFACT_PATHS,
  validateP3AdmissionPolicy
} from './p3AdmissionPolicy.js';
import { buildReviewedRuleCards } from './reviewedRuleCard.js';

export { auditManualDependencyBoundary } from './manualDependencyBoundary.js';

const execFileAsync = promisify(execFile);
const MANUAL_PATH = 'docs/architecture-playbook/manual/v0.1.md';
const TERMINOLOGY_PATH = 'docs/architecture-playbook/manual/terminology-v0.1.json';
const COVERAGE_PATH = 'docs/architecture-playbook/manual/coverage-v0.1.json';
const CARDS_PATH = 'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl';
const INDEX_PATH = 'docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json';
const POLICY_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json';
const P3_CHECKED_INPUT_PATHS = Object.freeze([
  'docs/architecture-playbook/course/pilot-episodes.json',
  'docs/architecture-playbook/course/notes/heihui-jileniao/BV1HTCaY6EDt.md',
  'docs/architecture-playbook/course/notes/heihui-jileniao/BV1HhEuzZEyZ.md',
  'docs/architecture-playbook/course/notes/heihui-jileniao/BV1WhkbYeE5k.md',
  'docs/architecture-playbook/course/notes/heihui-jileniao/BV1WsZcYZEMQ.md',
  'docs/architecture-playbook/course/notes/heihui-jileniao/BV1fNkgYBEyy.md',
  'docs/architecture-playbook/course/notes/heihui-jileniao/BV1jbdUYCEjG.md',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/evidence-index-v0.1.json',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/candidates-v0.1.jsonl',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/conflicts-v0.1.json',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/unknowns-v0.1.json',
  POLICY_PATH
]);
const P3_CHECKED_GIT_PATHS = Object.freeze([
  ...P3_CHECKED_INPUT_PATHS,
  ...P3_MANAGED_ARTIFACT_PATHS
]);
const SPECIAL_CHAPTER_IDS = new Set([
  'method-and-boundaries',
  'failure-and-repair',
  'agent-workflow',
  'unknowns-and-coverage'
]);
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
const MAX_PERCENT_NORMALIZATION_ROUNDS = 8;

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
  return finalizeAudit(derivePlaybookAuditCounters(
    compilation,
    managedArtifactDriftCount
  ), { includeCheckedInRequirements: false });
}

function derivePlaybookAuditCounters(compilation, managedArtifactDriftCount) {
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
  return counters;
}

export async function auditCheckedInPlaybookV01({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const gitSnapshot = await captureCheckedInGitSnapshot(root);
  if (!gitSnapshot.complete) return blockedGitSnapshotAudit(gitSnapshot);
  const readSnapshotFile = snapshotReadFile(root, gitSnapshot.commit_blobs);
  const corpus = await loadP2PublicCorpus({
    projectRoot: root,
    readFile: readSnapshotFile
  });
  const policy = validateP3AdmissionPolicy(
    JSON.parse(await readSnapshotFile(path.join(root, POLICY_PATH), 'utf8')),
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
  const checkedInArtifacts = checked.checked_artifacts;
  const [worktreeErrors, dependencyBoundary] =
    await Promise.all([
      verifyCheckedInWorktree({
        projectRoot: root,
        gitSnapshot,
        checkedInArtifacts
      }),
      auditManualDependencyBoundary({ projectRoot: root })
    ]);
  const trackingErrors = [...new Set([
    ...gitSnapshot.tracking_verification_errors,
    ...worktreeErrors
  ])].sort();
  const checkedInCoverage = parseJsonOrNull(checkedInArtifacts[COVERAGE_PATH]);
  const coverageNotCoveredLayers = Array.isArray(checkedInCoverage?.layers)
    ? checkedInCoverage.layers
      .filter((row) => row?.status === 'not-covered')
      .map((row) => row.layer)
    : [];
  const expectedNotCoveredLayers = compilation.coverage.layers
    .filter((row) => row.status === 'not-covered')
    .map((row) => row.layer);
  const checkedInManual = checkedInArtifacts[MANUAL_PATH];
  const manualNotCoveredLayers = [
    ...checkedInManual.matchAll(/^- `([^`]+)`：状态 `not-covered`/gmu)
  ].map((match) => match[1]);
  const notCoveredDeclarationMismatchCount =
    countDeclarationMismatches(
      expectedNotCoveredLayers,
      coverageNotCoveredLayers
    ) + countDeclarationMismatches(
      expectedNotCoveredLayers,
      manualNotCoveredLayers
    );
  const counters = derivePlaybookAuditCounters(
    { ...compilation, artifacts: checkedInArtifacts },
    checked.managed_artifact_drift_count
  );

  return finalizeAudit({
    ...counters,
    untracked_managed_artifact_count:
      gitSnapshot.untracked_managed_artifact_paths.length,
    tracking_verification_error_count:
      trackingErrors.length,
    import_boundary_violation_count:
      dependencyBoundary.import_boundary_violation_count,
    import_boundary_unresolved_count:
      dependencyBoundary.import_boundary_unresolved_count,
    not_covered_declaration_mismatch_count:
      notCoveredDeclarationMismatchCount,
    source_corpus_hash: compilation.source_corpus_hash,
    git_commit: gitSnapshot.git_commit,
    verified_git_snapshot_paths: gitSnapshot.verified_git_snapshot_paths,
    tracked_managed_artifact_paths:
      gitSnapshot.tracked_managed_artifact_paths,
    untracked_managed_artifact_paths:
      gitSnapshot.untracked_managed_artifact_paths,
    tracking_verification_errors:
      trackingErrors,
    manual_construction_imports:
      dependencyBoundary.manual_construction_imports,
    unresolved_manual_dependencies:
      dependencyBoundary.unresolved_manual_dependencies,
    resolved_manual_dependency_paths:
      dependencyBoundary.resolved_manual_dependency_paths,
    expected_not_covered_layers: expectedNotCoveredLayers,
    coverage_not_covered_layers: coverageNotCoveredLayers,
    manual_not_covered_layers: manualNotCoveredLayers
  }, { includeCheckedInRequirements: true });
}

async function captureCheckedInGitSnapshot(projectRoot) {
  try {
    const options = {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      timeout: 10_000,
      windowsHide: true
    };
    const [{ stdout: topLevel }, { stdout: commitOutput }] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--show-toplevel'], options),
      execFileAsync(
        'git',
        ['rev-parse', '--verify', 'HEAD^{commit}'],
        options
      )
    ]);
    const [projectReal, topLevelReal] = await Promise.all([
      fs.realpath(projectRoot),
      fs.realpath(topLevel.trim())
    ]);
    if (projectReal !== topLevelReal) throw new Error('worktree root mismatch');
    const gitCommit = commitOutput.trim();
    if (!/^[a-f0-9]{40,64}$/u.test(gitCommit)) {
      throw new Error('invalid commit identity');
    }
    const [{ stdout: treeOutput }, { stdout: indexOutput }] = await Promise.all([
      execFileAsync('git', [
        'ls-tree', '-z', '--full-tree', gitCommit, '--',
        ...P3_CHECKED_GIT_PATHS
      ], options),
      execFileAsync('git', [
        'ls-files', '--stage', '-z', '--', ...P3_CHECKED_GIT_PATHS
      ], options)
    ]);
    const treeEntries = parseGitTreeEntries(treeOutput);
    const indexEntries = parseGitIndexEntries(indexOutput);
    if (P3_CHECKED_GIT_PATHS.some((checkedPath) => {
      const entry = treeEntries.get(checkedPath);
      return !entry
        || entry.type !== 'blob'
        || !/^100(?:644|755)$/u.test(entry.mode);
    })) {
      return incompleteGitSnapshot('GIT_TREE_PATH_NOT_BLOB');
    }
    const commitBlobs = await readGitBlobs({
      projectRoot,
      entries: treeEntries
    });
    const trackedPaths = P3_MANAGED_ARTIFACT_PATHS.filter((artifactPath) =>
      indexEntries.has(artifactPath));
    const untrackedPaths = P3_MANAGED_ARTIFACT_PATHS.filter((artifactPath) =>
      !indexEntries.has(artifactPath));
    const indexErrors = [];
    const indexBlobEntries = new Map();
    for (const checkedPath of P3_CHECKED_GIT_PATHS) {
      const commitEntry = treeEntries.get(checkedPath);
      const indexEntry = indexEntries.get(checkedPath);
      if (!indexEntry) {
        if (!P3_MANAGED_ARTIFACT_PATHS.includes(checkedPath)) {
          indexErrors.push('GIT_INDEX_DIVERGENCE');
        }
        continue;
      }
      if (
        indexEntry.stage !== '0'
        || !/^100(?:644|755)$/u.test(indexEntry.mode)
        || indexEntry.oid !== commitEntry.oid
      ) {
        indexErrors.push('GIT_INDEX_DIVERGENCE');
      }
      if (
        indexEntry.stage === '0'
        && /^100(?:644|755)$/u.test(indexEntry.mode)
      ) {
        indexBlobEntries.set(checkedPath, indexEntry);
      }
    }
    const indexBlobs = await readGitBlobs({
      projectRoot,
      entries: indexBlobEntries
    });
    return {
      complete: true,
      git_commit: gitCommit,
      commit_blobs: commitBlobs,
      index_blobs: indexBlobs,
      verified_git_snapshot_paths: [...P3_CHECKED_GIT_PATHS],
      tracked_managed_artifact_paths: trackedPaths,
      untracked_managed_artifact_paths: untrackedPaths,
      tracking_verification_errors: [...new Set(indexErrors)].sort()
    };
  } catch {
    return incompleteGitSnapshot('GIT_TRACKING_UNAVAILABLE');
  }
}

function incompleteGitSnapshot(errorCode) {
  return deepFreeze({
    complete: false,
    git_commit: null,
    verified_git_snapshot_paths: [],
    tracked_managed_artifact_paths: [],
    untracked_managed_artifact_paths: [],
    tracking_verification_errors: [errorCode]
  });
}

function parseGitTreeEntries(output) {
  const entries = new Map();
  for (const record of output.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const [mode, type, oid] = record.slice(0, tab).split(' ');
    entries.set(record.slice(tab + 1), { mode, type, oid });
  }
  return entries;
}

function parseGitIndexEntries(output) {
  const entries = new Map();
  for (const record of output.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const [mode, oid, stage] = record.slice(0, tab).split(' ');
    entries.set(record.slice(tab + 1), { mode, oid, stage });
  }
  return entries;
}

async function readGitBlobs({ projectRoot, entries }) {
  const pairs = await Promise.all([...entries].map(async ([checkedPath, entry]) => {
    const { stdout } = await execFileAsync(
      'git',
      ['cat-file', 'blob', entry.oid],
      {
        cwd: projectRoot,
        encoding: 'buffer',
        maxBuffer: 2 * 1024 * 1024,
        timeout: 10_000,
        windowsHide: true
      }
    );
    return [checkedPath, Buffer.from(stdout)];
  }));
  return Object.fromEntries(pairs);
}

function snapshotReadFile(projectRoot, blobs) {
  return async (filePath, encoding = null) => {
    const relativePath = path.relative(projectRoot, path.resolve(filePath))
      .split(path.sep).join('/');
    if (!P3_CHECKED_INPUT_PATHS.includes(relativePath) || !blobs[relativePath]) {
      throw new Error('PLAYBOOK_GIT_SNAPSHOT_PATH_NOT_ALLOWED');
    }
    const bytes = Buffer.from(blobs[relativePath]);
    return encoding ? bytes.toString(encoding) : bytes;
  };
}

async function verifyCheckedInWorktree({
  projectRoot,
  gitSnapshot,
  checkedInArtifacts
}) {
  const errors = [];
  for (const inputPath of P3_CHECKED_INPUT_PATHS) {
    const expected = gitSnapshot.index_blobs[inputPath];
    if (!expected) continue;
    try {
      const absolutePath = path.join(projectRoot, inputPath);
      const stat = await fs.lstat(absolutePath);
      const actual = stat.isFile() && !stat.isSymbolicLink()
        ? await fs.readFile(absolutePath)
        : null;
      if (actual === null || !actual.equals(expected)) {
        errors.push('GIT_WORKTREE_DIVERGENCE');
      }
    } catch {
      errors.push('GIT_WORKTREE_DIVERGENCE');
    }
  }
  if (P3_MANAGED_ARTIFACT_PATHS.some((artifactPath) =>
    !Buffer.from(checkedInArtifacts[artifactPath], 'utf8')
      .equals(gitSnapshot.commit_blobs[artifactPath]))) {
    errors.push('GIT_OUTPUT_SNAPSHOT_DIVERGENCE');
  }
  return [...new Set(errors)].sort();
}

function blockedGitSnapshotAudit(gitSnapshot) {
  return finalizeAudit({
    p2_gate_status: 'blocked',
    reviewed_rule_count: 0,
    core_procedure_count: 0,
    case_pattern_count: 0,
    dangling_reference_count: 0,
    cross_school_count: 0,
    authority_escalation_count: 0,
    maturity_escalation_count: 0,
    covered_runtime_layer_count: 0,
    public_leak_count: 0,
    managed_artifact_drift_count: 0,
    untracked_managed_artifact_count:
      gitSnapshot.untracked_managed_artifact_paths.length,
    tracking_verification_error_count:
      gitSnapshot.tracking_verification_errors.length,
    import_boundary_violation_count: 0,
    import_boundary_unresolved_count: 0,
    not_covered_declaration_mismatch_count: 0,
    source_corpus_hash: null,
    git_commit: gitSnapshot.git_commit,
    verified_git_snapshot_paths: gitSnapshot.verified_git_snapshot_paths,
    tracked_managed_artifact_paths:
      gitSnapshot.tracked_managed_artifact_paths,
    untracked_managed_artifact_paths:
      gitSnapshot.untracked_managed_artifact_paths,
    tracking_verification_errors:
      gitSnapshot.tracking_verification_errors,
    manual_construction_imports: [],
    unresolved_manual_dependencies: [],
    resolved_manual_dependency_paths: [],
    expected_not_covered_layers: [],
    coverage_not_covered_layers: [],
    manual_not_covered_layers: []
  }, { includeCheckedInRequirements: true });
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countDeclarationMismatches(expected, actual) {
  const expectedCounts = countValues(expected);
  const actualCounts = countValues(actual);
  const values = new Set([...expectedCounts.keys(), ...actualCounts.keys()]);
  let mismatches = 0;
  for (const value of values) {
    mismatches += Math.abs(
      (expectedCounts.get(value) ?? 0) - (actualCounts.get(value) ?? 0)
    );
  }
  return mismatches;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
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

function finalizeAudit(fields, { includeCheckedInRequirements }) {
  const blockerCodes = auditBlockerCodes(fields, {
    includeCheckedInRequirements
  });
  return deepFreeze({
    ...fields,
    gate: {
      status: blockerCodes.length === 0 ? 'passed' : 'blocked',
      next_phase: blockerCodes.length === 0 ? 'P4' : null,
      blocker_codes: blockerCodes
    }
  });
}

function auditBlockerCodes(counters, { includeCheckedInRequirements }) {
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
  if (includeCheckedInRequirements) {
    requirements.push(
      [
        'untracked_managed_artifact_count',
        0,
        'UNTRACKED_MANAGED_ARTIFACT'
      ],
      [
        'tracking_verification_error_count',
        0,
        'TRACKING_VERIFICATION_FAILED'
      ],
      [
        'import_boundary_violation_count',
        0,
        'MANUAL_CONSTRUCTION_IMPORT'
      ],
      [
        'import_boundary_unresolved_count',
        0,
        'MANUAL_DEPENDENCY_UNRESOLVED'
      ],
      [
        'not_covered_declaration_mismatch_count',
        0,
        'NOT_COVERED_DECLARATION_MISMATCH'
      ]
    );
  }
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
  return findPublicLeakRanges(value).length;
}

function normalizePublicText(value) {
  let units = value.split('').map((character, index) => ({
    character,
    rawStart: index,
    rawEnd: index + 1
  }));
  for (let round = 0; round < MAX_PERCENT_NORMALIZATION_ROUNDS; round += 1) {
    const decoded = decodeAsciiPercentUnits(units);
    units = decoded.units;
    if (!decoded.changed) return toNormalizationResult(units, false);
  }
  return toNormalizationResult(units, containsDecodableAsciiPercent(units));
}

function decodeAsciiPercentUnits(units) {
  const decodedUnits = [];
  let changed = false;
  for (let index = 0; index < units.length; index += 1) {
    const decoded = decodedAsciiPercentUnit(units, index);
    if (!decoded) {
      decodedUnits.push(units[index]);
      continue;
    }
    decodedUnits.push(decoded);
    index += 2;
    changed = true;
  }
  return { units: decodedUnits, changed };
}

function toNormalizationResult(units, exhausted) {
  return {
    text: units.map((unit) => unit.character).join(''),
    rawRanges: units.map((unit) => ({
      start: unit.rawStart,
      end: unit.rawEnd
    })),
    exhausted
  };
}

function containsDecodableAsciiPercent(units) {
  return units.some((unit, index) => decodedAsciiPercentUnit(units, index) !== null);
}

function decodedAsciiPercentUnit(units, index) {
  if (
    units[index]?.character !== '%'
    || !/^[0-9A-Fa-f]$/u.test(units[index + 1]?.character ?? '')
    || !/^[0-9A-Fa-f]$/u.test(units[index + 2]?.character ?? '')
  ) return null;
  const code = Number.parseInt(
    `${units[index + 1].character}${units[index + 2].character}`,
    16
  );
  if (code < 0x20 || code > 0x7e) return null;
  return {
    character: String.fromCharCode(code),
    rawStart: units[index].rawStart,
    rawEnd: units[index + 2].rawEnd
  };
}

function normalizedMatchRanges(normalized, matcher) {
  return [...normalized.text.matchAll(matcher)].map((match) =>
    normalizedRange(normalized, match.index, match.index + match[0].length));
}

function findPublicLeakRanges(value) {
  const normalized = normalizePublicText(value);
  const httpsRanges = findHttpsRanges(normalized);
  const fileRanges = findFileUrlRanges(normalized);
  const uncRanges = findUncRanges(normalized, httpsRanges, fileRanges);
  const highPriorityRanges = [...fileRanges, ...uncRanges];
  const ordinaryRanges = selectDistinctOrdinaryRanges(
    PUBLIC_LEAK_MATCHERS.flatMap((matcher) =>
      normalizedMatchRanges(normalized, matcher)
        .map((range) => ({ ...range, kind: 'PUBLIC_PATH' })))
      .filter((range) => !isContainedByAny(range, httpsRanges))
      .filter((range) => !overlapsAny(range, highPriorityRanges))
  );
  const exhaustedRanges = normalized.exhausted
    ? [percentNormalizationExhaustedRange(normalized)]
    : [];
  return deduplicateIdenticalRanges([
    ...highPriorityRanges,
    ...ordinaryRanges,
    ...exhaustedRanges
  ]).map(({ start, end, kind }) => ({ start, end, kind }));
}

function findHttpsRanges(normalized) {
  const ranges = [];
  const matcher = /https:\/\//gimu;
  for (const match of normalized.text.matchAll(matcher)) {
    if (isAsciiAlphaNumeric(normalized.text[match.index - 1])) continue;
    const normalizedEnd = publicReferenceTokenEnd(
      normalized.text,
      match.index + match[0].length
    );
    ranges.push({
      ...normalizedRange(normalized, match.index, normalizedEnd),
      normalizedStart: match.index,
      normalizedEnd,
      kind: 'HTTPS_PUBLIC'
    });
  }
  return ranges;
}

function findFileUrlRanges(normalized) {
  const ranges = [];
  const matcher = /file:(?=[\\/])/gimu;
  for (const match of normalized.text.matchAll(matcher)) {
    if (isAsciiAlphaNumeric(normalized.text[match.index - 1])) continue;
    const normalizedEnd = publicReferenceTokenEnd(
      normalized.text,
      match.index + match[0].length,
      { stopAtNewScheme: true, stopAtReferenceBoundary: true }
    );
    ranges.push({
      ...normalizedRange(normalized, match.index, normalizedEnd),
      normalizedStart: match.index,
      normalizedEnd,
      kind: 'FILE_URL'
    });
  }
  return ranges;
}

function findUncRanges(normalized, httpsRanges, fileRanges) {
  const ranges = [];
  for (let index = 0; index < normalized.text.length - 1; index += 1) {
    if (!isSlash(normalized.text[index]) || !isSlash(normalized.text[index + 1])) {
      continue;
    }
    if (isAsciiAlphaNumeric(normalized.text[index - 1])) continue;
    const normalizedEnd = publicReferenceTokenEnd(normalized.text, index + 2, {
      stopAtNewScheme: true,
      stopAtReferenceBoundary: true
    });
    const normalizedCandidate = {
      normalizedStart: index,
      normalizedEnd,
      ...normalizedRange(normalized, index, normalizedEnd)
    };
    if (!isUncReference(normalized.text.slice(index, normalizedEnd))) continue;
    if (overlapsAny(normalizedCandidate, fileRanges)) continue;
    if (isHttpsPathSeparator(normalizedCandidate, httpsRanges, normalized.text)) {
      continue;
    }
    ranges.push({ ...normalizedCandidate, kind: 'UNC_REFERENCE' });
    index = normalizedEnd - 1;
  }
  return ranges;
}

function isUncReference(candidate) {
  const segment = String.raw`[^\\/\s\x60"'<>|()[\]{}]+`;
  return new RegExp(
    String.raw`^[\\/]{2,}(?:\?[\\/]UNC[\\/]${segment}[\\/]${segment}|${segment}[\\/]${segment})`,
    'iu'
  ).test(candidate);
}

function isHttpsPathSeparator(candidate, httpsRanges, text) {
  if (
    text[candidate.normalizedStart] !== '/'
    || text[candidate.normalizedStart + 1] !== '/'
  ) return false;
  const httpsRange = httpsRanges.find((range) =>
    candidate.normalizedStart >= range.normalizedStart
      && candidate.normalizedStart < range.normalizedEnd);
  if (!httpsRange) return false;
  const queryIndex = text.slice(
    httpsRange.normalizedStart,
    httpsRange.normalizedEnd
  ).search(/[?#]/u);
  return queryIndex === -1
    || candidate.normalizedStart < httpsRange.normalizedStart + queryIndex;
}

function publicReferenceTokenEnd(text, start, {
  stopAtNewScheme = false,
  stopAtReferenceBoundary = false
} = {}) {
  let index = start;
  while (index < text.length && !isPublicReferenceTerminator(text[index])) {
    if (
      stopAtReferenceBoundary
      && isPublicReferenceBoundary(text[index])
      && !startsExtendedUncSuffix(text, start, index)
    ) break;
    if (stopAtNewScheme && index > start && startsUriScheme(text, index)) break;
    index += 1;
  }
  return index;
}

function isPublicReferenceTerminator(character) {
  return character === undefined
    || /[\s\x60"'<>|()[\]{}]/u.test(character);
}

function isPublicReferenceBoundary(character) {
  return /[?#&,;]/u.test(character);
}

function startsExtendedUncSuffix(text, tokenBodyStart, index) {
  return index === tokenBodyStart && /^\?[\\/]UNC[\\/]/iu.test(text.slice(index));
}

function startsUriScheme(text, index) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:[\\/]/u.test(text.slice(index));
}

function isSlash(character) {
  return character === '/' || character === '\\';
}

function isAsciiAlphaNumeric(character) {
  return character !== undefined && /[A-Za-z0-9]/u.test(character);
}

function normalizedRange(normalized, normalizedStart, normalizedEnd) {
  return {
    start: normalized.rawRanges[normalizedStart].start,
    end: normalized.rawRanges[normalizedEnd - 1].end,
    normalizedStart,
    normalizedEnd
  };
}

function percentNormalizationExhaustedRange(normalized) {
  const normalizedStart = findDecodableAsciiPercentIndex(normalized.text);
  return {
    ...normalizedRange(normalized, normalizedStart, normalizedStart + 3),
    kind: 'PERCENT_NORMALIZATION_EXHAUSTED'
  };
}

function findDecodableAsciiPercentIndex(text) {
  for (let index = 0; index < text.length - 2; index += 1) {
    if (text[index] !== '%' || !/^[0-9A-Fa-f]{2}$/u.test(text.slice(index + 1, index + 3))) {
      continue;
    }
    const code = Number.parseInt(text.slice(index + 1, index + 3), 16);
    if (code >= 0x20 && code <= 0x7e) return index;
  }
  return -1;
}

function isContainedByAny(range, containers) {
  return containers.some((container) =>
    range.normalizedStart >= container.normalizedStart
      && range.normalizedEnd <= container.normalizedEnd);
}

function overlapsAny(range, others) {
  return others.some((other) =>
    range.normalizedStart < other.normalizedEnd
      && other.normalizedStart < range.normalizedEnd);
}

function selectDistinctOrdinaryRanges(ranges) {
  const sorted = ranges.sort((left, right) =>
    left.normalizedStart - right.normalizedStart
      || right.normalizedEnd - left.normalizedEnd);
  const selected = [];
  let coveredUntil = -1;
  for (const range of sorted) {
    if (range.normalizedStart < coveredUntil) {
      coveredUntil = Math.max(coveredUntil, range.normalizedEnd);
      continue;
    }
    selected.push(range);
    coveredUntil = range.normalizedEnd;
  }
  return selected;
}

function deduplicateIdenticalRanges(ranges) {
  const seen = new Set();
  return ranges.filter((range) => {
    const key = `${range.kind}:${range.start}:${range.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
