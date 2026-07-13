import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditStage7RealCaseReadiness,
  canonicalizeStage7RealCaseReadinessAudit,
  renderStage7RealCaseReadinessMarkdown
} from './construction/learning/stage7RealCaseReadinessAudit.js';

const DATASET_ROOTS = Object.freeze([
  'mc_templates/datasets/coarse_semantic_voxels/v1',
  'mc_templates/datasets/coarse_semantic_voxels/v2',
  'mc_templates/datasets/coarse_semantic_voxels/v3'
]);

export function parseStage7RealCaseReadinessArgs(argv = []) {
  const options = {
    datasetRoot: 'mc_templates/datasets/coarse_semantic_voxels/v3',
    reviewOverlayPath: 'mc_templates/curation/stage7_dataset_reviews.jsonl',
    artifactRoot: '.tmp/stage7-dataset/v3',
    out: '',
    help: false
  };
  const flags = new Map([
    ['--dataset-root', 'datasetRoot'],
    ['--review-overlay', 'reviewOverlayPath'],
    ['--artifact-root', 'artifactRoot'],
    ['--out', 'out']
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') { options.help = true; continue; }
    if (flag === '--case') throw new Error('case selection is not supported; the audit always uses the six fixed pilots');
    const name = flags.get(flag);
    if (!name) throw new Error(`unknown readiness-audit option: ${flag}`);
    if (seen.has(name)) throw new Error(`duplicate readiness-audit option: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    options[name] = value;
    seen.add(name);
  }
  if (!options.help && !options.out) throw new Error('--out requires a value');
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseStage7RealCaseReadinessArgs(argv);
  if (options.help) { console.log(helpText()); return null; }
  const repositoryRoot = process.cwd();
  const output = path.resolve(repositoryRoot, options.out);
  assertReadinessAuditOutputOutsideDatasets(repositoryRoot, output);
  const audit = await auditStage7RealCaseReadiness({
    repositoryRoot,
    datasetRoot: options.datasetRoot,
    reviewOverlayPath: options.reviewOverlayPath,
    artifactRoot: options.artifactRoot
  });
  await writeAuditOutput(output, audit);
  return audit;
}

export function helpText() {
  return `Usage: npm run audit:stage7:readiness -- --out <directory> [options]

  --dataset-root <directory>
  --review-overlay <file>
  --artifact-root <directory>
  --out <directory>
  --help`;
}

async function writeAuditOutput(output, audit) {
  try { await fs.lstat(output); throw new Error(`--out already exists: ${output}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = path.dirname(output);
  const temporary = path.join(parent, `.${path.basename(output)}.tmp-${process.pid}-${Date.now()}`);
  await fs.mkdir(parent, { recursive: true });
  await fs.mkdir(temporary);
  try {
    await fs.writeFile(path.join(temporary, 'stage7-real-case-readiness-audit.json'), canonicalizeStage7RealCaseReadinessAudit(audit), 'utf8');
    await fs.writeFile(path.join(temporary, 'stage7-real-case-readiness-audit.md'), renderStage7RealCaseReadinessMarkdown(audit), 'utf8');
    await fs.rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function assertReadinessAuditOutputOutsideDatasets(repositoryRoot, outputPath) {
  const output = path.resolve(repositoryRoot, outputPath);
  for (const relative of DATASET_ROOTS) {
    const datasetRoot = path.resolve(repositoryRoot, relative);
    if (output === datasetRoot || output.startsWith(`${datasetRoot}${path.sep}`)) {
      throw new Error('--out must be outside Dataset v1, v2, and v3 roots');
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then((audit) => {
  if (audit?.global_blockers?.length) process.exitCode = 2;
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
