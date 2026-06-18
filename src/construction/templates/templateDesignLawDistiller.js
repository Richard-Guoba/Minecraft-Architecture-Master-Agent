const LAW_SOURCE = 'stage7-template-design-law-distiller-v1';

export function buildTemplateDesignLawBook({
  root = 'mc_templates',
  generatedAt = new Date().toISOString(),
  caseLibrary = {}
} = {}) {
  const cases = caseLibrary.cases || [];
  const lawsById = new Map();

  for (const card of cases) {
    addCanonicalFeatureLaws(lawsById, card);
    addInteriorPatternLaws(lawsById, card);
    addRoomTypeLaws(lawsById, card);
    addSemanticClauseLaws(lawsById, card);
    addRiskControlLaws(lawsById, card);
  }

  const laws = [...lawsById.values()]
    .map(finalizeLaw)
    .sort((a, b) => lawSortScore(b) - lawSortScore(a) || a.id.localeCompare(b.id));
  const interiorLaws = laws.filter((law) => law.domain === 'interior' || law.domain === 'room')
    .sort((a, b) => lawSortScore(b) - lawSortScore(a) || a.id.localeCompare(b.id));
  const retrievalIndex = buildLawRetrievalIndex(laws);

  return {
    source: LAW_SOURCE,
    stage: '7C',
    generated_at: generatedAt,
    root,
    case_library_source: caseLibrary.source,
    summary: summarizeLawBook(laws, interiorLaws, cases),
    laws,
    interior_laws: interiorLaws,
    retrieval_index: retrievalIndex,
    prompt_rule_packs: buildPromptRulePacks(laws)
  };
}

export function renderTemplateDesignLawReport(lawBook = {}) {
  const summary = lawBook.summary || {};
  const domainRows = formatObject(summary.domain_counts);
  const priorityRows = formatObject(summary.priority_counts);
  const interiorRows = (lawBook.interior_laws || []).slice(0, 16).map(formatLawRow).join('\n') || '- none';
  const topRows = (lawBook.laws || []).slice(0, 20).map(formatLawRow).join('\n') || '- none';

  return `# Stage 7C Template Design Laws

Generated: ${lawBook.generated_at}

## What This Stage Adds

Stage 7C distills the case cards into reusable design laws. A law is only kept when it has source evidence, source cases, implementation clauses, and retrieval tokens. The purpose is to make top references operational during generation rather than leaving them as static examples.

## Summary

- Laws: ${summary.law_count || 0}
- Interior laws: ${summary.interior_law_count || 0}
- Source cases: ${summary.case_count || 0}
- Domains: ${domainRows}
- Priorities: ${priorityRows}
- High-confidence laws: ${summary.high_confidence_laws || 0}
- Retrieval tokens: ${summary.retrieval_token_count || 0}

## Top Laws

${topRows}

## Interior Law Focus

${interiorRows}
`;
}

export function designLawsJsonl(lawBook = {}) {
  return (lawBook.laws || []).map((law) => JSON.stringify(law)).join('\n') + '\n';
}

export function interiorLawsJsonl(lawBook = {}) {
  return (lawBook.interior_laws || []).map((law) => JSON.stringify(law)).join('\n') + '\n';
}

export function selectTemplateDesignLaws(lawBook = {}, prompt = '', {
  styleFamily = '',
  typology = '',
  featurePriorities = [],
  retrievedCaseIds = [],
  limit = 18,
  interiorLimit = 10
} = {}) {
  const laws = lawBook?.laws || [];
  if (!laws.length) return inactiveLawPack('design law book not found or empty');

  const contextText = `${prompt} ${styleFamily} ${typology} ${featurePriorities.join(' ')}`.toLowerCase();
  const promptTokens = new Set(keywordTokens(contextText));
  const requestedDomains = requestedDomainSignals(contextText);
  const retrieved = new Set(retrievedCaseIds || []);

  const scored = laws
    .map((law) => ({ law, score: scoreLaw(law, { promptTokens, requestedDomains, retrieved, contextText }) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || lawSortScore(b.law) - lawSortScore(a.law));
  const selected = scored.slice(0, limit).map(({ law, score }) => compactSelectedLaw(law, score));
  const interior = scored
    .filter(({ law }) => law.domain === 'interior' || law.domain === 'room')
    .slice(0, interiorLimit)
    .map(({ law, score }) => compactSelectedLaw(law, score));
  const clauses = dedupe([
    ...selected.flatMap((law) => law.implementation_clauses || []),
    ...interior.flatMap((law) => law.implementation_clauses || [])
  ]).slice(0, 48);

  return {
    source: 'stage7-template-design-law-selector-v1',
    active: selected.length > 0,
    selected_count: selected.length,
    interior_selected_count: interior.length,
    requested_domains: [...requestedDomains].sort(),
    selected_laws: selected,
    interior_laws: interior,
    implementation_clauses: clauses,
    directive_summary: clauses.slice(0, 12)
  };
}

function inactiveLawPack(reason) {
  return {
    source: 'stage7-template-design-law-selector-v1',
    active: false,
    reason,
    selected_count: 0,
    interior_selected_count: 0,
    requested_domains: [],
    selected_laws: [],
    interior_laws: [],
    implementation_clauses: [],
    directive_summary: []
  };
}

function addCanonicalFeatureLaws(target, card = {}) {
  const feature = card.feature_card || {};
  const site = feature.site || {};
  const composition = feature.composition || {};
  const facade = feature.facade_roof || {};
  const interior = feature.interior || {};

  if (site.integrated || site.terrain_profile !== 'flat-or-built-platform') {
    addLaw(target, 'site-terrain-plinth-sequence', {
      domain: 'site',
      rule: 'Terrain must become part of the architecture through rock/earth plinths, retaining edges, planting pockets, and stepped arrival.',
      implementation_clauses: [
        'build a layered stone/earth base before placing the main shell',
        'use height bands, retaining edges, and planting pockets instead of a flat lot',
        'connect the entry path to the raised terrain plinth with visible steps or ramps'
      ],
      prompt_affinities: ['terrain', 'non-flat', 'cliff', 'garden', 'rock'],
      applies_to: ['site-terrain', 'arrival', 'foundation'],
      confidence: featureConfidence(card, 72),
      card,
      evidence: `terrain profile ${site.terrain_profile}, range ${site.height_range || 0}`
    });
  }

  if ((site.landscape_features || []).includes('garden-composition') || site.garden_signal !== 'none') {
    addLaw(target, 'site-foreground-garden-rooms', {
      domain: 'site',
      rule: 'Foreground gardens should be composed as rooms and approach scenery, not scattered plants.',
      implementation_clauses: [
        'reserve a foreground zone before the facade',
        'organize path, hedge/planting beds, rocks, lights, and small water/seat details as a sequence',
        'frame the main entry or public room view with paired planting pockets'
      ],
      prompt_affinities: ['garden', 'foreground', 'courtyard', 'landscape', 'entry'],
      applies_to: ['site-garden', 'approach', 'entry'],
      confidence: featureConfidence(card, 74),
      card,
      evidence: `garden signal ${site.garden_signal || 'none'}`
    });
  }

  if ((site.landscape_features || []).includes('water-edge') || Number(site.water_ratio || 0) > 0.005) {
    addLaw(target, 'site-waterfront-public-threshold', {
      domain: 'site',
      rule: 'Water-edge buildings need a public-room threshold: deck, reflection edge, view window, and planting transition must align.',
      implementation_clauses: [
        'place living/dining/lounge rooms on the water/view side',
        'connect public rooms to a deck, terrace, pier, or reflection basin',
        'use planting and low edge framing so water is part of the scene'
      ],
      prompt_affinities: ['waterfront', 'water', 'lake', 'deck', 'view'],
      applies_to: ['site-water-edge', 'public-room', 'view-axis'],
      confidence: featureConfidence(card, 78),
      card,
      evidence: `water ratio ${site.water_ratio || 0}`
    });
  }

  if ((composition.massing || []).includes('long_bar')) {
    addLaw(target, 'massing-view-oriented-bar', {
      domain: 'massing',
      rule: 'Long-bar massing should organize circulation and view rooms along one readable direction.',
      implementation_clauses: [
        'align the long side with the main view or garden',
        'put public rooms along the view bar and service rooms in a side/back band',
        'break the bar with terrace, porch, or wing offsets'
      ],
      prompt_affinities: ['modern', 'villa', 'lake', 'view', 'bar'],
      applies_to: ['massing', 'space-plan', 'view-axis'],
      confidence: featureConfidence(card, 70),
      card,
      evidence: 'long_bar composition pattern'
    });
  }

  if ((composition.massing || []).includes('asymmetric_wings')) {
    addLaw(target, 'massing-asymmetric-secondary-wings', {
      domain: 'massing',
      rule: 'Secondary wings should be offset to form terraces, courtyards, or framed views rather than random protrusions.',
      implementation_clauses: [
        'offset a secondary wing from the main bar',
        'use the gap as a patio, entry court, or water-facing deck',
        'keep the wing program legible: service, quiet room, garage, or lounge'
      ],
      prompt_affinities: ['wing', 'asymmetric', 'villa', 'estate', 'courtyard'],
      applies_to: ['massing', 'terrace', 'site-threshold'],
      confidence: featureConfidence(card, 68),
      card,
      evidence: 'asymmetric_wings composition pattern'
    });
  }

  if ((composition.massing || []).includes('vertical_landmark')) {
    addLaw(target, 'massing-arrival-landmark', {
      domain: 'massing',
      rule: 'A vertical accent must act as an arrival marker or view anchor, not just extra height.',
      implementation_clauses: [
        'place the vertical element near entry, stair, corner, or public axis',
        'make approach paths reveal the landmark',
        'use roof cap, light slot, or facade rhythm to finish the silhouette'
      ],
      prompt_affinities: ['tower', 'landmark', 'castle', 'temple', 'vertical'],
      applies_to: ['massing', 'entry', 'silhouette'],
      confidence: featureConfidence(card, 74),
      card,
      evidence: 'vertical_landmark composition pattern'
    });
  }

  if ((composition.massing || []).includes('courtyard_or_void')) {
    addLaw(target, 'space-courtyard-internal-scene', {
      domain: 'space',
      rule: 'Courtyard or patio voids should become internal scenery that rooms face and use.',
      implementation_clauses: [
        'leave a readable open void or patio in the plan',
        'orient quiet rooms or social rooms toward the void',
        'add planting, water, seating, or floor texture inside the void'
      ],
      prompt_affinities: ['courtyard', 'patio', 'garden', 'void', 'quiet'],
      applies_to: ['space-plan', 'interior-view', 'site-garden'],
      confidence: featureConfidence(card, 72),
      card,
      evidence: 'courtyard_or_void composition pattern'
    });
  }

  if ((composition.facade || []).includes('large_glass_bands') || Number(facade.glass_ratio || 0) > 0.06) {
    addLaw(target, 'facade-glass-view-axis', {
      domain: 'facade',
      rule: 'Large glass must be tied to a view axis, public room, and exterior scene.',
      implementation_clauses: [
        'assign large glass to living/dining/lounge or stair reveal zones',
        'avoid using glass uniformly on every wall',
        'place seating, counters, or circulation so the glass reads as a destination'
      ],
      prompt_affinities: ['glass', 'modern', 'view', 'lake', 'sunroom'],
      applies_to: ['facade', 'opening', 'interior-view'],
      confidence: featureConfidence(card, 78),
      card,
      evidence: `glass ratio ${facade.glass_ratio || 0}`
    });
  }

  if ((composition.facade || []).includes('micro_depth_trim') || Number(facade.stair_slab_ratio || 0) > 0.045) {
    addLaw(target, 'facade-micro-depth-layering', {
      domain: 'facade',
      rule: 'Flat walls must be broken with repeatable micro-depth layers: stairs, slabs, rails, panes, lights, columns, or recesses.',
      implementation_clauses: [
        'add trim bands around windows and roof edges',
        'use slabs/stairs for shadow lines and rail blocks for edges',
        'repeat detail rhythm by facade bay instead of random decoration'
      ],
      prompt_affinities: ['detail', 'facade', 'trim', 'depth', 'window'],
      applies_to: ['facade', 'roof-edge', 'balcony'],
      confidence: featureConfidence(card, 76),
      card,
      evidence: `stair/slab ratio ${facade.stair_slab_ratio || 0}`
    });
  }

  if ((composition.roof || []).includes('flat_terrace_or_platform')) {
    addLaw(target, 'roof-usable-terrace-system', {
      domain: 'roof',
      rule: 'A flat roof should read as a usable terrace with access, parapet, furniture, and view edge.',
      implementation_clauses: [
        'include stair or internal access logic to the roof terrace',
        'build a parapet/rail edge and at least one seating or planter cluster',
        'align the terrace with view, water, garden, or vertical accent'
      ],
      prompt_affinities: ['roof-terrace', 'flat-roof', 'modern', 'deck', 'view'],
      applies_to: ['roof', 'terrace', 'view-axis'],
      confidence: featureConfidence(card, 74),
      card,
      evidence: 'flat_terrace_or_platform roof pattern'
    });
  }

  if ((composition.roof || []).includes('layered_eaves')) {
    addLaw(target, 'roof-layered-eaves-silhouette', {
      domain: 'roof',
      rule: 'Layered eaves should create a readable silhouette and protect the facade rhythm.',
      implementation_clauses: [
        'stack roof/eave bands instead of one flat cap',
        'use overhangs to mark floor or room hierarchy',
        'coordinate eave layers with entry, porch, or tower rhythm'
      ],
      prompt_affinities: ['japanese', 'temple', 'eaves', 'roof', 'pagoda'],
      applies_to: ['roof', 'facade', 'silhouette'],
      confidence: featureConfidence(card, 75),
      card,
      evidence: 'layered_eaves roof pattern'
    });
  }

  if (interior.furnished_likelihood !== 'low' || hasRole(card, 'interior_reference')) {
    addLaw(target, 'interior-room-identity-layer-stack', {
      domain: 'interior',
      rule: 'Every important room needs an identity stack: focal wall, functional anchor, storage/display layer, textiles/plants, and layered lighting.',
      implementation_clauses: [
        'give each room one focal wall or task wall before adding loose decor',
        'combine functional anchor + storage/display + lighting + soft detail',
        'keep circulation clear through the room center or along one edge'
      ],
      prompt_affinities: ['interior', 'furnished', 'living', 'bedroom', 'kitchen', 'study'],
      applies_to: ['interior', 'room-detail', 'decorator'],
      confidence: featureConfidence(card, 82),
      card,
      evidence: `interior likelihood ${interior.furnished_likelihood || 'unknown'}`
    });
  }
}

function addInteriorPatternLaws(target, card = {}) {
  const patterns = card.feature_card?.interior?.top_furniture_patterns || [];
  for (const pattern of patterns) {
    const id = patternLawId(pattern.pattern_type);
    const base = PATTERN_LAWS[pattern.pattern_type] || defaultPatternLaw(pattern.pattern_type);
    addLaw(target, id, {
      domain: 'interior',
      rule: base.rule,
      implementation_clauses: dedupe([...(base.clauses || []), pattern.layout_intent, ...(pattern.clauses || [])].filter(Boolean)),
      prompt_affinities: [pattern.room_type, pattern.pattern_type, ...(base.affinities || [])],
      applies_to: ['interior', pattern.room_type, pattern.pattern_type].filter(Boolean),
      confidence: Number(pattern.confidence || 60),
      card,
      evidence: `${pattern.pattern_type} in ${pattern.room_type || 'room'}`
    });
  }
}

function addRoomTypeLaws(target, card = {}) {
  const rooms = card.feature_card?.interior?.room_candidates || [];
  for (const room of rooms) {
    const type = normalizeRoomType(room.room_type);
    const base = ROOM_LAWS[type];
    if (!base) continue;
    addLaw(target, `room-${type}-template-grammar`, {
      domain: 'room',
      rule: base.rule,
      implementation_clauses: dedupe([...(base.clauses || []), ...(room.clauses || [])].filter(Boolean)),
      prompt_affinities: [type, ...(base.affinities || [])],
      applies_to: ['room', type, 'interior'],
      confidence: Number(room.confidence || 64),
      card,
      evidence: `room candidate ${type}`
    });
  }
}

function addSemanticClauseLaws(target, card = {}) {
  for (const clause of card.semantic_clauses || []) {
    const parsed = parseSemanticClause(clause);
    if (!parsed) continue;
    const canonical = CLAUSE_LAWS[parsed.key] || clauseLawFrom(parsed);
    if (!canonical) continue;
    addLaw(target, canonical.id, {
      domain: canonical.domain,
      rule: canonical.rule,
      implementation_clauses: canonical.clauses,
      prompt_affinities: canonical.affinities,
      applies_to: canonical.applies_to,
      confidence: canonical.confidence || 64,
      card,
      evidence: clause
    });
  }
}

function addRiskControlLaws(target, card = {}) {
  for (const control of card.risk_controls || []) {
    if (!/skip|normalize|do not|prefer high-confidence|safe/i.test(control)) continue;
    addLaw(target, `risk-${slug(control).slice(0, 48)}`, {
      domain: 'risk',
      rule: control,
      implementation_clauses: [control],
      prompt_affinities: ['risk', 'review', ...(card.retrieval?.prompt_affinities || [])],
      applies_to: ['case-selection', 'template-learning'],
      confidence: 62,
      card,
      evidence: control
    });
  }
}

function addLaw(target, id, { domain, rule, implementation_clauses = [], prompt_affinities = [], applies_to = [], confidence = 60, card, evidence }) {
  if (!id || !rule || !card) return;
  const current = target.get(id) || {
    id,
    domain,
    rule,
    evidence_count: 0,
    confidence_total: 0,
    source_cases: new Map(),
    implementation_clauses: new Set(),
    prompt_affinities: new Set(),
    applies_to: new Set(),
    evidence_samples: []
  };
  current.evidence_count += 1;
  current.confidence_total += Number(confidence || 0);
  current.source_cases.set(card.case_id, {
    case_id: card.case_id,
    title: card.title,
    file: card.file,
    score: card.overall_reference_score,
    style_family: card.style_family,
    typology: card.typology
  });
  for (const clause of implementation_clauses) current.implementation_clauses.add(clause);
  for (const affinity of [...prompt_affinities, ...(card.retrieval?.prompt_affinities || [])]) current.prompt_affinities.add(affinity);
  for (const targetArea of applies_to) current.applies_to.add(targetArea);
  if (evidence && current.evidence_samples.length < 12) current.evidence_samples.push(evidence);
  target.set(id, current);
}

function finalizeLaw(raw) {
  const sourceCases = [...raw.source_cases.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.title.localeCompare(b.title));
  const confidence = round(Math.min(98, Math.max(35, raw.confidence_total / Math.max(1, raw.evidence_count) + Math.min(14, sourceCases.length * 1.5))));
  const priorityScore = confidence + Math.min(24, sourceCases.length * 3) + Math.min(12, raw.evidence_count);
  return {
    id: raw.id,
    source: LAW_SOURCE,
    domain: raw.domain,
    priority: priorityScore >= 112 ? 'critical' : priorityScore >= 92 ? 'high' : priorityScore >= 72 ? 'medium' : 'low',
    confidence,
    evidence_count: raw.evidence_count,
    source_count: sourceCases.length,
    rule: raw.rule,
    implementation_clauses: [...raw.implementation_clauses].slice(0, 14),
    prompt_affinities: [...raw.prompt_affinities].filter(Boolean).sort().slice(0, 32),
    applies_to: [...raw.applies_to].filter(Boolean).sort().slice(0, 16),
    source_cases: sourceCases.slice(0, 16),
    evidence_samples: raw.evidence_samples.slice(0, 10),
    retrieval_tokens: keywordTokens([
      raw.id,
      raw.domain,
      raw.rule,
      ...raw.implementation_clauses,
      ...raw.prompt_affinities,
      ...raw.applies_to
    ].join(' '))
  };
}

function scoreLaw(law, { promptTokens, requestedDomains, retrieved, contextText }) {
  let score = law.confidence * 0.18 + law.source_count * 2.2 + law.evidence_count * 0.8;
  if (law.priority === 'critical') score += 18;
  else if (law.priority === 'high') score += 11;
  else if (law.priority === 'medium') score += 5;
  if (requestedDomains.has(law.domain)) score += 18;
  if (law.domain === 'interior' && requestedDomains.has('room')) score += 8;
  if (law.domain === 'room' && requestedDomains.has('interior')) score += 10;
  for (const token of law.retrieval_tokens || []) if (promptTokens.has(token)) score += 4;
  for (const affinity of law.prompt_affinities || []) if (contextText.includes(String(affinity).toLowerCase())) score += 5;
  if ((law.source_cases || []).some((source) => retrieved.has(source.case_id))) score += 12;
  if (requestedDomains.size === 0 && ['risk'].includes(law.domain)) score -= 20;
  return round(score);
}

function requestedDomainSignals(text = '') {
  const domains = new Set();
  if (/内饰|室内|家具|客厅|卧室|厨房|书房|interior|furnish|living|bedroom|kitchen|study/.test(text)) domains.add('interior');
  if (/房间|布局|户型|动线|room|layout|floor|plan/.test(text)) domains.add('room');
  if (/花园|庭院|地形|湖|水|山|悬崖|garden|terrain|water|lake|deck|site/.test(text)) domains.add('site');
  if (/体块|轮廓|别墅|城堡|塔|massing|silhouette|wing|tower/.test(text)) domains.add('massing');
  if (/立面|窗|玻璃|细节|facade|glass|window|detail/.test(text)) domains.add('facade');
  if (/屋顶|露台|檐|roof|terrace|eave/.test(text)) domains.add('roof');
  if (/庭院|中庭|空间|courtyard|patio|void/.test(text)) domains.add('space');
  return domains;
}

function compactSelectedLaw(law, score) {
  return {
    id: law.id,
    domain: law.domain,
    priority: law.priority,
    confidence: law.confidence,
    selection_score: score,
    rule: law.rule,
    implementation_clauses: law.implementation_clauses || [],
    source_cases: (law.source_cases || []).slice(0, 5).map((item) => item.title)
  };
}

function summarizeLawBook(laws, interiorLaws, cases) {
  const domainCounts = {};
  const priorityCounts = {};
  for (const law of laws) {
    domainCounts[law.domain] = (domainCounts[law.domain] || 0) + 1;
    priorityCounts[law.priority] = (priorityCounts[law.priority] || 0) + 1;
  }
  return {
    law_count: laws.length,
    interior_law_count: interiorLaws.length,
    case_count: cases.length,
    domain_counts: sortObject(domainCounts),
    priority_counts: sortObject(priorityCounts),
    high_confidence_laws: laws.filter((law) => law.confidence >= 80).length,
    retrieval_token_count: Object.keys(buildLawRetrievalIndex(laws).token_to_laws || {}).length,
    top_laws: laws.slice(0, 12).map((law) => ({
      id: law.id,
      domain: law.domain,
      priority: law.priority,
      confidence: law.confidence,
      source_count: law.source_count
    }))
  };
}

function buildLawRetrievalIndex(laws = []) {
  const tokenToLaws = {};
  const domainToLaws = {};
  for (const law of laws) {
    if (!domainToLaws[law.domain]) domainToLaws[law.domain] = [];
    domainToLaws[law.domain].push(law.id);
    for (const token of law.retrieval_tokens || []) {
      if (!tokenToLaws[token]) tokenToLaws[token] = [];
      tokenToLaws[token].push(law.id);
    }
  }
  return {
    source: 'stage7-design-law-retrieval-index-v1',
    token_count: Object.keys(tokenToLaws).length,
    law_count: laws.length,
    token_to_laws: sortIndex(tokenToLaws),
    domain_to_laws: sortIndex(domainToLaws)
  };
}

function buildPromptRulePacks(laws = []) {
  const packs = {
    modern_lake_villa: ['modern', 'lake', 'villa', 'waterfront', 'glass', 'roof-terrace', 'interior'],
    rich_residential_interior: ['interior', 'living', 'kitchen', 'bedroom', 'study', 'furnished'],
    terrain_garden_house: ['terrain', 'garden', 'foreground', 'site', 'rock'],
    vertical_landmark_building: ['tower', 'landmark', 'castle', 'temple', 'vertical']
  };
  return Object.fromEntries(Object.entries(packs).map(([packId, tokens]) => {
    const tokenSet = new Set(tokens);
    const selected = laws
      .map((law) => ({
        id: law.id,
        score: (law.retrieval_tokens || []).filter((token) => tokenSet.has(token)).length + (law.prompt_affinities || []).filter((token) => tokenSet.has(token)).length
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 16)
      .map((item) => item.id);
    return [packId, { tokens, law_ids: selected }];
  }));
}

function parseSemanticClause(clause = '') {
  const [prefixRaw, ...rest] = String(clause || '').split(':');
  if (!rest.length) return undefined;
  const prefix = prefixRaw.trim();
  const body = rest.join(':').trim();
  if (!body) return undefined;
  const key = `${prefix}:${body.split(/\s+/).slice(0, 8).join(' ')}`.toLowerCase();
  return { prefix, body, key, raw: clause };
}

function clauseLawFrom(parsed) {
  if (!['interior-pattern', 'interior-clause'].includes(parsed.prefix)) return undefined;
  const clauseId = parsed.body.split(':')[0].trim();
  return {
    id: `interior-clause-${slug(clauseId).slice(0, 48)}`,
    domain: 'interior',
    rule: `Preserve mined interior clause ${clauseId} when matching room function and style.`,
    clauses: [parsed.body],
    affinities: ['interior', clauseId],
    applies_to: ['interior', 'decorator'],
    confidence: 66
  };
}

function patternLawId(patternType = 'pattern') {
  return `interior-pattern-${slug(patternType)}`;
}

function defaultPatternLaw(patternType = 'pattern') {
  return {
    rule: `Use the mined ${patternType} furniture pattern as a room-scale composition anchor.`,
    clauses: [`apply ${patternType} only where the room function supports it`],
    affinities: ['interior', patternType]
  };
}

function featureConfidence(card = {}, base = 70) {
  const score = Number(card.overall_reference_score || 0);
  const study = card.study_priority === 'high' ? 8 : card.study_priority === 'medium' ? 4 : 0;
  return Math.min(95, base + study + Math.min(10, score / 12));
}

function hasRole(card = {}, role) {
  return (card.learning_roles || []).some((item) => item.role === role);
}

function normalizeRoomType(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/living_or_hall/g, 'living')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function lawSortScore(law) {
  return Number(law.confidence || 0) + Number(law.source_count || 0) * 3 + Number(law.evidence_count || 0);
}

function formatLawRow(law = {}) {
  return `- ${law.id}: ${law.domain}/${law.priority}, confidence=${law.confidence}, sources=${law.source_count}, rule=${law.rule}`;
}

function keywordTokens(text) {
  return [...new Set(String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5_#-]+/u)
    .filter((item) => item.length >= 2 && !STOP_WORDS.has(item))
    .slice(0, 240))];
}

function sortIndex(index = {}) {
  return Object.fromEntries(Object.entries(index)
    .map(([key, values]) => [key, [...new Set(values)].sort()])
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])));
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function formatObject(value = {}) {
  const entries = Object.entries(value || {});
  return entries.length ? entries.map(([key, count]) => `${key}=${count}`).join(', ') : 'none';
}

function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function slug(value) {
  return String(value || 'law')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'law';
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

const PATTERN_LAWS = {
  social_cluster: {
    rule: 'Social rooms need a furniture cluster that faces either a view, fireplace/focal wall, or conversation center.',
    clauses: ['anchor seats around a shared center', 'leave a clear path around the cluster', 'tie at least one seat direction to the main view or focal wall'],
    affinities: ['living', 'lounge', 'conversation']
  },
  circulation_spine: {
    rule: 'Long rooms and galleries should keep a clear circulation spine with detail on the side walls.',
    clauses: ['reserve an uninterrupted walkable axis', 'place displays, lamps, shelves, or plants along edges', 'avoid bulky furniture in the path'],
    affinities: ['corridor', 'gallery', 'entry']
  },
  layered_lighting: {
    rule: 'Interior atmosphere needs layered lighting: ambient, task/focal, and accent points.',
    clauses: ['combine ceiling/wall light with task light near anchors', 'repeat lights by room rhythm', 'avoid one isolated torch as the only light source'],
    affinities: ['light', 'interior', 'atmosphere']
  },
  storage_wall: {
    rule: 'Storage should form an organized wall or bay instead of scattered containers.',
    clauses: ['group chests/barrels/shelves into a wall band', 'leave an access lane', 'pair storage with task or display lighting'],
    affinities: ['storage', 'utility', 'kitchen']
  },
  display_wall: {
    rule: 'Display walls should act as focal surfaces for studies, halls, galleries, and ceremonial rooms.',
    clauses: ['cluster books, banners, paintings, shelves, or objects on one readable wall', 'keep the opposite circulation side clearer', 'light the display wall'],
    affinities: ['study', 'gallery', 'library', 'hall']
  },
  plant_corner: {
    rule: 'Plants work best as corners, view softeners, or threshold details rather than random clutter.',
    clauses: ['place plant clusters near windows, corners, or entries', 'use them to soften glass and hard edges', 'avoid blocking circulation'],
    affinities: ['plant', 'garden', 'window']
  },
  library_focus_wall: {
    rule: 'Studies and libraries need a focus wall of books/display plus a quiet work or reading anchor.',
    clauses: ['build one strong bookshelf/display wall', 'place desk or seating so it reads as a working/reading zone', 'add compact task lighting'],
    affinities: ['study', 'library', 'books']
  },
  kitchen_work_wall: {
    rule: 'Kitchens need a compact work wall or island sequence with prep, heat, storage, and light.',
    clauses: ['group furnace/crafting/counter/storage into one work band', 'keep the center or service path clear', 'add task lighting above the work band'],
    affinities: ['kitchen', 'work-wall', 'counter']
  },
  wet_wall: {
    rule: 'Bathrooms and wet zones should use compact fixture walls with semi-private access.',
    clauses: ['group basin/cauldron-like fixtures along one wall', 'keep the door approach clear', 'add small lighting and floor material contrast'],
    affinities: ['bathroom', 'wet', 'fixture']
  },
  workshop_bench_wall: {
    rule: 'Workshops need a robust bench wall with tools, storage, and task light.',
    clauses: ['anchor heavy work blocks against a wall', 'pair tool blocks with storage', 'preserve a clear working lane'],
    affinities: ['workshop', 'crafting', 'bench']
  },
  sleep_niche: {
    rule: 'Bedrooms read best when the bed is held in a niche/corner with paired bedside and soft light details.',
    clauses: ['anchor bed to a quiet wall or corner', 'add paired bedside/storage/light cues', 'keep bed away from exposed glass/view edges unless it is framed'],
    affinities: ['bedroom', 'bed', 'sleep']
  }
};

const ROOM_LAWS = {
  living: {
    rule: 'Living rooms should be public view rooms with a social cluster, focal wall, and clear arrival edge.',
    clauses: ['face seating toward the main view or focal wall', 'leave a clear path from entry to social core', 'add display, plant, and layered lighting details'],
    affinities: ['living', 'lounge', 'social']
  },
  kitchen: {
    rule: 'Kitchens should be functional service rooms with work wall, storage, prep surface, and task light.',
    clauses: ['group work blocks by wall or island', 'keep a short link to dining/living', 'separate service clutter from the best view wall'],
    affinities: ['kitchen', 'service', 'dining']
  },
  bedroom: {
    rule: 'Bedrooms should be quiet rooms anchored by a sleep niche and soft side details.',
    clauses: ['place bed on the quiet side', 'add bedside/storage/textile cues', 'avoid blocking the room path with bed placement'],
    affinities: ['bedroom', 'quiet', 'sleep']
  },
  study: {
    rule: 'Studies should pair a library/display wall with a desk or reading anchor and controlled light.',
    clauses: ['use one library/focus wall', 'place desk near a window or quiet wall', 'keep the center compact and uncluttered'],
    affinities: ['study', 'library', 'desk']
  },
  bathroom: {
    rule: 'Bathrooms should be compact wet zones with clear door access and a fixture wall.',
    clauses: ['group fixtures along one wall', 'use floor/wall material contrast', 'keep bathroom smaller than primary living rooms'],
    affinities: ['bathroom', 'wet', 'private']
  },
  storage: {
    rule: 'Storage rooms should read as organized utility bays with repeated modules and an access lane.',
    clauses: ['place containers/shelves in rows or wall bands', 'leave a straight access lane', 'add modest task lighting'],
    affinities: ['storage', 'utility']
  },
  corridor_or_gallery: {
    rule: 'Corridors and galleries are circulation first, with detail rhythm along edges.',
    clauses: ['protect the walking spine', 'use side-wall lamps, alcoves, display, or windows', 'do not use bulky furniture in the path'],
    affinities: ['corridor', 'gallery', 'circulation']
  },
  entry_or_lobby: {
    rule: 'Entries should be transition hubs that reveal the main room, stair, landmark, or view.',
    clauses: ['mark arrival with floor/lighting/threshold detail', 'connect entry to public room and vertical circulation', 'keep the first sightline open'],
    affinities: ['entry', 'lobby', 'arrival']
  },
  workshop: {
    rule: 'Workshops should group heavy task blocks, tools, storage, and task light along robust surfaces.',
    clauses: ['anchor workbench/anvil/furnace-like blocks to a wall', 'pair with storage', 'leave central working clearance'],
    affinities: ['workshop', 'crafting', 'utility']
  },
  chapel_or_ceremonial_hall: {
    rule: 'Ceremonial halls should use symmetry, axis, elevated focal blocks, banners/candles, and open center space.',
    clauses: ['keep a central axis clear', 'put ceremonial/detail blocks at the end or sides', 'use repeated lighting rhythm'],
    affinities: ['ceremonial', 'hall', 'chapel']
  },
  tower_room: {
    rule: 'Tower rooms must prioritize vertical access, lookout windows, compact storage, and small anchors.',
    clauses: ['keep stair/ladder access clear', 'place lookout windows or display at edges', 'avoid wide furniture layouts'],
    affinities: ['tower', 'lookout', 'vertical']
  }
};

const CLAUSE_LAWS = {
  'site:treat terrain as part of the architecture with rock/earth plinths, retaining edges, and stepped arrival': {
    id: 'site-terrain-plinth-sequence',
    domain: 'site',
    rule: 'Terrain must become part of the architecture through rock/earth plinths, retaining edges, planting pockets, and stepped arrival.',
    clauses: ['build layered rock/earth base', 'use retaining edges and stepped arrival'],
    affinities: ['terrain', 'rock', 'entry'],
    applies_to: ['site', 'foundation'],
    confidence: 74
  },
  'site:compose foreground garden rooms, path rhythm, planting pockets, and entry scenery before the facade': {
    id: 'site-foreground-garden-rooms',
    domain: 'site',
    rule: 'Foreground gardens should be composed as rooms and approach scenery, not scattered plants.',
    clauses: ['compose path, planting, rocks, water, and lights before facade'],
    affinities: ['garden', 'entry', 'foreground'],
    applies_to: ['site', 'approach'],
    confidence: 74
  },
  'site:connect public rooms to a water edge, reflection basin, deck, or waterfront threshold': {
    id: 'site-waterfront-public-threshold',
    domain: 'site',
    rule: 'Water-edge buildings need a public-room threshold: deck, reflection edge, view window, and planting transition must align.',
    clauses: ['align public room, glass, deck, and water edge'],
    affinities: ['water', 'lake', 'deck'],
    applies_to: ['site', 'public-room'],
    confidence: 78
  }
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'from',
  'this',
  'that',
  'template',
  'reference',
  'minecraft',
  'room',
  'rooms'
]);
