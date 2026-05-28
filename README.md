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

## 自动安装并建造

如果本机或组员电脑已经有 Minecraft Java 1.21 世界，可以让 CLI 直接把数据包装进世界，并在进入世界后自动建造：

```powershell
npm start -- --world "世界名" --auto-build "建一个欧式大房子"
```

也可以使用最近修改过的世界：

```powershell
npm start -- --world latest --auto-build "建一个欧式大房子"
```

查看本机可识别的世界：

```powershell
npm start -- --list-worlds
```

自动模式会做两件事：

1. 把 `architect_datapack` 自动复制到 `.minecraft/saves/<世界名>/datapacks/architect_datapack`。
2. 在数据包里生成 `load` / `tick` 函数。打开世界后，数据包会在第一个玩家当前位置自动执行清理和建造。

如果希望生成后同时打开 Minecraft 或启动器，请在 `.env` 中配置启动命令：

```text
MINECRAFT_LAUNCH_COMMAND="D:\path\to\launcher.exe"
```

然后运行：

```powershell
npm start -- --world "世界名" --auto-build --launch "建一个欧式大房子"
```

不同启动器的命令行参数不完全相同，所以 `--launch` 只负责打开你配置的启动器或 Minecraft 启动命令；进入哪个世界仍取决于启动器和游戏本身。

## 手动使用数据包

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
