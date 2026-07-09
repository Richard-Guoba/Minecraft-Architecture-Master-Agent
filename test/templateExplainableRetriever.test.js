import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ExplainableTemplateRetriever } from '../src/construction/templates/templateExplainableRetriever.js';

test('explainable retriever returns ranked references with explanations', () => {
  const retriever = new ExplainableTemplateRetriever({ knowledgeBase: knowledgeBaseFixture() });
  const result = retriever.run({
    prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'template-explainable-retriever-v1');
  assert.equal(result.active, true);
  assert.ok(result.references.length >= 3);
  assert.ok(result.references.length <= 8);
  assert.equal(result.references[0].case_id, 'house-modern-lake-villa');
  for (const item of result.references) {
    assert.ok(item.match_score > 0);
    assert.ok(item.matched_signals.length > 0);
    assert.ok(item.teaches.length > 0);
    assert.ok(item.risk_controls.length > 0);
    assert.ok(item.integration_targets.length > 0);
    assert.match(item.explanation, /Matches|Backfilled|匹配/i);
  }
});

test('explainable retriever excludes rejected cases and arena interiors for residential prompts', () => {
  const retriever = new ExplainableTemplateRetriever({ knowledgeBase: knowledgeBaseFixture() });
  const result = retriever.run({
    prompt: '建一个住宅，重点要室内家具、卧室、客厅和厨房',
    context: { typology: 'house' },
    limit: 8
  });

  assert.equal(result.references.some((item) => item.case_id === 'house-rejected'), false);
  const arena = result.references.find((item) => item.case_id === 'arenas-amphitheatre-arena');
  if (arena) {
    assert.equal(arena.teaches.some((unit) => unit.area === 'interior'), false);
  }
});

test('explainable retriever honors limited review approved and blocked learning areas', () => {
  const retriever = new ExplainableTemplateRetriever({ knowledgeBase: knowledgeBaseFixture() });
  const result = retriever.run({
    prompt: '做一个带室内陈设和水边过渡的地形整合方案',
    context: { typology: 'house' },
    limit: 8
  });

  const limited = result.references.find((item) => item.case_id === 'house-limited-review');
  assert.ok(limited);
  assert.deepEqual(limited.teaches.map((unit) => unit.area), ['site']);
  assert.equal(limited.teaches.some((unit) => unit.area === 'interior'), false);
  assert.deepEqual(limited.integration_targets, ['TemplateSiteSceneStrategy']);
});

test('explainable retriever ignores blocked interior and room-type tokens while scoring limited cases', () => {
  const fixture = knowledgeBaseFixture();
  fixture.cases = [{
    case_id: 'house-limited-blocked-room-type',
    title: 'Limited Blocked Room Type',
    file: 'House/Limited Blocked Room Type.schematic',
    identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'medium' },
    review: { status: 'limited', confidence: 0.8, approved_learning_areas: ['site'], blocked_learning_areas: ['interior'] },
    tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], room_types: [{ id: 'kitchen' }] },
    knowledge_units: [
      {
        id: 'blocked-interior',
        area: 'interior',
        claim: 'Blocked kitchen lesson must not score or teach.',
        evidence: ['fixture'],
        confidence: 0.9,
        use_as: ['interior'],
        avoid_when: [],
        integration_targets: ['InteriorDetailAgent'],
        source_fields: ['fixture']
      }
    ],
    priority: { global_score: 100, area_scores: { interior: 100 }, risk_penalty: 0 },
    retrieval: { search_tokens: ['kitchen', 'living', 'interior'], prompt_affinities: ['kitchen', 'interior'], diversity_slots: ['interior'], explanation_seeds: ['blocked kitchen'] },
    risk_controls: ['use only approved learning areas from manual review']
  }];

  const result = new ExplainableTemplateRetriever({ knowledgeBase: fixture }).run({
    prompt: '住宅厨房和客厅室内布局',
    context: { typology: 'house' },
    limit: 8
  });

  assert.equal(result.references.some((item) => item.case_id === 'house-limited-blocked-room-type'), false);
});

test('explainable retriever caps requested limits at 8 references', () => {
  const fixture = knowledgeBaseFixture();
  const base = fixture.cases[0];
  fixture.cases = Array.from({ length: 12 }, (_, index) => ({
    ...base,
    case_id: `house-modern-lake-villa-${index}`,
    title: `Modern Lake Villa ${index}`,
    retrieval: {
      ...base.retrieval,
      diversity_slots: [`slot-${index}`]
    }
  }));

  const result = new ExplainableTemplateRetriever({ knowledgeBase: fixture }).run({
    prompt: 'modern lake house glass interior',
    context: { style_family: 'modern', typology: 'house' },
    limit: 99
  });

  assert.equal(result.references.length, 8);
});

test('queryTemplateKnowledge CLI prints explained references from a provided v2 file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-kb-'));
  const kbFile = path.join(root, 'case_library.v2.json');
  await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBaseFixture(), null, 2)}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    'src/queryTemplateKnowledge.js',
    '--knowledge-base',
    kbFile,
    '建一个湖边现代两层别墅，带大玻璃和精致内饰'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Template references/);
  assert.match(result.stdout, /Modern Lake Villa/);
  assert.match(result.stdout, /teaches/);
});

test('queryTemplateKnowledge CLI can print neural fusion references', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-neural-kb-'));
  const kbFile = path.join(root, 'case_library.v2.json');
  const indexFile = path.join(root, 'embedding_index.json');
  const knowledgeBase = knowledgeBaseFixture();
  const { buildTemplateEmbeddingIndex } = await import('../src/construction/templates/templateEmbeddingIndex.js');
  await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
  await fs.writeFile(indexFile, `${JSON.stringify(buildTemplateEmbeddingIndex({ knowledgeBase }), null, 2)}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    'src/queryTemplateKnowledge.js',
    '--neural',
    '--knowledge-base',
    kbFile,
    '--embedding-index',
    indexFile,
    '建一个湖边现代两层别墅，带大玻璃和精致内饰'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /mode: fusion/);
  assert.match(result.stdout, /Modern Lake Villa/);
});

test('query:templates package script runs against a provided v2 file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-script-kb-'));
  const kbFile = path.join(root, 'case_library.v2.json');
  await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBaseFixture(), null, 2)}\n`, 'utf8');
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

  const result = spawnSync(process.execPath, [
    npmCli,
    'run',
    'query:templates',
    '--',
    '--knowledge-base',
    kbFile,
    '建一个湖边现代两层别墅，带大玻璃和精致内饰'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Template references/);
  assert.match(result.stdout, /Modern Lake Villa/);
});

function knowledgeBaseFixture() {
  const unit = (id, area, claim, targets = ['TemplateKnowledgeAgent']) => ({
    id,
    area,
    claim,
    evidence: [`${area} evidence`],
    confidence: 0.85,
    use_as: [`${area} guidance`],
    avoid_when: ['do not copy block-for-block'],
    integration_targets: targets,
    source_fields: ['fixture']
  });
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
        review: { status: 'approved', confidence: 0.9 },
        tags: {
          style: [{ id: 'modern' }],
          typology: [{ id: 'house' }],
          site: [{ id: 'water-edge' }],
          facade: [{ id: 'large-glass' }],
          interior: [{ id: 'furnished' }],
          quality: [{ id: 'high-value-reference' }]
        },
        knowledge_units: [
          unit('lake-site', 'site', 'Connect public rooms to a water edge and deck.', ['TemplateSiteSceneStrategy']),
          unit('lake-facade', 'facade', 'Large glass should serve view-facing rooms.', ['FacadeAgent']),
          unit('lake-interior', 'interior', 'Use focal walls and layered lighting for inhabited rooms.', ['InteriorDetailAgent', 'DecoratorAgent'])
        ],
        priority: { global_score: 92, area_scores: { site: 90, facade: 86, interior: 84 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass', 'interior'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'], diversity_slots: ['site', 'facade', 'interior'], explanation_seeds: ['modern waterfront villa'] },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
      },
      {
        case_id: 'house-tavern',
        title: 'Tavern',
        file: 'House/Tavern.schematic',
        identity: { style_family: 'medieval', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'pending', confidence: 0 },
        tags: { style: [{ id: 'medieval' }], typology: [{ id: 'house' }], interior: [{ id: 'furnished' }] },
        knowledge_units: [unit('tavern-interior', 'interior', 'Use social clusters and focal wall details.', ['InteriorDetailAgent', 'DecoratorAgent'])],
        priority: { global_score: 80, area_scores: { interior: 90 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['tavern', 'house', 'interior', 'living'], prompt_affinities: ['house', 'interior'], diversity_slots: ['interior'], explanation_seeds: ['furnished residential interior'] },
        risk_controls: ['safe for normal template retrieval according to current evidence']
      },
      {
        case_id: 'house-watermill',
        title: 'Watermill',
        file: 'House/Watermill.schematic',
        identity: { style_family: 'coastal', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'pending', confidence: 0 },
        tags: { style: [{ id: 'coastal' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }] },
        knowledge_units: [unit('watermill-site', 'site', 'Use water edge transitions and foreground scene.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 78, area_scores: { site: 88 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['watermill', 'water-edge', 'coastal', 'house'], prompt_affinities: ['house', 'waterfront'], diversity_slots: ['site'], explanation_seeds: ['coastal water edge'] },
        risk_controls: ['scale details into the requested footprint']
      },
      {
        case_id: 'house-limited-review',
        title: 'Limited Review House',
        file: 'House/Limited Review House.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'limited', confidence: 0.6, approved_learning_areas: ['site'], blocked_learning_areas: ['interior'] },
        tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], interior: [{ id: 'furnished' }] },
        knowledge_units: [
          unit('limited-site', 'site', 'Use stepped waterfront transitions and arrival framing.', ['TemplateSiteSceneStrategy']),
          unit('limited-interior', 'interior', 'Do not expose this interior learning unit in limited mode.', ['InteriorDetailAgent'])
        ],
        priority: { global_score: 76, area_scores: { site: 88, interior: 82 }, risk_penalty: 6 },
        retrieval: { search_tokens: ['modern', 'house', 'water-edge', 'interior'], prompt_affinities: ['house', 'waterfront', 'interior'], diversity_slots: ['site'], explanation_seeds: ['limited waterfront house'] },
        risk_controls: ['use only approved learning areas from manual review']
      },
      {
        case_id: 'arenas-amphitheatre-arena',
        title: 'Amphitheatre Arena',
        file: 'Arenas/Amphitheatre Arena.schematic',
        identity: { style_family: 'classical', typology: 'arena', category: 'Arenas', scale_bucket: 'monumental' },
        review: { status: 'limited', confidence: 0.75, approved_learning_areas: ['site', 'massing'], blocked_learning_areas: ['interior'] },
        tags: { style: [{ id: 'classical' }], typology: [{ id: 'arena' }], site: [{ id: 'terrain-integrated' }] },
        knowledge_units: [unit('arena-site', 'site', 'Use terrain plinths and stepped arrival.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 48, area_scores: { site: 82 }, risk_penalty: 20 },
        retrieval: { search_tokens: ['arena', 'terrain', 'classical'], prompt_affinities: ['terrain'], diversity_slots: ['site'], explanation_seeds: ['terrain plinth'] },
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms']
      },
      {
        case_id: 'house-rejected',
        title: 'Rejected House',
        file: 'House/Rejected.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'rejected', confidence: 1 },
        tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }] },
        knowledge_units: [unit('rejected-site', 'site', 'Rejected case should not appear.')],
        priority: { global_score: 100, area_scores: { site: 100 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['modern', 'house'], prompt_affinities: ['modern', 'house'], diversity_slots: ['site'], explanation_seeds: ['rejected'] },
        risk_controls: ['excluded by manual review']
      }
    ]
  };
}
