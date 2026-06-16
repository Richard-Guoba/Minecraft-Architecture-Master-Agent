import { title, table, code, panel, C } from './theme.mjs';

export async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, '一次真实运行：过程、产物与可复现证据', '这页用于现场展示命令执行后，系统到底生成了哪些中间结果和文件', '03 / Demo Run');

  code(slide, ctx, {
    x: 72, y: 154, w: 1035, h: 64,
    head: 'input prompt',
    text: '建一个江南两层小院，白墙黑瓦，带水池，室内有卧室客厅厨房',
    size: 13
  });

  table(slide, ctx, {
    x: 72, y: 246,
    cols: ['运行节点', '本次输出', '可讲的含义'],
    colWidths: [180, 378, 486],
    headH: 32,
    rowH: 38,
    fontSize: 8.8,
    rows: [
      ['Requirement', 'style=江南；scale=small；floors=2；features=白墙/黛瓦/飞檐/水景/室内功能', '中文描述被压缩成结构化需求，后续 Agent 不再读散乱文本'],
      ['SkillRouter', 'selectedSkill=jiangnan-courtyard；confidence=72%；requiredModules=courtyard/garden/water_feature/roof_detail', 'skill 把“江南”变成必须出现的建筑能力约束'],
      ['Planner', 'footprint=courtyard；zones=entry/living/kitchen/bedroom/stairs/study/garden/water', 'LLM/规划层开始决定空间组织，而不是只抽字段'],
      ['Designer', 'size=21x16x22；roof=pagoda height 5；window=2x2 spacing 6；wall=white_concrete', '语义方案被转换成可执行的参数表'],
      ['Blueprint', 'modules=14；commands=142；fill=98；setblock=44', '指标放回工程上下文：命令数来自模块化生成，而不是孤立炫数字'],
      ['Validate/Critic', '硬校验通过；软质量 100/100；本次未触发 repair', '可以说明目前 critic 初版偏规则化，未来要引入更强 LLM 评审']
    ]
  });

  panel(slide, ctx, {
    x: 94, y: 560, w: 505, h: 72,
    head: '导出目录',
    body: 'architect_datapack / build.mcfunction / clear.mcfunction / raw_build.mcfunction / blueprint.json / preview.html / run_report.md',
    accent: C.green,
    bodySize: 10.4
  });
  panel(slide, ctx, {
    x: 626, y: 560, w: 505, h: 72,
    head: 'Minecraft 现场命令',
    body: '/reload -> /function architect:clear -> /function architect:build；mcfunction 内部命令本身不带斜杠。',
    accent: C.blue,
    bodySize: 10.4
  });
  return slide;
}
