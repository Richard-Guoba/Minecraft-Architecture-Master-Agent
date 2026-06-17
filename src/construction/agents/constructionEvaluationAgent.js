const EVALUATION_VERSION = 1;

const CRITERIA = [
  criterion('input.prompt.present', 'Input', 'Prompt is present and descriptive', 1, (ctx) => text(ctx.result.prompt).length >= 8, (ctx) => text(ctx.result.prompt).length),
  criterion('input.seed.present', 'Input', 'Seed is recorded for reproducibility', 1, (ctx) => Number.isInteger(ctx.result.seed ?? ctx.blueprint.seed), (ctx) => ctx.result.seed ?? ctx.blueprint.seed),
  criterion('input.workflow.current', 'Input', 'Uses construction_method_v1', 1, (ctx) => ctx.result.workflow === 'construction_method_v1' || ctx.blueprint.workflow === 'construction_method_v1', (ctx) => ctx.result.workflow || ctx.blueprint.workflow),

  criterion('spec.dimensions.positive', 'Build Spec', 'Width and depth are positive', 1, (ctx) => number(ctx.spec.width) > 0 && number(ctx.spec.depth) > 0, (ctx) => `${ctx.spec.width}x${ctx.spec.depth}`),
  criterion('spec.dimensions.within-limit', 'Build Spec', 'Footprint stays inside configured limits', 2, (ctx) => number(ctx.spec.width) <= number(ctx.spec.constraints?.max_width, 80) && number(ctx.spec.depth) <= number(ctx.spec.constraints?.max_depth, 80), (ctx) => `${ctx.spec.width}x${ctx.spec.depth}`),
  criterion('spec.floors.range', 'Build Spec', 'Floor count is supported', 2, (ctx) => between(number(ctx.spec.floors), 1, number(ctx.spec.constraints?.max_floors, 5)), (ctx) => ctx.spec.floors),
  criterion('spec.height.limit', 'Build Spec', 'Total height stays under Minecraft-friendly limit', 2, (ctx) => number(ctx.spec.total_height) <= number(ctx.spec.constraints?.max_total_height, 40), (ctx) => ctx.spec.total_height),
  criterion('spec.shell.thickness', 'Build Spec', 'Shell thickness is valid', 1, (ctx) => between(number(ctx.spec.shell_thickness), 1, 3), (ctx) => ctx.spec.shell_thickness),
  criterion('spec.door.side', 'Build Spec', 'Door side is normalized', 1, (ctx) => ['north', 'south', 'east', 'west'].includes(text(ctx.spec.door_side)), (ctx) => ctx.spec.door_side),

  criterion('architecture.source', 'Architecture', 'Architecture agent output exists', 1, (ctx) => Boolean(ctx.architecture.source), (ctx) => ctx.architecture.source),
  criterion('architecture.style', 'Architecture', 'Style and style family are recorded', 1, (ctx) => Boolean(ctx.architecture.style && ctx.architecture.style_family), (ctx) => `${ctx.architecture.style}/${ctx.architecture.style_family}`),
  criterion('architecture.volumes.count', 'Architecture', 'At least one semantic volume is present', 2, (ctx) => array(ctx.architecture.volumes).length > 0, (ctx) => array(ctx.architecture.volumes).length),
  criterion('architecture.volumes.relative', 'Architecture', 'Volumes avoid absolute XYZ coordinates', 2, (ctx) => array(ctx.architecture.volumes).every((volume) => !('x' in volume) && !('y' in volume) && !('z' in volume)), (ctx) => array(ctx.architecture.volumes).length),
  criterion('architecture.materials.roles', 'Architecture', 'Architecture has a useful material map', 2, (ctx) => Object.keys(ctx.architecture.materials || {}).length >= 6, (ctx) => Object.keys(ctx.architecture.materials || {}).length),
  criterion('architecture.preferred-modules', 'Architecture', 'Preferred module list is recorded', 1, (ctx) => array(ctx.spec.modules?.preferred).length >= 4, (ctx) => array(ctx.spec.modules?.preferred).join(', ')),

  criterion('palette.source', 'Materials', 'MaterialPaletteAgent output exists', 1, (ctx) => ctx.blueprint.materialPalette?.source === 'local-material-palette', (ctx) => ctx.blueprint.materialPalette?.source),
  criterion('palette.valid', 'Materials', 'Selected palette blocks are valid', 3, (ctx) => ctx.blueprint.materialPalette?.valid !== false, (ctx) => array(ctx.blueprint.materialPalette?.warnings).join('; ')),
  criterion('palette.catalog.size', 'Materials', 'Minecraft 1.21.1 catalog is available', 2, (ctx) => number(ctx.blueprint.materialPalette?.block_catalog?.blockCount) >= 1000, (ctx) => ctx.blueprint.materialPalette?.block_catalog?.blockCount),
  criterion('palette.options.catalog', 'Materials', 'Full material option catalog is exposed', 2, (ctx) => number(ctx.blueprint.materialPalette?.controllableBlockCount) >= 1000, (ctx) => ctx.blueprint.materialPalette?.controllableBlockCount),
  criterion('palette.roles.broad', 'Materials', 'Role material options cover many roles', 1, (ctx) => array(ctx.blueprint.materialPalette?.option_roles).length >= 10, (ctx) => array(ctx.blueprint.materialPalette?.option_roles).length),

  criterion('structure.source', 'Structure', 'StructureAgent output exists', 1, (ctx) => ctx.blueprint.structure?.source === 'fallback-structure', (ctx) => ctx.blueprint.structure?.source),
  criterion('structure.foundation', 'Structure', 'Foundation strategy is present', 1, (ctx) => Boolean(ctx.blueprint.structure?.foundation?.strategy), (ctx) => ctx.blueprint.structure?.foundation?.strategy),
  criterion('structure.supports', 'Structure', 'Support elements are present', 2, (ctx) => array(ctx.blueprint.structure?.support_elements).length > 0, (ctx) => array(ctx.blueprint.structure?.support_elements).length),
  criterion('structure.load-paths', 'Structure', 'Load paths are described', 2, (ctx) => array(ctx.blueprint.structure?.load_paths).length > 0, (ctx) => array(ctx.blueprint.structure?.load_paths).length),
  criterion('structure.geometry-summary', 'Structure', 'Geometry structure summary matches agent output', 1, (ctx) => number(ctx.geometry.structure?.supportElementCount) === array(ctx.blueprint.structure?.support_elements).length, (ctx) => `${ctx.geometry.structure?.supportElementCount}/${array(ctx.blueprint.structure?.support_elements).length}`),

  criterion('surface.facade.source', 'Surface', 'FacadeAgent output exists', 1, (ctx) => ctx.blueprint.facade?.source === 'local-facade-agent', (ctx) => ctx.blueprint.facade?.source),
  criterion('surface.facade.elements', 'Surface', 'Facade has buildable elements', 2, (ctx) => array(ctx.blueprint.facade?.facade_elements).length > 0, (ctx) => array(ctx.blueprint.facade?.facade_elements).length),
  criterion('surface.roof.source', 'Surface', 'RoofAgent output exists', 1, (ctx) => ctx.blueprint.roof?.source === 'local-roof-agent', (ctx) => ctx.blueprint.roof?.source),
  criterion('surface.roof.style', 'Surface', 'Roof style is selected', 1, (ctx) => Boolean(ctx.blueprint.roof?.style || ctx.geometry.roof?.style), (ctx) => ctx.blueprint.roof?.style || ctx.geometry.roof?.style),
  criterion('surface.site.source', 'Surface', 'SiteLandscapeAgent output exists', 1, (ctx) => ctx.blueprint.site?.source === 'local-site-landscape-agent', (ctx) => ctx.blueprint.site?.source),
  criterion('surface.site.zones', 'Surface', 'Site plan has zones', 1, (ctx) => array(ctx.blueprint.site?.zones).length > 0, (ctx) => array(ctx.blueprint.site?.zones).length),
  criterion('surface.opening.source', 'Surface', 'OpeningConnectivityAgent output exists', 1, (ctx) => ctx.blueprint.opening?.source === 'local-opening-connectivity-agent', (ctx) => ctx.blueprint.opening?.source),

  criterion('topology.nodes.count', 'Topology', 'Planner produced room nodes', 2, (ctx) => array(ctx.topology.nodes).length >= 3, (ctx) => array(ctx.topology.nodes).length),
  criterion('topology.nodes.unique', 'Topology', 'Planner node IDs are unique', 3, (ctx) => uniqueCount(array(ctx.topology.nodes).map((node) => node.id)) === array(ctx.topology.nodes).length, (ctx) => duplicateValues(array(ctx.topology.nodes).map((node) => node.id)).join(', ')),
  criterion('topology.edges.count', 'Topology', 'Planner produced circulation edges', 2, (ctx) => array(ctx.topology.edges).length > 0, (ctx) => array(ctx.topology.edges).length),
  criterion('topology.floor-program', 'Topology', 'Floor program covers all floors', 2, (ctx) => array(ctx.topology.floor_program).length === number(ctx.spec.floors), (ctx) => `${array(ctx.topology.floor_program).length}/${ctx.spec.floors}`),
  criterion('topology.no-coordinates', 'Topology', 'Planner nodes avoid absolute coordinates', 2, (ctx) => array(ctx.topology.nodes).every((node) => !('x' in node) && !('y' in node) && !('z' in node)), (ctx) => array(ctx.topology.nodes).length),

  criterion('layout.rooms.count', 'Layout', 'BSP generated rooms', 2, (ctx) => array(ctx.layout.rooms).length >= Math.min(3, array(ctx.topology.nodes).length), (ctx) => array(ctx.layout.rooms).length),
  criterion('layout.rooms.unique', 'Layout', 'BSP room IDs are unique', 3, (ctx) => uniqueCount(array(ctx.layout.rooms).map((room) => room.id)) === array(ctx.layout.rooms).length, (ctx) => duplicateValues(array(ctx.layout.rooms).map((room) => room.id)).join(', ')),
  criterion('layout.rooms.valid-bounds', 'Layout', 'Room bounds are valid', 3, (ctx) => array(ctx.layout.rooms).every(validRoomBounds), (ctx) => array(ctx.layout.rooms).length),
  criterion('layout.doors.count', 'Layout', 'Interior doors or soft thresholds exist', 2, (ctx) => array(ctx.layout.interiorDoors).length > 0, (ctx) => array(ctx.layout.interiorDoors).length),
  criterion('layout.bsp.summary', 'Layout', 'BSP summary matches room count', 1, (ctx) => number(ctx.geometry.bsp?.roomCount) === array(ctx.layout.rooms).length, (ctx) => `${ctx.geometry.bsp?.roomCount}/${array(ctx.layout.rooms).length}`),

  criterion('circulation.main-door', 'Circulation', 'Main door is carved', 3, (ctx) => Boolean(ctx.blueprint.paths?.mainDoor), (ctx) => ctx.blueprint.paths?.mainDoor?.side),
  criterion('circulation.failed-edges', 'Circulation', 'A* has no failed topology edges', 3, (ctx) => number(ctx.geometry.pathfinder?.failedEdgeCount) === 0, (ctx) => ctx.geometry.pathfinder?.failedEdgeCount),
  criterion('circulation.routed-edges', 'Circulation', 'A* routed at least one edge', 2, (ctx) => number(ctx.geometry.pathfinder?.routedEdgeCount) > 0, (ctx) => ctx.geometry.pathfinder?.routedEdgeCount),
  criterion('circulation.reachability', 'Circulation', 'Most rooms are reachable from entry', 3, (ctx) => number(ctx.validation.stats?.circulation?.reachableRoomCount) >= Math.ceil(array(ctx.layout.rooms).length * 0.75), (ctx) => `${ctx.validation.stats?.circulation?.reachableRoomCount}/${array(ctx.layout.rooms).length}`),
  criterion('circulation.stairs-if-needed', 'Circulation', 'Multi-floor builds include stairs', 3, (ctx) => number(ctx.spec.floors) <= 1 || array(ctx.blueprint.paths?.stairs).length > 0, (ctx) => array(ctx.blueprint.paths?.stairs).length),
  criterion('circulation.floor-openings', 'Circulation', 'Floor openings support vertical travel', 2, (ctx) => number(ctx.spec.floors) <= 1 || array(ctx.layout.floorOpenings).length >= number(ctx.spec.floors) - 1, (ctx) => array(ctx.layout.floorOpenings).length),

  criterion('interior.source', 'Interior', 'InteriorDetailAgent output exists', 1, (ctx) => ctx.blueprint.interior?.source === 'local-interior-detail-agent', (ctx) => ctx.blueprint.interior?.source),
  criterion('interior.room-details', 'Interior', 'Interior detail count matches room count', 2, (ctx) => number(ctx.blueprint.interior?.room_count) === array(ctx.layout.rooms).length, (ctx) => `${ctx.blueprint.interior?.room_count}/${array(ctx.layout.rooms).length}`),
  criterion('interior.specialists.count', 'Interior', 'Many interior specialists are registered', 2, (ctx) => array(ctx.blueprint.interior?.room_specialists).length >= 20, (ctx) => array(ctx.blueprint.interior?.room_specialists).length),
  criterion('interior.specialists.blocks', 'Interior', 'Every interior specialist controls 50+ blocks', 3, (ctx) => array(ctx.blueprint.interior?.room_specialists).every((agent) => number(agent.block_count) >= 50), (ctx) => min(array(ctx.blueprint.interior?.room_specialists).map((agent) => number(agent.block_count)))),
  criterion('interior.decorator.enabled', 'Interior', 'DecoratorAgent wrote decorations', 3, (ctx) => ctx.blueprint.decorator?.enabled && number(ctx.blueprint.decorator?.placementCount) > 0, (ctx) => ctx.blueprint.decorator?.placementCount),
  criterion('interior.decorator.density', 'Interior', 'Decoration density is meaningful', 2, (ctx) => number(ctx.blueprint.decorator?.placementCount) >= array(ctx.layout.rooms).length * 4, (ctx) => `${ctx.blueprint.decorator?.placementCount}/${array(ctx.layout.rooms).length}`),
  criterion('interior.decorator.unique-blocks', 'Interior', 'Interior uses many distinct decor blocks', 2, (ctx) => uniqueDecorBlocks(ctx).size >= 15, (ctx) => uniqueDecorBlocks(ctx).size),
  criterion('interior.vibrant.layer', 'Interior', 'Vibrant accent layer is present', 3, (ctx) => vibrantPlacements(ctx).length > 0, (ctx) => vibrantPlacements(ctx).length),
  criterion('interior.vibrant.variety', 'Interior', 'Vibrant layer uses varied blocks', 2, (ctx) => uniqueCount(vibrantPlacements(ctx).map((item) => blockBase(item.block))) >= 8, (ctx) => uniqueCount(vibrantPlacements(ctx).map((item) => blockBase(item.block)))),
  criterion('interior.modules.floor', 'Interior', 'Decorative floor accents exist', 1, (ctx) => number(ctx.blueprint.modules?.decor_floor) > 0, (ctx) => ctx.blueprint.modules?.decor_floor),
  criterion('interior.modules.light', 'Interior', 'Decorative lighting exists', 1, (ctx) => number(ctx.blueprint.modules?.decor_light) > 0, (ctx) => ctx.blueprint.modules?.decor_light),
  criterion('interior.modules.plant', 'Interior', 'Decorative plants exist', 1, (ctx) => number(ctx.blueprint.modules?.decor_plant) > 0, (ctx) => ctx.blueprint.modules?.decor_plant),

  criterion('export.operations.count', 'Export', 'Exporter produced commands', 3, (ctx) => array(ctx.blueprint.operations).length > 0, (ctx) => array(ctx.blueprint.operations).length),
  criterion('export.operations.match', 'Export', 'Exporter operation count matches blueprint', 2, (ctx) => number(ctx.geometry.exporter?.operationCount) === array(ctx.blueprint.operations).length, (ctx) => `${ctx.geometry.exporter?.operationCount}/${array(ctx.blueprint.operations).length}`),
  criterion('export.coverage', 'Export', 'Exporter coverage check passed', 3, (ctx) => ctx.geometry.exporter?.coverageOk === true, (ctx) => ctx.geometry.exporter?.coverageOk),
  criterion('export.compression', 'Export', 'Exporter compresses below naive setblock output', 2, (ctx) => number(ctx.geometry.exporter?.operationCount) < number(ctx.geometry.exporter?.naiveOperationCount), (ctx) => `${ctx.geometry.exporter?.operationCount}/${ctx.geometry.exporter?.naiveOperationCount}`),
  criterion('export.fill-limit', 'Export', 'Largest fill respects Minecraft limit', 3, (ctx) => number(ctx.geometry.exporter?.largestOperationVolume) <= number(ctx.geometry.exporter?.maxFillVolume, 32768), (ctx) => ctx.geometry.exporter?.largestOperationVolume),
  criterion('export.block-variety', 'Export', 'Export includes a healthy block variety', 2, (ctx) => number(ctx.validation.stats?.blockTypeCount) >= 12, (ctx) => ctx.validation.stats?.blockTypeCount),

  criterion('qa.ok', 'QA', 'BlueprintQAAgent passed', 5, (ctx) => ctx.validation.ok === true, (ctx) => array(ctx.validation.errors).join('; ')),
  criterion('qa.commands', 'QA', 'Command validation passed', 3, (ctx) => checkOk(ctx.validation, 'commands'), (ctx) => checkOk(ctx.validation, 'commands')),
  criterion('qa.rooms', 'QA', 'Room validation passed', 3, (ctx) => checkOk(ctx.validation, 'rooms'), (ctx) => checkOk(ctx.validation, 'rooms')),
  criterion('qa.spatial', 'QA', 'Spatial geometry validation passed', 3, (ctx) => checkOk(ctx.validation, 'spatial-geometry'), (ctx) => checkOk(ctx.validation, 'spatial-geometry')),
  criterion('qa.circulation', 'QA', 'Circulation validation passed', 3, (ctx) => checkOk(ctx.validation, 'circulation'), (ctx) => checkOk(ctx.validation, 'circulation')),
  criterion('qa.agent-contracts', 'QA', 'Integrated agent contracts passed', 3, (ctx) => checkOk(ctx.validation, 'agent-contracts'), (ctx) => checkOk(ctx.validation, 'agent-contracts')),
  criterion('qa.warning-budget', 'QA', 'Warning count stays low', 1, (ctx) => array(ctx.validation.warnings).length <= 3, (ctx) => array(ctx.validation.warnings).length)
];

export class ConstructionEvaluationAgent {
  run(result) {
    const ctx = evaluationContext(result);
    const checks = CRITERIA.map((item) => runCriterion(item, ctx));
    const maxScore = checks.reduce((sum, item) => sum + item.weight, 0);
    const score = checks.reduce((sum, item) => sum + item.points, 0);
    const ratio = maxScore ? score / maxScore : 0;
    const categoryScores = summarizeCategories(checks);
    const failed = checks.filter((item) => !item.ok);

    return {
      source: 'local-construction-evaluation-agent',
      version: EVALUATION_VERSION,
      prompt: ctx.result.prompt || ctx.blueprint.prompt || '',
      score,
      maxScore,
      ratio: Number(ratio.toFixed(4)),
      percent: Math.round(ratio * 100),
      grade: gradeForRatio(ratio),
      passedChecks: checks.length - failed.length,
      totalChecks: checks.length,
      categoryScores,
      redFlags: failed.filter((item) => item.weight >= 3).map(summaryForCheck),
      weakChecks: failed.map(summaryForCheck),
      strengths: checks.filter((item) => item.ok && item.weight >= 3).slice(0, 8).map(summaryForCheck),
      metrics: metrics(ctx),
      checks
    };
  }
}

export function evaluationCriteria() {
  return CRITERIA.map(({ id, category, label, weight }) => ({ id, category, label, weight }));
}

function criterion(id, category, label, weight, pass, value) {
  return { id, category, label, weight, pass, value };
}

function runCriterion(item, ctx) {
  try {
    const ok = Boolean(item.pass(ctx));
    return {
      id: item.id,
      category: item.category,
      label: item.label,
      weight: item.weight,
      ok,
      points: ok ? item.weight : 0,
      value: item.value ? item.value(ctx) : undefined
    };
  } catch (error) {
    return {
      id: item.id,
      category: item.category,
      label: item.label,
      weight: item.weight,
      ok: false,
      points: 0,
      value: error.message
    };
  }
}

function evaluationContext(result = {}) {
  const blueprint = result.blueprint || result;
  return {
    result,
    blueprint,
    validation: result.validation || blueprint.validation || {},
    architecture: result.architecture || blueprint.architecture || {},
    topology: result.topology || blueprint.topology || {},
    spec: result.buildSpec || blueprint.buildSpec || {},
    geometry: result.geometry || blueprint.geometry || {},
    layout: blueprint.layout || {}
  };
}

function summarizeCategories(checks) {
  const categories = {};
  for (const item of checks) {
    categories[item.category] ||= { score: 0, maxScore: 0, passed: 0, total: 0, percent: 0 };
    categories[item.category].score += item.points;
    categories[item.category].maxScore += item.weight;
    categories[item.category].passed += item.ok ? 1 : 0;
    categories[item.category].total += 1;
  }
  for (const item of Object.values(categories)) {
    item.percent = item.maxScore ? Math.round((item.score / item.maxScore) * 100) : 0;
  }
  return categories;
}

function metrics(ctx) {
  return {
    style: ctx.architecture.style,
    styleFamily: ctx.architecture.style_family,
    typology: ctx.spec.typology,
    footprint: ctx.spec.footprint,
    dimensions: `${ctx.spec.width}x${ctx.spec.depth}x${ctx.spec.total_height}`,
    floors: ctx.spec.floors,
    rooms: array(ctx.layout.rooms).length,
    operations: array(ctx.blueprint.operations).length,
    blockTypes: ctx.validation.stats?.blockTypeCount || 0,
    decorPlacements: ctx.blueprint.decorator?.placementCount || 0,
    uniqueDecorBlocks: uniqueDecorBlocks(ctx).size,
    vibrantPlacements: vibrantPlacements(ctx).length,
    failedEdges: ctx.geometry.pathfinder?.failedEdgeCount || 0,
    warnings: array(ctx.validation.warnings).length
  };
}

function gradeForRatio(ratio) {
  if (ratio >= 0.95) return 'S';
  if (ratio >= 0.9) return 'A';
  if (ratio >= 0.82) return 'B';
  if (ratio >= 0.72) return 'C';
  return 'D';
}

function summaryForCheck(item) {
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    weight: item.weight,
    value: item.value
  };
}

function checkOk(validation, name) {
  return array(validation.checks).find((item) => item.name === name)?.ok === true;
}

function uniqueDecorBlocks(ctx) {
  return new Set(array(ctx.blueprint.decorator?.placements).map((item) => blockBase(item.block)).filter(Boolean));
}

function vibrantPlacements(ctx) {
  return array(ctx.blueprint.decorator?.placements).filter((item) => text(item.role).startsWith('vibrant'));
}

function validRoomBounds(room) {
  return number(room.max_x) >= number(room.min_x) &&
    number(room.max_y) >= number(room.min_y) &&
    number(room.max_z) >= number(room.min_z);
}

function blockBase(block) {
  return text(block).split('[')[0];
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function uniqueCount(values) {
  return new Set(values.filter((value) => value !== undefined && value !== '')).size;
}

function between(value, minValue, maxValue) {
  return value >= minValue && value <= maxValue;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function min(values) {
  return values.length ? Math.min(...values) : 0;
}

function text(value) {
  return String(value || '');
}
