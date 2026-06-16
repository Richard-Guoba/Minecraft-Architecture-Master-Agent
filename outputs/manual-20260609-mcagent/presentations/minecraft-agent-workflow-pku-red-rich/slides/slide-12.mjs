import { title, table, panel, C } from './theme.mjs';

export async function slide12(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'LLM 在系统中的角色：不是流水线工人，而是方案智能', 'LLM 不直接逐块生成建筑，而是在开放性强、需要判断的节点做决策', '12 / LLM Role');

  table(slide, ctx, {
    x: 70, y: 150,
    cols: ['Agent', 'LLM 参与点', '当前实现', '后续增强方向'],
    colWidths: [160, 390, 230, 260],
    headH: 32,
    rowH: 41,
    fontSize: 8.5,
    rows: [
      ['RequirementAgent', '理解自然语言，抽取需求字段；识别隐含风格和功能', 'LLM 可用时走 schema；否则 fallback', '加入更多中文建筑语义和约束解析'],
      ['PlannerAgent', '根据字段 + skill 生成建筑语义方案：footprint、zones、adjacency、motifs', 'LLM 重点参与；fallback 保证可跑', '多候选 plan + 自评选择'],
      ['CriticAgent', '评价风格、空间、功能、审美和用户需求满足度', 'LLM 可接入；当前有规则版', '引入视觉截图/preview 证据，让 critic 更像评审老师'],
      ['RepairAgent', '读取 Critic hints 并生成修正策略', '当前规则执行', '让 LLM 生成更细 repair patch，再由程序合法化'],
      ['Designer/Blueprint', '不让 LLM 直接写大量 setblock，避免不可控和非法命令', '程序化可靠生成', 'LLM 给参数建议，程序做约束求解'],
      ['MCP/Tools', 'LLM 可以查询方块、风格知识、预览结果和世界导出状态', '当前是接口设计和本地工具边界', '封装真实 MCP server']
    ]
  });

  panel(slide, ctx, {
    x: 90, y: 460, w: 480, h: 118,
    head: '一句话概括',
    body: 'LLM 做“建筑师”和“评审”：负责理解意图、组织空间、判断质量、提出修改。程序做“施工队”：负责坐标、命令、方块合法性和数据包输出。',
    accent: C.red,
    bodySize: 11
  });
  panel(slide, ctx, {
    x: 610, y: 460, w: 480, h: 118,
    head: '为什么不让 LLM 直接输出方块',
    body: 'Minecraft 建筑需要大量精确坐标、方块状态和命令限制。LLM 直接生成容易出错；把它放在规划/评价层，可以保留创造力，同时让程序保证可执行。',
    accent: C.blue,
    bodySize: 11
  });
  return slide;
}
