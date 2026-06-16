import { title, table, code, footnote, C } from './theme.mjs';

export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, '总体工作流：Prompt 到 Minecraft 数据包', '代码主线在 src/pipeline.js：每个 Agent 交付一个可检查的中间产物', '02 / Workflow');

  table(slide, ctx, {
    x: 72, y: 158,
    cols: ['阶段', '主要职责', '核心产物', 'LLM 参与'],
    colWidths: [148, 430, 330, 120],
    headH: 34,
    rowH: 40,
    fontSize: 8.8,
    rows: [
      ['RequirementAgent', '理解中文需求，抽取风格、层数、功能、材料、限制', 'requirement 字段表', '可用'],
      ['SkillRouterAgent', '按风格与关键词选择建筑 skill，并给出 confidence/rationale', 'selectedSkill + skill config', '规则/可扩展'],
      ['PlannerAgent', '补全 footprint、空间分区、邻接关系、动线、风格母题', 'semantic plan', '重点'],
      ['DesignerAgent', '把语义方案翻译成尺寸、palette、元素规格、模块列表', 'design parameters', '当前程序化'],
      ['BlueprintAgent', '按模块生成 fill/setblock 操作，拆成 shell/layout/furnishing/garden', 'blueprint operations', '程序化'],
      ['ValidatorAgent', '检查方块 ID、坐标、模块、命令体积、内部结构', 'validation report', '程序化'],
      ['CriticAgent', '从审美和需求满足度评价：风格是否像、功能是否够、是否太盒子', 'score + issues + repairHints', '重点'],
      ['RepairAgent', '根据 critic hints 做一次轻量修正：加模块、改 footprint、强化元素', 'repair patch', '规则执行'],
      ['ExportAgent', '导出 datapack、mcfunction、preview、blueprint.json、run_report', '可运行交付物', '程序化']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 560, w: 790, h: 70,
    head: 'demo command',
    text: 'npm start -- --mode mock --out outputs/.../demo-run "建一个江南两层小院，白墙黑瓦，带水池，室内有卧室客厅厨房"',
    size: 9.4
  });

  ctx.addShape(slide, { x: 910, y: 560, w: 255, h: 70, fill: C.pale, line: ctx.line(C.red, 1) });
  ctx.addText(slide, { text: '讲解重点：不是单向流水线，而是生成-评价-修正的 Agent 框架。', x: 926, y: 578, w: 222, h: 34, fontSize: 10.2, color: C.text, typeface: 'Microsoft YaHei', valign: 'mid' });
  footnote(slide, ctx, '后续丰富时，只要替换/增强某个 Agent 或 skill，不需要推倒整个流程。');
  return slide;
}
