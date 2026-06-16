import { title, table, panel, C } from './theme.mjs';

export async function slide10(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'Validator + Critic + Repair：生成-评价-修正闭环', '这是让系统更像 Agent 的关键：不只是一次性生成，而是检查、评价并尝试修正', '10 / Evaluate & Repair');

  table(slide, ctx, {
    x: 70, y: 150,
    cols: ['层次', '检查对象', '典型规则', '输出'],
    colWidths: [120, 270, 470, 180],
    headH: 32,
    rowH: 41,
    fontSize: 8.6,
    rows: [
      ['硬校验', '方块 ID', '必须匹配 minecraft:xxx 或带合法状态语法', 'errors/warnings'],
      ['硬校验', '坐标/命令体积', '坐标必须为整数；单条 fill 体积不能超过 Minecraft 限制', '可执行性'],
      ['硬校验', '模块完整性', 'skill.requiredModules 不能缺；interior/stairs/furnishing 结构要一致', '结构可靠性'],
      ['软评价', '风格满足度', '江南是否有白墙黛瓦、庭院轴线、水院、飞檐等', 'score/issues'],
      ['软评价', '功能满足度', '用户要的卧室/客厅/厨房/楼梯是否真实出现', 'strengths/issues'],
      ['修正', 'repairHints', '缺水景 -> 开启 water_feature；缺庭院 -> forceFootprint=courtyard；现代弱 -> 大窗/平屋顶', 'repair patch']
    ]
  });

  panel(slide, ctx, {
    x: 92, y: 450, w: 480, h: 132,
    head: '本次运行结果',
    body: [
      'Validator：通过，无 warning。',
      'Critic：100/100，理由是 courtyard、garden、8 个室内功能区都已出现。',
      'Repair：未触发。现场可以说明 critic 初版偏保守，下一步要换成更强 LLM 视觉/语义评审。'
    ],
    accent: C.green,
    bodySize: 10.2
  });
  panel(slide, ctx, {
    x: 615, y: 450, w: 480, h: 132,
    head: '如果 Critic 发现问题',
    body: [
      'score < threshold 或 issues 非空时，RepairAgent 写入 revision。',
      'Designer/Blueprint/Validator/Critic 会重新跑一轮。',
      '因此这个框架已经具备“自我评审 + 一次修正”的闭环形态。'
    ],
    accent: C.red,
    bodySize: 10.2
  });
  return slide;
}
