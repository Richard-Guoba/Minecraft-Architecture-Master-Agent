import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStylePatternStrategy, selectStyleAwareRoomPatternGuidance, stylePatternWeight } from '../src/construction/agents/templatePatternStylePolicy.js';

test('style pattern policy gives modern interiors a clean functional bias', () => {
  const candidates = fixtureCandidates();
  const selected = selectStyleAwareRoomPatternGuidance(candidates, {
    styleFamily: 'modern',
    typology: 'house',
    limit: 6
  });
  const keys = selected.map((item) => `${item.room_type}/${item.pattern_type}`);
  const strategy = buildStylePatternStrategy({ styleFamily: 'modern', typology: 'house', candidates });

  assert.ok(stylePatternWeight('kitchen_work_wall', 'modern', 'house') > stylePatternWeight('storage_wall', 'modern', 'house'));
  assert.ok(keys.includes('kitchen/kitchen_work_wall'));
  assert.ok(keys.includes('living/social_cluster'));
  assert.ok(keys.includes('living/layered_lighting') || keys.includes('kitchen/layered_lighting'));
  assert.equal(strategy.style_family, 'modern');
  assert.ok(strategy.traits.includes('linear-lighting'));
});

test('style pattern policy gives gothic interiors a ceremonial display and circulation bias', () => {
  const candidates = fixtureCandidates();
  const selected = selectStyleAwareRoomPatternGuidance(candidates, {
    styleFamily: 'gothic',
    typology: 'castle',
    limit: 6
  });
  const keys = selected.map((item) => `${item.room_type}/${item.pattern_type}`);
  const strategy = buildStylePatternStrategy({ styleFamily: 'gothic', typology: 'castle', candidates });

  assert.ok(stylePatternWeight('display_wall', 'gothic', 'castle') > stylePatternWeight('kitchen_work_wall', 'gothic', 'castle'));
  assert.ok(keys.includes('entry_or_lobby/circulation_spine'));
  assert.ok(keys.includes('living/display_wall') || keys.includes('corridor_or_gallery/display_wall'));
  assert.equal(strategy.style_family, 'gothic');
  assert.ok(strategy.traits.includes('ceremonial-focus'));
});

test('style pattern policy normalizes Chinese style and building type terms', () => {
  const candidates = fixtureCandidates();
  const modernVilla = buildStylePatternStrategy({
    styleFamily: '现代湖边别墅',
    typology: '湖边别墅',
    candidates
  });
  const gothicCastle = buildStylePatternStrategy({
    styleFamily: '哥特式城堡庄园',
    typology: '城堡庄园',
    candidates
  });

  assert.equal(modernVilla.style_family, 'modern');
  assert.equal(modernVilla.typology, 'house');
  assert.equal(gothicCastle.style_family, 'gothic');
  assert.equal(gothicCastle.typology, 'castle');
  assert.ok(stylePatternWeight('kitchen_work_wall', '现代湖边别墅', '湖边别墅') > stylePatternWeight('storage_wall', '现代湖边别墅', '湖边别墅'));
  assert.ok(stylePatternWeight('circulation_spine', '哥特式城堡', '城堡') > stylePatternWeight('kitchen_work_wall', '哥特式城堡', '城堡'));
});

function fixtureCandidates() {
  return [
    candidate('living', 'social_cluster', 86, 'modern'),
    candidate('living', 'display_wall', 88, 'gothic'),
    candidate('living', 'layered_lighting', 84, 'modern'),
    candidate('kitchen', 'kitchen_work_wall', 82, 'modern'),
    candidate('kitchen', 'storage_wall', 91, 'medieval'),
    candidate('entry_or_lobby', 'circulation_spine', 90, 'gothic'),
    candidate('corridor_or_gallery', 'display_wall', 87, 'gothic'),
    candidate('bedroom', 'sleep_niche', 80, 'modern'),
    candidate('storage', 'storage_wall', 92, 'medieval')
  ];
}

function candidate(roomType, patternType, confidence, styleFamily) {
  return {
    source_title: `${styleFamily}-${patternType}`,
    source_style_family: styleFamily,
    source_typology: styleFamily === 'gothic' || styleFamily === 'medieval' ? 'castle' : 'house',
    source_score: confidence,
    room_type: roomType,
    pattern_type: patternType,
    confidence,
    anchor: { wall: 'north' },
    clauses: [`template-${patternType}`],
    layout_intent: patternType
  };
}
