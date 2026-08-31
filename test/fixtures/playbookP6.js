import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BlueprintQAAgent } from '../../src/construction/agents/blueprintQaAgent.js';
import { buildFrozenGeneratorContext, compileDesignLayers, prepareConstructionDesign } from '../../src/construction/designStages.js';
import { compilePreparedConstruction } from '../../src/construction/workflow.js';
import { chainManifestBytes, checkpointBytes, createChainManifest, createCheckpointEnvelope } from '../../src/playbook/execute/checkpoints.js';
import { buildDeterministicShadowReview } from '../../src/playbook/shadow/runShadowReview.js';
import { admitExecuteRun, installCandidateSnapshot, readCurrentCandidateSnapshot } from '../../src/playbook/execute/storage.js';
import { INVALIDATES_BY_LAYER } from '../../src/playbook/execute/constants.js';
import { P6_FIXED_REQUEST } from '../../src/playbook/p6/constants.js';
import { sha256, stableJson } from '../../src/playbook/shadow/canonical.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LAYERS = ['brief', 'massing', 'structure', 'roof', 'facade'];
const COMMIT = P6_FIXED_REQUEST.generator_commit;
const OPTIONS = { mode: 'mock', candidate_count: 3, candidate_rounds: 1, candidate_force_rounds: false, concepts: 0, concept_strategy: 'select', critics: false, neural_retrieval: false, coarse_voxel_mode: 'off', coarse_voxel_provider: 'baseline', coarse_voxel_plan: null };
let sourcePromise;

export async function createP6CohortFixture(t, overrides = {}) {
  const source = await (sourcePromise ||= buildSource());
  const snapshot_root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cohort-snapshots-'));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await fs.rm(snapshot_root, { recursive: true, force: true });
  };
  t.after(close);
  const playbook = await snapshotAuthority(makePlaybook(source, overrides), snapshot_root, 'playbook');
  const baseline = await snapshotAuthority(makeBaseline(source, overrides), snapshot_root, 'baseline');
  return Object.freeze({
    fixedRequest: structuredClone(P6_FIXED_REQUEST),
    playbookAuthority: playbook.value,
    baselineAuthority: baseline.value,
    node_evidence: Object.freeze([...playbook.evidence, ...baseline.evidence]),
    snapshot_root,
    close
  });
}

async function buildSource() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-p5-source-'));
  try {
    const base = { schema_version: 1, candidate_id: 'candidate-01', seed: 424242, brief_intent: 'P6 authority fixture', layer_intents: LAYERS.map(layer => ({ layer, intent: `${layer} authority` })), selected_rule_ids: ['rule:medieval.show-load-path'], rejected_rule_ids: ['rule:facade.break-repetitive-bays'], repair_variant_preferences: [] };
    const body = Buffer.from(stableJson(base));
    const prepared = await prepareConstructionDesign({ prompt: P6_FIXED_REQUEST.prompt, mode: 'mock', outputDir: root, seed: 424242, seedSource: 'manual', candidateId: 'candidate-01', frozenDesign: base, frozenDesignSha256: sha256(body), critics: false, cwd: ROOT });
    const layers = compileDesignLayers({ prepared, resolvedEffectsByLayer: {} });
    const compiled = await compilePreparedConstruction({ prepared, compiledLayers: layers, outputDir: root });
    const blueprint = JSON.parse(await fs.readFile(compiled.artifacts.blueprint));
    blueprint.bounds = { min_x: 0, min_y: 0, min_z: 0, max_x: 20, max_y: 20, max_z: 20 };
    blueprint.opening ||= {}; blueprint.opening.main_entry = { side: 'south', center_x: 10, center_y: 4, center_z: 20 };
    const blueprintBytes = Buffer.from(stableJson(blueprint)); await fs.writeFile(compiled.artifacts.blueprint, blueprintBytes);
    const hardQa = new BlueprintQAAgent().run(blueprint); if (!hardQa.ok) throw new Error('fixture hard QA failed');
    const hardQaBytes = Buffer.from(stableJson(hardQa)); const reviewBytes = Buffer.from(stableJson(await buildDeterministicShadowReview({ projectRoot: ROOT, blueprintBytes, blueprintRelativePath: 'blueprint.json' })));
    const build = await fs.readFile(compiled.artifacts.buildFunction); const operations = Buffer.from(stableJson(blueprint.operations));
    const artifacts = { operation_list_sha256: sha256(operations), build_function_sha256: sha256(build), datapack_tree_sha256: 'e'.repeat(64) };
    const runDir = path.join(root, 'run'); await fs.mkdir(runDir); const store = await admitExecuteRun({ runDir }); const slots = [];
    for (const candidate_id of ['candidate-01', 'candidate-02', 'candidate-03']) {
      const design = { ...base, candidate_id }; const designBytes = Buffer.from(stableJson(design)); const contextBytes = Buffer.from(stableJson(buildFrozenGeneratorContext({ ...prepared.frozen_generator_context, candidate_id, seed: 424242, frozen_design_sha256: sha256(designBytes) })));
      const envelopes = [];
      for (const layer of LAYERS) envelopes.push(createCheckpointEnvelope({ build_id: `${candidate_id}-p6`, candidate_id, layer, revision: 1, status: 'accepted', preceding_envelopes: envelopes, selected_rule_ids: design.selected_rule_ids, rejected_rule_ids: design.rejected_rule_ids, design_intent: design.layer_intents.find(row => row.layer === layer), recipe_fragment: { layer, payload: layers[layer] }, field_patches: [], compiled_artifact_hashes: layer === 'facade' ? { layer_payload_sha256: sha256(stableJson(layers[layer])), ...artifacts } : { layer_payload_sha256: sha256(stableJson(layers[layer])) }, hard_qa: { hard_qa_ok: true, hard_qa_sha256: sha256(hardQaBytes) }, design_review: { p4_review_sha256: sha256(reviewBytes) }, invalidates_downstream: INVALIDATES_BY_LAYER[layer], replay_origin: null }));
      const chain = createChainManifest({ candidate_id, chain_revision: 1, parent_chain_sha256: null, checkpoint_envelopes: envelopes, frozen_design_sha256: sha256(designBytes), frozen_generator_context_sha256: sha256(contextBytes), blueprint_sha256: sha256(blueprintBytes), hard_qa_sha256: sha256(hardQaBytes), p4_review_sha256: sha256(reviewBytes), repair_transaction_sha256: null, eligibility: { status: 'eligible', hard_qa_ok: true, unresolved_violated_core_rule_ids: [], neutral_unknown_rule_ids: ['rule:facade.break-repetitive-bays'], neutral_not_applicable_rule_ids: [], repair_budget_used: 0 }, created_from: 'initial' });
      const files = Object.fromEntries(envelopes.map(item => [`checkpoints/${item.checkpoint.layer}/r0001.json`, checkpointBytes(item)])); Object.assign(files, { 'frozen/frozen-design.json': designBytes, 'frozen/frozen-generator-context.json': contextBytes, 'artifacts/chain-0001-operation-list.json': operations, 'artifacts/chain-0001-build.mcfunction': build, 'blueprints/chain-0001.json': blueprintBytes, 'reviews/chain-0001-hard-qa.json': hardQaBytes, 'reviews/chain-0001-review.json': reviewBytes });
      await installCandidateSnapshot({ authority: store, candidateId: candidate_id, files, currentChain: chainManifestBytes(chain), expectedPreviousChainSha256: null }); slots.push(await readCurrentCandidateSnapshot({ authority: store, candidateId: candidate_id }));
    }
    await store.close(); return { slots, blueprint: blueprintBytes, operations, build, hardQa: hardQaBytes, review: reviewBytes };
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

function makePlaybook(source, { defect, selectionRank } = {}) {
  const value = { schema_version: 1, kind: 'p5-run-snapshot', run_id: 'p5-fixed-run', request: file(Buffer.from(stableJson(P6_FIXED_REQUEST))), generator_commit: COMMIT, minecraft_version: '1.21.9', options: { ...OPTIONS }, provenance: provenance(), slots: source.slots.map((row, index) => p5(row, source, index + 1)), selection_rank: [1, 2, 3].map((rank, index) => ({ candidate_id: `candidate-0${selectionRank?.[index] || rank}`, rank: index + 1 })) }; corrupt(value, defect); return value;
}
function makeBaseline(source, { defect } = {}) { const value = { schema_version: 1, kind: 'baseline-snapshot', run_id: 'baseline-fixed-run', request: file(Buffer.from(stableJson(P6_FIXED_REQUEST))), generator_commit: COMMIT, minecraft_version: '1.21.9', options: { ...OPTIONS, playbook: 'off' }, provenance: provenance(), solution: direct(source) }; corrupt(value, defect); return value; }
function p5(snapshot, source, slot_index) { const p5_files = Object.fromEntries(Object.entries(snapshot.files).map(([name, bytes]) => [name, file(bytes)])); const chain = JSON.parse(snapshot.current_chain); const checkpoints = Object.fromEntries(chain.checkpoint_hashes.map(row => [row.layer, p5_files[Object.keys(p5_files).find(name => sha256(p5_files[name].bytes) === row.checkpoint_sha256)]])); return { ...direct(source), candidate_id: snapshot.candidate_id, slot_index, playbook_mode: 'execute', p5_files, current_chain: p5_files['current-chain.json'], checkpoints, frozen_design: p5_files['frozen/frozen-design.json'], frozen_context: p5_files['frozen/frozen-generator-context.json'] }; }
function direct(source) { return { candidate_id: 'baseline-current', slot_index: 0, playbook_mode: 'off', root_seed: 424242, prompt_sha256: sha256(P6_FIXED_REQUEST.prompt), request: file(Buffer.from(stableJson(P6_FIXED_REQUEST))), blueprint: file(source.blueprint), operations: file(source.operations), build_function: file(source.build), hard_qa: file(source.hardQa), review: file(source.review), advisory_rule_eligibility: { unresolved_violated_core_rule_ids: [], neutral_unknown_rule_ids: ['rule:facade.break-repetitive-bays'], neutral_not_applicable_rule_ids: [] } }; }
function provenance() { return { corpus_sha256: P6_FIXED_REQUEST.playbook_corpus_sha256, rule_version: '0.1.0', generator_commit: COMMIT, minecraft_version: '1.21.9', options: { ...OPTIONS } }; }
function file(bytes) { return { bytes: Buffer.from(bytes), sha256: sha256(bytes), stat: { is_regular_file: true, is_symlink: false, size: bytes.length } }; }
function rebind(node, bytes) { node.bytes = Buffer.from(bytes); node.sha256 = sha256(bytes); node.stat.size = bytes.length; }
function corrupt(value, defect) { const slot = value.slots?.[0]; if (defect === 'missing-slot' && value.slots) value.slots.pop(); if (defect === 'malformed-slots') value.slots = null; if (!slot) return; if (['entry-not-south', 'bounds-missing', 'bounds-unstable', 'entry-conflict'].includes(defect)) { const blueprint = JSON.parse(slot.blueprint.bytes); if (defect === 'entry-not-south') blueprint.opening.main_entry.side = 'north'; if (defect === 'bounds-missing') delete blueprint.bounds; if (defect === 'bounds-unstable') blueprint.bounds.min_z = 0.5; if (defect === 'entry-conflict') blueprint.operations.push({ main_entry: { side: 'south', center_x: 2, center_y: 4, center_z: 20 } }); rebind(slot.blueprint, Buffer.from(stableJson(blueprint))); rebind(slot.operations, Buffer.from(stableJson(blueprint.operations))); } if (defect === 'missing-checkpoint') delete slot.checkpoints.facade; if (defect === 'hard-qa-failed') rebind(slot.hard_qa, Buffer.from(stableJson({ ok: false }))); if (defect === 'hash-mismatch') slot.blueprint.sha256 = '0'.repeat(64); if (defect === 'symlink') slot.build_function.node_kind = 'symlink'; if (defect === 'directory') slot.build_function.node_kind = 'directory'; if (defect === 'substituted-build') rebind(slot.build_function, Buffer.from('say substituted\n')); if (defect === 'cross-run-chain') slot.current_chain = value.slots[1].current_chain; if (defect === 'baseline-provenance') value.options.playbook = 'execute'; if (defect === 'request-drift') rebind(value.request, Buffer.from(stableJson({ ...P6_FIXED_REQUEST, root_seed: 1 }))); if (defect === 'commit-drift') value.generator_commit = 'b'.repeat(40); if (defect === 'minecraft-drift') value.minecraft_version = '1.21.8'; if (defect === 'options-drift') value.options.concepts = 1; if (defect === 'corpus-drift') value.provenance.corpus_sha256 = 'd'.repeat(64); if (defect === 'rule-drift') value.provenance.rule_version = '0.2.0'; }

async function snapshotAuthority(value, root, authorityName) {
  const evidence = [];
  let nodeIndex = 0;
  const snapshot = await copy(value);
  return Object.freeze({ value: snapshot, evidence: Object.freeze(evidence) });

  async function copy(item) {
    if (Buffer.isBuffer(item)) return Buffer.from(item);
    if (Array.isArray(item)) return Promise.all(item.map(copy));
    if (isFileSnapshot(item)) return snapshotFile(item);
    if (item && typeof item === 'object') {
      return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await copy(child)])));
    }
    return item;
  }

  async function snapshotFile(item) {
    const bytes = Buffer.from(item.bytes);
    const directory = path.join(root, authorityName, 'nodes');
    await fs.mkdir(directory, { recursive: true });
    const nodePath = path.join(directory, `${String(++nodeIndex).padStart(4, '0')}.bin`);
    const kind = item.node_kind || 'regular';
    if (kind === 'symlink') {
      const targetPath = `${nodePath}.target`;
      await fs.writeFile(targetPath, bytes);
      await fs.symlink(path.basename(targetPath), nodePath);
    } else if (kind === 'directory') {
      await fs.mkdir(nodePath);
      await fs.writeFile(`${nodePath}.payload`, bytes);
    } else {
      await fs.writeFile(nodePath, bytes);
    }
    const stat = await fs.lstat(nodePath);
    const snapshotBytes = await fs.readFile(kind === 'directory' ? `${nodePath}.payload` : nodePath);
    const lstat = Object.freeze({
      stat_source: 'lstat',
      is_regular_file: stat.isFile(),
      is_symlink: stat.isSymbolicLink(),
      size: stat.size
    });
    const authority_snapshot = {
      bytes: snapshotBytes,
      sha256: item.sha256,
      stat: {
        is_regular_file: lstat.is_regular_file,
        is_symlink: lstat.is_symlink,
        size: lstat.size
      }
    };
    evidence.push(Object.freeze({ authority_snapshot, lstat }));
    return authority_snapshot;
  }
}

function isFileSnapshot(value) {
  return value && typeof value === 'object' && Buffer.isBuffer(value.bytes)
    && typeof value.sha256 === 'string' && value.stat && typeof value.stat === 'object';
}
