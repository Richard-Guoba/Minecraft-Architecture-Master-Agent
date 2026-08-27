# P5 可执行设计层门禁报告

P5 已实现一个 opt-in、default-off 的最小确定性控制循环。默认 `npm start` 仍使用 `playbook=off`；手动 mock 测试命令是：

```bash
npm run playbook:execute -- --mode mock --seed 424242 "Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base"
```

## 可执行边界

每次 execute 运行固定生成三个候选，并为 `brief`、`massing`、`structure`、`roof`、`facade` 保存五层不可变 checkpoint。每个候选最多消耗一次原子修复预算。硬 QA、P4 确定性资格审查和原有候选排序器是三个独立权威。

四个可执行操作是：

1. `repair:massing:resize-or-reposition-volume`
2. `repair:massing:strengthen-primary-volume`
3. `repair:massing:reduce-support-volume-prominence`
4. `repair:structure:connect-support-path`

以下十一条核心规则仍为 evidence-required，不能生成补丁：

- `rule:structure.layer-volumes-to-reduce-blankness`
- `rule:roof.border-with-material-contrast`
- `rule:roof.scale-slope-to-massing`
- `rule:roof.break-large-flat-plane`
- `rule:facade.frame-before-openings`
- `rule:facade.offset-frame-for-depth`
- `rule:facade.partition-large-wall`
- `rule:facade.break-repetitive-bays`
- `rule:medieval.extend-only-needed-facades`
- `rule:medieval.align-roof-with-overhang`
- `rule:medieval.use-stone-base-for-height`

六条案例模式是中立、非权威资料；它们不决定资格、补丁或排序。

## 接受证据

检查入库的 positive、repairable 和 no-eligible mock 输入。正例生成三棵五层证据树；repairable 场景只重放 massing 及其下游 structure/roof/facade，并保留 brief 字节；no-eligible 场景保留三个经过净化的失败树、不发布 selection、也不调用安装器。相同输入、seed 与补丁的 checkpoint chain 字节可重复。回滚和 fault-injection 门禁证明失败不会替换先前 current chain；repair/replay 不创建 provider client。

依赖门禁复用 P4 已审阅的 ESM 解析与 fail-closed 规则，拒绝 computed import、`createRequire`、未解析边、symlink/realpath 逃逸和动态禁止边。P4 的独立边界仍然禁止 construction、pipeline、world 和 datapack I/O。P3 手动门禁保持 21 条审阅规则、15 条核心程序、6 条案例模式、5 个受管产物和零 drift。

## 新鲜门禁结果

- 实施范围：Task 9 审阅基线 `e50195302990a860218c88ae28f73253e1a56636` 到本 Task 10 `feat(playbook): complete P5 executable design layer` 提交。
- P5 精确门禁：367/367（合同、off 兼容、设计层、checkpoint、存储、资格、四类 repair、replay、orchestrator、真实 CLI、依赖和三场景 acceptance）。
- P4 精确兼容门禁：201/201。
- 完整仓库回归：1415/1415，退出码 0。
- P3：21 条审阅规则、15 条核心程序、6 条案例模式、5 个受管产物、0 managed drift。
- 依赖：P5 与 P4 violation/unresolved 均为 0；P5 资格模块也不依赖 construction/pipeline/world/datapack I/O。
- 卫生：`git diff --check` 为 0，`git ls-files out .local/architecture-playbook` 为空。

入库 fixture SHA-256：positive `1e9e3808ca0e085d0c49e1b4870840be55a7e6eb6ffaf04d9942bd19750cf754`；repairable `bf244a5527a1237f555c2fbc1bd3b9956d7a80934ec47e63f393e91e61af10f7`；no-eligible `c3d12c9f564e2848b441df1ceb9afe55320765d88eff803977565f69d67df0e1`。

positive mock 固定 seed 的三条 current-chain SHA-256 分别为 candidate-01 `980c6044fd42c793c63a16f7fa1e7fb983286a4a7b1136eab721944419548cc2`、candidate-02 `733d8f70d758ed785339e38e6363ea92bab062dd02ab9c171ca52e92d244c4e5`、candidate-03 `33dc155c142014ddfe045748fe66412efcb029d5819c4738124f46c22b88d514`；独立根复跑得到完全相同的 current-chain 字节。replay 门禁还重新计算并比对 operation list、build function 和完整 datapack tree 哈希，且 fault matrix 保留旧 pointer 字节与 inode。

## 声明限制

P5 creates no playbook score（没有秘籍评分）。资格不是审美评分，三个生成候选不证明质量或审美改善。P5 没有固定视角渲染、视觉模型或人工盲选；这些仍属于未开放的 P6。真实 `out/`、`.local/`、checkpoint、provider transcript、生成数据包和世界产物保持忽略且不得跟踪。
