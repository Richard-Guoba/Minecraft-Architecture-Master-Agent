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
