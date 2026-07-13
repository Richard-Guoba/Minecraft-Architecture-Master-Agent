import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STAGE7_PYTHON_OUTPUT_BYTES,
  createPythonCoarseSemanticVoxelProvider,
  resolvePythonInvocation
} from '../src/construction/learning/pythonCoarseSemanticVoxelProvider.js';
import { canonicalStringify } from '../src/construction/learning/coarseSemanticVoxelSchema.js';

const fixtureRoot = path.join(process.cwd(), 'training', 'stage7', 'fixtures', 'm3', 'cases', 'one-floor-house');
const fixtureCheckpoint = 'fixture-checkpoint';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validCondition() {
  return JSON.parse(readFileSync(path.join(fixtureRoot, 'condition.json'), 'utf8'));
}

function validPlanFor(condition = validCondition()) {
  const plan = JSON.parse(readFileSync(path.join(fixtureRoot, 'plan.json'), 'utf8'));
  plan.condition_hash = condition.condition_hash;
  plan.orientation.front_side = condition.design.front_side;
  plan.world_transform = {
    ground_y: 0,
    lot_depth: condition.dimensions.lot_depth,
    lot_width: condition.dimensions.lot_width,
    total_height: condition.dimensions.total_height
  };
  plan.provider = {
    kind: 'learned-python-shadow',
    name: 'stage7-tiny-cvae-v1',
    model_version: 'm3-fixture-v1',
    dataset_version: 'fixture-v1',
    checkpoint_version: `sha256:${sha256(fixtureCheckpoint)}`
  };
  return plan;
}

function processResult(stdout, { stderr = '', durationMs = 17 } = {}) {
  return {
    stdout,
    stderr,
    duration_ms: durationMs,
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr)
  };
}

function invocationPath(invocation, flag) {
  const index = invocation.args.indexOf(flag);
  assert.notEqual(index, -1, `invocation must include ${flag}`);
  return invocation.args[index + 1];
}

async function redirectSymlink(linkPath, targetPath) {
  const replacement = `${linkPath}.replacement`;
  await fs.symlink(targetPath, replacement);
  await fs.rename(replacement, linkPath);
}

function replaceMarkerWithInvalidUtf8(value, marker = 'invalid-utf8-marker') {
  const bytes = Buffer.from(value, 'utf8');
  const markerBytes = Buffer.from(marker, 'utf8');
  const index = bytes.indexOf(markerBytes);
  assert.notEqual(index, -1, 'invalid UTF-8 marker must exist');
  return Buffer.concat([
    bytes.subarray(0, index),
    Buffer.from([0xc3, 0x28]),
    bytes.subarray(index + markerBytes.length)
  ]);
}

async function writeCheckpoint(root, overrides = {}) {
  const checkpointPath = path.join(root, 'checkpoint.pt');
  const manifestPath = path.join(root, 'checkpoint_manifest.json');
  await fs.writeFile(checkpointPath, fixtureCheckpoint, 'utf8');
  const manifest = {
    source: 'stage7-m3-checkpoint-manifest-v1',
    schema_version: 1,
    training_scope: 'fixture-only',
    model_name: 'stage7-tiny-cvae-v1',
    model_version: 'm3-fixture-v1',
    dataset_version: 'fixture-v1',
    checkpoint_file: 'checkpoint.pt',
    checkpoint_sha256: sha256(fixtureCheckpoint),
    ...overrides
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
  return { checkpointPath, manifestPath, manifest };
}

test('resolvePythonInvocation uses argument lists for conda and explicit Python executables', () => {
  const checkpointPath = path.resolve('checkpoint.pt');
  const manifestPath = path.resolve('checkpoint_manifest.json');
  const defaultInvocation = resolvePythonInvocation({ checkpointPath, manifestPath, environment: {} });
  assert.equal(defaultInvocation.file, 'conda');
  assert.deepEqual(defaultInvocation.args, [
    'run', '--no-capture-output', '-n', 'mcagent-stage7', 'python', '-m', 'mcagent_stage7.infer',
    '--checkpoint', checkpointPath, '--manifest', manifestPath, '--stdin', '--output', '-'
  ]);
  assert.equal(defaultInvocation.cwd, path.join(process.cwd(), 'training', 'stage7'));
  assert.equal(defaultInvocation.executable_kind, 'conda-environment');
  assert.equal(Object.hasOwn(defaultInvocation, 'shell'), false);

  const explicit = resolvePythonInvocation({
    checkpointPath,
    manifestPath,
    environment: { STAGE7_PYTHON_EXECUTABLE: '/opt/stage7/python' }
  });
  assert.equal(explicit.file, '/opt/stage7/python');
  assert.deepEqual(explicit.args, [
    '-m', 'mcagent_stage7.infer', '--checkpoint', checkpointPath, '--manifest', manifestPath,
    '--stdin', '--output', '-'
  ]);
  assert.equal(explicit.executable_kind, 'python-executable');
});

test('python provider returns a complete canonical plan with non-enumerable invocation provenance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-provider-'));
  try {
    const { checkpointPath, manifestPath } = await writeCheckpoint(root);
    const condition = validCondition();
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath,
      manifestPath,
      pythonExecutable: '/opt/stage7/python',
      invoke: async ({ stdin, invocation }) => {
        if (stdin !== canonicalStringify(condition)) throw new Error('condition stdin was not canonical');
        if (invocation.file !== '/opt/stage7/python') throw new Error('explicit executable was not preserved');
        return processResult(JSON.stringify(validPlanFor(condition)), { stderr: 'diagnostic', durationMs: 23 });
      }
    });
    assert.equal(provider.id, 'python');

    const plan = await provider.generate({ condition });
    assert.equal(plan.provider.kind, 'learned-python-shadow');
    assert.equal(Object.getOwnPropertyDescriptor(plan, '__stage7PythonProvenance').enumerable, false);
    assert.equal(Object.keys(plan).includes('__stage7PythonProvenance'), false);
    assert.deepEqual(plan.__stage7PythonProvenance, {
      checkpoint_path: checkpointPath,
      manifest_path: manifestPath,
      checkpoint_sha256: sha256(fixtureCheckpoint),
      manifest_sha256: sha256(await fs.readFile(manifestPath)),
      model_name: 'stage7-tiny-cvae-v1',
      model_version: 'm3-fixture-v1',
      dataset_version: 'fixture-v1',
      training_scope: 'fixture-only',
      executable_kind: 'python-executable',
      duration_ms: 23,
      stdin_bytes: Buffer.byteLength(canonicalStringify(condition)),
      stdout_bytes: Buffer.byteLength(JSON.stringify(validPlanFor(condition))),
      stderr_bytes: Buffer.byteLength('diagnostic')
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('python provider validates regular files and every fixture-only manifest binding before launch', async () => {
  const mutations = [
    [{ training_scope: 'prototype' }, /training_scope must be fixture-only/],
    [{ source: 'wrong' }, /manifest source/],
    [{ schema_version: 2 }, /manifest schema version/],
    [{ model_name: 'other' }, /model_name/],
    [{ model_version: 'other' }, /model_version/],
    [{ dataset_version: 'v3' }, /dataset_version/],
    [{ checkpoint_file: 'other.pt' }, /checkpoint basename/],
    [{ checkpoint_sha256: '0'.repeat(64) }, /checkpoint SHA-256 mismatch/]
  ];
  for (const [mutation, expected] of mutations) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-manifest-'));
    try {
      const { checkpointPath, manifestPath } = await writeCheckpoint(root, mutation);
      const provider = createPythonCoarseSemanticVoxelProvider({
        checkpointPath,
        manifestPath,
        invoke: async () => { throw new Error('process launch must not occur'); }
      });
      await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
        assert.match(error.message, expected);
        assert.equal(error.stage7PythonProvenance.checkpoint_path, checkpointPath);
        assert.equal(error.stage7PythonProvenance.manifest_path, manifestPath);
        return true;
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-regular-file-'));
  try {
    const manifestPath = path.join(root, 'checkpoint_manifest.json');
    await fs.mkdir(path.join(root, 'checkpoint.pt'));
    await fs.writeFile(manifestPath, '{}\n', 'utf8');
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath: path.join(root, 'checkpoint.pt'),
      manifestPath,
      invoke: async () => processResult('{}')
    });
    await assert.rejects(provider.generate({ condition: validCondition() }), /checkpoint must be a regular file/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('python provider rejects invalid UTF-8 manifest bytes before invocation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-manifest-utf8-'));
  try {
    const { checkpointPath, manifestPath, manifest } = await writeCheckpoint(root);
    const manifestBytes = replaceMarkerWithInvalidUtf8(JSON.stringify({
      ...manifest,
      note: 'invalid-utf8-marker'
    }));
    await fs.writeFile(manifestPath, manifestBytes);
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath,
      manifestPath,
      invoke: async () => processResult(JSON.stringify(validPlanFor()))
    });
    await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
      assert.match(error.message, /manifest.*UTF-8/);
      assert.equal(error.stage7PythonProvenance.manifest_sha256, sha256(manifestBytes));
      assert.equal(error.stage7PythonProvenance.stdout_bytes, undefined);
      return true;
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('python provider independently bounds stdout and stderr and retains provenance on invocation failure', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `stage7-python-${stream}-`));
    try {
      const { checkpointPath, manifestPath } = await writeCheckpoint(root);
      const oversized = 'x'.repeat(MAX_STAGE7_PYTHON_OUTPUT_BYTES + 1);
      const response = stream === 'stdout'
        ? processResult(oversized)
        : processResult(JSON.stringify(validPlanFor()), { stderr: oversized });
      const provider = createPythonCoarseSemanticVoxelProvider({
        checkpointPath,
        manifestPath,
        invoke: async () => response
      });
      await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
        assert.match(error.message, new RegExp(`${stream} output limit`));
        assert.equal(error.stage7PythonProvenance[`${stream}_bytes`], MAX_STAGE7_PYTHON_OUTPUT_BYTES + 1);
        assert.equal(error.stage7PythonProvenance.duration_ms, response.duration_ms);
        assert.equal(error.stage7PythonProvenance.stdout_bytes, response.stdout_bytes);
        assert.equal(error.stage7PythonProvenance.stderr_bytes, response.stderr_bytes);
        return true;
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-timeout-'));
  try {
    const { checkpointPath, manifestPath } = await writeCheckpoint(root);
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath,
      manifestPath,
      invoke: async () => {
        const error = new Error('python provider timed out after 60000ms');
        error.stage7ProcessResult = { duration_ms: 60000, stdout_bytes: 11, stderr_bytes: 13 };
        throw error;
      }
    });
    await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
      assert.match(error.message, /timed out/);
      assert.equal(error.stage7PythonProvenance.duration_ms, 60000);
      assert.equal(error.stage7PythonProvenance.stdin_bytes, Buffer.byteLength(canonicalStringify(validCondition())));
      assert.equal(error.stage7PythonProvenance.stdout_bytes, 11);
      assert.equal(error.stage7PythonProvenance.stderr_bytes, 13);
      return true;
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('python provider attaches provenance even when required paths are missing', async () => {
  const provider = createPythonCoarseSemanticVoxelProvider();
  await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
    assert.match(error.message, /requires a checkpoint path/);
    assert.deepEqual(error.stage7PythonProvenance, {});
    return true;
  });
});

test('python provider parses exactly one JSON object and rejects arrays, trailing content, and malformed JSON', async () => {
  const cases = [
    ['[]', /JSON object/],
    [`${JSON.stringify(validPlanFor())}\n{}`, /parse/],
    ['{', /parse/]
  ];
  for (const [stdout, expected] of cases) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-json-'));
    try {
      const { checkpointPath, manifestPath } = await writeCheckpoint(root);
      const provider = createPythonCoarseSemanticVoxelProvider({
        checkpointPath,
        manifestPath,
        invoke: async () => processResult(stdout)
      });
      await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
        assert.match(error.message, expected);
        assert.equal(error.stage7PythonProvenance.stdout_bytes, Buffer.byteLength(stdout));
        return true;
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

test('python provider rejects invalid UTF-8 Buffer stdout instead of accepting replacement characters', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-output-utf8-'));
  try {
    const { checkpointPath, manifestPath } = await writeCheckpoint(root);
    const plan = validPlanFor();
    plan.evidence[0].detail = 'invalid-utf8-marker';
    const stdout = replaceMarkerWithInvalidUtf8(JSON.stringify(plan));
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath,
      manifestPath,
      invoke: async () => processResult(stdout)
    });
    await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
      assert.match(error.message, /output.*UTF-8/);
      assert.equal(error.stage7PythonProvenance.stdin_bytes, Buffer.byteLength(canonicalStringify(validCondition())));
      assert.equal(error.stage7PythonProvenance.stdout_bytes, stdout.length);
      return true;
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('python provider consumes the exact validated manifest bytes despite a source symlink redirect and restore', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-symlink-snapshot-'));
  try {
    const { checkpointPath, manifestPath, manifest } = await writeCheckpoint(root);
    const sourceA = path.join(root, 'source-a');
    const sourceB = path.join(root, 'source-b');
    await fs.mkdir(sourceA);
    await fs.mkdir(sourceB);
    const manifestAPath = path.join(sourceA, path.basename(manifestPath));
    const manifestBPath = path.join(sourceB, path.basename(manifestPath));
    await fs.rename(manifestPath, manifestAPath);
    const manifestABytes = await fs.readFile(manifestAPath);
    const manifestBBytes = Buffer.from(`${JSON.stringify({ ...manifest, note: 'byte-distinct-source-b' })}\n`);
    await fs.writeFile(manifestBPath, manifestBBytes);
    await fs.symlink(manifestAPath, manifestPath);

    let consumedManifestBytes;
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath,
      manifestPath,
      invoke: async ({ condition, invocation }) => {
        await redirectSymlink(manifestPath, manifestBPath);
        try {
          consumedManifestBytes = await fs.readFile(invocationPath(invocation, '--manifest'));
        } finally {
          await redirectSymlink(manifestPath, manifestAPath);
        }
        return processResult(JSON.stringify(validPlanFor(condition)));
      }
    });

    const plan = await provider.generate({ condition: validCondition() });
    assert.equal(plan.provider.kind, 'learned-python-shadow');
    assert.equal(sha256(consumedManifestBytes), sha256(manifestABytes));
    assert.notEqual(sha256(consumedManifestBytes), sha256(manifestBBytes));
    assert.equal(plan.__stage7PythonProvenance.manifest_sha256, sha256(manifestABytes));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

for (const target of ['checkpoint', 'manifest']) {
  test(`python provider isolates inference from ${target} source changes after snapshot`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `stage7-python-mutated-${target}-`));
    try {
      const { checkpointPath, manifestPath, manifest } = await writeCheckpoint(root);
      const originalCheckpointSha256 = sha256(fixtureCheckpoint);
      const originalManifestSha256 = sha256(await fs.readFile(manifestPath));
      const changedCheckpoint = 'changed-fixture-checkpoint';
      let consumedBytes;
      const provider = createPythonCoarseSemanticVoxelProvider({
        checkpointPath,
        manifestPath,
        invoke: async ({ condition, invocation }) => {
          if (target === 'checkpoint') {
            await fs.writeFile(checkpointPath, changedCheckpoint, 'utf8');
            consumedBytes = await fs.readFile(invocationPath(invocation, '--checkpoint'));
          } else {
            await fs.writeFile(manifestPath, `${JSON.stringify({ ...manifest, note: 'changed-during-inference' })}\n`, 'utf8');
            consumedBytes = await fs.readFile(invocationPath(invocation, '--manifest'));
          }
          const plan = validPlanFor(condition);
          return processResult(JSON.stringify(plan), { durationMs: 29 });
        }
      });
      const plan = await provider.generate({ condition: validCondition() });
      const expectedBytes = target === 'checkpoint'
        ? Buffer.from(fixtureCheckpoint)
        : Buffer.from(`${JSON.stringify(manifest)}\n`);
      assert.deepEqual(consumedBytes, expectedBytes);
      assert.equal(plan.__stage7PythonProvenance.checkpoint_sha256, originalCheckpointSha256);
      assert.equal(plan.__stage7PythonProvenance.manifest_sha256, originalManifestSha256);
      assert.equal(plan.__stage7PythonProvenance.duration_ms, 29);
      assert.equal(plan.__stage7PythonProvenance.stdin_bytes, Buffer.byteLength(canonicalStringify(validCondition())));
      assert.ok(plan.__stage7PythonProvenance.stdout_bytes > 0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}

test('python provider removes private invocation inputs after success and runtime errors', async () => {
  const cases = [
    ['success', ({ condition }) => processResult(JSON.stringify(validPlanFor(condition)))],
    ['launch', () => { throw new Error('process could not launch'); }],
    ['timeout', () => {
      const error = new Error('python provider timed out after 60000ms');
      error.stage7ProcessResult = { duration_ms: 60000, stdout_bytes: 0, stderr_bytes: 0 };
      throw error;
    }],
    ['parse', () => processResult('{')],
    ['lineage', ({ condition }) => {
      const plan = validPlanFor(condition);
      plan.provider.dataset_version = 'other-dataset';
      return processResult(JSON.stringify(plan));
    }]
  ];
  for (const [name, behavior] of cases) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `stage7-python-cleanup-${name}-`));
    try {
      const { checkpointPath, manifestPath } = await writeCheckpoint(root);
      let invokedPaths;
      const provider = createPythonCoarseSemanticVoxelProvider({
        checkpointPath,
        manifestPath,
        invoke: async (request) => {
          invokedPaths = [
            invocationPath(request.invocation, '--checkpoint'),
            invocationPath(request.invocation, '--manifest')
          ];
          return behavior(request);
        }
      });
      if (name === 'success') {
        await provider.generate({ condition: validCondition() });
      } else {
        await assert.rejects(provider.generate({ condition: validCondition() }));
      }
      assert.equal(invokedPaths.length, 2);
      for (const invokedPath of invokedPaths) {
        await assert.rejects(fs.access(invokedPath), (error) => error.code === 'ENOENT');
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

for (const [field, value] of [
  ['kind', 'synthetic-fixture'],
  ['name', 'other-model'],
  ['model_version', 'other-version'],
  ['dataset_version', 'other-dataset'],
  ['checkpoint_version', `sha256:${'0'.repeat(64)}`]
]) {
  test(`python provider rejects returned plan provider ${field} lineage mismatch`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `stage7-python-lineage-${field}-`));
    try {
      const { checkpointPath, manifestPath } = await writeCheckpoint(root);
      const plan = validPlanFor();
      plan.provider[field] = value;
      const response = processResult(JSON.stringify(plan), { durationMs: 31 });
      const provider = createPythonCoarseSemanticVoxelProvider({
        checkpointPath,
        manifestPath,
        invoke: async () => response
      });
      await assert.rejects(provider.generate({ condition: validCondition() }), (error) => {
        assert.match(error.message, new RegExp(`plan provider ${field}.*validated checkpoint manifest`));
        assert.equal(error.stage7PythonProvenance.checkpoint_sha256, sha256(fixtureCheckpoint));
        assert.equal(error.stage7PythonProvenance.stdin_bytes, Buffer.byteLength(canonicalStringify(validCondition())));
        assert.equal(error.stage7PythonProvenance.duration_ms, 31);
        assert.equal(error.stage7PythonProvenance.stdout_bytes, response.stdout_bytes);
        return true;
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
