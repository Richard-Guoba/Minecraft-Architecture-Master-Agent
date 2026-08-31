import path from 'node:path';

import {
  admitExecuteRun,
  readCurrentCandidateSnapshot,
  readCurrentExecuteSelectionSnapshot
} from '../execute/storage.js';
import { validateSelectionRecord } from '../execute/contracts.js';
import { validateCandidateFiles } from '../execute/storageValidation.js';
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
import {
  assertP6RunAuthority,
  readExternalP6InputAuthority
} from './storage.js';

const HASH = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40,64}$/u;
const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);
const PLAYBOOK_SLOTS = Object.freeze([
  ['candidate-01', 'playbook-candidate-01', 1],
  ['candidate-02', 'playbook-candidate-02', 2],
  ['candidate-03', 'playbook-candidate-03', 3]
]);
const BASELINE_AUTHORITY_BASENAME = 'p6-baseline-authority.json';
const BASELINE_AUTHORITY_FIELDS = Object.freeze([
  'files', 'generator_commit', 'kind', 'minecraft_version',
  'options', 'provenance', 'run_id', 'schema_version'
]);
const BASELINE_FILE_FIELDS = Object.freeze([
  'blueprint', 'build_function', 'hard_qa', 'operations', 'review'
]);

/**
 * Admit exact live P5 and off-baseline authorities, snapshot every consumed
 * regular file while its inode is retained, close the P5 capability, and only
 * then invoke the path-free pure cohort compiler.
 */
export async function admitP6CohortInputs({
  p6Authority,
  playbookRunDir,
  baselineRunDir,
  fixedRequestPath
} = {}) {
  let executeAuthority;
  try {
    await assertP6RunAuthority(p6Authority);
    if (![playbookRunDir, baselineRunDir, fixedRequestPath].every(value => (
      typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value
    ))) authority();
    const fixedRequest = await readExternalP6InputAuthority({
      authority: p6Authority,
      rootDir: path.dirname(fixedRequestPath),
      relativePath: path.basename(fixedRequestPath)
    });
    const fixedRequestValue = parseCanonicalJson(fixedRequest.bytes);

    executeAuthority = await admitExecuteRun({ runDir: playbookRunDir });
    const slots = [];
    for (const [candidateId, , slotIndex] of PLAYBOOK_SLOTS) {
      const admitted = await readCurrentCandidateSnapshot({
        authority: executeAuthority,
        candidateId
      });
      slots.push(await snapshotPlaybookSlot({
        p6Authority,
        playbookRunDir,
        admitted,
        candidateId,
        slotIndex,
        fixedRequest
      }));
    }
    const selection = await snapshotCurrentSelection({
      executeAuthority, slots
    });
    const options = fixedGeneratorOptions();
    const playbook = {
      schema_version: 1,
      kind: 'p5-run-snapshot',
      run_id: `p5-${selection.authority_sha256.slice(0, 24)}`,
      request: fixedRequest,
      generator_commit: P6_FIXED_REQUEST.generator_commit,
      minecraft_version: P6_MINECRAFT_VERSION,
      options,
      provenance: frozenProvenance(options),
      slots,
      selection_rank: selection.rank,
      selection_authority_sha256: selection.authority_sha256
    };
    const baseline = await snapshotBaseline({
      p6Authority,
      baselineRunDir,
      fixedRequest
    });
    await assertP6RunAuthority(p6Authority);
    const cohort = compileP6Cohort({
      fixedRequest: fixedRequestValue,
      playbook,
      baseline
    });
    return deepFreeze({
      ...cohort,
      render_solutions: renderSnapshotsForCohort({ cohort, slots, baseline })
    });
  } catch (error) {
    if (error?.code === 'P6_COHORT_INCOMPLETE') throw error;
    authority();
  } finally {
    await executeAuthority?.close();
  }
}

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
  const input_sha256 = hashCohortInputs({
    fixedRequest: request.value,
    solutions: allSolutions,
    selectionRank,
    selectionAuthoritySha256: p5.selection_authority_sha256
  });
  return deepFreeze({
    manifest,
    solutions: allSolutions,
    selection_rank: selectionRank,
    advisory_rule_eligibility: allSolutions.map(({ solution_id, advisory_rule_eligibility }) => ({ solution_id, ...advisory_rule_eligibility })),
    input_sha256
  });
}

// Rendering receives only these path-free, parsed values from the same live
// admission that compiled the cohort. Consumers never need to reopen P5 or
// baseline authorities after this function returns.
function renderSnapshotsForCohort({ cohort, slots, baseline }) {
  if (!plain(cohort) || !Array.isArray(cohort.solutions)
    || !Array.isArray(slots) || !plain(baseline?.solution)) authority();
  const snapshots = [
    ...PLAYBOOK_SLOTS.map(([candidateId, solutionId]) => {
      const slot = slots.find(item => item.candidate_id === candidateId);
      const solution = cohort.solutions.find(item => item.solution_id === solutionId);
      return renderSnapshotForSolution({ solution, snapshot: slot });
    }),
    renderSnapshotForSolution({
      solution: cohort.solutions.find(item => item.solution_id === 'baseline-current'),
      snapshot: baseline.solution
    })
  ];
  return deepFreeze(snapshots);
}

function renderSnapshotForSolution({ solution, snapshot }) {
  if (!plain(solution) || !plain(snapshot)) authority();
  const blueprintFile = assertFile(snapshot.blueprint, 'P6_AUTHORITY_INVALID');
  const operationsFile = assertFile(snapshot.operations, 'P6_AUTHORITY_INVALID');
  const buildFile = assertFile(snapshot.build_function, 'P6_AUTHORITY_INVALID');
  if (blueprintFile.sha256 !== solution.blueprint_sha256
    || operationsFile.sha256 !== solution.operation_list_sha256
    || buildFile.sha256 !== solution.build_function_sha256) authority();
  const blueprint = json(blueprintFile.bytes);
  const operations = json(operationsFile.bytes);
  if (!plain(blueprint) || !Array.isArray(operations)
    || stableJson(blueprint.operations) !== stableJson(operations)) authority();
  return deepFreeze({
    solution_id: solution.solution_id,
    blueprint_sha256: solution.blueprint_sha256,
    operation_list_sha256: solution.operation_list_sha256,
    build_function_sha256: solution.build_function_sha256,
    bounds: { ...solution.bounds },
    main_entry: { ...solution.main_entry },
    blueprint,
    operations
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

export function hashCohortInputs({
  fixedRequest,
  solutions,
  selectionRank,
  selectionAuthoritySha256
} = {}) {
  const request = canonicalP6(fixedRequest, validateFixedRequest);
  if (!Array.isArray(solutions) || solutions.length !== 4
    || !Array.isArray(selectionRank) || selectionRank.length !== 3
    || !HASH.test(selectionAuthoritySha256)) incomplete();
  return sha256(stableJson({
    fixed_request_sha256: request.sha256,
    selection_authority_sha256: selectionAuthoritySha256,
    selection_rank: selectionRank,
    solutions: solutions.map(solution => ({
      solution_id: solution.solution_id,
      input_hashes: solution.input_hashes ?? null,
      blueprint_sha256: solution.blueprint_sha256,
      operation_list_sha256: solution.operation_list_sha256,
      build_function_sha256: solution.build_function_sha256
    }))
  }));
}

async function snapshotPlaybookSlot({
  p6Authority,
  playbookRunDir,
  admitted,
  candidateId,
  slotIndex,
  fixedRequest
}) {
  if (admitted.candidate_id !== candidateId || !plain(admitted.files)) authority();
  const prefix = `playbook-execute/candidates/${candidateId}`;
  const p5_files = {};
  for (const name of Object.keys(admitted.files).sort()) {
    const snapshot = await readExternalP6InputAuthority({
      authority: p6Authority,
      rootDir: playbookRunDir,
      relativePath: `${prefix}/${name}`
    });
    if (!snapshot.bytes.equals(admitted.files[name])) authority();
    p5_files[name] = snapshot;
  }
  const currentPointer = p5_files['current-chain.json'];
  if (!currentPointer) authority();
  const pointer = parseCanonicalJson(currentPointer.bytes);
  if (!plain(pointer) || pointer.candidate_id !== candidateId
    || pointer.chain_sha256 !== admitted.current_chain_sha256
    || !Number.isInteger(pointer.chain_revision)) authority();
  const revision = String(pointer.chain_revision).padStart(4, '0');
  const chainFile = p5_files[`chains/chain-${revision}.json`];
  if (!chainFile || chainFile.sha256 !== admitted.current_chain_sha256
    || !chainFile.bytes.equals(admitted.current_chain)) authority();
  const chain = parseCanonicalJson(chainFile.bytes);
  const named = name => {
    const snapshot = p5_files[name];
    if (!snapshot) authority();
    return snapshot;
  };
  const checkpointByLayer = Object.fromEntries(chain.checkpoint_hashes.map(row => {
    const matches = Object.values(p5_files).filter(file => file.sha256 === row.checkpoint_sha256);
    if (matches.length !== 1) authority();
    return [row.layer, matches[0]];
  }));
  return {
    candidate_id: candidateId,
    slot_index: slotIndex,
    playbook_mode: 'execute',
    root_seed: P6_FIXED_REQUEST.root_seed,
    prompt_sha256: sha256(P6_FIXED_REQUEST.prompt),
    request: fixedRequest,
    blueprint: named(`blueprints/chain-${revision}.json`),
    operations: named(`artifacts/chain-${revision}-operation-list.json`),
    build_function: named(`artifacts/chain-${revision}-build.mcfunction`),
    hard_qa: named(`reviews/chain-${revision}-hard-qa.json`),
    review: named(`reviews/chain-${revision}-review.json`),
    advisory_rule_eligibility: advisoryFromChain(chain),
    p5_files,
    current_chain: currentPointer,
    checkpoints: checkpointByLayer,
    frozen_design: named('frozen/frozen-design.json'),
    frozen_context: named('frozen/frozen-generator-context.json')
  };
}

async function snapshotCurrentSelection({ executeAuthority, slots }) {
  const admitted = await readCurrentExecuteSelectionSnapshot({ authority: executeAuthority });
  if (!plain(admitted) || !plain(admitted.files)
    || !/^selection-generations\/selection-[a-f0-9]{64}$/u.test(admitted.generation)
    || admitted.generation !== `selection-generations/selection-${admitted.manifest_sha256}`
    || admitted.manifest_sha256 !== sha256(admitted.files['manifest.json'])) authority();
  let selection;
  try { selection = validateSelectionRecord(parseCanonicalJson(admitted.files['selection.json'])); }
  catch { authority(); }
  for (const slot of slots) {
    const row = selection.candidates.find(item => item.candidate_id === slot.candidate_id);
    const currentChainName = Object.keys(slot.p5_files).find(name => (
      name.startsWith('chains/chain-') && slot.p5_files[name].sha256 === row?.current_chain_sha256
    ));
    if (!row || !currentChainName) authority();
  }
  const ranking = selection.ranker_result?.ranking;
  if (!Array.isArray(ranking) || ranking.length !== 3) authority();
  const rank = ranking.map(row => ({
    candidate_id: row?.candidate_id,
    rank: row?.rank
  }));
  if (new Set(rank.map(row => row.candidate_id)).size !== 3
    || new Set(rank.map(row => row.rank)).size !== 3) authority();
  return {
    rank,
    authority_sha256: sha256(stableJson({
      generation: admitted.generation,
      manifest_sha256: admitted.manifest_sha256,
      files: Object.fromEntries(Object.entries(admitted.files).map(([name, bytes]) => [
        name, sha256(bytes)
      ]))
    }))
  };
}

async function snapshotBaseline({ p6Authority, baselineRunDir, fixedRequest }) {
  const manifestSnapshot = await readExternalP6InputAuthority({
    authority: p6Authority,
    rootDir: baselineRunDir,
    relativePath: BASELINE_AUTHORITY_BASENAME
  });
  const manifest = parseCanonicalJson(manifestSnapshot.bytes);
  if (!plain(manifest) || !sameKeySet(Object.keys(manifest), BASELINE_AUTHORITY_FIELDS)
    || manifest.schema_version !== 1 || manifest.kind !== 'p6-baseline-authority'
    || typeof manifest.run_id !== 'string' || manifest.run_id.length === 0
    || !COMMIT.test(manifest.generator_commit)
    || manifest.minecraft_version !== P6_MINECRAFT_VERSION
    || !plain(manifest.options) || !plain(manifest.provenance)
    || !plain(manifest.files) || !sameKeySet(Object.keys(manifest.files), BASELINE_FILE_FIELDS)) authority();
  const snapshots = {};
  const claimedPaths = new Set();
  for (const field of BASELINE_FILE_FIELDS) {
    const binding = manifest.files[field];
    if (!plain(binding) || !sameKeySet(Object.keys(binding), ['relative_path', 'sha256'])
      || !safeRelativePath(binding.relative_path) || !HASH.test(binding.sha256)
      || claimedPaths.has(binding.relative_path)) authority();
    claimedPaths.add(binding.relative_path);
    const snapshot = await readExternalP6InputAuthority({
      authority: p6Authority,
      rootDir: baselineRunDir,
      relativePath: binding.relative_path
    });
    if (snapshot.sha256 !== binding.sha256) authority();
    snapshots[field] = snapshot;
  }
  return {
    schema_version: 1,
    kind: 'baseline-snapshot',
    run_id: manifest.run_id,
    request: fixedRequest,
    generator_commit: manifest.generator_commit,
    minecraft_version: manifest.minecraft_version,
    options: manifest.options,
    provenance: manifest.provenance,
    solution: {
      candidate_id: 'baseline-current',
      slot_index: 0,
      playbook_mode: 'off',
      root_seed: P6_FIXED_REQUEST.root_seed,
      prompt_sha256: sha256(P6_FIXED_REQUEST.prompt),
      request: fixedRequest,
      blueprint: snapshots.blueprint,
      operations: snapshots.operations,
      build_function: snapshots.build_function,
      hard_qa: snapshots.hard_qa,
      review: snapshots.review,
      advisory_rule_eligibility: {
        unresolved_violated_core_rule_ids: [],
        neutral_unknown_rule_ids: [],
        neutral_not_applicable_rule_ids: []
      }
    }
  };
}

function parseCanonicalJson(bytes) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (stableJson(value) !== bytes.toString('utf8')) authority();
    return value;
  } catch { authority(); }
}

function advisoryFromChain(chain) {
  const eligibility = chain?.eligibility;
  if (!plain(eligibility)) authority();
  return {
    unresolved_violated_core_rule_ids: eligibility.unresolved_violated_core_rule_ids,
    neutral_unknown_rule_ids: eligibility.neutral_unknown_rule_ids,
    neutral_not_applicable_rule_ids: eligibility.neutral_not_applicable_rule_ids
  };
}

function frozenProvenance(options) {
  return {
    corpus_sha256: P6_FIXED_REQUEST.playbook_corpus_sha256,
    rule_version: P6_FIXED_REQUEST.playbook_version,
    generator_commit: P6_FIXED_REQUEST.generator_commit,
    minecraft_version: P6_MINECRAFT_VERSION,
    options
  };
}

function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
    && !value.includes('\\') && value.split('/').every(part => (
      part.length > 0 && part !== '.' && part !== '..'
      && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(part)
    ));
}

function sameKeySet(actual, expected) {
  return actual.length === expected.length && expected.every(key => actual.includes(key));
}

function validateAuthorityEnvelope(value, kind, code) {
  if (!plain(value) || value.schema_version !== 1 || value.kind !== kind || typeof value.run_id !== 'string'
    || !COMMIT.test(value.generator_commit) || value.minecraft_version !== P6_MINECRAFT_VERSION
    || !plain(value.options) || !plain(value.provenance)) {
    code === 'P6_AUTHORITY_INVALID' ? authority() : incomplete();
  }
  assertFile(value.request, 'P6_AUTHORITY_INVALID');
  if (kind === 'p5-run-snapshot' && !HASH.test(value.selection_authority_sha256)) incomplete();
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
