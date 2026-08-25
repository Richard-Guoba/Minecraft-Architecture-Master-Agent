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
const P3_REPORT_PATH = 'docs/architecture-playbook/reports/p3-playbook-v0.1.md';
const DEPENDENCY_BOUNDARY_PATH =
  'src/playbook/manual/manualDependencyBoundary.js';
const ADMISSION_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json';
const NOT_COVERED_LAYERS = ['space', 'materials', 'interior', 'scene'];
const {
  auditCheckedInPlaybookV01
} = playbookCompiler;

test('public P3 report marks the seven-path scope as historical', async () => {
  const report = await fs.readFile(path.join(ROOT, P3_REPORT_PATH), 'utf8');

  assert.doesNotMatch(report, /^- 提交前 .*七个修复路径.*$/mu);
  assert.match(
    report,
    /历史范围说明：第一修复轮次.*七个修复路径.*不代表最终整分支范围/u
  );
  assert.match(
    report,
    /P3 has not generated or visually improved a house and provides zero runtime authority\./u
  );
  assert.doesNotMatch(report, /绑定传播覆盖 `createRequire`/u);
  assert.match(report, /只接受字符串字面量表达的静态 ESM\/CJS 模块边/u);
  assert.match(report, /不受支持的 loader 根在源头以稳定 unresolved fact 关闭门禁/u);
  assert.match(report, /唯一 `createRequire` 例外同时绑定到审计实现的真实物理路径/u);
  assert.match(report, /共享同一个最多八轮、保留原始区间映射的百分号规范化视图/u);
});

test('dependency gate source records the capability-deny architecture', async () => {
  const source = await fs.readFile(
    path.join(ROOT, DEPENDENCY_BOUNDARY_PATH),
    'utf8'
  );

  assert.equal(source.includes('propagateBindingTaint'), false);
  assert.equal(source.includes('maximumPasses'), false);
  assert.equal(source.includes('TAINT_LOADER'), false);
  assert.match(source, /DYNAMIC_NODE_MODULE_CAPABILITY/u);
  assert.match(source, /INDIRECT_REQUIRE_CAPABILITY/u);
});

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

test('staged checked-input divergence blocks the captured commit gate', async (t) => {
  const projectRoot = await checkedInAuditFixture(t);
  await fs.appendFile(path.join(projectRoot, ADMISSION_PATH), ' \n', 'utf8');
  await runGit(projectRoot, ['add', '--', ADMISSION_PATH]);

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.deepEqual(audit.tracking_verification_errors, [
    'GIT_INDEX_DIVERGENCE'
  ]);
  assert.equal(audit.tracking_verification_error_count, 1);
  assert.equal(audit.gate.status, 'blocked');
  assert.ok(audit.gate.blocker_codes.includes('TRACKING_VERIFICATION_FAILED'));
});

test('unstaged checked-input divergence blocks the captured commit gate', async (t) => {
  const projectRoot = await checkedInAuditFixture(t);
  await fs.appendFile(path.join(projectRoot, ADMISSION_PATH), ' \n', 'utf8');

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.deepEqual(audit.tracking_verification_errors, [
    'GIT_WORKTREE_DIVERGENCE'
  ]);
  assert.equal(audit.tracking_verification_error_count, 1);
  assert.equal(audit.gate.status, 'blocked');
});

test('protected output snapshot must equal its captured commit blob', async (t) => {
  const projectRoot = await checkedInAuditFixture(t);
  await fs.appendFile(
    path.join(projectRoot, MANUAL_PATH),
    'public but not committed\n',
    'utf8'
  );

  const audit = await auditCheckedInPlaybookV01({ projectRoot });

  assert.equal(audit.managed_artifact_drift_count, 1);
  assert.deepEqual(audit.tracking_verification_errors, [
    'GIT_OUTPUT_SNAPSHOT_DIVERGENCE'
  ]);
  assert.equal(audit.gate.status, 'blocked');
});

test('a non-blob checked input returns a stable blocked audit', async (t) => {
  const projectRoot = await checkedInAuditFixture(t);
  const admissionPath = path.join(projectRoot, ADMISSION_PATH);
  await fs.rm(admissionPath);
  await fs.mkdir(admissionPath);
  await fs.writeFile(
    path.join(admissionPath, 'nested.json'),
    '{"not":"the admission blob"}\n',
    'utf8'
  );
  await runGit(projectRoot, ['add', '--all']);
  await commitFixture(projectRoot, 'replace admission blob with tree');

  await assert.doesNotReject(async () => {
    const audit = await auditCheckedInPlaybookV01({ projectRoot });
    const serialized = JSON.stringify(audit);
    assert.deepEqual(audit.tracking_verification_errors, [
      'GIT_TREE_PATH_NOT_BLOB'
    ]);
    assert.equal(audit.tracking_verification_error_count, 1);
    assert.equal(audit.gate.status, 'blocked');
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(projectRoot), 'u'));
    assert.doesNotMatch(serialized, /fatal:|stderr|EISDIR/u);
  });
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

test('protected checked snapshot blocks file URL and UNC leakage', async (t) => {
  for (const [name, reference, expectedCount = 1] of [
    ['single-slash file URL',
      'file:/home/user/artifact.bin'],
    ['double-slash mixed-case file URL',
      'FILE://server/share/artifact.bin'],
    ['partially encoded single-slash file URL',
      'f%69le:%2Fhome%2Falice%2Fsecret.txt'],
    ['encoded file URL',
      'https://example.test/?next=file:%2F%2F%2Fhome%2Fuser%2Fartifact.bin'],
    ['encoded UNC',
      'https://example.test/?next=%5C%5Cserver%5Cshare%5Cartifact.bin'],
    ['mixed encoded file URL',
      'f%69le:%2F%2F%2Fhome%2Falice%2Fsecret.txt'],
    ['mixed encoded UNC',
      String.raw`%5C\server\share\secret.txt`],
    ['repeated encoded file URL',
      'f%2569le:%252F%252F%252Fhome%252Falice%252Fsecret.txt'],
    ['partially encoded HTTPS with embedded file URL',
      'h%74tps://example.test/?next=f%69le:%2Fhome%2Falice%2Fsecret.txt'],
    ['partially encoded HTTPS with embedded UNC',
      String.raw`h%74tps://example.test/?next=%5C\server\share\secret.txt`],
    ['HTTPS path with embedded UNC',
      String.raw`https://example.test/path/\\server\share\artifact.bin`],
    ['HTTPS path with embedded mixed UNC',
      String.raw`https://example.test/path=/\server\share\artifact.bin`],
    ['HTTPS query with embedded UNC',
      String.raw`https://example.test/?next=\\server\share\artifact.bin`],
    ['HTTPS fragment with embedded mixed UNC',
      String.raw`https://example.test/#next=/\server\share\artifact.bin`],
    ['HTTPS path with embedded forward UNC',
      'https://example.test/path=//server/share/artifact.bin'],
    ['HTTPS query with embedded forward UNC',
      'https://example.test/?next=//server/share/artifact.bin'],
    ['HTTPS fragment with embedded forward UNC',
      'https://example.test/#next=//server/share/artifact.bin'],
    ['direct forward UNC after HTTPS query delimiter',
      'https://example.test/?//server/share/a.txt'],
    ['direct forward UNC after HTTPS fragment delimiter',
      'https://example.test/#//server/share/a.txt'],
    ['encoded direct forward UNC after HTTPS query delimiter',
      'https://example.test/?%2F%2Fserver%2Fshare%2Fa.txt'],
    ['partially encoded HTTPS with direct forward UNC after fragment delimiter',
      'h%74tps://example.test/#%2F%2Fserver%2Fshare%2Fa.txt'],
    ['forward UNC after HTTPS query component separator',
      'https://example.test/?x=1&//server/share/a.txt'],
    ['encoded forward UNC after HTTPS query component separator',
      'https://example.test/?x=1%26%2F%2Fserver%2Fshare%2Fa.txt'],
    ['two forward UNC parameter values in one HTTPS fragment',
      'https://example.test/#a=//one/share&b=//two/share', 2],
    ['encoded two forward UNC parameter values in one HTTPS fragment',
      'https://example.test/#a%3D%2F%2Fone%2Fshare%26b%3D%2F%2Ftwo%2Fshare', 2],
    ['parameter-like delimiters inside an active fragment UNC stay one token',
      'https://example.test/#//server/share&b=//folder/file'],
    ['encoded parameter-like delimiters inside an active fragment UNC stay one token',
      'https://example.test/#%2F%2Fserver%2Fshare%26b%3D%2F%2Ffolder%2Ffile'],
    ['forward UNC left in the HTTPS scheme run',
      'https:////server/share/a.txt'],
    ['backslash UNC left in the HTTPS scheme run',
      String.raw`https://\\server\share\a.txt`],
    ['encoded forward UNC left in the HTTPS scheme run',
      'https:%2F%2F%2F%2Fserver%2Fshare%2Fa.txt'],
    ['encoded backslash UNC left in the HTTPS scheme run',
      'https:%2F%2F%5C%5Cserver%5Cshare%5Ca.txt'],
    ['mixed slash UNC',
      String.raw`/\server\share\artifact.bin`],
    ['extended UNC',
      String.raw`\\?\UNC\server\share\artifact.bin`],
    ['HTTPS query with two independent file URLs',
      'https://example.test/?a=file:/one&a=file:/two', 2],
    ['HTTPS query with two independent UNC references',
      String.raw`https://example.test/?a=\\one\share&a=\\two\share`, 2],
    ['two comma-separated UNC references',
      String.raw`\\one\share,\\two\share`, 2],
    ['ampersand inside one UNC segment',
      String.raw`\\server\&share\artifact.bin`],
    ['encoded ampersand inside one UNC segment',
      '%5C%5Cserver%5C%26share%5Cartifact.bin'],
    ['semicolon inside one UNC segment',
      String.raw`\\server\;share\artifact.bin`],
    ['question mark inside one UNC segment',
      String.raw`\\server\?share\artifact.bin`],
    ['hash inside one UNC segment',
      String.raw`\\server\#share\artifact.bin`],
    ['single UNC with nested share path',
      String.raw`\\server\share\folder\artifact.bin`],
    ['file URL punctuation keeps its local-looking suffix in one token',
      'file:/server/a&/home/second.txt'],
    ['triple forward separator UNC prefix',
      '///server/share/artifact.bin'],
    ['quadruple forward separator UNC prefix',
      '////server/share/artifact.bin'],
    ['encoded triple separator UNC prefix',
      '%2F%2F%2Fserver%2Fshare%2Fartifact.bin'],
    ['HTTPS path triple separator UNC prefix',
      'https://example.test/path=///server/share/artifact.bin'],
    ['separator run inside one UNC path',
      String.raw`\\server\share///folder/artifact.bin`],
    ['separator run after punctuation inside one UNC path',
      String.raw`\\server\share.//folder/file`],
    ['encoded separator run after punctuation inside one UNC path',
      '%5C%5Cserver%5Cshare.%2F%2Ffolder%2Ffile'],
    ['equals and separator run inside one UNC path',
      String.raw`\\server\share=//folder/file`],
    ['encoded equals and separator run inside one UNC path',
      '%5C%5Cserver%5Cshare%3D%2F%2Ffolder%2Ffile'],
    ['mixed triple separator UNC prefix',
      String.raw`/\\server\share\artifact.bin`],
    ['two whitespace-separated UNC references',
      String.raw`\\one\share \\two\share`, 2],
    ['UNC followed by a new file scheme',
      String.raw`\\one\share,file:/two`, 2],
    ['two whitespace-separated file URLs',
      'file:/one file:/two', 2],
    ['overlapping file URL and absolute path matchers',
      'file:///home/alice/artifact.bin'],
    ['ninth percent round exhausts the budget',
      '%252525252525252541']
  ]) {
    await t.test(name, async (t) => {
      const projectRoot = await checkedInAuditFixture(t);
      await fs.appendFile(
        path.join(projectRoot, MANUAL_PATH),
        `${reference}\n`,
        'utf8'
      );

      const audit = await auditCheckedInPlaybookV01({ projectRoot });

      assert.equal(audit.public_leak_count, expectedCount);
      assert.ok(audit.gate.blocker_codes.includes('PUBLIC_SOURCE_LEAK'));
      assert.equal(audit.gate.status, 'blocked');
    });
  }

  await t.test('partially encoded public HTTPS path remains exempt', async (t) => {
    const projectRoot = await checkedInAuditFixture(t);
    await fs.appendFile(
      path.join(projectRoot, MANUAL_PATH),
      'h%74tps://example.test/?next=/home/alice/public.txt\n',
      'utf8'
    );

    const audit = await auditCheckedInPlaybookV01({ projectRoot });

    assert.equal(audit.public_leak_count, 0);
    assert.equal(audit.gate.blocker_codes.includes('PUBLIC_SOURCE_LEAK'), false);
  });

  await t.test('ordinary public HTTPS path remains exempt', async (t) => {
    const projectRoot = await checkedInAuditFixture(t);
    await fs.appendFile(
      path.join(projectRoot, MANUAL_PATH),
      'https://example.test/path/file.txt\n',
      'utf8'
    );

    const audit = await auditCheckedInPlaybookV01({ projectRoot });

    assert.equal(audit.public_leak_count, 0);
    assert.equal(audit.gate.blocker_codes.includes('PUBLIC_SOURCE_LEAK'), false);
  });

  for (const [name, reference] of [
    ['exactly eight percent rounds remain within budget',
      '%2525252525252541'],
    ['malformed percent text stays literal',
      'plain % text %2 %GG %C3%A9']
  ]) {
    await t.test(name, async (t) => {
      const projectRoot = await checkedInAuditFixture(t);
      await fs.appendFile(
        path.join(projectRoot, MANUAL_PATH),
        `${reference}\n`,
        'utf8'
      );

      const audit = await auditCheckedInPlaybookV01({ projectRoot });

      assert.equal(audit.public_leak_count, 0);
      assert.equal(audit.gate.blocker_codes.includes('PUBLIC_SOURCE_LEAK'), false);
    });
  }
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

test('audit resolver exception is physical-file and AST-shape bound', {
  concurrency: false
}, async (t) => {
  const auditPath = path.join(
    ROOT,
    'src/playbook/manual/manualDependencyBoundary.js'
  );
  const originalSource = await fs.readFile(auditPath, 'utf8');
  const trustedResolver = [
    '      const resolved = createRequire(pathToFileURL(importerPath))',
    '        .resolve(dependency.specifier);'
  ].join('\n');

  await t.test('real physical auditor and pinned resolver dependency pass', async () => {
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot: ROOT
    });

    assert.equal(audit.import_boundary_violation_count, 0);
    assert.equal(audit.import_boundary_unresolved_count, 0);
    assert.ok(audit.resolved_manual_dependency_paths.includes(
      'src/playbook/manual/manualDependencyBoundary.js'
    ));
    assert.ok(audit.resolved_manual_dependency_paths.includes(
      'node_modules/import-meta-resolve/lib/resolve.js'
    ));
    assert.equal(Object.isFrozen(audit), true);
    for (const value of Object.values(audit)) {
      if (Array.isArray(value)) assert.equal(Object.isFrozen(value), true);
    }
  });

  for (const fixture of [
    {
      name: 'same-byte copy with a different basename',
      relativePath: 'src/playbook/manual/not-the-auditor.js'
    },
    {
      name: 'same-byte path spoof with the auditor basename',
      relativePath:
        'src/playbook/manual/resolver-path-spoof/manualDependencyBoundary.js'
    }
  ]) {
    await t.test(fixture.name, async () => {
      await withTemporaryProjectFile(
        fixture.relativePath,
        originalSource,
        async () => {
          const audit = await playbookCompiler.auditManualDependencyBoundary({
            projectRoot: ROOT
          });

          assert.deepEqual(audit.unresolved_manual_dependencies, [
            `${fixture.relativePath}:DYNAMIC_NODE_MODULE_CAPABILITY`
          ]);
          assert.equal(Object.isFrozen(audit), true);
          assert.equal(
            Object.isFrozen(audit.unresolved_manual_dependencies),
            true
          );
          assert.doesNotMatch(
            JSON.stringify(audit.unresolved_manual_dependencies),
            new RegExp(escapeRegExp(ROOT), 'u')
          );
        }
      );
    });
  }

  const mutations = [
    {
      name: 'direct loader call',
      source: replaceExactlyOnce(originalSource, trustedResolver, [
        '      const resolved = createRequire(import.meta.url)(',
        "        '../../construction/target.cjs'",
        '      );'
      ].join('\n'))
    },
    {
      name: 'exported loader value',
      source: `${originalSource}\nconst load = createRequire(import.meta.url);\nexport { load };\n`
    },
    {
      name: 'computed resolve member',
      source: replaceExactlyOnce(originalSource, trustedResolver, [
        "      const method = 'resolve';",
        '      const resolved = createRequire(pathToFileURL(importerPath))',
        '        [method](dependency.specifier);'
      ].join('\n'))
    },
    {
      name: 'shadowed pathToFileURL binding',
      source: replaceExactlyOnce(
        originalSource,
        'async function resolveDependency({ importerPath, dependency }) {',
        [
          'async function resolveDependency({ importerPath, dependency }) {',
          '  const pathToFileURL = () => new URL(import.meta.url);'
        ].join('\n')
      )
    }
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, async () => {
      await withTemporaryFileContents(auditPath, mutation.source, async () => {
        const audit = await playbookCompiler.auditManualDependencyBoundary({
          projectRoot: ROOT
        });

        assert.deepEqual(audit.unresolved_manual_dependencies, [
          'src/playbook/manual/manualDependencyBoundary.js:'
            + 'DYNAMIC_NODE_MODULE_CAPABILITY'
        ]);
        assert.equal(audit.import_boundary_violation_count, 0);
        assert.equal(audit.import_boundary_unresolved_count, 1);
      });
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

test('capability deny rejects unsupported loader roots before value propagation', async (t) => {
  const deniedSources = [
    "import Module from 'node:module'; export default Module.createRequire(import.meta.url)('../../construction/target.cjs');",
    "import { default as Module } from 'node:module'; export default Module['createRequire'](import.meta.url)('../../construction/target.cjs');",
    "const make = require('node:module').createRequire; module.exports = make(__filename)('../../construction/target.cjs');",
    "module.exports = module.constructor.createRequire(__filename)('../../construction/target.cjs');",
    "module.exports = process.getBuiltinModule('node:module').createRequire(__filename)('../../construction/target.cjs');",
    "module.exports = module['require']('../../construction/target.cjs');"
  ];

  for (const [index, source] of deniedSources.entries()) {
    await t.test(`unsupported loader root ${index + 1}`, async (t) => {
      const isEsm = index < 2;
      const entryPath = `src/playbook/manual/entry.${isEsm ? 'js' : 'cjs'}`;
      const projectRoot = await dependencyFixture(t, {
        ...(isEsm ? { 'package.json': '{"type":"module"}\n' } : {}),
        [entryPath]: `${source}\n`,
        'src/construction/target.cjs':
          "module.exports = 'construction-executed';\n"
      });

      assert.equal(
        await (isEsm ? importDefault : requireDefault)(path.join(projectRoot, entryPath)),
        'construction-executed'
      );

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.ok(
        audit.import_boundary_violation_count
          + audit.import_boundary_unresolved_count >= 1,
        source
      );
    });
  }

  const propagationFixtures = [
    {
      name: 'long alias chain',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        'const load0 = require;',
        'const load1 = load0;',
        'const load2 = load1;',
        'const load3 = load2;',
        'const load4 = load3;',
        'const load5 = load4;',
        'const load6 = load5;',
        'const load7 = load6;',
        'const load8 = load7;',
        'const load9 = load8;',
        'const load10 = load9;',
        'const load11 = load10;',
        'const load12 = load11;',
        'const load13 = load12;',
        'const load14 = load13;',
        'const load15 = load14;',
        'const load16 = load15;',
        'const load17 = load16;',
        'const load18 = load17;',
        'const load19 = load18;',
        'const load20 = load19;',
        'const load21 = load20;',
        "module.exports = load21('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault
    },
    {
      name: 'default parameter',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        'function loadTarget(load = require) {',
        "  return load('../../construction/target.cjs');",
        '}',
        'module.exports = loadTarget();',
        ''
      ].join('\n'),
      execute: requireDefault
    },
    {
      name: 'default parameter is not shadowed by body var',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        "function loadTarget(value = require('../../construction/target.cjs')) {",
        '  var require;',
        '  return value;',
        '}',
        'module.exports = loadTarget();',
        ''
      ].join('\n'),
      execute: requireDefault
    },
    {
      name: 'implicit return',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        'const selectLoader = () => require;',
        "module.exports = selectLoader()('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault
    },
    {
      name: 'destructuring assignment',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        'let makeLoader;',
        "({ createRequire: makeLoader } = process.getBuiltinModule('node:module'));",
        "module.exports = makeLoader(__filename)('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault
    },
    {
      name: 'throw catch',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        'let load;',
        'try { throw require; } catch (caught) { load = caught; }',
        "module.exports = load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault
    },
    {
      name: 'literal dynamic import node module capability',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "const Module = await import('node:module');",
          "export default Module.createRequire(import.meta.url)('../../construction/target.cjs');",
          ''
        ].join('\n')
      },
      execute: importDefault,
      expectedCode: 'DYNAMIC_NODE_MODULE_CAPABILITY'
    },
    {
      name: 'ESM re-export',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import makeLoader from './factory.js';",
          "export default makeLoader(import.meta.url)('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.js':
          "export { createRequire as default } from 'node:module';\n"
      },
      execute: importDefault
    },
    {
      name: 'CJS export',
      entryPath: 'src/playbook/manual/entry.cjs',
      files: {
        'src/playbook/manual/entry.cjs': [
          "const makeLoader = require('./factory.cjs');",
          "module.exports = makeLoader(__filename)('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.cjs':
          "module.exports = require('node:module').createRequire;\n"
      },
      execute: requireDefault
    }
  ];

  for (const fixture of propagationFixtures) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, {
        ...(fixture.files ?? { [fixture.entryPath]: fixture.source }),
        'src/construction/target.cjs':
          "module.exports = 'construction-executed';\n"
      });

      assert.equal(
        await fixture.execute(path.join(projectRoot, fixture.entryPath)),
        'construction-executed'
      );

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.ok(
        audit.import_boundary_violation_count
          + audit.import_boundary_unresolved_count >= 1,
        fixture.name
      );
      if (fixture.expectedCode) {
        assert.deepEqual(audit.unresolved_manual_dependencies, [
          `${fixture.entryPath}:${fixture.expectedCode}`
        ]);
      }
    });
  }
});

test('capability deny allows only literal static edges and shadowed local names', async (t) => {
  await t.test('named isBuiltin import is safe', async (t) => {
    const entryPath = 'src/playbook/manual/entry.js';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      [entryPath]: [
        "import { isBuiltin } from 'node:module';",
        "export default isBuiltin('node:fs');",
        ''
      ].join('\n')
    });

    assert.equal(await importDefault(path.join(projectRoot, entryPath)), true);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.equal(audit.import_boundary_violation_count, 0);
    assert.equal(audit.import_boundary_unresolved_count, 0);
  });

  await t.test('business module builtinModules import remains denied', async (t) => {
    const entryPath = 'src/playbook/manual/entry.js';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      [entryPath]: [
        "import { builtinModules } from 'node:module';",
        "export default builtinModules.includes('fs');",
        ''
      ].join('\n')
    });

    assert.equal(await importDefault(path.join(projectRoot, entryPath)), true);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.deepEqual(audit.unresolved_manual_dependencies, [
      `${entryPath}:DYNAMIC_NODE_MODULE_CAPABILITY`
    ]);
  });

  await t.test('user package builtinModules import remains denied', async (t) => {
    const entryPath = 'src/playbook/manual/entry.js';
    const packagePath = 'node_modules/user-capability-package/index.js';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      [entryPath]: "export { default } from 'user-capability-package';\n",
      'node_modules/user-capability-package/package.json': JSON.stringify({
        name: 'user-capability-package',
        type: 'module',
        exports: './index.js'
      }),
      [packagePath]: [
        "import { builtinModules } from 'node:module';",
        "export default builtinModules.includes('fs');",
        ''
      ].join('\n')
    });

    assert.equal(await importDefault(path.join(projectRoot, entryPath)), true);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.deepEqual(audit.unresolved_manual_dependencies, [
      `${packagePath}:DYNAMIC_NODE_MODULE_CAPABILITY`
    ]);
  });

  await t.test('project dependency symlink cannot grant builtinModules trust', async (t) => {
    const entryPath = 'src/playbook/manual/entry.js';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      [entryPath]: [
        "import { builtinModules } from 'node:module';",
        "export default builtinModules.includes('fs');",
        ''
      ].join('\n')
    });
    const resolverPath = path.join(
      projectRoot,
      'node_modules/import-meta-resolve/lib/resolve.js'
    );
    await fs.mkdir(path.dirname(resolverPath), { recursive: true });
    await fs.symlink(path.join(projectRoot, entryPath), resolverPath);

    assert.equal(await importDefault(path.join(projectRoot, entryPath)), true);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.deepEqual(audit.unresolved_manual_dependencies, [
      `${entryPath}:DYNAMIC_NODE_MODULE_CAPABILITY`
    ]);
  });

  await t.test('pinned package path does not exempt bare module source', async (t) => {
    const entryPath = 'src/playbook/manual/entry.js';
    const resolverPath = 'node_modules/import-meta-resolve/lib/resolve.js';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      [entryPath]:
        "export { default } from 'import-meta-resolve/lib/resolve.js';\n",
      'node_modules/import-meta-resolve/package.json': JSON.stringify({
        name: 'import-meta-resolve',
        type: 'module'
      }),
      [resolverPath]: [
        "import { builtinModules } from 'module';",
        "export default builtinModules.includes('fs');",
        ''
      ].join('\n')
    });

    assert.equal(await importDefault(path.join(projectRoot, entryPath)), true);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.deepEqual(audit.unresolved_manual_dependencies, [
      `${resolverPath}:DYNAMIC_NODE_MODULE_CAPABILITY`
    ]);
  });

  await t.test('shadowed local capability names are safe', async (t) => {
    const entryPath = 'src/playbook/manual/entry.js';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      [entryPath]: [
        'function local(require, module, process, evalFn, FunctionCtor) {',
        "  return [require('safe'), module.require('safe'), process(), evalFn(), FunctionCtor()];",
        '}',
        'export default local(',
        "  () => 'local-require',",
        "  { require: () => 'local-module' },",
        "  () => 'local-process',",
        "  () => 'local-eval',",
        "  () => 'local-function'",
        ');',
        ''
      ].join('\n')
    });

    assert.deepEqual(await importDefault(path.join(projectRoot, entryPath)), [
      'local-require',
      'local-module',
      'local-process',
      'local-eval',
      'local-function'
    ]);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.equal(audit.import_boundary_violation_count, 0);
    assert.equal(audit.import_boundary_unresolved_count, 0);
  });

  for (const fixture of [
    {
      name: 'earlier parameter shadows require in a default initializer',
      source: [
        "function local(require, value = require('safe')) {",
        '  return value;',
        '}',
        "module.exports = local(() => 'parameter-safe');",
        ''
      ].join('\n'),
      expected: 'parameter-safe'
    },
    {
      name: 'function body var shadows require in the body',
      source: [
        'function local() {',
        "  var require = () => 'body-safe';",
        "  return require('safe');",
        '}',
        'module.exports = local();',
        ''
      ].join('\n'),
      expected: 'body-safe'
    }
  ]) {
    await t.test(fixture.name, async (t) => {
      const entryPath = 'src/playbook/manual/entry.cjs';
      const projectRoot = await dependencyFixture(t, {
        [entryPath]: fixture.source
      });

      assert.equal(
        requireDefault(path.join(projectRoot, entryPath)),
        fixture.expected
      );
      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(audit.import_boundary_violation_count, 0);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }

  const stableCapabilityFacts = [
    {
      name: 'node module capability',
      source: [
        "const Module = require('node:module');",
        "module.exports = Module.isBuiltin('node:fs');",
        ''
      ].join('\n'),
      expected: true,
      code: 'DYNAMIC_NODE_MODULE_CAPABILITY'
    },
    {
      name: 'indirect require capability',
      source: [
        'const load = require;',
        "module.exports = load('node:path').sep;",
        ''
      ].join('\n'),
      expected: path.sep,
      code: 'INDIRECT_REQUIRE_CAPABILITY'
    },
    {
      name: 'indirect module require capability',
      source: [
        'const load = module.require;',
        "module.exports = load('node:path').sep;",
        ''
      ].join('\n'),
      expected: path.sep,
      code: 'INDIRECT_MODULE_REQUIRE_CAPABILITY'
    },
    {
      name: 'process builtin module capability',
      source:
        "module.exports = process.getBuiltinModule('node:path').sep;\n",
      expected: path.sep,
      code: 'PROCESS_BUILTIN_MODULE_CAPABILITY'
    },
    {
      name: 'dynamic eval capability',
      source: "module.exports = eval(\"'eval-executed'\");\n",
      expected: 'eval-executed',
      code: 'DYNAMIC_EVAL_CAPABILITY'
    },
    {
      name: 'dynamic Function capability',
      source:
        "module.exports = Function(\"return 'function-executed'\")();\n",
      expected: 'function-executed',
      code: 'DYNAMIC_FUNCTION_CAPABILITY'
    }
  ];

  for (const fixture of stableCapabilityFacts) {
    await t.test(fixture.name, async (t) => {
      const entryPath = 'src/playbook/manual/entry.cjs';
      const projectRoot = await dependencyFixture(t, {
        [entryPath]: fixture.source
      });

      assert.equal(
        requireDefault(path.join(projectRoot, entryPath)),
        fixture.expected
      );
      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.deepEqual(audit.unresolved_manual_dependencies, [
        `${entryPath}:${fixture.code}`
      ]);
    });
  }

  const literalEdges = [
    {
      name: 'literal ESM import',
      entryPath: 'src/playbook/manual/entry.js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import target from '../../construction/target.cjs';",
        'export default target;',
        ''
      ].join('\n'),
      execute: importDefault
    },
    {
      name: 'literal ESM export',
      entryPath: 'src/playbook/manual/entry.js',
      packageJson: '{"type":"module"}\n',
      source: "export { default } from '../../construction/target.cjs';\n",
      execute: importDefault
    },
    {
      name: 'literal dynamic import',
      entryPath: 'src/playbook/manual/entry.js',
      packageJson: '{"type":"module"}\n',
      source: [
        "const target = await import('../../construction/target.cjs');",
        'export default target.default;',
        ''
      ].join('\n'),
      execute: importDefault
    },
    {
      name: 'literal direct CJS require',
      entryPath: 'src/playbook/manual/entry.cjs',
      source:
        "module.exports = require('../../construction/target.cjs');\n",
      execute: requireDefault
    }
  ];

  for (const fixture of literalEdges) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, {
        ...(fixture.packageJson ? { 'package.json': fixture.packageJson } : {}),
        [fixture.entryPath]: fixture.source,
        'src/construction/target.cjs':
          "module.exports = 'construction-executed';\n"
      });

      assert.equal(
        await fixture.execute(path.join(projectRoot, fixture.entryPath)),
        'construction-executed'
      );
      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(audit.import_boundary_violation_count, 1, fixture.name);
      assert.equal(audit.import_boundary_unresolved_count, 0, fixture.name);
    });
  }

  const computedEdges = [
    {
      name: 'computed dynamic import',
      entryPath: 'src/playbook/manual/entry.js',
      packageJson: '{"type":"module"}\n',
      source: [
        "const specifier = '../../construction/target.cjs';",
        'const target = await import(specifier);',
        'export default target.default;',
        ''
      ].join('\n'),
      execute: importDefault,
      code: 'COMPUTED_DYNAMIC_IMPORT'
    },
    {
      name: 'computed require',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        "const specifier = '../../construction/target.cjs';",
        'module.exports = require(specifier);',
        ''
      ].join('\n'),
      execute: requireDefault,
      code: 'COMPUTED_REQUIRE'
    },
    {
      name: 'computed module.require',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        "const specifier = '../../construction/target.cjs';",
        'module.exports = module.require(specifier);',
        ''
      ].join('\n'),
      execute: requireDefault,
      code: 'COMPUTED_MODULE_REQUIRE'
    }
  ];

  for (const fixture of computedEdges) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, {
        ...(fixture.packageJson ? { 'package.json': fixture.packageJson } : {}),
        [fixture.entryPath]: fixture.source,
        'src/construction/target.cjs':
          "module.exports = 'construction-executed';\n"
      });

      assert.equal(
        await fixture.execute(path.join(projectRoot, fixture.entryPath)),
        'construction-executed'
      );
      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(audit.import_boundary_violation_count, 0, fixture.name);
      assert.deepEqual(audit.unresolved_manual_dependencies, [
        `${fixture.entryPath}:${fixture.code}`
      ]);
    });
  }

  await t.test('computed module.require callee is denied', async (t) => {
    const entryPath = 'src/playbook/manual/entry.cjs';
    const projectRoot = await dependencyFixture(t, {
      [entryPath]: "module.exports = module['require']('node:path').sep;\n"
    });

    assert.equal(requireDefault(path.join(projectRoot, entryPath)), path.sep);
    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });
    assert.deepEqual(audit.unresolved_manual_dependencies, [
      `${entryPath}:INDIRECT_MODULE_REQUIRE_CAPABILITY`
    ]);
  });
});

test('loader bindings and indirect calls cannot bypass construction audit', async (t) => {
  const cases = [
    {
      name: 'createRequire loader alias',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import { createRequire as makeLoader } from 'node:module';",
        'const load = makeLoader(import.meta.url);',
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'require alias',
      extension: 'cjs',
      source: [
        'const load = require;',
        "module.exports = load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault,
    },
    {
      name: 'CommonJS createRequire loader alias',
      extension: 'cjs',
      source: [
        "const { createRequire: makeLoader } = require('node:module');",
        'const load = makeLoader(__filename);',
        "module.exports = load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault,
    },
    {
      name: 'default node module createRequire loader',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import Module from 'node:module';",
        'const load = Module.createRequire(import.meta.url);',
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'named default node module createRequire loader',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import { default as Module } from 'node:module';",
        'const load = Module.createRequire(import.meta.url);',
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'dynamic computed node module factory',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import Module from 'node:module';",
        "const key = 'createRequire';",
        'const load = Module[key](import.meta.url);',
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'dynamic computed node module factory destructure',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import Module from 'node:module';",
        "const key = 'createRequire';",
        'const { [key]: makeLoader } = Module;',
        'const load = makeLoader(import.meta.url);',
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'function-returned node module factory',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import Module from 'node:module';",
        'function selectFactory() { return Module.createRequire; }',
        'const makeLoader = selectFactory();',
        'const load = makeLoader(import.meta.url);',
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'literal computed node module factory',
      extension: 'js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import Module from 'node:module';",
        "const load = Module['createRequire'](import.meta.url);",
        "export default load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: importDefault,
    },
    {
      name: 'CommonJS module-loader member factory',
      extension: 'cjs',
      source: [
        "const makeLoader = require('node:module').createRequire;",
        'const load = makeLoader(__filename);',
        "module.exports = load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault,
    },
    {
      name: 'indirect module-loader factory container',
      extension: 'cjs',
      source: [
        "const factories = { make: require('node:module').createRequire };",
        'const load = factories.make(__filename);',
        "module.exports = load('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault,
    },
    {
      name: 'require call',
      extension: 'cjs',
      source:
        "module.exports = require.call(null, '../../construction/target.cjs');\n",
      execute: requireDefault,
    },
    {
      name: 'sequence require',
      extension: 'cjs',
      source:
        "module.exports = (0, require)('../../construction/target.cjs');\n",
      execute: requireDefault,
    },
    {
      name: 'computed module loader',
      extension: 'cjs',
      source: [
        "const method = 'require';",
        "module.exports = module[method]('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault,
    },
    {
      name: 'computed loader container',
      extension: 'cjs',
      source: [
        'const loaders = { load: require };',
        "module.exports = loaders['load']('../../construction/target.cjs');",
        ''
      ].join('\n'),
      execute: requireDefault,
    },
    {
      name: 'eval loader',
      extension: 'cjs',
      source:
        "module.exports = eval(\"require('../../construction/target.cjs')\");\n",
      execute: requireDefault,
    }
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const entryPath = `src/playbook/manual/entry.${fixture.extension}`;
      const projectRoot = await dependencyFixture(t, {
        ...(fixture.packageJson
          ? { 'package.json': fixture.packageJson }
          : {}),
        [entryPath]: fixture.source,
        'src/construction/target.cjs':
          "module.exports = 'loader-edge-executed';\n"
      });
      const absoluteEntry = path.join(projectRoot, entryPath);

      assert.equal(await fixture.execute(absoluteEntry), 'loader-edge-executed');

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.ok(
        audit.import_boundary_violation_count
          + audit.import_boundary_unresolved_count >= 1,
        fixture.name
      );
    });
  }
});

test('node module capabilities are denied even for unrelated member use', async (t) => {
  for (const fixture of [
    {
      name: 'default import unrelated member',
      entryPath: 'src/playbook/manual/entry.js',
      packageJson: '{"type":"module"}\n',
      source: [
        "import Module from 'node:module';",
        "export default Module.isBuiltin('node:fs');",
        ''
      ].join('\n'),
      execute: importDefault
    },
    {
      name: 'CommonJS loader result unrelated member',
      entryPath: 'src/playbook/manual/entry.cjs',
      source: [
        "const check = require('node:module').isBuiltin;",
        "module.exports = check('node:fs');",
        ''
      ].join('\n'),
      execute: requireDefault
    }
  ]) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, {
        ...(fixture.packageJson
          ? { 'package.json': fixture.packageJson }
          : {}),
        [fixture.entryPath]: fixture.source
      });
      const absoluteEntry = path.join(projectRoot, fixture.entryPath);

      assert.equal(await fixture.execute(absoluteEntry), true);

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(audit.import_boundary_violation_count, 0, fixture.name);
      assert.equal(audit.import_boundary_unresolved_count, 1, fixture.name);
    });
  }

  await t.test('construction target is resolved but never executed by audit', async (t) => {
    const markerPath = 'src/construction/executed.marker';
    const projectRoot = await dependencyFixture(t, {
      'package.json': '{"type":"module"}\n',
      'src/playbook/manual/entry.js':
        "import '../../construction/target.js';\n",
      'src/construction/target.js': [
        "import fs from 'node:fs';",
        "fs.writeFileSync(new URL('./executed.marker', import.meta.url), 'bad');",
        'export default true;',
        ''
      ].join('\n')
    });

    const audit = await playbookCompiler.auditManualDependencyBoundary({
      projectRoot
    });

    assert.equal(audit.import_boundary_violation_count, 1);
    assert.equal(audit.import_boundary_unresolved_count, 0);
    await assert.rejects(
      fs.access(path.join(projectRoot, markerPath)),
      (error) => error?.code === 'ENOENT'
    );
  });
});

test('loader factories cannot escape between audited modules as 0/0', async (t) => {
  for (const fixture of [
    {
      name: 'ESM named re-export',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import { makeLoader } from './factory.js';",
          'const load = makeLoader(import.meta.url);',
          "export default load('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.js':
          "export { createRequire as makeLoader } from 'node:module';\n"
      },
      execute: importDefault
    },
    {
      name: 'ESM default re-export',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import makeLoader from './factory.js';",
          'const load = makeLoader(import.meta.url);',
          "export default load('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.js':
          "export { createRequire as default } from 'node:module';\n"
      },
      execute: importDefault
    },
    {
      name: 'ESM node module namespace re-export',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import { Module } from './factory.js';",
          'const load = Module.createRequire(import.meta.url);',
          "export default load('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.js':
          "export { default as Module } from 'node:module';\n"
      },
      execute: importDefault
    },
    {
      name: 'CommonJS module exports factory',
      entryPath: 'src/playbook/manual/entry.cjs',
      files: {
        'src/playbook/manual/entry.cjs': [
          "const makeLoader = require('./factory.cjs');",
          'const load = makeLoader(__filename);',
          "module.exports = load('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.cjs':
          "module.exports = require('node:module').createRequire;\n"
      },
      execute: requireDefault
    },
    {
      name: 'CommonJS exports member factory',
      entryPath: 'src/playbook/manual/entry.cjs',
      files: {
        'src/playbook/manual/entry.cjs': [
          "const { makeLoader } = require('./factory.cjs');",
          'const load = makeLoader(__filename);',
          "module.exports = load('../../construction/target.cjs');",
          ''
        ].join('\n'),
        'src/playbook/manual/factory.cjs':
          "exports.makeLoader = require('node:module').createRequire;\n"
      },
      execute: requireDefault
    }
  ]) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, {
        ...fixture.files,
        'src/construction/target.cjs':
          "module.exports = 'factory-escape-executed';\n"
      });

      assert.equal(
        await fixture.execute(path.join(projectRoot, fixture.entryPath)),
        'factory-escape-executed'
      );

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(audit.import_boundary_violation_count, 0, fixture.name);
      assert.equal(audit.import_boundary_unresolved_count, 1, fixture.name);
    });
  }
});

test('capability roots respect lexical shadowing without taint propagation', async (t) => {
  for (const fixture of [
    {
      name: 'shadowed Module parameter',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import Module from 'node:module';",
          'function safe(Module) {',
          '  const load = Module.createRequire(import.meta.url);',
          "  return load('../../construction/target.cjs');",
          '}',
          "export default safe({ createRequire: () => () => 'parameter-safe' });",
          ''
        ].join('\n')
      },
      execute: importDefault,
      expected: 'parameter-safe',
      violationCount: 0,
      unresolvedCount: 1
    },
    {
      name: 'shadowed local Module',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import Module from 'node:module';",
          'let result;',
          '{',
          "  const Module = { createRequire: () => () => 'local-safe' };",
          '  const load = Module.createRequire(import.meta.url);',
          "  result = load('../../construction/target.cjs');",
          '}',
          'export default result;',
          ''
        ].join('\n')
      },
      execute: importDefault,
      expected: 'local-safe',
      violationCount: 0,
      unresolvedCount: 1
    },
    {
      name: 'shadowed require parameter',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          'function safe(require) {',
          "  return require('../../construction/target.cjs');",
          '}',
          "export default safe(() => 'require-safe');",
          ''
        ].join('\n')
      },
      execute: importDefault,
      expected: 'require-safe',
      violationCount: 0,
      unresolvedCount: 0
    },
    {
      name: 'nested imported Module remains tainted',
      entryPath: 'src/playbook/manual/entry.js',
      files: {
        'package.json': '{"type":"module"}\n',
        'src/playbook/manual/entry.js': [
          "import Module from 'node:module';",
          'function nested() {',
          '  const load = Module.createRequire(import.meta.url);',
          "  return load('../../construction/target.cjs');",
          '}',
          'export default nested();',
          ''
        ].join('\n'),
        'src/construction/target.cjs':
          "module.exports = 'nested-module-executed';\n"
      },
      execute: importDefault,
      expected: 'nested-module-executed',
      violationCount: 0,
      unresolvedCount: 1
    },
    {
      name: 'nested CommonJS require remains tainted',
      entryPath: 'src/playbook/manual/entry.cjs',
      files: {
        'src/playbook/manual/entry.cjs': [
          'function nested() {',
          "  return require('../../construction/target.cjs');",
          '}',
          'module.exports = nested();',
          ''
        ].join('\n'),
        'src/construction/target.cjs':
          "module.exports = 'nested-require-executed';\n"
      },
      execute: requireDefault,
      expected: 'nested-require-executed',
      violationCount: 1,
      unresolvedCount: 0
    }
  ]) {
    await t.test(fixture.name, async (t) => {
      const projectRoot = await dependencyFixture(t, fixture.files);

      assert.equal(
        await fixture.execute(path.join(projectRoot, fixture.entryPath)),
        fixture.expected
      );

      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(
        audit.import_boundary_violation_count,
        fixture.violationCount,
        fixture.name
      );
      assert.equal(
        audit.import_boundary_unresolved_count,
        fixture.unresolvedCount,
        fixture.name
      );
    });
  }
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

test('package dependency internal construction edge executes and is audited', async (t) => {
  for (const fixture of [
    {
      name: 'static re-export',
      packageSource:
        "export { default } from '../../src/construction/target.js';\n"
    },
    {
      name: 'literal dynamic import',
      packageSource: [
        "const target = await import('../../src/construction/target.js');",
        'export default target.default;',
        ''
      ].join('\n')
    }
  ]) {
    await t.test(fixture.name, async (t) => {
      const entryPath = 'src/playbook/manual/entry.js';
      const projectRoot = await dependencyFixture(t, {
        'package.json': '{"type":"module"}\n',
        [entryPath]: "export { default } from 'boundary-package';\n",
        'node_modules/boundary-package/package.json': JSON.stringify({
          name: 'boundary-package',
          type: 'module',
          exports: './index.js'
        }),
        'node_modules/boundary-package/index.js': fixture.packageSource,
        'src/construction/target.js':
          "export default 'construction-executed';\n"
      });

      assert.equal(
        await importDefault(path.join(projectRoot, entryPath)),
        'construction-executed'
      );
      const audit = await playbookCompiler.auditManualDependencyBoundary({
        projectRoot
      });
      assert.equal(audit.import_boundary_violation_count, 1, fixture.name);
      assert.equal(audit.import_boundary_unresolved_count, 0, fixture.name);
    });
  }
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
  // These fixtures execute the already-imported real compiler. Keep its copied
  // dependency edge resolvable without pretending the copy is the auditor.
  await fs.writeFile(
    path.join(projectRoot, 'src/playbook/manual/manualDependencyBoundary.js'),
    'export async function auditManualDependencyBoundary() {}\n',
    'utf8'
  );
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
    await commitFixture(projectRoot, 'checked-in audit fixture');
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

async function withTemporaryProjectFile(relativePath, contents, callback) {
  const absolutePath = path.join(ROOT, relativePath);
  await assert.rejects(fs.access(absolutePath));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents, 'utf8');
  try {
    return await callback();
  } finally {
    await fs.rm(absolutePath, { force: true });
    const parentPath = path.dirname(absolutePath);
    if (parentPath !== path.join(ROOT, 'src/playbook/manual')) {
      await fs.rmdir(parentPath);
    }
  }
}

async function withTemporaryFileContents(filePath, contents, callback) {
  const original = await fs.readFile(filePath, 'utf8');
  await fs.writeFile(filePath, contents, 'utf8');
  try {
    return await callback();
  } finally {
    await fs.writeFile(filePath, original, 'utf8');
  }
}

function replaceExactlyOnce(source, search, replacement) {
  assert.equal(source.split(search).length, 2);
  return source.replace(search, replacement);
}

async function runGit(projectRoot, args) {
  await execFileAsync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });
}

async function commitFixture(projectRoot, message) {
  await runGit(projectRoot, [
    '-c', 'user.name=Playbook Test',
    '-c', 'user.email=playbook-test@example.invalid',
    'commit', '--quiet', '-m', message
  ]);
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

function requireDefault(modulePath) {
  return createRequire(import.meta.url)(modulePath);
}
