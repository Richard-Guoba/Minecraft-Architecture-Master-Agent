# P7 第七章字幕知识扩展检查点

状态：第七章 6 个课次已完成字幕优先知识扩展；未声称完成人工视觉证据或规则晋级

## 完成范围与私有证据

`advanced-architecture` 的 course order 37–42 已逐集、并发 1 完成媒体和 ASR。每次 ledger 推进前都重新打开并哈希校验精确产物：

| order | BVID | 媒体 bytes / SHA-256 | 字幕段 / 时长 ms / index SHA-256 |
| --- | --- | --- | --- |
| 37 | `BV1JcQ3YYEg5` | 98,924,190 / `d0e5cc452dcccc7595a80aafee87b23934cec648c0a77743ba66c15c53a545b3` | 294 / 779,122 / `daf79eb2e15bd779fc8f2bb62fe3d5a1700c0e7fa81606dcb02bf5e0c8d16528` |
| 38 | `BV1j7QSYKEHA` | 137,208,897 / `d2dfaf5bff1694e3609af2ae47dbf6c47ac4fb26bfaea21ce11342e83c226369` | 426 / 1,177,391 / `24e07d973f92aa629d68c58912afb059aaaadc2260e6c6abc7fc5a983e3085a6` |
| 39 | `BV1yHEtz2EJh` | 52,325,934 / `0f3b79f7ca030a997c4181bb13482c368eecc40d1e302098eecc963a25fd33a9` | 390 / 874,789 / `43a33e4ed76f6e49662f47961582ef1ba9a98bfc3d9b75eeb3155dfec7653403` |
| 40 | `BV1SNdSBtErf` | 103,032,793 / `dd1535997cbc683d01b14854faed0f020808dfbd1873776c1b9dc17c0a4a9bd1` | 484 / 1,113,211 / `2cac1343305b1c1abe3720dd865c0abce5db93f9e6b7af2cfde2234bd4c8c4cc` |
| 41 | `BV1LxjEzKEH7` | 50,130,055 / `ad12711536f50c8da987615dc116ea8f283827e4d03b4fe443ff317efe4bd052` | 367 / 857,977 / `281b897b5e247490fbec888389d023bd818cba7488c168139d4d685b07e35f5c` |
| 42 | `BV17QjvzpEuA` | 60,692,503 / `a082ced45cdc52a3257ff91cd5f335fa54e95f8decaab7b8e6fda8a1096caa6f` | 465 / 1,024,372 / `86e433dd37a7685ef8fa67264362e4ab9a7c71999f44e4578cffdea7a6e36461` |

六集 ledger 均为 `pending → media-verified → asr-complete`，合计 2,426 个字幕段。媒体、完整字幕和 ledger 只保存在忽略的本地工作区。正式 `events-indexed` 需要人工审核的教学事件索引，本轮没有推进。

## 原创知识产物

六份[来源讲义](../course/notes/heihui-jileniao/)把完整字幕分别转换为有界做旧、大型体块与单位墙、道路与地标、观察路径与前景、重复编排、斜向局部坐标语言。Axiom、WorldEdit、特殊方块状态、材质和光影表现均未进入便携生成依赖。

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md)加入对应建筑语言。聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定 7 个章节、37 个有效来源和 105 条有界意图；本章新增 18 条。规范内容 SHA-256 固定为 `3838f55384a6c23ea4eb946a5b26b77e43ac83e6e604b994826fb677420fb0b3`。

这些内容仍是 `intent-guidance-only-not-reviewed-rules`：不能进入 `rule:` ID，不能改写冻结六集 v0.1 规则，不能改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第七章字幕优先范围已完成。下一个尚未学习的是第八章 course order 43 `【中世纪0】导论`：

```bash
npm run playbook:evidence -- media --bvid BV1K1oXYGEm2
```
