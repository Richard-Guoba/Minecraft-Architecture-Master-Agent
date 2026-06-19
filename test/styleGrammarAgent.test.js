import test from 'node:test';
import assert from 'node:assert/strict';
import { StyleGrammarAgent } from '../src/construction/agents/styleGrammarAgent.js';

test('style grammar keeps primary style while combining secondary features', () => {
  const grammar = new StyleGrammarAgent().analyze('建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园');

  assert.equal(grammar.source, 'local-style-grammar');
  assert.equal(grammar.profile.style, '赛博朋克');
  assert.equal(grammar.profile.family, 'cyberpunk');
  assert.equal(grammar.features.neon, true);
  assert.equal(grammar.features.coastal_deck, true);
  assert.equal(grammar.features.roof_garden, true);
  assert.ok(grammar.extra_motifs.includes('coastal-deck'));
  assert.ok(grammar.extra_motifs.includes('neon-trim'));
  assert.deepEqual(grammar.material_hints.find((hint) => hint.block === 'minecraft:cyan_stained_glass')?.targets, ['glass']);
  assert.deepEqual(grammar.material_hints.find((hint) => hint.block === 'minecraft:sea_lantern')?.targets, ['lamp', 'path']);
});

test('style grammar recognizes environment-led house archetypes', () => {
  const treehouse = new StyleGrammarAgent().analyze('森林里的树上树屋，树冠和环绕露台');
  const underground = new StyleGrammarAgent().analyze('半地下基地，带采光井和下沉庭院');
  const cliff = new StyleGrammarAgent().analyze('悬崖边的悬挑住宅，带观景平台');

  assert.equal(treehouse.profile.style, '树屋');
  assert.equal(treehouse.features.treehouse, true);
  assert.equal(underground.profile.style, '地下');
  assert.equal(underground.features.underground, true);
  assert.equal(cliff.profile.style, '悬崖');
  assert.equal(cliff.features.cliff_deck, true);
});

test('style grammar does not classify bare villa as classical', () => {
  const grammar = new StyleGrammarAgent().analyze('modern waterfront villa with large glass and roof terrace');

  assert.notEqual(grammar.profile?.family, 'classical');
});

test('style grammar recognizes medieval spruce as rustic timber grammar', () => {
  const grammar = new StyleGrammarAgent().analyze('建一个中世纪云杉木住宅，木石基座，厚重屋顶和温暖室内');

  assert.equal(grammar.profile.style, '木屋');
  assert.equal(grammar.profile.family, 'rustic');
});
