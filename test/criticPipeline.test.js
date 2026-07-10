import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('pipeline writes critic council artifacts and blueprint metadata by default', async () => {
  const root = path.resolve('.tmp', `architect-critic-pipeline-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 3
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.criticCouncil.active, true);
    assert.equal(result.criticCouncil.critic_count, 6);
    assert.equal(result.blueprint.criticCouncil.active, true);
    assert.equal(result.blueprint.criticCouncil.readiness, result.criticCouncil.readiness);
    assert.ok(result.artifacts.criticCouncil.endsWith('critic_council.json'));

    const criticJson = JSON.parse(await fs.readFile(result.artifacts.criticCouncil, 'utf8'));
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    const blueprintJson = JSON.parse(await fs.readFile(result.artifacts.blueprint, 'utf8'));
    assert.equal(criticJson.source, 'stage4-critic-council-v1');
    assert.equal(criticJson.critics.length, 6);
    assert.equal(blueprintJson.criticCouncil.active, true);
    assert.match(runReport, /## Stage 4 Critic Council/);
    assert.match(runReport, /Readiness:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline suppresses critic council artifacts when critics are disabled', async () => {
  const root = path.resolve('.tmp', `architect-critic-off-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1,
      critics: false
    });

    assert.equal(result.criticCouncil, undefined);
    assert.equal(result.blueprint.criticCouncil, undefined);
    assert.equal(result.artifacts.criticCouncil, undefined);
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.doesNotMatch(runReport, /## Stage 4 Critic Council/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('candidate pipeline passes critic options into candidate runs', async () => {
  const root = path.resolve('.tmp', `architect-critic-candidate-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代别墅，带大玻璃、水边平台和前景花园',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 8111,
      candidates: 2,
      candidateTargetScore: 100,
      candidateForceRounds: true,
      critics: false
    });

    assert.equal(result.candidateSelection.active, true);
    assert.equal(result.criticCouncil, undefined);
    assert.equal(result.blueprint.criticCouncil, undefined);
    assert.equal(result.artifacts.criticCouncil, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline activates fusion retrieval when neural opt-in is enabled and valid artifacts exist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'architect-neural-runtime-fusion-'));
  try {
    await writePipelineAnalysisFixture(root, { includeEmbeddingIndex: true, neuralLabels: 'valid' });
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: root,
      seed: 7101,
      concepts: 0,
      neuralRetrieval: true
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.blueprint.templateKnowledge.retrieval_explanation.source, 'stage5-neural-template-retriever-v1');
    assert.equal(result.blueprint.templateKnowledge.retrieval_explanation.mode, 'fusion');
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(runReport, /Retrieval mode: fusion/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline reports neural fallback mode when embedding artifacts are absent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'architect-neural-runtime-fallback-'));
  try {
    await writePipelineAnalysisFixture(root, { includeEmbeddingIndex: false });
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: root,
      seed: 7101,
      concepts: 0,
      neuralRetrieval: true
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.blueprint.templateKnowledge.retrieval_explanation.mode, 'rule-only-fallback');
    assert.equal(result.blueprint.templateKnowledge.retrieval_explanation.fallback_used, true);
    assert.match((result.blueprint.templateKnowledge.retrieval_explanation.warnings || []).join(' '), /embedding index missing/i);
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(runReport, /Retrieval mode:/);
    assert.match(runReport, /rule-only-fallback/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline keeps rule-only retrieval when neural opt-in is explicitly disabled', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'architect-neural-runtime-disabled-'));
  try {
    await writePipelineAnalysisFixture(root, { includeEmbeddingIndex: true, neuralLabels: 'valid' });
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: root,
      seed: 7101,
      concepts: 0,
      neuralRetrieval: false
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.blueprint.templateKnowledge.retrieval_explanation.source, 'template-explainable-retriever-v1');
    assert.equal(result.blueprint.templateKnowledge.retrieval_explanation.mode, 'rule-only');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function writePipelineAnalysisFixture(root, { includeEmbeddingIndex = true, neuralLabels = 'omit' } = {}) {
  const analysisDir = path.join(root, 'mc_templates', 'analysis');
  await fs.mkdir(analysisDir, { recursive: true });
  const knowledgeBase = pipelineKnowledgeBaseFixture();
  const { buildTemplateEmbeddingIndex } = await import('../src/construction/templates/templateEmbeddingIndex.js');
  const labelRecords = neuralLabels === 'valid' ? [validPipelineNeuralLabelFixture()] : [];
  await fs.writeFile(path.join(analysisDir, 'template_index.json'), `${JSON.stringify({
    generated_at: '2026-07-09T00:00:00.000Z',
    corpus: {},
    templates: [{
      file: 'House/Modern Lake Villa.schematic',
      title: 'Modern Lake Villa',
      category: 'House',
      style_family: 'modern',
      typology: 'house',
      quality: 5,
      tags: ['modern', 'water-edge', 'large-glass'],
      analysis: { dimensions: { width: 20, length: 18, height: 12 }, terrain: {}, detail_metrics: {} },
      case_profile: { case_id: 'house-modern-lake-villa', quality_tags: [], learning_roles: [], overall_reference_score: 90 },
      recommendations: {}
    }],
    import_errors: []
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(analysisDir, 'case_library.json'), `${JSON.stringify({ cases: [] }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(analysisDir, 'case_library.v2.json'), `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
  if (includeEmbeddingIndex) {
    await fs.writeFile(path.join(analysisDir, 'embedding_index.json'), `${JSON.stringify(buildTemplateEmbeddingIndex({ knowledgeBase, neuralLabels: labelRecords }), null, 2)}\n`, 'utf8');
  }
  if (neuralLabels === 'valid') {
    await fs.writeFile(path.join(analysisDir, 'neural_labels.jsonl'), `${JSON.stringify(validPipelineNeuralLabelFixture())}\n`, 'utf8');
  }
}

function pipelineKnowledgeBaseFixture() {
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [{
      case_id: 'house-modern-lake-villa',
      case_version: 'sha256:modern',
      title: 'Modern Lake Villa',
      file: 'House/Modern Lake Villa.schematic',
      identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
      review: { status: 'approved', confidence: 0.9 },
      tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }] },
      knowledge_units: [{ id: 'facade', area: 'facade', claim: 'Large glass should serve view-facing rooms.', confidence: 0.85, integration_targets: ['FacadeAgent'] }],
      priority: { global_score: 92, area_scores: { facade: 86 }, risk_penalty: 0 },
      retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass'], diversity_slots: ['facade'], explanation_seeds: ['modern waterfront villa'] },
      risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
    }]
  };
}

function validPipelineNeuralLabelFixture() {
  return {
    source: 'stage5-neural-labels-v1',
    schema_version: 1,
    case_id: 'house-modern-lake-villa',
    file: 'House/Modern Lake Villa.schematic',
    title: 'Modern Lake Villa',
    suggested_tags: [
      { group: 'site', id: 'water-edge', confidence: 0.9, source: 'deterministic-labeler', evidence: ['fixture'] },
      { group: 'facade', id: 'large-glass', confidence: 0.88, source: 'deterministic-labeler', evidence: ['fixture'] }
    ],
    suggested_learning_areas: [
      { area: 'site', confidence: 0.9, evidence: ['fixture'] },
      { area: 'facade', confidence: 0.85, evidence: ['fixture'] }
    ],
    unknown_suggestions: [],
    review_guidance: {
      suggested_status: 'limited',
      approved_learning_areas: ['site', 'facade'],
      blocked_learning_areas: [],
      needs_human_review: false,
      review_priority: 'normal',
      reason: 'fixture'
    },
    risk_notes: ['fixture']
  };
}
