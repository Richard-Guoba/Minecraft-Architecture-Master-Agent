import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertCandidateId } from './construction/learning/stage7CandidateBoundary.js';
import { runPilotCandidate } from './construction/learning/stage7Pilot.js';
import {
  validatePilotBatchDocument
} from './construction/learning/stage7PilotBatch.js';
import {
  ensurePilotLayout,
  readPilotJson
} from './construction/learning/stage7PilotFilesystem.js';
import { runPilotPreflight } from './construction/learning/stage7PilotPreflight.js';
import {
  auditPilot,
  finalizePilotCandidate
} from './construction/learning/stage7PilotReview.js';
import { SOURCE_EXPANSION_ROOT_RELATIVE } from './construction/learning/stage7SourceExpansionBoundary.js';

const COMMANDS = Object.freeze([
  'validate-batch', 'run-candidate', 'record-review', 'audit'
]);
const BATCH_PATH = 'manifests/named-batch.json';
const REVIEW_INPUT_PATH = 'reviews/pilot-review-input.json';

export class PublicNbtPilotCliError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PublicNbtPilotCliError';
    this.code = code;
  }
}

export function parseStage7PublicNbtPilotArgs(argv = []) {
  const [command, ...rest] = argv;
  const flags = [
    '--root', '--batch', '--candidate-id', '--input', '--public-pilot-only'
  ];
  for (const flag of flags) {
    const count = rest.filter((item) => item === flag || item.startsWith(`${flag}=`)).length;
    if (count > 1) fail('CLI_OPTION_DUPLICATE', flag);
  }
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        root: { type: 'string' },
        batch: { type: 'string' },
        'candidate-id': { type: 'string' },
        input: { type: 'string' },
        'public-pilot-only': { type: 'boolean' }
      },
      strict: true
    }));
  } catch {
    fail('CLI_USAGE', 'options');
  }
  if (!COMMANDS.includes(command)) fail('CLI_COMMAND_INVALID', command || 'missing');
  if (values.root !== SOURCE_EXPANSION_ROOT_RELATIVE) fail('CLI_ROOT_INVALID', 'root');
  if (values.batch !== BATCH_PATH) fail('CLI_BATCH_PATH_INVALID', 'batch');
  if (values['public-pilot-only'] !== true) fail('PUBLIC_PILOT_ONLY_REQUIRED', command);

  const requiresCandidate = ['run-candidate', 'record-review'].includes(command);
  if (requiresCandidate) {
    try {
      assertCandidateId(values['candidate-id']);
    } catch {
      fail('CLI_CANDIDATE_ID_INVALID', 'candidate-id');
    }
  } else if (values['candidate-id'] !== undefined) {
    fail('CLI_USAGE', 'candidate-id-not-accepted');
  }
  if (command === 'record-review') {
    if (values.input !== REVIEW_INPUT_PATH) fail('CLI_REVIEW_PATH_INVALID', 'input');
  } else if (values.input !== undefined) {
    fail('CLI_USAGE', 'input-not-accepted');
  }
  return Object.freeze({
    command,
    root: values.root,
    batch: values.batch,
    candidateId: requiresCandidate ? values['candidate-id'] : null,
    input: command === 'record-review' ? values.input : null,
    publicPilotOnly: true
  });
}

export async function runStage7PublicNbtPilotCli(argv, context = {}) {
  const options = parseStage7PublicNbtPilotArgs(argv);
  const repositoryRoot = path.resolve(context.repositoryRoot || process.cwd());
  const root = path.resolve(repositoryRoot, options.root);
  const readJson = context.readJson || readPilotJson;
  const preflight = context.preflight || runPilotPreflight;
  const ensureLayout = context.ensureLayout || ensurePilotLayout;
  const runCandidate = context.runCandidate || runPilotCandidate;
  const finalizeCandidate = context.finalizeCandidate || finalizePilotCandidate;
  const audit = context.audit || auditPilot;
  const batchDocument = validatePilotBatchDocument(await readJson(root, options.batch));
  const preflightInput = {
    repositoryRoot,
    root,
    batchDocument,
    reviewRecovery: options.command === 'record-review'
  };
  const preflightResult = await preflight(preflightInput);

  if (options.command === 'validate-batch') {
    return Object.freeze({
      command: options.command,
      batch_id: batchDocument.batch.batch_id,
      candidate_count: batchDocument.batch.candidates.length,
      authorizes_training: false,
      authorizes_dataset_admission: false
    });
  }

  try {
    await ensureLayout(root);
    if (options.command === 'run-candidate') {
      const result = await runCandidate({
        root,
        batchDocument,
        candidateId: options.candidateId,
        recordedAt: (context.now || (() => new Date().toISOString()))(),
        recordedBy: batchDocument.approval.approved_by
      }, {
        currentCodeRevision: async () => preflightResult.git_head
      });
      return machineSummary(result);
    }
    if (options.command === 'record-review') {
      const reviewRecord = await readJson(root, options.input);
      if (reviewRecord?.candidate_id !== options.candidateId) {
        fail('CLI_REVIEW_CANDIDATE_MISMATCH', options.candidateId);
      }
      const result = await finalizeCandidate({
        root,
        batchDocument,
        reviewRecord,
        recordedAt: reviewRecord.reviewed_at
      });
      return finalizationSummary(result);
    }
    const result = await audit({ root, batchDocument });
    return auditSummary(result);
  } finally {
    await preflight(preflightInput);
  }
}

function machineSummary(result) {
  return Object.freeze({
    command: 'run-candidate',
    candidate_id: result.candidate_id,
    state: result.state,
    terminal: result.terminal,
    token_counts: result.token_counts,
    duplicate_proposal_count: result.duplicate_proposals.length,
    reason_codes: result.reason_codes,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

function finalizationSummary(result) {
  return Object.freeze({
    command: 'record-review',
    candidate_id: result.candidate_id,
    state: result.state,
    terminal: result.terminal,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

function auditSummary(result) {
  return Object.freeze({
    command: 'audit',
    ready_count: result.ready_count,
    terminal_count: result.terminal_count,
    complete: result.complete,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

async function main() {
  try {
    const result = await runStage7PublicNbtPilotCli(process.argv.slice(2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`${error.code || 'PUBLIC_NBT_PILOT_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

function fail(code, detail) {
  throw new PublicNbtPilotCliError(code, detail);
}
