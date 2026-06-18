import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpatialLayout } from '../src/construction/templates/templateSpatialAnalyzer.js';

test('spatial analyzer extracts enclosed room candidates and room type hints', () => {
  const schematic = makeSchematic(18, 5, 12);
  buildTwoRoomHouse(schematic);

  const spatial = analyzeSpatialLayout(schematic, {
    blockAt: blockAtFor(schematic),
    interiorSignalCategories
  });

  assert.equal(spatial.status, 'analyzed');
  assert.ok(spatial.floor_count >= 1);
  assert.ok(spatial.room_candidate_count >= 2);
  assert.ok(spatial.high_confidence_room_count >= 2);
  assert.ok(spatial.detected_room_types.bedroom >= 1);
  assert.ok(spatial.detected_room_types.kitchen >= 1);
  assert.ok(spatial.room_adjacency_count >= 1);
  assert.ok(spatial.room_adjacencies.some((item) => item.relation === 'shared_wall_or_partition'));
  assert.ok(spatial.furniture_group_count >= 2);
  assert.ok(spatial.detected_furniture_patterns.sleep_niche >= 1);
  assert.ok(spatial.detected_furniture_patterns.kitchen_work_wall >= 1);
  assert.ok(['high', 'medium'].includes(spatial.furniture_pattern_readiness));
  assert.ok(['high', 'medium'].includes(spatial.pattern_mining_readiness));
});

test('spatial analyzer does not promote open edge platforms into rooms', () => {
  const schematic = makeSchematic(12, 4, 12);
  fillBox(schematic, 0, 0, 0, 11, 0, 11, 'minecraft:smooth_stone');

  const spatial = analyzeSpatialLayout(schematic, {
    blockAt: blockAtFor(schematic),
    interiorSignalCategories
  });

  assert.equal(spatial.status, 'analyzed');
  assert.equal(spatial.high_confidence_room_count, 0);
  assert.ok(spatial.room_candidate_count === 0 || spatial.segmentation_confidence === 'low');
});

test('spatial analyzer detects vertical circulation signals', () => {
  const schematic = makeSchematic(9, 8, 9);
  fillBox(schematic, 1, 0, 1, 7, 0, 7, 'minecraft:oak_planks');
  fillBox(schematic, 1, 4, 1, 7, 4, 7, 'minecraft:oak_planks');
  for (let y = 1; y <= 5; y += 1) setBlock(schematic, 4, y, 4, 'minecraft:oak_stairs');

  const spatial = analyzeSpatialLayout(schematic, {
    blockAt: blockAtFor(schematic),
    interiorSignalCategories
  });

  assert.equal(spatial.vertical_circulation.vertical_signal, 'present');
  assert.ok(spatial.vertical_circulation.stair_blocks >= 4);
});

function buildTwoRoomHouse(schematic) {
  fillBox(schematic, 1, 0, 1, 16, 0, 10, 'minecraft:oak_planks');
  fillBox(schematic, 1, 3, 1, 16, 3, 10, 'minecraft:oak_planks');
  fillBox(schematic, 1, 1, 1, 16, 3, 1, 'minecraft:stone_bricks');
  fillBox(schematic, 1, 1, 10, 16, 3, 10, 'minecraft:stone_bricks');
  fillBox(schematic, 1, 1, 1, 1, 3, 10, 'minecraft:stone_bricks');
  fillBox(schematic, 16, 1, 1, 16, 3, 10, 'minecraft:stone_bricks');
  fillBox(schematic, 8, 1, 1, 8, 3, 10, 'minecraft:stone_bricks');
  setBlock(schematic, 3, 1, 3, 'minecraft:red_bed');
  setBlock(schematic, 4, 2, 3, 'minecraft:lantern');
  setBlock(schematic, 11, 1, 3, 'minecraft:furnace');
  setBlock(schematic, 12, 1, 3, 'minecraft:crafting_table');
  setBlock(schematic, 14, 2, 3, 'minecraft:lantern');
}

function makeSchematic(width, height, length) {
  return {
    kind: 'test',
    width,
    height,
    length,
    blockCount: width * height * length,
    blocks: Array.from({ length: width * height * length }, () => 'minecraft:air')
  };
}

function fillBox(schematic, minX, minY, minZ, maxX, maxY, maxZ, name) {
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) setBlock(schematic, x, y, z, name);
    }
  }
}

function setBlock(schematic, x, y, z, name) {
  schematic.blocks[indexFor(schematic.width, schematic.length, x, y, z)] = name;
}

function blockAtFor(schematic) {
  return (index) => {
    const state = schematic.blocks[index] || 'minecraft:air';
    const key = state.replace(/\[.*\]$/, '');
    return {
      state,
      key,
      name: key,
      category: categoryFor(key),
      air: key === 'minecraft:air'
    };
  };
}

function categoryFor(name) {
  const value = String(name || '').replace(/^minecraft:/, '');
  if (value === 'air') return 'air';
  if (/water/.test(value)) return 'water';
  if (/(torch|lantern|lamp|glowstone|sea_lantern|end_rod)/.test(value)) return 'light';
  if (/stairs?$/.test(value)) return 'stair';
  if (/slab/.test(value)) return 'slab';
  if (/(door|trapdoor|gate|ladder)/.test(value)) return 'opening';
  if (/(bed|furnace|crafting_table|chest|bookshelf|lectern|cauldron|barrel)/.test(value)) return 'decor';
  if (/(stone|brick|cobble|quartz|sandstone)/.test(value)) return 'rock';
  if (/(planks|log|wood|wool)/.test(value)) return 'wood';
  return 'other';
}

function interiorSignalCategories(block = {}) {
  const name = String(block.name || block.state || block.key || '').replace(/^minecraft:/, '');
  const result = [];
  if (/_bed$|^bed$/.test(name)) result.push('bed', 'textile');
  if (/(furnace|smoker|blast_furnace|crafting_table|cake)/.test(name)) result.push('kitchen_work');
  if (/(bookshelf|lectern|enchanting_table)/.test(name)) result.push('books_library');
  if (/(torch|lantern|lamp|glowstone|sea_lantern|end_rod)/.test(name)) result.push('light_fixture');
  return [...new Set(result)];
}

function indexFor(width, length, x, y, z) {
  return y * length * width + z * width + x;
}
