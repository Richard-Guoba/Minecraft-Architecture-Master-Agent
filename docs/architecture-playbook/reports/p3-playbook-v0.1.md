# P3 建筑秘籍 v0.1 门禁报告

日期：2026-08-25

学派：黑辉极乐鸟（`heihui-jileniao`）

结论：P3 自动门禁通过，P4 开放。

## 输入与产物一致性

- `source_corpus_hash`：`acb642b19f36ecc3633728e3d74a08225d0496c41d00184d3c5f782c7c4a7087`。该哈希按设计覆盖 P2 证据索引、21 条候选、冲突、未知项和 P3 准入政策的规范化内容。
- P2 门禁状态：`passed`。
- 五个受管产物均由同一已验证输入在内存中重建，逐字节检查漂移数为 0；五条受管路径均由 Git 跟踪。
- `src/playbook/manual/` 到 `construction/` 的导入数为 0；P3 没有修改或接入生产建造流水线。

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

自动审计返回 `gate.status = passed`、`gate.next_phase = P4`，没有 blocker code。

## 测试证据

- TDD RED：首次有效运行 `node --test test/playbookP3Gate.test.js` 时，因 `playbookV01Compiler.js` 尚未导出 `auditCheckedInPlaybookV01` 而失败。
- TDD GREEN：实现只读审计后，同一命令通过，1 个测试、0 失败。
- 聚焦门禁：`node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookManualCli.test.js` 在允许嵌套 CLI 子进程的执行环境中通过，110 个测试、0 失败。
- 受管检查：`npm run playbook:manual -- check` 返回 `playbook_status=current`、`artifact_count=5`、`managed_artifact_drift_count=0`。
- 完整回归：`npm test` 在同一允许子进程的执行环境中通过，532 个测试、0 失败。
- `git diff --check`：退出码 0，无输出。
- `git ls-files .local/architecture-playbook`：退出码 0，无输出，即没有私有秘籍路径被跟踪。
- 提交前 `git status --short` 只列出本任务的 README、编译器、P3 报告和门禁测试四个路径。

环境说明：默认受限沙箱中的首次聚焦运行有 14/15 个测试文件通过，但嵌套的 manual CLI 进程 stdout 被环境抑制，导致既有输出断言失败；没有放宽或删除断言。使用获准的子进程执行路径重跑完全相同的命令后，110/110 通过。

## P4 决策与边界

P3 has not generated or visually improved a house and provides zero runtime authority.

因此，本次 `passed` 只证明公开知识产品的血缘、确定性、覆盖边界、隔离和零运行时权限符合 P3 合同。它不证明任何建筑审美、生成质量或返工效果已经改善。P4 可以开始受控的候选生成、固定视角评测和设计层返工实验；任何效果结论必须由 P4 新证据支持。
