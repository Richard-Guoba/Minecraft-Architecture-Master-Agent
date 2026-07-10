import { applyTemplateSpacePlanningStrategy } from './templateSpacePlanningStrategy.js';

const MASSING_VARIANTS = [
  {
    id: 'waterfront-stepped-estate',
    label: 'waterfront stepped estate with deck and roof lounge',
    split: 'open-plan-weighted',
    publicCore: 'living',
    order: ['entry', 'living', 'dining', 'kitchen', 'stairs', 'study', 'storage', 'bathroom'],
    volumes: [
      designVolume('waterfront-glass-hall', 'mutate', [0.44, 0.82, 0.52], 'attached-south', ['offset-mass', 'glass-wing', 'view-hall'], 'flat'),
      designVolume('west-service-wing', 'add', [0.3, 0.78, 0.48], 'attached-west', ['secondary-mass', 'service-wing']),
      designVolume('water-edge-deck', 'add', [0.72, 0.22, 0.22], 'attached-south', ['gallery', 'deck', 'waterfront', 'view-platform'], 'flat'),
      designVolume('entry-frame-gallery', 'add', [0.46, 0.42, 0.18], 'front-center', ['porch', 'entry-focus', 'threshold-frame'], 'flat'),
      designVolume('roof-lounge-bar', 'add', [0.42, 0.18, 0.28], 'attached-north', ['roof-lounge', 'stepped-roofline'], 'flat')
    ]
  },
  {
    id: 'east-offset-glass-wing',
    label: 'east offset glass wing',
    split: 'open-plan-weighted',
    publicCore: 'living',
    order: ['entry', 'living', 'dining', 'kitchen', 'stairs', 'study', 'bathroom', 'storage'],
    volumes: [
      designVolume('glass-wing', 'mutate', [0.38, 0.64, 0.5], 'attached-east-rear', ['offset-mass', 'glass-wing']),
      designVolume('view-terrace', 'add', [0.46, 0.24, 0.22], 'attached-south', ['gallery', 'deck', 'view-platform'], 'flat')
    ]
  },
  {
    id: 'west-service-wing',
    label: 'west service wing with rear garden',
    split: 'side-bands',
    publicCore: 'kitchen',
    order: ['entry', 'kitchen', 'dining', 'living', 'stairs', 'bathroom', 'storage', 'study'],
    volumes: [
      designVolume('glass-wing', 'mutate', [0.26, 0.52, 0.42], 'attached-north', ['offset-mass', 'quiet-glass-bay']),
      designVolume('service-wing', 'add', [0.3, 0.72, 0.48], 'attached-west', ['wing', 'service']),
      designVolume('rear-sunroom', 'add', [0.32, 0.48, 0.34], 'attached-north', ['glass', 'sunroom'], 'flat')
    ]
  },
  {
    id: 'front-back-gallery',
    label: 'front back gallery sequence',
    split: 'front-back-bands',
    publicCore: 'dining',
    order: ['entry', 'dining', 'kitchen', 'living', 'stairs', 'study', 'bathroom', 'storage'],
    volumes: [
      designVolume('glass-wing', 'mutate', [0.28, 0.58, 0.46], 'attached-east', ['offset-mass', 'side-glass-bay']),
      designVolume('entry-gallery', 'add', [0.42, 0.36, 0.16], 'front-center', ['porch', 'gallery', 'entry-focus'], 'flat'),
      designVolume('rear-lounge', 'add', [0.4, 0.58, 0.28], 'attached-north', ['lounge', 'secondary-mass'])
    ]
  },
  {
    id: 'corner-vertical-accent',
    label: 'corner vertical accent',
    split: 'cross-axis',
    publicCore: 'living',
    order: ['entry', 'stairs', 'living', 'kitchen', 'dining', 'study', 'bathroom', 'storage'],
    volumes: [
      designVolume('glass-wing', 'mutate', [0.32, 0.5, 0.36], 'attached-south', ['offset-mass', 'front-glass-bay']),
      designVolume('corner-lookout', 'add', [0.22, 1.18, 0.22], 'attached-north-east', ['tower', 'vertical-accent'], 'flat'),
      designVolume('side-studio-bay', 'add', [0.28, 0.62, 0.42], 'attached-east', ['wing', 'studio-bay'])
    ]
  },
  {
    id: 'dual-wing-balanced',
    label: 'dual wing balanced massing',
    split: 'axis-balanced',
    publicCore: 'living',
    order: ['entry', 'living', 'stairs', 'dining', 'kitchen', 'study', 'bathroom', 'storage'],
    volumes: [
      designVolume('glass-wing', 'mutate', [0.3, 0.6, 0.44], 'attached-north-east', ['offset-mass', 'corner-glass']),
      designVolume('west-wing', 'mutate', [0.28, 0.82, 0.54], 'attached-west', ['secondary-mass', 'wing']),
      designVolume('east-wing', 'add', [0.28, 0.82, 0.54], 'attached-east', ['secondary-mass', 'wing'])
    ]
  },
  {
    id: 'formal-axis-manor',
    label: 'formal axis manor with paired wings',
    split: 'axis-balanced',
    publicCore: 'living',
    order: ['entry', 'living', 'dining', 'study', 'stairs', 'kitchen', 'bathroom', 'storage'],
    volumes: [
      designVolume('west-wing', 'mutate', [0.34, 0.96, 0.58], 'attached-west', ['secondary-mass', 'wing', 'formal-pair']),
      designVolume('east-wing', 'mutate', [0.34, 0.96, 0.58], 'attached-east', ['secondary-mass', 'wing', 'formal-pair']),
      designVolume('entry-portico', 'add', [0.38, 0.48, 0.2], 'front-center', ['porch', 'entry-focus', 'formal-axis', 'columned-entry'], 'flat'),
      designVolume('rear-stone-terrace', 'add', [0.5, 0.24, 0.24], 'attached-north', ['gallery', 'terrace', 'stone-terrace', 'formal-axis'], 'flat')
    ]
  },
  {
    id: 'compact-patio-bar',
    label: 'compact bar with patio bite',
    split: 'view-side-cluster',
    publicCore: 'dining',
    order: ['entry', 'living', 'kitchen', 'dining', 'bathroom', 'storage', 'study', 'stairs'],
    volumes: [
      designVolume('glass-wing', 'mutate', [0.24, 0.48, 0.34], 'attached-east', ['offset-mass', 'compact-glass-bay']),
      designVolume('patio-niche', 'add', [0.34, 0.36, 0.2], 'attached-south', ['porch', 'patio-transition'], 'flat'),
      designVolume('quiet-study-bay', 'add', [0.22, 0.58, 0.34], 'attached-west', ['wing', 'quiet-bay'])
    ]
  }
];

const ROOF_VARIANTS = [
  { profile: 'thin-parapet-terrace', style: 'flat', overhang: 0, skylights: true, roof_terrace: true, dormers: 0 },
  { profile: 'stepped-flat-with-light-slot', style: 'flat', overhang: 1, skylights: true, roof_terrace: false, dormers: 0 },
  { profile: 'split-gable-modernized', style: 'gabled', overhang: 1, skylights: false, roof_terrace: false, dormers: 1 },
  { profile: 'deep-hipped-shelter', style: 'hipped', overhang: 2, skylights: false, roof_terrace: false, dormers: 0 },
  { profile: 'low-layered-eaves', style: 'hipped', overhang: 2, skylights: true, roof_terrace: false, dormers: 0 },
  { profile: 'service-flat-roof', style: 'flat', overhang: 0, skylights: false, roof_terrace: true, dormers: 0 }
];

const FACADE_VARIANTS = [
  { rhythm: 'asymmetric-panels', glazing: 'high', width: 4, height: 3, spacing: 5, relief: 'high', entry: 'recessed-glass-portal', surrounds: 'thick-box' },
  { rhythm: 'vertical-slot-grid', glazing: 'medium', width: 2, height: 3, spacing: 4, relief: 'medium', entry: 'projecting-canopy', surrounds: 'thin-line' },
  { rhythm: 'corner-window-bands', glazing: 'high', width: 5, height: 3, spacing: 6, relief: 'medium', entry: 'offset-frame', surrounds: 'corner-wrap' },
  { rhythm: 'quiet-punched-windows', glazing: 'medium', width: 2, height: 2, spacing: 7, relief: 'low', entry: 'solid-framed-door', surrounds: 'deep-reveal' },
  { rhythm: 'irregular-studio-grid', glazing: 'high', width: 3, height: 3, spacing: 4, relief: 'high', entry: 'double-height-marker', surrounds: 'varied-depth' },
  { rhythm: 'horizontal-ribbon-breaks', glazing: 'high', width: 4, height: 2, spacing: 4, relief: 'medium', entry: 'wide-threshold', surrounds: 'ribbon-frame' }
];

const SITE_VARIANTS = [
  { mood: 'ordered-entry-court', patio: true, planting_beds: true, outdoor_seating: false, water_feature: false },
  { mood: 'lush-side-garden', patio: true, planting_beds: true, outdoor_seating: true, water_feature: false },
  { mood: 'dry-modern-court', patio: true, planting_beds: false, outdoor_seating: true, water_feature: false, dry_garden: true },
  { mood: 'reflecting-water-edge', patio: true, planting_beds: true, outdoor_seating: true, water_feature: true },
  { mood: 'compact-urban-strip', patio: false, planting_beds: true, outdoor_seating: false, water_feature: false },
  { mood: 'open-family-yard', patio: true, planting_beds: true, outdoor_seating: true, water_feature: false }
];

const INTERIOR_VARIANTS = [
  { color_story: 'cyan-yellow-red', density: 'layered', display: 'long-wall-gallery', floor: 'minecraft:cyan_carpet' },
  { color_story: 'green-orange-white', density: 'warm', display: 'corner-display-cases', floor: 'minecraft:green_carpet' },
  { color_story: 'blue-magenta-light', density: 'gallery', display: 'staggered-shelves', floor: 'minecraft:blue_carpet' },
  { color_story: 'red-white-black', density: 'formal', display: 'paired-display-cabinets', floor: 'minecraft:red_carpet' },
  { color_story: 'lime-purple-gold', density: 'playful', display: 'mixed-niche-displays', floor: 'minecraft:lime_carpet' },
  { color_story: 'white-blue-plant', density: 'quiet', display: 'low-open-shelves', floor: 'minecraft:light_blue_carpet' }
];

export class CreativeDesignAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = ['auto', 'mock', 'llm'].includes(mode) ? mode : 'auto';
  }

  async run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, context = {}) {
    const fallback = normalizeCreativeDesign(
      buildSeededCreativeDesign(prompt, architecture, buildSpec, topology, context),
      'seeded-local',
      context.llmError
    );
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 住宅的 CreativeDesignAgent。',
            '你的职责是决定设计，而不是检查合理性；几何引擎只负责把你的决策安全落地。',
            '目标：至少 70% 的可变设计选择来自本 JSON，而不是后续固定算法。',
            '只输出严格 JSON object，不要 Markdown。',
            '必需字段: authority, signature, design_axes, volume_directives, facade, roof, site, interior, topology。',
            'volume_directives 只能使用相对体块，不允许 XYZ 坐标；placement.relation 用 attached-east、attached-west、attached-north、attached-south、front-center、attached-north-east 等语义关系。',
            'topology 可以决定每层 room_order_by_floor、node_weights、split_strategy、public_core_position，但不能输出绝对坐标。',
            '如果 reference_reproduction.active 为 true，你必须优先复现参考案例的体量比例、轮廓层次、场地构图、材质气质和细节密度，但仍需改变精确尺寸和细节位置，不能逐块复制。',
            '所有选择必须服从用户明确尺寸、楼层、门朝向、房间功能、外壳密闭和可达性。'
          ].join('\n'),
          user: JSON.stringify({
            user_prompt: prompt,
            seed: buildSpec.seed,
            architecture_summary: compactArchitecture(architecture),
            topology_summary: compactTopology(topology),
            build_spec: compactBuildSpec(buildSpec),
            reference_reproduction: architecture.generation_hints?.reference_reproduction || buildSpec.design?.reference_reproduction || {},
            concept_studio: context.conceptStudio || {},
            fallback_variation_example: fallback
          })
        });
        return normalizeCreativeDesign(parsed, 'llm');
      } catch (error) {
        if (this.mode === 'llm') throw error;
        return normalizeCreativeDesign(
          buildSeededCreativeDesign(prompt, architecture, buildSpec, topology, context),
          'fallback-after-llm-error',
          error.message
        );
      }
    }

    return fallback;
  }
}

export function buildSeededCreativeDesign(prompt = '', architecture = {}, buildSpec = {}, topology = {}, context = {}) {
  const rng = seededRng(`${prompt}|${buildSpec.seed ?? 'none'}|creative-design-v2`);
  const seedIndex = seedIndexFor(prompt, buildSpec.seed);
  const templateComposition = templateCompositionStrategyFor(architecture, buildSpec);
  let massing = templateMassingVariant(templateComposition, seedIndex) || pickByIndex(MASSING_VARIANTS, seedIndex);
  massing = promptCompatibleMassingVariant(massing, prompt, architecture, templateComposition, seedIndex);
  let roof = templateRoofVariant(templateComposition, seedIndex + 1) || fallbackRoofVariant(prompt, architecture, buildSpec, seedIndex + 1);
  roof = promptCompatibleRoofVariant(roof, prompt, architecture, buildSpec, templateComposition, seedIndex + 1);
  let facade = templateFacadeVariant(templateComposition, seedIndex + 2) || pickByIndex(FACADE_VARIANTS, seedIndex + 2);
  let site = templateSiteVariant(templateComposition, seedIndex + 3) || pickByIndex(SITE_VARIANTS, seedIndex + 3);
  const interior = pickByIndex(INTERIOR_VARIANTS, seedIndex + 4);
  const floors = Math.max(1, Number(buildSpec.floors || 1));
  const roomOrder = {};
  for (let floor = 0; floor < floors; floor += 1) {
    const nodes = (topology.nodes || []).filter((node) => Number(node.floor || 0) === floor);
    const baseOrder = floor === 0 ? massing.order : upperFloorOrder(nodes, rng);
    roomOrder[floor] = mergeOrder(baseOrder, nodes.map((node) => node.id));
  }
  const weightBias = {};
  for (const node of topology.nodes || []) {
    weightBias[node.id] = round2(clampNumber(Number(node.weight || 1) * (0.78 + rng() * 0.54), 0.25, 3));
  }

  const explicitFlatRoof = /平屋顶|平顶|露台顶|屋顶平台/.test(prompt);
  const explicitPitchedRoof = /坡屋顶|尖顶|歇山|庑殿|四坡|人字|gabled|hipped/i.test(prompt);
  const roofStyle = explicitFlatRoof || explicitPitchedRoof ? architecture.roof_rules?.style || buildSpec.roof_style || roof.style : roof.style;
  const volumeDirectives = specializeVolumes(massing.volumes, architecture, buildSpec, rng);

  const design = {
    authority: {
      target_llm_decision_share: 0.7,
      estimated_llm_decision_share: 0.74,
      fixed_algorithm_role: 'constraint-checking-and-safe-voxelization',
      variable_axes: [
        'massing',
        'volume-placement',
        'room-order',
        'room-weight',
        'split-strategy',
        'facade-rhythm',
        'roof-expression',
        'site-program',
        'interior-color-density',
        'detail-pattern'
      ]
    },
    signature: `${massing.id}/${facade.rhythm}/${roof.profile}/${site.mood}/${interior.color_story}/template-composition${templateComposition.directives?.reference_reproduction_strength === 'high' ? '-strong-reference' : ''}`,
    design_axes: {
      massing_variant: massing.id,
      massing_label: massing.label,
      public_core: massing.publicCore,
      split_strategy: massing.split,
      composition_bias: compositionBias(volumeDirectives),
      detail_density: facade.relief,
      interior_color_story: interior.color_story
    },
    volume_directives: volumeDirectives,
    facade: {
      window_rhythm: facade.rhythm,
      glazing_ratio: facade.glazing,
      window_width: facade.width,
      window_height: facade.height,
      window_spacing: facade.spacing,
      wall_relief: facade.relief !== 'low',
      relief_density: facade.relief,
      entry_detail_style: facade.entry,
      window_surround_pattern: facade.surrounds,
      asymmetry: !/对称|中轴|庄园|宫殿/.test(prompt)
    },
    roof: {
      ...roof,
      style: roofStyle
    },
    site,
    interior: {
      color_story: interior.color_story,
      decor_density: interior.density,
      display_strategy: interior.display,
      floor_accent: interior.floor,
      edge_bias: 'edge-anchored-with-one-central-rug',
      center_clutter_policy: 'only rugs-or-primary-tables-in-center'
    },
    topology: {
      room_order_by_floor: roomOrder,
      node_weights: weightBias,
      extra_nodes: extraNodesForVariant(massing.id, buildSpec, rng),
      split_strategy: massing.split,
      public_core: massing.publicCore,
      public_core_position: publicCorePosition(massing.id),
      soft_boundary_bias: ['open-plan-weighted', 'view-side-cluster'].includes(massing.split) ? 'high' : 'medium'
    }
  };

  return applyConceptPatchToCreativeDesign(design, context.conceptStudio?.selectedConcept, context.conceptStudio);
}

export function applyCreativeDesign({ architecture = {}, buildSpec = {}, topology = {}, creativeDesign = {}, prompt = '' } = {}) {
  const design = applyTemplateCompositionToCreativeDesign(
    normalizeCreativeDesign(creativeDesign, creativeDesign.decision_source || 'seeded-local'),
    architecture,
    buildSpec
  );
  const nextArchitecture = {
    ...architecture,
    volumes: applyVolumeDirectives(architecture.volumes || [], design.volume_directives || []),
    facade_rules: {
      ...(architecture.facade_rules || {}),
      window_rhythm: design.facade.window_rhythm,
      glazing_ratio: design.facade.glazing_ratio || architecture.facade_rules?.glazing_ratio,
      wall_relief: design.facade.wall_relief,
      entry_detail_variant: design.facade.entry_detail_style,
      window_surround_pattern: design.facade.window_surround_pattern,
      large_glass: design.facade.glazing_ratio === 'high' || architecture.facade_rules?.large_glass,
      asymmetry: design.facade.asymmetry
    },
    roof_rules: {
      ...(architecture.roof_rules || {}),
      style: shouldPreservePromptRoof(prompt) ? architecture.roof_rules?.style || buildSpec.roof_style : design.roof.style,
      profile: design.roof.profile,
      overhang: design.roof.overhang,
      skylights: Boolean(design.roof.skylights),
      roof_terrace: Boolean(design.roof.roof_terrace),
      dormers: design.roof.dormers
    },
    site_rules: {
      ...(architecture.site_rules || {}),
      landscape_mood: design.site.mood,
      patio: Boolean(design.site.patio || architecture.site_rules?.patio),
      planting_beds: Boolean(design.site.planting_beds || architecture.site_rules?.planting_beds),
      outdoor_seating: Boolean(design.site.outdoor_seating || architecture.site_rules?.outdoor_seating),
      water_feature: Boolean(design.site.water_feature || architecture.site_rules?.water_feature),
      dry_garden: Boolean(design.site.dry_garden || architecture.site_rules?.dry_garden)
    },
    massing_rules: {
      ...(architecture.massing_rules || {}),
      creative_variant: design.design_axes.massing_variant,
      composition_bias: design.design_axes.composition_bias
    },
    detail_rules: {
      ...(architecture.detail_rules || {}),
      creative_signature: design.signature,
      interior_color_story: design.interior.color_story,
      decor_density: design.interior.decor_density,
      display_strategy: design.interior.display_strategy
    },
    generation_hints: {
      ...(architecture.generation_hints || {}),
      creative_design_signature: design.signature,
      design_authority_target: design.authority.target_llm_decision_share,
      estimated_design_decision_share: design.authority.estimated_llm_decision_share
    },
    design_directives: design
  };

  const nextBuildSpec = {
    ...buildSpec,
    roof_style: nextArchitecture.roof_rules.style || buildSpec.roof_style,
    roof_overhang: nextArchitecture.roof_rules.overhang ?? buildSpec.roof_overhang,
    facade: {
      ...(buildSpec.facade || {}),
      large_glass: Boolean(nextArchitecture.facade_rules.large_glass),
      glazing_ratio: nextArchitecture.facade_rules.glazing_ratio || buildSpec.facade?.glazing_ratio,
      wall_relief: Boolean(nextArchitecture.facade_rules.wall_relief),
      window_rhythm: nextArchitecture.facade_rules.window_rhythm
    },
    site: {
      ...(buildSpec.site || {}),
      landscape_mood: nextArchitecture.site_rules.landscape_mood || buildSpec.site?.landscape_mood,
      patio: Boolean(nextArchitecture.site_rules.patio),
      water_feature: Boolean(nextArchitecture.site_rules.water_feature),
      dry_garden: Boolean(nextArchitecture.site_rules.dry_garden),
      planting_beds: Boolean(nextArchitecture.site_rules.planting_beds),
      outdoor_seating: Boolean(nextArchitecture.site_rules.outdoor_seating)
    },
    creative_design_signature: design.signature
  };

  const nextTopology = applyTemplateSpacePlanningStrategy(
    applyTopologyDirectives(topology, design),
    { prompt, architecture: nextArchitecture, buildSpec: nextBuildSpec }
  );
  return { architecture: nextArchitecture, buildSpec: nextBuildSpec, topology: nextTopology, creativeDesign: design };
}

function applyConceptPatchToCreativeDesign(design = {}, selectedConcept = {}, conceptStudio = {}) {
  if (!conceptStudio?.active || !selectedConcept?.creative_design_patch) return design;
  const patch = selectedConcept.creative_design_patch || {};
  const next = {
    ...design,
    signature: `${selectedConcept.id || 'concept'}/${design.signature}`,
    concept_studio: {
      active: true,
      selected_concept_id: selectedConcept.id,
      selected_title: selectedConcept.title,
      selected_archetype: selectedConcept.archetype,
      strategy: conceptStudio.strategy || 'select'
    },
    design_axes: {
      ...(design.design_axes || {}),
      massing_variant: patch.massing_variant || design.design_axes?.massing_variant,
      massing_label: selectedConcept.title || design.design_axes?.massing_label,
      public_core: patch.topology?.public_core || design.design_axes?.public_core,
      split_strategy: patch.topology?.split_strategy || design.design_axes?.split_strategy,
      composition_bias: patch.topology?.public_core_position || design.design_axes?.composition_bias,
      detail_density: patch.facade?.relief_density || design.design_axes?.detail_density
    },
    facade: {
      ...(design.facade || {}),
      ...(patch.facade || {})
    },
    roof: {
      ...(design.roof || {}),
      ...(patch.roof || {})
    },
    site: {
      ...(design.site || {}),
      ...(patch.site || {})
    },
    interior: {
      ...(design.interior || {}),
      ...(patch.interior || {})
    },
    topology: {
      ...(design.topology || {}),
      ...(patch.topology || {})
    }
  };
  next.authority = {
    ...(design.authority || {}),
    variable_axes: [...new Set([...(design.authority?.variable_axes || []), 'concept-studio'])]
  };
  return next;
}

function normalizeConceptStudioMetadata(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    active: Boolean(raw.active),
    selected_concept_id: raw.selected_concept_id ? String(raw.selected_concept_id) : undefined,
    selected_title: raw.selected_title ? String(raw.selected_title) : undefined,
    selected_archetype: raw.selected_archetype ? String(raw.selected_archetype) : undefined,
    strategy: raw.strategy ? String(raw.strategy) : undefined
  };
}

export function normalizeCreativeDesign(value = {}, decisionSource = 'seeded-local', llmError) {
  const raw = value && typeof value === 'object' ? value : {};
  const authority = raw.authority && typeof raw.authority === 'object' ? raw.authority : {};
  const axes = raw.design_axes && typeof raw.design_axes === 'object' ? raw.design_axes : {};
  const facade = raw.facade && typeof raw.facade === 'object' ? raw.facade : {};
  const roof = raw.roof && typeof raw.roof === 'object' ? raw.roof : {};
  const site = raw.site && typeof raw.site === 'object' ? raw.site : {};
  const interior = raw.interior && typeof raw.interior === 'object' ? raw.interior : {};
  const topology = raw.topology && typeof raw.topology === 'object' ? raw.topology : {};
  const conceptStudio = normalizeConceptStudioMetadata(raw.concept_studio || raw.conceptStudio);

  return {
    source: 'local-creative-design-agent',
    decision_source: decisionSource,
    ...(conceptStudio.active ? { concept_studio: conceptStudio } : {}),
    ...(llmError ? { llm_error: String(llmError) } : {}),
    authority: {
      target_llm_decision_share: ratio(authority.target_llm_decision_share, 0.7),
      estimated_llm_decision_share: ratio(authority.estimated_llm_decision_share, decisionSource === 'llm' ? 0.78 : 0.74),
      fixed_algorithm_role: String(authority.fixed_algorithm_role || 'constraint-checking-and-safe-voxelization'),
      variable_axes: normalizeStringArray(authority.variable_axes).length
        ? normalizeStringArray(authority.variable_axes)
        : ['massing', 'room-order', 'facade-rhythm', 'roof-expression', 'site-program', 'interior-color-density']
    },
    signature: String(raw.signature || `${axes.massing_variant || 'variant'}/${facade.window_rhythm || 'rhythm'}/${roof.profile || 'roof'}`),
    design_axes: {
      massing_variant: String(axes.massing_variant || 'seeded-variant'),
      massing_label: String(axes.massing_label || axes.massing_variant || 'seeded design variant'),
      public_core: String(axes.public_core || topology.public_core || 'living'),
      split_strategy: String(axes.split_strategy || topology.split_strategy || 'weighted'),
      composition_bias: String(axes.composition_bias || 'balanced'),
      detail_density: String(axes.detail_density || facade.relief_density || 'medium'),
      interior_color_story: String(axes.interior_color_story || interior.color_story || 'balanced')
    },
    volume_directives: normalizeVolumeDirectives(raw.volume_directives || raw.volumeDirectives),
    facade: {
      window_rhythm: String(facade.window_rhythm || facade.rhythm || 'balanced'),
      glazing_ratio: normalizeGlazing(facade.glazing_ratio || facade.glazing),
      window_width: clampInt(facade.window_width || facade.width, 1, 5, 2),
      window_height: clampInt(facade.window_height || facade.height, 1, 4, 2),
      window_spacing: clampInt(facade.window_spacing || facade.spacing, 3, 10, 6),
      wall_relief: facade.wall_relief !== false,
      relief_density: String(facade.relief_density || facade.relief || 'medium'),
      entry_detail_style: String(facade.entry_detail_style || facade.entry || 'framed-entry'),
      window_surround_pattern: String(facade.window_surround_pattern || facade.surrounds || 'standard'),
      asymmetry: facade.asymmetry !== false
    },
    roof: {
      style: normalizeRoofStyle(roof.style),
      profile: String(roof.profile || 'style-default'),
      overhang: clampInt(roof.overhang, 0, 4, 1),
      skylights: Boolean(roof.skylights),
      roof_terrace: Boolean(roof.roof_terrace || roof.roofTerrace),
      dormers: clampInt(roof.dormers, 0, 4, 0)
    },
    site: {
      mood: String(site.mood || site.landscape_mood || 'simple'),
      patio: Boolean(site.patio),
      planting_beds: Boolean(site.planting_beds || site.plantingBeds),
      outdoor_seating: Boolean(site.outdoor_seating || site.outdoorSeating),
      water_feature: Boolean(site.water_feature || site.waterFeature),
      dry_garden: Boolean(site.dry_garden || site.dryGarden)
    },
    interior: {
      color_story: String(interior.color_story || 'balanced'),
      decor_density: String(interior.decor_density || interior.density || 'medium'),
      display_strategy: String(interior.display_strategy || interior.display || 'wall-display'),
      floor_accent: String(interior.floor_accent || interior.floor || 'minecraft:white_carpet'),
      edge_bias: String(interior.edge_bias || 'edge-anchored'),
      center_clutter_policy: String(interior.center_clutter_policy || 'avoid-center-clutter')
    },
    topology: {
      room_order_by_floor: normalizeRoomOrder(topology.room_order_by_floor || topology.roomOrderByFloor),
      node_weights: normalizeNodeWeights(topology.node_weights || topology.nodeWeights),
      extra_nodes: normalizeExtraNodes(topology.extra_nodes || topology.extraNodes),
      split_strategy: String(topology.split_strategy || axes.split_strategy || 'weighted'),
      public_core: String(topology.public_core || axes.public_core || 'living'),
      public_core_position: String(topology.public_core_position || 'center'),
      soft_boundary_bias: String(topology.soft_boundary_bias || 'medium')
    }
  };
}

function applyTemplateCompositionToCreativeDesign(design = {}, architecture = {}, buildSpec = {}) {
  const strategy = templateCompositionStrategyFor(architecture, buildSpec);
  const directives = strategy.directives || {};
  if (!strategy || !directives || Object.keys(directives).length === 0) return design;
  const explicitComposition = shouldUseTemplateVariantPreference(directives);
  const lockedMassing = Boolean(directives.lock_preferred_massing_variant && directives.preferred_massing_variant);

  const variant = lockedMassing
    ? directives.preferred_massing_variant
    : design.design_axes?.massing_variant || directives.preferred_massing_variant;
  const anchoredDirectives = lockedMassing
    ? mergeLockedMassingVolumeDirectives(
      filterConflictingVolumeDirectives(design.volume_directives || [], directives),
      variant,
      architecture,
      buildSpec
    )
    : design.volume_directives || [];
  const volumeDirectives = mergeTemplateVolumeDirectives(anchoredDirectives, directives);
  return {
    ...design,
    signature: design.signature.includes('template-composition') ? design.signature : `${design.signature}+template-composition`,
    authority: {
      ...(design.authority || {}),
      variable_axes: [...new Set([...(design.authority?.variable_axes || []), 'template-composition-grammar'])]
    },
    design_axes: {
      ...(design.design_axes || {}),
      massing_variant: variant,
      massing_label: labelForMassingVariant(variant) || design.design_axes?.massing_label,
      composition_bias: directives.use_wings ? 'template-guided-wings'
        : directives.use_vertical_accent ? 'template-guided-vertical'
          : directives.use_foreground_garden_sequence ? 'template-guided-approach'
            : design.design_axes?.composition_bias || 'balanced',
      template_composition_readiness: strategy.readiness || 'unknown'
    },
    volume_directives: volumeDirectives,
    facade: {
      ...(design.facade || {}),
      window_rhythm: design.facade?.window_rhythm === 'balanced' ? directives.preferred_facade_rhythm || design.facade?.window_rhythm : design.facade?.window_rhythm,
      glazing_ratio: directives.use_large_view_glass ? 'high' : design.facade?.glazing_ratio,
      wall_relief: directives.use_facade_depth || design.facade?.wall_relief,
      relief_density: explicitComposition && directives.use_facade_depth ? 'high' : design.facade?.relief_density,
      window_surround_pattern: explicitComposition && directives.use_facade_depth ? 'varied-depth' : design.facade?.window_surround_pattern
    },
    roof: {
      ...(design.roof || {}),
      ...roofPatchForTemplate(directives, design.roof || {})
    },
    site: {
      ...(design.site || {}),
      mood: design.site?.mood === 'simple' ? directives.preferred_site_mood || design.site?.mood : design.site?.mood,
      patio: Boolean(design.site?.patio || directives.use_courtyard_or_patio_void || directives.use_waterfront_transition),
      planting_beds: Boolean(design.site?.planting_beds || directives.use_foreground_garden_sequence),
      outdoor_seating: Boolean(design.site?.outdoor_seating || directives.use_waterfront_transition),
      water_feature: Boolean(design.site?.water_feature || directives.use_waterfront_transition),
      dry_garden: Boolean(design.site?.dry_garden)
    },
    topology: {
      ...(design.topology || {}),
      public_core_position: directives.use_waterfront_transition ? 'view-facing' : design.topology?.public_core_position,
      soft_boundary_bias: directives.use_large_view_glass || directives.use_courtyard_or_patio_void ? 'high' : design.topology?.soft_boundary_bias
    },
    template_composition_strategy: strategy
  };
}

function templateCompositionStrategyFor(architecture = {}, buildSpec = {}) {
  return architecture.generation_hints?.template_composition_strategy ||
    architecture.massing_rules?.template_composition_strategy ||
    architecture.detail_rules?.template_composition_strategy ||
    buildSpec.design?.template_composition_strategy ||
    architecture.template_knowledge?.recommendations?.composition_strategy ||
    buildSpec.template_knowledge?.recommendations?.composition_strategy ||
    {};
}

function templateMassingVariant(strategy = {}, seedIndex = 0) {
  if (strategy.directives?.lock_preferred_massing_variant && strategy.directives?.preferred_massing_variant) {
    return variantById(MASSING_VARIANTS, strategy.directives.preferred_massing_variant);
  }
  return pickTemplateVariant(MASSING_VARIANTS, templateVariantIds('massing', strategy.directives?.preferred_massing_variant, strategy.directives), seedIndex);
}

function promptCompatibleMassingVariant(massing, prompt = '', architecture = {}, strategy = {}, seedIndex = 0) {
  if (massing?.id === 'waterfront-stepped-estate' && !waterfrontMassingAllowed(prompt, architecture, strategy)) {
    const generalVariants = MASSING_VARIANTS.filter((variant) => !['formal-axis-manor', 'waterfront-stepped-estate'].includes(variant.id));
    return pickByIndex(generalVariants, seedIndex + 1);
  }
  if (massing?.id !== 'formal-axis-manor' || formalAxisMassingAllowed(prompt, architecture, strategy)) return massing;
  const allowWaterfront = waterfrontMassingAllowed(prompt, architecture, strategy);
  const generalVariants = MASSING_VARIANTS.filter((variant) =>
    variant.id !== 'formal-axis-manor' &&
    (allowWaterfront || variant.id !== 'waterfront-stepped-estate')
  );
  return variantById(generalVariants, 'east-offset-glass-wing') || pickByIndex(generalVariants, seedIndex + 1);
}

function formalAxisMassingAllowed(prompt = '', architecture = {}, strategy = {}) {
  const directives = strategy.directives || {};
  if (directives.massing_intent === 'formal-axis' || directives.preferred_massing_variant === 'formal-axis-manor') return true;
  const text = `${prompt} ${architecture.style || ''} ${architecture.style_family || ''} ${architecture.typology || ''} ${architecture.footprint || ''}`.toLowerCase();
  return /classical|european|victorian|baroque|rococo|manor|palace|古典|欧式|法式|庄园|宫殿|巴洛克|洛可可|维多利亚|对称|中轴|轴线|formal|symmetry|axis/.test(text);
}

function waterfrontMassingAllowed(prompt = '', architecture = {}, strategy = {}) {
  const directives = strategy.directives || {};
  if (directives.preferred_massing_variant === 'waterfront-stepped-estate' || directives.massing_intent === 'modern-waterfront') return true;
  const text = `${prompt} ${architecture.style || ''} ${architecture.style_family || ''} ${architecture.typology || ''}`.toLowerCase();
  return /湖|海|河|水边|临水|滨水|湖边|海边|水景|water|lake|coast|waterfront|riverside/.test(text);
}

function templateRoofVariant(strategy = {}, seedIndex = 0) {
  if (strategy.directives?.lock_preferred_roof_profile && strategy.directives?.preferred_roof_profile) {
    return ROOF_VARIANTS.find((item) => item.profile === strategy.directives.preferred_roof_profile);
  }
  return pickTemplateVariant(ROOF_VARIANTS, templateVariantIds('roof', strategy.directives?.preferred_roof_profile, strategy.directives), seedIndex, 'profile');
}

function promptCompatibleRoofVariant(roof, prompt = '', architecture = {}, buildSpec = {}, strategy = {}, seedIndex = 0) {
  if (!roof || strategy.directives?.lock_preferred_roof_profile) return roof;
  const text = String(prompt || '');
  const family = String(architecture.style_family || buildSpec.style_family || '').toLowerCase();
  const desiredStyle = String(architecture.roof_rules?.style || buildSpec.roof_style || '').toLowerCase();
  const explicitFlatRoof = /平屋顶|平顶|露台顶|屋顶平台|roof terrace|roof deck|flat roof/i.test(text);
  const explicitLayeredEaves = /层叠|重檐|深檐|飞檐|屋檐|eaves|pagoda/.test(text);
  const pitchedFamily = /classical|gothic|medieval|rustic|nordic|alpine|victorian|farmhouse/.test(family);
  const eastAsian = /japanese|chinese|east-asian|pagoda/.test(family);
  const flatConflict = roof.style === 'flat' && !explicitFlatRoof && (pitchedFamily || (desiredStyle && desiredStyle !== 'flat'));
  const layeredConflict = roof.profile === 'low-layered-eaves' && !eastAsian && !explicitLayeredEaves;
  if (flatConflict || layeredConflict) {
    return fallbackRoofVariant(prompt, architecture, buildSpec, seedIndex);
  }
  return roof;
}

function fallbackRoofVariant(prompt = '', architecture = {}, buildSpec = {}, seedIndex = 0) {
  const text = String(prompt || '');
  const family = String(architecture.style_family || buildSpec.style_family || '').toLowerCase();
  const desiredStyle = String(architecture.roof_rules?.style || buildSpec.roof_style || '').toLowerCase();
  const explicitFlatRoof = /平屋顶|平顶|露台顶|屋顶平台|roof terrace|roof deck|flat roof/i.test(text);
  const pitchedFamily = /classical|gothic|medieval|rustic|nordic|alpine|victorian|farmhouse/.test(family);
  if (!explicitFlatRoof && pitchedFamily) {
    const pitched = ROOF_VARIANTS.filter((item) =>
      item.style !== 'flat' &&
      (family === 'japanese' || item.profile !== 'low-layered-eaves')
    );
    return pickByIndex(pitched, seedIndex);
  }
  if (!explicitFlatRoof && desiredStyle && desiredStyle !== 'flat') {
    const matching = ROOF_VARIANTS.filter((item) =>
      item.style === desiredStyle &&
      (desiredStyle !== 'hipped' || family === 'japanese' || item.profile !== 'low-layered-eaves')
    );
    if (matching.length) return pickByIndex(matching, seedIndex);
    const nonFlat = ROOF_VARIANTS.filter((item) => item.style !== 'flat');
    if (nonFlat.length) return pickByIndex(nonFlat, seedIndex);
  }
  if (explicitFlatRoof || desiredStyle === 'flat') {
    return pickByIndex(ROOF_VARIANTS.filter((item) => item.style === 'flat'), seedIndex);
  }
  return pickByIndex(ROOF_VARIANTS, seedIndex);
}

function templateFacadeVariant(strategy = {}, seedIndex = 0) {
  return pickTemplateVariant(FACADE_VARIANTS, templateVariantIds('facade', strategy.directives?.preferred_facade_rhythm, strategy.directives), seedIndex, 'rhythm');
}

function templateSiteVariant(strategy = {}, seedIndex = 0) {
  return pickTemplateVariant(SITE_VARIANTS, templateVariantIds('site', strategy.directives?.preferred_site_mood, strategy.directives), seedIndex, 'mood');
}

function variantById(items, id) {
  if (!id) return undefined;
  return items.find((item) => item.id === id);
}

function pickTemplateVariant(items, ids, seedIndex, key = 'id') {
  const candidates = (ids || [])
    .map((id) => items.find((item) => item[key] === id))
    .filter(Boolean);
  if (!candidates.length) return undefined;
  return pickByIndex(candidates, seedIndex);
}

function templateVariantIds(group, preferred, directives = {}) {
  if (!shouldUseTemplateVariantPreference(directives)) {
    if (group === 'massing') return MASSING_VARIANTS.map((item) => item.id);
    if (group === 'facade') return FACADE_VARIANTS.map((item) => item.rhythm);
    if (group === 'roof') return ROOF_VARIANTS.map((item) => item.profile);
    if (group === 'site') return SITE_VARIANTS.map((item) => item.mood);
  }
  const maps = {
    massing: {
      'waterfront-stepped-estate': ['waterfront-stepped-estate', 'east-offset-glass-wing', 'compact-patio-bar'],
      'east-offset-glass-wing': ['east-offset-glass-wing', 'compact-patio-bar', 'dual-wing-balanced'],
      'front-back-gallery': ['front-back-gallery', 'compact-patio-bar', 'west-service-wing'],
      'corner-vertical-accent': ['corner-vertical-accent', 'dual-wing-balanced', 'front-back-gallery'],
      'dual-wing-balanced': ['dual-wing-balanced', 'east-offset-glass-wing', 'west-service-wing'],
      'formal-axis-manor': ['formal-axis-manor', 'dual-wing-balanced'],
      'compact-patio-bar': ['compact-patio-bar', 'east-offset-glass-wing', 'front-back-gallery']
    },
    facade: {
      'horizontal-ribbon-breaks': ['horizontal-ribbon-breaks', 'corner-window-bands', 'asymmetric-panels', 'irregular-studio-grid'],
      'vertical-slot-grid': ['vertical-slot-grid', 'quiet-punched-windows', 'irregular-studio-grid'],
      'quiet-punched-windows': ['quiet-punched-windows', 'vertical-slot-grid', 'asymmetric-panels'],
      'irregular-studio-grid': ['irregular-studio-grid', 'asymmetric-panels', 'corner-window-bands']
    },
    roof: {
      'thin-parapet-terrace': ['thin-parapet-terrace', 'stepped-flat-with-light-slot', 'service-flat-roof'],
      'low-layered-eaves': ['low-layered-eaves', 'deep-hipped-shelter', 'split-gable-modernized'],
      'stepped-flat-with-light-slot': ['stepped-flat-with-light-slot', 'service-flat-roof', 'thin-parapet-terrace']
    },
    site: {
      'reflecting-water-edge': ['reflecting-water-edge', 'lush-side-garden', 'ordered-entry-court'],
      'ordered-entry-court': ['ordered-entry-court', 'lush-side-garden', 'dry-modern-court', 'open-family-yard'],
      'terrain-forecourt': ['ordered-entry-court', 'lush-side-garden', 'open-family-yard']
    }
  };
  if (maps[group]?.[preferred]) return maps[group][preferred];
  if (preferred) return [preferred];
  if (group === 'massing') return MASSING_VARIANTS.map((item) => item.id);
  if (group === 'facade') return FACADE_VARIANTS.map((item) => item.rhythm);
  if (group === 'roof') return ROOF_VARIANTS.map((item) => item.profile);
  if (group === 'site') return SITE_VARIANTS.map((item) => item.mood);
  return [];
}

function shouldUseTemplateVariantPreference(directives = {}) {
  return Boolean(
    directives.lock_preferred_massing_variant ||
    directives.lock_preferred_roof_profile ||
    directives.prompt_signals?.explicit_composition_request ||
    directives.prompt_signals?.reference_transfer ||
    ['high', 'medium'].includes(String(directives.reference_reproduction_strength || ''))
  );
}

function labelForMassingVariant(id) {
  return variantById(MASSING_VARIANTS, id)?.label;
}

function roofPatchForTemplate(directives = {}, current = {}) {
  const profile = current.profile && current.profile !== 'style-default' ? current.profile : directives.preferred_roof_profile;
  if (profile === 'thin-parapet-terrace') {
    return { style: 'flat', profile, overhang: 0, roof_terrace: true, skylights: current.skylights };
  }
  if (profile === 'low-layered-eaves') {
    return { style: current.style === 'pagoda' ? 'pagoda' : 'hipped', profile, overhang: Math.max(2, Number(current.overhang || 1)), skylights: current.skylights };
  }
  if (profile === 'stepped-flat-with-light-slot') {
    return { style: 'flat', profile, overhang: Math.max(1, Number(current.overhang || 1)), skylights: true, roof_terrace: current.roof_terrace };
  }
  if (directives.use_layered_roof_edges) {
    return { overhang: Math.max(2, Number(current.overhang || 1)) };
  }
  return {};
}

function filterConflictingVolumeDirectives(existing = [], directives = {}) {
  const intent = String(directives.massing_intent || '');
  if (!intent) return existing;
  return (existing || []).filter((directive) => {
    const text = volumeDirectiveText(directive);
    if (intent === 'formal-axis') {
      return !/(glass-wing|view-terrace|template-view-deck|template-side-gallery|sunroom|transparent-volume|waterfront|view-platform|offset-mass|corner-glass)/.test(text);
    }
    if (intent === 'modern-waterfront') {
      return !/(formal-axis|formal-pair|entry-portico|rear-stone-terrace|west-wing|east-wing|paired-wing|columned-entry)/.test(text);
    }
    return true;
  });
}

function mergeLockedMassingVolumeDirectives(existing = [], variantId, architecture = {}, buildSpec = {}) {
  const variant = variantById(MASSING_VARIANTS, variantId);
  if (!variant) return existing;
  const rng = seededRng(`${variantId}|${buildSpec.seed ?? 'none'}|locked-template-massing`);
  const lockedDirectives = specializeVolumes(variant.volumes, architecture, buildSpec, rng);
  const lockedIds = new Set(lockedDirectives.flatMap((directive) => [directive.id, directive.target]).filter(Boolean));
  const filtered = (existing || []).filter((directive) => !lockedIds.has(directive.id) && !lockedIds.has(directive.target));
  return [...filtered, ...lockedDirectives];
}

function volumeDirectiveText(directive = {}) {
  return [
    directive.id,
    directive.target,
    directive.role,
    directive.purpose,
    directive.facade_role,
    directive.placement?.relation,
    ...(Array.isArray(directive.tags) ? directive.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function mergeTemplateVolumeDirectives(existing = [], directives = {}) {
  if (!shouldUseTemplateVariantPreference(directives)) return existing;
  const result = [...existing];
  const add = (volume) => {
    if (result.some((item) => item.id === volume.id)) return;
    result.push(volume);
  };
  if (directives.use_wings && directives.massing_intent !== 'formal-axis') {
    add(designVolume('template-side-gallery', 'add', [0.28, 0.62, 0.48], 'attached-east', ['wing', 'template-composition', 'side-gallery']));
  }
  if (directives.use_vertical_accent) {
    add(designVolume('template-lookout-tower', 'add', [0.22, 1.24, 0.22], 'attached-north-east', ['tower', 'vertical-accent', 'template-composition'], 'flat'));
  }
  if ((directives.use_courtyard_or_patio_void || directives.use_foreground_garden_sequence) && directives.massing_intent !== 'formal-axis') {
    add(designVolume('template-entry-forecourt', 'add', [0.42, 0.34, 0.18], 'front-center', ['porch', 'entry-focus', 'template-composition'], 'flat'));
  }
  if (directives.use_waterfront_transition) {
    add(designVolume('template-view-deck', 'add', [0.5, 0.22, 0.22], 'attached-south', ['gallery', 'deck', 'view-platform', 'template-composition'], 'flat'));
  }
  return result;
}

function applyVolumeDirectives(volumes, directives) {
  const result = (volumes || []).map((volume) => ({ ...volume, placement: { ...(volume.placement || {}) }, tags: normalizeStringArray(volume.tags) }));
  for (const directive of directives || []) {
    const targetId = directive.target || directive.id;
    const existingIndex = result.findIndex((volume) => String(volume.id) === String(targetId));
    const patch = {
      id: directive.id,
      role: directive.role,
      shape: directive.shape,
      scale: directive.scale,
      placement: directive.placement,
      boolean_mode: directive.boolean_mode,
      tags: directive.tags,
      purpose: directive.purpose,
      facade_role: directive.facade_role,
      roof_policy: directive.roof_policy
    };
    if (directive.action === 'mutate' && existingIndex >= 0) {
      result[existingIndex] = mergeVolume(result[existingIndex], patch);
    } else if (!result.some((volume) => volume.id === directive.id)) {
      result.push(mergeVolume({
        id: directive.id,
        role: directive.role || directive.id,
        shape: 'box',
        scale: [0.25, 0.55, 0.32],
        placement: { relation: 'attached-east', attach_to: 'main' },
        boolean_mode: 'union',
        tags: []
      }, patch));
    }
  }
  return result;
}

function applyTopologyDirectives(topology = {}, design = {}) {
  const nodeWeights = design.topology.node_weights || {};
  const nodes = (topology.nodes || []).map((node) => ({
    ...node,
    weight: nodeWeights[node.id] ?? node.weight,
    tags: [...new Set([...normalizeStringArray(node.tags), `creative:${design.design_axes.massing_variant}`])]
  }));
  for (const extraNode of design.topology.extra_nodes || []) {
    if (nodes.some((node) => node.id === extraNode.id)) continue;
    nodes.push({
      ...extraNode,
      tags: [...new Set([...normalizeStringArray(extraNode.tags), 'creative-extra-node', `creative:${design.design_axes.massing_variant}`])]
    });
  }
  const edges = addCreativeExtraEdges(topology.edges || [], nodes, design);
  const floorProgram = addExtraNodesToFloorProgram(topology.floor_program || topology.floorProgram || [], nodes);
  return {
    ...topology,
    nodes,
    edges,
    floor_program: floorProgram,
    circulation_rules: {
      ...(topology.circulation_rules || {}),
      public_core: nodeExists(nodes, design.topology.public_core) ? design.topology.public_core : topology.circulation_rules?.public_core,
      creative_public_core_position: design.topology.public_core_position
    },
    bsp_hints: {
      ...(topology.bsp_hints || {}),
      split_strategy: design.topology.split_strategy || topology.bsp_hints?.split_strategy,
      room_order_by_floor: design.topology.room_order_by_floor,
      public_core_position: design.topology.public_core_position,
      soft_boundary_bias: design.topology.soft_boundary_bias,
      creative_design_signature: design.signature
    },
    creative_design: {
      signature: design.signature,
      massing_variant: design.design_axes.massing_variant,
      decision_source: design.decision_source
    }
  };
}

function normalizeVolumeDirectives(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: normalizeId(raw.id || `creative-volume-${index + 1}`),
      target: raw.target ? normalizeId(raw.target) : undefined,
      action: ['add', 'mutate'].includes(String(raw.action)) ? String(raw.action) : 'add',
      role: String(raw.role || raw.id || `创意体块 ${index + 1}`),
      shape: String(raw.shape || 'box') === 'cylinder' ? 'cylinder' : 'box',
      scale: normalizeScale(raw.scale),
      placement: normalizePlacement(raw.placement),
      boolean_mode: String(raw.boolean_mode || raw.booleanMode || 'union') === 'subtract' ? 'subtract' : 'union',
      tags: normalizeStringArray(raw.tags),
      purpose: raw.purpose ? String(raw.purpose) : undefined,
      facade_role: raw.facade_role ? String(raw.facade_role) : undefined,
      roof_policy: raw.roof_policy ? normalizeRoofStyle(raw.roof_policy) : undefined
    };
  });
}

function designVolume(id, action, scale, relation, tags = [], roofPolicy) {
  return {
    id,
    target: action === 'mutate' ? id : undefined,
    action,
    role: id.replaceAll('-', ' '),
    shape: tags.includes('tower') ? 'cylinder' : 'box',
    scale,
    placement: { relation, attach_to: 'main' },
    boolean_mode: 'union',
    tags,
    facade_role: tags.includes('glass') ? 'transparent-volume' : tags.includes('porch') ? 'entry-focus' : tags.includes('deck') ? 'view-platform' : undefined,
    roof_policy: roofPolicy
  };
}

function specializeVolumes(volumes, architecture, buildSpec, rng) {
  const existingIds = new Set((architecture.volumes || []).map((volume) => String(volume.id)));
  return volumes.map((volume, index) => {
    const mutateMissing = volume.action === 'mutate' && !existingIds.has(volume.id);
    const scaleJitter = volume.scale.map((value, axisIndex) => {
      const jitter = axisIndex === 1 ? 0.92 + rng() * 0.22 : 0.86 + rng() * 0.28;
      return round2(clampNumber(value * jitter, axisIndex === 1 ? 0.22 : 0.16, axisIndex === 1 ? 1.5 : 0.65));
    });
    return {
      ...volume,
      id: mutateMissing ? `${volume.id}-${index + 1}` : volume.id,
      action: mutateMissing ? 'add' : volume.action,
      scale: scaleJitter,
      tags: [...new Set([...normalizeStringArray(volume.tags), `variant-${index + 1}`])],
      placement: {
        ...(volume.placement || {}),
        attach_to: 'main'
      },
      roof_policy: volume.roof_policy || (buildSpec.roof_style === 'flat' ? 'flat' : undefined)
    };
  });
}

function compactArchitecture(architecture = {}) {
  return {
    style: architecture.style,
    style_family: architecture.style_family,
    typology: architecture.typology,
    footprint: architecture.footprint,
    volume_ids: (architecture.volumes || []).map((volume) => volume.id),
    facade_rules: architecture.facade_rules,
    roof_rules: architecture.roof_rules,
    site_rules: architecture.site_rules
  };
}

function compactTopology(topology = {}) {
  return {
    node_ids: (topology.nodes || []).map((node) => node.id),
    node_types: (topology.nodes || []).map((node) => node.type),
    edge_count: (topology.edges || []).length,
    bsp_hints: topology.bsp_hints
  };
}

function compactBuildSpec(buildSpec = {}) {
  return {
    width: buildSpec.width,
    depth: buildSpec.depth,
    floors: buildSpec.floors,
    floor_height: buildSpec.floor_height,
    door_side: buildSpec.door_side,
    roof_style: buildSpec.roof_style,
    facade: buildSpec.facade,
    site: buildSpec.site,
    seed: buildSpec.seed
  };
}

function mergeVolume(base, patch) {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    placement: {
      ...(base.placement || {}),
      ...(patch.placement || {})
    },
    tags: [...new Set([...normalizeStringArray(base.tags), ...normalizeStringArray(patch.tags)])]
  };
}

function normalizeScale(value) {
  const source = Array.isArray(value) ? value : [0.28, 0.58, 0.34];
  return [0, 1, 2].map((index) => round2(clampNumber(source[index], index === 1 ? 0.2 : 0.12, index === 1 ? 1.6 : 0.7, index === 1 ? 0.55 : 0.3)));
}

function normalizePlacement(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    relation: String(raw.relation || 'attached-east'),
    attach_to: String(raw.attach_to || raw.attachTo || 'main')
  };
}

function normalizeRoomOrder(value = {}) {
  const result = {};
  for (const [floor, order] of Object.entries(value || {})) {
    const floorNumber = String(Number(floor));
    if (!Number.isFinite(Number(floor))) continue;
    result[floorNumber] = normalizeStringArray(order).map(normalizeId);
  }
  return result;
}

function normalizeNodeWeights(value = {}) {
  const result = {};
  for (const [id, weight] of Object.entries(value || {})) {
    result[normalizeId(id)] = round2(clampNumber(weight, 0.2, 3, 1));
  }
  return result;
}

function normalizeExtraNodes(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    const type = normalizeRoomType(raw.type || raw.id || 'room');
    return {
      id: normalizeId(raw.id || `creative-extra-${index + 1}`),
      label: String(raw.label || raw.name || raw.id || `创意空间 ${index + 1}`),
      type,
      floor: clampInt(raw.floor, 0, 4, 0),
      weight: round2(clampNumber(raw.weight, 0.2, 1.2, 0.45)),
      privacy: String(raw.privacy || privacyForType(type)),
      zone: String(raw.zone || zoneForType(type)),
      orientation: raw.orientation ? String(raw.orientation) : undefined,
      access: raw.access ? String(raw.access) : undefined,
      daylight: raw.daylight ? String(raw.daylight) : undefined,
      tags: normalizeStringArray(raw.tags)
    };
  });
}

function extraNodesForVariant(variant, buildSpec = {}, rng) {
  const floor = 0;
  const weight = () => round2(0.38 + rng() * 0.24);
  if (variant === 'west-service-wing') {
    return [extraNode('utility-niche', '设备储物壁', 'utility', floor, weight(), 'service', ['service-wing'])];
  }
  if (variant === 'front-back-gallery') {
    return [extraNode('gallery-hall', '展示廊', 'corridor', floor, weight(), 'circulation', ['display-gallery'])];
  }
  if (variant === 'corner-vertical-accent') {
    return [extraNode('lookout-study', '观景书房角', 'study', Math.min(1, Number(buildSpec.floors || 1) - 1), weight(), 'private', ['corner-lookout'])];
  }
  if (variant === 'dual-wing-balanced') {
    return [extraNode('family-lounge', '家庭侧厅', 'lounge', floor, weight(), 'public', ['wing-room'])];
  }
  if (variant === 'formal-axis-manor') {
    return [
      extraNode('axis-gallery', '入口轴线廊', 'corridor', floor, weight(), 'circulation', ['formal-axis']),
      extraNode('manor-library-wing', '庄园书房翼', 'study', floor, weight(), 'private', ['formal-wing'])
    ];
  }
  if (variant === 'compact-patio-bar') {
    return [extraNode('display-vestibule', '展示玄关', 'room', floor, weight(), 'public', ['display-niche'])];
  }
  return [extraNode('sunny-reading-bay', '阳光阅读角', 'lounge', floor, weight(), 'public', ['glass-bay'])];
}

function extraNode(id, label, type, floor, weight, zone, tags = []) {
  return {
    id,
    label,
    type,
    floor,
    weight,
    privacy: privacyForType(type),
    zone,
    daylight: ['lounge', 'study'].includes(type) ? 'medium' : undefined,
    tags
  };
}

function addCreativeExtraEdges(edges = [], nodes = [], design = {}) {
  const result = [...edges];
  const ids = new Set(nodes.map((node) => node.id));
  const publicCore = ids.has(design.topology.public_core) ? design.topology.public_core : 'living';
  for (const node of nodes.filter((item) => normalizeStringArray(item.tags).includes('creative-extra-node'))) {
    const anchor = node.type === 'utility' || node.type === 'storage'
      ? (ids.has('kitchen') ? 'kitchen' : publicCore)
      : node.type === 'corridor'
        ? 'entry'
        : publicCore;
    if (!ids.has(anchor) || result.some((edge) => edge.from === anchor && edge.to === node.id)) continue;
    result.push({ from: anchor, to: node.id, relation: 'creative-design-adjacency', priority: 'normal' });
  }
  return result;
}

function addExtraNodesToFloorProgram(floorProgram = [], nodes = []) {
  const result = Array.isArray(floorProgram) && floorProgram.length
    ? floorProgram.map((floor) => ({
      ...floor,
      public: [...(floor.public || [])],
      private: [...(floor.private || [])],
      service: [...(floor.service || [])],
      circulation: [...(floor.circulation || [])],
      outdoor: [...(floor.outdoor || [])]
    }))
    : [];
  for (const node of nodes.filter((item) => normalizeStringArray(item.tags).includes('creative-extra-node'))) {
    while (result.length <= Number(node.floor || 0)) {
      const floor = result.length;
      result.push({ floor, label: floor === 0 ? 'ground' : `level-${floor + 1}`, public: [], private: [], service: [], circulation: [], outdoor: [] });
    }
    const floor = result[Number(node.floor || 0)];
    const key = zoneForType(node.type);
    if (!floor[key].includes(node.id)) floor[key].push(node.id);
  }
  return result;
}

function normalizeRoomType(value) {
  const text = String(value || '').toLowerCase();
  if (/entry|门厅|玄关|入口/.test(text)) return 'entry';
  if (/living|客厅|起居/.test(text)) return 'living';
  if (/dining|餐/.test(text)) return 'dining';
  if (/kitchen|厨/.test(text)) return 'kitchen';
  if (/stair|楼梯|vertical/.test(text)) return 'stairs';
  if (/corridor|hall|gallery|走廊|廊/.test(text)) return 'corridor';
  if (/bed|卧|客房/.test(text)) return 'bedroom';
  if (/study|书|office|工作/.test(text)) return 'study';
  if (/bath|wash|卫|浴|厕所/.test(text)) return 'bathroom';
  if (/utility|设备|洗衣/.test(text)) return 'utility';
  if (/storage|储/.test(text)) return 'storage';
  if (/lounge|侧厅|会客/.test(text)) return 'lounge';
  if (/sunroom|阳光房/.test(text)) return 'sunroom';
  return text || 'room';
}

function privacyForType(type) {
  if (['bedroom', 'study'].includes(type)) return 'private';
  if (['bathroom', 'storage', 'utility', 'kitchen'].includes(type)) return 'service';
  if (['corridor', 'stairs'].includes(type)) return 'circulation';
  return 'public';
}

function zoneForType(type) {
  if (['bedroom', 'study'].includes(type)) return 'private';
  if (['bathroom', 'storage', 'utility', 'kitchen'].includes(type)) return 'service';
  if (['corridor', 'stairs'].includes(type)) return 'circulation';
  if (['sunroom'].includes(type)) return 'public';
  return 'public';
}

function upperFloorOrder(nodes, rng) {
  const priority = ['stairs', 'corridor', 'master_bedroom', 'bedroom', 'study', 'bathroom', 'storage'];
  const shuffled = [...priority].sort(() => rng() - 0.5);
  return mergeOrder(shuffled, nodes.map((node) => node.id));
}

function mergeOrder(preferred, actualIds) {
  const actual = actualIds.map(normalizeId);
  const result = [];
  for (const id of preferred.map(normalizeId)) {
    if (actual.includes(id) && !result.includes(id)) result.push(id);
  }
  for (const id of actual) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

function compositionBias(volumes = []) {
  const relations = volumes.map((volume) => volume.placement?.relation || '').join('|');
  if (/west/.test(relations) && /east/.test(relations)) return 'balanced-wings';
  if (/west/.test(relations)) return 'west-weighted';
  if (/east/.test(relations)) return 'east-weighted';
  if (/north/.test(relations)) return 'rear-weighted';
  if (/south|front/.test(relations)) return 'front-threshold';
  return 'centered';
}

function publicCorePosition(variant) {
  if (/formal-axis/.test(variant)) return 'front-axis';
  if (/front|patio/.test(variant)) return 'front-to-center';
  if (/west|east/.test(variant)) return 'side-linked';
  if (/corner/.test(variant)) return 'near-vertical-core';
  return 'center';
}

function shouldPreservePromptRoof(prompt) {
  return /平屋顶|平顶|坡屋顶|尖顶|歇山|庑殿|四坡|人字|gabled|hipped/i.test(prompt);
}

function normalizeGlazing(value) {
  const text = String(value || 'medium');
  return ['low', 'medium', 'high'].includes(text) ? text : 'medium';
}

function normalizeRoofStyle(value) {
  const text = String(value || 'flat');
  return ['flat', 'gabled', 'hipped', 'pagoda', 'domed'].includes(text) ? text : 'flat';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item !== undefined && item !== null).map((item) => String(item));
}

function normalizeId(value) {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function nodeExists(nodes, id) {
  return nodes.some((node) => node.id === id);
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length) % items.length];
}

function pickByIndex(items, index) {
  return items[Math.abs(Math.trunc(index)) % items.length];
}

function seedIndexFor(prompt, seed) {
  const parsed = Number(seed);
  if (Number.isFinite(parsed)) return Math.abs(Math.trunc(parsed)) + (hashString(prompt) % 17);
  return hashString(`${prompt}|unseeded`);
}

function seededRng(seedText) {
  let state = hashString(seedText) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ratio(value, fallback) {
  return clampNumber(value, 0, 1, fallback);
}

function clampInt(value, min, max, fallback = min) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
