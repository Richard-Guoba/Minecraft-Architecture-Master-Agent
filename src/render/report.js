export function renderReport({ prompt, requirement, design, blueprint, validation, artifacts, mcVersion }) {
  const warnings = validation.warnings.length
    ? validation.warnings.map((item) => `- ${item}`).join('\n')
    : '- 无';

  return `# Minecraft 建筑智能体运行报告

## 输入需求

${prompt}

## Agent 流水线结果

- RequirementAgent 来源：${requirement.source}
- 风格：${requirement.style}
- 规模：${requirement.scale}
- 层数：${requirement.floors}
- 关键元素：${requirement.features.join('、') || '默认欧式住宅元素'}

## 建筑设计

- 目标版本：Minecraft Java ${mcVersion}
- 数据包 pack_format：48
- 建筑尺寸：${validation.stats.bounds.width} x ${validation.stats.bounds.height} x ${validation.stats.bounds.depth}
- 函数命令数：${validation.stats.operationCount}
- fill 命令数：${validation.stats.fillCount}
- setblock 命令数：${validation.stats.setblockCount}
- 模块：${Object.keys(blueprint.modules).join('、')}

## 校验结果

- 状态：${validation.ok ? '通过' : '未通过'}
- 警告：
${warnings}

## 输出文件

- 数据包目录：${artifacts.datapackDir}
- 建造函数：${artifacts.buildPath}
- 清理函数：${artifacts.clearPath}
- 原始 mcfunction：${artifacts.rawPath}
- 预览 HTML：${artifacts.previewPath}

## Minecraft Java 1.21 使用步骤

1. 创建单人创造超平坦世界，并开启作弊。
2. 把 architect_datapack 复制到 .minecraft/saves/<世界名>/datapacks/。
3. 进入世界后运行 /reload。
4. 站在建筑起点运行 /function architect:clear。
5. 运行 /function architect:build。

说明：mcfunction 文件内部命令不带斜杠，这是 Minecraft 数据包函数的正常格式。
`;
}
