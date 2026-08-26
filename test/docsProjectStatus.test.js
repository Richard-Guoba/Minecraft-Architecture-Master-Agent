import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

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

test('project docs describe the residential renderer as a foundation only', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const residential = read('docs/residential-model/README.md');
  assert.match(readme, /Residential learned renderer/iu);
  assert.match(readme, /contracts and local workspace/iu);
  assert.match(architecture, /does not change production generation/iu);
  assert.match(residential, /npm run residential:workspace -- status/u);
  assert.match(residential, /R1/u);
  assert.match(residential, /not a trained model/iu);
});
