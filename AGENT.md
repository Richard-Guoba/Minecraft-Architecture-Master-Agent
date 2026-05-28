# 智能体协作说明

## 项目概览

- 项目名称：Minecraft Constructing Agents。
- 课程背景：本项目是“大语言模型与信息决策”课程项目，主题围绕大语言模型智能体系统构建。
- 项目目标：把中文自然语言建房需求转换为 Minecraft Java 1.21 可执行的数据包，使其能在单人创造超平坦世界中自动生成建筑。
- 当前 v1 重点：命令行多智能体原型，不是实时 Mineflayer 游戏机器人。
- 核心演示流程：用户输入需求 -> 需求解析 -> 房屋设计 -> 蓝图生成 -> 自动校验 -> Minecraft 数据包导出。

## 项目要求

- 目标游戏版本：Minecraft Java 1.21 / 1.21.1。
- 数据包格式：`pack_format: 48`。
- 数据包函数路径：`data/architect/function/`，使用 Minecraft 1.21 要求的单数 `function` 目录。
- 用户命令：
  - 本地运行：`npm start -- "建一个欧式大房子"`。
  - 自动安装到世界并在进入世界后建造：`npm start -- --world "世界名" --auto-build "建一个欧式大房子"`。
  - 查看可识别世界：`npm start -- --list-worlds`。
  - 如需打开 Minecraft/启动器，配置 `MINECRAFT_LAUNCH_COMMAND` 后使用 `--launch`。
  - 游戏内运行：先执行 `/reload`，再执行 `/function architect:clear` 和 `/function architect:build`。
- `out/<timestamp>/` 目录下必须生成以下产物：
  - `blueprint.json`
  - `architect_datapack/`
  - `raw_build.mcfunction`
  - `preview.html`
  - `run_report.md`
- 默认流水线必须在没有 API key 的情况下可运行，并使用规则兜底。
- 如果本地 `.env` 中配置了智谱 API key，项目可以通过 OpenAI 兼容的 chat completions 接口调用大模型做需求解析。
- 自动建造模式使用数据包 `load` / `tick` 函数，在世界加载后于第一个玩家当前位置执行清理和建造。
- 严禁提交 `.env` 或任何 API key。密钥只能保存在本地。
- 不要提交生成的 `out/` 产物、本地临时文件或课程 PDF。
- 完成有意义的代码改动前，运行 `npm test`。

## 当前范围

- 已实现：Node.js ESM 命令行入口、需求解析 Agent、设计 Agent、蓝图生成 Agent、校验 Agent、导出 Agent、Minecraft 1.21 数据包输出、自动安装到本地世界、数据包自动建造、本地 HTML 预览和测试。
- 已实现的主要演示风格：通用欧式两层住宅，这是当前 v1 最稳定的演示案例。
- 部分实现：LLM 可以解析江南水乡、中式等其他风格，但设计 Agent 和蓝图 Agent 还需要补充对应的风格化建筑模块，才能生成足够贴合风格的结果。
- v1 暂不包含：Mineflayer 连服控制、生存模式资源采集、模拟玩家逐块放置、自动下载 Minecraft。启动 Minecraft 仅支持通过 `MINECRAFT_LAUNCH_COMMAND` 调用用户已配置的启动器命令。

## 开发命令

- 运行测试：`npm test`
- 生成演示输出：`npm start -- "建一个欧式大房子"`
- 自动安装并建造：`npm start -- --world "世界名" --auto-build "建一个欧式大房子"`
- 强制使用规则兜底模式：`npm start -- --mode mock "建一个欧式大房子"`
- 强制使用 LLM 模式：`npm start -- --mode llm "请建一个有江南水乡风格的中式小两层"`

## 仓库信息

- GitHub 地址：https://github.com/CityC196/Minecraft-Constructing-Agents.git
- 主分支：`main`

## 同步规则

- 每次修改代码前，都必须检查本地仓库是否与 GitHub 同步。
- 先运行 `git fetch origin`，再比较 `HEAD` 与 `origin/main`。
- 如果本地仓库与 GitHub 不同步，以 GitHub 为准。
- 编辑前优先把本地代码更新到 `origin/main`。不要静默覆盖未提交的本地改动；必须先说明差异，并有意识地保留或解决。
- 不要提交或推送无关的生成文件、本地密钥、课程 PDF 或 `out/` 产物。
