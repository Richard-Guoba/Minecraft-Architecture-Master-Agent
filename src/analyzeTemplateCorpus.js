import path from 'node:path';
import { analyzeTemplateCorpus } from './construction/templates/schematicAnalyzer.js';

const args = parseArgs(process.argv.slice(2));
const rootDir = args.root || args.templates || 'mc_templates';
const outputDir = args.out || path.join(rootDir, 'analysis');
const fetchPages = args.fetch !== 'false' && args.offline !== 'true';
const maxPageFetches = args.maxFetches === undefined ? Infinity : Number(args.maxFetches);
const continueOnError = args.strict !== 'true';

const result = await analyzeTemplateCorpus({
  rootDir,
  outputDir,
  fetchPages,
  maxPageFetches: Number.isFinite(maxPageFetches) ? maxPageFetches : Infinity,
  continueOnError,
  cwd: process.cwd()
});

console.log(`Analyzed ${result.corpus.template_count} templates.`);
console.log(`Import errors ${result.importErrors.length}.`);
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
console.log(`Stage 7 cases: ${result.caseLibrary.summary.case_count}.`);
console.log(`Stage 7 semantic clauses: ${result.caseLibrary.semantic_clause_count}.`);
console.log(`Stage 7 retrieval tokens: ${result.caseLibrary.summary.retrieval_token_count}.`);
console.log(`Stage 7C design laws: ${result.designLawBook.summary.law_count}.`);
console.log(`Stage 7C interior laws: ${result.designLawBook.summary.interior_law_count}.`);
console.log(`Stage 7 case library: ${path.join(result.outputDir, 'case_library.json')}.`);
console.log(`Stage 7 retrieval index: ${path.join(result.outputDir, 'retrieval_index.json')}.`);
console.log(`Stage 7 clauses: ${path.join(result.outputDir, 'semantic_clauses.jsonl')}.`);
console.log(`Stage 7 report: ${path.join(result.outputDir, 'case_library.md')}.`);
console.log(`Stage 7C design laws: ${path.join(result.outputDir, 'design_laws.json')}.`);
console.log(`Stage 7C interior laws: ${path.join(result.outputDir, 'interior_laws.jsonl')}.`);
if (result.knowledgeBaseV2?.summary) {
  console.log(`Stage 2 KB v2 cases: ${result.knowledgeBaseV2.summary.case_count}.`);
  console.log(`Stage 2 KB v2 review statuses: ${JSON.stringify(result.knowledgeBaseV2.summary.review_status_counts || {})}.`);
  console.log(`Stage 2 KB v2 case library: ${result.knowledgeBaseV2.artifacts.knowledgeBase}.`);
  console.log(`Stage 2 KB v2 retrieval index: ${result.knowledgeBaseV2.artifacts.retrievalIndex}.`);
  console.log(`Stage 2 KB v2 review queue: ${result.knowledgeBaseV2.artifacts.reviewQueue}.`);
  for (const error of result.knowledgeBaseV2.overlayErrors || []) {
    console.log(`Stage 2 KB v2 overlay error line ${error.line}: ${error.message}`);
  }
}
if (result.stage5?.summary) {
  console.log(`Stage 5 neural labels: ${result.stage5.summary.neural_label_count}.`);
  console.log(`Stage 5 embedding cases: ${result.stage5.summary.embedding_case_count}.`);
  console.log(`Stage 5 embedding model: ${result.stage5.summary.embedding_model.provider}/${result.stage5.summary.embedding_model.model}.`);
  console.log(`Stage 5 neural labels file: ${result.stage5.artifacts.neuralLabels}.`);
  console.log(`Stage 5 embedding index: ${result.stage5.artifacts.embeddingIndex}.`);
}

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
