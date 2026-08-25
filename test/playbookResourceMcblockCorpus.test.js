import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCommittedResourceSource } from './helpers/loadCommittedResourceSource.js';

test('MCBlock corpus contains exactly the five approved probes', async () => {
  const corpus = await loadCommittedResourceSource('mcblock');
  assert.deepEqual(corpus.probes.map((probe) => probe.probe_id), [
    'mcblock-cinnamoroll-cafe-7583ff98',
    'mcblock-modern-office-four-06941222',
    'mcblock-sakura-witch-house-5f3aff4d',
    'mcblock-teahouse-c8db481c',
    'mcblock-victorian-manor-6e5b406e'
  ]);
  assert.equal(corpus.profile.lifecycle_status, 'assessed');
  assert.equal(corpus.profile.assessment.recommendation, 'recommend-defer');
  assert.deepEqual(corpus.profile.decision_history, []);
  assert.equal(corpus.assessment_sha256, corpus.profile.assessment.sha256);
});
