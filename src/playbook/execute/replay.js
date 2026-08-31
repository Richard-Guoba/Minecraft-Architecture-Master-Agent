import fs from 'node:fs/promises';
import path from 'node:path';
import { BlueprintQAAgent } from '../../construction/agents/blueprintQaAgent.js';
import { compileDesignLayersForReplay, preparedFromFrozenGeneratorContext } from '../../construction/designStages.js';
import { compilePreparedConstruction } from '../../construction/workflow.js';
import { DESIGN_LAYER_ORDER, EXECUTE_SCHEMA_VERSION } from './constants.js';
import { snapshotReplayArtifacts } from './artifactAuthority.js';
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
  appendCandidateFailureEvidence, createReplayWorkspace, installCandidateSnapshot,
  readCurrentCandidateSnapshot, removeReplayWorkspace
} from './storage.js';
import { FROZEN_CONTEXT_PATH, FROZEN_DESIGN_PATH } from './storageValidation.js';
import { buildDeterministicShadowReview } from '../shadow/runShadowReview.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

const CANDIDATE_FIELDS = Object.freeze([
  'candidate_id', 'seed', 'frozen_design', 'frozen_generator_context', 'prepared_design',
  'current_chain', 'checkpoint_envelopes', 'initial_result', 'hard_qa', 'p4_review',
  'playbook_eligibility'
]);

export async function replayCandidate({
  authority,
  candidateId,
  candidate,
  transaction: transactionInput,
  projectRoot,
  compilePrepared = compilePreparedConstruction,
  fsImpl,
  faultInjector
} = {}) {
  let baseChainSha256;
  let transactionSha256;
  let attemptDir;
  candidateId ??= candidate?.candidate_id;
  try {
    const stored = await readCurrentCandidateSnapshot({ authority, candidateId, fsImpl });
    const validated = loadPersistedAuthority(stored, candidateId, transactionInput);
    ({ baseChainSha256, transactionSha256 } = validated);
    if (candidate !== undefined) validateLegacyRuntimeCandidate(candidate, validated);

    const start = DESIGN_LAYER_ORDER.indexOf(validated.transaction.earliest_target_layer);
    const upstreamPayloads = Object.fromEntries(validated.envelopes.slice(0, start).map((envelope) => [
      envelope.checkpoint.layer, envelope.checkpoint.recipe_fragment.payload
    ]));
    const effectsByLayer = {};
    for (const operation of validated.transaction.operations) {
      (effectsByLayer[operation.target_layer] ||= []).push(operation);
    }
    attemptDir = await createReplayWorkspace({ authority, candidateId, fsImpl });
    const prepared = {
      ...preparedFromFrozenGeneratorContext(validated.context, {
        outputDir: attemptDir,
        cwd: path.resolve(projectRoot || process.cwd())
      }),
      frozenDesign: validated.frozenDesign
    };
    const compiledLayers = await compileDesignLayersForReplay({
      prepared,
      layerPayloads: upstreamPayloads,
      resolvedEffectsByLayer: effectsByLayer,
      replayStartLayer: validated.transaction.earliest_target_layer,
      faultInjector
    });

    await hit(faultInjector, 'downstream-compile');
    const rawCompiledResult = await compilePrepared({
      prepared,
      compiledLayers,
      outputDir: attemptDir,
      world: undefined,
      datapacksDir: undefined,
      minecraftDir: undefined,
      autoBuild: false
    });
    const compiledResult = rawCompiledResult?.outputDir
      ? rawCompiledResult
      : { ...rawCompiledResult, outputDir: attemptDir };
    await hit(faultInjector, 'blueprint');
    if (!compiledResult || !isPlainObject(compiledResult.blueprint)) replayFailed();
    const blueprintBytes = await exactBlueprintBytes(compiledResult);
    const blueprintSha256 = sha256(blueprintBytes);
    await hit(faultInjector, 'hard-qa');
    const hardQa = new BlueprintQAAgent().run(compiledResult.blueprint);
    await hit(faultInjector, 'p4-review');
    const p4Review = await buildDeterministicShadowReview({
      projectRoot: path.resolve(projectRoot || process.cwd()),
      blueprintBytes,
      blueprintRelativePath: 'blueprint.json'
    });
    const playbookEligibility = evaluateExecuteEligibility({
      review: p4Review,
      hardQa: { ok: hardQa.ok },
      repairBudgetUsed: 1,
      candidateAuthority: {
        blueprint_sha256: blueprintSha256,
        workflow: 'construction_method_v1',
        seed: validated.context.seed
      }
    });
    await hit(faultInjector, 'hashing');
    const recheckedBlueprintBytes = await exactBlueprintBytes(compiledResult);
    if (!recheckedBlueprintBytes.equals(blueprintBytes)) replayFailed();
    const executableArtifacts = await snapshotReplayArtifacts({
      compiledResult,
      chainRevision: 2
    });
    const artifactHashes = executableArtifacts.hashes;
    const hardQaBytes = bytes(hardQa);
    const p4ReviewBytes = bytes(p4Review);
    const hardQaSha256 = sha256(hardQaBytes);
    const p4ReviewSha256 = sha256(p4ReviewBytes);
    const requestEvidence = validateRepairEvidenceRequest({
      schema_version: EXECUTE_SCHEMA_VERSION,
      candidate_id: candidateId,
      attempt: 1,
      base_chain_sha256: baseChainSha256,
      repair_transaction_sha256: transactionSha256,
      requests: validated.transaction.operations.map(requestProjection)
    });
    const requestBytes = bytes(requestEvidence);
    const resultEvidence = validateRepairEvidenceResult({
      schema_version: EXECUTE_SCHEMA_VERSION,
      candidate_id: candidateId,
      attempt: 1,
      base_chain_sha256: baseChainSha256,
      repair_request_sha256: sha256(requestBytes),
      repair_transaction_sha256: transactionSha256,
      blueprint_sha256: blueprintSha256,
      hard_qa_sha256: hardQaSha256,
      p4_review_sha256: p4ReviewSha256,
      eligibility: playbookEligibility
    });
    const resultBytes = bytes(resultEvidence);
    const resultSha256 = sha256(resultBytes);

    const envelopes = validated.envelopes.slice(0, start);
    for (const [index, layer] of DESIGN_LAYER_ORDER.entries()) {
      if (index < start) continue;
      const previous = validated.envelopes[index].checkpoint;
      envelopes.push(createCheckpointEnvelope({
        build_id: previous.build_id,
        candidate_id: candidateId,
        layer,
        revision: previous.revision + 1,
        status: 'accepted',
        preceding_envelopes: envelopes,
        selected_rule_ids: previous.selected_rule_ids,
        rejected_rule_ids: previous.rejected_rule_ids,
        design_intent: previous.design_intent,
        recipe_fragment: { layer, payload: compiledLayers[layer] },
        field_patches: [],
        compiled_artifact_hashes: {
          layer_payload_sha256: sha256(stableJson(compiledLayers[layer])),
          ...(layer === 'facade' ? { repair_result_sha256: resultSha256, ...artifactHashes } : {})
        },
        hard_qa: { hard_qa_ok: hardQa.ok, hard_qa_sha256: hardQaSha256 },
        design_review: { p4_review_sha256: p4ReviewSha256 },
        invalidates_downstream: previous.invalidates_downstream,
        replay_origin: {
          kind: 'replay',
          base_chain_sha256: baseChainSha256,
          repair_transaction_sha256: transactionSha256
        }
      }));
    }
    const chain = createChainManifest({
      candidate_id: candidateId,
      chain_revision: 2,
      parent_chain_sha256: baseChainSha256,
      checkpoint_envelopes: envelopes,
      frozen_design_sha256: validated.chain.frozen_design_sha256,
      frozen_generator_context_sha256: validated.chain.frozen_generator_context_sha256,
      blueprint_sha256: blueprintSha256,
      hard_qa_sha256: hardQaSha256,
      p4_review_sha256: p4ReviewSha256,
      repair_transaction_sha256: transactionSha256,
      eligibility: playbookEligibility,
      created_from: 'replay'
    });
    const files = Object.fromEntries(Object.entries(stored.files).filter(([name]) => (
      name !== 'current-chain.json' && !name.startsWith('failures/') && !name.startsWith('repairs/')
    )));
    for (const envelope of envelopes.slice(start)) {
      files[`checkpoints/${envelope.checkpoint.layer}/r${pad(envelope.checkpoint.revision)}.json`] = checkpointBytes(envelope);
    }
    files['blueprints/chain-0002.json'] = Buffer.from(blueprintBytes);
    files['reviews/chain-0002-hard-qa.json'] = hardQaBytes;
    files['reviews/chain-0002-review.json'] = p4ReviewBytes;
    Object.assign(files, executableArtifacts.files);
    files['repairs/attempt-01-request.json'] = requestBytes;
    files['repairs/attempt-01-patch.json'] = bytes(validated.transaction);
    files['repairs/attempt-01-result.json'] = resultBytes;
    await installCandidateSnapshot({
      authority,
      candidateId,
      files,
      currentChain: chainManifestBytes(chain),
      expectedPreviousChainSha256: baseChainSha256,
      fsImpl
    });
    return deepFreeze({
      status: 'complete',
      candidate_id: candidateId,
      base_chain_sha256: baseChainSha256,
      repair_transaction_sha256: transactionSha256,
      current_chain_sha256: chainManifestHash(chain),
      current_chain: chain,
      checkpoint_envelopes: envelopes,
      compiled_result: compiledResult,
      hard_qa: hardQa,
      p4_review: p4Review,
      playbook_eligibility: playbookEligibility,
      evidence: {
        repair_request_sha256: sha256(requestBytes),
        repair_result_sha256: resultSha256
      }
    });
  } catch (error) {
    const publicError = sanitizeExecuteError(error, 'P5_REPLAY_FAILED');
    if (attemptDir) {
      try { await removeReplayWorkspace({ authority, workspacePath: attemptDir, fsImpl }); } catch {}
    }
    if (authority && candidateId && baseChainSha256 && transactionSha256) {
      try {
        await appendCandidateFailureEvidence({
          authority,
          candidateId,
          expectedCurrentChainSha256: baseChainSha256,
          fsImpl,
          evidence: {
            schema_version: EXECUTE_SCHEMA_VERSION,
            candidate_id: candidateId,
            attempt: 1,
            code: publicError.code,
            base_chain_sha256: baseChainSha256,
            repair_transaction_sha256: transactionSha256,
            current_chain_sha256: baseChainSha256
          }
        });
      } catch {}
    }
    throw publicError;
  }
}

function loadPersistedAuthority(stored, candidateId, transactionInput) {
  if (!stored || stored.candidate_id !== candidateId) authorityInvalid();
  const frozenDesign = parseCanonical(stored.files[FROZEN_DESIGN_PATH], validateFrozenDesignEnvelope, 'P5_DESIGN_INVALID');
  const context = parseCanonical(stored.files[FROZEN_CONTEXT_PATH], validateFrozenGeneratorContext, 'P5_DESIGN_INVALID');
  const chain = parseCanonical(stored.current_chain, validateChainManifest, 'P5_CHECKPOINT_INVALID');
  const transaction = validateRepairTransaction(transactionInput);
  const baseChainSha256 = chainManifestHash(chain);
  const transactionSha256 = sha256(stableJson(transaction));
  if (chain.chain_revision !== 1 || chain.created_from !== 'initial'
    || chain.repair_transaction_sha256 !== null || chain.eligibility.repair_budget_used !== 0
    || stored.current_chain_sha256 !== baseChainSha256
    || frozenDesign.candidate_id !== candidateId || context.candidate_id !== candidateId
    || frozenDesign.seed !== context.seed
    || sha256(stored.files[FROZEN_DESIGN_PATH]) !== chain.frozen_design_sha256
    || sha256(stored.files[FROZEN_CONTEXT_PATH]) !== chain.frozen_generator_context_sha256
    || context.frozen_design_sha256 !== chain.frozen_design_sha256
    || transaction.candidate_id !== candidateId
    || transaction.base_chain_sha256 !== baseChainSha256) stale();
  const envelopes = chain.checkpoint_hashes.map((row) => {
    const entry = Object.entries(stored.files).find(([name, body]) => (
      name.startsWith(`checkpoints/${row.layer}/`) && sha256(body) === row.checkpoint_sha256
    ));
    if (!entry) stale();
    const checkpoint = parseCanonical(entry[1], (value) => value, 'P5_CHECKPOINT_INVALID');
    return validateCheckpointEnvelope({ checkpoint_sha256: row.checkpoint_sha256, checkpoint });
  });
  const hardQa = parseCanonical(stored.files['reviews/chain-0001-hard-qa.json'], (value) => value, 'P5_AUTHORITY_INVALID');
  const p4Review = parseCanonical(stored.files['reviews/chain-0001-review.json'], (value) => value, 'P5_AUTHORITY_INVALID');
  if (sha256(stored.files['reviews/chain-0001-hard-qa.json']) !== chain.hard_qa_sha256
    || sha256(stored.files['reviews/chain-0001-review.json']) !== chain.p4_review_sha256) stale();
  const rebuilt = buildRepairTransaction({
    candidateId,
    review: p4Review,
    frozenDesign,
    baseChainSha256,
    acceptedChain: chain,
    checkpointEnvelopes: envelopes
  });
  if (stableJson(rebuilt) !== stableJson(transaction) || sha256(stableJson(rebuilt)) !== transactionSha256) {
    throw executeError('P5_REPAIR_INVALID');
  }
  return {
    frozenDesign, context, chain, transaction, envelopes, hardQa, p4Review,
    eligibility: chain.eligibility, candidateId, baseChainSha256, transactionSha256
  };
}

function validateLegacyRuntimeCandidate(candidate, persisted) {
  if (!isPlainObject(candidate) || Reflect.ownKeys(candidate).length !== CANDIDATE_FIELDS.length
    || CANDIDATE_FIELDS.some((field) => !Object.hasOwn(candidate, field))) authorityInvalid();
  const equal = (left, right) => stableJson(left) === stableJson(right);
  let runtimeContext;
  try {
    runtimeContext = validateFrozenGeneratorContext(candidate.frozen_generator_context);
  } catch {
    authorityInvalid();
  }
  if (candidate.candidate_id !== persisted.candidateId || candidate.seed !== persisted.context.seed
    || !equal(candidate.frozen_design, persisted.frozenDesign)
    || !equal(runtimeContext, persisted.context)
    || !equal(candidate.current_chain, persisted.chain)
    || !equal(candidate.checkpoint_envelopes, persisted.envelopes)
    || !equal(candidate.hard_qa, persisted.hardQa)
    || !equal(candidate.p4_review, persisted.p4Review)
    || !equal(candidate.playbook_eligibility, persisted.eligibility)) authorityInvalid();
  const runtime = candidate.prepared_design;
  if (!isPlainObject(runtime)
    || runtime.mode !== persisted.context.mode
    || runtime.mcVersion !== persisted.context.mc_version
    || runtime.seedSource !== persisted.context.seed_source
    || Boolean(runtime.critics) !== persisted.context.critics
    || runtime.llmProvider !== persisted.context.llm_provider
    || !equal(runtime.llmUsage, persisted.context.llm_usage)
    || !equal(runtime.architecture, persisted.context.architecture)
    || !equal(runtime.topology, persisted.context.topology)
    || !equal(runtime.creativeDesign, persisted.context.creative_design)
    || !equal(runtime.conceptStudio || null, persisted.context.concept_studio)
    || !equal(runtime.stage7Shadow || null, persisted.context.stage7_shadow)
    || !equal(runtime.buildSpec, persisted.context.build_spec)
    || !equal(runtime.stylePreset, persisted.context.style_preset)
    || !equal(runtime.materialPalette, persisted.context.material_palette)
    || !equal(runtime.templateKnowledge, persisted.context.template_knowledge)) authorityInvalid();
}

function parseCanonical(body, validator, code) {
  try {
    if (!Buffer.isBuffer(body)) throw executeError(code);
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!isPlainObject(value) || stableJson(value) !== body.toString('utf8')) throw executeError(code);
    return validator(value);
  } catch (error) {
    if (error?.code?.startsWith('P5_')) throw error;
    throw executeError(code);
  }
}

function requestProjection(patch) {
  return {
    schema_version: patch.schema_version,
    candidate_id: patch.candidate_id,
    rule_id: patch.rule_id,
    repair_operation_id: patch.repair_operation_id,
    variant_id: patch.variant_id,
    base_checkpoint_sha256: patch.base_checkpoint_sha256
  };
}

async function exactBlueprintBytes(result) {
  if (typeof result.artifacts?.blueprint !== 'string') replayFailed();
  try {
    const exact = await fs.readFile(result.artifacts.blueprint);
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(exact));
    if (!isPlainObject(parsed) || stableJson(parsed) !== stableJson(result.blueprint)) replayFailed();
    return exact;
  } catch (error) {
    if (error?.code === 'P5_REPLAY_FAILED') throw error;
    replayFailed();
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

async function hit(injector, boundary) {
  if (injector === undefined) return;
  if (typeof injector !== 'function') authorityInvalid();
  await injector(boundary);
}

function bytes(value) { return Buffer.from(stableJson(value)); }
function pad(value) { return String(value).padStart(4, '0'); }
function stale() { throw executeError('P5_STALE_BASE'); }
function replayFailed() { throw executeError('P5_REPLAY_FAILED'); }
function authorityInvalid() { throw executeError('P5_AUTHORITY_INVALID'); }
