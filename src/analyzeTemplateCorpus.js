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
console.log(`Case index room-mining ready: ${result.caseIndex.summary.phase1_completion.room_mining_ready}.`);
console.log(`Case index site-learning ready: ${result.caseIndex.summary.phase1_completion.site_learning_ready}.`);
console.log(`Case index manual-review flags: ${result.caseIndex.summary.phase1_completion.needs_manual_review}.`);
console.log(`Spatial scans analyzed: ${result.caseIndex.summary.phase2_completion.spatial_analyzed}.`);
console.log(`Spatial room components: ${result.caseIndex.summary.phase2_completion.total_room_components} total, ${result.caseIndex.summary.phase2_completion.high_confidence_room_components} high-confidence.`);
console.log(`Spatial room adjacencies: ${result.caseIndex.summary.phase2_completion.total_room_adjacencies}.`);
console.log(`Spatial pattern-mining ready: ${result.caseIndex.summary.phase2_completion.pattern_mining_ready}.`);
console.log(`Furniture groups mined: ${result.caseIndex.summary.phase3_completion.total_furniture_groups} total, ${result.caseIndex.summary.phase3_completion.high_confidence_furniture_groups} high-confidence.`);
console.log(`Furniture pattern ready: ${result.caseIndex.summary.phase3_completion.furniture_pattern_ready}.`);
console.log(`Composition grammar analyzed: ${result.caseIndex.summary.phase5_completion.composition_analyzed}.`);
console.log(`Composition grammar ready: ${result.caseIndex.summary.phase5_completion.composition_ready} total, ${result.caseIndex.summary.phase5_completion.high_composition_ready} high-confidence.`);

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
