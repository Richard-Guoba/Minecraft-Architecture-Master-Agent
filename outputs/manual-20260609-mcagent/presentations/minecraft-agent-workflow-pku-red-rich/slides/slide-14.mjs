import { title, imageFrame, panel, asset, C } from './theme.mjs';

export async function slide14(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, 'Minecraft 效果：外观与风格表达', '这里放游戏截图：重点说明白墙黛瓦、院落、水景已经可见，同时指出初版体块仍偏规则', '14 / MC Result');

  await imageFrame(slide, ctx, {
    path: asset(ctx, 'assets/mc-shot-1.png'),
    x: 70, y: 150, w: 500, h: 310,
    caption: '外观视角：白墙、黑瓦、两层小院、门窗和屋顶轮廓'
  });
  await imageFrame(slide, ctx, {
    path: asset(ctx, 'assets/mc-shot-3.png'),
    x: 610, y: 150, w: 500, h: 310,
    caption: '环境视角：庭院/水景模块把江南 skill 具象化'
  });

  panel(slide, ctx, {
    x: 92, y: 520, w: 440, h: 90,
    head: '已经做到',
    body: '风格关键词被转成可见元素：白墙、黑瓦、飞檐意向、院落轴线、水景和入口。它证明流程能从中文需求跑到 MC 世界。 ',
    accent: C.green,
    bodySize: 10.5
  });
  panel(slide, ctx, {
    x: 615, y: 520, w: 440, h: 90,
    head: '目前局限',
    body: '体块变化和细节层次还有限，水岸、屋脊和庭院景观偏规则化；后续会用 Critic + Repair 让系统自动提出并执行细化。 ',
    accent: C.red,
    bodySize: 10.5
  });
  return slide;
}
