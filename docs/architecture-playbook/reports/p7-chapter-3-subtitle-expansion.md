# P7 第三章字幕知识扩展检查点

状态：第三章字幕优先知识扩展已完成；未声称完成人工视觉证据或规则晋级

## 本次完成范围

第三章 `complete-roofs` 的 course order 13 `BV1WhkbYeE5k` 属于原六集黄金语料，没有重复处理。新课次 order 14 `BV1h1keYbEMd` 和 order 15 `BV1unj9z4EnW` 已分别按顺序完成媒体与 ASR：

- order 14 媒体：75,106,187 bytes；SHA-256 `a764e0ae87f973776653583a5dbd7eafd75a1cc3a0a7ad3bd84007305f4cc5ca`
- order 14 字幕草稿：519 段，1,281,509 ms；segment index SHA-256 `ecee8090a2fd607d8c76f976d16d2b048710b5ce1d366fd41164ecc2328dda51`
- order 15 媒体：79,977,685 bytes；SHA-256 `9c8091befadda39a3d4af6455d1f9fa6452ea7f62eb5b0abf67bc7f7c3360a64`
- order 15 字幕草稿：858 段，1,349,219 ms；segment index SHA-256 `c878fca7f26b87241b56b40aceb8afd318111ee8452192209d56f31407b82635`
- 两集 ledger：`pending → media-verified → asr-complete`

每次推进前都重新打开并校验了当前阶段的精确产物。媒体、完整字幕和工作证据只保存在忽略的 `.local/architecture-playbook/`，未进入 Git。正式 `events-indexed` 和 `visual-reviewed` 仍要求人工证据，本轮没有自动推进或伪造批准。

## 原创知识产物

[2.2 屋顶变例](../course/notes/heihui-jileniao/BV1h1keYbEMd.md) 从字幕归纳出：

- 按候选屋顶的最终高度、山面和轮廓选择屋脊朝向，不建立固定长边或短边规则；
- 把包边、屋脊与叠加雕饰纳入屋顶总高预算；
- 用与下部体块或开口对应的组件组合 L、T、十字屋面、次级屋顶和老虎窗，并清理重叠与断缝；
- 用有序坡度阶段表达变陡、变缓和曲线，并按尺度选择方块形态；
- 用偏移屋脊、改变坡度节奏、短平顶或顶部次级结构处理偶数跨度；
- 分别在近景和远景检查接缝、轮廓与材质纹理密度。

本集没有提供跨度到坡度、屋脊高度、曲线阶段或收口宽度的通用数值；字幕中存在歧义的风格术语没有进入 advisory。

[2.3 屋顶优化](../course/notes/heihui-jileniao/BV1unj9z4EnW.md) 从字幕归纳出：

- 大型或渐变坡面在楼梯层列产生横纹、锯齿或比例错位时，可用整砖建立主坡面；
- 整砖扩展颜色库存，但强纹理材料仍需按尺度和观察距离检查；
- 把屋顶细节集中在有界焦点和边线，让繁复区域与干净屋面形成对比；
- 从整砖基础进行有边界的挖补，再用部分方块过渡曲面；
- 现代平顶或露台需求可以用平面与女儿墙结束，不强制添加坡顶。

本集没有给出整砖/楼梯切换跨度、细节密度或曲率阈值；自由雕刻口语没有被翻译成无界随机生成，模组和特殊调试手法也没有成为数据包依赖。

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 已加入 `roof_axis_candidate`、`roof_component_budget`、`compound_roof_graph`、`roof_seam_repair`、`roof_profile_phases`、`even_span_closure`、`large_roof_full_block_surface`、`roof_detail_mask` 和 `flat_roof_with_parapet`，并补强已有远近景和自适应屋顶证据。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定三个已进入字幕知识产物的章节、11 个有效来源和 28 条有界意图。order 14 新增 4 条：

- `knowledge:p7:roof-orientation-massing-fit`
- `knowledge:p7:compound-roof-seam-cleanup`
- `knowledge:p7:adaptive-roof-profile`
- `knowledge:p7:even-span-roof-closure`

order 15 新增 3 条，并为 `knowledge:p7:adaptive-roof-profile` 增加本集来源：

- `knowledge:p7:large-roof-full-block-surface`
- `knowledge:p7:roof-detail-density-contrast`
- `knowledge:p7:modern-flat-roof-option`

规范内容 SHA-256 固定为 `74a2c75c39237b3aeafdabeb6d52f49f6d49fdc9e50a2192a74370c0e112536e`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第三章字幕优先范围已完成。第四章 `complete-walls-facades` 的 course order 16 属于原六集黄金语料，不重复处理；下一个尚未学习的课次是 course order 17 `3.2 墙面雕花`：

```bash
npm run playbook:evidence -- media --bvid BV1ZJTLzgEdm
```
