# Minecraft 建筑智能体运行报告

## 输入需求

建一个江南两层小院，白墙黑瓦，带水池，室内有卧室客厅厨房

## Agent 流水线结果

- RequirementAgent 来源：fallback
- SkillRouterAgent 来源：fallback
- PlannerAgent 来源：fallback
- 风格：江南
- 规模：small
- 层数：2
- 关键元素：白墙、黛瓦、飞檐、小花园、水景、室内功能

## 建筑 Skill

- skill：江南水乡小院 (jiangnan-courtyard)
- confidence：72%
- preferredFootprint：courtyard
- requiredModules：courtyard、garden、water_feature、roof_detail
- rationale：江南 风格和关键词匹配 江南水乡小院 skill。

## 建筑语义规划

- footprint：courtyard
- zones：门厅(entry)、客厅(living)、厨房(kitchen)、卧室(bedroom)、楼梯间(stairs)、书房(study)、水院(garden)、水景(water)
- adjacency：entry-living、living-kitchen、living-bedroom、living-stairs、bedroom-study、living-garden、garden-water
- styleMotifs：white-wall-dark-roof、courtyard-axis、eave-corners、water-courtyard

## 评审与修正

- CriticAgent 来源：fallback
- 软质量评分：100/100
- 是否触发修正：否
- 优点：
  - 已生成 courtyard 模块。
  - 已生成 garden 模块。
  - 已生成 8 个室内功能区。
- 问题：
  - 未发现明显软质量问题。
- RepairAgent 操作：
  - 未触发修正

## 建筑设计

- 目标版本：Minecraft Java 1.21
- 数据包 pack_format：48
- 建筑尺寸：21 x 16 x 22
- 函数命令数：142
- fill 命令数：98
- setblock 命令数：44
- 模块：foundation、walls、floors、roof、roof_detail、windows、door、courtyard、interior、stairs、furnishing、lighting、garden、water_feature

## 可配置建筑元素

- 墙壁：材质 minecraft:white_concrete，厚度 1
- 地板：材质 minecraft:spruce_planks，层数 2
- 门：材质 minecraft:spruce_door，位置 south-center，尺寸 1 x 2
- 屋顶：材质 minecraft:deepslate_tiles，样式 pagoda，高度 5
- 窗户：材质 minecraft:glass_pane，尺寸 2 x 2，间距 6

## 蓝图子 Agent 交付

- ShellAgent：内部空间 2 层，侧翼 0 个，主门 south
- LayoutAgent：房间 8 个，室内门 4 个，楼板开洞 1 个
- FurnishingAgent：家具/装饰 24 处，照明 8 处
- GardenAgent：庭院地块 (-3,14)-(17,18)，元素 path、hedge、flower_beds、water_feature

## 校验结果

- 状态：通过
- 警告：
- 无

## 输出文件

- 数据包目录：D:\PKU\Others\MC_CONSTRUCTION_AGENT\Minecraft-Constructing-Agents\outputs\manual-20260609-mcagent\presentations\minecraft-agent-workflow-pku-red-rich\demo-run\2026-06-09-192815\architect_datapack
- 建造函数：D:\PKU\Others\MC_CONSTRUCTION_AGENT\Minecraft-Constructing-Agents\outputs\manual-20260609-mcagent\presentations\minecraft-agent-workflow-pku-red-rich\demo-run\2026-06-09-192815\architect_datapack\data\architect\function\build.mcfunction
- 清理函数：D:\PKU\Others\MC_CONSTRUCTION_AGENT\Minecraft-Constructing-Agents\outputs\manual-20260609-mcagent\presentations\minecraft-agent-workflow-pku-red-rich\demo-run\2026-06-09-192815\architect_datapack\data\architect\function\clear.mcfunction
- 原始 mcfunction：D:\PKU\Others\MC_CONSTRUCTION_AGENT\Minecraft-Constructing-Agents\outputs\manual-20260609-mcagent\presentations\minecraft-agent-workflow-pku-red-rich\demo-run\2026-06-09-192815\raw_build.mcfunction
- 预览 HTML：D:\PKU\Others\MC_CONSTRUCTION_AGENT\Minecraft-Constructing-Agents\outputs\manual-20260609-mcagent\presentations\minecraft-agent-workflow-pku-red-rich\demo-run\2026-06-09-192815\preview.html


## Minecraft Java 1.21 使用步骤

1. 创建单人创造超平坦世界，并开启作弊。
2. 把 architect_datapack 复制到 .minecraft/saves/<世界名>/datapacks/。
3. 进入世界后运行 /reload。
4. 站在建筑起点运行 /function architect:clear。
5. 运行 /function architect:build。

说明：mcfunction 文件内部命令不带斜杠，这是 Minecraft 数据包函数的正常格式。
