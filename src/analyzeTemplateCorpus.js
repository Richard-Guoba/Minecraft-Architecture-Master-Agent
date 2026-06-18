import path from 'node:path';
import { analyzeTemplateCorpus } from './construction/templates/schematicAnalyzer.js';

const args = parseArgs(process.argv.slice(2));
const rootDir = args.root || args.templates || 'mc_templates';
const outputDir = args.out || path.join(rootDir, 'analysis');
const fetchPages = args.fetch !== 'false' && args.offline !== 'true';
const maxPageFetches = args.maxFetches === undefined ? Infinity : Number(args.maxFetches);

const result = await analyzeTemplateCorpus({
  rootDir,
  outputDir,
  fetchPages,
  maxPageFetches: Number.isFinite(maxPageFetches) ? maxPageFetches : Infinity,
  cwd: process.cwd()
});

console.log(`Analyzed ${result.corpus.template_count} templates.`);
console.log(`Fetched ${result.fetchedPages} source pages.`);
console.log(`Wrote analysis to ${result.outputDir}.`);
console.log(`Terrain-integrated: ${result.corpus.terrain.integrated_count}.`);
console.log(`Garden/scene: ${result.corpus.gardens.garden_count}.`);

function parseArgs(argv) {
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
