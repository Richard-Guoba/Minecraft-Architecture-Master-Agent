import test from 'node:test';
import assert from 'node:assert/strict';
import { ConceptFusionAgent } from '../src/construction/agents/conceptFusionAgent.js';

test('ConceptFusionAgent conservatively adopts compatible strengths', () => {
  const base = concept('concept-a-view-courtyard', {
    facade: { glazing_ratio: 'high', window_rhythm: 'corner-window-bands' },
    roof: { style: 'flat', profile: 'thin-parapet-terrace', roof_terrace: true },
    site: { mood: 'reflecting-water-edge', water_feature: true },
    interior: { decor_density: 'layered' },
    topology: { public_core: 'living', split_strategy: 'open-plan-weighted' }
  });
  const donor = concept('concept-b-compact-patio', {
    facade: { entry_detail_style: 'solid-framed-door' },
    roof: { style: 'flat', profile: 'stepped-flat-with-light-slot' },
    site: { patio: true, outdoor_seating: true },
    interior: { display_strategy: 'corner-display-cases' },
    topology: { public_core: 'dining', split_strategy: 'view-side-cluster' }
  });
  const fusion = new ConceptFusionAgent().run([base, donor], {
    selected_concept_id: base.id,
    ranking: [
      { concept_id: base.id, rank: 1 },
      { concept_id: donor.id, rank: 2 }
    ]
  });

  assert.equal(fusion.source, 'local-concept-fusion-agent');
  assert.equal(fusion.active, true);
  assert.equal(fusion.concept.id, 'concept-fused-concept-a-view-courtyard');
  assert.deepEqual(fusion.concept.source_concept_ids, [base.id, donor.id]);
  assert.equal(fusion.concept.creative_design_patch.site.outdoor_seating, true);
  assert.equal(fusion.concept.creative_design_patch.interior.display_strategy, 'corner-display-cases');
  assert.ok(fusion.rejected_conflicts.some((item) => item.field === 'roof.profile'));
  assert.ok(fusion.rejected_conflicts.some((item) => item.field === 'topology.public_core'));
});

test('ConceptFusionAgent falls back inactive with fewer than two ranked concepts', () => {
  const base = concept('concept-a-view-courtyard', { roof: { style: 'flat' } });
  const fusion = new ConceptFusionAgent().run([base], {
    selected_concept_id: base.id,
    ranking: [{ concept_id: base.id, rank: 1 }]
  });

  assert.equal(fusion.active, false);
  assert.equal(fusion.concept, undefined);
  assert.match(fusion.reason, /requires at least two/);
});

test('ConceptFusionAgent refines a complete base with compatible donor details', () => {
  const base = concept('concept-a-view-courtyard', {
    facade: { entry_detail_style: 'recessed-glass-portal', glazing_ratio: 'high' },
    roof: { style: 'flat', profile: 'thin-parapet-terrace' },
    site: { patio: true, outdoor_seating: true, planting_beds: true, water_feature: true },
    interior: { decor_density: 'layered', display_strategy: 'long-wall-gallery' },
    topology: { public_core: 'living', split_strategy: 'open-plan-weighted' }
  });
  const donor = concept('concept-c-compact-patio', {
    facade: { entry_detail_style: 'solid-framed-door', glazing_ratio: 'medium' },
    roof: { style: 'flat', profile: 'stepped-flat-with-light-slot' },
    site: { patio: true, outdoor_seating: true, planting_beds: false, water_feature: false },
    interior: { decor_density: 'warm', display_strategy: 'corner-display-cases' },
    topology: { public_core: 'dining', split_strategy: 'view-side-cluster' }
  });

  const fusion = new ConceptFusionAgent().run([base, donor], {
    selected_concept_id: base.id,
    ranking: [
      { concept_id: base.id, rank: 1 },
      { concept_id: donor.id, rank: 2 }
    ]
  });

  assert.equal(fusion.active, true);
  assert.equal(fusion.warnings.length, 0);
  assert.equal(fusion.concept.creative_design_patch.interior.display_strategy, 'corner-display-cases');
  assert.ok(fusion.adopted_elements.some((item) => item.field === 'interior.display_strategy' && item.mode === 'refinement'));
  assert.equal(fusion.concept.creative_design_patch.roof.profile, 'thin-parapet-terrace');
  assert.ok(fusion.rejected_conflicts.some((item) => item.field === 'roof.profile'));
});

function concept(id, creative_design_patch) {
  return {
    id,
    title: id,
    archetype: id.replace(/^concept-[a-z]-/, ''),
    summary: id,
    design_intent: [id],
    reference_strategy: [],
    quality_targets: [],
    risks: [],
    creative_design_patch
  };
}
