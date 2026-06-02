# Minecraft 1.21 建房子多智能体 v2

这是一个课程项目原型：输入中文建房需求，系统会经过多智能体流水线，把自然语言转成 Minecraft Java 1.21 可执行的数据包。当前版本重点解决早期只能生成“空壳房”的问题，已经支持墙壁、地板、门、屋顶、窗户的尺寸、位置和材质配置，并加入室内布局、家具、照明、庭院和水景等模块。

## 当前流水线

```text
RequirementAgent
  -> DesignerAgent
  -> BlueprintAgent
       -> ShellAgent
       -> LayoutAgent
       -> FurnishingAgent
       -> GardenAgent
  -> ValidatorAgent
  -> ExportAgent
```

各 Agent 的职责：

- `RequirementAgent`：解析中文需求，提取风格、规模、层数、尺寸、材质和元素偏好。
- `DesignerAgent`：把抽象需求转成 Minecraft 方块 ID、建筑尺寸、风格预设和元素规格。
- `BlueprintAgent`：调度蓝图阶段的四个确定性子 Agent。
- `ShellAgent`：生成地基、墙体、楼板、屋顶、门窗、阳台和烟囱，并交付每层内部空间。
- `LayoutAgent`：根据内部空间切分房间、打房间标签、放置楼梯并在楼板上开洞。
- `FurnishingAgent`：根据房间标签放置床、箱子、工作台、熔炉、地毯和室内照明。
- `GardenAgent`：生成院路、绿篱、花坛、庭院灯和水景。
- `ValidatorAgent`：检查模块是否完整、方块 ID 是否合法、坐标是否可执行、子 Agent 是否交付关键结果。
- `ExportAgent`：导出 `blueprint.json`、数据包、原始函数、预览页面和运行报告。

## 快速运行

```powershell
npm start -- "建一个欧式大房子"
```

也可以输入更具体的尺寸、位置和材质要求：

```powershell
npm start -- --mode mock "建一个现代两层房子，宽31深17，白色混凝土墙，石英地板，大玻璃窗，铁门，门在东侧，平屋顶，带室内楼梯和灯"
```

```powershell
npm start -- --mode mock "建一个江南两层小院，白墙黑瓦，窗户宽3高2，门在南侧，带阳台和水池，室内有卧室客厅厨房"
```

生成结果位于 `out/<timestamp>/`，包括：

- `blueprint.json`：结构化蓝图，包含 `agents.shell/layout/furnishing/garden` 的交付结果。
- `architect_datapack/`：复制到 Minecraft 世界的 datapack。
- `raw_build.mcfunction`：备用原始函数文件。
- `preview.html`：本地 3D 预览。
- `run_report.md`：运行报告、子 Agent 交付摘要和游戏内使用步骤。

## 支持的可配置元素

当前规则兜底模式可以识别并应用这些常见描述：

- 尺寸：`宽31深17`、`尺寸25x21`、`层高6`、`屋顶高度5`。
- 层数：`一层`、`两层`、`三层`。
- 风格：`欧式`、`现代`、`江南`、`中式`、`木屋`。
- 墙体材质：`白色混凝土墙`、`石英墙`、`沙岩墙`、`石砖墙`。
- 地板材质：`石英地板`、`木地板`、`橡木地板`。
- 门：`铁门`、`木门`、`双开门`、`门在东侧/西侧/南侧/北侧`。
- 屋顶：`平屋顶`、`黑瓦`、`黛瓦`、`飞檐`、`尖顶`。
- 窗户：`大玻璃窗`、`落地窗`、`窗户宽3高2`。
- 附加元素：`阳台`、`庭院`、`花园`、`水池`、`喷泉`、`室内楼梯`、`卧室客厅厨房`。

没有配置 API key 时，项目会使用规则模板兜底；配置大模型后，`RequirementAgent` 会优先尝试调用 LLM，并在失败时自动回退。

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

当前测试覆盖：

- Minecraft Java 1.21 数据包导出。
- 自动安装到本地 Minecraft save。
- 配置化尺寸、门位置、墙/地板/窗/门/屋顶材质。
- `ShellAgent`、`LayoutAgent`、`FurnishingAgent`、`GardenAgent` 的关键交付物。
