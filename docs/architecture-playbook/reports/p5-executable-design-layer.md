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

检查入库的 positive、repairable 和 no-eligible mock 输入。正例生成三个全部 eligible、零修复的五层证据树；repairable 场景只重放 massing 及其下游 structure/roof/facade，并保留 brief 字节；no-eligible 场景让三个候选各执行一次真实修复/replay 后仍保留 unresolved current chain，不发布 selection，也不调用安装器。相同输入、seed 与补丁的 repair evidence、checkpoint chain、blueprint、operation list、build function 和 datapack tree 字节可重复。注入的真实 replay 故障证明先前 current-chain 的字节、哈希与 inode，以及无关 output/world 字节全部不变；failure evidence 只含固定代码和权威哈希。repair/replay 不创建 provider client。

依赖门禁复用 P4 已审阅的 ESM 解析与 fail-closed 规则，拒绝 computed import、`createRequire`、未解析边、symlink/realpath 逃逸和动态禁止边。P4 的独立边界仍然禁止 construction、pipeline、world 和 datapack I/O。P3 手动门禁保持 21 条审阅规则、15 条核心程序、6 条案例模式、5 个受管产物和零 drift。

## 新鲜门禁结果

- 实施范围：Task 9 审阅基线 `e50195302990a860218c88ae28f73253e1a56636` 到本 Task 10 `feat(playbook): complete P5 executable design layer` 提交。
- P5 精确门禁：388/388（合同、off 兼容、设计层、checkpoint、存储、资格、四类 repair、replay、orchestrator、真实 CLI、依赖和三场景 acceptance）。
- P4 精确兼容门禁：201/201。
- 完整仓库回归：1436/1436，退出码 0。
- P3：21 条审阅规则、15 条核心程序、6 条案例模式、5 个受管产物、0 managed drift。
- 依赖：P5 与 P4 violation/unresolved 均为 0；P5 资格模块也不依赖 construction/pipeline/world/datapack I/O。
- 卫生：`git diff --check` 为 0，`git ls-files out .local/architecture-playbook` 为空。

入库 fixture SHA-256：positive `1e9e3808ca0e085d0c49e1b4870840be55a7e6eb6ffaf04d9942bd19750cf754`；repairable `bf244a5527a1237f555c2fbc1bd3b9956d7a80934ec47e63f393e91e61af10f7`；no-eligible `c3d12c9f564e2848b441df1ceb9afe55320765d88eff803977565f69d67df0e1`。

受控 positive mock 固定 seed 的三条 current-chain SHA-256 分别为 candidate-01 `ba73a2a9bfe9840ed4ecc5684e2205295e02ba9c9771bd4d12ba2b524c95caec`、candidate-02 `f3500397ac411793ddfadce332685b98c4234593fb93fc7734fea253b2d1883f`、candidate-03 `33dc155c142014ddfe045748fe66412efcb029d5819c4738124f46c22b88d514`。repairable candidate-02 replay chain 为 `49acb9bdd03880edb586d457f6b588b4e8adb05368bf2c4a5800107a789d5a22`；request/patch/result 分别为 `72e50cb91a0645922cdc070f1d66180d46d924474c664ee6f644a32ec56de0f0`、`65af7380ec3c240727bcfa834baaf09012db174aa43414d2c253218ad7fbe8f6`、`1c580065b16bf31261310d73c7ce4975df28daedda3fbc91d39f046463916b88`。重新生成的 blueprint、operation list、build function、datapack tree 哈希依次为 `4fe0850b6995e9f53af0e9fc4e92df188cd371569cef7fa34f62b180f3283f3d`、`5bac276192ba6650b67f9e25f0a26d00911ef463f527e59d0211f68b0f9511c4`、`110578a4f609391adb4b76c97b658ccfcdd458529bd60b686915caaa37e5a673`、`5ffc5a9637427611f0c4421d3a615950ea730fdbb0d8861a59cca1b5cb967b16`，与持久化 Task 8 权威完全相同，且独立根复跑字节相同。

## 声明限制

P5 creates no playbook score（没有秘籍评分）。资格不是审美评分，三个生成候选不证明质量或审美改善。P5 没有固定视角渲染、视觉模型或人工盲选；这些仍属于未开放的 P6。真实 `out/`、`.local/`、checkpoint、provider transcript、生成数据包和世界产物保持忽略且不得跟踪。
