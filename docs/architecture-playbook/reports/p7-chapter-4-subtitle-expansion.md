# P7 第四章字幕知识扩展检查点

状态：第四章 2 个新课次已完成字幕优先知识扩展；未声称完成人工视觉证据或规则晋级

## 本次完成范围

第四章 `complete-walls-facades` 的 course order 16 `BV1HTCaY6EDt` 属于原六集黄金语料，没有重复处理。新课次 order 17 `BV1ZJTLzgEdm` 和 order 18 `BV1XtGvzPEFR` 已分别按顺序完成媒体与 ASR：

- order 17 媒体：78,152,496 bytes；SHA-256 `adab94e39ad9634257e70b25f64eba3ff93907af392107b1f070aecc7578007b`
- order 17 字幕草稿：726 段，1,337,655 ms；segment index SHA-256 `0fc5a7eca0866c46d7267c50dd52a09dd65aa354d361c3645146e4b3310d95f9`
- order 18 媒体：68,831,966 bytes；SHA-256 `ac9adb0e44e97b73b03ebab9602f92b7e6d70ed9ca7a1abbdbb71027d5c3b403`
- order 18 字幕草稿：483 段，1,152,964 ms；segment index SHA-256 `09a7b733119fee23d978d7ba9f4cd47228b35bc751d8a8a52ee4185805ea4cf4`
- 两集 ledger：`pending → media-verified → asr-complete`

每次推进前都重新打开并校验了当前阶段的精确产物。媒体、完整字幕和工作证据只保存在忽略的 `.local/architecture-playbook/`，未进入 Git。正式 `events-indexed` 和 `visual-reviewed` 仍要求人工证据，本轮没有自动推进或伪造批准。

## 原创知识产物

[3.2 墙面雕花](../course/notes/heihui-jileniao/BV1ZJTLzgEdm.md) 从完整字幕归纳出：

- 先提出边框、内退墙芯，用受控进深建立雕花空间和墙面分区；
- 让细节构件的粒度服从墙面比例，避免整砖或大构件压过主体；
- 先建立墙根、柱、梁、托臂或拱形支撑，再添加从属纹样；
- 把留白视为明确设计状态，不用随机细节填满所有区域；
- 结合竖向开间与横向分层，并保持上下层的构造连接。

本集没有给出进深层数、柱距、开间宽度或细节密度阈值。含糊的 ASR 方块名称、展示实体、更新抑制和编辑工具没有转化为便携数据包依赖，视觉结构指导也没有被误写成现实工程计算。

[3.3 墙面装饰](../course/notes/heihui-jileniao/BV1XtGvzPEFR.md) 从完整字幕归纳出：

- 把窗拆成开口、可选遮雨构件、窗台或展示面，以及有连接的承托；
- 让窗和新材料与墙芯、柱梁共同构建，拒绝孤立贴片；
- 把柱基、柱身和柱头作为可选语义区，并让雕花尺度服从柱身；
- 以深重框架、轻质填充的视觉关系补强已有材料层级；
- 空间受限时在一格进深内建立有限浮雕，并按建筑尺度放置外挂；
- 只对足够大的墙面继续分区，小面不强行套用切分模板。

本集没有给出窗台、柱分段、外挂或开间的通用尺寸。材质包外观、含糊方块名和非标准更新手法没有进入 advisory 或数据包依赖。

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 继续加入 `facade_opening_assembly`、`opening_frame_integration_check`、`column_articulation_zones`、`column_ornament_scale_check`、`constrained_depth_relief` 和 `attachment_scale_and_junction`。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定四个已进入字幕知识产物的章节、13 个有效来源和 34 条有界意图。order 18 补强 `knowledge:p7:visual-material-role`、`knowledge:p7:structural-value-hierarchy` 和 `knowledge:p7:integrated-facade-bay-layering`，并新增：

- `knowledge:p7:facade-opening-assembly`
- `knowledge:p7:scale-matched-column-articulation`
- `knowledge:p7:constrained-depth-facade-relief`

规范内容 SHA-256 固定为 `018d4a1f1b2554e6e6933a40372f023ac73d14cba280bfbcb94e2310ef1dc728`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第四章还有两个新课次。下一个尚未学习的是 course order 19 `3.4 门`：

```bash
npm run playbook:evidence -- media --bvid BV1nCJJzWEHH
```
