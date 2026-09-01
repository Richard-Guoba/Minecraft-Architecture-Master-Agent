import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createRegressionChildEnvironment,
  P6_NPM_CLI_PATH,
  P6_REGRESSION_SUITES,
  runRegressionCommand,
  validateP6RegressionReceipt,
  verifyP6Regressions
} from '../src/playbook/p6/regressions.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { parseP6Args, resolveGitCommit, runP6Cli } from '../src/runArchitecturePlaybookP6.js';
import { runNodeTests } from '../scripts/runNodeTests.js';
import { p6CaptureHash } from './fixtures/playbookP6Captures.js';

const COMMIT = 'a'.repeat(40);
const NOW = '2026-08-30T13:00:00.000Z';

test('verifier runs every exact required suite sequentially and seals canonical output hashes', async () => {
  assert.deepEqual(P6_REGRESSION_SUITES.map(row => [row.suite_id, row.command]), [
    ['p6-focused', P6_REGRESSION_SUITES[0].command],
    ['p4-focused', P6_REGRESSION_SUITES[1].command],
    ['p5-focused', P6_REGRESSION_SUITES[2].command],
    ['playbook-off-pipeline', P6_REGRESSION_SUITES[3].command],
    ['six-episode-golden', P6_REGRESSION_SUITES[4].command],
    ['manual-drift', [process.execPath, P6_NPM_CLI_PATH, 'run', 'playbook:manual', '--', 'check']],
    ['git-diff-check', ['/usr/bin/git', 'diff', '--check']]
  ]);
  for (const row of P6_REGRESSION_SUITES.slice(0, -1)) {
    assert.deepEqual(row.command.slice(0, 2), [process.execPath, P6_NPM_CLI_PATH]);
  }
  const active = [];
  const seen = [];
  const receipt = await verifyP6Regressions({
    gitCommit: COMMIT,
    now: () => new Date(NOW),
    runner: async suite => {
      assert.equal(active.length, 0);
      active.push(suite.suite_id);
      seen.push([suite.suite_id, suite.command]);
      active.pop();
      return { exit_code: 0, stdout: Buffer.from(`${suite.suite_id}:pass`), stderr: Buffer.alloc(0) };
    }
  });
  assert.deepEqual(seen, P6_REGRESSION_SUITES.map(row => [row.suite_id, row.command]));
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.suites.length, P6_REGRESSION_SUITES.length);
  assert.equal(validateP6RegressionReceipt(receipt, { gitCommit: COMMIT }), receipt);
  assert.match(receipt.receipt_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(receipt).includes(':pass'), false);
});

test('regression children use a minimal environment immune to PATH, loader, Node, shell, and npm injection', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-regression-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const npmMarker = path.join(root, 'fake-npm-ran');
  const gitMarker = path.join(root, 'fake-git-ran');
  const nodeHookMarker = path.join(root, 'node-hook-ran');
  const shellMarker = path.join(root, 'fake-shell-ran');
  const nodeHook = path.join(root, 'hook.cjs');
  const fakeShell = path.join(root, 'fake-shell');
  await fs.writeFile(path.join(root, 'npm'), `#!/bin/sh\ntouch '${npmMarker}'\nexit 0\n`, { mode: 0o700 });
  await fs.writeFile(path.join(root, 'git'), `#!/bin/sh\ntouch '${gitMarker}'\nprintf '%040d\\n' 0\n`, { mode: 0o700 });
  await fs.writeFile(nodeHook, `require('node:fs').writeFileSync(${JSON.stringify(nodeHookMarker)}, 'ran')\n`);
  await fs.writeFile(fakeShell, `#!/bin/sh\ntouch '${shellMarker}'\nexit 0\n`, { mode: 0o700 });
  await fs.writeFile(path.join(root, 'attacker.npmrc'), [
    `node-options=--require=${nodeHook}`,
    `script-shell=${fakeShell}`,
    ''
  ].join('\n'));
  const poisoned = {
    ...process.env,
    PATH: `${root}:${process.env.PATH}`,
    MC_TEST_ALLOW_SOFT_FALLBACK: '1',
    MC_TEST_BYPASS_HARD_SCOPE: '1',
    NODE_OPTIONS: `--require=${nodeHook}`,
    npm_config_node_options: `--require=${nodeHook}`,
    NPM_CONFIG_NODE_OPTIONS: `--require=${nodeHook}`,
    npm_config_script_shell: fakeShell,
    npm_config_userconfig: path.join(root, 'attacker.npmrc'),
    LD_PRELOAD: path.join(root, 'attacker.so'),
    DYLD_INSERT_LIBRARIES: path.join(root, 'attacker.dylib'),
    BASH_ENV: fakeShell,
    ENV: fakeShell,
    NODE_PATH: root,
    INIT_CWD: root,
    HOME: root,
    XDG_RUNTIME_DIR: root,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${root}/fake-bus`,
    ARBITRARY_CALLER_SECRET: 'must-not-cross-boundary'
  };
  const childEnv = createRegressionChildEnvironment(poisoned);
  assert.deepEqual(Object.keys(childEnv).sort(), [
    'DBUS_SESSION_BUS_ADDRESS', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR',
    'XDG_RUNTIME_DIR', 'npm_config_globalconfig', 'npm_config_location',
    'npm_config_script_shell', 'npm_config_userconfig'
  ]);
  assert.equal(Object.values(childEnv).some(value => String(value).includes(root)), false);

  const manual = P6_REGRESSION_SUITES.find(row => row.suite_id === 'manual-drift');
  assert.equal((await runRegressionCommand(manual, { env: poisoned })).exit_code, 0);
  assert.match(await resolveGitCommit({ env: poisoned }), /^[a-f0-9]{40}$/u);
  for (const marker of [npmMarker, gitMarker, nodeHookMarker, shellMarker]) {
    await assert.rejects(fs.lstat(marker), { code: 'ENOENT' });
  }

  const hardBackendExit = runNodeTests({
    env: childEnv,
    platform: 'linux',
    spawnSyncImpl: () => ({ status: 1 }),
    writeStderr: () => {}
  });
  assert.equal(hardBackendExit, 78);
  const missingHardBackend = await verifyP6Regressions({
    gitCommit: COMMIT,
    now: () => new Date(NOW),
    runner: async suite => ({
      exit_code: suite.suite_id === 'p6-focused' ? hardBackendExit : 0,
      stdout: Buffer.alloc(0), stderr: Buffer.from('hard scope unavailable')
    })
  });
  assert.equal(missingHardBackend.status, 'failed');
  assert.throws(() => validateP6RegressionReceipt(
    missingHardBackend, { gitCommit: COMMIT, requirePass: true }
  ), { code: 'P6_GATE_FAILED' });
});

test('failed, missing, reordered, hand-authored, or cross-commit receipts never validate as passing', async () => {
  const failed = await verifyP6Regressions({
    gitCommit: COMMIT,
    now: () => new Date(NOW),
    runner: async suite => ({
      exit_code: suite.suite_id === 'p5-focused' ? 1 : 0,
      stdout: Buffer.alloc(0), stderr: Buffer.from('bounded failure')
    })
  });
  assert.equal(failed.status, 'failed');
  assert.throws(() => validateP6RegressionReceipt(failed, { gitCommit: COMMIT, requirePass: true }), { code: 'P6_GATE_FAILED' });
  for (const [mutate, rehash = true] of [
    [value => { value.suites.pop(); }],
    [value => { value.suites.reverse(); }],
    [value => { value.git_commit = 'b'.repeat(40); }],
    [value => { value.suites[0].command = ['npm', 'test', '--', 'test/fake.test.js']; }],
    [value => { value.receipt_sha256 = '0'.repeat(64); }, false]
  ]) {
    const forged = structuredClone(failed);
    mutate(forged);
    if (rehash) rehashReceipt(forged);
    assert.throws(() => validateP6RegressionReceipt(forged, { gitCommit: COMMIT }), { code: 'P6_GATE_FAILED' });
  }
  assert.throws(
    () => validateP6RegressionReceipt({ p4: 'pass', p5: 'pass', playbook_off: 'pass', six_episode_golden: 'pass' }, { gitCommit: COMMIT }),
    { code: 'P6_GATE_FAILED' }
  );
});

function rehashReceipt(receipt) {
  const { receipt_sha256: _discard, ...authority } = receipt;
  receipt.receipt_sha256 = sha256(stableJson(authority));
}

test('verify-regressions CLI uses only the injected sequential runner and publishes an owned receipt', async () => {
  const runDir = '/tmp/p6-regression-disposable';
  assert.deepEqual(parseP6Args(['verify-regressions', '--run-dir', runDir]), {
    action: 'verify-regressions', runDir
  });
  const seen = [];
  let publication;
  const currentKinds = ['cohort', 'reference-renders', 'capture-session', 'minecraft-captures', 'observations', 'blind-comparison'];
  const result = await runP6Cli(['verify-regressions', '--run-dir', runDir], {
    admitP6Run: async () => ({ close: async () => {} }),
    readCurrentP6Generation: async ({ kind }) => {
      if (kind === 'gate') throw Object.assign(new Error('absent'), { code: 'P6_AUTHORITY_INVALID' });
      return { generation: 'generation-000001', manifest_sha256: p6CaptureHash(kind), files: {} };
    },
    resolveGitCommit: async () => COMMIT,
    verifyP6Regressions,
    runRegressionCommand: async suite => {
      seen.push(suite.suite_id);
      return { exit_code: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
    now: () => new Date(NOW),
    publishP6Generation: async options => {
      publication = options;
      return { generation: 'generation-000001', manifest_sha256: p6CaptureHash('receipt') };
    },
    stableJson: value => `${JSON.stringify(value)}\n`,
    sha256: p6CaptureHash
  });
  assert.deepEqual(seen, P6_REGRESSION_SUITES.map(row => row.suite_id));
  assert.equal(result.status, 'regressions-verified');
  assert.equal(result.regression_status, 'pass');
  assert.deepEqual(publication.expectedCurrent.map(row => row.kind), [...currentKinds, 'gate']);
  assert.deepEqual(Object.keys(publication.files), ['regression-receipt.json']);
});
