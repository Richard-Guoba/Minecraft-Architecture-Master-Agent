import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCommittedResourceSource } from './helpers/loadCommittedResourceSource.js';

test('Chinese Minecraft Wiki corpus contains exactly five collective-reference probes', async () => {
  const corpus = await loadCommittedResourceSource('zh-minecraft-wiki');
  assert.equal(corpus.probes.length, 5);
  assert.ok(corpus.probes.every((probe) =>
    ['unknown', 'not-applicable'].includes(probe.creator_observation.status)
  ));
  assert.ok(corpus.probes.every((probe) =>
    !probe.observation_bases.includes('direct-page')
  ));
  assert.equal(corpus.profile.assessment.recommendation, 'recommend-defer');
  assert.equal(corpus.assessment_sha256, corpus.profile.assessment.sha256);
});
