import { point } from './BlueprintWorkspace.js';

export class FurnishingAgent {
  run(workspace, layout) {
    const spec = workspace.elements.interior || {};
    if (spec.enabled === false) return { placed: 0, lighting: 0, rooms: [] };

    let placed = 0;
    let lighting = 0;
    const furnishedRooms = [];
    const p = workspace.design.palette;

    for (const room of layout.rooms) {
      if ((room.maxX - room.minX) < 2 || (room.maxZ - room.minZ) < 2) continue;

      const y = room.minY;
      const centerX = Math.floor((room.minX + room.maxX) / 2);
      const centerZ = Math.floor((room.minZ + room.maxZ) / 2);

      if (room.tag === 'bedroom') {
        workspace.setblock(point(room.maxX - 1, y, room.minZ + 1), 'minecraft:red_bed[facing=south]', 'furnishing');
        workspace.setblock(point(room.maxX - 2, y, room.minZ + 1), 'minecraft:chest[facing=south]', 'furnishing');
        placed += 2;
      } else if (room.tag === 'kitchen' || room.tag === 'utility') {
        workspace.setblock(point(room.minX + 1, y, room.maxZ - 1), 'minecraft:furnace[facing=north]', 'furnishing');
        workspace.setblock(point(room.minX + 2, y, room.maxZ - 1), 'minecraft:crafting_table', 'furnishing');
        placed += 2;
      } else if (room.tag === 'study') {
        workspace.setblock(point(room.minX + 1, y, room.minZ + 1), 'minecraft:bookshelf', 'furnishing');
        workspace.setblock(point(room.minX + 2, y, room.minZ + 1), 'minecraft:lectern[facing=south]', 'furnishing');
        placed += 2;
      } else if (room.tag === 'dining') {
        workspace.setblock(point(centerX, y, centerZ), 'minecraft:spruce_fence', 'furnishing');
        workspace.setblock(point(centerX, y + 1, centerZ), 'minecraft:oak_pressure_plate', 'furnishing');
        placed += 2;
      } else {
        workspace.setblock(point(room.minX + 1, y, room.minZ + 1), p.furniture, 'furnishing');
        workspace.setblock(point(room.maxX - 1, y, room.maxZ - 1), 'minecraft:crafting_table', 'furnishing');
        placed += 2;
      }

      workspace.fill(point(centerX - 1, y, centerZ - 1), point(centerX + 1, y, centerZ + 1), carpetFor(room.tag), 'furnishing');
      placed += 1;

      if (spec.lighting !== false) {
        const lampY = room.maxY;
        workspace.setblock(point(centerX, lampY, centerZ), p.lamp, 'lighting');
        lighting += 1;
      }
      furnishedRooms.push({ level: room.level, tag: room.tag });
    }

    return { placed, lighting, rooms: furnishedRooms };
  }
}

function carpetFor(tag) {
  if (tag === 'bedroom') return 'minecraft:red_carpet';
  if (tag === 'kitchen' || tag === 'utility') return 'minecraft:light_gray_carpet';
  return 'minecraft:green_carpet';
}
