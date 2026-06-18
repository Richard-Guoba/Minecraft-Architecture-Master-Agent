import test from 'node:test';
import assert from 'node:assert/strict';
import { blockCatalogStats, blockUsageAtlasStats, blockUsageProfile, isKnownMinecraft121Block, materialOptionsForFamily, minecraftBlockUsageAtlas, minecraftBlocksForRole, partUsagePolicies } from '../src/construction/agents/minecraftBlockCatalog.js';
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
  assert.ok(palette.material_options.creative.includes('minecraft:creeper_head'));
  assert.equal(palette.block_usage_atlas.coverageBlockCount, palette.block_catalog.blockCount);
  assert.ok(palette.part_usage_policies.length >= 8);
});

test('catalog role helpers include broad buildable categories', () => {
  const plantBlocks = minecraftBlocksForRole('plant');

  assert.ok(materialOptionsForFamily('general').catalog.includes('minecraft:heavy_core'));
  assert.ok(minecraftBlocksForRole('lighting').includes('minecraft:sea_lantern'));
  assert.ok(plantBlocks.includes('minecraft:potted_bamboo'));
  assert.ok(!plantBlocks.includes('minecraft:grass'));
  assert.ok(plantBlocks.every((block) => isKnownMinecraft121Block(block)));
  assert.ok(minecraftBlocksForRole('door').includes('minecraft:copper_door'));
});

test('block usage atlas assigns a practical use to every Minecraft 1.21.1 block', () => {
  const atlas = minecraftBlockUsageAtlas();
  const stats = blockUsageAtlasStats();

  assert.equal(atlas.length, blockCatalogStats().blockCount);
  assert.equal(stats.coverageBlockCount, stats.blockCount);
  assert.ok(partUsagePolicies().some((policy) => policy.part === 'window_system'));

  const creeperHead = blockUsageProfile('minecraft:creeper_head');
  assert.ok(creeperHead.parts.includes('special_accent'));
  assert.match(creeperHead.primary_use, /hardware|identity|trophy|accent|marker/i);

  const endRod = blockUsageProfile('minecraft:end_rod');
  assert.ok(endRod.roles.includes('lighting'));

  const heavyCore = blockUsageProfile('minecraft:heavy_core');
  assert.ok(heavyCore.parts.includes('special_accent'));
});
