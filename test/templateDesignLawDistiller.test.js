import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateKnowledgeAgent } from '../src/construction/agents/templateKnowledgeAgent.js';
import { buildTemplateCaseLibrary } from '../src/construction/templates/templateCaseLibrary.js';
import {
  buildTemplateDesignLawBook,
  renderTemplateDesignLawReport,
  selectTemplateDesignLaws
} from '../src/construction/templates/templateDesignLawDistiller.js';

test('stage 7C distills case cards into site, facade, roof, and interior laws', () => {
  const caseLibrary = buildTemplateCaseLibrary({
    templates: [
      richTemplateFixture('Modern Lake Villa', {
        file: 'House/Modern Lake Villa.schematic',
        style_family: 'modern',
        roles: ['terrain_base', 'garden_scene', 'water_edge', 'interior_reference', 'facade_detail'],
        patterns: [
          furniturePattern('living', 'social_cluster', 90),
          furniturePattern('kitchen', 'kitchen_work_wall', 86),
          furniturePattern('bedroom', 'sleep_niche', 84),
          furniturePattern('study', 'library_focus_wall', 82)
        ]
      }),
      richTemplateFixture('Wood Modern House', {
        file: 'House/Wood Modern House.schematic',
        style_family: 'modern',
        roles: ['garden_scene', 'interior_reference', 'room_layout_reference', 'facade_detail'],
        patterns: [
          furniturePattern('living', 'social_cluster', 84),
          furniturePattern('kitchen', 'kitchen_work_wall', 82),
          furniturePattern('study', 'display_wall', 80)
        ]
      })
    ],
    corpus: { template_count: 2 }
  });

  const lawBook = buildTemplateDesignLawBook({ caseLibrary, generatedAt: '2026-06-18T00:00:00.000Z' });

  assert.equal(lawBook.source, 'stage7-template-design-law-distiller-v1');
  assert.ok(lawBook.summary.law_count >= 12);
  assert.ok(lawBook.summary.interior_law_count >= 6);
  assert.ok(lawBook.laws.some((law) => law.id === 'site-waterfront-public-threshold'));
  assert.ok(lawBook.laws.some((law) => law.id === 'facade-glass-view-axis'));
  assert.ok(lawBook.laws.some((law) => law.id === 'roof-usable-terrace-system'));
  assert.ok(lawBook.interior_laws.some((law) => law.id === 'interior-pattern-social-cluster'));
  assert.ok(lawBook.interior_laws.some((law) => law.id === 'room-kitchen-template-grammar'));

  const selected = selectTemplateDesignLaws(lawBook, '现代湖边别墅，大玻璃，屋顶露台，精致内饰，开放厨房和客厅', {
    styleFamily: 'modern',
    typology: 'house',
    featurePriorities: ['waterfront', 'roof-terrace', 'interior'],
    retrievedCaseIds: ['house-modern-lake-villa']
  });

  assert.equal(selected.active, true);
  assert.ok(selected.selected_laws.some((law) => law.id === 'site-waterfront-public-threshold'));
  assert.ok(selected.selected_laws.some((law) => law.id === 'roof-usable-terrace-system'));
  assert.ok(selected.interior_laws.some((law) => law.id === 'interior-room-identity-layer-stack'));
  assert.ok(selected.implementation_clauses.some((clause) => /focal wall|work wall|social/i.test(clause)));

  const report = renderTemplateDesignLawReport(lawBook);
  assert.match(report, /Stage 7C Template Design Laws/);
  assert.match(report, /Interior Law Focus/);
});

test('TemplateKnowledgeAgent loads stage 7C design laws into recommendations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-stage7-law-agent-'));
  const template = richTemplateFixture('Modern Lake Villa', {
    file: 'House/Modern Lake Villa.schematic',
    style_family: 'modern',
    roles: ['terrain_base', 'garden_scene', 'water_edge', 'interior_reference', 'facade_detail'],
    patterns: [
      furniturePattern('living', 'social_cluster', 90),
      furniturePattern('kitchen', 'kitchen_work_wall', 86)
    ]
  });
  const caseLibrary = buildTemplateCaseLibrary({ templates: [template], corpus: { template_count: 1 } });
  const lawBook = buildTemplateDesignLawBook({ caseLibrary });
  const analysisFile = path.join(root, 'template_index.json');
  await fs.writeFile(analysisFile, `${JSON.stringify({ corpus: { gap_priorities: [] }, templates: [template] }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(root, 'case_library.json'), `${JSON.stringify(caseLibrary, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(root, 'design_laws.json'), `${JSON.stringify(lawBook, null, 2)}\n`, 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个现代湖边别墅，带水边平台、大玻璃、屋顶露台、开放厨房和精致内饰',
    { style_family: 'modern', typology: 'house' },
    { typology: 'house' }
  );

  assert.equal(knowledge.active, true);
  assert.equal(knowledge.recommendations.design_law_pack.active, true);
  assert.ok(knowledge.recommendations.design_laws.some((law) => law.id === 'site-waterfront-public-threshold'));
  assert.ok(knowledge.recommendations.interior_design_laws.some((law) => law.id === 'interior-room-identity-layer-stack'));
  assert.ok(knowledge.recommendations.design_law_clauses.length > 0);
});

function richTemplateFixture(title, { file, style_family, roles, patterns }) {
  return {
    title,
    file,
    category: 'House',
    source: { url: `https://example.test/${title.toLowerCase().replaceAll(' ', '-')}` },
    style_family,
    typology: 'house',
    quality: 5,
    tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'furnished-interior'],
    recommendations: {
      template_scale: 'large',
      terrain_profile: 'non-flat-integrated',
      landscape_features: ['garden-composition', 'layered-terrain', 'water-edge'],
      detail_density: 'high',
      design_priorities: ['compose garden and water edge'],
      source_keywords: ['modern', 'lake', 'villa', 'interior']
    },
    analysis: {
      dimensions: { width: 34, height: 18, length: 28, non_air_blocks: 24000, density: 0.32 },
      block_categories: {
        rock: { count: 6000, ratio: 0.25 },
        glass: { count: 2200, ratio: 0.09 },
        vegetation: { count: 900, ratio: 0.04 },
        water: { count: 600, ratio: 0.025 }
      },
      top_blocks: [{ name: 'smooth_quartz', key: 'minecraft:smooth_quartz', count: 5000, ratio: 0.2, category: 'rock' }],
      terrain: { integrated: true, non_flat: true, height_range: 7, natural_column_ratio: 0.24 },
      detail_metrics: {
        glass_ratio: 0.09,
        stair_slab_ratio: 0.08,
        fence_ratio: 0.02,
        light_ratio: 0.01,
        decor_ratio: 0.02,
        garden_signal: 'water-garden'
      },
      interior_signals: {
        furnished_likelihood: 'high',
        strong_hits: 300,
        strong_richness: 8,
        dominant_signals: [{ signal: 'storage', count: 80 }]
      },
      spatial_layout: {
        pattern_mining_readiness: 'high',
        furniture_pattern_readiness: 'high',
        room_candidate_count: 6,
        high_confidence_room_count: 5,
        room_adjacency_count: 4,
        furniture_group_count: patterns.length
      },
      composition_grammar: {
        source: 'template-composition-miner-v1',
        status: 'analyzed',
        readiness: 'high',
        score: 91,
        massing_patterns: [pattern('long_bar', 82), pattern('asymmetric_wings', 76)],
        approach_sequence: [pattern('garden_forecourt', 80), pattern('waterfront_transition', 78)],
        facade_rhythm: [pattern('large_glass_bands', 86), pattern('micro_depth_trim', 74)],
        roof_composition: [pattern('flat_terrace_or_platform', 80)],
        site_composition: [pattern('water_edge', 88), pattern('garden_rooms', 78), pattern('layered_terrain_base', 76)],
        view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 82)],
        transfer_rules: ['connect entry, living room, terrace, and water edge']
      }
    },
    case_profile: {
      case_id: `house-${title.toLowerCase().replaceAll(' ', '-')}`,
      study_priority: 'high',
      overall_reference_score: 92,
      phase2_room_mining_priority: 'high',
      quality_scores: { interior: 88, site: 94, facade_detail: 82, massing: 76 },
      quality_tags: ['interior-rich-reference', 'site-rich-reference'],
      learning_roles: roles.map((role) => ({ role, score: 80, evidence: role })),
      learnable_areas: roles,
      review_flags: [],
      room_reference_candidates: [
        { room_type: 'living', confidence: 88 },
        { room_type: 'kitchen', confidence: 84 },
        { room_type: 'bedroom', confidence: 82 },
        { room_type: 'study', confidence: 80 }
      ],
      phase2_spatial_evidence: {
        pattern_mining_readiness: 'high',
        room_candidate_count: 6,
        high_confidence_room_count: 5,
        room_adjacency_count: 4
      },
      phase3_pattern_evidence: {
        furniture_pattern_readiness: 'high',
        furniture_group_count: patterns.length,
        top_patterns: patterns
      },
      next_phase_hints: ['phase2-site: extract terrain height bands']
    }
  };
}

function furniturePattern(room_type, pattern_type, confidence) {
  return {
    room_type,
    pattern_type,
    confidence,
    anchor: { wall: 'view' },
    clauses: [`template-${pattern_type}`],
    layout_intent: `${room_type} uses ${pattern_type} as the main composition anchor`
  };
}

function pattern(pattern_type, confidence) {
  return { pattern_type, confidence, reason: `${pattern_type} evidence` };
}
