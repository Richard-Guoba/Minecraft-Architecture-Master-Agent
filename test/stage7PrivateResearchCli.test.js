import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve('.tmp/stage7-private-research-cli-test');

test('private research init creates only local skeleton and prints owner acknowledgement schema', async () => {
  await fsp.rm(ROOT, { recursive: true, force: true });

  const result = runCli(['init', '--root', ROOT]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PRIVATE_RESEARCH_ACK.json must be completed by the owner/);
  assert.equal(fs.existsSync(path.join(ROOT, 'PRIVATE_RESEARCH_ACK.json')), false);
  for (const directory of ['source', 'manifests', 'prepared', 'splits', 'runs']) {
    assert.equal(fs.statSync(path.join(ROOT, directory)).isDirectory(), true);
  }
});

test('private research import refuses a root without the owner acknowledgement', async () => {
  await fsp.rm(ROOT, { recursive: true, force: true });
  assert.equal(runCli(['init', '--root', ROOT]).status, 0);

  const result = runCli(['import', '--root', ROOT, '--obtained-at', '2026-07-15T00:00:00.000Z']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ACK_MISSING/);
});

function runCli(args) {
  return spawnSync(process.execPath, ['src/runStage7PrivateResearch.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}
