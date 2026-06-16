import { clamp, point } from './BlueprintWorkspace.js';

export class LayoutAgent {
  run(workspace, shell) {
    const spec = workspace.elements.interior || {};
    if (spec.enabled === false) {
      return { rooms: [], stairs: [], interiorDoors: [], floorOpenings: [] };
    }
    if (workspace.elements.europeanVilla?.enabled) {
      return this.europeanVillaLayout(workspace, shell, spec);
    }

    const rooms = [];
    const interiorDoors = [];
    const floorOpenings = [];
    const { width, depth, floorHeight, wallHeight } = workspace.design.dimensions;
    const p = workspace.design.palette;
    const roomCount = clamp(spec.rooms || 2, 1, 8);
    const plannedTags = plannedRoomTags(workspace.design.plan);

    for (const space of shell.interiorSpaces) {
      const y1 = space.minY;
      const y2 = Math.min(space.maxY - 1, wallHeight - 1);
      const centerX = Math.floor((space.minX + space.maxX) / 2);
      const centerZ = Math.floor((space.minZ + space.maxZ) / 2);
      const spaceWidth = space.maxX - space.minX + 1;
      const spaceDepth = space.maxZ - space.minZ + 1;
      const baseRooms = splitSpace(space, roomCount, plannedTags, rooms.length);
      rooms.push(...baseRooms);

      if (spaceWidth >= 9 && roomCount >= 2) {
        workspace.fill(point(centerX, y1, space.minZ + 2), point(centerX, y2, space.maxZ - 2), p.interiorWall, 'interior');
        workspace.fill(point(centerX, y1, centerZ - 1), point(centerX, y1 + 1, centerZ + 1), 'minecraft:air', 'interior');
        interiorDoors.push({ level: space.level, axis: 'x', at: { x: centerX, z: centerZ }, connects: ['living', 'bedroom'] });
      }
      if (spaceDepth >= 9 && roomCount >= 4) {
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

  europeanVillaLayout(workspace, shell, spec) {
    const rooms = [];
    const interiorDoors = [];
    const floorOpenings = [];
    const { floorHeight, wallHeight } = workspace.design.dimensions;
    const p = workspace.design.palette;
    const inner = workspace.innerBounds();
    const centerX = Math.floor((inner.minX + inner.maxX) / 2);
    const centerZ = Math.floor((inner.minZ + inner.maxZ) / 2);
    const leftWallX = Math.max(inner.minX + 5, centerX - 5);
    const rightWallX = Math.min(inner.maxX - 5, centerX + 5);
    const frontStartZ = Math.max(centerZ + 1, inner.maxZ - 5);

    const mainSpaces = shell.interiorSpaces.filter((space) => !space.source);
    for (const space of mainSpaces) {
      const y1 = space.minY;
      const y2 = Math.min(space.maxY - 1, wallHeight - 1);
      if (space.level === 0) {
        this.partitionFirstFloor(workspace, { inner, centerX, centerZ, leftWallX, rightWallX, frontStartZ, y1, y2, p, rooms, interiorDoors });
      } else if (space.level === 1) {
        this.partitionSecondFloor(workspace, { inner, centerX, centerZ, leftWallX, rightWallX, frontStartZ, y1, y2, p, rooms, interiorDoors });
      } else {
        rooms.push(room(space, 'bedroom', inner.minX, inner.maxX, inner.minZ, inner.maxZ));
      }
    }

    for (const space of shell.interiorSpaces.filter((item) => item.source === 'european-wing')) {
      const tag = wingRoomTag(space);
      rooms.push(room(space, tag, space.minX, space.maxX, space.minZ, space.maxZ));
    }

    const stairs = spec.stairs !== false && workspace.design.floors > 1
      ? this.europeanStairs(workspace, floorOpenings, { inner, leftWallX })
      : [];

    return { rooms, stairs, interiorDoors, floorOpenings };
  }

  partitionFirstFloor(workspace, ctx) {
    const { inner, centerX, centerZ, leftWallX, rightWallX, frontStartZ, y1, y2, p, rooms, interiorDoors } = ctx;

    this.wallX(workspace, leftWallX, y1, y2, inner.minZ, inner.maxZ, p);
    this.wallX(workspace, rightWallX, y1, y2, inner.minZ, inner.maxZ, p);
    this.wallZ(workspace, centerZ, y1, y2, inner.minX, inner.maxX, p);

    this.openDoor(workspace, point(centerX - 1, y1, centerZ), point(centerX + 1, y1 + 1, centerZ));
    this.openDoor(workspace, point(leftWallX, y1, centerZ - 1), point(leftWallX, y1 + 1, centerZ + 1));
    this.openDoor(workspace, point(rightWallX, y1, centerZ - 1), point(rightWallX, y1 + 1, centerZ + 1));
    this.openDoor(workspace, point(centerX - 1, y1, frontStartZ - 1), point(centerX + 1, y1 + 1, frontStartZ - 1));

    rooms.push(roomFromBounds(0, 'entry', centerX - 4, centerX + 4, frontStartZ, inner.maxZ, y1, y2 + 1));
    rooms.push(roomFromBounds(0, 'living', leftWallX + 1, rightWallX - 1, inner.minZ, centerZ - 1, y1, y2 + 1));
    rooms.push(roomFromBounds(0, 'dining', inner.minX, leftWallX - 1, inner.minZ, centerZ - 1, y1, y2 + 1));
    rooms.push(roomFromBounds(0, 'kitchen', rightWallX + 1, inner.maxX, inner.minZ, centerZ - 1, y1, y2 + 1));
    rooms.push(roomFromBounds(0, 'stairs', inner.minX, leftWallX - 1, centerZ + 1, inner.maxZ, y1, y2 + 1));
    rooms.push(roomFromBounds(0, 'lounge', rightWallX + 1, inner.maxX, centerZ + 1, inner.maxZ, y1, y2 + 1));

    interiorDoors.push(
      { level: 0, axis: 'z', at: { x: centerX, z: centerZ }, connects: ['entry', 'living'] },
      { level: 0, axis: 'x', at: { x: leftWallX, z: centerZ }, connects: ['dining', 'stairs'] },
      { level: 0, axis: 'x', at: { x: rightWallX, z: centerZ }, connects: ['kitchen', 'lounge'] }
    );
  }

  partitionSecondFloor(workspace, ctx) {
    const { inner, centerX, centerZ, leftWallX, rightWallX, frontStartZ, y1, y2, p, rooms, interiorDoors } = ctx;
    this.wallX(workspace, leftWallX, y1, y2, inner.minZ, inner.maxZ, p);
    this.wallX(workspace, rightWallX, y1, y2, inner.minZ, inner.maxZ, p);
    this.wallZ(workspace, centerZ, y1, y2, inner.minX, inner.maxX, p);
    this.wallZ(workspace, frontStartZ - 1, y1, y2, leftWallX + 1, rightWallX - 1, p);

    this.openDoor(workspace, point(centerX - 1, y1, centerZ), point(centerX + 1, y1 + 1, centerZ));
    this.openDoor(workspace, point(leftWallX, y1, centerZ - 1), point(leftWallX, y1 + 1, centerZ + 1));
    this.openDoor(workspace, point(rightWallX, y1, centerZ - 1), point(rightWallX, y1 + 1, centerZ + 1));
    this.openDoor(workspace, point(centerX - 1, y1, frontStartZ - 1), point(centerX + 1, y1 + 1, frontStartZ - 1));

    rooms.push(roomFromBounds(1, 'corridor', leftWallX + 1, rightWallX - 1, centerZ, frontStartZ - 2, y1, y2 + 1));
    rooms.push(roomFromBounds(1, 'balcony', centerX - 3, centerX + 3, frontStartZ, inner.maxZ, y1, y2 + 1));
    rooms.push(roomFromBounds(1, 'bedroom', inner.minX, leftWallX - 1, inner.minZ, centerZ - 1, y1, y2 + 1));
    rooms.push(roomFromBounds(1, 'bedroom', rightWallX + 1, inner.maxX, inner.minZ, centerZ - 1, y1, y2 + 1));
    rooms.push(roomFromBounds(1, 'study', inner.minX, leftWallX - 1, centerZ + 1, inner.maxZ, y1, y2 + 1));
    rooms.push(roomFromBounds(1, 'bedroom', rightWallX + 1, inner.maxX, centerZ + 1, inner.maxZ, y1, y2 + 1));

    interiorDoors.push(
      { level: 1, axis: 'z', at: { x: centerX, z: centerZ }, connects: ['corridor', 'balcony'] },
      { level: 1, axis: 'x', at: { x: leftWallX, z: centerZ }, connects: ['corridor', 'study'] },
      { level: 1, axis: 'x', at: { x: rightWallX, z: centerZ }, connects: ['corridor', 'bedroom'] }
    );
  }

  europeanStairs(workspace, floorOpenings, { inner, leftWallX }) {
    const { floorHeight } = workspace.design.dimensions;
    const p = workspace.design.palette;
    const stairs = [];
    const startX = Math.max(inner.minX + 2, leftWallX - 4);
    const startZ = inner.maxZ - 2;
    const stairBlock = stairFacing(p.stairs, 'north');

    for (let level = 0; level < workspace.design.floors - 1; level += 1) {
      const upperFloorY = (level + 1) * floorHeight + 1;
      const opening = {
        level: level + 1,
        minX: startX - 1,
        maxX: startX + 3,
        y: upperFloorY,
        minZ: startZ - floorHeight - 1,
        maxZ: startZ
      };
      floorOpenings.push(opening);
      workspace.fill(point(opening.minX, opening.y, opening.minZ), point(opening.maxX, opening.y, opening.maxZ), 'minecraft:air', 'stairs');

      for (let step = 0; step < floorHeight; step += 1) {
        const y = level * floorHeight + 2 + step;
        const z = startZ - step;
        for (const dx of [0, 1]) {
          workspace.setblock(point(startX + dx, y, z), stairBlock, 'stairs');
        }
        workspace.setblock(point(startX - 1, y, z), 'minecraft:dark_oak_fence', 'stairs');
        stairs.push({ level, step, at: { x: startX, y, z } });
      }
    }
    return stairs;
  }

  wallX(workspace, x, y1, y2, z1, z2, palette) {
    workspace.fill(point(x, y1, z1), point(x, y2, z2), palette.interiorWall, 'interior');
  }

  wallZ(workspace, z, y1, y2, x1, x2, palette) {
    workspace.fill(point(x1, y1, z), point(x2, y2, z), palette.interiorWall, 'interior');
  }

  openDoor(workspace, from, to) {
    workspace.fill(from, to, 'minecraft:air', 'interior');
  }
}

function splitSpace(space, roomCount, plannedTags = [], offset = 0) {
  const centerX = Math.floor((space.minX + space.maxX) / 2);
  const centerZ = Math.floor((space.minZ + space.maxZ) / 2);
  if (roomCount >= 4) {
    return [
      room(space, tagFor(plannedTags, offset, 0, 'living'), space.minX, centerX - 1, space.minZ, centerZ - 1),
      room(space, tagFor(plannedTags, offset, 1, 'bedroom'), centerX + 1, space.maxX, space.minZ, centerZ - 1),
      room(space, tagFor(plannedTags, offset, 2, 'kitchen'), space.minX, centerX - 1, centerZ + 1, space.maxZ),
      room(space, tagFor(plannedTags, offset, 3, 'utility'), centerX + 1, space.maxX, centerZ + 1, space.maxZ)
    ];
  }
  if (roomCount >= 2) {
    return [
      room(space, tagFor(plannedTags, offset, 0, 'living'), space.minX, centerX - 1, space.minZ, space.maxZ),
      room(space, tagFor(plannedTags, offset, 1, 'bedroom'), centerX + 1, space.maxX, space.minZ, space.maxZ)
    ];
  }
  return [room(space, tagFor(plannedTags, offset, 0, 'living'), space.minX, space.maxX, space.minZ, space.maxZ)];
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

function roomFromBounds(level, tag, minX, maxX, minZ, maxZ, minY, maxY) {
  return {
    level,
    tag,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ
  };
}

function wingRoomTag(space) {
  if (space.level > 0) return space.side === 'west' ? 'study' : 'bedroom';
  return space.side === 'west' ? 'dining' : 'kitchen';
}

function stairFacing(block, facing) {
  const raw = String(block || 'minecraft:spruce_stairs[facing=south,half=bottom]');
  if (raw.includes('facing=')) return raw.replace(/facing=[a-z]+/, `facing=${facing}`);
  const [id, state] = raw.split('[');
  return `${id}[facing=${facing}${state ? `,${state}` : ',half=bottom]'}`;
}

function tagFor(plannedTags, offset, slot, fallback) {
  return plannedTags[offset + slot] || fallback;
}

function plannedRoomTags(plan) {
  const zones = Array.isArray(plan?.zones) ? plan.zones : [];
  return zones
    .filter((zone) => !zone.outside)
    .map((zone) => normalizeRoomTag(zone.type || zone.id || zone.label))
    .filter((tag) => !['entry', 'stairs', 'outside'].includes(tag));
}

function normalizeRoomTag(value) {
  const text = String(value || '').toLowerCase();
  if (/bed|卧/.test(text)) return 'bedroom';
  if (/kitchen|厨/.test(text)) return 'kitchen';
  if (/study|书/.test(text)) return 'study';
  if (/dining|餐/.test(text)) return 'dining';
  if (/bath|wash|卫|浴/.test(text)) return 'utility';
  if (/entry|门厅|玄关/.test(text)) return 'entry';
  if (/stair|楼梯/.test(text)) return 'stairs';
  if (/utility|功能|储物/.test(text)) return 'utility';
  return 'living';
}
