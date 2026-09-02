# P7 第八章及全课程字幕知识扩展报告

状态：第八章 8 个课次已完成字幕优先覆盖；未声称完成人工视觉证据或规则晋级

## 完成范围与私有证据

`style-specialist-cases` 的 course order 43–50 已逐集、并发 1 完成或复用媒体和 ASR。order 44、45 是既有六集黄金语料，只重开并哈希验证原产物；其余 6 个新课次顺序处理。每次 ledger 推进前都重新打开并校验精确产物：

| order | BVID | 媒体 bytes / SHA-256 | 字幕段 / 时长 ms / index SHA-256 | 处理 |
| --- | --- | --- | --- | --- |
| 43 | `BV1K1oXYGEm2` | 21,612,563 / `c71ea97fe353d5420c1c540f011a646beb2df74b9c18b5c744950a2b3d0c0d3a` | 133 / 331,720 / `6ad27030754f806afd7d2bfc6719bcee49bd31fc0e621353787d8ef28b169e25` | 新 |
| 44 | `BV1WsZcYZEMQ` | 99,081,001 / `f2b12e6a4087c8e4cc6ee924288c7a4f9d9da5f54a78c29176bd99946ca65595` | 332 / 1,072,808 / `2df510a79bde133246db89044fdf813ee07e070057276ea27de5fa1a78f93991` | 黄金复用 |
| 45 | `BV1jbdUYCEjG` | 234,780,655 / `f4489bbf1543de0771cd6fe713c2009edfa97a7cad719ea4d0cb61bf458ee2fa` | 84 / 2,633,654 / `791e6035a153bf508ff30bde0a1c793ca1b819bd0de6f1f5aca41c149d6571f5` | 黄金复用 |
| 46 | `BV1bWX6YPEsG` | 96,722,353 / `795eaeaac19ab418be0b94fdd3ede09c1cda7dadbb9e2ab6db5b08a4b39ab1c2` | 378 / 801,042 / `90121ee763dc33b38830f7ed46d8a0ca596acb975ec10a6a396d55ea365771bb` | 新 |
| 47 | `BV1JT5ez2EjF` | 102,441,483 / `7ab8787023f1e4fdadbabcc965c64ba37daf6788ee1e6445e72b6fa9376755a8` | 395 / 933,071 / `d3dd8ffd3c5789b68055d3fbe902a1d590f30f0ddd67c4345fb3b829fd628ab0` | 新 |
| 48 | `BV1267wzyErC` | 58,576,426 / `f51da3707b97c98a1486bfe5c743e8bf14cdbe67e98b417bdcbc9628baef5071` | 441 / 997,529 / `5fa4476d5f6bbfe7a85ebec16da475f3b79b72670c2f2f14a8b6489938ab64c1` | 新 |
| 49 | `BV1ifomBqEJJ` | 27,432,235 / `50c0bbee75d68c03b1d6580a775464fb7a0774650819be497371b65d9882f73b` | 203 / 504,848 / `5b82de9db1a6ac2f87a0326bf850a939a278766f87dfd5a6f32a1b53a84d90d4` | 新 |
| 50 | `BV1SN9xBWEmF` | 69,714,836 / `17a825bf54f8c603bb02b27336bf0185f369948e7f533de44a04759bc25c5e2e` | 335 / 827,652 / `6ec34fc39b0609b05366a4fd6f22b98c1e5d2ff90aef89bc7ab3ba6f7d06e96d` | 新 |

八集 ledger 均到 `asr-complete`，合计 2,301 个字幕段；6 个新课次合计 1,885 个字幕段。媒体、完整字幕和 ledger 只保存在忽略的本地工作区。正式 `events-indexed` 需要人工审核的教学事件索引，本轮没有推进。

## 原创知识产物与黄金边界

六份新增[来源讲义](../course/notes/heihui-jileniao/)把完整字幕转换为风格方法边界、防御台地与城堡网络、塔楼/城墙构件、现代体块、变化斜率圆形和逐圈尖顶语言。order 44、45 保持既有 EvidenceNote、候选规则和审阅规则，不复制、不改写，也不把其规则权限降级到 subtitle advisory。

[P7 知识扩展 v0.2](../manual/p7-expansion-v0.2.md)加入对应建筑语言。聚合的 [`p7-advisory-v0.2.json`](../rules/schools/heihui-jileniao/p7-advisory-v0.2.json) 现在精确限定 8 个章节、43 个有效来源和 123 条有界意图；本章新增 18 条，两个黄金来源仍由冻结 v0.1 语料单独授权。规范内容 SHA-256 固定为 `98a09b14c5a29fc76b93f61be016b82edb4a9a8c94cdcf76777533f0c1631c35`。

全 50 集现已具备字幕优先覆盖：六集黄金行为保持不变，44 个非黄金课次中一集没有可用教学叙述，其余 43 集形成有来源的 P7 advisory。所有新内容仍是 `intent-guidance-only-not-reviewed-rules`，不能进入 `rule:` ID，不能改变 mock、`playbook=off` 或相对坐标 `architect_datapack/` 编译。

## 人工边界与下一步

字幕知识扩展已经完成。形式台账仍诚实停在 `asr-complete`；若要推进任一课次，下一步必须由人审阅教学事件索引，随后才可进入视觉证据、证据包、笔记审阅和规则审阅。查询命令为：

```bash
npm run playbook:chapter -- next --chapter style-specialist-cases
```

知识生成产品本身不需要等待这项可选 QA：它继续输出便携相对坐标 `architect_datapack/`，由玩家在自己选择的世界和原点运行 `/reload` 与 `/function architect:run`。
