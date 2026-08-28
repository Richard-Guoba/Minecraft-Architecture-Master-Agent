# P5 可执行设计层门禁报告

P5 已实现一个 opt-in、default-off 的最小确定性控制循环。默认 `npm start` 仍使用 `playbook=off`；手动 mock 测试命令是：

```bash
npm run playbook:execute -- --mode mock --seed 424242 "Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base"
```

## 可执行边界

每次 execute 运行固定生成三个候选，并为 `brief`、`massing`、`structure`、`roof`、`facade` 保存五层不可变 checkpoint。每个候选最多消耗一次原子修复预算。硬 QA、P4 确定性资格审查和原有候选排序器是三个独立权威。

四个可执行操作是：

1. `repair:massing:resize-or-reposition-volume`
2. `repair:massing:strengthen-primary-volume`
3. `repair:massing:reduce-support-volume-prominence`
4. `repair:structure:connect-support-path`

以下十一条核心规则仍为 evidence-required，不能生成补丁：

- `rule:structure.layer-volumes-to-reduce-blankness`
- `rule:roof.border-with-material-contrast`
- `rule:roof.scale-slope-to-massing`
- `rule:roof.break-large-flat-plane`
- `rule:facade.frame-before-openings`
- `rule:facade.offset-frame-for-depth`
- `rule:facade.partition-large-wall`
- `rule:facade.break-repetitive-bays`
- `rule:medieval.extend-only-needed-facades`
- `rule:medieval.align-roof-with-overhang`
- `rule:medieval.use-stone-base-for-height`

六条案例模式是中立、非权威资料；它们不决定资格、补丁或排序。

候选权威由已持久化的冻结设计、完整生成器上下文、checkpoint、blueprint、硬 QA 与 P4 review 共同绑定。接受的 chain body 保持不可变；`current-chain.json` 是唯一可替换的候选指针。selection 先写入完整不可变的 `selection-generations/selection-<manifest-sha256>/`，再只替换根 `manifest.json` 指针，因此进程中止后只会恢复为完整旧 generation 或完整新 generation。replay 只读取这些磁盘权威，不读取易变运行时设计字段，也不创建 provider client。

最终 datapack 使用 descriptor 约束的身份/哈希校验安装器；它只复制普通文件到私有同级 stage，并在提交前同步和复核完整 tree hash。run、workspace、候选/selection stage、安装 stage 和本次调用新建的 world/datapack 父目录都在非递归创建后、首次异步让出前同步记录新 inode，随后要求 retained no-follow handle、创建边界返回 handle 与命名 entry 同时匹配该来源，再 no-replace 移动到最终名称；不能仅凭 `mkdir()` 返回成功或稍后的同名 open 推断创建权。candidate/selection pointer stage 也从 exclusive open 起保留创建 handle，首次 named read 和发布必须匹配该 inode。每次移动都根据源/目标的实际 inode 调和，包括“移动已生效后抛错”；碰撞或交换得到的外来 inode 会保留。安装 stage 的每个文件由受信任的同步 exclusive open 创建，并在进入任何可注入或异步 callback 前立即保留返回 descriptor、`fstat` 并登记 inode；post-effect open、partial/full write、sync 与 close 故障会调和该精确对象的实际字节，只有身份仍确定时才清理实际 partial snapshot 和本次创建的父拓扑。共享清理器先把精确 public entry no-replace 移入随机 capability-private retirement namespace；每个 private unlink/rmdir 都先经过最后一个可注入删除边界，再复核完整预期 tree 和 retained root-to-leaf inode chain，并在不让出事件循环的最终 identity 检查后立即删除。活动 execute 路径没有 recursive `rm`，也没有直接破坏 public/final basename 的 syscall。所有提交前写入、权限、同步、移动、源/目标交换和清理故障都返回无敏感内容的 `P5_INSTALL_FAILED`，同时恢复原 datapack 的完整字节、inode 和调用前父目录拓扑；提交后的备份清理失败不撤销已完成的新 generation，也不能把已经提交的外部安装报告为失败。

这里的保证覆盖全部文档化 JavaScript 异步让出点和 fault-injection hook。实现信任 Node 原生同步绑定，并假设相邻同步 syscall 之间不存在恶意同 UID 写者；标准 Node/POSIX 没有创建目录并返回 retained directory descriptor 的 `mkdir`，也没有 inode-conditional `unlink`/`rmdir`。独立 peer-process 在相邻同步 syscall 间竞争不属于绑定的 P5/P4 威胁模型；所有受支持 hook 的替换、碰撞和 post-effect 区间仍有强制回归并 fail closed。

## 接受证据

入库的 positive、repairable 和 no-eligible mock 输入是 **controlled-seam 合同场景**：它们有意替换设计 envelope/context/review/compiled replay 等测试边界，用于证明三候选五层拓扑、一次预算、确定性 replay/rollback 和“不发布/不安装”等控制流；它们不是未经替换的生产权威输入，因此本报告不把“三个全部 eligible”“自然 repairable”或“三个一次修复后仍 no-eligible”宣称为原始生产 fixture 结果。相同受控输入、seed 与补丁的 repair evidence、checkpoint chain、blueprint、operation list、build function 和 datapack tree 字节可重复。

另有独立的 `natural-production-authority.json`：它不给 orchestrator 传入任何依赖替换，使用生产 mock 设计、硬 QA、P4 review、eligibility、replay、selection 和真实安装器，并只把最终 datapack 安装到测试创建的 disposable root。该输入自然观察到 candidate-01/02/03 的 attempt 数为 `[1, 1, 0]`、状态为 `[repair-invalid, repair-invalid, eligible]`，选择 candidate-03，且安装后的普通文件树与选中 datapack 逐字节相同。这是当前唯一的自然生产权威 acceptance 声明；没有证据的三场景自然性声明已明确撤回。磁盘重启 replay 在丢弃运行时对象、主动 Concept Studio/Stage 7 以及 provider 构造必抛时仍重建相同输出；所有会影响输出的上下文字段都由持久化 body 和 chain hash 约束。硬 QA 会重新计算，P4 review 的 blueprint hash、workflow 与 seed 在初次资格、replay、存储读取和 selection 安装边界都绑定同一候选。

candidate 与 selection 的每个写入、权限、移动和同步 kill point 都由独立子进程执行。pointer 替换先把精确旧 pointer no-replace 移入已验证的私有 journal，再提升 staged pointer；矩阵覆盖 `pointer-retire:1`，即旧 pointer 已进入 journal 而新 pointer 尚未移动的窗口。重启只接受唯一、canonical 且能绑定既有 chain/generation 的恢复 journal，因此只观察到完整旧或完整新权威，且历史不可变 body inode 不变。注入的真实 replay 故障证明先前 current pointer 的字节、哈希与 inode，以及无关 output/world 字节全部不变；failure evidence 只含固定代码和权威哈希。selection/install 前先删除未选中 workspace；任何后续提交前失败也删除选中 workspace。外部安装提交成功后才标记选中 workspace 为保留，后提交清理/authority-close 故障为非致命；无资格/失败运行不保留候选 workspace，且没有新的 `/tmp/p5-replay-*` 残留。repair/replay 不创建 provider client。

依赖门禁复用 P4 已审阅的 ESM 解析与 fail-closed 规则，拒绝 computed import、`createRequire`、未解析边、symlink/realpath 逃逸和动态禁止边。保留概念在 camelCase、PascalCase、连字符、下划线、字母/数字拆分和完整连接形式下使用同一组有界标识符归一化；每个标识符还会在权威词分解前独立移除终端常规版本后缀 `v1` 至 `v999`（不接受零、前导零或四位数）。相邻普通词不会按子串误判。execute 非资格依赖只精确放行既有 `candidateSelectionAgent.js`、`templateAestheticReviewAgent.js` 和 `visualizationAgent.js` 三条路径，别名、改名和嵌套变体都拒绝；资格模块不能依赖其中任何一个。`templateAestheticReviewAgent.js` 是 P5 前既有、供不变 ranker 使用的结构化 blueprint 字段评分，不是 P6 图像、固定视角或视觉模型评价。P4 的独立边界仍然禁止 construction、pipeline、world 和 datapack I/O。P3 手动门禁保持 21 条审阅规则、15 条核心程序、6 条案例模式、5 个受管产物和零 drift。

## 新鲜门禁结果

- 最终修复范围：全分支审阅基线 `f54ea59fbe6e82631687a2cd0710f018298a47e6`，经 final-boundary 实现/文档提交 `37e9dd4b968918039e139bb43875a8f956bfd658` / `59a3121ca0c5c48ca57f1040b245526bb987d6ec`，到 installer-stage ownership 实现提交 `d5677ef19e289e463a6feb75717f758d41a86ee1`。
- P5 计划文件范围加安装器的精确门禁：484/484（合同、扩展 off 兼容、设计层、checkpoint、存储与进程中止恢复、资格、四类 repair、磁盘 replay、orchestrator、真实安装器、真实 CLI、依赖、controlled-seam 与 natural-production-authority acceptance，以及受支持 creation/removal/pointer/stage-file hook 回归）。
- `test/candidatePipeline.test.js` 是独立的直接 API 范围：5/5；controller 在 `59a3121` 把它与上述 484 项合并运行时为 489/489。本次提交仍分别报告两个命令范围，不把 5 项重复计入 P5 计划门禁。
- `59a3121` 文档检查点的兼容/广度证据保持：P4 精确兼容门禁 201/201。
- 存储专项：198/198；安装器专项：26/26；candidate/selection 独立进程 SIGKILL 矩阵：24/24。
- `59a3121` 文档检查点的完整仓库回归：1537/1537，退出码 0。
- `59a3121` 文档检查点的 P3 聚焦兼容门禁：325/325；受管审计保持 21 条审阅规则、15 条核心程序、6 条案例模式、5 个受管产物、0 managed drift。
- 独立依赖矩阵：150/150；checked-in P5/P4 graph 的 violation/unresolved 均为 0，P5 资格模块也不依赖 construction/pipeline/world/datapack I/O。
- 卫生：`git diff --check` 为 0，`git ls-files out .local/architecture-playbook` 为空。

入库 fixture SHA-256：controlled positive `1e9e3808ca0e085d0c49e1b4870840be55a7e6eb6ffaf04d9942bd19750cf754`；controlled repairable `bf244a5527a1237f555c2fbc1bd3b9956d7a80934ec47e63f393e91e61af10f7`；controlled no-eligible `c3d12c9f564e2848b441df1ceb9afe55320765d88eff803977565f69d67df0e1`；natural production authority `0727d0ee8fde696ccbc4cd2cf2512f34bce3c511a42852a8e13637d42dadffa1`；base-generated 扩展 off 向量 `92d046a7380ce0a46d6d1a9fdd82a27a660c7f7a8c9e987146e637c99abd612f`。

最终实现提交上的一次无 world 目标真实 mock 运行得到 candidate-01/02/03 chain SHA-256：`6343e9cbad3f38e9ecfae8f06b521ed592a001a3d8061476e494812c1fcb66d3`、`831be25fe333723ffb4aae674d0d3039cfbc0a8e773d204b4f52b4626341e311`、`8fbf22a708f9f223e950a5253957cd4948f8378c7dd0f0f2ab3c2f6aeb097eaf`；第三条 eligible 并被选择。selection manifest hash 为 `8251589598c720aea707d4dad2fbdd00eff1f909a390a02c39b90e5d5121cdeb`，其 generation 路径中的相同 hash 与根 pointer 完全绑定。受控 repair acceptance 则逐字节比较两次独立根运行的 request/patch/result、chain、blueprint、operation list、build function 与 datapack tree；报告不把测试桩的瞬时 hash 冒充生产权威。

## 声明限制

P5 creates no playbook score（没有秘籍评分）。资格不是审美评分，三个生成候选不证明质量或审美改善。P5 没有固定视角渲染、视觉模型或人工盲选；这些仍属于未开放的 P6。真实 `out/`、`.local/`、checkpoint、provider transcript、生成数据包和世界产物保持忽略且不得跟踪。
