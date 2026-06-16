# Minecraft 建筑智能体

本项目按 `CONSTRUCTION_METHORD.pdf` 重构为“先造壳，后填瓤”的工作流：LLM 只生成高层语义 JSON，本地 JavaScript 几何引擎负责所有坐标、房间划分、门洞和楼梯。

不需要 Python。Windows 上只要 Node.js 20+ 即可运行。

核心链路：

```text
ArchitectAgent -> PlannerAgent -> CSGBuilder -> BSPPartitioner -> AStarPathfinder -> Datapack/GDMC
```

`SkillAgent/SkillRouter` 不再参与主流程。

## 目录

```text
src/construction/
├── agents/
│   ├── architectAgent.js      # 第一步：外壳语义 JSON
│   ├── plannerAgent.js        # 第二步：房间拓扑 JSON
│   └── decoratorAgent.js      # 未来扩展：局部内饰
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

## 测试

```powershell
npm test
```
