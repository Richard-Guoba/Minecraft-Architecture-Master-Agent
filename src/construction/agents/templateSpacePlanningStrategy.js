const PUBLIC_VIEW_TYPES = new Set(['living', 'great_hall', 'lounge', 'dining', 'sunroom', 'greenhouse']);
const SERVICE_TYPES = new Set(['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'armory']);
const QUIET_TYPES = new Set(['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room', 'chapel']);
const CIRCULATION_TYPES = new Set(['entry', 'stairs', 'corridor']);

export function buildTemplateSpacePlanningStrategy({ prompt = '', architecture = {}, buildSpec = {}, topology = {} } = {}) {
  const composition = templateCompositionStrategyFor(architecture, buildSpec);
  const directives = composition.directives || {};
  if (!shouldActivateSpacePlanning(composition, directives, prompt)) {
    return { active: false, reason: 'no-template-composition-space-signal' };
  }

  const nodes = Array.isArray(topology.nodes) ? topology.nodes : [];
  const frontSide = normalizeSide(buildSpec.door_side || architecture.facade_rules?.front_side || topology.facade_alignment?.front_side || 'south');
  const viewSide = inferViewSide({ frontSide, directives, prompt, architecture });
  const serviceSide = inferServiceSide(viewSide, frontSide);
  const quietSide = inferQuietSide(viewSide, frontSide);
  const publicCore = choosePublicCore(nodes, topology.circulation_rules?.public_core);
  const verticalCore = nodes.find((node) => node.type === 'stairs')?.id || topology.circulation_rules?.vertical_core;
  const splitStrategy = chooseSplitStrategy(directives, composition, topology.bsp_hints?.split_strategy);
  const floorCount = Math.max(1, Number(buildSpec.floors || Math.max(0, ...nodes.map((node) => Number(node.floor || 0))) + 1 || 1));
  const roomOrderByFloor = buildRoomOrderByFloor(nodes, {
    floorCount,
    splitStrategy,
    viewSide,
    serviceSide,
    quietSide,
    directives
  });

  return {
    active: true,
    source: 'template-space-planning-strategy-v1',
    readiness: composition.readiness || 'unknown',
    composition_source: composition.source || 'template-composition-strategy-v1',
    entry_side: frontSide,
    view_side: viewSide,
    service_side: serviceSide,
    quiet_side: quietSide,
    public_core: publicCore,
    vertical_core: verticalCore,
    split_strategy: splitStrategy,
    spatial_intents: spatialIntents(directives),
    entry_sequence: buildEntrySequence({ publicCore, verticalCore, directives, viewSide }),
    room_orientation_rules: buildRoomOrientationRules({ publicCore, viewSide, serviceSide, quietSide, directives }),
    adjacency_edges: buildAdjacencyEdges(nodes, { publicCore, verticalCore, directives }),
    site_connections: buildTemplateSiteConnections(nodes, { publicCore, directives }),
    facade_alignment: buildTemplateFacadeAlignment(nodes, { publicCore, viewSide, quietSide, directives }),
    bsp_hints: {
      template_space_planning_active: true,
      template_view_side: viewSide,
      template_service_side: serviceSide,
      template_quiet_side: quietSide,
      template_entry_sequence: sequenceIds(publicCore, verticalCore, directives),
      split_strategy: splitStrategy,
      room_order_by_floor: roomOrderByFloor,
      public_core_position: directives.use_waterfront_transition || directives.use_large_view_glass ? 'view-facing' : topology.bsp_hints?.public_core_position,
      soft_boundary_bias: directives.use_large_view_glass || directives.use_courtyard_or_patio_void ? 'high' : topology.bsp_hints?.soft_boundary_bias || 'medium',
      glass_front_bias: directives.use_large_view_glass ? 'public-rooms-on-view-side' : topology.bsp_hints?.glass_front_bias,
      courtyard_bias: directives.use_courtyard_or_patio_void ? 'rooms-face-inward-with-public-threshold' : topology.bsp_hints?.courtyard_bias,
      service_band_bias: 'push-service-rooms-away-from-primary-view'
    },
    directives: {
      use_public_view_axis: Boolean(directives.use_waterfront_transition || directives.use_large_view_glass),
      use_entry_forecourt_axis: Boolean(directives.use_foreground_garden_sequence),
      use_courtyard_room_ring: Boolean(directives.use_courtyard_or_patio_void),
      use_vertical_reveal: Boolean(directives.use_vertical_accent),
      use_layered_terrain_arrival: Boolean(directives.use_layered_terrain_base)
    }
  };
}

export function applyTemplateSpacePlanningStrategy(topology = {}, context = {}) {
  const base = topology && typeof topology === 'object' ? topology : {};
  const strategy = buildTemplateSpacePlanningStrategy({ ...context, topology: base });
  if (!strategy.active) return base;

  const nodes = (base.nodes || []).map((node) => patchNodeForStrategy(node, strategy));
  const edges = mergeEdges(base.edges || [], strategy.adjacency_edges || [], nodes);
  const floorProgram = rebuildFloorProgramWithNodes(base.floor_program || base.floorProgram, nodes);
  const zoning = rebuildZoningWithNodes(base.zoning, nodes);
  const facadeAlignment = mergeFacadeAlignment(base.facade_alignment || {}, strategy.facade_alignment || {});
  const siteConnections = mergeSiteConnections(base.site_connections || [], strategy.site_connections || [], nodes);

  return {
    ...base,
    nodes,
    edges,
    floor_program: floorProgram,
    zoning,
    circulation_rules: {
      ...(base.circulation_rules || {}),
      public_core: nodeExists(nodes, strategy.public_core) ? strategy.public_core : base.circulation_rules?.public_core,
      vertical_core: nodeExists(nodes, strategy.vertical_core) ? strategy.vertical_core : base.circulation_rules?.vertical_core,
      template_entry_sequence: strategy.entry_sequence,
      template_space_planning: {
        view_side: strategy.view_side,
        service_side: strategy.service_side,
        quiet_side: strategy.quiet_side,
        split_strategy: strategy.split_strategy
      }
    },
    facade_alignment: facadeAlignment,
    site_connections: siteConnections,
    bsp_hints: {
      ...(base.bsp_hints || {}),
      ...strategy.bsp_hints,
      room_order_by_floor: mergeRoomOrders(base.bsp_hints?.room_order_by_floor, strategy.bsp_hints.room_order_by_floor)
    },
    template_space_plan: strategy
  };
}

function templateCompositionStrategyFor(architecture = {}, buildSpec = {}) {
  return architecture.generation_hints?.template_composition_strategy ||
    architecture.massing_rules?.template_composition_strategy ||
    architecture.site_rules?.template_composition_strategy ||
    architecture.facade_rules?.template_composition_strategy ||
    architecture.detail_rules?.template_composition_strategy ||
    buildSpec.design?.template_composition_strategy ||
    architecture.template_knowledge?.recommendations?.composition_strategy ||
    buildSpec.template_knowledge?.recommendations?.composition_strategy ||
    {};
}

function shouldActivateSpacePlanning(composition = {}, directives = {}, prompt = '') {
  if (!composition || !Object.keys(composition).length) return false;
  if (composition.readiness === 'none') return false;
  const promptText = String(prompt || '').toLowerCase();
  const explicitPrompt = /整体构图|空间序列|入口序列|平面|布局|主轴|侧翼|庭院|水边|湖边|前景|花园|地形|露台|composition|massing|layout|axis|courtyard|waterfront|garden|terrain|terrace/.test(promptText);
  const explicitSignal = Boolean(directives.prompt_signals?.explicit_composition_request || explicitPrompt);
  const hasPromptSignals = directives.prompt_signals && Object.keys(directives.prompt_signals).length > 0;
  if (hasPromptSignals) return explicitSignal;
  return explicitSignal || Boolean(directives.use_waterfront_transition || directives.use_foreground_garden_sequence);
}

function inferViewSide({ frontSide, directives = {}, prompt = '', architecture = {} }) {
  const text = `${prompt} ${JSON.stringify(architecture.volumes || [])}`.toLowerCase();
  const explicit = text.match(/(?:view|water|lake|deck|terrace|platform|观景|水边|湖边|露台|平台)[^a-z\u4e00-\u9fa5]*(north|south|east|west|北|南|东|西)/);
  if (explicit) return normalizeSide(explicit[1]);
  const viewVolumeSide = directionalViewVolumeSide(architecture.volumes);
  if (viewVolumeSide) return viewVolumeSide;
  if (/north.*deck|north.*view|北.*水|北.*景/.test(text)) return 'north';
  if (/east.*deck|east.*view|东.*水|东.*景/.test(text)) return 'east';
  if (/west.*deck|west.*view|西.*水|西.*景/.test(text)) return 'west';
  if (directives.use_waterfront_transition || directives.use_large_view_glass) return frontSide || 'south';
  if (directives.use_foreground_garden_sequence) return frontSide || 'south';
  return frontSide || 'south';
}

function directionalViewVolumeSide(volumes = []) {
  for (const volume of Array.isArray(volumes) ? volumes : []) {
    const text = `${volume.id || ''} ${volume.role || ''} ${volume.purpose || ''} ${volume.facade_role || ''} ${(volume.tags || []).join(' ')}`.toLowerCase();
    if (!/deck|view|water|terrace|platform|湖|水|观景|露台|平台/.test(text)) continue;
    const relation = String(volume.placement?.relation || '').toLowerCase();
    if (/north|北/.test(relation)) return 'north';
    if (/south|front|南/.test(relation)) return 'south';
    if (/east|东/.test(relation)) return 'east';
    if (/west|西/.test(relation)) return 'west';
  }
  return undefined;
}

function inferServiceSide(viewSide, frontSide) {
  if (['north', 'south'].includes(viewSide)) return 'west';
  if (['east', 'west'].includes(viewSide)) return oppositeSide(frontSide);
  return 'west';
}

function inferQuietSide(viewSide, frontSide) {
  if (viewSide === frontSide) return oppositeSide(frontSide);
  return oppositeSide(viewSide);
}

function choosePublicCore(nodes = [], preferred) {
  if (nodeExists(nodes, preferred)) return preferred;
  return nodes.find((node) => node.id === 'living')?.id ||
    nodes.find((node) => ['living', 'great_hall', 'lounge'].includes(node.type))?.id ||
    nodes.find((node) => node.zone === 'public')?.id ||
    nodes[0]?.id ||
    'living';
}

function chooseSplitStrategy(directives = {}, composition = {}, fallback = 'weighted') {
  if (directives.use_waterfront_transition || directives.use_large_view_glass) return 'view-side-cluster';
  if (directives.use_courtyard_or_patio_void) return 'courtyard-ring';
  if (directives.use_foreground_garden_sequence || directives.use_layered_terrain_base) return 'front-back-bands';
  if (directives.use_vertical_accent) return 'cross-axis';
  if ((composition.approach_sequence || []).some((item) => item.pattern_type === 'central_axis_entry')) return 'axis-balanced';
  return fallback || 'weighted';
}

function buildRoomOrderByFloor(nodes = [], context = {}) {
  const orders = {};
  for (let floor = 0; floor < context.floorCount; floor += 1) {
    const floorNodes = nodes.filter((node) => Number(node.floor || 0) === floor);
    const base = floor === 0 ? groundFloorOrder(context) : upperFloorOrder(context);
    orders[floor] = mergeOrder(base, floorNodes.map((node) => node.id));
  }
  return orders;
}

function groundFloorOrder({ splitStrategy, directives = {} }) {
  if (splitStrategy === 'courtyard-ring') {
    return ['garage', 'utility', 'storage', 'bathroom', 'kitchen', 'entry', 'corridor', 'living', 'dining', 'lounge', 'tatami', 'tea_room', 'sunroom'];
  }
  if (directives.use_vertical_accent) {
    return ['garage', 'utility', 'storage', 'bathroom', 'kitchen', 'dining', 'living', 'lounge', 'stairs', 'tower', 'entry'];
  }
  if (directives.use_waterfront_transition || directives.use_large_view_glass) {
    return ['garage', 'storage', 'utility', 'bathroom', 'kitchen', 'study', 'bedroom', 'master_bedroom', 'dining', 'lounge', 'living', 'great_hall', 'sunroom', 'greenhouse', 'entry'];
  }
  if (directives.use_foreground_garden_sequence || directives.use_layered_terrain_base) {
    return ['garage', 'storage', 'utility', 'bathroom', 'kitchen', 'study', 'dining', 'living', 'lounge', 'sunroom', 'entry'];
  }
  return ['storage', 'bathroom', 'kitchen', 'dining', 'living', 'entry'];
}

function upperFloorOrder({ directives = {} }) {
  if (directives.use_large_view_glass || directives.use_waterfront_transition) {
    return ['bathroom', 'storage', 'corridor', 'bedroom', 'study', 'master_bedroom', 'balcony', 'tower'];
  }
  return ['bathroom', 'storage', 'corridor', 'study', 'bedroom', 'master_bedroom', 'balcony', 'tower'];
}

function buildEntrySequence({ publicCore, verticalCore, directives = {}, viewSide }) {
  const thresholds = ['forecourt', 'entry'];
  if (directives.use_layered_terrain_base) thresholds.unshift('terrain-plinth');
  if (directives.use_foreground_garden_sequence) thresholds.unshift('garden-rooms');
  thresholds.push(publicCore || 'living');
  if (directives.use_vertical_accent && verticalCore) thresholds.push(verticalCore);
  if (directives.use_waterfront_transition) thresholds.push('view-deck', 'water-edge');
  return {
    axis: ['north', 'south'].includes(viewSide) ? 'z' : 'x',
    thresholds: [...new Set(thresholds)],
    rooms: sequenceIds(publicCore, verticalCore, directives),
    intent: directives.use_waterfront_transition
      ? 'entry compresses into public view room and then releases toward water'
      : directives.use_foreground_garden_sequence
        ? 'foreground garden frames entry before public core'
        : 'entry clarifies the primary spatial axis'
  };
}

function sequenceIds(publicCore, verticalCore, directives = {}) {
  return [
    'entry',
    directives.use_vertical_accent ? verticalCore : undefined,
    publicCore,
    directives.use_waterfront_transition ? 'template-view-deck' : undefined
  ].filter(Boolean);
}

function buildRoomOrientationRules({ publicCore, viewSide, serviceSide, quietSide, directives = {} }) {
  const rules = [
    {
      applies_to: ['living', 'great_hall', 'lounge', 'dining', 'sunroom', 'greenhouse'].filter(Boolean),
      orientation: directives.use_courtyard_or_patio_void && !directives.use_waterfront_transition ? 'courtyard' : viewSide,
      intent: 'public rooms hold the main view and outdoor threshold'
    },
    {
      applies_to: ['kitchen', 'bathroom', 'utility', 'storage', 'garage'],
      orientation: serviceSide,
      intent: 'service rooms form a side/back band away from the primary view'
    },
    {
      applies_to: ['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room'],
      orientation: directives.use_courtyard_or_patio_void ? 'courtyard' : quietSide,
      intent: 'quiet rooms face protected garden or quieter side'
    }
  ];
  if (publicCore) rules.unshift({ applies_to: [publicCore], orientation: viewSide, intent: 'public core anchors the template view axis' });
  return rules;
}

function buildAdjacencyEdges(nodes = [], { publicCore, verticalCore, directives = {} }) {
  const ids = new Set(nodes.map((node) => node.id));
  const byType = (type) => nodes.find((node) => node.type === type)?.id;
  const living = publicCore || byType('living') || byType('great_hall');
  const dining = byType('dining');
  const kitchen = byType('kitchen');
  const lounge = byType('lounge') || byType('sunroom') || byType('greenhouse');
  const study = byType('study');
  const edges = [];
  const add = (from, to, relation, priority = 'template') => {
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) return;
    edges.push({ from, to, relation, priority });
  };

  add('entry', living, 'template-entry-to-public-core', 'required');
  if (directives.use_vertical_accent && verticalCore) add('entry', verticalCore, 'template-entry-reveals-vertical-core', 'required');
  if (directives.use_waterfront_transition) {
    add(living, lounge, 'template-public-to-view-threshold', 'high');
    add(living, dining, 'template-open-public-view-sequence', 'high');
  }
  if (directives.use_foreground_garden_sequence) add('entry', dining || living, 'template-forecourt-to-social-room', 'high');
  if (directives.use_courtyard_or_patio_void) {
    add(living, study, 'template-quiet-room-off-courtyard', 'normal');
    add(living, byType('tea_room') || byType('tatami'), 'template-courtyard-room-ring', 'high');
  }
  add(dining || living, kitchen, 'template-service-near-public-but-side-banded', 'normal');
  return edges;
}

function buildTemplateSiteConnections(nodes = [], { publicCore, directives = {} }) {
  const ids = new Set(nodes.map((node) => node.id));
  const connections = [];
  const add = (from, to, relation) => {
    if (!from || !ids.has(from)) return;
    connections.push({ from, to, relation });
  };
  add('entry', directives.use_foreground_garden_sequence ? 'foreground_garden' : 'entry_forecourt', 'template-approach-axis');
  if (directives.use_waterfront_transition) add(publicCore, 'water_edge', 'template-view-and-deck-access');
  if (directives.use_courtyard_or_patio_void) add(publicCore, 'courtyard_or_patio', 'template-public-courtyard-threshold');
  if (directives.use_layered_terrain_base) add('entry', 'layered_terrain_base', 'template-stepped-arrival');
  return connections;
}

function buildTemplateFacadeAlignment(nodes = [], { publicCore, viewSide, quietSide, directives = {} }) {
  const publicRooms = nodes
    .filter((node) => PUBLIC_VIEW_TYPES.has(node.type) || node.id === publicCore)
    .map((node) => node.id);
  const quietRooms = nodes
    .filter((node) => QUIET_TYPES.has(node.type))
    .map((node) => node.id);
  return {
    template_view_side: viewSide,
    template_public_view_rooms: publicRooms,
    template_quiet_side: quietSide,
    template_quiet_rooms: quietRooms,
    glass_priority_rooms: directives.use_large_view_glass ? publicRooms.slice(0, 4) : undefined,
    courtyard_priority_rooms: directives.use_courtyard_or_patio_void ? quietRooms.concat(publicRooms.slice(0, 2)) : undefined
  };
}

function patchNodeForStrategy(node = {}, strategy = {}) {
  const type = String(node.type || 'room');
  const tags = new Set(normalizeStringArray(node.tags));
  const patch = {};

  if (type === 'entry' || node.access === 'main-door') {
    patch.orientation = strategy.entry_side;
    tags.add('template-axis-entry');
  } else if (PUBLIC_VIEW_TYPES.has(type) || node.id === strategy.public_core) {
    patch.orientation = strategy.directives.use_courtyard_room_ring && !strategy.directives.use_public_view_axis ? 'courtyard' : strategy.view_side;
    patch.daylight = strategy.directives.use_public_view_axis ? 'high' : node.daylight;
    tags.add('template-view-facing');
    if (strategy.directives.use_public_view_axis) tags.add('template-public-view-axis');
  } else if (SERVICE_TYPES.has(type)) {
    patch.orientation = strategy.service_side;
    tags.add('template-service-band');
  } else if (QUIET_TYPES.has(type)) {
    patch.orientation = strategy.directives.use_courtyard_room_ring ? 'courtyard' : strategy.quiet_side;
    tags.add('template-quiet-side');
  } else if (CIRCULATION_TYPES.has(type)) {
    tags.add('template-circulation-spine');
  }

  if (strategy.directives.use_vertical_reveal && (type === 'stairs' || type === 'tower')) tags.add('template-vertical-reveal');

  return {
    ...node,
    ...dropUndefined(patch),
    tags: [...tags]
  };
}

function mergeEdges(existing = [], additions = [], nodes = []) {
  const ids = new Set(nodes.map((node) => node.id));
  const map = new Map();
  for (const edge of [...existing, ...additions]) {
    if (!edge?.from || !edge?.to || edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to)) continue;
    const key = `${edge.from}->${edge.to}`;
    const previous = map.get(key);
    if (!previous ||
      priorityRank(edge.priority) > priorityRank(previous.priority) ||
      (priorityRank(edge.priority) === priorityRank(previous.priority) && /^template-/.test(String(edge.relation || '')))) {
      map.set(key, { ...edge });
    }
  }
  return [...map.values()];
}

function mergeSiteConnections(existing = [], additions = [], nodes = []) {
  const ids = new Set(nodes.map((node) => node.id));
  const map = new Map();
  for (const item of [...existing, ...additions]) {
    if (!item?.from || !item?.to || !ids.has(item.from)) continue;
    map.set(`${item.from}->${item.to}->${item.relation || 'connected'}`, {
      from: item.from,
      to: item.to,
      relation: item.relation || 'connected'
    });
  }
  return [...map.values()];
}

function mergeFacadeAlignment(base = {}, patch = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) result[key] = [...new Set([...(Array.isArray(result[key]) ? result[key] : []), ...value])];
    else result[key] = value;
  }
  return result;
}

function mergeRoomOrders(existing = {}, patch = {}) {
  const result = { ...(existing || {}) };
  for (const [floor, order] of Object.entries(patch || {})) {
    result[floor] = mergeOrder(Array.isArray(order) ? order : [], Array.isArray(result[floor]) ? result[floor] : []);
  }
  return result;
}

function mergeOrder(base = [], ids = []) {
  return [...new Set([...base.filter(Boolean).map(String), ...ids.filter(Boolean).map(String)])];
}

function rebuildFloorProgramWithNodes(program = [], nodes = []) {
  if (!Array.isArray(program) || !program.length) return buildFloorProgram(nodes);
  const byFloor = new Map();
  for (const node of nodes) {
    const floor = Number(node.floor || 0);
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor).push(node);
  }
  return program.map((item, index) => {
    const floor = Number.isFinite(Number(item?.floor)) ? Number(item.floor) : index;
    const floorNodes = byFloor.get(floor) || [];
    return {
      ...item,
      public: floorNodes.filter((node) => node.zone === 'public').map((node) => node.id),
      private: floorNodes.filter((node) => node.zone === 'private').map((node) => node.id),
      service: floorNodes.filter((node) => node.zone === 'service').map((node) => node.id),
      circulation: floorNodes.filter((node) => node.zone === 'circulation').map((node) => node.id),
      outdoor: floorNodes.filter((node) => node.zone === 'outdoor').map((node) => node.id)
    };
  });
}

function rebuildZoningWithNodes(zoning = {}, nodes = []) {
  const next = {
    public: nodes.filter((node) => node.zone === 'public').map((node) => node.id),
    private: nodes.filter((node) => node.zone === 'private').map((node) => node.id),
    service: nodes.filter((node) => node.zone === 'service').map((node) => node.id),
    circulation: nodes.filter((node) => node.zone === 'circulation').map((node) => node.id),
    outdoor: nodes.filter((node) => node.zone === 'outdoor').map((node) => node.id)
  };
  return Object.keys(zoning || {}).length ? { ...zoning, ...next } : next;
}

function buildFloorProgram(nodes = []) {
  const floors = [...new Set(nodes.map((node) => Number(node.floor || 0)))].sort((a, b) => a - b);
  return floors.map((floor) => {
    const floorNodes = nodes.filter((node) => Number(node.floor || 0) === floor);
    return {
      floor,
      label: floor === 0 ? 'ground' : `level-${floor + 1}`,
      public: floorNodes.filter((node) => node.zone === 'public').map((node) => node.id),
      private: floorNodes.filter((node) => node.zone === 'private').map((node) => node.id),
      service: floorNodes.filter((node) => node.zone === 'service').map((node) => node.id),
      circulation: floorNodes.filter((node) => node.zone === 'circulation').map((node) => node.id),
      outdoor: floorNodes.filter((node) => node.zone === 'outdoor').map((node) => node.id)
    };
  });
}

function spatialIntents(directives = {}) {
  const intents = [];
  if (directives.use_waterfront_transition || directives.use_large_view_glass) intents.push('public-rooms-on-primary-view-side');
  if (directives.use_foreground_garden_sequence) intents.push('entry-forecourt-to-public-core');
  if (directives.use_courtyard_or_patio_void) intents.push('rooms-ring-protected-courtyard-or-patio');
  if (directives.use_vertical_accent) intents.push('entry-reveals-vertical-landmark');
  if (directives.use_layered_terrain_base) intents.push('arrival-absorbs-non-flat-terrain');
  return intents;
}

function nodeExists(nodes = [], id) {
  if (!id) return false;
  return nodes.some((node) => node.id === id);
}

function normalizeSide(value) {
  const text = String(value || '').toLowerCase();
  if (/north|北/.test(text)) return 'north';
  if (/east|东/.test(text)) return 'east';
  if (/west|西/.test(text)) return 'west';
  return 'south';
}

function oppositeSide(side) {
  return {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east'
  }[String(side || 'south')] || 'north';
}

function priorityRank(value) {
  if (value === 'required') return 4;
  if (value === 'high') return 3;
  if (value === 'template') return 2;
  if (value === 'normal') return 1;
  return 0;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item !== undefined && item !== null).map(String);
}

function dropUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
