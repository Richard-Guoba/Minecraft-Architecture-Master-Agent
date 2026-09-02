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
  const volumeIds = (blueprint.shell?.volumeBoxes || []).map((box) => box.id);
  switch (row.operation_id) {
    case 'language:massing:connected-role-volumes':
      return volumeIds.length > 1;
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
      return Number(modules.facade_relief || 0) > 0;
    case 'language:facade:opening-assembly':
      return Number(modules.facade_detail || 0) > 0 && Number(modules.windows || 0) > 0;
    case 'language:facade:bounded-pattern-vocabulary':
      return blueprint.facade?.relief_density === 'low' && Number(modules.facade_relief || 0) > 0;
    case 'language:site:route-first-grounding':
      return Number(modules.entry_threshold || 0) > 0 &&
        Number(modules.landscape_path || 0) + Number(modules.entry_path || 0) > 0;
    case 'language:site:foundation-continuity':
      return Number(modules.foundation || 0) + Number(modules.foundation_anchor || 0) + Number(modules.entry_threshold || 0) > 0;
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
    'entry_detail', 'awning', 'porch', 'landscape_path', 'entry_path', 'entry_threshold', 'foundation'
  ].map((key) => [key, Number(modules[key] || 0)]));
}
