export function evaluateStage7V3ReviewScope({
  reviewRecord,
  sourceSha256,
  extractorVersion,
  reviewPlanSha256
} = {}) {
  const blockers = [];
  if (!reviewRecord?.dataset_version) {
    blockers.push('v3-semantic-review-unbound');
  } else {
    if (reviewRecord.dataset_version !== 'v3') blockers.push('v3-review-dataset-mismatch');
    if (reviewRecord.source_sha256 !== sourceSha256) blockers.push('v3-review-source-mismatch');
    if (reviewRecord.extractor_version !== extractorVersion) {
      blockers.push('v3-review-extractor-mismatch');
    }
    if (reviewRecord.plan_sha256 !== reviewPlanSha256) blockers.push('v3-review-plan-mismatch');
  }
  const applies = blockers.length === 0;
  const approved = new Set(reviewRecord?.approved_learning_areas || []);
  const blocked = new Set(reviewRecord?.blocked_learning_areas || []);
  const semanticAccepted = applies && ['envelope', 'site', 'space']
    .every((layer) => approved.has(layer) && !blocked.has(layer));
  if (applies && !semanticAccepted) blockers.push('v3-semantic-review-rejected');
  return { applies, semanticAccepted, blockers: blockers.sort() };
}
