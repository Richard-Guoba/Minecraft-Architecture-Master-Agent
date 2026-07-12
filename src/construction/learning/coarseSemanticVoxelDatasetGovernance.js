export const STAGE7_TARGET_LAYERS = Object.freeze(['envelope', 'site', 'space']);

export function evaluateStage7DatasetEligibility({ caseRecord = {}, requestedLayers = STAGE7_TARGET_LAYERS } = {}) {
  const review = caseRecord.review || {};
  const source = caseRecord.source || {};
  const requested = [...new Set((Array.isArray(requestedLayers) ? requestedLayers : []).map(String))].sort();
  const approved = new Set(review.approved_learning_areas || []);
  const blocked = new Set(review.blocked_learning_areas || []);
  const permitted = requested.filter((layer) => !blocked.has(layer) && (review.status === 'approved' || approved.has(layer)));
  const blockers = [];

  if (!['approved', 'limited'].includes(review.status)) blockers.push(`review-status-${review.status || 'missing'}`);
  if (!source.allowed_uses?.includes('local-training') || !['verified', 'restricted'].includes(source.license_status)) {
    blockers.push('license-not-training-approved');
  }
  if (!['north', 'south', 'east', 'west'].includes(review.canonical_front_side)) blockers.push('canonical-front-side-unreviewed');
  for (const layer of requested) {
    if (blocked.has(layer)) blockers.push(`learning-area-${layer}-blocked`);
    else if (!permitted.includes(layer)) blockers.push(`learning-area-${layer}-not-approved`);
  }

  return {
    eligible: blockers.length === 0,
    permitted_layers: permitted.sort(),
    blockers: [...new Set(blockers)].sort()
  };
}
