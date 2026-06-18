import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateCaseProfile, summarizeCaseIndex } from '../src/construction/templates/templateCaseProfile.js';

test('template case profile promotes rich residential interiors for phase 2 room mining', () => {
  const profile = buildTemplateCaseProfile(templateFixture({
    title: 'Modern Lake Villa',
    category: 'House',
    style_family: 'modern',
    typology: 'house',
    tags: ['furnished-interior', 'layered-interior', 'water-edge', 'landscape-composition', 'glass-emphasis'],
    description: 'A fully furnished modern lake villa with living room, kitchen, bedroom, study, waterfront deck and garden.',
    interior: {
      furnished_likelihood: 'high',
      strong_hits: 420,
      strong_ratio: 0.04,
      richness: 12,
      strong_richness: 8,
      counts: {
        storage: 40,
        bed: 6,
        books_library: 22,
        kitchen_work: 18,
        wet_fixture: 8
      }
    }
  }));

  assert.equal(profile.phase2_room_mining_priority, 'high');
  assert.ok(profile.quality_scores.interior >= 70);
  assert.ok(profile.learning_roles.some((role) => role.role === 'interior_reference'));
  assert.ok(profile.learning_roles.some((role) => role.role === 'water_edge'));
  assert.ok(profile.room_reference_candidates.some((room) => room.room_type === 'living'));
  assert.ok(profile.room_reference_candidates.some((room) => room.room_type === 'kitchen'));
  assert.ok(profile.room_reference_candidates.some((room) => room.room_type === 'study'));
});

test('template case profile prevents arena block noise from becoming room-mining training data', () => {
  const profile = buildTemplateCaseProfile(templateFixture({
    title: 'Grand Arena',
    category: 'Arenas',
    typology: 'arena',
    tags: ['landscape-composition'],
    description: 'A colosseum arena with seating rings and spawn rooms.',
    interior: {
      furnished_likelihood: 'high',
      strong_hits: 900,
      strong_ratio: 0.02,
      richness: 10,
      strong_richness: 7,
      counts: { light_fixture: 100, storage: 30 }
    }
  }));

  assert.equal(profile.quality_scores.interior, 0);
  assert.equal(profile.phase2_room_mining_priority, 'skip');
  assert.ok(profile.review_flags.includes('arena-not-for-room-mining'));
  assert.ok(profile.review_flags.includes('non-residential-interior-noise'));
  assert.equal(profile.room_reference_candidates.length, 0);
});

test('template case profile marks unfinished shells as exterior references, not interior references', () => {
  const profile = buildTemplateCaseProfile(templateFixture({
    title: 'Mega Mansion',
    category: 'House',
    typology: 'house',
    tags: ['furnished-interior', 'layered-interior', 'formal-axis'],
    description: 'A sprawling mega mansion shell. The interiors are largely unfinished and provide a blank canvas.',
    interior: {
      furnished_likelihood: 'high',
      strong_hits: 380,
      strong_ratio: 0.018,
      richness: 9,
      strong_richness: 6,
      counts: { storage: 20, books_library: 12, light_fixture: 18 }
    }
  }));

  assert.equal(profile.phase2_room_mining_priority, 'skip');
  assert.ok(profile.review_flags.includes('interior-described-as-unfinished'));
  assert.equal(profile.room_reference_candidates.length, 0);
  assert.ok(!profile.learning_roles.some((role) => role.role === 'interior_reference'));
});

test('template case profile downgrades partially unfurnished interiors to medium mining priority', () => {
  const profileFromSample = buildTemplateCaseProfile({
    ...templateFixture({
      title: 'Modern Apartment Building',
      category: 'Buildings',
      typology: 'public-building',
      tags: ['furnished-interior', 'layered-interior'],
      description: 'A modern apartment building with furnished apartments.',
      interior: {
        furnished_likelihood: 'high',
        strong_hits: 800,
        strong_ratio: 0.05,
        richness: 12,
        strong_richness: 8,
        counts: { bed: 8, kitchen_work: 12, books_library: 18, storage: 42 }
      }
    }),
    page: {
      title: 'Modern Apartment Building',
      description: 'A modern apartment building with furnished apartments.',
      text_sample: 'Inside, you will find a mix of furnished and unfurnished spaces.'
    }
  });

  assert.equal(profileFromSample.phase2_room_mining_priority, 'medium');
  assert.ok(profileFromSample.review_flags.includes('partially-unfurnished-interior'));
  assert.ok(profileFromSample.learning_roles.some((role) => role.role === 'interior_reference'));
});

test('template case profile promotes spatial room evidence into phase 2 fields', () => {
  const profile = buildTemplateCaseProfile(templateFixture({
    title: 'Spatially Clear Villa',
    category: 'House',
    typology: 'house',
    tags: ['furnished-interior'],
    description: 'A compact villa with furnished rooms.',
    interior: {
      furnished_likelihood: 'medium',
      strong_hits: 80,
      strong_ratio: 0.01,
      richness: 6,
      strong_richness: 4,
      counts: { bed: 1, kitchen_work: 2, storage: 8 }
    },
    spatial: {
      status: 'analyzed',
      floor_count: 2,
      selected_floor_levels: [1, 5],
      room_candidate_count: 4,
      high_confidence_room_count: 3,
      room_adjacency_count: 2,
      furniture_group_count: 3,
      high_confidence_furniture_group_count: 3,
      furniture_pattern_readiness: 'medium',
      detected_furniture_patterns: { sleep_niche: 1, kitchen_work_wall: 1, social_cluster: 1 },
      furniture_groups: [
        {
          pattern_type: 'sleep_niche',
          room_type: 'bedroom',
          confidence: 82,
          anchor: { zone: 'corner', wall: 'south', relation: 'south-anchored' },
          clauses: ['template-sleep-niche', 'bedroom-bedside-pair'],
          layout_intent: 'bed anchors a private wall or corner'
        },
        {
          pattern_type: 'kitchen_work_wall',
          room_type: 'kitchen',
          confidence: 80,
          anchor: { zone: 'wall', wall: 'north', relation: 'north-anchored' },
          clauses: ['template-work-wall', 'kitchen-prep-counter'],
          layout_intent: 'work blocks form a compact wall band'
        },
        {
          pattern_type: 'social_cluster',
          room_type: 'living',
          confidence: 76,
          anchor: { zone: 'center_with_open_edges', relation: 'clear-center' },
          clauses: ['template-conversation-cluster', 'template-clear-center'],
          layout_intent: 'seating and table form a social island'
        }
      ],
      detected_room_types: { bedroom: 1, kitchen: 1, living_or_hall: 2 },
      segmentation_confidence: 'medium',
      pattern_mining_readiness: 'medium',
      vertical_circulation: { stair_blocks: 12, likely_vertical_links: 1, vertical_signal: 'present' },
      warnings: [],
      room_candidates: [
        {
          id: 'f0-r1',
          y: 1,
          area: 54,
          confidence: 82,
          type_hints: [{ room_type: 'bedroom', score: 80 }],
          evidence: { enclosure: 'enclosed' }
        }
      ]
    }
  }));

  assert.ok(profile.quality_scores.spatial >= 60);
  assert.ok(profile.quality_scores.patterns >= 60);
  assert.ok(profile.quality_tags.includes('spatial-room-segmentation-usable') || profile.quality_tags.includes('spatial-room-segmentation-rich'));
  assert.ok(profile.quality_tags.includes('phase2-room-pattern-ready'));
  assert.ok(profile.quality_tags.includes('phase3-furniture-pattern-ready'));
  assert.ok(profile.learning_roles.some((role) => role.role === 'room_layout_reference'));
  assert.ok(profile.learning_roles.some((role) => role.role === 'furniture_group_reference'));
  assert.ok(profile.learning_roles.some((role) => role.role === 'vertical_circulation_reference'));
  assert.ok(profile.room_reference_candidates.some((room) => room.room_type === 'living' && /spatial/.test(room.evidence)));
  assert.ok(profile.room_learning_clauses.some((room) => room.room_type === 'bedroom' && room.furniture_patterns.some((pattern) => pattern.pattern_type === 'sleep_niche')));
  assert.ok(profile.room_learning_clauses.some((room) => room.room_type === 'bedroom' && room.clauses.includes('template-sleep-niche')));
  assert.equal(profile.phase2_spatial_evidence.room_candidate_count, 4);
  assert.equal(profile.phase2_spatial_evidence.room_adjacency_count, 2);
  assert.equal(profile.phase3_pattern_evidence.furniture_group_count, 3);
  assert.equal(profile.phase2_spatial_evidence.pattern_mining_readiness, 'medium');
});

test('template case summary exposes learning roles, room candidates, and review counts', () => {
  const ready = templateFixture({
    title: 'Furnished Villa',
    category: 'House',
    typology: 'house',
    tags: ['furnished-interior', 'layered-interior'],
    description: 'Fully furnished villa with bedroom, kitchen, living room and study.',
    interior: {
      furnished_likelihood: 'high',
      strong_hits: 500,
      strong_ratio: 0.05,
      richness: 12,
      strong_richness: 8,
      counts: { bed: 4, kitchen_work: 8, books_library: 16, storage: 30 }
    }
  });
  ready.case_profile = buildTemplateCaseProfile(ready);

  const arena = templateFixture({
    title: 'Arena',
    category: 'Arenas',
    typology: 'arena',
    description: 'Arena with seats.',
    interior: {
      furnished_likelihood: 'medium',
      strong_hits: 80,
      strong_ratio: 0.01,
      richness: 6,
      strong_richness: 4,
      counts: { light_fixture: 20 }
    }
  });
  arena.case_profile = buildTemplateCaseProfile(arena);

  const summary = summarizeCaseIndex([ready, arena]);

  assert.equal(summary.case_count, 2);
  assert.equal(summary.phase1_completion.room_mining_ready, 1);
  assert.equal(summary.phase2_completion.spatial_analyzed, 0);
  assert.equal(summary.phase3_completion.total_furniture_groups, 0);
  assert.equal(summary.review_flag_counts['arena-not-for-room-mining'], 1);
  assert.ok(summary.learning_role_counts.interior_reference >= 1);
  assert.ok(summary.room_candidate_counts.living >= 1);
});

function templateFixture({
  title,
  category = 'House',
  style_family = 'modern',
  typology = 'house',
  tags = [],
  description = '',
  interior = {},
  spatial = {}
}) {
  return {
    file: `${category}/${title}.schematic`,
    title,
    category,
    source: { title, url: `https://example.test/${title.toLowerCase().replaceAll(' ', '-')}` },
    page: { title, description, text_sample: description },
    style_family,
    typology,
    tags,
    analysis: {
      dimensions: { width: 31, height: 18, length: 25, non_air_blocks: 14000, density: 0.22 },
      terrain: { integrated: true, non_flat: true, height_range: 6, natural_column_ratio: 0.18 },
      detail_metrics: {
        glass_ratio: 0.08,
        stair_slab_ratio: 0.12,
        fence_ratio: 0.03,
        light_ratio: 0.01,
        decor_ratio: 0.02,
        garden_signal: 'water-garden'
      },
      interior_signals: {
        dominant_signals: [],
        ...interior
      },
      spatial_layout: spatial,
      vertical_profile: { tower_like: false }
    }
  };
}
