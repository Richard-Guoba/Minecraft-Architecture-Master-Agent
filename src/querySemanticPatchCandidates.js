import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterSemanticPatchTrainingCandidates } from './construction/templates/templateSemanticPatchDataset.js';

const __filename = fileURLToPath(import.meta.url);
const QUERY_SOURCE = 'stage6-semantic-patch-candidate-query-v1';

export async function querySemanticPatchCandidates({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const args = parseArgs(argv);
  if (args.help === 'true') {
    stdout.write(usageText());
    return 0;
  }

  const datasetFile = path.resolve(cwd, args.dataset || path.join('mc_templates', 'analysis', 'semantic_patch_dataset.json'));
  let dataset;
  try {
    dataset = JSON.parse(await fs.readFile(datasetFile, 'utf8'));
  } catch (error) {
    stderr.write(`Could not read semantic patch dataset: ${datasetFile}\n${error.message}\n`);
    return 1;
  }

  const filters = {
    category: args.category || '',
    band: args.band || '',
    risk: args.risk || '',
    minScore: args['min-score'] || '',
    limit: args.limit ? Number(args.limit) : 10
  };
  const candidates = filterSemanticPatchTrainingCandidates(dataset, filters);

  if (args.json === 'true') {
    stdout.write(`${JSON.stringify({
      source: QUERY_SOURCE,
      dataset: datasetFile,
      filters,
      result_count: candidates.length,
      candidates
    }, null, 2)}\n`);
  } else {
    stdout.write(renderCandidateTable({ datasetFile, filters, candidates }));
  }
  return 0;
}

function parseArgs(argv = []) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      result[key] = 'true';
      continue;
    }
    const next = argv[index + 1];
    if (VALUE_FLAGS.has(key) && next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = VALUE_FLAGS.has(key) ? '' : 'true';
    }
  }
  return result;
}

const BOOLEAN_FLAGS = new Set(['json', 'help']);
const VALUE_FLAGS = new Set(['dataset', 'category', 'band', 'risk', 'min-score', 'limit']);

function renderCandidateTable({ datasetFile, filters, candidates }) {
  const lines = [
    '# Stage 6 semantic patch training candidates',
    '',
    `dataset: ${datasetFile}`,
    `filters: ${renderFilters(filters)}`,
    ''
  ];
  if (!candidates.length) {
    lines.push('No candidates matched.');
    return `${lines.join('\n')}\n`;
  }
  for (const [index, candidate] of candidates.entries()) {
    lines.push(`${index + 1}. ${candidate.patch_id} score=${candidate.score} band=${candidate.band} category=${candidate.category}`);
    if (candidate.title) lines.push(`   title: ${candidate.title}`);
    if (candidate.tags.length) lines.push(`   tags: ${candidate.tags.slice(0, 8).join(', ')}`);
    if (candidate.reasons.length) lines.push(`   reasons: ${candidate.reasons.join('; ')}`);
    if (candidate.penalties.length) lines.push(`   penalties: ${candidate.penalties.join('; ')}`);
    if (candidate.risk_controls.length) lines.push(`   risks: ${candidate.risk_controls.slice(0, 2).join(' | ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderFilters(filters = {}) {
  const parts = [];
  if (filters.category) parts.push(`category=${filters.category}`);
  if (filters.band) parts.push(`band=${filters.band}`);
  if (filters.risk) parts.push(`risk=${filters.risk}`);
  if (filters.minScore) parts.push(`min-score=${filters.minScore}`);
  parts.push(`limit=${filters.limit}`);
  return parts.join(' ');
}

function usageText() {
  return [
    'Usage: node src/querySemanticPatchCandidates.js [--dataset path] [--category roof|facade|interior|courtyard] [--band high|medium|low] [--risk text] [--min-score number] [--limit n] [--json]',
    '',
    'Reads a Stage 6 semantic_patch_dataset.json file and prints ranked training candidates without mutating generation output.',
    ''
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const exitCode = await querySemanticPatchCandidates();
  process.exitCode = exitCode;
}
