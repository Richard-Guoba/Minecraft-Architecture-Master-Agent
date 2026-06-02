const BASE_MODULES = ['foundation', 'walls', 'floors', 'roof', 'windows', 'door'];
const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;
const SIDES = new Set(['north', 'south', 'east', 'west']);

export class ValidatorAgent {
  run(blueprint, design) {
    const errors = [];
    const warnings = [];
    const requiredModules = [...new Set([...(design.modules || []), ...BASE_MODULES])];

    for (const module of requiredModules) {
      if (!blueprint.modules[module]) {
        errors.push(`缺少建筑模块: ${module}`);
      }
    }

    validateElementSpecs(design, errors, warnings);
    validateAgentOutputs(blueprint, design, errors, warnings);

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
    if (design.floors < 2 && /欧式/.test(design.style)) {
      warnings.push('欧式大房子通常建议至少两层。');
    }
    if (!blueprint.modules.interior) {
      warnings.push('未生成室内模块，建筑可能仍偏空。');
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
        modules: blueprint.modules,
        requiredModules
      }
    };
  }
}

function validateElementSpecs(design, errors, warnings) {
  const elements = design.elements || {};
  const materials = [
    elements.wall?.material,
    elements.floor?.material,
    elements.door?.material,
    elements.roof?.material,
    elements.window?.material
  ].filter(Boolean);

  for (const material of materials) {
    if (!BLOCK_PATTERN.test(material)) {
      errors.push(`元素材质不是合法 Minecraft 方块 ID: ${material}`);
    }
  }

  if (elements.door?.side && !SIDES.has(elements.door.side)) {
    errors.push(`门朝向不合法: ${elements.door.side}`);
  }
  if ((elements.window?.width || 0) > 5 && (design.dimensions?.width || 0) < 17) {
    warnings.push('窗户宽度较大，小尺寸建筑可能显得拥挤。');
  }
  if ((elements.roof?.height || 0) > (design.dimensions?.wallHeight || 0)) {
    warnings.push('屋顶高度超过墙体高度，可能过于夸张。');
  }
}

function validateAgentOutputs(blueprint, design, errors, warnings) {
  const agents = blueprint.agents || {};
  if (!agents.shell?.interiorSpaces?.length) {
    errors.push('ShellAgent 未交付可用内部空间。');
  }
  if (design.elements?.interior?.enabled !== false && !agents.layout?.rooms?.length) {
    errors.push('LayoutAgent 未交付房间划分结果。');
  }
  if (design.elements?.interior?.enabled !== false && !agents.furnishing?.placed) {
    warnings.push('FurnishingAgent 未放置家具，室内可能偏空。');
  }
  if (design.elements?.landscape?.enabled && !agents.garden?.parcel) {
    errors.push('GardenAgent 未交付庭院地块。');
  }
}
