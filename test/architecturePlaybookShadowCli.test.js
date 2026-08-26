import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { SHADOW_OUTPUT_FILES } from '../src/playbook/shadow/constants.js';
import { SHADOW_CORPUS_PATHS } from '../src/playbook/shadow/corpus.js';
import {
  main,
  parseArchitecturePlaybookShadowArgs
} from '../src/runArchitecturePlaybookShadow.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI_PATH = path.join(ROOT, 'src/runArchitecturePlaybookShadow.js');
const FIXTURE_ROOT = path.join(ROOT, 'test/fixtures/playbook-shadow');
const execFileAsync = promisify(execFile);

test('CLI parser accepts each required option once and rejects every other shape', () => {
  assert.deepEqual(
    parseArchitecturePlaybookShadowArgs(['--run', 'out/run-1', '--mode', 'mock']),
    { run: 'out/run-1', mode: 'mock' }
  );
  assert.deepEqual(
    parseArchitecturePlaybookShadowArgs(['--mode', 'llm', '--run', 'out/run-2']),
    { run: 'out/run-2', mode: 'llm' }
  );
  for (const argv of [
    null,
    [],
    ['--run', 'out/x'],
    ['--mode', 'mock'],
    ['--run', 'out/x', '--run', 'out/y', '--mode', 'mock'],
    ['--run', 'out/x', '--mode', 'other'],
    ['--run', 'out/x', '--mode', 'mock', '--force']
  ]) {
    assert.throws(() => parseArchitecturePlaybookShadowArgs(argv), /INVALID_ARGUMENT/u);
  }
});

test('mock CLI installs five artifacts and changes no pre-existing run bytes', async (t) => {
  const fixture = await cliFixture(t, 'medieval-positive.json');
  const before = await snapshotTree(fixture.runPath);
  const output = captureWritable();
  const result = await main(
    ['--run', fixture.runRelative, '--mode', 'mock'],
    { projectRoot: fixture.root, stdout: output }
  );
  const after = await snapshotTree(fixture.runPath, { exclude: 'playbook-shadow' });

  assert.deepEqual(after, before);
  assert.equal(result.assessment_count, 21);
  assert.equal(output.text(), [
    'shadow_status=created',
    'mode=mock',
    'assessment_count=21',
    'explanation_status=available',
    `run=${fixture.runRelative}`,
    ''
  ].join('\n'));
  assert.deepEqual(
    (await fs.readdir(path.join(fixture.runPath, 'playbook-shadow'))).sort(),
    [...SHADOW_OUTPUT_FILES].sort()
  );
});

test('CLI renders unchanged and replacement outcomes with public status names', async (t) => {
  const fixture = await cliFixture(t, 'medieval-positive.json');
  await main(
    ['--run', fixture.runRelative, '--mode', 'mock'],
    { projectRoot: fixture.root, stdout: captureWritable() }
  );
  const unchangedOutput = captureWritable();

  await main(
    ['--run', fixture.runRelative, '--mode', 'mock'],
    { projectRoot: fixture.root, stdout: unchangedOutput }
  );

  assert.match(unchangedOutput.text(), /^shadow_status=unchanged$/mu);

  const blueprintPath = path.join(fixture.runPath, 'blueprint.json');
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, 'utf8'));
  blueprint.prompt = '中世纪木框石基民居，修订版';
  await fs.writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
  const updatedOutput = captureWritable();

  await main(
    ['--run', fixture.runRelative, '--mode', 'mock'],
    { projectRoot: fixture.root, stdout: updatedOutput }
  );

  assert.match(updatedOutput.text(), /^shadow_status=updated$/mu);
});

test('CLI rejects a newline in a run component without writing stdout', async (t) => {
  const fixture = await cliFixture(t, 'medieval-positive.json', {
    runRelative: 'out/run\ninjected=1'
  });
  const output = captureWritable();

  await assert.rejects(
    main(
      ['--run', fixture.runRelative, '--mode', 'mock'],
      { projectRoot: fixture.root, stdout: output }
    ),
    (error) => {
      assert.equal(error.code, 'INVALID_ARGUMENT');
      assert.equal(error.message, 'INVALID_ARGUMENT');
      return true;
    }
  );

  assert.equal(output.text(), '');
  await assert.rejects(
    fs.access(path.join(fixture.runPath, 'playbook-shadow')),
    { code: 'ENOENT' }
  );
});

test('top-level CLI emits only a safe stable error code', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      CLI_PATH,
      '--run',
      '/private/secret-run',
      '--mode',
      'mock'
    ], { cwd: ROOT }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.equal(error.stderr, 'RUN_OUTSIDE_OUT_ROOT\n');
      assert.doesNotMatch(error.stderr, /private|secret|\/home\//u);
      return true;
    }
  );
});

async function cliFixture(t, fixtureName, { runRelative = 'out/run-1' } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-shadow-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runPath = path.join(root, runRelative);
  await fs.mkdir(path.join(runPath, 'existing'), { recursive: true });
  await fs.copyFile(
    path.join(FIXTURE_ROOT, fixtureName),
    path.join(runPath, 'blueprint.json')
  );
  await fs.writeFile(path.join(runPath, 'existing/report.txt'), 'pre-existing bytes\n');
  for (const relativePath of SHADOW_CORPUS_PATHS) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(ROOT, relativePath), destination);
  }
  return { root, runPath, runRelative };
}

function captureWritable() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    text() {
      return chunks.join('');
    }
  };
}

async function snapshotTree(root, { exclude } = {}) {
  const snapshot = [];
  await visit(root, '');
  return snapshot;

  async function visit(absolute, relative) {
    if (relative === exclude || relative.startsWith(`${exclude}/`)) return;
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) {
      snapshot.push([relative, 'symlink', await fs.readlink(absolute)]);
      return;
    }
    if (stat.isDirectory()) {
      snapshot.push([relative, 'directory']);
      for (const name of (await fs.readdir(absolute)).sort()) {
        await visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    snapshot.push([relative, 'file', (await fs.readFile(absolute)).toString('base64')]);
  }
}
