import test from 'node:test';
import assert from 'node:assert/strict';
import { keyFor } from '../src/construction/engine/csgBuilder.js';
import {
  InteriorClearanceRepairAgent,
  isBlockingHeadroomBlock,
  roomBlockingBudget
} from '../src/construction/agents/interiorClearanceRepairAgent.js';

test('InteriorClearanceRepairAgent trims over-budget ground-floor headroom blockers', () => {
  const room = {
    id: 'living',
    type: 'living',
    floor: 0,
    min_x: 0,
    max_x: 10,
    min_y: 1,
    max_y: 4,
    min_z: 0,
    max_z: 10
  };
  const grid = new Map();
  for (let x = room.min_x; x <= room.max_x; x += 1) {
    for (let z = room.min_z; z <= room.max_z; z += 1) {
      grid.set(keyFor(x, 0, z), { block: 'minecraft:quartz_block', module: 'floors' });
    }
  }

  const placements = [];
  let placed = 0;
  for (let x = 1; x <= 9 && placed < 35; x += 1) {
    for (let z = 1; z <= 9 && placed < 35; z += 1) {
      const at = { x, y: room.min_y, z };
      grid.set(keyFor(x, room.min_y, z), { block: 'minecraft:smooth_quartz_slab[type=bottom]', module: 'decor_furniture' });
      placements.push({
        room_id: room.id,
        type: room.type,
        role: `template-pattern-seat-${placed}`,
        module: 'decor_furniture',
        block: 'minecraft:smooth_quartz_slab[type=bottom]',
        at
      });
      placed += 1;
    }
  }

  const decorator = {
    placements,
    placementCount: placements.length,
    capability_profile: {}
  };
  const repair = new InteriorClearanceRepairAgent().run({
    grid,
    layout: { rooms: [room] },
    decorator
  });

  const remaining = countBlockingHeadroom(grid, room);
  assert.equal(repair.active, true);
  assert.ok(repair.removed_count > 0);
  assert.ok(remaining <= roomBlockingBudget(room));
  assert.equal(decorator.placements.length, remaining);
  assert.equal(decorator.placementCount, decorator.placements.length);
  assert.equal(decorator.capability_profile.functional_placement_count, decorator.placements.length);
});

test('headroom classifier keeps visual nonblocking blocks out of the clearance budget', () => {
  assert.equal(isBlockingHeadroomBlock('minecraft:white_carpet'), false);
  assert.equal(isBlockingHeadroomBlock('minecraft:flower_pot'), false);
  assert.equal(isBlockingHeadroomBlock('minecraft:chain'), false);
  assert.equal(isBlockingHeadroomBlock('minecraft:smooth_quartz_slab[type=bottom]'), true);
  assert.equal(isBlockingHeadroomBlock('minecraft:stone'), true);
});

function countBlockingHeadroom(grid, room) {
  let count = 0;
  for (let x = room.min_x + 1; x <= room.max_x - 1; x += 1) {
    for (let z = room.min_z + 1; z <= room.max_z - 1; z += 1) {
      const cell = grid.get(keyFor(x, room.min_y, z));
      if (cell && isBlockingHeadroomBlock(cell.block)) count += 1;
    }
  }
  return count;
}
