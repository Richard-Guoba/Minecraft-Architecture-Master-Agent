import { base, code, panel, tag, arrow, C, F } from './theme.mjs';

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  await base(slide, ctx, '01 / 项目定位');
  ctx.addText(slide, { text: 'Minecraft LLM 建筑智能体', x: 98, y: 55, w: 760, h: 52, fontSize: 31, color: C.ink, typeface: F.title });
  ctx.addText(slide, { text: '从中文自然语言需求到 Minecraft Java 1.21 数据包：理解、规划、生成、评审、修正、导出', x: 100, y: 116, w: 960, h: 26, fontSize: 14.5, color: C.gray, typeface: F.body });
  code(slide, ctx, { x: 94, y: 170, w: 660, h: 82, head: 'demo prompt', text: '建一个江南两层小院，白墙黑瓦，带水池，室内有卧室客厅厨房', size: 13.4 });
  panel(slide, ctx, { x: 790, y: 170, w: 390, h: 92, head: '核心定位', body: 'LLM 负责建筑方案智能；程序化工具负责坐标、方块、数据包与可复现执行。', accent: C.red, bodySize: 10.8 });
  flowChart(slide, ctx);
  tableLike(slide, ctx);
  return slide;
}

function flowChart(slide, ctx) {
  const y = 303;
  const w = 100;
  const nodes = [
    ['Requirement', 56, C.red],
    ['Skill', 184, C.red],
    ['Planner', 312, C.red],
    ['Designer', 440, C.gray],
    ['Blueprint', 568, C.gray],
    ['Validate', 696, C.gray],
    ['Critic', 824, C.red],
    ['Export', 1070, C.green]
  ];
  for (let i = 0; i < nodes.length; i += 1) {
    const [name, x, color] = nodes[i];
    tag(slide, ctx, name, x, y, w, color);
    if (i < 6) arrow(slide, ctx, x + w, y + 13, nodes[i + 1][1] - 2, y + 13, C.gray);
  }

  arrow(slide, ctx, 924, y + 13, 1068, y + 13, C.gray);
  ctx.addText(slide, { text: '通过 / 无需修正', x: 942, y: 281, w: 112, h: 16, fontSize: 8.8, color: C.gray, typeface: F.body, align: 'center' });

  tag(slide, ctx, 'Repair', 824, 360, w, C.gray);
  ctx.addShape(slide, { x: 873, y: 331, w: 2, h: 26, fill: C.red });
  ctx.addText(slide, { text: 'v', x: 866, y: 344, w: 16, h: 20, fontSize: 14, color: C.red, bold: true, typeface: F.body, align: 'center' });
  ctx.addText(slide, { text: '发现问题', x: 884, y: 338, w: 72, h: 16, fontSize: 8.8, color: C.red, typeface: F.body });

  ctx.addShape(slide, { x: 490, y: 392, w: 334, h: 2, fill: C.red });
  ctx.addShape(slide, { x: 489, y: 331, w: 2, h: 61, fill: C.red });
  ctx.addText(slide, { text: '^', x: 482, y: 325, w: 16, h: 20, fontSize: 14, color: C.red, bold: true, typeface: F.body, align: 'center' });
  ctx.addText(slide, { text: 'revision 后重跑 Designer -> Blueprint -> Validate -> Critic', x: 506, y: 399, w: 390, h: 17, fontSize: 8.8, color: C.red, typeface: F.body });
}

function tableLike(slide, ctx) {
  const rows = [
    ['输入', '中文 prompt、可选世界路径、mode=auto/mock/llm'],
    ['中间产物', 'requirement.json 语义字段、skill 选择、planner plan、design 参数、blueprint operations'],
    ['输出', 'architect_datapack、build.mcfunction、clear.mcfunction、blueprint.json、preview.html、run_report.md'],
    ['亮点', 'LLM 不直接吐 setblock；skill 约束风格；Critic/Repair 形成评价修正闭环；MCP 预留工具边界']
  ];
  for (let i = 0; i < rows.length; i += 1) {
    const y = 455 + i * 40;
    ctx.addShape(slide, { x: 112, y, w: 170, h: 36, fill: C.red, line: ctx.line('#FFFFFF', 1) });
    ctx.addText(slide, { text: rows[i][0], x: 130, y: y + 9, w: 134, h: 16, fontSize: 11.5, color: '#FFFFFF', bold: true, typeface: F.body });
    ctx.addShape(slide, { x: 282, y, w: 840, h: 36, fill: i % 2 ? C.pale : '#FFFFFF', line: ctx.line(C.line, 1) });
    ctx.addText(slide, { text: rows[i][1], x: 300, y: y + 8, w: 806, h: 18, fontSize: 11.3, color: C.text, typeface: F.body });
  }
}
