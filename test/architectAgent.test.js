import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture, normalizeArchitecture } from '../src/construction/agents/architectAgent.js';

test('architect fallback emits rich semantic rules for Japanese courtyard houses', () => {
  const architecture = buildFallbackArchitecture('建一个日式一层町屋，木格栅，玄关，榻榻米，枯山水小庭院，黑瓦，门在北侧');

  assert.equal(architecture.style, '日式');
  assert.equal(architecture.style_family, 'japanese');
  assert.equal(architecture.footprint, 'courtyard');
  assert.equal(architecture.typology, 'courtyard-house');
  assert.equal(architecture.facade_rules.front_side, 'north');
  assert.equal(architecture.facade_rules.screen, true);
  assert.equal(architecture.site_rules.dry_garden, true);
  assert.equal(architecture.roof_rules.eave_treatment, 'deep-layered-eaves');
  assert.equal(architecture.structural_rules.system, 'timber-post-and-beam');
  assert.ok(architecture.volumes.some((volume) => volume.id === 'front-gate'));
  assert.ok(architecture.generation_hints.preferred_modules.includes('screens'));
  assert.ok(architecture.generation_hints.future_engine_features.includes('screen-facades'));
});

test('architect fallback adds vertical and facade semantics for gothic castle prompts', () => {
  const architecture = buildFallbackArchitecture('建一个哥特式三层城堡，带尖塔、尖拱、玫瑰窗和厚石墙');

  assert.equal(architecture.style, '哥特');
  assert.equal(architecture.style_family, 'gothic');
  assert.equal(architecture.typology, 'castle');
  assert.equal(architecture.footprint, 'winged');
  assert.equal(architecture.facade_rules.pointed_arches, true);
  assert.equal(architecture.roof_rules.vertical_accent, true);
  assert.equal(architecture.structural_rules.primary_supports, 'buttresses-and-piers');
  assert.ok(architecture.volumes.some((volume) => volume.id === 'corner-tower' && volume.shape === 'cylinder'));
  assert.ok(architecture.detail_rules.signature_elements.includes('tower'));
  assert.ok(architecture.generation_hints.preferred_modules.includes('tower'));
});

test('architect fallback builds coastal view-deck semantics', () => {
  const architecture = buildFallbackArchitecture('建一个海边玻璃别墅，观景露台，白墙蓝顶，大玻璃');

  assert.equal(architecture.style, '海滨');
  assert.equal(architecture.style_family, 'coastal');
  assert.equal(architecture.typology, 'villa');
  assert.equal(architecture.footprint, 'l-shape');
  assert.equal(architecture.materials.roof, 'minecraft:blue_terracotta');
  assert.equal(architecture.facade_rules.large_glass, true);
  assert.equal(architecture.facade_rules.balcony, true);
  assert.equal(architecture.site_rules.water_feature, true);
  assert.equal(architecture.site_rules.patio, true);
  assert.equal(architecture.massing_rules.composition.view_deck, true);
  assert.ok(architecture.volumes.some((volume) => volume.id === 'ocean-deck' && volume.tags.includes('deck')));
  assert.ok(architecture.generation_hints.preferred_modules.includes('gallery'));
  assert.ok(architecture.generation_hints.future_engine_features.includes('view-decks'));
});

test('architect fallback builds treehouse support and deck semantics', () => {
  const architecture = buildFallbackArchitecture('建一个树屋，树上小屋，环绕露台，木头和树叶屋顶');

  assert.equal(architecture.style, '树屋');
  assert.equal(architecture.style_family, 'treehouse');
  assert.equal(architecture.typology, 'treehouse');
  assert.equal(architecture.footprint, 'compact-tower');
  assert.equal(architecture.materials.roof, 'minecraft:oak_leaves[persistent=true]');
  assert.equal(architecture.facade_rules.screen, true);
  assert.equal(architecture.roof_rules.vertical_accent, true);
  assert.equal(architecture.massing_rules.composition.raised_treehouse, true);
  assert.equal(architecture.structural_rules.primary_supports, 'tree-trunk-and-stilts');
  assert.ok(architecture.volumes.some((volume) => volume.id === 'trunk-core' && volume.tags.includes('support-trunk')));
  assert.ok(architecture.volumes.some((volume) => volume.id === 'wraparound-deck' && volume.tags.includes('gallery')));
  assert.ok(architecture.generation_hints.preferred_modules.includes('treehouse_supports'));
  assert.ok(architecture.generation_hints.future_engine_features.includes('treehouse-supports'));
});

test('architect fallback builds subterranean lightwell semantics', () => {
  const architecture = buildFallbackArchitecture('建一个地下基地，半地下庭院，采光井，厚墙');

  assert.equal(architecture.style, '地下');
  assert.equal(architecture.style_family, 'subterranean');
  assert.equal(architecture.typology, 'earth-shelter');
  assert.equal(architecture.footprint, 'courtyard');
  assert.equal(architecture.envelope_rules.shell_thickness, 2);
  assert.equal(architecture.facade_rules.large_glass, false);
  assert.equal(architecture.facade_rules.glazing_ratio, 'low');
  assert.equal(architecture.roof_rules.skylights, true);
  assert.equal(architecture.site_rules.enclosed_courtyard, true);
  assert.equal(architecture.massing_rules.composition.earth_shelter, true);
  assert.equal(architecture.structural_rules.wall_strategy, 'retaining-earth-shelter-walls');
  assert.ok(architecture.volumes.some((volume) => volume.id === 'lightwell-court' && volume.tags.includes('lightwell')));
  assert.ok(architecture.generation_hints.preferred_modules.includes('lightwell'));
  assert.ok(architecture.generation_hints.future_engine_features.includes('earth-shelter-lightwells'));
});

test('architecture normalization keeps semantic extras but rejects unsupported geometry primitives', () => {
  const fallback = buildFallbackArchitecture('建一个现代房子');
  const architecture = normalizeArchitecture({
    style: '幻想风',
    footprint: 'spiral',
    volumes: [
      {
        id: 'floating-orb',
        role: '漂浮体块',
        shape: 'sphere',
        scale: { x: 9, y: 9, z: 9 },
        placement: { relation: 'attached-east' },
        booleanMode: 'xor',
        tags: ['experimental'],
        purpose: 'future-geometry-placeholder',
        x: 100
      }
    ],
    structuralRules: { system: 'semantic-only' },
    generationHints: { preferredModules: ['tower'] }
  }, 'llm', fallback);

  assert.equal(architecture.footprint, 'rectangle');
  assert.equal(architecture.volumes[0].shape, 'box');
  assert.equal(architecture.volumes[0].boolean_mode, 'union');
  assert.deepEqual(architecture.volumes[0].scale, [1.4, 1.6, 1.4]);
  assert.equal(Object.hasOwn(architecture.volumes[0], 'x'), false);
  assert.deepEqual(architecture.volumes[0].tags, ['experimental']);
  assert.equal(architecture.structural_rules.system, 'semantic-only');
  assert.deepEqual(architecture.generation_hints.preferred_modules, ['tower']);
});
