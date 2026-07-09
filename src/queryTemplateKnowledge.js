import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExplainableTemplateRetriever } from './construction/templates/templateExplainableRetriever.js';
import { NeuralTemplateRetriever } from './construction/templates/templateNeuralRetriever.js';
import { parseGeneratedLabelsJsonl } from './construction/templates/templateNeuralLabels.js';

const __filename = fileURLToPath(import.meta.url);

export async function queryTemplateKnowledge({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const args = parseArgs(argv);
  const prompt = args._.join(' ').trim();
  const kbFile = path.resolve(cwd, args['knowledge-base'] || path.join('mc_templates', 'analysis', 'case_library.v2.json'));
  const neuralEnabled = args.neural === 'true' && args['no-neural'] !== 'true';
  const embeddingIndexFile = path.resolve(cwd, args['embedding-index'] || path.join('mc_templates', 'analysis', 'embedding_index.json'));

  if (!prompt) {
    stderr.write('Usage: node src/queryTemplateKnowledge.js [--neural] [--knowledge-base path] [--embedding-index path] "prompt"\n');
    return 1;
  }

  let knowledgeBase;
  try {
    knowledgeBase = JSON.parse(await fs.readFile(kbFile, 'utf8'));
  } catch (error) {
    stderr.write(`Could not read knowledge base: ${kbFile}\n${error.message}\n`);
    return 1;
  }

  let embeddingIndex;
  let neuralLabels = [];
  if (neuralEnabled) {
    try {
      embeddingIndex = JSON.parse(await fs.readFile(embeddingIndexFile, 'utf8'));
      const neuralLabelsFile = path.join(path.dirname(embeddingIndexFile), 'neural_labels.jsonl');
      try {
        const parsed = parseGeneratedLabelsJsonl(await fs.readFile(neuralLabelsFile, 'utf8'));
        neuralLabels = parsed.records;
      } catch {
        neuralLabels = [];
      }
    } catch {
      embeddingIndex = undefined;
    }
  }

  const retriever = neuralEnabled
    ? new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex, neuralLabels })
    : new ExplainableTemplateRetriever({ knowledgeBase });
  const result = retriever.run({
    prompt,
    context: { style_family: args.style || '', typology: args.typology || '' },
    limit: args.limit ? Number(args.limit) : 8
  });

  stdout.write(renderResult(result));
  return result.active ? 0 : 1;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        index += 1;
      } else {
        result[key] = 'true';
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function renderResult(result) {
  const lines = ['# Template references', ''];
  lines.push(`mode: ${result.mode || 'rule-only'}`);
  if (result.fallback_used) lines.push('fallback: true');
  lines.push('');
  for (const ref of result.references || []) {
    lines.push(`${ref.rank}. ${ref.title} (${ref.case_id}) score=${ref.match_score}`);
    lines.push(`   teaches: ${ref.teaches.map((item) => `${item.area}: ${item.claim}`).join(' | ')}`);
    lines.push(`   risks: ${ref.risk_controls.join(' | ')}`);
  }
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const exitCode = await queryTemplateKnowledge();
  process.exitCode = exitCode;
}
