export class StructureAgent {
  run(architectureOrContext = {}, buildSpecInput = {}, topologyInput = {}) {
    if (architectureOrContext.architecture || architectureOrContext.buildSpec || architectureOrContext.topology) {
      return buildFallbackStructure(
        architectureOrContext.architecture || {},
        architectureOrContext.buildSpec || {},
        architectureOrContext.topology || {}
      );
    }
    return buildFallbackStructure(architectureOrContext, buildSpecInput, topologyInput);
  }
}

export function buildFallbackStructure(architecture = {}, buildSpec = {}, topology = {}) {
  const family = String(architecture.style_family || buildSpec.style_family || 'general');
  const supports = String(buildSpec.structural?.supports || architecture.structural_rules?.primary_supports || 'load-bearing-walls');
  const system = String(buildSpec.structural?.system || architecture.structural_rules?.system || 'standard-shell');
  const spanStrategy = String(buildSpec.structural?.span_strategy || architecture.structural_rules?.span_strategy || 'room-scale-spans');
  const volumes = Array.isArray(architecture.volumes) ? architecture.volumes : [];
  const volumeText = volumes.map((item) => `${item.id || ''} ${item.role || ''} ${(item.tags || []).join(' ')} ${item.facade_role || ''}`).join(' ').toLowerCase();
  const floors = Math.max(1, Number(buildSpec.floors || 1));
  const width = Math.max(1, Number(buildSpec.width || 19));
  const depth = Math.max(1, Number(buildSpec.depth || 15));
  const shellThickness = Math.max(1, Number(buildSpec.shell_thickness || 1));

  const signals = {
    long_span: /long-span|open|mega-frame|large-openings/i.test(`${spanStrategy} ${system}`) || Boolean(buildSpec.facade?.large_glass),
    buttress: /buttress|gothic|vault|扶壁/i.test(`${supports} ${system}`) || family === 'gothic',
    stilt: /stilt|tree-trunk|高脚|吊脚/i.test(`${supports} ${system}`) || family === 'treehouse' || family === 'tropical',
    retaining: /retaining|earth|underground|地堡|地下/i.test(`${supports} ${system}`) || family === 'subterranean',
    cantilever: /cantilever|悬挑|cliff|deck|view-platform/.test(volumeText) || family === 'cliffside',
    treehouse: family === 'treehouse' || /treehouse|support-trunk|trunk-core/.test(volumeText),
    greenhouse: family === 'greenhouse-house' || /greenhouse|sunroom|transparent|glass/.test(volumeText),
    neon_spine: family === 'cyberpunk' || /neon|service-core/.test(volumeText),
    alpine: family === 'alpine'
  };

  const supportElements = [
    support('continuous-footing', 'continuous-footing', 'all', { module: 'foundation_anchor', priority: 'primary' })
  ];
  const reinforcementElements = [];
  const bracingElements = [];
  const roofElements = [];

  if (signals.long_span || floors > 1 || ['classical', 'industrial', 'modern', 'cyberpunk', 'greenhouse-house'].includes(family)) {
    supportElements.push(support('main-column-grid', 'column-grid', 'main', {
      module: 'structural_frame',
      spacing: chooseColumnSpacing(width, depth, family),
      priority: signals.long_span ? 'primary' : 'secondary'
    }));
  }

  if (signals.buttress) {
    supportElements.push(support('buttress-row', 'buttress-row', 'main', { module: 'buttress', priority: 'primary' }));
  }

  if (signals.stilt) {
    supportElements.push(support('raised-stilt-grid', signals.treehouse ? 'tree-stilt-grid' : 'stilt-grid', 'main', {
      module: 'structural_frame',
      spacing: signals.treehouse ? 4 : 5,
      priority: 'primary'
    }));
  }

  if (signals.treehouse) {
    supportElements.push(
      support('living-trunk-core', 'tree-trunk-core', 'trunk-core', { module: 'structural_frame', priority: 'primary' }),
      support('deck-posts', 'deck-posts', 'wraparound-deck', { module: 'structural_frame', priority: 'secondary' })
    );
    bracingElements.push(bracing('treehouse-knee-braces', 'knee-brace', 'wraparound-deck', { anchor: 'main', module: 'bracing' }));
  }

  if (signals.cantilever) {
    bracingElements.push(
      bracing('cantilever-knee-braces', 'knee-brace', 'gallery', { anchor: 'main', module: 'bracing' }),
      bracing('rock-or-deck-anchors', 'anchor-ties', 'gallery', { anchor: 'foundation', module: 'foundation_anchor' })
    );
  }

  if (signals.neon_spine) {
    bracingElements.push(bracing('service-spine-x-braces', 'x-brace', 'service-core', { anchor: 'main', module: 'bracing' }));
  }

  if (signals.greenhouse) {
    supportElements.push(support('glass-rib-frame', 'glass-ribs', 'sunroom', { module: 'structural_frame', spacing: 4, priority: 'secondary' }));
  }

  if (signals.retaining) {
    reinforcementElements.push(
      reinforcement('retaining-wall-ribs', 'retaining-ribs', 'main', { module: 'retaining_wall', spacing: 4, shell_thickness: shellThickness }),
      reinforcement('lightwell-ring-beam', 'lightwell-ring', 'lightwell-court', { module: 'structural_frame' })
    );
  }

  if (floors > 1 || shellThickness > 1 || signals.long_span || signals.retaining) {
    reinforcementElements.push(reinforcement('floor-ring-beams', 'ring-beams', 'all', {
      module: 'structural_frame',
      levels: floors,
      spacing: Number(buildSpec.floor_height || 5)
    }));
  }

  if (['gabled', 'hipped', 'pagoda'].includes(String(buildSpec.roof_style || architecture.roof_rules?.style || 'gabled')) || signals.alpine || signals.treehouse || signals.greenhouse) {
    roofElements.push({
      id: signals.alpine ? 'steep-snow-rafter-frame' : signals.greenhouse ? 'glass-roof-ribs' : 'roof-rafter-frame',
      kind: signals.greenhouse ? 'glass-roof-ribs' : 'rafter-frame',
      target: 'all',
      module: 'roof_frame',
      pitch: signals.alpine ? 'steep' : signals.treehouse ? 'canopy' : 'style-default'
    });
  }

  const foundationStrategy = signals.retaining
    ? 'retaining-slab-and-earth-anchors'
    : signals.treehouse ? 'raised-pier-footings-around-trunk'
      : signals.cantilever ? 'anchored-strip-footings'
        : floors > 2 ? 'deepened-continuous-footing'
          : 'continuous-strip-footing';

  return {
    source: 'fallback-structure',
    system,
    style_family: family,
    structural_intent: {
      supports,
      span_strategy: spanStrategy,
      shell_thickness: shellThickness,
      floor_count: floors,
      footprint: buildSpec.footprint || architecture.footprint || 'rectangle'
    },
    foundation: {
      strategy: foundationStrategy,
      material: architecture.materials?.foundation || 'minecraft:stone_bricks',
      footprint: buildSpec.footprint || architecture.footprint || 'rectangle',
      anchor_depth: signals.retaining ? shellThickness + 1 : 1,
      notes: foundationNotes(signals)
    },
    support_elements: uniqueById(supportElements),
    bracing_elements: uniqueById(bracingElements),
    reinforcement_elements: uniqueById(reinforcementElements),
    roof_frame: {
      strategy: roofElements[0]?.kind || 'simple-cap',
      elements: uniqueById(roofElements),
      snow_load: signals.alpine ? 'high' : 'normal',
      skylight_clearance: Boolean(architecture.roof_rules?.skylights)
    },
    load_paths: buildLoadPaths({ signals, floors, hasDeck: signals.cantilever, hasTower: /tower|service-core|trunk-core/.test(volumeText) }),
    stability: {
      lateral_system: lateralSystem(signals, family),
      cantilever_control: signals.cantilever ? 'knee-braces-and-anchor-ties' : 'not-required',
      moisture_strategy: signals.retaining ? 'drained-retaining-walls-and-lightwell' : 'standard',
      redundancy: floors > 2 || signals.long_span ? 'enhanced' : 'normal'
    },
    engine_hints: {
      render_column_grid: hasKind(supportElements, 'column-grid'),
      render_buttresses: signals.buttress,
      render_stilts: signals.stilt,
      render_tree_trunk: signals.treehouse,
      render_cantilever_braces: signals.cantilever,
      render_retaining_ribs: signals.retaining,
      render_ring_beams: reinforcementElements.some((item) => item.kind === 'ring-beams'),
      render_roof_frame: roofElements.length > 0,
      render_glass_ribs: signals.greenhouse,
      render_service_braces: signals.neon_spine
    }
  };
}

function support(id, kind, target, extra = {}) {
  return { id, kind, target, ...extra };
}

function bracing(id, kind, target, extra = {}) {
  return { id, kind, target, ...extra };
}

function reinforcement(id, kind, target, extra = {}) {
  return { id, kind, target, ...extra };
}

function chooseColumnSpacing(width, depth, family) {
  if (family === 'industrial' || family === 'cyberpunk') return 6;
  if (family === 'greenhouse-house') return 4;
  return Math.max(4, Math.min(6, Math.round(Math.min(width, depth) / 3)));
}

function foundationNotes(signals) {
  const notes = [];
  if (signals.retaining) notes.push('resist lateral earth pressure');
  if (signals.cantilever) notes.push('anchor view decks back to main mass');
  if (signals.treehouse) notes.push('separate trunk core from lightweight living deck');
  if (signals.greenhouse) notes.push('keep glass spans on light rib frame');
  return notes.length ? notes : ['continuous bearing under exterior shell'];
}

function buildLoadPaths({ signals, floors, hasDeck, hasTower }) {
  const paths = [
    { id: 'roof-to-walls', from: 'roof_frame', through: 'shell_or_ring_beam', to: 'foundation' },
    { id: 'floor-to-footing', from: `${floors}-floor-stack`, through: 'bearing_walls_or_columns', to: 'continuous-footing' }
  ];
  if (hasDeck) paths.push({ id: 'deck-to-anchor', from: 'view_deck', through: 'knee_braces', to: 'main_foundation' });
  if (hasTower) paths.push({ id: 'tower-to-core', from: 'vertical_core', through: 'core_walls', to: 'foundation' });
  if (signals.retaining) paths.push({ id: 'earth-pressure-to-ribs', from: 'retained_soil', through: 'retaining_ribs', to: 'slab_and_side_walls' });
  return paths;
}

function lateralSystem(signals, family) {
  if (signals.retaining) return 'retaining-ribs-and-box-action';
  if (signals.treehouse) return 'stilt-frame-with-trunk-core';
  if (signals.cantilever) return 'anchored-cantilever-frame';
  if (signals.neon_spine || family === 'industrial') return 'expressed-braced-frame';
  if (signals.buttress) return 'buttress-stabilized-masonry';
  return 'bearing-wall-box-action';
}

function hasKind(items, kind) {
  return items.some((item) => item.kind === kind);
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
