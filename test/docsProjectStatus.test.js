import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSourceBatchManifest
} from '../src/training/residential/contracts/index.js';

function read(relative) {
  return fs.readFileSync(relative, 'utf8');
}

test('project docs describe the active construction and training-first paths', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const training = read('docs/training.md');
  assert.match(readme, /construction_method_v1/u);
  assert.match(readme, /training:prepare/u);
  assert.match(architecture, /deterministic geometry/iu);
  assert.match(training, /local training/iu);
});

test('project docs describe the current local-only residential intake boundary', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const residential = read('docs/residential-model/README.md');
  assert.match(readme, /Residential learned renderer/iu);
  assert.match(readme, /R2 local source intake/iu);
  assert.match(readme, /local-only/iu);
  assert.match(architecture, /does not change production generation/iu);
  assert.match(residential, /npm run residential:workspace -- status/u);
  assert.match(residential, /R2/u);
  assert.match(residential, /not a trained model/iu);
  assert.match(residential, /houses\//u);
  assert.match(residential, /other-architecture\//u);
  assert.match(residential, /batch-init/u);
  assert.match(residential, /intake/u);
  assert.match(residential, /legacy-audit/u);
  const manifest = validateSourceBatchManifest(readManifestExample(residential));
  assert.equal(manifest.candidates.length, 2);
  assert.deepEqual(
    manifest.candidates.map((candidate) => candidate.lane),
    ['houses', 'other-architecture']
  );
  assert.doesNotMatch(
    [readme, architecture, residential].join('\n'),
    /residential (?:dataset|checkpoint) (?:exists|is available|has been created)/iu
  );
  assert.equal(fs.existsSync('docs/superpowers'), false);
});

function readManifestExample(markdown) {
  const match = markdown.match(/```json\n(\{[\s\S]*?\})\n```/u);
  assert.ok(match, 'residential curator guide needs a JSON manifest example');
  return JSON.parse(match[1]);
}
