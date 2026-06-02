import { clamp, doorState, point, windowPositions } from './BlueprintWorkspace.js';

export class ShellAgent {
  run(workspace) {
    this.workspace = workspace;
    this.foundation();
    this.walls();
    this.floors();
    this.roof();
    this.windows();
    this.door();
    this.balcony();
    this.chimney();
    return {
      exteriorBounds: this.exteriorBounds(),
      interiorSpaces: this.interiorSpaces(),
      openings: {
        mainDoor: workspace.doorOpening(),
        window: workspace.elements.window || {}
      },
      roof: workspace.elements.roof || {}
    };
  }

  exteriorBounds() {
    const { width, depth, wallHeight, roofHeight } = this.workspace.design.dimensions;
    return { minX: 0, minY: 0, minZ: 0, maxX: width - 1, maxY: wallHeight + roofHeight + 4, maxZ: depth - 1 };
  }

  interiorSpaces() {
    const { floorHeight, wallHeight } = this.workspace.design.dimensions;
    const inner = this.workspace.innerBounds();
    return Array.from({ length: this.workspace.design.floors }, (_, level) => ({
      level,
      minX: inner.minX,
      maxX: inner.maxX,
      minY: level * floorHeight + 2,
      maxY: Math.min(level * floorHeight + floorHeight, wallHeight),
      minZ: inner.minZ,
      maxZ: inner.maxZ
    }));
  }

  foundation() {
    const { width, depth } = this.workspace.design.dimensions;
    const p = this.workspace.design.palette;
    this.workspace.fill(point(0, 0, 0), point(width - 1, 0, depth - 1), p.foundation, 'foundation');
  }

  walls() {
    const { width, depth, wallHeight, floorHeight } = this.workspace.design.dimensions;
    const floors = this.workspace.design.floors;
    const t = this.workspace.wallThickness();
    const p = this.workspace.design.palette;

    this.workspace.fill(point(0, 1, 0), point(width - 1, wallHeight, t - 1), p.wall, 'walls');
    this.workspace.fill(point(0, 1, depth - t), point(width - 1, wallHeight, depth - 1), p.wall, 'walls');
    this.workspace.fill(point(0, 1, 0), point(t - 1, wallHeight, depth - 1), p.wall, 'walls');
    this.workspace.fill(point(width - t, 1, 0), point(width - 1, wallHeight, depth - 1), p.wall, 'walls');

    for (const x of [0, width - 1]) {
      for (const z of [0, depth - 1]) {
        this.workspace.fill(point(x, 1, z), point(x, wallHeight + 1, z), p.trim, 'walls');
      }
    }

    for (let level = 1; level <= floors; level += 1) {
      const y = Math.min(level * floorHeight + 1, wallHeight);
      this.workspace.fill(point(0, y, 0), point(width - 1, y, 0), p.trim, 'walls');
      this.workspace.fill(point(0, y, depth - 1), point(width - 1, y, depth - 1), p.trim, 'walls');
      this.workspace.fill(point(0, y, 0), point(0, y, depth - 1), p.trim, 'walls');
      this.workspace.fill(point(width - 1, y, 0), point(width - 1, y, depth - 1), p.trim, 'walls');
    }
  }

  floors() {
    const { width, depth, floorHeight } = this.workspace.design.dimensions;
    const t = this.workspace.wallThickness();
    const p = this.workspace.design.palette;

    for (let level = 0; level < this.workspace.design.floors; level += 1) {
      const y = level * floorHeight + 1;
      this.workspace.fill(point(t, y, t), point(width - 1 - t, y, depth - 1 - t), p.floor, 'floors');
    }
  }

  roof() {
    const style = this.workspace.elements.roof?.style || 'gabled';
    if (style === 'flat') {
      this.flatRoof();
    } else if (style === 'hipped') {
      this.hippedRoof(false);
    } else if (style === 'pagoda') {
      this.hippedRoof(true);
    } else {
      this.gabledRoof();
    }
  }

  gabledRoof() {
    const { width, depth, wallHeight, roofHeight } = this.workspace.design.dimensions;
    const overhang = this.workspace.elements.roof?.overhang ?? 1;
    const p = this.workspace.design.palette;

    for (let layer = 0; layer < roofHeight; layer += 1) {
      const x1 = -overhang + layer;
      const x2 = width - 1 + overhang - layer;
      if (x1 > x2) break;
      const y = wallHeight + 1 + layer;
      this.workspace.fill(point(x1, y, -overhang), point(x2, y, depth - 1 + overhang), p.roof, 'roof');
    }
    const ridgeX = Math.floor(width / 2);
    this.workspace.fill(
      point(ridgeX, wallHeight + roofHeight + 1, -overhang),
      point(ridgeX, wallHeight + roofHeight + 1, depth - 1 + overhang),
      p.trim,
      'roof'
    );
  }

  hippedRoof(hasPagodaCorners) {
    const { width, depth, wallHeight, roofHeight } = this.workspace.design.dimensions;
    const overhang = this.workspace.elements.roof?.overhang ?? 1;
    const p = this.workspace.design.palette;

    for (let layer = 0; layer < roofHeight; layer += 1) {
      const x1 = -overhang + layer;
      const x2 = width - 1 + overhang - layer;
      const z1 = -overhang + layer;
      const z2 = depth - 1 + overhang - layer;
      if (x1 > x2 || z1 > z2) break;
      this.workspace.fill(point(x1, wallHeight + 1 + layer, z1), point(x2, wallHeight + 1 + layer, z2), p.roof, 'roof');
    }

    const eaveY = wallHeight + 1;
    this.workspace.fill(point(-overhang, eaveY, -overhang), point(width - 1 + overhang, eaveY, -overhang), p.trim, 'roof_detail');
    this.workspace.fill(point(-overhang, eaveY, depth - 1 + overhang), point(width - 1 + overhang, eaveY, depth - 1 + overhang), p.trim, 'roof_detail');
    this.workspace.fill(point(-overhang, eaveY, -overhang), point(-overhang, eaveY, depth - 1 + overhang), p.trim, 'roof_detail');
    this.workspace.fill(point(width - 1 + overhang, eaveY, -overhang), point(width - 1 + overhang, eaveY, depth - 1 + overhang), p.trim, 'roof_detail');

    if (hasPagodaCorners) {
      const corners = [
        point(-overhang, eaveY + 1, -overhang),
        point(width - 1 + overhang, eaveY + 1, -overhang),
        point(-overhang, eaveY + 1, depth - 1 + overhang),
        point(width - 1 + overhang, eaveY + 1, depth - 1 + overhang)
      ];
      for (const corner of corners) {
        this.workspace.setblock(corner, p.roofAccent || p.trim, 'roof_detail');
      }
    }
  }

  flatRoof() {
    const { width, depth, wallHeight } = this.workspace.design.dimensions;
    const p = this.workspace.design.palette;
    const y = wallHeight + 1;

    this.workspace.fill(point(0, y, 0), point(width - 1, y, depth - 1), p.roof, 'roof');
    this.workspace.fill(point(0, y + 1, 0), point(width - 1, y + 1, 0), p.trim, 'roof');
    this.workspace.fill(point(0, y + 1, depth - 1), point(width - 1, y + 1, depth - 1), p.trim, 'roof');
    this.workspace.fill(point(0, y + 1, 0), point(0, y + 1, depth - 1), p.trim, 'roof');
    this.workspace.fill(point(width - 1, y + 1, 0), point(width - 1, y + 1, depth - 1), p.trim, 'roof');
    this.workspace.setblock(point(2, y + 2, 2), p.lamp, 'lighting');
    this.workspace.setblock(point(width - 3, y + 2, depth - 3), p.lamp, 'lighting');
  }

  windows() {
    const { width, depth, floorHeight, wallHeight } = this.workspace.design.dimensions;
    const t = this.workspace.wallThickness();
    const spec = this.workspace.elements.window || {};
    const windowWidth = clamp(spec.width || 2, 1, 6);
    const windowHeight = clamp(spec.height || 2, 1, Math.max(2, floorHeight - 2));
    const spacing = clamp(spec.spacing || 6, 3, 10);
    const p = this.workspace.design.palette;
    const xPositions = windowPositions(width, t, windowWidth, spacing);
    const zPositions = windowPositions(depth, t, windowWidth, spacing);
    const doorOpening = this.workspace.doorOpening();

    for (let level = 0; level < this.workspace.design.floors; level += 1) {
      const baseY = level * floorHeight + 2;
      for (const x of xPositions) {
        if (!this.workspace.overlapsDoor('north', x, x + windowWidth - 1, level, doorOpening)) {
          this.placeWindowOnZ(0, x, baseY, windowWidth, windowHeight, p);
        }
        if (!this.workspace.overlapsDoor('south', x, x + windowWidth - 1, level, doorOpening)) {
          this.placeWindowOnZ(depth - 1, x, baseY, windowWidth, windowHeight, p);
        }
      }
      for (const z of zPositions) {
        if (!this.workspace.overlapsDoor('west', z, z + windowWidth - 1, level, doorOpening)) {
          this.placeWindowOnX(0, z, baseY, windowWidth, windowHeight, p);
        }
        if (!this.workspace.overlapsDoor('east', z, z + windowWidth - 1, level, doorOpening)) {
          this.placeWindowOnX(width - 1, z, baseY, windowWidth, windowHeight, p);
        }
      }
    }

    if ((this.workspace.elements.roof?.style || 'gabled') !== 'flat') {
      const center = Math.floor(width / 2);
      this.workspace.fill(point(center - 1, wallHeight + 2, depth), point(center + 1, wallHeight + 3, depth), p.glass, 'windows');
      this.workspace.fill(point(center - 2, wallHeight + 1, depth), point(center + 2, wallHeight + 1, depth), p.trim, 'windows');
    }
  }

  placeWindowOnZ(z, x, baseY, width, height, palette) {
    this.workspace.fill(point(x, baseY, z), point(x + width - 1, baseY + height - 1, z), palette.glass, 'windows');
    this.workspace.fill(point(x - 1, baseY - 1, z), point(x + width, baseY - 1, z), palette.trim, 'windows');
    this.workspace.fill(point(x - 1, baseY + height, z), point(x + width, baseY + height, z), palette.trim, 'windows');
  }

  placeWindowOnX(x, z, baseY, width, height, palette) {
    this.workspace.fill(point(x, baseY, z), point(x, baseY + height - 1, z + width - 1), palette.glass, 'windows');
    this.workspace.fill(point(x, baseY - 1, z - 1), point(x, baseY - 1, z + width), palette.trim, 'windows');
    this.workspace.fill(point(x, baseY + height, z - 1), point(x, baseY + height, z + width), palette.trim, 'windows');
  }

  door() {
    const { width, depth } = this.workspace.design.dimensions;
    const p = this.workspace.design.palette;
    const side = this.workspace.elements.door?.side || 'south';
    const doorWidth = clamp(this.workspace.elements.door?.width || 1, 1, 3);
    const doorHeight = clamp(this.workspace.elements.door?.height || 2, 2, 4);
    const opening = this.workspace.doorOpening();
    const center = Math.floor((opening.start + opening.end) / 2);
    const doorStart = center - Math.floor(doorWidth / 2);
    const positions = Array.from({ length: doorWidth }, (_, index) => doorStart + index);

    if (side === 'south' || side === 'north') {
      const z = side === 'south' ? depth - 1 : 0;
      const outsideZ = side === 'south' ? depth : -1;
      this.workspace.fill(point(opening.start, 1, z), point(opening.end, doorHeight + 1, z), 'minecraft:air', 'door');
      this.workspace.fill(point(opening.start, doorHeight + 1, z), point(opening.end, doorHeight + 1, z), p.trim, 'door');
      positions.forEach((x, index) => this.placeDoorBlock(point(x, 1, z), side, index, positions.length, p));
      this.workspace.fill(point(opening.start, 0, outsideZ), point(opening.end, 0, outsideZ), p.path, 'door');
      this.workspace.setblock(point(opening.start, 2, outsideZ), p.lamp, 'door');
      this.workspace.setblock(point(opening.end, 2, outsideZ), p.lamp, 'door');
      return;
    }

    const x = side === 'east' ? width - 1 : 0;
    const outsideX = side === 'east' ? width : -1;
    this.workspace.fill(point(x, 1, opening.start), point(x, doorHeight + 1, opening.end), 'minecraft:air', 'door');
    this.workspace.fill(point(x, doorHeight + 1, opening.start), point(x, doorHeight + 1, opening.end), p.trim, 'door');
    positions.forEach((z, index) => this.placeDoorBlock(point(x, 1, z), side, index, positions.length, p));
    this.workspace.fill(point(outsideX, 0, opening.start), point(outsideX, 0, opening.end), p.path, 'door');
    this.workspace.setblock(point(outsideX, 2, opening.start), p.lamp, 'door');
    this.workspace.setblock(point(outsideX, 2, opening.end), p.lamp, 'door');
  }

  placeDoorBlock(basePoint, facing, index, count, palette) {
    const hinge = count > 1 && index === count - 1 ? 'right' : 'left';
    this.workspace.setblock(basePoint, doorState(palette.doorBase, facing, 'lower', hinge), 'door');
    this.workspace.setblock(point(basePoint.x, basePoint.y + 1, basePoint.z), doorState(palette.doorBase, facing, 'upper', hinge), 'door');
  }

  balcony() {
    if (!this.workspace.elements.balcony?.enabled || this.workspace.design.floors < 2) return;

    const { width, depth, floorHeight } = this.workspace.design.dimensions;
    const p = this.workspace.design.palette;
    const center = Math.floor(width / 2);
    const y = floorHeight + 1;
    const fence = 'minecraft:dark_oak_fence';

    this.workspace.fill(point(center - 3, y, depth), point(center + 3, y, depth + 3), p.floor, 'balcony');
    this.workspace.fill(point(center - 3, y + 1, depth + 3), point(center + 3, y + 1, depth + 3), fence, 'balcony');
    this.workspace.fill(point(center - 3, y + 1, depth), point(center - 3, y + 1, depth + 3), fence, 'balcony');
    this.workspace.fill(point(center + 3, y + 1, depth), point(center + 3, y + 1, depth + 3), fence, 'balcony');
    this.workspace.fill(point(center - 1, y + 1, depth - 1), point(center + 1, y + 3, depth - 1), 'minecraft:air', 'balcony');
    this.workspace.setblock(point(center, y + 1, depth - 1), doorState(p.doorBase, 'south', 'lower', 'left'), 'balcony');
    this.workspace.setblock(point(center, y + 2, depth - 1), doorState(p.doorBase, 'south', 'upper', 'left'), 'balcony');
  }

  chimney() {
    if (!this.workspace.elements.chimney?.enabled) return;

    const { width, wallHeight, roofHeight } = this.workspace.design.dimensions;
    const p = this.workspace.design.palette;
    const x = Math.max(2, width - 5);
    const z = 4;
    this.workspace.fill(point(x, wallHeight + 1, z), point(x + 1, wallHeight + roofHeight + 3, z + 1), p.chimney, 'chimney');
    this.workspace.setblock(point(x, wallHeight + roofHeight + 4, z), 'minecraft:campfire[lit=true]', 'chimney');
  }
}
