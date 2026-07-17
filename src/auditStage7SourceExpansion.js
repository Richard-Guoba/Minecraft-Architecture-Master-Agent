import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertFormalDatasetBoundary } from './construction/learning/stage7PrivateResearchBoundary.js';
import {
  validateDiscoveryRecord,
  validateIsoDate,
  validateReviewDecision,
  validateRightsRecord
} from './construction/learning/stage7SourceExpansionContracts.js';
import {
  SOURCE_EXPANSION_DIRECTORIES,
  SOURCE_EXPANSION_ROOT_RELATIVE,
  SourceExpansionBoundaryError,
  assertExactInventory,
  assertSourceExpansionRoot,
  readSourceExpansionJson,
  readSourceExpansionJsonl,
  writeFreshReportDirectory
} from './construction/learning/stage7SourceExpansionBoundary.js';
import { rankRightsVerifiedCandidates } from './construction/learning/stage7SourceExpansionRanking.js';
import {
  buildFinalReviewSummary,
  canonicalSourceExpansionJson,
  renderFinalReviewSummaryMarkdown,
  renderSourceExpansionCardsMarkdown,
  selectDiscoveryWave,
  selectYieldWave
} from './construction/learning/stage7SourceExpansionReview.js';
import {
  evaluateRightsLedger,
  latestUniqueRevision
} from './construction/learning/stage7SourceExpansionRights.js';

const COMMANDS = Object.freeze(['init', 'discovery', 'yield', 'finalize']);
const DISCOVERY_INVENTORY = Object.freeze([
  'rights-and-ranking.json',
  'review-cards.json',
  'review-cards.md'
]);
const YIELD_INVENTORY = Object.freeze([
  'review-cards.json',
  'review-cards.md',
  'source-summary.json'
]);

export function parseStage7SourceExpansionArgs(argv = []) {
  const [command, ...rest] = argv;
  for (const flag of ['--root', '--as-of', '--metadata-only', '--help']) {
    const count = rest.filter((item) => item === flag || item.startsWith(`${flag}=`)).length;
    if (count > 1) {
      throw new SourceExpansionBoundaryError('CLI_OPTION_DUPLICATE', flag);
    }
  }
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        root: { type: 'string' },
        'as-of': { type: 'string' },
        'metadata-only': { type: 'boolean' },
        help: { type: 'boolean' }
      },
      strict: true
    }));
  } catch (error) {
    throw new SourceExpansionBoundaryError('CLI_USAGE', error.message);
  }
  if (values.help) return Object.freeze({ help: true });
  if (!COMMANDS.includes(command)) {
    throw new SourceExpansionBoundaryError('CLI_COMMAND_INVALID', command || 'missing');
  }
  if (values.root !== SOURCE_EXPANSION_ROOT_RELATIVE) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', values.root || 'missing');
  }
  if (command === 'init' && (
    values['as-of'] !== undefined || values['metadata-only'] !== undefined
  )) {
    throw new SourceExpansionBoundaryError('CLI_USAGE', 'init accepts only --root');
  }
  if (command !== 'init' && values['metadata-only'] !== true) {
    throw new SourceExpansionBoundaryError('METADATA_ONLY_REQUIRED', command);
  }
  if (command !== 'init') validateIsoDate(values['as-of'], '--as-of');
  return Object.freeze({
    command,
    root: values.root,
    asOf: values['as-of'] || null,
    metadataOnly: values['metadata-only'] === true,
    help: false
  });
}

export async function runStage7SourceExpansionCli(argv = process.argv.slice(2), context = {}) {
  const options = parseStage7SourceExpansionArgs(argv);
  if (options.help) return Object.freeze({ help: helpText() });
  const repositoryRoot = path.resolve(context.repositoryRoot || process.cwd());
  const root = path.resolve(repositoryRoot, options.root);
  const assertDataset = context.assertDatasetBoundary || assertFormalDatasetBoundary;
  await assertDataset(repositoryRoot);

  let result;
  if (options.command === 'init') {
    result = await initializeRoot({
      root,
      repositoryRoot,
      gitStatus: context.gitStatus
    });
  } else {
    await assertSourceExpansionRoot(root, {
      repositoryRoot,
      gitStatus: context.gitStatus
    });
    result = options.command === 'discovery'
      ? await runDiscovery({ root, asOf: options.asOf })
      : options.command === 'yield'
        ? await runYield({ root, asOf: options.asOf })
        : await runFinalize({ root, asOf: options.asOf });
  }

  await assertDataset(repositoryRoot);
  return result;
}

export function helpText() {
  return 'Usage: npm run audit:stage7:sources -- <init|discovery|yield|finalize> --root .local/stage7-source-expansion [--as-of YYYY-MM-DD] [--metadata-only]\n';
}

async function initializeRoot({ root, repositoryRoot, gitStatus }) {
  try {
    await fs.lstat(root);
    throw new SourceExpansionBoundaryError('ROOT_EXISTS', root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(root), { recursive: true });
  await fs.mkdir(root);
  try {
    for (const directory of SOURCE_EXPANSION_DIRECTORIES) {
      await fs.mkdir(path.join(root, directory));
    }
    await assertSourceExpansionRoot(root, { repositoryRoot, gitStatus });
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({
    command: 'init',
    root: SOURCE_EXPANSION_ROOT_RELATIVE,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false
  });
}

async function loadCurrentAudit(root, asOf) {
  const candidates = await readSourceExpansionJsonl(
    root,
    'metadata/candidates.jsonl',
    validateDiscoveryRecord
  );
  const rightsRecords = await readSourceExpansionJsonl(
    root,
    'evidence/rights.jsonl',
    validateRightsRecord
  );
  const rightsResults = evaluateRightsLedger({ candidates, rightsRecords, asOf });
  const ranking = rankRightsVerifiedCandidates({ candidates, rightsResults });
  const rightsByCandidate = new Map(candidates.map((candidate) => [
    candidate.candidate_id,
    latestUniqueRevision(rightsRecords, candidate.candidate_id)
  ]));
  return { candidates, rightsRecords, rightsResults, ranking, rightsByCandidate };
}

async function runDiscovery({ root, asOf }) {
  const audit = await loadCurrentAudit(root, asOf);
  const cards = selectDiscoveryWave(audit.ranking);
  const rightsAndRanking = reportEnvelope({
    as_of: asOf,
    rights: audit.rightsResults,
    ranking: audit.ranking
  });
  const cardReport = reportEnvelope({
    as_of: asOf,
    wave: 'discovery',
    card_count: cards.length,
    cards
  });
  await writeFreshReportDirectory(root, 'discovery', {
    'rights-and-ranking.json': canonicalSourceExpansionJson(rightsAndRanking),
    'review-cards.json': canonicalSourceExpansionJson(cardReport),
    'review-cards.md': renderSourceExpansionCardsMarkdown({
      wave: 'discovery',
      cards,
      rightsByCandidate: audit.rightsByCandidate
    })
  });
  return Object.freeze({
    command: 'discovery',
    card_count: cards.length,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false
  });
}

async function runYield({ root, asOf }) {
  await assertExactInventory(root, 'reports/discovery', DISCOVERY_INVENTORY);
  const audit = await loadCurrentAudit(root, asOf);
  const discovery = selectDiscoveryWave(audit.ranking);
  const savedDiscovery = await readSourceExpansionJson(
    root,
    'reports/discovery/review-cards.json'
  );
  assertSameCardIds(savedDiscovery, discovery, 'discovery');
  const discoveryDecisions = await readSourceExpansionJsonl(
    root,
    'reviews/discovery-decisions.jsonl',
    validateReviewDecision
  );
  const cards = selectYieldWave({
    ranked: audit.ranking,
    discoveryCards: discovery,
    discoveryDecisions
  });
  const cardReport = reportEnvelope({
    as_of: asOf,
    wave: 'yield',
    card_count: cards.length,
    cards
  });
  const sourceSummary = reportEnvelope({
    as_of: asOf,
    wave: 'yield',
    source_ids: [...new Set(cards.map((card) => card.source_id))].sort()
  });
  await writeFreshReportDirectory(root, 'yield', {
    'review-cards.json': canonicalSourceExpansionJson(cardReport),
    'review-cards.md': renderSourceExpansionCardsMarkdown({
      wave: 'yield',
      cards,
      rightsByCandidate: audit.rightsByCandidate
    }),
    'source-summary.json': canonicalSourceExpansionJson(sourceSummary)
  });
  return Object.freeze({
    command: 'yield',
    card_count: cards.length,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false
  });
}

async function runFinalize({ root, asOf }) {
  await assertExactInventory(root, 'reports/discovery', DISCOVERY_INVENTORY);
  await assertExactInventory(root, 'reports/yield', YIELD_INVENTORY);
  const audit = await loadCurrentAudit(root, asOf);
  const discoveryDecisions = await readSourceExpansionJsonl(
    root,
    'reviews/discovery-decisions.jsonl',
    validateReviewDecision
  );
  const yieldDecisions = await readSourceExpansionJsonl(
    root,
    'reviews/yield-decisions.jsonl',
    validateReviewDecision
  );
  const discovery = selectDiscoveryWave(audit.ranking);
  const yieldCards = selectYieldWave({
    ranked: audit.ranking,
    discoveryCards: discovery,
    discoveryDecisions
  });
  assertSameCardIds(
    await readSourceExpansionJson(root, 'reports/discovery/review-cards.json'),
    discovery,
    'discovery'
  );
  assertSameCardIds(
    await readSourceExpansionJson(root, 'reports/yield/review-cards.json'),
    yieldCards,
    'yield'
  );
  const summary = buildFinalReviewSummary({
    discovery,
    yieldCards,
    discoveryDecisions,
    yieldDecisions
  });
  await writeFreshReportDirectory(root, 'final', {
    'review-summary.json': canonicalSourceExpansionJson({ ...summary, as_of: asOf }),
    'review-summary.md': renderFinalReviewSummaryMarkdown({ ...summary, as_of: asOf })
  });
  return Object.freeze({ command: 'finalize', ...summary });
}

function reportEnvelope(fields) {
  return Object.freeze({
    source: 'stage7-source-expansion-metadata-pilot-v1',
    ...fields,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false
  });
}

function assertSameCardIds(report, cards, wave) {
  const actual = cardIds(report, wave);
  const expected = cards.map((card) => card.candidate_id);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new SourceExpansionBoundaryError('REPORT_DRIFT', wave);
  }
}

function cardIds(report, wave) {
  if (
    report?.source !== 'stage7-source-expansion-metadata-pilot-v1'
      || report.metadata_only !== true
      || report.authorizes_download !== false
      || report.authorizes_training !== false
      || report.wave !== wave
      || !Array.isArray(report.cards)
  ) {
    throw new SourceExpansionBoundaryError('REPORT_INVALID', wave);
  }
  return report.cards.map((card) => card.candidate_id);
}

async function main() {
  try {
    const result = await runStage7SourceExpansionCli();
    if (result.help) {
      console.log(result.help);
    } else {
      console.log(JSON.stringify({
        command: result.command,
        metadata_only: result.metadata_only,
        authorizes_download: false,
        authorizes_training: false,
        card_count: result.card_count ?? null,
        accepted_count: result.accepted_count ?? null
      }));
    }
  } catch (error) {
    console.error(`${error.code || 'SOURCE_EXPANSION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
