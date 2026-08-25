# P3 建筑秘籍 v0.1 门禁报告

日期：2026-08-25

学派：黑辉极乐鸟（`heihui-jileniao`）

结论：P3 自动门禁通过，P4 开放。

## 输入与产物一致性

- `source_corpus_hash`：`acb642b19f36ecc3633728e3d74a08225d0496c41d00184d3c5f782c7c4a7087`。该哈希按设计覆盖 P2 证据索引、21 条候选、冲突、未知项和 P3 准入政策的规范化内容。
- P2 门禁状态：`passed`。
- 五个受管产物均由同一已验证输入在内存中重建，逐字节检查漂移数为 0；泄漏扫描使用同一次 descriptor 保护读取返回的不可变 UTF-8 快照，未在关闭保护句柄后重新读取普通路径。
- 审计先捕获一个固定的 Git commit tree，并要求 12 个 P2 输入/准入文件与 5 个受管输出都是普通 blob。输入由捕获的 commit blob 编译，index 和工作树差异会阻断；同次 descriptor 保护读取的 5 个输出字节还必须逐一等于对应 commit blob。五条受管路径均由 Git 跟踪，跟踪验证错误数为 0。
- 从 `src/playbook/manual/` 的全部 JS、MJS、CJS 入口解析实际依赖图：语法由固定版本 Acorn `8.15.0` 生成 AST，且只接受字符串字面量表达的静态 ESM/CJS 模块边；ESM 通过 `import-meta-resolve` `4.2.0` 按 Node `import` 条件解析，CJS 按 Node `require` 条件解析，每个文件节点都经过 `realpath`。不受支持的 loader 根在源头以稳定 unresolved fact 关闭门禁，不进行 loader 值传播；唯一 `createRequire` 例外同时绑定到审计实现的真实物理路径、固定依赖物理路径和精确 AST resolver 形状。到 `src/construction/` 的已解析依赖数为 0，无法解析或不受支持的依赖数为 0。P3 没有修改或接入生产建造流水线。
- 泄漏计数为 0；`file:` URL、UNC 引用和 HTTPS 例外共享同一个最多八轮、保留原始区间映射的百分号规范化视图。字面和编码形式由同一组区间产生，URI query/fragment component 起点有界识别，最终发现映射回稳定原始区间。
- 覆盖 JSON 和人类秘籍相对于规范化编译结果的 `not-covered` 声明不匹配数为 0。

## 规则统计

21 条审阅规则卡保留 P2 候选顺序和证据血缘。教学角色为 15 条 `core-procedure`、6 条 `case-pattern`。

章节统计按 `chapter_ids` 关联计数；同一规则可以进入多个章节，所以关联数不应相加为 21。

| 章节 | 规则关联数 |
| --- | ---: |
| `method-and-boundaries` | 0 |
| `massing-foundations` | 2 |
| `hierarchy-and-structure` | 2 |
| `roof-form` | 4 |
| `facade-layers` | 4 |
| `medieval-residence` | 4 |
| `complete-case` | 6 |
| `failure-and-repair` | 5 |
| `agent-workflow` | 1 |
| `unknowns-and-coverage` | 0 |

按规则卡主设计层统计：`brief` 2、`massing` 4、`structure` 4、`roof` 5、`facade` 6；`space`、`materials`、`interior`、`scene` 均为 0。

## 术语与九层覆盖

术语表包含 15 个已解决术语和 5 个显式未解决术语组：

- `unresolved:composition-framework-author-wording`
- `unresolved:parallel-volume-relation-term`
- `unresolved:conical-roof-component-name`
- `unresolved:slatted-wall-and-block-name`
- `unresolved:asr-trapdoor-fence-gate-confusion`

覆盖矩阵中的规则数是运行投影关联数，不等同于规则卡主设计层计数。

| 层 | 状态 | 规则关联数 | 运行时权限 |
| --- | --- | ---: | --- |
| `brief` | `advisory-partial` | 2 | `none` |
| `massing` | `advisory-partial` | 4 | `none` |
| `space` | `not-covered` | 0 | `none` |
| `structure` | `advisory-partial` | 5 | `none` |
| `roof` | `advisory-partial` | 4 | `none` |
| `facade` | `advisory-partial` | 6 | `none` |
| `materials` | `not-covered` | 0 | `none` |
| `interior` | `not-covered` | 0 | `none` |
| `scene` | `not-covered` | 0 | `none` |

五层是知识上的 `advisory-partial`，四层是 `not-covered`；九层运行时权限全部为 `none`。

## 冲突与未知项

唯一冲突为 `conflict:motif-unity-vs-bay-repetition`。它保留 `rule:case.repeat-motif-for-unity` 与 `rule:facade.break-repetitive-bays` 的条件差异：小尺度母题重复用于统一，完整墙间模板的重复需要被打破；当前复核状态仍为 `draft`。

七个公开未知项继续阻止伪造定量或泛化结论：

1. `unknown:massing-ratio-thresholds`：主体、次体和连接体的尺寸差阈值。
2. `unknown:blank-plane-threshold`：墙面或屋面连续空白区域的触发阈值。
3. `unknown:repetition-limit`：完整墙间连续重复的上限。
4. `unknown:roof-slope-table`：跨度、总高与屋顶坡度的可执行映射。
5. `unknown:medieval-scale-generalization`：外挑、斜撑和石基尺度的跨尺度泛化。
6. `unknown:aesthetic-evaluator`：主次、层次、统一与变化的评价组合。
7. `unknown:cross-author-validity`：规则的跨作者、跨风格有效性。

## P3 门禁

| 计数器 | 要求 | 实测 |
| --- | ---: | ---: |
| `p2_gate_status` | `passed` | `passed` |
| `reviewed_rule_count` | 21 | 21 |
| `core_procedure_count` | 15 | 15 |
| `case_pattern_count` | 6 | 6 |
| `dangling_reference_count` | 0 | 0 |
| `cross_school_count` | 0 | 0 |
| `authority_escalation_count` | 0 | 0 |
| `maturity_escalation_count` | 0 | 0 |
| `covered_runtime_layer_count` | 0 | 0 |
| `public_leak_count` | 0 | 0 |
| `managed_artifact_drift_count` | 0 | 0 |
| `untracked_managed_artifact_count` | 0 | 0 |
| `tracking_verification_error_count` | 0 | 0 |
| `import_boundary_violation_count` | 0 | 0 |
| `import_boundary_unresolved_count` | 0 | 0 |
| `not_covered_declaration_mismatch_count` | 0 | 0 |

自动审计返回 `gate.status = passed`、`gate.next_phase = P4`，没有 blocker code。

这些附加计数器与编译器拥有的计数器一起只计算一次最终门禁。未跟踪受管产物、Git 验证失败、到 construction 的依赖、无法解析的动态依赖或覆盖声明不一致，都会以稳定 blocker code 关闭 P4。

## 测试证据

以下旧计数只记录此前实现的历史演进；其中 loader taint/绑定传播与固定点轮次已经被本轮 capability-deny 架构取代，不描述当前实现。

- TDD RED：首次有效运行 `node --test test/playbookP3Gate.test.js` 时，因 `playbookV01Compiler.js` 尚未导出 `auditCheckedInPlaybookV01` 而失败。
- TDD GREEN：实现只读审计后，同一命令通过，1 个测试、0 失败。
- 修复轮次 TDD RED：受保护快照测试首次运行 22 个测试中 20 个通过、2 个失败；完整门禁行为测试首次运行 15 个测试中 1 个通过、14 个失败；新增模板插值依赖用例首次运行 15 个测试中 14 个通过、1 个失败。失败分别对应缺少同次读取快照、辅助事实未进入最终门禁或未形成实际依赖图，以及模板表达式中的依赖未被遍历。
- 修复轮次 TDD GREEN：快照测试 22/22 通过，完整门禁行为测试 15/15 通过；兼容性组合测试 53/53 通过。
- 第二修复轮次 TDD RED：Node 实际执行证明成功后，`node --test --test-isolation=none test/playbookP3Gate.test.js` 的 21 个测试中 15 个通过、6 个失败；旧扫描器遗漏 `module.require`、包 `imports`、包自身引用、裸 symlink 包和被除法启发式隐藏的动态导入，并把正则文本误报为依赖。AST 与 Node 感知解析实现后，同一命令 21/21 通过；变更套件组合 59/59 通过。
- 最终集中修复 TDD：loader/间接调用 RED 为 21/28，Git blob 绑定 RED 为 28/32，file URL/UNC 组合 RED 为 48/52，报告事实 RED 为 35/36；Node 20 静态断言也先失败。对应最小修复后分别达到 28/28、32/32、52/52、36/36 和获准子进程路径下 CLI 23/23。自审新增的 CJS `createRequire` 与计算 loader 测试 RED 为 6/9，修复后为 9/9。
- 聚焦门禁：`node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookManualCli.test.js` 在允许嵌套 CLI 子进程和 Git 验证的执行环境中通过，211 个测试、0 失败。
- 受管检查：`npm run playbook:manual -- check` 返回 `playbook_status=current`、`artifact_count=5`、`managed_artifact_drift_count=0`。
- 完整回归：`npm test` 在同一允许子进程和 Git 验证的执行环境中通过，635 个测试、0 失败。
- capability-deny/统一区间计划的已验证代码范围为 `634c03e..cfde94bcc4ef79742912787736d8556f813e8aa4`；`cfde94bcc4ef79742912787736d8556f813e8aa4` 是完成最终审查修复并通过下述验证的固定代码提交。其后的提交仅更新本公开证据报告，不改变生产代码或测试，因而不再使用自引用的 symbolic `HEAD`。最终 URI-component 修复的 TDD RED 在真实子进程环境运行 67 个测试，61 个通过、6 个失败；四个新增受保护快照分别把预期 `1/1/2/2` 计为 `0/0/1/1`。最小分类器修复后同一命令 67/67 通过；补齐 active-UNC raw/encoded 控制后为 69/69。审查修复新增 query→fragment、file→UNC、UNC→file 和 active-file raw/encoded 控制时 RED 为 71/77，统一 file/UNC 高优先级 token 结束模型后为 77/77。
- 最终审查修复的 dependency/capability 反例先以 13/48 通过、35 失败进入 RED，覆盖 StaticBlock 作用域、`globalThis`/`global` 动态根、等价 Function 构造、extensionless/non-JS 解析结果、独立 importer→target 边和 resolver self-exception optional 形态；补充 `Reflect.get` 构造路径时又以 6/9 通过、3 失败进入 RED。leak 反例以 74/84 通过、10 失败进入 RED，覆盖完整 ASCII 百分号契约、HTTPS 左边界和空参数名 query/fragment component。统一修复后，精确 dependency/capability 矩阵 125/125、精确 leak 矩阵 86/86 通过。
- 本计划最终聚焦门禁：`node --test --test-isolation=none test/playbookP3AdmissionPolicy.test.js test/playbookReviewedRuleCard.test.js test/playbookV01Compiler.test.js test/playbookP3Gate.test.js test/architecturePlaybookManualCli.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js` 在允许真实嵌套 Node 和 Git 子进程的执行环境中通过，312 个测试、0 失败。
- 本计划最终完整回归：`npm test` 在同一真实子进程环境中通过，834 个测试、0 失败。
- 架构结果：taint/固定点分析已移除；依赖结果：只接受字面静态模块边，不受支持的 loader 根稳定 fail closed；泄漏结果：file/UNC 与 HTTPS 区间共享一个有界规范化映射视图；运行时结果：没有 construction、运行时或资源注册表文件发生变化；产物结果：五个受管输出为 `current`，漂移数为 0。
- `git diff --check`：退出码 0，无输出。
- `git ls-files .local/architecture-playbook`：退出码 0，无输出，即没有私有秘籍路径被跟踪。
- 历史范围说明：第一修复轮次提交前的 `git status --short` 只列出当时获准的七个修复路径；这是该轮证据，不代表最终整分支范围。

环境说明：Git 跟踪验证和嵌套 CLI 测试通过获准的子进程执行路径运行；没有跳过、删除或放宽断言。门禁遇到 Git 缺失、非工作树、权限或子进程失败时返回冻结的稳定阻断事实，不包含原始错误或绝对路径。

## P4 决策与边界

P3 has not generated or visually improved a house and provides zero runtime authority.

因此，本次 `passed` 只证明公开知识产品的血缘、确定性、覆盖边界、隔离和零运行时权限符合 P3 合同。它不证明任何建筑审美、生成质量或返工效果已经改善。P4 可以开始受控的候选生成、固定视角评测和设计层返工实验；任何效果结论必须由 P4 新证据支持。
