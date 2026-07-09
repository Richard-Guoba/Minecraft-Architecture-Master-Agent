import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateKnowledgeAgent } from '../src/construction/agents/templateKnowledgeAgent.js';

test('TemplateKnowledgeAgent uses rule-only retrieval by default even when embedding index exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-template-agent-rule-default-'));
  try {
    await writeAgentAnalysisFixture(root);
    const agent = new TemplateKnowledgeAgent({
      cwd: root,
      analysisFile: path.join(root, 'mc_templates', 'analysis', 'template_index.json')
    });
    const result = agent.run('build a lakeside modern villa with large glass', { style_family: 'modern', typology: 'house' }, { typology: 'house' });

    assert.equal(result.retrieval_explanation.source, 'template-explainable-retriever-v1');
    assert.equal(result.retrieval_explanation.mode || 'rule-only', 'rule-only');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('TemplateKnowledgeAgent uses neural fusion when explicitly enabled', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-template-agent-neural-'));
  try {
    await writeAgentAnalysisFixture(root);
    const agent = new TemplateKnowledgeAgent({
      cwd: root,
      analysisFile: path.join(root, 'mc_templates', 'analysis', 'template_index.json'),
      neuralRetrieval: true
    });
    const result = agent.run('build a lakeside modern villa with large glass', { style_family: 'modern', typology: 'house' }, { typology: 'house' });

    assert.equal(result.retrieval_explanation.source, 'stage5-neural-template-retriever-v1');
    assert.equal(result.retrieval_explanation.mode, 'fusion');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function writeAgentAnalysisFixture(root) {
  const analysisDir = path.join(root, 'mc_templates', 'analysis');
  await fs.mkdir(analysisDir, { recursive: true });
  const knowledgeBase = agentKnowledgeBaseFixture();
  const { buildTemplateEmbeddingIndex } = await import('../src/construction/templates/templateEmbeddingIndex.js');
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
  await fs.writeFile(path.join(analysisDir, 'embedding_index.json'), `${JSON.stringify(buildTemplateEmbeddingIndex({ knowledgeBase }), null, 2)}\n`, 'utf8');
}

function agentKnowledgeBaseFixture() {
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
