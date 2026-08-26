import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sanitizeShadowError,
  shadowError
} from './playbook/shadow/contracts.js';
import { runShadowReview } from './playbook/shadow/runShadowReview.js';

const DEFAULT_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

export function parseArchitecturePlaybookShadowArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) throw shadowError('INVALID_ARGUMENT');
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--run', '--mode'].includes(key) || parsed.has(key) || !value) {
      throw shadowError('INVALID_ARGUMENT');
    }
    parsed.set(key, value);
  }
  if (!['mock', 'llm'].includes(parsed.get('--mode'))) throw shadowError('INVALID_ARGUMENT');
  return Object.freeze({ run: parsed.get('--run'), mode: parsed.get('--mode') });
}

export async function main(
  argv = process.argv.slice(2),
  {
    projectRoot = DEFAULT_PROJECT_ROOT,
    stdout = process.stdout,
    createClient,
    fsImpl
  } = {}
) {
  const options = parseArchitecturePlaybookShadowArgs(argv);
  const result = await runShadowReview({
    projectRoot,
    runArg: options.run,
    mode: options.mode,
    createClient,
    fsImpl
  });
  stdout.write(renderSummary(result));
  return result;
}

function renderSummary(result) {
  const status = result.status === 'replaced' ? 'updated' : result.status;
  if (!['created', 'updated', 'unchanged'].includes(status)) {
    throw shadowError('SHADOW_INSTALL_FAILED');
  }
  return [
    `shadow_status=${status}`,
    `mode=${result.mode}`,
    `assessment_count=${result.assessment_count}`,
    `explanation_status=${result.explanation_status}`,
    `run=${result.run_relative_path}`,
    ''
  ].join('\n');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const safe = sanitizeShadowError(error);
    process.stderr.write(`${safe.code}\n`);
    process.exitCode = 1;
  });
}
