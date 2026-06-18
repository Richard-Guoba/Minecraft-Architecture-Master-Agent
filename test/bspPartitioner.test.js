import test from 'node:test';
import assert from 'node:assert/strict';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner, sanitizeInteriorDoors } from '../src/construction/engine/bspPartitioner.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('BSPPartitioner preserves Japanese room semantics and courtyard-oriented metadata', () => {
  const { layout } = buildLayout('建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九');

  assert.equal(layout.bsp.splitStrategy, 'courtyard-ring');
  assert.deepEqual([...roomIds(layout)].sort(), ['entry', 'guest-bath', 'kitchen', 'living', 'tatami', 'tea-room']);
  assert.equal(layout.bsp.unassignedPlannerNodes.length, 0);
  assert.ok(layout.rooms.find((room) => room.id === 'entry').max_z > layout.rooms.find((room) => room.id === 'living').max_z);
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
  assert.equal(layout.rooms.some((room) => room.source === 'corner-tower' && room.assigned_node === false), false);
  assert.ok(layout.interiorDoors.some((door) => door.kind === 'attached-volume' && door.connects.includes('tower-room')));
});

test('BSPPartitioner keeps diagonal tower attached doors touching both rooms', () => {
  const { layout } = buildLayout('建一个黑石堡垒住宅，宽33深27，厚墙，塔楼，防御门厅，大厅，厨房，餐厅，卧室，书房和储藏室');
  const towerRoom = layout.rooms.find((room) => room.id === 'tower-room');
  const towerDoor = layout.interiorDoors.find((door) => door.kind === 'attached-volume' && door.connects.includes('tower-room'));
  const mainRoom = layout.rooms.find((room) => towerDoor.connects.includes(room.id) && room.id !== 'tower-room');

  assert.ok(towerRoom);
  assert.ok(towerDoor);
  assert.ok(mainRoom);
  assert.equal(towerDoor.axis, 'z');
  assert.ok(rangesOverlap(towerDoor.at.x - 1, towerDoor.at.x + 1, towerRoom.min_x, towerRoom.max_x));
  assert.ok(rangesOverlap(towerDoor.at.x - 1, towerDoor.at.x + 1, mainRoom.min_x, mainRoom.max_x));
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

test('BSPPartitioner keeps every recorded interior door touching its connected rooms', () => {
  const { layout } = buildLayout('建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃和屋顶露台');
  assertInteriorDoorsTouchRooms(layout);
});

test('sanitizeInteriorDoors removes stale LLM-normalized doors that no longer touch both rooms', () => {
  const rooms = [
    { id: 'study', floor: 0, min_x: 1, max_x: 8, min_z: 1, max_z: 5 },
    { id: 'living', floor: 0, min_x: 11, max_x: 20, min_z: 12, max_z: 18 },
    { id: 'kitchen', floor: 0, min_x: 11, max_x: 20, min_z: 1, max_z: 5 }
  ];
  const doors = [
    { kind: 'bsp-door', floor: 0, axis: 'x', at: { x: 10, z: 3 }, connects: ['study', 'living'] },
    { kind: 'bsp-door', floor: 0, axis: 'x', at: { x: 10, z: 3 }, connects: ['study', 'kitchen'] }
  ];

  sanitizeInteriorDoors(rooms, doors, { tolerance: 2 });

  assert.deepEqual(doors.map((door) => door.connects), [['study', 'kitchen']]);
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

function rangesOverlap(aMin, aMax, bMin, bMax) {
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
}

function assertInteriorDoorsTouchRooms(layout) {
  const roomById = new Map(layout.rooms.map((room) => [room.id, room]));
  for (const door of layout.interiorDoors) {
    for (const id of door.connects || []) {
      assert.ok(doorTouchesRoom(door, roomById.get(id)), `${door.connects?.join('<->')} should touch ${id}`);
    }
  }
}

function doorTouchesRoom(door, room, tolerance = 2) {
  assert.ok(room, `missing room for door ${door.connects?.join('<->')}`);
  if (door.axis === 'x') {
    return rangesOverlap(door.at.z - 1, door.at.z + 1, room.min_z, room.max_z) &&
      door.at.x >= room.min_x - tolerance &&
      door.at.x <= room.max_x + tolerance;
  }
  return rangesOverlap(door.at.x - 1, door.at.x + 1, room.min_x, room.max_x) &&
    door.at.z >= room.min_z - tolerance &&
    door.at.z <= room.max_z + tolerance;
}
