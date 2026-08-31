import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildChildEnv,
  buildNodeTestArgs,
  runNodeTests
} from '../scripts/runNodeTests.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function createRecorder(statuses) {
  const calls = [];
  const spawnSyncImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return statuses.shift() ?? { status: 0 };
  };
  return { calls, spawnSyncImpl };
}

test('node test argv defaults to concurrency two', () => {
  assert.deepEqual(
    buildNodeTestArgs(['test/example.test.js']),
    ['--test', '--test-concurrency=2', 'test/example.test.js']
  );
});

test('node test argv clamps both concurrency syntaxes to two', () => {
  assert.deepEqual(
    buildNodeTestArgs(['--test-concurrency=9', 'test/one.test.js']),
    ['--test', '--test-concurrency=2', 'test/one.test.js']
  );
  assert.deepEqual(
    buildNodeTestArgs(['test/two.test.js', '--test-concurrency', '7']),
    ['--test', '--test-concurrency=2', 'test/two.test.js']
  );
});

test('node test argv normalizes non-positive numeric concurrency to two', () => {
  for (const value of ['0', '-3']) {
    assert.deepEqual(
      buildNodeTestArgs([`--test-concurrency=${value}`, 'test/example.test.js']),
      ['--test', '--test-concurrency=2', 'test/example.test.js'],
      value
    );
  }
});

test('node test argv strips and clamps the underscore concurrency alias', () => {
  assert.deepEqual(
    buildNodeTestArgs(['--test_concurrency=9', 'test/one.test.js']),
    ['--test', '--test-concurrency=2', 'test/one.test.js']
  );
  assert.deepEqual(
    buildNodeTestArgs(['test/two.test.js', '--test_concurrency', '1']),
    ['--test', '--test-concurrency=1', 'test/two.test.js']
  );
  assert.deepEqual(
    buildNodeTestArgs([
      '--test-concurrency=1',
      '--test_concurrency=99',
      'test/three.test.js'
    ]),
    ['--test', '--test-concurrency=2', 'test/three.test.js']
  );
});

test('node test argv preserves a lower requested concurrency', () => {
  assert.deepEqual(
    buildNodeTestArgs(['--test-concurrency=1', 'test/example.test.js']),
    ['--test', '--test-concurrency=1', 'test/example.test.js']
  );
});

test('child environment appends the Node heap limit without mutating the source', () => {
  const source = Object.freeze({
    KEEP_ME: 'yes',
    NODE_OPTIONS: '--trace-warnings'
  });

  assert.deepEqual(buildChildEnv(source), {
    KEEP_ME: 'yes',
    NODE_OPTIONS: '--trace-warnings --max-old-space-size=1536'
  });
});

test('child environment replaces inherited heap limits with the sole guard cap', () => {
  const source = Object.freeze({
    KEEP_ME: 'yes',
    NODE_OPTIONS: '--trace-warnings --max-old-space-size=8192 --enable-source-maps'
  });

  assert.deepEqual(buildChildEnv(source), {
    KEEP_ME: 'yes',
    NODE_OPTIONS: '--trace-warnings --enable-source-maps --max-old-space-size=1536'
  });
});

test('child environment preserves quoted unrelated Node option values', () => {
  const source = Object.freeze({
    NODE_OPTIONS: '--require "./fixtures/one  two.js" --max_old_space_size 8192'
  });

  assert.deepEqual(buildChildEnv(source), {
    NODE_OPTIONS: '--require "./fixtures/one  two.js" --max-old-space-size=1536'
  });
});

test('child environment removes inherited heap percentage limits in both spellings and forms', () => {
  const overrides = [
    '--max-old-space-size-percentage=95',
    '--max-old-space-size-percentage 95',
    '--max_old_space_size_percentage=95',
    '--max_old_space_size_percentage 95'
  ];

  for (const override of overrides) {
    assert.deepEqual(buildChildEnv({
      NODE_OPTIONS: `--trace-warnings ${override} --enable-source-maps`
    }), {
      NODE_OPTIONS: '--trace-warnings --enable-source-maps --max-old-space-size=1536'
    }, override);
  }
});

test('node test argv strips CLI heap-limit overrides in both spellings', () => {
  const heapOptionNames = [
    '--max-old-space-size',
    '--max-old-space_size',
    '--max-old_space-size',
    '--max-old_space_size',
    '--max_old-space-size',
    '--max_old-space_size',
    '--max_old_space-size',
    '--max_old_space_size'
  ];

  for (const optionName of heapOptionNames) {
    for (const override of [
      [`${optionName}=8192`],
      [optionName, '8192']
    ]) {
      assert.deepEqual(
        buildNodeTestArgs([...override, 'test/example.test.js']),
        ['--test', '--test-concurrency=2', 'test/example.test.js'],
        override.join(' ')
      );
    }
  }
});

test('node test argv strips heap percentage limits in both spellings and forms', () => {
  const overrides = [
    ['--max-old-space-size-percentage=95'],
    ['--max-old-space-size-percentage', '95'],
    ['--max_old_space_size_percentage=95'],
    ['--max_old_space_size_percentage', '95']
  ];

  for (const override of overrides) {
    assert.deepEqual(
      buildNodeTestArgs([...override, 'test/example.test.js']),
      ['--test', '--test-concurrency=2', 'test/example.test.js'],
      override.join(' ')
    );
  }
});

test('Linux runs tests once inside the configured hard systemd scope', () => {
  const { calls, spawnSyncImpl } = createRecorder([
    { status: 0 },
    { status: 0 }
  ]);

  const status = runNodeTests({
    argv: ['test/example.test.js', '--test-concurrency=12'],
    cwd: '/repo',
    env: { KEEP_ME: 'yes', NODE_OPTIONS: '--trace-warnings' },
    execPath: '/opt/node/bin/node',
    nodeVersion: '24.18.0',
    platform: 'linux',
    spawnSyncImpl,
    writeStderr: () => {}
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, '/usr/bin/systemd-run');
  assert.deepEqual(calls[1], {
    command: '/usr/bin/systemd-run',
    args: [
      '--user',
      '--scope',
      '--quiet',
      '--collect',
      '--property=MemoryAccounting=yes',
      '--property=MemoryHigh=4G',
      '--property=MemoryMax=6G',
      '--property=MemorySwapMax=512M',
      '--property=OOMPolicy=kill',
      '--',
      '/opt/node/bin/node',
      '--test',
      '--test-concurrency=2',
      'test/example.test.js'
    ],
    options: {
      cwd: '/repo',
      env: {
        KEEP_ME: 'yes',
        NODE_OPTIONS: '--trace-warnings --max-old-space-size=1536'
      },
      stdio: 'inherit'
    }
  });
});

test('a scoped test failure is returned without a direct rerun', () => {
  const { calls, spawnSyncImpl } = createRecorder([
    { status: 0 },
    { status: 17 }
  ]);

  const status = runNodeTests({
    argv: ['test/example.test.js'],
    cwd: '/repo',
    env: {},
    execPath: '/opt/node/bin/node',
    nodeVersion: '24.18.0',
    platform: 'linux',
    spawnSyncImpl,
    writeStderr: () => {}
  });

  assert.equal(status, 17);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].command, '/usr/bin/systemd-run');
});

test('Linux fails closed when the hard backend is unavailable', () => {
  const { calls, spawnSyncImpl } = createRecorder([{ status: 1 }]);
  const messages = [];

  const status = runNodeTests({
    argv: ['test/example.test.js'],
    cwd: '/repo',
    env: {},
    execPath: '/opt/node/bin/node',
    nodeVersion: '24.18.0',
    platform: 'linux',
    spawnSyncImpl,
    writeStderr: (message) => messages.push(message)
  });

  assert.equal(status, 78);
  assert.equal(calls.length, 1);
  assert.match(messages.join('\n'), /MC_TEST_ALLOW_SOFT_FALLBACK=1/u);
});

test('Linux soft fallback requires an explicit opt-in', () => {
  const { calls, spawnSyncImpl } = createRecorder([
    { status: 1 },
    { status: 0 }
  ]);
  const messages = [];

  const status = runNodeTests({
    argv: ['test/example.test.js'],
    cwd: '/repo',
    env: { MC_TEST_ALLOW_SOFT_FALLBACK: '1' },
    execPath: '/opt/node/bin/node',
    nodeVersion: '24.18.0',
    platform: 'linux',
    spawnSyncImpl,
    writeStderr: (message) => messages.push(message)
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, '/usr/bin/systemd-run');
  assert.equal(calls[1].command, '/opt/node/bin/node');
  assert.deepEqual(calls[1].args, [
    '--test',
    '--test-concurrency=2',
    'test/example.test.js'
  ]);
  assert.match(messages.join('\n'), /without a hard memory scope/iu);
});

test('malformed guard values fail usage before any process is spawned', () => {
  const malformedArgv = [
    ['--test-concurrency'],
    ['--test_concurrency'],
    ['--max-old-space-size'],
    ['--max_old_space_size'],
    ['--test-concurrency='],
    ['--test_concurrency='],
    ['--max-old-space-size='],
    ['--max_old_space_size='],
    ['--test-concurrency', 'test/only.test.js'],
    ['--test_concurrency', 'test/only.test.js'],
    ['--max-old-space-size', 'test/only.test.js'],
    ['--max_old_space_size', 'test/only.test.js'],
    ['--test-concurrency=not-a-number', 'test/only.test.js'],
    ['--test_concurrency=not-a-number', 'test/only.test.js'],
    ['--max-old-space-size=not-a-number', 'test/only.test.js'],
    ['--max_old_space_size=not-a-number', 'test/only.test.js'],
    ['--max_old-space_size', 'test/only.test.js'],
    ['--max-old_space-size=not-a-number', 'test/only.test.js']
  ];

  for (const argv of malformedArgv) {
    const { calls, spawnSyncImpl } = createRecorder([]);
    const messages = [];

    const status = runNodeTests({
      argv,
      cwd: '/repo',
      env: {},
      execPath: '/opt/node/bin/node',
      nodeVersion: '24.18.0',
      platform: 'linux',
      spawnSyncImpl,
      writeStderr: (message) => messages.push(message)
    });

    assert.equal(status, 64, argv.join(' '));
    assert.equal(calls.length, 0, argv.join(' '));
    assert.match(messages.join('\n'), /requires a numeric value/iu);
  }
});

test('non-Linux platforms use one warned soft run', () => {
  const { calls, spawnSyncImpl } = createRecorder([{ status: 3 }]);
  const messages = [];

  const status = runNodeTests({
    argv: ['test/example.test.js'],
    cwd: 'C:\\repo',
    env: {},
    execPath: 'C:\\node.exe',
    nodeVersion: '24.18.0',
    platform: 'win32',
    spawnSyncImpl,
    writeStderr: (message) => messages.push(message)
  });

  assert.equal(status, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'C:\\node.exe');
  assert.equal(calls[0].options.stdio, 'inherit');
  assert.match(messages.join('\n'), /without a hard memory scope/iu);
});

test('Node versions below 20 are rejected before spawning', () => {
  const { calls, spawnSyncImpl } = createRecorder([]);
  const messages = [];

  const status = runNodeTests({
    argv: [],
    cwd: '/repo',
    env: {},
    execPath: '/opt/node/bin/node',
    nodeVersion: '18.20.0',
    platform: 'linux',
    spawnSyncImpl,
    writeStderr: (message) => messages.push(message)
  });

  assert.equal(status, 64);
  assert.equal(calls.length, 0);
  assert.match(messages.join('\n'), /Node\.js 20 or newer/iu);
});

test('npm test is wired through the memory guard', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.scripts.test, 'node scripts/runNodeTests.js');
});
