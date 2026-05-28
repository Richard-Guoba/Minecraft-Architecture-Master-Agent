# Minecraft 1.21 建房子智能体 v1

这是一个课程项目原型：输入中文建房需求，系统会经过“需求解析 Agent -> 设计 Agent -> 蓝图生成 Agent -> 校验 Agent -> 导出 Agent”，生成 Minecraft Java 1.21 可用的数据包。

## 快速运行

```powershell
npm start -- "建一个欧式大房子"
```

生成结果位于 `out/<timestamp>/`，包括：

- `blueprint.json`：结构化蓝图。
- `architect_datapack/`：复制到 Minecraft 世界的 datapack。
- `raw_build.mcfunction`：备用原始函数文件。
- `preview.html`：本地 3D 预览。
- `run_report.md`：运行报告和游戏内使用步骤。

## 在 Minecraft Java 1.21 中使用

1. 创建单人创造超平坦世界，并开启作弊。
2. 把 `out/<timestamp>/architect_datapack` 复制到：

   ```text
   .minecraft/saves/<世界名>/datapacks/
   ```

3. 进入世界后运行：

   ```text
   /reload
   /function architect:clear
   /function architect:build
   ```

4. 建筑会以玩家当前位置为西北角附近起点，向东和向南展开。

## 智谱 API

项目可以在没有 API key 的情况下运行，此时会使用规则模板兜底。若要接入智谱，把 `.env.example` 复制为 `.env` 后填写：

```text
ZHIPU_API_KEY=你的 key
ZHIPU_BASE_URL=智谱 chat completions 地址
ZHIPU_MODEL=模型名
```

默认模式会在 API 配置完整时尝试调用大模型；失败时自动回退到规则模板。

## 测试

```powershell
npm test
```
