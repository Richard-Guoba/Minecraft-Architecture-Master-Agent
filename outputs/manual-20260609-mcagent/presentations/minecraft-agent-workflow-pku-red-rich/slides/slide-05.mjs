import { title, table, code, panel, C } from './theme.mjs';

export async function slide05(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'SkillRouterAgent：把建筑风格做成可插拔能力', 'skill 不是口号，而是风格知识、默认模块、palette 和 critic 规则的集合', '05 / Skill');

  table(slide, ctx, {
    x: 72, y: 150,
    cols: ['skill 组成', '内容', '对生成的约束'],
    colWidths: [180, 430, 430],
    headH: 32,
    rowH: 40,
    fontSize: 8.9,
    rows: [
      ['metadata', 'id、displayName、适用 style、keywords、confidence rationale', '让 Agent 能解释为什么选中该 skill'],
      ['footprint', 'preferredFootprint：courtyard / rectangle / winged / l-shape', '影响空间基底和后续 Blueprint 模块'],
      ['requiredModules', '必须出现的模块：courtyard、garden、water_feature、roof_detail 等', '避免风格只停留在文字描述'],
      ['styleMotifs', 'white-wall-dark-roof、courtyard-axis、eave-corners、water-courtyard', 'Planner/Critic 都围绕这些母题判断是否满足'],
      ['palette', '推荐墙体、屋顶、门窗、地面、装饰方块', 'Designer 生成可靠方块参数'],
      ['criticRules', '风格应检查的软质量条件', '为 CriticAgent 提供可扩展评价标准']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 430, w: 460, h: 162,
    head: 'selected skill',
    text: `jiangnan-courtyard
confidence: 72%
preferredFootprint: courtyard
requiredModules:
  courtyard, garden, water_feature, roof_detail
rationale:
  江南风格 + 关键词匹配`,
    size: 9.2
  });

  panel(slide, ctx, {
    x: 595, y: 430, w: 500, h: 162,
    head: '当前选择逻辑',
    body: [
      'scoreSkill：style match +12；每个关键词 +3；水景 + 江南额外 +4。',
      '得分最高的 skill 进入 Planner/Designer/Critic。',
      '后续可以把 src/skills/buildingSkills.js 拆成独立目录：每个风格一个 skill.json + rules。'
    ],
    accent: C.green,
    bodySize: 10.2
  });
  return slide;
}
