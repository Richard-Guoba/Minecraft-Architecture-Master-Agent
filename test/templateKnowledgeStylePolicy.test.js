import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateKnowledgeAgent } from '../src/construction/agents/templateKnowledgeAgent.js';

test('TemplateKnowledgeAgent returns style-aware room pattern guidance', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-template-style-policy-'));
  const analysisFile = path.join(tempDir, 'template_index.json');
  fs.writeFileSync(analysisFile, JSON.stringify({
    corpus: { gap_priorities: [] },
    templates: [
      templateFixture({
        title: 'Modern Lake Villa',
        style_family: 'modern',
        typology: 'house',
        roomPatterns: [
          pattern('living', 'social_cluster', 88),
          pattern('living', 'layered_lighting', 86),
          pattern('kitchen', 'kitchen_work_wall', 84),
          pattern('bedroom', 'sleep_niche', 82)
        ]
      }),
      templateFixture({
        title: 'Gothic Manor',
        style_family: 'gothic',
        typology: 'castle',
        roomPatterns: [
          pattern('entry_or_lobby', 'circulation_spine', 90),
          pattern('living', 'display_wall', 89),
          pattern('storage', 'storage_wall', 88),
          pattern('corridor_or_gallery', 'display_wall', 86)
        ]
      })
    ]
  }), 'utf8');

  const modern = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个现代湖边别墅，开放厨房，客厅，大玻璃，精致内饰',
    { style_family: 'modern', typology: 'house' },
    { typology: 'house' }
  );
  const gothic = new TemplateKnowledgeAgent({ cwd: process.cwd(), analysisFile }).run(
    '建一个哥特式庄园城堡，有大厅、走廊、展示墙和烛光',
    { style_family: 'gothic', typology: 'castle' },
    { typology: 'castle' }
  );

  assert.equal(modern.recommendations.room_pattern_strategy.style_family, 'modern');
  assert.equal(gothic.recommendations.room_pattern_strategy.style_family, 'gothic');
  assert.ok(modern.recommendations.room_pattern_guidance.some((item) => item.pattern_type === 'kitchen_work_wall'));
  assert.ok(gothic.recommendations.room_pattern_guidance.some((item) => item.pattern_type === 'circulation_spine'));
  assert.ok(gothic.recommendations.room_pattern_strategy.traits.includes('ceremonial-focus'));
});

function templateFixture({ title, style_family, typology, roomPatterns }) {
  return {
    title,
    file: `${title}.schematic`,
    category: typology === 'castle' ? 'Castles' : 'House',
    style_family,
    typology,
    quality: 5,
    tags: ['furnished-interior'],
    recommendations: {
      detail_density: 'high',
      landscape_features: [],
      design_priorities: ['use layered interior grammar'],
      source_keywords: [style_family, typology, title.toLowerCase()]
    },
    analysis: {
      terrain: {},
      detail_metrics: { garden_signal: 'none' },
      dimensions: { non_air_blocks: 12000 },
      spatial_layout: {}
    },
    case_profile: {
      study_priority: 'high',
      phase2_room_mining_priority: 'high',
      quality_tags: ['furniture-pattern-rich'],
      learning_roles: [{ role: 'interior_reference' }, { role: 'furniture_group_reference' }],
      room_reference_candidates: [{ room_type: 'living' }, { room_type: 'kitchen' }, { room_type: 'bedroom' }],
      review_flags: [],
      phase2_spatial_evidence: { pattern_mining_readiness: 'high' },
      phase3_pattern_evidence: {
        furniture_pattern_readiness: 'high',
        top_patterns: roomPatterns
      }
    }
  };
}

function pattern(room_type, pattern_type, confidence) {
  return {
    room_type,
    pattern_type,
    confidence,
    anchor: { wall: 'north' },
    clauses: [`template-${pattern_type}`],
    layout_intent: pattern_type
  };
}
