# Stage 3 Concept Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 3 Concept Studio so one prompt can generate, compare, select or fuse explainable concepts before the existing Minecraft construction workflow builds the chosen design.

**Architecture:** Add a semantic concept layer between template knowledge and `CreativeDesignAgent`. New local agents produce concept cards, score them deterministically, optionally fuse compatible strengths, and pass a selected concept patch into the existing creative design and construction pipeline. Default runs keep the current single-build behavior when Concept Studio is not enabled.

**Tech Stack:** Node.js ESM, built-in `node:test`, JavaScript deterministic mock agents, existing `construction_method_v1` workflow, Minecraft Java 1.21 datapack export.

## Global Constraints

- Target game version remains Minecraft Java 1.21 / 1.21.1.
- Datapack `pack_format` remains `48`.
- Normal generation remains Node.js ESM and does not require Python.
- LLM output remains semantic JSON only and must not include exact block coordinates.
- Mock mode must be deterministic and runnable without API keys.
- Omitted `--concepts` flags must preserve current behavior.
- `--concepts <n>` clamps to `2-5`.
- `--concept-strategy` supports only `select` and `fuse`.
- Concept Studio builds only the selected or fused concept in the MVP.
- Existing candidate selection remains authoritative when `--concepts` and `--candidates` are combined.
- Generated `out/` artifacts remain uncommitted.

---

## File Structure

- Create `src/construction/agents/conceptStudioAgent.js`: owns concept-card generation, normalization, prompt/reference matching helpers, and deterministic mock archetypes.
- Create `src/construction/agents/conceptSelectionAgent.js`: owns local concept scoring, ranking, and selection reasons.
- Create `src/construction/agents/conceptFusionAgent.js`: owns conservative top-concept fusion and conflict recording.
- Modify `src/construction/agents/creativeDesignAgent.js`: accepts selected concept context, applies concept patches to seeded and LLM designs, and records concept metadata on the creative design.
- Modify `src/construction/workflow.js`: runs Concept Studio between planning and creative design, stores it in the blueprint, writes concept artifacts, and renders the run-report section.
- Modify `src/pipeline.js`: accepts `concepts` and `conceptStrategy`, passes them into single and candidate workflow runs.
- Modify `src/index.js`: parses CLI flags, updates help text, and prints concept artifact paths when present.
- Create `test/conceptStudioAgent.test.js`: unit coverage for deterministic concepts, schema, references, and coordinate safety.
- Create `test/conceptSelectionAgent.test.js`: unit coverage for scoring, risk penalty, and selected reason.
- Create `test/conceptFusionAgent.test.js`: unit coverage for compatible fusion and conflicting-field rejection.
- Create `test/conceptCreativeDesign.test.js`: unit coverage for applying selected concept patches to `CreativeDesignAgent`.
- Create `test/conceptPipeline.test.js`: integration coverage for artifacts, blueprint metadata, report section, and default-off behavior.

---

### Task 1: ConceptStudioAgent Deterministic Concept Cards

**Files:**
- Create: `src/construction/agents/conceptStudioAgent.js`
- Create: `test/conceptStudioAgent.test.js`

**Interfaces:**
- Consumes:
  - `prompt: string`
  - `architecture: object`
  - `buildSpec: object`
  - `topology: object`
  - `templateKnowledge: object`
  - `options: { count?: number, strategy?: "select" | "fuse", seed?: number }`
- Produces:
  - `new ConceptStudioAgent({ mode, llmClient }).run(prompt, architecture, buildSpec, topology, templateKnowledge, options): Promise<ConceptStudioResult>`
  - `normalizeConceptStudioResult(raw, fallback): ConceptStudioResult`
  - `normalizeConceptCard(raw, index): ConceptCard`
  - `ConceptStudioResult` shape:

```js
{
  source: 'local-concept-studio-agent',
  version: 1,
  active: true,
  prompt: '',
  strategy: 'select',
  concept_count: 3,
  selected_concept_id: undefined,
  fused_concept_id: undefined,
  concepts: [],
  warnings: []
}
```

- Later tasks rely on every concept having `id`, `title`, `archetype`, `summary`, `reference_strategy`, `risks`, and `creative_design_patch`.

- [ ] **Step 1: Write the failing unit test for deterministic concepts**

Create `test/conceptStudioAgent.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConceptStudioAgent } from '../src/construction/agents/conceptStudioAgent.js';

test('ConceptStudioAgent creates deterministic prompt-matched concept cards', async () => {
  const prompt = '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰';
  const architecture = {
    style: '现代',
    style_family: 'modern',
    typology: 'house',
    generation_hints: {}
  };
  const buildSpec = {
    seed: 7101,
    floors: 2,
    roof_style: 'flat',
    facade: { large_glass: true },
    site: { water_feature: true }
  };
  const topology = {
    nodes: [
      { id: 'living', type: 'living', floor: 0 },
      { id: 'kitchen', type: 'kitchen', floor: 0 },
      { id: 'study', type: 'study', floor: 1 }
    ],
    edges: []
  };
  const templateKnowledge = templateKnowledgeFixture();

  const first = await new ConceptStudioAgent({ mode: 'mock' }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count: 3, strategy: 'select', seed: 7101 }
  );
  const second = await new ConceptStudioAgent({ mode: 'mock' }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count: 3, strategy: 'select', seed: 7101 }
  );

  assert.deepEqual(first, second);
  assert.equal(first.source, 'local-concept-studio-agent');
  assert.equal(first.active, true);
  assert.equal(first.version, 1);
  assert.equal(first.strategy, 'select');
  assert.equal(first.concept_count, 3);
  assert.equal(first.concepts.length, 3);
  assert.equal(new Set(first.concepts.map((item) => item.id)).size, 3);
  assert.ok(first.concepts.some((item) => item.archetype === 'view-courtyard'));
  assert.ok(first.concepts[0].reference_strategy.length >= 1);
  assert.ok(first.concepts[0].creative_design_patch.facade);
  assert.equal(JSON.stringify(first).includes('"x"'), false);
  assert.equal(JSON.stringify(first).includes('"y"'), false);
  assert.equal(JSON.stringify(first).includes('"z"'), false);
});

test('ConceptStudioAgent clamps concept count and preserves inactive result below two concepts', async () => {
  const active = await new ConceptStudioAgent({ mode: 'mock' }).run(
    '建一个欧式宅邸',
    { style_family: 'classical', typology: 'house' },
    { seed: 12, floors: 2 },
    { nodes: [] },
    {},
    { count: 9, strategy: 'select', seed: 12 }
  );
  const inactive = await new ConceptStudioAgent({ mode: 'mock' }).run(
    '建一个欧式宅邸',
    { style_family: 'classical', typology: 'house' },
    { seed: 12, floors: 2 },
    { nodes: [] },
    {},
    { count: 1, strategy: 'select', seed: 12 }
  );

  assert.equal(active.concept_count, 5);
  assert.equal(active.concepts.length, 5);
  assert.equal(inactive.active, false);
  assert.equal(inactive.concept_count, 0);
  assert.match(inactive.warnings.join(' '), /at least two concepts/);
});

function templateKnowledgeFixture() {
  return {
    active: true,
    retrieval_explanation: {
      active: true,
      references: [
        {
          rank: 1,
          case_id: 'house-modern-waterfront',
          title: 'Modern Waterfront House',
          diversity_slot: 'modern-house-water-glass',
          matched_signals: ['token:modern', 'token:water-edge', 'token:large-glass'],
          teaches: [
            { area: 'facade', claim: 'Large glass should serve view-facing rooms.', confidence: 0.9 },
            { area: 'site', claim: 'Use deck edges as transition between house and water.', confidence: 0.84 }
          ],
          risk_controls: ['change exact dimensions and detail placement'],
          integration_targets: ['FacadeAgent', 'SiteLandscapeAgent']
        },
        {
          rank: 2,
          case_id: 'house-interior-gallery',
          title: 'Interior Gallery House',
          diversity_slot: 'interior-furnished',
          matched_signals: ['token:interior'],
          teaches: [
            { area: 'interior', claim: 'Use focal wall details and display shelves for inhabited rooms.', confidence: 0.82 }
          ],
          risk_controls: ['do not copy room order'],
          integration_targets: ['InteriorDetailAgent', 'DecoratorAgent']
        }
      ],
      warnings: []
    }
  };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/conceptStudioAgent.test.js
```

Expected: FAIL with `Cannot find module` for `conceptStudioAgent.js`.

- [ ] **Step 3: Implement ConceptStudioAgent**

Create `src/construction/agents/conceptStudioAgent.js` with this structure:

```js
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
  const count = clampInt(options.count ?? options.concepts, MIN_CONCEPTS, MAX_CONCEPTS, 0);
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
  const concepts = Array.isArray(value.concepts) ? value.concepts.map(normalizeConceptCard).filter((item) => item.id) : fallback.concepts || [];
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
  return Array.isArray(value) ? value.map((item) => ({
    case_id: String(item.case_id || ''),
    title: String(item.title || item.case_id || 'reference'),
    used_for: normalizeStringArray(item.used_for || item.usedFor),
    teaches: normalizeStringArray(item.teaches),
    risk_control: String(item.risk_control || item.riskControl || 'change exact dimensions and detail placement')
  })).filter((item) => item.case_id || item.title) : [];
}

function normalizeRisks(value = []) {
  return Array.isArray(value) ? value.map((item, index) => ({
    id: normalizeId(item.id || `risk-${index + 1}`),
    severity: ['low', 'medium', 'high'].includes(String(item.severity)) ? String(item.severity) : 'low',
    text: String(item.text || item.id || `risk-${index + 1}`),
    mitigation: String(item.mitigation || 'prefer the safer local generator default for this field')
  })) : [];
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

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
node --test test/conceptStudioAgent.test.js
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/construction/agents/conceptStudioAgent.js test/conceptStudioAgent.test.js
git commit -m "feat: add concept studio agent"
```

Expected: commit succeeds.

---

### Task 2: Concept Selection And Fusion Agents

**Files:**
- Create: `src/construction/agents/conceptSelectionAgent.js`
- Create: `src/construction/agents/conceptFusionAgent.js`
- Create: `test/conceptSelectionAgent.test.js`
- Create: `test/conceptFusionAgent.test.js`

**Interfaces:**
- Consumes:
  - `ConceptSelectionAgent.run(concepts, { prompt, architecture, buildSpec, templateKnowledge }): ConceptSelection`
  - `ConceptFusionAgent.run(concepts, selection, { prompt }): ConceptFusionResult`
- Produces:
  - `selection.selected_concept_id`
  - `selection.ranking`
  - `fusion.concept`
  - `fusion.adopted_elements`
  - `fusion.rejected_conflicts`
- Later workflow task consumes `selection.selected_concept_id` and either the selected concept or `fusion.concept`.

- [ ] **Step 1: Write the failing selection test**

Create `test/conceptSelectionAgent.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConceptSelectionAgent } from '../src/construction/agents/conceptSelectionAgent.js';

test('ConceptSelectionAgent chooses the strongest prompt-matching concept', () => {
  const concepts = [
    concept('concept-a-view-courtyard', 'view-courtyard', {
      summary: '湖边玻璃平台和水景庭院',
      quality_targets: ['view-facing public rooms', 'controlled large glazing'],
      reference_strategy: [{ case_id: 'modern-water', used_for: ['site', 'facade'], teaches: ['water deck'] }],
      risks: [{ id: 'over-glazing', severity: 'low', mitigation: 'thick surrounds' }]
    }),
    concept('concept-b-formal-axis', 'formal-axis', {
      summary: '正式入口轴线和对称翼楼',
      quality_targets: ['clear entry sequence'],
      reference_strategy: [],
      risks: [{ id: 'too-formal', severity: 'medium', mitigation: 'soften axis' }]
    })
  ];

  const selection = new ConceptSelectionAgent().run(concepts, {
    prompt: '建一个湖边现代别墅，带大玻璃和水边平台',
    architecture: { style_family: 'modern', typology: 'house' },
    buildSpec: { facade: { large_glass: true }, site: { water_feature: true } }
  });

  assert.equal(selection.source, 'local-concept-selection-agent');
  assert.equal(selection.version, 1);
  assert.equal(selection.selected_concept_id, 'concept-a-view-courtyard');
  assert.equal(selection.ranking[0].concept_id, 'concept-a-view-courtyard');
  assert.ok(selection.ranking[0].selection_score > selection.ranking[1].selection_score);
  assert.match(selection.reason, /concept-a-view-courtyard/);
  assert.equal(selection.warnings.length, 0);
});

test('ConceptSelectionAgent penalizes high risk and missing patch support', () => {
  const selection = new ConceptSelectionAgent().run([
    concept('safe', 'compact-patio', {
      summary: '紧凑露台住宅',
      quality_targets: ['buildable semantic patch'],
      reference_strategy: [{ case_id: 'compact', used_for: ['massing'], teaches: ['patio'] }],
      risks: [],
      creative_design_patch: { facade: {}, roof: {}, site: {}, interior: {}, topology: {} }
    }),
    concept('risky', 'vertical-landmark', {
      summary: '巨大塔楼',
      quality_targets: ['iconic silhouette'],
      reference_strategy: [{ case_id: 'tower', used_for: ['massing'], teaches: ['tower'] }],
      risks: [{ id: 'tower-overdominance', severity: 'high', mitigation: 'narrow tower' }],
      creative_design_patch: {}
    })
  ], {
    prompt: '建一个紧凑住宅',
    architecture: { typology: 'house' },
    buildSpec: {}
  });

  assert.equal(selection.selected_concept_id, 'safe');
  assert.ok(selection.ranking.find((item) => item.concept_id === 'risky').risk_penalty >= 20);
});

function concept(id, archetype, patch = {}) {
  return {
    id,
    title: id,
    archetype,
    summary: patch.summary || id,
    design_intent: [patch.summary || id],
    reference_strategy: patch.reference_strategy || [],
    quality_targets: patch.quality_targets || [],
    risks: patch.risks || [],
    creative_design_patch: patch.creative_design_patch || {
      massing_variant: archetype === 'view-courtyard' ? 'waterfront-stepped-estate' : 'formal-axis-manor',
      facade: { glazing_ratio: archetype === 'view-courtyard' ? 'high' : 'medium' },
      roof: { style: archetype === 'view-courtyard' ? 'flat' : 'gabled' },
      site: { water_feature: archetype === 'view-courtyard' },
      interior: {},
      topology: {}
    }
  };
}
```

- [ ] **Step 2: Write the failing fusion test**

Create `test/conceptFusionAgent.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConceptFusionAgent } from '../src/construction/agents/conceptFusionAgent.js';

test('ConceptFusionAgent conservatively adopts compatible strengths', () => {
  const base = concept('concept-a-view-courtyard', {
    facade: { glazing_ratio: 'high', window_rhythm: 'corner-window-bands' },
    roof: { style: 'flat', profile: 'thin-parapet-terrace', roof_terrace: true },
    site: { mood: 'reflecting-water-edge', water_feature: true },
    interior: { decor_density: 'layered' },
    topology: { public_core: 'living', split_strategy: 'open-plan-weighted' }
  });
  const donor = concept('concept-b-compact-patio', {
    facade: { entry_detail_style: 'solid-framed-door' },
    roof: { style: 'flat', profile: 'stepped-flat-with-light-slot' },
    site: { patio: true, outdoor_seating: true },
    interior: { display_strategy: 'corner-display-cases' },
    topology: { public_core: 'dining', split_strategy: 'view-side-cluster' }
  });
  const fusion = new ConceptFusionAgent().run([base, donor], {
    selected_concept_id: base.id,
    ranking: [
      { concept_id: base.id, rank: 1 },
      { concept_id: donor.id, rank: 2 }
    ]
  });

  assert.equal(fusion.source, 'local-concept-fusion-agent');
  assert.equal(fusion.active, true);
  assert.equal(fusion.concept.id, 'concept-fused-concept-a-view-courtyard');
  assert.deepEqual(fusion.concept.source_concept_ids, [base.id, donor.id]);
  assert.equal(fusion.concept.creative_design_patch.site.outdoor_seating, true);
  assert.equal(fusion.concept.creative_design_patch.interior.display_strategy, 'corner-display-cases');
  assert.ok(fusion.rejected_conflicts.some((item) => item.field === 'roof.profile'));
  assert.ok(fusion.rejected_conflicts.some((item) => item.field === 'topology.public_core'));
});

test('ConceptFusionAgent falls back inactive with fewer than two ranked concepts', () => {
  const base = concept('concept-a-view-courtyard', { roof: { style: 'flat' } });
  const fusion = new ConceptFusionAgent().run([base], {
    selected_concept_id: base.id,
    ranking: [{ concept_id: base.id, rank: 1 }]
  });

  assert.equal(fusion.active, false);
  assert.equal(fusion.concept, undefined);
  assert.match(fusion.reason, /requires at least two/);
});

function concept(id, creative_design_patch) {
  return {
    id,
    title: id,
    archetype: id.replace(/^concept-[a-z]-/, ''),
    summary: id,
    design_intent: [id],
    reference_strategy: [],
    quality_targets: [],
    risks: [],
    creative_design_patch
  };
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
node --test test/conceptSelectionAgent.test.js test/conceptFusionAgent.test.js
```

Expected: FAIL with missing module errors for both new agents.

- [ ] **Step 4: Implement ConceptSelectionAgent**

Create `src/construction/agents/conceptSelectionAgent.js`:

```js
const SELECTION_VERSION = 1;

export class ConceptSelectionAgent {
  run(concepts = [], options = {}) {
    const rows = (Array.isArray(concepts) ? concepts : []).map((concept) => scoreConcept(concept, options));
    const ranked = rows.slice().sort(compareRows).map((row, index) => ({ ...row, rank: index + 1 }));
    const selected = ranked[0];
    return {
      source: 'local-concept-selection-agent',
      version: SELECTION_VERSION,
      active: rows.length > 0,
      strategy: 'highest-local-score',
      selected_concept_id: selected?.concept_id,
      selected_archetype: selected?.archetype,
      selected_selection_score: selected?.selection_score || 0,
      reason: selected ? selectionReason(selected, ranked) : 'no concepts available',
      ranking: ranked,
      warnings: rows.length ? [] : ['no concepts available for selection']
    };
  }
}

function scoreConcept(concept = {}, options = {}) {
  const prompt = String(options.prompt || '').toLowerCase();
  const text = `${concept.title || ''} ${concept.archetype || ''} ${concept.summary || ''} ${(concept.design_intent || []).join(' ')} ${(concept.quality_targets || []).join(' ')}`.toLowerCase();
  const promptTokens = tokenSet(prompt);
  const promptHits = [...promptTokens].filter((token) => text.includes(token)).length;
  const prompt_match_score = Math.min(34, promptHits * 6 + archetypePromptBonus(concept, prompt, options));
  const reference_evidence_score = Math.min(24, (concept.reference_strategy || []).length * 6 + referenceAreaCount(concept) * 3);
  const buildability_prior_score = buildabilityScore(concept);
  const diversity_role_score = diversityRoleScore(concept);
  const quality_target_score = Math.min(18, (concept.quality_targets || []).length * 4);
  const risk_penalty = riskPenalty(concept);
  const selection_score = round(prompt_match_score + reference_evidence_score + buildability_prior_score + diversity_role_score + quality_target_score - risk_penalty);
  return {
    concept_id: concept.id,
    title: concept.title,
    archetype: concept.archetype,
    selection_score,
    prompt_match_score: round(prompt_match_score),
    reference_evidence_score: round(reference_evidence_score),
    buildability_prior_score: round(buildability_prior_score),
    diversity_role_score: round(diversity_role_score),
    quality_target_score: round(quality_target_score),
    risk_penalty: round(risk_penalty),
    risk_ids: (concept.risks || []).map((risk) => risk.id),
    reference_count: (concept.reference_strategy || []).length
  };
}

function tokenSet(prompt) {
  const tokens = new Set(String(prompt || '').split(/[^a-z0-9\u4e00-\u9fa5]+/u).filter((item) => item.length >= 2));
  const hints = [
    ['湖', 'water'],
    ['水', 'water'],
    ['玻璃', 'glass'],
    ['平台', 'deck'],
    ['露台', 'terrace'],
    ['内饰', 'interior'],
    ['庭院', 'courtyard'],
    ['塔', 'tower'],
    ['庄园', 'manor'],
    ['紧凑', 'compact']
  ];
  for (const [hint, token] of hints) {
    if (prompt.includes(hint)) tokens.add(token);
  }
  return tokens;
}

function archetypePromptBonus(concept, prompt, options) {
  const archetype = String(concept.archetype || '');
  let score = 0;
  if (archetype === 'view-courtyard' && /湖|水|water|glass|玻璃|平台/.test(prompt)) score += 16;
  if (archetype === 'formal-axis' && /庄园|城堡|对称|axis|formal|manor/.test(prompt)) score += 14;
  if (archetype === 'compact-patio' && /紧凑|小|compact|patio|露台/.test(prompt)) score += 14;
  if (archetype === 'vertical-landmark' && /塔|地标|tower|lookout/.test(prompt)) score += 16;
  if (archetype === 'dual-wing-estate' && /大|家庭|多房间|villa|estate/.test(prompt)) score += 12;
  if (archetype === 'formal-axis' && /湖|水|现代|modern/.test(prompt) && !/庄园|城堡/.test(prompt)) score -= 8;
  if (options.buildSpec?.facade?.large_glass && archetype === 'view-courtyard') score += 4;
  if (options.buildSpec?.site?.water_feature && archetype === 'view-courtyard') score += 4;
  return score;
}

function referenceAreaCount(concept) {
  const areas = new Set((concept.reference_strategy || []).flatMap((item) => item.used_for || []));
  return areas.size;
}

function buildabilityScore(concept = {}) {
  const patch = concept.creative_design_patch || {};
  const sections = ['facade', 'roof', 'site', 'interior', 'topology'].filter((key) => patch[key] && typeof patch[key] === 'object');
  return Math.min(18, sections.length * 3 + (patch.massing_variant ? 3 : 0));
}

function diversityRoleScore(concept = {}) {
  const archetype = String(concept.archetype || '');
  return ['view-courtyard', 'formal-axis', 'compact-patio', 'vertical-landmark', 'dual-wing-estate'].includes(archetype) ? 6 : 2;
}

function riskPenalty(concept = {}) {
  return (concept.risks || []).reduce((sum, risk) => {
    if (risk.severity === 'high') return sum + 24;
    if (risk.severity === 'medium') return sum + 10;
    return sum + 3;
  }, 0);
}

function compareRows(a, b) {
  return Number(b.selection_score || 0) - Number(a.selection_score || 0) ||
    Number(b.reference_count || 0) - Number(a.reference_count || 0) ||
    String(a.concept_id || '').localeCompare(String(b.concept_id || ''));
}

function selectionReason(selected, ranked) {
  const next = ranked.find((item) => item.concept_id !== selected.concept_id);
  if (!next) return `选择 ${selected.concept_id}，它是唯一概念，择优分 ${selected.selection_score}。`;
  return `选择 ${selected.concept_id}，择优分 ${selected.selection_score}，优于下一概念 ${next.concept_id} 的 ${next.selection_score}；主要优势是 prompt 匹配 ${selected.prompt_match_score}、参考证据 ${selected.reference_evidence_score}、可建造先验 ${selected.buildability_prior_score}。`;
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
```

- [ ] **Step 5: Implement ConceptFusionAgent**

Create `src/construction/agents/conceptFusionAgent.js`:

```js
const FUSION_VERSION = 1;
const COMPATIBLE_ADOPTIONS = [
  ['site.outdoor_seating', 'outdoor seating'],
  ['site.patio', 'patio'],
  ['site.planting_beds', 'planting beds'],
  ['interior.display_strategy', 'interior display strategy'],
  ['interior.decor_density', 'interior density'],
  ['facade.entry_detail_style', 'entry detail']
];
const CONFLICT_FIELDS = [
  'massing_variant',
  'roof.style',
  'roof.profile',
  'topology.public_core',
  'topology.split_strategy'
];

export class ConceptFusionAgent {
  run(concepts = [], selection = {}, options = {}) {
    const rankedIds = (selection.ranking || []).sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0)).map((item) => item.concept_id);
    if (rankedIds.length < 2) {
      return {
        source: 'local-concept-fusion-agent',
        version: FUSION_VERSION,
        active: false,
        reason: 'fusion requires at least two ranked concepts'
      };
    }
    const base = concepts.find((item) => item.id === (selection.selected_concept_id || rankedIds[0]));
    const donor = concepts.find((item) => item.id === rankedIds.find((id) => id !== base?.id));
    if (!base || !donor) {
      return {
        source: 'local-concept-fusion-agent',
        version: FUSION_VERSION,
        active: false,
        reason: 'fusion could not resolve base and donor concepts'
      };
    }
    const basePatch = clone(base.creative_design_patch || {});
    const donorPatch = donor.creative_design_patch || {};
    const adopted_elements = [];
    const rejected_conflicts = [];
    for (const field of CONFLICT_FIELDS) {
      const baseValue = getPath(basePatch, field);
      const donorValue = getPath(donorPatch, field);
      if (donorValue !== undefined && baseValue !== undefined && String(baseValue) !== String(donorValue)) {
        rejected_conflicts.push({ field, base: baseValue, donor: donorValue, reason: 'conflicting core concept directive' });
      }
    }
    for (const [field, label] of COMPATIBLE_ADOPTIONS) {
      if (adopted_elements.length >= 2) break;
      const baseValue = getPath(basePatch, field);
      const donorValue = getPath(donorPatch, field);
      if (donorValue === undefined || baseValue !== undefined) continue;
      setPath(basePatch, field, donorValue);
      adopted_elements.push({ field, label, value: donorValue, from: donor.id });
    }
    const concept = {
      ...base,
      id: `concept-fused-${base.id}`,
      title: `${base.title} + 局部融合`,
      archetype: `${base.archetype}-fused`,
      summary: `${base.summary} 融合 ${donor.title} 的兼容细节。`,
      source_concept_ids: [base.id, donor.id],
      adopted_elements,
      rejected_conflicts,
      creative_design_patch: basePatch,
      quality_targets: [...new Set([...(base.quality_targets || []), ...(donor.quality_targets || []).slice(0, 2)])],
      risks: [...(base.risks || []), ...(donor.risks || []).slice(0, 1)]
    };
    return {
      source: 'local-concept-fusion-agent',
      version: FUSION_VERSION,
      active: true,
      strategy: 'top-concept-with-compatible-adoptions',
      base_concept_id: base.id,
      donor_concept_id: donor.id,
      concept,
      adopted_elements,
      rejected_conflicts,
      warnings: adopted_elements.length ? [] : ['no compatible donor fields were adopted']
    };
  }
}

function getPath(object, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], object);
}

function setPath(object, path, value) {
  const keys = String(path).split('.');
  let current = object;
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
node --test test/conceptSelectionAgent.test.js test/conceptFusionAgent.test.js
```

Expected: PASS with 4 tests.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/construction/agents/conceptSelectionAgent.js src/construction/agents/conceptFusionAgent.js test/conceptSelectionAgent.test.js test/conceptFusionAgent.test.js
git commit -m "feat: add concept selection and fusion"
```

Expected: commit succeeds.

---

### Task 3: CreativeDesignAgent Concept Patch Integration

**Files:**
- Modify: `src/construction/agents/creativeDesignAgent.js`
- Create: `test/conceptCreativeDesign.test.js`

**Interfaces:**
- Consumes:
  - `context.conceptStudio.selectedConcept`
  - selected concept's `creative_design_patch`
- Produces:
  - `creativeDesign.concept_studio`
  - concept-biased `creativeDesign.facade`, `roof`, `site`, `interior`, and `topology`
- Later workflow task passes concept context into `CreativeDesignAgent.run`.

- [ ] **Step 1: Write the failing creative-design test**

Create `test/conceptCreativeDesign.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeededCreativeDesign, normalizeCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';

test('buildSeededCreativeDesign applies selected concept patch to supported semantic fields', () => {
  const concept = {
    id: 'concept-a-view-courtyard',
    title: '水景庭院视线方案',
    archetype: 'view-courtyard',
    creative_design_patch: {
      massing_variant: 'waterfront-stepped-estate',
      facade: {
        window_rhythm: 'corner-window-bands',
        glazing_ratio: 'high',
        entry_detail_style: 'recessed-glass-portal',
        window_surround_pattern: 'corner-wrap'
      },
      roof: {
        style: 'flat',
        profile: 'thin-parapet-terrace',
        roof_terrace: true,
        overhang: 0
      },
      site: {
        mood: 'reflecting-water-edge',
        patio: true,
        water_feature: true,
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
    }
  };

  const design = buildSeededCreativeDesign(
    '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    { style_family: 'modern', volumes: [], roof_rules: { style: 'flat' } },
    { seed: 7101, floors: 2, roof_style: 'flat' },
    { nodes: [{ id: 'living', floor: 0, weight: 1 }] },
    { conceptStudio: { active: true, selectedConcept: concept } }
  );

  assert.equal(design.concept_studio.selected_concept_id, 'concept-a-view-courtyard');
  assert.equal(design.design_axes.massing_variant, 'waterfront-stepped-estate');
  assert.equal(design.facade.window_rhythm, 'corner-window-bands');
  assert.equal(design.facade.glazing_ratio, 'high');
  assert.equal(design.roof.profile, 'thin-parapet-terrace');
  assert.equal(design.roof.roof_terrace, true);
  assert.equal(design.site.mood, 'reflecting-water-edge');
  assert.equal(design.site.water_feature, true);
  assert.equal(design.interior.decor_density, 'layered');
  assert.equal(design.interior.display_strategy, 'long-wall-gallery');
  assert.equal(design.topology.public_core_position, 'view-facing');
});

test('normalizeCreativeDesign preserves concept studio metadata', () => {
  const normalized = normalizeCreativeDesign({
    signature: 'concept-test',
    concept_studio: {
      active: true,
      selected_concept_id: 'concept-a-view-courtyard',
      strategy: 'select'
    }
  }, 'seeded-local');

  assert.equal(normalized.concept_studio.active, true);
  assert.equal(normalized.concept_studio.selected_concept_id, 'concept-a-view-courtyard');
  assert.equal(normalized.concept_studio.strategy, 'select');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/conceptCreativeDesign.test.js
```

Expected: FAIL because `buildSeededCreativeDesign` ignores the fifth context argument and `normalizeCreativeDesign` drops `concept_studio`.

- [ ] **Step 3: Patch CreativeDesignAgent to pass context into seeded designs**

In `src/construction/agents/creativeDesignAgent.js`, change each `buildSeededCreativeDesign(prompt, architecture, buildSpec, topology)` call to:

```js
buildSeededCreativeDesign(prompt, architecture, buildSpec, topology, context)
```

Change the function signature:

```js
export function buildSeededCreativeDesign(prompt = '', architecture = {}, buildSpec = {}, topology = {}, context = {}) {
```

Before returning the seeded design object, assign it to a variable:

```js
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
```

- [ ] **Step 4: Patch LLM user payload to include concept context**

In `CreativeDesignAgent.run`, add this field to the `user: JSON.stringify({ ... })` object:

```js
            concept_studio: context.conceptStudio || {}
```

Expected behavior: LLM mode can see the selected concept, while mock mode remains deterministic.

- [ ] **Step 5: Add concept patch helper functions**

In `src/construction/agents/creativeDesignAgent.js`, add these functions near `normalizeCreativeDesign`:

```js
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
```

- [ ] **Step 6: Preserve normalized concept metadata**

Inside `normalizeCreativeDesign`, add:

```js
  const conceptStudio = normalizeConceptStudioMetadata(raw.concept_studio || raw.conceptStudio);
```

Then add this field in the returned object after `decision_source`:

```js
    ...(conceptStudio.active ? { concept_studio: conceptStudio } : {}),
```

- [ ] **Step 7: Run the focused tests**

Run:

```powershell
node --test test/conceptCreativeDesign.test.js test/creativeDesignRoofPolicy.test.js
```

Expected: PASS with existing roof policy tests still passing.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/construction/agents/creativeDesignAgent.js test/conceptCreativeDesign.test.js
git commit -m "feat: apply selected concepts to creative design"
```

Expected: commit succeeds.

---

### Task 4: Workflow Artifacts, Blueprint Metadata, And Reports

**Files:**
- Modify: `src/construction/workflow.js`
- Create: `test/conceptPipeline.test.js`

**Interfaces:**
- Consumes:
  - `conceptCount?: number`
  - `conceptStrategy?: "select" | "fuse"`
- Produces:
  - `result.conceptStudio`
  - `blueprint.conceptStudio`
  - `artifacts.conceptStudio`
  - `artifacts.conceptStudioReport`
  - `run_report.md` section `## Stage 3 Concept Studio`

- [ ] **Step 1: Write the failing integration test**

Create `test/conceptPipeline.test.js` with:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('pipeline writes concept studio artifacts and blueprint metadata when enabled', async () => {
  const root = path.resolve('.tmp', `architect-concept-pipeline-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 3,
      conceptStrategy: 'select'
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.conceptStudio.active, true);
    assert.equal(result.conceptStudio.concept_count, 3);
    assert.equal(result.blueprint.conceptStudio.active, true);
    assert.equal(result.blueprint.conceptStudio.selected_concept_id, result.conceptStudio.selected_concept_id);
    assert.equal(result.creativeDesign.concept_studio.selected_concept_id, result.conceptStudio.selected_concept_id);
    assert.ok(result.artifacts.conceptStudio.endsWith('concept_studio.json'));
    assert.ok(result.artifacts.conceptStudioReport.endsWith('concept_studio_report.md'));

    const conceptJson = JSON.parse(await fs.readFile(result.artifacts.conceptStudio, 'utf8'));
    const conceptReport = await fs.readFile(result.artifacts.conceptStudioReport, 'utf8');
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.equal(conceptJson.selected_concept_id, result.conceptStudio.selected_concept_id);
    assert.match(conceptReport, /# Stage 3 Concept Studio/);
    assert.match(conceptReport, /Ranking/);
    assert.match(runReport, /## Stage 3 Concept Studio/);
    assert.match(runReport, /Selected:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline keeps concept studio inactive when concepts are omitted', async () => {
  const root = path.resolve('.tmp', `architect-concept-off-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1
    });

    assert.equal(result.conceptStudio, undefined);
    assert.equal(result.blueprint.conceptStudio, undefined);
    assert.equal(result.artifacts.conceptStudio, undefined);
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.doesNotMatch(runReport, /## Stage 3 Concept Studio/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/conceptPipeline.test.js
```

Expected: FAIL because `runPipeline` does not accept `concepts` or write concept artifacts.

- [ ] **Step 3: Import Concept Studio agents**

At the top of `src/construction/workflow.js`, add:

```js
import { ConceptStudioAgent } from './agents/conceptStudioAgent.js';
import { ConceptSelectionAgent } from './agents/conceptSelectionAgent.js';
import { ConceptFusionAgent } from './agents/conceptFusionAgent.js';
```

- [ ] **Step 4: Add workflow options**

In `runConstructionWorkflow` parameters, add:

```js
  conceptCount = 0,
  conceptStrategy = 'select',
```

- [ ] **Step 5: Run Concept Studio before CreativeDesignAgent**

Replace the current creative-design block:

```js
  let topology = await new ConstructionPlannerAgent({ llmClient, mode }).run(prompt, architecture, buildSpec);
  let creativeDesign = await new CreativeDesignAgent({ llmClient, mode }).run(prompt, architecture, buildSpec, topology);
  ({ architecture, buildSpec, topology, creativeDesign } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));
```

with:

```js
  let topology = await new ConstructionPlannerAgent({ llmClient, mode }).run(prompt, architecture, buildSpec);
  const conceptStudio = await runConceptStudio({
    prompt,
    mode,
    llmClient,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    conceptCount,
    conceptStrategy,
    seed
  });
  let creativeDesign = await new CreativeDesignAgent({ llmClient, mode }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    { conceptStudio }
  );
  ({ architecture, buildSpec, topology, creativeDesign } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));
```

- [ ] **Step 6: Add runConceptStudio helper**

Add this helper near `validateBlueprint`:

```js
async function runConceptStudio({ prompt, mode, llmClient, architecture, buildSpec, topology, templateKnowledge, conceptCount = 0, conceptStrategy = 'select', seed }) {
  const count = clampConceptCount(conceptCount);
  if (count < 2) return undefined;
  const base = await new ConceptStudioAgent({ llmClient, mode }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count, strategy: conceptStrategy, seed }
  );
  if (!base.active || base.concepts.length < 2) return base;
  const selection = new ConceptSelectionAgent().run(base.concepts, {
    prompt,
    architecture,
    buildSpec,
    templateKnowledge
  });
  let selectedConcept = base.concepts.find((item) => item.id === selection.selected_concept_id);
  let fusion;
  if (String(base.strategy) === 'fuse') {
    fusion = new ConceptFusionAgent().run(base.concepts, selection, { prompt, architecture, buildSpec });
    if (fusion.active && fusion.concept) selectedConcept = fusion.concept;
  }
  return {
    ...base,
    selected_concept_id: selectedConcept?.id || selection.selected_concept_id,
    fused_concept_id: fusion?.active ? fusion.concept?.id : undefined,
    selection,
    fusion,
    selectedConcept,
    warnings: [...(base.warnings || []), ...(selection.warnings || []), ...(fusion?.warnings || [])]
  };
}

function clampConceptCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 2) return 0;
  return Math.max(2, Math.min(5, Math.round(number)));
}
```

- [ ] **Step 7: Add conceptStudio to blueprints and result**

Change the `buildBlueprint` signature to include `conceptStudio`:

```js
function buildBlueprint({ prompt, architecture, topology, creativeDesign, conceptStudio, stylePreset, materialPalette, templateKnowledge, structure, facade, roof, site, opening, interior, repair, templateLawAutoRepair, templateInteriorDensityRepair, interiorClearanceRepair, buildSpec, shell, layout, paths, decorator, exporter, operations, bounds, llmProvider, llmUsage, seedSource, seed }) {
```

Inside the returned object, add after `creativeDesign`:

```js
    ...(conceptStudio?.active ? { conceptStudio: compactConceptStudio(conceptStudio) } : {}),
```

Pass `conceptStudio` into both `buildBlueprint` calls: the pre-repair blueprint and final blueprint.

Add `conceptStudio` to the returned workflow result:

```js
    ...(conceptStudio?.active ? { conceptStudio } : {}),
```

- [ ] **Step 8: Add compact concept helper**

Add this helper near `compactArchitectureScorecard`:

```js
function compactConceptStudio(conceptStudio = {}) {
  return {
    source: conceptStudio.source,
    version: conceptStudio.version,
    active: Boolean(conceptStudio.active),
    strategy: conceptStudio.strategy,
    concept_count: conceptStudio.concept_count,
    selected_concept_id: conceptStudio.selected_concept_id,
    fused_concept_id: conceptStudio.fused_concept_id,
    selected_title: conceptStudio.selectedConcept?.title,
    selected_archetype: conceptStudio.selectedConcept?.archetype,
    selection_summary: conceptStudio.selection ? {
      source: conceptStudio.selection.source,
      strategy: conceptStudio.selection.strategy,
      selected_concept_id: conceptStudio.selection.selected_concept_id,
      selected_selection_score: conceptStudio.selection.selected_selection_score,
      reason: conceptStudio.selection.reason,
      ranking: (conceptStudio.selection.ranking || []).slice(0, 5)
    } : undefined,
    warnings: conceptStudio.warnings || []
  };
}
```

- [ ] **Step 9: Write concept artifacts**

Change `exportArtifacts` signature to include `conceptStudio`:

```js
async function exportArtifacts({ outputDir, blueprint, conceptStudio, architectureScorecard, validation, prompt, mcVersion, autoBuild, minecraftDir, world, datapacksDir }) {
```

Before datapack writes, add:

```js
  const conceptStudioPath = conceptStudio?.active ? path.join(outputDir, 'concept_studio.json') : undefined;
  const conceptStudioReportPath = conceptStudio?.active ? path.join(outputDir, 'concept_studio_report.md') : undefined;
```

After writing `architecture_scorecard.json`, add:

```js
  if (conceptStudioPath) await writeJson(conceptStudioPath, serializeConceptStudio(conceptStudio));
  if (conceptStudioReportPath) await fs.writeFile(conceptStudioReportPath, renderConceptStudioReport(conceptStudio), 'utf8');
```

In the returned artifacts object, add:

```js
    ...(conceptStudioPath ? { conceptStudio: conceptStudioPath, conceptStudioReport: conceptStudioReportPath } : {}),
```

Pass `conceptStudio` into `exportArtifacts`.

- [ ] **Step 10: Add concept serialization and report rendering helpers**

Add near `renderTemplateMemorySection`:

```js
function serializeConceptStudio(conceptStudio = {}) {
  return {
    source: conceptStudio.source,
    version: conceptStudio.version,
    active: Boolean(conceptStudio.active),
    prompt: conceptStudio.prompt,
    strategy: conceptStudio.strategy,
    concept_count: conceptStudio.concept_count,
    selected_concept_id: conceptStudio.selected_concept_id,
    fused_concept_id: conceptStudio.fused_concept_id,
    selection: conceptStudio.selection,
    fusion: conceptStudio.fusion ? {
      source: conceptStudio.fusion.source,
      version: conceptStudio.fusion.version,
      active: conceptStudio.fusion.active,
      strategy: conceptStudio.fusion.strategy,
      base_concept_id: conceptStudio.fusion.base_concept_id,
      donor_concept_id: conceptStudio.fusion.donor_concept_id,
      adopted_elements: conceptStudio.fusion.adopted_elements,
      rejected_conflicts: conceptStudio.fusion.rejected_conflicts
    } : undefined,
    concepts: conceptStudio.concepts || [],
    selectedConcept: conceptStudio.selectedConcept,
    warnings: conceptStudio.warnings || []
  };
}

function renderConceptStudioReport(conceptStudio = {}) {
  const ranking = (conceptStudio.selection?.ranking || []).map((item) =>
    `| ${item.rank} | ${item.concept_id} | ${item.archetype} | ${item.selection_score} | ${item.prompt_match_score} | ${item.reference_evidence_score} | ${item.risk_penalty} |`
  ).join('\n') || '| - | - | - | - | - | - | - |';
  const cards = (conceptStudio.concepts || []).map((concept) => {
    const refs = (concept.reference_strategy || []).map((ref) => `  - ${ref.title}: ${(ref.used_for || []).join(', ') || 'general'}; ${(ref.teaches || []).slice(0, 2).join(' / ') || 'reference'}`).join('\n') || '  - none';
    const risks = (concept.risks || []).map((risk) => `  - ${risk.id} (${risk.severity}): ${risk.text} -> ${risk.mitigation}`).join('\n') || '  - none';
    return `## ${concept.title}

- ID: ${concept.id}
- Archetype: ${concept.archetype}
- Summary: ${concept.summary}
- Quality targets: ${(concept.quality_targets || []).join(', ') || 'none'}
- Patch: massing=${concept.creative_design_patch?.massing_variant || 'auto'}, facade=${concept.creative_design_patch?.facade?.window_rhythm || 'auto'}, roof=${concept.creative_design_patch?.roof?.profile || 'auto'}, site=${concept.creative_design_patch?.site?.mood || 'auto'}

### References

${refs}

### Risks

${risks}`;
  }).join('\n\n');
  return `# Stage 3 Concept Studio

- Strategy: ${conceptStudio.strategy || 'select'}
- Concepts: ${conceptStudio.concept_count || 0}
- Selected: ${conceptStudio.selectedConcept?.title || conceptStudio.selected_concept_id || 'none'}
- Selected ID: ${conceptStudio.selected_concept_id || 'none'}
- Reason: ${conceptStudio.selection?.reason || 'none'}
- Warnings: ${(conceptStudio.warnings || []).join('; ') || 'none'}

## Ranking

| Rank | Concept | Archetype | Score | Prompt | References | Risk Penalty |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
${ranking}

${cards}
`;
}
```

- [ ] **Step 11: Render run-report section**

In `renderReport`, add a variable before the return template:

```js
  const conceptStudioSection = renderConceptStudioSection(blueprint);
```

Insert `${conceptStudioSection}` after the `## 创意设计决策` block or before `## 结构框架 JSON`.

Add:

```js
function renderConceptStudioSection(blueprint = {}) {
  const concept = blueprint.conceptStudio;
  if (!concept?.active) return '';
  const alternatives = (concept.selection_summary?.ranking || [])
    .filter((item) => item.concept_id !== concept.selected_concept_id)
    .slice(0, 3)
    .map((item) => `${item.concept_id}(${item.selection_score})`)
    .join('、') || '无';
  return `## Stage 3 Concept Studio

- Strategy: ${concept.strategy || 'select'}
- Concepts: ${concept.concept_count || 0}
- Selected: ${concept.selected_title || concept.selected_concept_id || 'none'}
- Selected ID: ${concept.selected_concept_id || 'none'}
- Reason: ${concept.selection_summary?.reason || 'none'}
- Compared alternatives: ${alternatives}
`;
}
```

- [ ] **Step 12: Run focused integration test**

Run:

```powershell
node --test test/conceptPipeline.test.js
```

Expected: PASS with 2 tests.

- [ ] **Step 13: Commit**

Run:

```powershell
git add src/construction/workflow.js test/conceptPipeline.test.js
git commit -m "feat: write concept studio artifacts"
```

Expected: commit succeeds.

---

### Task 5: Pipeline And CLI Flags

**Files:**
- Modify: `src/pipeline.js`
- Modify: `src/index.js`
- Modify: `test/conceptPipeline.test.js`

**Interfaces:**
- Consumes:
  - `runPipeline({ concepts, conceptStrategy })`
  - CLI `--concepts <n>`
  - CLI `--concept-strategy select|fuse`
- Produces:
  - options passed into single and candidate `runConstructionWorkflow` calls
  - help text showing Stage 3 flags
  - console output paths when concept artifacts exist

- [ ] **Step 1: Extend integration test for candidate mode and fuse strategy**

Append this test to `test/conceptPipeline.test.js`:

```js
test('candidate pipeline passes concept studio options into candidate runs', async () => {
  const root = path.resolve('.tmp', `architect-concept-candidate-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代别墅，带大玻璃、水边平台和前景花园',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 8111,
      concepts: 2,
      conceptStrategy: 'fuse',
      candidates: 2,
      candidateTargetScore: 100,
      candidateForceRounds: true
    });

    assert.equal(result.candidateSelection.active, true);
    assert.equal(result.blueprint.conceptStudio.active, true);
    assert.equal(result.blueprint.conceptStudio.strategy, 'fuse');
    assert.ok(result.artifacts.conceptStudio);
    assert.ok(result.candidateSelection.ranking.length >= 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the candidate integration test to verify it fails**

Run:

```powershell
node --test test/conceptPipeline.test.js
```

Expected: FAIL because `runPipeline` and `runCandidatePipeline` do not pass `concepts` and `conceptStrategy`.

- [ ] **Step 3: Patch pipeline option plumbing**

In `src/pipeline.js`, add parameters to `runPipeline`:

```js
  concepts = 0,
  conceptStrategy = 'select',
```

After `roundCount`, add:

```js
  const conceptCount = clampInt(concepts, 0, 5, 0);
  const normalizedConceptStrategy = normalizeConceptStrategy(conceptStrategy);
```

Pass these into `runCandidatePipeline`:

```js
      concepts: conceptCount,
      conceptStrategy: normalizedConceptStrategy,
```

Pass these into the single `runConstructionWorkflow` call:

```js
    conceptCount,
    conceptStrategy: normalizedConceptStrategy,
```

Add parameters to `runCandidatePipeline`:

```js
  concepts = 0,
  conceptStrategy = 'select',
```

Inside `runCandidatePipeline`, add:

```js
  const conceptCount = clampInt(concepts, 0, 5, 0);
  const normalizedConceptStrategy = normalizeConceptStrategy(conceptStrategy);
```

Pass into candidate `runConstructionWorkflow` calls:

```js
          conceptCount,
          conceptStrategy: normalizedConceptStrategy,
```

Add to `candidateSelection` object:

```js
    concept_count: conceptCount,
    concept_strategy: normalizedConceptStrategy,
```

Add to `compactCandidateSelection`:

```js
    concept_count: selection.concept_count,
    concept_strategy: selection.concept_strategy,
```

At the bottom near `clampInt`, add:

```js
function normalizeConceptStrategy(value) {
  return String(value || 'select') === 'fuse' ? 'fuse' : 'select';
}
```

- [ ] **Step 4: Patch CLI parsing and help**

In `src/index.js`, add default options:

```js
    concepts: 0,
    conceptStrategy: 'select',
```

In `parseArgs`, add:

```js
    } else if (arg === '--concepts') {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`无效概念数量: ${parsed}`);
      options.concepts = Math.trunc(parsed);
    } else if (arg === '--concept-strategy') {
      const value = argv[++i] || 'select';
      if (!['select', 'fuse'].includes(value)) throw new Error(`无效概念策略: ${value}`);
      options.conceptStrategy = value;
```

In `printHelp`, add after seed:

```text
  --concepts <n>            Enable Stage 3 Concept Studio with 2-5 concepts before construction.
  --concept-strategy <mode> select or fuse. Defaults to select.
```

Pass into `runPipeline`:

```js
    concepts: options.concepts,
    conceptStrategy: options.conceptStrategy,
```

After candidate output block and before datapack output, add:

```js
  if (result.conceptStudio) {
    console.log(`Concept Studio: ${result.conceptStudio.selected_concept_id} / ${result.conceptStudio.concept_count} concepts / ${result.conceptStudio.strategy}`);
    console.log(`概念报告: ${result.artifacts.conceptStudioReport}`);
  }
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test test/conceptPipeline.test.js test/candidatePipeline.test.js
```

Expected: PASS. Existing candidate pipeline behavior remains valid.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/pipeline.js src/index.js test/conceptPipeline.test.js
git commit -m "feat: add concept studio cli options"
```

Expected: commit succeeds.

---

### Task 6: Full Verification And Benchmark Smoke

**Files:**
- Modify only if verification exposes a concrete defect:
  - `src/construction/agents/conceptStudioAgent.js`
  - `src/construction/agents/conceptSelectionAgent.js`
  - `src/construction/agents/conceptFusionAgent.js`
  - `src/construction/agents/creativeDesignAgent.js`
  - `src/construction/workflow.js`
  - `src/pipeline.js`
  - `src/index.js`
  - relevant tests

**Interfaces:**
- Consumes all previous task outputs.
- Produces verified Stage 3 MVP with passing tests and smoke artifacts.

- [ ] **Step 1: Run all targeted concept tests**

Run:

```powershell
node --test test/conceptStudioAgent.test.js test/conceptSelectionAgent.test.js test/conceptFusionAgent.test.js test/conceptCreativeDesign.test.js test/conceptPipeline.test.js
```

Expected: PASS with all concept tests passing.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm test
```

Expected: PASS with the existing test suite and new concept tests.

- [ ] **Step 3: Run select smoke test**

Run:

```powershell
npm start -- --mode mock --seed 7101 --concepts 3 "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected:

- CLI prints `Concept Studio:`.
- Output directory contains `concept_studio.json`.
- Output directory contains `concept_studio_report.md`.
- `run_report.md` contains `## Stage 3 Concept Studio`.
- `blueprint.json` contains `"conceptStudio"`.
- Datapack export succeeds.

- [ ] **Step 4: Run fuse smoke test**

Run:

```powershell
npm start -- --mode mock --seed 7101 --concepts 3 --concept-strategy fuse "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected:

- CLI prints `Concept Studio:`.
- `concept_studio.json` has `"strategy": "fuse"`.
- `concept_studio.json` has a `fusion` object.
- `blueprint.json` records the fused or selected concept id.
- Datapack export succeeds.

- [ ] **Step 5: Inspect generated artifacts**

Use the output directory printed by Step 3 and Step 4.

Run:

```powershell
$latest = Get-ChildItem out -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content (Join-Path $latest.FullName 'concept_studio_report.md') -TotalCount 80
Get-Content (Join-Path $latest.FullName 'run_report.md') | Select-String -Pattern 'Stage 3 Concept Studio' -Context 0,8
```

Expected:

- Concept report shows ranking and concept cards.
- Run report shows selected concept and alternatives.

- [ ] **Step 6: Fix only verified defects**

If any command fails, use the failing message to patch the smallest relevant file. After each fix, rerun the failed command before continuing.

Concrete examples:

- If `ConceptFusionAgent` adopts more than two fields, cap `adopted_elements.length` at `2`.
- If `run_report.md` omits the Stage 3 section, verify `blueprint.conceptStudio.active` and the `${conceptStudioSection}` insertion point in `renderReport`.
- If candidate mode drops concept options, inspect the candidate `runConstructionWorkflow` argument object in `src/pipeline.js`.
- If full `npm test` exposes a previous assertion about artifact keys, update only the new test or code path that added concept artifacts.

- [ ] **Step 7: Commit verification fixes**

If Step 6 changed files, run:

```powershell
git add src test
git commit -m "fix: stabilize concept studio workflow"
```

Expected: commit succeeds only when there are actual fixes.

- [ ] **Step 8: Final status check**

Run:

```powershell
git status --short
```

Expected: no tracked source changes except uncommitted `out/` or `.tmp/` artifacts ignored by `.gitignore`.

---

## Self-Review

Spec coverage:

- Concept generation is covered by Task 1.
- Explainable references and risks are covered by Task 1.
- Selection is covered by Task 2.
- Fusion is covered by Task 2.
- CreativeDesignAgent patch integration is covered by Task 3.
- Workflow metadata, artifacts, and reports are covered by Task 4.
- CLI flags and candidate-mode pass-through are covered by Task 5.
- Tests, smoke runs, and regression checks are covered by Task 6.
- Deferred UI, neural models, full multi-build comparison, and rendered thumbnails remain outside this MVP.

Type consistency:

- `conceptCount` and `conceptStrategy` are the workflow-level option names.
- `concepts` and `conceptStrategy` are the `runPipeline` and CLI option names.
- `conceptStudio.selectedConcept` is the full selected or fused concept object passed to `CreativeDesignAgent`.
- `blueprint.conceptStudio` stores compact metadata.
- `artifacts.conceptStudio` and `artifacts.conceptStudioReport` store full artifact paths.

Execution notes:

- Use TDD order exactly as written.
- Keep commits per task.
- Do not alter datapack export semantics.
- Do not add dependencies.
