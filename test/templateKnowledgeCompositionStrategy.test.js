import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TemplateKnowledgeAgent,
  applyTemplateKnowledgeToArchitecture,
  applyTemplateKnowledgeToBuildSpec
} from '../src/construction/agents/templateKnowledgeAgent.js';

test('TemplateKnowledgeAgent builds transferable whole-composition strategy', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-composition-policy-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: ['learn overall composition grammar'] },
    templates: [
      templateFixture({
        title: 'Modern Lake Villa',
        style_family: 'modern',
        typology: 'house',
        tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'terrain-integrated'],
        composition: {
          massing_patterns: [pattern('long_bar', 84), pattern('asymmetric_wings', 80)],
          approach_sequence: [pattern('garden_forecourt', 82), pattern('waterfront_transition', 78)],
          facade_rhythm: [pattern('large_glass_bands', 86), pattern('micro_depth_trim', 70)],
          roof_composition: [pattern('flat_terrace_or_platform', 76)],
          site_composition: [pattern('water_edge', 88), pattern('layered_terrain_base', 80), pattern('garden_rooms', 76)],
          view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 84)]
        }
      })
    ]
  }), 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个现代湖边别墅，带前景花园、水边平台、大玻璃和屋顶露台',
    { style_family: 'modern', typology: 'house', site_rules: {}, facade_rules: {}, roof_rules: {}, massing_rules: {}, detail_rules: {}, generation_hints: {} },
    { typology: 'house', site: {} }
  );
  const strategy = knowledge.recommendations.composition_strategy;

  assert.equal(strategy.readiness, 'high');
  assert.ok(strategy.massing_patterns.some((item) => item.pattern_type === 'long_bar'));
  assert.equal(strategy.directives.use_waterfront_transition, true);
  assert.equal(strategy.directives.use_large_view_glass, true);
  assert.equal(strategy.directives.preferred_facade_rhythm, 'horizontal-ribbon-breaks');
  assert.equal(strategy.directives.preferred_roof_profile, 'thin-parapet-terrace');

  const architecture = applyTemplateKnowledgeToArchitecture({
    style_family: 'modern',
    typology: 'house',
    site_rules: {},
    facade_rules: {},
    roof_rules: {},
    massing_rules: {},
    detail_rules: {},
    generation_hints: {}
  }, knowledge);
  const buildSpec = applyTemplateKnowledgeToBuildSpec({ depth: 18, garden_depth: 6, lot: { depth: 24 }, site: {} }, knowledge);

  assert.equal(architecture.facade_rules.large_glass, true);
  assert.equal(architecture.site_rules.template_waterfront_transition, true);
  assert.ok(architecture.generation_hints.template_composition_strategy.directives.use_foreground_garden_sequence);
  assert.equal(buildSpec.design.template_composition_strategy.directives.use_large_view_glass, true);
});

function templateFixture({ title, style_family, typology, tags, composition }) {
  return {
    title,
    file: `${title}.schematic`,
    category: typology === 'house' ? 'House' : 'Buildings',
    style_family,
    typology,
    quality: 5,
    tags,
    recommendations: {
      detail_density: 'high',
      landscape_features: ['layered-terrain', 'garden-composition', 'water-edge'],
      design_priorities: ['compose whole site and massing'],
      source_keywords: [style_family, typology, title.toLowerCase()]
    },
    analysis: {
      dimensions: { non_air_blocks: 18000 },
      terrain: { integrated: true, non_flat: true, height_range: 5 },
      detail_metrics: { garden_signal: 'water-garden' },
      composition_grammar: {
        source: 'template-composition-miner-v1',
        status: 'analyzed',
        readiness: 'high',
        score: 88,
        transfer_rules: ['connect entry, terrace, and public rooms to the water edge'],
        ...composition
      }
    },
    case_profile: {
      study_priority: 'high',
      phase2_room_mining_priority: 'high',
      quality_scores: { site: 90, facade_detail: 82, massing: 84 },
      quality_tags: ['composition-grammar-rich'],
      learning_roles: [{ role: 'terrain_base' }, { role: 'garden_scene' }, { role: 'water_edge' }, { role: 'facade_detail' }, { role: 'massing_silhouette' }],
      room_reference_candidates: [],
      phase3_pattern_evidence: { furniture_pattern_readiness: 'skip', top_patterns: [] },
      phase5_composition_evidence: {
        status: 'analyzed',
        readiness: 'high',
        ...composition
      },
      review_flags: []
    }
  };
}

function pattern(pattern_type, confidence) {
  return { pattern_type, confidence, reason: `${pattern_type} evidence` };
}
