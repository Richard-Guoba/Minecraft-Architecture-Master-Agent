import test from 'node:test';
import assert from 'node:assert/strict';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('BSPPartitioner preserves Japanese room semantics and courtyard-oriented metadata', () => {
  const { layout } = buildLayout('建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九');

  assert.equal(layout.bsp.splitStrategy, 'courtyard-ring');
  assert.deepEqual(roomIds(layout), ['entry', 'living', 'tatami', 'tea-room', 'kitchen']);
  assert.equal(layout.bsp.unassignedPlannerNodes.length, 0);
  assert.equal(layout.rooms.find((room) => room.id === 'tatami').orientation, 'courtyard');
  assert.equal(layout.rooms.find((room) => room.id === 'tea-room').orientation, 'garden');
  assert.equal(layout.rooms.find((room) => room.id === 'kitchen').zone, 'service');
  assert.ok(layout.interiorDoors.some((door) => door.kind === 'bsp-door'));
});

test('BSPPartitioner assigns castle tower rooms to tower volume while keeping the stair core buildable', () => {
  const { layout } = buildLayout('建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗');
  const towerRoom = layout.rooms.find((room) => room.id === 'tower-room');

  assert.equal(layout.bsp.splitStrategy, 'axis-balanced');
  assert.ok(layout.bsp.specialRoomCount >= 4);
  assert.equal(towerRoom.source, 'corner-tower');
  assert.equal(towerRoom.volume.module, 'tower');
  assert.equal(towerRoom.assigned_node, true);
  assert.equal(layout.rooms.find((room) => room.id === 'tower-stair').source, 'main');
  assert.ok(layout.rooms.some((room) => room.source === 'corner-tower' && room.assigned_node === false));
  assert.ok(layout.interiorDoors.some((door) => door.kind === 'attached-volume' && door.connects.includes('tower-room')));
});

test('BSPPartitioner maps modern garage and sunroom nodes to attached volumes and keeps open-plan soft boundaries', () => {
  const { layout } = buildLayout('建一个现代两层房子，宽31深17，大玻璃窗，阳光房，车库，开放厨房，平屋顶');
  const garage = layout.rooms.find((room) => room.id === 'garage');
  const sunroom = layout.rooms.find((room) => room.id === 'sunroom');

  assert.equal(layout.bsp.splitStrategy, 'open-plan-weighted');
  assert.ok(layout.bsp.openPlanSoftBoundaries > 0);
  assert.equal(layout.bsp.unassignedPlannerNodes.length, 0);
  assert.equal(garage.source, 'garage-wing');
  assert.equal(garage.volume.module, 'garage');
  assert.equal(garage.assigned_node, true);
  assert.equal(sunroom.volume.module, 'sunroom');
  assert.equal(sunroom.assigned_node, true);
  assert.ok(layout.interiorDoors.some((door) => door.kind === 'attached-volume' && door.connects.includes('garage')));
  assert.ok(layout.interiorDoors.some((door) => door.kind === 'attached-volume' && door.connects.includes('sunroom')));
});

function buildLayout(prompt) {
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, spec);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(spec, architecture.materials).fitRooms(shell, topology);
  return { architecture, spec, topology, shell, layout };
}

function roomIds(layout) {
  return layout.rooms.map((room) => room.id);
}
