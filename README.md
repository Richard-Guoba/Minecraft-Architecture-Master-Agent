# Minecraft Constructing Agents

一个中文 Minecraft 建筑生成项目：输入一句建房需求，系统输出可安装到 Minecraft Java 世界的数据包，并生成 `blueprint.json`、`preview.html` 和 `run_report.md`。

项目核心思路是：LLM 只负责风格、体块、材料和房间拓扑等高层语义；坐标、房间、门洞、楼梯、装饰、校验和命令导出由本地 JavaScript 几何流程完成。

## 课程项目提交入口

- [项目展示页](docs/index.html)
- [提交清单](SUBMISSION.md)
- [推荐 Prompt 库](docs/recommended-prompts.md)
- 课程报告：`course_submission/Minecraft_Constructing_Agents_课程报告.pdf`

## 环境

- Node.js 20+
- Minecraft Java 1.21 / 1.21.1
- Python 不是运行项目所必需
- API key 不是必须；没有 key 时可以使用 `mock` 模式

## 快速运行

安装依赖：

```powershell
npm install
```

生成一个稳定示例，不调用大模型：

```powershell
npm start -- --mode mock "建一个欧式大房子"
```

使用推荐 prompt：

```powershell
npm start -- --mode mock --prompt-id modern-waterfront-villa-reference
```

查看所有推荐 prompt：

```powershell
npm start -- --list-prompts
```

运行结束后，终端会打印输出目录，通常类似：

```text
out/<timestamp>/
├── blueprint.json
├── architect_datapack/
├── raw_build.mcfunction
├── preview.html
└── run_report.md
```

建议先打开：

- `preview.html`：浏览器预览。
- `run_report.md`：本次生成流程、统计和 Minecraft 使用步骤。

## 在 Minecraft 中建造

把 `out/<timestamp>/architect_datapack` 复制到世界的 `datapacks` 目录，然后进游戏执行：

```text
/reload
/function architect:run
```

也可以让程序直接安装到某个世界：

```powershell
npm start -- --world "世界名" "建一个欧式大房子"
```

或指定 datapacks 目录：

```powershell
npm start -- --datapacks-dir "D:\path\to\world\datapacks" "建一个欧式大房子"
```

`/reload` 只刷新数据包；真正的一键建造入口是 `/function architect:run`。

## 常用命令

| 目标 | 命令 |
| --- | --- |
| 查看帮助 | `npm start -- --help` |
| 本地规则生成 | `npm start -- --mode mock "建一个欧式大房子"` |
| 自动模式 | `npm start -- "建一个现代两层房子"` |
| 使用推荐 prompt | `npm start -- --prompt-id modern-waterfront-villa-reference` |
| 固定 seed | `npm start -- --seed 12345 "建一个欧式大房子"` |
| 多候选择优 | `npm start -- --auto-select "建一个现代滨水别墅"` |
| 列出本地世界 | `npm start -- --list-worlds` |
| 运行测试 | `npm test` |

## LLM 配置

可选。复制 `.env.example` 为 `.env`，按需填写。`.env` 不要提交。

常用模式：

```powershell
npm start -- --mode mock "建一个欧式大房子"
npm start -- --mode auto "建一个现代两层房子"
npm start -- --mode llm "建一个带庭院和水景的日式住宅"
```

- `mock`：强制本地规则兜底。
- `auto`：有可用 LLM 就调用，否则回退。
- `llm`：强制调用 LLM，失败则退出。

## 测试

```powershell
npm test
```

当前课程提交版本测试结果：`176 passed / 0 failed`。

## 项目边界

- 当前主交付是 Minecraft 数据包，不是 Mineflayer 实时连服机器人。
- 不模拟玩家逐块放置。
- 不自动下载或安装 Minecraft。
- `out/`、`.tmp/`、`.env` 和真实 API key 不应提交。
