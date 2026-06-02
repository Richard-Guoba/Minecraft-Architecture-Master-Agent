import { point } from './BlueprintWorkspace.js';

export class GardenAgent {
  run(workspace, shell) {
    if (!workspace.elements.landscape?.enabled) {
      return { enabled: false, parcel: undefined, features: [] };
    }

    const { width, depth, gardenDepth } = workspace.design.dimensions;
    const p = workspace.design.palette;
    const center = Math.floor(width / 2);
    const parcel = {
      minX: -3,
      maxX: width + 2,
      minZ: depth + 1,
      maxZ: depth + gardenDepth
    };
    const features = ['path', 'hedge', 'flower_beds'];

    workspace.fill(point(center - 1, 0, depth), point(center + 1, 0, depth + gardenDepth), p.path, 'garden');
    workspace.fill(point(parcel.minX, 0, parcel.minZ), point(parcel.minX, 1, parcel.maxZ), p.hedge, 'garden');
    workspace.fill(point(parcel.maxX, 0, parcel.minZ), point(parcel.maxX, 1, parcel.maxZ), p.hedge, 'garden');
    workspace.fill(point(parcel.minX, 0, parcel.maxZ), point(parcel.maxX, 1, parcel.maxZ), p.hedge, 'garden');
    workspace.fill(point(2, 0, depth + 2), point(5, 0, depth + gardenDepth - 1), 'minecraft:grass_block', 'garden');
    workspace.fill(point(width - 6, 0, depth + 2), point(width - 3, 0, depth + gardenDepth - 1), 'minecraft:grass_block', 'garden');

    for (let z = depth + 2; z < depth + gardenDepth; z += 2) {
      workspace.setblock(point(3, 1, z), z % 4 === 0 ? p.flowerRed : p.flowerBlue, 'garden');
      workspace.setblock(point(width - 4, 1, z), z % 4 === 0 ? p.flowerBlue : p.flowerRed, 'garden');
    }

    if (workspace.elements.landscape.waterFeature) {
      const pondZ = depth + Math.max(3, gardenDepth - 4);
      workspace.fill(point(center + 4, 0, pondZ), point(center + 8, 0, pondZ + 3), p.foundation, 'water_feature');
      workspace.fill(point(center + 5, 1, pondZ + 1), point(center + 7, 1, pondZ + 2), p.water, 'water_feature');
      workspace.setblock(point(center + 6, 2, pondZ + 1), p.lamp, 'water_feature');
      features.push('water_feature');
    }

    return {
      enabled: true,
      parcel,
      features,
      connectedTo: shell.openings.mainDoor.side
    };
  }
}
