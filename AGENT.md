# 智能体协作说明

## 项目概览

- 项目名称：Minecraft Architecture Master Agent。
- 仓库名称：Minecraft Constructing Agents。
- 项目目标：把中文或英文自然语言建房需求转换为 Minecraft Java 1.21 / 1.21.1 可执行数据包，并逐步发展成具备参考检索、概念生成、评价、修复和长期记忆的混合建筑智能体。
- 当前主线：`construction_method_v1`，即 LLM 负责高层语义 JSON，本地 JavaScript 负责确定性几何、路径、室内、校验、评分和数据包导出。
- 重要边界：这不是实时 Mineflayer 玩家机器人，也不包含生存模式资源采集或自动下载 Minecraft。

## 主流程

```text
用户需求
-> ArchitectAgent: 风格、体块、材料、立面、屋顶、场地语义
-> PlannerAgent: 房间拓扑、隐私等级、动线和 BSP 提示
-> CreativeDesignAgent: 设计变体和模板知识库参考
-> Structure/Facade/Roof/Site agents: 专项语义计划
-> CSGBuilder: 空心外壳、体块、屋顶、立面、场地和结构模块
-> BSPPartitioner: 室内房间矩形
-> AStarPathfinder: 入口、门洞、楼梯和房间连通
-> InteriorDetailAgent + DecoratorAgent: 房间功能内饰和风格装饰
-> QA / Repair / Optimizer / Evaluation: 校验、修复提示、命令压缩、评分
-> datapack、preview、run_report、architecture_scorecard
```

LLM 不直接输出具体 XYZ 方块坐标。语义 JSON 由本地 Node.js 代码转成合法 Minecraft 几何和命令。

## 项目要求

- 目标游戏版本：Minecraft Java 1.21 / 1.21.1。
- 数据包格式：`pack_format: 48`。
- 数据包函数路径：`data/architect/function/`，使用 Minecraft 1.21 要求的单数 `function` 目录。
- Windows 普通运行只需要 Node.js 20+，不需要 Python。
- WSL Stage 7 学习环境统一使用 Conda 命名环境 `mcagent-stage7`；不得在仓库内另建 `.venv`。Conda 基础包由 `training/stage7/environment.yml` 和 `conda-linux-64.lock` 固定，PyTorch/CUDA 图由 `requirements-wsl-cu130.lock` 固定。
- 默认流水线必须在没有 API key 的情况下可运行，`--mode mock` 是最稳的可复现检查方式。
- 本地 `.env` 优先级高于外层环境变量，避免 Codex 或系统环境里的 API key 覆盖项目配置。
- 严禁提交 `.env`、API key、生成的 `out/` 产物、本地临时文件或旧展示打包产物。
- 完成有意义的代码改动前，运行 `npm test`。涉及 benchmark 或评分逻辑时，也要运行对应 benchmark/evaluation 命令。

## 常用命令

```powershell
npm install
npm test
npm start -- --mode mock "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
npm start -- --mode llm "建一个日式茶屋住宅，深檐木格栅，水景庭院，动线安静"
npm start -- --list-prompts
npm start -- --list-worlds
npm run benchmark:baseline -- --out out/stage1-readiness-baseline
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm run analyze:templates -- --offline
```

Stage 7 Python 环境与 smoke：

```bash
conda env create --file training/stage7/environment.yml
conda run -n mcagent-stage7 python -m pip install -r training/stage7/requirements-wsl-cu130.lock
conda run -n mcagent-stage7 python -m pip check
conda run -n mcagent-stage7 python training/stage7/verify_environment.py
conda run -n mcagent-stage7 python training/stage7/verify_environment.py --require-cuda
```

交互工作时可先运行 `conda activate mcagent-stage7`。CPU smoke 是强制验收路径，CUDA smoke 只能作为附加加速检查。

游戏内运行：

```text
/reload
/function architect:run
```

`/reload` 只刷新数据包，不会建造。`architect:run` 会自动执行 `architect:clear` 和 `architect:build`。

## 输出产物

`out/<timestamp>/` 目录下通常生成：

```text
blueprint.json
architect_datapack/
raw_build.mcfunction
preview.html
run_report.md
architecture_scorecard.json
```

这些运行产物默认不提交。需要长期保留的结果应整理成轻量 benchmark 文档或明确的数据集资产。

## 当前能力范围

- 已实现：Node.js ESM CLI、construction workflow、语义 agents、Template Knowledge Base v2、Minecraft Java 1.21.1 方块目录校验、CSG 空心外壳、BSP 室内切分、A* 门洞/楼梯、室内与装饰写入、QA/repair/evaluation、数据包导出、HTML 预览、运行报告和 scorecard。
- 已验证：Stage 1 readiness baseline 已达到 10/10 prompts、平均 scorecard 100/100、red flags 0、repair priorities 0。
- 当前阶段：**Stage 7 M3 fixture-only foundation**。两个 committed synthetic fixtures 已建立 CPU 训练、checkpoint、canonical inference、Node schema validation 与 Python shadow operation-parity 验收；fixture loss 只证明 plumbing，不代表质量、准确率、偏好或泛化。
- Dataset v3 当前仍为 `ready_for_m3_real_data=false`、`training_eligible_count=0`，因此禁止 real-data training。六个真实试点有 0 个 reviewed training approvals；任何正资格案例都必须有真实 reviewer、许可证据、canonical front side、approved learning areas、精确 v3 plan binding，并通过 semantic validation。
- Python 对普通 Node generation 和 `npm test` 仍是可选的；Python 只输出 provider-neutral semantic layers，不输出 Minecraft blocks、commands 或 blueprint operations。Node 继续负责 immutable checkpoint/manifest snapshots、strict UTF-8、schema validation、repair、conversion、rejection 和 rule-only fallback。
- Stage 7 M4 Apply Mode 仍不可用；fixture checkpoint 只能进入显式 shadow 验收，不得伪装成 real-data prototype。证据见 [Stage 7 M3 fixture foundation benchmark](docs/benchmarks/stage7-m3-fixture-foundation.md)。
- 历史状态语句（不再代表当前阶段）：当前阶段：Stage 7 Milestone 2.5。该阶段建立了 source-bound review pack、strict overlay、sparse correction provenance、Dataset v2 与 readiness gates。
- 暂不包含：Mineflayer 连服控制、生存模式资源采集、模拟玩家逐块放置、自动下载 Minecraft。启动 Minecraft 仅支持通过用户配置的 `MINECRAFT_LAUNCH_COMMAND` 调用启动器命令。

## 文档入口

- `README.md`：GitHub 仓库首页。
- `docs/index.html`：GitHub Pages 首页。
- `docs/project-map.md`：仓库结构说明。
- `docs/architecture.md`：当前系统架构。
- `docs/roadmap.md`：长期 Architecture Master 路线图。
- `docs/benchmarks/`：可提交的轻量 benchmark 记录。

## 同步规则

- 修改代码前检查本地仓库是否与 GitHub 同步。
- 先运行 `git fetch origin`，再比较 `HEAD` 与 `origin/main`。
- 如果本地仓库与 GitHub 不同步，以 GitHub 为准同步，但不要静默覆盖未提交的本地改动。
- 不要提交或推送无关生成文件、本地密钥、旧展示打包产物或 `out/` 产物。
