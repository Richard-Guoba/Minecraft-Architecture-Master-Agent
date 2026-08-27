import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseDefaultMassingVariant, compileMassingRepair } from '../src/playbook/execute/repairCompilers/massing.js';
import { compileStructureRepair } from '../src/playbook/execute/repairCompilers/structure.js';
import { applyLayerEffects } from '../src/playbook/execute/repairTransaction.js';
import { checkPrimarySecondaryHierarchy, checkSubordinateSupportVolume, checkThreeVolumeComposition } from '../src/playbook/shadow/checkers/massing.js';
import { checkVisibleLoadPath } from '../src/playbook/shadow/checkers/structure.js';
import { compileMassingLayer } from '../src/construction/designStages.js';
import { buildFallbackStructure } from '../src/construction/agents/structureAgent.js';

const H = 'a'.repeat(64);
const volumes = () => [
  { id: 'main', shape: 'box', role: 'primary-mass', scale: [4, 4, 4], placement: { relation: 'offset' } },
  { id: 'side-a', shape: 'box', role: 'secondary-mass', scale: [4, 4, 4], placement: { relation: 'detached-left' } },
  { id: 'side-b', shape: 'box', role: 'secondary-mass', scale: [4, 4, 4], placement: { relation: 'detached-right' } }
];

function request(operation, variant, rule = 'rule:structure.compose-three-volumes') {
  return { schema_version: 1, candidate_id: 'candidate-01', rule_id: rule, repair_operation_id: operation, variant_id: variant, base_checkpoint_sha256: H };
}

test('center variant preserves IDs, centers primary, and reattaches both secondaries in candidate order', () => {
  const layerPayload = { volumes: volumes(), build_spec: { floors: 2 } };
  const patch = compileMassingRepair({ request: request('repair:massing:resize-or-reposition-volume', 'center-primary-and-reattach-secondaries'), layerPayload });
  assert.deepEqual(patch.effects.map((effect) => [effect.type, effect.volume_id]), [
    ['set-volume-placement', 'main'], ['set-volume-placement', 'side-a'], ['set-volume-placement', 'side-b']
  ]);
  const result = applyLayerEffects({ payload: layerPayload, operations: [patch] });
  assert.deepEqual(result.volumes.map((volume) => volume.id), ['main', 'side-a', 'side-b']);
  assert.deepEqual(result.volumes.map((volume) => volume.placement), [
    { relation: 'center' },
    { relation: 'attached-left', attach_to: 'main' },
    { relation: 'attached-right', attach_to: 'main' }
  ]);
  assert.notEqual(result, layerPayload);
  assert.equal(Object.isFrozen(result.volumes[0].placement), true);
});

test('equal-scale differentiation changes one axis by the smallest positive integer amount', () => {
  const layerPayload = { volumes: volumes() };
  layerPayload.volumes[0].placement = { relation: 'center' };
  layerPayload.volumes[1].placement = { relation: 'attached-left', attach_to: 'main' };
  layerPayload.volumes[2].placement = { relation: 'attached-right', attach_to: 'main' };
  const patch = compileMassingRepair({ request: request('repair:massing:resize-or-reposition-volume', 'differentiate-equal-secondary-scale'), layerPayload });
  assert.deepEqual(patch.effects, [{ type: 'set-volume-scale-axis', volume_id: 'side-a', axis: 'x', value: 3 }]);
});

test('hierarchy variants use stable tie-breaking and the first strictly smaller integer product', () => {
  const tied = volumes();
  tied[0].role = 'secondary-mass';
  tied[1].role = 'primary-mass';
  tied[1].placement = { relation: 'attached-left', attach_to: 'main' };
  tied[2].placement = { relation: 'attached-right', attach_to: 'main' };
  const promote = compileMassingRepair({
    request: request('repair:massing:strengthen-primary-volume', 'promote-largest-stable', 'rule:structure.create-primary-secondary-hierarchy'),
    layerPayload: { volumes: tied }
  });
  assert.deepEqual(promote.effects.map((effect) => [effect.volume_id, effect.role]), [['main', 'primary-mass'], ['side-a', 'secondary-mass']]);

  const reduceVolumes = volumes();
  reduceVolumes[0].scale = [3, 3, 3];
  reduceVolumes[1].scale = [5, 3, 2];
  reduceVolumes[2].scale = [2, 2, 2];
  reduceVolumes[1].placement = { relation: 'attached-left', attach_to: 'main' };
  reduceVolumes[2].placement = { relation: 'attached-right', attach_to: 'main' };
  const reduce = compileMassingRepair({
    request: request('repair:massing:strengthen-primary-volume', 'reduce-nondominant-secondary', 'rule:structure.create-primary-secondary-hierarchy'),
    layerPayload: { volumes: reduceVolumes }
  });
  assert.deepEqual(reduce.effects, [{ type: 'set-volume-scale-axis', volume_id: 'side-a', axis: 'x', value: 4 }]);
});

test('support reduction preserves attachment and reduces only an offending support', () => {
  const input = volumes();
  input[0].placement = { relation: 'center' };
  input[1] = { ...input[1], role: 'support-volume', placement: { relation: 'attached-left', attach_to: 'main' }, scale: [5, 4, 4] };
  input[2] = { ...input[2], placement: { relation: 'attached-right', attach_to: 'main' }, scale: [2, 2, 2] };
  const layerPayload = { volumes: input };
  assert.equal(checkSubordinateSupportVolume(project(layerPayload)).status, 'violated');
  const patch = compileMassingRepair({
    request: request('repair:massing:reduce-support-volume-prominence', 'reduce-attached-support-scale', 'rule:structure.keep-support-volumes-subordinate'),
    layerPayload
  });
  assert.deepEqual(patch.effects, [{ type: 'set-volume-scale-axis', volume_id: 'side-a', axis: 'y', value: 3 }]);
  assert.equal(checkSubordinateSupportVolume(project(applyLayerEffects({ payload: layerPayload, operations: [patch] }))).status, 'satisfied');
});

test('support reduction rejects when an unchanged third volume would fail application invariants', () => {
  const input = volumes();
  input[0].placement = { relation: 'center' };
  input[1] = { ...input[1], role: 'support-volume', placement: { relation: 'attached-left', attach_to: 'main' }, scale: [5, 4, 4] };
  input[2] = { ...input[2], placement: { relation: 'detached-right' }, scale: [2, 2, 2] };
  const layerPayload = { volumes: input };
  const repairRequest = request(
    'repair:massing:reduce-support-volume-prominence',
    'reduce-attached-support-scale',
    'rule:structure.keep-support-volumes-subordinate'
  );

  assert.throws(() => compileMassingRepair({ request: repairRequest, layerPayload }), { code: 'P5_REPAIR_INVALID' });
  assert.throws(() => chooseDefaultMassingVariant({
    repair_operation_id: repairRequest.repair_operation_id,
    layerPayload
  }), { code: 'P5_REPAIR_INVALID' });
});

test('structure repair derives its only load path from exact production source paths', () => {
  const layerPayload = { roof_frame: { strategy: 'roof-main' }, system: 'frame-main', foundation: { strategy: 'foundation-main' }, load_paths: [] };
  const patch = compileStructureRepair({
    request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'),
    layerPayload
  });
  assert.deepEqual(patch.effects, [{ type: 'set-load-path', from: 'roof-main', through: 'frame-main', to: 'foundation-main' }]);
  for (const mutate of [
    (x) => { delete x.roof_frame.strategy; },
    (x) => { x.system = x.roof_frame.strategy; },
    (x) => { x.foundation.strategy = ''; },
    (x) => { x.roof_frame.strategy = { x: 1 }; }
  ]) {
    const bad = structuredClone(layerPayload); mutate(bad);
    assert.throws(() => compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: bad }), { code: 'P5_REPAIR_INVALID' });
  }
  for (const path of ['roof_frame', 'foundation']) {
    const accessor = structuredClone(layerPayload);
    Object.defineProperty(accessor, path, { enumerable: true, get: () => layerPayload[path] });
    assert.throws(() => compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: accessor }), { code: 'P5_REPAIR_INVALID' });
  }
  const nestedAccessor = structuredClone(layerPayload);
  Object.defineProperty(nestedAccessor.roof_frame, 'strategy', { enumerable: true, get: () => 'roof-main' });
  assert.throws(() => compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: nestedAccessor }), { code: 'P5_REPAIR_INVALID' });
});

test('all six variants compile and apply against Task 3 payloads while changing their intended P4 outcome', () => {
  const composition = { volumes: productionVolumes([1, 1, 1], [0.8, 0.8, 0.8], [0.6, 0.6, 0.6]) };
  composition.volumes[0].placement = { relation: 'offset' };
  composition.volumes[1].placement = { relation: 'detached-east' };
  composition.volumes[2].placement = { relation: 'detached-west' };
  assert.equal(checkThreeVolumeComposition(project(composition)).status, 'violated');
  const centerPatch = compileMassingRepair({ request: request('repair:massing:resize-or-reposition-volume', 'center-primary-and-reattach-secondaries'), layerPayload: composition });
  assert.equal(checkThreeVolumeComposition(project(applyLayerEffects({ payload: composition, operations: [centerPatch] }))).status, 'satisfied');

  const equal = { volumes: productionVolumes([0.75, 0.75, 0.75], [0.75, 0.75, 0.75], [0.75, 0.75, 0.75]) };
  assert.equal(checkThreeVolumeComposition(project(equal)).status, 'violated');
  const differentiatePatch = compileMassingRepair({ request: request('repair:massing:resize-or-reposition-volume', 'differentiate-equal-secondary-scale'), layerPayload: equal });
  assert.equal(checkThreeVolumeComposition(project(applyLayerEffects({ payload: equal, operations: [differentiatePatch] }))).status, 'satisfied');

  const multiplePrimary = { volumes: productionVolumes([1, 1, 1], [0.8, 0.8, 0.8], [0.6, 0.6, 0.6]) };
  multiplePrimary.volumes[1].role = 'primary-mass';
  multiplePrimary.volumes[1].tags = ['primary-mass'];
  assert.equal(checkPrimarySecondaryHierarchy(project(multiplePrimary)).status, 'violated');
  const promotePatch = compileMassingRepair({ request: request('repair:massing:strengthen-primary-volume', 'promote-largest-stable', 'rule:structure.create-primary-secondary-hierarchy'), layerPayload: multiplePrimary });
  const promoted = applyLayerEffects({ payload: multiplePrimary, operations: [promotePatch] });
  assert.equal(checkPrimarySecondaryHierarchy(project(promoted)).status, 'satisfied');
  assert.deepEqual(promoted.volumes[0].tags, ['primary-mass']);
  assert.equal(promoted.volumes[0].purpose, 'main-building-envelope');

  const hierarchy = { volumes: productionVolumes([1, 1, 1], [1, 1, 1], [0.4, 0.5, 0.6]) };
  assert.equal(checkPrimarySecondaryHierarchy(project(hierarchy)).status, 'violated');
  const hierarchyPatch = compileMassingRepair({ request: request('repair:massing:strengthen-primary-volume', 'reduce-nondominant-secondary', 'rule:structure.create-primary-secondary-hierarchy'), layerPayload: hierarchy });
  assert.equal(Number.isInteger(hierarchyPatch.effects[0].value), true);
  const repairedHierarchy = applyLayerEffects({ payload: hierarchy, operations: [hierarchyPatch] });
  assert.equal(checkPrimarySecondaryHierarchy(project(repairedHierarchy)).status, 'satisfied');

  const support = { volumes: productionVolumes([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.2, 0.2, 0.2]) };
  assert.equal(checkSubordinateSupportVolume(project(support)).status, 'violated');
  const supportPatch = compileMassingRepair({ request: request('repair:massing:reduce-support-volume-prominence', 'reduce-attached-support-scale', 'rule:structure.keep-support-volumes-subordinate'), layerPayload: support });
  assert.equal(checkSubordinateSupportVolume(project(applyLayerEffects({ payload: support, operations: [supportPatch] }))).status, 'satisfied');

  const structure = { roof_frame: { strategy: 'roof-main' }, system: 'frame-main', foundation: { strategy: 'foundation-main' }, load_paths: [] };
  const structurePatch = compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: structure });
  const before = { brief: { style_family: 'medieval' }, structure: { ...structure, structural_intent: { floor_count: 2 } }, roof: { overhang: 1 } };
  assert.equal(checkVisibleLoadPath(before).status, 'violated');
  assert.equal(checkVisibleLoadPath({ ...before, structure: { ...before.structure, ...applyLayerEffects({ payload: structure, operations: [structurePatch] }) } }).status, 'satisfied');
});

test('application rejects invented effects and semantic invariant attacks', () => {
  const layerPayload = { volumes: productionVolumes([1, 1, 1], [1, 1, 1], [0.4, 0.5, 0.6]) };
  const patch = compileMassingRepair({ request: request('repair:massing:strengthen-primary-volume', 'reduce-nondominant-secondary', 'rule:structure.create-primary-secondary-hierarchy'), layerPayload });
  for (const mutate of [
    (x) => { x.effects = [{ type: 'set-volume-placement', volume_id: 'side-a', placement: { relation: 'attached-east', attach_to: 'invented' } }]; },
    (x) => { x.effects = [{ type: 'set-volume-role', volume_id: 'side-a', role: 'primary-mass' }]; }
  ]) {
    const attack = structuredClone(patch); mutate(attack);
    assert.throws(() => applyLayerEffects({ payload: layerPayload, operations: [attack] }), { code: 'P5_REPAIR_INVALID' });
  }
  const structure = { roof_frame: { strategy: 'roof-main' }, system: 'frame-main', foundation: { strategy: 'foundation-main' }, load_paths: [] };
  const load = compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: structure });
  const fake = structuredClone(load); fake.effects[0].through = 'invented-frame';
  assert.throws(() => applyLayerEffects({ payload: structure, operations: [fake] }), { code: 'P5_REPAIR_INVALID' });
});

test('real Task 3 massing and fallback structure seams feed the reviewed compilers', () => {
  const source = { volumes: productionVolumes([1, 1, 1], [1, 1, 1], [0.4, 0.5, 0.6]) };
  const massing = compileMassingLayer({
    prepared: { buildSpec: { floors: 2 } },
    brief: { runtime: { architecture: source } },
    effects: []
  }).payload;
  assert.doesNotThrow(() => compileMassingRepair({
    request: request('repair:massing:strengthen-primary-volume', 'reduce-nondominant-secondary', 'rule:structure.create-primary-secondary-hierarchy'),
    layerPayload: massing
  }));
  const fallback = buildFallbackStructure({ style_family: 'medieval', volumes: source.volumes }, { floors: 2, structural: { system: 'timber-frame' } }, {});
  fallback.load_paths = [];
  assert.doesNotThrow(() => compileStructureRepair({
    request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'),
    layerPayload: fallback
  }));
});

test('massing compilers reject malformed, detached, wrong-count, zero-scale, and non-repairable input', () => {
  const cases = [volumes().slice(0, 2), volumes(), volumes(), volumes()];
  cases[1][0].scale[0] = 0;
  cases[2][1].placement = { relation: 'attached-left', attach_to: 'missing' };
  cases[3].forEach((volume, index) => { volume.scale = [5 - index, 4, 3]; });
  const excessivePrecision = volumes(); excessivePrecision[0].scale[0] = 1e-7; cases.push(excessivePrecision);
  for (const layerVolumes of cases) {
    assert.throws(() => compileMassingRepair({ request: request('repair:massing:resize-or-reposition-volume', 'differentiate-equal-secondary-scale'), layerPayload: { volumes: layerVolumes } }), { code: 'P5_REPAIR_INVALID' });
  }
});

function productionVolumes(primaryScale, firstScale, secondScale) {
  return [
    { id: 'main', role: '主体外壳', shape: 'box', scale: primaryScale, placement: { relation: 'center' }, boolean_mode: 'union', tags: ['primary-mass'], purpose: 'main-building-envelope' },
    { id: 'side-a', role: '侧翼', shape: 'box', scale: firstScale, placement: { relation: 'attached-east', attach_to: 'main' }, boolean_mode: 'union', tags: ['secondary-mass'] },
    { id: 'side-b', role: '辅助体', shape: 'box', scale: secondScale, placement: { relation: 'attached-west', attach_to: 'main' }, boolean_mode: 'union', tags: ['secondary-mass'] }
  ];
}
function project(massing) { return { brief: { typology: 'house' }, massing, pointers: {} }; }
