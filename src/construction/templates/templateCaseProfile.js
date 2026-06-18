export function buildTemplateCaseProfile(template = {}) {
  const text = templateText(template);
  const riskText = templateRiskText(template);
  const analysis = template.analysis || {};
  const tags = new Set(template.tags || []);
  const typology = String(template.typology || 'building');
  const category = String(template.category || 'uncategorized');
  const dimensions = analysis.dimensions || {};
  const detail = analysis.detail_metrics || {};
  const terrain = analysis.terrain || {};
  const vertical = analysis.vertical_profile || {};
  const interior = analysis.interior_signals || {};
  const spatial = analysis.spatial_layout || {};
  const composition = analysis.composition_grammar || {};
  const scores = {
    interior: scoreInteriorReference({ interior, text, riskText, typology, category, tags }),
    site: scoreSiteReference({ terrain, detail, tags, text }),
    facade_detail: scoreFacadeDetail({ detail, tags }),
    massing: scoreMassing({ vertical, typology, tags, dimensions, text }),
    spatial: scoreSpatialSegmentation(spatial),
    patterns: scoreFurniturePatterns(spatial),
    metadata: scoreMetadata(template)
  };
  const roles = learningRoles({ scores, template, text, tags, terrain, detail, vertical, interior, spatial });
  const flags = reviewFlags({ template, text: riskText, typology, category, dimensions, scores, roles, interior, spatial });
  const learnableAreas = learnableAreasForCase({ roles, scores, template, text, terrain, detail, interior, spatial });
  const roomCandidates = roomReferenceCandidates({ template, text, typology, category, interior, spatial, scores, flags });
  const roomLearningClauses = roomLearningClausesForCase({ roomCandidates, spatial, interior });
  const phase3PatternEvidence = patternEvidenceSummary(spatial);
  const qualityTags = qualityTagsForCase({ scores, roles, flags, roomCandidates, template, spatial });
  const overallReferenceScore = referenceScore(scores, flags);
  const phase2Priority = phase2RoomMiningPriority({ scores, flags, roomCandidates, roles, spatial });

  return {
    case_id: caseId(template),
    title: template.title,
    file: template.file,
    source_url: template.source?.url || template.page?.url,
    style_family: template.style_family || 'general',
    typology,
    category,
    overall_reference_score: overallReferenceScore,
    study_priority: studyPriority(overallReferenceScore, flags),
    phase2_room_mining_priority: phase2Priority,
    quality_scores: scores,
    quality_tags: qualityTags,
    learning_roles: roles,
    learnable_areas: learnableAreas,
    room_reference_candidates: roomCandidates,
    room_learning_clauses: roomLearningClauses,
    phase2_spatial_evidence: spatialEvidenceSummary(spatial),
    phase3_pattern_evidence: phase3PatternEvidence,
    phase5_composition_evidence: compositionEvidenceSummary(composition),
    review_flags: flags,
    evidence: evidenceSummary({ template, terrain, detail, interior, spatial, dimensions }),
    next_phase_hints: nextPhaseHints({ roles, roomCandidates, flags, spatial })
  };
}

export function summarizeCaseIndex(templates = []) {
  const cases = templates.map((template) => template.case_profile || buildTemplateCaseProfile(template));
  const roleCounts = {};
  const flagCounts = {};
  const priorityCounts = {};
  const roomCounts = {};
  const spatialCounts = {
    spatial_analyzed: 0,
    spatial_skipped: 0,
    cases_with_room_components: 0,
    total_room_components: 0,
    high_confidence_room_components: 0,
    total_room_adjacencies: 0,
    pattern_mining_ready: 0,
    high_pattern_mining_ready: 0
  };
  const furnitureCounts = {
    cases_with_furniture_groups: 0,
    total_furniture_groups: 0,
    high_confidence_furniture_groups: 0,
    furniture_pattern_ready: 0,
    high_furniture_pattern_ready: 0,
    pattern_type_counts: {}
  };
  const compositionCounts = {
    composition_analyzed: 0,
    composition_ready: 0,
    high_composition_ready: 0,
    massing_pattern_counts: {},
    approach_pattern_counts: {},
    facade_pattern_counts: {},
    roof_pattern_counts: {},
    site_pattern_counts: {}
  };

  for (const item of cases) {
    priorityCounts[item.study_priority] = (priorityCounts[item.study_priority] || 0) + 1;
    for (const role of item.learning_roles || []) roleCounts[role.role] = (roleCounts[role.role] || 0) + 1;
    for (const flag of item.review_flags || []) flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    for (const room of item.room_reference_candidates || []) roomCounts[room.room_type] = (roomCounts[room.room_type] || 0) + 1;
    const spatial = item.phase2_spatial_evidence || {};
    if (spatial.status === 'analyzed') spatialCounts.spatial_analyzed += 1;
    if (spatial.status === 'skipped') spatialCounts.spatial_skipped += 1;
    if (Number(spatial.room_candidate_count || 0) > 0) spatialCounts.cases_with_room_components += 1;
    spatialCounts.total_room_components += Number(spatial.room_candidate_count || 0);
    spatialCounts.high_confidence_room_components += Number(spatial.high_confidence_room_count || 0);
    spatialCounts.total_room_adjacencies += Number(spatial.room_adjacency_count || 0);
    const usableForRoomMining = ['high', 'medium'].includes(String(item.phase2_room_mining_priority || ''));
    if (['high', 'medium'].includes(String(spatial.pattern_mining_readiness || '')) && usableForRoomMining) spatialCounts.pattern_mining_ready += 1;
    if (String(spatial.pattern_mining_readiness || '') === 'high' && usableForRoomMining) spatialCounts.high_pattern_mining_ready += 1;
    const patterns = item.phase3_pattern_evidence || {};
    if (Number(patterns.furniture_group_count || 0) > 0) furnitureCounts.cases_with_furniture_groups += 1;
    furnitureCounts.total_furniture_groups += Number(patterns.furniture_group_count || 0);
    furnitureCounts.high_confidence_furniture_groups += Number(patterns.high_confidence_furniture_group_count || 0);
    if (['high', 'medium'].includes(String(patterns.furniture_pattern_readiness || '')) && usableForRoomMining) furnitureCounts.furniture_pattern_ready += 1;
    if (String(patterns.furniture_pattern_readiness || '') === 'high' && usableForRoomMining) furnitureCounts.high_furniture_pattern_ready += 1;
    for (const [type, count] of Object.entries(patterns.detected_furniture_patterns || {})) {
      furnitureCounts.pattern_type_counts[type] = (furnitureCounts.pattern_type_counts[type] || 0) + Number(count || 0);
    }
    const composition = item.phase5_composition_evidence || {};
    if (composition.status === 'analyzed') compositionCounts.composition_analyzed += 1;
    if (['high', 'medium'].includes(String(composition.readiness || ''))) compositionCounts.composition_ready += 1;
    if (String(composition.readiness || '') === 'high') compositionCounts.high_composition_ready += 1;
    addPatternCounts(compositionCounts.massing_pattern_counts, composition.massing_patterns);
    addPatternCounts(compositionCounts.approach_pattern_counts, composition.approach_sequence);
    addPatternCounts(compositionCounts.facade_pattern_counts, composition.facade_rhythm);
    addPatternCounts(compositionCounts.roof_pattern_counts, composition.roof_composition);
    addPatternCounts(compositionCounts.site_pattern_counts, composition.site_composition);
  }
  furnitureCounts.pattern_type_counts = sortObject(furnitureCounts.pattern_type_counts);
  compositionCounts.massing_pattern_counts = sortObject(compositionCounts.massing_pattern_counts);
  compositionCounts.approach_pattern_counts = sortObject(compositionCounts.approach_pattern_counts);
  compositionCounts.facade_pattern_counts = sortObject(compositionCounts.facade_pattern_counts);
  compositionCounts.roof_pattern_counts = sortObject(compositionCounts.roof_pattern_counts);
  compositionCounts.site_pattern_counts = sortObject(compositionCounts.site_pattern_counts);

  return {
    case_count: cases.length,
    study_priority_counts: priorityCounts,
    learning_role_counts: sortObject(roleCounts),
    review_flag_counts: sortObject(flagCounts),
    room_candidate_counts: sortObject(roomCounts),
    high_priority_cases: topCases(cases, (item) => item.overall_reference_score, 12),
    room_mining_candidates: topCases(
      cases.filter((item) => ['high', 'medium'].includes(item.phase2_room_mining_priority)),
      (item) => item.quality_scores?.interior || 0,
      16
    ),
    site_reference_cases: topCases(
      cases.filter((item) => hasRole(item, 'terrain_base') || hasRole(item, 'garden_scene') || hasRole(item, 'water_edge')),
      (item) => item.quality_scores?.site || 0,
      12
    ),
    facade_reference_cases: topCases(
      cases.filter((item) => hasRole(item, 'facade_detail')),
      (item) => item.quality_scores?.facade_detail || 0,
      12
    ),
    phase1_completion: {
      indexed_cases: cases.length,
      room_mining_ready: cases.filter((item) => item.phase2_room_mining_priority === 'high').length,
      site_learning_ready: cases.filter((item) => hasRole(item, 'terrain_base') || hasRole(item, 'garden_scene')).length,
      needs_manual_review: cases.filter((item) => (item.review_flags || []).length > 0).length
    },
    phase2_completion: spatialCounts,
    phase3_completion: furnitureCounts,
    phase5_completion: compositionCounts,
    next_actions: [
      'use phase 3 furniture groups as decorator guidance for high/medium readiness templates',
      'prefer pattern clauses with high-confidence anchors before adding generic decorative clutter',
      'treat arena and unfinished-shell cases as exterior/site references unless manually approved',
      'use learnable_areas to decide whether a template teaches interior, facade, terrain, garden, or silhouette',
      'use phase 5 composition grammar to bias massing, approach sequence, facade rhythm, roof profile, and site layout'
    ]
  };
}

export function renderCaseIndexReport(caseIndex = {}) {
  const summary = caseIndex.summary || {};
  const phase2 = summary.phase2_completion || {};
  const phase3 = summary.phase3_completion || {};
  const phase5 = summary.phase5_completion || {};
  const cases = caseIndex.cases || [];
  const roomMining = summary.room_mining_candidates || [];
  const siteCases = summary.site_reference_cases || [];
  const facadeCases = summary.facade_reference_cases || [];
  const reviewCases = cases
    .filter((item) => (item.review_flags || []).length)
    .sort((a, b) => b.overall_reference_score - a.overall_reference_score)
    .slice(0, 16);

  return `# Stage 5A Template Case Index

Generated: ${caseIndex.generated_at}

## What This Stage Means

Stage 5A does not copy buildings. It combines metadata, block statistics, schematic spatial scans, mined room furniture-group patterns, and whole-composition grammar to decide what each reference is allowed to teach the generator: interior rooms, furniture clusters, facade, massing, terrain, garden, water edge, roof profile, approach sequence, or only metadata. Risky cases are kept, but tagged so later stages do not learn the wrong thing from them.

## Summary

- Cases indexed: ${summary.case_count || 0}
- Study priorities: ${formatObject(summary.study_priority_counts)}
- Learning roles: ${formatObject(summary.learning_role_counts)}
- Room candidates: ${formatObject(summary.room_candidate_counts)}
- Review flags: ${formatObject(summary.review_flag_counts)}
- High-priority room-mining cases: ${summary.phase1_completion?.room_mining_ready || 0}
- Site learning-ready cases: ${summary.phase1_completion?.site_learning_ready || 0}
- Spatial scans analyzed: ${phase2.spatial_analyzed || 0}
- Cases with spatial room components: ${phase2.cases_with_room_components || 0}
- Spatial room components: ${phase2.total_room_components || 0} total, ${phase2.high_confidence_room_components || 0} high-confidence
- Spatial room adjacencies: ${phase2.total_room_adjacencies || 0}
- Pattern-mining-ready spatial cases: ${phase2.pattern_mining_ready || 0} (${phase2.high_pattern_mining_ready || 0} high)
- Furniture-group cases: ${phase3.cases_with_furniture_groups || 0}
- Furniture groups: ${phase3.total_furniture_groups || 0} total, ${phase3.high_confidence_furniture_groups || 0} high-confidence
- Furniture-pattern-ready cases: ${phase3.furniture_pattern_ready || 0} (${phase3.high_furniture_pattern_ready || 0} high)
- Furniture pattern types: ${formatObject(phase3.pattern_type_counts)}
- Composition grammar analyzed: ${phase5.composition_analyzed || 0}
- Composition-ready cases: ${phase5.composition_ready || 0} (${phase5.high_composition_ready || 0} high)
- Massing grammar: ${formatObject(phase5.massing_pattern_counts)}
- Approach grammar: ${formatObject(phase5.approach_pattern_counts)}
- Facade grammar: ${formatObject(phase5.facade_pattern_counts)}
- Roof grammar: ${formatObject(phase5.roof_pattern_counts)}
- Site grammar: ${formatObject(phase5.site_pattern_counts)}

## Best Room-Mining Candidates

${formatCaseList(roomMining, 'room')}

## Best Site And Landscape References

${formatCaseList(siteCases, 'site')}

## Best Facade / Detail References

${formatCaseList(facadeCases, 'facade')}

## Cases Needing Care

${formatCaseList(reviewCases, 'review')}

## Next Actions

${(summary.next_actions || []).map((item, index) => `${index + 1}. ${item}`).join('\n')}
`;
}

function scoreInteriorReference({ interior = {}, text = '', riskText = text, typology = '', category = '', tags = new Set() }) {
  if (!isInteriorLearningTypology(typology, category)) return 0;
  if (isUnfinishedInteriorText(riskText)) return 18;
  let score = 0;
  const likelihood = String(interior.furnished_likelihood || 'low');
  if (likelihood === 'high') score += 44;
  else if (likelihood === 'medium') score += 26;
  else score += 8;
  score += Math.min(18, Number(interior.strong_richness || 0) * 3);
  score += Math.min(14, Number(interior.richness || 0) * 1.2);
  score += Math.min(12, Number(interior.strong_ratio || 0) * 320);
  if (tags.has('layered-interior')) score += 8;
  if (tags.has('furnished-interior')) score += 6;
  if (/interior|furnished|fully furnished|decor|decorated|rooms?|hotel|library|mansion|villa|house|home|tavern|室内|家具|装饰|豪宅|别墅|住宅/i.test(text)) score += 8;
  if (isPartiallyUnfurnishedText(riskText)) score -= 20;
  if (/shell|blank canvas|unfinished|empty interior|interiors? (are )?largely unfinished/i.test(riskText)) score -= 34;
  return clampScore(score);
}

function scoreSiteReference({ terrain = {}, detail = {}, tags = new Set(), text = '' }) {
  let score = 0;
  if (terrain.integrated) score += 28;
  if (terrain.non_flat) score += 22;
  score += Math.min(16, Number(terrain.height_range || 0) * 1.2);
  score += Math.min(12, Number(terrain.natural_column_ratio || 0) * 30);
  if (tags.has('landscape-composition')) score += 18;
  if (tags.has('water-edge')) score += 14;
  if (tags.has('terrain-integrated')) score += 12;
  if (String(detail.garden_signal || 'none') !== 'none') score += 16;
  if (/garden|yard|park|courtyard|landscape|terrain|cove|lake|water|beach|island|cliff|retreat|village|庭|园|湖|水|地形|悬崖|岛/.test(text)) score += 10;
  return clampScore(score);
}

function scoreFacadeDetail({ detail = {}, tags = new Set() }) {
  let score = 0;
  score += Math.min(32, Number(detail.stair_slab_ratio || 0) * 160);
  score += Math.min(20, Number(detail.fence_ratio || 0) * 240);
  score += Math.min(16, Number(detail.glass_ratio || 0) * 140);
  score += Math.min(14, Number(detail.light_ratio || 0) * 260);
  score += Math.min(16, Number(detail.decor_ratio || 0) * 260);
  if (tags.has('micro-block-detailing')) score += 16;
  if (tags.has('rail-and-fence-detail')) score += 12;
  if (tags.has('glass-emphasis')) score += 10;
  return clampScore(score);
}

function scoreMassing({ vertical = {}, typology = '', tags = new Set(), dimensions = {}, text = '' }) {
  let score = 0;
  const nonAir = Number(dimensions.non_air_blocks || 0);
  if (nonAir > 60000) score += 18;
  else if (nonAir > 20000) score += 12;
  else if (nonAir > 6000) score += 8;
  if (vertical.tower_like) score += 22;
  if (['castle', 'tower', 'temple', 'public-building'].includes(String(typology))) score += 16;
  if (tags.has('vertical-icon')) score += 14;
  if (tags.has('stone-massing')) score += 10;
  if (tags.has('layered-eaves')) score += 12;
  if (/mansion|estate|castle|tower|church|cathedral|pagoda|temple|pyramid|fort|hotel|library|palace|豪宅|城堡|塔|寺|教堂/.test(text)) score += 12;
  return clampScore(score);
}

function scoreSpatialSegmentation(spatial = {}) {
  if (String(spatial.status || 'missing') !== 'analyzed') return 0;
  let score = 0;
  const roomCount = Number(spatial.room_candidate_count || 0);
  const highConfidenceRooms = Number(spatial.high_confidence_room_count || 0);
  if (Number(spatial.floor_count || 0) > 0) score += 18;
  if (roomCount > 0) score += 18 + Math.min(20, roomCount * 3);
  if (highConfidenceRooms > 0) score += 16 + Math.min(18, highConfidenceRooms * 4);
  const segmentation = String(spatial.segmentation_confidence || 'none');
  if (segmentation === 'high') score += 14;
  else if (segmentation === 'medium') score += 8;
  else if (segmentation === 'low') score += 3;
  const readiness = String(spatial.pattern_mining_readiness || 'skip');
  if (readiness === 'high') score += 12;
  else if (readiness === 'medium') score += 7;
  else if (readiness === 'low') score += 2;
  if ((spatial.warnings || []).includes('no-room-air-components-detected')) score -= 18;
  if ((spatial.warnings || []).includes('many-components-touch-exterior-edge')) score -= 8;
  return clampScore(score);
}

function scoreFurniturePatterns(spatial = {}) {
  if (String(spatial.status || 'missing') !== 'analyzed') return 0;
  let score = 0;
  const groupCount = Number(spatial.furniture_group_count || 0);
  const highConfidence = Number(spatial.high_confidence_furniture_group_count || 0);
  if (groupCount > 0) score += 22 + Math.min(24, groupCount * 2);
  if (highConfidence > 0) score += 16 + Math.min(20, highConfidence * 3);
  const readiness = String(spatial.furniture_pattern_readiness || 'skip');
  if (readiness === 'high') score += 18;
  else if (readiness === 'medium') score += 10;
  else if (readiness === 'low') score += 4;
  const patternTypes = Object.keys(spatial.detected_furniture_patterns || {}).length;
  score += Math.min(16, patternTypes * 3);
  if (Number(spatial.room_adjacency_count || 0) > 0) score += 5;
  return clampScore(score);
}

function scoreMetadata(template = {}) {
  let score = 8;
  if (template.source?.url || template.page?.url) score += 22;
  if (template.page?.description) score += 18;
  if (template.page?.text_sample) score += 10;
  if (template.source?.title) score += 8;
  return clampScore(score);
}

function learningRoles({ scores, template, text, tags, terrain, detail, vertical, interior, spatial }) {
  const roles = [];
  addRole(roles, 'interior_reference', scores.interior, 'room furnishings, room atmosphere, wall/floor/light grammar');
  addRole(roles, 'room_layout_reference', scores.spatial, 'floor levels, walkable room volumes, enclosure, room adjacency candidates');
  addRole(roles, 'furniture_group_reference', scores.patterns, 'mined furniture groups, work walls, sleep niches, display walls, and lighting layers');
  addRole(roles, 'terrain_base', terrain.integrated || tags.has('terrain-integrated') ? Math.max(scores.site, 55) : 0, 'non-flat terrain, earth/rock plinths, terrain as composition');
  addRole(roles, 'garden_scene', tags.has('landscape-composition') || String(detail.garden_signal || 'none') !== 'none' ? Math.max(scores.site, 52) : 0, 'foreground paths, planting beds, garden rooms, scene framing');
  addRole(roles, 'water_edge', tags.has('water-edge') || /water|lake|cove|beach|水|湖|海/.test(text) ? Math.max(scores.site, 50) : 0, 'waterfront decks, reflected views, edge transitions');
  addRole(roles, 'facade_detail', scores.facade_detail, 'micro-block depth, rails, trims, glass rhythm, relief');
  addRole(roles, 'massing_silhouette', scores.massing, 'overall silhouette, towers, wings, roof/eave stacking');
  if (tags.has('layered-eaves')) addRole(roles, 'roof_eaves', Math.max(58, scores.massing), 'roof layering, eaves, pagoda/temple roof rhythm');
  if (['castle', 'tower', 'temple', 'public-building', 'arena'].includes(String(template.typology || ''))) {
    addRole(roles, 'landmark_presence', Math.max(50, scores.massing), 'large-scale identity, approach drama, iconic silhouette');
  }
  if (!isUnfinishedInteriorText(text) && scores.interior >= 35 && (Number(interior.counts?.books_library || 0) > 0 || /library|study|书/.test(text))) {
    addRole(roles, 'library_study_reference', Math.max(48, scores.interior), 'bookshelves, reading walls, desks, archive rhythm');
  }
  if (spatial?.vertical_circulation?.vertical_signal === 'present') {
    addRole(roles, 'vertical_circulation_reference', Math.max(45, scores.spatial), 'stairs, ladders, stacked floor access, vertical room links');
  }
  return roles.sort((a, b) => b.score - a.score || a.role.localeCompare(b.role));
}

function addRole(roles, role, score, description) {
  const value = clampScore(score);
  if (value < 35) return;
  roles.push({ role, score: value, description });
}

function reviewFlags({ template, text, typology, category, dimensions, scores, roles, interior, spatial }) {
  const flags = new Set();
  if (!template.source?.url && !template.page?.url) flags.add('missing-source-url');
  if (isUnfinishedInteriorText(text)) flags.add('interior-described-as-unfinished');
  if (isPartiallyUnfurnishedText(text)) flags.add('partially-unfurnished-interior');
  if (!isInteriorLearningTypology(typology, category) && Number(interior.strong_hits || 0) > 0) flags.add('non-residential-interior-noise');
  if (String(typology) === 'arena' || String(category).toLowerCase() === 'arenas') flags.add('arena-not-for-room-mining');
  if (Number(dimensions.non_air_blocks || 0) > 180000) flags.add('monumental-scale-normalize-before-use');
  if (scores.interior < 35 && roles.some((role) => role.role === 'massing_silhouette')) flags.add('exterior-only-reference');
  if (spatial?.status === 'skipped' && roles.some((role) => role.role === 'interior_reference')) flags.add('spatial-analysis-skipped');
  if (spatial?.status === 'analyzed' && Number(spatial.room_candidate_count || 0) === 0 && scores.interior >= 48) flags.add('no-room-components-detected');
  if (spatial?.status === 'analyzed' && String(spatial.segmentation_confidence || 'none') === 'low' && scores.interior >= 48) flags.add('weak-room-segmentation');
  if (spatial?.status === 'analyzed' && Number(spatial.room_candidate_count || 0) > 0 && Number(spatial.furniture_group_count || 0) === 0 && scores.interior >= 48) flags.add('no-furniture-groups-detected');
  if ((spatial?.warnings || []).includes('many-components-touch-exterior-edge')) flags.add('exterior-edge-room-noise');
  if (scores.metadata < 30) flags.add('weak-text-metadata');
  if (scores.site < 30 && scores.facade_detail < 30 && scores.interior < 30 && scores.massing < 30 && scores.spatial < 30 && scores.patterns < 30) flags.add('low-learning-signal');
  return [...flags].sort();
}

function learnableAreasForCase({ roles, scores, template, text, terrain, detail, interior, spatial }) {
  const areas = [];
  for (const role of roles) {
    areas.push({
      area: roleToArea(role.role),
      priority: scorePriority(role.score),
      role: role.role,
      evidence: roleEvidence(role.role, { scores, template, text, terrain, detail, interior, spatial }),
      next_phase: nextPhaseForRole(role.role)
    });
  }
  return areas;
}

function roomReferenceCandidates({ template, text, typology, category, interior, spatial, scores, flags }) {
  if (!isInteriorLearningTypology(typology, category)) return [];
  if (flags.includes('interior-described-as-unfinished')) return [];
  if (scores.interior < 34 && scores.spatial < 50) return [];

  const counts = interior.counts || {};
  const candidates = [];
  addRoomCandidate(candidates, 'living', /living|lounge|hall|mansion|villa|house|home|hotel|tavern|客厅|起居|大厅|豪宅|别墅|住宅/.test(text), 52, 'public room likely present from typology/text');
  addRoomCandidate(candidates, 'kitchen', Number(counts.kitchen_work || 0) > 0 || /kitchen|dining|restaurant|tavern|厨房|餐厅/.test(text), 56, 'kitchen work blocks or dining text');
  addRoomCandidate(candidates, 'bedroom', Number(counts.bed || 0) > 0 || /bedroom|mansion|villa|house|home|hotel|卧室|住宅|别墅|豪宅/.test(text), Number(counts.bed || 0) > 0 ? 76 : 50, 'bed signal or residential typology');
  addRoomCandidate(candidates, 'study', Number(counts.books_library || 0) > 0 || /study|library|office|lectern|书房|图书馆|书/.test(text), 68, 'library/study blocks or text');
  addRoomCandidate(candidates, 'bathroom', Number(counts.wet_fixture || 0) >= 3 || /bath|spa|hospital|hotel|浴室|卫生间/.test(text), 48, 'bathroom fixture signal');
  addRoomCandidate(candidates, 'storage', Number(counts.storage || 0) > 12 || /storage|warehouse|barrel|储藏/.test(text), 42, 'storage block signal');
  addRoomCandidate(candidates, 'workshop', Number(counts.workshop || 0) >= 3 || /\bworkshop\b|\bforge\b|\bsmith\b|\bcrafting\b|工作室|工坊/.test(text), 46, 'workshop block signal');
  addRoomCandidate(candidates, 'chapel_or_ceremonial_hall', String(typology) === 'temple' || /church|chapel|cathedral|temple|altar|教堂|神庙|寺/.test(text), 64, 'ceremonial typology');
  addRoomCandidate(candidates, 'tower_room', ['tower', 'castle'].includes(String(typology)) || /tower|castle|塔|城堡/.test(text), 50, 'vertical typology');
  addRoomCandidate(candidates, 'entry_or_lobby', /entry|lobby|hotel|mansion|villa|入口|门厅|大厅/.test(text), 50, 'entry/lobby text or public typology');

  addSpatialRoomCandidates(candidates, spatial);

  return mergeRoomCandidates(candidates)
    .sort((a, b) => b.confidence - a.confidence || a.room_type.localeCompare(b.room_type))
    .slice(0, 8);
}

function addRoomCandidate(candidates, roomType, condition, confidence, evidence) {
  if (!condition) return;
  candidates.push({ room_type: roomType, confidence: clampScore(confidence), evidence });
}

function addSpatialRoomCandidates(candidates, spatial = {}) {
  if (String(spatial.status || 'missing') !== 'analyzed') return;
  for (const [rawType, count] of Object.entries(spatial.detected_room_types || {})) {
    const roomType = normalizeSpatialRoomType(rawType);
    const confidence = 56 + Math.min(22, Number(count || 0) * 5);
    addRoomCandidate(
      candidates,
      roomType,
      true,
      confidence,
      `spatial segmentation detected ${count} ${rawType} component(s)`
    );
  }
  for (const room of (spatial.room_candidates || []).slice(0, 18)) {
    const topHint = room.type_hints?.[0];
    if (!topHint?.room_type) continue;
    const roomType = normalizeSpatialRoomType(topHint.room_type);
    const enclosure = room.evidence?.enclosure || (room.touches_schematic_edge ? 'edge-adjacent' : 'enclosed');
    addRoomCandidate(
      candidates,
      roomType,
      true,
      Math.max(48, Math.min(88, Number(room.confidence || 0))),
      `spatial component ${room.id || 'room'} at y=${room.y}, area=${room.area}, ${enclosure}`
    );
  }
}

function normalizeSpatialRoomType(roomType) {
  return {
    living_or_hall: 'living',
    great_hall: 'living',
    stairs_or_vertical_hall: 'entry_or_lobby'
  }[roomType] || roomType;
}

function mergeRoomCandidates(candidates) {
  const byType = new Map();
  for (const candidate of candidates) {
    const roomType = candidate.room_type;
    const existing = byType.get(roomType);
    if (!existing) {
      byType.set(roomType, { ...candidate });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, candidate.confidence);
    const evidence = [existing.evidence, candidate.evidence].filter(Boolean);
    existing.evidence = [...new Set(evidence)].slice(0, 3).join('; ');
  }
  return [...byType.values()];
}

function roomLearningClausesForCase({ roomCandidates = [], spatial = {}, interior = {} }) {
  return roomCandidates.slice(0, 8).map((candidate) => ({
    room_type: candidate.room_type,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
    spatial_support: spatialSupportForRoom(candidate.room_type, spatial),
    furniture_patterns: furniturePatternsForRoom(candidate.room_type, spatial).slice(0, 6),
    clauses: roomClauses(candidate.room_type, { candidate, spatial, interior })
  }));
}

function spatialSupportForRoom(roomType, spatial = {}) {
  const matches = Object.entries(spatial.detected_room_types || {})
    .filter(([rawType]) => normalizeSpatialRoomType(rawType) === roomType)
    .map(([rawType, count]) => ({ detected_type: rawType, count }));
  return {
    status: spatial.status || 'missing',
    detected_components: matches.reduce((sum, item) => sum + Number(item.count || 0), 0),
    matched_detected_types: matches,
    segmentation_confidence: spatial.segmentation_confidence || 'none',
    pattern_mining_readiness: spatial.pattern_mining_readiness || 'skip'
  };
}

function furniturePatternsForRoom(roomType, spatial = {}) {
  return (spatial.furniture_groups || [])
    .filter((group) => normalizeSpatialRoomType(group.room_type) === roomType || compatiblePatternRoom(roomType, group))
    .sort((a, b) => b.confidence - a.confidence || a.pattern_type.localeCompare(b.pattern_type))
    .map((group) => ({
      pattern_type: group.pattern_type,
      confidence: group.confidence,
      anchor: group.anchor,
      clauses: group.clauses || [],
      layout_intent: group.layout_intent,
      observed_signals: group.observed_signals || {}
    }));
}

function compatiblePatternRoom(roomType, group = {}) {
  const pattern = String(group.pattern_type || '');
  if (roomType === 'living' && ['social_cluster', 'display_wall', 'layered_lighting', 'plant_corner'].includes(pattern)) return true;
  if (roomType === 'entry_or_lobby' && ['circulation_spine', 'display_wall', 'layered_lighting'].includes(pattern)) return true;
  if (roomType === 'corridor_or_gallery' && ['display_wall', 'layered_lighting', 'circulation_spine'].includes(pattern)) return true;
  if (roomType === 'bedroom' && ['sleep_niche', 'storage_wall', 'layered_lighting'].includes(pattern)) return true;
  return false;
}

function roomClauses(roomType, { candidate, spatial, interior }) {
  const common = [
    'preserve clear walkable center before placing dense furniture',
    'anchor furniture to walls, corners, windows, or focal blocks instead of scattering props'
  ];
  const byType = {
    living: [
      'treat as the public social room with a larger open zone and one clear focal wall',
      'cluster seats, tables, lights, plants, and storage into readable conversation groups',
      'connect naturally to entry, terrace, garden, stair, or view-facing glass when present'
    ],
    kitchen: [
      'use furnace, crafting, storage, and counter blocks as a compact work band',
      'keep cooking blocks adjacent to wall or island edges with a free service aisle',
      'pair kitchen with dining or living edges instead of isolating it as a dead-end closet'
    ],
    bedroom: [
      'treat as a quieter private room with stronger enclosure and fewer through routes',
      'place bed as the main anchor with side storage, soft light, textile, and small display details',
      'avoid blocking the door-to-bed path and keep at least one usable standing side'
    ],
    study: [
      'use bookshelves, lecterns, desks, and display objects as the main focal grammar',
      'place reading/work surfaces against walls or windows with local task lighting',
      'prefer compact alcoves, libraries, galleries, or upper-floor rooms for study patterns'
    ],
    bathroom: [
      'keep wet fixtures compact and semi-private with clear door access',
      'use cauldron, basin-like blocks, slabs, trapdoors, and light accents as fixture clusters',
      'avoid oversized empty bathrooms unless the source room is spa-like'
    ],
    storage: [
      'organize chests, barrels, shelves, and utility blocks into wall bays',
      'leave a straight access lane so storage reads functional rather than decorative clutter',
      'use repeated modules and labels/details for warehouse, pantry, or attic variants'
    ],
    workshop: [
      'group crafting, anvil, furnace, smithing, and tool blocks by work zone',
      'place heavy work blocks on robust floors or against structural walls',
      'mix storage and task lighting so the room reads as usable production space'
    ],
    corridor_or_gallery: [
      'treat as circulation first: keep a continuous clear route through the long axis',
      'use side-wall rhythm, lamps, windows, alcoves, banners, or shelves for detail',
      'avoid bulky furniture in the path; place display details in recesses or at ends'
    ],
    entry_or_lobby: [
      'act as a transition hub between outside, stairs, and public rooms',
      'use doors, stairs, lamps, rugs, columns, or display blocks to mark arrival',
      'keep sightlines open toward the main room or vertical circulation'
    ],
    chapel_or_ceremonial_hall: [
      'use symmetry, axis, elevated focal blocks, candles, lecterns, banners, or bells',
      'keep the central nave or ritual path open and place detail along edges',
      'favor taller ceiling cues and repeated wall rhythm over domestic clutter'
    ],
    tower_room: [
      'treat as a compact stacked room connected to stairs or ladders',
      'prioritize vertical access, lookout windows, storage niches, and small utility anchors',
      'avoid wide furniture layouts that fight the tower footprint'
    ]
  };
  const baseClauses = byType[roomType] || common;
  const patternClauses = [];
  for (const pattern of furniturePatternsForRoom(roomType, spatial).slice(0, 4)) {
    for (const clause of pattern.clauses || []) patternClauses.push(clause);
    if (pattern.layout_intent) patternClauses.push(pattern.layout_intent);
  }
  const clauses = [...baseClauses.slice(0, 3), ...patternClauses, ...common];
  if (candidate.confidence >= 75) clauses.push('source geometry is high confidence; safe for phase 3 furniture-group mining');
  if (spatial?.vertical_circulation?.vertical_signal === 'present' && ['entry_or_lobby', 'corridor_or_gallery', 'tower_room'].includes(roomType)) {
    clauses.push('coordinate with detected vertical circulation instead of treating each floor independently');
  }
  if (Number(interior.counts?.light_fixture || 0) > 0) clauses.push('carry over local lighting rhythm as part of the room identity');
  return [...new Set(clauses)].slice(0, 6);
}

function qualityTagsForCase({ scores, roles, flags, roomCandidates, template, spatial }) {
  const tags = new Set();
  if (scores.interior >= 70) tags.add('interior-rich-reference');
  else if (scores.interior >= 45) tags.add('interior-usable-reference');
  if (scores.spatial >= 70) tags.add('spatial-room-segmentation-rich');
  else if (scores.spatial >= 45) tags.add('spatial-room-segmentation-usable');
  if (scores.patterns >= 70) tags.add('furniture-pattern-rich');
  else if (scores.patterns >= 45) tags.add('furniture-pattern-usable');
  if (['high', 'medium'].includes(String(spatial?.pattern_mining_readiness || '')) &&
    !flags.includes('arena-not-for-room-mining') &&
    !flags.includes('interior-described-as-unfinished')) {
    tags.add('phase2-room-pattern-ready');
  }
  if (['high', 'medium'].includes(String(spatial?.furniture_pattern_readiness || '')) &&
    !flags.includes('arena-not-for-room-mining') &&
    !flags.includes('interior-described-as-unfinished')) {
    tags.add('phase3-furniture-pattern-ready');
  }
  if (scores.site >= 70) tags.add('site-rich-reference');
  else if (scores.site >= 45) tags.add('site-usable-reference');
  if (scores.facade_detail >= 70) tags.add('facade-detail-rich');
  else if (scores.facade_detail >= 45) tags.add('facade-detail-usable');
  if (scores.massing >= 70) tags.add('iconic-massing');
  else if (scores.massing >= 45) tags.add('massing-usable');
  if (roomCandidates.length >= 4) tags.add('multi-room-mining-candidate');
  if (roles.some((role) => role.role === 'water_edge')) tags.add('waterfront-learning');
  if (roles.some((role) => role.role === 'garden_scene')) tags.add('garden-learning');
  if (flags.length) tags.add('review-before-deep-mining');
  if (String(template.category || '').toLowerCase() === 'house') tags.add('residential-reference');
  return [...tags].sort();
}

function referenceScore(scores, flags) {
  let score = scores.interior * 0.22 +
    scores.site * 0.22 +
    scores.facade_detail * 0.2 +
    scores.massing * 0.17 +
    scores.spatial * 0.08 +
    scores.patterns * 0.04 +
    scores.metadata * 0.08;
  if (flags.includes('interior-described-as-unfinished')) score -= 6;
  if (flags.includes('arena-not-for-room-mining')) score -= 4;
  if (flags.includes('low-learning-signal')) score -= 14;
  return clampScore(score);
}

function studyPriority(score, flags) {
  if (flags.includes('low-learning-signal')) return 'low';
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

function phase2RoomMiningPriority({ scores, flags, roomCandidates, roles, spatial }) {
  if (flags.includes('arena-not-for-room-mining') || flags.includes('interior-described-as-unfinished')) return 'skip';
  if (!roles.some((role) => role.role === 'interior_reference') && !roles.some((role) => role.role === 'room_layout_reference')) return 'skip';
  const spatialReady = String(spatial?.pattern_mining_readiness || 'skip');
  if (spatialReady === 'high' && scores.interior >= 58 && roomCandidates.length >= 3) return 'high';
  if (['high', 'medium'].includes(spatialReady) && roomCandidates.length >= 2) return 'medium';
  if (flags.includes('partially-unfurnished-interior') && scores.interior >= 48 && roomCandidates.length >= 2) return 'medium';
  if (scores.interior >= 70 && roomCandidates.length >= 3) return 'high';
  if (scores.interior >= 48 && roomCandidates.length >= 2) return 'medium';
  return 'low';
}

function evidenceSummary({ template, terrain, detail, interior, spatial, dimensions }) {
  return {
    dimensions: {
      width: dimensions.width,
      height: dimensions.height,
      length: dimensions.length,
      non_air_blocks: dimensions.non_air_blocks,
      density: dimensions.density
    },
    terrain: {
      integrated: Boolean(terrain.integrated),
      non_flat: Boolean(terrain.non_flat),
      height_range: terrain.height_range,
      natural_column_ratio: terrain.natural_column_ratio
    },
    detail_metrics: {
      glass_ratio: detail.glass_ratio,
      stair_slab_ratio: detail.stair_slab_ratio,
      fence_ratio: detail.fence_ratio,
      decor_ratio: detail.decor_ratio,
      garden_signal: detail.garden_signal
    },
    interior_signals: {
      furnished_likelihood: interior.furnished_likelihood,
      strong_hits: interior.strong_hits,
      strong_richness: interior.strong_richness,
      dominant_signals: interior.dominant_signals || []
    },
    spatial_layout: spatialEvidenceSummary(spatial),
    page_description: template.page?.description || template.source?.note || ''
  };
}

function spatialEvidenceSummary(spatial = {}) {
  return {
    status: spatial.status || 'missing',
    floor_count: Number(spatial.floor_count || 0),
    selected_floor_levels: spatial.selected_floor_levels || [],
    room_candidate_count: Number(spatial.room_candidate_count || 0),
    high_confidence_room_count: Number(spatial.high_confidence_room_count || 0),
    room_adjacency_count: Number(spatial.room_adjacency_count || 0),
    furniture_group_count: Number(spatial.furniture_group_count || 0),
    high_confidence_furniture_group_count: Number(spatial.high_confidence_furniture_group_count || 0),
    furniture_pattern_readiness: spatial.furniture_pattern_readiness || 'skip',
    detected_room_types: spatial.detected_room_types || {},
    detected_furniture_patterns: spatial.detected_furniture_patterns || {},
    segmentation_confidence: spatial.segmentation_confidence || 'none',
    pattern_mining_readiness: spatial.pattern_mining_readiness || 'skip',
    vertical_circulation: spatial.vertical_circulation || {},
    warnings: spatial.warnings || []
  };
}

function patternEvidenceSummary(spatial = {}) {
  const groups = Array.isArray(spatial.furniture_groups) ? spatial.furniture_groups : [];
  return {
    status: spatial.status === 'analyzed' ? 'analyzed' : spatial.status || 'missing',
    furniture_group_count: Number(spatial.furniture_group_count || 0),
    high_confidence_furniture_group_count: Number(spatial.high_confidence_furniture_group_count || 0),
    furniture_pattern_readiness: spatial.furniture_pattern_readiness || 'skip',
    detected_furniture_patterns: spatial.detected_furniture_patterns || {},
    top_patterns: groups
      .slice(0, 16)
      .map((group) => ({
        pattern_type: group.pattern_type,
        room_type: normalizeSpatialRoomType(group.room_type),
        confidence: group.confidence,
        anchor: group.anchor,
        clauses: group.clauses || [],
        layout_intent: group.layout_intent
      }))
  };
}

function compositionEvidenceSummary(composition = {}) {
  return {
    status: composition.status || 'missing',
    readiness: composition.readiness || 'skip',
    score: Number(composition.score || 0),
    massing_patterns: evidenceTypes(composition.massing_patterns),
    approach_sequence: evidenceTypes(composition.approach_sequence),
    facade_rhythm: evidenceTypes(composition.facade_rhythm),
    roof_composition: evidenceTypes(composition.roof_composition),
    site_composition: evidenceTypes(composition.site_composition),
    view_and_landmark_rules: evidenceTypes(composition.view_and_landmark_rules),
    transfer_rules: (composition.transfer_rules || []).slice(0, 10)
  };
}

function evidenceTypes(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 10)
    .map((item) => ({
      pattern_type: item.pattern_type,
      confidence: Number(item.confidence || 0),
      reason: item.reason
    }));
}

function nextPhaseHints({ roles, roomCandidates, flags, spatial }) {
  const hints = [];
  if (flags.includes('interior-described-as-unfinished')) hints.push('do not mine interiors until manually confirmed');
  if (flags.includes('arena-not-for-room-mining')) hints.push('use for massing, public approach, seating rhythm, or site only');
  if (roles.some((role) => role.role === 'interior_reference')) hints.push('phase2: segment floors and interior air volumes before extracting room patterns');
  if (['high', 'medium'].includes(String(spatial?.pattern_mining_readiness || ''))) hints.push('phase3: mine furniture groups only from medium/high confidence spatial room candidates');
  if (flags.includes('no-room-components-detected')) hints.push('manual check: rich interior signals exist but room geometry was not segmented cleanly');
  if (roomCandidates.length) hints.push(`phase2: prioritize ${roomCandidates.slice(0, 5).map((item) => item.room_type).join(', ')}`);
  if (roles.some((role) => role.role === 'terrain_base')) hints.push('phase2-site: extract terrain height bands and retaining edges');
  if (roles.some((role) => role.role === 'garden_scene')) hints.push('phase2-site: extract paths, planting beds, water/rock/vegetation groupings');
  if (roles.some((role) => role.role === 'facade_detail')) hints.push('phase2-facade: mine repeatable trim, rail, window, and relief motifs');
  if (roles.some((role) => ['massing_silhouette', 'roof_eaves', 'landmark_presence'].includes(role.role))) hints.push('phase5: transfer overall composition grammar into massing, roof, facade, and approach sequence');
  return hints;
}

function roleToArea(role) {
  return {
    interior_reference: 'interior',
    room_layout_reference: 'interior-layout',
    furniture_group_reference: 'interior-furniture-groups',
    terrain_base: 'site-terrain',
    garden_scene: 'site-garden',
    water_edge: 'site-water-edge',
    facade_detail: 'facade',
    massing_silhouette: 'massing',
    roof_eaves: 'roof',
    landmark_presence: 'landmark-composition',
    library_study_reference: 'interior-study-library',
    vertical_circulation_reference: 'interior-vertical-circulation'
  }[role] || role;
}

function nextPhaseForRole(role) {
  if (role === 'interior_reference' || role === 'library_study_reference') return 'phase2-room-segmentation';
  if (role === 'room_layout_reference' || role === 'vertical_circulation_reference') return 'phase3-room-pattern-mining';
  if (role === 'furniture_group_reference') return 'phase3-decorator-pattern-guidance';
  if (['terrain_base', 'garden_scene', 'water_edge'].includes(role)) return 'phase2-site-pattern-mining';
  if (role === 'facade_detail') return 'phase2-facade-motif-mining';
  if (['massing_silhouette', 'roof_eaves', 'landmark_presence'].includes(role)) return 'phase2-massing-roof-mining';
  return 'manual-review';
}

function roleEvidence(role, { scores, template, text, terrain, detail, interior, spatial }) {
  if (role === 'interior_reference') return `${interior.furnished_likelihood || 'low'} interior, richness ${interior.richness || 0}, strong hits ${interior.strong_hits || 0}`;
  if (role === 'room_layout_reference') return `${spatial.room_candidate_count || 0} room components, ${spatial.high_confidence_room_count || 0} high-confidence, readiness ${spatial.pattern_mining_readiness || 'skip'}`;
  if (role === 'furniture_group_reference') return `${spatial.furniture_group_count || 0} furniture groups, ${spatial.high_confidence_furniture_group_count || 0} high-confidence, readiness ${spatial.furniture_pattern_readiness || 'skip'}`;
  if (role === 'terrain_base') return `terrain integrated=${Boolean(terrain.integrated)}, range=${terrain.height_range || 0}`;
  if (role === 'garden_scene') return `garden signal=${detail.garden_signal || 'none'}, vegetation/water inferred from block categories`;
  if (role === 'water_edge') return `water-edge tag/text match in ${template.title || text.slice(0, 40)}`;
  if (role === 'facade_detail') return `detail score ${scores.facade_detail}, stair/slab ${detail.stair_slab_ratio || 0}, fence ${detail.fence_ratio || 0}`;
  if (role === 'massing_silhouette') return `massing score ${scores.massing}, typology ${template.typology}`;
  if (role === 'vertical_circulation_reference') return `vertical signal ${spatial.vertical_circulation?.vertical_signal || 'none'}, stair blocks ${spatial.vertical_circulation?.stair_blocks || 0}`;
  return `score ${scores[role] || 0}`;
}

function templateText(template = {}) {
  return [
    template.title,
    template.category,
    template.style_family,
    template.typology,
    ...(template.tags || []),
    template.source?.title,
    template.source?.note,
    template.page?.title,
    template.page?.description
  ].filter(Boolean).join(' ').toLowerCase();
}

function templateRiskText(template = {}) {
  return [
    templateText(template),
    template.page?.text_sample
  ].filter(Boolean).join(' ').toLowerCase();
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

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function scorePriority(score) {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function isUnfinishedInteriorText(text) {
  return /interiors? (are )?largely unfinished|unfinished interiors?|blank canvas|shell of a|empty interior|not furnished|mostly unfurnished|largely unfurnished|未完成|空壳/.test(String(text || '').toLowerCase());
}

function isPartiallyUnfurnishedText(text) {
  return /mix of furnished and unfurnished|partly furnished|partially furnished|some unfurnished|unfurnished spaces|部分未装修|部分未完成/.test(String(text || '').toLowerCase());
}

function isInteriorLearningTypology(typology, category) {
  const type = String(typology || '').toLowerCase();
  const group = String(category || '').toLowerCase();
  if (type === 'arena' || group === 'arenas') return false;
  return true;
}

function hasRole(item, role) {
  return (item.learning_roles || []).some((entry) => entry.role === role);
}

function topCases(cases, scoreFn, limit) {
  return [...cases]
    .sort((a, b) => scoreFn(b) - scoreFn(a) || b.overall_reference_score - a.overall_reference_score)
    .slice(0, limit)
    .map((item) => ({
      case_id: item.case_id,
      title: item.title,
      file: item.file,
      score: item.overall_reference_score,
      style_family: item.style_family,
      typology: item.typology,
      study_priority: item.study_priority,
      phase2_room_mining_priority: item.phase2_room_mining_priority,
      spatial_readiness: item.phase2_spatial_evidence?.pattern_mining_readiness || 'skip',
      spatial_room_candidates: item.phase2_spatial_evidence?.room_candidate_count || 0,
      furniture_readiness: item.phase3_pattern_evidence?.furniture_pattern_readiness || 'skip',
      furniture_groups: item.phase3_pattern_evidence?.furniture_group_count || 0,
      roles: (item.learning_roles || []).slice(0, 4).map((role) => role.role),
      rooms: (item.room_reference_candidates || []).slice(0, 5).map((room) => room.room_type),
      flags: item.review_flags || []
    }));
}

function addPatternCounts(target = {}, items = []) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const type = item?.pattern_type;
    if (!type) continue;
    target[type] = (target[type] || 0) + 1;
  }
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function formatObject(value = {}) {
  const entries = Object.entries(value || {});
  return entries.length ? entries.map(([key, count]) => `${key}=${count}`).join(', ') : 'none';
}

function formatCaseList(items = [], mode = 'case') {
  if (!items.length) return '- none';
  return items.map((item) => {
    const extras = [];
    const rooms = item.rooms || (item.room_reference_candidates || []).slice(0, 5).map((room) => room.room_type);
    const roles = item.roles || (item.learning_roles || []).slice(0, 4).map((role) => role.role);
    const flags = item.flags || item.review_flags || [];
    const score = item.score ?? item.overall_reference_score ?? 0;
    if (rooms.length) extras.push(`rooms=${rooms.join('/')}`);
    if (roles.length) extras.push(`roles=${roles.join('/')}`);
    if (item.spatial_readiness) extras.push(`spatial=${item.spatial_readiness}/${item.spatial_room_candidates || 0}`);
    if (item.furniture_readiness) extras.push(`furniture=${item.furniture_readiness}/${item.furniture_groups || 0}`);
    if (flags.length) extras.push(`flags=${flags.join('/')}`);
    if (mode === 'room') extras.push(`phase2=${item.phase2_room_mining_priority}`);
    return `- ${item.title} (${item.file}): score=${score}, ${extras.join(', ')}`;
  }).join('\n');
}
