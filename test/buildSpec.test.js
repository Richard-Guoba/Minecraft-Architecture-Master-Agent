import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBuildSpec } from '../src/construction/workflow.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';

test('deriveBuildSpec parses Chinese dimensions and semantic courtyard site rules', () => {
  const prompt = '建一个日式一层町屋，木格栅，枯山水小庭院，门在北侧，宽二十三深十九，层高四，庭院深七';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);

  assert.equal(spec.style, '日式');
  assert.equal(spec.style_family, 'japanese');
  assert.equal(spec.typology, 'courtyard-house');
  assert.equal(spec.footprint, 'courtyard');
  assert.equal(spec.width, 23);
  assert.equal(spec.depth, 19);
  assert.equal(spec.floors, 1);
  assert.equal(spec.floor_height, 4);
  assert.equal(spec.wall_height, 4);
  assert.equal(spec.garden_depth, 7);
  assert.equal(spec.door_side, 'north');
  assert.equal(spec.roof_style, 'hipped');
  assert.equal(spec.site.dry_garden, true);
  assert.equal(spec.facade.screens, true);
  assert.equal(spec.source.dimensions, 'prompt');
});

test('deriveBuildSpec supports taller fortified prompts without leaking coordinates', () => {
  const prompt = '建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);

  assert.equal(spec.style, '哥特');
  assert.equal(spec.typology, 'castle');
  assert.equal(spec.width, 33);
  assert.equal(spec.depth, 29);
  assert.equal(spec.floors, 4);
  assert.equal(spec.floor_height, 5);
  assert.equal(spec.wall_height, 20);
  assert.equal(spec.roof_height, 7);
  assert.equal(spec.shell_thickness, 2);
  assert.equal(spec.door_width, 2);
  assert.equal(spec.door_height, 4);
  assert.equal(spec.structural.supports, 'buttresses-and-piers');
  assert.equal(spec.facade.arches, true);
  assert.ok(spec.modules.preferred.includes('tower'));
  assert.ok(spec.total_height <= spec.constraints.max_total_height);
});

test('deriveBuildSpec records default sources when prompt omits hard dimensions', () => {
  const prompt = '建一个北欧森林小屋，大坡屋顶，有前廊和大窗';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);

  assert.equal(spec.style, '北欧');
  assert.equal(spec.typology, 'cabin');
  assert.equal(spec.source.dimensions, 'default');
  assert.equal(spec.source.floors, 'default');
  assert.equal(spec.facade.large_glass, true);
  assert.equal(spec.facade.porch, true);
  assert.ok(spec.width <= 17);
  assert.ok(spec.depth <= 15);
  assert.equal(spec.lot.width, spec.width + spec.lot.side_setback * 2);
});

test('deriveBuildSpec adapts defaults for treehouse grammar', () => {
  const prompt = '建一个树屋，树上小屋，环绕露台，木头和树叶屋顶';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);

  assert.equal(spec.style, '树屋');
  assert.equal(spec.style_family, 'treehouse');
  assert.equal(spec.typology, 'treehouse');
  assert.equal(spec.footprint, 'compact-tower');
  assert.ok(spec.width <= 17);
  assert.ok(spec.depth <= 15);
  assert.equal(spec.roof_style, 'hipped');
  assert.ok(spec.roof_height >= 5);
  assert.equal(spec.structural.supports, 'tree-trunk-and-stilts');
  assert.equal(spec.facade.screens, true);
  assert.ok(spec.modules.preferred.includes('treehouse_supports'));
});

test('deriveBuildSpec adapts defaults for subterranean grammar', () => {
  const prompt = '建一个地下基地，半地下庭院，采光井，厚墙';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);

  assert.equal(spec.style, '地下');
  assert.equal(spec.style_family, 'subterranean');
  assert.equal(spec.typology, 'earth-shelter');
  assert.equal(spec.footprint, 'courtyard');
  assert.equal(spec.roof_style, 'flat');
  assert.equal(spec.roof_height, 2);
  assert.equal(spec.shell_thickness, 2);
  assert.equal(spec.facade.large_glass, false);
  assert.equal(spec.facade.glazing_ratio, 'low');
  assert.equal(spec.site.enclosed_courtyard, true);
  assert.equal(spec.structural.supports, 'retaining-walls-and-earth-anchors');
  assert.ok(spec.modules.preferred.includes('lightwell'));
  assert.ok(spec.modules.future_engine_features.includes('earth-shelter-lightwells'));
});
