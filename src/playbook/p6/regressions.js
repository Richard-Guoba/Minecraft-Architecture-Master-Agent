import { spawn } from 'node:child_process';
import path from 'node:path';

import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import { P6_PROTOCOL_VERSION, P6_SCHEMA_VERSION } from './constants.js';
import { p6Error, sanitizeP6Error } from './contracts.js';

const HASH = /^[a-f0-9]{64}$/u;
const GIT_COMMIT = /^[a-f0-9]{40}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;
export const P6_NPM_CLI_PATH = '/usr/share/nodejs/npm/bin/npm-cli.js';
export const P6_GIT_PATH = '/usr/bin/git';
const RECEIPT_FIELDS = Object.freeze([
  'schema_version', 'protocol_version', 'kind', 'status', 'git_commit',
  'started_at', 'completed_at', 'suites', 'receipt_sha256'
]);
const SUITE_FIELDS = Object.freeze([
  'suite_id', 'command', 'exit_code', 'stdout_bytes', 'stdout_sha256',
  'stderr_bytes', 'stderr_sha256', 'started_at', 'completed_at'
]);

const P6_TESTS = [
  'test/playbookP6Contracts.test.js', 'test/playbookP6Cohort.test.js',
  'test/playbookP6Cameras.test.js', 'test/playbookP6OfflineRenderer.test.js',
  'test/playbookP6Storage.test.js', 'test/playbookP6Cli.test.js',
  'test/playbookP6Captures.test.js', 'test/playbookP6Observations.test.js',
  'test/playbookP6Comparisons.test.js', 'test/playbookP6Report.test.js',
  'test/playbookP6RegressionReceipt.test.js'
];
const P4_TESTS = [
  'test/playbookShadowCheckerRegistry.test.js', 'test/playbookShadowCheckers.test.js',
  'test/playbookShadowContracts.test.js', 'test/playbookShadowCorpusProjection.test.js',
  'test/playbookShadowEvaluation.test.js', 'test/playbookShadowExplanation.test.js',
  'test/playbookShadowGate.test.js', 'test/playbookShadowRun.test.js',
  'test/playbookShadowStorage.test.js', 'test/playbookReviewedRuleCard.test.js'
];
const P5_TESTS = [
  'test/playbookExecuteCheckpoints.test.js', 'test/playbookExecuteCli.test.js',
  'test/playbookExecuteContracts.test.js', 'test/playbookExecuteDesignEnvelope.test.js',
  'test/playbookExecuteEligibility.test.js', 'test/playbookExecuteGate.test.js',
  'test/playbookExecuteInstaller.test.js', 'test/playbookExecuteOffCompatibility.test.js',
  'test/playbookExecuteOrchestrator.test.js', 'test/playbookExecuteRepairCompilers.test.js',
  'test/playbookExecuteRepairRegistry.test.js', 'test/playbookExecuteRepairTransaction.test.js',
  'test/playbookExecuteReplay.test.js', 'test/playbookExecuteStorage.test.js'
];

export const P6_REGRESSION_SUITES = deepFreeze([
  { suite_id: 'p6-focused', command: npmCommand('test', '--', ...P6_TESTS) },
  { suite_id: 'p4-focused', command: npmCommand('test', '--', ...P4_TESTS) },
  { suite_id: 'p5-focused', command: npmCommand('test', '--', ...P5_TESTS) },
  { suite_id: 'playbook-off-pipeline', command: npmCommand('test', '--', 'test/playbookExecuteOffCompatibility.test.js', 'test/pipeline.test.js') },
  { suite_id: 'six-episode-golden', command: npmCommand('test', '--', 'test/playbookPilotEpisodeSet.test.js', 'test/playbookP2EvidenceAudit.test.js') },
  { suite_id: 'manual-drift', command: npmCommand('run', 'playbook:manual', '--', 'check') },
  { suite_id: 'git-diff-check', command: [P6_GIT_PATH, 'diff', '--check'] }
]);

export async function verifyP6Regressions({ runner = runRegressionCommand, gitCommit, now = () => new Date() } = {}) {
  try {
    if (typeof runner !== 'function' || typeof now !== 'function' || !GIT_COMMIT.test(gitCommit)) invalid();
    const startedAt = timestamp(now);
    const suites = [];
    for (const definition of P6_REGRESSION_SUITES) {
      const suiteStartedAt = timestamp(now);
      const raw = await runner(definition);
      const normalized = normalizeRunnerResult(raw);
      suites.push({
        suite_id: definition.suite_id,
        command: [...definition.command],
        exit_code: normalized.exit_code,
        stdout_bytes: normalized.stdout.length,
        stdout_sha256: sha256(normalized.stdout),
        stderr_bytes: normalized.stderr.length,
        stderr_sha256: sha256(normalized.stderr),
        started_at: suiteStartedAt,
        completed_at: timestamp(now)
      });
    }
    const authority = {
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      kind: 'p6-regression-receipt',
      status: suites.every(row => row.exit_code === 0) ? 'pass' : 'failed',
      git_commit: gitCommit,
      started_at: startedAt,
      completed_at: timestamp(now),
      suites
    };
    return validateP6RegressionReceipt(deepFreeze({
      ...authority, receipt_sha256: sha256(stableJson(authority))
    }), { gitCommit });
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_GATE_FAILED');
  }
}

export function validateP6RegressionReceipt(value, { gitCommit, requirePass = false } = {}) {
  try {
    if (!plain(value) || !sameExactKeys(value, RECEIPT_FIELDS)
      || value.schema_version !== P6_SCHEMA_VERSION || value.protocol_version !== P6_PROTOCOL_VERSION
      || value.kind !== 'p6-regression-receipt' || !['pass', 'failed'].includes(value.status)
      || !GIT_COMMIT.test(gitCommit) || value.git_commit !== gitCommit
      || !ISO_UTC.test(value.started_at) || !ISO_UTC.test(value.completed_at)
      || value.started_at > value.completed_at || !Array.isArray(value.suites)
      || value.suites.length !== P6_REGRESSION_SUITES.length || !HASH.test(value.receipt_sha256)) invalid();
    for (const [index, row] of value.suites.entries()) {
      const expected = P6_REGRESSION_SUITES[index];
      if (!plain(row) || !sameExactKeys(row, SUITE_FIELDS)
        || row.suite_id !== expected.suite_id || stableJson(row.command) !== stableJson(expected.command)
        || !Number.isSafeInteger(row.exit_code) || row.exit_code < 0 || row.exit_code > 255
        || !Number.isSafeInteger(row.stdout_bytes) || row.stdout_bytes < 0 || row.stdout_bytes > MAX_STREAM_BYTES
        || !Number.isSafeInteger(row.stderr_bytes) || row.stderr_bytes < 0 || row.stderr_bytes > MAX_STREAM_BYTES
        || !HASH.test(row.stdout_sha256) || !HASH.test(row.stderr_sha256)
        || !ISO_UTC.test(row.started_at) || !ISO_UTC.test(row.completed_at)
        || row.started_at > row.completed_at) invalid();
    }
    const { receipt_sha256: persistedHash, ...authority } = value;
    if (persistedHash !== sha256(stableJson(authority))
      || (value.status === 'pass') !== value.suites.every(row => row.exit_code === 0)
      || (requirePass && value.status !== 'pass')) invalid();
    return value;
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_GATE_FAILED');
  }
}

export async function runRegressionCommand(
  definition, { cwd = process.cwd(), env = process.env } = {}
) {
  if (!P6_REGRESSION_SUITES.includes(definition)) invalid();
  const [executable, ...args] = definition.command;
  return await new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const child = spawn(executable, args, {
      cwd, env: createRegressionChildEnvironment(env), stdio: ['ignore', 'pipe', 'pipe']
    });
    const collect = (chunks, key) => chunk => {
      const size = key === 'stdout' ? stdoutBytes += chunk.length : stderrBytes += chunk.length;
      if (size > MAX_STREAM_BYTES) {
        child.kill('SIGKILL');
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));
    child.once('error', () => reject(p6Error('P6_GATE_FAILED')));
    child.once('close', code => resolve({
      exit_code: Number.isInteger(code) ? code : 255,
      stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr)
    }));
  });
}

export function createRegressionChildEnvironment(source = process.env) {
  if (!plain(source)) invalid();
  const runtimeDirectory = typeof process.getuid === 'function'
    ? `/run/user/${process.getuid()}` : '/nonexistent/p6-runtime';
  return {
    PATH: [...new Set([path.dirname(process.execPath), '/usr/bin', '/bin'])].join(':'),
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    TMPDIR: '/tmp',
    HOME: '/nonexistent',
    XDG_RUNTIME_DIR: runtimeDirectory,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtimeDirectory}/bus`,
    npm_config_userconfig: '/dev/null',
    npm_config_globalconfig: '/nonexistent/p6-global-npmrc',
    npm_config_location: 'global',
    npm_config_script_shell: '/bin/sh'
  };
}

function normalizeRunnerResult(value) {
  if (!plain(value) || !sameExactKeys(value, ['exit_code', 'stdout', 'stderr'])
    || !Number.isSafeInteger(value.exit_code) || value.exit_code < 0 || value.exit_code > 255
    || !Buffer.isBuffer(value.stdout) || value.stdout.length > MAX_STREAM_BYTES
    || !Buffer.isBuffer(value.stderr) || value.stderr.length > MAX_STREAM_BYTES) invalid();
  return value;
}

function timestamp(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) invalid();
  return value.toISOString();
}
function npmCommand(...args) { return [process.execPath, P6_NPM_CLI_PATH, ...args]; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function sameExactKeys(value, fields) { return stableJson(Object.keys(value).sort()) === stableJson([...fields].sort()); }
function invalid() { throw p6Error('P6_GATE_FAILED'); }
