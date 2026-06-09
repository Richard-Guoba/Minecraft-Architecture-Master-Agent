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
