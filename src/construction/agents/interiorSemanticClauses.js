const ROOM_CLAUSES = {
  entry: [
    'entry-threshold-marker',
    'entry-drop-zone',
    'entry-bench-and-coat-wall',
    'entry-wayfinding-light',
    'entry-view-release'
  ],
  living: [
    'living-conversation-cluster',
    'living-focal-wall',
    'living-rug-anchor',
    'living-bookshelf-display',
    'living-window-seat',
    'living-plant-corner',
    'living-accent-light'
  ],
  lounge: [
    'living-conversation-cluster',
    'living-rug-anchor',
    'living-window-seat',
    'living-plant-corner'
  ],
  great_hall: [
    'hall-ceremonial-axis',
    'hall-long-table',
    'hall-banner-pair',
    'hall-hearth-or-dais',
    'hall-gallery-wall',
    'hall-ceiling-lights'
  ],
  dining: [
    'dining-centered-table',
    'dining-chair-pair',
    'dining-sideboard',
    'dining-table-light',
    'dining-runner',
    'dining-serving-storage'
  ],
  kitchen: [
    'kitchen-work-wall',
    'kitchen-prep-counter',
    'kitchen-sink-corner',
    'kitchen-pantry-wall',
    'kitchen-task-light',
    'kitchen-vent-marker',
    'kitchen-breakfast-edge'
  ],
  bedroom: [
    'bedroom-sleep-niche',
    'bedroom-bedside-pair',
    'bedroom-wardrobe-wall',
    'bedroom-soft-rug',
    'bedroom-reading-light',
    'bedroom-privacy-screen',
    'bedroom-personal-display'
  ],
  master_bedroom: [
    'bedroom-sleep-niche',
    'bedroom-bedside-pair',
    'bedroom-wardrobe-wall',
    'bedroom-soft-rug',
    'bedroom-reading-light',
    'bedroom-privacy-screen',
    'bedroom-personal-display'
  ],
  study: [
    'study-desk-focus',
    'study-library-wall',
    'study-reading-light',
    'study-archive-storage',
    'study-map-display',
    'study-quiet-rug'
  ],
  bathroom: [
    'bathroom-wet-wall',
    'bathroom-bath-mat',
    'bathroom-linen-storage',
    'bathroom-mirror-light',
    'bathroom-humidity-plant'
  ],
  tatami: [
    'japanese-tatami-grid',
    'japanese-low-table',
    'japanese-tokonoma',
    'japanese-screen-edge',
    'japanese-garden-view'
  ],
  tea_room: [
    'japanese-low-table',
    'japanese-tea-hearth',
    'japanese-ceramic-display',
    'japanese-screen-edge',
    'japanese-garden-view'
  ],
  tower: [
    'tower-lookout-edge',
    'tower-map-table',
    'tower-guard-rail',
    'tower-vertical-light',
    'tower-supply-storage'
  ],
  chapel: [
    'chapel-altar-axis',
    'chapel-candle-pair',
    'chapel-aisle-runner',
    'chapel-banner-wall',
    'chapel-quiet-seating'
  ],
  armory: [
    'armory-tool-wall',
    'armory-rack-wall',
    'armory-forge-light',
    'armory-supply-storage',
    'armory-work-pad'
  ],
  garage: [
    'garage-vehicle-pad',
    'garage-workbench-wall',
    'garage-parts-storage',
    'garage-task-light',
    'garage-metal-detail'
  ],
  sunroom: [
    'sunroom-plant-cluster',
    'sunroom-water-tray',
    'sunroom-grow-light',
    'sunroom-moss-floor',
    'sunroom-garden-path'
  ],
  greenhouse: [
    'sunroom-plant-cluster',
    'sunroom-water-tray',
    'sunroom-grow-light',
    'sunroom-moss-floor',
    'sunroom-garden-path'
  ],
  corridor: [
    'circulation-clear-runner',
    'circulation-wayfinding-light',
    'circulation-threshold-marker',
    'circulation-restraint'
  ],
  stairs: [
    'circulation-wayfinding-light',
    'circulation-threshold-marker',
    'circulation-restraint',
    'stair-landing-light'
  ],
  storage: [
    'storage-shelving-wall',
    'storage-barrel-stack',
    'storage-inventory-light',
    'storage-clear-aisle'
  ],
  utility: [
    'utility-counter-wall',
    'utility-service-storage',
    'utility-task-light',
    'utility-wet-or-mechanical-corner'
  ],
  workshop: [
    'workshop-workbench-wall',
    'workshop-tool-rack',
    'workshop-parts-storage',
    'workshop-task-light',
    'workshop-durable-floor'
  ],
  room: [
    'generic-storage-corner',
    'generic-display-corner',
    'generic-soft-rug',
    'generic-task-light'
  ]
};

const STYLE_CLAUSES = {
  modern: [
    'style-modern-negative-space',
    'style-modern-linear-light',
    'style-modern-material-plinth',
    'style-modern-indoor-planter',
    'style-modern-glass-view-seat'
  ],
  futuristic: [
    'style-modern-linear-light',
    'style-futuristic-glow-strip',
    'style-modern-material-plinth'
  ],
  industrial: [
    'style-industrial-service-spine',
    'style-industrial-metal-rack',
    'style-industrial-task-light'
  ],
  japanese: [
    'style-japanese-tokonoma',
    'style-japanese-screen-rhythm',
    'style-japanese-low-horizontality',
    'style-japanese-garden-view'
  ],
  'chinese-courtyard': [
    'style-courtyard-red-accent',
    'style-japanese-screen-rhythm',
    'style-japanese-garden-view'
  ],
  gothic: [
    'style-gothic-candle-axis',
    'style-gothic-banner-pair',
    'style-gothic-ironwork',
    'style-gothic-stone-display'
  ],
  classical: [
    'style-classical-symmetry',
    'style-classical-paired-sconces',
    'style-classical-display-pedestal',
    'style-classical-formal-runner'
  ],
  medieval: [
    'style-rustic-hearth',
    'style-rustic-crate-storage',
    'style-gothic-banner-pair'
  ],
  rustic: [
    'style-rustic-hearth',
    'style-rustic-crate-storage',
    'style-rustic-warm-lantern'
  ],
  alpine: [
    'style-rustic-hearth',
    'style-rustic-warm-lantern',
    'style-alpine-soft-textile'
  ],
  coastal: [
    'style-coastal-view-bench',
    'style-coastal-blue-textile',
    'style-coastal-bright-plant'
  ],
  desert: [
    'style-desert-cool-courtyard-tone',
    'style-desert-terracotta-accent',
    'style-desert-potted-cactus'
  ],
  treehouse: [
    'style-treehouse-canopy-planting',
    'style-rustic-warm-lantern',
    'style-treehouse-rope-detail'
  ],
  subterranean: [
    'style-subterranean-warm-lightwell',
    'style-subterranean-moss-edge',
    'style-subterranean-storage-niche'
  ],
  cyberpunk: [
    'style-cyberpunk-neon-trim',
    'style-cyberpunk-media-wall',
    'style-cyberpunk-color-contrast'
  ]
};

const UNIVERSAL_CLAUSES = [
  'universal-clear-circulation',
  'universal-edge-anchored-furniture',
  'universal-three-layer-lighting',
  'universal-floor-zone-marker',
  'universal-wall-depth-layer',
  'universal-storage-per-room',
  'universal-window-view-response'
];

const CLAUSE_METADATA = buildClauseMetadata();

export function buildInteriorSemanticLibrary() {
  return Object.values(CLAUSE_METADATA);
}

export function semanticClausesForRoom(room = {}, context = {}) {
  const family = String(context.family || 'general');
  const type = String(room.type || 'room');
  const clauses = [
    ...UNIVERSAL_CLAUSES,
    ...(ROOM_CLAUSES[type] || ROOM_CLAUSES.room),
    ...(STYLE_CLAUSES[family] || []),
    ...templateInteriorClauses(context.templateKnowledge)
  ];

  return unique(clauses)
    .map((id) => CLAUSE_METADATA[id] || makeClause(id, 'generated', ['semantic'], `Apply ${id}.`))
    .filter((clause) => clauseApplies(clause, room, context));
}

export function summarizeInteriorSemanticPlan(roomDetails = []) {
  const counts = {};
  for (const detail of roomDetails) {
    for (const clause of detail.semantic_clauses || []) counts[clause.group] = (counts[clause.group] || 0) + 1;
  }
  return {
    clause_count: roomDetails.reduce((sum, detail) => sum + (detail.semantic_clauses?.length || 0), 0),
    groups: counts,
    room_count: roomDetails.length
  };
}

function templateInteriorClauses(templateKnowledge = {}) {
  if (!templateKnowledge?.active) return [];
  const recommendations = templateKnowledge.recommendations || {};
  const detailDensity = recommendations.detail_density;
  const priorities = (recommendations.design_priorities || []).join(' ');
  const clauses = ['template-reference-coherence'];
  if (detailDensity === 'high' || /layered interior|storage|textiles|plants|task zones/i.test(priorities)) {
    clauses.push('template-layered-interior', 'template-display-density', 'template-storage-rhythm');
  }
  if ((recommendations.landscape_features || []).includes('garden-composition')) clauses.push('template-garden-view-response');
  if ((recommendations.landscape_features || []).includes('water-edge')) clauses.push('template-water-view-calm');
  return clauses;
}

function clauseApplies(clause, room, context) {
  if (clause.room_types?.length && !clause.room_types.includes(room.type)) return false;
  if (clause.skip_room_types?.includes(room.type)) return false;
  if (clause.min_area && roomArea(room) < clause.min_area) return false;
  if (clause.max_area && roomArea(room) > clause.max_area) return false;
  if (clause.style_families?.length && !clause.style_families.includes(context.family)) return false;
  return true;
}

function buildClauseMetadata() {
  const entries = [
    ...UNIVERSAL_CLAUSES.map((id) => makeClause(id, 'universal', ['circulation', 'coherence'], sentenceFor(id))),
    ...Object.entries(ROOM_CLAUSES).flatMap(([type, ids]) => ids.map((id) => makeClause(id, roomGroup(type), [type], sentenceFor(id)))),
    ...Object.entries(STYLE_CLAUSES).flatMap(([family, ids]) => ids.map((id) => makeClause(id, 'style', [family], sentenceFor(id)))),
    ...[
      'template-reference-coherence',
      'template-layered-interior',
      'template-display-density',
      'template-storage-rhythm',
      'template-garden-view-response',
      'template-water-view-calm'
    ].map((id) => makeClause(id, 'template-reference', ['template'], sentenceFor(id)))
  ];
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

function makeClause(id, group, tags, intent, extra = {}) {
  return {
    id,
    group,
    tags,
    intent,
    priority: priorityFor(id),
    ...extra
  };
}

function roomGroup(type) {
  if (['corridor', 'stairs'].includes(type)) return 'circulation';
  if (['kitchen', 'bathroom', 'storage', 'utility', 'workshop', 'garage'].includes(type)) return 'service';
  if (['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room'].includes(type)) return 'private';
  if (['chapel', 'armory', 'tower'].includes(type)) return 'special';
  return 'room-program';
}

function sentenceFor(id) {
  return id
    .replace(/-/g, ' ')
    .replace(/^./, (char) => char.toUpperCase()) + '.';
}

function priorityFor(id) {
  if (/clear|work-wall|sleep|threshold|focal|altar|light/.test(id)) return 'high';
  if (/display|plant|textile|banner|view/.test(id)) return 'medium';
  return 'normal';
}

function roomArea(room = {}) {
  const width = Number(room.max_x) - Number(room.min_x) + 1;
  const depth = Number(room.max_z) - Number(room.min_z) + 1;
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return 0;
  return Math.max(0, width) * Math.max(0, depth);
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}
