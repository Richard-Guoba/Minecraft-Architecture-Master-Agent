import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(ROOT, 'src', 'runTrainingPrepare.js');

test('training prepare CLI rejects unknown flags', () => {
  assertCliRejects(['--unknown'], 'ARGUMENT_UNKNOWN');
});

test('training prepare CLI rejects a tracked output target', () => {
  assertCliRejects(
    ['--output-root', path.join(ROOT, 'package.json')],
    'OUTPUT_ROOT_TRACKED'
  );
});

test('training prepare CLI rejects output outside .local/training', () => {
  assertCliRejects(
    ['--output-root', path.join(os.tmpdir(), 'training-output')],
    'OUTPUT_ROOT_OUTSIDE_LOCAL_TRAINING'
  );
});

test('training prepare CLI rejects a non-integer seed', () => {
  assertCliRejects(['--seed', '7.5'], 'SEED_INVALID');
});

test('package and ignore files expose the local training command', async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')
  );
  const ignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  assert.equal(
    packageJson.scripts['training:prepare'],
    'node src/runTrainingPrepare.js'
  );
  assert.match(ignore, /^\.local\/training\/$/mu);
});

function assertCliRejects(args, code) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, new RegExp(code, 'u'));
  assert.equal(result.stdout, '');
}
