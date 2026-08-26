# 建筑秘籍阶段 4：可执行建筑语法与影子指导设计

日期：2026-08-26
状态：已完成对话设计，等待书面规范复核
范围：原始总路线第 4 阶段；内部阶段 P4 / 接入等级 A

## 1. 背景与阶段映射

建筑秘籍计划的原始总路线保持不变：

0. 项目空间与总计划；
1. 50 集清单与单集探针；
2. 首批 6 集证据提取；
3. 建筑秘籍 v0.1；
4. 可执行建筑语法；
5. 接入 Minecraft Agent；
6. 实际建造与评价；
7. 扩展到全部 50 集。

P1、P2、P3 分别完成了原始阶段 1、2、3。P3 已把 21 条有血缘的候选规则编译成 15 条核心程序和 6 条案例模式，但所有设计层的 `runtime_authority` 仍为 `none`。P3 证明的是知识产品的血缘、确定性、覆盖边界和隔离，不证明 Agent 已能使用秘籍，也不证明建筑质量已经提高。

本设计完成原始阶段 4，并实现总设计中的接入等级 A：影子指导。它把已审规则转成 Agent 可消费、可验证、可解释的结构化审查语法，但不接入主生成流水线，不修改建筑，不读取视觉画面，也不授予返工执行权限。

原始阶段 5、6 保持独立：阶段 5 才允许秘籍参与候选选择或设计层控制，阶段 6 才建立固定视角、视觉评价和盲选证据。

## 2. 目标

阶段 4 必须交付一个独立、只读的影子审查工具。给定现有生成器产生的 `out/<run>/blueprint.json`，它应当：

1. 从已审秘籍 v0.1 加载唯一主学派 `heihui-jileniao` 的规则、覆盖和未知项；
2. 把现有 blueprint 投影成 `brief / massing / structure / roof / facade` 五层只读事实；
3. 用确定性检查器为 21 条规则逐条产生有证据路径的评估记录；
4. 明确把 `space / materials / interior / scene` 标记为 `not-covered`；
5. 在 `mock` 模式生成逐字节稳定的标准解释；
6. 在 `llm` 模式允许现有 LLM 通道解释权威结论，但不允许模型改判、添规则或生成 patch；
7. 把审查、提示包、解释和人类报告原子地写入当前 run 的专属子目录；
8. 证明运行前后所有既有建筑产物字节不变。

## 3. 非目标

阶段 4 不做以下工作：

- 不修改 `src/pipeline.js` 或 `src/construction/`；
- 不调用生成器、CSG、BSP、A*、体素化、数据包安装或任何返工 Agent；
- 不读取 `preview.html`、截图、视频、世界存档或视觉模型输入；
- 不评价空间、材料、室内和场景层；
- 不生成总审美分、胜率或“建筑更好”的结论；
- 不把 6 条案例模式泛化为通用规律；
- 不新增课程规则、量化阈值、材料政策或未获证据支持的修复操作；
- 不设计通用规则 DSL；
- 不接入生产 Agent，也不开放候选淘汰或设计层重放。

## 4. 已确认的设计决策

### 4.1 独立只读 CLI

阶段 4 使用独立 CLI，而不是修改主流水线：

```bash
npm run playbook:shadow -- --run <out/run-directory> --mode mock
npm run playbook:shadow -- --run <out/run-directory> --mode llm
```

第一版固定使用秘籍 `0.1.0` 和学派 `heihui-jileniao`。没有版本选择、学派选择、规则过滤、输出路径重定向或强制覆盖参数。

### 4.2 检查器注册表

每个已审 `check:*` 标识对应一个小型确定性检查器。统一调度器负责：

- 规则和检查器一一配对；
- 学派、成熟度和覆盖权限；
- 适用性判断；
- 四态结果规范化；
- 证据路径、缺失信号和未知项收集；
- 稳定排序、汇总和哈希。

本阶段不建立通用条件 DSL。未来只有在扩展课程后出现足够多的重复检查模式时，才允许从检查器中提炼 DSL。

### 4.3 混合判断

确定性引擎是唯一裁判；LLM 是受约束的建筑讲解员。

- `mock`：不联网，使用固定模板解释权威结果；
- `llm`：通过现有 `createLlmClient()` 通道请求严格 JSON 解释；
- LLM 失败或输出越权时，确定性审查仍成立；
- LLM 解释永远不能回写权威审查。

### 4.4 结构化输入，不假装视觉观察

第一版只读取 `blueprint.json`。需要屏幕空间、固定视角、色彩观感或真实外观证据的检查必须返回 `unknown`。视觉证据留到原始阶段 6。

## 5. 系统架构

```text
<run>/blueprint.json
          |
          v
Blueprint 输入验证与字节哈希
          |
          v
五层只读投影视图
brief / massing / structure / roof / facade
          |
          v
秘籍语料加载与权限过滤
          |
          v
check:* 检查器注册表
          |
          v
权威 review.json + prompt-packet.json
          |
          +------ mock 固定解释
          |
          +------ llm 受约束解释与验证
          |
          v
manifest.json / explanation.json / report.md
          |
          v
<run>/playbook-shadow/ 原子安装
```

组件边界如下。

### 5.1 输入与路径边界

输入组件只负责解析项目根、`out/` 根和 run 目录，读取 `blueprint.json` 的精确字节并生成 SHA-256。它不理解规则，也不产生解释。

### 5.2 Blueprint 投影器

投影器把当前 blueprint 的白名单字段转换为秘籍命名空间中的只读事实。它不修复字段、不补默认值、不调用 construction schema，也不把“字段存在”自动解释为满足规则。

最低映射包括：

| 秘籍层 | 可读取的 blueprint 范围 | 明确不能推断 |
|---|---|---|
| `brief` | prompt、风格/类型标记、已有视角或设计意图字段 | 真实画面中的视线和细节预算 |
| `massing` | architecture volumes、相对 placement、shell volume boxes、bounds | 屏幕空间面积、视觉中心和空白墙阈值 |
| `structure` | structure support/load-path 描述、体块角色、外挑/基座语义 | 真实受力安全和外观承托可信度 |
| `roof` | roof style/profile/elements、跨度和几何摘要 | 未记录的坡度阈值、明度对比和画面平衡 |
| `facade` | facade elements、window rhythm、frame/opening 语义、几何摘要 | 真实进深观感、重复疲劳阈值和绿植画面路径 |

`space / materials / interior / scene` 不进入可判定投影，只出现在覆盖结果中。

### 5.3 秘籍语料加载器

语料加载器只读取已经提交并通过 P3 的公开产物：

- `reviewed-rules-v0.1.jsonl`；
- `admission-v0.1.json`；
- `coverage-v0.1.json`。

加载器验证版本、学派、21 条规则顺序、运行时投影、检查 ID、修复 ID、未知项和成熟度。权威 `rule_corpus_sha256` 由这三份文件的精确字节与固定相对路径共同计算，避免不同文件组合产生相同身份。

### 5.4 检查器注册表

注册表键为 `check:*`，值为显式检查器描述：

```text
check_id
rule_id
design_layer
kind: structural | evidence-required
evaluate(projected_blueprint, reviewed_rule)
```

每个运行时投影中的检查 ID 必须恰好注册一次。缺项、重复项、规则错配或层错配是合同错误 `CHECK_REGISTRY_INCOMPLETE`，不能变成普通 `unknown`。

`structural` 检查器只能用投影视图中的明确字段得出结果。`evidence-required` 检查器显式记录当前所缺的视觉、阈值或输入信号，并稳定返回 `unknown`。

## 6. 权威评估合同

### 6.1 四态结果

15 条 `admitted-advisory` 核心程序使用完整四态：

- `satisfied`：结构化输入提供充分、正向、可定位的证据；
- `violated`：规则适用，且结构化输入提供充分的反向证据；
- `unknown`：缺少必要字段、视觉证据、量化阈值或适用性证据；
- `not-applicable`：输入中存在明确排除条件或明确不触发该规则。

字段缺失不能被解释为 `not-applicable`。无法判断适用性时必须是 `unknown`。

### 6.2 案例模式权限

6 条 `manual-example-only` 案例模式仍逐条出现在 21 条评估记录中，但当前 blueprint 没有精确教学案例身份。因此：

- 只允许 `unknown` 或 `not-applicable`；
- 可以展示案例观察线索和缺失证据；
- 不允许 `satisfied` 或 `violated`；
- 不允许产生修复建议；
- 不进入核心程序的 satisfied/violated 汇总。

只有未来证据把案例模式提升为 `admitted-advisory`，并更新秘籍版本后，才能开放完整四态。

### 6.3 `review.json`

权威审查至少包含：

```text
schema_version
evaluator_version
playbook_version
school_id
input
  blueprint_path
  blueprint_sha256
  workflow
  seed
rule_corpus_sha256
coverage[]
assessments[]
summary
```

每条 assessment 固定包含：

```text
rule_id
rule_version
teaching_role
admission_status
design_layer
check_id
checker_kind
status
evidence_json_pointers[]
observations[]
missing_signals[]
unknown_ids[]
repair_operation_id
repair_target_layer
invalidates_layers[]
```

约束：

- `evidence_json_pointers` 必须是指向输入 blueprint 的 JSON Pointer；
- `violated` 必须至少有一个证据指针、一个观察事实和秘籍已有的 `repair_operation_id`；
- `unknown` 必须至少列出一个缺失信号或已有 `unknown:*`；
- `not-applicable` 必须记录明确排除观察；
- 非 `violated` 的核心规则不携带修复操作；
- 案例模式永远不携带修复操作；
- 所有数组按语料顺序或固定词典序输出；
- 不包含时间戳、绝对路径、随机 ID 或自然语言模型输出。

### 6.4 覆盖和汇总

coverage 恰好包含九层：

```text
brief / massing / space / structure / roof /
facade / materials / interior / scene
```

五个允许层标记为 `advisory-partial`，四个禁止层标记为 `not-covered`。summary 只提供分层和全局四态计数、核心规则计数、案例模式计数、缺证计数，不产生分数、等级或质量结论。

## 7. LLM 提示与解释合同

### 7.1 `prompt-packet.json`

提示包由权威 review 确定性生成，只包含：

- `review_hash`；
- 学派、秘籍版本和允许解释的五层；
- 每条规则的 ID、层、权威状态、结构化观察、缺失信号、已有 unknown ID 和已有修复 ID；
- 规则的适用条件、排除条件、意图、正向信号和失败模式；
- 明确的权限说明和输出 schema；
- blueprint 原始 prompt 的数据副本，并明确标为不可执行数据。

提示包不包含 API 配置、绝对路径、完整 blueprint、preview、媒体、私有证据或 `.local/` 内容。

### 7.2 `explanation.json`

解释合同至少包含：

```text
schema_version
review_hash
mode
provider
status
layer_explanations[]
rule_explanations[]
overall_unknowns[]
error_code
```

`status` 只能是 `available` 或 `unavailable`。

模型候选不包含解释文本，只能提交严格的权威引用选择：五个固定层行选择该层已有规则 ID，21 个固定规则行原样保留 `rule_id / status / repair_operation_id` 并选择该 assessment 已有的 observations、missing signals 和 unknown IDs，整体 unknown 也只能选择权威 unknown assessment 中已有的 unknown ID 或 missing signal。所有选择都必须唯一、按权威顺序排列并满足提示包声明的数量上限。

wrapper 验证选择后，才由本地确定性代码生成公开 `layer_explanations[] / rule_explanations[] / overall_unknowns[]`。因此模型能够选择强调哪些权威事实，但不能向 `explanation.json` 提供新的词、数字、ID、坐标、路径、方块、patch、分数、阈值或 unknown。

### 7.3 输出验证与降级

LLM 输出必须满足：

- `review_hash` 精确一致；
- 五个层选择行与 21 个规则选择行的集合、顺序、状态和修复 ID 与权威 review 一致；
- 每个引用都属于对应层或对应 assessment，且选择是唯一、权威顺序的有界子集；
- 没有未知字段、未知引用、遗漏行或额外行；
- 公开解释文本严格等于本地 wrapper 对已验证引用的确定性渲染。

任一条件失败，整份模型解释作废。工具写出 `status=unavailable` 和稳定 `error_code`，但仍保留确定性 review、prompt packet 和报告。

`mock` 模式不创建 LLM client、不读取模型环境变量、不联网，并用固定模板产生 `available` 解释。

## 8. CLI、路径与存储

### 8.1 输入范围

`--run` 必须解析为当前项目 `out/` 真实目录的后代，允许候选流水线中的嵌套 candidate 目录。以下情况全部拒绝：

- run 位于 `out/` 之外；
- run 不存在或不是普通目录；
- run、`blueprint.json`、输出父目录或目标文件是符号链接；
- blueprint 缺失、不是普通文件、不是 JSON object；
- workflow 不是 `construction_method_v1`；
- 参数缺失、重复或未知；
- mode 不是 `mock` 或 `llm`。

路径错误只报告稳定相对路径或错误类别，不回显外部绝对路径。

### 8.2 输出拓扑

```text
<run>/playbook-shadow/
  manifest.json
  review.json
  prompt-packet.json
  explanation.json
  report.md
```

`manifest.json` 声明：

- schema 和 evaluator 版本；
- blueprint 与规则语料哈希；
- mode 和 explanation status；
- 五个受管相对路径；
- `review.json`、`prompt-packet.json`、`explanation.json` 和 `report.md` 的 SHA-256。

`manifest.json` 不记录自身最终字节的哈希，因为这会形成不可解的自引用。它仍属于五个受管路径，并由严格 schema、固定 allowlist、普通文件检查和目录所有权验证保护。

报告只使用相对路径，不复制完整规则语料，不声称读取视觉或改善建筑。

### 8.3 所有权和事务

工具先在 run 内的同级私有临时目录构建全部五个文件，完成合同、哈希和报告验证后才安装。

已有 `playbook-shadow/` 只有在 manifest 合法、列出的路径与固定 allowlist 完全一致、所有目标都是普通文件时才能替换。外来目录、额外文件、符号链接、损坏 manifest 或路径漂移全部以 `SHADOW_OUTPUT_OWNERSHIP` 拒绝，不提供 `--force`。

安装任一步失败时恢复本次替换前的合法 shadow 输出并清理本次自有临时文件。既有 blueprint、报告、预览、数据包和其他 run 文件永远不参与安装事务。

mock 模式对相同输入和相同语料逐字节稳定。llm 模式允许 `explanation.json` 和由其渲染的解释段变化，但 `review.json` 与 `prompt-packet.json` 必须逐字节稳定。

## 9. 失败语义

以下错误使 CLI 非零退出，且不得安装新的完成输出：

| 错误码 | 含义 |
|---|---|
| `INVALID_ARGUMENT` | CLI 参数合同无效 |
| `RUN_OUTSIDE_OUT_ROOT` | run 不在项目 `out/` 内 |
| `SYMLINK_NOT_ALLOWED` | 输入或输出路径包含符号链接 |
| `BLUEPRINT_MISSING` | blueprint 不存在或不是普通文件 |
| `BLUEPRINT_INVALID` | JSON 或最低 workflow 合同无效 |
| `PLAYBOOK_CORPUS_INVALID` | 三份公开秘籍产物不一致 |
| `CHECK_REGISTRY_INCOMPLETE` | 检查器缺失、重复或错配 |
| `SHADOW_OUTPUT_OWNERSHIP` | 现有输出不属于本工具 |
| `SHADOW_INSTALL_FAILED` | 原子安装或回滚失败 |

LLM 未配置、超时、网络失败、非法 JSON、越权输出和哈希漂移不使确定性审查失败。它们只在 explanation 中记录稳定类别：

```text
LLM_UNCONFIGURED
LLM_REQUEST_FAILED
LLM_OUTPUT_INVALID
LLM_AUTHORITY_VIOLATION
```

不得持久化模型原始响应、服务端错误正文、API 密钥或完整外部 URL。

## 10. 依赖与权限边界

阶段 4 源码位于 `src/playbook/shadow/`，CLI 位于 `src/runArchitecturePlaybookShadow.js`。它们可以依赖：

- Node 标准库；
- `src/playbook/` 内的合同和纯读取能力；
- `src/llm/createLlmClient.js`，且仅在 `mode=llm` 时使用。

它们禁止依赖：

- `src/construction/`；
- `src/pipeline.js`；
- `src/index.js`；
- Minecraft 世界或数据包 I/O；
- `.local/architecture-playbook/`；
- 未列入 P3 公开语料的来源文件。

新增自动依赖边界测试必须解析 `src/playbook/shadow/` 和 CLI 的实际静态依赖，发现 construction 或 pipeline 边时关闭阶段 4 门禁。

## 11. 测试策略

### 11.1 合同测试

验证严格字段、四态枚举、案例模式状态限制、已有 ID 集合、深冻结、规范化顺序、哈希稳定性和未知字段拒绝。

### 11.2 注册表测试

从已审语料重新计算全部检查 ID，证明：

- 21 条规则逐条有评估入口；
- 每个 `check:*` 恰好注册一次；
- rule、layer、kind 和 checker 映射一致；
- 缺项、重复项和错层返回 `CHECK_REGISTRY_INCOMPLETE`。

### 11.3 检查器测试

每个 `structural` 检查器至少有正例、反例和缺证例。每个 `evidence-required` 检查器证明只会返回 `unknown`。案例模式测试证明没有精确案例身份时不能返回 `satisfied/violated` 或修复操作。

### 11.4 LLM 边界测试

使用注入的假 client 验证：

- 合法解释被接受；
- 状态改写、未知规则、虚构修复、漏项、额外字段和 review hash 漂移导致解释整体作废；
- LLM 失败后权威 review 字节不变；
- mock 模式不创建 client，也不访问网络。

### 11.5 CLI 与存储测试

验证正常 mock 输出、重复运行、候选嵌套目录、非法参数、越界路径、符号链接、外来目录碰撞、损坏 manifest、写入失败和回滚失败。

每个成功 CLI 测试在运行前后计算 run 中所有既有文件的 SHA-256，并证明除 `playbook-shadow/` 外没有字节变化。

### 11.6 三个代表性 blueprint

提交三个原创、最小、结构化夹具：

1. 中世纪正例：提供足够的体块、承托、屋顶和立面语义，使一部分核心检查稳定 `satisfied`；
2. 中世纪缺陷例：提供明确反向结构化证据，使一部分核心检查稳定 `violated` 并引用已有修复 ID；
3. 非适用风格控制例：提供明确排除信号，证明中世纪特有核心规则不会无条件套用。

三个夹具都必须让视觉或阈值不足的规则保持 `unknown`，不能为了提高通过数伪造观察字段。

## 12. 阶段 4 验收门槛

阶段 4 只有同时满足以下条件才算完成：

1. 每次审查恰好输出 21 条规则记录；
2. 15 条核心程序遵守完整四态合同；
3. 6 条案例模式只返回 `unknown/not-applicable` 且没有修复；
4. 五个允许层得到评估，四个禁止层明确为 `not-covered`；
5. 所有 `violated` 都有 blueprint JSON Pointer、观察事实和已有修复 ID；
6. 所有 `unknown` 都有缺失信号或已有 unknown ID；
7. 检查器注册表完整、唯一、层一致；
8. mock 模式的五个输出逐字节稳定；
9. LLM 不能改变权威状态、规则或修复集合；
10. 审查前后所有既有 run 文件哈希不变；
11. P4 源码的实际依赖图没有 construction、pipeline 或 Minecraft I/O；
12. 三个代表性 blueprint 夹具通过各自的精确断言；
13. 完整 `npm test` 通过；
14. 阶段报告明确声明没有视觉输入、没有建筑修改、没有质量提升证据；
15. CLI 关闭或从未运行时，现有生成器的行为和输出保持不变。

## 13. 产物与文档

实现完成后公开提交：

- 影子审查合同与检查器注册表源码；
- 独立 CLI 和 package script；
- 原创 blueprint 测试夹具；
- 阶段 4 自动门禁测试；
- `docs/architecture-playbook/reports/p4-shadow-guidance.md`；
- 更新后的 `docs/architecture-playbook/README.md` 状态和 P4 入口。

真实运行产生的 `out/<run>/playbook-shadow/` 保持在已忽略的运行输出中，不提交到 Git。

## 14. 后续阶段门槛

阶段 4 通过后只证明秘籍能以只读、可追溯方式审查现有结构化建筑结果。它不自动开放阶段 5。

进入阶段 5 前必须由新的设计明确：

- 哪些 `satisfied/violated` 结果可以参与候选选择；
- 如何把 repair ID 编译成有限设计层 patch；
- 如何保存 `DesignLayerCheckpoint` 和下游失效关系；
- 如何在失败时回到最近 accepted chain；
- 怎样证明 `playbook=off` 时旧输出不变。

固定多视角、视觉模型、人工盲选和审美效果结论继续属于阶段 6。

## 15. 预计工作量

在不扩展课程、不加入视觉输入且复用现有 LLM client 的前提下，阶段 4 预计需要 6–10 小时：

- 合同、投影和语料加载：1.5–2 小时；
- 检查器注册表与 21 条规则权限：2–3 小时；
- mock/LLM 解释边界：1–1.5 小时；
- CLI、事务写入和安全路径：1–2 小时；
- 门禁、文档和完整回归：0.5–1.5 小时。

若现有 blueprint 缺少多数结构化信号，检查器应如实返回 `unknown`，而不是通过扩充本阶段范围或读取视觉画面掩盖缺口。
