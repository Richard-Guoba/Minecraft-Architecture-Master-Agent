import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import * as codexModule from '../src/llm/CodexClient.js';

const { CodexClient } = codexModule;
const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/fakeCodexCli.js');
const ROOT = path.resolve(import.meta.dirname, '..');

test('fake Codex fixture exits harmlessly when discovered without protocol arguments', () => {
  const result = spawnSync(process.execPath, [FIXTURE], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 2000
  });

  assert.equal(result.signal, null);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

async function fixture(t, scenario, { timeoutMs = 2000 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-client-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tracePath = path.join(root, 'trace.json');
  const commandPath = path.join(root, `fake-codex-${scenario}`);
  await fs.copyFile(FIXTURE, commandPath);
  await fs.chmod(commandPath, 0o700);
  return {
    root,
    tracePath,
    client: new CodexClient({
      command: commandPath,
      args: [
        'exec',
        '--sandbox',
        'read-only'
      ],
      cwd: ROOT,
      tempRoot: root,
      timeoutMs
    })
  };
}

test('uses stdin, read-only arguments, and final output without an invalid generic schema', async (t) => {
  const { client, root, tracePath } = await fixture(t, 'success');

  assert.deepEqual(await client.chatJson({
    system: 'SYSTEM_MARKER',
    user: { brief: 'USER_MARKER' }
  }), { ok: true });

  const trace = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.match(trace.input, /SYSTEM_MARKER/u);
  assert.match(trace.input, /USER_MARKER/u);
  assert.deepEqual(trace.args.slice(0, 3), ['exec', '--sandbox', 'read-only']);
  assert.equal(trace.args.includes('--ephemeral'), true);
  assert.deepEqual(trace.args.slice(trace.args.indexOf('--color'), trace.args.indexOf('--color') + 2), ['--color', 'never']);
  assert.equal(trace.args.includes('--output-schema'), false);
  assert.equal(trace.args.includes('-o'), true);
  assert.equal(trace.args.at(-1), '-');
  assert.equal(trace.schema, null);
  assert.equal(trace.schemaPath, undefined);
  assert.deepEqual((await fs.readdir(root)).sort(), ['fake-codex-success', 'trace.json']);
});

for (const scenario of ['missing', 'empty', 'malformed', 'array', 'primitive', 'oversized']) {
  test(`rejects ${scenario} final output as a protocol error`, async (t) => {
    const { client } = await fixture(t, scenario);

    await assert.rejects(client.chatJson({ system: 's', user: 'u' }), (error) => {
      assert.equal(error.name, 'CodexClientError');
      assert.equal(error.code, 'CODEX_PROTOCOL_INVALID');
      assert.equal(error.message, 'Codex CLI returned invalid JSON output.');
      return true;
    });
  });
}

test('exports the stable Codex provider error type', () => {
  assert.equal(typeof codexModule.CodexClientError, 'function');
});

test('enforces read-only ephemeral execution while retaining safe optional arguments', () => {
  const client = new CodexClient({
    args: ['exec', '--sandbox', 'read-only', '--ephemeral', '--color', 'always', '--model', 'test-model']
  });

  assert.deepEqual(client.args, [
    'exec', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '--model', 'test-model'
  ]);
});

test('rejects Codex arguments that bypass read-only execution or the output protocol', () => {
  for (const args of [
    ['exec', '--sandbox', 'workspace-write'],
    ['exec', '-s=danger-full-access'],
    ['exec', '--full-auto'],
    ['exec', '--dangerously-bypass-approvals-and-sandbox'],
    ['exec', '--add-dir', '/private/write-target'],
    ['exec', '-c', 'sandbox_mode="workspace-write"'],
    ['exec', '--output-schema', '/private/schema.json'],
    ['exec', '-o', '/private/output.json'],
    ['exec', '--'],
    ['exec', '-'],
    ['exec', 'resume', '--last'],
    ['exec', '--private-unknown-option']
  ]) {
    assert.throws(() => new CodexClient({ args }), (error) => {
      assert.equal(error.code, 'CODEX_CONFIGURATION_INVALID');
      assert.equal(error.message, 'Codex CLI arguments conflict with the enforced read-only JSON protocol.');
      assert.doesNotMatch(error.message, /private|workspace-write|danger-full-access/u);
      return true;
    });
  }
});

test('categorizes a missing executable without exposing its path', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-missing-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const client = new CodexClient({
    command: path.join(root, 'does-not-exist'),
    tempRoot: root
  });

  await assert.rejects(client.chatJson({
    system: 'private-system',
    user: 'private-user'
  }), (error) => {
    assert.equal(error.code, 'CODEX_UNAVAILABLE');
    assert.equal(error.message, 'Codex CLI is unavailable. Install it and ensure `codex` is on PATH.');
    assert.doesNotMatch(error.message, /private-|does-not-exist/u);
    return true;
  });
});

test('recognizes local authentication setup failure', async (t) => {
  const { client } = await fixture(t, 'auth');

  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), (error) => {
    assert.equal(error.code, 'CODEX_SETUP_REQUIRED');
    assert.match(error.message, /run `codex` in a terminal and sign in/iu);
    return true;
  });
});

test('bounds and sanitizes non-zero execution failures', async (t) => {
  const { client } = await fixture(t, 'failure');

  await assert.rejects(client.chatJson({
    system: 'SECRET_SYSTEM',
    user: 'SECRET_USER'
  }), (error) => {
    assert.equal(error.code, 'CODEX_EXECUTION_FAILED');
    assert.match(error.message, /exit code 7/u);
    assert.ok(error.diagnosticBytes <= 65536);
    assert.doesNotMatch(error.message, /SECRET|private prompt|xxxxx/u);
    return true;
  });
});

test('waits for and reaps a timed-out child before rejecting', async (t) => {
  const { client, root, tracePath } = await fixture(t, 'hang', { timeoutMs: 250 });

  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), (error) => {
    assert.equal(error.code, 'CODEX_TIMEOUT');
    assert.match(error.message, /250ms/u);
    return true;
  });

  const trace = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.throws(() => process.kill(trace.pid, 0), { code: 'ESRCH' });
  await fs.rm(tracePath, { force: true });
  assert.deepEqual(await fs.readdir(root), ['fake-codex-hang']);
});

test('terminates a timed-out process tree whose descendant retains stdio', async (t) => {
  const { client, tracePath } = await fixture(t, 'grandchild-hang', { timeoutMs: 150 });
  const startedAt = Date.now();

  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), { code: 'CODEX_TIMEOUT' });
  assert.ok(Date.now() - startedAt < 3000);

  const trace = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.equal(Number.isInteger(trace.descendantPid), true);
  assert.throws(() => process.kill(trace.pid, 0), { code: 'ESRCH' });
  assert.throws(() => process.kill(trace.descendantPid, 0), { code: 'ESRCH' });
});

test('forces tree cleanup when the direct child closes before a quiet descendant', async (t) => {
  const { client, tracePath } = await fixture(t, 'silent-grandchild-hang', { timeoutMs: 150 });
  const startedAt = Date.now();

  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), { code: 'CODEX_TIMEOUT' });
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 1000);
  assert.ok(elapsed < 3000);

  const trace = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.throws(() => process.kill(trace.pid, 0), { code: 'ESRCH' });
  assert.throws(() => process.kill(trace.descendantPid, 0), { code: 'ESRCH' });
});

test('waits for close after a post-spawn stream error', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-stream-error-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let closed = false;
  const child = fakeChild();
  const client = new CodexClient({
    tempRoot: root,
    timeoutMs: 1000,
    spawnImpl: () => {
      queueMicrotask(() => {
        child.emit('spawn');
        child.stdout.emit('error', new Error('private stream failure'));
        setTimeout(() => {
          closed = true;
          child.emit('close', 0);
        }, 25);
      });
      return child;
    }
  });

  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), (error) => {
    assert.equal(error.code, 'CODEX_EXECUTION_FAILED');
    assert.doesNotMatch(error.message, /private stream failure/u);
    return true;
  });
  assert.equal(closed, true);
});

test('a kill error cannot clear timeout cleanup before close', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-kill-error-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let closed = false;
  const child = fakeChild();
  child.kill = () => {
    queueMicrotask(() => child.emit('error', new Error('private kill race')));
    setTimeout(() => {
      closed = true;
      child.emit('close', null);
    }, 25);
    return false;
  };
  const client = new CodexClient({
    tempRoot: root,
    timeoutMs: 10,
    spawnImpl: () => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    }
  });

  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), { code: 'CODEX_TIMEOUT' });
  assert.equal(closed, true);
});

test('uses a ten-minute default timeout', () => {
  const client = new CodexClient();
  assert.equal(client.timeoutMs, 600000);
});

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 2147483646;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child;
}
