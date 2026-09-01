import assert from 'node:assert/strict';
import test from 'node:test';

import {
  P6_REGRESSION_SUITES,
  validateP6RegressionReceipt,
  verifyP6Regressions
} from '../src/playbook/p6/regressions.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';
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
    ['manual-drift', ['npm', 'run', 'playbook:manual', '--', 'check']],
    ['git-diff-check', ['git', 'diff', '--check']]
  ]);
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
