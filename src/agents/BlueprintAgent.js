import { includeBox, includePoint, normalizeBox, point } from '../lib/geometry.js';

export class BlueprintAgent {
  run(design) {
    const builder = new BlueprintBuilder(design);
    builder.foundation();
    builder.walls();
    builder.floors();
    builder.roof();
    builder.windows();
    builder.door();
    builder.chimney();
    builder.garden();
    return builder.toBlueprint();
  }
}

class BlueprintBuilder {
  constructor(design) {
    this.design = design;
    this.operations = [];
    this.bounds = undefined;
    this.moduleCounts = new Map();
  }

  fill(from, to, block, module) {
    const box = normalizeBox(from, to);
    this.operations.push({ kind: 'fill', from: box.from, to: box.to, block, module });
    this.bounds = includeBox(this.bounds, box.from, box.to);
    this.bump(module);
  }

  setblock(at, block, module) {
    this.operations.push({ kind: 'setblock', at, block, module });
    this.bounds = includePoint(this.bounds, at);
    this.bump(module);
  }

  bump(module) {
    this.moduleCounts.set(module, (this.moduleCounts.get(module) || 0) + 1);
  }

  foundation() {
    const { width, depth } = this.design.dimensions;
    const p = this.design.palette;
    this.fill(point(0, 0, 0), point(width - 1, 0, depth - 1), p.foundation, 'foundation');
    this.fill(point(1, 1, 1), point(width - 2, 1, depth - 2), p.floor, 'foundation');
  }

  walls() {
    const { width, depth, wallHeight } = this.design.dimensions;
    const p = this.design.palette;
    this.fill(point(0, 1, 0), point(width - 1, wallHeight, 0), p.wall, 'walls');
    this.fill(point(0, 1, depth - 1), point(width - 1, wallHeight, depth - 1), p.wall, 'walls');
    this.fill(point(0, 1, 0), point(0, wallHeight, depth - 1), p.wall, 'walls');
    this.fill(point(width - 1, 1, 0), point(width - 1, wallHeight, depth - 1), p.wall, 'walls');

    for (const x of [0, width - 1]) {
      for (const z of [0, depth - 1]) {
        this.fill(point(x, 1, z), point(x, wallHeight + 1, z), p.trim, 'walls');
      }
    }
  }

  floors() {
    const { width, depth, floorHeight } = this.design.dimensions;
    const floors = this.design.floors;
    const p = this.design.palette;
    for (let level = 1; level < floors; level += 1) {
      const y = level * floorHeight + 1;
      this.fill(point(1, y, 1), point(width - 2, y, depth - 2), p.floor, 'floors');
    }
  }

  roof() {
    const { width, depth, wallHeight, roofHeight } = this.design.dimensions;
    const p = this.design.palette;
    for (let layer = 0; layer < roofHeight; layer += 1) {
      const x1 = Math.max(-1, layer - 1);
      const x2 = Math.min(width, width - layer);
      const y = wallHeight + 1 + layer;
      this.fill(point(x1, y, -1), point(x2, y, depth), p.roof, 'roof');
    }
    const ridgeX = Math.floor(width / 2);
    this.fill(point(ridgeX, wallHeight + roofHeight + 1, -1), point(ridgeX, wallHeight + roofHeight + 1, depth), p.trim, 'roof');
  }

  windows() {
    const { width, depth, floorHeight, wallHeight } = this.design.dimensions;
    const floors = this.design.floors;
    const p = this.design.palette;
    const positions = windowPositions(width);

    for (let level = 0; level < floors; level += 1) {
      const baseY = level * floorHeight + 2;
      for (const x of positions) {
        this.fill(point(x, baseY, 0), point(x + 1, baseY + 1, 0), p.glass, 'windows');
        this.fill(point(x, baseY, depth - 1), point(x + 1, baseY + 1, depth - 1), p.glass, 'windows');
      }
      for (const z of [5, depth - 6]) {
        this.fill(point(0, baseY, z), point(0, baseY + 1, z + 1), p.glass, 'windows');
        this.fill(point(width - 1, baseY, z), point(width - 1, baseY + 1, z + 1), p.glass, 'windows');
      }
    }

    const center = Math.floor(width / 2);
    this.fill(point(center - 1, wallHeight + 3, depth), point(center + 1, wallHeight + 4, depth), p.glass, 'windows');
  }

  door() {
    const { width, depth } = this.design.dimensions;
    const p = this.design.palette;
    const center = Math.floor(width / 2);
    this.fill(point(center - 1, 1, depth - 1), point(center + 1, 3, depth - 1), 'minecraft:air', 'door');
    this.setblock(point(center, 1, depth - 1), p.doorLower, 'door');
    this.setblock(point(center, 2, depth - 1), p.doorUpper, 'door');
    this.setblock(point(center - 1, 2, depth), p.lamp, 'door');
    this.setblock(point(center + 1, 2, depth), p.lamp, 'door');
  }

  chimney() {
    const { width, wallHeight, roofHeight } = this.design.dimensions;
    const p = this.design.palette;
    const x = width - 5;
    const z = 4;
    this.fill(point(x, wallHeight + 1, z), point(x + 1, wallHeight + roofHeight + 3, z + 1), p.chimney, 'chimney');
    this.setblock(point(x, wallHeight + roofHeight + 4, z), 'minecraft:campfire[lit=true]', 'chimney');
  }

  garden() {
    const { width, depth, gardenDepth } = this.design.dimensions;
    const p = this.design.palette;
    const center = Math.floor(width / 2);
    this.fill(point(center - 1, 0, depth), point(center + 1, 0, depth + gardenDepth), p.path, 'garden');
    this.fill(point(-3, 0, depth + 1), point(-3, 1, depth + gardenDepth), p.hedge, 'garden');
    this.fill(point(width + 2, 0, depth + 1), point(width + 2, 1, depth + gardenDepth), p.hedge, 'garden');
    this.fill(point(-3, 0, depth + gardenDepth), point(width + 2, 1, depth + gardenDepth), p.hedge, 'garden');

    for (let z = depth + 2; z < depth + gardenDepth; z += 2) {
      this.setblock(point(3, 1, z), z % 4 === 0 ? p.flowerRed : p.flowerBlue, 'garden');
      this.setblock(point(width - 4, 1, z), z % 4 === 0 ? p.flowerBlue : p.flowerRed, 'garden');
    }
  }

  toBlueprint() {
    return {
      version: 1,
      target: {
        minecraft: 'Java 1.21',
        datapackFormat: 48
      },
      origin: {
        type: 'relative-player-position',
        note: 'Run /function architect:build while standing near the northwest corner of the desired build area.'
      },
      bounds: this.bounds,
      modules: Object.fromEntries(this.moduleCounts.entries()),
      design: {
        id: this.design.id,
        style: this.design.style,
        scale: this.design.scale,
        floors: this.design.floors,
        dimensions: this.design.dimensions,
        palette: this.design.palette
      },
      operations: this.operations
    };
  }
}

function windowPositions(width) {
  const positions = [];
  for (let x = 4; x <= width - 6; x += 6) {
    positions.push(x);
  }
  return positions;
}
