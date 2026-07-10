import { EMBEDDING_INDEX_SOURCE } from '../templates/templateEmbeddingIndex.js';
import {
  STAGE7_CONDITION_SOURCE,
  STAGE7_RESOLUTION,
  STAGE7_SCHEMA_VERSION,
  hashCanonicalValue,
  validateStage7Condition
} from './coarseSemanticVoxelSchema.js';

const REVIEWED_STATES = new Set(['approved', 'limited']);
const ABSTRACT_SITE_MOODS = new Set([
  'accessible-garden-path',
  'coastal-resort',
  'compact-urban-strip',
  'courtyard-garden',
  'dry-modern-court',
  'dry-zen',
  'forest-canopy',
  'forest-canopy-path',
  'formal',
  'formal-garden-axis',
  'hardscape-yard',
  'lush-greenhouse',
  'lush-side-garden',
  'oasis-courtyard',
  'open-family-yard',
  'ordered-entry-court',
  'reflecting-water-edge',
  'resort',
  'rocky-overlook',
  'simple-path',
  'snow-lodge',
  'snow-lodge-path',
  'sunken-courtyard',
  'terrain-forecourt',
  'urban-neon',
  'urban-neon-approach',
  'water-and-deck-transition',
  'water-courtyard',
  'waterfront-garden'
]);

export function buildStage7Condition({
  prompt = '',
  seed,
  architecture = {},
  buildSpec = {},
  topology = {},
  creativeDesign = {},
  conceptStudio = {},
  templateKnowledge = {}
} = {}) {
  const selectedConceptId = String(
    conceptStudio.selected_concept_id ||
    creativeDesign.concept_studio?.selected_concept_id ||
    ''
  );
  const selectedConcept = resolveSelectedConcept(conceptStudio, selectedConceptId);
  const payload = {
    source: STAGE7_CONDITION_SOURCE,
    schema_version: STAGE7_SCHEMA_VERSION,
    prompt: String(prompt || '').trim(),
    seed: integer(seed, 0),
    dimensions: {
      width: integer(buildSpec.width, 1),
      depth: integer(buildSpec.depth, 1),
      floors: integer(buildSpec.floors, 1),
      floor_height: integer(buildSpec.floor_height, 1),
      total_height: integer(buildSpec.total_height, 1),
      lot_width: integer(buildSpec.lot?.width, buildSpec.width || 1),
      lot_depth: integer(buildSpec.lot?.depth, buildSpec.depth || 1)
    },
    design: {
      style_family: String(architecture.style_family || architecture.style || 'general'),
      typology: String(architecture.typology || buildSpec.typology || 'house'),
      footprint: String(architecture.footprint || buildSpec.footprint || 'rectangle'),
      front_side: String(buildSpec.door_side || architecture.facade_rules?.front_side || 'south'),
      abstract_site_tags: abstractSiteTags({ prompt, architecture, creativeDesign, selectedConcept }),
      selected_concept_id: selectedConceptId,
      massing_strategy: massingStrategy({ architecture, creativeDesign, selectedConcept }),
      space_strategy: spaceStrategy({ topology, creativeDesign, selectedConcept }),
      quality_targets: stringArray(selectedConcept.quality_targets),
      massing_volumes: normalizeMassingVolumes(architecture.volumes),
      topology_program: normalizeTopologyProgram(topology)
    },
    references: reviewedReferences(templateKnowledge.retrieval_explanation || {}),
    constraints: {
      resolution: [...STAGE7_RESOLUTION],
      max_total_height: integer(buildSpec.constraints?.max_total_height, 40),
      minecraft_fill_limit: integer(buildSpec.constraints?.minecraft_fill_limit, 32768)
    }
  };
  const condition = { ...payload, condition_hash: hashCanonicalValue(payload) };
  const validation = validateStage7Condition(condition);
  if (!validation.ok) throw new Error(`invalid Stage 7 condition: ${validation.errors.join('; ')}`);
  return condition;
}

function reviewedReferences(explanation = {}) {
  const neural = explanation.source === 'stage5-neural-template-retriever-v1';
  return (explanation.references || [])
    .map((reference) => normalizeReference(reference, neural, explanation.embedding_index_hash))
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.case_id.localeCompare(right.case_id))
    .slice(0, 8);
}

function normalizeReference(reference = {}, neural = false, embeddingIndexHash) {
  const reviewState = String(reference.review_state || 'pending');
  if (!REVIEWED_STATES.has(reviewState)) return undefined;
  const approved = canonicalStringSet(reference.approved_learning_areas);
  const blocked = new Set(stringArray(reference.blocked_learning_areas));
  const teaches = Array.isArray(reference.teaches) ? reference.teaches : [];
  const usedFor = [...new Set(teaches
    .map((item) => String(item?.area || '').trim())
    .filter(Boolean)
    .filter((area) => !blocked.has(area))
    .filter((area) => reviewState === 'approved' || approved.includes(area))
  )].sort();
  if (!usedFor.length) return undefined;
  const hints = teaches
    .filter((item) => usedFor.includes(String(item?.area || '').trim()))
    .map((item) => ({
      area: String(item.area),
      claim: String(item.claim || ''),
      confidence: Math.max(0, Math.min(1, finite(item.confidence, 0)))
    }))
    .filter((item) => item.claim)
    .sort((left, right) => left.area.localeCompare(right.area) || left.claim.localeCompare(right.claim));
  return {
    case_id: String(reference.case_id || ''),
    title: String(reference.title || reference.case_id || ''),
    rank: integer(reference.rank, 999),
    match_score: integer(reference.match_score, 0),
    review_state: reviewState,
    review_confidence: Math.max(0, Math.min(1, finite(reference.review_confidence, 0))),
    approved_learning_areas: approved,
    blocked_learning_areas: [...blocked].sort(),
    used_for: usedFor,
    hints,
    risk_controls: stringArray(reference.risk_controls),
    embedding_index_source: neural && Number(reference.embedding_score) > 0 ? EMBEDDING_INDEX_SOURCE : undefined,
    embedding_index_hash: neural && Number(reference.embedding_score) > 0 ? String(embeddingIndexHash || '') : undefined,
    embedding_record_id: neural && Number(reference.embedding_score) > 0 ? String(reference.case_id || '') : undefined,
    embedding_record_hash: neural && Number(reference.embedding_score) > 0 ? String(reference.embedding_record_hash || '') : undefined
  };
}

function abstractSiteTags({ prompt = '', architecture = {}, creativeDesign = {}, selectedConcept = {} } = {}) {
  const tags = [];
  const site = {
    ...(architecture.site_rules || {}),
    ...(creativeDesign.site || {}),
    ...(selectedConcept.site_strategy || {})
  };
  const footprint = String(architecture.footprint || '');
  if (site.water_feature || /湖|水边|滨水|water|lake/i.test(prompt)) tags.push('water-edge');
  if (site.enclosed_courtyard || footprint === 'courtyard' || /庭院|courtyard/i.test(prompt)) tags.push('courtyard');
  if (site.dry_garden) tags.push('dry-garden');
  if (site.patio) tags.push('patio');
  if (site.planting_beds || /花园|garden|forest|森林/i.test(prompt)) tags.push('vegetation');
  if (/坡|山地|山坡|slope|hillside/i.test(prompt)) tags.push('slope-intent');
  const mood = token(site.mood || site.landscape_mood);
  if (ABSTRACT_SITE_MOODS.has(mood)) tags.push(`mood:${mood}`);
  return [...new Set(tags)].sort();
}

function resolveSelectedConcept(conceptStudio = {}, selectedConceptId = '') {
  const concepts = Array.isArray(conceptStudio.concepts) ? conceptStudio.concepts : [];
  const matchingConcept = concepts.find((item) => String(item?.id || '') === selectedConceptId);
  if (matchingConcept) return matchingConcept;
  const selectedConcept = conceptStudio.selectedConcept;
  if (!selectedConcept || typeof selectedConcept !== 'object' || Array.isArray(selectedConcept)) return {};
  return String(selectedConcept.id || '') === selectedConceptId ? selectedConcept : {};
}

function massingStrategy({ architecture = {}, creativeDesign = {}, selectedConcept = {} } = {}) {
  return uniqueStrings([
    architecture.massing_rules?.creative_variant,
    creativeDesign.design_axes?.massing_variant,
    selectedConcept.massing_plan?.variant_hint,
    ...stringArray(selectedConcept.massing_plan?.key_moves)
  ]);
}

function spaceStrategy({ topology = {}, creativeDesign = {}, selectedConcept = {} } = {}) {
  return uniqueStrings([
    topology.bsp_hints?.split_strategy,
    creativeDesign.design_axes?.split_strategy,
    creativeDesign.topology?.public_core_position,
    selectedConcept.space_graph_strategy?.public_core,
    selectedConcept.space_graph_strategy?.split_strategy
  ]);
}

function normalizeMassingVolumes(volumes) {
  return (Array.isArray(volumes) ? volumes : []).slice(0, 16).map((item, index) => ({
    id: String(item?.id || `volume-${index + 1}`),
    role: String(item?.role || ''),
    shape: String(item?.shape || 'box'),
    scale: (Array.isArray(item?.scale) ? item.scale : [1, 1, 1]).slice(0, 3).map((value) => finite(value, 1)),
    placement: {
      relation: String(item?.placement?.relation || 'center'),
      attach_to: item?.placement?.attach_to ? String(item.placement.attach_to) : undefined
    },
    boolean_mode: String(item?.boolean_mode || 'union'),
    tags: stringArray(item?.tags).sort()
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeTopologyProgram(topology) {
  return {
    nodes: (topology.nodes || []).map((item) => ({
      id: String(item?.id || ''),
      type: String(item?.type || 'room'),
      floor: integer(item?.floor, 0),
      weight: finite(item?.weight, 1),
      privacy: String(item?.privacy || ''),
      zone: String(item?.zone || item?.privacy || 'public')
    })).filter((item) => item.id).sort((left, right) => left.id.localeCompare(right.id)),
    edges: (topology.edges || []).map((item) => ({ from: String(item?.from || ''), to: String(item?.to || ''), relation: String(item?.relation || 'connected') }))
      .filter((item) => item.from && item.to)
      .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.relation.localeCompare(right.relation)),
    zoning: Object.fromEntries(Object.entries(topology.zoning || {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, ids]) => [key, stringArray(ids).sort()]))
  };
}

function uniqueStrings(values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value || '').trim()).filter(Boolean))];
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function canonicalStringSet(value) {
  return [...new Set(stringArray(value))].sort();
}

function token(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-|-$/g, '');
}

function integer(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : Math.trunc(fallback);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
