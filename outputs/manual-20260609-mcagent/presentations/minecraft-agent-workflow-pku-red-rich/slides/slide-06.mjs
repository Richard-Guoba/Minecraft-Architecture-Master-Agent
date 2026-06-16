import { title, table, code, panel, C } from './theme.mjs';

export async function slide06(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'PlannerAgent：LLM 开始参与“建筑方案规划”', '字段表之后，Planner 补出空间组织、动线关系和风格母题；这一步已经不是简单抽字段', '06 / PlannerAgent');

  table(slide, ctx, {
    x: 70, y: 150,
    cols: ['输入上下文', 'Planner 需要解决的问题', '输出给谁使用'],
    colWidths: [300, 430, 310],
    headH: 32,
    rowH: 42,
    fontSize: 8.9,
    rows: [
      ['requirement 字段表\nstyle/scale/floors/features/materials', '用户真正想要什么建筑？哪些功能必须出现？哪些材料是强偏好？', 'Designer：尺寸、palette、模块'],
      ['selectedSkill\npreferredFootprint/requiredModules/motifs', '这个风格应该长成什么空间形态？哪些母题不能缺？', 'Blueprint：按模块落方块'],
      ['原始 prompt', '自然语言里是否有字段表没覆盖的意图，比如“水乡”“小院”“黑瓦”？', 'Critic：对照评价目标']
    ]
  });

  table(slide, ctx, {
    x: 70, y: 340,
    cols: ['Planner 输出字段', '本次运行结果', '后续影响'],
    colWidths: [200, 500, 340],
    headH: 32,
    rowH: 34,
    fontSize: 8.6,
    rows: [
      ['footprint.type', 'courtyard', 'Designer 选择院落式尺寸；Blueprint 打开庭院/水景模块'],
      ['zones', 'entry, living, kitchen, bedroom, stairs, study, garden, water', 'LayoutAgent 把语义区转成房间与庭院地块'],
      ['adjacency', 'entry-living, living-kitchen, living-garden, garden-water ...', '确定门洞、连通关系、动线优先级'],
      ['circulation', 'entry, stairs, publicCore', '决定入口、楼梯和公共核心的相对位置'],
      ['styleMotifs', 'white-wall-dark-roof, courtyard-axis, eave-corners, water-courtyard', 'Critic 检查风格是否真的被表达'],
      ['evaluationGoals', '风格、功能、空间完整性、非盒子感', '后续软评价的目标集合']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 572, w: 850, h: 62,
    head: '',
    text: 'footprint=courtyard | zones=entry,living,kitchen,bedroom,stairs,study,garden,water | adjacency=entry-living,living-kitchen,living-garden,garden-water | motifs=white-wall-dark-roof,courtyard-axis,eave-corners,water-courtyard',
    size: 7.9
  });
  panel(slide, ctx, { x: 972, y: 572, w: 170, h: 62, head: '', body: '讲法：LLM 像方案建筑师，先给空间意图。', accent: C.red, bodySize: 9.4 });
  return slide;
}
