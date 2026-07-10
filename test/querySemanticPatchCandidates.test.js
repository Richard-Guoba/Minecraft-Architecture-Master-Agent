import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { querySemanticPatchCandidates } from '../src/querySemanticPatchCandidates.js';

test('querySemanticPatchCandidates CLI filters patch candidates as a table', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-patches-'));
  const datasetFile = path.join(root, 'semantic_patch_dataset.json');
  await fs.writeFile(datasetFile, `${JSON.stringify(datasetFixture(), null, 2)}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    'src/querySemanticPatchCandidates.js',
    '--dataset',
    datasetFile,
    '--category',
    'facade',
    '--band',
    'high',
    '--limit',
    '1'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Stage 6 semantic patch training candidates/);
  assert.match(result.stdout, /modern-facade/);
  assert.match(result.stdout, /score=86/);
  assert.doesNotMatch(result.stdout, /arena-interior/);
});

test('querySemanticPatchCandidates can emit json for risk-filtered candidates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-patches-json-'));
  const datasetFile = path.join(root, 'semantic_patch_dataset.json');
  const output = [];
  const errors = [];
  await fs.writeFile(datasetFile, `${JSON.stringify(datasetFixture(), null, 2)}\n`, 'utf8');

  const status = await querySemanticPatchCandidates({
    argv: ['--dataset', datasetFile, '--risk', 'domestic rooms', '--json'],
    cwd: process.cwd(),
    stdout: { write(chunk) { output.push(String(chunk)); } },
    stderr: { write(chunk) { errors.push(String(chunk)); } }
  });
  const parsed = JSON.parse(output.join(''));

  assert.equal(status, 0);
  assert.equal(errors.join(''), '');
  assert.equal(parsed.source, 'stage6-semantic-patch-candidate-query-v1');
  assert.equal(parsed.result_count, 1);
  assert.equal(parsed.candidates[0].patch_id, 'arena-interior');
  assert.ok(parsed.candidates[0].penalties.includes('interior mining blocked by risk control'));
});

test('querySemanticPatchCandidates reports missing dataset files', async () => {
  const errors = [];
  const status = await querySemanticPatchCandidates({
    argv: ['--dataset', path.join(os.tmpdir(), 'missing-semantic-patch-dataset.json')],
    cwd: process.cwd(),
    stdout: { write() {} },
    stderr: { write(chunk) { errors.push(String(chunk)); } }
  });

  assert.equal(status, 1);
  assert.match(errors.join(''), /Could not read semantic patch dataset/);
});

function datasetFixture() {
  const patches = [
    patchFixture({
      patch_id: 'modern-facade',
      category: 'facade',
      tags: ['large-glass', 'modern', 'house', 'water-edge'],
      confidence: 0.92,
      evidence: ['facade unit', 'label unit'],
      risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
    }),
    patchFixture({
      patch_id: 'arena-interior',
      category: 'interior',
      tags: ['arena', 'furnished', 'classical'],
      confidence: 0.88,
      evidence: ['interior unit', 'label unit'],
      risk_controls: [
        'use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms',
        'arena-not-for-room-mining'
      ]
    }),
    patchFixture({
      patch_id: 'thin-roof',
      category: 'roof',
      tags: ['roof'],
      confidence: 0.55,
      evidence: ['roof unit'],
      risk_controls: [],
      semantic_voxels: [{ x: 0, y: 0, z: 0, role: 'roof-surface', occupancy: 'solid' }]
    })
  ];
  return {
    source: 'stage6-semantic-voxel-patch-dataset-v1',
    schema_version: 1,
    generated_at: '2026-07-09T00:00:00.000Z',
    patch_count: patches.length,
    categories: ['courtyard', 'facade', 'interior', 'roof'],
    patches
  };
}

function patchFixture({
  patch_id,
  category,
  tags,
  confidence,
  evidence,
  risk_controls,
  semantic_voxels
}) {
  const voxels = semantic_voxels || [
    { x: 0, y: 0, z: 0, role: 'frame', occupancy: 'solid' },
    { x: 1, y: 0, z: 0, role: 'detail', occupancy: 'replaceable' },
    { x: 2, y: 0, z: 0, role: 'opening', occupancy: 'air' }
  ];
  return {
    patch_id,
    case_id: `${patch_id}-case`,
    title: `${patch_id} patch`,
    category,
    tags,
    semantic_voxels: voxels.map((voxel) => ({
      ...voxel,
      material_role: voxel.material_role || 'fixture',
      confidence,
      evidence
    })),
    risk_controls
  };
}
