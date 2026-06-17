# MC 建筑 Agent 架构

本项目现在采用 `CONSTRUCTION_METHORD.pdf` 指定的混合架构：

```text
大模型语义生成 Agent + 确定性几何算法引擎
```

核心原则：

```text
LLM 不直接输出具体 XYZ 方块坐标。
ArchitectAgent 只输出外壳语义 JSON。
PlannerAgent 只输出房间拓扑 JSON。
本地 JavaScript 引擎负责 CSG 外壳、BSP 房间、A* 门洞/楼梯、室内装饰落方块和 Minecraft 命令生成。
Windows 运行不需要 Python。
```

## 主流程

```text
用户需求
-> src/construction/agents/architectAgent.js
   生成 style / materials / volumes / envelope_rules / facade_rules / roof_rules
-> src/construction/agents/materialPaletteAgent.js + minecraftBlockCatalog.js
   基于 Java 1.21.1 注册表校验 1060 个方块，并生成墙面、地板、门、灯光、红石、景观、完整 catalog 等材料池
-> src/construction/agents/plannerAgent.js
   生成 nodes / edges / circulation_rules / bsp_hints
-> src/construction/engine/csgBuilder.js
   将相对体块做 CSG，生成空心外壳 voxel grid
-> src/construction/engine/bspPartitioner.js
   在内部空间做 BSP 切分，得到房间矩形
-> src/construction/engine/pathfinder.js
   用 A* 打通拓扑门洞，并生成楼梯
-> src/construction/agents/interiorDetailAgent.js + interiorRoomAgents.js + decoratorAgent.js
   生成房间级内饰计划，并由房间功能专家 + 建筑风格专家写入家具、灯光和装饰方块
-> src/construction/workflow.js
   导出 blueprint.json、preview.html、run_report.md 和 datapack
```

旧版 `src/agents` / `src/engine` 生成体系已经移除；当前只有 `src/construction` 这一套主流程。

## 模块职责

- `architectAgent.js`
  - 负责第一步外壳 JSON。
  - 只描述体块比例和语义关系，例如主体、侧翼、门廊、塔楼。

- `plannerAgent.js`
  - 负责第二步拓扑 JSON。
  - 只描述房间节点、权重、隐私等级和连通关系。

- `materialPaletteAgent.js` / `minecraftBlockCatalog.js`
  - 内置 PrismarineJS minecraft-data 的 Java 1.21.1 方块注册表快照，共 1060 个 `minecraft:*` 方块 ID。
  - 所有材料输出会先通过目录校验，避免 LLM 或规则兜底写出不存在的方块。
  - 对墙面、地板、屋顶、门、楼梯、半砖、灯光、植物、家具、红石、景观和完整 catalog 分别提供可控方块池。

- `csgBuilder.js`
  - 将体块并集/差集转成稀疏 voxel 网格。
  - 抽取外表面，掏空内部，只保留外壳、楼板、屋顶和窗。

- `bspPartitioner.js`
  - 根据 Planner 的 room weight 递归切分内部空间。
  - 插入内墙，并留下基础门洞。

- `pathfinder.js`
  - 对拓扑边运行 A*，打通房间之间的门洞。
  - 生成主入口和楼梯。

- `interiorDetailAgent.js` / `interiorRoomAgents.js` / `decoratorAgent.js`
  - 生成房间级室内细节计划。
  - 门厅、厨房、客厅、餐厅、卧室、书房、卫浴、茶室、塔楼、车库等房间功能专家各维护 50+ 可控室内方块清单。
  - 现代、日式、哥特、赛博朋克、雪山/木屋、海滨、地下、树屋、沙漠/地中海、中式合院、古典、温室住宅等风格专家会叠加到对应房间。
  - 将家具、储物、灯光、地毯、植物、彩色旗帜、彩烛、釉陶、玻璃屏和功能台面写入 voxel grid。

- `gdmcClient.js`
  - 封装 GDMC HTTP `PUT /blocks`，用于未来直接渲染到游戏。

## 游戏内命令

```text
/reload
/function architect:run
```

`/reload` 只刷新数据包，不会建造。`architect:run` 会自动执行 `architect:clear` 和 `architect:build`。

## 输出报告

`run_report.md` 会展示：

- PDF 流程对齐情况
- Architect JSON 来源和体块列表
- Planner JSON 来源和拓扑节点
- InteriorDetail/Decorator 内饰专家和装饰数量
- CSG/BSP/A* 统计
- 是否通过 Minecraft 命令校验
