import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { CandidateSelectionAgent } from '../../construction/agents/candidateSelectionAgent.js';
import { BlueprintQAAgent } from '../../construction/agents/blueprintQaAgent.js';
import { candidateSeedFor, installSelectedDatapackSafely } from '../../construction/candidatePipelineSupport.js';
import { compileDesignLayers, prepareConstructionDesign } from '../../construction/designStages.js';
import { compilePreparedConstruction } from '../../construction/workflow.js';
import { createLlmClient } from '../../llm/createLlmClient.js';
import { createTimestamp } from '../../lib/fs.js';
import { hashReplayArtifacts, snapshotReplayArtifacts } from './artifactAuthority.js';
import { chainManifestBytes, chainManifestHash, checkpointBytes, createChainManifest, createCheckpointEnvelope } from './checkpoints.js';
import { DESIGN_LAYER_ORDER, INVALIDATES_BY_LAYER } from './constants.js';
import { executeError, sanitizeExecuteError, validateExecuteOptions, validateSelectionRecord } from './contracts.js';
import { createFrozenDesignEnvelope } from './designEnvelope.js';
import { evaluateExecuteEligibility, executableViolations } from './eligibility.js';
import { buildRepairTransaction } from './repairTransaction.js';
import { replayCandidate } from './replay.js';
import { renderExecuteSelectionReport } from './report.js';
import { appendCandidateRepairPlanningFailureEvidence, createCandidateWorkspace, createExecuteRun, inspectCandidateEvidence, installCandidateSnapshot, installExecuteSelection, installInitialCandidateFailure, pruneCandidateWorkspaces, readCurrentCandidateSnapshot } from './storage.js';
import { FROZEN_CONTEXT_PATH, FROZEN_DESIGN_PATH, selectionProjectionForCandidateEvidence } from './storageValidation.js';
import { buildDeterministicShadowReview } from '../shadow/runShadowReview.js';
import { loadShadowCorpus } from '../shadow/corpus.js';
import { sha256, stableJson } from '../shadow/canonical.js';

const MAX_RANDOM_SEED = 2147483647;
const DEFAULT_TARGET_SCORE = 95;
const DEPENDENCY_KEYS = Object.freeze([
  'createClient', 'createEnvelope', 'prepareDesign', 'compileLayers', 'compilePrepared',
  'buildReview', 'buildTransaction', 'replay', 'createSelectionAgent', 'installSelected',
  'createRun', 'loadCorpus', 'publishSelection', 'renderSelection', 'pruneWorkspaces',
  'closeAuthority'
]);
const DEFAULT_DEPENDENCIES = Object.freeze({
  createClient: createLlmClient, createEnvelope: createFrozenDesignEnvelope,
  prepareDesign: prepareConstructionDesign, compileLayers: compileDesignLayers,
  compilePrepared: compilePreparedConstruction, buildReview: buildDeterministicShadowReview,
  buildTransaction: buildRepairTransaction, replay: replayCandidate,
  createSelectionAgent: () => new CandidateSelectionAgent(), installSelected: installSelectedDatapackSafely,
  createRun: createExecuteRun, loadCorpus: loadShadowCorpus,
  publishSelection: installExecuteSelection, renderSelection: renderExecuteSelectionReport,
  pruneWorkspaces: pruneCandidateWorkspaces, closeAuthority: (authority) => authority.close()
});

export async function runExecutablePlaybookPipeline(options = {}, dependencies = {}) {
  let deps;
  let authority;
  let stage = 'dependencies';
  let failure;
  let outcome;
  let retainedWorkspace;
  let externalCommitted = false;
  try {
    deps = resolveDependencies(dependencies);
    stage = 'options';
    const normalized = validateExecuteOptions(Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)));
    if (normalized.playbook !== 'execute') throw executeError('P5_MODE_INVALID');
    if (!normalized.prompt?.trim() || normalized.coarseVoxelMode === 'shadow' && normalized.coarseVoxelProvider === 'artifact') throw executeError('P5_OPTIONS_INCOMPATIBLE');
    const projectRoot = path.resolve(normalized.cwd || process.cwd());
    const seedPlan = resolveSeed(normalized.seed);
    stage = 'create-run';
    const created = await deps.createRun({
      outRoot: path.resolve(normalized.outRoot || path.join(projectRoot, 'out')),
      runBasename: createTimestamp()
    });
    ({ authority } = created);
    const { runDir } = created;
    stage = 'corpus';
    const cards = (await deps.loadCorpus({ projectRoot })).cards;
    stage = 'candidates';
    const records = [];
    for (let index = 1; index <= 3; index += 1) records.push(await executeCandidate({ index, normalized, seedPlan, runDir, projectRoot, authority, cards, deps }));
    const eligibleRecords = records.filter((record) => record.playbookEligibility.status === 'eligible');
    const targetScore = clampInt(normalized.candidateTargetScore, 0, 100, DEFAULT_TARGET_SCORE);
    const ranked = deps.createSelectionAgent().run(eligibleRecords.map((record) => record.rankerRecord), { targetScore, scope: 'playbook-execute' });
    const selected = records.find((record) => record.candidateId === ranked.selected_candidate_id);
    const selection = createSelection(records, selected, ranked);
    if (!selected) {
      if (records.every((record) => record.failureCode === 'P5_DESIGN_INVALID')) {
        throw executeError('P5_DESIGN_INVALID');
      }
      throw executeError('P5_NO_ELIGIBLE_CANDIDATE');
    }
    const selectedArtifactHashes = await revalidateSelected({ authority, selected });
    const selectionBytes = Buffer.from(stableJson(selection));
    stage = 'selection-render';
    const reportBytes = Buffer.from(deps.renderSelection(selection));
    const manifest = { schema_version: 1, managed_paths: ['manifest.json', 'selection.json', 'selection-report.md'], artifact_hashes: { 'selection.json': sha256(selectionBytes), 'selection-report.md': sha256(reportBytes) } };
    stage = 'workspace-prune';
    await deps.pruneWorkspaces({ authority, keepPath: selected.result.outputDir });
    stage = 'selection-publication';
    const publication = await deps.publishSelection({ authority, files: { 'manifest.json': Buffer.from(stableJson(manifest)), 'selection.json': selectionBytes, 'selection-report.md': reportBytes } });
    stage = 'install';
    const installed = await deps.installSelected(selected.result.artifacts.datapackDir, {
      minecraftDir: normalized.minecraftDir, world: normalized.world, datapacksDir: normalized.datapacksDir,
      expectedDatapackTreeSha256: selectedArtifactHashes.datapack_tree_sha256
    });
    externalCommitted = true;
    retainedWorkspace = selected.result.outputDir;
    const selectionGeneration = path.join(runDir, 'playbook-execute', publication.generation);
    const artifacts = { ...selected.result.artifacts,
      playbookExecutionManifest: path.join(selectionGeneration, 'manifest.json'),
      playbookExecutionSelection: path.join(selectionGeneration, 'selection.json'),
      playbookExecutionReport: path.join(selectionGeneration, 'selection-report.md') };
    if (installed) artifacts.installedDatapackDir = installed;
    outcome = { ...selected.result, outputDir: runDir, selectedOutputDir: selected.result.outputDir, seed: selected.seed,
      seedSource: `${seedPlan.source}-candidate-selected`, artifacts,
      playbookExecution: { mode: 'execute', candidate_count: 3, selected_candidate_id: selected.candidateId,
        selected_chain_sha256: selected.currentChainSha256, repair_attempt_count: selection.repair_attempt_count,
        candidates: selection.candidates } };
  } catch (error) {
    failure = sanitizeExecuteError(error, executeStageFallback(stage));
  } finally {
    if (authority) {
      try { await deps.pruneWorkspaces({ authority, keepPath: externalCommitted ? retainedWorkspace : null }); }
      catch (error) {
        if (!externalCommitted && !failure) failure = sanitizeExecuteError(error, 'P5_INSTALL_FAILED');
      }
      try { await deps.closeAuthority(authority); }
      catch (error) {
        if (!externalCommitted && !failure) failure = sanitizeExecuteError(error, 'P5_AUTHORITY_INVALID');
      }
    }
  }
  if (failure) throw failure;
  return outcome;
}

async function executeCandidate({ index, normalized, seedPlan, runDir, projectRoot, authority, cards, deps }) {
  const candidateId = `candidate-${String(index).padStart(2, '0')}`;
  const seed = candidateSeedFor(seedPlan.seed, 1, index);
  const candidateDir = await createCandidateWorkspace({ authority, candidateId });
  let frozenDesign; let prepared; let compiled; let result; let hardQa; let review;
  let frozenDesignSha256 = null; let contextSha256 = null; let blueprintSha256 = null; let hardQaSha256 = null; let reviewSha256 = null;
  try {
    const client = normalized.mode === 'mock'
      ? undefined
      : deps.createClient({ cwd: projectRoot, provider: normalized.llmProvider });
    frozenDesign = await deps.createEnvelope({ mode: normalized.mode, candidateId, seed, prompt: normalized.prompt, cards, client });
    frozenDesignSha256 = sha256(stableJson(frozenDesign));
    prepared = await deps.prepareDesign({ prompt: normalized.prompt, mode: normalized.mode, mcVersion: normalized.mcVersion,
      outputDir: candidateDir, seed, seedSource: `${seedPlan.source}-candidate`, cwd: projectRoot,
      conceptCount: clampInt(normalized.concepts, 0, 5, 0), conceptStrategy: normalized.conceptStrategy || 'select',
      critics: normalized.critics, neuralRetrieval: normalized.neuralRetrieval, coarseVoxelMode: normalized.coarseVoxelMode,
      coarseVoxelProvider: normalized.coarseVoxelProvider, coarseVoxelPlan: normalized.coarseVoxelPlan,
      candidateId, frozenDesignSha256, frozenDesign, llmClient: client });
    contextSha256 = sha256(stableJson(prepared.frozen_generator_context));
    compiled = deps.compileLayers({ prepared, layerPayloads: undefined, resolvedEffectsByLayer: {} });
    result = await deps.compilePrepared({ prepared, compiledLayers: compiled, outputDir: candidateDir,
      world: undefined, datapacksDir: undefined, minecraftDir: undefined, autoBuild: false });
    const blueprintBytes = await fs.readFile(result.artifacts.blueprint);
    blueprintSha256 = sha256(blueprintBytes);
    hardQa = new BlueprintQAAgent().run(result.blueprint); hardQaSha256 = sha256(stableJson(hardQa));
    review = await deps.buildReview({ projectRoot, blueprintBytes, blueprintRelativePath: 'blueprint.json' }); reviewSha256 = sha256(stableJson(review));
    const candidateAuthority = { blueprint_sha256: blueprintSha256, workflow: 'construction_method_v1', seed };
    if (!hardQa.ok) {
      await installInitialFailure({ authority, candidateId, stage: 'hard-qa', code: 'P5_HARD_QA_FAILED', frozenDesignSha256, contextSha256, blueprintSha256, hardQa, hardQaSha256, review, reviewSha256 });
      return failedRecord(candidateId, seed, evaluateExecuteEligibility({ review, hardQa: { ok: false }, repairBudgetUsed: 0, candidateAuthority }));
    }
    let eligibility = evaluateExecuteEligibility({ review, hardQa: { ok: true }, repairBudgetUsed: 0, candidateAuthority });
    const executableArtifacts = await snapshotReplayArtifacts({ compiledResult: result });
    const artifactHashes = executableArtifacts.hashes;
    const envelopes = initialCheckpoints({ candidateId, frozenDesign, compiled, hardQa, hardQaSha256, reviewSha256, artifactHashes });
    const chain = createChainManifest({ candidate_id: candidateId, chain_revision: 1, parent_chain_sha256: null,
      checkpoint_envelopes: envelopes, frozen_design_sha256: frozenDesignSha256, frozen_generator_context_sha256: contextSha256,
      blueprint_sha256: blueprintSha256, hard_qa_sha256: hardQaSha256, p4_review_sha256: reviewSha256,
      repair_transaction_sha256: null, eligibility, created_from: 'initial' });
    const chainSha256 = chainManifestHash(chain);
    const files = Object.fromEntries(envelopes.map((envelope) => [`checkpoints/${envelope.checkpoint.layer}/r0001.json`, checkpointBytes(envelope)]));
    files[FROZEN_DESIGN_PATH] = Buffer.from(stableJson(frozenDesign));
    files[FROZEN_CONTEXT_PATH] = Buffer.from(stableJson(prepared.frozen_generator_context));
    Object.assign(files, executableArtifacts.files);
    files['blueprints/chain-0001.json'] = Buffer.from(blueprintBytes);
    files['reviews/chain-0001-hard-qa.json'] = Buffer.from(stableJson(hardQa)); files['reviews/chain-0001-review.json'] = Buffer.from(stableJson(review));
    await installCandidateSnapshot({ authority, candidateId, files, currentChain: chainManifestBytes(chain), expectedPreviousChainSha256: null });
    let current = { chain, chainSha256, result, hardQa, review, eligibility }; let repairAttempts = 0;
    if (eligibility.status !== 'eligible' && executableViolations(review).length > 0) {
      repairAttempts = 1;
      const transaction = deps.buildTransaction({ candidateId, review, frozenDesign, baseChainSha256: chainSha256, acceptedChain: chain, checkpointEnvelopes: envelopes });
      const replayed = await deps.replay({ authority, candidateId, transaction, projectRoot, compilePrepared: deps.compilePrepared });
      current = { chain: replayed.current_chain, chainSha256: replayed.current_chain_sha256, result: replayed.compiled_result,
        hardQa: replayed.hard_qa, review: replayed.p4_review, eligibility: replayed.playbook_eligibility };
    }
    return acceptedRecord(candidateId, seed, repairAttempts, current);
  } catch (error) {
    if (['P5_AUTHORITY_INVALID', 'P5_OUTPUT_OWNERSHIP'].includes(error?.code)) throw error;
    if (['P5_REPAIR_INVALID', 'P5_REPAIR_CONFLICT', 'P5_STALE_BASE'].includes(error?.code)) {
      try {
        const accepted = await inspectCandidateEvidence({ authority, candidateId });
        if (accepted.kind === 'accepted') {
          await appendCandidateRepairPlanningFailureEvidence({ authority, candidateId,
            expectedCurrentChainSha256: accepted.current_chain_sha256,
            evidence: { schema_version: 1, candidate_id: candidateId, attempt: 1, code: error.code,
              base_chain_sha256: accepted.current_chain_sha256, repair_transaction_sha256: null,
              current_chain_sha256: accepted.current_chain_sha256 } });
        }
      } catch {}
    }
    try {
      const existing = await inspectCandidateEvidence({ authority, candidateId });
      if (existing.kind === 'accepted') {
        const chain = JSON.parse(existing.current_chain.toString('utf8'));
        const projection = selectionProjectionForCandidateEvidence(candidateId, existing.files);
        return acceptedRecord(candidateId, seed, projection.repair_attempt_count,
          { chain, chainSha256: existing.current_chain_sha256, result, hardQa, review, eligibility: projection.eligibility });
      }
    } catch {}
    const stage = frozenDesignSha256 === null ? 'design' : contextSha256 === null || result === undefined ? 'compile' : hardQaSha256 === null ? 'hard-qa' : 'p4-review';
    const sanitized = sanitizeExecuteError(error, stage === 'design' ? 'P5_DESIGN_INVALID' : 'P5_REPLAY_FAILED');
    await installInitialFailure({ authority, candidateId, stage,
      code: sanitized.code,
      frozenDesignSha256, contextSha256, blueprintSha256, hardQa, hardQaSha256, review, reviewSha256 });
    return failedRecord(candidateId, seed, fallbackEligibility(hardQa, 0), sanitized.code);
  }
}

function initialCheckpoints({ candidateId, frozenDesign, compiled, hardQa, hardQaSha256, reviewSha256, artifactHashes }) {
  const envelopes = [];
  for (const layer of DESIGN_LAYER_ORDER) {
    const hashes = { layer_payload_sha256: sha256(stableJson(compiled[layer])) }; if (layer === 'facade') Object.assign(hashes, artifactHashes);
    envelopes.push(createCheckpointEnvelope({ build_id: `${candidateId}-initial`, candidate_id: candidateId, layer, revision: 1,
      status: 'accepted', preceding_envelopes: envelopes, selected_rule_ids: frozenDesign.selected_rule_ids,
      rejected_rule_ids: frozenDesign.rejected_rule_ids, design_intent: frozenDesign.layer_intents.find((row) => row.layer === layer),
      recipe_fragment: { layer, payload: compiled[layer] }, field_patches: [], compiled_artifact_hashes: hashes,
      hard_qa: { hard_qa_ok: hardQa.ok, hard_qa_sha256: hardQaSha256 }, design_review: { p4_review_sha256: reviewSha256 },
      invalidates_downstream: INVALIDATES_BY_LAYER[layer], replay_origin: null }));
  }
  return envelopes;
}

async function installInitialFailure({ authority, candidateId, stage, code, frozenDesignSha256, contextSha256, blueprintSha256, hardQa, hardQaSha256, review, reviewSha256 }) {
  const files = {}; const artifact_hashes = {};
  if (hardQaSha256 && hardQa) { files['reviews/initial-hard-qa.json'] = Buffer.from(stableJson(hardQa)); artifact_hashes['reviews/initial-hard-qa.json'] = hardQaSha256; }
  if (reviewSha256 && review) { files['reviews/initial-review.json'] = Buffer.from(stableJson(review)); artifact_hashes['reviews/initial-review.json'] = reviewSha256; }
  files['failures/initial.json'] = Buffer.from(stableJson({ schema_version: 1, candidate_id: candidateId, stage, code,
    frozen_design_sha256: frozenDesignSha256, frozen_generator_context_sha256: contextSha256, blueprint_sha256: blueprintSha256,
    hard_qa_sha256: hardQaSha256, p4_review_sha256: reviewSha256, artifact_hashes }));
  await installInitialCandidateFailure({ authority, candidateId, files });
}

function acceptedRecord(candidateId, seed, repairAttempts, current) {
  return { candidateId, seed, repairAttempts, currentChainSha256: current.chainSha256, hardQaSha256: current.chain.hard_qa_sha256,
    reviewSha256: current.chain.p4_review_sha256, playbookEligibility: current.eligibility, result: current.result,
    rankerRecord: { id: candidateId, ok: true, round: 1, index: Number(candidateId.at(-1)), seed, result: current.result } };
}
function failedRecord(candidateId, seed, eligibility, failureCode = null) { return { candidateId, seed, repairAttempts: 0, currentChainSha256: null,
  hardQaSha256: null, reviewSha256: null, playbookEligibility: eligibility, result: undefined, rankerRecord: undefined, failureCode }; }
function createSelection(records, selected, ranked) { return validateSelectionRecord({ schema_version: 1, mode: 'execute', candidate_count: 3,
  candidates: records.map((record) => ({ candidate_id: record.candidateId, seed: record.seed, current_chain_sha256: record.currentChainSha256,
    hard_qa_sha256: record.hardQaSha256, p4_review_sha256: record.reviewSha256, eligibility: record.playbookEligibility,
    repair_attempt_count: record.repairAttempts })), selected_candidate_id: selected?.candidateId ?? null,
  selected_chain_sha256: selected?.currentChainSha256 ?? null, repair_attempt_count: records.reduce((sum, row) => sum + row.repairAttempts, 0),
  ranker_result: JSON.parse(JSON.stringify(ranked)) }); }
async function revalidateSelected({ authority, selected }) {
  try {
    const reopened = await readCurrentCandidateSnapshot({ authority, candidateId: selected.candidateId });
    if (reopened.current_chain_sha256 !== selected.currentChainSha256) installFailed();
    const projection = selectionProjectionForCandidateEvidence(selected.candidateId, reopened.files, { requireCurrentReviews: true });
    if (projection.kind !== 'accepted' || projection.eligibility.status !== 'eligible'
      || projection.hard_qa_sha256 !== selected.hardQaSha256 || projection.p4_review_sha256 !== selected.reviewSha256) installFailed();
    const current = JSON.parse(reopened.current_chain.toString('utf8')); const facadeHash = current.checkpoint_hashes.at(-1).checkpoint_sha256;
    const facadePath = Object.keys(reopened.files).find((name) => name.startsWith('checkpoints/facade/') && sha256(reopened.files[name]) === facadeHash);
    if (!facadePath || sha256(await fs.readFile(selected.result.artifacts.blueprint)) !== current.blueprint_sha256) installFailed();
    const facade = JSON.parse(reopened.files[facadePath].toString('utf8')); const hashes = await hashReplayArtifacts({ compiledResult: selected.result });
    for (const [key, value] of Object.entries(hashes)) if (facade.compiled_artifact_hashes[key] !== value) installFailed();
    return hashes;
  } catch {
    installFailed();
  }
}
function resolveDependencies(input) { if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !DEPENDENCY_KEYS.includes(key))) throw executeError('P5_AUTHORITY_INVALID');
  const value = { ...DEFAULT_DEPENDENCIES, ...input }; if (Object.values(value).some((item) => typeof item !== 'function')) throw executeError('P5_AUTHORITY_INVALID'); return Object.freeze(value); }
function resolveSeed(seed) { if (seed === undefined || seed === null || seed === '') return { seed: randomInt(1, MAX_RANDOM_SEED), source: 'random' }; const value = Number(seed); if (!Number.isFinite(value)) throw executeError('P5_OPTIONS_INCOMPATIBLE'); return { seed: Math.trunc(value), source: 'manual' }; }
function clampInt(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback; }
function fallbackEligibility(hardQa, budget) { return { status: hardQa?.ok === false ? 'hard-qa-failed' : 'replay-failed', hard_qa_ok: Boolean(hardQa?.ok), unresolved_violated_core_rule_ids: [], neutral_unknown_rule_ids: [], neutral_not_applicable_rule_ids: [], repair_budget_used: budget }; }
function executeStageFallback(stage) {
  if (stage === 'options') return 'P5_OPTIONS_INCOMPATIBLE';
  if (['selection-render', 'workspace-prune', 'selection-publication', 'install'].includes(stage)) return 'P5_INSTALL_FAILED';
  return 'P5_AUTHORITY_INVALID';
}
function installFailed() { throw executeError('P5_INSTALL_FAILED'); }
