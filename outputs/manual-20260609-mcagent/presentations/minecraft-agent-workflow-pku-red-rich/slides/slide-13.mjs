import { title, table, code, panel, C } from './theme.mjs';

export async function slide13(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'MCP 工具层：把外部能力变成 Agent 可调用接口', '当前完成的是本地工具边界和可落地接口设计；后续封装成真正 MCP server', '13 / MCP Tools');

  table(slide, ctx, {
    x: 66, y: 150,
    cols: ['MCP 工具', '接口输入', '返回结果', '在流程中的价值'],
    colWidths: [160, 310, 310, 320],
    headH: 32,
    rowH: 44,
    fontSize: 8.45,
    rows: [
      ['block_catalog', 'query: 方块用途/材质/状态语法；version=1.21', '候选方块、状态合法性、替代材质', '减少方块 ID 和 block state 错误，让 LLM 可查询再决策'],
      ['style_knowledge', 'style=江南/欧式/现代；scale；features', '风格母题、空间特征、推荐 palette', '把建筑知识从 prompt 固化为工具知识库'],
      ['blueprint_preview', 'blueprint.json 或 operations', 'HTML 预览、统计、碰撞/空洞报告', '让 Critic 看到更具体的结果证据'],
      ['world_export', 'world path；datapack path；build origin', '安装状态、reload/build 指令、错误日志', '打通 Agent 到 Minecraft 世界的最后一步']
    ]
  });

  code(slide, ctx, {
    x: 86, y: 385, w: 500, h: 154,
    head: 'planned tool call example',
    text: `style_knowledge({
  "style": "jiangnan-courtyard",
  "need": ["motifs", "palette", "criticRules"]
})
-> {
  motifs: ["white-wall-dark-roof", "water-courtyard"],
  requiredModules: ["courtyard", "water_feature"]
}`,
    size: 8.7
  });
  panel(slide, ctx, {
    x: 625, y: 385, w: 490, h: 154,
    head: '展示口径',
    body: [
      '我不会说现在已经完成完整 MCP server。',
      '我会说：系统已经把外部能力拆成清晰工具接口，并有本地 preview/report/datapack 输出作为可落地点。',
      '下一步把这些接口按 MCP 协议暴露，LLM 就能标准化调用。'
    ],
    accent: C.green,
    bodySize: 10.1
  });
  return slide;
}
