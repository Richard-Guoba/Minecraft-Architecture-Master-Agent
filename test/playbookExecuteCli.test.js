import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from '../src/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'src/index.js');
const PROMPT = 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base';
const CHILD_ENV = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || 'C.UTF-8' };

test('execute CLI applies exact omitted 3/1 defaults and prints only stable P5 authority', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-cli-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const secret = 'P5_PRIVATE_ENV_VALUE_98f07';
  const { stdout, stderr, status } = spawnSync(process.execPath,
    [CLI, '--playbook', 'execute', '--mode', 'mock', '--seed', '424242', '--out', outRoot, PROMPT],
    { cwd: ROOT, env: { ...CHILD_ENV, P5_PRIVATE_TEST_VALUE: secret }, encoding: 'utf8', timeout: 120000 });

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /^playbook_status=complete$/mu);
  assert.match(stdout, /^candidate_count=3$/mu);
  assert.match(stdout, /^selected_candidate_id=candidate-0[1-3]$/mu);
  assert.match(stdout, /^selected_chain_sha256=[a-f0-9]{64}$/mu);
  assert.match(stdout, /^selected_eligibility=eligible$/mu);
  assert.match(stdout, /^repair_attempt_count=[0-3]$/mu);
  assert.match(stdout, /^report=playbook-execute\/selection-report\.md$/mu);
  assert.doesNotMatch(`${stdout}\n${stderr}`, new RegExp(secret, 'u'));
  assert.doesNotMatch(`${stdout}\n${stderr}`, new RegExp(outRoot.replaceAll('\\', '\\\\'), 'u'));
  assert.doesNotMatch(stdout, /provider|prompt|blueprint|\/home\/|\/tmp\//iu);
});

test('execute CLI rejects malformed or incompatible P5 options before output', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-cli-invalid-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const cases = [
    ['--playbook'],
    ['--playbook', 'execute', '--playbook', 'execute'],
    ['--playbook', 'shadow'],
    ['--playbook', 'Execute'],
    ['--playbook', 'execute', '--candidates', '2'],
    ['--playbook', 'execute', '--candidates', '3.9'],
    ['--candidates', 'not-a-number', '--playbook', 'execute'],
    ['--playbook', 'execute', '--candidates'],
    ['--playbook', 'execute', '--candidate-rounds', '2'],
    ['--playbook', 'execute', '--candidate-rounds', '1.9'],
    ['--candidate-rounds', 'not-a-number', '--playbook', 'execute'],
    ['--playbook', 'execute', '--candidate-rounds'],
    ['--playbook', 'execute', '--candidate-force-rounds'],
    ['--playbook', 'execute', '--seed', 'private-input-bytes'],
    ['--playbook', 'execute', '--coarse-voxel-mode', 'private-mode'],
    ['--playbook', 'execute', '--coarse-voxel-provider', 'private-provider'],
    ['--playbook', 'execute', '--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', '--coarse-voxel-plan', 'private-plan.json']
  ];
  for (const argv of cases) {
    const result = spawnSync(process.execPath, [CLI, '--out', outRoot, ...argv, PROMPT],
      { cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 30000 });
    const label = argv.join(' ');
    assert.equal(result.status, 1, label);
    assert.equal(result.stdout, '', label);
    assert.match(result.stderr, /^P5_(?:MODE_INVALID|OPTIONS_INCOMPATIBLE)\n$/u, label);
    assert.doesNotMatch(result.stderr, /private-|\/home\/|\/tmp\//u);
    assert.deepEqual(await fs.readdir(outRoot), []);
  }
});

test('execute CLI rejects an omitted prompt with only the stable P5 code and no output', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-cli-empty-prompt-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const outRoot = path.join(parent, 'PRIVATE-empty-prompt-output');
  const result = spawnSync(process.execPath, [
    CLI, '--playbook', 'execute', '--out', outRoot
  ], { cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'P5_OPTIONS_INCOMPATIBLE\n');
  assert.doesNotMatch(result.stderr, /PRIVATE|\/home\/|\/tmp\//u);
  await assert.rejects(fs.lstat(outRoot), { code: 'ENOENT' });
});

test('execute CLI rejects duplicate semantic singleton aliases before side effects', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-cli-duplicate-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const cases = [
    ['--candidates', '2', '--auto-select'],
    ['--candidates', '3', '--candidates', '3'],
    ['--candidate-rounds', '1', '--candidate-rounds', '1'],
    ['--mode', 'mock', '--mode', 'mock'],
    ['--seed', '424242', '--seed', '424242'],
    ['--neural-retrieval', '--no-neural-retrieval'],
    ['--datapacks-dir', path.join(outRoot, 'world'), '--datapacks-target', 'build-lab'],
    ['--coarse-voxel-mode', 'off', '--coarse-voxel-mode', 'off'],
    ['--no-critics', '--no-critics']
  ];
  for (const argv of cases) {
    const result = spawnSync(process.execPath, [
      CLI, '--playbook', 'execute', '--out', outRoot, ...argv, PROMPT
    ], { cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 1, argv.join(' '));
    assert.equal(result.stdout, '', argv.join(' '));
    assert.equal(result.stderr, 'P5_OPTIONS_INCOMPATIBLE\n', argv.join(' '));
    assert.deepEqual(await fs.readdir(outRoot), [], argv.join(' '));
  }
});

test('CLI preserves sanitized execute stage codes and never relabels raw faults as options', async () => {
  const argv = ['--playbook', 'execute', '--mode', 'mock', '--seed', '424242', PROMPT];
  const secret = 'PRIVATE_CLI_STAGE_BODY_/home/private/world';
  for (const [stage, code] of [
    ['create-run', 'P5_AUTHORITY_INVALID'],
    ['corpus-load', 'P5_AUTHORITY_INVALID'],
    ['selection', 'P5_INSTALL_FAILED'],
    ['install', 'P5_INSTALL_FAILED'],
    ['close', 'P5_AUTHORITY_INVALID']
  ]) {
    const stderr = [];
    const status = await runCli({
      argv,
      runPipelineImpl: async () => {
        throw Object.assign(new Error(`${secret}:${stage}`), { code });
      },
      writeError: (value) => stderr.push(value)
    });
    assert.equal(status, 1);
    assert.deepEqual(stderr, [code]);
    assert.equal(stderr.join('\n').includes(secret), false);
  }
  const stderr = [];
  const status = await runCli({
    argv,
    runPipelineImpl: async () => { throw new Error(secret); },
    writeError: (value) => stderr.push(value)
  });
  assert.equal(status, 1);
  assert.deepEqual(stderr, ['P5_AUTHORITY_INVALID']);
});

test('no-eligible execute CLI exits safely after retaining three evidence trees and no selection', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-cli-no-eligible-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const prompt = 'Build a medieval residence while retaining unresolved evidence-required architectural questions.';
  const result = spawnSync(process.execPath,
    [CLI, '--playbook', 'execute', '--mode', 'mock', '--seed', '424242', '--out', outRoot, prompt],
    { cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'P5_NO_ELIGIBLE_CANDIDATE\n');
  const [runName] = await fs.readdir(outRoot);
  const executeRoot = path.join(outRoot, runName, 'playbook-execute');
  assert.deepEqual((await fs.readdir(path.join(executeRoot, 'candidates'))).sort(), ['candidate-01', 'candidate-02', 'candidate-03']);
  await assert.rejects(fs.access(path.join(executeRoot, 'selection.json')), { code: 'ENOENT' });
});

test('off and omitted playbook CLI behavior remain identical for fixed mock input', async (t) => {
  const roots = await Promise.all(['omitted', 'off'].map((name) => fs.mkdtemp(path.join(os.tmpdir(), `p5-cli-${name}-`))));
  t.after(() => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))));
  const common = ['--mode', 'mock', '--seed', '73425', PROMPT];
  const omitted = spawnSync(process.execPath, [CLI, '--out', roots[0], ...common], { cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 120000 });
  const off = spawnSync(process.execPath, [CLI, '--out', roots[1], '--playbook', 'off', ...common], { cwd: ROOT, env: CHILD_ENV, encoding: 'utf8', timeout: 120000 });
  assert.equal(omitted.status, 0);
  assert.equal(off.status, 0);
  const normalize = (value, root) => value.replaceAll(root, '<OUT>').replace(/\d{4}-\d{2}-\d{2}-\d+/gu, '<RUN>');
  assert.equal(normalize(off.stdout, roots[1]), normalize(omitted.stdout, roots[0]));
  assert.equal(off.stderr, omitted.stderr);
});

test('package exposes the exact opt-in execute script without changing start', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json')));
  assert.equal(pkg.scripts.start, 'node src/index.js');
  assert.equal(pkg.scripts['playbook:execute'], 'node src/index.js --playbook execute --candidates 3 --candidate-rounds 1');
});
