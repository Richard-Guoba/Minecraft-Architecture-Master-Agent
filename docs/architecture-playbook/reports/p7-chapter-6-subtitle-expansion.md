# P7 第六章字幕知识扩展检查点

状态：第六章 7 个课次已完成字幕优先知识扩展；未声称完成人工视觉证据或规则晋级

## 完成范围与私有证据

`interiors` 的 course order 30–36 已逐集、并发 1 完成媒体和 ASR。每次 ledger 推进前都重新打开并哈希校验精确产物：

| order | BVID | 媒体 bytes / SHA-256 | 字幕段 / 时长 ms / index SHA-256 |
| --- | --- | --- | --- |
| 30 | `BV1DkPVexESz` | 229,835,826 / `0a2f48c4d1b4ba20ef3383ad59ead032d308ea6020881ddeb84360854aaf6047` | 774 / 1,851,884 / `d1d9fd128c756acaf8fface140314a3b1f51d5aa905f644148f0cb69f21627b5` |
| 31 | `BV1ux2sBvECk` | 124,290,572 / `94d2129133e05d2f549703dbad4f761aae73d42b117e2808e2b6c18217527deb` | 411 / 1,079,844 / `b759c70920ffba128385190a23661b735882e43b076d98c570bae67228a75257` |
| 32 | `BV1VULRzAE3x` | 32,421,109 / `36661e85e5c158aa45dd8c4f4c6aab13f77f7dc891aaa3471ac6981887e86252` | 255 / 554,260 / `702269bfc16551b4819bb6bb2f9e25c461512d0452638a8316e78fe75dd80094` |
| 33 | `BV1Rf7nz5Eic` | 95,413,024 / `336204bbf5695d8b6a401ad7dee906f4f444af811e7be699e2f5b4445b58e855` | 870 / 1,621,357 / `73360761107f50b0298d69a49140dc58f379d9fc1dd978add8efa14fa098e5dd` |
| 34 | `BV1tepJz3EuZ` | 91,914,812 / `a91dc5f75ca749a786e0397873db599fa951e2b6d08524a245090b736dbb071f` | 623 / 1,037,444 / `6400c646c2171b28dee47b797f8b4fb48b4113b0ab43e33d408cb6b32e693291` |
| 35 | `BV1TUHHz1ECZ` | 90,236,839 / `4fa976d311d2f421fe7d706a043ff9b48446df99f60cfa3fb34592a52ecf7227` | 386 / 796,212 / `bd8538f0f69efdcfa07be387f9a12d6ea9a80b49e0825dd6dff8d847ad05e395` |
| 36 | `BV1YNLnzeEx3` | 126,200,814 / `36a4f3615d496b8bccdedbab16c7fdaebafbb382846adeb86d68a88228b025f9` | 775 / 2,144,038 / `a9dfe37bfaf744a059f2ed9707a201a91a47f17691211efac181ebc6be18f568` |

七集 ledger 均为 `pending → media-verified → asr-complete`，合计 4,094 个字幕段。媒体、完整字幕和 ledger 只保存在忽略的 `.local/architecture-playbook/`。正式 `events-indexed` 需要人工审核的教学事件索引，本轮没有推进。

## 原创知识产物

七份[来源讲义](../course/notes/heihui-jileniao/)把完整字幕分别转换为室内分区、可达性与采光、小构件、灯、椅、桌和洞穴住宅语言。Axiom、材质包、调试棒、冻结更新、隐形实体、强制摆放和光影表现均未进入便携生成依赖。

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md)加入对应建筑语言。聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定 6 个章节、31 个有效来源和 87 条有界意图；本章新增 18 条。规范内容 SHA-256 固定为 `886114bf308d600d1ee5edd351b3b28dfab7f912d7dab6816bda30efcf8fd9dd`。

这些内容仍是 `intent-guidance-only-not-reviewed-rules`：不能进入 `rule:` ID，不能改写冻结六集 v0.1 规则，不能改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第六章字幕优先范围已完成。下一个尚未学习的是第七章 course order 37 `【进阶1】做旧`：

```bash
npm run playbook:evidence -- media --bvid BV1JcQ3YYEg5
```
