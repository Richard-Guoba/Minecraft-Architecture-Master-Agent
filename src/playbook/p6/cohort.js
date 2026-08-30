import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import { validateCandidateFiles } from '../execute/storageValidation.js';
import {
  canonicalP6,
  p6Error,
  validateCohortManifest,
  validateP6CohortSolution,
  validateFixedRequest
} from './contracts.js';
import {
  P6_FIXED_REQUEST,
  P6_MINECRAFT_VERSION,
  P6_PROTOCOL_FILE_HASHES,
  P6_PROTOCOL_VERSION,
  P6_SCHEMA_VERSION
} from './constants.js';

const HASH = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40,64}$/u;
const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);
const PLAYBOOK_SLOTS = Object.freeze([
  ['candidate-01', 'playbook-candidate-01', 1],
  ['candidate-02', 'playbook-candidate-02', 2],
  ['candidate-03', 'playbook-candidate-03', 3]
]);

/**
 * Compile only already-admitted bytes/stat snapshots. This deliberately has no
 * filesystem imports: admission belongs to the P6 storage boundary (Task 4).
 */
export function compileP6Cohort({ fixedRequest, playbook, baseline } = {}) {
  const request = canonicalP6(fixedRequest, validateFixedRequest);
  if (request.sha256 !== P6_PROTOCOL_FILE_HASHES['fixed-request.json']) incomplete();
  const p5 = validateAuthorityEnvelope(playbook, 'p5-run-snapshot', 'P6_COHORT_INCOMPLETE');
  const control = validateAuthorityEnvelope(baseline, 'baseline-snapshot', 'P6_COHORT_INCOMPLETE');
  assertCommonProvenance({ request, p5, control });

  if (!Array.isArray(p5.slots) || p5.slots.length !== PLAYBOOK_SLOTS.length || p5.slots.some(item => !plain(item))) incomplete();
  const selectionRank = validateSelectionRank(p5.selection_rank);
  const solutions = PLAYBOOK_SLOTS.map(([candidateId, solutionId, slotIndex]) => {
    const slot = p5.slots.find(value => value?.candidate_id === candidateId);
    if (!slot) incomplete();
    return validateP6SolutionAuthority(slot, {
      candidate_id: candidateId, solution_id: solutionId, slot_index: slotIndex,
      playbook_mode: 'execute', request, authority_options: p5.options, require_p5_chain: true
    });
  });
  const controlSolution = validateP6SolutionAuthority(control.solution, {
    candidate_id: 'baseline-current', solution_id: 'baseline-current', slot_index: 0,
    playbook_mode: 'off', request, authority_options: control.options, require_p5_chain: false
  });
  if (control.options.playbook !== 'off') incomplete();
  const allSolutions = [...solutions, controlSolution];
  const manifest = validateCohortManifest({
    schema_version: P6_SCHEMA_VERSION,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_id: 'p6-v0.1',
    request_sha256: request.sha256,
    visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    solutions: allSolutions.map(manifestRow)
  });
  const input_sha256 = hashCohortInputs({ fixedRequest: request.value, solutions: allSolutions });
  return deepFreeze({
    manifest,
    solutions: allSolutions,
    selection_rank: selectionRank,
    advisory_rule_eligibility: allSolutions.map(({ solution_id, advisory_rule_eligibility }) => ({ solution_id, ...advisory_rule_eligibility })),
    input_sha256
  });
}

export function validateP6SolutionAuthority(value, expected) {
  if (!plain(value) || !plain(expected)) authority();
  const mode = expected.playbook_mode;
  if (value.candidate_id !== expected.candidate_id || value.slot_index !== expected.slot_index
    || value.playbook_mode !== mode || value.root_seed !== P6_FIXED_REQUEST.root_seed
    || sha256(P6_FIXED_REQUEST.prompt) !== value.prompt_sha256) incomplete();
  assertFile(value.request, 'P6_AUTHORITY_INVALID');
  if (!value.request.bytes.equals(Buffer.from(expected.request.bytes))) incomplete();
  const blueprintFile = assertFile(value.blueprint, 'P6_AUTHORITY_INVALID');
  const operationsFile = assertFile(value.operations, 'P6_AUTHORITY_INVALID');
  const buildFile = assertFile(value.build_function, 'P6_AUTHORITY_INVALID');
  const hardQaFile = assertFile(value.hard_qa, 'P6_AUTHORITY_INVALID');
  const blueprint = json(blueprintFile.bytes);
  const operations = json(operationsFile.bytes);
  if (!Array.isArray(operations) || !Array.isArray(blueprint?.operations)
    || stableJson(blueprint.operations) !== stableJson(operations)) incomplete();
  const hardQa = json(hardQaFile.bytes);
  if (hardQa?.ok !== true) incomplete();
  if (expected.require_p5_chain) validateP5Chain(value);
  const advisory_rule_eligibility = validateAdvisory(value.advisory_rule_eligibility);
  const bounds = resolveStableBounds(blueprint);
  const main_entry = resolveSouthEntry({ blueprint, operations, bounds });
  return deepFreeze({
    solution_id: expected.solution_id,
    playbook_mode: mode,
    slot_index: expected.slot_index,
    root_seed: P6_FIXED_REQUEST.root_seed,
    prompt_sha256: value.prompt_sha256,
    blueprint_sha256: blueprintFile.sha256,
    operation_list_sha256: operationsFile.sha256,
    build_function_sha256: buildFile.sha256,
    hard_qa_ok: true,
    minecraft_version: P6_MINECRAFT_VERSION,
    bounds,
    main_entry,
    advisory_rule_eligibility,
    input_hashes: deepFreeze({
      request_sha256: value.request.sha256,
      current_chain_sha256: expected.require_p5_chain ? value.current_chain.sha256 : null,
      blueprint_sha256: blueprintFile.sha256,
      operation_list_sha256: operationsFile.sha256,
      build_function_sha256: buildFile.sha256,
      hard_qa_sha256: hardQaFile.sha256,
      review_sha256: value.review?.sha256 ?? null,
      frozen_design_sha256: value.frozen_design?.sha256 ?? null,
      frozen_context_sha256: value.frozen_context?.sha256 ?? null,
      fixed_provenance_sha256: sha256(stableJson({ generator_commit: P6_FIXED_REQUEST.generator_commit, playbook_corpus_sha256: P6_FIXED_REQUEST.playbook_corpus_sha256, playbook_version: P6_FIXED_REQUEST.playbook_version, options: omitPlaybook(expected.authority_options) })),
      p5_file_hashes: expected.require_p5_chain ? Object.freeze(Object.fromEntries(Object.entries(value.p5_files).map(([name, snapshot]) => [name, snapshot.sha256]))) : null
    })
  });
}

export function resolveSouthEntry({ blueprint, operations, bounds } = {}) {
  const fromBlueprint = blueprint?.opening?.main_entry;
  const operationEntries = Array.isArray(operations) ? operations.filter(operation => plain(operation?.main_entry)).map(operation => operation.main_entry) : [];
  if (operationEntries.length > 1) incomplete();
  const fromOperation = operationEntries[0];
  if (fromBlueprint && fromOperation && stableJson(fromBlueprint) !== stableJson(fromOperation)) incomplete();
  const entry = fromBlueprint ?? fromOperation;
  if (!plain(entry) || entry.side !== 'south') incomplete();
  const center_x = numeric(entry.center_x); const center_y = numeric(entry.center_y); const center_z = numeric(entry.center_z);
  if ([center_x, center_y, center_z].some(value => value === null)) incomplete();
  if (bounds && (center_x < bounds.min_x || center_x > bounds.max_x || center_y < bounds.min_y || center_y > bounds.max_y || center_z !== bounds.max_z)) incomplete();
  return deepFreeze({ center_x, center_y, center_z, facing: 'south' });
}

function resolveStableBounds(blueprint) {
  const bounds = blueprint?.bounds;
  if (!plain(bounds) || Object.keys(bounds).sort().join(',') !== 'max_x,max_y,max_z,min_x,min_y,min_z') incomplete();
  for (const key of Object.keys(bounds)) if (!Number.isInteger(bounds[key])) incomplete();
  if (bounds.min_x > bounds.max_x || bounds.min_y > bounds.max_y || bounds.min_z > bounds.max_z) incomplete();
  return deepFreeze({ ...bounds });
}

export function hashCohortInputs({ fixedRequest, solutions } = {}) {
  const request = canonicalP6(fixedRequest, validateFixedRequest);
  if (!Array.isArray(solutions) || solutions.length !== 4) incomplete();
  return sha256(stableJson({
    fixed_request_sha256: request.sha256,
    solutions: solutions.map(solution => ({
      solution_id: solution.solution_id,
      input_hashes: solution.input_hashes ?? null,
      blueprint_sha256: solution.blueprint_sha256,
      operation_list_sha256: solution.operation_list_sha256,
      build_function_sha256: solution.build_function_sha256
    }))
  }));
}

function validateAuthorityEnvelope(value, kind, code) {
  if (!plain(value) || value.schema_version !== 1 || value.kind !== kind || typeof value.run_id !== 'string'
    || !COMMIT.test(value.generator_commit) || value.minecraft_version !== P6_MINECRAFT_VERSION
    || !plain(value.options) || !plain(value.provenance) || !plain(value.authority_stat)) {
    code === 'P6_AUTHORITY_INVALID' ? authority() : incomplete();
  }
  if (value.authority_stat.is_regular_file !== true || value.authority_stat.is_symlink !== false) authority();
  assertFile(value.request, 'P6_AUTHORITY_INVALID');
  if (value.request.sha256 !== P6_PROTOCOL_FILE_HASHES['fixed-request.json']) incomplete();
  if (value.options.mode !== 'mock' || value.options.candidate_count !== 3
    || value.options.candidate_rounds !== 1 || value.options.candidate_force_rounds !== false) incomplete();
  if (!sameJson(kind === 'baseline-snapshot' ? omitPlaybook(value.options) : value.options, fixedGeneratorOptions())) incomplete();
  const provenance = value.provenance;
  if (provenance.corpus_sha256 !== P6_FIXED_REQUEST.playbook_corpus_sha256 || provenance.rule_version !== P6_FIXED_REQUEST.playbook_version
    || provenance.generator_commit !== P6_FIXED_REQUEST.generator_commit || value.generator_commit !== P6_FIXED_REQUEST.generator_commit || provenance.minecraft_version !== value.minecraft_version
    || !sameJson(provenance.options, kind === 'baseline-snapshot' ? omitPlaybook(value.options) : value.options)) incomplete();
  return value;
}

function assertCommonProvenance({ request, p5, control }) {
  if (!p5.request.bytes.equals(Buffer.from(request.bytes)) || !control.request.bytes.equals(Buffer.from(request.bytes))
    || p5.generator_commit !== control.generator_commit || p5.minecraft_version !== control.minecraft_version
    || p5.options.mode !== control.options.mode || p5.options.candidate_count !== control.options.candidate_count
    || p5.options.candidate_rounds !== control.options.candidate_rounds
    || p5.options.candidate_force_rounds !== control.options.candidate_force_rounds
    || p5.provenance.corpus_sha256 !== control.provenance.corpus_sha256
    || p5.provenance.rule_version !== control.provenance.rule_version
    || !sameJson(p5.provenance.options, omitPlaybook(control.options))) incomplete();
}

function validateP5Chain(value) {
  if (!plain(value.p5_files) || !plain(value.checkpoints)) authority();
  const files = {};
  for (const [name, snapshot] of Object.entries(value.p5_files)) files[name] = assertFile(snapshot, 'P6_AUTHORITY_INVALID').bytes;
  let validated;
  try { validated = validateCandidateFiles(value.candidate_id, files, 'P6_AUTHORITY_INVALID'); } catch { authority(); }
  const chain = validated.current;
  if (!value.current_chain || !assertFile(value.current_chain, 'P6_AUTHORITY_INVALID').bytes.equals(files['current-chain.json'])
    || chain.checkpoint_hashes.length !== LAYERS.length) incomplete();
  for (const [index, layer] of LAYERS.entries()) {
    const row = chain.checkpoint_hashes[index]; const checkpoint = value.checkpoints[layer];
    if (row.layer !== layer || !checkpoint || !assertFile(checkpoint, 'P6_AUTHORITY_INVALID').bytes.equals(files[Object.keys(files).find(name => sha256(files[name]) === row.checkpoint_sha256)])) incomplete();
  }
  const blueprintName = `blueprints/chain-${String(chain.chain_revision).padStart(4, '0')}.json`;
  const hardQaName = `reviews/chain-${String(chain.chain_revision).padStart(4, '0')}-hard-qa.json`;
  const reviewName = `reviews/chain-${String(chain.chain_revision).padStart(4, '0')}-review.json`;
  for (const [field, name, hash] of [['blueprint', blueprintName, chain.blueprint_sha256], ['hard_qa', hardQaName, chain.hard_qa_sha256], ['review', reviewName, chain.p4_review_sha256], ['frozen_design', 'frozen/frozen-design.json', chain.frozen_design_sha256], ['frozen_context', 'frozen/frozen-generator-context.json', chain.frozen_generator_context_sha256]]) {
    if (!value[field] || !assertFile(value[field], 'P6_AUTHORITY_INVALID').bytes.equals(files[name]) || sha256(files[name]) !== hash) incomplete();
  }
  const facade = json(files[Object.keys(files).find(name => sha256(files[name]) === chain.checkpoint_hashes.at(-1).checkpoint_sha256)]);
  if (facade.compiled_artifact_hashes.operation_list_sha256 !== value.operations.sha256 || facade.compiled_artifact_hashes.build_function_sha256 !== value.build_function.sha256) incomplete();
}

function validateSelectionRank(value) {
  if (!Array.isArray(value) || value.length !== 3) incomplete();
  const seen = new Set();
  const rows = value.map(row => {
    if (!plain(row) || !/^candidate-0[1-3]$/u.test(row.candidate_id) || !Number.isInteger(row.rank) || ![1, 2, 3].includes(row.rank) || seen.has(row.candidate_id)) incomplete();
    seen.add(row.candidate_id); return { candidate_id: row.candidate_id, rank: row.rank };
  });
  if (new Set(rows.map(row => row.rank)).size !== 3) incomplete();
  return deepFreeze(rows);
}

function validateAdvisory(value) {
  if (!plain(value)) authority();
  const fields = ['unresolved_violated_core_rule_ids', 'neutral_unknown_rule_ids', 'neutral_not_applicable_rule_ids'];
  if (Object.keys(value).length !== fields.length || !fields.every(key => Array.isArray(value[key]))) authority();
  for (const key of fields) {
    const unique = new Set(value[key]);
    if (unique.size !== value[key].length || value[key].some(item => typeof item !== 'string')) authority();
  }
  return deepFreeze(Object.fromEntries(fields.map(key => [key, [...value[key]].sort()])));
}

function manifestRow(solution) {
  const { main_entry, bounds, advisory_rule_eligibility, input_hashes, ...row } = solution;
  return validateP6CohortSolution(row);
}

function assertFile(value, code) {
  if (!plain(value) || !Buffer.isBuffer(value.bytes) || !plain(value.stat) || value.stat.is_regular_file !== true
    || value.stat.is_symlink !== false || !Number.isInteger(value.stat.size) || value.stat.size !== value.bytes.length
    || !HASH.test(value.sha256) || value.sha256 !== sha256(value.bytes)) {
    code === 'P6_AUTHORITY_INVALID' ? authority() : incomplete();
  }
  return value;
}

function json(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { incomplete(); } }
function numeric(value) { return Number.isFinite(value) ? value : null; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function sameJson(left, right) { return stableJson(left) === stableJson(right); }
function omitPlaybook(options) { const { playbook, ...rest } = options; return rest; }
function fixedGeneratorOptions() { return {
  mode: P6_FIXED_REQUEST.mode, candidate_count: P6_FIXED_REQUEST.candidate_count,
  candidate_rounds: P6_FIXED_REQUEST.candidate_rounds, candidate_force_rounds: P6_FIXED_REQUEST.candidate_force_rounds,
  concepts: P6_FIXED_REQUEST.concepts, concept_strategy: P6_FIXED_REQUEST.concept_strategy,
  critics: P6_FIXED_REQUEST.critics, neural_retrieval: P6_FIXED_REQUEST.neural_retrieval,
  coarse_voxel_mode: P6_FIXED_REQUEST.coarse_voxel_mode, coarse_voxel_provider: P6_FIXED_REQUEST.coarse_voxel_provider,
  coarse_voxel_plan: P6_FIXED_REQUEST.coarse_voxel_plan
}; }
function authority() { throw p6Error('P6_AUTHORITY_INVALID'); }
function incomplete() { throw p6Error('P6_COHORT_INCOMPLETE'); }
