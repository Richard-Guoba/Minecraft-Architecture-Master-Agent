# P7 第一章字幕知识扩展报告

状态：字幕优先的内容扩展已完成；未声称完成人工视觉证据或规则晋级

## 完成范围

第一章 `foundations-tools-blocks-modularity-color` 的 7 集媒体和 ASR 产物均已逐集处理、重新打开并通过大小、来源谱系和 SHA-256 校验。私有 ledger 中 7 集均停在 `asr-complete`，没有自动越过人工视觉复核边界。

首集 `BV1guoPYkExk` 没有可用教学叙述：官方页面没有字幕轨，媒体没有嵌入字幕流，ASR 只得到一条片尾字幕署名。因此本集按“无可提取字幕知识”记录，不伪造摘要，也不阻塞同章其他课次。

其余 6 集共得到 2,539 个带时间戳 ASR 草稿段。草稿和媒体仍位于忽略的私有空间；Git 只收录原创归纳笔记：

- [0.1 建筑工具](../course/notes/heihui-jileniao/BV1aBV1zwELe.md)
- [0.1.1 高版本建筑包](../course/notes/heihui-jileniao/BV1SwdfBHEx5.md)
- [0.2 快捷键](../course/notes/heihui-jileniao/BV1SG6GY9ETe.md)
- [0.3 认识方块](../course/notes/heihui-jileniao/BV1iVLbzcEfG.md)
- [0.4 模块化建筑](../course/notes/heihui-jileniao/BV1cLJtz1ELx.md)
- [0.5 材质与配色](../course/notes/heihui-jileniao/BV14XMtzFEzb.md)

## 补充到 Architecture Bible 的知识

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md) 在冻结的六集 v0.1 之外新增：相对锚点模块、非空气放置 mask、批量操作检查点、有序地形 passes、远近视角复核、色阶、外壳到内饰的阶段切换、有状态组件、隐藏 utility 层、按视觉属性分配材料、尺度敏感的纹理与形态、母模块连接修补、受控模块变化、结构明度层级、背景分离和点缀色呼应。

这些内容只来自 `heihui-jileniao`。没有混入其他作者、通用建筑规则或 ASR 无法支持的数值阈值。

## 接入建造工作流

[`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 最初把第一章整理为 12 条有界的 `subtitle-derived-advisory` 建造意图，随后按课次聚合新章节知识。每条意图都保留 `author_claim`、`inference` 或 `contrast` 分类以及 BVID 时间范围。加载器固定学派、已处理章节、有效来源、条目数量、字段、设计层、长度和规范内容 SHA-256；用 `O_NOFOLLOW` 打开并复核 descriptor 身份，内容、来源、分类或引用漂移均以 `P7_ADVISORY_INVALID` 失败。

LLM `playbook=execute` 在创建三个候选的冻结设计前加载该 overlay，并把它作为 `intent-guidance-only-not-reviewed-rules` 传入设计 envelope。模型必须把精确 overlay SHA-256 回写到冻结设计；该文件的哈希随后进入 chain authority。经验证的 brief、massing、structure、roof 和 facade 意图会追加到 Architect、Planner 和 CreativeDesign 的实际输入，因此能够影响生成语义。Mock 不加载 overlay，也不改变原冻结输入。

- 不能进入可选择或拒绝的 `rule:` ID 列表；
- 不能改写冻结的 21 条 v0.1 审阅规则或其 corpus hash；
- 不能生成坐标、方块、命令、patch、分数或阈值；
- 不改变 mock envelope、`playbook=off` 路径或相对坐标 datapack 编译器。

## 验证证据

所有 Node 测试均通过 `npm test -- ... --test-reporter=spec` 的 Linux hard-memory scope 运行；没有直接执行 `node --test`，没有使用 soft fallback。

- P7 overlay 加载、no-follow、漂移拒绝、规则权限隔离、冻结哈希和 execute/mock 边界：13/13 通过。
- 冻结设计 envelope 与 construction-stage 合同合并验证：38/38 通过。
- 完整 execute orchestrator 回归：30/30 通过，包括 disposable root 的便携 datapack 生成/安装路径；未访问真实 Minecraft 世界。
- `playbook=off` 冻结字节和 provider/install 向量兼容：4/4 通过。
- P7 文档门禁：4/4 通过。

## ledger 与下一步

正式 ledger 的确定性 `next` 仍指向首集的人工 `events-indexed` 复核：

```bash
npm run playbook:chapter -- advance --bvid BV1guoPYkExk
```

它要求 `reviewed teaching-event index`，本轮没有伪造该产物。按已批准的字幕优先知识扩展方向，这个正式视觉 QA 不阻塞下一章。

以下是第一章完成时记录的历史下一步；该命令现已执行，不再是当前动作。第二章 `complete-structure` 的 course order 8、9 已属于原六集黄金语料，没有重复处理；course order 10 当时是下一个尚未学习的课次：

```bash
npm run playbook:evidence -- media --bvid BV1ecj4zsE27
```
