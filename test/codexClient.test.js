import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as codexModule from '../src/llm/CodexClient.js';

const { CodexClient } = codexModule;
const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/fakeCodexCli.js');
const ROOT = path.resolve(import.meta.dirname, '..');

async function fixture(t, scenario, { timeoutMs = 2000 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-client-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tracePath = path.join(root, 'trace.json');
  return {
    root,
    tracePath,
    client: new CodexClient({
      command: process.execPath,
      args: [
        FIXTURE,
        'exec',
        '--sandbox',
        'read-only',
        '--scenario',
        scenario,
        '--trace',
        tracePath
      ],
      cwd: ROOT,
      tempRoot: root,
      timeoutMs
    })
  };
}

test('uses stdin, read-only arguments, output schema, and final output file', async (t) => {
  const { client, root, tracePath } = await fixture(t, 'success');

  assert.deepEqual(await client.chatJson({
    system: 'SYSTEM_MARKER',
    user: { brief: 'USER_MARKER' }
  }), { ok: true });

  const trace = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.match(trace.input, /SYSTEM_MARKER/u);
  assert.match(trace.input, /USER_MARKER/u);
  assert.deepEqual(trace.args.slice(0, 3), ['exec', '--sandbox', 'read-only']);
  assert.equal(trace.args.includes('--output-schema'), true);
  assert.equal(trace.args.includes('-o'), true);
  assert.equal(trace.args.at(-1), '-');
  assert.equal(trace.schema.type, 'object');
  assert.equal(path.dirname(trace.schemaPath).startsWith(root), true);
  assert.deepEqual(await fs.readdir(root), ['trace.json']);
});

for (const scenario of ['missing', 'empty', 'malformed', 'array', 'primitive']) {
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
  assert.deepEqual(await fs.readdir(root), []);
});

test('uses a ten-minute default timeout', () => {
  const client = new CodexClient();
  assert.equal(client.timeoutMs, 600000);
});
