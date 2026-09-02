# 建筑秘籍计划

这个目录是 Minecraft 建筑秘籍计划的稳定入口。计划同时建设两个闭环：

1. 把同一作者的课程转化为有来源、可审阅、可版本化的建筑知识；
2. 按已批准的阶段把知识接入生成器：P4 只做影子指导，P5 提供默认关闭的确定性设计层控制，P6 才做视觉评价与盲选。

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
- P5 可执行设计层已经实现，但保持 opt-in / 默认关闭（default-off）。它只证明最小、确定性的控制循环：固定生成三个候选、保存五层 checkpoint、最多执行一次白名单修复、先做硬 QA 与秘籍资格过滤，再调用原有排序器。它没有秘籍评分，不证明质量或审美改善。
- P6 正式捕获与盲选仍未开放、也尚未完成；固定多视角渲染、视觉模型、人工盲选、审美评价与改进证据仍属于可选的 P6 评价工作，不是扩展课程知识的前置条件。
- P7 基础已经把 50 集分配到 8 个固定章节，并增加可恢复的章节账本、全课程证据命令解析、只读的章节 `status` / `next` 命令，以及逐产物重开和哈希校验的 `advance` 命令。
- P7 第一章的字幕优先内容扩展已经完成：7 集均到 `asr-complete`；首集没有可用教学叙述，其余 6 集共 2,539 个草稿段已经逐集归纳为原创笔记并补充 Architecture Bible v0.2。正式人工视觉阶段没有被自动标记完成。
- P7 第二章跳过原六集中的 order 8、9 后，新课次 order 10–12 均已到 `asr-complete`：共 1,369 个草稿段已经归纳为结构加法、结构减法和支撑结构笔记。第二章字幕优先知识扩展已完成，正式人工视觉阶段仍未完成。
- P7 第三章跳过原六集中的 order 13 后，新课次 order 14、15 均已到 `asr-complete`：共 1,377 个草稿段已经归纳为屋顶朝向、组合接缝、坡度阶段、整砖主坡面、细节密度和现代平顶知识。第三章字幕优先知识扩展已完成，正式人工视觉阶段仍未完成。
- P7 第四章跳过原六集中的 order 16 后，新课次 order 17 已到 `asr-complete`：726 个草稿段已经归纳为墙面进深、细节尺度、承托优先、留白及横纵分区知识。正式人工视觉阶段仍未完成。
- 已处理课次聚合为 31 条 `subtitle-derived-advisory` 建造意图，并接入 opt-in 的 execute 设计提示。它们不能进入冻结的 21 条 v0.1 审阅规则权限，不能改变 `playbook=off`，也不能改变相对坐标数据包编译器。
- 当前入口：[人类秘籍 v0.1](manual/v0.1.md)、[P7 知识扩展 v0.2](manual/p7-expansion-v0.2.md)、[P7 第一章字幕知识扩展报告](reports/p7-chapter-1-subtitle-expansion.md)、[P7 第二章字幕知识扩展检查点](reports/p7-chapter-2-subtitle-expansion.md)、[P7 第三章字幕知识扩展检查点](reports/p7-chapter-3-subtitle-expansion.md)、[P7 第四章字幕知识扩展检查点](reports/p7-chapter-4-subtitle-expansion.md)、[审阅规则卡](rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl)、[P4 影子指导报告](reports/p4-shadow-guidance.md)、[P5 可执行设计层报告](reports/p5-executable-design-layer.md)和 [P7 知识扩展基础报告](reports/p7-knowledge-expansion-foundation.md)。

## P7 轻量章节工作流

**Lightweight P7 chapter gate:** Formal P6 capture/comparison is optional and does not block P7. 每章仍须通过来源、原创笔记、证据分类、规则谱系、确定性编译、六集黄金语料、受影响的 P4/P5 回归、固定提示 mock 生成、便携数据包和 `playbook=off` 兼容检查；没有证据的规则不能晋级。

先用唯一可创建缺失账本的公开命令初始化章节状态：

```bash
npm run playbook:chapter -- init
```

如果账本已经存在（包括已经推进的账本），`init` 只返回 `unchanged` 摘要，不会重置或推进任何课次。随后可以读取全课程或单章状态，并取得一个确定性的下一步：

```bash
npm run playbook:chapter -- status
npm run playbook:chapter -- status --chapter foundations-tools-blocks-modularity-color
npm run playbook:chapter -- next --chapter foundations-tools-blocks-modularity-color
```

`status` 和 `next` 保持只读；它们不会创建或推进账本。证据命令写入忽略的私有产物后，使用固定权限的推进命令重新打开并校验当前阶段所要求的精确产物：

```bash
npm run playbook:chapter -- advance --bvid BV1guoPYkExk
```

`advance` 只允许相邻阶段；哈希、来源谱系、复核状态或当前 ledger SHA 不匹配时，在写账本之前失败。它不会替代人工复核。`next` 在 ASR 后会返回 `human_review_required: true` 和所需的 `reviewed teaching-event index`，而不会伪造一个自动批准命令。

首章是 `foundations-tools-blocks-modularity-color`。新账本给出的首个动作是：

```bash
npm run playbook:evidence -- media --bvid BV1guoPYkExk
```

证据命令不会猜测或自动登记章节阶段；只有相应产物被重新打开、哈希校验并完成人工要求的复核后，才能由 `advance` 推进相邻阶段。完整的基础事实和限制见 [P7 知识扩展基础报告](reports/p7-knowledge-expansion-foundation.md)。

字幕优先的知识扩展不要求伪造后续视觉阶段。第一章的精确内容结果、建造意图 overlay、权限边界和下一集命令见 [P7 第一章字幕知识扩展报告](reports/p7-chapter-1-subtitle-expansion.md)。

第二章三个新课次的媒体/字幕哈希、原创笔记、建造意图和后续命令见 [P7 第二章字幕知识扩展检查点](reports/p7-chapter-2-subtitle-expansion.md)。

第三章两个新课次的媒体/字幕哈希、原创笔记、屋顶建造意图和后续命令见 [P7 第三章字幕知识扩展检查点](reports/p7-chapter-3-subtitle-expansion.md)。

第四章首个新课次的媒体/字幕哈希、原创笔记、墙面建造意图和后续命令见 [P7 第四章字幕知识扩展检查点](reports/p7-chapter-4-subtitle-expansion.md)。

生成产品本身保持简单：普通请求产生使用相对坐标的便携 `architect_datapack/`。用户把它复制到自己选择的世界，进入游戏并站在所选建造原点，依次运行 `/reload` 和 `/function architect:run`；知识扩展不选择世界或坐标。

## P5 手动测试

默认命令仍走 `playbook=off`，行为与 P4 基线兼容。使用本地 mock 模式进行可重复的 opt-in 测试：

```bash
npm run playbook:execute -- --mode mock --seed 424242 "Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base"
```

也可以显式选择已经在本机登录的 Codex CLI；该通道严格失败，不会静默切换到其他 API 或 mock：

```bash
npm run playbook:execute -- --mode llm --llm-provider codex "Build a compact medieval stone gatehouse"
```

Codex 子进程强制使用 `exec --sandbox read-only --ephemeral --color never`、通过 stdin 接收提示词，并沿用本地 Codex 配置选择的模型。它不能通过此通道修改仓库，也不会保留 session rollout 文件；最终 JSON 文件上限为 1 MiB。`CODEX_ARGS` 只能增加安全的可选参数，不能绕过这些安全与协议参数。提示词上下文仍会通过当前登录的 Codex 服务账户处理。自动门禁不调用真实 Codex 服务。

运行证据位于忽略的 `out/<run>/playbook-execute/`。三个候选目录保存哈希绑定的冻结设计、完整生成器上下文、五层 checkpoint、blueprint、硬 QA、P4 review 及修复/失败证据；每次接受的 chain body 都不可变，只有 `current-chain.json` 指针可以切换。根 `manifest.json` 是当前 selection 指针，指向 `selection-generations/selection-<manifest-sha256>/` 中不可变且完整的 `manifest.json`、`selection.json` 与 `selection-report.md`。指针切换先把经过字节、mode 和 inode 校验的精确旧 pointer no-replace 移入随机 capability-private journal，再提升 staged pointer；candidate/selection 的新 pointer 从 exclusive open 起保留同一 handle，首次按名称读取和最终发布都必须匹配该创建 inode，即使外来文件字节相同也不会采用。进程若恰在 `pointer-retire:1` 终止，重启只会恢复唯一且能绑定既有 chain/generation 的 journal，不会采用不明确的 residue。CLI 继续显示 `playbook-execute/selection-report.md` 这个逻辑兼容名称；程序化 artifact 路径解析到当前不可变 generation。run、候选、selection generations、replay workspace 和安装 stage 的目录创建会在首次异步让出之前同步记录新 inode，随后要求 retained no-follow handle、注入边界返回的 handle 与命名 entry 都匹配该来源，才允许 no-replace 移动到最终名称；不能根据稍后的同名 open 推断创建权。清理先把精确 public entry no-replace 移入随机私有 retirement namespace；每个 private unlink/rmdir 都先经过最后一个可注入删除边界，再复核预期 tree、retained root-to-leaf inode chain，并在不让出事件循环的 identity 检查后立即执行删除。活动 execute 路径没有 recursive `rm`，也不会直接破坏 public/final basename。replay 工作目录位于同一受管 run 的 `candidate-work/`；selection 发布和安装前先删除未选中 workspace，任何后续提交前失败也删除选中 workspace，只有安装成功后才保留最终选中候选。这些真实运行输出、provider transcript、生成数据包和世界文件不得提交。

最终 datapack 安装只发生在候选选择与权威重验之后。P5 安装器逐个 descriptor 校验源/目标身份，只复制已验证的普通文件到私有同级 stage；每个文件由受信任的同步 exclusive open 创建，并在进入任何可注入或异步 callback 前立即用返回的 descriptor 和 `fstat` 登记创建 inode。open 已生效后报错、部分或完整 write 已生效后报错，以及 sync/close 已生效后报错，都会从 retained handle 或已登记 inode 的精确 named reopen 调和实际字节；只有调和结果仍绑定该创建对象时，才把实际 partial snapshot 交给清理器并删除本次创建的父目录拓扑。完整 tree hash 和 identity map 都通过后才用 no-replace 移动提交，每次移动即使“已生效后抛错”也按实际 inode 状态调和。提交与清理都必须匹配最初记录的 identity，不能采用或删除后来换入的同字节外来文件。提交前任何失败都恢复原 datapack 的完整字节、inode 和调用前父目录拓扑；目标/备份碰撞与交换得到的外来 inode 会保留而不会覆盖或递归删除。提交后的备份清理是非致命的，不能把已经完成的外部安装报告为失败。手动测试和自动 acceptance 只使用 disposable datapack root，不得指向真实用户世界。

上述所有权保证覆盖文档化的 JavaScript 异步让出点和 fault-injection hook。边界信任 Node 原生同步绑定，并假设相邻同步 syscall 之间不存在恶意同 UID 写者；标准 Node/POSIX 既没有“创建目录并返回 retained directory descriptor”的 `mkdir`，也没有按预期 inode 条件执行的 `unlink`/`rmdir`。这种独立 peer-process 竞争不属于 P5/P4 的绑定威胁模型；受支持 hook 在每次异步边界的替换、碰撞和 post-effect 故障仍全部 fail closed。

P5 v0.1 只有四个可执行操作：`resize-or-reposition-volume`、`strengthen-primary-volume`、`reduce-support-volume-prominence` 和 `connect-support-path`。其余十一条核心程序仍要求证据；六条案例模式保持中立、非权威，不能影响资格或排序。

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
