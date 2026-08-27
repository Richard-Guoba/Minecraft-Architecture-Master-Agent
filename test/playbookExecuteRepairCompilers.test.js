import assert from 'node:assert/strict';
import test from 'node:test';
import { compileMassingRepair } from '../src/playbook/execute/repairCompilers/massing.js';
import { compileStructureRepair } from '../src/playbook/execute/repairCompilers/structure.js';
import { applyLayerEffects } from '../src/playbook/execute/repairTransaction.js';

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
  const result = applyLayerEffects({ layer: 'massing', payload: layerPayload, effects: patch.effects, preconditionHashes: patch.precondition_hashes });
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
  const promote = compileMassingRepair({
    request: request('repair:massing:strengthen-primary-volume', 'promote-largest-stable', 'rule:structure.create-primary-secondary-hierarchy'),
    layerPayload: { volumes: tied }
  });
  assert.deepEqual(promote.effects.map((effect) => [effect.volume_id, effect.role]), [['main', 'primary-mass'], ['side-a', 'secondary-mass']]);

  const reduceVolumes = volumes();
  reduceVolumes[0].scale = [3, 3, 3];
  reduceVolumes[1].scale = [5, 3, 2];
  reduceVolumes[2].scale = [2, 2, 2];
  const reduce = compileMassingRepair({
    request: request('repair:massing:strengthen-primary-volume', 'reduce-nondominant-secondary', 'rule:structure.create-primary-secondary-hierarchy'),
    layerPayload: { volumes: reduceVolumes }
  });
  assert.deepEqual(reduce.effects, [{ type: 'set-volume-scale-axis', volume_id: 'side-a', axis: 'x', value: 4 }]);
});

test('support reduction preserves attachment and reduces only an offending support', () => {
  const input = volumes();
  input[1] = { ...input[1], role: 'support-volume', placement: { relation: 'attached-left', attach_to: 'main' }, scale: [5, 4, 4] };
  input[2].scale = [2, 2, 2];
  const patch = compileMassingRepair({
    request: request('repair:massing:reduce-support-volume-prominence', 'reduce-attached-support-scale', 'rule:structure.keep-support-volumes-subordinate'),
    layerPayload: { volumes: input }
  });
  assert.deepEqual(patch.effects, [{ type: 'set-volume-scale-axis', volume_id: 'side-a', axis: 'y', value: 3 }]);
});

test('structure repair accepts only the three exact semantic anchors', () => {
  const structural_anchors = {
    upper: { id: 'roof-main', hash: 'a'.repeat(64) },
    frame: { id: 'frame-main', hash: 'b'.repeat(64) },
    base: { id: 'foundation-main', hash: 'c'.repeat(64) }
  };
  const patch = compileStructureRepair({
    request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'),
    layerPayload: { structural_anchors, load_paths: [] }
  });
  assert.deepEqual(patch.effects, [{ type: 'set-load-path', from: 'roof-main', through: 'frame-main', to: 'foundation-main' }]);
  for (const mutate of [
    (x) => { delete x.upper; },
    (x) => { x.frame = { ...x.upper }; },
    (x) => { x.base.hash = 'd'.repeat(63); },
    (x) => { x.upper.x = 1; }
  ]) {
    const bad = structuredClone(structural_anchors); mutate(bad);
    assert.throws(() => compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: { structural_anchors: bad, load_paths: [] } }), { code: 'P5_REPAIR_INVALID' });
  }
  const accessor = structuredClone(structural_anchors);
  Object.defineProperty(accessor.upper, 'id', { enumerable: true, get: () => 'roof-main' });
  assert.throws(() => compileStructureRepair({ request: request('repair:structure:connect-support-path', 'connect-known-structural-anchors', 'rule:medieval.show-load-path'), layerPayload: { structural_anchors: accessor, load_paths: [] } }), { code: 'P5_REPAIR_INVALID' });
});

test('massing compilers reject malformed, detached, wrong-count, zero-scale, and non-repairable input', () => {
  const cases = [volumes().slice(0, 2), volumes(), volumes(), volumes()];
  cases[1][0].scale[0] = 0;
  cases[2][1].placement = { relation: 'attached-left', attach_to: 'missing' };
  cases[3].forEach((volume, index) => { volume.scale = [5 - index, 4, 3]; });
  for (const layerVolumes of cases) {
    assert.throws(() => compileMassingRepair({ request: request('repair:massing:resize-or-reposition-volume', 'differentiate-equal-secondary-scale'), layerPayload: { volumes: layerVolumes } }), { code: 'P5_REPAIR_INVALID' });
  }
});
