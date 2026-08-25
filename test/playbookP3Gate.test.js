import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { P3_MANAGED_ARTIFACT_PATHS } from '../src/playbook/manual/p3AdmissionPolicy.js';
import { auditCheckedInPlaybookV01 } from '../src/playbook/manual/playbookV01Compiler.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const COVERAGE_PATH = 'docs/architecture-playbook/manual/coverage-v0.1.json';
const MANUAL_PATH = 'docs/architecture-playbook/manual/v0.1.md';
const NOT_COVERED_LAYERS = ['space', 'materials', 'interior', 'scene'];

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
  assert.equal(audit.gate.status, 'passed');
  assert.equal(audit.gate.next_phase, 'P4');

  const trackedPaths = await gitTrackedManagedPaths();
  assert.deepEqual(trackedPaths, [...P3_MANAGED_ARTIFACT_PATHS]);
  assert.deepEqual(audit.tracked_managed_artifact_paths, trackedPaths);

  const constructionImports = await findManualConstructionImports();
  assert.deepEqual(constructionImports, []);
  assert.deepEqual(audit.manual_construction_imports, constructionImports);

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

async function findManualConstructionImports() {
  const sourceRoot = path.join(ROOT, 'src/playbook/manual');
  const sourcePaths = (await fs.readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(sourceRoot, entry.name));
  const matches = [];
  for (const sourcePath of sourcePaths) {
    const source = await fs.readFile(sourcePath, 'utf8');
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/gmu
    )) {
      if (/(?:^|\/)construction(?:\/|$)/u.test(match[1])) {
        matches.push(`${path.relative(ROOT, sourcePath)}:${match[1]}`);
      }
    }
  }
  return matches.sort();
}
