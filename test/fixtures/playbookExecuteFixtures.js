import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableJson } from '../../src/playbook/shadow/canonical.js';

export const OFF_COMPAT_PROMPT = '建造一座两层中世纪民居，三体块、深色坡屋顶、木框架与石质基座';
export const OFF_COMPAT_SEED = 424242;

const ARTIFACT_KEYS = [
  'blueprint', 'buildFunction', 'clearFunction', 'runFunction', 'rawBuild',
  'previewHtml', 'report', 'architectureScorecard', 'candidateSelection',
  'candidateSelectionReport'
];

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function normalizeOffCompatibility(value, { outRoot, runDir }) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOffCompatibility(item, { outRoot, runDir }));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      normalizeOffCompatibility(item, { outRoot, runDir })
    ]));
  }
  if (typeof value !== 'string') return value;
  return value
    .split(path.resolve(runDir)).join('<RUN>')
    .split(path.resolve(outRoot)).join('<ROOT>')
    .replaceAll('\\', '/');
}

export async function captureOffCompatibility(result, { outRoot, runDir }) {
  const artifact_hashes = {};
  for (const key of ARTIFACT_KEYS.filter((name) => result.artifacts[name])) {
    const filePath = result.artifacts[key];
    const raw = await fs.readFile(filePath);
    const normalized = path.extname(filePath) === '.json'
      ? stableJson(normalizeOffCompatibility(JSON.parse(raw.toString('utf8')), { outRoot, runDir }))
      : normalizeOffCompatibility(raw.toString('utf8'), { outRoot, runDir });
    artifact_hashes[key] = digest(Buffer.from(normalized));
  }
  const summary = normalizeOffCompatibility({
    workflow: result.workflow,
    runtime: result.runtime,
    seed: result.seed,
    seedSource: result.seedSource,
    llmProvider: result.llmProvider,
    llmUsage: result.llmUsage,
    validationOk: result.validation?.ok,
    candidateSelection: result.candidateSelection ? {
      candidate_count: result.candidateSelection.candidate_count,
      successful_count: result.candidateSelection.successful_count,
      selected_candidate_id: result.candidateSelection.selected_candidate_id,
      selected_seed: result.candidateSelection.selected_seed,
      ranking: result.candidateSelection.ranking.map((row) => ({
        rank: row.rank,
        candidate_id: row.candidate_id,
        seed: row.seed,
        selection_score: row.selection_score
      }))
    } : undefined
  }, { outRoot, runDir });
  return { summary_sha256: digest(Buffer.from(stableJson(summary))), artifact_hashes };
}
