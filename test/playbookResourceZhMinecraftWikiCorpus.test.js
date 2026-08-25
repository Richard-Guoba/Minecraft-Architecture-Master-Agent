import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCommittedResourceSource } from './helpers/loadCommittedResourceSource.js';

const RATING_DIMENSIONS = [
  'principles', 'construction_sequence', 'reference_case', 'materials',
  'survival_constraints', 'evaluation', 'provenance', 'access_stability', 'rights_clarity'
];

test('Chinese Minecraft Wiki corpus contains exactly five collective-reference probes', async () => {
  const corpus = await loadCommittedResourceSource('zh-minecraft-wiki');
  assert.equal(corpus.probes.length, 5);
  assert.ok(corpus.probes.every((probe) =>
    ['unknown', 'not-applicable'].includes(probe.creator_observation.status)
  ));
  assert.ok(corpus.probes.every((probe) =>
    !probe.observation_bases.includes('direct-page')
  ));
  assert.deepEqual(corpus.probes.map(probeContract), [
    {
      probe_id: 'zh-wiki-best-building-materials',
      sample_role: 'material-evaluation',
      observation_bases: ['search-index', 'unverified'],
      rating_values: [3, 2, 2, 4, 4, 4, 2, 1, 'unknown']
    },
    {
      probe_id: 'zh-wiki-house-types',
      sample_role: 'survival-house-typology',
      observation_bases: ['search-index', 'unverified'],
      rating_values: [2, 3, 3, 3, 4, 2, 1, 1, 'unknown']
    },
    {
      probe_id: 'zh-wiki-roof-construction-guide',
      sample_role: 'roof-construction-sequence',
      observation_bases: ['search-index', 'unverified'],
      rating_values: [4, 4, 3, 2, 2, 4, 3, 1, 'unknown']
    },
    {
      probe_id: 'zh-wiki-roof-types',
      sample_role: 'roof-type-taxonomy',
      observation_bases: ['search-index', 'unverified'],
      rating_values: [3, 2, 4, 2, 1, 4, 2, 1, 'unknown']
    },
    {
      probe_id: 'zh-wiki-tutorial-index',
      sample_role: 'tutorial-navigation',
      observation_bases: ['search-index', 'unverified'],
      rating_values: ['unknown', 'unknown', 2, 2, 3, 2, 2, 1, 'unknown']
    }
  ]);
  assert.deepEqual(
    ratingValues(corpus.profile.assessment.ratings),
    [3, 3, 2, 4, 3, 3, 2, 1, 'unknown']
  );
  assert.equal(corpus.profile.assessment.recommendation, 'recommend-defer');
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
