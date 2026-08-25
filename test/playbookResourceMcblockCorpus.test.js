import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCommittedResourceSource } from './helpers/loadCommittedResourceSource.js';

const RATING_DIMENSIONS = [
  'principles', 'construction_sequence', 'reference_case', 'materials',
  'survival_constraints', 'evaluation', 'provenance', 'access_stability', 'rights_clarity'
];

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
  assert.deepEqual(corpus.probes.map(probeContract), [
    {
      probe_id: 'mcblock-cinnamoroll-cafe-7583ff98',
      sample_role: 'beginner-curved-color-case',
      observation_bases: ['direct-page', 'site-claim', 'project-inference'],
      rating_values: [1, 3, 4, 2, 'unknown', 2, 3, 2, 'unknown']
    },
    {
      probe_id: 'mcblock-modern-office-four-06941222',
      sample_role: 'master-scale-modern-case',
      observation_bases: ['direct-page', 'site-claim', 'project-inference'],
      rating_values: ['unknown', 3, 4, 2, 'unknown', 2, 1, 1, 'unknown']
    },
    {
      probe_id: 'mcblock-sakura-witch-house-5f3aff4d',
      sample_role: 'small-beginner-case',
      observation_bases: ['direct-page', 'site-claim', 'project-inference'],
      rating_values: ['unknown', 3, 3, 2, 'unknown', 2, 1, 2, 'unknown']
    },
    {
      probe_id: 'mcblock-teahouse-c8db481c',
      sample_role: 'style-and-roof-complexity',
      observation_bases: ['direct-page', 'site-claim', 'project-inference'],
      rating_values: [1, 3, 4, 2, 'unknown', 2, 3, 2, 'unknown']
    },
    {
      probe_id: 'mcblock-victorian-manor-6e5b406e',
      sample_role: 'large-medieval-detail-case',
      observation_bases: ['direct-page', 'site-claim', 'project-inference'],
      rating_values: [1, 4, 4, 3, 'unknown', 3, 2, 3, 'unknown']
    }
  ]);
  assert.deepEqual(
    ratingValues(corpus.profile.assessment.ratings),
    [1, 4, 4, 3, 'unknown', 2, 2, 2, 'unknown']
  );
  assert.deepEqual(corpus.profile.decision_history, []);
  assert.equal(corpus.assessment_sha256, corpus.profile.assessment.sha256);
});

function probeContract(probe) {
  return {
    probe_id: probe.probe_id,
    sample_role: probe.sample_role,
    observation_bases: probe.observation_bases,
    rating_values: ratingValues(probe.knowledge_value)
  };
}

function ratingValues(ratings) {
  return RATING_DIMENSIONS.map((dimension) => ratings[dimension].value);
}
