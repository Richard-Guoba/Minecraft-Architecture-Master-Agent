import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateKnowledgeAgent, applyTemplateKnowledgeToArchitecture } from '../src/construction/agents/templateKnowledgeAgent.js';
import { buildTemplateCaseLibrary, renderTemplateCaseLibraryReport } from '../src/construction/templates/templateCaseLibrary.js';
import { readTemplateSources } from '../src/construction/templates/schematicAnalyzer.js';

test('stage 7 case library converts rich templates into reusable case cards and clauses', () => {
  const library = buildTemplateCaseLibrary({
    root: 'mc_templates',
    generatedAt: '2026-06-18T00:00:00.000Z',
    templates: [
      templateFixture({
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        style_family: 'modern',
        tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'furnished-interior'],
        roles: ['terrain_base', 'garden_scene', 'water_edge', 'interior_reference', 'facade_detail'],
        composition: {
          massing_patterns: [pattern('long_bar', 82), pattern('asymmetric_wings', 76)],
          approach_sequence: [pattern('garden_forecourt', 80), pattern('waterfront_transition', 78)],
          facade_rhythm: [pattern('large_glass_bands', 86), pattern('micro_depth_trim', 74)],
          roof_composition: [pattern('flat_terrace_or_platform', 80)],
          site_composition: [pattern('water_edge', 88), pattern('garden_rooms', 78), pattern('layered_terrain_base', 76)],
          view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 82)]
        }
      })
    ],
    corpus: { template_count: 1 }
  });

  assert.equal(library.source, 'stage7-template-case-library-v1');
  assert.equal(library.cases.length, 1);
  assert.equal(library.summary.case_count, 1);
  assert.equal(library.summary.feature_counts.water_edge, 1);
  assert.equal(library.summary.feature_counts.furnished_interior, 1);
  assert.ok(library.retrieval_index.token_count > 0);
  assert.ok(library.retrieval_index.token_to_cases.modern.includes('house-modern-lake-villa'));

  const card = library.cases[0];
  assert.equal(card.feature_card.site.terrain_profile, 'non-flat-integrated');
  assert.ok(card.retrieval.prompt_affinities.includes('waterfront'));
  assert.ok(card.retrieval.prompt_affinities.includes('roof-terrace'));
  assert.ok(card.semantic_clauses.some((item) => /terrain/.test(item)));
  assert.ok(card.semantic_clauses.some((item) => /water edge/.test(item)));
  assert.ok(card.semantic_clauses.some((item) => /large glass/.test(item)));
  assert.ok(card.semantic_clauses.some((item) => /roof/.test(item)));
  assert.ok(card.semantic_clauses.some((item) => /interior/.test(item)));

  const report = renderTemplateCaseLibraryReport(library);
  assert.match(report, /Stage 7A\/7B Template Case Library/);
  assert.match(report, /Best Interior References/);
});

test('template source reader accepts data.txt, labels.jsonl, and sidecar metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-stage7-sources-'));
  const houseDir = path.join(root, 'House');
  await fs.mkdir(houseDir, { recursive: true });
  await fs.writeFile(
    path.join(houseDir, 'data.txt'),
    'Modern Lake Villa - (mcbuild_org) https://mcbuild.org/schematics/1:modern-lake-villa curated lake note\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(root, 'labels.jsonl'),
    `${JSON.stringify({
      file: 'House/Modern Lake Villa - (mcbuild_org).schematic',
      title: 'Modern Lake Villa',
      tags: ['hand-picked', 'interior-rich'],
      quality: 5,
      note: 'excellent interior screenshots'
    })}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(houseDir, 'Modern Lake Villa - (mcbuild_org).tags.txt'),
    'tags: waterfront roof-terrace garden\nquality: 5\ndesc: open public rooms face the lake\n',
    'utf8'
  );

  const sources = await readTemplateSources(root);
  const byName = sources.byTemplateName.get('modern lake villa');
  const byPath = sources.byRelativePath.get('House/Modern Lake Villa - (mcbuild_org).schematic');

  assert.equal(byName.url, 'https://mcbuild.org/schematics/1:modern-lake-villa');
  assert.ok(byName.tags.includes('waterfront'));
  assert.ok(byName.description.includes('open public rooms'));
  assert.ok(byPath.tags.includes('hand-picked'));
  assert.ok(byPath.tags.includes('interior-rich'));
  assert.equal(byPath.quality, 5);
});

test('TemplateKnowledgeAgent carries stage 7 case clauses into recommendations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-stage7-knowledge-'));
  const template = templateFixture({
    title: 'Modern Lake Villa',
    file: 'House/Modern Lake Villa.schematic',
    style_family: 'modern',
    tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'furnished-interior'],
    roles: ['terrain_base', 'garden_scene', 'water_edge', 'interior_reference', 'facade_detail'],
    composition: {
      massing_patterns: [pattern('long_bar', 82)],
      approach_sequence: [pattern('waterfront_transition', 78)],
      facade_rhythm: [pattern('large_glass_bands', 86)],
      roof_composition: [pattern('flat_terrace_or_platform', 80)],
      site_composition: [pattern('water_edge', 88)],
      view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 82)]
    }
  });
  const library = buildTemplateCaseLibrary({ templates: [template], corpus: { template_count: 1 } });
  const analysisFile = path.join(root, 'template_index.json');
  await fs.writeFile(analysisFile, `${JSON.stringify({ corpus: { gap_priorities: [] }, templates: [template] }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(root, 'case_library.json'), `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(root, 'case_library.v2.json'), `${JSON.stringify({
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
        review: { status: 'approved', confidence: 0.9 },
        tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }] },
        knowledge_units: [
          {
            id: 'lake-site',
            area: 'site',
            claim: 'Connect public rooms to a water edge and deck.',
            evidence: ['fixture'],
            confidence: 0.85,
            use_as: ['site composition'],
            avoid_when: ['do not copy block-for-block'],
            integration_targets: ['TemplateSiteSceneStrategy'],
            source_fields: ['fixture']
          }
        ],
        priority: { global_score: 92, area_scores: { site: 90 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge'], prompt_affinities: ['modern', 'house', 'waterfront'], diversity_slots: ['site'], explanation_seeds: ['modern waterfront villa'] },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
      }
    ]
  }, null, 2)}\n`, 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个现代湖边别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    { style_family: 'modern', typology: 'house' },
    { typology: 'house' }
  );

  assert.equal(knowledge.active, true);
  assert.ok(knowledge.recommendations.case_library_clauses.length > 0);
  assert.ok(knowledge.recommendations.case_feature_priorities.includes('waterfront'));
  assert.ok(knowledge.recommendations.material_guidance.wall_candidates.some((item) => item.block === 'minecraft:smooth_quartz'));
  assert.ok(knowledge.recommendations.material_guidance.glass_candidates.some((item) => item.block === 'minecraft:glass'));
  assert.ok(knowledge.retrieved[0].case_card.semantic_clauses.some((item) => /water edge/.test(item)));
  assert.equal(knowledge.knowledge_base_version, 2);
  assert.ok(knowledge.retrieval_explanation.active);
  assert.ok(knowledge.retrieval_explanation.references.length >= 1);
  assert.equal(knowledge.retrieval_explanation.references[0].case_id, 'house-modern-lake-villa');
  assert.ok(knowledge.retrieval_explanation.references[0].teaches.length > 0);

  const guidedArchitecture = applyTemplateKnowledgeToArchitecture({
    style_family: 'modern',
    typology: 'house',
    materials: {
      wall: 'minecraft:white_concrete',
      glass: 'minecraft:glass',
      landscape: 'minecraft:grass_block'
    },
    site_rules: {},
    facade_rules: {},
    roof_rules: {},
    massing_rules: {},
    detail_rules: {},
    generation_hints: {}
  }, knowledge);
  assert.equal(guidedArchitecture.materials.wall, 'minecraft:smooth_quartz');
  assert.equal(guidedArchitecture.materials.plant, 'minecraft:oak_leaves[persistent=true]');
  assert.equal(guidedArchitecture.generation_hints.template_material_patch.wall, 'minecraft:smooth_quartz');
});

test('TemplateKnowledgeAgent falls back to v1 when v2 case library is malformed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-stage7-knowledge-fallback-'));
  const template = templateFixture({
    title: 'Modern Lake Villa',
    file: 'House/Modern Lake Villa.schematic',
    style_family: 'modern',
    tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'furnished-interior'],
    roles: ['terrain_base', 'garden_scene', 'water_edge', 'interior_reference', 'facade_detail'],
    composition: {
      massing_patterns: [pattern('long_bar', 82)],
      approach_sequence: [pattern('waterfront_transition', 78)],
      facade_rhythm: [pattern('large_glass_bands', 86)],
      roof_composition: [pattern('flat_terrace_or_platform', 80)],
      site_composition: [pattern('water_edge', 88)],
      view_and_landmark_rules: [pattern('orient_public_rooms_to_view', 82)]
    }
  });
  const library = buildTemplateCaseLibrary({ templates: [template], corpus: { template_count: 1 } });
  const analysisFile = path.join(root, 'template_index.json');
  await fs.writeFile(analysisFile, `${JSON.stringify({ corpus: { gap_priorities: [] }, templates: [template] }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(root, 'case_library.json'), `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(root, 'case_library.v2.json'), '{ malformed json', 'utf8');

  const knowledge = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个现代湖边别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    { style_family: 'modern', typology: 'house' },
    { typology: 'house' }
  );

  assert.equal(knowledge.active, true);
  assert.equal(knowledge.knowledge_base_version, 1);
  assert.equal(knowledge.retrieval_explanation.active, false);
  assert.ok(knowledge.retrieval_explanation.warnings.some((item) => /v2/i.test(item) && /not usable|not found|malformed|invalid/i.test(item)));
  assert.ok(knowledge.recommendations.case_library_clauses.length > 0);
  assert.ok(knowledge.recommendations.case_feature_priorities.includes('waterfront'));
});

function templateFixture({ title, file, style_family, tags, roles, composition }) {
  return {
    title,
    file,
    category: 'House',
    source: { url: 'https://example.test/modern-lake-villa', note: 'curated top house' },
    style_family,
    typology: 'house',
    quality: 5,
    tags,
    recommendations: {
      template_scale: 'large',
      terrain_profile: 'non-flat-integrated',
      landscape_features: ['garden-composition', 'layered-terrain', 'water-edge'],
      detail_density: 'high',
      design_priorities: ['compose garden and water edge'],
      source_keywords: ['modern', 'lake', 'villa']
    },
    analysis: {
      dimensions: { width: 34, height: 18, length: 28, non_air_blocks: 24000, density: 0.32 },
      block_categories: {
        rock: { count: 6000, ratio: 0.25 },
        glass: { count: 2200, ratio: 0.0917 },
        vegetation: { count: 900, ratio: 0.0375 },
        water: { count: 600, ratio: 0.025 }
      },
      top_blocks: [
        { name: 'smooth_quartz', key: 'minecraft:smooth_quartz', count: 5000, ratio: 0.2, category: 'rock' },
        { name: 'glass', key: 'minecraft:glass', count: 1600, ratio: 0.066, category: 'glass' },
        { name: 'grass_block', key: 'minecraft:grass_block', count: 900, ratio: 0.0375, category: 'earth' },
        { name: 'oak_leaves', key: 'minecraft:oak_leaves', count: 700, ratio: 0.029, category: 'vegetation' },
        { name: 'water', key: 'minecraft:water', count: 600, ratio: 0.025, category: 'water' }
      ],
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
        furniture_group_count: 12
      },
      composition_grammar: {
        source: 'template-composition-miner-v1',
        status: 'analyzed',
        readiness: 'high',
        score: 91,
        transfer_rules: ['connect entry, living room, terrace, and water edge'],
        ...composition
      }
    },
    case_profile: {
      case_id: 'house-modern-lake-villa',
      study_priority: 'high',
      overall_reference_score: 92,
      phase2_room_mining_priority: 'high',
      quality_scores: { interior: 88, site: 94, facade_detail: 82, massing: 76 },
      quality_tags: ['interior-rich-reference', 'site-rich-reference'],
      learning_roles: roles.map((role) => ({ role, score: 80, evidence: role })),
      learnable_areas: roles,
      review_flags: [],
      room_reference_candidates: [{ room_type: 'living' }, { room_type: 'kitchen' }, { room_type: 'bedroom' }],
      phase2_spatial_evidence: {
        pattern_mining_readiness: 'high',
        room_candidate_count: 6,
        high_confidence_room_count: 5,
        room_adjacency_count: 4
      },
      phase3_pattern_evidence: {
        furniture_pattern_readiness: 'high',
        furniture_group_count: 12,
        top_patterns: [
          {
            room_type: 'living',
            pattern_type: 'social_cluster',
            confidence: 88,
            clauses: ['template-conversation-cluster'],
            layout_intent: 'living seats face the view wall'
          }
        ]
      },
      next_phase_hints: ['phase2-site: extract terrain height bands']
    }
  };
}

function pattern(pattern_type, confidence) {
  return { pattern_type, confidence, reason: `${pattern_type} evidence` };
}
