import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrainingDataError } from './training/trainingError.js';
import {
  initializeResidentialWorkspace,
  readResidentialWorkspaceStatus,
  resolveResidentialWorkspaceRoot
} from './training/residential/workspace/index.js';

const COMMANDS = new Set(['init', 'status']);
const OPTIONS = new Set(['--root']);

export function parseResidentialWorkspaceArgs(
  argv,
  { cwd = process.cwd() } = {}
) {
  const command = argv[0];
  if (!COMMANDS.has(command)) fail('ARGUMENT_COMMAND_INVALID', command);
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!OPTIONS.has(flag)) fail('ARGUMENT_UNKNOWN', flag);
    if (Object.hasOwn(values, flag)) fail('ARGUMENT_DUPLICATE', flag);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail('ARGUMENT_VALUE_MISSING', flag);
    }
    values[flag] = value;
    index += 1;
  }
  return Object.freeze({
    command,
    root: resolveResidentialWorkspaceRoot(
      values['--root'] ?? '.local/residential-model',
      { cwd }
    )
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseResidentialWorkspaceArgs(argv);
  const projectRoot = process.env.RESIDENTIAL_PROJECT_ROOT
    ? path.resolve(process.env.RESIDENTIAL_PROJECT_ROOT)
    : path.resolve(import.meta.dirname, '..');
  const status = options.command === 'init'
    ? await initializeResidentialWorkspace({
      root: options.root,
      projectRoot
    })
    : await readResidentialWorkspaceStatus({
      root: options.root,
      projectRoot
    });
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
    `root=${status.root}`,
    ...Object.entries(counts).map(([name, count]) => `${name}=${count}`)
  ].join('\n') + '\n');
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
