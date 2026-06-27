# Minecraft Constructing Agents

一个面向 Minecraft Java 1.21 的中文建筑生成智能体项目。用户输入一句自然语言建房需求，系统生成可直接放进 Minecraft 世界的数据包，并附带完整蓝图、建造函数、HTML 预览和运行报告。

本项目是《大语言模型与信息决策》课程项目版本。当前重点不是实时游戏机器人，而是一套“LLM 语义智能体 + 本地确定性几何引擎”的建筑生成流水线。

## 课程项目提交入口

- [项目展示页](docs/index.html)：面向课程评阅的网页入口，概览项目动机、架构、结果、迭代和复现方式。
- [提交清单](SUBMISSION.md)：列出 GitHub 链接、报告文件、运行命令、测试状态和 AI 辅助说明。
- GitHub 仓库：https://github.com/CityC196/Minecraft-Constructing-Agents

## 一句话概览

- 输入：中文建筑需求，例如 `建一个欧式大房子`。
- 输出：`out/<timestamp>/` 下的数据包、蓝图、预览页和报告。
- 运行环境：Node.js 20+，Windows 可直接运行，不需要 Python。
- API key：不是必须；没有 key 时会走本地规则兜底。
- Minecraft 版本：目标为 Java 1.21 / 1.21.1，数据包 `pack_format: 48`。
- 核心原则：LLM 只生成高层语义 JSON，不直接写 Minecraft 坐标；坐标、房间、门洞、楼梯、装饰和命令都由本地 JavaScript 程序生成。

## 快速开始

安装依赖：

```powershell
npm install
```

不调用大模型，直接用规则兜底生成一个稳定示例：

```powershell
npm start -- --mode mock "建一个欧式大房子"
```

使用默认自动模式：

```powershell
npm start -- "建一个现代两层房子，带大玻璃和小花园"
```

查看所有命令行参数：

```powershell
npm start -- --help
```

运行结束后，终端会打印输出目录。常见输出如下：

```text
out/<timestamp>/
├── blueprint.json
├── architect_datapack/
├── raw_build.mcfunction
├── preview.html
└── run_report.md
```

其中最值得先看的两个文件是：

- `preview.html`：浏览器里的建筑平面和阶段预览。
- `run_report.md`：本次生成的流程、Agent 输出、几何统计、校验结果和 Minecraft 使用步骤。

## 在 Minecraft 中建造

可以先只生成数据包，再手动复制 `out/<timestamp>/architect_datapack` 到世界的 `datapacks` 目录。

也可以让程序直接安装到本地世界：

```powershell
npm start -- --world "世界名" "建一个欧式大房子"
```

或直接指定某个世界的 datapacks 目录：

```powershell
npm start -- --datapacks-dir "D:\path\to\world\datapacks" "建一个欧式大房子"
```

进入游戏后执行：

```text
/reload
/function architect:run
```

注意：`/reload` 只刷新数据包，不会开始建造；真正的一键建造入口是 `/function architect:run`，它会依次执行清理和建造函数。

## 系统架构

项目采用混合式架构：

```text
用户需求
  -> ArchitectAgent              生成建筑外壳语义 JSON
  -> StylePresetMemoryAgent      识别风格预设
  -> MaterialPaletteAgent        选择并校验 Minecraft 1.21.1 方块材料
  -> TemplateKnowledgeAgent      检索模板语料和设计法则
  -> PlannerAgent                生成房间拓扑 JSON
  -> CreativeDesignAgent         生成体块、屋顶、立面等设计变体
  -> Structure/Facade/Roof/Site  细化结构、立面、屋顶、场地
  -> CSGBuilder                  生成空心外壳和体块网格
  -> BSPPartitioner              切分室内房间
  -> OpeningConnectivityAgent    规划入口和开口
  -> AStarPathfinder             打通门洞和楼梯
  -> InteriorDetailAgent         生成房间级内饰语义
  -> DecoratorAgent              将家具、灯光、植物和装饰写入方块网格
  -> Repair/QA/Optimizer         修复约束、质量检查、压缩命令
  -> Export                      导出数据包、预览页和报告
```

这套流程对应 `construction_method_v1`，目前是仓库中唯一的主生成流程。旧版 `src/agents` / `src/engine` 体系已经移除，当前主代码都在 `src/construction` 下。

## 目录说明

```text
.
├── src/
│   ├── index.js                         CLI 入口和参数解析
│   ├── pipeline.js                      单次生成、候选择优和 seed 管理
│   ├── construction/
│   │   ├── workflow.js                  主 Orchestrator
│   │   ├── agents/                      语义、风格、材料、结构、室内、修复、QA 等 Agent
│   │   ├── engine/                      CSG、BSP、A* 等本地几何引擎
│   │   ├── gameIo/                      GDMC HTTP 封装，保留给未来直接写入游戏
│   │   ├── templates/                   schematic 解析、案例库和设计法则蒸馏
│   │   └── *PromptSuite.js              批量评测 prompt 集
│   ├── llm/                             智谱、Codex、OpenAI-compatible LLM 通道
│   └── lib/                             文件、环境变量、Minecraft 世界定位等工具
├── test/                                Node.js 原生测试
├── docs/                                架构说明、模板吸收计划、字段树查看器
├── mc_templates/                        本地 Minecraft `.schematic` 模板语料
├── mc_templates/analysis/               模板分析结果、案例库、设计法则和检索索引
├── out/                                 生成结果，已被 git 忽略
├── .tmp/                                临时输出，已被 git 忽略
├── AGENT.md                             项目协作和开发约定
└── README.md                            当前说明文件
```

## 主要能力

### 1. 中文自然语言到 Minecraft 数据包

程序可以解析中文中的风格、楼层、尺寸、材料、入口方向、花园、水景、屋顶等需求，并生成 Minecraft 数据包：

```powershell
npm start -- --mode mock "建一个现代两层房子，宽31深17，白色混凝土墙，石英地板，铁门，门在东侧"
```

### 2. LLM 可插拔，但本地兜底可运行

`ArchitectAgent`、`PlannerAgent`、`CreativeDesignAgent` 可以调用 LLM 生成语义 JSON。没有配置 API key 时，系统会使用本地规则兜底，仍然能完整生成数据包。

常见模式：

```powershell
npm start -- --mode mock "建一个欧式大房子"
npm start -- --mode auto "建一个江南水乡风格的中式小两层"
npm start -- --mode llm "建一个带庭院和水景的日式住宅"
```

- `mock`：强制本地规则兜底，不调用 LLM。
- `auto`：如果 LLM 可用则调用；不可用则自动回退。
- `llm`：强制调用 LLM；如果 LLM 不可用或输出不可修复，会直接失败。

### 3. 多智能体分工

项目不是把 prompt 直接变成命令，而是拆成多个阶段：

- 需求理解：建筑风格、规模、体块、场地语义。
- 材料选择：基于 Minecraft Java 1.21.1 方块注册表校验材料。
- 空间规划：生成房间节点、连通边、楼层功能和隐私等级。
- 几何生成：本地 CSG/BSP/A* 负责坐标、外壳、房间、门洞、楼梯。
- 室内装饰：房间功能专家和风格专家写入家具、灯光、植物、地毯、工作台等。
- 质量闭环：蓝图 QA、约束修复、模板法则覆盖检查、命令压缩。

### 4. 模板语料学习

`mc_templates/` 中保存了本地 `.schematic` 模板。运行模板分析后，项目会生成案例库、语义条款、设计法则和检索索引：

```powershell
npm run analyze:templates -- --offline
```

分析结果位于 `mc_templates/analysis/`。如果这些文件存在，生成流程会自动使用模板知识，帮助系统学习参考建筑的场地、体块、立面、屋顶、室内和装饰模式，但不会按方块 1:1 复制模板。

### 5. 候选择优和批量评测

可以一次生成多个候选，并按模板审美、法则覆盖率和吸收审计等指标自动选择：

```powershell
npm start -- --auto-select "建一个现代滨水别墅"
```

也可以跑批量评测：

```powershell
npm test
npm run evaluate:prompts
npm run evaluate:habitation
npm run evaluate:decoration -- --mode auto
npm run evaluate:template-assimilation -- --limit 3 --out .tmp/template-smoke --strict --min-audit 80
```

## 常用命令

| 目标 | 命令 |
| --- | --- |
| 查看帮助 | `npm start -- --help` |
| 规则兜底生成 | `npm start -- --mode mock "建一个欧式大房子"` |
| 自动模式生成 | `npm start -- "建一个现代两层房子"` |
| 固定 seed 复现 | `npm start -- --seed 12345 "建一个欧式大房子"` |
| 多候选择优 | `npm start -- --auto-select "建一个现代滨水别墅"` |
| 查看精选 prompt | `npm start -- --list-prompts` |
| 使用精选 prompt | `npm start -- --prompt-id modern-waterfront-villa-reference` |
| 列出本地世界 | `npm start -- --list-worlds` |
| 安装到世界 | `npm start -- --world "世界名" "建一个欧式大房子"` |
| 运行测试 | `npm test` |
| 刷新模板分析 | `npm run analyze:templates -- --offline` |

## LLM 配置

复制 `.env.example` 为 `.env`，按需填写。`.env` 已被 `.gitignore` 忽略，不要提交真实密钥。

默认通道是智谱：

```text
LLM_PROVIDER=zhipu
ZHIPU_API_KEY=你的 key
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4-flash
```

Codex 通道：

```text
LLM_PROVIDER=codex
CODEX_COMMAND=codex
CODEX_ARGS=exec --sandbox read-only
CODEX_TIMEOUT_MS=120000
```

OpenAI-compatible 通道：

```text
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=你的 key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_RESPONSE_FORMAT=json_object
OPENAI_MAX_TOKENS=4096
```

DeepSeek 等兼容 OpenAI Chat Completions 的服务也可以使用同一通道，只需替换 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。

## 输出文件说明

单次生成目录通常包含：

- `blueprint.json`：完整蓝图，包含 prompt、seed、Agent 输出、几何统计、房间、装饰、操作命令和校验结果。
- `architect_datapack/`：可安装到 Minecraft 世界的完整数据包。
- `architect_datapack/pack.mcmeta`：数据包元信息。
- `architect_datapack/data/architect/function/build.mcfunction`：建造函数。
- `architect_datapack/data/architect/function/clear.mcfunction`：清理函数。
- `architect_datapack/data/architect/function/run.mcfunction`：一键入口，先清理后建造。
- `raw_build.mcfunction`：不含数据包结构的原始建造命令。
- `preview.html`：静态 HTML 预览。
- `run_report.md`：本次运行报告。

如果启用了候选择优，输出目录还会包含：

- `candidate_selection.json`
- `candidate_selection_report.md`
- `candidates/round-*/candidate-*`

## 文档入口

- `docs/super-agent-architecture.md`：系统架构和主流程说明。
- `docs/template-assimilation-plan.md`：模板语料吸收计划。
- `docs/template-review-notes.md`：模板审查笔记。
- `docs/parameter-tree/README.md`：欧式别墅字段树查看器说明。
- `AGENT.md`：开发协作约定、项目边界和课程背景。

## 测试状态

当前测试使用 Node.js 原生测试框架：

```powershell
npm test
```

本 README 整理时，测试结果为：

```text
173 tests
173 passed
0 failed
```

## 项目边界

当前版本已经实现从中文 prompt 到 Minecraft 数据包的完整闭环，但仍有明确边界：

- 不是 Mineflayer 连服机器人，不模拟玩家逐块放置。
- 不负责自动下载或安装 Minecraft。
- 生存模式资源采集、真实游戏内路径执行、多人协作建造不在当前范围。
- GDMC HTTP 客户端已保留，但主流程仍以数据包导出为主要交付方式。
- LLM 输出只作为语义输入；最终 Minecraft 坐标和命令由本地程序生成并校验。

## 仓库卫生

这些内容不应提交：

- `.env` 和任何 API key。
- `out/` 生成结果。
- `.tmp/` 临时文件。
- 课程 PDF、报告 PDF、日志文件。

`.gitignore` 已经覆盖上述常见本地文件。课程报告和课堂 PPT 可以作为单独提交材料保留在仓库外，源码仓库本身保持为可运行项目。
