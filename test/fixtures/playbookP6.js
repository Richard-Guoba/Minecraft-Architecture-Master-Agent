import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { P6_FIXED_REQUEST } from '../../src/playbook/p6/constants.js';
import { sha256, stableJson } from '../../src/playbook/shadow/canonical.js';

const COMMIT = 'a'.repeat(40);
const OPTIONS = Object.freeze({ mode: 'mock', candidate_count: 3, candidate_rounds: 1, candidate_force_rounds: false });
const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);

export async function createP6CohortFixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cohort-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const requestBytes = Buffer.from(stableJson(P6_FIXED_REQUEST));
  const source = await createSource(requestBytes);
  const playbookAuthority = await snapshotAuthority(root, 'playbook', makePlaybook(source, requestBytes, overrides));
  const baselineAuthority = await snapshotAuthority(root, 'baseline', makeBaseline(source, requestBytes, overrides));
  return Object.freeze({
    fixedRequest: structuredClone(P6_FIXED_REQUEST),
    playbookAuthority,
    baselineAuthority,
    close: async () => undefined
  });
}

async function createSource(requestBytes) {
  const blueprint = { opening: { main_entry: { side: 'south', center_x: 10, center_y: 4, center_z: 20 } }, operations: [{ op: 'fill', from: [0, 0, 0], to: [1, 1, 1], block: 'minecraft:stone' }] };
  const blueprintBytes = Buffer.from(stableJson(blueprint));
  return Object.freeze({
    requestBytes, blueprintBytes,
    operationsBytes: Buffer.from(stableJson(blueprint.operations)),
    buildBytes: Buffer.from('fill ~ ~ ~ ~1 ~1 ~1 minecraft:stone\n'),
    hardQaBytes: Buffer.from(stableJson({ hard_qa_ok: true })),
    chainBytes: Buffer.from(stableJson({ current: true, checkpoint_count: 5 })),
    checkpointBytes: Object.fromEntries(LAYERS.map(layer => [layer, Buffer.from(stableJson({ layer, accepted: true }))]))
  });
}

function makePlaybook(source, requestBytes, overrides) {
  const slots = [1, 2, 3].map(slot => solution(source, `candidate-0${slot}`, slot, 'execute', requestBytes));
  if (overrides.defect === 'missing-slot') slots.pop();
  if (overrides.defect === 'missing-checkpoint') delete slots[0].checkpoints.facade;
  if (overrides.defect === 'hard-qa-failed') rebind(slots[0].hard_qa, Buffer.from(stableJson({ hard_qa_ok: false })));
  if (overrides.defect === 'entry-not-south') {
    const blueprint = { opening: { main_entry: { side: 'north', center_x: 10, center_y: 4, center_z: 20 } }, operations: [] };
    rebind(slots[0].blueprint, Buffer.from(stableJson(blueprint)));
    rebind(slots[0].operations, Buffer.from(stableJson([])));
  }
  if (overrides.defect === 'hash-mismatch') slots[0].blueprint.sha256 = '0'.repeat(64);
  if (overrides.defect === 'symlink') slots[0].build_function.stat.is_symlink = true;
  const authority = { schema_version: 1, kind: 'p5-run-snapshot', run_id: 'p5-fixed-run', request: file(requestBytes), generator_commit: COMMIT,
    minecraft_version: '1.21.9', options: { ...OPTIONS }, slots,
    selection_rank: (overrides.selectionRank || [1, 2, 3]).map((rank, index) => ({ candidate_id: `candidate-0${rank}`, rank: index + 1 })) };
  if (overrides.defect === 'request-drift') rebind(authority.request, Buffer.from(stableJson({ ...P6_FIXED_REQUEST, root_seed: 1 })));
  if (overrides.defect === 'commit-drift') authority.generator_commit = 'b'.repeat(40);
  if (overrides.defect === 'minecraft-drift') authority.minecraft_version = '1.21.8';
  if (overrides.defect === 'options-drift') authority.options.candidate_rounds = 2;
  return authority;
}

function makeBaseline(source, requestBytes, overrides) {
  const authority = { schema_version: 1, kind: 'baseline-snapshot', run_id: 'baseline-fixed-run', request: file(requestBytes), generator_commit: COMMIT,
    minecraft_version: '1.21.9', options: { ...OPTIONS, playbook: 'off' }, solution: solution(source, 'baseline-current', 0, 'off', requestBytes) };
  if (overrides.defect === 'baseline-provenance') authority.options.playbook = 'execute';
  return authority;
}

function solution(source, candidate_id, slot_index, playbook_mode, requestBytes) {
  return { candidate_id, slot_index, playbook_mode, root_seed: 424242, prompt_sha256: sha256(P6_FIXED_REQUEST.prompt),
    request: file(requestBytes), current_chain: file(source.chainBytes),
    checkpoints: Object.fromEntries(Object.entries(source.checkpointBytes).map(([key, bytes]) => [key, file(bytes)])),
    blueprint: file(source.blueprintBytes), operations: file(source.operationsBytes), build_function: file(source.buildBytes), hard_qa: file(source.hardQaBytes),
    advisory_rule_eligibility: { unresolved_violated_core_rule_ids: [], neutral_unknown_rule_ids: ['rule:facade.break-repetitive-bays'], neutral_not_applicable_rule_ids: [] } };
}

function file(bytes) { return { bytes: Buffer.from(bytes), sha256: sha256(bytes), stat: { is_regular_file: true, is_symlink: false, size: bytes.length } }; }
function rebind(value, bytes) { value.bytes = bytes; value.sha256 = sha256(bytes); value.stat.size = bytes.length; }

async function snapshotAuthority(root, name, value) {
  const location = path.join(root, name, 'authority.json');
  await fs.mkdir(path.dirname(location), { recursive: true });
  await fs.writeFile(location, stableJson(value));
  const stat = await fs.lstat(location);
  const counter = { value: 0 };
  const snapshot = await snapshotFiles(value, path.join(root, name, 'files'), counter);
  snapshot.authority_stat = { is_regular_file: stat.isFile(), is_symlink: stat.isSymbolicLink(), size: stat.size };
  return snapshot;
}

async function snapshotFiles(value, root, counter) {
  if (isFileSnapshot(value)) {
    const location = path.join(root, `${String(counter.value++).padStart(3, '0')}.bin`);
    await fs.mkdir(path.dirname(location), { recursive: true });
    await fs.writeFile(location, value.bytes);
    if (value.stat.is_symlink) {
      const target = `${location}.target`;
      await fs.rename(location, target);
      await fs.symlink(path.basename(target), location);
    }
    const stat = await fs.lstat(location);
    return {
      bytes: value.stat.is_symlink ? Buffer.from(value.bytes) : await fs.readFile(location),
      sha256: value.sha256,
      stat: { is_regular_file: stat.isFile(), is_symlink: stat.isSymbolicLink(), size: stat.size }
    };
  }
  if (Array.isArray(value)) return Promise.all(value.map(item => snapshotFiles(item, root, counter)));
  if (value && typeof value === 'object') {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [
      key, await snapshotFiles(item, root, counter)
    ])));
  }
  return value;
}

function isFileSnapshot(value) {
  return value && typeof value === 'object' && Buffer.isBuffer(value.bytes)
    && typeof value.sha256 === 'string' && value.stat && typeof value.stat === 'object';
}
