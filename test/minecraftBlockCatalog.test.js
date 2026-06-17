import test from 'node:test';
import assert from 'node:assert/strict';
import { blockCatalogStats, isKnownMinecraft121Block, materialOptionsForFamily, minecraftBlocksForRole } from '../src/construction/agents/minecraftBlockCatalog.js';
import { MaterialPaletteAgent } from '../src/construction/agents/materialPaletteAgent.js';

test('Minecraft 1.21 block catalog exposes a broad validated block set', () => {
  const stats = blockCatalogStats();

  assert.equal(stats.version, 'java-1.21/1.21.1');
  assert.ok(stats.blockCount >= 1000);
  assert.equal(stats.registryBlockCount, 1060);
  assert.equal(isKnownMinecraft121Block('minecraft:trial_spawner'), true);
  assert.equal(isKnownMinecraft121Block('minecraft:crafter'), true);
  assert.equal(isKnownMinecraft121Block('minecraft:iron_door'), true);
  assert.equal(isKnownMinecraft121Block('minecraft:copper_bulb[lit=false]'), true);
  assert.equal(isKnownMinecraft121Block('minecraft:not_a_real_block'), false);
});

test('MaterialPaletteAgent publishes large role-based material option pools', () => {
  const architecture = {
    style_family: 'cyberpunk',
    materials: {
      wall: 'minecraft:gray_concrete',
      floor: 'minecraft:smooth_quartz',
      roof: 'minecraft:black_concrete',
      trim: 'minecraft:cyan_concrete',
      glass: 'minecraft:cyan_stained_glass',
      door: 'minecraft:iron_door'
    }
  };
  const palette = new MaterialPaletteAgent().run('霓虹，铜，青色玻璃', architecture, { id: 'test-neon' });

  assert.equal(palette.valid, true);
  assert.ok(palette.block_catalog.blockCount >= 1000);
  assert.ok(palette.controllableBlockCount >= 1000);
  assert.ok(palette.material_options.wall.includes('minecraft:magenta_concrete'));
  assert.ok(palette.material_options.trim.includes('minecraft:waxed_oxidized_copper_bulb'));
  assert.ok(palette.material_options.redstone.includes('minecraft:crafter'));
  assert.ok(palette.material_options.catalog.includes('minecraft:iron_door'));
});

test('catalog role helpers include broad buildable categories', () => {
  assert.ok(materialOptionsForFamily('general').catalog.includes('minecraft:heavy_core'));
  assert.ok(minecraftBlocksForRole('lighting').includes('minecraft:sea_lantern'));
  assert.ok(minecraftBlocksForRole('plant').includes('minecraft:potted_bamboo'));
  assert.ok(minecraftBlocksForRole('door').includes('minecraft:copper_door'));
});
