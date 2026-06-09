export function renderReport({
  prompt,
  requirement,
  originalRequirement,
  skill,
  plan,
  critique,
  repair,
  design,
  blueprint,
  validation,
  artifacts,
  mcVersion,
  autoBuild
}) {
  const warnings = validation.warnings.length
    ? validation.warnings.map((item) => `- ${item}`).join('\n')
    : '- 无';
  const elementLines = renderElementLines(design);
  const planLines = renderPlanLines(plan || design.plan);
  const skillLines = renderSkillLines(skill);
  const critiqueLines = renderCritiqueLines(critique, repair);
  const agentLines = renderBlueprintAgentLines(blueprint);
  const installLine = artifacts.installedDatapackDir
    ? `- 已安装到世界：${artifacts.installedDatapackDir}\n`
    : '';
  const usageSteps = autoBuild && artifacts.installedDatapackDir
    ? [
      '1. 打开对应的 Minecraft Java 1.21 世界。',
      '2. 数据包会在第一个玩家当前位置自动执行 clear + build。',
      '3. 如果游戏已经打开，退出并重新进入世界；必要时可手动运行 /reload 触发自动流程。'
    ].join('\n')
    : [
      '1. 创建单人创造超平坦世界，并开启作弊。',
      '2. 把 architect_datapack 复制到 .minecraft/saves/<世界名>/datapacks/。',
      '3. 进入世界后运行 /reload。',
      '4. 站在建筑起点运行 /function architect:clear。',
      '5. 运行 /function architect:build。'
    ].join('\n');

  return `# Minecraft 建筑智能体运行报告

## 输入需求

${prompt}

## Agent 流水线结果

- RequirementAgent 来源：${originalRequirement?.source || requirement.source}
- SkillRouterAgent 来源：${skill?.source || '未启用'}
- PlannerAgent 来源：${design.plan?.source || '未启用'}
- 风格：${requirement.style}
- 规模：${requirement.scale}
- 层数：${requirement.floors}
- 关键元素：${requirement.features.join('、') || '默认欧式住宅元素'}

## 建筑 Skill

${skillLines}

## 建筑语义规划

${planLines}

## 评审与修正

${critiqueLines}

## 建筑设计

- 目标版本：Minecraft Java ${mcVersion}
- 数据包 pack_format：48
- 建筑尺寸：${validation.stats.bounds.width} x ${validation.stats.bounds.height} x ${validation.stats.bounds.depth}
- 函数命令数：${validation.stats.operationCount}
- fill 命令数：${validation.stats.fillCount}
- setblock 命令数：${validation.stats.setblockCount}
- 模块：${Object.keys(blueprint.modules).join('、')}

## 可配置建筑元素

${elementLines}

## 蓝图子 Agent 交付

${agentLines}

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
${installLine}

## Minecraft Java 1.21 使用步骤

${usageSteps}

说明：mcfunction 文件内部命令不带斜杠，这是 Minecraft 数据包函数的正常格式。
`;
}

function renderElementLines(design) {
  const elements = design.elements || {};
  const lines = [
    ['墙壁', [
      `材质 ${elements.wall?.material || design.palette.wall}`,
      `厚度 ${elements.wall?.thickness || 1}`
    ]],
    ['地板', [
      `材质 ${elements.floor?.material || design.palette.floor}`,
      `层数 ${design.floors}`
    ]],
    ['门', [
      `材质 ${elements.door?.material || design.palette.doorBase}`,
      `位置 ${elements.door?.position || `${elements.door?.side || 'south'}-center`}`,
      `尺寸 ${elements.door?.width || 1} x ${elements.door?.height || 2}`
    ]],
    ['屋顶', [
      `材质 ${elements.roof?.material || design.palette.roof}`,
      `样式 ${elements.roof?.style || 'gabled'}`,
      `高度 ${elements.roof?.height || design.dimensions.roofHeight}`
    ]],
    ['窗户', [
      `材质 ${elements.window?.material || design.palette.glass}`,
      `尺寸 ${elements.window?.width || 2} x ${elements.window?.height || 2}`,
      `间距 ${elements.window?.spacing || 6}`
    ]]
  ];

  return lines
    .map(([name, parts]) => `- ${name}：${parts.join('，')}`)
    .join('\n');
}

function renderPlanLines(plan) {
  if (!plan) return '- 未生成语义规划';
  const footprint = plan.footprint?.type || 'rectangle';
  const zones = (plan.zones || [])
    .map((zone) => `${zone.label || zone.id}(${zone.type || zone.id})`)
    .join('、') || '默认房间';
  const motifs = (plan.styleMotifs || []).join('、') || '默认风格母题';
  const adjacency = (plan.adjacency || [])
    .map(([a, b]) => `${a}-${b}`)
    .join('、') || '默认连通关系';
  return [
    `- footprint：${footprint}`,
    `- zones：${zones}`,
    `- adjacency：${adjacency}`,
    `- styleMotifs：${motifs}`
  ].join('\n');
}

function renderSkillLines(skill) {
  if (!skill) return '- 未选择建筑 skill';
  return [
    `- skill：${skill.name || skill.skillId} (${skill.skillId})`,
    `- confidence：${Math.round((skill.confidence || 0) * 100)}%`,
    `- preferredFootprint：${skill.preferredFootprint || 'rectangle'}`,
    `- requiredModules：${(skill.requiredModules || []).join('、') || '无'}`,
    `- rationale：${skill.rationale || '无'}`
  ].join('\n');
}

function renderCritiqueLines(critique, repair) {
  if (!critique) return '- 未执行 CriticAgent';
  const strengths = (critique.strengths || []).map((item) => `  - ${item}`).join('\n') || '  - 无';
  const issues = (critique.issues || []).map((item) => `  - ${item}`).join('\n') || '  - 无';
  const actions = repair?.actions?.length
    ? repair.actions.map((item) => `  - ${item}`).join('\n')
    : '  - 未触发修正';
  return [
    `- CriticAgent 来源：${critique.source || 'unknown'}`,
    `- 软质量评分：${critique.score}/100`,
    `- 是否触发修正：${repair?.applied ? '是' : '否'}`,
    '- 优点：',
    strengths,
    '- 问题：',
    issues,
    '- RepairAgent 操作：',
    actions
  ].join('\n');
}

function renderBlueprintAgentLines(blueprint) {
  const agents = blueprint.agents || {};
  return [
    `- ShellAgent：内部空间 ${agents.shell?.interiorSpaces?.length || 0} 层，侧翼 ${agents.shell?.extensions?.length || 0} 个，主门 ${agents.shell?.openings?.mainDoor?.side || 'south'}`,
    `- LayoutAgent：房间 ${agents.layout?.rooms?.length || 0} 个，室内门 ${agents.layout?.interiorDoors?.length || 0} 个，楼板开洞 ${agents.layout?.floorOpenings?.length || 0} 个`,
    `- FurnishingAgent：家具/装饰 ${agents.furnishing?.placed || 0} 处，照明 ${agents.furnishing?.lighting || 0} 处`,
    `- GardenAgent：${agents.garden?.enabled ? `庭院地块 ${formatParcel(agents.garden.parcel)}，元素 ${agents.garden.features.join('、')}` : '未启用庭院'}`
  ].join('\n');
}

function formatParcel(parcel) {
  if (!parcel) return '无';
  return `(${parcel.minX},${parcel.minZ})-(${parcel.maxX},${parcel.maxZ})`;
}
