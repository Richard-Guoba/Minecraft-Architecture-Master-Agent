import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BlueprintQAAgent } from '../../construction/agents/blueprintQaAgent.js';
import { compileDesignLayersForReplay } from '../../construction/designStages.js';
import { compilePreparedConstruction } from '../../construction/workflow.js';
import { DESIGN_LAYER_ORDER, EXECUTE_SCHEMA_VERSION } from './constants.js';
import { hashReplayArtifacts } from './artifactAuthority.js';
import {
  executeError, sanitizeExecuteError, validateChainManifest, validateCheckpointEnvelope,
  validateFrozenDesignEnvelope, validateFrozenGeneratorContext, validateRepairEvidenceRequest,
  validateRepairEvidenceResult, validateRepairTransaction
} from './contracts.js';
import {
  chainManifestBytes, chainManifestHash, checkpointBytes, createChainManifest,
  createCheckpointEnvelope
} from './checkpoints.js';
import { evaluateExecuteEligibility } from './eligibility.js';
import { buildRepairTransaction } from './repairTransaction.js';
import {
  appendCandidateFailureEvidence, installCandidateSnapshot, readCurrentCandidateSnapshot
} from './storage.js';
import { buildDeterministicShadowReview } from '../shadow/runShadowReview.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

const CANDIDATE_FIELDS = Object.freeze([
  'candidate_id', 'seed', 'frozen_design', 'frozen_generator_context', 'prepared_design',
  'current_chain', 'checkpoint_envelopes', 'initial_result', 'hard_qa', 'p4_review',
  'playbook_eligibility'
]);

export async function replayCandidate({ authority, candidate, transaction, projectRoot, compilePrepared = compilePreparedConstruction, fsImpl, faultInjector } = {}) {
  let baseChainSha256; let transactionSha256; let candidateId; let attemptDir;
  try {
    const validated = validateInputs(candidate, transaction);
    ({ candidateId, baseChainSha256, transactionSha256 } = validated);
    const stored = await readCurrentCandidateSnapshot({ authority, candidateId, fsImpl });
    if (stored.current_chain_sha256 !== baseChainSha256 || !stored.current_chain.equals(chainManifestBytes(validated.chain))) stale();

    const start = DESIGN_LAYER_ORDER.indexOf(transaction.earliest_target_layer);
    const upstreamPayloads = Object.fromEntries(validated.envelopes.slice(0, start).map((envelope) => [
      envelope.checkpoint.layer, envelope.checkpoint.recipe_fragment.payload
    ]));
    const effectsByLayer = {};
    for (const operation of transaction.operations) (effectsByLayer[operation.target_layer] ||= []).push(operation);
    const prepared = replayPrepared(candidate.prepared_design, validated.context, validated.frozenDesign, validated.envelopes[0].checkpoint.recipe_fragment.payload);
    const compiledLayers = await compileDesignLayersForReplay({
      prepared,
      layerPayloads: upstreamPayloads,
      resolvedEffectsByLayer: effectsByLayer,
      replayStartLayer: transaction.earliest_target_layer,
      faultInjector
    });

    attemptDir = await fs.mkdtemp(path.join(os.tmpdir(), `p5-replay-${candidateId}-`));
    await hit(faultInjector, 'downstream-compile');
    const compiledResult = await compilePrepared({
      prepared,
      compiledLayers, outputDir: attemptDir, world: undefined, datapacksDir: undefined,
      minecraftDir: undefined, autoBuild: false
    });
    await hit(faultInjector, 'blueprint');
    if (!compiledResult || !isPlainObject(compiledResult.blueprint)) replayFailed();
    const blueprintBytes = await exactBlueprintBytes(compiledResult);
    await hit(faultInjector, 'hard-qa');
    const hardQa = new BlueprintQAAgent().run(compiledResult.blueprint);
    await hit(faultInjector, 'p4-review');
    const p4Review = await buildDeterministicShadowReview({ projectRoot, blueprintBytes, blueprintRelativePath: 'blueprint.json' });
    const playbookEligibility = evaluateExecuteEligibility({ review: p4Review, hardQa: { ok: hardQa.ok }, repairBudgetUsed: 1 });
    await hit(faultInjector, 'hashing');
    const recheckedBlueprintBytes = await exactBlueprintBytes(compiledResult);
    if (!recheckedBlueprintBytes.equals(blueprintBytes)) replayFailed();
    const artifactHashes = await hashReplayArtifacts({ compiledResult });
    const blueprintSha256 = sha256(blueprintBytes); const hardQaBytes = bytes(hardQa); const p4ReviewBytes = bytes(p4Review);
    const hardQaSha256 = sha256(hardQaBytes); const p4ReviewSha256 = sha256(p4ReviewBytes);
    const requestEvidence = validateRepairEvidenceRequest({
      schema_version: EXECUTE_SCHEMA_VERSION, candidate_id: candidateId, attempt: 1,
      base_chain_sha256: baseChainSha256, repair_transaction_sha256: transactionSha256,
      requests: transaction.operations.map(requestProjection)
    });
    const requestBytes = bytes(requestEvidence);
    const resultEvidence = validateRepairEvidenceResult({
      schema_version: EXECUTE_SCHEMA_VERSION, candidate_id: candidateId, attempt: 1,
      base_chain_sha256: baseChainSha256, repair_request_sha256: sha256(requestBytes),
      repair_transaction_sha256: transactionSha256, blueprint_sha256: blueprintSha256,
      hard_qa_sha256: hardQaSha256, p4_review_sha256: p4ReviewSha256, eligibility: playbookEligibility
    });
    const resultBytes = bytes(resultEvidence); const resultSha256 = sha256(resultBytes);

    const envelopes = validated.envelopes.slice(0, start);
    for (const [index, layer] of DESIGN_LAYER_ORDER.entries()) {
      if (index < start) continue;
      const previous = validated.envelopes[index].checkpoint;
      envelopes.push(createCheckpointEnvelope({
        build_id: previous.build_id, candidate_id: candidateId, layer,
        revision: previous.revision + 1, status: 'accepted', preceding_envelopes: envelopes,
        selected_rule_ids: previous.selected_rule_ids, rejected_rule_ids: previous.rejected_rule_ids,
        design_intent: previous.design_intent, recipe_fragment: { layer, payload: compiledLayers[layer] },
        field_patches: [], compiled_artifact_hashes: {
          layer_payload_sha256: sha256(stableJson(compiledLayers[layer])),
          ...(layer === 'facade' ? { repair_result_sha256: resultSha256, ...artifactHashes } : {})
        },
        hard_qa: { hard_qa_ok: hardQa.ok, hard_qa_sha256: hardQaSha256 },
        design_review: { p4_review_sha256: p4ReviewSha256 },
        invalidates_downstream: previous.invalidates_downstream,
        replay_origin: { kind: 'replay', base_chain_sha256: baseChainSha256, repair_transaction_sha256: transactionSha256 }
      }));
    }
    const chain = createChainManifest({
      candidate_id: candidateId, chain_revision: validated.chain.chain_revision + 1,
      parent_chain_sha256: baseChainSha256, checkpoint_envelopes: envelopes,
      frozen_design_sha256: validated.chain.frozen_design_sha256,
      frozen_generator_context_sha256: validated.chain.frozen_generator_context_sha256,
      blueprint_sha256: blueprintSha256, hard_qa_sha256: hardQaSha256,
      p4_review_sha256: p4ReviewSha256, repair_transaction_sha256: transactionSha256,
      eligibility: playbookEligibility, created_from: 'replay'
    });
    const files = Object.fromEntries(Object.entries(stored.files).filter(([name]) => name !== 'current-chain.json'));
    for (const envelope of envelopes.slice(start)) files[`checkpoints/${envelope.checkpoint.layer}/r${pad(envelope.checkpoint.revision)}.json`] = checkpointBytes(envelope);
    files[`reviews/chain-${pad(chain.chain_revision)}-hard-qa.json`] = hardQaBytes;
    files[`reviews/chain-${pad(chain.chain_revision)}-review.json`] = p4ReviewBytes;
    files['repairs/attempt-01-request.json'] = requestBytes;
    files['repairs/attempt-01-patch.json'] = bytes(transaction);
    files['repairs/attempt-01-result.json'] = resultBytes;
    await installCandidateSnapshot({
      authority, candidateId, files, currentChain: chainManifestBytes(chain),
      expectedPreviousChainSha256: baseChainSha256, fsImpl
    });
    return deepFreeze({
      status: 'complete', candidate_id: candidateId, base_chain_sha256: baseChainSha256,
      repair_transaction_sha256: transactionSha256, current_chain_sha256: chainManifestHash(chain),
      current_chain: chain, checkpoint_envelopes: envelopes, compiled_result: compiledResult,
      hard_qa: hardQa, p4_review: p4Review, playbook_eligibility: playbookEligibility,
      evidence: { repair_request_sha256: sha256(requestBytes), repair_result_sha256: resultSha256 }
    });
  } catch (error) {
    const publicError = sanitizeExecuteError(error, 'P5_REPLAY_FAILED');
    if (attemptDir) {
      try { await fs.rm(attemptDir, { recursive: true, force: true }); } catch {}
    }
    if (authority && candidateId && baseChainSha256 && transactionSha256) {
      try {
        await appendCandidateFailureEvidence({ authority, candidateId, expectedCurrentChainSha256: baseChainSha256, fsImpl, evidence: {
          schema_version: EXECUTE_SCHEMA_VERSION, candidate_id: candidateId, attempt: 1,
          code: publicError.code, base_chain_sha256: baseChainSha256,
          repair_transaction_sha256: transactionSha256, current_chain_sha256: baseChainSha256
        } });
      } catch {}
    }
    throw publicError;
  }
}

function validateInputs(candidate, transactionInput) {
  assertExactRuntimeCandidate(candidate);
  const frozenDesign = validateFrozenDesignEnvelope(candidate.frozen_design);
  const context = validateFrozenGeneratorContext(candidate.frozen_generator_context);
  const chain = validateChainManifest(candidate.current_chain);
  const transaction = validateRepairTransaction(transactionInput);
  const envelopes = candidate.checkpoint_envelopes.map(validateCheckpointEnvelope);
  const candidateId = candidate.candidate_id; const baseChainSha256 = chainManifestHash(chain); const transactionSha256 = sha256(stableJson(transaction));
  if (candidate.seed !== frozenDesign.seed || candidate.seed !== context.seed || candidateId !== frozenDesign.candidate_id
    || candidateId !== context.candidate_id || candidateId !== chain.candidate_id || candidateId !== transaction.candidate_id
    || context.frozen_design_sha256 !== sha256(stableJson(frozenDesign))
    || chain.frozen_design_sha256 !== context.frozen_design_sha256
    || chain.frozen_generator_context_sha256 !== sha256(stableJson(context))
    || transaction.base_chain_sha256 !== baseChainSha256 || chain.repair_transaction_sha256 !== null
    || chain.eligibility.repair_budget_used !== 0
    || !candidate.hard_qa || typeof candidate.hard_qa.ok !== 'boolean'
    || sha256(stableJson(candidate.hard_qa)) !== chain.hard_qa_sha256
    || sha256(stableJson(candidate.p4_review)) !== chain.p4_review_sha256
    || stableJson(candidate.playbook_eligibility) !== stableJson(chain.eligibility)
    || envelopes.length !== DESIGN_LAYER_ORDER.length
    || envelopes.some((envelope, index) => envelope.checkpoint.layer !== DESIGN_LAYER_ORDER[index]
      || envelope.checkpoint_sha256 !== chain.checkpoint_hashes[index].checkpoint_sha256
      || envelope.checkpoint.upstream_accepted_hashes.length !== index
      || envelope.checkpoint.upstream_accepted_hashes.some((row, position) => row.layer !== DESIGN_LAYER_ORDER[position]
        || row.checkpoint_sha256 !== envelopes[position].checkpoint_sha256))
    || transaction.operations.some((operation) => operation.base_checkpoint_sha256
      !== chain.checkpoint_hashes[DESIGN_LAYER_ORDER.indexOf(operation.target_layer)].checkpoint_sha256)) stale();
  const rebuilt = buildRepairTransaction({
    candidateId, review: candidate.p4_review, frozenDesign, baseChainSha256,
    acceptedChain: chain, checkpointEnvelopes: envelopes
  });
  if (stableJson(rebuilt) !== stableJson(transaction) || sha256(stableJson(rebuilt)) !== transactionSha256) {
    throw executeError('P5_REPAIR_INVALID');
  }
  return { frozenDesign, context, chain, transaction, envelopes, candidateId, baseChainSha256, transactionSha256 };
}

function replayPrepared(runtime, context, frozenDesign, briefPayload) {
  if (!runtime || typeof runtime !== 'object') throw executeError('P5_DESIGN_INVALID');
  if (!isPlainObject(briefPayload) || typeof briefPayload.prompt !== 'string') throw executeError('P5_CHECKPOINT_INVALID');
  return {
    prompt: briefPayload.prompt, mode: runtime.mode, mcVersion: runtime.mcVersion, outputDir: runtime.outputDir,
    seed: context.seed, seedSource: runtime.seedSource, cwd: runtime.cwd, critics: runtime.critics,
    coarseVoxelPlan: runtime.coarseVoxelPlan, llmProvider: runtime.llmProvider, llmUsage: runtime.llmUsage,
    conceptStudio: runtime.conceptStudio, stage7Shadow: runtime.stage7Shadow,
    architecture: context.architecture, topology: context.topology, creativeDesign: context.creative_design,
    buildSpec: context.build_spec, stylePreset: context.style_preset, materialPalette: context.material_palette,
    templateKnowledge: context.template_knowledge, frozenDesign, frozen_generator_context: context
  };
}

function requestProjection(patch) { return { schema_version: patch.schema_version, candidate_id: patch.candidate_id, rule_id: patch.rule_id, repair_operation_id: patch.repair_operation_id, variant_id: patch.variant_id, base_checkpoint_sha256: patch.base_checkpoint_sha256 }; }
async function exactBlueprintBytes(result) {
  if (typeof result.artifacts?.blueprint !== 'string') replayFailed();
  try {
    const exact = await fs.readFile(result.artifacts.blueprint);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(exact);
    const parsed = JSON.parse(decoded);
    if (!isPlainObject(parsed) || stableJson(parsed) !== stableJson(result.blueprint)) replayFailed();
    return exact;
  } catch (error) {
    if (error?.code === 'P5_REPLAY_FAILED') throw error;
    replayFailed();
  }
}
function assertExactRuntimeCandidate(value) {
  if (!isPlainObject(value) || Reflect.ownKeys(value).length !== CANDIDATE_FIELDS.length
    || CANDIDATE_FIELDS.some((field) => !Object.hasOwn(value, field))
    || !isPlainObject(value.prepared_design) || !isPlainObject(value.initial_result)) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
}
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
async function hit(injector, boundary) { if (injector !== undefined) { if (typeof injector !== 'function') throw executeError('P5_AUTHORITY_INVALID'); await injector(boundary); } }
function bytes(value) { return Buffer.from(stableJson(value)); }
function pad(value) { return String(value).padStart(4, '0'); }
function stale() { throw executeError('P5_STALE_BASE'); }
function replayFailed() { throw executeError('P5_REPLAY_FAILED'); }
