import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeededCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';

test('creative design keeps rustic and gothic template roofs pitched when no flat roof is requested', () => {
  const sharedStrategy = {
    directives: {
      prompt_signals: { explicit_composition_request: true },
      preferred_massing_variant: 'corner-vertical-accent'
    }
  };
  const rustic = buildSeededCreativeDesign(
    '建一个中世纪云杉木住宅，木石基座、深檐、厚重屋顶和前景花园',
    {
      style: '木屋',
      style_family: 'rustic',
      roof_rules: { style: 'gabled' },
      generation_hints: { template_composition_strategy: sharedStrategy }
    },
    { seed: 720155, floors: 2, roof_style: 'gabled', style_family: 'rustic' },
    { nodes: [] }
  );
  const gothic = buildSeededCreativeDesign(
    '建一个哥特山坡宅邸，角部有塔楼书房、尖拱窗、扶壁和前景庭院',
    {
      style: '哥特',
      style_family: 'gothic',
      roof_rules: { style: 'gabled' },
      generation_hints: { template_composition_strategy: sharedStrategy }
    },
    { seed: 720173, floors: 3, roof_style: 'gabled', style_family: 'gothic' },
    { nodes: [] }
  );

  assert.notEqual(rustic.roof.style, 'flat');
  assert.notEqual(gothic.roof.style, 'flat');
});

test('creative design locks explicit Japanese layered eaves to the requested roof profile', () => {
  const design = buildSeededCreativeDesign(
    '建一个日式庭院住宅，低矮体块、层叠深檐、枯山水和入口过渡',
    {
      style: '日式',
      style_family: 'japanese',
      roof_rules: { style: 'hipped' },
      generation_hints: {
        template_composition_strategy: {
          directives: {
            preferred_roof_profile: 'low-layered-eaves',
            lock_preferred_roof_profile: true,
            prompt_signals: { explicit_composition_request: true }
          }
        }
      }
    },
    { seed: 720137, floors: 1, roof_style: 'hipped', style_family: 'japanese' },
    { nodes: [] }
  );

  assert.equal(design.roof.profile, 'low-layered-eaves');
});
