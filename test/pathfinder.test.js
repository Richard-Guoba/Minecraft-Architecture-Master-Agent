import test from 'node:test';
import assert from 'node:assert/strict';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { AStarPathfinder } from '../src/construction/engine/pathfinder.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('AStarPathfinder aligns main door, open-plan routes, attached volumes, and stair core for modern houses', () => {
  const { layout, paths } = buildCirculation('建一个现代两层房子，宽31深17，大玻璃窗，阳光房，车库，开放厨房，平屋顶，门在东侧');
  const stairRoom = layout.rooms.find((room) => room.id === 'stairs');

  assert.equal(paths.mainDoor.side, 'east');
  assert.equal(paths.mainDoor.targetRoom, 'entry');
  assert.equal(paths.pathfinder.stairCoreRoom, 'stairs');
  assert.equal(paths.pathfinder.failedEdgeCount, 0);
  assert.ok(paths.pathfinder.attachedDoorCount >= 2);
  assert.ok(paths.pathfinder.openedDoorCount >= paths.pathfinder.attachedDoorCount + 1);
  assert.ok(paths.stairs.length > 0);
  assert.ok(paths.stairs.every((step) => step.sourceRoom === 'stairs'));
  assert.ok(paths.stairs.every((step) => pointInRoom(stairRoom, step.x, step.z)));
  assert.ok(paths.openedEdges.some((edge) => edge.from === 'living' && edge.to === 'sunroom' && edge.status === 'routed' && edge.pathLength > 0));
  assert.ok(paths.openedEdges.some((edge) => [edge.from, edge.to].includes('garage') && edge.status === 'routed'));
});

test('AStarPathfinder respects fortified wall thickness and places castle stairs in the tower stair core', () => {
  const { spec, layout, paths } = buildCirculation('建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗');
  const stairRoom = layout.rooms.find((room) => room.id === 'tower-stair');

  assert.equal(paths.mainDoor.targetRoom, 'entry');
  assert.equal(paths.mainDoor.throughThickness, 2);
  assert.equal(paths.pathfinder.stairCoreRoom, 'tower-stair');
  assert.equal(paths.pathfinder.failedEdgeCount, 0);
  assert.equal(paths.floorOpenings.length, spec.floors - 1);
  assert.ok(paths.stairs.every((step) => step.sourceRoom === 'tower-stair'));
  assert.ok(paths.stairs.every((step) => pointInRoom(stairRoom, step.x, step.z)));
  assert.ok(paths.openedEdges.some((edge) => edge.status === 'vertical-edge' && edge.relation === 'vertical-flow'));
  assert.ok(paths.openedEdges.some((edge) => edge.to === 'tower-room' && edge.status === 'routed'));
});

test('AStarPathfinder keeps one-floor courtyard houses stair-free while still routing interior topology', () => {
  const { paths } = buildCirculation('建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九');

  assert.equal(paths.mainDoor.targetRoom, 'entry');
  assert.equal(paths.pathfinder.stairCount, 0);
  assert.equal(paths.floorOpenings.length, 0);
  assert.equal(paths.pathfinder.failedEdgeCount, 0);
  assert.ok(paths.openedEdges.some((edge) => edge.from === 'tatami' && edge.to === 'tea-room' && edge.status === 'routed'));
});

function buildCirculation(prompt) {
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, spec);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(spec, architecture.materials).fitRooms(shell, topology);
  const paths = new AStarPathfinder(spec, architecture.materials).connect(shell, layout, topology);
  return { architecture, spec, topology, shell, layout, paths };
}

function pointInRoom(room, x, z) {
  return x >= room.min_x && x <= room.max_x && z >= room.min_z && z <= room.max_z;
}
