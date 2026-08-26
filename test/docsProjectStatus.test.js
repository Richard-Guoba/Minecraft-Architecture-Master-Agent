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

test('architecture playbook docs describe the strict P4 boundary', () => {
  const readme = read('docs/architecture-playbook/README.md');
  const report = read('docs/architecture-playbook/reports/p4-shadow-guidance.md');
  assert.match(readme, /P4.*影子指导.*通过/u);
  assert.match(readme, /npm run playbook:shadow -- --run/u);
  assert.match(report, /21 条规则/u);
  assert.match(report, /15 条核心程序/u);
  assert.match(report, /6 条案例模式/u);
  assert.match(report, /没有视觉输入/u);
  assert.match(report, /没有修改建筑/u);
  assert.match(report, /不证明.*质量提升/u);
  assert.match(report, /P5/u);
  assert.doesNotMatch(report, /P6 已开放|已改善建筑审美/u);
});
