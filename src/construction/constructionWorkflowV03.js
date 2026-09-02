import { deriveEntryThresholdGeometry } from './engine/csgBuilder.js';

const WORKFLOW_VERSION = '0.3.0';

export function buildConstructionWorkflowV03(blueprint = {}) {
  const applied = blueprint.architectureLanguage?.trace?.applied_operations || [];
  const rows = applied.map((operation) => {
    const row = {
      knowledge_id: operation.knowledge_id,
      operation_id: operation.operation_id,
      workflow_stage: operation.workflow_stage,
      result_kind: resultKind(operation.operation_id),
      evidence: operationEvidence(blueprint, operation.operation_id)
    };
    return { ...row, satisfied: isConstructionOperationSatisfied(blueprint, row) };
  });
  return {
    schema_version: 1,
    workflow_version: WORKFLOW_VERSION,
    authority: 'derived-from-validated-plan-and-grid',
    rows,
    satisfied_count: rows.filter((row) => row.satisfied).length,
    unsatisfied_count: rows.filter((row) => !row.satisfied).length
  };
}

export function isConstructionOperationSatisfied(blueprint = {}, row = {}) {
  const modules = blueprint.modules || {};
  const volumeIds = eligibleVolumeBoxes(blueprint).map((box) => box.id);
  switch (row.operation_id) {
    case 'language:massing:connected-role-volumes':
      return connectedVolumeJointsCoverRoles(blueprint) && Number(modules.volume_joint || 0) > 0;
    case 'language:structure:derived-bay-grid':
      return Number(modules.structural_frame || 0) > 0 && blueprint.structure?.engine_hints?.render_column_grid === true;
    case 'language:roof:volume-proportion-axis':
      return (blueprint.architecture?.roof_rules?.axis_strategy === 'volume-proportion' || blueprint.roof?.axis_strategy === 'volume-proportion') &&
        (blueprint.geometry?.roof?.componentAxes || []).length > 0 && Number(modules.roof || 0) > 0;
    case 'language:roof:flat-parapet':
      return blueprint.roof?.style === 'flat' && Number(modules.roof_detail || 0) > 0;
    case 'language:facade:sheltered-entry':
      return Number(modules.awning || 0) + Number(modules.porch || 0) + Number(modules.entry_detail || 0) > 0;
    case 'language:facade:integrated-bays':
      return blueprint.facade?.engine_hints?.render_integrated_bays === true && Number(modules.facade_bay || 0) > 0;
    case 'language:facade:opening-assembly':
      return blueprint.facade?.engine_hints?.render_opening_assemblies === true &&
        Number(modules.opening_assembly || 0) > 0 && Number(modules.windows || 0) > 0;
    case 'language:facade:bounded-pattern-vocabulary':
      return blueprint.facade?.relief_density === 'low' && Number(modules.facade_relief || 0) > 0;
    case 'language:site:route-first-grounding':
      return Number(modules.entry_threshold || 0) > 0 &&
        Number(modules.landscape_path || 0) + Number(modules.entry_path || 0) > 0 &&
        thresholdMatchesMainDoor(blueprint) &&
        thresholdIsExported(blueprint.paths?.entryThreshold, blueprint.operations);
    case 'language:site:foundation-continuity':
      return blueprint.site?.engine_hints?.render_foundation_transition === true &&
        Number(modules.foundation_transition || 0) > 0 &&
        sameStringSet(blueprint.geometry?.site?.foundationTransitionVolumeIds, volumeIds);
    case 'language:interior:function-first-zoning':
      return blueprint.geometry?.bsp?.semanticSpacePlanning === 'function-before-furnishing';
    case 'language:interior:porous-public-partitions':
      return blueprint.geometry?.bsp?.semanticPartitionStrategy === 'porous-public-solid-private' &&
        Number(blueprint.geometry?.bsp?.openPlanSoftBoundaries || 0) > 0;
    case 'language:interior:large-to-small-pass':
      return blueprint.decorator?.furnishing_sequence === 'large-to-small' &&
        blueprint.decorator?.placement_passes?.[0] === 'function-bearing-large';
    case 'language:facade:daylit-window-wall':
      return Number(modules.windows || 0) > 0 && blueprint.facade?.window_system?.glazing_ratio === 'high';
    case 'language:massing:three-volume-interlock':
      return ['main', 'glass-wing', 'view-terrace'].every((id) => volumeIds.includes(id));
    case 'language:facade:private-entry-openness':
      return blueprint.facade?.entry_detail_style === 'offset-frame' && Number(modules.entry_detail || 0) > 0;
    default:
      return false;
  }
}

function resultKind(operationId) {
  if (operationId?.startsWith('language:massing:')) return 'volume-geometry';
  if (operationId?.startsWith('language:interior:')) return 'spatial-or-placement-result';
  return 'module-and-agent-result';
}

function operationEvidence(blueprint, operationId) {
  return {
    volume_ids: (blueprint.shell?.volumeBoxes || []).map((box) => box.id),
    module_counts: relevantModuleCounts(blueprint.modules || {}),
    bsp_strategy: blueprint.geometry?.bsp?.splitStrategy || 'unknown',
    roof_axes: blueprint.geometry?.roof?.componentAxes || [],
    furnishing_sequence: blueprint.decorator?.furnishing_sequence || 'standard',
    checked_operation: operationId
  };
}

function relevantModuleCounts(modules) {
  return Object.fromEntries([
    'structural_frame', 'roof', 'roof_detail', 'windows', 'facade_detail', 'facade_relief',
    'facade_bay', 'opening_assembly', 'volume_joint', 'entry_detail', 'awning', 'porch',
    'landscape_path', 'entry_path', 'entry_threshold', 'foundation', 'foundation_transition'
  ].map((key) => [key, Number(modules[key] || 0)]));
}

function thresholdMatchesMainDoor(blueprint = {}) {
  const door = blueprint.paths?.mainDoor;
  if (!door) return false;
  const width = Math.max(Number(door.width || 1), Number(blueprint.site?.entry_sequence?.path_width || 1));
  const block = blueprint.site?.materials?.path_secondary || blueprint.architecture?.materials?.foundation || 'minecraft:stone_bricks';
  const expected = deriveEntryThresholdGeometry(blueprint.buildSpec, { mainDoor: door, width, block }).evidence;
  return JSON.stringify(blueprint.paths?.entryThreshold) === JSON.stringify(expected);
}

function thresholdIsExported(threshold = {}, operations = []) {
  if (!threshold.block || !Array.isArray(threshold.points) || !Array.isArray(operations)) return false;
  return threshold.points.every((point) => operations.some((operation) => operation.block === threshold.block &&
    pointInOperation(point, operation)));
}

function pointInOperation(point, operation = {}) {
  const from = operation.from || operation.at;
  const to = operation.to || operation.at;
  if (!from || !to) return false;
  return ['x', 'y', 'z'].every((axis) => Number(point[axis]) >= Math.min(Number(from[axis]), Number(to[axis])) &&
    Number(point[axis]) <= Math.max(Number(from[axis]), Number(to[axis])));
}

function connectedVolumeJointsCoverRoles(blueprint = {}) {
  const boxes = eligibleVolumeBoxes(blueprint);
  const main = boxes.find((box) => box.id === 'main') || boxes[0];
  const targets = boxes.filter((box) => box !== main);
  const joints = blueprint.geometry?.csg?.volumeJoints;
  if (!main || targets.length === 0 || !Array.isArray(joints) || joints.length !== targets.length) return false;
  const block = blueprint.architecture?.materials?.foundation || blueprint.architecture?.materials?.wall || 'minecraft:stone_bricks';
  return targets.every((target) => {
    const expected = expectedVolumeJoint(main.bounds, target.bounds, blueprint.buildSpec);
    const joint = joints.find((candidate) => candidate.volumeId === target.id);
    return joint?.block === block && JSON.stringify(joint.from) === JSON.stringify(expected.from) &&
      JSON.stringify(joint.to) === JSON.stringify(expected.to) &&
      jointLinePoints(expected).every((point) => blueprint.operations?.some((operation) =>
        pointInOperation(point, operation)));
  });
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
  return [...new Set(actual)].length === actual.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function eligibleVolumeBoxes(blueprint = {}) {
  return (blueprint.shell?.volumeBoxes || []).filter((box) => box.booleanMode !== 'subtract');
}

function expectedVolumeJoint(a, b, spec = {}) {
  const [ax, bx] = closestAxisPoints(a.minX, a.maxX, b.minX, b.maxX);
  const [az, bz] = closestAxisPoints(a.minZ, a.maxZ, b.minZ, b.maxZ);
  const y = Math.max(1, Math.min(a.maxY, b.maxY, Number(spec.floor_height || 4) - 1));
  return { from: { x: ax, y, z: az }, to: { x: bx, y, z: bz } };
}

function closestAxisPoints(aMin, aMax, bMin, bMax) {
  if (bMin > aMax) return [aMax, bMin];
  if (aMin > bMax) return [aMin, bMax];
  const shared = Math.floor((Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2);
  return [shared, shared];
}

function jointLinePoints(joint) {
  const points = [];
  const stepX = joint.to.x >= joint.from.x ? 1 : -1;
  for (let x = joint.from.x; x !== joint.to.x + stepX; x += stepX) points.push({ x, y: joint.from.y, z: joint.from.z });
  const stepZ = joint.to.z >= joint.from.z ? 1 : -1;
  for (let z = joint.from.z; z !== joint.to.z + stepZ; z += stepZ) points.push({ x: joint.to.x, y: joint.from.y, z });
  return points;
}
