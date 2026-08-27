import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runPipeline } from '../src/pipeline.js';
import {
  captureOffCompatibility,
  OFF_COMPAT_PROMPT,
  OFF_COMPAT_SEED
} from './fixtures/playbookExecuteFixtures.js';

const fixturePath = new URL('./fixtures/playbook-execute/off-compatibility-v1.json', import.meta.url);
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const expandedFixturePath = new URL('./fixtures/playbook-execute/off-compatibility-expanded-v1.json', import.meta.url);
const expandedFixture = JSON.parse(await fs.readFile(expandedFixturePath, 'utf8'));

test('omitted playbook mode retains the frozen pre-P5 single-candidate bytes', async () => {
  await assertCompatibility('single', {});
});

test('omitted playbook mode retains the frozen pre-P5 candidate bytes', async () => {
  await assertCompatibility('candidate', {
    candidates: 3,
    candidateRounds: 1,
    candidateTargetScore: 95,
    candidateForceRounds: false
  });
});

test('explicit playbook off retains the frozen pre-P5 bytes when available', async (context) => {
  try {
    await assertCompatibility('single', { playbook: 'off' });
  } catch (error) {
    if (/playbook/u.test(error?.message || '')) context.skip('playbook option is introduced by a later task');
    else throw error;
  }
});

test('omitted playbook preserves base provider, fallback, Stage 7, concept, critic, and install vectors', () => {
  const generator = path.resolve('test/fixtures/generateOffCompatibility.js');
  const result = spawnSync(process.execPath, [generator, path.resolve('.')], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const { schema_version, base_commit, ...expected } = expandedFixture;
  assert.equal(schema_version, 1);
  assert.equal(base_commit, fixture.base_commit);
  assert.deepEqual(JSON.parse(result.stdout), expected);
});

async function assertCompatibility(caseName, options) {
  const root = path.resolve('.tmp', `playbook-execute-off-${caseName}-${Date.now()}-${Math.random()}`);
  const outRoot = path.join(root, 'out');
  try {
    const result = await runPipeline({
      prompt: OFF_COMPAT_PROMPT,
      mode: 'mock',
      seed: OFF_COMPAT_SEED,
      outRoot,
      cwd: process.cwd(),
      ...options
    });
    const actual = await captureOffCompatibility(result, { outRoot, runDir: result.outputDir });
    assert.deepEqual(actual, fixture[caseName]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
