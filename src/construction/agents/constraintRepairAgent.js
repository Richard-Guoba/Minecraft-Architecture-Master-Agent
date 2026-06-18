export class ConstraintRepairAgent {
  run(context = {}) {
    const grid = context.grid;
    const modules = moduleCounts(grid);
    const buildSpec = context.buildSpec || {};
    const checks = [];
    const repairs = [];
    const suggestions = [];

    checks.push(check('has-shell', (modules.walls || 0) + (modules.tower || 0) + (modules.sunroom || 0) > 0));
    checks.push(check('has-roof', (modules.roof || 0) + (modules.roof_detail || 0) + (modules.roof_frame || 0) > 0));
    checks.push(check('has-door', (modules.door || 0) > 0));
    checks.push(check('has-circulation', Number(context.paths?.pathfinder?.failedEdgeCount || 0) === 0));
    checks.push(check('has-structure', (modules.structural_frame || 0) + (modules.bracing || 0) + (modules.retaining_wall || 0) >= expectedStructureMinimum(context.structure)));
    checks.push(check('within-height', Number(buildSpec.total_height || 0) <= Number(buildSpec.constraints?.max_total_height || 40)));
    checks.push(check('has-daylight', (modules.windows || 0) + (modules.skylight || 0) + (modules.dormer_window || 0) > 0 || context.facade?.window_system?.glazing_ratio === 'low'));
    checks.push(check('has-entry-approach', (modules.landscape_path || 0) + (modules.entry_path || 0) + (modules.garden || 0) > 0));
    checks.push(check('has-comfort-systems', (modules.decor_light || 0) + (modules.path_light || 0) + (modules.facade_light || 0) > 0));
    checks.push(check('has-safety-or-resilience', resilienceModuleCount(modules) >= expectedResilienceMinimum(context)));

    if (!checks.find((item) => item.name === 'has-door')?.ok) suggestions.push('add fallback main door before export');
    if (!checks.find((item) => item.name === 'has-roof')?.ok) suggestions.push('add flat emergency roof cap');
    if (!checks.find((item) => item.name === 'has-structure')?.ok && context.structure?.engine_hints) suggestions.push('render missing structural hints');
    if ((modules.windows || 0) <= 0 && context.facade?.window_system?.glazing_ratio !== 'low') suggestions.push('add at least one daylight opening');
    if (!checks.find((item) => item.name === 'has-entry-approach')?.ok) suggestions.push('add visible exterior entry path');
    if (!checks.find((item) => item.name === 'has-comfort-systems')?.ok) suggestions.push('add basic lighting comfort layer');
    if (!checks.find((item) => item.name === 'has-safety-or-resilience')?.ok) suggestions.push('render requested resilience modules');

    return {
      source: 'local-constraint-repair-agent',
      ok: checks.every((item) => item.ok),
      checks,
      repairs,
      suggestions,
      stats: {
        moduleCount: Object.keys(modules).length,
        gridCellCount: grid?.size || 0,
        failedEdgeCount: Number(context.paths?.pathfinder?.failedEdgeCount || 0),
        operationBudget: buildSpec.constraints?.minecraft_fill_limit || 32768,
        daylightModules: (modules.windows || 0) + (modules.skylight || 0) + (modules.dormer_window || 0),
        resilienceModules: resilienceModuleCount(modules),
        comfortModules: (modules.decor_light || 0) + (modules.path_light || 0) + (modules.facade_light || 0)
      }
    };
  }
}

function moduleCounts(grid) {
  const counts = {};
  if (!grid) return counts;
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}

function expectedStructureMinimum(structure = {}) {
  const hints = structure.engine_hints || {};
  return hints.render_column_grid || hints.render_stilts || hints.render_retaining_ribs || hints.render_cantilever_braces ? 1 : 0;
}

function expectedResilienceMinimum(context = {}) {
  const hints = context.structure?.engine_hints || {};
  return hints.render_shear_walls || hints.render_wind_ties || hints.render_firebreaks || hints.render_flood_vents ? 1 : 0;
}

function resilienceModuleCount(modules = {}) {
  return (modules.shear_wall || 0) +
    (modules.wind_tie || 0) +
    (modules.firebreak || 0) +
    (modules.flood_vent || 0) +
    (modules.roof_service_frame || 0);
}

function check(name, ok) {
  return { name, ok: Boolean(ok) };
}
