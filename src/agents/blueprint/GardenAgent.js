import { point } from './BlueprintWorkspace.js';

export class GardenAgent {
  run(workspace, shell) {
    if (!workspace.elements.landscape?.enabled) {
      return { enabled: false, parcel: undefined, features: [] };
    }
    if (workspace.elements.europeanVilla?.enabled) {
      return this.europeanFormalGarden(workspace, shell);
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

  europeanFormalGarden(workspace, shell) {
    const { width, depth, gardenDepth } = workspace.design.dimensions;
    const spec = workspace.elements.europeanVilla?.garden || {};
    const p = workspace.design.palette;
    const center = Math.floor(width / 2);
    const pathHalf = Math.floor((spec.centralPathWidth || 3) / 2);
    const parcel = {
      minX: -6,
      maxX: width + 5,
      minZ: depth + 1,
      maxZ: depth + gardenDepth
    };
    const features = ['formal_axis', 'path', 'hedge', 'paired_flower_beds', 'lamp_posts'];

    workspace.fill(point(center - pathHalf, 0, depth), point(center + pathHalf, 0, parcel.maxZ), p.path, 'garden');
    workspace.fill(point(parcel.minX, 0, parcel.minZ), point(parcel.minX, 1, parcel.maxZ), p.hedge, 'garden');
    workspace.fill(point(parcel.maxX, 0, parcel.minZ), point(parcel.maxX, 1, parcel.maxZ), p.hedge, 'garden');
    workspace.fill(point(parcel.minX, 0, parcel.maxZ), point(parcel.maxX, 1, parcel.maxZ), p.hedge, 'garden');

    const leftBed = { minX: parcel.minX + 3, maxX: center - pathHalf - 3 };
    const rightBed = { minX: center + pathHalf + 3, maxX: parcel.maxX - 3 };
    const bedZ1 = depth + 2;
    const bedZ2 = Math.max(bedZ1, parcel.maxZ - 2);
    workspace.fill(point(leftBed.minX, 0, bedZ1), point(leftBed.maxX, 0, bedZ2), 'minecraft:grass_block', 'garden');
    workspace.fill(point(rightBed.minX, 0, bedZ1), point(rightBed.maxX, 0, bedZ2), 'minecraft:grass_block', 'garden');

    for (let z = bedZ1 + 1; z <= bedZ2; z += 2) {
      workspace.setblock(point(leftBed.minX + 1, 1, z), z % 4 === 0 ? p.flowerRed : p.flowerBlue, 'garden');
      workspace.setblock(point(leftBed.maxX - 1, 1, z), z % 4 === 0 ? p.flowerBlue : p.flowerRed, 'garden');
      workspace.setblock(point(rightBed.minX + 1, 1, z), z % 4 === 0 ? p.flowerBlue : p.flowerRed, 'garden');
      workspace.setblock(point(rightBed.maxX - 1, 1, z), z % 4 === 0 ? p.flowerRed : p.flowerBlue, 'garden');
    }

    for (const x of [center - pathHalf - 2, center + pathHalf + 2]) {
      workspace.fill(point(x, 1, depth + 1), point(x, 3, depth + 1), 'minecraft:stone_bricks', 'garden');
      workspace.setblock(point(x, 4, depth + 1), p.lamp, 'lighting');
    }

    if (workspace.elements.landscape.waterFeature || spec.fountain) {
      const fountainZ = depth + Math.max(3, Math.floor(gardenDepth * 0.55));
      workspace.fill(point(center - 2, 0, fountainZ - 2), point(center + 2, 0, fountainZ + 2), p.foundation, 'water_feature');
      workspace.fill(point(center - 1, 1, fountainZ - 1), point(center + 1, 1, fountainZ + 1), p.water, 'water_feature');
      workspace.setblock(point(center, 2, fountainZ), 'minecraft:stone_bricks', 'water_feature');
      workspace.setblock(point(center, 3, fountainZ), p.water, 'water_feature');
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
