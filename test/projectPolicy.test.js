import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

test('retired governance commands are absent', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of RETIRED_SCRIPTS) {
    assert.equal(packageJson.scripts[name], undefined, name);
  }
});
