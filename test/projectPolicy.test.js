import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RETIRED_SCRIPTS = [
  'dataset:stage7',
  'review-pack:stage7',
  'compare:stage7-datasets',
  'audit:stage7:readiness',
  'audit:stage7:sources',
  'audit:stage7:conditional-admission',
  'pilot:stage7:public-nbt'
];
const CURRENT_DOCS = [
  'README.md',
  'AGENT.md',
  'docs/architecture.md',
  'docs/training.md'
];
const FORBIDDEN_POLICY = /ready_for_m3_real_data|training_eligible_count|Dataset v[123].*(?:required|gate|approval)|R[123].*(?:approval|admission)|real-data training is prohibited/iu;

test('retired governance commands are absent', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of RETIRED_SCRIPTS) {
    assert.equal(packageJson.scripts[name], undefined, name);
  }
});

test('retired governed dataset artifacts are not tracked', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.doesNotMatch(tracked, /^mc_templates\/datasets\/coarse_semantic_voxels\//mu);
  assert.doesNotMatch(tracked, /^mc_templates\/curation\/stage7_dataset_reviews\.jsonl$/mu);
});

test('current project documents use the training-first policy', () => {
  for (const relative of CURRENT_DOCS) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(text, FORBIDDEN_POLICY, relative);
  }
  const training = fs.readFileSync(path.join(ROOT, 'docs/training.md'), 'utf8');
  assert.match(training, /all 64 local templates/iu);
  assert.match(training, /external release/iu);
});

test('process documents are limited to the active architecture playbook program', () => {
  const tracked = execFileSync(
    'git',
    ['ls-files', 'docs/superpowers'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim().split('\n').filter(Boolean);
  assert.ok(tracked.length >= 1);
  for (const relative of tracked) {
    assert.match(
      relative,
      /^docs\/superpowers\/(?:plans|specs)\/\d{4}-\d{2}-\d{2}-architecture-playbook-[a-z0-9-]+\.md$/u,
      relative
    );
  }
});

test('exactly four training commands are supported', () => {
  const scripts = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  ).scripts;
  assert.deepEqual(
    Object.keys(scripts)
      .filter((name) => name.startsWith('training:'))
      .sort(),
    [
      'training:evaluate',
      'training:prepare',
      'training:status',
      'training:train'
    ]
  );
});
