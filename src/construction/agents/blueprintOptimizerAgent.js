import { keyFor, parseKey } from '../engine/csgBuilder.js';

const MAX_FILL_VOLUME = 32768;

export class BlueprintOptimizerAgent {
  run(grid, options = {}) {
    const maxFillVolume = Number(options.maxFillVolume || MAX_FILL_VOLUME);
    const naiveOperationCount = countNaiveRowOperations(grid);
    const cuboids = greedyCuboidsByBlock(grid);
    const split = splitOversizedCuboids(cuboids, maxFillVolume);
    const operations = split.operations
      .map(cuboidToOperation)
      .sort(compareOperations);
    const inputCellCount = grid.size;
    const fillVolumeTotal = operations.reduce((sum, operation) => sum + operationVolume(operation), 0);
    const blockCounts = countBy(grid, (cell) => cell.block);
    const moduleCounts = countBy(grid, (cell) => cell.module || 'unknown');

    return {
      operations,
      optimizer: {
        source: 'local-blueprint-optimizer',
        strategy: 'block-grouped-greedy-cuboid-packing',
        inputCellCount,
        blockTypeCount: Object.keys(blockCounts).length,
        moduleTypeCount: Object.keys(moduleCounts).length,
        naiveOperationCount,
        cuboidCount: cuboids.length,
        operationCount: operations.length,
        savedOperations: Math.max(0, naiveOperationCount - operations.length),
        compressionRatio: ratio(naiveOperationCount, operations.length),
        fillVolumeTotal,
        coverageOk: fillVolumeTotal === inputCellCount,
        maxFillVolume,
        oversizedSplitCount: split.oversizedSplitCount,
        largestOperationVolume: operations.reduce((max, operation) => Math.max(max, operationVolume(operation)), 0),
        topBlocks: topCounts(blockCounts, 12),
        topModules: topCounts(moduleCounts, 16)
      }
    };
  }
}

export function countNaiveRowOperations(grid) {
  const rows = new Map();
  for (const [pointKey, cell] of grid.entries()) {
    const point = parseKey(pointKey);
    const rowKey = `${point.y}|${point.z}|${cell.block}`;
    if (!rows.has(rowKey)) rows.set(rowKey, []);
    rows.get(rowKey).push(point.x);
  }

  let count = 0;
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    let previous = undefined;
    for (const x of xs) {
      if (previous === undefined || x !== previous + 1) count += 1;
      previous = x;
    }
  }
  return count;
}

function greedyCuboidsByBlock(grid) {
  const keysByBlock = new Map();
  for (const [pointKey, cell] of grid.entries()) {
    if (!keysByBlock.has(cell.block)) keysByBlock.set(cell.block, []);
    keysByBlock.get(cell.block).push(pointKey);
  }

  const cuboids = [];
  for (const [block, keys] of [...keysByBlock.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    keys.sort(comparePointKeys);
    const remaining = new Set(keys);
    let cursor = 0;
    while (remaining.size) {
      while (cursor < keys.length && !remaining.has(keys[cursor])) cursor += 1;
      const originKey = keys[cursor];
      const origin = parseKey(originKey);
      const cuboid = growCuboid(origin, remaining, block);
      removeCuboid(remaining, cuboid);
      cuboids.push(cuboid);
    }
  }
  return cuboids.sort(compareCuboids);
}

function growCuboid(origin, remaining, block) {
  const x1 = origin.x;
  const y1 = origin.y;
  const z1 = origin.z;
  let x2 = x1;
  let z2 = z1;
  let y2 = y1;

  while (remaining.has(keyFor(x2 + 1, y1, z1))) x2 += 1;
  while (canExtendZ(remaining, x1, x2, y1, z2 + 1)) z2 += 1;
  while (canExtendY(remaining, x1, x2, z1, z2, y2 + 1)) y2 += 1;

  return {
    block,
    from: { x: x1, y: y1, z: z1 },
    to: { x: x2, y: y2, z: z2 }
  };
}

function canExtendZ(remaining, x1, x2, y, z) {
  for (let x = x1; x <= x2; x += 1) {
    if (!remaining.has(keyFor(x, y, z))) return false;
  }
  return true;
}

function canExtendY(remaining, x1, x2, z1, z2, y) {
  for (let z = z1; z <= z2; z += 1) {
    for (let x = x1; x <= x2; x += 1) {
      if (!remaining.has(keyFor(x, y, z))) return false;
    }
  }
  return true;
}

function removeCuboid(remaining, cuboid) {
  for (let y = cuboid.from.y; y <= cuboid.to.y; y += 1) {
    for (let z = cuboid.from.z; z <= cuboid.to.z; z += 1) {
      for (let x = cuboid.from.x; x <= cuboid.to.x; x += 1) {
        remaining.delete(keyFor(x, y, z));
      }
    }
  }
}

function splitOversizedCuboids(cuboids, maxFillVolume) {
  const operations = [];
  let oversizedSplitCount = 0;
  const stack = [...cuboids];
  while (stack.length) {
    const cuboid = stack.pop();
    if (cuboidVolume(cuboid) <= maxFillVolume) {
      operations.push(cuboid);
      continue;
    }
    oversizedSplitCount += 1;
    const [left, right] = splitCuboid(cuboid);
    stack.push(right, left);
  }
  return { operations, oversizedSplitCount };
}

function splitCuboid(cuboid) {
  const size = {
    x: cuboid.to.x - cuboid.from.x + 1,
    y: cuboid.to.y - cuboid.from.y + 1,
    z: cuboid.to.z - cuboid.from.z + 1
  };
  const axis = Object.entries(size).sort((a, b) => b[1] - a[1])[0][0];
  const midpoint = Math.floor((cuboid.from[axis] + cuboid.to[axis]) / 2);
  const left = cloneCuboid(cuboid);
  const right = cloneCuboid(cuboid);
  left.to[axis] = midpoint;
  right.from[axis] = midpoint + 1;
  return [left, right];
}

function cloneCuboid(cuboid) {
  return {
    block: cuboid.block,
    from: { ...cuboid.from },
    to: { ...cuboid.to }
  };
}

function cuboidToOperation(cuboid) {
  return {
    kind: 'fill',
    from: cuboid.from,
    to: cuboid.to,
    block: cuboid.block
  };
}

function cuboidVolume(cuboid) {
  return (
    Math.abs(cuboid.to.x - cuboid.from.x) + 1
  ) * (
    Math.abs(cuboid.to.y - cuboid.from.y) + 1
  ) * (
    Math.abs(cuboid.to.z - cuboid.from.z) + 1
  );
}

function operationVolume(operation) {
  return cuboidVolume(operation);
}

function countBy(grid, select) {
  const counts = {};
  for (const cell of grid.values()) {
    const key = String(select(cell));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function topCounts(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function ratio(before, after) {
  if (!after) return before ? Infinity : 1;
  return Math.round((before / after) * 100) / 100;
}

function comparePointKeys(a, b) {
  const pa = parseKey(a);
  const pb = parseKey(b);
  return pa.y - pb.y || pa.z - pb.z || pa.x - pb.x;
}

function compareCuboids(a, b) {
  return a.from.y - b.from.y ||
    a.from.z - b.from.z ||
    a.from.x - b.from.x ||
    a.block.localeCompare(b.block);
}

function compareOperations(a, b) {
  return a.from.y - b.from.y ||
    a.from.z - b.from.z ||
    a.from.x - b.from.x ||
    a.block.localeCompare(b.block);
}
