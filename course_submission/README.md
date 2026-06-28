# Minecraft Constructing Agents

输入一句中文建房需求，生成 Minecraft Java 可安装的数据包，并输出 `blueprint.json`、`preview.html` 和 `run_report.md`。

核心思路：LLM 只负责风格、材料、体块和房间拓扑等高层语义；坐标、房间、门洞、楼梯、装饰、校验和命令导出由本地 JavaScript 程序完成。

## 课程项目提交入口

- 展示页：`docs/index.html`
- 提交清单：`SUBMISSION.md`
- 推荐 prompt：`docs/recommended-prompts.md`
- 课程报告：`course_submission/Minecraft_Constructing_Agents_课程报告.pdf`

## 指令说明

```powershell
npm install
```

最完整的一条运行指令：

```powershell
npm start -- --mode llm --datapacks-dir "D:\path\to\world\datapacks" "prompt"
```

各部分含义：

- `npm start`：启动建筑生成程序，默认会在 `out/<timestamp>/` 下生成结果。
- `--`：把后面的参数交给本项目程序，而不是交给 npm 自己处理。
- `--mode llm`：使用你在 `.env` 中配置的真实 API 调用模型；使用前先复制 `.env.example` 为 `.env` 并填好 key。没有 API key 时改成 `--mode mock`，会走本地 mock 模式。
- `--datapacks-dir "D:\path\to\world\datapacks"`：生成完成后，自动把 `architect_datapack` 安装到这个 Minecraft 世界的 `datapacks` 目录。
- `"prompt"`：你的中文建房需求，例如 `"建一个现代两层家庭别墅，宽31深21，大玻璃窗"`。

如果只想先试运行，可以用：

```powershell
npm start -- --mode mock "建一个欧式大房子"
```

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

## 其他指令

```powershell
npm test
npm start -- --help
npm start -- --list-prompts
npm start -- --mode mock --prompt-id modern-waterfront-villa-reference
```

当前课程提交版本测试结果：`176 passed / 0 failed`。

## 边界

当前主交付是 Minecraft 数据包，不是 Mineflayer 实时连服机器人；不自动下载 Minecraft，也不模拟玩家逐块放置。
