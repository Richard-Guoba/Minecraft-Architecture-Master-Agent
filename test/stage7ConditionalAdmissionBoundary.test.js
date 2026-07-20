import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const IMPLEMENTATION_FILES = [
  'src/construction/learning/stage7ConditionalTaxonomy.js',
  'src/construction/learning/stage7ConditionalAdmission.js',
  'src/construction/learning/stage7ConditionalAdmissionStore.js',
  'src/construction/learning/stage7ConditionalSnapshotPolicy.js',
  'src/auditStage7ConditionalAdmission.js'
];

test('package and README document exact metadata-only R1 operations', async () => {
  const packageText = await readFile('package.json', 'utf8');
  const readme = await readFile('README.md', 'utf8');
  const pkg = JSON.parse(packageText);
  assert.equal(
    pkg.scripts['audit:stage7:conditional-admission'],
    'node src/auditStage7ConditionalAdmission.js'
  );
  assert.match(readme, /audit:stage7:conditional-admission -- record/u);
  assert.match(readme, /audit:stage7:conditional-admission -- audit/u);
  assert.match(readme, /admission_contract_ready/u);
  assert.match(readme, /does not authorize download, Dataset admission, or training/iu);
});

test('R1 implementation exposes no payload, network, private, Python, trainer, or Dataset writer surface', async () => {
  const forbidden = [
    'fetch(', 'http.request', 'https.request', 'axios', 'playwright', 'puppeteer',
    '.schematic', '.litematic', '.mcstructure', 'level.dat', 'archive',
    '.local/stage7-private-research', 'training/stage7', 'torch', 'python',
    'buildCoarseSemanticVoxelDataset', 'ready_for_m3_real_data=true',
    'training_eligible_count=1', 'Apply Mode'
  ];
  for (const filename of IMPLEMENTATION_FILES) {
    const source = await readFile(filename, 'utf8');
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${filename} contains ${token}`);
    }
  }
});

test('R1 implementation hard-codes non-authorization in every report-producing module', async () => {
  for (const filename of [
    'src/construction/learning/stage7ConditionalAdmission.js',
    'src/auditStage7ConditionalAdmission.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.match(source, /metadata_only:\s*true/u);
    assert.match(source, /authorizes_download:\s*false/u);
    assert.match(source, /authorizes_training:\s*false/u);
    assert.match(source, /authorizes_dataset_admission:\s*false/u);
  }
});
