# Local Codex LLM Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run playbook:execute -- --mode llm --llm-provider codex "Build ..."` use the locally installed and authenticated Codex CLI as a strict, read-only LLM channel.

**Architecture:** The existing provider factory receives a request-scoped provider override, and every construction/P5 path forwards that override without mutating `process.env`. The existing `CodexClient` remains the sole adapter, but its child-process protocol is hardened around strict JSON output, bounded diagnostics, timeout termination, and cleanup. CLI validation makes explicit provider selection fail before artifact creation, while existing mock/default-off/replay behavior stays unchanged.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, `node:child_process`, `node:fs/promises`, Codex CLI `exec`

**Spec:** `docs/superpowers/specs/2026-08-29-local-codex-llm-channel-design.md`

## Global Constraints

- The public command is exactly `npm run playbook:execute -- --mode llm --llm-provider codex "Build ..."`.
- Explicit `codex` selection and `LLM_PROVIDER=codex` are fail-closed; only `auto` may fall back.
- Keep the existing `chatJson({ system, user })` agent contract.
- Spawn Codex directly with `shell: false`, pass the prompt through stdin, and retain `exec --sandbox read-only` defaults.
- Do not add a model option or model argument; use the local Codex default.
- Use `CODEX_COMMAND`, `CODEX_ARGS`, and a per-request default `CODEX_TIMEOUT_MS=600000`.
- Do not expose prompts, environment values, authentication material, or raw unbounded child output in errors.
- Do not make live Codex calls in automated tests.
- Preserve mock/default-off byte compatibility and provider-free deterministic replay.
- Add no runtime dependency.

## File Structure

- Modify `src/llm/createLlmClient.js`: validate normalized provider names, accept a request-scoped override, and make named Codex strict.
- Modify `src/llm/CodexClient.js`: own the safe Codex subprocess protocol and stable provider errors.
- Create `test/fixtures/fakeCodexCli.js`: emulate the small `codex exec` file/stdin protocol without network access.
- Create `test/codexClient.test.js`: verify subprocess behavior, failure categories, termination, bounded diagnostics, and cleanup.
- Modify `test/llmProvider.test.js`: verify strict factory selection, override precedence, and retained `auto` fallback.
- Modify `src/construction/designStages.js`: construct the selected provider for the normal construction workflow.
- Modify `src/pipeline.js`: forward the provider through single-candidate, multi-candidate, and P5 execution routes and reject incompatible direct API options early.
- Modify `src/playbook/execute/orchestrator.js`: pass the request-scoped provider to the P5 client factory.
- Modify `test/pipeline.test.js`: prove invalid direct selections fail before output and omitted-provider mock behavior remains unchanged.
- Modify `test/playbookExecuteOrchestrator.test.js`: prove P5 forwards the selected provider and mock/replay paths do not construct a client.
- Modify `src/index.js`: parse, validate, document, and forward `--llm-provider`.
- Modify `test/playbookExecuteCli.test.js`: verify the exact CLI contract, duplicates, invalid combinations, and pre-output failure.
- Modify `.env.example`: raise the documented Codex timeout default.
- Modify `README.md`: document local Codex prerequisites, command, trust boundary, and troubleshooting.
- Modify `docs/architecture-playbook/README.md`: add the P5 local-Codex execution example.
- Modify `docs/architecture-playbook/reports/p5-executable-design-layer.md`: record the new opt-in provider path without changing the P5 gate result.

---

### Task 1: Strict Provider Selection

**Files:**
- Modify: `test/llmProvider.test.js`
- Modify: `src/llm/createLlmClient.js`

**Interfaces:**
- Consumes: environment keys `LLM_PROVIDER`, `CODEX_COMMAND`, `CODEX_ARGS`, and `CODEX_TIMEOUT_MS`.
- Produces: `createLlmClient({ env, cwd, provider })`; exported `normalizeLlmProvider(value)`; exported frozen `LLM_PROVIDERS` list.

- [ ] **Step 1: Add failing factory tests for explicit override and strict Codex selection**

Append tests that inspect the selected client and force failures through `chatJson`:

```js
test('request provider override wins over LLM_PROVIDER', () => {
  const client = createLlmClient({
    provider: 'codex',
    env: {
      LLM_PROVIDER: 'zhipu',
      ZHIPU_API_KEY: 'must-not-be-selected',
      CODEX_COMMAND: 'missing-codex-for-selection-test'
    },
    cwd: process.cwd()
  });
  assert.equal(client.name, 'codex');
  assert.equal('clients' in client, false);
});

test('environment-selected Codex is fail-closed', () => {
  const client = createLlmClient({
    env: {
      LLM_PROVIDER: 'codex',
      CODEX_COMMAND: 'missing-codex-for-selection-test',
      ZHIPU_API_KEY: 'must-not-be-used'
    },
    cwd: process.cwd()
  });
  assert.equal(client.name, 'codex');
  assert.equal('clients' in client, false);
});

test('auto remains the only fallback policy', () => {
  const client = createLlmClient({
    provider: 'auto',
    env: { ZHIPU_API_KEY: 'configured-api' },
    cwd: process.cwd()
  });
  assert.match(client.name, /^codex -> zhipu$/u);
  assert.equal(Array.isArray(client.clients), true);
});

test('normalizes provider aliases and rejects unsupported overrides', () => {
  assert.equal(normalizeLlmProvider(' OPENAI_COMPATIBLE '), 'openai-compatible');
  assert.deepEqual(LLM_PROVIDERS, ['auto', 'codex', 'openai', 'openai-compatible', 'zhipu']);
  assert.throws(
    () => createLlmClient({ provider: 'private-provider-value', env: {} }),
    /Unsupported LLM provider: private-provider-value/u
  );
});
```

Update imports to include `LLM_PROVIDERS` and `normalizeLlmProvider`.

- [ ] **Step 2: Run the provider tests and confirm the new contract fails**

Run:

```bash
node --test test/llmProvider.test.js
```

Expected: FAIL because `provider` is ignored, Codex returns a `FallbackLlmClient`, and the new exports do not exist.

- [ ] **Step 3: Implement normalized request-scoped selection**

Refactor the factory around this public shape:

```js
export const LLM_PROVIDERS = Object.freeze([
  'auto', 'codex', 'openai', 'openai-compatible', 'zhipu'
]);

export function createLlmClient({
  env = process.env,
  cwd = process.cwd(),
  provider
} = {}) {
  const selected = normalizeLlmProvider(provider === undefined
    ? env.LLM_PROVIDER || 'zhipu'
    : provider);
  assertSupportedProvider(selected, provider === undefined ? env.LLM_PROVIDER : provider);

  if (selected === 'zhipu') return createZhipuClient(env);
  if (selected === 'openai' || selected === 'openai-compatible') {
    return createOpenAiCompatibleClient(env);
  }
  if (selected === 'codex') return createCodexClient(env, cwd);
  return new FallbackLlmClient([
    createCodexClient(env, cwd),
    createConfiguredApiClient(env)
  ]);
}

export function normalizeLlmProvider(value) {
  return String(value).trim().toLowerCase().replace(/_/gu, '-');
}

function assertSupportedProvider(provider, original) {
  if (!LLM_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported LLM provider: ${String(original)}`);
  }
}
```

Remove the old Codex fallback branch and old private `normalizeProvider`. Keep `FallbackLlmClient` private and retain the existing `auto` order.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node --test test/llmProvider.test.js
```

Expected: PASS; the existing default-Zhipu and API-provider tests also remain green.

- [ ] **Step 5: Commit the strict factory**

```bash
git add src/llm/createLlmClient.js test/llmProvider.test.js
git commit -m "feat: make Codex provider selection strict"
```

---

### Task 2: Harden the Codex Subprocess Adapter

**Files:**
- Create: `test/fixtures/fakeCodexCli.js`
- Create: `test/codexClient.test.js`
- Modify: `src/llm/CodexClient.js`

**Interfaces:**
- Consumes: `new CodexClient({ command, args, timeoutMs, cwd, tempRoot })` and `chatJson({ system, user })`.
- Produces: a top-level JSON object or `CodexClientError` with one of `CODEX_UNAVAILABLE`, `CODEX_SETUP_REQUIRED`, `CODEX_TIMEOUT`, `CODEX_EXECUTION_FAILED`, `CODEX_PROTOCOL_INVALID`.

- [ ] **Step 1: Create a deterministic fake Codex executable**

Create `test/fixtures/fakeCodexCli.js` with an argument-driven protocol:

```js
#!/usr/bin/env node
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const scenario = valueAfter('--scenario') || 'success';
const outputPath = valueAfter('-o');
const schemaPath = valueAfter('--output-schema');
const tracePath = valueAfter('--trace');
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

if (tracePath) {
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  await fs.writeFile(tracePath, JSON.stringify({ args, input, schema }), 'utf8');
}
if (scenario === 'hang') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (scenario === 'auth') {
  process.stderr.write('not logged in; run codex login');
  process.exitCode = 1;
} else if (scenario === 'failure') {
  process.stderr.write(`private prompt must not leak: ${input}\n${'x'.repeat(100000)}`);
  process.exitCode = 7;
} else if (scenario === 'missing') {
  // Exit successfully without creating the final output file.
} else if (scenario === 'empty') {
  await fs.writeFile(outputPath, '', 'utf8');
} else if (scenario === 'malformed') {
  await fs.writeFile(outputPath, '{not-json', 'utf8');
} else if (scenario === 'array') {
  await fs.writeFile(outputPath, '[]', 'utf8');
} else {
  await fs.writeFile(outputPath, JSON.stringify({ ok: true }), 'utf8');
}
```

The fake only writes files supplied by the test and makes no network calls.

- [ ] **Step 2: Write failing success-path and protocol tests**

Create `test/codexClient.test.js` with shared temporary roots and this core coverage:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CodexClient, CodexClientError } from '../src/llm/CodexClient.js';

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/fakeCodexCli.js');

async function fixture(t, scenario, extraArgs = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-client-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tracePath = path.join(root, 'trace.json');
  return {
    root,
    tracePath,
    client: new CodexClient({
      command: process.execPath,
      args: [FIXTURE, 'exec', '--sandbox', 'read-only', '--scenario', scenario, '--trace', tracePath, ...extraArgs],
      cwd: path.resolve(import.meta.dirname, '..'),
      tempRoot: root,
      timeoutMs: 2000
    })
  };
}

test('uses stdin, output schema, final output file, and returns an object', async (t) => {
  const { client, tracePath } = await fixture(t, 'success');
  assert.deepEqual(await client.chatJson({ system: 'SYSTEM_MARKER', user: { brief: 'USER_MARKER' } }), { ok: true });
  const trace = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.match(trace.input, /SYSTEM_MARKER/u);
  assert.match(trace.input, /USER_MARKER/u);
  assert.equal(trace.args.includes('--output-schema'), true);
  assert.equal(trace.args.includes('-o'), true);
  assert.deepEqual(trace.args.slice(0, 3), ['exec', '--sandbox', 'read-only']);
  assert.equal(trace.args.at(-1), '-');
  assert.equal(trace.schema.type, 'object');
});

for (const scenario of ['missing', 'empty', 'malformed', 'array']) {
  test(`rejects ${scenario} final output as a protocol error`, async (t) => {
    const { client } = await fixture(t, scenario);
    await assert.rejects(client.chatJson({ system: 's', user: 'u' }), (error) => {
      assert.equal(error instanceof CodexClientError, true);
      assert.equal(error.code, 'CODEX_PROTOCOL_INVALID');
      assert.doesNotMatch(error.message, /SYSTEM_MARKER|USER_MARKER|not-json/u);
      return true;
    });
  });
}
```

- [ ] **Step 3: Write failing process-failure, timeout, and cleanup tests**

Add these cases to the same file:

```js
test('categorizes a missing executable without exposing the OS error body', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-missing-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const client = new CodexClient({ command: path.join(root, 'does-not-exist'), tempRoot: root });
  await assert.rejects(client.chatJson({ system: 'private-system', user: 'private-user' }), (error) => {
    assert.equal(error.code, 'CODEX_UNAVAILABLE');
    assert.match(error.message, /Codex CLI is unavailable/u);
    assert.doesNotMatch(error.message, /private-|does-not-exist/u);
    return true;
  });
});

test('recognizes local authentication setup failure', async (t) => {
  const { client } = await fixture(t, 'auth');
  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), {
    code: 'CODEX_SETUP_REQUIRED'
  });
});

test('bounds and sanitizes non-zero execution failures', async (t) => {
  const { client } = await fixture(t, 'failure');
  await assert.rejects(client.chatJson({ system: 'SECRET_SYSTEM', user: 'SECRET_USER' }), (error) => {
    assert.equal(error.code, 'CODEX_EXECUTION_FAILED');
    assert.match(error.message, /exit code 7/u);
    assert.ok(error.diagnosticBytes <= 65536);
    assert.doesNotMatch(error.message, /SECRET|private prompt|xxxxx/u);
    return true;
  });
});

test('terminates a timed-out child and removes its request directory', async (t) => {
  const { client, root, tracePath } = await fixture(t, 'hang');
  client.timeoutMs = 50;
  await assert.rejects(client.chatJson({ system: 's', user: 'u' }), {
    code: 'CODEX_TIMEOUT'
  });
  await fs.rm(tracePath, { force: true });
  assert.deepEqual((await fs.readdir(root)).sort(), []);
});

test('removes request directories after success and protocol failure', async (t) => {
  for (const scenario of ['success', 'malformed']) {
    const { client, root, tracePath } = await fixture(t, scenario);
    await client.chatJson({ system: 's', user: 'u' }).catch(() => {});
    await fs.rm(tracePath, { force: true });
    assert.deepEqual(await fs.readdir(root), []);
  }
});
```

Adjust the fake so its trace is written outside the client's generated `mc-architect-codex-*` request directory; cleanup assertions remove the trace before checking the root.

- [ ] **Step 4: Run the new tests and verify they fail against the partial adapter**

Run:

```bash
node --test test/codexClient.test.js
```

Expected: FAIL because the current adapter repairs console JSON, accepts non-object values, exposes raw stderr, rejects before reaping on timeout, lacks stable error codes, and has no injectable temporary root.

- [ ] **Step 5: Implement stable errors, strict output parsing, and private temporary storage**

Replace `parseJsonContent` fallback use and add the following public error/type boundary:

```js
const DEFAULT_TIMEOUT_MS = 600000;
const MAX_DIAGNOSTIC_BYTES = 65536;
const TERMINATION_GRACE_MS = 1000;

export class CodexClientError extends Error {
  constructor(code, message, { cause, diagnosticBytes = 0 } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CodexClientError';
    this.code = code;
    this.diagnosticBytes = diagnosticBytes;
  }
}
```

Add `tempRoot = os.tmpdir()` to the constructor, create the request directory under it, write the schema with mode `0o600`, read only `response.json`, call `JSON.parse`, and require `value !== null && typeof value === 'object' && !Array.isArray(value)`. Map every missing/empty/parse/type failure to:

```js
throw new CodexClientError(
  'CODEX_PROTOCOL_INVALID',
  'Codex CLI returned invalid JSON output.'
);
```

Do not fall back to stdout or `parseJsonContent`.

- [ ] **Step 6: Implement bounded capture and child termination that settles once**

Implement `runProcess` with explicit state and rejection only after close for a timed-out child:

```js
function runProcess(command, args, { cwd, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let forceTimer;
    let timer;
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      callback();
    };
    timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), TERMINATION_GRACE_MS);
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', (cause) => finish(() => reject(new CodexClientError(
      'CODEX_UNAVAILABLE',
      'Codex CLI is unavailable. Install it and ensure `codex` is on PATH.',
      { cause }
    ))));
    child.on('close', (code) => finish(() => {
      const diagnosticBytes = stdout.length + stderr.length;
      if (timedOut) {
        reject(new CodexClientError('CODEX_TIMEOUT', `Codex CLI timed out after ${timeoutMs}ms.`, { diagnosticBytes }));
      } else if (code === 0) {
        resolve({ stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
      } else if (looksLikeSetupFailure(stderr.toString('utf8'))) {
        reject(new CodexClientError('CODEX_SETUP_REQUIRED', 'Codex CLI authentication/setup is required. Run `codex` in a terminal and sign in.', { diagnosticBytes }));
      } else {
        reject(new CodexClientError('CODEX_EXECUTION_FAILED', `Codex CLI execution failed (exit code ${code}).`, { diagnosticBytes }));
      }
    }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function appendBounded(current, chunk) {
  if (current.length >= MAX_DIAGNOSTIC_BYTES) return current;
  return Buffer.concat([current, Buffer.from(chunk)])
    .subarray(0, MAX_DIAGNOSTIC_BYTES);
}

function looksLikeSetupFailure(stderr) {
  return /(?:not logged in|log in|login|sign in|authentication|credentials)/iu.test(stderr);
}
```

Ensure declarations avoid the timer temporal-dead-zone by declaring `let timer` before `finish`, then assigning it after listeners/state are initialized. If `child.stdin` emits `EPIPE` after an early exit, let the child `close` event own the categorized failure.

- [ ] **Step 7: Run Codex and provider tests**

Run:

```bash
node --test test/codexClient.test.js test/llmProvider.test.js
```

Expected: PASS with no live `codex` process and no network traffic.

- [ ] **Step 8: Commit the hardened adapter**

```bash
git add src/llm/CodexClient.js test/codexClient.test.js test/fixtures/fakeCodexCli.js
git commit -m "feat: harden local Codex subprocess adapter"
```

---

### Task 3: Propagate the Provider Through Every Execution Route

**Files:**
- Modify: `test/pipeline.test.js`
- Modify: `test/playbookExecuteOrchestrator.test.js`
- Modify: `src/pipeline.js`
- Modify: `src/construction/designStages.js`
- Modify: `src/playbook/execute/orchestrator.js`

**Interfaces:**
- Consumes: optional normalized `llmProvider` on `runPipeline`, `runCandidatePipeline`, `runConstructionWorkflow`/`prepareConstructionDesign`, and `runExecutablePlaybookPipeline` options.
- Produces: `createLlmClient({ cwd, provider: llmProvider })` in normal construction; `deps.createClient({ cwd: projectRoot, provider: normalized.llmProvider })` in P5.

- [ ] **Step 1: Add a failing P5 forwarding test**

Add a focused orchestrator test whose design dependency stops immediately after client construction:

```js
test('execute orchestration forwards the request-scoped LLM provider', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-provider-forward-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const calls = [];
  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute',
    prompt: 'Build a medieval gatehouse',
    mode: 'llm',
    llmProvider: 'codex',
    outRoot,
    cwd: path.resolve(import.meta.dirname, '..')
  }, {
    createClient: (options) => {
      calls.push(options);
      throw Object.assign(new Error('private dependency stop'), { code: 'P5_AUTHORITY_INVALID' });
    }
  }), { code: 'P5_AUTHORITY_INVALID' });
  assert.deepEqual(calls, [{
    cwd: path.resolve(import.meta.dirname, '..'),
    provider: 'codex'
  }]);
});
```

Also retain or add an assertion in the mock execute tests that `createClient` has zero calls when `mode: 'mock'`.

- [ ] **Step 2: Add failing direct-pipeline pre-output validation tests**

In `test/pipeline.test.js`, add:

```js
test('rejects unsupported or mode-incompatible provider selection before output', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-provider-invalid-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  for (const [mode, llmProvider] of [
    ['mock', 'codex'],
    ['auto', 'codex'],
    ['llm', 'private-provider']
  ]) {
    const outRoot = path.join(parent, `${mode}-${llmProvider}`);
    await assert.rejects(runPipeline({
      prompt: 'Build a gatehouse', mode, llmProvider, outRoot
    }));
    await assert.rejects(fs.access(outRoot), { code: 'ENOENT' });
  }
});
```

- [ ] **Step 3: Run the focused tests and confirm provider data is currently lost**

Run:

```bash
node --test test/pipeline.test.js test/playbookExecuteOrchestrator.test.js
```

Expected: FAIL because none of the current function signatures forwards `llmProvider` and invalid selections are not rejected before directories are created.

- [ ] **Step 4: Add early direct-API validation and thread the option through `src/pipeline.js`**

Import `LLM_PROVIDERS` and `normalizeLlmProvider`. At the beginning of both exported pipeline functions normalize a supplied value and reject it unless the mode is exactly `llm`:

```js
function validateLlmProviderOption({ mode, llmProvider, playbook }) {
  if (llmProvider === undefined) return undefined;
  const normalized = normalizeLlmProvider(llmProvider);
  if (!LLM_PROVIDERS.includes(normalized) || mode !== 'llm') {
    if (playbook === 'execute') {
      throw Object.assign(new Error('P5_OPTIONS_INCOMPATIBLE'), { code: 'P5_OPTIONS_INCOMPATIBLE' });
    }
    throw new Error('Explicit --llm-provider requires --mode llm and a supported provider.');
  }
  return normalized;
}
```

Add `llmProvider` to `runPipeline` and `runCandidatePipeline` destructuring. Compute `selectedLlmProvider` before any call that creates an output directory. Forward it as `llmProvider: selectedLlmProvider` to:

- `runExecutablePlaybookPipeline` in both P5 branches.
- `runCandidatePipeline` from `runPipeline`.
- Every `runConstructionWorkflow` invocation.

- [ ] **Step 5: Construct the selected provider in normal and P5 design paths**

In `prepareConstructionDesign`, accept `llmProvider` and change client construction to:

```js
const llmClient = injectedLlmClient || createLlmClient({
  cwd,
  provider: llmProvider
});
```

In `executeCandidate`, change the non-mock client construction to:

```js
const client = normalized.mode === 'mock'
  ? undefined
  : deps.createClient({ cwd: projectRoot, provider: normalized.llmProvider });
```

Do not add `llmProvider` to the frozen generator context. The context already records the actual `llm_provider` name produced by the selected client, so artifact schemas and replay inputs remain unchanged.

- [ ] **Step 6: Run pipeline, orchestrator, replay, and off-compatibility tests**

Run:

```bash
node --test test/pipeline.test.js test/playbookExecuteOrchestrator.test.js test/playbookExecuteReplay.test.js test/playbookExecuteOffCompatibility.test.js
```

Expected: PASS. Replay tests must show no provider construction, and the off-compatibility fixture hashes must be unchanged.

- [ ] **Step 7: Commit provider propagation**

```bash
git add src/pipeline.js src/construction/designStages.js src/playbook/execute/orchestrator.js test/pipeline.test.js test/playbookExecuteOrchestrator.test.js
git commit -m "feat: route selected LLM provider through workflows"
```

---

### Task 4: Add the Terminal `--llm-provider codex` Contract

**Files:**
- Modify: `test/playbookExecuteCli.test.js`
- Modify: `src/index.js`

**Interfaces:**
- Consumes: argv pair `--llm-provider <auto|codex|openai|openai-compatible|zhipu>`.
- Produces: normalized `options.llmProvider`, forwarded to `runPipelineImpl({ llmProvider })`; stable P5 rejection `P5_OPTIONS_INCOMPATIBLE` for invalid execute commands.

- [ ] **Step 1: Add a failing exact-command forwarding test**

Import no real provider. Use `runCli` dependency injection so the test is offline:

```js
test('execute CLI forwards the exact local Codex provider command', async () => {
  let received;
  const errors = [];
  const originalLog = console.log;
  console.log = () => {};
  try {
    const status = await runCli({
      argv: ['--playbook', 'execute', '--mode', 'llm', '--llm-provider', 'codex', PROMPT],
      runPipelineImpl: async (options) => {
        received = options;
        return {
          playbookExecution: {
            candidate_count: 3,
            selected_candidate_id: 'candidate-01',
            selected_chain_sha256: 'a'.repeat(64),
            repair_attempt_count: 0,
            candidates: [{ candidate_id: 'candidate-01', eligibility: { status: 'eligible' } }]
          }
        };
      },
      writeError: (value) => errors.push(value)
    });
    assert.equal(status, 0);
    assert.equal(received.mode, 'llm');
    assert.equal(received.llmProvider, 'codex');
    assert.deepEqual(errors, []);
  } finally {
    console.log = originalLog;
  }
});
```

- [ ] **Step 2: Extend invalid CLI tables for missing, duplicate, unsupported, and incompatible provider flags**

Add the following P5 argv cases to the existing pre-output rejection table:

```js
['--playbook', 'execute', '--mode', 'llm', '--llm-provider'],
['--playbook', 'execute', '--mode', 'llm', '--llm-provider', 'private-provider'],
['--playbook', 'execute', '--mode', 'mock', '--llm-provider', 'codex'],
['--playbook', 'execute', '--mode', 'auto', '--llm-provider', 'codex'],
['--playbook', 'execute', '--mode', 'llm', '--llm-provider', 'codex', '--llm-provider', 'codex']
```

Add `['--llm-provider', 'codex', '--llm-provider', 'codex']` to the execute singleton-alias table. Each case must still assert empty stdout, only `P5_OPTIONS_INCOMPATIBLE` on stderr, and an empty output directory.

- [ ] **Step 3: Add a failing help-text test using the real CLI process**

```js
test('CLI help documents the local Codex provider selector', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], {
    cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 30000
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--llm-provider .*codex/u);
  assert.match(result.stdout, /local authenticated Codex CLI/iu);
});
```

- [ ] **Step 4: Run the CLI tests and verify the option is currently unknown**

Run:

```bash
node --test test/playbookExecuteCli.test.js
```

Expected: FAIL because `--llm-provider` is currently rejected as unknown and absent from help.

- [ ] **Step 5: Parse and validate one provider flag before workflow execution**

Import `LLM_PROVIDERS` and `normalizeLlmProvider` from the provider factory. Add `llmProvider: undefined` to the initial options and track a `llmProviderSeen` boolean. In the parse loop:

```js
} else if (arg === '--llm-provider') {
  if (llmProviderSeen) throw new Error('Duplicate --llm-provider option.');
  llmProviderSeen = true;
  const value = argv[++i];
  if (!value || value.startsWith('--')) throw new Error('--llm-provider requires a value.');
  const normalized = normalizeLlmProvider(value);
  if (!LLM_PROVIDERS.includes(normalized)) throw new Error(`Unsupported LLM provider: ${value}`);
  options.llmProvider = normalized;
```

After parsing arguments and before returning:

```js
if (options.llmProvider !== undefined && options.mode !== 'llm') {
  throw new Error('--llm-provider requires --mode llm.');
}
```

Add `'--llm-provider': 'llm-provider'` to `assertExecuteSingletonOptions`. This preserves stable P5 error translation while giving non-P5 commands a clear normal CLI error.

- [ ] **Step 6: Forward and document the option in `src/index.js`**

Add this property to the `runPipelineImpl` call:

```js
llmProvider: options.llmProvider,
```

Update help with:

```text
  --llm-provider <provider>  Select auto, codex, openai, openai-compatible, or zhipu. With codex, use the local authenticated Codex CLI; requires --mode llm.
```

Update the API/help footer to mention both configured API providers and local Codex instead of saying LLM mode is API-only.

- [ ] **Step 7: Run CLI and compatibility tests**

Run:

```bash
node --test test/playbookExecuteCli.test.js test/playbookExecuteOffCompatibility.test.js
```

Expected: PASS, including the exact opt-in command and unchanged off/omitted output comparison.

- [ ] **Step 8: Commit the public CLI contract**

```bash
git add src/index.js test/playbookExecuteCli.test.js
git commit -m "feat: expose local Codex provider in CLI"
```

---

### Task 5: Configuration, Documentation, and Full Verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/architecture-playbook/README.md`
- Modify: `docs/architecture-playbook/reports/p5-executable-design-layer.md`

**Interfaces:**
- Consumes: completed CLI and environment contract from Tasks 1-4.
- Produces: user-facing setup, execution, trust, troubleshooting, and manual-smoke instructions.

- [ ] **Step 1: Update the example timeout without changing the default provider**

Change only this Codex line in `.env.example`:

```dotenv
CODEX_TIMEOUT_MS=600000
```

Keep `LLM_PROVIDER=zhipu`, so users who do not opt into Codex retain existing behavior.

- [ ] **Step 2: Add the local Codex quick start and trust boundary to `README.md`**

Immediately after the existing API-backed LLM example, add:

````markdown
To use your locally installed and authenticated Codex CLI for the P5 design loop:

```bash
codex
npm run playbook:execute -- --mode llm --llm-provider codex "Build a compact medieval stone gatehouse"
```

The first command is a setup check: complete local sign-in if Codex requests it, then exit the interactive session. The workflow uses `codex exec --sandbox read-only`, sends each agent prompt through standard input, and uses the model selected by your local Codex configuration. Codex cannot modify the repository through this channel, but prompt context is sent through your logged-in Codex service account.

If the command fails, check the reported category:

- `CODEX_UNAVAILABLE`: install Codex or put `codex` on `PATH`.
- `CODEX_SETUP_REQUIRED`: run `codex` and complete sign-in.
- `CODEX_TIMEOUT`: increase `CODEX_TIMEOUT_MS`; the default is 600000 ms per request.
- `CODEX_EXECUTION_FAILED`: run `codex` directly to verify the local installation.
- `CODEX_PROTOCOL_INVALID`: update Codex and retry; the workflow requires a JSON object.
````

- [ ] **Step 3: Update Architecture Playbook documentation**

Add the exact Codex command to `docs/architecture-playbook/README.md` beside the mock P5 command. Add a short “Local Codex channel” section to `docs/architecture-playbook/reports/p5-executable-design-layer.md` stating:

````markdown
## Local Codex channel

P5 can opt into the locally authenticated Codex CLI without changing its artifact, eligibility, repair, or replay contracts:

```bash
npm run playbook:execute -- --mode llm --llm-provider codex "Build a compact medieval stone gatehouse"
```

Explicit Codex selection is fail-closed. Deterministic replay remains LLM-free, and the checked-in P5 gate continues to use deterministic mock fixtures rather than a live service.
````

- [ ] **Step 4: Run formatting and focused regression checks**

Run:

```bash
git diff --check
node --test test/codexClient.test.js test/llmProvider.test.js test/pipeline.test.js test/playbookExecuteCli.test.js test/playbookExecuteOrchestrator.test.js test/playbookExecuteReplay.test.js test/playbookExecuteOffCompatibility.test.js
```

Expected: `git diff --check` exits 0 and every focused test passes.

- [ ] **Step 5: Run the complete automated suite**

Run:

```bash
npm test -- --test-reporter=dot
```

Expected: exit code 0. No automated test launches the real `codex` executable or requires network access.

- [ ] **Step 6: Inspect the final diff for scope and secret safety**

Run:

```bash
git status --short
git diff --stat
git diff -- .env.example README.md docs/architecture-playbook/README.md docs/architecture-playbook/reports/p5-executable-design-layer.md
rg -n "SECRET_|PRIVATE_|API_KEY=.*[^=]$" src test README.md docs/architecture-playbook .env.example
```

Expected: only the planned files are modified; documentation contains no credential; any `SECRET_`/`PRIVATE_` strings occur only in tests that assert redaction; `.env.example` contains empty API-key values.

- [ ] **Step 7: Commit configuration and documentation**

```bash
git add .env.example README.md docs/architecture-playbook/README.md docs/architecture-playbook/reports/p5-executable-design-layer.md
git commit -m "docs: explain local Codex workflow channel"
```

- [ ] **Step 8: Perform the optional real-Codex smoke test only with user authorization**

First check local availability without exposing configuration:

```bash
command -v codex
codex --version
```

If the user authorizes a live account/network call, run:

```bash
npm run playbook:execute -- --mode llm --llm-provider codex "Build a compact medieval stone gatehouse"
```

Expected: `playbook_status=complete` with stable P5 authority fields. If live execution is not authorized, record it as “not run (optional external smoke)” rather than treating it as an automated-suite failure.

---

## Final Verification Checklist

- [ ] `git diff --check` passes.
- [ ] Focused provider, Codex process, pipeline, CLI, P5, replay, and compatibility tests pass.
- [ ] The full `npm test -- --test-reporter=dot` suite passes.
- [ ] `--help` names `codex` and explains the local authenticated CLI requirement.
- [ ] Explicit Codex creates a raw `CodexClient`; `auto` alone owns fallback.
- [ ] No code adds a Codex model override.
- [ ] No prompt or raw child output appears in provider error messages.
- [ ] Mock/off artifacts and deterministic replay remain unchanged.
- [ ] The real-Codex smoke test is either successful or explicitly recorded as optional/not run.
