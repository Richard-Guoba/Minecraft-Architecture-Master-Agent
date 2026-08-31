#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAX_TEST_CONCURRENCY = 2;
const HEAP_LIMIT_OPTION = '--max-old-space-size=1536';
const HEAP_LIMIT_ARGUMENT = '--max-old-space-size';
const INHERITED_HEAP_LIMIT_PATTERN = /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=(?:"[^"]*"|'[^']*'|\S*)|\s+(?!['"]?--)(?:"[^"]*"|'[^']*'|\S+))?/gu;
const SYSTEMD_RUN_PATH = '/usr/bin/systemd-run';
const HARD_SCOPE_ARGS = Object.freeze([
  '--user',
  '--scope',
  '--quiet',
  '--collect',
  '--property=MemoryAccounting=yes',
  '--property=MemoryHigh=4G',
  '--property=MemoryMax=6G',
  '--property=MemorySwapMax=512M',
  '--property=OOMPolicy=kill'
]);
const EX_USAGE = 64;
const EX_CONFIG = 78;

class TestArgumentError extends Error {}

function parseIntegerValue(argument, value) {
  if (
    typeof value !== 'string'
    || !/^[+-]?\d+$/u.test(value)
  ) {
    throw new TestArgumentError(
      `${argument} requires a numeric value; received ${value ?? 'nothing'}.`
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TestArgumentError(
      `${argument} requires a numeric value within the safe integer range.`
    );
  }
  return parsed;
}

function clampConcurrency(argument, value) {
  const parsed = parseIntegerValue(argument, value);
  return parsed > 0
    ? Math.min(parsed, MAX_TEST_CONCURRENCY)
    : MAX_TEST_CONCURRENCY;
}

export function buildNodeTestArgs(argv = []) {
  const forwarded = [];
  let concurrency = MAX_TEST_CONCURRENCY;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      argument === '--test-concurrency'
      || argument === '--test_concurrency'
    ) {
      const value = argv[index + 1];
      concurrency = clampConcurrency(argument, value);
      index += 1;
      continue;
    }
    const concurrencyPrefix = [
      '--test-concurrency=',
      '--test_concurrency='
    ].find((prefix) => argument.startsWith(prefix));
    if (concurrencyPrefix) {
      concurrency = clampConcurrency(
        concurrencyPrefix.slice(0, -1),
        argument.slice(concurrencyPrefix.length)
      );
      continue;
    }
    const equalsIndex = argument.indexOf('=');
    const optionName = equalsIndex === -1
      ? argument
      : argument.slice(0, equalsIndex);
    const normalizedOptionName = optionName.replaceAll('_', '-');
    if (normalizedOptionName === HEAP_LIMIT_ARGUMENT) {
      const value = equalsIndex === -1
        ? argv[index + 1]
        : argument.slice(equalsIndex + 1);
      parseIntegerValue(
        optionName,
        value
      );
      if (equalsIndex === -1) {
        index += 1;
      }
      continue;
    }
    forwarded.push(argument);
  }

  return [
    '--test',
    `--test-concurrency=${concurrency}`,
    ...forwarded
  ];
}

export function buildChildEnv(env = {}) {
  const existingOptions = env.NODE_OPTIONS
    ?.replace(INHERITED_HEAP_LIMIT_PATTERN, '')
    .trim();
  return {
    ...env,
    NODE_OPTIONS: existingOptions
      ? `${existingOptions} ${HEAP_LIMIT_OPTION}`
      : HEAP_LIMIT_OPTION
  };
}

function buildSystemdRunArgs(execPath, commandArgs) {
  return [
    ...HARD_SCOPE_ARGS,
    '--',
    execPath,
    ...commandArgs
  ];
}

function getExitStatus(result, fallback = 1) {
  return Number.isInteger(result?.status) ? result.status : fallback;
}

export function runNodeTests({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  execPath = process.execPath,
  nodeVersion = process.versions.node,
  platform = process.platform,
  spawnSyncImpl = spawnSync,
  writeStderr = (message) => process.stderr.write(`${message}\n`)
} = {}) {
  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0], 10);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 20) {
    writeStderr(
      `[node-test-guard] Node.js 20 or newer is required; found ${nodeVersion}.`
    );
    return EX_USAGE;
  }

  let nodeArgs;
  try {
    nodeArgs = buildNodeTestArgs(argv);
  } catch (error) {
    if (!(error instanceof TestArgumentError)) {
      throw error;
    }
    writeStderr(`[node-test-guard] ${error.message}`);
    return EX_USAGE;
  }
  const childEnv = buildChildEnv(env);
  const directOptions = {
    cwd,
    env: childEnv,
    stdio: 'inherit'
  };

  if (platform !== 'linux') {
    writeStderr(
      `[node-test-guard] WARNING: ${platform} is running tests without a hard memory scope.`
    );
    return getExitStatus(spawnSyncImpl(execPath, nodeArgs, directOptions));
  }

  const probe = spawnSyncImpl(
    SYSTEMD_RUN_PATH,
    buildSystemdRunArgs(execPath, ['--eval', '']),
    {
      cwd,
      env: childEnv,
      stdio: 'ignore'
    }
  );

  if (probe.error || probe.status !== 0) {
    if (env.MC_TEST_ALLOW_SOFT_FALLBACK === '1') {
      writeStderr(
        '[node-test-guard] WARNING: running tests without a hard memory scope because MC_TEST_ALLOW_SOFT_FALLBACK=1.'
      );
      return getExitStatus(spawnSyncImpl(execPath, nodeArgs, directOptions));
    }
    writeStderr(
      '[node-test-guard] Hard systemd memory scope is unavailable; refusing to run tests. Set MC_TEST_ALLOW_SOFT_FALLBACK=1 only for an intentional unbounded run.'
    );
    return EX_CONFIG;
  }

  const scopedResult = spawnSyncImpl(
    SYSTEMD_RUN_PATH,
    buildSystemdRunArgs(execPath, nodeArgs),
    directOptions
  );
  if (scopedResult.error) {
    writeStderr(
      `[node-test-guard] systemd-run failed to start the test command: ${scopedResult.error.message}`
    );
    return EX_CONFIG;
  }

  return getExitStatus(scopedResult);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  process.exitCode = runNodeTests();
}
