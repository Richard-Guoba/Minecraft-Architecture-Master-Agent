import test from 'node:test';
import assert from 'node:assert/strict';
import { ConceptStudioAgent } from '../src/construction/agents/conceptStudioAgent.js';

test('ConceptStudioAgent creates deterministic prompt-matched concept cards', async () => {
  const prompt = '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰';
  const architecture = {
    style: '现代',
    style_family: 'modern',
    typology: 'house',
    generation_hints: {}
  };
  const buildSpec = {
    seed: 7101,
    floors: 2,
    roof_style: 'flat',
    facade: { large_glass: true },
    site: { water_feature: true }
  };
  const topology = {
    nodes: [
      { id: 'living', type: 'living', floor: 0 },
      { id: 'kitchen', type: 'kitchen', floor: 0 },
      { id: 'study', type: 'study', floor: 1 }
    ],
    edges: []
  };
  const templateKnowledge = templateKnowledgeFixture();

  const first = await new ConceptStudioAgent({ mode: 'mock' }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count: 3, strategy: 'select', seed: 7101 }
  );
  const second = await new ConceptStudioAgent({ mode: 'mock' }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count: 3, strategy: 'select', seed: 7101 }
  );

  assert.deepEqual(first, second);
  assert.equal(first.source, 'local-concept-studio-agent');
  assert.equal(first.active, true);
  assert.equal(first.version, 1);
  assert.equal(first.strategy, 'select');
  assert.equal(first.concept_count, 3);
  assert.equal(first.concepts.length, 3);
  assert.equal(new Set(first.concepts.map((item) => item.id)).size, 3);
  assert.ok(first.concepts.some((item) => item.archetype === 'view-courtyard'));
  assert.ok(first.concepts[0].reference_strategy.length >= 1);
  assert.ok(first.concepts[0].creative_design_patch.facade);
  assert.equal(JSON.stringify(first).includes('"x"'), false);
  assert.equal(JSON.stringify(first).includes('"y"'), false);
  assert.equal(JSON.stringify(first).includes('"z"'), false);
});

test('ConceptStudioAgent clamps concept count and preserves inactive result below two concepts', async () => {
  const active = await new ConceptStudioAgent({ mode: 'mock' }).run(
    '建一个欧式宅邸',
    { style_family: 'classical', typology: 'house' },
    { seed: 12, floors: 2 },
    { nodes: [] },
    {},
    { count: 9, strategy: 'select', seed: 12 }
  );
  const inactive = await new ConceptStudioAgent({ mode: 'mock' }).run(
    '建一个欧式宅邸',
    { style_family: 'classical', typology: 'house' },
    { seed: 12, floors: 2 },
    { nodes: [] },
    {},
    { count: 1, strategy: 'select', seed: 12 }
  );

  assert.equal(active.concept_count, 5);
  assert.equal(active.concepts.length, 5);
  assert.equal(inactive.active, false);
  assert.equal(inactive.concept_count, 0);
  assert.match(inactive.warnings.join(' '), /at least two concepts/);
});

function templateKnowledgeFixture() {
  return {
    active: true,
    retrieval_explanation: {
      active: true,
      references: [
        {
          rank: 1,
          case_id: 'house-modern-waterfront',
          title: 'Modern Waterfront House',
          diversity_slot: 'modern-house-water-glass',
          matched_signals: ['token:modern', 'token:water-edge', 'token:large-glass'],
          teaches: [
            { area: 'facade', claim: 'Large glass should serve view-facing rooms.', confidence: 0.9 },
            { area: 'site', claim: 'Use deck edges as transition between house and water.', confidence: 0.84 }
          ],
          risk_controls: ['change exact dimensions and detail placement'],
          integration_targets: ['FacadeAgent', 'SiteLandscapeAgent']
        },
        {
          rank: 2,
          case_id: 'house-interior-gallery',
          title: 'Interior Gallery House',
          diversity_slot: 'interior-furnished',
          matched_signals: ['token:interior'],
          teaches: [
            { area: 'interior', claim: 'Use focal wall details and display shelves for inhabited rooms.', confidence: 0.82 }
          ],
          risk_controls: ['do not copy room order'],
          integration_targets: ['InteriorDetailAgent', 'DecoratorAgent']
        }
      ],
      warnings: []
    }
  };
}
