import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SHADOW_CORPUS_PATHS } from '../src/playbook/shadow/corpus.js';
import { auditShadowDependencyBoundary } from '../src/playbook/shadow/shadowDependencyBoundary.js';
import {
  buildShadowArtifacts,
  runShadowReview
} from '../src/playbook/shadow/runShadowReview.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE_ROOT = path.join(ROOT, 'test/fixtures/playbook-shadow');
const FORBIDDEN_TARGETS = Object.freeze([
  'src/construction/target.js',
  'src/pipeline.js',
  'src/index.js',
  'src/playbook/p6/cohort.js',
  'src/lib/minecraftCommands.js',
  'src/lib/minecraftWorlds.js'
]);

test('checked-in P4 dependency graph has no forbidden or unresolved edges', async () => {
  const audit = await auditShadowDependencyBoundary({ projectRoot: ROOT });

  assert.equal(audit.import_boundary_violation_count, 0);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('three fixtures exercise positive, defect, and non-applicable outcomes without visual claims', async () => {
  const positive = await reviewFixtureFile('medieval-positive.json');
  const defect = await reviewFixtureFile('medieval-defect.json');
  const control = await reviewFixtureFile('non-applicable-control.json');

  assert.ok(positive.assessments.some((item) => item.status === 'satisfied'));
  assert.ok(defect.assessments.some((item) => item.status === 'violated'));
  assert.ok(control.assessments.some((item) => item.status === 'not-applicable'));
  for (const review of [positive, defect, control]) {
    assert.equal(review.assessments.length, 21);
    assert.ok(review.assessments.some((item) => item.status === 'unknown'));
    assert.equal(review.assessments.filter((item) => item.teaching_role === 'case-pattern').every(
      (item) => ['unknown', 'not-applicable'].includes(item.status)
        && item.repair_operation_id === null
    ), true);
  }
});

test('mock rerun is byte-identical and never mutates old run files', async (t) => {
  const fixture = await gateRunFixture(t);
  const oldBytes = await snapshotTree(fixture.runPath);

  await runShadowReview({
    projectRoot: fixture.root,
    runArg: fixture.runRelative,
    mode: 'mock'
  });
  const first = await snapshotTree(path.join(fixture.runPath, 'playbook-shadow'));
  await runShadowReview({
    projectRoot: fixture.root,
    runArg: fixture.runRelative,
    mode: 'mock'
  });
  const second = await snapshotTree(path.join(fixture.runPath, 'playbook-shadow'));

  assert.deepEqual(second, first);
  assert.deepEqual(
    await snapshotTree(fixture.runPath, { exclude: 'playbook-shadow' }),
    oldBytes
  );
});

test('P4 dependency gate blocks every forbidden target through supported edge shapes', async (t) => {
  for (const targetPath of FORBIDDEN_TARGETS) {
    for (const edgeKind of ['direct', 'transitive', 'realpath', 'dynamic-import']) {
      await t.test(`${edgeKind}: ${targetPath}`, async (t) => {
        const projectRoot = await dependencyFixture(t, { targetPath, edgeKind });

        const audit = await auditShadowDependencyBoundary({ projectRoot });

        assert.equal(audit.import_boundary_violation_count, 1);
        assert.equal(audit.import_boundary_unresolved_count, 0);
      });
    }
  }
});

test('P4 dependency gate fails closed on computed and capability-based loaders', async (t) => {
  for (const [name, source, expectedFact] of [
    [
      'computed dynamic import',
      "const target = '../../pipeline.js';\nawait import(target);\n",
      'COMPUTED_DYNAMIC_IMPORT'
    ],
    [
      'createRequire capability',
      [
        "import { createRequire } from 'node:module';",
        'const load = createRequire(import.meta.url);',
        "load('../../pipeline.js');",
        ''
      ].join('\n'),
      'DYNAMIC_NODE_MODULE_CAPABILITY'
    ]
  ]) {
    await t.test(name, async (t) => {
      const projectRoot = await loaderFixture(t, source);

      const audit = await auditShadowDependencyBoundary({ projectRoot });

      assert.equal(audit.import_boundary_violation_count, 0);
      assert.equal(audit.import_boundary_unresolved_count, 1);
      assert.deepEqual(audit.unresolved_dependencies, [
        `src/playbook/shadow/entry.js:${expectedFact}`
      ]);
    });
  }
});

async function reviewFixtureFile(fixtureName) {
  const blueprintBytes = await fs.readFile(path.join(FIXTURE_ROOT, fixtureName));
  const files = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'mock'
  });
  return JSON.parse(files['review.json'].toString('utf8'));
}

async function gateRunFixture(t) {
  const root = await temporaryRoot(t, 'playbook-shadow-gate-run-');
  const runRelative = 'out/candidates/run-1';
  const runPath = path.join(root, runRelative);
  await fs.mkdir(path.join(runPath, 'legacy'), { recursive: true });
  await fs.copyFile(
    path.join(FIXTURE_ROOT, 'medieval-positive.json'),
    path.join(runPath, 'blueprint.json')
  );
  await fs.writeFile(path.join(runPath, 'legacy/result.json'), '{"old":true}\n');
  await copyCorpus(root);
  return { root, runPath, runRelative };
}

async function dependencyFixture(t, { targetPath, edgeKind }) {
  const root = await temporaryRoot(t, 'playbook-shadow-dependency-');
  const entryPath = 'src/playbook/shadow/entry.js';
  const cliPath = 'src/runArchitecturePlaybookShadow.js';
  await writeFixtureFile(root, targetPath, 'export const forbidden = true;\n');
  await writeFixtureFile(root, cliPath, 'export const cli = true;\n');

  const targetSpecifier = relativeSpecifier(entryPath, targetPath);
  if (edgeKind === 'direct') {
    await writeFixtureFile(root, entryPath, `import '${targetSpecifier}';\n`);
  } else if (edgeKind === 'transitive') {
    const bridgePath = 'src/shared/bridge.js';
    await writeFixtureFile(
      root,
      entryPath,
      `import '${relativeSpecifier(entryPath, bridgePath)}';\n`
    );
    await writeFixtureFile(
      root,
      bridgePath,
      `export * from '${relativeSpecifier(bridgePath, targetPath)}';\n`
    );
  } else if (edgeKind === 'realpath') {
    const linkPath = 'src/allowed-link.js';
    await fs.mkdir(path.dirname(path.join(root, linkPath)), { recursive: true });
    await fs.symlink(path.join(root, targetPath), path.join(root, linkPath));
    await writeFixtureFile(
      root,
      entryPath,
      `import '${relativeSpecifier(entryPath, linkPath)}';\n`
    );
  } else {
    await writeFixtureFile(root, entryPath, `await import('${targetSpecifier}');\n`);
  }
  return root;
}

async function loaderFixture(t, source) {
  const root = await temporaryRoot(t, 'playbook-shadow-loader-');
  await writeFixtureFile(root, 'src/playbook/shadow/entry.js', source);
  await writeFixtureFile(root, 'src/runArchitecturePlaybookShadow.js', 'export const cli = true;\n');
  await writeFixtureFile(root, 'src/pipeline.js', 'export const forbidden = true;\n');
  return root;
}

async function temporaryRoot(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFixtureFile(root, relativePath, bytes) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
}

function relativeSpecifier(importerPath, targetPath) {
  const relative = path.posix.relative(path.posix.dirname(importerPath), targetPath);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

async function copyCorpus(root) {
  for (const relativePath of SHADOW_CORPUS_PATHS) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(ROOT, relativePath), destination);
  }
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
