const CONCEPT_STUDIO_VERSION = 1;
const MIN_CONCEPTS = 2;
const MAX_CONCEPTS = 5;

const ARCHETYPES = [
  {
    id: 'view-courtyard',
    title: '水景庭院视线方案',
    summary: '把公共空间、平台和庭院组织成连续视线，适合湖边、玻璃和精致内饰需求。',
    promptSignals: ['湖', '水', '滨水', 'water', 'lake', '玻璃', '平台', '庭院'],
    patch: {
      massing_variant: 'waterfront-stepped-estate',
      facade: {
        window_rhythm: 'corner-window-bands',
        glazing_ratio: 'high',
        entry_detail_style: 'recessed-glass-portal',
        window_surround_pattern: 'corner-wrap',
        relief_density: 'medium'
      },
      roof: {
        profile: 'thin-parapet-terrace',
        style: 'flat',
        roof_terrace: true,
        overhang: 0
      },
      site: {
        mood: 'reflecting-water-edge',
        patio: true,
        water_feature: true,
        planting_beds: true,
        outdoor_seating: true
      },
      interior: {
        decor_density: 'layered',
        display_strategy: 'long-wall-gallery'
      },
      topology: {
        split_strategy: 'open-plan-weighted',
        public_core: 'living',
        public_core_position: 'view-facing',
        soft_boundary_bias: 'high'
      }
    },
    risks: [
      {
        id: 'over-glazing',
        severity: 'medium',
        text: 'High glass ratio can weaken wall rhythm.',
        mitigation: 'Use thick surrounds and alternating solid bays.'
      }
    ]
  },
  {
    id: 'formal-axis',
    title: '入口轴线庄园方案',
    summary: '强化入口、对称翼楼和前景路径，适合庄重宅邸、城堡或纪念性建筑。',
    promptSignals: ['庄园', '轴线', '对称', '欧式', '城堡', 'manor', 'formal'],
    patch: {
      massing_variant: 'formal-axis-manor',
      facade: {
        window_rhythm: 'vertical-slot-grid',
        glazing_ratio: 'medium',
        entry_detail_style: 'projecting-canopy',
        window_surround_pattern: 'thin-line',
        relief_density: 'medium',
        asymmetry: false
      },
      roof: {
        profile: 'split-gable-modernized',
        style: 'gabled',
        roof_terrace: false,
        overhang: 1
      },
      site: {
        mood: 'ordered-entry-court',
        patio: true,
        water_feature: false,
        planting_beds: true,
        outdoor_seating: false
      },
      interior: {
        decor_density: 'formal',
        display_strategy: 'paired-display-cabinets'
      },
      topology: {
        split_strategy: 'axis-balanced',
        public_core: 'living',
        public_core_position: 'front-axis',
        soft_boundary_bias: 'medium'
      }
    },
    risks: [
      {
        id: 'too-formal-for-casual-prompt',
        severity: 'low',
        text: 'Formal symmetry may feel stiff for relaxed residential prompts.',
        mitigation: 'Use only when prompt asks for manor, axis, classical, castle, or ceremony.'
      }
    ]
  },
  {
    id: 'compact-patio',
    title: '紧凑露台生活方案',
    summary: '用较紧凑体块、露台凹口和高效率平面组织，适合小地块和清晰居住功能。',
    promptSignals: ['小', '紧凑', '露台', '院子', 'compact', 'patio'],
    patch: {
      massing_variant: 'compact-patio-bar',
      facade: {
        window_rhythm: 'quiet-punched-windows',
        glazing_ratio: 'medium',
        entry_detail_style: 'solid-framed-door',
        window_surround_pattern: 'deep-reveal',
        relief_density: 'low'
      },
      roof: {
        profile: 'stepped-flat-with-light-slot',
        style: 'flat',
        roof_terrace: false,
        overhang: 1
      },
      site: {
        mood: 'dry-modern-court',
        patio: true,
        water_feature: false,
        planting_beds: false,
        outdoor_seating: true,
        dry_garden: true
      },
      interior: {
        decor_density: 'warm',
        display_strategy: 'corner-display-cases'
      },
      topology: {
        split_strategy: 'view-side-cluster',
        public_core: 'dining',
        public_core_position: 'front-to-center',
        soft_boundary_bias: 'high'
      }
    },
    risks: [
      {
        id: 'less-iconic-silhouette',
        severity: 'low',
        text: 'Compact massing can read less iconic in screenshots.',
        mitigation: 'Use facade depth and patio framing as the memorable feature.'
      }
    ]
  },
  {
    id: 'vertical-landmark',
    title: '角部地标塔楼方案',
    summary: '用角部观景塔或竖向书房增强轮廓和叙事，适合塔楼、奇幻或强识别度住宅。',
    promptSignals: ['塔', '观景', '地标', '法师', 'tower', 'lookout', 'landmark'],
    patch: {
      massing_variant: 'corner-vertical-accent',
      facade: {
        window_rhythm: 'irregular-studio-grid',
        glazing_ratio: 'high',
        entry_detail_style: 'double-height-marker',
        window_surround_pattern: 'varied-depth',
        relief_density: 'high'
      },
      roof: {
        profile: 'service-flat-roof',
        style: 'flat',
        roof_terrace: true,
        overhang: 0
      },
      site: {
        mood: 'lush-side-garden',
        patio: true,
        water_feature: false,
        planting_beds: true,
        outdoor_seating: true
      },
      interior: {
        decor_density: 'gallery',
        display_strategy: 'staggered-shelves'
      },
      topology: {
        split_strategy: 'cross-axis',
        public_core: 'living',
        public_core_position: 'near-vertical-core',
        soft_boundary_bias: 'medium'
      }
    },
    risks: [
      {
        id: 'tower-overdominance',
        severity: 'medium',
        text: 'Tower accents can overpower a modest house.',
        mitigation: 'Keep tower footprint narrow and use it as study or lookout.'
      }
    ]
  },
  {
    id: 'dual-wing-estate',
    title: '双翼家庭宅邸方案',
    summary: '用左右翼楼组织公共、服务和私密空间，适合较大的家庭别墅和多房间需求。',
    promptSignals: ['大', '家庭', '多房间', '庄园', 'villa', 'estate', 'family'],
    patch: {
      massing_variant: 'dual-wing-balanced',
      facade: {
        window_rhythm: 'horizontal-ribbon-breaks',
        glazing_ratio: 'high',
        entry_detail_style: 'wide-threshold',
        window_surround_pattern: 'ribbon-frame',
        relief_density: 'medium'
      },
      roof: {
        profile: 'thin-parapet-terrace',
        style: 'flat',
        roof_terrace: true,
        overhang: 0
      },
      site: {
        mood: 'open-family-yard',
        patio: true,
        water_feature: false,
        planting_beds: true,
        outdoor_seating: true
      },
      interior: {
        decor_density: 'layered',
        display_strategy: 'mixed-niche-displays'
      },
      topology: {
        split_strategy: 'axis-balanced',
        public_core: 'living',
        public_core_position: 'center',
        soft_boundary_bias: 'medium'
      }
    },
    risks: [
      {
        id: 'oversized-footprint',
        severity: 'medium',
        text: 'Paired wings may exceed small prompt scale.',
        mitigation: 'Use only when scale is medium or large, or when multiple rooms are requested.'
      }
    ]
  }
];

export class ConceptStudioAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = ['auto', 'mock', 'llm'].includes(mode) ? mode : 'auto';
  }

  async run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, templateKnowledge = {}, options = {}) {
    const fallback = buildDeterministicConceptStudio(prompt, architecture, buildSpec, topology, templateKnowledge, options);
    if (this.mode === 'mock') return fallback;
    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 建筑 ConceptStudioAgent。',
            '你只输出严格 JSON object。',
            '你生成 2-5 个可解释建筑概念，不输出 XYZ 坐标或方块坐标。',
            '每个 concept 必须包含 id, title, archetype, summary, design_intent, reference_strategy, risks, creative_design_patch。'
          ].join('\n'),
          user: JSON.stringify({
            prompt,
            architecture: compactArchitecture(architecture),
            buildSpec: compactBuildSpec(buildSpec),
            topology: compactTopology(topology),
            template_references: templateKnowledge?.retrieval_explanation?.references || [],
            fallback_example: fallback
          })
        });
        return normalizeConceptStudioResult(parsed, fallback);
      } catch (error) {
        if (this.mode === 'llm') throw error;
        return { ...fallback, warnings: [...fallback.warnings, `llm concept generation failed: ${error.message}`] };
      }
    }
    return fallback;
  }
}

export function buildDeterministicConceptStudio(prompt = '', architecture = {}, buildSpec = {}, topology = {}, templateKnowledge = {}, options = {}) {
  const count = normalizeConceptCount(options.count ?? options.concepts);
  const strategy = normalizeStrategy(options.strategy || options.conceptStrategy);
  if (count < MIN_CONCEPTS) {
    return {
      source: 'local-concept-studio-agent',
      version: CONCEPT_STUDIO_VERSION,
      active: false,
      prompt,
      strategy,
      concept_count: 0,
      selected_concept_id: undefined,
      fused_concept_id: undefined,
      concepts: [],
      warnings: ['Concept Studio requires at least two concepts.']
    };
  }
  const seed = options.seed ?? buildSpec.seed ?? 1;
  const references = safeReferences(templateKnowledge);
  const ranked = ARCHETYPES
    .map((archetype) => ({ archetype, score: scoreArchetype(archetype, prompt, architecture, buildSpec, references) }))
    .sort((a, b) => b.score - a.score || seededTie(seed, a.archetype.id) - seededTie(seed, b.archetype.id));
  const selected = ranked.slice(0, count).map((item, index) =>
    conceptFromArchetype(item.archetype, index + 1, prompt, architecture, buildSpec, topology, references)
  );
  return {
    source: 'local-concept-studio-agent',
    version: CONCEPT_STUDIO_VERSION,
    active: selected.length >= MIN_CONCEPTS,
    prompt,
    strategy,
    concept_count: selected.length,
    selected_concept_id: undefined,
    fused_concept_id: undefined,
    concepts: selected,
    warnings: references.length ? [] : ['template references unavailable; concepts use prompt and local archetypes only']
  };
}

export function normalizeConceptStudioResult(raw = {}, fallback = {}) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const concepts = Array.isArray(value.concepts)
    ? value.concepts.map(normalizeConceptCard).filter((item) => item.id)
    : fallback.concepts || [];
  return {
    source: 'local-concept-studio-agent',
    version: CONCEPT_STUDIO_VERSION,
    active: concepts.length >= MIN_CONCEPTS,
    prompt: String(value.prompt || fallback.prompt || ''),
    strategy: normalizeStrategy(value.strategy || fallback.strategy),
    concept_count: concepts.length,
    selected_concept_id: value.selected_concept_id,
    fused_concept_id: value.fused_concept_id,
    concepts,
    warnings: normalizeStringArray(value.warnings || fallback.warnings)
  };
}

export function normalizeConceptCard(raw = {}, index = 0) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const id = normalizeId(value.id || `${value.archetype || 'concept'}-${index + 1}`);
  return {
    id,
    title: String(value.title || id),
    archetype: normalizeId(value.archetype || id),
    summary: String(value.summary || value.title || id),
    design_intent: normalizeStringArray(value.design_intent || value.designIntent),
    reference_strategy: normalizeReferenceStrategy(value.reference_strategy || value.referenceStrategy),
    massing_plan: plainObject(value.massing_plan || value.massingPlan),
    space_graph_strategy: plainObject(value.space_graph_strategy || value.spaceGraphStrategy),
    facade_strategy: plainObject(value.facade_strategy || value.facadeStrategy),
    roof_strategy: plainObject(value.roof_strategy || value.roofStrategy),
    site_strategy: plainObject(value.site_strategy || value.siteStrategy),
    interior_strategy: plainObject(value.interior_strategy || value.interiorStrategy),
    quality_targets: normalizeStringArray(value.quality_targets || value.qualityTargets),
    risks: normalizeRisks(value.risks),
    creative_design_patch: normalizePatch(value.creative_design_patch || value.creativeDesignPatch)
  };
}

function conceptFromArchetype(archetype, rank, prompt, architecture, buildSpec, topology, references) {
  const id = `concept-${String.fromCharCode(96 + rank)}-${archetype.id}`;
  const matchedRefs = referencesForArchetype(archetype, references);
  return normalizeConceptCard({
    id,
    title: archetype.title,
    archetype: archetype.id,
    summary: archetype.summary,
    design_intent: intentFor(archetype, prompt, topology),
    reference_strategy: matchedRefs,
    massing_plan: {
      variant_hint: archetype.patch.massing_variant,
      composition_bias: archetype.patch.topology.public_core_position,
      key_moves: keyMovesFor(archetype)
    },
    space_graph_strategy: {
      public_core: archetype.patch.topology.public_core,
      split_strategy: archetype.patch.topology.split_strategy,
      priority_rooms: priorityRooms(topology)
    },
    facade_strategy: archetype.patch.facade,
    roof_strategy: archetype.patch.roof,
    site_strategy: archetype.patch.site,
    interior_strategy: {
      ...archetype.patch.interior,
      room_identity_focus: priorityRooms(topology).slice(0, 3)
    },
    quality_targets: qualityTargetsFor(archetype, prompt, architecture, buildSpec),
    risks: archetype.risks,
    creative_design_patch: archetype.patch
  }, rank);
}

function referencesForArchetype(archetype, references) {
  const text = `${archetype.id} ${archetype.summary} ${JSON.stringify(archetype.patch)}`.toLowerCase();
  const selected = references.filter((ref) => {
    const refText = `${ref.diversity_slot || ''} ${(ref.matched_signals || []).join(' ')} ${(ref.teaches || []).map((unit) => unit.area).join(' ')}`.toLowerCase();
    return refText.split(/[^a-z0-9-]+/).filter(Boolean).some((token) => text.includes(token));
  });
  return (selected.length ? selected : references).slice(0, 3).map((ref) => ({
    case_id: ref.case_id,
    title: ref.title,
    used_for: [...new Set((ref.teaches || []).map((unit) => unit.area).filter(Boolean))].slice(0, 4),
    teaches: (ref.teaches || []).slice(0, 3).map((unit) => unit.claim),
    risk_control: (ref.risk_controls || [])[0] || 'change exact dimensions and detail placement'
  }));
}

function scoreArchetype(archetype, prompt, architecture, buildSpec, references) {
  const text = `${prompt} ${architecture.style_family || ''} ${architecture.typology || ''}`.toLowerCase();
  let score = archetype.promptSignals.reduce((sum, token) => sum + (text.includes(String(token).toLowerCase()) ? 8 : 0), 0);
  if (archetype.id === 'view-courtyard' && (buildSpec.site?.water_feature || buildSpec.facade?.large_glass)) score += 16;
  if (archetype.id === 'dual-wing-estate' && Number(buildSpec.floors || 1) >= 2) score += 8;
  if (archetype.id === 'compact-patio' && /小|紧凑|compact/.test(text)) score += 14;
  if (archetype.id === 'formal-axis' && /现代|modern|湖|水/.test(text)) score -= 10;
  if (archetype.id === 'vertical-landmark' && /塔|tower|法师|wizard/.test(text)) score += 18;
  score += Math.min(12, references.length * 3);
  return score;
}

function safeReferences(templateKnowledge = {}) {
  return Array.isArray(templateKnowledge.retrieval_explanation?.references)
    ? templateKnowledge.retrieval_explanation.references
    : [];
}

function intentFor(archetype, prompt, topology = {}) {
  const roomCount = Array.isArray(topology.nodes) ? topology.nodes.length : 0;
  return [
    archetype.summary,
    roomCount > 0 ? `Use the ${roomCount} planned rooms as semantic anchors instead of changing the room list.` : 'Preserve the planner room program.',
    /内饰|interior|家具/.test(prompt) ? 'Give interior rooms visible identity through display, lighting, and furniture density.' : 'Keep interior decisions compatible with the requested style.'
  ];
}

function qualityTargetsFor(archetype, prompt, architecture, buildSpec) {
  const targets = ['clear entry sequence', 'buildable semantic patch'];
  if (/湖|水|water|lake/.test(prompt) || archetype.id === 'view-courtyard') targets.push('view-facing public rooms');
  if (/玻璃|glass/.test(prompt)) targets.push('controlled large glazing');
  if (Number(buildSpec.floors || 1) >= 2) targets.push('legible vertical circulation');
  if (architecture.style_family) targets.push(`${architecture.style_family} style consistency`);
  return targets;
}

function keyMovesFor(archetype) {
  const table = {
    'view-courtyard': ['water-edge deck', 'view-facing public core', 'roof lounge'],
    'formal-axis': ['paired wings', 'entry court', 'formal facade rhythm'],
    'compact-patio': ['patio niche', 'efficient bar massing', 'quiet punched windows'],
    'vertical-landmark': ['corner lookout', 'double-height marker', 'gallery interior'],
    'dual-wing-estate': ['balanced side wings', 'family yard', 'roof terrace']
  };
  return table[archetype.id] || ['clear massing', 'style-matched facade'];
}

function priorityRooms(topology = {}) {
  const ids = (topology.nodes || []).map((node) => node.id || node.type).filter(Boolean);
  return ids.length ? ids.slice(0, 6) : ['living', 'kitchen', 'study'];
}

function normalizeReferenceStrategy(value = []) {
  return Array.isArray(value)
    ? value.map((item) => ({
      case_id: String(item.case_id || ''),
      title: String(item.title || item.case_id || 'reference'),
      used_for: normalizeStringArray(item.used_for || item.usedFor),
      teaches: normalizeStringArray(item.teaches),
      risk_control: String(item.risk_control || item.riskControl || 'change exact dimensions and detail placement')
    })).filter((item) => item.case_id || item.title)
    : [];
}

function normalizeRisks(value = []) {
  return Array.isArray(value)
    ? value.map((item, index) => ({
      id: normalizeId(item.id || `risk-${index + 1}`),
      severity: ['low', 'medium', 'high'].includes(String(item.severity)) ? String(item.severity) : 'low',
      text: String(item.text || item.id || `risk-${index + 1}`),
      mitigation: String(item.mitigation || 'prefer the safer local generator default for this field')
    }))
    : [];
}

function normalizePatch(value = {}) {
  const patch = plainObject(value);
  return {
    massing_variant: patch.massing_variant ? normalizeId(patch.massing_variant) : undefined,
    facade: plainObject(patch.facade),
    roof: plainObject(patch.roof),
    site: plainObject(patch.site),
    interior: plainObject(patch.interior),
    topology: plainObject(patch.topology)
  };
}

function compactArchitecture(architecture = {}) {
  return {
    style: architecture.style,
    style_family: architecture.style_family,
    typology: architecture.typology,
    facade_rules: architecture.facade_rules,
    roof_rules: architecture.roof_rules,
    site_rules: architecture.site_rules
  };
}

function compactBuildSpec(buildSpec = {}) {
  return {
    width: buildSpec.width,
    depth: buildSpec.depth,
    floors: buildSpec.floors,
    roof_style: buildSpec.roof_style,
    facade: buildSpec.facade,
    site: buildSpec.site,
    seed: buildSpec.seed
  };
}

function compactTopology(topology = {}) {
  return {
    node_ids: (topology.nodes || []).map((node) => node.id),
    edge_count: (topology.edges || []).length,
    bsp_hints: topology.bsp_hints
  };
}

function normalizeStrategy(value) {
  return String(value || 'select') === 'fuse' ? 'fuse' : 'select';
}

function normalizeConceptCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < MIN_CONCEPTS) return 0;
  return Math.max(MIN_CONCEPTS, Math.min(MAX_CONCEPTS, Math.round(number)));
}

function seededTie(seed, value) {
  return hashString(`${seed}|${value}`) % 1000;
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map((item) => String(item));
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function normalizeId(value) {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}
