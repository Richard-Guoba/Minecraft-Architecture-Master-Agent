const STYLE_PATTERN_PROFILES = {
  modern: {
    label: 'modern clean interior',
    traits: ['clear-center', 'linear-lighting', 'view-oriented', 'low-clutter', 'functional-work-walls'],
    pattern_weights: {
      layered_lighting: 24,
      social_cluster: 21,
      kitchen_work_wall: 18,
      display_wall: 14,
      plant_corner: 13,
      wet_wall: 11,
      library_focus_wall: 9,
      sleep_niche: 8,
      circulation_spine: 5,
      storage_wall: 2,
      workshop_bench_wall: 1
    },
    room_weights: {
      living: 12,
      kitchen: 12,
      bedroom: 9,
      study: 8,
      bathroom: 7,
      entry_or_lobby: 4,
      corridor_or_gallery: 2,
      storage: -2
    }
  },
  futuristic: {
    extends: 'modern',
    label: 'futuristic illuminated interior',
    traits: ['glow-lines', 'clear-center', 'display-tech-wall', 'smooth-work-bands'],
    pattern_weights: {
      layered_lighting: 30,
      display_wall: 20,
      social_cluster: 16,
      kitchen_work_wall: 15,
      circulation_spine: 12,
      plant_corner: 4
    }
  },
  classical: {
    label: 'classical formal interior',
    traits: ['axis', 'paired-display', 'symmetry', 'formal-social-room', 'gallery-wall'],
    pattern_weights: {
      display_wall: 24,
      social_cluster: 18,
      layered_lighting: 16,
      library_focus_wall: 16,
      circulation_spine: 13,
      storage_wall: 9,
      sleep_niche: 8,
      plant_corner: 3,
      kitchen_work_wall: 2
    },
    room_weights: {
      living: 13,
      study: 12,
      entry_or_lobby: 10,
      corridor_or_gallery: 8,
      bedroom: 5,
      kitchen: 1
    }
  },
  medieval: {
    label: 'medieval timber and hearth interior',
    traits: ['heavy-storage', 'hearth-like-focus', 'lantern-rhythm', 'workshop-utility', 'wall-bay-clutter'],
    pattern_weights: {
      storage_wall: 24,
      display_wall: 20,
      layered_lighting: 17,
      circulation_spine: 16,
      workshop_bench_wall: 15,
      kitchen_work_wall: 13,
      social_cluster: 10,
      library_focus_wall: 8,
      sleep_niche: 7,
      wet_wall: 2,
      plant_corner: -2
    },
    room_weights: {
      living: 10,
      entry_or_lobby: 10,
      storage: 9,
      workshop: 8,
      kitchen: 7,
      corridor_or_gallery: 6,
      study: 4,
      bathroom: -2
    }
  },
  gothic: {
    extends: 'medieval',
    label: 'gothic ceremonial interior',
    traits: ['vertical-circulation', 'candle-axis', 'banner-display', 'stone-gallery', 'ceremonial-focus'],
    pattern_weights: {
      display_wall: 26,
      circulation_spine: 22,
      layered_lighting: 19,
      social_cluster: 12,
      library_focus_wall: 12,
      storage_wall: 11,
      workshop_bench_wall: 8
    },
    room_weights: {
      entry_or_lobby: 14,
      corridor_or_gallery: 12,
      living: 10,
      study: 8,
      chapel_or_ceremonial_hall: 12,
      bedroom: 2
    }
  },
  japanese: {
    label: 'japanese quiet interior',
    traits: ['garden-view', 'low-furniture', 'display-alcove', 'screen-rhythm', 'calm-negative-space'],
    pattern_weights: {
      plant_corner: 24,
      display_wall: 21,
      social_cluster: 17,
      layered_lighting: 15,
      sleep_niche: 12,
      circulation_spine: 9,
      storage_wall: 8,
      library_focus_wall: 7,
      kitchen_work_wall: 4,
      wet_wall: 3
    },
    room_weights: {
      living: 12,
      study: 10,
      bedroom: 9,
      entry_or_lobby: 8,
      kitchen: 3,
      bathroom: 1
    }
  },
  coastal: {
    label: 'coastal view-oriented interior',
    traits: ['water-view', 'bright-lighting', 'plant-corners', 'relaxed-social-core', 'clean-wet-rooms'],
    pattern_weights: {
      plant_corner: 24,
      social_cluster: 20,
      layered_lighting: 19,
      wet_wall: 13,
      display_wall: 10,
      kitchen_work_wall: 10,
      sleep_niche: 8,
      library_focus_wall: 6,
      circulation_spine: 5,
      storage_wall: 1
    },
    room_weights: {
      living: 13,
      bedroom: 9,
      kitchen: 8,
      bathroom: 8,
      study: 5,
      entry_or_lobby: 4
    }
  },
  desert: {
    label: 'desert shaded interior',
    traits: ['cool-courtyard-tone', 'storage-bays', 'filtered-light', 'compact-wet-edge'],
    pattern_weights: {
      layered_lighting: 17,
      display_wall: 16,
      storage_wall: 15,
      plant_corner: 13,
      social_cluster: 12,
      wet_wall: 10,
      kitchen_work_wall: 8,
      circulation_spine: 7
    }
  },
  treehouse: {
    extends: 'coastal',
    label: 'treehouse compact canopy interior',
    traits: ['canopy-view', 'plant-corner', 'compact-storage', 'lightweight-social-core'],
    pattern_weights: {
      plant_corner: 28,
      social_cluster: 17,
      storage_wall: 15,
      layered_lighting: 14,
      display_wall: 9,
      sleep_niche: 9,
      circulation_spine: 8
    }
  },
  subterranean: {
    extends: 'medieval',
    label: 'subterranean warm niche interior',
    traits: ['warm-lightwell', 'storage-niche', 'display-depth', 'clear-routes'],
    pattern_weights: {
      layered_lighting: 24,
      storage_wall: 20,
      display_wall: 16,
      circulation_spine: 14,
      social_cluster: 10,
      wet_wall: 9,
      kitchen_work_wall: 8
    }
  },
  general: {
    label: 'balanced interior',
    traits: ['balanced-room-patterns', 'functional-zones', 'clear-circulation'],
    pattern_weights: {
      social_cluster: 14,
      layered_lighting: 14,
      display_wall: 12,
      kitchen_work_wall: 11,
      storage_wall: 10,
      sleep_niche: 10,
      library_focus_wall: 9,
      circulation_spine: 8,
      wet_wall: 7,
      plant_corner: 6,
      workshop_bench_wall: 5
    },
    room_weights: {}
  }
};

const TYPOLOGY_PATTERN_BONUS = {
  house: {
    social_cluster: 5,
    kitchen_work_wall: 5,
    sleep_niche: 5,
    wet_wall: 3,
    layered_lighting: 3
  },
  castle: {
    circulation_spine: 6,
    display_wall: 6,
    storage_wall: 5,
    workshop_bench_wall: 4
  },
  temple: {
    display_wall: 7,
    circulation_spine: 5,
    layered_lighting: 5,
    social_cluster: -2
  },
  tower: {
    circulation_spine: 8,
    layered_lighting: 4,
    storage_wall: 2
  },
  'public-building': {
    circulation_spine: 5,
    display_wall: 4,
    layered_lighting: 4,
    social_cluster: 3
  }
};

export function buildStylePatternStrategy({ styleFamily = 'general', typology = 'building', candidates = [] } = {}) {
  const family = normalizeStyleFamily(styleFamily);
  const buildingType = normalizeTypology(typology);
  const profile = styleProfile(family);
  const patternScores = {};
  for (const item of candidates) {
    const pattern = String(item.pattern_type || '');
    if (!pattern) continue;
    patternScores[pattern] = (patternScores[pattern] || 0) +
      stylePatternWeight(pattern, family, buildingType) +
      Math.min(12, Number(item.confidence || 0) / 10);
  }
  return {
    style_family: family,
    typology: buildingType,
    profile: profile.label,
    traits: profile.traits || [],
    preferred_patterns: Object.entries(patternScores)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([pattern_type, score]) => ({ pattern_type, score: round(score) })),
    room_priorities: profile.room_weights || {}
  };
}

export function selectStyleAwareRoomPatternGuidance(candidates = [], {
  styleFamily = 'general',
  typology = 'building',
  limit = 16
} = {}) {
  const family = normalizeStyleFamily(styleFamily);
  const buildingType = normalizeTypology(typology);
  const scored = candidates
    .map((item) => ({
      ...item,
      style_score: scoreGuidance(item, family, buildingType)
    }))
    .sort((a, b) =>
      b.style_score - a.style_score ||
      Number(b.confidence || 0) - Number(a.confidence || 0) ||
      String(a.room_type || '').localeCompare(String(b.room_type || '')) ||
      String(a.pattern_type || '').localeCompare(String(b.pattern_type || ''))
    );

  const selected = [];
  const seenPair = new Set();
  const roomCounts = {};
  const patternCounts = {};
  for (const item of scored) {
    const pair = `${item.room_type}:${item.pattern_type}`;
    if (seenPair.has(pair)) continue;
    if ((roomCounts[item.room_type] || 0) >= 2) continue;
    if ((patternCounts[item.pattern_type] || 0) >= 3) continue;
    selected.push(stripScore(item));
    seenPair.add(pair);
    roomCounts[item.room_type] = (roomCounts[item.room_type] || 0) + 1;
    patternCounts[item.pattern_type] = (patternCounts[item.pattern_type] || 0) + 1;
    if (selected.length >= limit) return selected;
  }

  for (const item of scored) {
    const key = `${item.room_type}:${item.pattern_type}:${item.source_title}`;
    if (seenPair.has(key)) continue;
    selected.push(stripScore(item));
    seenPair.add(key);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function stylePatternWeight(patternType, styleFamily = 'general', typology = 'building') {
  const family = normalizeStyleFamily(styleFamily);
  const profile = styleProfile(family);
  const pattern = String(patternType || '');
  const styleWeight = Number(profile.pattern_weights?.[pattern] ?? STYLE_PATTERN_PROFILES.general.pattern_weights[pattern] ?? 0);
  const typologyWeight = Number(TYPOLOGY_PATTERN_BONUS[normalizeTypology(typology)]?.[pattern] || 0);
  return styleWeight + typologyWeight;
}

function scoreGuidance(item = {}, styleFamily, typology) {
  const confidence = Number(item.confidence || 0) * 0.72;
  const pattern = stylePatternWeight(item.pattern_type, styleFamily, typology);
  const room = Number(styleProfile(styleFamily).room_weights?.[item.room_type] || 0);
  const sourceStyle = normalizeStyleFamily(item.source_style_family || '');
  const styleMatch = sourceStyle === styleFamily ? 14 : sourceStyle === 'general' ? 0 : -4;
  const sourceScore = Math.min(12, Number(item.source_score || 0) / 7);
  return confidence + pattern + room + styleMatch + sourceScore;
}

function styleProfile(styleFamily) {
  const family = normalizeStyleFamily(styleFamily);
  const base = STYLE_PATTERN_PROFILES[family] || STYLE_PATTERN_PROFILES.general;
  if (!base.extends) return base;
  const parent = styleProfile(base.extends);
  return {
    ...parent,
    ...base,
    traits: [...new Set([...(parent.traits || []), ...(base.traits || [])])],
    pattern_weights: { ...(parent.pattern_weights || {}), ...(base.pattern_weights || {}) },
    room_weights: { ...(parent.room_weights || {}), ...(base.room_weights || {}) }
  };
}

function normalizeStyleFamily(value) {
  const text = String(value || '').toLowerCase();
  if (/future|futuristic|cyberpunk|赛博|未来|科幻/.test(text)) return 'futuristic';
  if (/modern|现代|当代|极简/.test(text)) return 'modern';
  if (/classi|colonial|古典|新古典|欧式/.test(text)) return 'classical';
  if (/goth|哥特/.test(text)) return 'gothic';
  if (/medieval|rustic|nordic|alpine|中世纪|木屋|雪山|乡村|北欧/.test(text)) return 'medieval';
  if (/japanese|茶|日式|和风|禅/.test(text)) return 'japanese';
  if (/coast|lake|beach|water|湖|海|滨水|水边|临水/.test(text)) return 'coastal';
  if (/desert|sand|沙漠|地中海/.test(text)) return 'desert';
  if (/treehouse|tree|树屋/.test(text)) return 'treehouse';
  if (/subterranean|cave|underground|地下|洞穴/.test(text)) return 'subterranean';
  return STYLE_PATTERN_PROFILES[text] ? text : 'general';
}

function normalizeTypology(value) {
  const text = String(value || '').toLowerCase();
  if (/castle|fort|keep|城堡|堡垒|要塞/.test(text)) return 'castle';
  if (/temple|church|chapel|神殿|寺|教堂|礼拜/.test(text)) return 'temple';
  if (/tower|塔楼|高塔|塔/.test(text)) return 'tower';
  if (/museum|library|station|hall|public|公共|博物馆|图书馆|车站|大厅|市政/.test(text)) return 'public-building';
  if (/house|villa|home|residential|manor|别墅|住宅|民居|房|宅|庄园/.test(text)) return 'house';
  return TYPOLOGY_PATTERN_BONUS[text] ? text : 'building';
}

function stripScore(item) {
  const { style_score, ...rest } = item;
  return rest;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
