# 智能体协作说明

## 项目目标

Minecraft Architecture Master Agent 将中文或英文建房需求转换为 Minecraft Java 1.21 / 1.21.1 可执行数据包。当前主生成路线是 `construction_method_v1`：LLM 负责高层语义，本地 JavaScript 负责确定性几何、路径、室内、校验、修复、评分和导出。

## 主流程

```text
用户需求
-> Architect / Planner / Concept / CreativeDesign 语义规划
-> Structure / Facade / Roof / Site 专项规划
-> CSGBuilder 确定性体块与外壳
-> BSPPartitioner 室内切分
-> AStarPathfinder 入口、门洞、楼梯和连通
-> InteriorDetailAgent / DecoratorAgent 室内与装饰
-> QA / Repair / Optimizer / Evaluation
-> datapack、preview、run_report、architecture_scorecard
```

LLM 不直接输出具体 XYZ 方块坐标。

## 项目要求

- 目标游戏版本：Minecraft Java 1.21 / 1.21.1。
- 数据包格式：`pack_format: 48`。
- 函数目录：`data/architect/function/`。
- Node.js 版本：20 或更高。
- 普通生成不依赖 Python；训练统一使用 Conda 环境 `mcagent-stage7`。
- 不得在仓库内创建 `.venv`。
- `--mode mock` 必须在没有 API key 时可运行。
- 本地 `.env` 优先于继承的 provider 环境变量。
- 严禁提交 `.env`、密钥、`out/`、`.local/`、checkpoint、训练数据或临时产物。

## 本地训练原则

- 所有现有本地模板均可直接用于本地训练，无需逐文件审批。
- 本地训练命令不得引入审批队列或人工准入状态。
- 数据、权重和重建结果默认保留在 `.local/`。
- 只有准备对外发布或分享具体产物时才进行许可与分发检查。
- 必须按源建筑拆分 train/validation/test，再生成 patch 或增强，防止泄漏。
- seed 7101 的 50,000 步实验已通过 held-out Gate 2；这证明模型开始学习，不等同于生产可用。
- 模型接入主生成路径必须作为独立功能开发和验证，不得由训练命令自动完成。

## 常用命令

```bash
npm install
npm test
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
npm run analyze:templates -- --offline
```

唯一支持的训练入口：

```bash
npm run training:prepare
npm run training:train
npm run training:evaluate
npm run training:status
```

## 验证要求

- 每个行为变更先写失败测试，再做最小实现并确认测试变绿。
- 有意义的 Node.js 改动完成前运行 `npm test`。
- 训练代码改动运行完整训练测试；模型必须先通过小样本过拟合门槛，再运行 held-out 实验。
- benchmark、评分或生成逻辑变化时运行对应 benchmark/evaluation 和 mock generation。

## Git 与数据安全

- 修改前获取远端引用并比较 `HEAD` 与 `origin/main`，不得静默覆盖本地改动。
- 保留无关的用户修改；只提交当前任务涉及的文件。
- 不使用破坏性 reset 或宽泛递归删除。
- `.local/` 是本地证据和训练产物边界：不得删除、移动、发布、暴露或覆盖既有内容。
- Git 历史是旧规范和实施过程的档案；当前工作树只保留当前事实来源。
