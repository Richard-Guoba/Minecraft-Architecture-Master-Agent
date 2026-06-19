#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstructionWorkflow, formatLlmUsage } from './construction/workflow.js';
import { TEMPLATE_ASSIMILATION_PROMPTS } from './construction/templateAssimilationPromptSuite.js';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { loadEnvFile } from './lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export async function runTemplateAssimilationSuite(options = {}) {
  const normalized = normalizeOptions(options);
  const suite = TEMPLATE_ASSIMILATION_PROMPTS.slice(0, normalized.limit);
  const root = path.resolve(normalized.out || path.join(projectRoot, 'out', `template-assimilation-${createTimestamp()}`));
  const runsDir = path.join(root, 'runs');
  await ensureDir(runsDir);

  const results = [];
  for (let index = 0; index < suite.length; index += 1) {
    const item = suite[index];
    const runDir = path.join(runsDir, `${String(index + 1).padStart(2, '0')}-${item.id}`);
    console.log(`[${index + 1}/${suite.length}] ${item.id}`);
    try {
      const result = await runConstructionWorkflow({
        prompt: item.prompt,
        mode: normalized.mode,
        mcVersion: normalized.mcVersion,
        outputDir: runDir,
        seed: item.seed,
        seedSource: 'template-assimilation-suite',
        cwd: normalized.cwd
      });
      const audit = result.blueprint.templateAssimilationAudit || result.templateAssimilationAudit || {};
      const law = result.blueprint.templateLawCoverage || result.templateLawCoverage || {};
      const aesthetic = result.blueprint.templateAestheticReview || result.templateAestheticReview || {};
      const autoRepair = result.blueprint.templateLawAutoRepair || result.templateLawAutoRepair || {};
      const interiorDensityRepair = result.blueprint.templateInteriorDensityRepair || result.templateInteriorDensityRepair || {};
      results.push({
        id: item.id,
        focus: item.focus,
        prompt: item.prompt,
        seed: item.seed,
        ok: true,
        outputDir: runDir,
        artifacts: result.artifacts,
        validation: result.validation,
        llmProvider: result.llmProvider,
        llmUsage: result.llmUsage,
        audit,
        law,
        aesthetic,
        autoRepair,
        interiorDensityRepair
      });
      console.log(`  audit=${audit.percent || 0}% ${audit.grade || 'n/a'} | law=${law.percent || 0}% | aesthetic=${aesthetic.score || 0}/100 | density=${interiorDensityRepair.active ? `${interiorDensityRepair.placement_count || 0} placements` : 'ok'} | LLM=${formatLlmUsage(result.llmUsage)}`);
    } catch (error) {
      results.push({
        id: item.id,
        focus: item.focus,
        prompt: item.prompt,
        seed: item.seed,
        ok: false,
        outputDir: runDir,
        error: error.message,
        audit: failedAudit(error)
      });
      console.log(`  FAILED | ${error.message}`);
    }
  }

  const summary = summarizeTemplateAssimilationSuite(results, root, normalized);
  await writeJson(path.join(root, 'template_assimilation_summary.json'), summary);
  await fs.writeFile(path.join(root, 'template_assimilation_report.md'), renderTemplateAssimilationMarkdown(summary), 'utf8');
  await fs.writeFile(path.join(root, 'template_assimilation_table.csv'), renderTemplateAssimilationCsv(summary), 'utf8');

  console.log('');
  console.log(renderConsoleTable(summary.results));
  console.log('');
  console.log(`Template assimilation suite complete: ${summary.passCount}/${summary.total} generated successfully`);
  console.log(`Average audit: ${summary.averageAudit}%`);
  console.log(`Top-tier ready: ${summary.topTierReadyCount}/${summary.total}`);
  console.log(`Report: ${path.join(root, 'template_assimilation_report.md')}`);
  console.log(`JSON: ${path.join(root, 'template_assimilation_summary.json')}`);
  console.log(`CSV: ${path.join(root, 'template_assimilation_table.csv')}`);

  return summary;
}

export function summarizeTemplateAssimilationSuite(results = [], root = '', options = {}) {
  const successful = results.filter((item) => item.ok);
  const audits = results.map((item) => item.audit || {}).filter((item) => item.active !== false || Number(item.percent || 0) > 0);
  const averageAudit = average(audits.map((item) => Number(item.percent || item.score || 0)));
  const averageLaw = average(results.map((item) => Number(item.law?.percent || 0)));
  const averageAesthetic = roundTo(mean(results.map((item) => Number(item.aesthetic?.score || item.aesthetic?.percent || 0))), 1);
  const topTierReadyCount = results.filter((item) => item.audit?.readiness === 'top-tier-ready' || Number(item.audit?.percent || 0) >= 96).length;
  const excellentCount = results.filter((item) => Number(item.audit?.percent || 0) >= 90).length;
  const autoRepairAppliedCount = results.filter((item) => item.autoRepair?.active).length;
  const totalAutoRepairGridPatches = sum(results.map((item) => item.autoRepair?.grid_patch_count || 0));
  const totalAutoRepairPlacements = sum(results.map((item) => item.autoRepair?.placement_count || 0));
  const interiorDensityRepairAppliedCount = results.filter((item) => item.interiorDensityRepair?.active).length;
  const totalInteriorDensityGridPatches = sum(results.map((item) => item.interiorDensityRepair?.grid_patch_count || 0));
  const totalInteriorDensityPlacements = sum(results.map((item) => item.interiorDensityRepair?.placement_count || 0));

  return {
    source: 'local-template-assimilation-suite-evaluator',
    version: 1,
    generatedAt: new Date().toISOString(),
    root,
    options,
    total: results.length,
    passCount: successful.length,
    failCount: results.length - successful.length,
    averageAudit,
    averageLaw,
    averageAesthetic,
    topTierReadyCount,
    excellentCount,
    topTierReadyPercent: Math.round((topTierReadyCount / Math.max(1, results.length)) * 100),
    excellentPercent: Math.round((excellentCount / Math.max(1, results.length)) * 100),
    autoRepairAppliedCount,
    totalAutoRepairGridPatches,
    totalAutoRepairPlacements,
    interiorDensityRepairAppliedCount,
    totalInteriorDensityGridPatches,
    totalInteriorDensityPlacements,
    trackSummary: summarizeTracks(results),
    gapCounts: summarizeGaps(results),
    directiveCounts: summarizeDirectives(results),
    focusSummary: summarizeFocus(results),
    repairSummary: {
      applied_count: autoRepairAppliedCount,
      grid_patch_count: totalAutoRepairGridPatches,
      placement_count: totalAutoRepairPlacements,
      average_grid_patches_when_active: autoRepairAppliedCount ? Math.round(totalAutoRepairGridPatches / autoRepairAppliedCount) : 0,
      average_placements_when_active: autoRepairAppliedCount ? Math.round(totalAutoRepairPlacements / autoRepairAppliedCount) : 0
    },
    interiorDensityRepairSummary: {
      applied_count: interiorDensityRepairAppliedCount,
      grid_patch_count: totalInteriorDensityGridPatches,
      placement_count: totalInteriorDensityPlacements,
      average_grid_patches_when_active: interiorDensityRepairAppliedCount ? Math.round(totalInteriorDensityGridPatches / interiorDensityRepairAppliedCount) : 0,
      average_placements_when_active: interiorDensityRepairAppliedCount ? Math.round(totalInteriorDensityPlacements / interiorDensityRepairAppliedCount) : 0
    },
    results: results.map(compactResult)
  };
}

function normalizeOptions(options = {}) {
  return {
    mode: options.mode || 'mock',
    mcVersion: options.mcVersion || '1.21',
    out: options.out,
    limit: clampInt(options.limit, 1, TEMPLATE_ASSIMILATION_PROMPTS.length, TEMPLATE_ASSIMILATION_PROMPTS.length),
    strict: Boolean(options.strict),
    minAudit: Number(options.minAudit ?? 88),
    minTopTierPercent: Number(options.minTopTierPercent ?? 45),
    cwd: options.cwd || projectRoot
  };
}

function parseArgs(argv) {
  const options = normalizeOptions({});
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      options.mode = argv[++index] || options.mode;
    } else if (arg === '--mc-version') {
      options.mcVersion = argv[++index] || options.mcVersion;
    } else if (arg === '--out') {
      options.out = argv[++index];
    } else if (arg === '--limit') {
      options.limit = clampInt(Number(argv[++index]), 1, TEMPLATE_ASSIMILATION_PROMPTS.length, options.limit);
    } else if (arg === '--min-audit') {
      options.minAudit = Number(argv[++index]) || options.minAudit;
    } else if (arg === '--min-top-tier-percent') {
      options.minTopTierPercent = Number(argv[++index]) || options.minTopTierPercent;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return options;
}

function compactResult(item = {}) {
  const audit = item.audit || {};
  const law = item.law || {};
  const aesthetic = item.aesthetic || {};
  const autoRepair = item.autoRepair || {};
  const interiorDensityRepair = item.interiorDensityRepair || {};
  return {
    id: item.id,
    focus: item.focus || [],
    seed: item.seed,
    ok: Boolean(item.ok),
    prompt: item.prompt,
    outputDir: item.outputDir,
    error: item.error,
    audit: {
      percent: audit.percent || 0,
      grade: audit.grade || 'not-applicable',
      readiness: audit.readiness || 'inactive',
      top_tier_distance: audit.top_tier_distance ?? 100,
      stage_progress: audit.stage_progress,
      gaps: audit.gaps || [],
      tracks: audit.tracks || [],
      directives: audit.next_iteration_directives || []
    },
    law: {
      percent: law.percent || 0,
      grade: law.grade || 'not-applicable',
      gaps: law.gaps || [],
      missing_count: law.missing_count || 0,
      partial_count: law.partial_count || 0
    },
    aesthetic: {
      score: aesthetic.score || aesthetic.percent || 0,
      grade: aesthetic.grade || 'not-applicable',
      gaps: aesthetic.gaps || []
    },
    autoRepair: {
      active: Boolean(autoRepair.active),
      reason: autoRepair.reason,
      applied_count: autoRepair.applied_count || 0,
      grid_patch_count: autoRepair.grid_patch_count || 0,
      placement_count: autoRepair.placement_count || 0
    },
    interiorDensityRepair: {
      active: Boolean(interiorDensityRepair.active),
      reason: interiorDensityRepair.reason,
      applied_count: interiorDensityRepair.applied_count || 0,
      grid_patch_count: interiorDensityRepair.grid_patch_count || 0,
      placement_count: interiorDensityRepair.placement_count || 0,
      before: interiorDensityRepair.before,
      after: interiorDensityRepair.after,
      targets: interiorDensityRepair.targets
    },
    warnings: item.validation?.warnings || []
  };
}

function summarizeTracks(results = []) {
  const tracks = {};
  for (const result of results) {
    for (const track of result.audit?.tracks || []) {
      tracks[track.id] ||= {
        id: track.id,
        label: track.label,
        count: 0,
        totalPercent: 0,
        minPercent: 100,
        weakCount: 0,
        missingCounts: {}
      };
      const row = tracks[track.id];
      row.count += 1;
      row.totalPercent += Number(track.percent || 0);
      row.minPercent = Math.min(row.minPercent, Number(track.percent || 0));
      if (Number(track.percent || 0) < 85) row.weakCount += 1;
      for (const missing of track.missing || []) {
        row.missingCounts[missing] = (row.missingCounts[missing] || 0) + 1;
      }
    }
  }
  return Object.values(tracks)
    .map((item) => ({
      ...item,
      averagePercent: Math.round(item.totalPercent / Math.max(1, item.count)),
      topMissing: Object.entries(item.missingCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([id, count]) => ({ id, count }))
    }))
    .sort((a, b) => a.averagePercent - b.averagePercent || b.weakCount - a.weakCount || a.id.localeCompare(b.id));
}

function summarizeGaps(results = []) {
  const counts = {};
  for (const result of results) {
    for (const gap of result.audit?.gaps || []) {
      counts[gap.id] ||= {
        id: gap.id,
        label: gap.label,
        severity: gap.severity,
        count: 0,
        totalPercent: 0,
        examples: []
      };
      counts[gap.id].count += 1;
      counts[gap.id].totalPercent += Number(gap.percent || 0);
      if (counts[gap.id].examples.length < 5) counts[gap.id].examples.push(result.id);
    }
  }
  return Object.values(counts)
    .map((item) => ({
      ...item,
      averagePercent: Math.round(item.totalPercent / Math.max(1, item.count))
    }))
    .sort((a, b) => b.count - a.count || severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id));
}

function summarizeDirectives(results = []) {
  const counts = {};
  for (const result of results) {
    for (const directive of result.audit?.next_iteration_directives || []) {
      counts[directive.id] ||= {
        id: directive.id,
        priority: directive.priority || 'medium',
        text: directive.text,
        count: 0,
        targets: new Set()
      };
      counts[directive.id].count += 1;
      for (const target of directive.targets || []) counts[directive.id].targets.add(target);
    }
  }
  return Object.values(counts)
    .map((item) => ({ ...item, targets: [...item.targets].sort() }))
    .sort((a, b) => b.count - a.count || severityRank(b.priority) - severityRank(a.priority) || a.id.localeCompare(b.id));
}

function summarizeFocus(results = []) {
  const counts = {};
  for (const result of results) {
    for (const focus of result.focus || []) {
      counts[focus] ||= { focus, count: 0, totalAudit: 0, weakCount: 0, examples: [] };
      counts[focus].count += 1;
      counts[focus].totalAudit += Number(result.audit?.percent || 0);
      if (Number(result.audit?.percent || 0) < 85) {
        counts[focus].weakCount += 1;
        if (counts[focus].examples.length < 5) counts[focus].examples.push(result.id);
      }
    }
  }
  return Object.values(counts)
    .map((item) => ({
      ...item,
      averageAudit: Math.round(item.totalAudit / Math.max(1, item.count))
    }))
    .sort((a, b) => a.averageAudit - b.averageAudit || b.weakCount - a.weakCount || a.focus.localeCompare(b.focus));
}

export function renderTemplateAssimilationMarkdown(summary = {}) {
  const resultRows = (summary.results || []).map((item, index) => resultRow(item, index)).join('\n');
  const trackRows = (summary.trackSummary || []).map((item) =>
    `| ${item.id} | ${item.averagePercent}% | ${item.minPercent}% | ${item.weakCount}/${item.count} | ${(item.topMissing || []).map((missing) => `${missing.id}(${missing.count})`).join(', ') || '-'} |`
  ).join('\n') || '| - | - | - | - | - |';
  const gapRows = (summary.gapCounts || []).length
    ? summary.gapCounts.map((item) => `| ${item.id} | ${item.severity} | ${item.count} | ${item.averagePercent}% | ${(item.examples || []).join(', ')} |`).join('\n')
    : '| - | - | 0 | 100% | 无 |';
  const directiveRows = (summary.directiveCounts || []).length
    ? summary.directiveCounts.map((item) => `| ${item.id} | ${item.priority} | ${item.count} | ${(item.targets || []).join(', ') || '-'} | ${item.text || '-'} |`).join('\n')
    : '| - | - | 0 | - | 无 |';
  const focusRows = (summary.focusSummary || []).slice(0, 30).map((item) =>
    `| ${item.focus} | ${item.count} | ${item.averageAudit}% | ${item.weakCount} | ${(item.examples || []).join(', ') || '-'} |`
  ).join('\n') || '| - | 0 | 100% | 0 | - |';

  return `# Stage 7H Template Assimilation Regression

## Summary

- Total prompts: ${summary.total}
- Successful generations: ${summary.passCount}
- Failed generations: ${summary.failCount}
- Average assimilation audit: ${summary.averageAudit}%
- Average template law coverage: ${summary.averageLaw}%
- Average template aesthetic score: ${summary.averageAesthetic}/100
- Top-tier ready: ${summary.topTierReadyCount}/${summary.total} (${summary.topTierReadyPercent}%)
- Excellent or better: ${summary.excellentCount}/${summary.total} (${summary.excellentPercent}%)
- Auto repair applied: ${summary.repairSummary?.applied_count || 0} prompts, ${summary.repairSummary?.grid_patch_count || 0} grid patches, ${summary.repairSummary?.placement_count || 0} placements
- Stage 7I interior density repair: ${summary.interiorDensityRepairSummary?.applied_count || 0} prompts, ${summary.interiorDensityRepairSummary?.grid_patch_count || 0} grid patches, ${summary.interiorDensityRepairSummary?.placement_count || 0} placements
- Mode: ${summary.options?.mode}
- Minecraft target: ${summary.options?.mcVersion}
- Output root: ${summary.root}

## Results

| # | Prompt ID | OK | Audit | Grade | Law | Aesthetic | Auto Repair | Interior Density | Top Gaps | Output |
|---:|---|---:|---:|---|---:|---:|---|---|---|---|
${resultRows}

## Track Summary

| Track | Avg | Min | Weak | Frequent Missing |
|---|---:|---:|---:|---|
${trackRows}

## Frequent Gaps

| Gap | Severity | Count | Avg | Examples |
|---|---|---:|---:|---|
${gapRows}

## Frequent Directives

| Directive | Priority | Count | Targets | Text |
|---|---|---:|---|---|
${directiveRows}

## Focus Tags With Lowest Audit

| Focus | Count | Avg Audit | Weak Count | Examples |
|---|---:|---:|---:|---|
${focusRows}
`;
}

function resultRow(item = {}, index) {
  const audit = item.audit || {};
  const law = item.law || {};
  const aesthetic = item.aesthetic || {};
  const repair = item.autoRepair || {};
  const interiorDensityRepair = item.interiorDensityRepair || {};
  const gaps = (audit.gaps || []).slice(0, 3).map((gap) => gap.id).join(', ') || '-';
  const repairText = repair.active
    ? `${repair.applied_count} / ${repair.grid_patch_count} blocks`
    : (repair.reason || '-');
  const densityText = interiorDensityRepair.active
    ? `${interiorDensityRepair.applied_count} / ${interiorDensityRepair.grid_patch_count} blocks`
    : (interiorDensityRepair.reason || '-');
  return `| ${index + 1} | ${item.id} | ${item.ok ? 'yes' : 'no'} | ${audit.percent || 0}% | ${audit.grade || 'n/a'} | ${law.percent || 0}% | ${aesthetic.score || 0} | ${repairText} | ${densityText} | ${gaps} | ${item.outputDir || '-'} |`;
}

function renderTemplateAssimilationCsv(summary = {}) {
  const headers = [
    'index',
    'id',
    'ok',
    'audit_percent',
    'audit_grade',
    'audit_readiness',
    'top_tier_distance',
    'law_percent',
    'aesthetic_score',
    'auto_repair_active',
    'auto_repair_grid_patches',
    'auto_repair_placements',
    'interior_density_repair_active',
    'interior_density_repair_grid_patches',
    'interior_density_repair_placements',
    'gap_ids',
    'focus',
    'prompt',
    'output_dir'
  ];
  const rows = (summary.results || []).map((item, index) => [
    index + 1,
    item.id,
    item.ok ? 'yes' : 'no',
    item.audit?.percent || 0,
    item.audit?.grade || 'n/a',
    item.audit?.readiness || 'n/a',
    item.audit?.top_tier_distance ?? 100,
    item.law?.percent || 0,
    item.aesthetic?.score || 0,
    item.autoRepair?.active ? 'yes' : 'no',
    item.autoRepair?.grid_patch_count || 0,
    item.autoRepair?.placement_count || 0,
    item.interiorDensityRepair?.active ? 'yes' : 'no',
    item.interiorDensityRepair?.grid_patch_count || 0,
    item.interiorDensityRepair?.placement_count || 0,
    (item.audit?.gaps || []).map((gap) => gap.id).join(';'),
    (item.focus || []).join(';'),
    item.prompt,
    item.outputDir || ''
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function renderConsoleTable(results = []) {
  const lines = [
    '| # | id | audit | law | aesthetic | repair | density | gaps |',
    '|---:|---|---:|---:|---:|---|---|---|'
  ];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    lines.push(`| ${index + 1} | ${item.id} | ${item.audit?.percent || 0}% | ${item.law?.percent || 0}% | ${item.aesthetic?.score || 0} | ${item.autoRepair?.active ? 'yes' : 'no'} | ${item.interiorDensityRepair?.active ? 'yes' : 'no'} | ${(item.audit?.gaps || []).slice(0, 2).map((gap) => gap.id).join(', ') || '-'} |`);
  }
  return lines.join('\n');
}

function failedAudit(error) {
  return {
    active: false,
    percent: 0,
    score: 0,
    grade: 'failed',
    readiness: 'failed',
    top_tier_distance: 100,
    gaps: [{ id: 'workflow-failed', severity: 'high', label: error.message, percent: 0 }],
    tracks: []
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function printHelp() {
  console.log(`Evaluate Stage 7H template assimilation generalization prompts.

Usage:
  node src/evaluateTemplateAssimilationSuite.js
  node src/evaluateTemplateAssimilationSuite.js --limit 6 --out out/template-assimilation-smoke
  node src/evaluateTemplateAssimilationSuite.js --strict --min-audit 88

Options:
  --mode mock|auto|llm             Generation mode. Defaults to mock for stable regression runs.
  --mc-version 1.21                Target Minecraft Java version.
  --out <dir>                      Evaluation output root.
  --limit <n>                      Run the first n prompts from the ${TEMPLATE_ASSIMILATION_PROMPTS.length} prompt suite.
  --min-audit <n>                  Strict-mode minimum average audit score. Defaults to 88.
  --min-top-tier-percent <n>       Strict-mode minimum top-tier ready percentage. Defaults to 45.
  --strict                         Exit non-zero if any generation fails or thresholds are missed.
`);
}

function severityRank(value) {
  return { high: 3, medium: 2, low: 1, maintain: 0 }[value] || 0;
}

function average(values) {
  return Math.round(mean(values));
}

function mean(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function roundTo(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));
  const summary = await runTemplateAssimilationSuite(options);
  const strictFailed = summary.failCount > 0 ||
    summary.averageAudit < options.minAudit ||
    summary.topTierReadyPercent < options.minTopTierPercent;
  if (options.strict && strictFailed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
