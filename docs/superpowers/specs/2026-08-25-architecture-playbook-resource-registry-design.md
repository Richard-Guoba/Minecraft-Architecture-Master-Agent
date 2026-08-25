# 建筑教程资源登记册设计

日期：2026-08-25

状态：聊天设计已确认，等待书面设计审阅

范围：外部 Minecraft 建筑教程网站的登记、隔离、代表性探针、评估和人工晋级

## 1. 目的

本设计为持续扩充的 Minecraft 建筑教程建立一个稳定入口。它解决的是“发现资源后先怎样保存和判断”，不是立即把所有内容抓取、总结或接入生成器。

资源登记册必须同时做到：

- 接受内容结构、访问方法和教学思想完全不同的网站；
- 保留平台、作者、课程、学派和单个内容条目的区别；
- 让 AI 能比较资源价值，但不能未经批准批量处理；
- 让每项来源的访问、权利和版本状态可追溯；
- 防止新资源静默污染现有黑辉极乐鸟课程、规则或学派知识；
- 为未来站点专属适配器提供明确输入，而不提前实现这些适配器。

## 2. 与现有建筑秘籍计划的关系

`docs/architecture-playbook/course/`、`course/notes/` 和 `rules/schools/` 保存已经进入证据提炼流程的课程事实与规则。新登记册位于它们的上游：

```text
外部网站
-> 资源登记
-> 代表性探针
-> AI 评估
-> 项目所有者决定
-> approved-for-intake
-> 另行设计站点处理器
-> 证据或案例流程
```

`approved-for-intake` 不等于成为课程、规则或学派，也不授予训练、下载或发布权限。任何从登记册进入现有 playbook 知识层的过程，都必须有单独设计和明确来源映射。

当前黑辉极乐鸟课程处理是并行工作。本设计和第一版实施不得修改：

- `docs/architecture-playbook/course/`；
- `docs/architecture-playbook/rules/`；
- `.local/architecture-playbook/sources/`；
- `.local/architecture-playbook/transcripts/`；
- `.local/architecture-playbook/frames/`；
- `.local/architecture-playbook/evidence/`；
- 当前课程处理代码、运行和报告。

## 3. 已确认决策

### 3.1 两阶段流程

所有新网站先登记和探测，只有项目所有者审阅 AI 评估后才能晋级。登记本身不启动批量抓取。

### 3.2 代表性样本优先

每个网站第一轮选择 3–5 个差异化样本。样本用来验证访问、内容结构、价值和风险，不用来假装代表整站质量。

### 3.3 共享外壳、站点内部隔离

所有网站共享少量稳定合同，以便统一查询和比较。每个网站拥有独立目录、探针和评估，以便保留站点特性。

### 3.4 AI 建议、人工晋级

AI 可以生成 `recommend-approve`、`recommend-defer` 或 `recommend-reject` 建议，但不能把生命周期写成 `approved-for-intake`。晋级必须引用项目所有者的决定记录。

### 3.5 第一版边界

第一版建立登记册、合同、两个来源及各五个只读探针。它不开发批量下载器、站点抓取器、Wiki 导入器、训练数据转换器或建造 Agent 接入。

## 4. 方案比较

### 4.1 共享外壳、站点内部隔离（采用）

共享身份、访问、权利、覆盖、知识用途、状态和评分字段；把站点特有信息留在各自目录。该方案既允许全局检索，也不会强迫逐层 3D 案例与 Wiki 文章使用同一种内容模型。

### 4.2 单一扁平账本

把所有网站和样本写进一个 JSONL 文件，初期简单，但会快速积累大量可选字段，削弱隔离与可读性。

### 4.3 每站完全独立

每个网站拥有独立字段和状态体系，隔离最强，但无法统一去重、比较、查询或执行晋级控制。

## 5. 仓库空间

### 5.1 公开、可提交空间

```text
docs/architecture-playbook/resources/
  README.md
  catalog.json
  schemas/
    catalog.schema.json
    source-profile.schema.json
    probe-report.schema.json
    promotion-decision.schema.json
  sources/
    mcblock/
      source.json
      probes/
        <probe-id>.json
      assessment.md
    zh-minecraft-wiki/
      source.json
      probes/
        <probe-id>.json
      assessment.md
```

未来决定记录使用：

```text
docs/architecture-playbook/resources/sources/<source-id>/decisions/
  <yyyy-mm-dd>-<decision>.json
```

第一版没有晋级决定，因此不创建虚假的批准记录。

`source.json` 是网站级事实来源。`catalog.json` 只保存来源 ID、显示名称、生命周期、profile 路径和 assessment 路径。详细字段不得在 catalog 中维护第二份副本。`catalog.schema.json` 固定这个共享入口的最小合同；catalog 的条目必须与所引用 profile 一致。

`catalog.json` 使用 `schema_version: 1`，包含稳定的 `catalog_id`、`updated_at` 和 `sources`。每个 source 索引项只含：

```text
source_id
title
lifecycle_status
profile_path
assessment_path
```

`assessment_path` 在 `registered` 或 `probing` 时为 `null`，从 `assessed` 开始必须指向所属来源目录的报告。规范 URL 的唯一性由登记册加载器读取 profile 后验证，不在 catalog 复制 URL。

### 5.2 本地、不可提交空间

若只读探针必须临时保存响应、网页快照或提取中间物，只能使用：

```text
.local/architecture-playbook/resources/<source-id>/
  snapshots/
  access/
  work/
```

这些目录必须继续受 `.gitignore` 保护。第一版不要求下载或保存网页；能够只用直接访问结果和短篇原创记录完成的探针不得创建本地副本。

## 6. 概念边界

登记册区分以下概念：

- `platform`：托管或组织多项内容的网站；
- `publisher`：发布或维护内容的组织；
- `creator`：单个建筑、视频或教程的创作者；
- `course`：有明确顺序和教学目标的一组内容；
- `school`：经明确设计和审核后形成的作者教学体系；
- `content_unit`：单个页面、建筑、视频、章节或步骤。

平台不是学派，多作者网站也不是单一作者。作者未知时保持未知。集体编辑 Wiki 使用 `collective-editorial`，不伪装成单一作者观点。

登记阶段不产生跨网站综合规则，也不创建 `school_id`。将来源映射到学派只能由后续独立设计决定。

## 7. `SourceProfile` 合同

`source-profile.schema.json` 使用严格对象、`schema_version: 1` 和拒绝未知顶层字段的策略。`source.json` 至少包含以下字段组。

### 7.1 身份

```text
schema_version
source_id
title
canonical_url
alternate_urls
registered_at
last_checked_at
```

`source_id` 使用稳定的 lowercase kebab case。URL 必须是绝对 HTTPS URL；备用入口不能替代规范 URL。

### 7.2 来源性质

```text
source_type
operator
publisher
creator_model
platform_is_school
```

`source_type` 第一版允许：

- `case-catalog`；
- `author-course`；
- `collective-reference`；
- `video-platform`；
- `mixed-resource-platform`。

`creator_model` 第一版允许 `single-author`、`multi-creator`、`collective-editorial` 和 `unknown`。`platform_is_school` 第一版必须为 `false`。

### 7.3 内容结构与访问

```text
content_hierarchy
content_unit_types
representation_modes
access_methods
requires_login
client_rendered
robots_observation
api_access
artifact_access
availability_status
access_notes
```

`requires_login` 和 `client_rendered` 分别使用 `true`、`false` 或 `unknown`。`robots_observation`、`api_access` 和 `artifact_access` 都是结构化观察对象：

```text
status
evidence_url
checked_at
note
```

其中 `status` 允许 `observed-available`、`observed-unavailable`、`requires-login`、`restricted`、`not-reviewed`、`unknown` 和 `not-applicable`。该状态只描述观察到的访问能力，不代替权利判断。

`artifact_access` 回答“技术上能否取得内容”，第 7.5 节的 `artifact_download` 回答“现有证据是否允许下载用途”；两者不得互相推定。

`availability_status` 与生命周期分离，允许：

- `reachable`；
- `partial-js-render`；
- `manual-or-api-review-required`；
- `source-unavailable`；
- `unknown`。

访问失败不等于资源被拒绝。

### 7.4 覆盖与知识用途

```text
styles
building_types
difficulty_levels
scale_range
game_editions
game_versions
game_modes
design_layers
knowledge_modes
```

`knowledge_modes` 第一版允许：

- `design-principles`；
- `construction-sequence`；
- `reference-case`；
- `materials`；
- `survival-constraints`；
- `visual-evaluation`。

未经页面或站点证据支持的覆盖值保持 `unknown`，不能根据网站名称猜测。

### 7.5 权利与允许用途

以下状态必须分别记录：

```text
public_access
local_analysis
automated_retrieval
artifact_download
model_training
external_redistribution
```

每项都是包含 `status`、`evidence_url`、`checked_at` 和 `note` 的对象。`status` 使用 `observed-allowed`、`observed-prohibited`、`not-reviewed`、`unknown` 或 `not-applicable`。只有证据页面明确支持时才使用 `observed-allowed` 或 `observed-prohibited`；它表示登记结论，不包装成法律意见。公开、免费或可下载不能自动推出其他状态。

### 7.6 处理建议与生命周期

```text
extractable_fields
suitable_ai_operations
prohibited_operations
adapter_requirements
risk_flags
lifecycle_status
assessment
decision_history
```

`assessment` 在 `registered` 和 `probing` 时必须为 `null`；从 `assessed` 开始必须为以下对象：

```text
path
sha256
completed_at
probe_ids
recommendation
ratings
risk_flags
```

`recommendation` 只允许 `recommend-approve`、`recommend-defer` 或 `recommend-reject`。`ratings` 使用第 9 节的九个固定维度。`decision_history` 在所有生命周期中都必须存在，是按决定时间排序的相对 decision 文件路径数组；没有决定时为空数组。生命周期为 `approved-for-intake`、`deferred` 或 `rejected` 时，数组必须非空，最后一条有效决定必须与当前生命周期一致。

生命周期允许：

```text
registered
-> probing
-> assessed
-> approved-for-intake | deferred | rejected
```

`approved-for-intake` 必须存在有效的项目所有者决定引用。评估缺失、来源不可访问或权利未知时，AI 可以建议延期，但不得伪造结论。

## 8. `ProbeReport` 合同

每个探针只分析一个内容单元，并保存在所属来源目录。`probe-report.schema.json` 至少要求：

```text
schema_version
probe_id
source_id
canonical_url
title
sample_role
selection_reason
observed_at
observation_bases
access_result
content_revision
content_fingerprint
creator_observation
observed_structure
extractable_fields
knowledge_value
rights_observations
blocking_conditions
recommended_adapter_behavior
summary
```

`creator_observation` 结构化记录内容单位的作者，而不是复用来源级 `creator_model`：

```text
status
display_name
profile_url
bases
```

`status` 允许 `known`、`unknown`、`conflicting` 和 `not-applicable`。`known` 必须提供 `display_name`；其他状态的 `display_name` 可以为 `null`。`bases` 是非空数组，每项使用本节定义的 observation basis；它允许冲突作者信息同时保留多类依据。来源级 `creator_model: multi-creator` 不会自动给单个内容单位填入作者。

`observation_bases` 中的每条信息必须标记为：

- `direct-page`：直接页面观察；
- `site-claim`：网站对自身的说明；
- `search-index`：搜索索引或缓存摘要；
- `project-inference`：本项目推断；
- `unverified`：尚未验证。

搜索摘要不能伪装成直接页面观察。无法获得稳定修订号或指纹时使用显式 `unknown`，不得根据标题生成伪哈希。

探针只提交原创摘要、短篇事实转述和来源链接。它不得提交完整网页、长段转载、整套逐层数据、模型文件或大批图像。

## 9. 评价维度

每个探针和网站 assessment 分别评价：

```text
principles
construction_sequence
reference_case
materials
survival_constraints
evaluation
provenance
access_stability
rights_clarity
```

每项取 `0`–`4` 或 `unknown`，并附一句理由。`0` 表示已有证据证明不具备该价值；未知不能写成 `0`。

登记册不计算单一总分。不同类型资源各有价值，例如逐层案例与概念教程不能通过一个平均数互相替代。

`assessment.md` 是人类可读报告，汇总：

- 网站定位；
- 探针覆盖与局限；
- 各维度判断；
- 技术、来源和权利风险；
- `recommend-approve`、`recommend-defer` 或 `recommend-reject`；
- 若建议晋级，下一阶段需要设计的适配器及其边界。

机器可验证的 probe ID、推荐、九维评分、风险、路径和报告哈希保存在 `source.json` 的 `assessment` 对象中。结构化对象是机器事实来源；测试不解析自由 Markdown，只验证报告存在且 SHA-256 匹配。人工发现 Markdown 与结构化对象语义不一致时，必须先修正二者并更新哈希，才能创建决定记录。

## 10. `PromotionDecision` 合同

`promotion-decision.schema.json` 记录：

```text
schema_version
decision_id
source_id
decision
decided_by
decided_at
assessment_path
assessment_sha256
probe_ids
conditions
reason
```

`decision` 只允许 `approved-for-intake`、`deferred` 或 `rejected`。第一版 `decided_by` 必须为 `project-owner`。`assessment_sha256` 必须与被审阅报告匹配。决定是追加记录，不能覆盖旧决定；后续改变决定时创建新记录并保留谱系。

## 11. 新资源登记流程

```text
用户提供网址和说明
-> 规范化 URL 与 host
-> 检查 catalog 和备用 URL 去重
-> 创建或更新 source profile
-> 按内容差异选择 3–5 个样本
-> 只读探针
-> 分别写 probe report
-> 汇总 assessment
-> AI 给出建议
-> 项目所有者决定
```

处理规则：

- 重复网址更新现有来源的核验记录，不新建同义来源；
- 同一平台的不同作者先保留为内容单位或 creator，不自动拆成学派；
- 需要登录、绕过 robots、规避反自动化或下载受限内容时停止该访问路径；
- 可用公开 API 也必须单独记录 API 条款、速率和返回结构；
- 任何批量处理都必须等待 `approved-for-intake` 和新的适配器设计。

`3–5` 是后续新来源的通用探针范围。首批 MCBlock 和中文 Minecraft Wiki 已明确各选五个，因此第一版交付与测试固定为每站五个；这不是通用 schema 的固定数量。

## 12. 第一批来源与探针

### 12.1 MCBlock

网站入口：[MCBlock 建筑库](https://mcblock.top/buildings)

初始定位：多作者 `case-catalog`。站点公开页面说明其建筑具有 3D 预览、逐层学习、材料或方块数量等结构。登记册只把这些记为站点声明或可观察元数据，不能据此推定下载、训练或再发布权限。

五个探针：

1. [茶坊](https://mcblock.top/buildings/c8db481c-e86e-47ae-976d-2a870ab2855b)：已知作者、国风、高级、多层屋檐；
2. [玉桂狗咖啡厅](https://mcblock.top/buildings/7583ff98-a659-487c-b71a-731075f99b0c)：已知作者、新手、曲面与配色；
3. [维多利亚庄园](https://mcblock.top/buildings/6e5b406e-151d-492c-91c4-e8b22d1920b0)：中世纪、大型、高级、复杂体量；
4. [现代办公楼·四](https://mcblock.top/buildings/06941222-9fae-4045-882a-f82b4feb71f7)：未知作者、现代、大师级、超大体量；
5. [樱花女巫小屋](https://mcblock.top/buildings/5f3aff4d-3a47-4fb7-8f08-5da73250e66d)：未知作者、小型、新手案例。

探针重点：

- 页面与内容单位身份是否稳定；
- 服务器 HTML 与 JavaScript 渲染后的差异；
- 3D 查看器和逐层数据如何表示；
- 材料、尺寸、难度、风格和作者字段是否一致；
- 导出能力是否需要账户或特定操作；
- 已知与未知作者内容能否可靠区分；
- 无需规避限制时 AI 能读取的最小信息。

### 12.2 中文 Minecraft Wiki

网站入口：[中文 Minecraft Wiki 教程](https://zh.minecraft.wiki/w/%E6%95%99%E7%A8%8B)

初始定位：`collective-reference`。其建筑教程更适合提供基础概念、材料、生存约束和构件方法，而不是单一作者学派。页面可能存在 robots 或自动访问差异，探针必须如实记录访问依据。

五个探针：

1. [教程总入口](https://zh.minecraft.wiki/w/%E6%95%99%E7%A8%8B)：分类与导航结构；
2. [最佳建筑材料](https://zh.minecraft.wiki/w/Tutorial%3A%E6%9C%80%E4%BD%B3%E5%BB%BA%E7%AD%91%E6%9D%90%E6%96%99)：材料评价维度；
3. [房屋类型](https://zh.minecraft.wiki/w/Tutorial%3A%E6%88%BF%E5%B1%8B%E7%B1%BB%E5%9E%8B)：建筑类型与施工描述；
4. [屋顶建造指南](https://zh.minecraft.wiki/w/Tutorial%3A%E5%B1%8B%E9%A1%B6%E5%BB%BA%E9%80%A0%E6%8C%87%E5%8D%97)：比例、坡度、连接与施工顺序；
5. [屋顶类型](https://zh.minecraft.wiki/w/Tutorial%3A%E5%B1%8B%E9%A1%B6%E7%B1%BB%E5%9E%8B)：构件分类与变体。

探针重点：

- 页面和章节层级；
- 修订 ID、更新时间及稳定链接是否可获得；
- 中文转换、重定向和命名空间行为；
- 页面正文、图片、模板与引用的边界；
- 浏览器、MediaWiki API、搜索索引和人工访问的可行性差异；
- 站点许可对原创摘要、结构化事实、图片和再发布的不同约束；
- 游戏版本变化导致的过时风险。

## 13. 错误处理

- JavaScript 内容未加载：`availability_status: partial-js-render`，保留已观察字段并标记缺失；
- robots 阻止自动访问：`manual-or-api-review-required`，不尝试绕过；
- 页面删除或失效：`source-unavailable`，保留旧 URL 和探针；
- API 不存在或条款不清：保持 `api_access.status: unknown` 或 `not-reviewed`；
- 权利信息找不到：相关权限保持 `unknown`；
- 作者不明：`creator_observation.status` 保持 `unknown`；
- 页面内容变化：保留旧探针，创建新的复核探针或版本记录；
- 站点内字段矛盾：同时记录冲突观察，不选择更方便的一项覆盖另一项；
- 探针不足以评价：相应评分写 `unknown`，assessment 建议延期；
- 本地快照写入越界：立即失败，不回退到仓库公开目录。

## 14. 实现与代码边界

第一版允许新增独立的登记册合同和加载器，例如：

```text
src/playbook/resources/
  resourceRegistry.js
  resourceContracts.js

test/playbookResourceRegistry.test.js
```

这些模块只能读取 `docs/architecture-playbook/resources/`，不得导入课程获取、证据包、候选规则或建造 runtime。网络探针不能在测试中实时访问外网；测试使用最小临时夹具。

第一版不增加生产生成流程调用，不修改 `src/construction/workflow.js`，也不增加自动抓取 npm 命令。

## 15. 验证策略

### 15.1 合同测试

- catalog 的必填字段、条目路径和 schema 版本严格；
- source、probe 和 decision 的必填字段与枚举严格；
- 未知顶层字段、错误 schema 版本和非法状态被拒绝；
- URL 必须是绝对 HTTPS URL；
- ID、相对路径和来源目录不能逃逸；
- probe 的 `source_id` 必须与物理目录和 profile 一致；
- `approved-for-intake` 必须引用有效的项目所有者决定；
- `registered` 与 `probing` 的 assessment 必须为 `null`，`assessed` 及以后必须包含完整 assessment 对象；
- `decision_history` 在无决定时为空数组；决定型生命周期要求数组非空，且最后一条有效决定与当前生命周期一致；
- 已知 creator 必须有显示名称，未知 creator 不能伪造名称；
- 未知权利状态不能被转换成允许；
- `unknown` 评分与数值 `0` 保持不同语义。

### 15.2 登记册一致性测试

- catalog 中来源 ID、规范 URL 和 profile 路径唯一；
- catalog 状态与 source profile 一致；
- 每个 profile 和 assessment 路径存在且处于资源根目录；
- 每个来源第一版恰有五个唯一 probe；
- probe URL 属于声明的来源 host；
- source profile 的 assessment 对象引用的 probe ID 全部存在，且 assessment Markdown 的 SHA-256 匹配；
- 不存在自动生成的 promotion decision。

### 15.3 隔离与公开边界测试

- 资源加载器不读取 `course/`、`rules/` 或现有私有证据目录；
- source profile、probe 和 assessment 不包含完整页面快照、媒体载荷、绝对本地路径或具体 `.local` 产物引用；`README.md` 可以说明标准 `.local/architecture-playbook/resources/` 边界；
- 不允许一个 probe 引用另一个来源的 profile 或站点特有私有字段；
- 不允许 source profile 声明 `platform_is_school: true`；
- 网络不可用时合同测试仍能确定运行。

### 15.4 验证命令

实施阶段至少运行：

```bash
node --test test/playbookResourceRegistry.test.js
npm test
```

若第一版只新增数据与合同，仍必须运行全套 `npm test`，确认现有 playbook 和生产生成行为不变。

## 16. 第一版完成标准

第一版必须同时产生：

- 2 个网站级 source profile；
- 10 个差异化 probe report；
- 2 份综合 assessment；
- 1 个全局 catalog；
- 4 个严格 schema；
- 1 份资源登记册 README；
- 对应合同、一致性和隔离测试；
- 0 个自动晋级决定；
- 0 次批量下载；
- 0 项现有学派、课程和规则内容修改。

两个来源最终停在 `assessed`。每份 assessment 必须给出推荐决定、推荐用途、未解决风险，以及若获批准时下一阶段适配器的设计范围。

## 17. 非目标

第一版不包括：

- 抓取 MCBlock 全部建筑；
- 下载 MCBlock 投影、模型或完整逐层数据；
- 镜像中文 Minecraft Wiki；
- 大量复制 Wiki 正文或图片；
- 创建 MCBlock 或 Wiki 学派；
- 从两个来源生成综合建筑规则；
- 自动写入现有 course manifest；
- 接入 `TemplateKnowledgeAgent` 或建造 runtime；
- 使用来源内容训练模型；
- 自动批准任何来源。

## 18. 下一道门

本书面设计经用户审阅后，下一步是编写详细实施计划。计划应把合同、目录、两个 source profile、十个探针、两份 assessment 和验证拆成可独立检查的小任务，并继续保持对当前黑辉极乐鸟课程工作的零修改边界。
