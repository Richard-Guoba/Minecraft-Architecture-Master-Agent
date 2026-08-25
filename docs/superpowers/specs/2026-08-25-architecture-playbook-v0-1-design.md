# Architecture Playbook v0.1 — P3 Design

日期：2026-08-25  
阶段：P3 — 秘籍 v0.1  
上游：`docs/superpowers/specs/2026-08-24-architecture-playbook-program-design.md`  
输入门禁：P2 `gate.status = passed`

## 1. 目标

把 P2 的 21 条证据候选整理成一套确定性、可审计、对人和未来 Agent 都可读的 Minecraft 建筑秘籍 v0.1。

P3 必须同时产出：

1. 21 条 P3 准入规则卡；
2. 人类可读秘籍；
3. 术语表与未解决术语附录；
4. 设计层覆盖矩阵；
5. 规则索引；
6. 自动门禁和事实报告。

P3 只建立知识产品和未来运行时投影，不接入、不修改、不影响当前生产生成器。

## 2. 非目标

P3 不做以下工作：

- 不让秘籍自动修改 architecture、topology、blueprint 或 voxel grid；
- 不生成三栋中世纪住宅；
- 不创建 `DesignLayerCheckpoint` 实例；
- 不运行视觉返工或盲选；
- 不把候选规则升级成 `executable`、`validated` 或普遍美学规律；
- 不引入其他作者、建筑学派或 LLM 常识来填补未知参数；
- 不访问 `.local/architecture-playbook/` 中的媒体、字幕、截图或私有 EvidencePack；
- 不为 `space`、`materials`、`interior` 或 `scene` 宣称秘籍覆盖。

影子指导属于 P4，最小可执行设计层属于 P5，多视角和盲选属于 P6。

## 3. 采用方案

采用“合同优先秘籍”：P3 规则卡从 P2 候选确定性派生，通过一份显式准入政策补充教学角色、章节、未来运行时读写边界和覆盖状态。

不采用纯 Markdown 拼接，因为 P4 会再次结构化相同信息；不复用现有 Template Design Law，因为模板知识与课程学派的来源、证据强度和权限不同，复用会混淆血缘。

## 4. 权限与措辞

每条 P3 规则卡必须固定：

- `authority: advisory`；
- `maturity: candidate`；
- `admission_status: admitted-advisory`；
- `effect_validation_status: not-tested`；
- `primary_school: heihui-jileniao`。

“P3 准入”只表示规则通过来源、合同、边界和编辑审查，适合进入秘籍 v0.1；它不表示规则已经证明能提高建筑质量。

公开文档统一使用“黑辉极乐鸟”作为人类可读学派名，机器 ID 保持 `heihui-jileniao`。

## 5. 输入与单一事实来源

P3 只读取已提交的公开文件：

- `docs/architecture-playbook/course/pilot-episodes.json`
- `docs/architecture-playbook/course/notes/heihui-jileniao/*.md`
- `docs/architecture-playbook/rules/schools/heihui-jileniao/evidence-index-v0.1.json`
- `docs/architecture-playbook/rules/schools/heihui-jileniao/candidates-v0.1.jsonl`
- `docs/architecture-playbook/rules/schools/heihui-jileniao/conflicts-v0.1.json`
- `docs/architecture-playbook/rules/schools/heihui-jileniao/unknowns-v0.1.json`
- `docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json`

最后一个文件是 P3 新增的编辑政策。它只允许引用既有 rule ID、Evidence ID、章节和受限投影字段，不得重写 P2 的动作、证据、置信度或作者理由。

## 6. 文件拓扑

```text
src/playbook/manual/
  p3AdmissionPolicy.js           准入政策合同
  reviewedRuleCard.js            P3 规则卡合同与派生
  playbookV01Compiler.js         确定性多产物编译器

src/runArchitecturePlaybookManual.js

docs/architecture-playbook/
  manual/
    v0.1.md                      人类可读秘籍
    terminology-v0.1.json       已解决术语和 unresolved 附录
    coverage-v0.1.json          设计层覆盖矩阵
  rules/schools/heihui-jileniao/
    admission-v0.1.json         编辑准入政策
    reviewed-rules-v0.1.jsonl   21 条 P3 准入规则卡
    rule-index-v0.1.json        章节、层和证据索引
  reports/
    p3-playbook-v0.1.md         P3 门禁事实报告

test/
  playbookP3AdmissionPolicy.test.js
  playbookReviewedRuleCard.test.js
  playbookV01Compiler.test.js
  playbookP3Gate.test.js
```

`package.json` 增加：

```json
{
  "playbook:manual": "node src/runArchitecturePlaybookManual.js"
}
```

支持两个命令：

```text
npm run playbook:manual -- build
npm run playbook:manual -- check
```

`build` 只原子更新上述五个受管输出；`check` 只比较内存构建结果和已提交字节，不写文件。

## 7. P3AdmissionPolicy

准入政策顶层字段固定为：

```text
schema_version
playbook_version
school_id
created_at
chapters
rule_admissions
terminology
coverage
```

`playbook_version` 固定为 `0.1.0`，`school_id` 固定为 `heihui-jileniao`，`created_at` 是固定 UTC 时间，不在每次编译时读取当前时钟。

### 7.1 章节

章节顺序固定：

1. `method-and-boundaries`
2. `massing-foundations`
3. `hierarchy-and-structure`
4. `roof-form`
5. `facade-layers`
6. `medieval-residence`
7. `complete-case`
8. `failure-and-repair`
9. `agent-workflow`
10. `unknowns-and-coverage`

每章包含稳定 `chapter_id`、中文标题、顺序和简介。编译器拒绝重复、缺号或未知章节。

### 7.2 规则准入

每个 `rule_admission` 精确包含：

```text
rule_id
decision
teaching_role
chapter_ids
runtime_projection
editorial_note
```

约束：

- `decision` 在 v0.1 只能是 `admitted-advisory`；
- `teaching_role` 只能是 `core-procedure` 或 `case-pattern`；
- 21 条 P2 候选必须各出现一次；
- 恰好 15 条 `core-procedure` 和 6 条 `case-pattern`；
- 每条规则至少进入一个章节；
- `editorial_note` 只能说明编排和使用边界，不能增加建筑事实。

### 7.3 未来运行时投影

`runtime_projection` 是惰性描述，不包含可执行代码：

```text
coverage_status
input_signals
proposal_fields
observable_checks
repair_operations
invalidates_layers
```

约束：

- `coverage_status` 只能为 `advisory-partial` 或 `manual-example-only`；
- `core-procedure` 使用 `advisory-partial`；
- `case-pattern` 使用 `manual-example-only`；
- `input_signals` 和 `proposal_fields` 只允许下面列出的受控路径；
- `invalidates_layers` 只能引用本规则层及其下游已覆盖层；
- 所有数组保持唯一、稳定顺序且至少含一项，除非 `invalidates_layers` 合理为空。

受控字段路径固定为：

```text
brief.prompt
brief.primary_viewpoint
brief.detail_budget
brief.scene_intent
massing.volumes
massing.primary_volume_id
massing.secondary_volume_ids
massing.volume_relations
massing.blank_plane_regions
structure.frames
structure.load_paths
structure.overhangs
structure.support_paths
structure.base_strategy
roof.span
roof.profile
roof.slope_pattern
roof.border_role
roof.secondary_roofs
roof.ridge_axis
roof.surface_regions
facade.bay_grid
facade.frame_depth
facade.infill_depth
facade.openings
facade.motif_signatures
facade.variation_axes
facade.vegetation_path
```

`observable_checks` 使用 `check:<layer>:<kebab-id>`，`repair_operations` 使用 `repair:<layer>:<kebab-id>`。二者的 `<layer>` 必须是五个允许层之一，并与规则层或其下游相符。它们只是稳定标识符，P3 不绑定执行函数。

该投影为 P4 提供匹配和建议边界，但 P3 不执行投影。

## 8. ReviewedRuleCard

规则卡继承 P2 候选的建筑内容，不复制来源以外的知识。顶层字段固定为：

```text
schema_version
playbook_version
rule_id
rule_version
source_candidate_sha256
primary_school
source_episode_bvids
evidence_ids
claim_type
design_layer
teaching_role
chapter_ids
authority
maturity
admission_status
effect_validation_status
intent
applicability
prerequisites
exclusions
action
parameters
implementation_hints
positive_signs
failure_modes
repairs
author_reason
confidence
conflict_ids
runtime_projection
editorial_note
```

派生规则：

1. 对 P2 候选对象进行稳定规范化并计算 `source_candidate_sha256`；
2. 建筑内容字段逐字段复制，禁止准入政策覆盖；
3. 从准入政策加入教学角色、章节、投影和编辑说明；
4. 权限和成熟度使用第 4 节固定值；
5. 保留冲突引用；
6. 深克隆、深冻结并拒绝额外字段。

规则卡没有 `supersedes`，因为 P3 没有作者更新证据，也没有旧版已审规则可替代。

## 9. 规则分类

15 条 `core-procedure`：

- 体块基础 2 条；
- 主次和辅助体 2 条；
- 屋顶 3 条；
- 墙面 4 条；
- 中世纪结构 4 条。

6 条 `case-pattern`：

- 塔楼衔接；
- 窗式母题统一；
- 绿植构图路径；
- 视角细节预算；
- 暖色主体与深色塔顶平衡；
- 前中后景构图。

案例规则保留在秘籍中供解释和未来验证，但 P3 不把它们当作通用运行时程序。

## 10. 术语表

`terminology-v0.1.json` 顶层字段：

```text
schema_version
playbook_version
school_id
resolved_terms
unresolved_terms
source_rule_ids
```

已解决术语至少包含：体块、主体、次体、连接体、主次、框架、墙芯、墙间、包边、坡度、外挑、横架、斜撑、石质基座、主要观景面。

每个已解决术语包含：

```text
term_id / display_name / definition / aliases / rule_ids / scope_note
```

定义必须由 P2 讲义和规则动作重组，不得加入现实建筑史主张。

未解决术语来自 P2 的公开未知边界，至少包含：

- 构图框架的作者原词；
- 并列体块关系的精确作者术语；
- 锥形屋顶局部构件名称；
- 板条墙和具体方块名称；
- 活板门、栅栏门等 ASR 混淆。

每项包含影响和处理政策：不生成数值或材料参数，仅保留可观察关系。

## 11. 覆盖矩阵

完整设计层顺序：

```text
brief -> massing -> space -> structure -> roof -> facade -> materials -> interior -> scene
```

P3 状态：

| 层 | 状态 | 说明 |
| --- | --- | --- |
| `brief` | `advisory-partial` | 主要视角、细节预算和场景意图只来自案例 |
| `massing` | `advisory-partial` | 体块、主次、连接和外挑 |
| `space` | `not-covered` | 不接管现有空间规划 |
| `structure` | `advisory-partial` | 框架、传力表达和支撑 |
| `roof` | `advisory-partial` | 包边、坡度、大面和方向 |
| `facade` | `advisory-partial` | 框架、墙芯、进深、分区和重复 |
| `materials` | `not-covered` | 只有相对色彩观察，没有材料系统 |
| `interior` | `not-covered` | 六集不含内饰体系 |
| `scene` | `not-covered` | 案例有场景观察，但不足以接管场景生成 |

每层记录 `rule_ids`、`known_capabilities`、`unknown_ids`、`runtime_authority`。所有层的 `runtime_authority` 在 P3 均为 `none`。

## 12. 人类可读秘籍

`manual/v0.1.md` 必须：

- 以边界声明开篇；
- 使用第 7.1 节的固定章节顺序；
- 每个核心结论同行引用 rule ID；
- 每条规则卡链接到 Evidence ID 和来源课次；
- 把操作流程写成“判断条件 → 动作 → 观察 → 失败 → 修复”；
- 单独标明案例模式，避免冒充通用规则；
- 包含面向未来 Agent 的只读工作流；
- 明确列出未覆盖层、未知参数和条件冲突；
- 不包含逐字稿、连续来源文本、截图或私有路径。

秘籍只由编译器生成，手工编辑入口是准入政策和 P2 公共候选，不直接编辑生成后的 Markdown。

## 13. 编译流程

```text
loadP2PublicCorpus
  -> validateP3AdmissionPolicy
  -> derive 21 ReviewedRuleCards
  -> compile terminology
  -> compile coverage matrix
  -> compile rule index
  -> render manual Markdown
  -> compute artifact hashes
  -> build/check fixed managed outputs
```

编译器输出：

```text
playbook_version
school_id
source_corpus_hash
reviewed_rule_count
core_procedure_count
case_pattern_count
artifact_hashes
artifacts
```

`source_corpus_hash` 覆盖 P2 证据索引、21 条候选、冲突和未知项的稳定规范化内容，以及 P3 准入政策。输入顺序或字节改变会改变哈希。

## 14. 原子写入与错误处理

CLI 只允许 `build` 和 `check`，拒绝未知命令和参数。

`build`：

1. 在内存中完成全部验证与渲染；
2. 确认所有目标位于五个固定受管路径；
3. 把每个产物写到同目录唯一临时文件；
4. 在替换前把五个原文件字节保存在内存中，并记录原文件是否存在；
5. 所有临时文件成功后逐一原子替换；
6. 任一替换失败时，把已替换目标恢复为原字节，原先不存在的目标则删除，再清理所有临时文件；
7. 回滚失败必须作为独立稳定错误报告，列出可能不一致的固定目标，不能静默成功。

`check`：

1. 在内存中重建；
2. 逐字节比较五个已提交产物；
3. 任一缺失或漂移时返回稳定错误和目标相对路径；
4. 不写文件。

合同错误必须指出稳定错误码和字段路径。编译器遇到以下情况停止，不产生部分输出：

- P2 gate 未通过；
- 候选、Evidence ID、章节或冲突引用悬空；
- 规则数量或 15/6 分类漂移；
- 准入政策试图改变建筑内容；
- 投影使用未覆盖层或未知字段；
- 规则权限或成熟度升级；
- 术语引用未知规则；
- 生成产物出现 `.local/`、绝对路径或完整字幕字段。

## 15. 自动审计与测试

所有生产行为按红—绿—重构实现。

### 15.1 合同测试

- 准入政策接受精确 21 条映射并深冻结；
- 拒绝缺失、重复、未知 rule ID；
- 拒绝 15/6 分类漂移；
- 拒绝投影越过允许设计层；
- 规则卡逐字段保留 P2 建筑内容；
- 拒绝权限和成熟度升级。

### 15.2 编译测试

- 同一输入两次编译产物字节一致；
- 21 条规则全部进入索引和秘籍；
- 每个核心结论含 rule ID；
- 所有 Evidence ID 可回链；
- 术语和覆盖矩阵与政策一致；
- 冲突双方仍然可见；
- `build` 在临时项目写出五个产物；
- `check` 接受一致产物并拒绝单字节漂移。

### 15.3 泄漏和隔离测试

- 公开产物不出现 `.local/architecture-playbook`、绝对路径、`segments`、`words` 或 `draft-transcript`；
- `src/playbook/manual/` 不导入 `src/construction/`；
- `src/construction/`、`src/pipeline.js` 和 `src/index.js` 不因 P3 修改；
- 完整 `npm test` 保持通过。

### 15.4 P3 门禁

P3 通过条件：

```text
p2_gate_status = passed
reviewed_rule_count = 21
core_procedure_count = 15
case_pattern_count = 6
dangling_reference_count = 0
cross_school_count = 0
authority_escalation_count = 0
maturity_escalation_count = 0
covered_runtime_layer_count = 0
public_leak_count = 0
managed_artifact_drift_count = 0
```

`covered_runtime_layer_count = 0` 表示 P3 没有把任何层交给秘籍运行时；`advisory-partial` 是知识覆盖，不是执行权限。

## 16. P3 报告

`reports/p3-playbook-v0.1.md` 记录：

- P2 输入哈希；
- 21 条规则按章节和层统计；
- 15/6 教学角色统计；
- 术语数量和 unresolved 数量；
- 覆盖与未覆盖层；
- 冲突和七个公开未知项；
- 编译与测试结果；
- P4 是否开放。

报告不得声称秘籍已提高建筑审美。P4 只在 P3 自动门禁通过后开放。

## 17. 验收标准

- 21 条 P2 候选逐一派生为 P3 规则卡，原内容和血缘不漂移；
- 恰好 15 条核心程序、6 条案例模式；
- 每条规则具有条件、动作、观察结果、失败和修复；
- 秘籍核心结论可反向引用规则、Evidence ID 和课次；
- 术语表不静默修复 unresolved 方块名或作者原词；
- 覆盖矩阵明确五层部分覆盖和四层未覆盖；
- 所有运行时权限仍为 `none`；
- 五个受管产物可确定性重建并通过 `check`；
- 没有私有来源内容进入 Git；
- 生产生成器代码和关闭秘籍时的行为保持不变；
- P3 门禁报告以证据决定是否开放 P4。
