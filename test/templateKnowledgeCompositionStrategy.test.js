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

test('TemplateKnowledgeAgent creates reference reproduction targets for top house prompts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-reference-reproduction-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: [] },
    templates: [
      templateFixture({
        title: 'A Small Modern House',
        style_family: 'modern',
        typology: 'house',
        tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'micro-block-detailing', 'terrain-integrated'],
        dimensions: { width: 23, length: 21, height: 15, non_air_blocks: 1400 },
        detail_metrics: { glass_ratio: 0.08, stair_slab_ratio: 0.26, fence_ratio: 0.04, light_ratio: 0.02, decor_ratio: 0.04, natural_ratio: 0.3, garden_signal: 'water-garden' },
        composition: {
          massing_patterns: [pattern('waterfront_deck_massing', 92), pattern('stepped_terraces', 88)],
          approach_sequence: [pattern('waterfront_transition', 90), pattern('garden_forecourt', 82)],
          facade_rhythm: [pattern('large_glass_bands', 90), pattern('micro_depth_trim', 88)],
          roof_composition: [pattern('flat_terrace_or_platform', 90), pattern('deep_overhang_edges', 84)],
          site_composition: [pattern('water_edge', 92), pattern('layered_terrain_base', 86), pattern('garden_rooms', 80)],
          view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 88)]
        }
      })
    ]
  }), 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃、屋顶露台',
    { style_family: 'modern', typology: 'villa' },
    { typology: 'villa' }
  );
  const spec = applyTemplateKnowledgeToBuildSpec(
    {
      width: 25,
      depth: 19,
      floors: 1,
      floor_height: 5,
      roof_height: 3,
      garden_depth: 6,
      lot: { side_setback: 2, rear_setback: 2 },
      source: { dimensions: 'default', width: 'default', depth: 'default', floors: 'default' },
      constraints: { max_width: 45, max_depth: 45, max_floors: 5 },
      site: {},
      design: {}
    },
    knowledge
  );

  assert.equal(knowledge.recommendations.reference_reproduction.active, true);
  assert.equal(knowledge.recommendations.reference_reproduction.strength, 'medium');
  assert.ok(spec.garden_depth >= 10);
  assert.ok(spec.floors >= 2);
  assert.equal(spec.source.floors, 'template-reference');
});

test('strong reference prompts lock modern waterfront massing to a richer estate variant', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-strong-reference-massing-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: [] },
    templates: [
      templateFixture({
        title: 'Modern Estate',
        style_family: 'modern',
        typology: 'house',
        tags: ['water-edge', 'landscape-composition', 'large-glass-or-panel-grid'],
        dimensions: { width: 53, length: 45, height: 30, non_air_blocks: 13000 },
        detail_metrics: { glass_ratio: 0.08, stair_slab_ratio: 0.2, fence_ratio: 0.03, light_ratio: 0.01, decor_ratio: 0.03, natural_ratio: 0.25, garden_signal: 'water-garden' },
        composition: {
          massing_patterns: [pattern('waterfront_deck_massing', 96), pattern('stepped_terraces', 90)],
          approach_sequence: [pattern('waterfront_transition', 92), pattern('garden_forecourt', 82)],
          facade_rhythm: [pattern('large_glass_bands', 90), pattern('micro_depth_trim', 88)],
          roof_composition: [pattern('flat_terrace_or_platform', 90)],
          site_composition: [pattern('water_edge', 92), pattern('garden_rooms', 84)],
          view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 90)]
        }
      })
    ]
  }), 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '按模板库顶级房子强参考复现：建一个现代湖边别墅，大玻璃、水边平台、屋顶露台和前景花园',
    { style_family: 'modern', typology: 'villa' },
    { typology: 'villa' }
  );

  assert.equal(knowledge.recommendations.reference_reproduction.strength, 'high');
  assert.equal(knowledge.recommendations.composition_strategy.directives.preferred_massing_variant, 'waterfront-stepped-estate');
  assert.equal(knowledge.recommendations.composition_strategy.directives.lock_preferred_massing_variant, true);
});

test('template composition keeps classical roofs away from unrequested flat terraces', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-classical-roof-policy-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: [] },
    templates: [
      templateFixture({
        title: 'Classical Manor',
        style_family: 'classical',
        typology: 'house',
        tags: ['landscape-composition', 'furnished-interior'],
        composition: {
          massing_patterns: [pattern('asymmetric_wings', 80)],
          approach_sequence: [pattern('garden_forecourt', 82)],
          facade_rhythm: [pattern('formal_symmetry', 86)],
          roof_composition: [pattern('flat_terrace_or_platform', 90)],
          site_composition: [pattern('garden_rooms', 80)],
          view_and_landmark_rules: []
        }
      })
    ]
  }), 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个古典轴线庄园住宅，正立面有中轴、台阶入口、成对侧翼和前景花园',
    { style_family: 'classical', typology: 'house' },
    { typology: 'house' }
  );

  assert.notEqual(knowledge.recommendations.composition_strategy.directives.preferred_roof_profile, 'thin-parapet-terrace');
  assert.notEqual(knowledge.recommendations.composition_strategy.directives.preferred_roof_profile, 'stepped-flat-with-light-slot');
});

test('template composition honors layered eaves for Japanese courtyard prompts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-japanese-roof-policy-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: [] },
    templates: [
      templateFixture({
        title: 'Japanese Temple',
        style_family: 'japanese',
        typology: 'temple',
        tags: ['landscape-composition', 'terrain-integrated', 'furnished-interior'],
        composition: {
          massing_patterns: [pattern('courtyard_or_void', 84)],
          approach_sequence: [pattern('garden_forecourt', 82)],
          facade_rhythm: [pattern('micro_depth_trim', 80)],
          roof_composition: [pattern('layered_eaves', 92), pattern('flat_terrace_or_platform', 76)],
          site_composition: [pattern('garden_rooms', 86)],
          view_and_landmark_rules: []
        }
      })
    ]
  }), 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个日式庭院住宅，低矮体块、层叠深檐、枯山水和入口过渡',
    { style_family: 'japanese', typology: 'house' },
    { typology: 'house' }
  );

  assert.equal(knowledge.recommendations.composition_strategy.directives.preferred_roof_profile, 'low-layered-eaves');
});

test('template composition does not turn gothic tower caps into east-asian layered eaves or flat roofs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-gothic-roof-policy-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: [] },
    templates: [
      templateFixture({
        title: 'Gothic Hill Manor',
        style_family: 'gothic',
        typology: 'castle',
        tags: ['landscape-composition', 'terrain-integrated'],
        composition: {
          massing_patterns: [pattern('vertical_landmark', 86)],
          approach_sequence: [pattern('garden_forecourt', 78)],
          facade_rhythm: [pattern('vertical_slots', 88)],
          roof_composition: [pattern('tower_cap', 94), pattern('layered_eaves', 76)],
          site_composition: [pattern('layered_terrain_base', 82)],
          view_and_landmark_rules: []
        }
      })
    ]
  }), 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个哥特山坡宅邸，角部有塔楼书房，尖拱窗和扶壁形成竖向节奏，前景庭院有路径和植物',
    { style_family: 'gothic', typology: 'castle' },
    { typology: 'castle' }
  );

  assert.notEqual(knowledge.recommendations.composition_strategy.directives.preferred_roof_profile, 'low-layered-eaves');
  assert.notEqual(knowledge.recommendations.composition_strategy.directives.preferred_roof_profile, 'stepped-flat-with-light-slot');
});

function templateFixture({ title, style_family, typology, tags, dimensions, detail_metrics, composition }) {
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
      dimensions: dimensions || { non_air_blocks: 18000 },
      terrain: { integrated: true, non_flat: true, height_range: 5 },
      detail_metrics: detail_metrics || { garden_signal: 'water-garden' },
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
