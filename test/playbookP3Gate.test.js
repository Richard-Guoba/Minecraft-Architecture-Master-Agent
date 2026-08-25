import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { P3_MANAGED_ARTIFACT_PATHS } from '../src/playbook/manual/p3AdmissionPolicy.js';
import * as playbookCompiler from '../src/playbook/manual/playbookV01Compiler.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const COVERAGE_PATH = 'docs/architecture-playbook/manual/coverage-v0.1.json';
const MANUAL_PATH = 'docs/architecture-playbook/manual/v0.1.md';
const NOT_COVERED_LAYERS = ['space', 'materials', 'interior', 'scene'];
const {
  auditCheckedInPlaybookV01
} = playbookCompiler;

test('P3 checked-in playbook passes with no runtime authority', async () => {
  const audit = await auditCheckedInPlaybookV01({ projectRoot: ROOT });

  assert.equal(audit.p2_gate_status, 'passed');
  assert.equal(audit.reviewed_rule_count, 21);
  assert.equal(audit.core_procedure_count, 15);
  assert.equal(audit.case_pattern_count, 6);
  assert.equal(audit.dangling_reference_count, 0);
  assert.equal(audit.cross_school_count, 0);
  assert.equal(audit.authority_escalation_count, 0);
  assert.equal(audit.maturity_escalation_count, 0);
  assert.equal(audit.covered_runtime_layer_count, 0);
  assert.equal(audit.public_leak_count, 0);
  assert.equal(audit.managed_artifact_drift_count, 0);
  assert.equal(audit.untracked_managed_artifact_count, 0);
  assert.equal(audit.tracking_verification_error_count, 0);
  assert.equal(audit.import_boundary_violation_count, 0);
  assert.equal(audit.import_boundary_unresolved_count, 0);
  assert.equal(audit.not_covered_declaration_mismatch_count, 0);
  assert.equal(audit.gate.status, 'passed');
  assert.equal(audit.gate.next_phase, 'P4');

  const trackedPaths = await gitTrackedManagedPaths();
  assert.deepEqual(trackedPaths, [...P3_MANAGED_ARTIFACT_PATHS]);
  assert.deepEqual(audit.tracked_managed_artifact_paths, trackedPaths);

  assert.deepEqual(audit.manual_construction_imports, []);

  const coverage = JSON.parse(await fs.readFile(
    path.join(ROOT, COVERAGE_PATH),
    'utf8'
  ));
  const coverageNotCoveredLayers = coverage.layers
    .filter((row) => row.status === 'not-covered')
    .map((row) => row.layer);
  assert.deepEqual(coverageNotCoveredLayers, NOT_COVERED_LAYERS);
  assert.deepEqual(audit.coverage_not_covered_layers, NOT_COVERED_LAYERS);

  const manual = await fs.readFile(path.join(ROOT, MANUAL_PATH), 'utf8');
  for (const layer of NOT_COVERED_LAYERS) {
    assert.match(
      manual,
      new RegExp('- `' + layer + '`：状态 `not-covered`', 'u'),
      layer
    );
  }
  assert.deepEqual(audit.manual_not_covered_layers, NOT_COVERED_LAYERS);
  assert.equal(Object.isFrozen(audit), true);
  assert.equal(Object.isFrozen(audit.tracked_managed_artifact_paths), true);
  assert.equal(Object.isFrozen(audit.manual_construction_imports), true);
});

test('an untracked managed artifact blocks the final checked-in gate', async (t) => {
  const untrackedPath = P3_MANAGED_ARTIFACT_PATHS[2];
  const projectRoot = await checkedInAuditFixture(t, {
    untrackedManagedPath: untrackedPath
  });

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.equal(audit.managed_artifact_drift_count, 0);
  assert.equal(audit.tracking_verification_error_count, 0);
  assert.equal(audit.untracked_managed_artifact_count, 1);
  assert.deepEqual(audit.untracked_managed_artifact_paths, [untrackedPath]);
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.ok(audit.gate.blocker_codes.includes('UNTRACKED_MANAGED_ARTIFACT'));
});

test('a construction dependency blocks the final checked-in gate', async (t) => {
  const projectRoot = await checkedInAuditFixture(t, {
    manualFiles: {
      'construction-edge.js': "import '../../construction/target.js';\n"
    },
    constructionFiles: { 'target.js': 'export const target = true;\n' }
  });

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.ok(audit.gate.blocker_codes.includes('MANUAL_CONSTRUCTION_IMPORT'));
});

test('a computed dynamic import fails the final checked-in gate closed', async (t) => {
  const projectRoot = await checkedInAuditFixture(t, {
    manualFiles: {
      'computed-edge.js': [
        "const moduleName = 'target';",
        "export default (await import('../../construction/' + moduleName + '.js')).default;",
        ''
      ].join('\n')
    },
    constructionFiles: { 'target.js': "export default 'computed-executed';\n" }
  });
  await writeFixtureFiles(projectRoot, {
    'package.json': '{"type":"module"}\n'
  });

  assert.equal(
    await importDefault(path.join(
      projectRoot,
      'src/playbook/manual/computed-edge.js'
    )),
    'computed-executed'
  );

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.equal(audit.import_boundary_violation_count, 0);
  assert.equal(audit.import_boundary_unresolved_count, 1);
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.ok(audit.gate.blocker_codes.includes('MANUAL_DEPENDENCY_UNRESOLVED'));
});

test('a missing manual not-covered declaration blocks the final gate', async (t) => {
  const projectRoot = await checkedInAuditFixture(t);
  const manualPath = path.join(projectRoot, MANUAL_PATH);
  const manual = await fs.readFile(manualPath, 'utf8');
  await fs.writeFile(
    manualPath,
    manual.replace(
      '- `space`：状态 `not-covered`',
      '- `space`：状态 `advisory-partial`'
    ),
    'utf8'
  );

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.equal(audit.not_covered_declaration_mismatch_count, 1);
  assert.deepEqual(audit.manual_not_covered_layers, [
    'materials', 'interior', 'scene'
  ]);
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.ok(audit.gate.blocker_codes.includes(
    'NOT_COVERED_DECLARATION_MISMATCH'
  ));
});

test('Git tracking verification failure returns a stable blocked audit', async (t) => {
  const projectRoot = await checkedInAuditFixture(t, { initializeGit: false });

  const audit = await auditCheckedInPlaybookV01({ projectRoot });
  const serialized = JSON.stringify(audit);

  assert.equal(audit.tracking_verification_error_count, 1);
  assert.deepEqual(audit.tracking_verification_errors, [
    'GIT_TRACKING_UNAVAILABLE'
  ]);
  assert.equal(audit.gate.status, 'blocked');
  assert.equal(audit.gate.next_phase, null);
  assert.ok(audit.gate.blocker_codes.includes('TRACKING_VERIFICATION_FAILED'));
  assert.equal(Object.isFrozen(audit), true);
  assert.equal(Object.isFrozen(audit.tracking_verification_errors), true);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(projectRoot), 'u'));
  assert.doesNotMatch(serialized, /fatal:|stderr|ENOENT|\/home\//u);
});

test('protected managed snapshot drives both drift and public-leak counters', async (t) => {
  const projectRoot = await checkedInAuditFixture(t);
  const manualPath = path.join(projectRoot, MANUAL_PATH);
  await fs.appendFile(
    manualPath,
    '.local/architecture-playbook/private-source/frame-1.png\n',
    'utf8'
  );

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.equal(audit.managed_artifact_drift_count, 1);
  assert.equal(audit.public_leak_count, 1);
  assert.ok(audit.gate.blocker_codes.includes('MANAGED_ARTIFACT_DRIFT'));
  assert.ok(audit.gate.blocker_codes.includes('PUBLIC_SOURCE_LEAK'));
  assert.equal(audit.gate.status, 'blocked');
});

test('manual dependency graph resolves every supported construction edge', async (t) => {
  const cases = [
    {
      name: 'direct static import',
      files: {
        'src/playbook/manual/entry.js':
          "import '../../construction/target.js';\n"
      }
    },
    {
      name: 're-export through an intermediate alias',
      files: {
        'src/playbook/manual/entry.js': "import '../bridge/alias.js';\n",
        'src/playbook/bridge/alias.js':
          "export { target } from '../../construction/target.js';\n"
      }
    },
    {
      name: 'literal dynamic import',
      files: {
        'src/playbook/manual/entry.js':
          "await import('../../construction/target.js');\n"
      }
    },
    {
      name: 'mjs entry',
      files: {
        'src/playbook/manual/entry.mjs':
          "export { target } from '../../construction/target.js';\n"
      }
    },
    {
      name: 'cjs require',
      files: {
        'src/playbook/manual/entry.cjs':
          "module.exports = require('../../construction/target.cjs');\n",
        'src/construction/target.cjs': 'module.exports = true;\n'
      }
    }
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, {
        ...fixture.files,
        'src/construction/target.js': 'export const target = true;\n'
      });

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });

      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
      assert.equal(audit.manual_construction_imports.length, 1);
      assert.doesNotMatch(JSON.stringify(audit), new RegExp(
        escapeRegExp(projectRoot),
        'u'
      ));
    });
  }
});

test('module.require construction edge executes and is audited', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'src/playbook/manual/entry.cjs':
      "module.exports = module.require('../../construction/target.cjs');\n",
    'src/construction/target.cjs':
      "module.exports = 'module-require-executed';\n"
  });
  const entryPath = path.join(projectRoot, 'src/playbook/manual/entry.cjs');

  assert.equal(createRequire(import.meta.url)(entryPath), 'module-require-executed');

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });
  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('package imports construction edge executes and is audited', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'package.json': JSON.stringify({
      type: 'module',
      imports: {
        '#construction': {
          import: './src/construction/target.js',
          require: './src/playbook/safe.js'
        }
      }
    }),
    'src/playbook/manual/entry.js':
      "export { default } from '#construction';\n",
    'src/playbook/safe.js': "export default 'wrong-condition';\n",
    'src/construction/target.js':
      "export default 'package-import-executed';\n"
  });
  const entryPath = path.join(projectRoot, 'src/playbook/manual/entry.js');

  assert.equal(await importDefault(entryPath), 'package-import-executed');

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });
  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('package self-reference construction edge executes and is audited', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'package.json': JSON.stringify({
      name: 'playbook-audit-fixture',
      type: 'module',
      exports: {
        './construction': {
          import: './src/construction/target.js',
          require: './src/playbook/safe.js'
        }
      }
    }),
    'src/playbook/manual/entry.js':
      "export { default } from 'playbook-audit-fixture/construction';\n",
    'src/playbook/safe.js': "export default 'wrong-condition';\n",
    'src/construction/target.js':
      "export default 'self-reference-executed';\n"
  });
  const entryPath = path.join(projectRoot, 'src/playbook/manual/entry.js');

  assert.equal(await importDefault(entryPath), 'self-reference-executed');

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });
  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('bare symlink package construction edge executes and is audited', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'package.json': '{"type":"module"}\n',
    'src/playbook/manual/entry.js':
      "export { default } from 'construction-symlink';\n",
    'src/construction/symlink-package/package.json': JSON.stringify({
      name: 'construction-symlink',
      type: 'module',
      exports: './target.js'
    }),
    'src/construction/symlink-package/target.js':
      "export default 'symlink-package-executed';\n"
  });
  await fs.mkdir(path.join(projectRoot, 'node_modules'), { recursive: true });
  await fs.symlink(
    path.join(projectRoot, 'src/construction/symlink-package'),
    path.join(projectRoot, 'node_modules/construction-symlink'),
    'dir'
  );
  const entryPath = path.join(projectRoot, 'src/playbook/manual/entry.js');

  assert.equal(await importDefault(entryPath), 'symlink-package-executed');

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });
  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('division after contextual of cannot hide an executing import', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'package.json': JSON.stringify({
      type: 'module',
      imports: { '#construction': './src/construction/target.js' }
    }),
    'src/playbook/manual/entry.js': [
      'const of = 8;',
      "export default of / (await import('#construction')).default / 2;",
      ''
    ].join('\n'),
    'src/construction/target.js': 'export default 2;\n'
  });
  const entryPath = path.join(projectRoot, 'src/playbook/manual/entry.js');

  assert.equal(await importDefault(entryPath), 2);

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });
  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('regex and division syntax cannot forge dependency edges', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'package.json': '{"type":"module"}\n',
    'src/playbook/manual/entry.js': [
      "if (true) /require('..\\/..\\/construction\\/target.cjs')/u.test('safe');",
      'const quotient = 8 / 2;',
      'export default quotient;',
      ''
    ].join('\n')
  });
  const entryPath = path.join(projectRoot, 'src/playbook/manual/entry.js');

  assert.equal(await importDefault(entryPath), 4);

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });
  assert.equal(audit.import_boundary_violation_count, 0);
  assert.equal(audit.import_boundary_unresolved_count, 0);
  assert.deepEqual(audit.manual_construction_imports, []);
  assert.deepEqual(audit.unresolved_manual_dependencies, []);
});

test('manual dependency graph follows a symlink into construction', async (t) => {
  const projectRoot = await dependencyFixture(t, {
    'src/playbook/manual/entry.js': "import './alias.js';\n",
    'src/construction/target.js': 'export const target = true;\n'
  });
  await fs.symlink(
    path.join(projectRoot, 'src/construction/target.js'),
    path.join(projectRoot, 'src/playbook/manual/alias.js'),
    'file'
  );

  const audit = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot
  });

  assert.equal(audit.import_boundary_violation_count, 1);
  assert.equal(audit.import_boundary_unresolved_count, 0);
});

test('manual dependency graph fails computed imports closed but ignores prose', async (t) => {
  const computedRoot = await dependencyFixture(t, {
    'src/playbook/manual/entry.js': [
      "const name = 'target';",
      "await import('../../construction/' + name + '.js');",
      ''
    ].join('\n'),
    'src/construction/target.js': 'export const target = true;\n'
  });
  const proseRoot = await dependencyFixture(t, {
    'src/playbook/manual/entry.js': [
      "const example = \"import('../../construction/target.js')\";",
      "// require('../../construction/target.js');",
      "/* export { target } from '../../construction/target.js'; */",
      'export { example };',
      ''
    ].join('\n'),
    'src/construction/target.js': 'export const target = true;\n'
  });
  const interpolatedRoot = await dependencyFixture(t, {
    'src/playbook/manual/entry.js':
      "const value = `${await import('../../construction/target.js')}`;\n",
    'src/construction/target.js': 'export const target = true;\n'
  });
  const computedRequireRoot = await dependencyFixture(t, {
    'src/playbook/manual/entry.cjs': [
      "const name = 'target.cjs';",
      "module.exports = require('../../construction/' + name);",
      ''
    ].join('\n'),
    'src/construction/target.cjs':
      "module.exports = 'computed-require-executed';\n"
  });

  assert.equal(
    createRequire(import.meta.url)(path.join(
      computedRequireRoot,
      'src/playbook/manual/entry.cjs'
    )),
    'computed-require-executed'
  );

  const computed = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot: computedRoot
  });
  const prose = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot: proseRoot
  });
  const interpolated = await playbookCompiler.auditManualDependencyBoundary({
    projectRoot: interpolatedRoot
  });
  const computedRequire =
    await playbookCompiler.auditManualDependencyBoundary({
      projectRoot: computedRequireRoot
    });

  assert.equal(computed.import_boundary_violation_count, 0);
  assert.equal(computed.import_boundary_unresolved_count, 1);
  assert.deepEqual(computed.unresolved_manual_dependencies, [
    'src/playbook/manual/entry.js:COMPUTED_DYNAMIC_IMPORT'
  ]);
  assert.equal(prose.import_boundary_violation_count, 0);
  assert.equal(prose.import_boundary_unresolved_count, 0);
  assert.equal(interpolated.import_boundary_violation_count, 1);
  assert.equal(interpolated.import_boundary_unresolved_count, 0);
  assert.equal(computedRequire.import_boundary_violation_count, 0);
  assert.equal(computedRequire.import_boundary_unresolved_count, 1);
  assert.deepEqual(computedRequire.unresolved_manual_dependencies, [
    'src/playbook/manual/entry.cjs:COMPUTED_REQUIRE'
  ]);
});

async function gitTrackedManagedPaths() {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--', ...P3_MANAGED_ARTIFACT_PATHS],
    { cwd: ROOT, encoding: 'utf8' }
  );
  const tracked = new Set(stdout.split(/\r?\n/u).filter(Boolean));
  return P3_MANAGED_ARTIFACT_PATHS.filter((artifactPath) =>
    tracked.has(artifactPath));
}

async function checkedInAuditFixture(t, {
  initializeGit = true,
  untrackedManagedPath = null,
  manualFiles = {},
  constructionFiles = {}
} = {}) {
  const projectRoot = await temporaryRoot(t, 'playbook-p3-gate-');
  for (const relativePath of [
    'docs/architecture-playbook/course',
    'docs/architecture-playbook/manual',
    'docs/architecture-playbook/rules/schools/heihui-jileniao',
    'src/playbook'
  ]) {
    await fs.cp(
      path.join(ROOT, relativePath),
      path.join(projectRoot, relativePath),
      { recursive: true }
    );
  }
  await fs.copyFile(
    path.join(ROOT, 'src/runArchitecturePlaybookManual.js'),
    path.join(projectRoot, 'src/runArchitecturePlaybookManual.js')
  );
  for (const dependency of ['acorn', 'import-meta-resolve']) {
    await fs.cp(
      path.join(ROOT, 'node_modules', dependency),
      path.join(projectRoot, 'node_modules', dependency),
      { recursive: true }
    );
  }
  await writeFixtureFiles(projectRoot, Object.fromEntries([
    ...Object.entries(manualFiles).map(([name, value]) => [
      `src/playbook/manual/${name}`,
      value
    ]),
    ...Object.entries(constructionFiles).map(([name, value]) => [
      `src/construction/${name}`,
      value
    ])
  ]));
  if (initializeGit) {
    await runGit(projectRoot, ['init', '--quiet']);
    await runGit(projectRoot, ['add', '--', 'docs', 'src']);
    if (untrackedManagedPath) {
      await runGit(projectRoot, [
        'rm', '--quiet', '--cached', '--', untrackedManagedPath
      ]);
    }
  }
  return projectRoot;
}

async function dependencyFixture(t, files) {
  const projectRoot = await temporaryRoot(t, 'playbook-dependency-');
  await writeFixtureFiles(projectRoot, files);
  return projectRoot;
}

async function writeFixtureFiles(projectRoot, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, 'utf8');
  }
}

async function runGit(projectRoot, args) {
  await execFileAsync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });
}

async function temporaryRoot(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function importDefault(modulePath) {
  const imported = await import(pathToFileURL(modulePath).href);
  return imported.default;
}
