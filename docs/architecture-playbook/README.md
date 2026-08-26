# 建筑秘籍计划

这个目录是 Minecraft 建筑秘籍计划的稳定入口。计划同时建设两个闭环：

1. 把同一作者的课程转化为有来源、可审阅、可版本化的建筑知识；
2. 按已批准的阶段把知识接入生成器：P4 只做影子指导，P5 才研究候选选择和设计层控制，P6 才做视觉评价与盲选。

第一主学派固定为黑辉极乐鸟的《极乐鸟的建筑课堂》。其他作者只能作为明确标记的对照学派，不能静默改写主学派规则。

## 当前状态

- 已生成并验证 50 集课程来源账本，共 50 个唯一 BV 号，总时长 51,992 秒（约 14.44 小时）。
- 6 集、7,381 秒（约 2.05 小时）的 P2 证据垂直切片已经完成。
- 已批准的终局完成标准仍包括：课程证据能够转化为秘籍 v0.1，秘籍能够指导至少三个中世纪民居候选，产生固定多视角预览，完成至少一次设计层返工，并与当前生成器做盲选比较；这些不是 P4 的已交付事项。
- 六集共生成 2,022 个带时间戳 ASR 草稿段、53 张经目视复核的事件关键帧、21 条可重建 EvidenceNote 和 21 条候选规则。
- 候选规则仍限定为黑辉极乐鸟单一教学体系，成熟度最高为 `candidate`；7 个定量与泛化问题仍显式保留，生产生成器保持不变。
- P3 已把 21 条候选规则确定性编译为 15 条核心程序和 6 条案例模式；五层知识为 `advisory-partial`，四层为 `not-covered`，九层运行时权限全部为 `none`。
- P3 自动门禁已通过；它验证受管字节快照、Git 跟踪、基于 AST 与 Node 解析语义的实际依赖图，以及 `not-covered` 双重声明。P3 本身没有生成住宅、没有视觉改善住宅，也没有接入生产建造流水线。
- P4 影子指导门禁已通过：`npm run playbook:shadow -- --run <out/run-directory> --mode mock` 对已有 `blueprint.json` 进行只读、确定性、可解释的审查，且不改变建筑或主生成流水线。
- P4 没有视觉输入、没有候选生成、没有建筑修改、没有设计层返工、没有审美评分，也没有质量提升证据。P5 是下一阶段，但在新的设计获批前仍未开放；P6 仍未开放，并保留固定多视角、视觉模型、人工盲选和审美效果证据。
- 当前入口：[人类秘籍 v0.1](manual/v0.1.md)、[审阅规则卡](rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl)、[九层覆盖矩阵](manual/coverage-v0.1.json)、[P3 门禁报告](reports/p3-playbook-v0.1.md)、[P4 影子指导报告](reports/p4-shadow-guidance.md)、[P4 正式设计](../superpowers/specs/2026-08-26-architecture-playbook-p4-shadow-guidance-design.md)和 [影子指导 CLI](../../src/runArchitecturePlaybookShadow.js)。

## 规划空间

后续提交到 Git 的公开、原创产物按下面的拓扑组织：

```text
docs/architecture-playbook/
  README.md                       本计划入口与当前状态
  course/
    course-manifest.json          课程与课次来源账本
    notes/<school>/               带时间戳的原创课次笔记
  rules/
    schemas/                      证据、规则和冲突合同说明
    schools/<school>/             按学派隔离的可执行规则卡
  manual/                         由已审规则组织的人类可读秘籍
  evaluation/                     视觉 rubric、固定相机与正反例清单
  reports/                        课程覆盖、冲突和版本报告
  plans/                          分阶段实施计划
```

源视频、音频、自动转写、关键帧和处理中间产物只允许位于忽略的本地空间：

```text
.local/architecture-playbook/
  sources/                        本地来源引用或媒体缓存
  audio/                          临时音频
  transcripts/                    自动转写草稿
  frames/                         关键帧与感知索引
  evidence/                       尚未发布的证据包
  work/                           可重建的处理中间产物
```

生成时的秘籍检索、设计层 checkpoint、视觉评审和偏好记录继续位于已忽略的 `out/<run>/` 中。任何原始媒体、完整字幕、私有工作证据或来源衍生训练数据都不得提交。

## 正式设计

完整的知识边界、合同、课程处理流程、秘籍驱动生成架构、阶段门槛、错误处理和测试策略见：

- [建筑秘籍与秘籍驱动建造计划设计](../superpowers/specs/2026-08-24-architecture-playbook-program-design.md)

P1 的逐任务实施计划见：

- [P1 课程来源账本与单集探针实施计划](../superpowers/plans/2026-08-25-architecture-playbook-p1-course-probe.md)

P2 的实施计划、结果审计和公开语料入口见：

- [P2 六集证据实施计划](../superpowers/plans/2026-08-25-architecture-playbook-p2-six-episode-evidence.md)
- [P2 六集证据审计报告](reports/p2-six-episode-evidence.md)
- [黑辉极乐鸟候选规则 v0.1](rules/schools/heihui-jileniao/candidates-v0.1.jsonl)
- [六集公开 Evidence 索引](rules/schools/heihui-jileniao/evidence-index-v0.1.json)

P3 的秘籍、规则、覆盖、门禁和规范入口见：

- [人类秘籍 v0.1](manual/v0.1.md)
- [审阅规则卡 v0.1](rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl)
- [九层覆盖矩阵 v0.1](manual/coverage-v0.1.json)
- [P3 建筑秘籍 v0.1 门禁报告](reports/p3-playbook-v0.1.md)
- [建筑秘籍 v0.1 正式设计](../superpowers/specs/2026-08-25-architecture-playbook-v0-1-design.md)
- [建筑秘籍 v0.1 实施计划](../superpowers/plans/2026-08-25-architecture-playbook-v0-1.md)
