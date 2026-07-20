import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const R3_FILES = Object.freeze([
  'src/construction/learning/stage7PilotBatch.js',
  'src/construction/learning/stage7PilotFilesystem.js',
  'src/construction/learning/stage7PilotReadinessStore.js',
  'src/construction/learning/stage7CandidateAcquisition.js',
  'src/construction/learning/stage7PilotArtifacts.js',
  'src/construction/learning/stage7Pilot.js',
  'src/construction/learning/stage7PilotReview.js',
  'src/construction/learning/stage7PilotPreflight.js',
  'src/runStage7PublicNbtPilot.js'
]);
const PAYLOAD_FILES = R3_FILES.filter((filename) =>
  !filename.endsWith('stage7PilotPreflight.js')
  && !filename.endsWith('runStage7PublicNbtPilot.js'));

test('R3 has one exact HTTPS receiver and no general acquisition or format surface', async () => {
  const sources = new Map();
  for (const filename of R3_FILES) sources.set(filename, await readFile(filename, 'utf8'));
  for (const [filename, source] of sources) {
    const mayFetch = filename.endsWith('stage7CandidateAcquisition.js');
    if (!mayFetch) {
      assert.doesNotMatch(source, /await\s+fetchImpl\s*\(/u, filename);
    }
    for (const pattern of [
      /\bgit\s+clone\b/iu, /\bunzip\b/iu, /\btar\.(?:extract|x)\b/iu,
      /\b(?:rar|7z|jar)\b/iu, /\.(?:schem|schematic|litematic|mcstructure)\b/iu,
      /\blevel\.dat\b/iu, /\bprocess-all\b/iu, /\brun-all\b/iu,
      /\bdevice\b/iu, /\blearning-rate\b/iu,
      /['"](?:url|steps)['"]\s*:/iu,
      /\b(?:axios|playwright|puppeteer|simple-git|isomorphic-git|octokit)\b/iu,
      /(?:adm-zip|jszip|node-stream-zip|unrar|archiver)/iu
    ]) assert.equal(pattern.test(source), false, `${filename} matches ${pattern}`);
  }
  const acquisition = sources.get(
    'src/construction/learning/stage7CandidateAcquisition.js'
  );
  assert.match(acquisition, /redirect:\s*'manual'/u);
  assert.match(acquisition, /credentials:\s*'omit'/u);
  assert.match(acquisition, /CANDIDATE_DOWNLOAD_LIMIT/u);
  assert.match(acquisition, /writePilotBytesIdempotent/u);
  const cli = sources.get('src/runStage7PublicNbtPilot.js');
  assert.doesNotMatch(cli, /\burl:\s*\{\s*type:/u);
  assert.match(cli, /'validate-batch',\s*'run-candidate',\s*'record-review',\s*'audit'/u);
});

test('R3 payload path imports R2 algorithms and no Dataset, trainer, provider, generation, or subprocess', async () => {
  const forbidden = [
    /coarseSemanticVoxelDataset/u, /buildCoarseSemanticVoxelDataset/u,
    /stage7PrivateResearch/u, /private_research/u, /\btorch\b/iu,
    /\btrainer\b/iu, /\bcheckpoint\b/iu, /construction\/workflow\.js/u,
    /templates\/nbt\.js/u, /coarseSemanticVoxelProvider/u,
    /(?:node:)?child_process/u, /\bexecFile\b/u, /\bspawn\s*\(/u,
    /\bupload\b/iu, /\bpublish\b/iu
  ];
  for (const filename of PAYLOAD_FILES) {
    const source = await readFile(filename, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${filename} matches ${pattern}`);
    }
  }
  const pipeline = await readFile('src/construction/learning/stage7Pilot.js', 'utf8');
  for (const imported of [
    'stage7CandidateBoundary.js', 'stage7BoundedNbt.js',
    'stage7VanillaStructureNbt.js', 'stage7ConditionalVoxelPreparation.js',
    'stage7ConditionalFingerprint.js', 'stage7CandidateReadinessState.js'
  ]) assert.match(pipeline, new RegExp(imported.replaceAll('.', '\\.')));
  assert.doesNotMatch(pipeline, /function\s+(?:decodeBoundedNbt|prepareConditionalVolume|fingerprintConditionalVolume)/u);
});

test('R3 fixes training and Dataset non-authorization and narrows acquisition authority', async () => {
  for (const filename of [
    'src/construction/learning/stage7Pilot.js',
    'src/construction/learning/stage7PilotReview.js',
    'src/runStage7PublicNbtPilot.js'
  ]) {
    const source = await readFile(filename, 'utf8');
    assert.match(source, /authorizes_training:\s*false/u, filename);
    assert.match(source, /authorizes_dataset_admission:\s*false/u, filename);
    assert.doesNotMatch(source, /authorizes_(?:training|dataset_admission):\s*true/u, filename);
  }
  const batch = await readFile('src/construction/learning/stage7PilotBatch.js', 'utf8');
  const state = await readFile('src/construction/learning/stage7CandidateReadinessState.js', 'utf8');
  assert.match(batch, /approval\.authorizes_acquisition\s*!==\s*true/u);
  assert.match(batch, /approval\.authorizes_training\s*!==\s*false/u);
  assert.match(state, /record\.synthetic_only\s*===\s*false[\s\S]*state_after\s*===\s*'named_batch_approved'/u);
  assert.doesNotMatch([...await Promise.all(R3_FILES.map((file) => readFile(file, 'utf8')))].join('\n'),
    /authorizes_acquisition:\s*true/u);
});

test('R3 exposes only the isolated package command and tracks no operational artifacts', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts['pilot:stage7:public-nbt'], 'node src/runStage7PublicNbtPilot.js');
  assert.deepEqual(Object.keys(pkg.scripts).filter((name) => name.includes('public-nbt')),
    ['pilot:stage7:public-nbt']);
  const { stdout } = await execFile('git', ['ls-files'], { cwd: process.cwd(), encoding: 'utf8' });
  const tracked = stdout.split('\n').filter(Boolean);
  assert.equal(tracked.some((file) => file.startsWith('.local/')), false);
  assert.equal(tracked.some((file) => /(?:^|\/)manifests\/named-batch\.json$/u.test(file)), false);
  assert.equal(tracked.some((file) => /\.(?:nbt|voxels\.bin)$/u.test(file)), false);
  assert.equal(tracked.some((file) => /(?:^|\/)reports\/pilots\/.*\.json$/u.test(file)), false);
  assert.equal(tracked.some((file) => /(?:^|\/)fingerprints\/structural-fingerprints\.jsonl$/u.test(file)), false);
});

test('README and completion handoff state synthetic-only readiness and the next exact owner gate', async () => {
  const readme = await readFile('README.md', 'utf8');
  const handoff = await readFile(
    'docs/superpowers/handoffs/2026-07-20-stage-7-r3-operational-tooling-readiness-complete.md',
    'utf8'
  );
  for (const text of [readme, handoff]) {
    assert.match(text, /Stage 7 Public NBT Pilot R3/u);
    assert.match(text, /synthetic payloads only/iu);
    assert.match(text, /No real 5\+3 batch is approved/iu);
    assert.match(text, /pilot_ready does not authorize Dataset admission/iu);
    assert.match(text, /device and positive optimizer-step budget/iu);
  }
  assert.match(readme, /validate-batch --root \.local\/stage7-source-expansion/u);
  assert.match(readme, /run-candidate --root \.local\/stage7-source-expansion/u);
  assert.match(readme, /record-review --root \.local\/stage7-source-expansion/u);
  assert.match(readme, /audit --root \.local\/stage7-source-expansion/u);
});
