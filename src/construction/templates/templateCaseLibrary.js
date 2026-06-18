const STAGE7_SOURCE = 'stage7-template-case-library-v1';

export function buildTemplateCaseLibrary({
  root = 'mc_templates',
  generatedAt = new Date().toISOString(),
  templates = [],
  corpus = {},
  importErrors = []
} = {}) {
  const cases = templates.map((template) => buildCaseCard(template));
  const retrievalIndex = buildRetrievalIndex(cases);
  const semanticClauses = cases.flatMap((item) => item.semantic_clauses.map((clause) => ({
    case_id: item.case_id,
    file: item.file,
    title: item.title,
    clause
  })));
  return {
    source: STAGE7_SOURCE,
    stage: '7A-7B',
    generated_at: generatedAt,
    root,
    summary: summarizeLibrary(cases, corpus, importErrors),
    retrieval_index: retrievalIndex,
    semantic_clause_count: semanticClauses.length,
    semantic_clauses: semanticClauses,
    cases,
    import_errors: importErrors
  };
}

export function renderTemplateCaseLibraryReport(library = {}) {
  const summary = library.summary || {};
  const topOverall = formatCaseRows(summary.top_reference_cases);
  const topInterior = formatCaseRows(summary.top_interior_cases);
  const topSite = formatCaseRows(summary.top_site_cases);
  const topComposition = formatCaseRows(summary.top_composition_cases);
  const roleRows = formatObject(summary.learning_role_counts);
  const featureRows = formatObject(summary.feature_counts);
  const warningRows = formatObject(summary.review_flag_counts);
  const importErrors = (library.import_errors || []).slice(0, 20).map((item) =>
    `- ${item.file || item.path}: ${item.error}`
  ).join('\n') || '- 无';

  return `# Stage 7A/7B Template Case Library

Generated: ${library.generated_at}

## What This Stage Adds

Stage 7A/7B turns raw .schematic/.schem files into reusable case cards. Each card states what the reference may teach: site terrain, garden/water scenes, massing, facade depth, roof profile, spatial layout, interior furniture groups, and risk controls. It is meant to be read by later generation and review stages, not to copy a building block-for-block.

## Summary

- Cases: ${summary.case_count || 0}
- Source coverage: ${summary.source_coverage || 0} with metadata / ${summary.url_coverage || 0} with URL
- Semantic clauses: ${library.semantic_clause_count || 0}
- Retrieval tokens: ${summary.retrieval_token_count || 0}
- Import errors: ${summary.import_error_count || 0}
- Learning roles: ${roleRows}
- Feature counts: ${featureRows}
- Review flags: ${warningRows}

## Best Overall References

${topOverall}

## Best Interior References

${topInterior}

## Best Site / Landscape References

${topSite}

## Best Whole-Composition References

${topComposition}

## Import Errors

${importErrors}

## How To Use

1. Keep adding curated files under mc_templates/<category>/.
2. Put optional source notes in data.txt, sidecar .txt files, or labels.jsonl when convenient.
3. Run npm run analyze:templates -- --offline to refresh this library.
4. Use case_library.json for retrieval and semantic_clauses.jsonl for prompt/runtime injection in later stages.
`;
}

export function caseClausesJsonl(library = {}) {
  return (library.semantic_clauses || []).map((item) => JSON.stringify(item)).join('\n') + '\n';
}

function buildCaseCard(template = {}) {
  const profile = template.case_profile || {};
  const analysis = template.analysis || {};
  const composition = analysis.composition_grammar || {};
  const featureCard = buildFeatureCard(template);
  const semanticClauses = buildSemanticClauses(template, featureCard);
  const retrieval = buildRetrievalCard(template, featureCard, semanticClauses);
  return {
    case_id: profile.case_id || caseId(template),
    title: template.title,
    file: template.file,
    category: template.category,
    source_url: template.source?.url || template.page?.url,
    source_note: template.source?.note || template.page?.description,
    style_family: template.style_family,
    typology: template.typology,
    quality: template.quality ?? 5,
    study_priority: profile.study_priority || 'unknown',
    overall_reference_score: Number(profile.overall_reference_score || 0),
    tags: template.tags || [],
    quality_tags: profile.quality_tags || [],
    learning_roles: (profile.learning_roles || []).map((role) => ({
      role: role.role,
      score: role.score,
      evidence: role.evidence
    })),
    learnable_areas: profile.learnable_areas || [],
    review_flags: profile.review_flags || [],
    risk_controls: riskControlsFor(profile, analysis),
    feature_card: featureCard,
    semantic_clauses: semanticClauses,
    retrieval,
    next_phase_hints: profile.next_phase_hints || [],
    composition_transfer_rules: composition.transfer_rules || []
  };
}

function buildFeatureCard(template = {}) {
  const analysis = template.analysis || {};
  const profile = template.case_profile || {};
  const dimensions = analysis.dimensions || {};
  const detail = analysis.detail_metrics || {};
  const terrain = analysis.terrain || {};
  const categories = analysis.block_categories || {};
  const interior = analysis.interior_signals || {};
  const spatial = analysis.spatial_layout || {};
  const composition = analysis.composition_grammar || {};
  const recommendations = template.recommendations || {};

  return {
    scale: {
      bucket: recommendations.template_scale || scaleBucket(dimensions.non_air_blocks),
      width: dimensions.width,
      height: dimensions.height,
      length: dimensions.length,
      non_air_blocks: dimensions.non_air_blocks,
      density: dimensions.density
    },
    materials: {
      top_blocks: (analysis.top_blocks || []).slice(0, 12).map((block) => ({
        name: block.name,
        key: block.key,
        count: block.count,
        ratio: block.ratio,
        category: block.category
      })),
      dominant_categories: dominantCategories(categories, 8),
      detail_density: recommendations.detail_density || detailDensity(detail)
    },
    site: {
      terrain_profile: recommendations.terrain_profile || terrainProfile(terrain),
      integrated: Boolean(terrain.integrated),
      non_flat: Boolean(terrain.non_flat),
      height_range: Number(terrain.height_range || 0),
      natural_column_ratio: Number(terrain.natural_column_ratio || 0),
      garden_signal: detail.garden_signal || 'none',
      landscape_features: recommendations.landscape_features || [],
      vegetation_ratio: Number(categories.vegetation?.ratio || 0),
      water_ratio: Number(categories.water?.ratio || 0)
    },
    composition: {
      readiness: composition.readiness || 'skip',
      score: Number(composition.score || 0),
      massing: patternTypes(composition.massing_patterns),
      approach: patternTypes(composition.approach_sequence),
      facade: patternTypes(composition.facade_rhythm),
      roof: patternTypes(composition.roof_composition),
      site: patternTypes(composition.site_composition),
      view: patternTypes(composition.view_and_landmark_rules),
      transfer_rules: (composition.transfer_rules || []).slice(0, 10)
    },
    facade_roof: {
      glass_ratio: Number(detail.glass_ratio || 0),
      stair_slab_ratio: Number(detail.stair_slab_ratio || 0),
      fence_ratio: Number(detail.fence_ratio || 0),
      light_ratio: Number(detail.light_ratio || 0),
      decor_ratio: Number(detail.decor_ratio || 0),
      facade_patterns: patternTypes(composition.facade_rhythm),
      roof_patterns: patternTypes(composition.roof_composition)
    },
    interior: {
      furnished_likelihood: interior.furnished_likelihood || 'low',
      strong_hits: Number(interior.strong_hits || 0),
      strong_richness: Number(interior.strong_richness || 0),
      dominant_signals: interior.dominant_signals || [],
      room_candidates: compactRoomCandidates(profile.room_reference_candidates),
      spatial_readiness: profile.phase2_spatial_evidence?.pattern_mining_readiness || spatial.pattern_mining_readiness || 'skip',
      room_candidate_count: Number(profile.phase2_spatial_evidence?.room_candidate_count || spatial.room_candidate_count || 0),
      high_confidence_room_count: Number(profile.phase2_spatial_evidence?.high_confidence_room_count || spatial.high_confidence_room_count || 0),
      room_adjacency_count: Number(profile.phase2_spatial_evidence?.room_adjacency_count || spatial.room_adjacency_count || 0),
      furniture_readiness: profile.phase3_pattern_evidence?.furniture_pattern_readiness || spatial.furniture_pattern_readiness || 'skip',
      furniture_group_count: Number(profile.phase3_pattern_evidence?.furniture_group_count || spatial.furniture_group_count || 0),
      top_furniture_patterns: (profile.phase3_pattern_evidence?.top_patterns || []).slice(0, 16)
    },
    learning: {
      quality_scores: profile.quality_scores || {},
      learning_roles: (profile.learning_roles || []).map((role) => role.role),
      learnable_areas: profile.learnable_areas || [],
      review_flags: profile.review_flags || [],
      phase2_room_mining_priority: profile.phase2_room_mining_priority || 'unknown'
    }
  };
}

function buildSemanticClauses(template = {}, featureCard = {}) {
  const clauses = new Set();
  const title = template.title || template.file || 'reference';
  const style = template.style_family || 'general';
  const typology = template.typology || 'building';
  const composition = featureCard.composition || {};
  const site = featureCard.site || {};
  const interior = featureCard.interior || {};
  const facade = featureCard.facade_roof || {};
  const learning = featureCard.learning || {};
  const hasRole = (role) => (learning.learning_roles || []).includes(role);

  clauses.add(`reference:${title} teaches ${style} ${typology} proportions and detail hierarchy`);
  if (site.integrated || site.terrain_profile !== 'flat-or-built-platform') {
    clauses.add('site: treat terrain as part of the architecture with rock/earth plinths, retaining edges, and stepped arrival');
  }
  if ((site.landscape_features || []).includes('garden-composition') || site.garden_signal !== 'none') {
    clauses.add('site: compose foreground garden rooms, path rhythm, planting pockets, and entry scenery before the facade');
  }
  if ((site.landscape_features || []).includes('water-edge') || site.water_ratio > 0.005) {
    clauses.add('site: connect public rooms to a water edge, reflection basin, deck, or waterfront threshold');
  }
  if ((composition.massing || []).includes('long_bar')) {
    clauses.add('massing: use an elongated bar or wing to organize views and circulation');
  }
  if ((composition.massing || []).includes('asymmetric_wings')) {
    clauses.add('massing: offset secondary wings so the footprint feels composed rather than box-like');
  }
  if ((composition.massing || []).includes('vertical_landmark')) {
    clauses.add('massing: use a vertical accent or tower-like marker as an arrival/view focus');
  }
  if ((composition.massing || []).includes('courtyard_or_void')) {
    clauses.add('space: preserve a courtyard, patio, or void so rooms face an internal scene');
  }
  if ((composition.facade || []).includes('large_glass_bands') || facade.glass_ratio > 0.06) {
    clauses.add('facade: make large glass serve a view axis, not just a random wall material');
  }
  if ((composition.facade || []).includes('micro_depth_trim') || facade.stair_slab_ratio > 0.045) {
    clauses.add('facade: layer stairs, slabs, rails, panes, lights, and relief blocks to avoid flat walls');
  }
  if ((composition.roof || []).includes('flat_terrace_or_platform')) {
    clauses.add('roof: make the flat roof read as a usable terrace with parapet, access, and edge detail');
  }
  if ((composition.roof || []).includes('layered_eaves')) {
    clauses.add('roof: stack eaves and overhangs to create silhouette depth');
  }
  if (hasRole('interior_reference') || interior.furnished_likelihood !== 'low') {
    clauses.add('interior: build room identity from focal walls, storage bands, task zones, textiles, plants, and layered lighting');
  }
  if (interior.room_candidates?.length) {
    clauses.add(`interior: prioritize mined room types ${interior.room_candidates.slice(0, 6).map((room) => room.room_type).join(', ')}`);
  }
  for (const pattern of interior.top_furniture_patterns || []) {
    if (pattern.pattern_type) clauses.add(`interior-pattern:${pattern.pattern_type}: ${pattern.layout_intent || 'preserve source furniture grouping logic'}`);
    for (const clause of pattern.clauses || []) clauses.add(`interior-clause:${clause}`);
  }
  for (const rule of (composition.transfer_rules || []).slice(0, 6)) clauses.add(`composition-transfer:${rule}`);

  return [...clauses].slice(0, 36);
}

function buildRetrievalCard(template = {}, featureCard = {}, semanticClauses = []) {
  const textParts = [
    template.title,
    template.file,
    template.category,
    template.style_family,
    template.typology,
    ...(template.tags || []),
    ...(template.case_profile?.quality_tags || []),
    ...(template.case_profile?.learning_roles || []).map((role) => role.role),
    ...(template.case_profile?.room_reference_candidates || []).map((room) => room.room_type),
    ...(featureCard.site?.landscape_features || []),
    ...(featureCard.composition?.massing || []),
    ...(featureCard.composition?.approach || []),
    ...(featureCard.composition?.facade || []),
    ...(featureCard.composition?.roof || []),
    ...(featureCard.composition?.site || []),
    ...(featureCard.interior?.top_furniture_patterns || []).map((pattern) => pattern.pattern_type),
    ...semanticClauses
  ];
  const tokens = keywordTokens(textParts.join(' '));
  const affinities = promptAffinities(featureCard, template);
  return {
    tokens,
    prompt_affinities: affinities,
    search_text: textParts.filter(Boolean).join(' ').slice(0, 4000)
  };
}

function buildRetrievalIndex(cases = []) {
  const tokenToCases = {};
  const areaToCases = {};
  for (const item of cases) {
    for (const token of item.retrieval?.tokens || []) {
      if (!tokenToCases[token]) tokenToCases[token] = [];
      tokenToCases[token].push(item.case_id);
    }
    for (const area of item.learnable_areas || []) {
      const key = typeof area === 'string' ? area : area.area || area.role || 'unknown';
      if (!areaToCases[key]) areaToCases[key] = [];
      areaToCases[key].push(item.case_id);
    }
  }
  return {
    source: 'stage7-case-retrieval-index-v1',
    token_count: Object.keys(tokenToCases).length,
    case_count: cases.length,
    token_to_cases: sortIndex(tokenToCases),
    area_to_cases: sortIndex(areaToCases),
    cases: cases.map((item) => ({
      case_id: item.case_id,
      title: item.title,
      file: item.file,
      score: item.overall_reference_score,
      style_family: item.style_family,
      typology: item.typology,
      tags: item.tags,
      roles: item.learning_roles.map((role) => role.role),
      prompt_affinities: item.retrieval?.prompt_affinities || []
    }))
  };
}

function summarizeLibrary(cases = [], corpus = {}, importErrors = []) {
  const roleCounts = {};
  const flagCounts = {};
  const featureCounts = {
    terrain_integrated: 0,
    garden_scene: 0,
    water_edge: 0,
    furnished_interior: 0,
    high_furniture_patterns: 0,
    high_composition: 0,
    high_detail: 0
  };
  for (const item of cases) {
    for (const role of item.learning_roles || []) roleCounts[role.role] = (roleCounts[role.role] || 0) + 1;
    for (const flag of item.review_flags || []) flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    if (item.feature_card?.site?.integrated) featureCounts.terrain_integrated += 1;
    if (item.feature_card?.site?.garden_signal !== 'none' || item.feature_card?.site?.landscape_features?.includes('garden-composition')) featureCounts.garden_scene += 1;
    if (item.feature_card?.site?.landscape_features?.includes('water-edge') || item.feature_card?.site?.water_ratio > 0.005) featureCounts.water_edge += 1;
    if (item.feature_card?.interior?.furnished_likelihood !== 'low') featureCounts.furnished_interior += 1;
    if (item.feature_card?.interior?.furniture_readiness === 'high') featureCounts.high_furniture_patterns += 1;
    if (item.feature_card?.composition?.readiness === 'high') featureCounts.high_composition += 1;
    if (item.feature_card?.materials?.detail_density === 'high') featureCounts.high_detail += 1;
  }

  return {
    case_count: cases.length,
    source_coverage: cases.filter((item) => item.source_url || item.source_note).length,
    url_coverage: cases.filter((item) => item.source_url).length,
    import_error_count: importErrors.length,
    retrieval_token_count: Object.keys(buildRetrievalIndex(cases).token_to_cases || {}).length,
    corpus_template_count: corpus.template_count || cases.length,
    learning_role_counts: sortObject(roleCounts),
    review_flag_counts: sortObject(flagCounts),
    feature_counts: featureCounts,
    top_reference_cases: topCases(cases, (item) => item.overall_reference_score, 12),
    top_interior_cases: topCases(cases, (item) => item.feature_card?.learning?.quality_scores?.interior || 0, 12),
    top_site_cases: topCases(cases, (item) => item.feature_card?.learning?.quality_scores?.site || 0, 12),
    top_composition_cases: topCases(cases, (item) => item.feature_card?.composition?.score || 0, 12)
  };
}

function topCases(cases, scoreFn, limit) {
  return [...cases]
    .sort((a, b) => scoreFn(b) - scoreFn(a) || b.overall_reference_score - a.overall_reference_score || String(a.title || '').localeCompare(String(b.title || '')))
    .slice(0, limit)
    .map((item) => ({
      case_id: item.case_id,
      title: item.title,
      file: item.file,
      score: item.overall_reference_score,
      feature_score: Number(scoreFn(item) || 0),
      style_family: item.style_family,
      typology: item.typology,
      roles: item.learning_roles.slice(0, 5).map((role) => role.role),
      flags: item.review_flags || [],
      clauses: item.semantic_clauses.slice(0, 4)
    }));
}

function riskControlsFor(profile = {}, analysis = {}) {
  const flags = profile.review_flags || [];
  const controls = [];
  if (flags.includes('arena-not-for-room-mining')) controls.push('use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms');
  if (flags.includes('interior-described-as-unfinished')) controls.push('skip interior extraction until manually approved');
  if (flags.includes('monumental-scale-normalize-before-use')) controls.push('normalize proportions before transferring to residential scale');
  if (flags.includes('exterior-edge-room-noise')) controls.push('prefer high-confidence interior components away from exterior edges');
  if (analysis.dimensions?.non_air_blocks > 120000) controls.push('transfer patterns as ratios and sequences, not absolute dimensions');
  if (!controls.length) controls.push('safe for normal template retrieval according to current evidence');
  return controls;
}

function promptAffinities(featureCard = {}, template = {}) {
  const affinities = new Set();
  const style = String(template.style_family || '').toLowerCase();
  const typology = String(template.typology || '').toLowerCase();
  if (style) affinities.add(style);
  if (typology) affinities.add(typology);
  if (featureCard.site?.integrated) affinities.add('terrain');
  if (featureCard.site?.landscape_features?.includes('garden-composition')) affinities.add('garden');
  if (featureCard.site?.landscape_features?.includes('water-edge')) affinities.add('waterfront');
  if (featureCard.composition?.facade?.includes('large_glass_bands')) affinities.add('large-glass');
  if (featureCard.composition?.roof?.includes('flat_terrace_or_platform')) affinities.add('roof-terrace');
  if (featureCard.composition?.roof?.includes('layered_eaves')) affinities.add('layered-roof');
  if (featureCard.interior?.furnished_likelihood !== 'low') affinities.add('interior');
  for (const room of featureCard.interior?.room_candidates || []) affinities.add(room.room_type);
  return [...affinities].filter(Boolean).sort();
}

function dominantCategories(categories = {}, limit = 8) {
  return Object.entries(categories)
    .map(([category, value]) => ({
      category,
      count: Number(value?.count || 0),
      ratio: Number(value?.ratio || 0)
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, limit);
}

function patternTypes(patterns = []) {
  return (patterns || [])
    .filter((item) => item?.pattern_type)
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, 8)
    .map((item) => item.pattern_type);
}

function compactRoomCandidates(candidates = []) {
  return (candidates || []).slice(0, 12).map((room) => ({
    room_type: room.room_type,
    confidence: room.confidence,
    evidence: room.evidence,
    clauses: room.clauses || []
  }));
}

function keywordTokens(text) {
  return [...new Set(String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5_#-]+/u)
    .filter((item) => item.length >= 2 && !STOP_WORDS.has(item))
    .slice(0, 160))];
}

function sortIndex(index = {}) {
  return Object.fromEntries(Object.entries(index)
    .map(([key, values]) => [key, [...new Set(values)].sort()])
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])));
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function detailDensity(detail = {}) {
  const score = Number(detail.stair_slab_ratio || 0) + Number(detail.fence_ratio || 0) + Number(detail.light_ratio || 0) + Number(detail.decor_ratio || 0) + Math.min(0.08, Number(detail.glass_ratio || 0));
  if (score > 0.18) return 'high';
  if (score > 0.09) return 'medium';
  return 'low';
}

function terrainProfile(terrain = {}) {
  if (terrain.non_flat) return 'non-flat-integrated';
  if (terrain.integrated) return 'landscape-integrated';
  return 'flat-or-built-platform';
}

function scaleBucket(nonAirBlocks) {
  const count = Number(nonAirBlocks || 0);
  if (count > 60000) return 'monumental';
  if (count > 20000) return 'large';
  if (count > 6000) return 'medium';
  return 'compact';
}

function caseId(template = {}) {
  return `${slug(template.category || 'case')}-${slug(template.title || template.file || 'template')}`;
}

function slug(value) {
  return String(value || 'case')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'case';
}

function formatCaseRows(items = []) {
  if (!items.length) return '- none';
  return items.map((item) => {
    const roles = item.roles?.length ? ` roles=${item.roles.join('/')}` : '';
    const flags = item.flags?.length ? ` flags=${item.flags.join('/')}` : '';
    return `- ${item.title} (${item.file}): score=${item.score}, feature=${item.feature_score}.${roles}${flags}`;
  }).join('\n');
}

function formatObject(value = {}) {
  const entries = Object.entries(value || {});
  return entries.length ? entries.map(([key, count]) => `${key}=${count}`).join(', ') : 'none';
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'from',
  'this',
  'that',
  'minecraft',
  'mcbuild_org',
  'schematic',
  'schem',
  'template',
  'reference'
]);
