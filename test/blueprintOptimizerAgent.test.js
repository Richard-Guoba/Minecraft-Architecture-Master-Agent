import test from 'node:test';
import assert from 'node:assert/strict';
import { BlueprintOptimizerAgent } from '../src/construction/agents/blueprintOptimizerAgent.js';
import { keyFor } from '../src/construction/engine/csgBuilder.js';

test('BlueprintOptimizerAgent compresses a solid cuboid into one fill operation', () => {
  const grid = new Map();
  fill(grid, 0, 0, 0, 3, 2, 1, 'minecraft:stone_bricks', 'walls');
  const result = new BlueprintOptimizerAgent().run(grid);

  assert.equal(result.optimizer.inputCellCount, 24);
  assert.equal(result.optimizer.naiveOperationCount, 6);
  assert.equal(result.operations.length, 1);
  assert.equal(result.optimizer.operationCount, 1);
  assert.equal(result.optimizer.coverageOk, true);
  assert.equal(result.operations[0].block, 'minecraft:stone_bricks');
  assert.deepEqual(result.operations[0].from, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.operations[0].to, { x: 3, y: 2, z: 1 });
});

test('BlueprintOptimizerAgent preserves exact block coverage when materials differ', () => {
  const grid = new Map();
  fill(grid, 0, 0, 0, 2, 1, 1, 'minecraft:stone_bricks', 'walls');
  fill(grid, 1, 0, 0, 1, 1, 1, 'minecraft:glass', 'windows');
  const result = new BlueprintOptimizerAgent().run(grid);
  const materialized = materialize(result.operations);

  assert.equal(result.optimizer.coverageOk, true);
  assert.equal(materialized.size, grid.size);
  for (const [key, cell] of grid.entries()) assert.equal(materialized.get(key), cell.block);
});

test('BlueprintOptimizerAgent splits fills that would exceed Minecraft volume limits', () => {
  const grid = new Map();
  fill(grid, 0, 0, 0, 32, 30, 32, 'minecraft:smooth_sandstone', 'walls');
  const result = new BlueprintOptimizerAgent().run(grid);

  assert.equal(result.optimizer.inputCellCount, 33759);
  assert.equal(result.optimizer.coverageOk, true);
  assert.ok(result.optimizer.oversizedSplitCount > 0);
  assert.ok(result.operations.length > 1);
  assert.ok(result.operations.every((operation) => volume(operation) <= 32768));
});

test('BlueprintOptimizerAgent summarizes module groups and execution hints for expanded agents', () => {
  const grid = new Map();
  fill(grid, 0, 0, 0, 2, 0, 2, 'minecraft:white_concrete', 'walls');
  fill(grid, 0, 1, 0, 2, 1, 0, 'minecraft:daylight_detector', 'solar_panel');
  fill(grid, 3, 0, 0, 3, 2, 0, 'minecraft:chain', 'rain_chain');
  fill(grid, 0, 0, 4, 4, 0, 6, 'minecraft:water', 'pool_water');
  fill(grid, 5, 1, 0, 5, 3, 0, 'minecraft:iron_bars', 'wind_tie');
  const result = new BlueprintOptimizerAgent().run(grid);

  assert.equal(result.optimizer.coverageOk, true);
  assert.ok(result.optimizer.moduleGroups.shell > 0);
  assert.ok(result.optimizer.moduleGroups.structure > 0);
  assert.ok(result.optimizer.moduleGroups.site > 0);
  assert.ok(result.optimizer.commandComplexity.smallModules.includes('solar_panel'));
  assert.ok(result.optimizer.executionHints.includes('water modules present; run in creative or allow source updates'));
  assert.ok(result.optimizer.executionHints.includes('roof utility modules included'));
});

function fill(grid, minX, minY, minZ, maxX, maxY, maxZ, block, module) {
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) grid.set(keyFor(x, y, z), { block, module });
    }
  }
}

function materialize(operations) {
  const grid = new Map();
  for (const operation of operations) {
    for (let x = operation.from.x; x <= operation.to.x; x += 1) {
      for (let y = operation.from.y; y <= operation.to.y; y += 1) {
        for (let z = operation.from.z; z <= operation.to.z; z += 1) grid.set(keyFor(x, y, z), operation.block);
      }
    }
  }
  return grid;
}

function volume(operation) {
  return (
    operation.to.x - operation.from.x + 1
  ) * (
    operation.to.y - operation.from.y + 1
  ) * (
    operation.to.z - operation.from.z + 1
  );
}
