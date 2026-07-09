import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExplainableTemplateRetriever } from './construction/templates/templateExplainableRetriever.js';

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

  if (!prompt) {
    stderr.write('Usage: node src/queryTemplateKnowledge.js [--knowledge-base path] "prompt"\n');
    return 1;
  }

  let knowledgeBase;
  try {
    knowledgeBase = JSON.parse(await fs.readFile(kbFile, 'utf8'));
  } catch (error) {
    stderr.write(`Could not read knowledge base: ${kbFile}\n${error.message}\n`);
    return 1;
  }

  const result = new ExplainableTemplateRetriever({ knowledgeBase }).run({
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
