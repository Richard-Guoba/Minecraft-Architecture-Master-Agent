# 建筑教程资源登记册

## 1. 登记册用途与非目标

本登记册是外部 Minecraft 建筑教程来源进入项目之前的隔离入口。它记录来源身份、代表性探针、访问观察、权利观察、知识价值和风险，使来源能够被比较、复核和追溯。

登记不等于抓取、下载、训练、再发布或接入建造运行时。第一版也不建立课程、学派或跨来源规则，不开发站点适配器，不把来源内容写入现有课程与规则流程。

## 2. 目录结构与每站隔离

`catalog.json` 是全局最小索引，`schemas/` 发布四份公共合同。每个来源只在 `sources/<source-id>/` 内维护自己的 `source.json`、`probes/*.json` 和 `assessment.md`；未来若有项目所有者决定，再在同一来源目录内追加 `decisions/*.json`。一个来源的探针、评估和决定不得引用另一个来源的站点特有数据。

## 3. platform、publisher、creator、course、school 与 content-unit 边界

- `platform` 是托管或组织多项内容的网站。
- `publisher` 是发布或维护内容的组织。
- `creator` 是单个建筑、视频或教程的创作者；未知时保持未知。
- `course` 是具有明确顺序和教学目标的一组内容。
- `school` 是经过明确设计与审核的作者教学体系，不能由平台或多作者网站自动推定。
- `content-unit` 是单个页面、建筑、视频、章节或步骤，也是单个探针观察的对象。

登记阶段不创建 `school_id`，也不把集体编辑来源伪装成单一作者观点。

## 4. 生命周期

来源按 `registered -> probing -> assessed -> owner decision` 前进：登记后选择代表性样本，只读探针完成后形成评估，随后等待项目所有者决定。最后一步才可能把生命周期写为 `approved-for-intake`、`deferred` 或 `rejected`；访问失败与生命周期状态彼此独立。

## 5. 五种 observation basis

- `direct-page`：实际直接看到的页面或列表内容。
- `site-claim`：网站对自身能力或内容的声明。
- `search-index`：搜索索引或缓存摘要提供的有限观察。
- `project-inference`：本项目基于已有观察作出的明确推断。
- `unverified`：尚未得到稳定核验的信息。

搜索摘要不能标成 `direct-page`，站点声明也不能提升为单个内容单位的事实。

## 6. access 与 rights 的独立维度

access 描述技术上是否可访问、是否需要登录、是否依赖客户端渲染以及 API 或制品入口是否可用。rights 分别记录公开访问、本地分析、自动检索、制品下载、模型训练和外部再发布的证据状态。公开、免费、可浏览或可导出都不能自动推出下载、训练、批量检索或再发布权利。

## 7. 新来源的 3–5 探针登记步骤

1. 规范化来源 URL 与主机名，并在 catalog 和备用 URL 中去重。
2. 创建或更新来源 profile，分别记录身份、访问、权利与风险。
3. 按内容差异选择 3–5 个代表性 content-unit，不用样本数量冒充整站质量。
4. 对每个样本执行不绕过登录、robots 或反自动化限制的只读探针，保存原创短摘要与结构化观察。
5. 汇总 assessment、绑定探针集合和 Markdown 原始字节哈希，由 AI 给出建议后停止并等待项目所有者决定。

## 8. project-owner 晋级门

AI 只能给出 `recommend-approve`、`recommend-defer` 或 `recommend-reject`。只有 `project-owner` 能写 promotion decision；决定必须绑定当前 assessment 路径、精确 SHA-256 和探针集合。即使决定为 `approved-for-intake`，仍需另行设计站点适配器，并不自动取得下载、训练或发布权限，也不自动成为课程、规则或学派。

## 9. 公开目录与本地私有空间边界

公开的 `docs/architecture-playbook/resources/` 只提交严格 JSON 合同、来源 profile、探针报告、原创 assessment 和决定记录。若只读探针确有临时响应或中间物，只能放在受忽略规则保护的 `.local/architecture-playbook/resources/<source-id>/` 来源子目录中；私有文件不得被 catalog、profile、probe 或 assessment 以具体路径引用，第一版也不创建任何本地副本。

## 10. 第一批 assessed 来源

第一版登记 `mcblock` 与 `zh-minecraft-wiki`，各有五个只读探针，均停在 `assessed`，没有 promotion decision。两份 assessment 都给出 `recommend-defer`：这表示资料价值已可评价，但稳定访问、权利或来源信息仍不足以启动站点处理器；它不等于拒绝来源，也不表示来源对人工浏览不可用。
