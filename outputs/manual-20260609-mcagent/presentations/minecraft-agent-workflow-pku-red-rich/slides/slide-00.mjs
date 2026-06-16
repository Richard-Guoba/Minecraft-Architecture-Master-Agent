import { asset, C, F } from './theme.mjs';

export async function slide00(presentation, ctx) {
  const slide = presentation.slides.add();
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: '#FFFFFF' });
  ctx.addShape(slide, { x: 0, y: 0, w: 110, h: ctx.H, fill: C.red });
  ctx.addShape(slide, { x: 110, y: 0, w: 14, h: ctx.H, fill: C.redDark });
  ctx.addShape(slide, { x: 160, y: 600, w: 960, h: 10, fill: C.red });
  await ctx.addImage(slide, { path: asset(ctx, 'assets/pku-logo.png'), x: 930, y: 52, w: 240, h: 68, fit: 'contain' });

  ctx.addText(slide, {
    text: 'Minecraft LLM 建筑智能体',
    x: 175, y: 190, w: 860, h: 62,
    fontSize: 36, color: C.ink, typeface: F.title, bold: true
  });
  ctx.addText(slide, {
    text: '工作流程、LLM 作用、Skill 与 MCP 工具层',
    x: 178, y: 268, w: 820, h: 36,
    fontSize: 20, color: C.redDark, typeface: F.body
  });
  ctx.addText(slide, {
    text: '课程项目汇报',
    x: 180, y: 345, w: 320, h: 28,
    fontSize: 16, color: C.gray, typeface: F.body
  });
  ctx.addText(slide, {
    text: '汇报人：XXX',
    x: 180, y: 430, w: 360, h: 28,
    fontSize: 16, color: C.text, typeface: F.body
  });
  ctx.addText(slide, {
    text: '日期：2026 年 6 月 9 日',
    x: 180, y: 470, w: 420, h: 28,
    fontSize: 16, color: C.text, typeface: F.body
  });
  ctx.addText(slide, {
    text: '从自然语言需求到 Minecraft Java 1.21 数据包的生成、评价与修正闭环',
    x: 180, y: 630, w: 830, h: 24,
    fontSize: 13, color: C.gray, typeface: F.body
  });
  return slide;
}
