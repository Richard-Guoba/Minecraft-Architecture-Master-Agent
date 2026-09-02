# P7 第四章字幕知识扩展检查点

状态：第四章 1 个新课次已完成字幕优先知识扩展；未声称完成人工视觉证据或规则晋级

## 本次完成范围

第四章 `complete-walls-facades` 的 course order 16 `BV1HTCaY6EDt` 属于原六集黄金语料，没有重复处理。新课次 order 17 `BV1ZJTLzgEdm` 已按顺序完成媒体与 ASR：

- 媒体：78,152,496 bytes；SHA-256 `adab94e39ad9634257e70b25f64eba3ff93907af392107b1f070aecc7578007b`
- 字幕草稿：726 段，1,337,655 ms；segment index SHA-256 `0fc5a7eca0866c46d7267c50dd52a09dd65aa354d361c3645146e4b3310d95f9`
- ledger：`pending → media-verified → asr-complete`

每次推进前都重新打开并校验了当前阶段的精确产物。媒体、完整字幕和工作证据只保存在忽略的 `.local/architecture-playbook/`，未进入 Git。正式 `events-indexed` 和 `visual-reviewed` 仍要求人工证据，本轮没有自动推进或伪造批准。

## 原创知识产物

[3.2 墙面雕花](../course/notes/heihui-jileniao/BV1ZJTLzgEdm.md) 从完整字幕归纳出：

- 先提出边框、内退墙芯，用受控进深建立雕花空间和墙面分区；
- 让细节构件的粒度服从墙面比例，避免整砖或大构件压过主体；
- 先建立墙根、柱、梁、托臂或拱形支撑，再添加从属纹样；
- 把留白视为明确设计状态，不用随机细节填满所有区域；
- 结合竖向开间与横向分层，并保持上下层的构造连接。

本集没有给出进深层数、柱距、开间宽度或细节密度阈值。含糊的 ASR 方块名称、展示实体、更新抑制和编辑工具没有转化为便携数据包依赖，视觉结构指导也没有被误写成现实工程计算。

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 已加入 `facade_depth_layers`、`facade_detail_scale_check`、`facade_support_path`、`facade_blank_mask`、`vertical_bay_partition` 和 `horizontal_layer_connection`。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定四个已进入字幕知识产物的章节、12 个有效来源和 31 条有界意图。本集补强 `knowledge:p7:scale-sensitive-material`，并新增：

- `knowledge:p7:facade-depth-hierarchy`
- `knowledge:p7:support-led-facade-ornament`
- `knowledge:p7:integrated-facade-bay-layering`

规范内容 SHA-256 固定为 `fb9a577f434effbe513b32392459b1e61bfa02af28cc36a45092698c67b319d2`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第四章还有三个新课次。下一个尚未学习的是 course order 18 `3.3 墙面装饰`：

```bash
npm run playbook:evidence -- media --bvid BV1XtGvzPEFR
```
