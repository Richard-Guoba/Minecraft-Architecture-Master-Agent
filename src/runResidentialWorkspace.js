import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrainingDataError } from './training/trainingError.js';
import {
  initializeResidentialWorkspace,
  readResidentialWorkspaceStatus,
  resolveResidentialWorkspaceRoot
} from './training/residential/workspace/index.js';
import {
  auditLegacyTemplates,
  initializeSourceBatch,
  intakeResidentialBatch
} from './training/residential/intake/index.js';

const COMMAND_OPTIONS = Object.freeze({
  init: new Set(['--root']),
  status: new Set(['--root']),
  'batch-init': new Set(['--root', '--batch-id', '--source-project']),
  intake: new Set(['--root', '--batch-id']),
  'legacy-audit': new Set(['--root'])
});

const COMMANDS = new Set(Object.keys(COMMAND_OPTIONS));

export function parseResidentialWorkspaceArgs(
  argv,
  { cwd = process.cwd() } = {}
) {
  const command = argv[0];
  if (!COMMANDS.has(command)) fail('ARGUMENT_COMMAND_INVALID', command);
  const allowedOptions = COMMAND_OPTIONS[command];
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowedOptions.has(flag)) fail('ARGUMENT_NOT_ALLOWED', flag);
    if (Object.hasOwn(values, flag)) fail('ARGUMENT_DUPLICATE', flag);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail('ARGUMENT_VALUE_MISSING', flag);
    }
    values[flag] = value;
    index += 1;
  }
  const options = {
    command,
    root: resolveResidentialWorkspaceRoot(
      values['--root'] ?? '.local/residential-model',
      { cwd }
    )
  };
  if (command === 'batch-init') {
    requireOption(values, '--batch-id');
    requireOption(values, '--source-project');
    options.batchId = values['--batch-id'];
    options.sourceProject = values['--source-project'];
  }
  if (command === 'intake') {
    requireOption(values, '--batch-id');
    options.batchId = values['--batch-id'];
  }
  return Object.freeze(options);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseResidentialWorkspaceArgs(argv);
  const projectRoot = process.env.RESIDENTIAL_PROJECT_ROOT
    ? path.resolve(process.env.RESIDENTIAL_PROJECT_ROOT)
    : path.resolve(import.meta.dirname, '..');
  const context = { root: options.root, projectRoot };
  if (options.command === 'init') {
    return printWorkspace(await initializeResidentialWorkspace(context));
  }
  if (options.command === 'status') {
    return printWorkspace(await readResidentialWorkspaceStatus(context));
  }
  if (options.command === 'batch-init') {
    return printBatch(await initializeSourceBatch({
      ...context,
      batchId: options.batchId,
      sourceProject: options.sourceProject
    }));
  }
  if (options.command === 'intake') {
    return printIntake(await intakeResidentialBatch({
      ...context,
      batchId: options.batchId
    }));
  }
  return printLegacy(await auditLegacyTemplates(context));
}

function printWorkspace(status) {
  const counts = status.counts ?? {
    inbox_batches: 0,
    quarantined_cases: 0,
    source_profiles: 0,
    annotations: 0,
    golden_reviews: 0,
    selective_reviews: 0,
    snapshots: 0,
    runs: 0,
    reports: 0
  };
  process.stdout.write([
    `workspace_status=${status.state}`,
    ...Object.entries(counts).map(([name, count]) => `${name}=${count}`)
  ].join('\n') + '\n');
}

function printBatch(inventory) {
  process.stdout.write([
    'batch_status=ready',
    `batch_id=${inventory.manifest.batch_id}`,
    `source_project=${inventory.manifest.source_project}`,
    `candidate_count=${inventory.candidates.length}`
  ].join('\n') + '\n');
}

function printIntake(report) {
  const { summary } = report;
  process.stdout.write([
    'intake_status=complete',
    `batch_id=${report.batch_id}`,
    `candidate_count=${summary.candidate_count}`,
    `parsed_count=${summary.parsed_count}`,
    `deferred_count=${summary.deferred_count}`,
    `rejected_count=${summary.rejected_count}`,
    `duplicate_count=${summary.duplicate_count}`,
    `source_profile_count=${summary.source_profile_count}`
  ].join('\n') + '\n');
}

function printLegacy(report) {
  const { summary } = report;
  process.stdout.write([
    'legacy_audit_status=complete',
    `candidate_count=${summary.candidate_count}`,
    `house_hint_count=${summary.house_hint_count}`,
    `other_hint_count=${summary.other_hint_count}`,
    `parsed_count=${summary.parsed_count}`,
    `deferred_count=${summary.deferred_count}`,
    `rejected_count=${summary.rejected_count}`,
    `duplicate_count=${summary.duplicate_count}`,
    `missing_provenance_count=${summary.missing_provenance_count}`
  ].join('\n') + '\n');
}

function requireOption(values, option) {
  if (!Object.hasOwn(values, option)) fail('ARGUMENT_REQUIRED', option);
}

function fail(code, detail) {
  throw new TrainingDataError(code, String(detail));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const code = error?.code || 'RESIDENTIAL_WORKSPACE_FAILED';
    const detail = error?.detail || error?.message || String(error);
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 1;
  });
}
