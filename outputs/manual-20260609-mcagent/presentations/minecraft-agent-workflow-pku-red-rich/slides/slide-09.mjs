import { title, table, panel, code, C } from './theme.mjs';

export async function slide09(presentation, ctx) {
  const slide = presentation.slides.add();
  await title(slide, ctx, '生成建筑的程序化算法：可靠落方块', 'LLM 给语义目标，建筑算法把目标转成坐标、体块、模块和 Minecraft 命令', '09 / Algorithm');

  table(slide, ctx, {
    x: 72, y: 148,
    cols: ['算法部件', '生成方式', '和 Planner/Skill 的关系'],
    colWidths: [180, 500, 360],
    headH: 32,
    rowH: 44,
    fontSize: 8.7,
    rows: [
      ['Footprint', 'rectangle / courtyard / winged / l-shape 决定外轮廓；courtyard 会留出院落和外部水院空间', '由 Planner footprint + skill preferredFootprint 决定'],
      ['Shell', '用 fill 生成地基、外墙、楼板；按 floors 和 floorHeight 逐层堆叠', '由 Designer dimensions 和 modules 控制'],
      ['Roof', 'pagoda/flat/gabled 等风格屋顶；江南使用 dark roof + eave corners 强化飞檐', '由 styleMotifs 和 preset 决定'],
      ['Windows / Door', '按 spacing 在立面开窗，门放 south-center，避开结构边界', '由 buildElements 的尺寸和朝向参数控制'],
      ['Interior Layout', 'zones 转成房间；adjacency 转成门洞/连接关系；stairs 负责楼层连通', '直接消费 Planner 的空间规划'],
      ['Garden / Water', '庭院路径、树篱、花坛、水池模块按地块生成', '来自 Jiangnan skill 的 requiredModules']
    ]
  });

  code(slide, ctx, {
    x: 92, y: 465, w: 455, h: 118,
    head: 'coordinate mindset',
    text: `origin = player position
x: width direction
y: vertical levels
z: depth direction
all operations stay inside bounded boxes
Validator catches invalid ids / large fill volume`,
    size: 9.3
  });
  panel(slide, ctx, {
    x: 590, y: 465, w: 505, h: 118,
    head: '当前局限',
    body: '初版算法更偏“规则生成的可运行建筑”：风格可见、结构完整，但体块变化、曲线水岸、复杂屋脊、室内审美仍较粗。后续重点是把 LLM 评审和参数搜索接进来，让它能迭代形态。',
    accent: C.red,
    bodySize: 10.4
  });
  return slide;
}
