import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ENFORCED_CODEX_ARGS = Object.freeze([
  'exec', '--sandbox', 'read-only', '--ephemeral', '--color', 'never'
]);
const DEFAULT_TIMEOUT_MS = 600000;
const MAX_DIAGNOSTIC_BYTES = 65536;
const MAX_STREAM_DIAGNOSTIC_BYTES = MAX_DIAGNOSTIC_BYTES / 2;
const MAX_RESPONSE_BYTES = 1048576;
const TERMINATION_GRACE_MS = 1000;
const TERMINATION_REAP_MS = 1000;
const TERMINATION_POLL_MS = 20;
const SAFE_VALUE_OPTIONS = new Set(['--model', '-m', '--profile', '-p', '--local-provider']);
const SAFE_BOOLEAN_OPTIONS = new Set([
  '--oss', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--strict-config', '--search', '--json'
]);

export class CodexClientError extends Error {
  constructor(code, message, { cause, diagnosticBytes = 0 } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CodexClientError';
    this.code = code;
    this.diagnosticBytes = diagnosticBytes;
  }
}

export class CodexClient {
  constructor({
    command = process.env.CODEX_COMMAND || 'codex',
    args = process.env.CODEX_ARGS,
    timeoutMs = process.env.CODEX_TIMEOUT_MS,
    cwd = process.cwd(),
    tempRoot = os.tmpdir(),
    spawnImpl = spawn
  } = {}) {
    this.name = 'codex';
    this.command = command;
    this.args = normalizeArgs(args);
    this.timeoutMs = normalizeTimeout(timeoutMs);
    this.cwd = cwd;
    this.tempRoot = tempRoot;
    this.spawnImpl = spawnImpl;
  }

  isConfigured() {
    return Boolean(this.command && this.args.length);
  }

  async chatJson({ system, user }) {
    if (!this.isConfigured()) {
      throw unavailableError();
    }

    const tempDir = await fs.mkdtemp(path.join(this.tempRoot, 'mc-architect-codex-'));
    try {
      const schemaPath = path.join(tempDir, 'response.schema.json');
      const outputPath = path.join(tempDir, 'response.json');
      await fs.writeFile(schemaPath, JSON.stringify(responseSchema(), null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });

      const prompt = buildPrompt(system, user);
      const args = [
        ...this.args,
        '--output-schema',
        schemaPath,
        '-o',
        outputPath,
        '-'
      ];

      await runProcess(this.command, args, {
        cwd: this.cwd,
        input: prompt,
        timeoutMs: this.timeoutMs,
        spawnImpl: this.spawnImpl
      });

      return await readJsonObject(outputPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

function responseSchema() {
  return {
    type: 'object',
    description: 'A strict JSON object for the Minecraft architect workflow.',
    additionalProperties: true
  };
}

function buildPrompt(system, user) {
  const userText = typeof user === 'string' ? user : JSON.stringify(user, null, 2);
  return [
    system,
    '',
    '用户输入/上下文：',
    userText,
    '',
    '只输出一个严格 JSON object。不要 Markdown，不要解释。'
  ].join('\n');
}

function normalizeArgs(args) {
  const parsed = Array.isArray(args) ? [...args] : splitArgs(args || '');
  if (parsed[0] === 'exec') parsed.shift();
  if (parsed.includes('exec')) throw configurationError();

  const extras = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const argument = parsed[index];
    if (argument === '--sandbox' || argument === '-s') {
      if (parsed[index + 1] !== 'read-only') throw configurationError();
      index += 1;
      continue;
    }
    if (argument.startsWith('--sandbox=') || argument.startsWith('-s=')) {
      if (argument.slice(argument.indexOf('=') + 1) !== 'read-only') throw configurationError();
      continue;
    }
    if (/^-s.+/u.test(argument)) {
      if (argument !== '-sread-only') throw configurationError();
      continue;
    }
    if (argument === '--ephemeral') continue;
    if (argument === '--color') {
      if (!parsed[index + 1]) throw configurationError();
      index += 1;
      continue;
    }
    if (argument.startsWith('--color=')) continue;
    if (isForbiddenArgument(argument)) throw configurationError();
    if (argument === '-c' || argument === '--config') {
      const config = parsed[index + 1];
      if (!config || isUnsafeConfigOverride(config)) throw configurationError();
      extras.push(argument, config);
      index += 1;
      continue;
    }
    if (argument.startsWith('-c=') || argument.startsWith('--config=')) {
      const config = argument.slice(argument.indexOf('=') + 1);
      if (!config || isUnsafeConfigOverride(config)) throw configurationError();
      extras.push(argument);
      continue;
    }
    if (SAFE_VALUE_OPTIONS.has(argument)) {
      const value = parsed[index + 1];
      if (!value || value.startsWith('-')) throw configurationError();
      extras.push(argument, value);
      index += 1;
      continue;
    }
    const equalsOption = [...SAFE_VALUE_OPTIONS]
      .filter((option) => option.startsWith('--'))
      .find((option) => argument.startsWith(`${option}=`));
    if (equalsOption && argument.length > equalsOption.length + 1) {
      extras.push(argument);
      continue;
    }
    if (SAFE_BOOLEAN_OPTIONS.has(argument)) {
      extras.push(argument);
      continue;
    }
    throw configurationError();
  }
  return [...ENFORCED_CODEX_ARGS, ...extras];
}

function isForbiddenArgument(argument) {
  return argument === '-'
    || argument === '--full-auto'
    || argument === '--dangerously-bypass-approvals-and-sandbox'
    || argument === '--yolo'
    || argument === '--dangerously-bypass-hook-trust'
    || argument === '--'
    || argument === '--add-dir'
    || argument.startsWith('--add-dir=')
    || argument === '--output-schema'
    || argument.startsWith('--output-schema=')
    || argument === '--output-last-message'
    || argument.startsWith('--output-last-message=')
    || argument === '-o'
    || /^-o.+/u.test(argument);
}

function isUnsafeConfigOverride(value) {
  const key = String(value).split('=', 1)[0].trim().toLowerCase();
  return key === 'approval_policy'
    || key === 'ask_for_approval'
    || key === 'sandbox_mode'
    || key.startsWith('sandbox_permissions');
}

function normalizeTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function runProcess(command, args, { cwd, input, timeoutMs, spawnImpl }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        cwd,
        detached: process.platform !== 'win32',
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (cause) {
      reject(unavailableError(cause));
      return;
    }

    let settled = false;
    let timedOut = false;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let spawned = false;
    let runtimeError;
    let terminationStarted = false;
    let forceCompleted = false;
    let closeObserved = false;
    let closeCode;
    let forceTimer;
    let timer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      callback();
    };

    const settleFromClose = () => {
      if (!closeObserved || terminationStarted && !forceCompleted) return;
      finish(() => {
        const diagnosticBytes = stdout.length + stderr.length;
        if (timedOut) {
          reject(new CodexClientError(
            'CODEX_TIMEOUT',
            `Codex CLI timed out after ${timeoutMs}ms.`,
            { diagnosticBytes }
          ));
        } else if (runtimeError) {
          reject(new CodexClientError(
            'CODEX_EXECUTION_FAILED',
            'Codex CLI execution failed.',
            { cause: runtimeError, diagnosticBytes }
          ));
        } else if (closeCode === 0) {
          resolve({
            stdout: stdout.toString('utf8'),
            stderr: stderr.toString('utf8')
          });
        } else if (looksLikeSetupFailure(stderr.toString('utf8'))) {
          reject(new CodexClientError(
            'CODEX_SETUP_REQUIRED',
            'Codex CLI authentication/setup is required. Run `codex` in a terminal and sign in.',
            { diagnosticBytes }
          ));
        } else {
          reject(new CodexClientError(
            'CODEX_EXECUTION_FAILED',
            `Codex CLI execution failed (exit code ${closeCode}).`,
            { diagnosticBytes }
          ));
        }
      });
    };

    const completeForcedTermination = async () => {
      if (settled) return;
      try {
        const terminated = await forceProcessTree(child);
        if (!terminated) runtimeError ||= new Error('Codex process tree cleanup did not complete.');
      } catch (cause) {
        runtimeError ||= cause;
      }
      forceCompleted = true;
      settleFromClose();
    };

    const rememberRuntimeError = (cause) => {
      runtimeError ||= cause;
      terminate(false);
    };

    const terminate = (isTimeout) => {
      if (isTimeout) timedOut = true;
      else clearTimeout(timer);
      if (settled || terminationStarted) return;
      terminationStarted = true;
      if (process.platform === 'win32') {
        void completeForcedTermination();
      } else {
        try {
          signalProcessTree(child, 'SIGTERM');
        } catch (cause) {
          runtimeError ||= cause;
        }
        forceTimer = setTimeout(completeForcedTermination, TERMINATION_GRACE_MS);
      }
    };

    timer = setTimeout(() => {
      terminate(true);
    }, timeoutMs);

    child.once('spawn', () => { spawned = true; });
    child.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stdout.on('error', rememberRuntimeError);
    child.stderr.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.stderr.on('error', rememberRuntimeError);
    child.on('error', (cause) => {
      if (!spawned) finish(() => reject(unavailableError(cause)));
      else rememberRuntimeError(cause);
    });
    child.on('close', (code) => {
      closeObserved = true;
      closeCode = code;
      settleFromClose();
    });

    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function readJsonObject(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_RESPONSE_BYTES) throw protocolError();
    const bytes = Buffer.alloc(MAX_RESPONSE_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_RESPONSE_BYTES) throw protocolError();
    const content = bytes.subarray(0, length).toString('utf8');
    if (!content.trim()) throw protocolError();
    const value = JSON.parse(content);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw protocolError();
    return value;
  } catch {
    throw protocolError();
  } finally {
    await handle?.close().catch(() => {});
  }
}

function signalProcessTree(child, signal) {
  if (!child.pid) return false;
  if (process.platform === 'win32') return child.kill(signal);
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
    return child.kill(signal);
  }
}

async function forceProcessTree(child) {
  if (!child.pid) return false;
  if (process.platform !== 'win32') {
    signalProcessTree(child, 'SIGKILL');
    return await waitForProcessGroupExit(child.pid);
  }
  return await new Promise((resolve) => {
    let killer;
    try {
      killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        shell: false,
        stdio: 'ignore'
      });
    } catch {
      try { child.kill('SIGKILL'); } catch {}
      resolve(false);
      return;
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (!ok) {
        try { child.kill('SIGKILL'); } catch {}
      }
      resolve(ok);
    };
    killer.once('error', () => finish(false));
    killer.once('close', (code) => finish(code === 0));
  });
}

async function waitForProcessGroupExit(processGroupId) {
  const deadline = Date.now() + TERMINATION_REAP_MS;
  while (Date.now() < deadline) {
    try {
      process.kill(-processGroupId, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return true;
      if (error?.code !== 'EPERM') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, TERMINATION_POLL_MS));
  }
  try {
    process.kill(-processGroupId, 0);
    return false;
  } catch (error) {
    if (error?.code === 'ESRCH') return true;
    if (error?.code === 'EPERM') return false;
    throw error;
  }
}

function appendBounded(current, chunk) {
  if (current.length >= MAX_STREAM_DIAGNOSTIC_BYTES) return current;
  return Buffer.concat([current, Buffer.from(chunk)])
    .subarray(0, MAX_STREAM_DIAGNOSTIC_BYTES);
}

function looksLikeSetupFailure(stderr) {
  return /(?:not logged in|log in|login|sign in|authentication|credentials)/iu.test(stderr);
}

function unavailableError(cause) {
  return new CodexClientError(
    'CODEX_UNAVAILABLE',
    'Codex CLI is unavailable. Install it and ensure `codex` is on PATH.',
    { cause }
  );
}

function configurationError() {
  return new CodexClientError(
    'CODEX_CONFIGURATION_INVALID',
    'Codex CLI arguments conflict with the enforced read-only JSON protocol.'
  );
}

function protocolError() {
  return new CodexClientError(
    'CODEX_PROTOCOL_INVALID',
    'Codex CLI returned invalid JSON output.'
  );
}

function splitArgs(value) {
  const args = [];
  let current = '';
  let quote = '';
  let escaping = false;

  for (const char of String(value)) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) args.push(current);
  return args;
}
