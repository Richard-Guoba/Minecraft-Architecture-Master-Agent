import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateEmbeddingIndex } from './construction/templates/templateEmbeddingIndex.js';
import { ExplainableTemplateRetriever } from './construction/templates/templateExplainableRetriever.js';
import { parseGeneratedLabelsJsonl } from './construction/templates/templateNeuralLabels.js';
import { NeuralTemplateRetriever } from './construction/templates/templateNeuralRetriever.js';

const __filename = fileURLToPath(import.meta.url);

export const DEFAULT_RETRIEVAL_EVAL_SET = {
  source: 'stage5-retrieval-eval-set-v1',
  schema_version: 1,
  prompts: [
    { id: 'modern-lakeside-villa', prompt: 'build a lakeside modern two-floor villa with large glass, a water deck, roof terrace, and refined interior', expected: { typology: ['house'], style: ['modern', 'coastal'], site: ['water-edge', 'garden'], facade: ['large-glass'], interior: ['furnished', 'room-layout-rich'] }, avoid: { typology: ['arena'], risk_flags: ['arena-not-for-room-mining'] } },
    { id: 'japanese-tea-house', prompt: 'build a quiet Japanese tea house with deep eaves, wood lattice, water garden, and calm circulation', expected: { typology: ['house', 'temple'], style: ['japanese'], site: ['garden', 'water-edge'], roof: ['layered-eaves', 'deep-overhang'] }, avoid: { typology: ['arena'] } },
    { id: 'medieval-tavern', prompt: 'build a medieval tavern house with cozy inhabited interior, kitchen, storage, and social seating', expected: { typology: ['house'], style: ['medieval', 'rustic'], interior: ['furnished', 'furniture-pattern-rich'] }, avoid: { typology: ['arena'] } },
    { id: 'gothic-castle', prompt: 'build a gothic castle with a vertical landmark, public approach, formal entry, and layered stone facade', expected: { typology: ['castle'], style: ['gothic', 'medieval'], massing: ['vertical-landmark'], facade: ['formal-symmetry'] }, avoid: { typology: ['arena'] } },
    { id: 'classical-temple-axis', prompt: 'build a classical temple with formal axis, balanced massing, steps, and ceremonial hall', expected: { typology: ['temple'], style: ['classical'], massing: ['balanced-axis'], room_types: ['chapel-or-ceremonial-hall'] }, avoid: { typology: ['arena'] } },
    { id: 'rustic-survival-house', prompt: 'build a compact rustic survival house with storage, warm interior, garden beds, and pitched roof', expected: { typology: ['house'], style: ['rustic', 'medieval'], interior: ['furnished'], site: ['garden'], roof: ['pitched-roof'] }, avoid: { typology: ['arena'] } },
    { id: 'public-library-study', prompt: 'build a public library with study rooms, bookshelves, vertical circulation, and detailed facade', expected: { typology: ['public-building'], interior: ['study-library', 'vertical-circulation'], facade: ['micro-depth-trim'] }, avoid: { typology: ['arena'] } },
    { id: 'tower-plaza', prompt: 'build a tower landmark with a small plaza, vertical silhouette, and clear approach sequence', expected: { typology: ['tower'], massing: ['vertical-landmark'], site: ['urban', 'garden'] }, avoid: { typology: ['arena'] } },
    { id: 'waterfront-hotel', prompt: 'build a waterfront hotel with glass facade, terraces, public lobby, and water edge arrival', expected: { typology: ['public-building'], style: ['modern', 'coastal'], site: ['water-edge'], facade: ['large-glass'], roof: ['flat-terrace'] }, avoid: { typology: ['arena'] } },
    { id: 'fantasy-terrain-retreat', prompt: 'build a fantasy terrain-integrated retreat with layered rock base, garden forecourt, and stepped terraces', expected: { style: ['fantasy'], site: ['terrain-integrated', 'garden'], massing: ['stepped-terraces'] }, avoid: { typology: ['arena'] } }
  ]
};

export function evaluateTemplateRetrieval({ knowledgeBase = {}, embeddingIndex, neuralLabels, evalSet = DEFAULT_RETRIEVAL_EVAL_SET } = {}) {
  const effectiveEmbeddingIndex = embeddingIndex || buildTemplateEmbeddingIndex({ knowledgeBase, neuralLabels });
  const ruleRetriever = new ExplainableTemplateRetriever({ knowledgeBase });
  const neuralRetriever = new NeuralTemplateRetriever({
    knowledgeBase,
    embeddingIndex: effectiveEmbeddingIndex,
    neuralLabels
  });

  const prompts = (evalSet.prompts || []).map((item) => {
    const context = inferContext(item);
    const rule = ruleRetriever.run({ prompt: item.prompt, context, limit: 8 });
    const fusion = neuralRetriever.run({ prompt: item.prompt, context, limit: 8 });

    return {
      id: item.id,
      prompt: item.prompt,
      expected: item.expected || {},
      avoid: item.avoid || {},
      rule_top: summarizeRefs(rule.references),
      fusion_top: summarizeRefs(fusion.references),
      rule_hit_count: countHits(rule.references, item.expected),
      fusion_hit_count: countHits(fusion.references, item.expected),
      unsafe_rule_count: countUnsafe(rule.references, item.avoid),
      unsafe_fusion_count: countUnsafe(fusion.references, item.avoid),
      fusion_mode: fusion.mode || 'fusion',
      warnings: [...new Set([...(rule.warnings || []), ...(fusion.warnings || [])])]
    };
  });

  return {
    source: 'stage5-template-retrieval-eval-v1',
    generated_at: effectiveEmbeddingIndex.generated_at || new Date().toISOString(),
    prompt_count: prompts.length,
    prompts
  };
}

export function renderRetrievalEvalReport(result = {}) {
  const lines = [
    '# Stage 5 Retrieval Evaluation',
    '',
    `Generated: ${result.generated_at || ''}`,
    `Prompts: ${result.prompt_count || 0}`,
    '',
    '| Prompt | Rule hits | Fusion hits | Rule unsafe | Fusion unsafe | Mode |',
    '| --- | ---: | ---: | ---: | ---: | --- |'
  ];

  for (const item of result.prompts || []) {
    lines.push(`| ${item.id} | ${item.rule_hit_count} | ${item.fusion_hit_count} | ${item.unsafe_rule_count} | ${item.unsafe_fusion_count} | ${item.fusion_mode} |`);
  }

  for (const item of result.prompts || []) {
    lines.push('', `## ${item.id}`, '', item.prompt, '', `Rule top: ${formatRefs(item.rule_top)}`, '', `Fusion top: ${formatRefs(item.fusion_top)}`);
    if ((item.warnings || []).length) lines.push('', `Warnings: ${(item.warnings || []).join('; ')}`);
  }

  return `${lines.join('\n')}\n`;
}

export async function writeRetrievalEvalArtifacts({ outputDir, knowledgeBase = {}, embeddingIndex, neuralLabels, evalSet = DEFAULT_RETRIEVAL_EVAL_SET, outFile } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const result = evaluateTemplateRetrieval({ knowledgeBase, embeddingIndex, neuralLabels, evalSet });
  const evalSetFile = path.join(outputDir, 'retrieval_eval_set.json');
  const reportFile = outFile || path.join(outputDir, 'retrieval_eval_report.md');
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(evalSetFile, `${JSON.stringify(evalSet, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportFile, renderRetrievalEvalReport(result), 'utf8');
  return { result, evalSetFile, reportFile };
}

async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  const kbFile = path.resolve(cwd, args['knowledge-base'] || path.join('mc_templates', 'analysis', 'case_library.v2.json'));
  const indexFile = path.resolve(cwd, args['embedding-index'] || path.join('mc_templates', 'analysis', 'embedding_index.json'));
  const outFile = path.resolve(cwd, args.out || path.join('mc_templates', 'analysis', 'retrieval_eval_report.md'));

  const knowledgeBase = JSON.parse(await fs.readFile(kbFile, 'utf8'));
  let embeddingIndex;
  try {
    embeddingIndex = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  } catch {
    embeddingIndex = undefined;
  }
  const neuralLabels = await readNeuralLabels(path.join(path.dirname(indexFile), 'neural_labels.jsonl'));
  const outputDir = path.dirname(outFile);
  const result = await writeRetrievalEvalArtifacts({ outputDir, knowledgeBase, embeddingIndex, neuralLabels, outFile });

  console.log(`Retrieval evaluation wrote ${result.reportFile}.`);
  console.log(`Retrieval eval set wrote ${result.evalSetFile}.`);
  return 0;
}

function summarizeRefs(refs = []) {
  return refs.slice(0, 5).map((ref) => ({
    rank: ref.rank,
    case_id: ref.case_id,
    title: ref.title,
    match_score: ref.match_score,
    matched_signals: ref.matched_signals || [],
    teaches: ref.teaches || [],
    risk_controls: ref.risk_controls || []
  }));
}

function countHits(refs = [], expected = {}) {
  const expectedTokens = flattenTokens(expected);
  let count = 0;
  for (const ref of refs || []) {
    const text = JSON.stringify(ref).toLowerCase();
    for (const token of expectedTokens) {
      if (token && text.includes(token)) count += 1;
    }
  }
  return count;
}

function countUnsafe(refs = [], avoid = {}) {
  const avoidTokens = flattenTokens(avoid);
  let count = 0;
  for (const ref of refs || []) {
    const text = JSON.stringify(ref).toLowerCase();
    for (const token of avoidTokens) {
      if (token && text.includes(token)) count += 1;
    }
  }
  return count;
}

function inferContext(item = {}) {
  return {
    style_family: item.expected?.style?.[0] || '',
    typology: item.expected?.typology?.[0] || ''
  };
}

function formatRefs(refs = []) {
  return refs.length
    ? refs.map((ref) => `${ref.rank}. ${ref.title}`).join(', ')
    : 'none';
}

function flattenTokens(value = {}) {
  return Object.values(value)
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .map((item) => String(item || '').toLowerCase())
    .filter(Boolean);
}

function parseArgs(argv = []) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

async function readNeuralLabels(file) {
  try {
    const parsed = parseGeneratedLabelsJsonl(await fs.readFile(file, 'utf8'));
    return parsed.records;
  } catch {
    return undefined;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
