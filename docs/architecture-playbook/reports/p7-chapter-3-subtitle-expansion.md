# P7 第三章字幕知识扩展检查点

状态：第三章字幕优先知识扩展进行中；order 14 已完成，未声称完成人工视觉证据或规则晋级

## 本次完成范围

第三章 `complete-roofs` 的 course order 13 `BV1WhkbYeE5k` 属于原六集黄金语料，没有重复处理。新课次 order 14 `BV1h1keYbEMd` 已按顺序完成媒体与 ASR：

- 媒体：75,106,187 bytes；SHA-256 `a764e0ae87f973776653583a5dbd7eafd75a1cc3a0a7ad3bd84007305f4cc5ca`
- 字幕草稿：519 段，1,281,509 ms；segment index SHA-256 `ecee8090a2fd607d8c76f976d16d2b048710b5ce1d366fd41164ecc2328dda51`
- ledger：`pending → media-verified → asr-complete`

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

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 已加入 `roof_axis_candidate`、`roof_component_budget`、`compound_roof_graph`、`roof_seam_repair`、`roof_profile_phases` 和 `even_span_closure`，并用本集远近景案例补强已有 `close-distant-evaluation` 来源。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定三个已进入字幕知识产物的章节、10 个有效来源和 25 条有界意图。order 14 新增 4 条：

- `knowledge:p7:roof-orientation-massing-fit`
- `knowledge:p7:compound-roof-seam-cleanup`
- `knowledge:p7:adaptive-roof-profile`
- `knowledge:p7:even-span-roof-closure`

规范内容 SHA-256 固定为 `96ad270f860a8840914cf21b80cf0ddd5b607df8e4ddf21a09b2219c26042ad0`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第三章最后一个尚未学习的课次是 course order 15 `2.3 屋顶优化`：

```bash
npm run playbook:evidence -- media --bvid BV1unj9z4EnW
```
