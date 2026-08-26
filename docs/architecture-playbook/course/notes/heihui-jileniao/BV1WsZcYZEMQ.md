# 中世纪 1.1：民居结构不是表面符号

- 课程体系：黑辉极乐鸟
- 来源：`BV1WsZcYZEMQ`
- 探针角色：中世纪民居结构
- 证据包：`3d25a9ee27688cc423b21abf230934147e75953cdf7ae660574af1e27d2e2f9a`
- 状态：P2 候选讲义，不代表跨作者共识或历史考证

## 本集解决的问题

外挑、斜撑和深色木框只是外观词汇；如果没有空间目的和可读承托，它们会退化成重复贴花。本集要求外挑只服务需要扩展的立面，并让高层木构在视觉上表现出传力、收分和稳定基座。

## 可执行流程

1. 先确认室内有效空间，避免框架吞掉小住宅的大部分面积。
2. 标出确实需要上层扩展的临街或目标立面。
3. 只在这些立面将上层框架外推一至两格。
4. 用横架、短撑或尺度足够的斜撑连接外挑与立柱。
5. 检查高层轮廓是否直上直下且缺少下部承托。
6. 对更高住宅增加收分、可读支撑或石质基座。
7. 让屋顶端面和屋脊方向响应下方外挑框架。

## 证据归纳

| 证据 ID | 观察 | 候选规则 |
| --- | --- | --- |
| `ev:bv1wszcyzemq:purposeful-overhang` | 只在目标侧外伸框架，其余立面保持原轮廓 | `rule:medieval.extend-only-needed-facades` |
| `ev:bv1wszcyzemq:visible-load-path` | 直上直下的多层细框被作为不可信反例 | `rule:medieval.show-load-path` |
| `ev:bv1wszcyzemq:roof-frame-alignment` | 屋顶朝向需要与下方横架的承托方向一致 | `rule:medieval.align-roof-with-overhang` |
| `ev:bv1wszcyzemq:stone-base` | 石质基座为高木框提供更稳定的下部重量 | `rule:medieval.use-stone-base-for-height` |

## 给 Agent 的转化

中世纪风格模块不是一组装饰方块，而是一组带前置条件的结构变换。LLM 必须为每次外挑提供 `spatial_reason` 和 `support_strategy`；没有原因时禁止全周外挑。屋顶生成器读取外挑轴向，基座生成器读取总高度和视觉重量。

## 尚未证明

- 本集是作者的风格教学，不等同于现实中世纪建筑史结论。
- 外挑一至两格来自案例语境，尚不能跨尺度泛化。
- 具体活板门、栅栏门等方块名称受 ASR 混淆。
