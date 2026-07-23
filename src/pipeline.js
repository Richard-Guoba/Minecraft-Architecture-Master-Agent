import path from 'node:path';
import fs from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { resolveWorldDir } from './lib/minecraftWorlds.js';
import { runConstructionWorkflow } from './construction/workflow.js';
import { CandidateSelectionAgent } from './construction/agents/candidateSelectionAgent.js';

const MAX_RANDOM_SEED = 2147483647;
const DEFAULT_CANDIDATE_TARGET_SCORE = 95;

export async function runPipeline({
  prompt,
  mode = 'mock',
  mcVersion = '1.21',
  outRoot,
  seed,
  candidates = 1,
  candidateRounds = 1,
  candidateTargetScore = DEFAULT_CANDIDATE_TARGET_SCORE,
  candidateForceRounds = false,
  concepts = 0,
  conceptStrategy = 'select',
  critics = true,
  neuralRetrieval = false,
  coarseVoxelMode = 'off', coarseVoxelProvider = 'baseline', coarseVoxelPlan,
  cwd = process.cwd(),
  minecraftDir,
  world,
  datapacksDir,
  autoBuild = false
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required.');
  }

  const candidateCount = clampInt(candidates, 1, 8, 1);
  const roundCount = clampInt(candidateRounds, 1, 5, 1);
  assertStage7CandidateCompatibility({ coarseVoxelMode, coarseVoxelProvider, candidateCount, roundCount });
  const conceptCount = clampInt(concepts, 0, 5, 0);
  const normalizedConceptStrategy = normalizeConceptStrategy(conceptStrategy);
  if (candidateCount > 1 || roundCount > 1) {
    return runCandidatePipeline({
      prompt,
      mode,
      mcVersion,
      outRoot,
      seed,
      candidates: candidateCount,
      candidateRounds: roundCount,
      candidateTargetScore,
      candidateForceRounds,
      cwd,
      minecraftDir,
      world,
      datapacksDir,
      autoBuild,
      concepts: conceptCount,
      conceptStrategy: normalizedConceptStrategy,
      critics,
      neuralRetrieval
      , coarseVoxelMode, coarseVoxelProvider, coarseVoxelPlan
    });
  }

  const seedPlan = resolveSeed(seed);
  const outputDir = path.join(path.resolve(outRoot || path.join(cwd, 'out')), createTimestamp());
  await ensureDir(outputDir);

  const result = await runConstructionWorkflow({
    prompt,
    mode,
    mcVersion,
    outputDir,
    seed: seedPlan.seed,
    seedSource: seedPlan.source,
    cwd,
    minecraftDir,
    world,
    datapacksDir,
    autoBuild,
    conceptCount,
    conceptStrategy: normalizedConceptStrategy,
    critics,
    neuralRetrieval
    , coarseVoxelMode, coarseVoxelProvider, coarseVoxelPlan
  });

  return {
    ...result,
    seed: seedPlan.seed,
    seedSource: seedPlan.source
  };
}

export async function runCandidatePipeline({
  prompt,
  mode = 'mock',
  mcVersion = '1.21',
  outRoot,
  seed,
  candidates = 3,
  candidateRounds = 1,
  candidateTargetScore = DEFAULT_CANDIDATE_TARGET_SCORE,
  candidateForceRounds = false,
  concepts = 0,
  conceptStrategy = 'select',
  critics = true,
  neuralRetrieval = false,
  coarseVoxelMode = 'off', coarseVoxelProvider = 'baseline', coarseVoxelPlan,
  cwd = process.cwd(),
  minecraftDir,
  world,
  datapacksDir,
  autoBuild = false
}) {
  if (!prompt || !prompt.trim()) throw new Error('Prompt is required.');

  const seedPlan = resolveSeed(seed);
  const candidateCount = clampInt(candidates, 1, 8, 3);
  const roundCount = clampInt(candidateRounds, 1, 5, 1);
  assertStage7CandidateCompatibility({ coarseVoxelMode, coarseVoxelProvider, candidateCount, roundCount });
  const targetScore = clampInt(candidateTargetScore, 0, 100, DEFAULT_CANDIDATE_TARGET_SCORE);
  const conceptCount = clampInt(concepts, 0, 5, 0);
  const normalizedConceptStrategy = normalizeConceptStrategy(conceptStrategy);
  const outputDir = path.join(path.resolve(outRoot || path.join(cwd, 'out')), createTimestamp());
  await ensureDir(outputDir);

  const allCandidates = [];
  const roundSummaries = [];
  let roundPrompt = prompt;
  let stopReason = 'max-rounds-reached';

  for (let roundIndex = 1; roundIndex <= roundCount; roundIndex += 1) {
    const roundDir = path.join(outputDir, 'candidates', `round-${pad(roundIndex)}`);
    await ensureDir(roundDir);
    const roundCandidates = [];

    for (let candidateIndex = 1; candidateIndex <= candidateCount; candidateIndex += 1) {
      const candidateSeed = candidateSeedFor(seedPlan.seed, roundIndex, candidateIndex);
      const candidateDir = path.join(roundDir, `candidate-${pad(candidateIndex)}-seed-${candidateSeed}`);
      const id = `r${roundIndex}-c${candidateIndex}-seed-${candidateSeed}`;
      try {
        const result = await runConstructionWorkflow({
          prompt: roundPrompt,
          mode,
          mcVersion,
          outputDir: candidateDir,
          seed: candidateSeed,
          seedSource: `${seedPlan.source}-candidate`,
          cwd,
          minecraftDir,
          world: undefined,
          datapacksDir: undefined,
          autoBuild,
          conceptCount,
          conceptStrategy: normalizedConceptStrategy,
          critics,
          neuralRetrieval
          , coarseVoxelMode, coarseVoxelProvider, coarseVoxelPlan
        });
        const record = {
          id,
          ok: true,
          round: roundIndex,
          index: candidateIndex,
          seed: candidateSeed,
          seedSource: `${seedPlan.source}-candidate`,
          prompt: roundPrompt,
          outputDir: result.outputDir,
          artifacts: result.artifacts,
          result
        };
        roundCandidates.push(record);
        allCandidates.push(record);
      } catch (error) {
        const record = {
          id,
          ok: false,
          round: roundIndex,
          index: candidateIndex,
          seed: candidateSeed,
          seedSource: `${seedPlan.source}-candidate`,
          prompt: roundPrompt,
          outputDir: candidateDir,
          error
        };
        roundCandidates.push(record);
        allCandidates.push(record);
      }
    }

    const roundSelection = new CandidateSelectionAgent().run(roundCandidates, {
      targetScore,
      round: roundIndex
    });
    roundSummaries.push({
      round: roundIndex,
      prompt: roundPrompt,
      selection: roundSelection
    });

    if (!roundSelection.selected_candidate_id) {
      stopReason = 'no-successful-candidate';
      break;
    }
    if (!candidateForceRounds && roundSelection.selected_template_score >= targetScore) {
      stopReason = 'target-score-met';
      break;
    }
    if (roundIndex < roundCount) {
      const addendum = roundSelection.regeneration_prompt_addendum || directiveText(roundSelection.next_iteration_directives);
      roundPrompt = addReflectionToPrompt(prompt, addendum, roundIndex);
      stopReason = 'reflection-round-prepared';
    }
  }

  if (roundSummaries.length === roundCount && stopReason === 'reflection-round-prepared') {
    stopReason = 'max-rounds-reached';
  }

  const finalSelection = new CandidateSelectionAgent().run(allCandidates, { targetScore, scope: 'all-rounds' });
  const selectedRecord = allCandidates.find((candidate) => candidate.id === finalSelection.selected_candidate_id);
  if (!selectedRecord?.result) {
    throw new Error(`Candidate optimization failed: ${finalSelection.reason}`);
  }

  const selectedResult = selectedRecord.result;
  const installedDatapackDir = await installSelectedDatapack(selectedResult.artifacts.datapackDir, {
    minecraftDir,
    world,
    datapacksDir
  });
  if (installedDatapackDir) selectedResult.artifacts.installedDatapackDir = installedDatapackDir;

  const candidateSelection = {
    ...finalSelection,
    source: 'local-candidate-optimization-pipeline',
    active: true,
    candidate_optimization: true,
    base_seed: seedPlan.seed,
    base_seed_source: seedPlan.source,
    candidate_count_per_round: candidateCount,
    round_count: roundSummaries.length,
    requested_round_count: roundCount,
    force_rounds: Boolean(candidateForceRounds),
    concept_count: conceptCount,
    concept_strategy: normalizedConceptStrategy,
    stop_reason: stopReason,
    output_root: outputDir,
    selected_output_dir: selectedResult.outputDir,
    selected_report: selectedResult.artifacts.report,
    selected_preview: selectedResult.artifacts.previewHtml,
    rounds: roundSummaries.map((round) => ({
      round: round.round,
      prompt: round.prompt,
      selected_candidate_id: round.selection.selected_candidate_id,
      selected_seed: round.selection.selected_seed,
      selected_template_score: round.selection.selected_template_score,
      selected_assimilation_score: round.selection.selected_assimilation_score,
      selected_grade: round.selection.selected_grade,
      reason: round.selection.reason,
      candidates: round.selection.candidates
    }))
  };

  const selectionJsonPath = path.join(outputDir, 'candidate_selection.json');
  const selectionReportPath = path.join(outputDir, 'candidate_selection_report.md');
  await writeJson(selectionJsonPath, candidateSelection);
  await fs.writeFile(selectionReportPath, renderCandidateSelectionReport(candidateSelection), 'utf8');

  selectedResult.candidateSelection = candidateSelection;
  selectedResult.blueprint.candidateSelection = compactCandidateSelection(candidateSelection);
  selectedResult.artifacts = {
    ...selectedResult.artifacts,
    candidateSelection: selectionJsonPath,
    candidateSelectionReport: selectionReportPath,
    installedDatapackDir: installedDatapackDir || selectedResult.artifacts.installedDatapackDir
  };
  await writeJson(selectedResult.artifacts.blueprint, selectedResult.blueprint);
  await fs.appendFile(selectedResult.artifacts.report, `\n${renderSelectedCandidateAppendix(candidateSelection)}\n`, 'utf8');

  return {
    ...selectedResult,
    outputDir,
    selectedOutputDir: selectedResult.outputDir,
    seed: selectedRecord.seed,
    seedSource: `${seedPlan.source}-candidate-selected`,
    candidateSelection,
    artifacts: selectedResult.artifacts
  };
}

export function resolveSeed(seed) {
  if (seed === undefined || seed === null || seed === '') {
    return {
      seed: randomInt(1, MAX_RANDOM_SEED),
      source: 'random'
    };
  }

  const parsed = Number(seed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid seed: ${seed}`);
  }

  return {
    seed: Math.trunc(parsed),
    source: 'manual'
  };
}

export function candidateSeedFor(baseSeed, roundIndex = 1, candidateIndex = 1) {
  const base = Number(baseSeed || 1);
  const raw = Math.trunc(base + roundIndex * 1000003 + candidateIndex * 7919);
  const normalized = ((raw % MAX_RANDOM_SEED) + MAX_RANDOM_SEED) % MAX_RANDOM_SEED;
  return normalized || 1;
}

async function installSelectedDatapack(sourceDatapackDir, { minecraftDir, world, datapacksDir } = {}) {
  if (!sourceDatapackDir || (!world && !datapacksDir)) return undefined;
  const targetDir = datapacksDir
    ? path.join(path.resolve(datapacksDir), 'architect_datapack')
    : path.join(await resolveWorldDir({ minecraftDir, world }), 'datapacks', 'architect_datapack');
  await fs.rm(targetDir, { recursive: true, force: true });
  await ensureDir(path.dirname(targetDir));
  await fs.cp(sourceDatapackDir, targetDir, { recursive: true });
  return targetDir;
}

function compactCandidateSelection(selection = {}) {
  return {
    source: selection.source,
    active: selection.active,
    strategy: selection.strategy,
    target_score: selection.target_score,
    candidate_count: selection.candidate_count,
    successful_count: selection.successful_count,
    failed_count: selection.failed_count,
    selected_candidate_id: selection.selected_candidate_id,
    selected_seed: selection.selected_seed,
    selected_round: selection.selected_round,
    selected_index: selection.selected_index,
    selected_template_score: selection.selected_template_score,
    selected_law_coverage_score: selection.selected_law_coverage_score,
    selected_assimilation_score: selection.selected_assimilation_score,
    selected_selection_score: selection.selected_selection_score,
    selected_grade: selection.selected_grade,
    met_target: selection.met_target,
    reason: selection.reason,
    concept_count: selection.concept_count,
    concept_strategy: selection.concept_strategy,
    stop_reason: selection.stop_reason,
    output_root: selection.output_root,
    selected_output_dir: selection.selected_output_dir,
    next_iteration_directives: selection.next_iteration_directives,
    ranking: selection.ranking,
    rounds: selection.rounds?.map((round) => ({
      round: round.round,
      selected_candidate_id: round.selected_candidate_id,
      selected_seed: round.selected_seed,
      selected_template_score: round.selected_template_score,
      selected_assimilation_score: round.selected_assimilation_score,
      selected_grade: round.selected_grade
    }))
  };
}

function renderCandidateSelectionReport(selection = {}) {
  const rows = (selection.ranking || []).map((item) =>
    `| ${item.rank} | ${item.candidate_id} | ${item.seed} | ${item.round} | ${item.template_score} | ${item.law_coverage_score || 0} | ${item.assimilation_score || 0} | ${item.selection_score} | ${item.grade} | ${(item.gap_ids || []).join(', ') || '-'} | ${item.output_dir || '-'} |`
  ).join('\n') || '| - | - | - | - | - | - | - | - | - | - | - |';
  const roundBlocks = (selection.rounds || []).map((round) => {
    const candidates = (round.candidates || []).map((item) =>
      `  - ${item.candidate_id}: template=${item.template_score}, law=${item.law_coverage_score || 0}, audit=${item.assimilation_score || 0}, selection=${item.selection_score}, grade=${item.grade}, gaps=${(item.gap_ids || []).join(', ') || '-'}`
    ).join('\n');
    return `### Round ${round.round}\n\n- Prompt: ${round.prompt}\n- Selected: ${round.selected_candidate_id || 'none'} seed=${round.selected_seed || '-'} score=${round.selected_template_score || 0} audit=${round.selected_assimilation_score || 0}\n- Reason: ${round.reason || '-'}\n${candidates}`;
  }).join('\n\n');

  return `# 第6阶段候选择优报告

- 策略：${selection.strategy || 'unknown'}
- 基准 seed：${selection.base_seed} (${selection.base_seed_source})
- 候选：${selection.candidate_count} 个，成功 ${selection.successful_count} 个，失败 ${selection.failed_count} 个
- 轮数：${selection.round_count}/${selection.requested_round_count}，停止原因：${selection.stop_reason}
- 目标分：${selection.target_score}
- 最终选择：${selection.selected_candidate_id} / seed ${selection.selected_seed}
- 模板审美分：${selection.selected_template_score}/100（${selection.selected_grade}）
- 模板法则覆盖率：${selection.selected_law_coverage_score || 0}%
- 模板吸收审计：${selection.selected_assimilation_score || 0}%
- 选择理由：${selection.reason}
- 选中输出：${selection.selected_output_dir}

## 排名

| Rank | Candidate | Seed | Round | Template | Law | Audit | Selection | Grade | Gaps | Output |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
${rows}

## 反省指令

${(selection.next_iteration_directives || []).map((item) => `- ${item.id} (${item.priority})：${item.text}`).join('\n') || '- 无，保持当前质量。'}

## 分轮记录

${roundBlocks || '- 无'}
`;
}

function renderSelectedCandidateAppendix(selection = {}) {
  return `## 第6阶段候选择优

- 候选总数：${selection.candidate_count}，成功 ${selection.successful_count}，失败 ${selection.failed_count}
- 轮数：${selection.round_count}/${selection.requested_round_count}，停止原因：${selection.stop_reason}
- 最终选择：${selection.selected_candidate_id}，seed ${selection.selected_seed}
- 模板审美分：${selection.selected_template_score}/100（${selection.selected_grade}）
- 模板法则覆盖率：${selection.selected_law_coverage_score || 0}%
- 模板吸收审计：${selection.selected_assimilation_score || 0}%
- 择优分：${selection.selected_selection_score}
- 选择理由：${selection.reason}
- 候选对比报告：${selection.output_root ? path.join(selection.output_root, 'candidate_selection_report.md') : '-'}
- 下一轮指令：${(selection.next_iteration_directives || []).map((item) => item.id).join('、') || '保持当前质量'}
`;
}

function addReflectionToPrompt(prompt, addendum, roundIndex) {
  const text = String(addendum || '').trim();
  if (!text) return prompt;
  return `${prompt}。第6阶段第${roundIndex + 1}轮反省要求：${text}`;
}

function directiveText(directives = []) {
  return directives.map((item) => item.text).filter(Boolean).join(' ');
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeConceptStrategy(value) {
  return String(value || 'select') === 'fuse' ? 'fuse' : 'select';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function assertStage7CandidateCompatibility({ coarseVoxelMode, coarseVoxelProvider, candidateCount, roundCount }) {
  if (coarseVoxelMode === 'shadow' && coarseVoxelProvider === 'artifact' && (candidateCount > 1 || roundCount > 1)) {
    throw new Error('Stage 7 M1 artifact provider supports exactly one candidate and one round because each plan is bound to one condition hash.');
  }
}
