# 课程项目提交清单

项目名称：Minecraft Constructing Agents
课程：《大语言模型与信息决策》
成员：龙想 2300011196；石宇宸 2300011051
GitHub：https://github.com/CityC196/Minecraft-Constructing-Agents

## 提交材料

| 材料 | 位置或链接 | 说明 |
| --- | --- | --- |
| 项目源代码 | https://github.com/CityC196/Minecraft-Constructing-Agents | Node.js 多智能体建筑生成系统 |
| 项目展示页 | `docs/index.html` | 面向课程评阅的 GitHub Pages 风格展示入口 |
| 书面报告 DOCX | `course_submission/Minecraft_Constructing_Agents_课程报告.docx` | 可继续微调的 Word 版本 |
| 书面报告 PDF | `course_submission/Minecraft_Constructing_Agents_课程报告.pdf` | 教学网建议提交版本 |
| 运行样例 | `out/2026-06-19-145532212/` | 本地生成结果目录，不建议直接提交到 Git 仓库 |
| 报告生成脚本 | `scripts/build_course_report.py` | 从同一份结构化内容生成 DOCX 和 PDF |

## 快速复现命令

| 目标 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| 运行测试 | `npm test` |
| 规则兜底生成 | `npm start -- --mode mock "建一个欧式大房子"` |
| 查看推荐 prompt | `npm start -- --list-prompts` |
| 生成课程报告 | `python scripts/build_course_report.py` |
| Minecraft 刷新数据包 | `/reload` |
| Minecraft 一键建造 | `/function architect:run` |

## 已验证状态

- 当前全量测试：`176 passed / 0 failed`，其中包含 3 项课程提交文档测试；原项目基线为 `173 passed / 0 failed`。
- 项目默认 `mock` 模式不需要 API key，可完整生成 `blueprint.json`、`architect_datapack/`、`raw_build.mcfunction`、`preview.html` 和 `run_report.md`。
- 课程展示页和提交清单有自动化存在性测试：`test/courseSubmissionDocs.test.js`。
- 最终游戏内截图可以后续补充；当前文档和网站不会伪造 Minecraft 现场截图。

## 核心工作量说明

项目不是把 prompt 直接变成方块命令，而是实现了一套混合式多智能体流水线：

- LLM 语义层：ArchitectAgent、PlannerAgent、CreativeDesignAgent 等只输出高层 JSON。
- 本地几何层：CSGBuilder、BSPPartitioner、AStarPathfinder 负责坐标、房间、门洞和楼梯。
- 材料与校验层：基于 Minecraft Java 1.21.1 方块目录校验材料合法性。
- 装饰与质量层：InteriorDetailAgent、DecoratorAgent、QA、Repair、Optimizer 负责室内、修复、审计和命令压缩。

## AI 辅助说明

本项目合理使用 AI 工具辅助开发和文档整理。小组主导完成的部分包括：选题确定、项目目标和边界设定、系统架构取舍、Minecraft 数据包交付方式、运行调试、结果确认、测试执行和最终提交整合。AI 辅助主要用于代码修改建议、文档初稿整理、报告润色、测试清单和网页排版检查。

报告与网站中涉及运行结果的内容均来自仓库、测试输出或本地生成目录；缺少截图的位置保留真实截图补充位，不伪造运行结果。
