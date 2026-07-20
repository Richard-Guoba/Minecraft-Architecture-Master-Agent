import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertFormalDatasetBoundary } from './construction/learning/stage7PrivateResearchBoundary.js';
import {
  SOURCE_EXPANSION_ROOT_RELATIVE,
  SourceExpansionBoundaryError,
  assertSourceExpansionRoot,
  readSourceExpansionJson,
  readSourceExpansionJsonl,
  writeFreshReportDirectory
} from './construction/learning/stage7SourceExpansionBoundary.js';
import {
  validateDiscoveryRecord,
  validateIsoDate,
  validateReviewDecision,
  validateRightsRecord
} from './construction/learning/stage7SourceExpansionContracts.js';
import { evaluateRightsLedger } from './construction/learning/stage7SourceExpansionRights.js';
import { canonicalSourceExpansionJson } from './construction/learning/stage7SourceExpansionReview.js';
import { validateTaxonomyAssessment } from './construction/learning/stage7ConditionalTaxonomy.js';
import {
  buildConditionalAdmissionSummary,
  evaluateConditionalAdmission,
  renderConditionalAdmissionMarkdown
} from './construction/learning/stage7ConditionalAdmission.js';
import {
  appendTaxonomyAssessment,
  readTaxonomyAssessmentLedger
} from './construction/learning/stage7ConditionalAdmissionStore.js';

const COMMANDS = Object.freeze(['record', 'audit']);

export function parseStage7ConditionalAdmissionArgs(argv = []) {
  const [command, ...rest] = argv;
  for (const flag of ['--root', '--input', '--as-of', '--metadata-only']) {
    const count = rest.filter(
      (item) => item === flag || item.startsWith(`${flag}=`)
    ).length;
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
        input: { type: 'string' },
        'as-of': { type: 'string' },
        'metadata-only': { type: 'boolean' }
      },
      strict: true
    }));
  } catch (error) {
    throw new SourceExpansionBoundaryError('CLI_USAGE', error.message);
  }
  if (!COMMANDS.includes(command)) {
    throw new SourceExpansionBoundaryError('CLI_COMMAND_INVALID', command || 'missing');
  }
  if (values.root !== SOURCE_EXPANSION_ROOT_RELATIVE) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', values.root || 'missing');
  }
  if (values['metadata-only'] !== true) {
    throw new SourceExpansionBoundaryError('METADATA_ONLY_REQUIRED', command);
  }
  if (command === 'record') {
    if (values['as-of'] !== undefined
      || values.input !== 'reviews/taxonomy-input.json') {
      throw new SourceExpansionBoundaryError('INPUT_PATH_INVALID', values.input || 'missing');
    }
  } else {
    if (values.input !== undefined) {
      throw new SourceExpansionBoundaryError('CLI_USAGE', 'audit does not accept --input');
    }
    validateIsoDate(values['as-of'], '--as-of');
  }
  return Object.freeze({
    command,
    root: values.root,
    input: command === 'record' ? values.input : null,
    asOf: command === 'audit' ? values['as-of'] : null,
    metadataOnly: true
  });
}

export async function runStage7ConditionalAdmissionCli(argv, context = {}) {
  const options = parseStage7ConditionalAdmissionArgs(argv);
  const repositoryRoot = path.resolve(context.repositoryRoot || process.cwd());
  const root = path.resolve(repositoryRoot, options.root);
  const assertDataset = context.assertDatasetBoundary || assertFormalDatasetBoundary;
  await assertDataset(repositoryRoot);
  await assertSourceExpansionRoot(root, {
    repositoryRoot,
    gitStatus: context.gitStatus
  });
  const result = options.command === 'record'
    ? await recordAssessment(root, options.input)
    : await auditAdmission(root, options.asOf);
  await assertDataset(repositoryRoot);
  return result;
}

async function recordAssessment(root, input) {
  const record = validateTaxonomyAssessment(
    await readSourceExpansionJson(root, input)
  );
  const appended = await appendTaxonomyAssessment(root, record);
  return Object.freeze({
    command: 'record',
    candidate_id: appended.candidate_id,
    recorded_revision: appended.revision,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

async function auditAdmission(root, asOf) {
  const candidates = await readSourceExpansionJsonl(
    root, 'metadata/candidates.jsonl', validateDiscoveryRecord
  );
  const rightsRecords = await readSourceExpansionJsonl(
    root, 'evidence/rights.jsonl', validateRightsRecord
  );
  const reviewDecisions = Object.freeze([
    ...await readSourceExpansionJsonl(
      root, 'reviews/discovery-decisions.jsonl', validateReviewDecision
    ),
    ...await readSourceExpansionJsonl(
      root, 'reviews/yield-decisions.jsonl', validateReviewDecision
    )
  ]);
  const assessments = await readTaxonomyAssessmentLedger(root);
  const rightsResults = evaluateRightsLedger({ candidates, rightsRecords, asOf });
  const states = evaluateConditionalAdmission({
    candidates, rightsResults, reviewDecisions, assessments
  });
  const summary = buildConditionalAdmissionSummary(states);
  await writeFreshReportDirectory(root, `conditional-admission-${asOf}`, {
    'summary.json': canonicalSourceExpansionJson({ ...summary, as_of: asOf }),
    'summary.md': renderConditionalAdmissionMarkdown(summary)
  });
  return Object.freeze({ command: 'audit', ...summary, as_of: asOf });
}

async function main() {
  try {
    const result = await runStage7ConditionalAdmissionCli(process.argv.slice(2));
    console.log(JSON.stringify({
      command: result.command,
      metadata_only: true,
      authorizes_download: false,
      authorizes_training: false,
      authorizes_dataset_admission: false,
      recorded_revision: result.recorded_revision ?? null,
      contract_ready_count: result.contract_ready_count ?? null
    }));
  } catch (error) {
    console.error(`${error.code || 'CONDITIONAL_ADMISSION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
