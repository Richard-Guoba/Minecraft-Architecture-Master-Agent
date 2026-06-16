import { title, table, code, panel, C } from './theme.mjs';

export async function slide08(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'BlueprintAgent：按模块生成可执行方块蓝图', 'Blueprint 不再理解自然语言，只消费设计参数，稳定生成 fill / setblock 操作', '08 / BlueprintAgent');

  table(slide, ctx, {
    x: 72, y: 150,
    cols: ['子 Agent', '负责内容', '本次交付', '为什么这样拆'],
    colWidths: [160, 360, 260, 260],
    headH: 32,
    rowH: 46,
    fontSize: 8.6,
    rows: [
      ['ShellAgent', 'foundation、walls、floors、roof、roof_detail、windows、door', '2 层内部空间；主门 south；屋顶飞檐细节', '把结构壳体和外观稳定生成'],
      ['LayoutAgent', '根据 zones/adjacency 生成房间、室内门、楼梯开洞', '8 个功能区；4 个室内门；1 个楼板开洞', '让 Planner 的空间规划真正落到建筑内部'],
      ['FurnishingAgent', '卧室/客厅/厨房/书房的基础家具、灯光、装饰', '24 处家具/装饰；8 处照明', '让建筑不是空壳，能体现功能区'],
      ['GardenAgent', '庭院、水景、花坛、树篱、路径', '地块 (-3,14)-(17,18)；path/hedge/flower_beds/water_feature', '把江南 skill 的水院母题具象化']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 400, w: 470, h: 154,
    head: 'module order',
    text: `foundation -> walls -> floors -> roof
-> roof_detail -> windows -> door
-> courtyard -> interior -> stairs
-> furnishing -> lighting -> garden -> water_feature`,
    size: 10
  });
  panel(slide, ctx, {
    x: 608, y: 400, w: 485, h: 154,
    head: '操作模型',
    body: [
      'fill：适合墙体、楼板、屋顶层、地基等连续体块，命令少、可读性强。',
      'setblock：适合门、灯、家具、玻璃、局部装饰等离散对象。',
      '本次：142 条命令 = 98 条 fill + 44 条 setblock。'
    ],
    accent: C.green,
    bodySize: 10.6
  });
  return slide;
}
