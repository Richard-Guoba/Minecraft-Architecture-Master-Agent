# P4 可执行建筑语法与影子指导门禁报告

日期：2026-08-26
学派：黑辉极乐鸟（`heihui-jileniao`）
阶段：原始总路线第 4 阶段 / 内部 P4 / 接入等级 A

## 范围与结论

P4 门禁通过。P5 是下一阶段，但在新的设计获批前仍未开放。P4 将已审秘籍转换为可消费、可验证、可解释的只读影子审查；它不接入主生成流水线，也不授予候选淘汰、设计层控制或返工执行权限。

本报告不作超出证据的结论：没有视觉输入、没有修改建筑、没有生成器集成、没有审美分数，不证明任何质量提升，也没有把 6 条案例模式泛化为通用规律。固定多视角、视觉模型、人工盲选和审美效果结论仍属于 P6，P6 没有开放。

## 输入、语料与确定性

影子 CLI 的受限入口为：

```bash
npm run playbook:shadow -- --run <out/run-directory> --mode mock
npm run playbook:shadow -- --run <out/run-directory> --mode llm
```

它只读取既有 `out/<run>/blueprint.json` 的精确字节，校验其路径、普通文件属性、工作流和 SHA-256；不读取预览、截图、视频、世界存档或视觉模型。投影只覆盖 `brief`、`massing`、`structure`、`roof`、`facade` 五层；`space`、`materials`、`interior`、`scene` 明确为 `not-covered`。语料加载器独立固定九层逐层、逐项、有序的 `rule_ids` 和 `unknown_ids` 权威，因此 admission 与 coverage 即使协调移动、重排、删增、复制或写入非字符串 ID，也不能绕过校验。

`mock` 模式不创建 LLM client、不读取模型环境变量、也不联网，五个受管输出对相同输入和语料逐字节稳定。`llm` 模式只能解释确定性权威 review；任何配置、请求或输出错误均降级为稳定的 unavailable 解释，不能改判、加规则、加 patch 或写回权威结论。

## 21 条规则与四态结果

语料包含 21 条规则：15 条核心程序（`admitted-advisory`）与 6 条案例模式（`manual-example-only`）。每一条都有一个明确注册的 `check:*` 检查器入口；缺项、重复、规则错配或层错配均以 `CHECK_REGISTRY_INCOMPLETE` 失败，不会被掩盖为普通 `unknown`。

核心程序只使用 `satisfied`、`violated`、`unknown`、`not-applicable` 四态的受限合同。字段、视觉证据、量化阈值或适用性证据不足时必须是 `unknown`，不得改写为 `not-applicable`。三体块组合中必要的 `attach_to` 缺失、空白或类型错误时同样保持 `unknown`，且不附加修复；只有目标已明确但关系不满足时才形成可判定的 `violated`。案例模式仅可为 `unknown` 或 `not-applicable`，不参与核心 satisfied/violated 汇总，也没有修复操作。

## 三个原创夹具

测试使用三个提交的原创 `blueprint.json` 夹具：中世纪正例、中世纪缺陷例和非适用风格控制例。它们分别证明可定位的正向结构证据、可定位的反向结构证据及明确排除条件；仍需视觉或未记录阈值的规则保持 `unknown`。夹具不伪造视觉观察字段以提高通过数。

## LLM 权限与降级

确定性引擎是唯一裁判。提示包仅携带权威状态、允许的规则事实、已有 unknown/修复 ID 和不可执行的原始 prompt 数据；不含完整 blueprint、私有证据、绝对路径或 API 配置。LLM 候选不含自由解释文本，只能在固定五层和 21 条规则行中选择已提供且属于对应层或 assessment 的权威引用；所有选择必须唯一、有界并保持权威顺序。`output_contract` 以严格数据发布固定行数与顺序、字段归属、unknown 顺序和渲染上限；wrapper 验证选择后，以有界的权威引用索引在本地确定性渲染 `explanation.json`，公共验证器会重新渲染并要求文本逐字相等。任何越权或无效输出整份作废，并记录稳定的 `LLM_UNCONFIGURED`、`LLM_REQUEST_FAILED`、`LLM_OUTPUT_INVALID` 或 `LLM_AUTHORITY_VIOLATION` 类别。

## 路径、所有权与原子事务

`--run` 必须是项目 `out/` 真实目录中的普通目录；输入、输出父目录和目标文件出现符号链接时拒绝。工具在 run 内的私有临时目录构建 `manifest.json`、`review.json`、`prompt-packet.json`、`explanation.json`、`report.md` 五个文件，并只在既有 `playbook-shadow/` 完全属于本工具时原子替换。外来文件、额外文件、符号链接、损坏 manifest 或路径漂移以 `SHADOW_OUTPUT_OWNERSHIP` 拒绝；安装失败恢复此前合法输出。

运行前后的既有 run 文件哈希必须不变，安装事务不接触 blueprint、预览、数据包或其他 run 文件。P4 的实际静态依赖门禁也拒绝 `src/construction/`、`src/pipeline.js`、`src/index.js` 和 Minecraft I/O 边。

## 依赖隔离

原子目录移动使用 Linux GNU coreutils 的 `/usr/bin/mv`，并依赖其 `--no-clobber`、`--no-target-directory` 选项及 `/proc/self/fd/3/` 描述符路径。这是 P4 为无覆盖、目录描述符约束移动而接受的 Linux/GNU 可移植性依赖与运行环境前提；它不是跨平台支持声明。该依赖缺失或移动失败时工具以 `SHADOW_INSTALL_FAILED` 关闭安装，而不是放宽所有权或原子性规则。

除 Node 标准库、`src/playbook/` 的纯读取合同与仅在 `llm` 模式使用的既有 LLM client 外，P4 不依赖生成器、construction、pipeline、世界或数据包 I/O，也不读取 `.local/architecture-playbook/`。

## 测试证据

- P4 聚焦套件：在最终修复 `HEAD` 执行规定的 11 个测试文件命令，200/200 通过、0 失败。默认受管 sandbox 会阻止 CLI 子进程；使用获准的子进程执行路径后，原命令 200/200 通过。
- P4 独立依赖门禁：`node --test --test-isolation=none test/playbookShadowGate.test.js` 为 27/27 通过、0 失败，已检查当前源码图和所有受支持的直接、传递、realpath 与动态加载边。
- P3 受管语料检查：`npm run playbook:manual -- check` 返回 `playbook_status=current`、`reviewed_rule_count=21`、`core_procedure_count=15`、`case_pattern_count=6`、`artifact_count=5`、`managed_artifact_drift_count=0`。
- 完整回归：在同一获准的子进程执行环境中，`npm test -- --test-reporter=dot` 退出码为 0，共 1045 个通过标记、0 个失败标记。
- 仓库卫生：`git diff --check` 退出码为 0；`git ls-files out .local/architecture-playbook` 无输出，没有提交运行产物或私有秘籍材料。

历史审计遵循已记录的“不要求恰好九个实现提交”裁定。最终完整分支审计范围为 `6dd635ee7874a0d8a87a5408396f9aea49570030..HEAD`；本轮统一修复审计范围为 `28d44b90952f9c37837d4b3d87f0e94c5921adfe..HEAD`。`HEAD` 指本报告所在的最终修复提交。各任务至少有一个独立审查后的完成提交，后续 review fix 与 remediation 提交保留为合法、可审计的历史；范围内改动属于 P4 影子审查、语料与解释权限加固、事务安全、夹具、测试、CLI/package script、兼容审计和公开证据，没有发现生成器或 P5/P6 行为改动。

## P5 待批准入口与 P6 保留项

P5 是下一阶段，但在新的设计获批前仍未开放。新的设计必须明确哪些 `satisfied/violated` 结果可以参与候选选择、如何把现有 repair ID 编译为有限设计层 patch、如何保存 checkpoint 与失效关系、失败时如何回到最近 accepted chain，并证明 `playbook=off` 时旧输出不变。

P6 仍未开放。固定多视角、视觉输入、视觉模型、人工盲选、审美分数与任何质量提升结论，必须在 P6 以独立证据建立；P4 的只读影子审查不替代这些证据。
