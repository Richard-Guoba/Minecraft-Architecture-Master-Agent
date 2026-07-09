import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildTemplateEmbeddingIndex } from '../src/construction/templates/templateEmbeddingIndex.js';
import {
  DEFAULT_RETRIEVAL_EVAL_SET,
  evaluateTemplateRetrieval,
  renderRetrievalEvalReport,
  writeRetrievalEvalArtifacts
} from '../src/evaluateTemplateRetrieval.js';

test('retrieval evaluation compares rule and neural results', () => {
  const result = evaluateTemplateRetrieval({
    knowledgeBase: knowledgeBaseFixture(),
    embeddingIndex: embeddingIndexFixture(),
    evalSet: DEFAULT_RETRIEVAL_EVAL_SET
  });

  assert.equal(result.source, 'stage5-template-retrieval-eval-v1');
  assert.ok(result.prompts.length >= 10);
  assert.ok(result.prompts[0].rule_top.length > 0);
  assert.ok(result.prompts[0].fusion_top.length > 0);
});

test('retrieval evaluation report renders prompt sections', () => {
  const result = evaluateTemplateRetrieval({
    knowledgeBase: knowledgeBaseFixture(),
    embeddingIndex: embeddingIndexFixture(),
    evalSet: DEFAULT_RETRIEVAL_EVAL_SET
  });
  const report = renderRetrievalEvalReport(result);

  assert.match(report, /# Stage 5 Retrieval Evaluation/);
  assert.match(report, /modern-lakeside-villa/);
  assert.match(report, /Rule top/);
  assert.match(report, /Fusion top/);
});

test('evaluate:retrieval CLI writes report with provided artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-retrieval-eval-'));
  try {
    const kbFile = path.join(root, 'case_library.v2.json');
    const indexFile = path.join(root, 'embedding_index.json');
    const reportFile = path.join(root, 'retrieval_eval_report.md');
    await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBaseFixture(), null, 2)}\n`, 'utf8');
    await fs.writeFile(indexFile, `${JSON.stringify(embeddingIndexFixture(), null, 2)}\n`, 'utf8');

    const result = spawnSync(process.execPath, [
      'src/evaluateTemplateRetrieval.js',
      '--knowledge-base',
      kbFile,
      '--embedding-index',
      indexFile,
      '--out',
      reportFile
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Retrieval evaluation wrote/);
    assert.match(await fs.readFile(reportFile, 'utf8'), /Stage 5 Retrieval Evaluation/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('evaluate:retrieval CLI falls back when the default embedding index is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-retrieval-default-fallback-'));
  try {
    const reportFile = path.join(root, 'retrieval_eval_report.md');
    const result = spawnSync(process.execPath, [
      'src/evaluateTemplateRetrieval.js',
      '--out',
      reportFile
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Retrieval evaluation wrote/);
    assert.match(await fs.readFile(reportFile, 'utf8'), /Stage 5 Retrieval Evaluation/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('writeRetrievalEvalArtifacts writes eval set and report', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-retrieval-artifacts-'));
  try {
    const result = await writeRetrievalEvalArtifacts({
      outputDir: root,
      knowledgeBase: knowledgeBaseFixture(),
      embeddingIndex: embeddingIndexFixture()
    });
    assert.ok(result.evalSetFile.endsWith('retrieval_eval_set.json'));
    assert.ok(result.reportFile.endsWith('retrieval_eval_report.md'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function knowledgeBaseFixture() {
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
      tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }], interior: [{ id: 'furnished' }] },
      knowledge_units: [
        { id: 'site', area: 'site', claim: 'Connect public rooms to a water edge and deck.', confidence: 0.85, integration_targets: ['TemplateSiteSceneStrategy'] },
        { id: 'facade', area: 'facade', claim: 'Large glass should serve view-facing rooms.', confidence: 0.85, integration_targets: ['FacadeAgent'] }
      ],
      priority: { global_score: 92, area_scores: { site: 90, facade: 86 }, risk_penalty: 0 },
      retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass', 'interior'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'], diversity_slots: ['site', 'facade'], explanation_seeds: ['modern waterfront villa'] },
      risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
    }]
  };
}

function embeddingIndexFixture() {
  const knowledgeBase = knowledgeBaseFixture();
  return buildTemplateEmbeddingIndex({ knowledgeBase, dimensions: 64 });
}
