import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTemplateComposition } from '../src/construction/templates/templateCompositionMiner.js';

test('composition miner extracts lake villa massing, glass, water edge, and approach grammar', () => {
  const schematic = makeSchematic(32, 9, 26);
  fillBox(schematic, 4, 0, 4, 22, 0, 12, 'minecraft:smooth_quartz');
  fillBox(schematic, 4, 1, 4, 22, 4, 12, 'minecraft:stone_bricks');
  fillBox(schematic, 6, 2, 12, 20, 3, 12, 'minecraft:glass');
  fillBox(schematic, 18, 1, 10, 29, 4, 17, 'minecraft:stone_bricks');
  fillBox(schematic, 20, 2, 17, 27, 3, 17, 'minecraft:glass');
  fillBox(schematic, 10, 5, 6, 20, 5, 12, 'minecraft:smooth_quartz_slab');
  fillBox(schematic, 1, 0, 14, 30, 0, 24, 'minecraft:grass_block');
  fillBox(schematic, 5, 1, 15, 9, 1, 19, 'minecraft:oak_leaves');
  fillBox(schematic, 15, 0, 19, 28, 0, 22, 'minecraft:water');

  const grammar = analyzeTemplateComposition(schematic, {
    blockAt: blockAtFor(schematic),
    text: 'Modern lake villa with waterfront deck, garden approach and large glass',
    styleFamily: 'modern',
    typology: 'house',
    tags: ['water-edge', 'landscape-composition', 'glass-emphasis'],
    analysis: {
      terrain: { integrated: true, non_flat: true, height_range: 5 },
      detail_metrics: { garden_signal: 'water-garden', natural_ratio: 0.3 },
      block_categories: { water: { ratio: 0.04 } }
    }
  });

  assert.equal(grammar.status, 'analyzed');
  assert.ok(['high', 'medium'].includes(grammar.readiness));
  assert.ok(grammar.massing_patterns.some((item) => item.pattern_type === 'long_bar' || item.pattern_type === 'asymmetric_wings'));
  assert.ok(grammar.facade_rhythm.some((item) => item.pattern_type === 'large_glass_bands'));
  assert.ok(grammar.site_composition.some((item) => item.pattern_type === 'water_edge'));
  assert.ok(grammar.approach_sequence.some((item) => item.pattern_type === 'garden_forecourt'));
  assert.ok(grammar.transfer_rules.some((item) => /water edge|large glass|foreground garden/i.test(item)));
});

test('composition miner extracts vertical landmark and layered roof cues', () => {
  const schematic = makeSchematic(15, 28, 15);
  for (let y = 0; y <= 22; y += 1) {
    const inset = Math.min(4, Math.floor(y / 5));
    fillBox(schematic, 3 + inset, y, 3 + inset, 11 - inset, y, 11 - inset, 'minecraft:stone_bricks');
    if (y % 4 === 0) fillBox(schematic, 2 + inset, y + 1, 2 + inset, 12 - inset, y + 1, 12 - inset, 'minecraft:stone_brick_stairs');
  }

  const grammar = analyzeTemplateComposition(schematic, {
    blockAt: blockAtFor(schematic),
    text: 'Japanese temple tower with layered eaves',
    styleFamily: 'japanese',
    typology: 'temple',
    tags: ['vertical-icon', 'layered-eaves'],
    analysis: {
      terrain: { integrated: false, non_flat: false, height_range: 0 },
      detail_metrics: { garden_signal: 'none', natural_ratio: 0 }
    }
  });

  assert.equal(grammar.status, 'analyzed');
  assert.ok(grammar.massing_patterns.some((item) => item.pattern_type === 'vertical_landmark'));
  assert.ok(grammar.roof_composition.some((item) => item.pattern_type === 'layered_eaves'));
  assert.ok(grammar.view_and_landmark_rules.some((item) => item.pattern_type === 'make_entry_reveal_landmark'));
});

function makeSchematic(width, height, length) {
  return {
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
  schematic.blocks[y * schematic.length * schematic.width + z * schematic.width + x] = name;
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
  if (/(leaves|grass|flower|azalea|fern)/.test(value)) return 'vegetation';
  if (/grass_block|dirt|sand|gravel/.test(value)) return 'earth';
  if (/glass|pane/.test(value)) return 'glass';
  if (/stairs?$/.test(value)) return 'stair';
  if (/slab/.test(value)) return 'slab';
  if (/fence|wall|bars/.test(value)) return 'fence';
  if (/torch|lantern|lamp|glowstone|sea_lantern/.test(value)) return 'light';
  if (/bed|chest|table|pot|carpet/.test(value)) return 'decor';
  if (/planks|log|wood/.test(value)) return 'wood';
  if (/stone|brick|quartz|cobble/.test(value)) return 'rock';
  return 'other';
}
