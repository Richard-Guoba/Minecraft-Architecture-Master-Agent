# Minecraft 建筑智能体

本项目按 `CONSTRUCTION_METHORD.pdf` 重构为“先造壳，后填瓤”的工作流：LLM 只生成高层语义 JSON，本地 JavaScript 几何引擎负责所有坐标、房间划分、门洞和楼梯。

不需要 Python。Windows 上只要 Node.js 20+ 即可运行。

核心链路：

```text
ArchitectAgent -> StylePresetMemoryAgent -> MaterialPaletteAgent -> PlannerAgent -> CSGBuilder -> BSPPartitioner -> AStarPathfinder -> Datapack/GDMC
```

旧版 `src/agents` / `src/engine` 生成体系已经移除；当前只有 `src/construction` 这一套主流程。

## 目录

```text
src/construction/
├── agents/
│   ├── architectAgent.js      # 第一步：外壳语义 JSON
│   ├── materialPaletteAgent.js # Java 1.21.1 材料角色池和方块校验
│   ├── minecraftBlockCatalog.js # Minecraft 方块目录、角色分类和查询 API
│   ├── minecraftBlockRegistry1_21.js # 1060 个 Java 1.21.1 方块 ID 快照
│   ├── plannerAgent.js        # 第二步：房间拓扑 JSON
│   ├── interiorDetailAgent.js # 房间级室内语义与专家能力清单
│   ├── interiorRoomAgents.js  # 50+ 方块房间功能专家 + 建筑风格内饰专家
│   └── decoratorAgent.js      # 将室内家具、灯光和装饰写入方块网格
├── engine/
│   ├── csgBuilder.js          # 体块 CSG，生成空心外壳
│   ├── bspPartitioner.js      # BSP，把内部空间切成房间
│   └── pathfinder.js          # A*，打通门洞和楼梯
├── gameIo/
│   └── gdmcClient.js          # GDMC HTTP 封装
└── workflow.js                # 系统主入口 Orchestrator
```

Node 兼容入口：

```text
src/index.js                   # CLI 参数解析
src/pipeline.js                # 调用 construction workflow
```

## 准备

1. 安装 Node.js 20 或更高版本。
2. 在项目目录安装依赖：

```powershell
npm install
```

当前核心实现只依赖 Node.js 标准库；配置 API key 后可以让 Architect/Planner 调用大模型，否则使用规则兜底 JSON。

## 运行

常用命令不变：

```powershell
npm start -- "建一个欧式大房子"
```

如果本地存在 `mc_templates/analysis/template_index.json`，生成流程会自动启用模板知识检索：先从你收集的高质量 `.schematic` 样本里找相似建筑，再把地形、园林、屋顶/立面细节密度等建议注入 Site/CSG 管线。

## 高质量模板语料

把下载的模板放在：

```text
mc_templates/<分类>/*.schematic
```

每个分类目录可以放一个 `data.txt`，每行写标题和来源网址或备注：

```text
Villa - (mcbuild_org) https://mcbuild.org/schematics/18669:villa
The Sky City of Athalux - (mcbuild_org) 没有介绍页，这是一个末地紫晶风格的超大型城堡庙宇
```

刷新语料分析：

```powershell
npm run analyze:templates
```

输出在：

```text
mc_templates/analysis/
├── template_index.json       # 每个模板的尺寸、材料、地形、园林、细节密度和检索建议
├── labels.generated.jsonl    # 自动生成的标签初稿
└── template_gap_report.md    # 当前生成器与顶级模板的差距报告
```

分析器支持经典 MCEdit `.schematic`、Sponge palette/blockdata 和 Regions/BlockStatePalette 结构。网页抓取失败不会中断，本地文件和备注仍会参与分析。

不传 `--seed` 时会自动随机一个设计 seed，并在命令行、`blueprint.json` 和 `run_report.md` 里记录。想复现同一次默认变体，可以显式传回这个 seed：

```powershell
npm start -- --seed 12345 "建一个欧式大房子"
```

命令行结束时会打印 `LLM调用`，说明这次是否真的调用并采用了 LLM 结果；`--mode mock` 会明确显示未调用。

强制规则兜底：

```powershell
npm start -- --mode mock "建一个现代两层房子，宽31深17，白色混凝土墙，石英地板，铁门，门在东侧"
```

输出在：

```text
out/<时间戳>/
```

主要文件：

- `architect_datapack/`：可放入 Minecraft 世界的 datapack。
- `blueprint.json`：包含 architecture/topology/geometry/operations 的完整蓝图。
- `raw_build.mcfunction`：原始建造命令。
- `preview.html`：平面预览。
- `run_report.md`：流程报告。

## 安装到世界并建造

```powershell
npm start -- --world "世界名" "建一个欧式大房子"
```

也可以直接指定 datapacks 目录：

```powershell
npm start -- --datapacks-dir "D:\path\to\world\datapacks" "建一个欧式大房子"
```

进入世界后执行：

```text
/reload
/function architect:run
```

`/reload` 只刷新数据包，不会建造。`architect:run` 会自动执行 clear + build。

## API 配置

不配置 API key 也能运行。默认 LLM 通道为智谱 API，用于生成 Architect/Planner 的语义 JSON：

```text
LLM_PROVIDER=zhipu
ZHIPU_API_KEY=你的 key
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4-flash
```

Codex 通道没有删除。要改用 Codex：

```text
LLM_PROVIDER=codex
CODEX_COMMAND=codex
CODEX_ARGS=exec --sandbox read-only
CODEX_TIMEOUT_MS=120000
```

如果你的 Windows 里 `codex` 不是可直接执行的命令，可以把 `CODEX_COMMAND` 改成实际可运行的 exe/shim 路径；如果通过 WSL 调用，可设置 `CODEX_COMMAND=wsl`，再把 `CODEX_ARGS` 设为 `codex exec --sandbox read-only`。

也可以强制使用 OpenAI 兼容通道：

```text
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=你的 key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

DeepSeek 也走同一个 OpenAI-compatible 通道：

```text
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=你的 DeepSeek key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
OPENAI_RESPONSE_FORMAT=json_object
OPENAI_MAX_TOKENS=4096
OPENAI_THINKING=disabled
```

`deepseek-v4-pro` 是 DeepSeek 当前高配模型；如果省钱或提速，可以把 `OPENAI_MODEL` 改回 `deepseek-v4-flash`。项目会优先使用本地 `.env`，覆盖外层 shell/Codex 环境里同名变量，避免把别的 OpenAI key 错发到 DeepSeek。

## 测试

```powershell
npm test
```

批量评价 20 条覆盖式 prompt：

```powershell
npm run evaluate:prompts
```

输出会写到 `out/evaluation-<时间戳>/`，包含 `evaluation_summary.json` 和 `evaluation_report.md`，用于查看每条 prompt 的分数、房间数、内饰装饰数量、弱项和完整评价指标。

批量评价 100 条居住功能性 prompt：

```powershell
npm run evaluate:habitation
```

输出会写到 `out/habitation-evaluation-<时间戳>/`，包含 `habitation_summary.json`、`habitation_report.md` 和 `habitation_table.csv`。这套评价重点检查人类居住合理性：主入口能否从外界找到、门外步道是否对齐、外壳/屋顶/地板覆盖、房间是否全连通、卧室/卫生间/厨房/储物是否齐全，以及采光、照明和基础家具密度。

批量评价 10 条装饰合理性 prompt：

```powershell
npm run evaluate:decoration -- --mode auto
npm run evaluate:decoration -- --mode llm
```

输出会写到 `out/decoration-evaluation-<时间戳>/`，包含 `decoration_summary.json`、`decoration_report.md` 和 `decoration_table.csv`。这套评价重点检查装饰美观且不突兀：房间覆盖、丰富度、拥挤度、调色板均衡、缤纷分布、模块层次、房间功能匹配、走廊楼梯克制、摆放锚点和风格专家一致性。
