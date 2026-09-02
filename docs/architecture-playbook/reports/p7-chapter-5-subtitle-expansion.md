# P7 第五章字幕知识扩展检查点

状态：第五章 9 个课次已完成字幕优先知识扩展；未声称完成人工视觉证据或规则晋级

## 完成范围与私有证据

`landscaping-terrain` 的 course order 21–29 已逐集、并发 1 完成媒体和 ASR。每次 ledger 推进前都重新打开并哈希校验精确产物：

| order | BVID | 媒体 bytes / SHA-256 | 字幕段 / 时长 ms / index SHA-256 |
| --- | --- | --- | --- |
| 21 | `BV1HRVnzVEFa` | 50,397,253 / `854b7f961478ab797291a1d85defcc33a3df605e8bf8384746bd9b8de881b334` | 412 / 841,212 / `abeb673c00b8cfb189da319a31763feb349536dfb87c4202047939368a4e63f6` |
| 22 | `BV1rx6yYNEYr` | 119,281,282 / `9b417b855374e6237cf66acc90c5de00a0d702eef545067c5cae8da6f36e6570` | 564 / 1,986,885 / `7a6daf748f1650b289d79290384389708d10cfbd44353c29c70352811c42bacc` |
| 23 | `BV1KN91Y1ELG` | 77,787,706 / `9521d6d87df9baf08ba0c2c2269ffeb621395b8841a553e1e336ad4f2bfd6600` | 423 / 1,436,712 / `691a44e292f86728806ea95cba1dfeb7d05fb5c0db33d687f639cfcc3c75e7e3` |
| 24 | `BV1xtXKYYEF2` | 87,826,620 / `fb05d6199028309ce765e61add2670035d94fa9569c3110e65087d63003887ce` | 316 / 797,931 / `6ebcd0b29d7a7e7c7ffdae29b2bb5d2d75e1c40b7ed51cc754016e02fece6b5c` |
| 25 | `BV1Hy5pzQE5n` | 52,545,825 / `c28648d177c574048b1b872ea5431303dce801394aaa203cfe32e9ca26515767` | 348 / 881,337 / `658107731f6e64a7d16cef6b9ab56bfe4ed80e280739fc61ed990a778e318359` |
| 26 | `BV1oFJPzqE9k` | 51,659,890 / `30f15e4874b9904d0c267fa9c775b54c3664d57f8a65abf69ce3b3d49a3b4b05` | 445 / 884,123 / `05b2d6c0b126714431cee44746c0d4070cba779e7cda6841f1a6bd953dc8bb00` |
| 27 | `BV1i2JBzPE8m` | 75,169,029 / `980967fccdd37b6a6f189f2a89eb5906ad27689e642891fdf0740a1a4bd7e0ba` | 426 / 738,395 / `d46ff64fcc946a184242ced78278df80fdf2152b1a6b23d9a4248ca4a611a0ad` |
| 28 | `BV1Cm7VzzEXd` | 39,438,116 / `3fe4f0fc90939eba6c640ec4832900d87775f969aa977c5e24659eac48043741` | 284 / 666,831 / `785cc2c4366e3be0177700cf4fa8eda7a83b1f4ca84b6f6f2774e2a36109e610` |
| 29 | `BV1a5TDzhE9M` | 48,969,914 / `bf320aef87845fb035b6382fc113df6e8ebef20a50b1fa67e347524f6c610766` | 366 / 824,773 / `3981c3d1a3b41378fb5e6e938532eb3e0572d6cd4cebbf808376dfb281a06516` |

九集 ledger 均为 `pending → media-verified → asr-complete`，合计 3,584 个字幕段。媒体、完整字幕和 ledger 只保存在忽略的 `.local/architecture-playbook/`。正式 `events-indexed` 需要人工审核的教学事件索引，本轮没有推进。

## 原创知识产物

九份[来源讲义](../course/notes/heihui-jileniao/)把完整字幕分别转换为路径和物件组、交通磨损道路、树木枝冠、桥梁净空与支撑、水层与岸线、非直角地形地基、房屋间纵深、山谷道路地块和海滩功能分区。Axiom、材质包、冻结更新、调试棒、特殊摆放和现实工程参数均未进入便携生成依赖。

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md)加入对应建筑语言。聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定 5 个章节、24 个有效来源和 69 条有界意图；本章新增 27 条。规范内容 SHA-256 固定为 `b468c71273bac643f4a83425defe13391bbb7143b9a188e95d719c036b94082f`。

这些内容仍是 `intent-guidance-only-not-reviewed-rules`：不能进入 `rule:` ID，不能改写冻结六集 v0.1 规则，不能改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 下一步

第五章字幕优先范围已完成。下一个尚未学习的是第六章 course order 30 `5.1 内饰概述`：

```bash
npm run playbook:evidence -- media --bvid BV1DkPVexESz
```
