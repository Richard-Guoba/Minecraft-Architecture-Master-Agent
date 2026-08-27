import { createCheckerRegistry, validateCheckerRegistry } from './checkerRegistry.js';
import { deepFreeze, sha256, stableJson } from './canonical.js';
import {
  EVALUATOR_VERSION,
  PLAYBOOK_VERSION,
  SCHOOL_ID,
  SHADOW_OUTPUT_FILES,
  SHADOW_SCHEMA_VERSION
} from './constants.js';
import { shadowError, validateManifest } from './contracts.js';
import { loadShadowCorpus } from './corpus.js';
import { evaluateShadowReview } from './evaluateReview.js';
import { explainReview } from './explanation.js';
import { buildPromptPacket } from './promptPacket.js';
import { renderShadowReport } from './report.js';
import { admitShadowRun, installShadowArtifacts } from './storage.js';

const BODY_FILES = Object.freeze(SHADOW_OUTPUT_FILES.filter((name) => name !== 'manifest.json'));

export async function buildShadowArtifacts({
  projectRoot,
  blueprintBytes,
  blueprintRelativePath,
  mode,
  createClient
} = {}) {
  const { blueprint, corpus, review } = await deterministicReviewInputs({
    projectRoot,
    blueprintBytes,
    blueprintRelativePath
  });
  const packet = buildPromptPacket({
    review,
    cards: corpus.cards,
    blueprintPrompt: blueprint.prompt
  });
  const explanation = await explainReview({ mode, review, promptPacket: packet, createClient });
  const bodyFiles = {
    'review.json': Buffer.from(stableJson(review)),
    'prompt-packet.json': Buffer.from(stableJson(packet)),
    'explanation.json': Buffer.from(stableJson(explanation)),
    'report.md': Buffer.from(renderShadowReport({ review, explanation }))
  };
  const manifest = createManifest({ review, explanation, mode, bodyFiles });
  return Object.freeze({
    'manifest.json': Buffer.from(stableJson(manifest)),
    ...bodyFiles
  });
}

export async function buildDeterministicShadowReview({
  projectRoot,
  blueprintBytes,
  blueprintRelativePath
} = {}) {
  return (await deterministicReviewInputs({
    projectRoot,
    blueprintBytes,
    blueprintRelativePath
  })).review;
}

async function deterministicReviewInputs({
  projectRoot,
  blueprintBytes,
  blueprintRelativePath
} = {}) {
  const blueprint = parseBlueprintBytes(blueprintBytes);
  const corpus = await loadShadowCorpus({ projectRoot });
  const registry = validateCheckerRegistry(corpus.cards, createCheckerRegistry());
  const review = evaluateShadowReview({
    blueprint,
    blueprintPath: blueprintRelativePath,
    blueprintSha256: sha256(blueprintBytes),
    corpus,
    registry
  });
  return { blueprint, corpus, review };
}

export async function runShadowReview(options = {}) {
  const authority = await admitShadowRun({
    projectRoot: options.projectRoot,
    runArg: options.runArg,
    fsImpl: options.fsImpl
  });
  try {
    const files = await buildShadowArtifacts({
      projectRoot: authority.project_root,
      blueprintBytes: authority.blueprint_bytes,
      blueprintRelativePath: 'blueprint.json',
      mode: options.mode,
      createClient: options.createClient
    });
    const installed = await installShadowArtifacts({
      authority,
      files,
      fsImpl: options.fsImpl
    });
    return deepFreeze({
      ...installed,
      mode: options.mode,
      run_relative_path: authority.run_relative_path,
      assessment_count: JSON.parse(files['review.json'].toString('utf8')).assessments.length,
      explanation_status: JSON.parse(files['explanation.json'].toString('utf8')).status
    });
  } finally {
    await authority.close();
  }
}

export function parseBlueprintBytes(blueprintBytes) {
  try {
    if (!Buffer.isBuffer(blueprintBytes)) throw shadowError('BLUEPRINT_INVALID');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(blueprintBytes);
    const blueprint = JSON.parse(decoded);
    if (!isPlainObject(blueprint) || blueprint.workflow !== 'construction_method_v1') {
      throw shadowError('BLUEPRINT_INVALID');
    }
    return blueprint;
  } catch {
    throw shadowError('BLUEPRINT_INVALID');
  }
}

function createManifest({ review, explanation, mode, bodyFiles }) {
  const manifest = {
    schema_version: SHADOW_SCHEMA_VERSION,
    evaluator_version: EVALUATOR_VERSION,
    playbook_version: PLAYBOOK_VERSION,
    school_id: SCHOOL_ID,
    blueprint_sha256: review.input.blueprint_sha256,
    rule_corpus_sha256: review.rule_corpus_sha256,
    mode,
    explanation_status: explanation.status,
    managed_paths: [...SHADOW_OUTPUT_FILES],
    artifact_hashes: Object.fromEntries(BODY_FILES.map((name) => [name, sha256(bodyFiles[name])]))
  };
  return validateManifest(manifest);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
