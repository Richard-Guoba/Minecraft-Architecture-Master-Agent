# Minecraft 建筑秘籍：P7 知识扩展 v0.2

> 学派：黑辉极乐鸟（`heihui-jileniao`）。本文件只追加剩余课程中由字幕直接支持的知识；[v0.1](v0.1.md) 六集黄金语料保持不变。

## 建造工作流语言

### 用相对锚点表达可复用模块

- 来源：`BV1aBV1zwELe`，约 484–695 秒
- 建筑语言：`selection_region`、`relative_anchor`、`module_instance`、`module_transform`
- 动作：在有边界的选区中定义模块，把模块坐标归一化到相对锚点；通过平移、离散旋转或镜像产生实例。
- 组合：嵌入已有结构时使用 `placement_mask: non_air`，避免模块中的空气清除目标结构。
- 便携性：所有变换在生成阶段展开为相对坐标；最终数据包不依赖 WorldEdit、Axiom 或特定世界。

### 用重复和对称生成同源构件

- 来源：`BV1aBV1zwELe`，约 768–825 秒及 1184–1228 秒
- 建筑语言：`linear_repeat`、`symmetry_repeat`
- 动作：先定义一个母模块，再指定方向、间距、次数或对称中心；不要分别生成多个无血缘副本。
- 约束：本集没有给出普遍适用的重复次数或间距，因此参数仍由具体建筑决定。

### 把地形处理拆成有序 passes

- 来源：`BV1aBV1zwELe`，约 697–766 秒及 1396–1575 秒
- 建筑语言：`terrain_pass`、`material_noise_mask`
- 动作：先建立大尺度高度、盆地或坡面，再进行衔接和平滑；最后才在限定区域内加入确定性噪声或粗糙化。
- 失败：在轮廓尚未稳定时先加细碎噪声；平滑后丢失目标坡向；噪声越过选区污染建筑主体。
- 修复：回到上一个 `construction_checkpoint`，缩小 mask，重新执行后续 pass。

### 批量变换前建立可回退检查点

- 来源：`BV1aBV1zwELe`，约 391–478 秒及 1515–1524 秒
- 建筑语言：`construction_checkpoint`
- 动作：复制、替换、删除、移动、堆叠、地形塑形等批量操作前保存检查点；验证后再进入下一层。
- Agent 对应：沿用既有分层 checkpoint 和一次修复预算，不把模组的交互式 undo 变成玩家运行时依赖。

### 在外壳完成后切换到内部施工

- 来源：`BV1SG6GY9ETe`，约 12–47 秒
- 建筑语言：`construction_stage: exterior_shell → interior_pass`
- 动作：外部壳体通过结构检查后再进入内部施工；内饰细节不反向污染体块和主结构阶段。

### 复用带语义和状态的施工组件

- 来源：`BV1SG6GY9ETe`，约 47–167 秒及 236–299 秒
- 建筑语言：`semantic_material_kit`、`stateful_component_template`
- 动作：从已批准区域采样材料并按外墙、屋顶、内饰或景观角色归档；复用组件时同时保存其方块 ID、朝向、连接和允许的数据字段。

### 把不可见功能放在独立 utility 层

- 来源：`BV1SG6GY9ETe`，约 326–447 秒
- 建筑语言：`utility_layer`
- 动作：隐藏照明、挡水和其他辅助方块与可见建筑层分开编译；最终检查碰撞、可见泄漏和目标版本支持。

### 从已验证设计提取母模块

- 来源：`BV1cLJtz1ELx`，约 33–169 秒及 431–917 秒
- 建筑语言：`source_module`、`connection_face`、`variation_budget`
- 动作：先让体块、入口、空间和主结构成立，再把重复开间、窗、阳台或屋顶段保存为母模块；同时记录边界、相对锚点、连接面和允许的变换。
- 约束：模块复用不能代替整体设计；如果移除附加小装饰后主体没有层次，应返回体块或立面阶段。

### 实例化后执行连接修补

- 来源：`BV1cLJtz1ELx`，约 313–413 秒及 538–917 秒
- 建筑语言：`module_instance`、`seam_repair`、`detail_dependency_check`
- 动作：移动、旋转、镜像或复制模块后，检查尺寸差、空洞、重叠、转角、出檐和支撑连续性；在 `variation_budget` 内改变高度、宽度、开口、材料或细节密度。
- 失败：把完全相同的实例铺满四面，再用随机小构件和噪声掩盖机械重复。

## 材料与评估语言

### 按视觉属性分配材料角色

- 来源：`BV1iVLbzcEfG`，约 17–53 秒及 321–540 秒
- 建筑语言：`block_visual_profile`、`texture_direction`、`texture_continuity`、`border_strength`、`material_role`
- 动作：忽略方块稀有度和名称先验，先观察每个面的颜色、纹理方向、连续性和边框；再分配 frame、support、infill、surface、accent 或 utility 角色。
- 观察：柱梁纹理沿构件轴向连续；墙芯能形成稳定表面；支撑层的视觉重量不弱于被支撑区域。
- 失败：柱被读成逐格堆叠；带强边框材料铺成碎裂墙面；浅弱支撑承托厚重填充。

### 根据建筑尺度改变颜色与纹理权重

- 来源：`BV1iVLbzcEfG`，约 597–629 秒
- 建筑语言：`scale_sensitivity`
- 动作：小尺度、近距离方案优先检查单块纹理和接缝；大尺度、远距离方案提高整体色块与明度关系的权重。
- 约束：本集没有给出尺度切换的固定格数。

### 把相近材料组织成有序色阶

- 来源：`BV1SwdfBHEx5`，约 130–170 秒
- 建筑语言：`palette_ramp`
- 动作：围绕目标颜色选择相近材料，并按明度、色相或冷暖关系排序；在结构区域内使用有方向的渐变，不把材料当作无序随机池。
- 约束：本集只演示棕色过渡，没有给出通用材料数量、比例或具体方块表。

### 用近景与远景分别检查细节和体块

- 来源：`BV1SwdfBHEx5`，约 51–94 秒及 202–250 秒
- 建筑语言：`context_horizon`、`evaluation_view: primary_close`、`evaluation_view: distant_compressed`
- 动作：近景检查入口、立面层次和细节；远景检查主体轮廓、比例以及建筑群与环境的关系。
- 观察：候选在展示光影之外仍保持主体可读；近距离透视不会成为唯一的比例依据。

## 当前进入构建 Agent 的含义

这些条目扩展的是规划和编译词汇，不是新的审美评分。Agent 可以用模块、变换、mask、重复和 terrain pass 组织蓝图；固定编译器仍把结果输出为相对坐标 `architect_datapack/`。未进入现有白名单的操作保持建议状态，不能绕过硬 QA、方块白名单或一次修复预算。

## 来源讲义

- [0.1 建筑工具：选择、变换、复用与地形塑形](../course/notes/heihui-jileniao/BV1aBV1zwELe.md)
- [0.1.1 高版本建筑包：远景、渐变与评估视角](../course/notes/heihui-jileniao/BV1SwdfBHEx5.md)
- [0.2 快捷键：阶段切换、组件复用与隐藏功能层](../course/notes/heihui-jileniao/BV1SG6GY9ETe.md)
- [0.3 认识方块：从名称转向视觉属性](../course/notes/heihui-jileniao/BV1iVLbzcEfG.md)
- [0.4 模块化建筑：复用效率与整体设计](../course/notes/heihui-jileniao/BV1cLJtz1ELx.md)
