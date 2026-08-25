# 中世纪 1.2：从规则到完整民居范例

- 课程体系：灰灰鸡了鸟
- 来源：`BV1jbdUYCEjG`
- 探针角色：完整案例
- 证据包：`0ef27640969dcbf1c2daa6a3d64e9ed9e09bcedc0f46db0cfe715c336bbeb7a7`
- 状态：P2 候选讲义，不代表跨作者共识

## 本集解决的问题

前五集给出局部原则，本集展示它们如何在一个成品中协同：交叉体块由塔楼连接，窗式负责统一，屋顶和绿植负责变化，细节预算服从主要视角，最后再把建筑放进有前中后景的场景。

## 案例拆解顺序

1. 从顶视图识别两个横纵体块和中间塔楼。
2. 用高度错落、退台和局部凹入建立整体轮廓。
3. 对大外挑补充可读支撑，不把支撑当纯贴花。
4. 为大屋顶使用混色、渐变或冲刷痕迹，避免单色大面。
5. 在不同立面重复核心窗式，维持风格统一。
6. 让藤蔓沿地面到屋顶的连续路径生长，服务主观景面。
7. 次要背面简化，主要视角集中细节预算。
8. 用低明度塔顶平衡大面积暖色主体。
9. 通过前景和远景小物把住宅接入完整场景。

## 证据归纳

| 证据 ID | 观察 | 候选规则 |
| --- | --- | --- |
| `ev:bv1jbduycejg:tower-joint` | 中部高塔连接横纵屋体并形成焦点 | `rule:case.join-crossed-massing-with-tower` |
| `ev:bv1jbduycejg:repeat-window-motif` | 同一窗式在多面重复，统一复杂体块 | `rule:case.repeat-motif-for-unity` |
| `ev:bv1jbduycejg:purposeful-greenery` | 藤蔓形成从地面贯穿屋面的连续路径 | `rule:case.use-greenery-as-composition` |
| `ev:bv1jbduycejg:viewpoint-detail-budget` | 次要背面明显简化 | `rule:case.allocate-detail-by-viewpoint` |
| `ev:bv1jbduycejg:dark-roof-balance` | 黑灰塔顶平衡暖红主体 | `rule:case.balance-warm-mass-with-dark-roof` |
| `ev:bv1jbduycejg:scene-depth` | 建筑作为中景，鸟群承担前景和远景 | `rule:case.compose-context-depth` |

## 给 Agent 的最小完整流程

`brief → viewpoint → massing → hierarchy → frame → roof → facade bays → palette → vegetation → scene → multi-view critique → repair`

每阶段只开放少量高层决策给 LLM，并把结果写入中间表示；确定性算法负责落实方块。评价器在阶段边界给出可解释缺陷，例如“体块割裂”“屋面过平”“墙间重复”或“次要面细节过量”，再由 LLM 选择修复操作。

## 尚未证明

- 后 39 分钟主要为无讲解搭建过程，本探针没有把固定时间截图冒充教学证据。
- 窗式重复与墙间变化之间存在条件张力，需要后续案例确定层级边界。
- 色彩平衡和场景景深仍缺少自动评价指标。
