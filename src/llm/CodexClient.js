import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CODEX_ARGS = ['exec', '--sandbox', 'read-only'];
const DEFAULT_TIMEOUT_MS = 600000;
const MAX_DIAGNOSTIC_BYTES = 65536;
const MAX_STREAM_DIAGNOSTIC_BYTES = MAX_DIAGNOSTIC_BYTES / 2;
const TERMINATION_GRACE_MS = 1000;

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
    tempRoot = os.tmpdir()
  } = {}) {
    this.name = 'codex';
    this.command = command;
    this.args = normalizeArgs(args);
    this.timeoutMs = normalizeTimeout(timeoutMs);
    this.cwd = cwd;
    this.tempRoot = tempRoot;
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
        timeoutMs: this.timeoutMs
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
  if (Array.isArray(args)) return args.length ? args : DEFAULT_CODEX_ARGS;
  const parsed = splitArgs(args || '');
  return parsed.length ? parsed : DEFAULT_CODEX_ARGS;
}

function normalizeTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function runProcess(command, args, { cwd, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
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
    let forceTimer;
    let timer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      callback();
    };

    timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, TERMINATION_GRACE_MS);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on('error', (cause) => {
      finish(() => reject(unavailableError(cause)));
    });
    child.on('close', (code) => {
      finish(() => {
        const diagnosticBytes = stdout.length + stderr.length;
        if (timedOut) {
          reject(new CodexClientError(
            'CODEX_TIMEOUT',
            `Codex CLI timed out after ${timeoutMs}ms.`,
            { diagnosticBytes }
          ));
        } else if (code === 0) {
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
            `Codex CLI execution failed (exit code ${code}).`,
            { diagnosticBytes }
          ));
        }
      });
    });

    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function readJsonObject(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    throw protocolError();
  }

  if (!content.trim()) throw protocolError();
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw protocolError();
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw protocolError();
  }
  return value;
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
