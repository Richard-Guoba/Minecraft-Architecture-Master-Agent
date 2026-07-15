import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertPrivateRoot, canonicalJson, PrivateResearchBoundaryError } from './construction/learning/stage7PrivateResearchBoundary.js';
import { importPrivateSources, preparePrivateCorpus } from './construction/learning/stage7PrivateResearchCorpus.js';

const ACKNOWLEDGEMENT_TEMPLATE = Object.freeze({
  scope: 'stage7-private-research-only',
  distribution_prohibited: true,
  dataset_v3_unchanged: true,
  m4_apply_mode_unchanged: true,
  acknowledged_at: 'ISO-8601 timestamp',
  acknowledged_by: 'owner-supplied local identifier'
});

export async function runPrivateResearchCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: { root: { type: 'string' }, 'obtained-at': { type: 'string' }, 'source-url': { type: 'string' }, seed: { type: 'string' } },
    strict: true
  });
  if (!command || !values.root) throw new PrivateResearchBoundaryError('CLI_USAGE', 'command and --root are required');
  const root = path.resolve(cwd, values.root);
  if (command === 'init') {
    for (const directory of ['source', 'manifests', 'prepared', 'splits', 'runs']) await fs.mkdir(path.join(root, directory), { recursive: true });
    await assertPrivateRoot(root);
    return { command, root, acknowledgement_template: ACKNOWLEDGEMENT_TEMPLATE };
  }
  if (command === 'import') return { command, ...(await importPrivateSources({ cwd, root, obtainedAt: values['obtained-at'], sourceUrl: values['source-url'] || '' })) };
  if (command === 'prepare') return { command, ...(await preparePrivateCorpus({ cwd, root, splitSeed: Number(values.seed) })) };
  throw new PrivateResearchBoundaryError('CLI_USAGE', `unknown command: ${command}`);
}

async function main() {
  try {
    const result = await runPrivateResearchCli();
    if (result.command === 'init') {
      console.log('PRIVATE_RESEARCH_ACK.json must be completed by the owner and is never created automatically.');
      console.log(canonicalJson(result.acknowledgement_template));
    } else console.log(canonicalJson(result));
  } catch (error) {
    console.error(error instanceof PrivateResearchBoundaryError ? error.message : `CLI_FAILURE: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
