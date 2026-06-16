import { title, table, panel, C } from './theme.mjs';

export async function slide16(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, '后续展望：把框架变成更强的建筑智能体', '当前重点是框架跑通；下一阶段围绕 LLM 能力、skill 生态和 MCP 工具做增强', '16 / Roadmap');

  table(slide, ctx, {
    x: 72, y: 150,
    cols: ['阶段', '计划增强', '为什么重要', '可展示成果'],
    colWidths: [120, 380, 330, 210],
    headH: 32,
    rowH: 45,
    fontSize: 8.6,
    rows: [
      ['近期', '把 CriticAgent 换成更完整 LLM 评审：对照 prompt、skill motifs、preview/report 打分', '让 LLM 真正参与质量判断，而不是只解析文本', '评分报告 + 自动 repair 示例'],
      ['近期', '扩展 3-5 个建筑 skill：欧式庄园、现代玻璃别墅、中式四合院、日式庭院', 'skill 越丰富，Agent 能力越像可扩展工具箱', '同一 prompt 不同风格输出对比'],
      ['中期', 'Designer 增加参数搜索：多候选设计 -> Critic 选择 -> Repair 微调', '从一次生成升级为迭代优化', '多轮对比图和 score 曲线'],
      ['中期', '实现 blueprint_preview / block_catalog MCP server', '让 LLM 能通过标准协议查知识、看预览、拿证据', 'MCP 调用日志 + 工具返回结果'],
      ['长期', '接入 Minecraft 世界状态：地形、高度、周边水体、玩家位置', '建筑不再悬空生成，而是适配场地', '根据真实地形自动选址和改造'],
      ['长期', '建立评价 benchmark：风格准确、功能完整、命令合法、审美评分、运行成功率', '让项目从 demo 变成可持续迭代的研究型系统', '可量化实验表']
    ]
  });

  panel(slide, ctx, {
    x: 112, y: 520, w: 920, h: 90,
    head: '结尾可以这样收',
    body: '这个项目的核心不是“用程序搭一个房子”，而是把 LLM 放到建筑智能体中最需要判断的位置：理解需求、规划空间、评价结果、提出修正；再用 skill 和 MCP 把能力模块化、工具化、可扩展化。',
    accent: C.red,
    bodySize: 12
  });
  return slide;
}
