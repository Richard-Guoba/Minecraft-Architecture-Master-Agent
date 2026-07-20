import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SOURCE_EXPANSION_DIRECTORIES, SOURCE_EXPANSION_ROOT_RELATIVE } from '../src/construction/learning/stage7SourceExpansionBoundary.js';
import {
  parseStage7ConditionalAdmissionArgs,
  runStage7ConditionalAdmissionCli
} from '../src/auditStage7ConditionalAdmission.js';
import { appendTaxonomyAssessment } from '../src/construction/learning/stage7ConditionalAdmissionStore.js';
import { candidateFixture, decisionFixture, rightsFixture } from './fixtures/stage7SourceExpansionFixtures.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

function hasCode(code) { return (error) => error.code === code; }

test('argument parsing accepts only exact record and audit metadata-only shapes', () => {
  assert.deepEqual(parseStage7ConditionalAdmissionArgs([
    'record', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--input', 'reviews/taxonomy-input.json', '--metadata-only'
  ]), {
    command: 'record', root: SOURCE_EXPANSION_ROOT_RELATIVE,
    input: 'reviews/taxonomy-input.json', asOf: null, metadataOnly: true
  });
  assert.deepEqual(parseStage7ConditionalAdmissionArgs([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-18', '--metadata-only'
  ]), {
    command: 'audit', root: SOURCE_EXPANSION_ROOT_RELATIVE,
    input: null, asOf: '2026-07-18', metadataOnly: true
  });
  assert.throws(() => parseStage7ConditionalAdmissionArgs([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE, '--as-of', '2026-07-18'
  ]), hasCode('METADATA_ONLY_REQUIRED'));
  assert.throws(() => parseStage7ConditionalAdmissionArgs([
    'record', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--input', '../escape.json', '--metadata-only'
  ]), hasCode('INPUT_PATH_INVALID'));
  assert.throws(() => parseStage7ConditionalAdmissionArgs([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    `--root=${SOURCE_EXPANSION_ROOT_RELATIVE}`,
    '--as-of', '2026-07-18', '--metadata-only'
  ]), hasCode('CLI_OPTION_DUPLICATE'));
});

test('record appends one validated revision and checks formal boundaries twice', async (t) => {
  const context = await populatedContext(t);
  await writeFile(join(context.root, 'reviews', 'taxonomy-input.json'),
    `${JSON.stringify(taxonomyAssessmentFixture())}\n`, 'utf8');
  const result = await runStage7ConditionalAdmissionCli([
    'record', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--input', 'reviews/taxonomy-input.json', '--metadata-only'
  ], context);
  assert.equal(result.recorded_revision, 1);
  assert.equal(result.authorizes_download, false);
  assert.equal(context.datasetChecks, 2);
});

test('audit writes exactly two non-authorizing reports and checks formal boundaries twice', async (t) => {
  const context = await populatedContext(t);
  await appendTaxonomyAssessment(context.root, taxonomyAssessmentFixture());
  const result = await runStage7ConditionalAdmissionCli([
    'audit', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-18', '--metadata-only'
  ], context);
  assert.equal(result.contract_ready_count, 1);
  assert.equal(result.authorizes_download, false);
  assert.deepEqual((await readdir(join(
    context.root, 'reports', 'conditional-admission-2026-07-18'
  ))).sort(), ['summary.json', 'summary.md']);
  const summary = JSON.parse(await readFile(join(
    context.root, 'reports', 'conditional-admission-2026-07-18', 'summary.json'
  ), 'utf8'));
  assert.equal(summary.metadata_only, true);
  assert.equal(summary.authorizes_download, false);
  assert.equal(summary.authorizes_training, false);
  assert.equal(summary.authorizes_dataset_admission, false);
  assert.equal(context.datasetChecks, 2);
});

async function populatedContext(t) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-conditional-cli-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const root = join(repositoryRoot, SOURCE_EXPANSION_ROOT_RELATIVE);
  for (const directory of SOURCE_EXPANSION_DIRECTORIES) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeJsonl(join(root, 'metadata', 'candidates.jsonl'), [candidateFixture()]);
  await writeJsonl(join(root, 'evidence', 'rights.jsonl'), [rightsFixture({ observed_at: '2026-07-18' })]);
  await writeJsonl(join(root, 'reviews', 'discovery-decisions.jsonl'), [
    decisionFixture({ decided_at: '2026-07-18' })
  ]);
  await writeJsonl(join(root, 'reviews', 'yield-decisions.jsonl'), []);
  const context = {
    repositoryRoot,
    root,
    datasetChecks: 0,
    gitStatus: async (args) => args[0] === 'check-ignore' ? 0 : 1,
    assertDatasetBoundary: async () => {
      context.datasetChecks += 1;
      return { dataset_v3_gate: {
        ready_for_m3_real_data: false, training_eligible_count: 0
      } };
    }
  };
  return context;
}

async function writeJsonl(filename, records) {
  await writeFile(filename, records.length === 0
    ? ''
    : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}
