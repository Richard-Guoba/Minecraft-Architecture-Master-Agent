# P7 第四章字幕知识扩展检查点

状态：第四章 4 个新课次已完成字幕优先知识扩展；未声称完成人工视觉证据或规则晋级

## 本次完成范围

第四章 `complete-walls-facades` 的 course order 16 `BV1HTCaY6EDt` 属于原六集黄金语料，没有重复处理。新课次 order 17–20 已分别按顺序完成媒体与 ASR：

- order 17 媒体：78,152,496 bytes；SHA-256 `adab94e39ad9634257e70b25f64eba3ff93907af392107b1f070aecc7578007b`
- order 17 字幕草稿：726 段，1,337,655 ms；segment index SHA-256 `0fc5a7eca0866c46d7267c50dd52a09dd65aa354d361c3645146e4b3310d95f9`
- order 18 媒体：68,831,966 bytes；SHA-256 `ac9adb0e44e97b73b03ebab9602f92b7e6d70ed9ca7a1abbdbb71027d5c3b403`
- order 18 字幕草稿：483 段，1,152,964 ms；segment index SHA-256 `09a7b733119fee23d978d7ba9f4cd47228b35bc751d8a8a52ee4185805ea4cf4`
- order 19 媒体：77,036,159 bytes；SHA-256 `3f68d53c825f405e1e1ed357ffa4670b56783e72949ff73fd8d36678bb1ce680`
- order 19 字幕草稿：355 段，857,234 ms；segment index SHA-256 `a9efc05d4527eb34f73b1ca86167a512cbdbbd33e17817791608582f39524fe9`
- order 20 媒体：64,521,866 bytes；SHA-256 `05e4a081d8d191bd7653ec1432dcc17444a96ba0254f005f0f2b6319a17ef987`
- order 20 字幕草稿：552 段，1,077,847 ms；segment index SHA-256 `cf3a1bd0b0c323700733fe39a425d317a3a29585220c3c8e633dc1dbf90c5823`
- 四集 ledger：`pending → media-verified → asr-complete`

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

[3.4 门](../course/notes/heihui-jileniao/BV1nCJJzWEHH.md) 从完整字幕归纳出门板与门框连续、尺度适配门洞、门槛和雨棚过渡，以及大型入口的可见内部纵深。红石、机械动力和材质包示例没有成为运行依赖。

[3.5 构筑大型墙面](../course/notes/heihui-jileniao/BV1FrPazJEFD.md) 从完整字幕归纳出按连接性和视觉密度分配材料、用有限语汇建立重复节奏、浅层装饰不足时增加真实进深，以及通过主次分区和删除离群元素迭代墙面。具体示例没有被复制成固定模板。

## 接入 Architecture Bible 与建造工作流

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 在 order 19 加入门框连续、入口尺度、天气过渡和可见纵深，并在 order 20 加入材料连接性、有限墙面语汇、真实进深与主次分区迭代。

聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定四个章节、15 个有效来源和 42 条有界意图。order 19 新增：

- `knowledge:p7:door-frame-material-continuity`
- `knowledge:p7:scale-appropriate-entry-opening`
- `knowledge:p7:weather-sheltered-entrance-transition`
- `knowledge:p7:layered-entry-sequence`

order 20 新增：

- `knowledge:p7:facade-material-connectivity-scale`
- `knowledge:p7:bounded-facade-pattern-vocabulary`
- `knowledge:p7:large-facade-depth-expansion`
- `knowledge:p7:iterative-facade-partition-hierarchy`

规范内容 SHA-256 固定为 `4118a9e0f7000f1d5516c3e92668bfe63a46c38594a551a4d8283f295787d087`。这些内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID、不能改写冻结的六集 v0.1 规则，也不改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第四章字幕优先范围已完成。下一个尚未学习的是第五章 course order 21 `4.1 造景概述`：

```bash
npm run playbook:evidence -- media --bvid BV1HRVnzVEFa
```
