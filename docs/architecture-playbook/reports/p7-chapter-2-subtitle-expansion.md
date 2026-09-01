# P7 第二章字幕知识扩展检查点

状态：course order 10 已完成字幕提取、归纳和建造意图接入；未声称完成人工视觉证据或规则晋级

## 本次完成范围

第二章 `complete-structure` 的 course order 8 `BV1fNkgYBEyy` 和 order 9 `BV1HhEuzZEyZ` 属于原六集黄金语料，没有重复处理。首个尚未学习的课次 order 10 `BV1ecj4zsE27` 已按顺序完成媒体与 ASR：

- 媒体：70,421,388 bytes；SHA-256 `77ac2147486daec53b50e270e7a7faa1027e11471cdb9e0393e32115a24047cf`
- 字幕草稿：508 段，1,180,502 ms；segment index SHA-256 `ab0fcdcedaad859fee03bb9544bc3a4924889b635804a07de1d74185e46581b0`
- ledger：`pending → media-verified → asr-complete`

每次推进前都重新打开并校验了当前阶段的精确产物。媒体、完整字幕和工作证据只保存在忽略的 `.local/architecture-playbook/`，未进入 Git。正式 `events-indexed` 和 `visual-reviewed` 仍要求人工证据，本轮没有自动推进或伪造批准。

## 原创知识产物

[1.3 结构的加法](../course/notes/heihui-jileniao/BV1ecj4zsE27.md) 从字幕归纳出：

- 用长、宽、高比例差建立主次体块；
- 用嵌套或共享连接面替代松散并排；
- 从主视图和转角视图检查体块层次；
- 用较宽底部、退台、相邻低体块或明确路径表现承托；
- 用有角色的从属体块切分大墙面，把细节预算集中在入口、转角和连接处。

视频未提供通用体块数量、重叠深度或比例阈值，笔记和 advisory 均没有臆造数值。下一集预告的“结构减法”没有提前写入本集知识。

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 新增 `mass_ratio_variation`、`mass_overlap`、`attachment_role`、`multi-view mass_visibility`、`facade_partition_volume`、`subordinate_component` 和 `visual_support_check`。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定两个已有知识产物的章节、7 个有效来源和 15 条有界意图；`complete-structure` 仍只是逐集处理中的章节，并未完成。本集加入 3 条：

- `knowledge:p7:connected-mass-addition`
- `knowledge:p7:facade-partition-volume`
- `knowledge:p7:visual-support-check`

规范内容 SHA-256 固定为 `1c82894421e399d713f2a29a661e51be8d279a66030759853b9d8f90a54c823b`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

下一集尚未学习的课次是 course order 11：

```bash
npm run playbook:evidence -- media --bvid BV1Mp7UzyE3P
```
