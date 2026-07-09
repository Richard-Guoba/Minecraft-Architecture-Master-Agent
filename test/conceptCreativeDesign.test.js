import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeededCreativeDesign, normalizeCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';

test('buildSeededCreativeDesign applies selected concept patch to supported semantic fields', () => {
  const concept = {
    id: 'concept-a-view-courtyard',
    title: '水景庭院视线方案',
    archetype: 'view-courtyard',
    creative_design_patch: {
      massing_variant: 'waterfront-stepped-estate',
      facade: {
        window_rhythm: 'corner-window-bands',
        glazing_ratio: 'high',
        entry_detail_style: 'recessed-glass-portal',
        window_surround_pattern: 'corner-wrap'
      },
      roof: {
        style: 'flat',
        profile: 'thin-parapet-terrace',
        roof_terrace: true,
        overhang: 0
      },
      site: {
        mood: 'reflecting-water-edge',
        patio: true,
        water_feature: true,
        outdoor_seating: true
      },
      interior: {
        decor_density: 'layered',
        display_strategy: 'long-wall-gallery'
      },
      topology: {
        split_strategy: 'open-plan-weighted',
        public_core: 'living',
        public_core_position: 'view-facing',
        soft_boundary_bias: 'high'
      }
    }
  };

  const design = buildSeededCreativeDesign(
    '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    { style_family: 'modern', volumes: [], roof_rules: { style: 'flat' } },
    { seed: 7101, floors: 2, roof_style: 'flat' },
    { nodes: [{ id: 'living', floor: 0, weight: 1 }] },
    { conceptStudio: { active: true, selectedConcept: concept } }
  );

  assert.equal(design.concept_studio.selected_concept_id, 'concept-a-view-courtyard');
  assert.equal(design.design_axes.massing_variant, 'waterfront-stepped-estate');
  assert.equal(design.facade.window_rhythm, 'corner-window-bands');
  assert.equal(design.facade.glazing_ratio, 'high');
  assert.equal(design.roof.profile, 'thin-parapet-terrace');
  assert.equal(design.roof.roof_terrace, true);
  assert.equal(design.site.mood, 'reflecting-water-edge');
  assert.equal(design.site.water_feature, true);
  assert.equal(design.interior.decor_density, 'layered');
  assert.equal(design.interior.display_strategy, 'long-wall-gallery');
  assert.equal(design.topology.public_core_position, 'view-facing');
});

test('normalizeCreativeDesign preserves concept studio metadata', () => {
  const normalized = normalizeCreativeDesign({
    signature: 'concept-test',
    concept_studio: {
      active: true,
      selected_concept_id: 'concept-a-view-courtyard',
      strategy: 'select'
    }
  }, 'seeded-local');

  assert.equal(normalized.concept_studio.active, true);
  assert.equal(normalized.concept_studio.selected_concept_id, 'concept-a-view-courtyard');
  assert.equal(normalized.concept_studio.strategy, 'select');
});
