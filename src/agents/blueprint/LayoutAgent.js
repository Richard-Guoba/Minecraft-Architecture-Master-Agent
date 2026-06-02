import { clamp, point } from './BlueprintWorkspace.js';

export class LayoutAgent {
  run(workspace, shell) {
    const spec = workspace.elements.interior || {};
    if (spec.enabled === false) {
      return { rooms: [], stairs: [], interiorDoors: [], floorOpenings: [] };
    }

    const rooms = [];
    const interiorDoors = [];
    const floorOpenings = [];
    const { width, depth, floorHeight, wallHeight } = workspace.design.dimensions;
    const p = workspace.design.palette;
    const centerX = Math.floor(width / 2);
    const centerZ = Math.floor(depth / 2);
    const roomCount = clamp(spec.rooms || 2, 1, 8);

    for (const space of shell.interiorSpaces) {
      const y1 = space.minY;
      const y2 = Math.min(space.maxY - 1, wallHeight - 1);
      const baseRooms = splitSpace(space, roomCount);
      rooms.push(...baseRooms);

      if (width >= 13 && roomCount >= 2) {
        workspace.fill(point(centerX, y1, space.minZ + 2), point(centerX, y2, space.maxZ - 2), p.interiorWall, 'interior');
        workspace.fill(point(centerX, y1, centerZ - 1), point(centerX, y1 + 1, centerZ + 1), 'minecraft:air', 'interior');
        interiorDoors.push({ level: space.level, axis: 'x', at: { x: centerX, z: centerZ }, connects: ['living', 'bedroom'] });
      }
      if (depth >= 13 && roomCount >= 4) {
        workspace.fill(point(space.minX + 2, y1, centerZ), point(space.maxX - 2, y2, centerZ), p.interiorWall, 'interior');
        workspace.fill(point(centerX - 1, y1, centerZ), point(centerX + 1, y1 + 1, centerZ), 'minecraft:air', 'interior');
        interiorDoors.push({ level: space.level, axis: 'z', at: { x: centerX, z: centerZ }, connects: ['living', 'utility'] });
      }
    }

    const stairs = spec.stairs !== false && workspace.design.floors > 1
      ? this.stairs(workspace, floorOpenings)
      : [];

    return { rooms, stairs, interiorDoors, floorOpenings };
  }

  stairs(workspace, floorOpenings) {
    const { floorHeight } = workspace.design.dimensions;
    const p = workspace.design.palette;
    const inner = workspace.innerBounds();
    const startX = inner.minX + 2;
    const startZ = inner.minZ + 3;
    const stairs = [];

    for (let level = 0; level < workspace.design.floors - 1; level += 1) {
      const upperFloorY = (level + 1) * floorHeight + 1;
      const opening = {
        level: level + 1,
        minX: startX,
        maxX: startX + 3,
        y: upperFloorY,
        minZ: startZ,
        maxZ: startZ + floorHeight
      };
      floorOpenings.push(opening);
      workspace.fill(point(opening.minX, opening.y, opening.minZ), point(opening.maxX, opening.y, opening.maxZ), 'minecraft:air', 'stairs');

      for (let step = 0; step < floorHeight; step += 1) {
        const y = level * floorHeight + 2 + step;
        const x = startX + Math.min(2, Math.floor(step / 2));
        const z = startZ + step;
        workspace.setblock(point(x, y, z), p.stairs, 'stairs');
        stairs.push({ level, step, at: { x, y, z } });
      }
    }
    return stairs;
  }
}

function splitSpace(space, roomCount) {
  const centerX = Math.floor((space.minX + space.maxX) / 2);
  const centerZ = Math.floor((space.minZ + space.maxZ) / 2);
  if (roomCount >= 4) {
    return [
      room(space, 'living', space.minX, centerX - 1, space.minZ, centerZ - 1),
      room(space, 'bedroom', centerX + 1, space.maxX, space.minZ, centerZ - 1),
      room(space, 'kitchen', space.minX, centerX - 1, centerZ + 1, space.maxZ),
      room(space, 'utility', centerX + 1, space.maxX, centerZ + 1, space.maxZ)
    ];
  }
  if (roomCount >= 2) {
    return [
      room(space, 'living', space.minX, centerX - 1, space.minZ, space.maxZ),
      room(space, 'bedroom', centerX + 1, space.maxX, space.minZ, space.maxZ)
    ];
  }
  return [room(space, 'living', space.minX, space.maxX, space.minZ, space.maxZ)];
}

function room(space, tag, minX, maxX, minZ, maxZ) {
  return {
    level: space.level,
    tag,
    minX,
    maxX,
    minY: space.minY,
    maxY: space.maxY,
    minZ,
    maxZ
  };
}
