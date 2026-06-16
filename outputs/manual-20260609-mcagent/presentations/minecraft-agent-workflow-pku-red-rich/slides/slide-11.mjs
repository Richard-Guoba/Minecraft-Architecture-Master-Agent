import { title, table, code, panel, C } from './theme.mjs';

export async function slide11(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'ExportAgent：把蓝图变成 Minecraft 可运行交付物', '最后一步不只是保存命令，而是输出数据包、预览、蓝图 JSON 和报告，方便复现与展示', '11 / Export');

  code(slide, ctx, {
    x: 82, y: 148, w: 430, h: 250,
    head: 'output tree',
    text: `run/
  architect_datapack/
    pack.mcmeta                 # pack_format 48
    data/architect/function/
      build.mcfunction
      clear.mcfunction
      load.mcfunction           # optional
      tick.mcfunction           # optional
  raw_build.mcfunction
  blueprint.json
  preview.html
  run_report.md`,
    size: 8.9
  });

  table(slide, ctx, {
    x: 540, y: 148,
    cols: ['文件', '作用', '展示时怎么讲'],
    colWidths: [170, 285, 270],
    headH: 32,
    rowH: 38,
    fontSize: 8.6,
    rows: [
      ['build.mcfunction', '真正执行的 fill/setblock 序列', '这是 Agent 到 Minecraft 世界的最后一公里'],
      ['clear.mcfunction', '按建筑 bounds 清理区域', '方便重复演示和迭代'],
      ['blueprint.json', '保存结构化蓝图与 operations', '后续可用于预览、分析、二次编辑'],
      ['preview.html', '浏览器里查看统计和基础预览', '未来可升级为 MCP preview 工具'],
      ['run_report.md', '记录每个 Agent 的结果', '讲解流程时最有用的证据链'],
      ['pack.mcmeta', 'Minecraft 数据包元信息', 'Java 1.21 对应 pack_format 48']
    ]
  });

  panel(slide, ctx, {
    x: 124, y: 455, w: 900, h: 92,
    head: '游戏内执行路径',
    body: '创建创造超平坦世界并开启作弊 -> 把 architect_datapack 放到 saves/<世界名>/datapacks -> /reload -> /function architect:clear -> /function architect:build',
    accent: C.red,
    bodySize: 12
  });
  return slide;
}
