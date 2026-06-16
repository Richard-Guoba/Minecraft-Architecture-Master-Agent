import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseJsonContent } from './parseJsonContent.js';

const DEFAULT_CODEX_ARGS = ['exec', '--sandbox', 'read-only'];
const DEFAULT_TIMEOUT_MS = 120000;

export class CodexClient {
  constructor({
    command = process.env.CODEX_COMMAND || 'codex',
    args = process.env.CODEX_ARGS,
    timeoutMs = process.env.CODEX_TIMEOUT_MS,
    cwd = process.cwd()
  } = {}) {
    this.name = 'codex';
    this.command = command;
    this.args = normalizeArgs(args);
    this.timeoutMs = normalizeTimeout(timeoutMs);
    this.cwd = cwd;
  }

  isConfigured() {
    return Boolean(this.command && this.args.length);
  }

  async chatJson({ system, user }) {
    if (!this.isConfigured()) {
      throw new Error('Codex CLI is not configured.');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-architect-codex-'));
    try {
      const schemaPath = path.join(tempDir, 'response.schema.json');
      const outputPath = path.join(tempDir, 'response.json');
      await fs.writeFile(schemaPath, JSON.stringify(responseSchema(), null, 2), 'utf8');

      const prompt = buildPrompt(system, user);
      const args = [
        ...this.args,
        '--output-schema',
        schemaPath,
        '-o',
        outputPath,
        '-'
      ];

      const { stdout, stderr } = await runProcess(this.command, args, {
        cwd: this.cwd,
        input: prompt,
        timeoutMs: this.timeoutMs
      });

      const output = await readOptional(outputPath);
      const content = output.trim() ? output : stdout;
      if (!content.trim()) {
        throw new Error(`Codex CLI returned no JSON output. ${stderr.slice(0, 300)}`);
      }

      try {
        return JSON.parse(content);
      } catch {
        return parseJsonContent(content);
      }
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
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Codex CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Codex CLI could not be started: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Codex CLI failed with exit code ${code}. ${stderr || stdout}`));
    });

    child.stdin.end(input);
  });
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
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
