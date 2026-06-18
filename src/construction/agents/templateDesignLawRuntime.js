const SOURCE = 'stage7d-template-design-law-runtime-v1';

const IMPORTANT_ROOM_TYPES = new Set([
  'entry',
  'living',
  'great_hall',
  'lounge',
  'dining',
  'kitchen',
  'bedroom',
  'master_bedroom',
  'study',
  'bathroom',
  'tatami',
  'tea_room',
  'sunroom',
  'greenhouse',
  'tower',
  'chapel',
  'armory',
  'garage',
  'utility',
  'storage',
  'workshop'
]);

const SUPPORTED_PATTERN_TYPES = new Set([
  'kitchen_work_wall',
  'sleep_niche',
  'library_focus_wall',
  'storage_wall',
  'wet_wall',
  'workshop_bench_wall',
  'display_wall',
  'social_cluster',
  'layered_lighting',
  'plant_corner',
  'circulation_spine'
]);

const ROOM_OBLIGATION_RULES = [
  {
    key: 'living-social-core',
    roomTypes: ['living', 'great_hall', 'lounge'],
    match: /room-living-template-grammar|interior-pattern-social-cluster|social_cluster|conversation|public room|view axis|water-edge|glass-view/i,
    patternTypes: ['social_cluster', 'layered_lighting'],
    clauseId: 'design-law-living-social-core',
    text: 'Template design law: public rooms need a readable social cluster, focal/view wall, soft floor frame, and layered light.'
  },
  {
    key: 'dining-view-service',
    roomTypes: ['dining'],
    match: /room-dining-template-grammar|dining|public room|view axis|sideboard|table-light/i,
    patternTypes: ['social_cluster', 'layered_lighting'],
    clauseId: 'design-law-dining-table-scene',
    text: 'Template design law: dining rooms should organize table, sideboard, view edge, and table lighting as one scene.'
  },
  {
    key: 'kitchen-work-wall',
    roomTypes: ['kitchen'],
    match: /room-kitchen-template-grammar|interior-pattern-kitchen-work-wall|kitchen_work_wall|work-wall|prep-counter|service wall/i,
    patternTypes: ['kitchen_work_wall', 'layered_lighting'],
    clauseId: 'design-law-kitchen-work-wall',
    text: 'Template design law: kitchens need a consolidated work wall with range, prep, pantry/storage, and task light.'
  },
  {
    key: 'sleep-niche',
    roomTypes: ['bedroom', 'master_bedroom'],
    match: /room-bedroom-template-grammar|interior-pattern-sleep-niche|sleep_niche|bedside|wardrobe|sleep/i,
    patternTypes: ['sleep_niche', 'layered_lighting'],
    clauseId: 'design-law-bedroom-sleep-niche',
    text: 'Template design law: bedrooms need a sleep niche with paired bedside support, reading light, wardrobe, and soft edge.'
  },
  {
    key: 'study-focus-wall',
    roomTypes: ['study'],
    match: /room-study-template-grammar|interior-pattern-library-focus-wall|library_focus_wall|study|desk|library|reading/i,
    patternTypes: ['library_focus_wall', 'display_wall', 'layered_lighting'],
    clauseId: 'design-law-study-library-focus',
    text: 'Template design law: studies need a desk anchor, library/display wall, reading light, storage, and quiet floor zone.'
  },
  {
    key: 'wet-wall',
    roomTypes: ['bathroom'],
    match: /room-bathroom-template-grammar|interior-pattern-wet-wall|wet_wall|bath|wet wall|mirror/i,
    patternTypes: ['wet_wall', 'layered_lighting'],
    clauseId: 'design-law-bathroom-wet-wall',
    text: 'Template design law: bathrooms should consolidate basin/counter/mirror light on a wet wall and protect privacy.'
  },
  {
    key: 'entry-sequence',
    roomTypes: ['entry'],
    match: /entry|arrival|threshold|foreground garden|approach|circulation_spine|terrain plinth/i,
    patternTypes: ['circulation_spine', 'display_wall', 'layered_lighting'],
    clauseId: 'design-law-entry-arrival-sequence',
    text: 'Template design law: entries need an arrival sequence with runner, marker, storage/display edge, and clear release to the public core.'
  },
  {
    key: 'circulation-spine',
    roomTypes: ['corridor', 'stairs'],
    match: /interior-pattern-circulation-spine|circulation_spine|circulation|wayfinding|threshold/i,
    patternTypes: ['circulation_spine'],
    clauseId: 'design-law-circulation-spine',
    text: 'Template design law: circulation spaces should stay restrained while using light and edge markers to clarify the path.'
  },
  {
    key: 'storage-wall',
    roomTypes: ['storage', 'utility'],
    match: /room-storage-template-grammar|interior-pattern-storage-wall|storage_wall|storage|utility/i,
    patternTypes: ['storage_wall', 'layered_lighting'],
    clauseId: 'design-law-storage-service-wall',
    text: 'Template design law: storage and utility rooms need a clear service wall, reachable inventory light, and open aisle.'
  },
  {
    key: 'workshop-wall',
    roomTypes: ['workshop', 'garage', 'armory'],
    match: /workshop_bench_wall|workbench|tool|garage|armory|forge|parts/i,
    patternTypes: ['workshop_bench_wall', 'storage_wall', 'layered_lighting'],
    clauseId: 'design-law-workshop-bench-wall',
    text: 'Template design law: workshop-like rooms need a bench wall, tool/storage run, task light, and durable floor edge.'
  },
  {
    key: 'garden-room',
    roomTypes: ['sunroom', 'greenhouse', 'tatami', 'tea_room'],
    match: /garden|plant|courtyard|interior-view|greenhouse|sunroom|tatami|tea/i,
    patternTypes: ['plant_corner', 'display_wall', 'layered_lighting'],
    clauseId: 'design-law-garden-room-edge',
    text: 'Template design law: garden-facing rooms need plant/display edges, quiet seating, and soft light tied to the exterior scene.'
  }
];

export function extractTemplateDesignLawPack(architecture = {}, buildSpec = {}) {
  const candidates = [
    architecture.generation_hints?.template_design_law_pack,
    architecture.detail_rules?.template_design_law_pack,
    architecture.template_knowledge?.recommendations?.design_law_pack,
    buildSpec.design?.template_design_law_pack,
    buildSpec.template_knowledge?.recommendations?.design_law_pack,
    buildSpec.template_design_law_pack,
    architecture.template_design_law_pack,
    objectFromLooseLawFields(architecture.generation_hints),
    objectFromLooseLawFields(architecture.detail_rules),
    objectFromLooseLawFields(buildSpec.design)
  ].filter((item) => item && typeof item === 'object' && Object.keys(item).length);

  if (!candidates.length) return inactiveLawPack('template design law pack not found');

  const selectedLaws = [];
  const interiorLaws = [];
  const clauses = [];
  const requestedDomains = [];
  let source = SOURCE;
  let active = false;

  for (const candidate of candidates) {
    if (candidate.source) source = candidate.source;
    active = active || Boolean(candidate.active);
    selectedLaws.push(...array(candidate.selected_laws), ...array(candidate.design_laws));
    interiorLaws.push(...array(candidate.interior_laws), ...array(candidate.interior_design_laws));
    clauses.push(...array(candidate.implementation_clauses), ...array(candidate.directive_summary), ...array(candidate.design_law_clauses));
    requestedDomains.push(...array(candidate.requested_domains));
  }

  const dedupedSelected = dedupeLaws(selectedLaws);
  const dedupedInterior = dedupeLaws(interiorLaws);
  const dedupedClauses = dedupeStrings([
    ...clauses,
    ...dedupedSelected.flatMap((law) => law.implementation_clauses || []),
    ...dedupedInterior.flatMap((law) => law.implementation_clauses || [])
  ]);

  return {
    source,
    active: active || dedupedSelected.length > 0 || dedupedInterior.length > 0 || dedupedClauses.length > 0,
    selected_count: dedupedSelected.length,
    interior_selected_count: dedupedInterior.length,
    requested_domains: dedupeStrings(requestedDomains),
    selected_laws: dedupedSelected,
    interior_laws: dedupedInterior,
    implementation_clauses: dedupedClauses
  };
}

export function buildTemplateDesignLawRuntime({
  prompt = '',
  architecture = {},
  buildSpec = {},
  topology = {},
  rooms = []
} = {}) {
  const inheritedRuntime = topology.template_design_law_runtime;
  const lawPack = extractTemplateDesignLawPack(architecture, buildSpec);
  if (!lawPack.active) {
    if (inheritedRuntime?.active && Array.isArray(inheritedRuntime.room_obligations) && inheritedRuntime.room_obligations.length) {
      return {
        ...inheritedRuntime,
        source: SOURCE,
        inherited_from_topology: true
      };
    }
    return {
      source: SOURCE,
      active: false,
      reason: lawPack.reason || 'template-design-law-pack-inactive',
      selected_count: 0,
      interior_selected_count: 0,
      room_obligations: [],
      topology_directives: {},
      implementation_clauses: [],
      engine_hints: { use_template_design_laws: false }
    };
  }

  const roomRefs = normalizeRoomRefs(rooms.length ? rooms : topology.nodes || []);
  const laws = dedupeLaws([...(lawPack.selected_laws || []), ...(lawPack.interior_laws || [])]);
  const lawText = [prompt, ...laws.map(searchTextForLaw), ...(lawPack.implementation_clauses || [])].join(' ');
  const topologyDirectives = buildTopologyDirectives({ laws, clauses: lawPack.implementation_clauses || [], roomRefs, text: lawText });
  const roomObligations = buildRoomObligations(roomRefs, { laws, clauses: lawPack.implementation_clauses || [], text: lawText, topologyDirectives });
  const patternTypes = dedupeStrings(roomObligations.flatMap((item) => item.pattern_types || []));

  return {
    source: SOURCE,
    active: true,
    law_pack_source: lawPack.source,
    selected_count: lawPack.selected_count || laws.length,
    interior_selected_count: lawPack.interior_selected_count || laws.filter((law) => ['interior', 'room'].includes(law.domain)).length,
    selected_laws: lawPack.selected_laws || [],
    interior_laws: lawPack.interior_laws || [],
    implementation_clauses: lawPack.implementation_clauses || [],
    topology_directives: topologyDirectives,
    room_obligations: roomObligations,
    engine_hints: {
      use_template_design_laws: true,
      room_obligation_count: roomObligations.length,
      topology_directive_count: Object.values(topologyDirectives).filter(Boolean).length,
      interior_pattern_types: patternTypes,
      requires_identity_stack: roomObligations.some((item) => item.required_layers?.includes('identity-stack')),
      requires_view_axis: Boolean(topologyDirectives.public_view_axis)
    }
  };
}

export function applyTemplateDesignLawRuntimeToTopology(topology = {}, context = {}) {
  const runtime = buildTemplateDesignLawRuntime({ ...context, topology, rooms: topology.nodes || [] });
  if (!runtime.active) return topology;

  const nodes = (topology.nodes || []).map((node) => patchTopologyNode(node, runtime));
  const facadeAlignment = mergeFacadeAlignment(topology.facade_alignment || {}, runtime.topology_directives || {}, nodes);
  const siteConnections = mergeSiteConnections(topology.site_connections || [], runtime.topology_directives || {}, nodes);
  const circulationRules = mergeCirculationRules(topology.circulation_rules || {}, runtime.topology_directives || {});

  return {
    ...topology,
    nodes,
    facade_alignment: facadeAlignment,
    site_connections: siteConnections,
    circulation_rules: circulationRules,
    bsp_hints: {
      ...(topology.bsp_hints || {}),
      template_design_law_active: true,
      template_design_law_source: runtime.law_pack_source,
      template_design_law_room_obligation_count: runtime.room_obligations.length,
      template_design_law_pattern_types: runtime.engine_hints.interior_pattern_types,
      template_design_law_view_axis: runtime.topology_directives.public_view_axis ? 'public-rooms-face-view' : undefined,
      terrain_plinth_sequence: runtime.topology_directives.layered_terrain_arrival ? 'stone-earth-garden-approach' : topology.bsp_hints?.terrain_plinth_sequence,
      roof_terrace_access_required: runtime.topology_directives.roof_terrace_access_required || topology.bsp_hints?.roof_terrace_access_required
    },
    template_design_law_runtime: runtime
  };
}

export function designLawRuntimeForRoom(room = {}, runtime = {}) {
  const roomId = room.id || room.room_id;
  const roomType = normalizeRoomType(room.type);
  const obligation = (runtime.room_obligations || []).find((item) =>
    item.room_id === roomId || normalizeRoomType(item.room_type) === roomType
  );
  return obligation || { active: false, room_id: roomId, room_type: roomType, source: SOURCE };
}

function buildTopologyDirectives({ laws = [], clauses = [], roomRefs = [], text = '' }) {
  const combined = `${text} ${clauses.join(' ')}`.toLowerCase();
  const has = (pattern) => laws.some((law) => pattern.test(searchTextForLaw(law))) || pattern.test(combined);
  const publicRoomIds = roomRefs.filter((room) => ['living', 'great_hall', 'lounge', 'dining', 'sunroom', 'greenhouse'].includes(room.type)).map((room) => room.id);
  const quietRoomIds = roomRefs.filter((room) => ['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room'].includes(room.type)).map((room) => room.id);
  const serviceRoomIds = roomRefs.filter((room) => ['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'workshop'].includes(room.type)).map((room) => room.id);

  const waterfront = has(/site-waterfront-public-threshold|water-edge|waterfront|lake|水边|湖边|deck|reflection/i);
  const glassView = has(/facade-glass-view-axis|large glass|view axis|大玻璃|glass/i);
  const roofTerrace = has(/roof-usable-terrace-system|roof terrace|flat roof|屋顶露台|露台/i);
  const foregroundGarden = has(/site-foreground-garden-rooms|foreground garden|garden rooms|前景|花园|garden/i);
  const terrain = has(/site-terrain-plinth-sequence|terrain|plinth|non-flat|地形|坡|stone\/earth/i);
  const courtyard = has(/space-courtyard-internal-scene|courtyard|patio|void|庭院|中庭/i);

  return {
    public_view_axis: waterfront || glassView,
    waterfront_threshold: waterfront,
    large_glass_view_axis: glassView,
    roof_terrace_access_required: roofTerrace,
    foreground_garden_sequence: foregroundGarden,
    layered_terrain_arrival: terrain,
    courtyard_internal_scene: courtyard,
    public_view_rooms: publicRoomIds,
    quiet_rooms: quietRoomIds,
    service_band_rooms: serviceRoomIds,
    site_thresholds: dedupeStrings([
      terrain ? 'terrain-plinth' : undefined,
      foregroundGarden ? 'foreground-garden-rooms' : undefined,
      waterfront ? 'view-deck' : undefined,
      waterfront ? 'water-edge' : undefined,
      roofTerrace ? 'roof-terrace' : undefined,
      courtyard ? 'courtyard-void' : undefined
    ].filter(Boolean))
  };
}

function buildRoomObligations(roomRefs = [], context = {}) {
  const obligations = [];
  for (const room of roomRefs) {
    const obligation = obligationForRoom(room, context);
    if (obligation.active) obligations.push(obligation);
  }
  return obligations;
}

function obligationForRoom(room = {}, { laws = [], clauses = [], text = '', topologyDirectives = {} } = {}) {
  const type = normalizeRoomType(room.type);
  const roomText = `${text} ${clauses.join(' ')} ${laws.map(searchTextForLaw).join(' ')}`;
  const matchingRules = ROOM_OBLIGATION_RULES.filter((rule) =>
    rule.roomTypes.includes(type) && (rule.match.test(roomText) || topologyDirectiveMatchesRoom(type, topologyDirectives))
  );
  const identityStack = shouldApplyIdentityStack(type, roomText);
  const viewAxis = topologyDirectives.public_view_axis && ['living', 'great_hall', 'lounge', 'dining', 'sunroom', 'greenhouse'].includes(type);
  const gardenRoom = topologyDirectives.foreground_garden_sequence && ['entry', 'living', 'lounge', 'sunroom', 'greenhouse', 'tatami', 'tea_room'].includes(type);

  if (!matchingRules.length && !identityStack && !viewAxis && !gardenRoom) {
    return { active: false, room_id: room.id, room_type: type, source: SOURCE };
  }

  const rules = [...matchingRules];
  if (viewAxis && !rules.some((rule) => rule.key === 'living-social-core')) {
    rules.push(ROOM_OBLIGATION_RULES.find((rule) => rule.key === 'living-social-core'));
  }
  if (gardenRoom && !rules.some((rule) => rule.key === 'garden-room') && type !== 'entry') {
    rules.push(ROOM_OBLIGATION_RULES.find((rule) => rule.key === 'garden-room'));
  }

  const clauseRecords = rules.filter(Boolean).map((rule) => ({
    id: rule.clauseId,
    group: 'template-design-law',
    priority: 'template',
    tags: ['template', 'design-law', rule.key],
    text: rule.text
  }));
  if (identityStack && IMPORTANT_ROOM_TYPES.has(type)) {
    clauseRecords.unshift({
      id: 'design-law-room-identity-stack',
      group: 'template-design-law',
      priority: 'template',
      tags: ['template', 'design-law', 'identity-stack'],
      text: 'Template design law: compose one focal/task wall, one functional anchor, one storage/display layer, one soft detail, and layered lighting.'
    });
  }
  if (viewAxis) {
    clauseRecords.push({
      id: 'design-law-public-view-axis',
      group: 'template-design-law',
      priority: 'template',
      tags: ['template', 'design-law', 'view-axis'],
      text: 'Template design law: public furniture and focal details must respond to the primary glass or water view.'
    });
  }

  const patternTypes = dedupeStrings([
    ...rules.filter(Boolean).flatMap((rule) => rule.patternTypes || []),
    identityStack && !['corridor', 'stairs'].includes(type) ? 'layered_lighting' : undefined,
    viewAxis ? 'social_cluster' : undefined
  ].filter((item) => item && SUPPORTED_PATTERN_TYPES.has(item)));

  return {
    source: SOURCE,
    active: true,
    room_id: room.id,
    room_type: type,
    law_ids: matchingLawIdsForRoom(type, laws, roomText),
    law_domains: dedupeStrings(laws.map((law) => law.domain).filter(Boolean)),
    pattern_types: patternTypes,
    required_layers: dedupeStrings([
      identityStack ? 'identity-stack' : undefined,
      viewAxis ? 'view-axis-response' : undefined,
      ...rules.filter(Boolean).map((rule) => rule.key)
    ].filter(Boolean)),
    semantic_clauses: dedupeClauses(clauseRecords),
    guidance: patternTypes.map((patternType) => guidanceForPattern(room, patternType, clauseRecords))
  };
}

function mergeFacadeAlignment(base = {}, directives = {}, nodes = []) {
  const publicViewRooms = validRoomIds(directives.public_view_rooms || [], nodes);
  const quietRooms = validRoomIds(directives.quiet_rooms || [], nodes);
  const glassPriority = dedupeStrings([
    ...(base.glass_priority_rooms || []),
    ...(directives.large_glass_view_axis || directives.public_view_axis ? publicViewRooms : [])
  ]);
  return {
    ...base,
    glass_priority_rooms: glassPriority.length ? glassPriority : base.glass_priority_rooms,
    template_design_law_view_rooms: publicViewRooms,
    template_design_law_quiet_rooms: quietRooms,
    template_design_law_public_view_axis: Boolean(directives.public_view_axis),
    template_design_law_site_thresholds: directives.site_thresholds || []
  };
}

function mergeSiteConnections(base = [], directives = {}, nodes = []) {
  const ids = new Set(nodes.map((node) => node.id));
  const publicCore = (directives.public_view_rooms || []).find((id) => ids.has(id)) || nodes.find((node) => ['living', 'great_hall', 'lounge'].includes(node.type))?.id || 'entry';
  const additions = [];
  if (directives.waterfront_threshold && ids.has(publicCore)) additions.push({ from: publicCore, to: 'water_edge', relation: 'template-design-law-public-water-threshold' });
  if (directives.foreground_garden_sequence && ids.has('entry')) additions.push({ from: 'entry', to: 'foreground_garden', relation: 'template-design-law-garden-arrival' });
  if (directives.layered_terrain_arrival && ids.has('entry')) additions.push({ from: 'entry', to: 'terrain_plinth', relation: 'template-design-law-stepped-arrival' });
  if (directives.roof_terrace_access_required && ids.has(publicCore)) additions.push({ from: publicCore, to: 'roof_terrace', relation: 'template-design-law-roof-terrace-access' });
  if (directives.courtyard_internal_scene && ids.has(publicCore)) additions.push({ from: publicCore, to: 'courtyard_void', relation: 'template-design-law-internal-scene' });
  return dedupeConnections([...base, ...additions].filter((item) => item && ids.has(item.from) && item.to));
}

function mergeCirculationRules(base = {}, directives = {}) {
  const thresholds = directives.site_thresholds || [];
  return {
    ...base,
    template_design_law_sequence: thresholds.length
      ? {
        thresholds,
        intent: directives.public_view_axis
          ? 'arrival moves from landscape through public core to view or water edge'
          : 'arrival clarifies landscape and interior thresholds'
      }
      : base.template_design_law_sequence,
    roof_terrace_access_required: directives.roof_terrace_access_required || base.roof_terrace_access_required
  };
}

function patchTopologyNode(node = {}, runtime = {}) {
  const obligation = designLawRuntimeForRoom(node, runtime);
  if (!obligation.active) return node;
  const directives = runtime.topology_directives || {};
  const tags = dedupeStrings([...(node.tags || []), 'template-design-law', ...obligation.required_layers.map((layer) => `law-${layer}`)]);
  const patch = { ...node, tags };
  if (directives.public_view_rooms?.includes(node.id)) {
    patch.orientation = node.orientation || 'view';
    patch.daylight = node.daylight || 'high';
  }
  if (directives.quiet_rooms?.includes(node.id)) patch.orientation = node.orientation || 'quiet-garden';
  if (directives.service_band_rooms?.includes(node.id)) patch.orientation = node.orientation || 'service-side';
  return patch;
}

function guidanceForPattern(room = {}, patternType, clauses = []) {
  return {
    source_title: 'Stage 7D Template Design Law',
    source: SOURCE,
    room_type: normalizeRoomType(room.type),
    pattern_type: patternType,
    confidence: 96,
    anchor: anchorForPattern(patternType),
    clauses: dedupeStrings(clauses.map((clause) => clause.id))
  };
}

function anchorForPattern(patternType) {
  if (patternType === 'kitchen_work_wall' || patternType === 'wet_wall' || patternType === 'workshop_bench_wall') return { wall: 'north', zone: 'service_wall' };
  if (patternType === 'sleep_niche') return { wall: 'south', zone: 'quiet_corner' };
  if (patternType === 'library_focus_wall' || patternType === 'display_wall') return { wall: 'east', zone: 'focus_wall' };
  if (patternType === 'circulation_spine') return { wall: 'west', zone: 'path_edge' };
  if (patternType === 'plant_corner') return { wall: 'south', zone: 'soft_corner' };
  return { zone: 'center_with_open_edges' };
}

function topologyDirectiveMatchesRoom(type, directives = {}) {
  if (directives.public_view_axis && ['living', 'great_hall', 'lounge', 'dining', 'sunroom', 'greenhouse'].includes(type)) return true;
  if (directives.foreground_garden_sequence && ['entry', 'living', 'lounge', 'sunroom', 'greenhouse', 'tatami', 'tea_room'].includes(type)) return true;
  if (directives.layered_terrain_arrival && ['entry', 'corridor', 'stairs'].includes(type)) return true;
  return false;
}

function shouldApplyIdentityStack(type, text) {
  if (!IMPORTANT_ROOM_TYPES.has(type)) return false;
  if (['corridor', 'stairs'].includes(type)) return /circulation|wayfinding|threshold/i.test(text);
  return /interior-room-identity-layer-stack|identity stack|focal wall|functional anchor|storage\/display|layered lighting|室内|内饰|furnished/i.test(text);
}

function matchingLawIdsForRoom(type, laws = [], text = '') {
  const ids = laws
    .filter((law) => {
      const lawText = searchTextForLaw(law);
      if (lawText.includes(`room-${type}`) || lawText.includes(type)) return true;
      return ROOM_OBLIGATION_RULES.some((rule) => rule.roomTypes.includes(type) && rule.match.test(lawText));
    })
    .map((law) => law.id)
    .filter(Boolean);
  if (/interior-room-identity-layer-stack|identity stack/i.test(text)) ids.push('interior-room-identity-layer-stack');
  return dedupeStrings(ids);
}

function objectFromLooseLawFields(value = {}) {
  if (!value || typeof value !== 'object') return {};
  const selected = value.template_design_laws || value.design_laws;
  const interior = value.template_interior_design_laws || value.interior_design_laws;
  const clauses = value.template_design_law_clauses || value.design_law_clauses;
  const hasLooseLaws = [selected, interior, clauses].some((items) => Array.isArray(items) && items.length > 0);
  if (!hasLooseLaws) return {};
  return {
    active: true,
    selected_laws: selected || [],
    interior_laws: interior || [],
    implementation_clauses: clauses || []
  };
}

function normalizeRoomRefs(items = []) {
  return array(items).map((item, index) => ({
    id: String(item.id || item.room_id || item.type || `room-${index}`),
    type: normalizeRoomType(item.type || item.room_type || item.id),
    tags: array(item.tags)
  }));
}

function normalizeRoomType(value) {
  const text = String(value || 'room').toLowerCase();
  return {
    entry_or_lobby: 'entry',
    living_or_hall: 'living',
    great_hall: 'great_hall',
    corridor_or_gallery: 'corridor',
    tower_room: 'tower'
  }[text] || text || 'room';
}

function searchTextForLaw(law = {}) {
  return [
    law.id,
    law.domain,
    law.rule,
    ...(law.implementation_clauses || []),
    ...(law.prompt_affinities || []),
    ...(law.applies_to || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function inactiveLawPack(reason) {
  return {
    source: SOURCE,
    active: false,
    reason,
    selected_count: 0,
    interior_selected_count: 0,
    selected_laws: [],
    interior_laws: [],
    implementation_clauses: []
  };
}

function validRoomIds(ids = [], nodes = []) {
  const valid = new Set(nodes.map((node) => node.id));
  return dedupeStrings(ids).filter((id) => valid.has(id));
}

function dedupeConnections(connections = []) {
  const seen = new Set();
  const result = [];
  for (const item of connections) {
    const key = `${item.from}|${item.to}|${item.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function dedupeLaws(laws = []) {
  const byId = new Map();
  for (const law of array(laws)) {
    if (!law || typeof law !== 'object') continue;
    const id = String(law.id || `${law.domain || 'law'}-${byId.size}`);
    if (!byId.has(id)) byId.set(id, { ...law, id });
  }
  return [...byId.values()];
}

function dedupeClauses(clauses = []) {
  const byId = new Map();
  for (const clause of clauses) {
    if (!clause?.id || byId.has(clause.id)) continue;
    byId.set(clause.id, clause);
  }
  return [...byId.values()];
}

function dedupeStrings(values = []) {
  return [...new Set(array(values).map((item) => String(item || '').trim()).filter(Boolean))];
}

function array(value) {
  return Array.isArray(value) ? value : [];
}
