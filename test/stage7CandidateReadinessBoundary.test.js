import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const IMPLEMENTATION_FILES = [
  'src/construction/learning/stage7CandidateBoundary.js',
  'src/construction/learning/stage7BoundedNbt.js',
  'src/construction/learning/stage7VanillaStructureNbt.js',
  'src/construction/learning/stage7ConditionalVoxelPreparation.js',
  'src/construction/learning/stage7ConditionalFingerprint.js',
  'src/construction/learning/stage7CandidateReadinessState.js',
  'src/construction/learning/stage7CandidateReadinessStore.js'
];

test('R2 exposes no network, downloader, archive, private, Dataset, Python, trainer, or M4 surface', async () => {
  const forbidden = [
    /\bfetch\s*\(/u, /\bhttp\.request\b/u, /\bhttps\.request\b/u,
    /\baxios\b/u, /\bplaywright\b/u, /\bpuppeteer\b/u,
    /(?:node:)?child_process/u, /\bexecFile\b/u, /\bspawn\s*\(/u,
    /\bgit\s+clone\b/u, /\bunzip\b/u, /\btar\.extract\b/u,
    /\.(?:schematic|schem|litematic|mcstructure)\b/u, /\blevel\.dat\b/u,
    /\.local\/stage7-private-research/u, /\btraining\/stage7\b/u,
    /\btorch\./u, /\bimport\s+torch\b/u, /\bfrom\s+torch\b/u, /\bpython\b/u,
    /\bbuildCoarseSemanticVoxelDataset\b/u, /\bready_for_m3_real_data=true\b/u,
    /\btraining_eligible_count=1\b/u, /\bApply Mode\b/u,
    /\.\.\/templates\/nbt\.js\b/u
  ];
  for (const filename of IMPLEMENTATION_FILES) {
    const source = await readFile(filename, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${filename} matches ${pattern}`);
    }
  }
});

test('R2 has no npm command and documents its synthetic-only R3 gate', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const readme = await readFile('README.md', 'utf8');
  assert.equal(Object.keys(pkg.scripts).some((name) => /candidate.*readiness|readiness.*candidate/u.test(name)), false);
  assert.match(readme, /Stage 7 Candidate Readiness R2/u);
  assert.match(readme, /synthetic-only/iu);
  assert.match(readme, /no operational npm command/iu);
  assert.match(readme, /does not authorize acquisition, Dataset admission, or training/iu);
  assert.match(readme, /five exact candidates/iu);
});

test('all record-producing R2 modules hard-code non-authorization', async () => {
  for (const filename of [
    'src/construction/learning/stage7ConditionalVoxelPreparation.js',
    'src/construction/learning/stage7ConditionalFingerprint.js',
    'src/construction/learning/stage7CandidateReadinessState.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.match(source, /synthetic_only:\s*true/u);
    assert.match(source, /authorizes_acquisition:\s*false/u);
    assert.match(source, /authorizes_training:\s*false/u);
    assert.match(source, /authorizes_dataset_admission:\s*false/u);
  }
});

test('payload stages have no write API and the store is temporary-root-only', async () => {
  for (const filename of [
    'src/construction/learning/stage7CandidateBoundary.js',
    'src/construction/learning/stage7BoundedNbt.js',
    'src/construction/learning/stage7VanillaStructureNbt.js',
    'src/construction/learning/stage7ConditionalVoxelPreparation.js',
    'src/construction/learning/stage7ConditionalFingerprint.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.equal(/writeFile|appendFile|createWriteStream/u.test(source), false, filename);
  }
  const store = await readFile('src/construction/learning/stage7CandidateReadinessStore.js', 'utf8');
  assert.match(store, /tmpdir\(\)/u);
  assert.match(store, /stage7-candidate-readiness-/u);
  assert.doesNotMatch(store, /stage7-source-expansion/u);
});
