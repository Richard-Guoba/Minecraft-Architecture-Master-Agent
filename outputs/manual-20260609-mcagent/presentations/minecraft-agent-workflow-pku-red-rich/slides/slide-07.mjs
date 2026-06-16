import { title, table, code, panel, C } from './theme.mjs';

export async function slide07(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'DesignerAgent：从语义方案到详细参数表', '当前 Designer 主要是确定性生成：合并 requirement + skill + plan，输出 Blueprint 可执行参数', '07 / DesignerAgent');

  table(slide, ctx, {
    x: 70, y: 148,
    cols: ['函数/环节', '输入', '生成内容', '本次结果'],
    colWidths: [160, 250, 350, 280],
    headH: 32,
    rowH: 39,
    fontSize: 8.5,
    rows: [
      ['pickPreset', 'style=江南；skill=jiangnan-courtyard', '选择风格预设：材料、屋顶、窗门、庭院倾向', 'jiangnan preset'],
      ['buildDimensions', 'scale=small；floors=2；footprint=courtyard', '宽/高/深、层高、屋顶高度、庭院尺度', '21 x 16 x 22'],
      ['buildPalette', 'materials hints + style preset', '墙、柱、地板、屋顶、门窗、水、花园材料', 'white_concrete / deepslate_tiles / spruce_planks'],
      ['buildElements', 'plan motifs + requirement features', 'wall/floor/door/window/roof 详细规格', 'pagoda roof h=5；window 2x2 spacing 6'],
      ['buildModules', 'skill.requiredModules + features', '打开 foundation/walls/roof/interior/garden/water 等模块', '14 modules']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 385, w: 470, h: 182,
    head: 'design parameter snapshot',
    text: `targetVersion: Minecraft Java 1.21
pack_format: 48
wall: minecraft:white_concrete, thickness=1
floor: minecraft:spruce_planks, levels=2
door: minecraft:spruce_door, south-center, 1x2
roof: minecraft:deepslate_tiles, pagoda, height=5
window: minecraft:glass_pane, 2x2, spacing=6`,
    size: 8.7
  });

  panel(slide, ctx, {
    x: 610, y: 385, w: 480, h: 182,
    head: '这里 LLM 参与了吗？',
    body: [
      '当前版本：DesignerAgent 本身不直接调用 LLM。',
      '它消费 PlannerAgent 的语义规划，把“院落、动线、母题”翻译成确定参数。',
      '这样做的好处是：LLM 负责开放性决策，程序负责坐标和方块的可靠性。',
      '后续增强：让 LLM 生成候选参数，Designer 做约束求解和合法化。'
    ],
    accent: C.blue,
    bodySize: 10.1
  });
  return slide;
}
