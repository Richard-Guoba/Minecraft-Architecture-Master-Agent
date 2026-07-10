import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';

test('Stage 7 condition captures final design semantics and only reviewed references', () => {
  const condition = buildStage7Condition(conditionInput());

  assert.equal(condition.source, 'stage7-coarse-semantic-voxel-condition-v1');
  assert.equal(condition.schema_version, 1);
  assert.equal(condition.seed, 7101);
  assert.deepEqual(condition.constraints.resolution, [64, 64, 64]);
  assert.equal(condition.design.selected_concept_id, 'concept-b-view-courtyard');
  assert.ok(condition.design.massing_strategy.includes('courtyard'));
  assert.ok(condition.design.abstract_site_tags.includes('water-edge'));
  assert.ok(condition.design.abstract_site_tags.includes('courtyard'));
  assert.equal(condition.design.massing_volumes.length, 2);
  assert.deepEqual(condition.design.topology_program.nodes.map((item) => item.id), ['entry', 'living']);
  assert.deepEqual(condition.references.map((item) => item.case_id), ['approved-house', 'limited-site-house']);
  assert.deepEqual(condition.references[1].used_for, ['site']);
  assert.ok(condition.references[0].hints.some((item) => item.area === 'massing' && /massing lesson/.test(item.claim)));
  assert.equal(condition.references.some((item) => item.case_id === 'pending-house'), false);
  assert.equal(condition.condition_hash.length, 64);
  assert.equal(Object.hasOwn(condition, 'world_coordinates'), false);
});

test('Stage 7 condition hash changes with seed, selected concept, or reviewed references', () => {
  const base = conditionInput();
  const first = buildStage7Condition(base);
  const second = buildStage7Condition({ ...base, seed: 7102 });
  const third = buildStage7Condition({
    ...base,
    conceptStudio: { ...base.conceptStudio, selected_concept_id: 'concept-a-axis' }
  });
  const fourth = buildStage7Condition({
    ...base,
    templateKnowledge: {
      retrieval_explanation: {
        source: 'template-explainable-retriever-v1',
        references: base.templateKnowledge.retrieval_explanation.references.slice(0, 1)
      }
    }
  });
  const fifth = buildStage7Condition({ ...base, prompt: `${base.prompt}，增加观景塔` });
  const sixth = buildStage7Condition({ ...base, buildSpec: { ...base.buildSpec, width: base.buildSpec.width - 2 } });
  const seventhInput = structuredClone(base);
  seventhInput.templateKnowledge.retrieval_explanation.embedding_index_hash = `sha256:${'d'.repeat(64)}`;
  const seventh = buildStage7Condition(seventhInput);
  const eighth = buildStage7Condition({
    ...base,
    architecture: {
      ...base.architecture,
      volumes: [...base.architecture.volumes, { id: 'tower', role: 'view tower', shape: 'box', scale: [0.25, 1.4, 0.25], placement: { relation: 'attached-east', attach_to: 'main' }, boolean_mode: 'union', tags: ['vertical-accent'] }]
    }
  });
  const ninth = buildStage7Condition({
    ...base,
    topology: {
      ...base.topology,
      nodes: base.topology.nodes.map((item) => item.id === 'living' ? { ...item, weight: 2.4, zone: 'public' } : item)
    }
  });

  assert.notEqual(first.condition_hash, second.condition_hash);
  assert.notEqual(first.condition_hash, third.condition_hash);
  assert.notEqual(first.condition_hash, fourth.condition_hash);
  assert.notEqual(first.condition_hash, fifth.condition_hash);
  assert.notEqual(first.condition_hash, sixth.condition_hash);
  assert.notEqual(first.condition_hash, seventh.condition_hash);
  assert.notEqual(first.condition_hash, eighth.condition_hash);
  assert.notEqual(first.condition_hash, ninth.condition_hash);
});

test('limited references without an approved matching learning area are excluded', () => {
  const input = conditionInput();
  input.templateKnowledge.retrieval_explanation.references = [{
    case_id: 'limited-interior-only',
    title: 'Limited Interior Only',
    review_state: 'limited',
    approved_learning_areas: ['site'],
    blocked_learning_areas: ['interior'],
    teaches: [{ area: 'interior', claim: 'blocked', confidence: 0.9 }],
    risk_controls: ['do not use interior']
  }];

  const condition = buildStage7Condition(input);
  assert.deepEqual(condition.references, []);
});

function conditionInput() {
  const selectedConcept = {
    id: 'concept-b-view-courtyard',
    massing_plan: { variant_hint: 'courtyard', key_moves: ['view-axis', 'stepped-terrace'] },
    space_graph_strategy: { public_core: 'living', split_strategy: 'view-facing' },
    site_strategy: { mood: 'waterfront-garden', water_feature: true },
    quality_targets: ['clear-entry', 'view-axis']
  };
  return {
    prompt: '在湖边建一座带水景庭院的两层日式住宅',
    seed: 7101,
    architecture: {
      style: '日式',
      style_family: 'japanese',
      typology: 'house',
      footprint: 'courtyard',
      facade_rules: { front_side: 'south' },
      site_rules: { water_feature: true, enclosed_courtyard: true, landscape_mood: 'waterfront-garden' },
      massing_rules: { creative_variant: 'courtyard' },
      volumes: [
        { id: 'main', role: 'main house', shape: 'box', scale: [1, 1, 1], placement: { relation: 'center' }, boolean_mode: 'union', tags: ['primary-mass'] },
        { id: 'garden-wing', role: 'garden wing', shape: 'box', scale: [0.45, 0.75, 0.55], placement: { relation: 'attached-west', attach_to: 'main' }, boolean_mode: 'union', tags: ['secondary-mass'] }
      ]
    },
    buildSpec: {
      width: 31,
      depth: 27,
      floors: 2,
      floor_height: 5,
      total_height: 14,
      door_side: 'south',
      lot: { width: 37, depth: 40 },
      constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
    },
    topology: {
      nodes: [{ id: 'entry', type: 'entry', floor: 0, weight: 0.8, zone: 'public' }, { id: 'living', type: 'living', floor: 0, weight: 1.4, zone: 'public' }],
      edges: [{ from: 'entry', to: 'living', relation: 'connected' }],
      zoning: { public: ['entry', 'living'], private: [], service: [], circulation: [], outdoor: [] },
      bsp_hints: { split_strategy: 'view-facing' }
    },
    creativeDesign: {
      signature: 'courtyard/view-axis/deep-eaves',
      design_axes: { massing_variant: 'courtyard', split_strategy: 'view-facing', composition_bias: 'view-facing' },
      topology: { split_strategy: 'view-facing', public_core_position: 'view-facing' },
      site: { mood: 'waterfront-garden', water_feature: true }
    },
    conceptStudio: {
      active: true,
      selected_concept_id: selectedConcept.id,
      selectedConcept,
      concepts: [selectedConcept, { id: 'concept-a-axis' }]
    },
    templateKnowledge: {
      retrieval_explanation: {
        source: 'stage5-neural-template-retriever-v1',
        embedding_index_hash: `sha256:${'a'.repeat(64)}`,
        references: [
          reference('approved-house', 'approved', ['massing', 'site'], []),
          reference('limited-site-house', 'limited', ['site'], ['interior']),
          reference('pending-house', 'pending', [], [])
        ]
      }
    }
  };
}

function reference(caseId, reviewState, approved, blocked) {
  return {
    case_id: caseId,
    title: caseId,
    rank: caseId === 'approved-house' ? 1 : 2,
    match_score: 80,
    embedding_score: 75,
    embedding_record_hash: `sha256:${(caseId === 'approved-house' ? 'b' : 'c').repeat(64)}`,
    review_state: reviewState,
    review_confidence: reviewState === 'pending' ? 0 : 0.9,
    approved_learning_areas: approved,
    blocked_learning_areas: blocked,
    teaches: [
      { area: 'massing', claim: 'massing lesson', confidence: 0.9 },
      { area: 'site', claim: 'site lesson', confidence: 0.85 },
      { area: 'interior', claim: 'interior lesson', confidence: 0.8 }
    ],
    risk_controls: ['change exact dimensions and details']
  };
}
