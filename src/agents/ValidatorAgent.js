const REQUIRED_MODULES = ['foundation', 'walls', 'floors', 'roof', 'windows', 'door', 'chimney', 'garden'];
const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;

export class ValidatorAgent {
  run(blueprint, design) {
    const errors = [];
    const warnings = [];

    for (const module of REQUIRED_MODULES) {
      if (!blueprint.modules[module]) {
        errors.push(`缺少建筑模块: ${module}`);
      }
    }

    for (const operation of blueprint.operations) {
      if (!BLOCK_PATTERN.test(operation.block)) {
        errors.push(`非法方块名: ${operation.block}`);
      }
      if (operation.kind === 'fill') {
        const volume = (
          Math.abs(operation.to.x - operation.from.x) + 1
        ) * (
          Math.abs(operation.to.y - operation.from.y) + 1
        ) * (
          Math.abs(operation.to.z - operation.from.z) + 1
        );
        if (volume > 32768) {
          errors.push(`fill 命令体积超过 Minecraft 限制: ${volume}`);
        }
      }
      const points = operation.kind === 'fill' ? [operation.from, operation.to] : [operation.at];
      for (const p of points) {
        if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !Number.isInteger(p.z)) {
          errors.push(`坐标必须是整数: ${JSON.stringify(p)}`);
        }
      }
    }

    const bounds = blueprint.bounds;
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const depth = bounds.maxZ - bounds.minZ + 1;
    if (width > 64 || depth > 64 || height > 32) {
      warnings.push(`建筑边界较大: ${width}x${height}x${depth}`);
    }
    if (blueprint.operations.length > 8000) {
      warnings.push('函数命令数量接近 Minecraft 单次执行压力上限。');
    }
    if (design.floors < 2 && design.requirement?.features?.includes('欧式')) {
      warnings.push('欧式大房子通常建议至少两层。');
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      stats: {
        operationCount: blueprint.operations.length,
        fillCount: blueprint.operations.filter((op) => op.kind === 'fill').length,
        setblockCount: blueprint.operations.filter((op) => op.kind === 'setblock').length,
        bounds: { width, height, depth },
        modules: blueprint.modules
      }
    };
  }
}
