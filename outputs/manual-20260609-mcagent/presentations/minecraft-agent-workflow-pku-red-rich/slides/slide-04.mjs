import { title, table, code, panel, C } from './theme.mjs';

export async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'RequirementAgent：把自然语言压成字段表', '第一步不是生成建筑，而是把模糊需求变成后续 Agent 可以消费的契约', '04 / Requirement');

  table(slide, ctx, {
    x: 70, y: 154,
    cols: ['字段', '来源/生成方式', '本次示例'],
    colWidths: [150, 390, 470],
    headH: 32,
    rowH: 37,
    fontSize: 8.9,
    rows: [
      ['style', 'LLM schema 或 fallback 正则匹配：江南/欧式/现代/中式等', '江南'],
      ['scale / floors', '识别“小院/别墅/庄园”和“两层/三层”等尺度词', 'small；2 floors'],
      ['features', '从自然语言中保留可建筑化的元素词', '白墙、黛瓦、飞檐、小花园、水景、室内功能'],
      ['materials', '材料 hint 映射：白墙、黑瓦、玻璃、木门等', 'white_concrete；deepslate_tiles；spruce_door'],
      ['rooms / functions', '卧室、客厅、厨房、书房、楼梯等功能词', 'bedroom、living、kitchen、study、stairs'],
      ['constraints', '用户限制：尺寸、版本、坐标、不要某类方块等', '当前 prompt 未显式给出'],
      ['notes', '保留原始 prompt，便于 report 和 critic 回看', '完整中文需求']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 458, w: 485, h: 148,
    head: 'requirement snapshot',
    text: `{
  "style": "江南",
  "scale": "small",
  "floors": 2,
  "features": ["白墙", "黛瓦", "飞檐", "水景", "室内功能"],
  "materials": ["minecraft:white_concrete", "minecraft:deepslate_tiles"]
}`,
    size: 8.9
  });

  panel(slide, ctx, {
    x: 620, y: 458, w: 475, h: 148,
    head: '为什么先做字段表',
    body: [
      '1. 降低后续 Agent 的输入噪声，让规划、设计、校验都读同一份结构。',
      '2. LLM 可用时给出更细语义；离线时 fallback 保证 demo 能跑。',
      '3. 字段表不是终点：Planner 会继续补空间组织和建筑意图。'
    ],
    accent: C.red,
    bodySize: 10.2
  });
  return slide;
}
