import { title, imageFrame, panel, asset, C } from './theme.mjs';

export async function slide15(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'Minecraft 效果：内部空间与功能区', '截图页可以边指边讲：系统不是只生成外壳，还尝试把 Planner 的 zones 落成房间和家具', '15 / Interior');

  await imageFrame(slide, ctx, {
    path: asset(ctx, 'assets/mc-shot-2.png'),
    x: 70, y: 150, w: 500, h: 310,
    caption: '内部视角：楼层、门洞、照明和家具开始表达功能区'
  });
  await imageFrame(slide, ctx, {
    path: asset(ctx, 'assets/mc-shot-4.png'),
    x: 610, y: 150, w: 500, h: 310,
    caption: '结构视角：房间划分、楼梯连通和庭院关系'
  });

  panel(slide, ctx, {
    x: 92, y: 520, w: 440, h: 90,
    head: '和 Planner 的对应',
    body: 'zones=entry/living/kitchen/bedroom/stairs/study/garden/water；Layout/Furnishing 把这些语义区转为房间、门洞、楼梯和装饰。',
    accent: C.blue,
    bodySize: 10.4
  });
  panel(slide, ctx, {
    x: 615, y: 520, w: 440, h: 90,
    head: '效果说明',
    body: '目前能说明“功能存在”，但离真正好看的室内设计还有距离；后续需要更多家具规则、房间模板和截图驱动的 Critic。',
    accent: C.red,
    bodySize: 10.4
  });
  return slide;
}
