import { EVALUATED_LAYERS, LAYER_ORDER } from './constants.js';
import { validateExplanation, validateReview } from './contracts.js';

export function renderShadowReport({ review, explanation } = {}) {
  const authoritativeReview = validateReview(review);
  const authoritativeExplanation = validateExplanation(explanation, authoritativeReview);

  return [
    '# 建筑秘籍 P4 影子审查',
    '',
    '## 边界声明',
    '',
    '- 本次审查只读取结构化 `blueprint.json`，没有视觉输入。',
    '- 本次工具没有修改建筑、生成命令、预览、世界或数据包。',
    '- 状态是候选建议的结构化审查，不是审美分数，也不是质量提升证据。',
    '',
    '## 输入身份',
    '',
    '| 项目 | 值 |',
    '| --- | --- |',
    `| 输入路径 | \`${authoritativeReview.input.blueprint_path}\` |`,
    `| 输入 SHA-256 | \`${authoritativeReview.input.blueprint_sha256}\` |`,
    `| 规则语料 SHA-256 | \`${authoritativeReview.rule_corpus_sha256}\` |`,
    `| 评估器版本 | \`${authoritativeReview.evaluator_version}\` |`,
    '',
    '## 九层覆盖',
    '',
    '| 层 | 覆盖状态 | 规则数 |',
    '| --- | --- | ---: |',
    ...authoritativeReview.coverage.map((item) => (
      `| \`${item.layer}\` | \`${item.status}\` | ${item.rule_ids.length} |`
    )),
    '',
    '## 分层结论',
    '',
    '| 层 | 状态计数 | 覆盖状态 |',
    '| --- | --- | --- |',
    ...LAYER_ORDER.map((layer) => layerConclusion(layer, authoritativeReview)),
    '',
    '## 逐规则记录',
    '',
    '| 规则 | 层 | 状态 | 证据与观察 | 修复操作 |',
    '| --- | --- | --- | --- | --- |',
    ...authoritativeReview.assessments.map(ruleRow),
    '',
    '## 缺失证据',
    '',
    ...missingEvidenceLines(authoritativeReview),
    '',
    '## 解释状态',
    '',
    `- 模式：\`${authoritativeExplanation.mode}\``,
    `- 状态：\`${authoritativeExplanation.status}\``,
    `- 错误代码：\`${authoritativeExplanation.error_code ?? 'none'}\``,
    ''
  ].join('\n');
}

function layerConclusion(layer, review) {
  const counts = review.summary.layer_status_counts.find((item) => item.layer === layer);
  const coverage = review.coverage.find((item) => item.layer === layer);
  const conclusion = EVALUATED_LAYERS.includes(layer) ? coverage.status : '未覆盖';
  return `| \`${layer}\` | ${formatCounts(counts)} | \`${conclusion}\` |`;
}

function ruleRow(assessment) {
  const evidence = [
    ...assessment.evidence_json_pointers.map((item) => `证据 ${item}`),
    ...assessment.observations,
    ...assessment.missing_signals.map((item) => `缺失 ${item}`),
    ...assessment.unknown_ids
  ];
  return [
    `| \`${assessment.rule_id}\``,
    `\`${assessment.design_layer}\``,
    `\`${assessment.status}\``,
    escapeMarkdownCell(evidence.join('；') || '无'),
    assessment.repair_operation_id === null ? '无' : `\`${assessment.repair_operation_id}\``
  ].join(' | ') + ' |';
}

function missingEvidenceLines(review) {
  const lines = review.assessments
    .filter((assessment) => assessment.status === 'unknown')
    .map((assessment) => {
      const signals = [...assessment.missing_signals, ...assessment.unknown_ids];
      return `- \`${assessment.rule_id}\`：${escapeMarkdownCell(signals.join('；'))}`;
    });
  return lines.length > 0 ? lines : ['- 无。'];
}

function formatCounts(counts) {
  return ['satisfied', 'violated', 'unknown', 'not-applicable']
    .map((status) => `${status}: ${counts[status]}`)
    .join('；');
}

function escapeMarkdownCell(value) {
  return String(value)
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_{}\[\]<>()[\]#+.!|])/gu, '\\$1')
    .replace(/\r\n|\r|\n/gu, '<br>');
}
