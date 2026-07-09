const FUSION_VERSION = 1;
const COMPATIBLE_ADOPTIONS = [
  ['site.outdoor_seating', 'outdoor seating'],
  ['interior.display_strategy', 'interior display strategy'],
  ['site.patio', 'patio'],
  ['site.planting_beds', 'planting beds'],
  ['interior.decor_density', 'interior density'],
  ['facade.entry_detail_style', 'entry detail']
];
const COMPATIBLE_REFINEMENTS = [
  ['interior.display_strategy', 'interior display strategy'],
  ['facade.entry_detail_style', 'entry detail'],
  ['interior.decor_density', 'interior density']
];
const CONFLICT_FIELDS = [
  'massing_variant',
  'roof.style',
  'roof.profile',
  'topology.public_core',
  'topology.split_strategy'
];

export class ConceptFusionAgent {
  run(concepts = [], selection = {}, options = {}) {
    const rankedIds = (selection.ranking || [])
      .sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0))
      .map((item) => item.concept_id);
    if (rankedIds.length < 2) {
      return {
        source: 'local-concept-fusion-agent',
        version: FUSION_VERSION,
        active: false,
        reason: 'fusion requires at least two ranked concepts'
      };
    }
    const base = concepts.find((item) => item.id === (selection.selected_concept_id || rankedIds[0]));
    const donor = concepts.find((item) => item.id === rankedIds.find((id) => id !== base?.id));
    if (!base || !donor) {
      return {
        source: 'local-concept-fusion-agent',
        version: FUSION_VERSION,
        active: false,
        reason: 'fusion could not resolve base and donor concepts'
      };
    }
    const basePatch = clone(base.creative_design_patch || {});
    const donorPatch = donor.creative_design_patch || {};
    const adopted_elements = [];
    const rejected_conflicts = [];
    for (const field of CONFLICT_FIELDS) {
      const baseValue = getPath(basePatch, field);
      const donorValue = getPath(donorPatch, field);
      if (donorValue !== undefined && baseValue !== undefined && String(baseValue) !== String(donorValue)) {
        rejected_conflicts.push({ field, base: baseValue, donor: donorValue, reason: 'conflicting core concept directive' });
      }
    }
    for (const [field, label] of COMPATIBLE_ADOPTIONS) {
      if (adopted_elements.length >= 2) break;
      const baseValue = getPath(basePatch, field);
      const donorValue = getPath(donorPatch, field);
      if (donorValue === undefined || baseValue !== undefined) continue;
      setPath(basePatch, field, donorValue);
      adopted_elements.push({ field, label, value: donorValue, from: donor.id });
    }
    if (!adopted_elements.length) {
      for (const [field, label] of COMPATIBLE_REFINEMENTS) {
        const baseValue = getPath(basePatch, field);
        const donorValue = getPath(donorPatch, field);
        if (donorValue === undefined || baseValue === undefined || sameValue(baseValue, donorValue)) continue;
        setPath(basePatch, field, donorValue);
        adopted_elements.push({ field, label, value: donorValue, previous: baseValue, from: donor.id, mode: 'refinement' });
        break;
      }
    }
    const concept = {
      ...base,
      id: `concept-fused-${base.id}`,
      title: `${base.title} + 局部融合`,
      archetype: `${base.archetype}-fused`,
      summary: `${base.summary} 融合 ${donor.title} 的兼容细节。`,
      source_concept_ids: [base.id, donor.id],
      adopted_elements,
      rejected_conflicts,
      creative_design_patch: basePatch,
      quality_targets: [...new Set([...(base.quality_targets || []), ...(donor.quality_targets || []).slice(0, 2)])],
      risks: [...(base.risks || []), ...(donor.risks || []).slice(0, 1)]
    };
    return {
      source: 'local-concept-fusion-agent',
      version: FUSION_VERSION,
      active: true,
      strategy: 'top-concept-with-compatible-adoptions',
      base_concept_id: base.id,
      donor_concept_id: donor.id,
      concept,
      adopted_elements,
      rejected_conflicts,
      warnings: adopted_elements.length ? [] : ['no compatible donor fields were adopted']
    };
  }
}

function getPath(object, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], object);
}

function setPath(object, path, value) {
  const keys = String(path).split('.');
  let current = object;
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
