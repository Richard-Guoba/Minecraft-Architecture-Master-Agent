import { buildStage7GridTransformV3 } from './stage7GridTransformV3.js';
import { collectStage7SemanticEvidenceV3 } from './stage7SemanticEvidenceV3.js';
import { buildStage7SemanticTopologyV3 } from './stage7SemanticTopologyV3.js';

export function rasterizeSchematicToStage7V3({ volume, caseRecord = {} } = {}) {
  const originalBounds = sourceBounds(volume);
  const reviewedFront = caseRecord.review?.canonical_front_side;
  const frontSide = ['north', 'south', 'east', 'west'].includes(reviewedFront)
    ? reviewedFront
    : 'south';
  const warnings = reviewedFront
    ? []
    : ['canonical front side is unreviewed; south used for diagnostics'];
  const transform = buildStage7GridTransformV3({
    volume,
    occupiedBounds: originalBounds,
    frontSide
  });
  const evidence = collectStage7SemanticEvidenceV3({
    volume,
    transform,
    caseId: caseRecord.case_id
  });
  const semantic = buildStage7SemanticTopologyV3({
    evidence,
    transform,
    caseId: caseRecord.case_id
  });
  return {
    cells: semantic.cells,
    original_bounds: originalBounds,
    normalized_transform: transform,
    topology: semantic.topology,
    stats: { ...semantic.stats, topology: semantic.topology },
    warnings: [...warnings, ...semantic.warnings]
  };
}

function sourceBounds(volume) {
  const bounds = {
    min_x: Infinity,
    min_y: Infinity,
    min_z: Infinity,
    max_x: -1,
    max_y: -1,
    max_z: -1
  };
  for (let y = 0; y < volume.height; y += 1) {
    for (let z = 0; z < volume.length; z += 1) {
      for (let x = 0; x < volume.width; x += 1) {
        if (volume.blockAt(x, y, z).air) continue;
        bounds.min_x = Math.min(bounds.min_x, x);
        bounds.max_x = Math.max(bounds.max_x, x);
        bounds.min_y = Math.min(bounds.min_y, y);
        bounds.max_y = Math.max(bounds.max_y, y);
        bounds.min_z = Math.min(bounds.min_z, z);
        bounds.max_z = Math.max(bounds.max_z, z);
      }
    }
  }
  if (bounds.max_x < 0) {
    throw new Error('Stage 7 dataset extraction requires at least one non-air block');
  }
  return bounds;
}
