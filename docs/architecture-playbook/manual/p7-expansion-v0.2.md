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

### 用比例差和嵌套完成结构加法

- 来源：`BV1ecj4zsE27`，约 135–385 秒
- 建筑语言：`mass_ratio_variation`、`mass_overlap`、`attachment_role`、`multi-view mass_visibility`
- 动作：从一个主块开始，加入少量长、宽、高不同且用途明确的次级体块；让相邻体块嵌套或共享连接面，并从主视图与转角视图检查层次。
- 失败：把多个相同盒体松散并排；所有体块只在一个立面排队；新增体块没有入口、交通、屋顶转折、服务或景观角色。
- 修复：改变次级体块比例和位置，增加可解释的交叠，重新检查连接、内部通行与多视角轮廓。

### 用从属体块切分大墙面并控制细节预算

- 来源：`BV1ecj4zsE27`，约 419–657 秒及 750–1025 秒
- 建筑语言：`facade_partition_volume`、`subordinate_component`
- 动作：用门厅、次级房间、塔楼、老虎窗或棚屋切分过大的连续墙面；把精细化集中在入口、转角与连接处，其余区域保留有意图的留白。
- 约束：附属构件必须有具体角色并服从主体；不得用无差别装饰掩盖松散的体块关系。

### 让高体块与悬挑保持可读的承托

- 来源：`BV1ecj4zsE27`，约 526–612 秒及 938–950 秒
- 建筑语言：`visual_support_check`
- 动作：通过较宽底部、退台、相邻低体块或明确支撑路径承托高体块；悬挑和连廊不得停留在视觉上无支撑的状态。
- 约束：本集没有给出通用尺寸或比例，不能据此增加固定数值阈值。

### 让结构减法绑定可见目的

- 来源：`BV1Mp7UzyE3P`，约 19–100 秒、174–329 秒、330–538 秒及 559–650 秒
- 建筑语言：`subtraction_intent`、`void_region`、`void_position`、`articulation_preservation_check`
- 动作：只在能改善构图或形成入口、转角玻璃、穿透空间、阳台、平台或采光口的位置削减；用相对选区和 base、middle、corner、top 或 full_layer 记录空洞。
- 失败：削平原有有效凹凸；减法后可读表面和主体层次反而减少；空洞没有构图或空间用途。
- 修复：回退到完整体块，缩小或移动 `void_region`，重新验证用途和多视角轮廓。

### 控制空洞碎片并保留连续主体

- 来源：`BV1Mp7UzyE3P`，约 42–100 秒
- 建筑语言：`fragmentation_check`
- 动作：合并没有独立用途的相邻小洞，让空与实仍保持主次；不要把连续体块切成均匀、无角色的碎片。
- 约束：本集没有给出通用洞口数量或间距，因此只形成定性检查，不增加固定阈值。

### 为大空洞保留支撑并在切移后重验

- 来源：`BV1Mp7UzyE3P`，约 103–172 秒、371–409 秒及 559–785 秒
- 建筑语言：`void_support_check`、`cut_translate_recompose`
- 动作：base、middle 或 full_layer 大空洞必须让上部体量连接到柱、墙、斜撑或其他可读支撑路径；切下的同源体块可以平移、离散旋转或错移，但变换后重新检查连接、碰撞、支撑和轮廓。
- 约束：风格和材料角色不支持大跨时缩小空洞；字幕不构成现实材料承载力或结构安全数据。

### 放大建筑时重复柱梁开间而不是拉伸外壳

- 来源：`BV1MA7Bz2EE1`，约 0–158 秒及 160–305 秒
- 建筑语言：`support_system_scale_check`、`structural_bay`、`column_beam_grid`
- 动作：体量宽、高或跨距增加时，把主体划分为重复柱梁开间；柱向下连接地基或下层支撑，梁连接柱并承托楼板和屋顶。
- 失败：把小房子的无分段外壳等比放大；增加楼层却没有增加承托层级；柱梁只画在表面而不形成连续路径。

### 让屋面承托与内部空间同时成立

- 来源：`BV1MA7Bz2EE1`，约 239–430 秒
- 建筑语言：`roof_bearing_alignment`、`support_density_tradeoff`
- 动作：让屋面边缘、坡脚或内部屋架落到梁、墙或柱上；同时检查柱网是否阻断入口、主要通行和目标内部空间。
- 修复：屋面悬空时移动或增加承托；柱网过密时改用适合当前尺度的长梁、抬梁或跨越构图，不无条件删柱。

### 按受力暗示、尺度和连接选择斜撑

- 来源：`BV1MA7Bz2EE1`，约 431–599 秒及 605–966 秒
- 建筑语言：`lateral_support_strategy`、`diagonal_support_profile`
- 动作：柱梁框架需要表达左右稳定时，用斜撑连接已有柱梁节点；拱形构图暗示水平推力时，使用与风格相符的侧部加厚、扶壁或地形连接。斜撑坡度和厚度服从建筑尺度。
- 约束：楼梯的固定坡度和厚度不适合所有尺度；小构件只用于表达允许的细化，不能引入模组、展示实体或现实工程强度假设。

### 让屋脊朝向和构件高度服从最终轮廓

- 来源：`BV1h1keYbEMd`，约 6–221 秒
- 建筑语言：`roof_axis_candidate`、`roof_component_budget`
- 动作：沿体块允许的主轴生成屋脊朝向候选，比较最终高度、山面比例和整体轮廓；把核心坡面、包边、屋脊与叠加雕饰共同计入总高。
- 修复：方向使屋顶显得过高或像夹层时改换起坡轴；附加构件推高轮廓时降低核心坡面或减少叠层。课程明确允许有意为之的例外，因此不建立固定长边/短边禁令。

### 用组件图组合屋面并修补接缝

- 来源：`BV1h1keYbEMd`，约 277–316 秒、341–425 秒及 427–488 秒
- 建筑语言：`compound_roof_graph`、`roof_component`、`roof_seam_repair`
- 动作：把主屋顶、次级屋顶、L/T/十字分支、天窗和老虎窗绑定到对应体块或开口；组合后填合交接区域、删除重叠构件、恢复包边连续性，并让次级屋脊在主屋面正确终止。
- 失败：用随机小屋顶掩盖大坡面；次级屋顶没有下部体块或开口依据；相交处出现重复包边、空洞或穿插。

### 用坡度阶段表达曲线并处理偶数跨度

- 来源：`BV1h1keYbEMd`，约 575–830 秒及 852–970 秒；`BV1unj9z4EnW`，约 675–779 秒
- 建筑语言：`roof_profile_phases`、`even_span_closure`
- 动作：把变陡、变缓或反向的轮廓记录为有序坡度阶段，并按尺度选择整块、楼梯、台阶或允许的细构件；可在整砖基础上进行有边界的挖补，再用部分方块过渡。偶数跨度从偏移屋脊、改变坡度节奏、短平顶或顶部次级结构中选择有意图的收口。
- 约束：示例没有提供通用坡度数值；任何受控不对称或短平顶都要重新检查轮廓、接缝和承托，不能把一种曲线固化为全局模板。

### 大屋顶可用整砖建立主坡面

- 来源：`BV1unj9z4EnW`，约 91–228 秒及 262–410 秒
- 建筑语言：`roof_surface_primitive`、`large_roof_full_block_surface`
- 动作：小尺度固定坡度可以保留楼梯；大型或逐段变化的坡面若出现强横纹、锯齿或比例错位，改用整砖构成主体，把楼梯、台阶和墙限定为边缘、过渡或局部细化。
- 材料：整砖可扩展颜色和渐变库存；远景提高整体色块权重，近景重新检查强纹理、接缝和功能方块外观。
- 约束：课程没有给出尺度切换的固定跨度，不能把整砖或楼梯任一方案提升为全局强制规则。

### 在繁复焦点和干净屋面之间分配细节

- 来源：`BV1unj9z4EnW`，约 233–260 秒及 589–652 秒
- 建筑语言：`roof_detail_mask`、`detail_density_contrast`
- 动作：把包边、雕花、顶部构件和表面变化放在有界焦点或边线，保留可读的干净坡面；建筑群中让繁复屋顶与简洁屋顶形成主次对比。
- 失败：细节均匀铺满每个屋面；局部构件压过整体比例；把作者的自由雕刻口语直接翻译成无界随机噪声。

### 现代需求可以选择平顶或露台收口

- 来源：`BV1unj9z4EnW`，约 1,200–1,334 秒
- 建筑语言：`flat_roof_with_parapet`、`roof_profile_optional`
- 动作：brief 明确要求现代平顶或露台时，允许以平面和女儿墙结束，不默认强加人字坡顶。
- 约束：排水、防水和现实结构安全保持未解决；字幕不支持自动补充工程做法。

### 先用进深建立墙面层级

- 来源：`BV1ZJTLzgEdm`，约 0–37 秒及 329–411 秒
- 建筑语言：`facade_depth_layers`、`recessed_infill`
- 动作：先提出边框并让墙芯内退；较大墙面只有在需要透视和分区时才增加受控的进深层，把大面拆成可读区域后再分配细节。
- 失败：在单层平墙上直接堆出凸起纹样；用无限内退制造噪声；没有先确定框架和墙芯关系。

### 让细节尺度服从墙面比例

- 来源：`BV1ZJTLzgEdm`，约 90–177 秒及 255–327 秒
- 建筑语言：`facade_detail_scale_check`
- 动作：小比例墙面优先使用较小的允许构件；整砖、楼梯或大面积台阶压过柱和墙芯时，缩小细节或放大承载它的整体比例。
- 约束：课程没有给出尺度切换的固定格数；该检查补强已有 `scale_sensitivity`，不建立统一阈值。

### 以承托路径领导雕花并保留留白

- 来源：`BV1ZJTLzgEdm`，约 133–165 秒、414–468 秒、565–583 秒及 645–685 秒
- 建筑语言：`facade_support_path`、`facade_blank_mask`
- 动作：先让墙根、柱、顶部梁以及托臂或拱形连接形成可读支撑，再把表面纹样作为可选从属层；结构已经成立的区域允许明确留白。
- 失败：装饰遮住主体柱；纹样悬空或没有构造角色；把每片空白都视为必须填满的缺口。

### 把竖向开间与横向分层组织成同一立面

- 来源：`BV1ZJTLzgEdm`，约 1,183–1,310 秒
- 建筑语言：`vertical_bay_partition`、`horizontal_layer_connection`
- 动作：用可读竖柱把过长墙面分成开间，再以同色系、相容的部分构件细分过大的开间；通过柱、框架或承托跨越横带，让上下层保持连续关系。
- 失败：长横梁没有中间承托；上下层被横带切成互不相关的墙片；机械复制固定柱距而不检查整体比例。

### 把窗组织成可删减的语义构件

- 来源：`BV1XtGvzPEFR`，约 276–411 秒及 467–503 秒
- 建筑语言：`facade_opening_assembly`、`weather_hood`、`sill_or_display_ledge`、`opening_frame_integration_check`
- 动作：以实际开口为核心，按用途选择上部遮雨、下部窗台或展示面，以及连接到柱梁的拉结或支撑；不需要的部分可以删除。
- 失败：把所有窗固定成同一三段模板；新材料只贴在开口周围而不连接墙体、柱或梁；装饰遮住开口功能。

### 按尺度划分柱基、柱身和柱头

- 来源：`BV1XtGvzPEFR`，约 565–754 秒
- 建筑语言：`column_articulation_zones`、`column_ornament_scale_check`
- 动作：把柱基、柱身和柱头作为可选语义区，以部分方块进行细化；装饰压过柱身时删减，或在设计允许时放大柱和开间。
- 约束：三段是构图分析语言，不是每根柱都必须使用的模板；字幕没有给出各段高度或外扩比例。

### 在受限进深内建立有限浮雕

- 来源：`BV1XtGvzPEFR`，约 885–1,023 秒
- 建筑语言：`constrained_depth_relief`、`attachment_scale_and_junction`
- 动作：没有空间继续内退时，在一格进深内用允许的部分方块建立有限凹凸；外挂构件的长度、挂点和墙柱交接位置服从建筑尺度。
- 失败：把受限进深变成无界表面噪声；小建筑挂载过长构件；附件悬空或与墙柱连接关系不明。

### 让门板材质和门框连续

- 来源：`BV1nCJJzWEHH`，约 8–37 秒、85–175 秒及 298–345 秒
- 建筑语言：`door_frame_material_continuity`、`door_head_seam`
- 动作：按纹理连续性和连接状态选择门板、部分方块与门框；只在门头接缝处使用有界细构件，减少门板和框架之间的锯齿与割裂。

### 让入口表达服从尺度

- 来源：`BV1nCJJzWEHH`，约 258–297 秒、399–463 秒及 631–653 秒
- 建筑语言：`entry_scale_check`、`door_panel: omitted`、`nested_portal_depth`
- 动作：小入口限制细节，大型门洞可以分层；当实体门板不适合尺度时，保留可通行门洞与清晰门框即可。需要纵深时让外圈到内圈有序缩小。
- 失败：小门硬塞大型雕花；为表现门扇堵塞通行；把示例中的随机纹样复制成固定模板。

### 用门槛、台阶和雨棚连接入口

- 来源：`BV1nCJJzWEHH`，约 183–256 秒及 597–630 秒
- 建筑语言：`threshold_or_stair_transition`、`weather_sheltered_entry`
- 动作：入口高于地面时用门槛或有界台阶连接通行；有等候或天气需求时加入受支撑门厅或雨棚，并让表面向开口两侧表达导水。
- 约束：字幕不提供现实结构、防水或排水参数。

### 让大型入口形成可见纵深序列

- 来源：`BV1nCJJzWEHH`，约 749–843 秒
- 建筑语言：`layered_entry_sequence`、`interior_focal_layer`
- 动作：把外部门框、门厅或前台、内部门槛组织成连续纵深；从外部检查内部焦点是否可见，同时保留通行净空。

### 用有限语汇和真实进深构筑大型墙面

- 来源：`BV1FrPazJEFD`，约 47–578 秒
- 建筑语言：`facade_material_profile`、`facade_pattern_vocabulary`、`facade_depth_expansion`
- 动作：按连接性、视觉密度和特征强度分配大面、支撑与点缀材料；用少量线条和浮雕单元形成共享对齐的重复节奏。浅层细节仍显平时，增加有界墙面体量而不是继续堆噪声。

### 通过主次分区迭代墙面

- 来源：`BV1FrPazJEFD`，约 664–1,046 秒
- 建筑语言：`primary_partition`、`secondary_alignment`、`solid_open_hierarchy`、`visual_outlier_check`
- 动作：先分配门洞、实心与通透主区，再建立对齐的次分区；反复检查宽高规律、采光、焦点和比例，删除突兀元素，并用收束宽度表达构图结束。
- 失败：每个开间使用独立技巧；在同一浅平面无序堆叠；装饰没有承托、开口或收束角色。

### 先建立景观路径和有界物件组

- 来源：`BV1HRVnzVEFa`，约 199–317 秒及 497–689 秒
- 建筑语言：`landscape_route_and_grounding`、`permeable_surface_transition`、`role_scaled_landscape_cluster`
- 动作：先定义路径、庭院和种植区，再让硬地与土壤在有界边缘带互相进入；物件组以一个较大主体和较小从属构件组织，并保持通行净空。

### 让道路磨损服从交通与坡度

- 来源：`BV1rx6yYNEYr`，约 251–380 秒、1,143–1,214 秒及 1,430–1,668 秒
- 建筑语言：`traffic_wear_zones`、`road_edge_gradient`、`terrain_responsive_path_profile`
- 动作：道路中心、边缘和低使用区采用不同磨损逻辑；路面与地形短距离互相渗透，陡坡用楼梯、缓坡用台阶并保持连续可通行。

### 从渐细枝架生成树冠

- 来源：`BV1KN91Y1ELG`，约 60–328 秒、511–630 秒、925–1,027 秒及 1,385–1,410 秒
- 建筑语言：`tapering_branch_structure`、`branch_supported_canopy`、`canopy_silhouette_variation`
- 动作：从粗主干向交替、多方向的细侧枝展开，叶团附着于枝条并保留底部可见骨架；树族改变朝向、叶片密度和冠形而不退化为重复叶球。

### 先满足桥梁净空、支撑和安全

- 来源：`BV1xtXKYYEF2`，约 31–242 秒及 301–421 秒
- 建筑语言：`bridge_clearance`、`span_adapted_curve`、`bridge_detail_budget`
- 动作：先确定桥面、下方净空和护栏，在折点或薄弱跨设置近似等距支撑；拱度向中心逐渐延长步长，完成结构后才添加顶棚和点缀。

### 按水层和岸线组织水体

- 来源：`BV1Hy5pzQE5n`，约 32–272 秒及 512–660 秒
- 建筑语言：`water_body_layers`、`inhabitant_compatibility`、`shoreline_gradient`
- 动作：分别处理水底、水中、水面和开放水域，检查生物相容与逃逸；材料簇跨越水陆边界，有入水口时用沉积方向解释变化。

### 用建筑体块派生非直角地基包络

- 来源：`BV1oFJPzqE9k`，约 20–301 秒及 423–660 秒
- 建筑语言：`nonrectilinear_terrain_envelope`、`footprint_derived_foundation`、`building_foundation_continuity`
- 动作：从建筑主次足迹向地面延伸地基，并用更小体块打散轮廓；柱墙跨过接缝，建筑与地基共享做旧、材料或植被呼应，避免深直角切坑。

### 分层连接相邻房屋

- 来源：`BV1i2JBzPE8m`，约 60–180 秒、240–390 秒及 480–662 秒
- 建筑语言：`interbuilding_depth_zones`、`porous_or_opaque_screen`、`supported_multilevel_connector`
- 动作：先完成接地层，再选择前景、中景和远景；按是否保留后景选择通透或实体屏障，高架连桥必须统一材料并验证支撑、通行和净空。

### 用视廊和道路地块编排山谷

- 来源：`BV1Cm7VzzEXd`，约 20–60 秒、90–331 秒、390–510 秒及 540–631 秒
- 建筑语言：`layered_valley_site`、`distance_scaled_material`、`route_first_parcels`
- 动作：选址先平衡近中远景、包围感和开放视廊；远景按色块和覆盖面控制，先铺主次道路，再按生成地块的形状与大小放建筑、种植或水体。

### 按功能和尺度组织海滩

- 来源：`BV1a5TDzhE9M`，约 240–420 秒、541–600 秒及 662–812 秒
- 建筑语言：`scale_matched_outdoor_fixture`、`beach_functional_zoning`、`contrasting_surface_patch`
- 动作：先划分通行、遮阳、休息、游戏、垂钓或服务区；小构件使用薄层，大构件补骨架和纵深，并用有限石路、土壤或绿地反差区分功能。

## 第六章：内饰

### 先组织功能、可达性和通透边界

- 来源：`BV1DkPVexESz`，约 32–240 秒、540–720 秒；`BV1ux2sBvECk`，约 90–180 秒、270–480 秒
- 建筑语言：`function_led_interior_zoning`、`circulation_route`、`porous_partition`、`daylit_room_edge`
- 动作：从入口按可达性安排公共、私密和服务区，先保证主要通路；只有隐私或封闭用途需要完整隔墙，其余边界可用半高屏风、框架或地面纹样维持通透。需要日光的房间优先接触外墙。
- 失败：家具先行导致动线绕行；厕所等服务门正对公共焦点；每个区域都封死；中心房间被误当成有自然采光。

### 让楼梯和挑高属于建筑框架

- 来源：`BV1DkPVexESz`，约 300–540 秒、750–1,020 秒；`BV1ux2sBvECk`，约 480–900 秒
- 建筑语言：`frame_planned_stair`、`vertical_shared_volume`、`landing_and_circulation_check`
- 动作：在框架阶段为楼梯、平台和到达层留位；受限平面采用折返、螺旋或适当梯子，较大公共区可以用有界挑高连接上下层，并利用共享空间获得采光或悬挂焦点。
- 约束：字幕没有提供统一楼梯宽度、坡度、净高或挑高比例。

### 从大到小完成家具与室内表面

- 来源：`BV1DkPVexESz`，约 540–720 秒、1,020–1,501 秒；`BV1VULRzAE3x`，约 31–150 秒、212–540 秒
- 建筑语言：`large_to_small_furnishing_pass`、`interior_surface_field`、`bounded_small_block_assembly`
- 动作：先放主家具，再放储物与工作物，最后放植物和桌面小物；地板、天花板与窗墙采用有方向的有限纹样。小构件必须有主轮廓和支撑、连接、表面或功能角色。
- 失败：只把功能方块排满墙边；小物遮挡使用面；纹样压过空间分区；技巧性构件破坏碰撞或版本兼容。

### 用构件语法生成灯、椅和桌

- 来源：`BV1Rf7nz5Eic`，约 420–720 秒、842–1,261 秒、1,410–1,591 秒；`BV1tepJz3EuZ`，约 60–180 秒、420–960 秒；`BV1TUHHz1ECZ`，约 30–120 秒、240–541 秒
- 建筑语言：`luminaire_base_shaft_head`、`supported_lamp_arm`、`seat_surface_and_back`、`seat_group`、`context_readable_table`、`table_floor_separation`
- 动作：灯按底座/挂点、杆身/链条、灯头组合，外伸臂回接支撑并保持配重；椅子先有坐面和靠背，尺度允许时才加扶手或软包；桌子先有可用桌板，再由座位或活动语境说明功能，并与地板保持有限材质分离。

### 按路线、支撑、表面、光完成洞穴住宅

- 来源：`BV1YNLnzeEx3`，约 60–480 秒、515–797 秒、813–1,378 秒、1,411–1,611 秒及 1,891–2,130 秒
- 建筑语言：`cave_route_room_sequence`、`cave_support_frame`、`cave_ceiling_zone`、`room_scaled_light_distribution`
- 动作：先挖入口、主路线、私密房与共享房，再完成错层和一致支撑；随后处理天然/人工表面和冷暖呼应。底部视觉较重，天花板按区域变化，大空间分配多点补光，小空间使用受控主灯。
- 失败：先雕墙再发现路线无效；平台与跨距没有支撑；所有天花板同高；单盏灯让大空间留下不可用暗区或把洞穴纵深全部抹平。

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

### 用明度层级显示结构次序

- 来源：`BV14XMtzFEzb`，约 79–124 秒
- 建筑语言：`palette_role`、`value_hierarchy`
- 动作：为 roof、frame、infill、base、accent 和 landscape 分配颜色角色；让承担构图线的框架与填充面保持清晰且协调的明度差。
- 失败：填充面抢过框架；所有角色糊成一块；无结构目的的高对比线条抢夺视线。

### 让形态库存匹配目标尺度

- 来源：`BV14XMtzFEzb`，约 390–464 秒及 917–974 秒
- 建筑语言：`shape_inventory`
- 动作：锁定材料前检查其整块、楼梯、台阶和墙等形态是否能表达目标曲线；不足时换材料、放大尺度或简化轮廓。
- 观察：小尺度提高形态和接缝权重；大尺度、远距离提高整体色块权重。

### 检查背景分离并呼应点缀色

- 来源：`BV14XMtzFEzb`，约 302–371 秒、668–773 秒及 974–1015 秒
- 建筑语言：`background_separation_check`、`accent_echo`、`palette_scope`
- 动作：在建筑、建筑群和景观三个范围检查主体与道路、地面及邻近体块的可分辨性；突出色在一个主要焦点出现，并在更小从属区域重复同源颜色。
- 失败：主体与背景共享近似色值；异色只出现一次而突兀；点缀被平均撒满全局而失去焦点。

### 把相近材料组织成有序色阶

- 来源：`BV1SwdfBHEx5`，约 130–170 秒
- 建筑语言：`palette_ramp`
- 动作：围绕目标颜色选择相近材料，并按明度、色相或冷暖关系排序；在结构区域内使用有方向的渐变，不把材料当作无序随机池。
- 约束：本集只演示棕色过渡，没有给出通用材料数量、比例或具体方块表。

### 用近景与远景分别检查细节和体块

- 来源：`BV1SwdfBHEx5`，约 51–94 秒及 202–250 秒；`BV1h1keYbEMd`，约 1,159–1,189 秒
- 建筑语言：`context_horizon`、`evaluation_view: primary_close`、`evaluation_view: distant_compressed`
- 动作：近景检查入口、立面层次、屋顶接缝和细节；远景检查主体轮廓、比例、屋顶纹理密度以及建筑群与环境的关系。
- 观察：候选在展示光影之外仍保持主体可读；近距离透视不会成为唯一的比例依据。

## 第七章：进阶建筑

### 把做旧限制在可解释区域

- 来源：`BV1JcQ3YYEg5`，约 64–774 秒
- 建筑语言：`weathering_zone`、`material_ramp`、`organic_cluster`
- 动作：选择需要做旧的逻辑区域，以有限色阶改变材料，再在少数关键点加入结构增减和聚类生长。
- 失败：每面墙平均撒入所有旧化材料，或让做旧覆盖全部主体区域。

### 用主厅、附属体和单位墙组织大型建筑

- 来源：`BV1j7QSYKEHA`，约 30–1,172 秒
- 建筑语言：`dominant_hall`、`attached_volume`、`unit_bay`、`entry_sequence`
- 动作：先建立主厅与从属体的多角度轮廓，同时规划入口、大厅、平台和楼梯；完成一个代表风格的单位墙后，沿显式连接面复用有界变体。
- 约束：案例尺寸、对称形式和屋顶收口不是固定公式。

### 以道路和地形层次规划建筑群

- 来源：`BV1yHEtz2EJh`，约 32–811 秒
- 建筑语言：`shared_route`、`residual_plot`、`terrain_step`、`landmark_clearance`
- 动作：让每栋建筑接入主路或公共节点，合并浪费的平行小巷；按近低远高安排地形台阶，并为地标保留主要路径视线。
- 失败：先孤立堆房再补不可达小路；铲平整片地形；用完全相同模板填满近景。

### 由观察路径决定前景与投入

- 来源：`BV1SNdSBtErf`，约 61–1,111 秒
- 建筑语言：`primary_view_path`、`foreground_occlusion`、`depth_chain`
- 动作：在体块排布前声明常走路径，采用前低后高、近精远简；植物、木构或地形只遮挡选定弱面，每层同时成为后一层的前景。
- 失败：用前景掩盖所有立面问题，或把主体切成没有大面秩序的碎块。

### 编排重复而不是消灭重复

- 来源：`BV1LxjEzKEH7`，约 61–841 秒
- 建筑语言：`ornament_zone`、`repeat_rhythm`、`quiet_bay`、`shape_vocabulary`
- 动作：用大柱、横带和安静墙面划出一级分区；在有限模块内交替密实、留白、开口、屋顶与色彩变体。按方块形态和表面角色使用当前目标版本支持的构件。
- 失败：满墙雕花、整面复制粘贴或无目的的小构件噪声。

### 将斜向结构作为有限点缀

- 来源：`BV17QjvzpEuA`，约 0–1,019 秒
- 建筑语言：`diagonal_step_rhythm`、`local_orthogonal_envelope`、`diagonal_unit_wall`、`diagonal_budget`
- 动作：以一致阶梯节奏画局部矩形，先做屋顶边框与屋脊再填面；使用足够宽的单位墙承载开口和支撑，并把斜向段嵌入稳定正向主体。
- 约束：数格检查窄边奇偶；示例斜率和模组旋转不成为编译依赖。

## 当前进入构建 Agent 的含义

这些条目扩展的是规划和编译词汇，不是新的审美评分。Agent 可以用模块、变换、mask、重复和 terrain pass 组织蓝图；固定编译器仍把结果输出为相对坐标 `architect_datapack/`。未进入现有白名单的操作保持建议状态，不能绕过硬 QA、方块白名单或一次修复预算。

## 来源讲义

- [进阶 5 斜向建筑：局部坐标、屋顶框架与有限点缀](../course/notes/heihui-jileniao/BV17QjvzpEuA.md)
- [进阶 4 降低重复感：分区、留白与编排](../course/notes/heihui-jileniao/BV1LxjEzKEH7.md)
- [进阶 3.1 前景：观察路径与有限遮挡](../course/notes/heihui-jileniao/BV1SNdSBtErf.md)
- [进阶 3 建筑群规划：道路、地形层次与地标](../course/notes/heihui-jileniao/BV1yHEtz2EJh.md)
- [进阶 2 大型建筑：主厅、附属体与单位墙](../course/notes/heihui-jileniao/BV1j7QSYKEHA.md)
- [进阶 1 做旧：有界材质、结构痕迹与局部生长](../course/notes/heihui-jileniao/BV1JcQ3YYEg5.md)
- [5.3 山顶洞人：洞穴住宅的路线、支撑与光](../course/notes/heihui-jileniao/BV1YNLnzeEx3.md)
- [5.2.3 桌子：桌面、支撑与使用场景](../course/notes/heihui-jileniao/BV1TUHHz1ECZ.md)
- [5.2.2 椅子：座面、靠背与组合尺度](../course/notes/heihui-jileniao/BV1tepJz3EuZ.md)
- [5.2.1 灯：比例、承托与照明构件](../course/notes/heihui-jileniao/BV1Rf7nz5Eic.md)
- [5.2 小构件：角色、轮廓与有限细节](../course/notes/heihui-jileniao/BV1VULRzAE3x.md)
- [5.1.1 室内进阶：分区、楼梯与挑高](../course/notes/heihui-jileniao/BV1ux2sBvECk.md)
- [5.1 室内基础：功能、动线与采光](../course/notes/heihui-jileniao/BV1DkPVexESz.md)
- [4.9 海滩设计：尺度构件、功能分区与表面反差](../course/notes/heihui-jileniao/BV1a5TDzhE9M.md)
- [4.8 山谷设计：分层选址、尺度色块与道路地块](../course/notes/heihui-jileniao/BV1Cm7VzzEXd.md)
- [4.7 房屋衔接：纵深分区、视线屏障与多层连接](../course/notes/heihui-jileniao/BV1i2JBzPE8m.md)
- [4.6 地形衔接：非直角包络与体块派生地基](../course/notes/heihui-jileniao/BV1oFJPzqE9k.md)
- [4.5 水体美化：水层、生态相容与岸线](../course/notes/heihui-jileniao/BV1Hy5pzQE5n.md)
- [4.4 桥入门：净空、支撑与跨径曲线](../course/notes/heihui-jileniao/BV1xtXKYYEF2.md)
- [4.3 树入门：渐细枝架与枝上树冠](../course/notes/heihui-jileniao/BV1KN91Y1ELG.md)
- [4.2 铺路入门：交通磨损、边缘渐变与坡度](../course/notes/heihui-jileniao/BV1rx6yYNEYr.md)
- [4.1 造景概述：路径、地表过渡与物件组](../course/notes/heihui-jileniao/BV1HRVnzVEFa.md)
- [3.5 构筑大型墙面：有限语汇、进深与迭代分区](../course/notes/heihui-jileniao/BV1FrPazJEFD.md)
- [3.4 门：门框连续、入口过渡与可见纵深](../course/notes/heihui-jileniao/BV1nCJJzWEHH.md)
- [3.3 墙面装饰：窗构件、柱分段与受限进深](../course/notes/heihui-jileniao/BV1XtGvzPEFR.md)
- [3.2 墙面雕花：进深、承托与横纵分区](../course/notes/heihui-jileniao/BV1ZJTLzgEdm.md)
- [2.3 屋顶优化：整砖坡面、细节密度与平顶选择](../course/notes/heihui-jileniao/BV1unj9z4EnW.md)
- [2.2 屋顶变例：朝向、组合屋面与偶数跨度收口](../course/notes/heihui-jileniao/BV1h1keYbEMd.md)
- [1.5 支撑结构：柱梁网格、承托路径与斜撑尺度](../course/notes/heihui-jileniao/BV1MA7Bz2EE1.md)
- [1.4 结构的减法：有目的的空洞、退让与体块错移](../course/notes/heihui-jileniao/BV1Mp7UzyE3P.md)
- [1.3 结构的加法：体块嵌套、立面切分与附属构件](../course/notes/heihui-jileniao/BV1ecj4zsE27.md)
- [0.1 建筑工具：选择、变换、复用与地形塑形](../course/notes/heihui-jileniao/BV1aBV1zwELe.md)
- [0.1.1 高版本建筑包：远景、渐变与评估视角](../course/notes/heihui-jileniao/BV1SwdfBHEx5.md)
- [0.2 快捷键：阶段切换、组件复用与隐藏功能层](../course/notes/heihui-jileniao/BV1SG6GY9ETe.md)
- [0.3 认识方块：从名称转向视觉属性](../course/notes/heihui-jileniao/BV1iVLbzcEfG.md)
- [0.4 模块化建筑：复用效率与整体设计](../course/notes/heihui-jileniao/BV1cLJtz1ELx.md)
- [0.5 材质与配色：层级、呼应与尺度](../course/notes/heihui-jileniao/BV14XMtzFEzb.md)
