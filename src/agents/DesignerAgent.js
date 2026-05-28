export class DesignerAgent {
  constructor({ seed } = {}) {
    this.seed = seed ?? 2026;
  }

  run(requirement) {
    const large = requirement.scale === 'large';
    const floors = Math.max(1, Math.min(3, requirement.floors || 2));
    const width = large ? 25 : 19;
    const depth = large ? 21 : 15;
    const floorHeight = 5;
    const wallHeight = floors * floorHeight;
    const roofHeight = large ? 6 : 4;

    const palette = {
      foundation: 'minecraft:stone_bricks',
      wall: 'minecraft:smooth_sandstone',
      trim: 'minecraft:stripped_dark_oak_log',
      floor: 'minecraft:spruce_planks',
      roof: 'minecraft:dark_oak_planks',
      glass: 'minecraft:glass',
      doorLower: 'minecraft:dark_oak_door[facing=south,half=lower,hinge=left]',
      doorUpper: 'minecraft:dark_oak_door[facing=south,half=upper,hinge=left]',
      chimney: 'minecraft:bricks',
      hedge: 'minecraft:oak_leaves[persistent=true]',
      path: 'minecraft:gravel',
      flowerRed: 'minecraft:poppy',
      flowerBlue: 'minecraft:cornflower',
      lamp: 'minecraft:glowstone'
    };

    return {
      id: 'european-large-house-v1',
      style: requirement.style,
      scale: requirement.scale,
      floors,
      dimensions: {
        width,
        depth,
        floorHeight,
        wallHeight,
        roofHeight,
        gardenDepth: 8
      },
      palette,
      modules: [
        'foundation',
        'walls',
        'floors',
        'roof',
        'windows',
        'door',
        'chimney',
        'garden'
      ],
      notes: [
        '建筑以玩家当前位置作为西北角附近起点，向东和向南展开。',
        'v1 使用数据包函数生成结构，不模拟玩家逐块放置。'
      ],
      requirement
    };
  }
}
