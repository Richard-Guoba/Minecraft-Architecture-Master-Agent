import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  EXPECTED_DATASET_HASHES,
  PrivateResearchBoundaryError,
  assertFormalDatasetBoundary,
  assertPrivateAcknowledgement,
  assertPrivateCandidate
} from '../src/construction/learning/stage7PrivateResearchBoundary.js';

const TEST_ROOT = path.resolve('.tmp/stage7-private-research-boundary-test');

test('private boundary rejects missing acknowledgement', async () => {
  const root = await makePrivateRoot();

  await assert.rejects(
    assertPrivateAcknowledgement(root),
    (error) => error instanceof PrivateResearchBoundaryError && error.code === 'ACK_MISSING'
  );
});

test('private boundary rejects paths outside the private root and symbolic links', async () => {
  const root = await makePrivateRoot();
  await writeAcknowledgement(root);
  const linked = path.join(root, 'linked-source');
  await fs.symlink(path.resolve('package.json'), linked);

  await assert.rejects(
    assertPrivateCandidate(root, path.resolve('package.json')),
    (error) => error instanceof PrivateResearchBoundaryError && error.code === 'PATH_OUTSIDE_PRIVATE_ROOT'
  );
  await assert.rejects(
    assertPrivateCandidate(root, linked),
    (error) => error instanceof PrivateResearchBoundaryError && error.code === 'PATH_SYMLINK'
  );
});

test('formal dataset boundary verifies immutable manifest hashes and the closed gate', async () => {
  const result = await assertFormalDatasetBoundary(process.cwd());

  assert.deepEqual(result.dataset_hashes, EXPECTED_DATASET_HASHES);
  assert.deepEqual(result.dataset_v3_gate, {
    ready_for_m3_real_data: false,
    training_eligible_count: 0
  });
  assert.deepEqual(EXPECTED_DATASET_HASHES, {
    v1: hashFile('mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json'),
    v2: hashFile('mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json'),
    v3: hashFile('mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json')
  });
});

async function makePrivateRoot() {
  await fs.rm(TEST_ROOT, { recursive: true, force: true });
  await fs.mkdir(path.join(TEST_ROOT, 'source'), { recursive: true });
  return TEST_ROOT;
}

async function writeAcknowledgement(root) {
  const acknowledgement = {
    scope: 'stage7-private-research-only',
    distribution_prohibited: true,
    dataset_v3_unchanged: true,
    m4_apply_mode_unchanged: true,
    acknowledged_at: '2026-07-15T00:00:00.000Z',
    acknowledged_by: 'test-owner'
  };
  await fs.writeFile(path.join(root, 'PRIVATE_RESEARCH_ACK.json'), `${JSON.stringify(acknowledgement)}\n`, 'utf8');
}

function hashFile(relativePath) {
  return createHash('sha256').update(requireFile(relativePath)).digest('hex');
}

function requireFile(relativePath) {
  return fsSync.readFileSync(path.resolve(relativePath));
}
