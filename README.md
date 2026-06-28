# Minecraft Constructing Agents

输入一句中文建房需求，生成 Minecraft Java 可安装的数据包，并输出 `blueprint.json`、`preview.html` 和 `run_report.md`。

核心思路：LLM 只负责风格、材料、体块和房间拓扑等高层语义；坐标、房间、门洞、楼梯、装饰、校验和命令导出由本地 JavaScript 程序完成。

## 课程项目提交入口

- 展示页：`docs/index.html`
- 提交清单：`SUBMISSION.md`
- 推荐 prompt：`docs/recommended-prompts.md`
- 课程报告：`course_submission/Minecraft_Constructing_Agents_课程报告.pdf`

## 快速运行

```powershell
npm install
npm start -- --mode mock "建一个欧式大房子"
```

使用推荐 prompt：

```powershell
npm start -- --mode mock --prompt-id modern-waterfront-villa-reference
npm start -- --list-prompts
```

## API 或 Mock

没有 API key 就直接用 `--mode mock`，不会调用外部模型。
想用自己的 API，就复制 `.env.example` 为 `.env`，填好 provider、key、base URL 和 model 后运行 `npm start -- --mode llm "建一个现代两层房子"`。

## 输出

运行后终端会打印 `out/<timestamp>/`，常见文件如下：

```text
blueprint.json
architect_datapack/
raw_build.mcfunction
preview.html
run_report.md
```

建议先看 `preview.html` 和 `run_report.md`。

## 在 Minecraft 中建造

把 `out/<timestamp>/architect_datapack` 复制到世界的 `datapacks` 目录，然后进游戏执行：

```text
/reload
/function architect:run
```

`/reload` 只刷新数据包，真正建造入口是 `/function architect:run`。

## 常用命令

```powershell
npm test
npm start -- --help
npm start -- --world "世界名" "建一个欧式大房子"
npm start -- --datapacks-dir "D:\path\to\world\datapacks" "建一个欧式大房子"
```

当前课程提交版本测试结果：`176 passed / 0 failed`。

## 边界

当前主交付是 Minecraft 数据包，不是 Mineflayer 实时连服机器人；不自动下载 Minecraft，也不模拟玩家逐块放置。
