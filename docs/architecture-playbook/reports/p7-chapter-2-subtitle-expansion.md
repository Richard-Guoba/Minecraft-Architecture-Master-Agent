# P7 第二章字幕知识扩展检查点

状态：course order 10–11 已完成字幕提取、归纳和建造意图接入；未声称完成人工视觉证据或规则晋级

## 本次完成范围

第二章 `complete-structure` 的 course order 8 `BV1fNkgYBEyy` 和 order 9 `BV1HhEuzZEyZ` 属于原六集黄金语料，没有重复处理。两个新课次 order 10 `BV1ecj4zsE27` 和 order 11 `BV1Mp7UzyE3P` 已分别按顺序完成媒体与 ASR：

- order 10 媒体：70,421,388 bytes；SHA-256 `77ac2147486daec53b50e270e7a7faa1027e11471cdb9e0393e32115a24047cf`
- order 10 字幕草稿：508 段，1,180,502 ms；segment index SHA-256 `ab0fcdcedaad859fee03bb9544bc3a4924889b635804a07de1d74185e46581b0`
- order 11 媒体：46,918,343 bytes；SHA-256 `48984745b90d5abe31fdbaadfc74e15850f076f0c042bd7b9aa21fde6ef4188f`
- order 11 字幕草稿：411 段，798,116 ms；segment index SHA-256 `703286ac4ed5ebd3a5463f6dfa0b480fa6af59d022d786b5342d7415f38030c5`
- 两集 ledger：`pending → media-verified → asr-complete`

每次推进前都重新打开并校验了当前阶段的精确产物。媒体、完整字幕和工作证据只保存在忽略的 `.local/architecture-playbook/`，未进入 Git。正式 `events-indexed` 和 `visual-reviewed` 仍要求人工证据，本轮没有自动推进或伪造批准。

## 原创知识产物

[1.3 结构的加法](../course/notes/heihui-jileniao/BV1ecj4zsE27.md) 从字幕归纳出：

- 用长、宽、高比例差建立主次体块；
- 用嵌套或共享连接面替代松散并排；
- 从主视图和转角视图检查体块层次；
- 用较宽底部、退台、相邻低体块或明确路径表现承托；
- 用有角色的从属体块切分大墙面，把细节预算集中在入口、转角和连接处。

[1.4 结构的减法](../course/notes/heihui-jileniao/BV1Mp7UzyE3P.md) 从字幕归纳出：

- 为每个空洞指定构图或空间用途，并按底部、中部、转角、顶部或整层记录位置；
- 拒绝抹平原有层次或制造无角色碎片的削减；
- 让大空洞上方体量连接到可读支撑路径；
- 在切下体块进行平移、旋转或错移后，重新检查连接、碰撞、支撑和轮廓。

两集均未提供通用体块数量、重叠深度、洞口尺寸、跨度或材料承载力，笔记和 advisory 没有臆造数值或结构工程结论。

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 已加入结构加法的 `mass_ratio_variation`、`mass_overlap`、`attachment_role`、`facade_partition_volume` 和 `visual_support_check`，以及结构减法的 `subtraction_intent`、`void_region`、`void_position`、`articulation_preservation_check`、`fragmentation_check`、`void_support_check` 和 `cut_translate_recompose`。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定两个已有知识产物的章节、8 个有效来源和 18 条有界意图；`complete-structure` 仍只是逐集处理中的章节，并未完成。order 11 新增 3 条：

- `knowledge:p7:purposeful-volume-subtraction`
- `knowledge:p7:void-fragmentation-control`
- `knowledge:p7:supported-cut-recomposition`

规范内容 SHA-256 固定为 `1709b0aba11a76485e782adecf39a1efa3274df21f950cd497714fe3b32b8f6c`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

下一集尚未学习的课次是 course order 12 `1.5 支撑结构`：

```bash
npm run playbook:evidence -- media --bvid BV1MA7Bz2EE1
```
