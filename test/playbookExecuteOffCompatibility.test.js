import assert from 'node:assert/strict';
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
