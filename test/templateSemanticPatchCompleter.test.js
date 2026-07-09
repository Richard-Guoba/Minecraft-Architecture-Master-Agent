import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSemanticVoxelPatchDataset } from '../src/construction/templates/templateSemanticPatchDataset.js';
import {
  completeSemanticVoxelPatch,
  repairSemanticVoxelPatchConflicts
} from '../src/construction/templates/templateSemanticPatchCompleter.js';

test('semantic patch completer selects a style and tag matching facade patch', () => {
  const dataset = fixtureDataset();
  const result = completeSemanticVoxelPatch({
    dataset,
    category: 'facade',
    context: {
      prompt: 'build a modern lakeside villa with large glass facade',
      style_family: 'modern',
      typology: 'house',
      tags: ['large-glass', 'water-edge']
    }
  });

  assert.equal(result.source, 'stage6-semantic-patch-completer-v1');
  assert.equal(result.active, true);
  assert.equal(result.mode, 'retrieval-completion');
  assert.equal(result.category, 'facade');
  assert.equal(result.selected_patch_id, 'house-modern-lake-villa:facade:large-glass');
  assert.ok(result.score > 60);
  assert.ok(result.semantic_voxels.some((voxel) => voxel.role === 'view-glass'));
  assert.deepEqual(result.repairs, []);
});

test('semantic patch completer removes blocked roles and reports repairs', () => {
  const dataset = fixtureDataset();
  const result = completeSemanticVoxelPatch({
    dataset,
    category: 'facade',
    context: {
      prompt: 'modern villa facade',
      style_family: 'modern',
      typology: 'house',
      tags: ['large-glass']
    },
    constraints: {
      blocked_roles: ['view-glass']
    }
  });

  assert.equal(result.active, true);
  assert.equal(result.semantic_voxels.some((voxel) => voxel.role === 'view-glass'), false);
  assert.equal(result.repairs.filter((repair) => repair.reason === 'blocked-role').length, 2);
});

test('semantic patch repair clears solid and furniture collisions while preserving air cells', () => {
  const dataset = fixtureDataset();
  const interior = dataset.patches.find((patch) => patch.patch_id === 'house-modern-lake-villa:interior:furnished');
  const repaired = repairSemanticVoxelPatchConflicts({
    patch: interior,
    constraints: {
      clearance_boxes: [{ x: 2, y: 0, z: 2, width: 1, height: 2, depth: 1 }]
    }
  });

  assert.equal(repaired.semantic_voxels.some((voxel) => voxel.role === 'seating-cluster'), false);
  assert.equal(repaired.semantic_voxels.some((voxel) => voxel.role === 'circulation-air'), true);
  assert.ok(repaired.repairs.some((repair) => repair.reason === 'clearance-collision'));
});

test('semantic patch completer returns fallback-safe inactive results for unusable input', () => {
  const unknown = completeSemanticVoxelPatch({
    dataset: fixtureDataset(),
    category: 'balcony',
    context: { prompt: 'modern balcony' }
  });
  assert.equal(unknown.active, false);
  assert.ok(unknown.warnings.some((item) => /unknown category/i.test(item)));

  const empty = completeSemanticVoxelPatch({
    dataset: { patches: [] },
    category: 'facade',
    context: { prompt: 'modern facade' }
  });
  assert.equal(empty.active, false);
  assert.ok(empty.warnings.some((item) => /no candidate/i.test(item)));
});

function fixtureDataset() {
  return buildSemanticVoxelPatchDataset({
    knowledgeBase: {
      cases: [
        {
          case_id: 'house-modern-lake-villa',
          case_version: 'sha256:modern',
          title: 'Modern Lake Villa',
          file: 'House/Modern Lake Villa.schematic',
          identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
          review: { status: 'approved', confidence: 0.9 },
          tags: {
            style: [{ id: 'modern' }],
            typology: [{ id: 'house' }],
            site: [{ id: 'water-edge' }, { id: 'garden' }],
            facade: [{ id: 'large-glass' }],
            interior: [{ id: 'furnished' }],
            roof: [{ id: 'flat-terrace' }]
          },
          knowledge_units: [
            unit('lake-site', 'site', 'Connect a quiet garden court to the water-edge deck.'),
            unit('lake-facade', 'facade', 'Use large glass bays with thin trim for view-facing rooms.'),
            unit('lake-interior', 'interior', 'Use focal walls, seating groups, and layered lighting for inhabited rooms.'),
            unit('lake-roof', 'roof', 'Use a flat roof terrace with guarded edges and service access.')
          ],
          priority: { global_score: 92, risk_penalty: 0 },
          retrieval: { search_tokens: ['modern', 'lake', 'water-edge', 'large-glass', 'interior'] },
          risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
        },
        {
          case_id: 'house-japanese-courtyard',
          case_version: 'sha256:japanese',
          title: 'Japanese Courtyard House',
          file: 'House/Japanese Courtyard House.schematic',
          identity: { style_family: 'japanese', typology: 'house', category: 'House', scale_bucket: 'medium' },
          review: { status: 'approved', confidence: 0.9 },
          tags: {
            style: [{ id: 'japanese' }],
            typology: [{ id: 'house' }],
            site: [{ id: 'courtyard' }],
            roof: [{ id: 'layered-eaves' }]
          },
          knowledge_units: [
            unit('jp-site', 'site', 'Use a framed courtyard garden as a calm center.'),
            unit('jp-roof', 'roof', 'Use layered eaves and deep overhang rhythm.')
          ],
          priority: { global_score: 76, risk_penalty: 0 },
          retrieval: { search_tokens: ['japanese', 'courtyard', 'layered-eaves'] },
          risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
        }
      ]
    },
    neuralLabels: [
      {
        case_id: 'house-modern-lake-villa',
        suggested_tags: [
          { group: 'facade', id: 'large-glass', confidence: 0.88, evidence: ['fixture label'] },
          { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture label'] },
          { group: 'interior', id: 'furnished', confidence: 0.84, evidence: ['fixture label'] }
        ],
        suggested_learning_areas: [{ area: 'interior', confidence: 0.84, evidence: ['fixture'] }]
      }
    ]
  });
}

function unit(id, area, claim) {
  return {
    id,
    area,
    claim,
    evidence: [`${area} evidence`],
    confidence: 0.85,
    use_as: [`${area} guidance`],
    avoid_when: ['do not copy block-for-block'],
    integration_targets: ['TemplateKnowledgeAgent'],
    source_fields: ['fixture']
  };
}
