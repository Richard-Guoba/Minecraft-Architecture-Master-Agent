import test from 'node:test';
import assert from 'node:assert/strict';
import { ConceptStudioAgent } from '../src/construction/agents/conceptStudioAgent.js';
import { ConceptSelectionAgent } from '../src/construction/agents/conceptSelectionAgent.js';

test('ConceptSelectionAgent chooses the strongest prompt-matching concept', () => {
  const concepts = [
    concept('concept-a-view-courtyard', 'view-courtyard', {
      summary: '湖边玻璃平台和水景庭院',
      quality_targets: ['view-facing public rooms', 'controlled large glazing'],
      reference_strategy: [{ case_id: 'modern-water', used_for: ['site', 'facade'], teaches: ['water deck'] }],
      risks: [{ id: 'over-glazing', severity: 'low', mitigation: 'thick surrounds' }]
    }),
    concept('concept-b-formal-axis', 'formal-axis', {
      summary: '正式入口轴线和对称翼楼',
      quality_targets: ['clear entry sequence'],
      reference_strategy: [],
      risks: [{ id: 'too-formal', severity: 'medium', mitigation: 'soften axis' }]
    })
  ];

  const selection = new ConceptSelectionAgent().run(concepts, {
    prompt: '建一个湖边现代别墅，带大玻璃和水边平台',
    architecture: { style_family: 'modern', typology: 'house' },
    buildSpec: { facade: { large_glass: true }, site: { water_feature: true } }
  });

  assert.equal(selection.source, 'local-concept-selection-agent');
  assert.equal(selection.version, 1);
  assert.equal(selection.selected_concept_id, 'concept-a-view-courtyard');
  assert.equal(selection.ranking[0].concept_id, 'concept-a-view-courtyard');
  assert.ok(selection.ranking[0].selection_score > selection.ranking[1].selection_score);
  assert.match(selection.reason, /concept-a-view-courtyard/);
  assert.equal(selection.warnings.length, 0);
});

test('ConceptSelectionAgent penalizes high risk and missing patch support', () => {
  const selection = new ConceptSelectionAgent().run([
    concept('safe', 'compact-patio', {
      summary: '紧凑露台住宅',
      quality_targets: ['buildable semantic patch'],
      reference_strategy: [{ case_id: 'compact', used_for: ['massing'], teaches: ['patio'] }],
      risks: [],
      creative_design_patch: { facade: {}, roof: {}, site: {}, interior: {}, topology: {} }
    }),
    concept('risky', 'vertical-landmark', {
      summary: '巨大塔楼',
      quality_targets: ['iconic silhouette'],
      reference_strategy: [{ case_id: 'tower', used_for: ['massing'], teaches: ['tower'] }],
      risks: [{ id: 'tower-overdominance', severity: 'high', mitigation: 'narrow tower' }],
      creative_design_patch: {}
    })
  ], {
    prompt: '建一个紧凑住宅',
    architecture: { typology: 'house' },
    buildSpec: {}
  });

  assert.equal(selection.selected_concept_id, 'safe');
  assert.ok(selection.ranking.find((item) => item.concept_id === 'risky').risk_penalty >= 20);
});

test('ConceptSelectionAgent favors water-view courtyard for lakefront glass deck prompts', async () => {
  const prompt = '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰';
  const architecture = { style: '现代', style_family: 'modern', typology: 'house' };
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
  const templateKnowledge = {
    active: true,
    retrieval_explanation: {
      active: true,
      references: [
        {
          case_id: 'house-modern-waterfront',
          title: 'Modern Waterfront House',
          diversity_slot: 'modern-house-water-glass',
          matched_signals: ['token:modern', 'token:water-edge', 'token:large-glass'],
          teaches: [
            { area: 'facade', claim: 'Large glass should serve view-facing rooms.' },
            { area: 'site', claim: 'Use deck edges as transition between house and water.' }
          ],
          risk_controls: ['change exact dimensions and detail placement']
        }
      ],
      warnings: []
    }
  };

  const studio = await new ConceptStudioAgent({ mode: 'mock' }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count: 3, strategy: 'select', seed: 7101 }
  );
  const selection = new ConceptSelectionAgent().run(studio.concepts, {
    prompt,
    architecture,
    buildSpec,
    templateKnowledge
  });
  const viewConcept = studio.concepts.find((item) => item.archetype === 'view-courtyard');

  assert.equal(selection.selected_archetype, 'view-courtyard');
  assert.equal(selection.selected_concept_id, viewConcept.id);
});

function concept(id, archetype, patch = {}) {
  return {
    id,
    title: id,
    archetype,
    summary: patch.summary || id,
    design_intent: [patch.summary || id],
    reference_strategy: patch.reference_strategy || [],
    quality_targets: patch.quality_targets || [],
    risks: patch.risks || [],
    creative_design_patch: patch.creative_design_patch || {
      massing_variant: archetype === 'view-courtyard' ? 'waterfront-stepped-estate' : 'formal-axis-manor',
      facade: { glazing_ratio: archetype === 'view-courtyard' ? 'high' : 'medium' },
      roof: { style: archetype === 'view-courtyard' ? 'flat' : 'gabled' },
      site: { water_feature: archetype === 'view-courtyard' },
      interior: {},
      topology: {}
    }
  };
}
