import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
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

  const selectionRank = validateSelectionRank(p5.selection_rank);
  const solutions = PLAYBOOK_SLOTS.map(([candidateId, solutionId, slotIndex]) => {
    const slot = p5.slots.find(value => value?.candidate_id === candidateId);
    if (!slot) incomplete();
    return validateP6SolutionAuthority(slot, {
      candidate_id: candidateId, solution_id: solutionId, slot_index: slotIndex,
      playbook_mode: 'execute', request, require_p5_chain: true
    });
  });
  if (!Array.isArray(p5.slots) || p5.slots.length !== PLAYBOOK_SLOTS.length) incomplete();
  const controlSolution = validateP6SolutionAuthority(control.solution, {
    candidate_id: 'baseline-current', solution_id: 'baseline-current', slot_index: 0,
    playbook_mode: 'off', request, require_p5_chain: false
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
  if (hardQa?.hard_qa_ok !== true) incomplete();
  if (expected.require_p5_chain) validateP5Chain(value);
  const advisory_rule_eligibility = validateAdvisory(value.advisory_rule_eligibility);
  const main_entry = resolveSouthEntry({ blueprint, operations });
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
    main_entry,
    advisory_rule_eligibility,
    input_hashes: deepFreeze({
      request_sha256: value.request.sha256,
      current_chain_sha256: expected.require_p5_chain ? value.current_chain.sha256 : null,
      blueprint_sha256: blueprintFile.sha256,
      operation_list_sha256: operationsFile.sha256,
      build_function_sha256: buildFile.sha256,
      hard_qa_sha256: hardQaFile.sha256
    })
  });
}

export function resolveSouthEntry({ blueprint, operations } = {}) {
  const fromBlueprint = blueprint?.opening?.main_entry;
  const fromOperation = Array.isArray(operations)
    ? operations.find(operation => plain(operation?.main_entry))?.main_entry
    : undefined;
  const entry = fromBlueprint ?? fromOperation;
  if (!plain(entry) || entry.side !== 'south') incomplete();
  const center_x = numeric(entry.center_x); const center_y = numeric(entry.center_y); const center_z = numeric(entry.center_z);
  if ([center_x, center_y, center_z].some(value => value === null)) incomplete();
  return deepFreeze({ center_x, center_y, center_z, facing: 'south' });
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
    || !plain(value.options) || !plain(value.authority_stat)) {
    code === 'P6_AUTHORITY_INVALID' ? authority() : incomplete();
  }
  if (value.authority_stat.is_regular_file !== true || value.authority_stat.is_symlink !== false) authority();
  assertFile(value.request, 'P6_AUTHORITY_INVALID');
  if (value.request.sha256 !== P6_PROTOCOL_FILE_HASHES['fixed-request.json']) incomplete();
  if (value.options.mode !== 'mock' || value.options.candidate_count !== 3
    || value.options.candidate_rounds !== 1 || value.options.candidate_force_rounds !== false) incomplete();
  return value;
}

function assertCommonProvenance({ request, p5, control }) {
  if (!p5.request.bytes.equals(Buffer.from(request.bytes)) || !control.request.bytes.equals(Buffer.from(request.bytes))
    || p5.generator_commit !== control.generator_commit || p5.minecraft_version !== control.minecraft_version
    || p5.options.mode !== control.options.mode || p5.options.candidate_count !== control.options.candidate_count
    || p5.options.candidate_rounds !== control.options.candidate_rounds
    || p5.options.candidate_force_rounds !== control.options.candidate_force_rounds) incomplete();
}

function validateP5Chain(value) {
  const chain = assertFile(value.current_chain, 'P6_AUTHORITY_INVALID');
  if (!json(chain.bytes) || !plain(value.checkpoints) || Object.keys(value.checkpoints).length !== LAYERS.length) incomplete();
  for (const layer of LAYERS) {
    const checkpoint = assertFile(value.checkpoints[layer], 'P6_AUTHORITY_INVALID');
    const record = json(checkpoint.bytes);
    if (record?.layer !== layer || record?.accepted !== true) incomplete();
  }
}

function validateSelectionRank(value) {
  if (!Array.isArray(value) || value.length !== 3) incomplete();
  const seen = new Set();
  return deepFreeze(value.map(row => {
    if (!plain(row) || !/^candidate-0[1-3]$/u.test(row.candidate_id) || !Number.isInteger(row.rank) || seen.has(row.candidate_id)) incomplete();
    seen.add(row.candidate_id); return { candidate_id: row.candidate_id, rank: row.rank };
  }));
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
  const { main_entry, advisory_rule_eligibility, input_hashes, ...row } = solution;
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
function authority() { throw p6Error('P6_AUTHORITY_INVALID'); }
function incomplete() { throw p6Error('P6_COHORT_INCOMPLETE'); }
