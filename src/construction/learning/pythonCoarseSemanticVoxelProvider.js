import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { canonicalStringify } from './coarseSemanticVoxelSchema.js';

export const MAX_STAGE7_PYTHON_OUTPUT_BYTES = 32 * 1024 * 1024;
export const STAGE7_PYTHON_TIMEOUT_MS = 60_000;

const CHECKPOINT_SOURCE = 'stage7-m3-checkpoint-manifest-v1';
const CHECKPOINT_SCHEMA_VERSION = 1;
const TRAINING_SCOPE = 'fixture-only';
const MODEL_NAME = 'stage7-tiny-cvae-v1';
const MODEL_VERSION = 'm3-fixture-v1';
const DATASET_VERSION = 'fixture-v1';
const STAGE7_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../training/stage7');

export function resolvePythonInvocation({
  checkpointPath,
  manifestPath,
  pythonExecutable,
  environment = process.env
} = {}) {
  const executable = pythonExecutable || environment.STAGE7_PYTHON_EXECUTABLE;
  const inferArgs = [
    '-m', 'mcagent_stage7.infer',
    '--checkpoint', path.resolve(checkpointPath),
    '--manifest', path.resolve(manifestPath),
    '--stdin',
    '--output', '-'
  ];
  if (executable) {
    return Object.freeze({
      file: executable,
      args: Object.freeze(inferArgs),
      cwd: STAGE7_ROOT,
      executable_kind: 'python-executable'
    });
  }
  return Object.freeze({
    file: 'conda',
    args: Object.freeze(['run', '--no-capture-output', '-n', 'mcagent-stage7', 'python', ...inferArgs]),
    cwd: STAGE7_ROOT,
    executable_kind: 'conda-environment'
  });
}

export function createPythonCoarseSemanticVoxelProvider({
  checkpointPath,
  manifestPath,
  pythonExecutable,
  invoke = invokePythonProcess
} = {}) {
  return Object.freeze({
    id: 'python',
    async generate({ condition } = {}) {
      let provenance = {};
      try {
        const checkpoint = resolveRequiredPath(checkpointPath, 'checkpoint');
        const manifestFile = resolveRequiredPath(manifestPath, 'manifest');
        const invocation = resolvePythonInvocation({
          checkpointPath: checkpoint,
          manifestPath: manifestFile,
          pythonExecutable
        });
        provenance = {
          checkpoint_path: checkpoint,
          manifest_path: manifestFile,
          executable_kind: invocation.executable_kind
        };
        await requireRegularFile(checkpoint, 'checkpoint');
        await requireRegularFile(manifestFile, 'manifest');
        const [checkpointSha256, manifestBytes] = await Promise.all([
          sha256File(checkpoint),
          fs.readFile(manifestFile)
        ]);
        const manifestSha256 = sha256(manifestBytes);
        provenance = { ...provenance, checkpoint_sha256: checkpointSha256, manifest_sha256: manifestSha256 };
        const manifest = parseManifest(manifestBytes);
        provenance = {
          ...provenance,
          model_name: manifest.model_name,
          model_version: manifest.model_version,
          dataset_version: manifest.dataset_version,
          training_scope: manifest.training_scope
        };
        validateManifest(manifest, { checkpointPath: checkpoint, checkpointSha256 });

        const stdin = canonicalStringify(condition);
        provenance = { ...provenance, stdin_bytes: Buffer.byteLength(stdin) };
        const response = normalizeProcessResult(await invoke({
          condition,
          invocation,
          stdin,
          timeoutMs: STAGE7_PYTHON_TIMEOUT_MS,
          stdoutLimitBytes: MAX_STAGE7_PYTHON_OUTPUT_BYTES,
          stderrLimitBytes: MAX_STAGE7_PYTHON_OUTPUT_BYTES
        }));
        provenance = {
          ...provenance,
          duration_ms: response.duration_ms,
          stdout_bytes: response.stdout_bytes,
          stderr_bytes: response.stderr_bytes
        };
        enforceOutputLimit(response, 'stdout');
        enforceOutputLimit(response, 'stderr');
        await verifyInputHashes({
          checkpointPath: checkpoint,
          manifestPath: manifestFile,
          checkpointSha256,
          manifestSha256
        });
        const plan = parsePlan(response.stdout);
        validatePlanProvider(plan, { manifest, checkpointSha256 });
        Object.defineProperty(plan, '__stage7PythonProvenance', {
          value: Object.freeze(provenance),
          enumerable: false
        });
        return plan;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        const processResult = error.stage7ProcessResult || {};
        provenance = {
          ...provenance,
          ...(Number.isFinite(processResult.duration_ms) ? { duration_ms: processResult.duration_ms } : {}),
          ...(Number.isInteger(processResult.stdout_bytes) ? { stdout_bytes: processResult.stdout_bytes } : {}),
          ...(Number.isInteger(processResult.stderr_bytes) ? { stderr_bytes: processResult.stderr_bytes } : {})
        };
        Object.defineProperty(error, 'stage7PythonProvenance', {
          value: Object.freeze(provenance),
          enumerable: true,
          configurable: true
        });
        throw error;
      }
    }
  });
}

function resolveRequiredPath(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Stage 7 python provider requires a ${label} path`);
  return path.resolve(value);
}

async function requireRegularFile(file, label) {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch (error) {
    throw new Error(`Stage 7 python ${label} could not be read: ${error.message}`);
  }
  if (!stat.isFile()) throw new Error(`Stage 7 python ${label} must be a regular file`);
}

function parseManifest(bytes) {
  const text = decodeUtf8(bytes, 'manifest');
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(`Stage 7 python manifest could not parse: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Stage 7 python manifest root must be a JSON object');
  }
  return manifest;
}

function validateManifest(manifest, { checkpointPath, checkpointSha256 }) {
  if (manifest.source !== CHECKPOINT_SOURCE) throw new Error(`Stage 7 python manifest source must be ${CHECKPOINT_SOURCE}`);
  if (manifest.schema_version !== CHECKPOINT_SCHEMA_VERSION) throw new Error(`Stage 7 python manifest schema version must be ${CHECKPOINT_SCHEMA_VERSION}`);
  if (manifest.training_scope !== TRAINING_SCOPE) throw new Error('Stage 7 python manifest training_scope must be fixture-only');
  if (manifest.model_name !== MODEL_NAME) throw new Error(`Stage 7 python manifest model_name must be ${MODEL_NAME}`);
  if (manifest.model_version !== MODEL_VERSION) throw new Error(`Stage 7 python manifest model_version must be ${MODEL_VERSION}`);
  if (manifest.dataset_version !== DATASET_VERSION) throw new Error(`Stage 7 python manifest dataset_version must be ${DATASET_VERSION}`);
  if (manifest.checkpoint_file !== path.basename(checkpointPath)) throw new Error('Stage 7 python manifest checkpoint basename does not match checkpoint path');
  if (!/^[a-f0-9]{64}$/.test(manifest.checkpoint_sha256 || '') || manifest.checkpoint_sha256 !== checkpointSha256) {
    throw new Error('Stage 7 python checkpoint SHA-256 mismatch');
  }
}

function normalizeProcessResult(value) {
  const result = typeof value === 'string' || Buffer.isBuffer(value) ? { stdout: value } : value;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Stage 7 python process runner must return stdout and stderr');
  }
  const stdout = asProcessText(result.stdout, 'stdout');
  const stderr = result.stderr === undefined ? '' : asProcessText(result.stderr, 'stderr');
  return {
    stdout,
    stderr,
    duration_ms: Number.isFinite(result.duration_ms) && result.duration_ms >= 0 ? result.duration_ms : 0,
    stdout_bytes: processTextBytes(stdout),
    stderr_bytes: processTextBytes(stderr)
  };
}

function asProcessText(value, label) {
  if (typeof value === 'string' || Buffer.isBuffer(value)) return value;
  throw new Error(`Stage 7 python process ${label} must be text`);
}

function processTextBytes(value) {
  return Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value);
}

function enforceOutputLimit(response, stream) {
  const bytes = response[`${stream}_bytes`];
  if (bytes > MAX_STAGE7_PYTHON_OUTPUT_BYTES) {
    const error = new Error(`Stage 7 python ${stream} output limit exceeded`);
    error.stage7ProcessResult = {
      duration_ms: response.duration_ms,
      stdout_bytes: response.stdout_bytes,
      stderr_bytes: response.stderr_bytes
    };
    throw error;
  }
}

function parsePlan(stdout) {
  const text = decodeUtf8(stdout, 'output');
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error(`Stage 7 python output could not parse exactly one JSON object: ${error.message}`);
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Stage 7 python output must contain exactly one JSON object');
  }
  return plan;
}

function decodeUtf8(value, label) {
  if (typeof value === 'string') return value;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch (error) {
    throw new Error(`Stage 7 python ${label} is not valid UTF-8`, { cause: error });
  }
}

async function verifyInputHashes({ checkpointPath, manifestPath, checkpointSha256, manifestSha256 }) {
  let currentCheckpointSha256;
  let currentManifestSha256;
  try {
    [currentCheckpointSha256, currentManifestSha256] = await Promise.all([
      sha256File(checkpointPath),
      sha256File(manifestPath)
    ]);
  } catch (error) {
    throw new Error(`Stage 7 python checkpoint or manifest changed during inference: ${error.message}`);
  }
  if (currentCheckpointSha256 !== checkpointSha256) {
    throw new Error('Stage 7 python checkpoint changed during inference');
  }
  if (currentManifestSha256 !== manifestSha256) {
    throw new Error('Stage 7 python manifest changed during inference');
  }
}

function validatePlanProvider(plan, { manifest, checkpointSha256 }) {
  const expected = {
    kind: 'learned-python-shadow',
    name: manifest.model_name,
    model_version: manifest.model_version,
    dataset_version: manifest.dataset_version,
    checkpoint_version: `sha256:${checkpointSha256}`
  };
  const provider = plan.provider && typeof plan.provider === 'object' && !Array.isArray(plan.provider)
    ? plan.provider
    : {};
  for (const [field, value] of Object.entries(expected)) {
    if (provider[field] !== value) {
      throw new Error(`Stage 7 python plan provider ${field} does not match the validated checkpoint manifest`);
    }
  }
  if (Object.keys(provider).length !== Object.keys(expected).length) {
    throw new Error('Stage 7 python plan provider fields do not match the validated checkpoint manifest');
  }
}

async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function invokePythonProcess({ invocation, stdin, timeoutMs, stdoutLimitBytes, stderrLimitBytes }) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminalError;
    let closed = false;
    const child = spawn(invocation.file, invocation.args, {
      cwd: invocation.cwd,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const timer = setTimeout(() => fail(new Error(`Stage 7 python provider timed out after ${timeoutMs}ms`)), timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      appendBounded(stdoutChunks, chunk, stdoutLimitBytes);
      if (stdoutBytes > stdoutLimitBytes) fail(new Error('Stage 7 python stdout output limit exceeded'));
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      appendBounded(stderrChunks, chunk, stderrLimitBytes);
      if (stderrBytes > stderrLimitBytes) fail(new Error('Stage 7 python stderr output limit exceeded'));
    });
    child.on('error', (error) => fail(new Error(`Stage 7 python process could not launch: ${error.message}`)));
    child.on('close', (code, signal) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        duration_ms: Math.max(0, Math.round(performance.now() - started)),
        stdout_bytes: stdoutBytes,
        stderr_bytes: stderrBytes
      };
      if (terminalError) {
        terminalError.stage7ProcessResult = result;
        reject(terminalError);
      } else if (code !== 0) {
        const detail = result.stderr.subarray(0, 4096).toString('utf8').trim();
        const error = new Error(`Stage 7 python process exited ${code ?? `by signal ${signal}`}${detail ? `: ${detail}` : ''}`);
        error.stage7ProcessResult = result;
        reject(error);
      } else {
        resolve(result);
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);

    function fail(error) {
      if (terminalError || closed) return;
      terminalError = error;
      terminateChild(child);
    }
  });
}

function appendBounded(chunks, chunk, limit) {
  const buffered = chunks.reduce((total, item) => total + item.length, 0);
  if (buffered >= limit) return;
  chunks.push(chunk.subarray(0, limit - buffered));
}

function terminateChild(child) {
  if (!child.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {}
  }
  try { child.kill('SIGKILL'); } catch {}
}
