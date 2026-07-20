import { createHash } from 'node:crypto';
import {
  CandidateReadinessError,
  assertCandidateId
} from './stage7CandidateBoundary.js';
import {
  VANILLA_STRUCTURE_ADAPTER_VERSION,
  isAirIdentifier
} from './stage7VanillaStructureNbt.js';

export const CONDITIONAL_MATERIAL_MAPPING_VERSION = 'stage7-conditional-material-map-v1';
export const CONDITIONAL_PREPARATION_VERSION = 'stage7-conditional-voxel-preparation-v1';
const GRID = 64;
const RULES = Object.freeze([
  { token: 7, source: '(water|bubble_column)$' },
  { token: 5, source: '(stairs?|slab)$' },
  { token: 4, source: '(glass|glass_pane|stained_glass|stained_glass_pane)$' },
  { token: 6, source: '(torch|lantern|lamp|fence|wall|bars|door|trapdoor|gate|button|pressure_plate|ladder|leaves|vine|flower|banner|bed|chest|barrel|bookshelf|carpet|chain)$' },
  { token: 1, source: '(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|soul_sand|red_sand|terracotta|farmland)$' },
  { token: 2, source: '(stone|cobblestone|deepslate|blackstone|basalt|tuff|calcite|andesite|diorite|granite|bricks|stone_bricks|quartz_block|sandstone|prismarine|end_stone|netherrack|obsidian|purpur_block)$' },
  { token: 3, source: '(planks|log|wood|stem|hyphae|stripped_[a-z0-9_]+|wool)$' }
]);
const COMPILED_RULES = RULES.map((rule) => ({ token: rule.token, pattern: new RegExp(rule.source, 'u') }));
export const CONDITIONAL_MATERIAL_MAPPING_SHA256 = createHash('sha256')
  .update(JSON.stringify({ version: CONDITIONAL_MATERIAL_MAPPING_VERSION, rules: RULES }))
  .digest('hex');

export function mapConditionalMaterial(identifier) {
  if (isAirIdentifier(identifier)) return Object.freeze({ token: 0, mapped: true });
  const local = String(identifier).split(':')[1] || '';
  const match = COMPILED_RULES.find((rule) => rule.pattern.test(local));
  return Object.freeze(match
    ? { token: match.token, mapped: true }
    : { token: 8, mapped: false });
}

export function prepareConditionalVolume({
  candidateId,
  contentSha256,
  volume,
  evidenceMode = 'synthetic'
}) {
  const id = assertCandidateId(candidateId);
  if (!/^[a-f0-9]{64}$/u.test(contentSha256 || '')) fail('CONTENT_HASH_INVALID', id);
  const syntheticOnly = evidenceMode === 'synthetic'
    ? true
    : evidenceMode === 'operational'
      ? false
      : fail('EVIDENCE_MODE_INVALID', id);
  if (!volume || volume.version !== VANILLA_STRUCTURE_ADAPTER_VERSION
    || volume.candidate_id !== id) fail('PREPARATION_INPUT_INVALID', id);
  const extent = volume.non_air_bounds.extent;
  if ([extent.x, extent.y, extent.z].some((value) => value > GRID)) {
    fail('VOLUME_TOO_LARGE', id, { x: extent.x, y: extent.y, z: extent.z });
  }
  const offset = Object.freeze({
    x: Math.floor((GRID - extent.x) / 2),
    y: Math.floor((GRID - extent.y) / 2),
    z: Math.floor((GRID - extent.z) / 2)
  });
  const voxels = Buffer.alloc(GRID ** 3);
  const counts = Array(9).fill(0);
  let nonAirCount = 0;
  for (const block of volume.blocks) {
    const palette = volume.palette[block.palette_index];
    const mapping = mapConditionalMaterial(palette.name);
    if (mapping.token === 0) continue;
    const x = offset.x + block.x - volume.non_air_bounds.min.x;
    const y = offset.y + block.y - volume.non_air_bounds.min.y;
    const z = offset.z + block.z - volume.non_air_bounds.min.z;
    voxels[y * GRID * GRID + z * GRID + x] = mapping.token;
    counts[mapping.token] += 1;
    nonAirCount += 1;
  }
  if (nonAirCount === 0) fail('VOLUME_EMPTY', id);
  counts[0] = GRID ** 3 - nonAirCount;
  const token8Share = counts[8] / nonAirCount;
  if (token8Share > 0.1 + Number.EPSILON) {
    fail('MATERIAL_UNMAPPED_LIMIT', id, {
      non_air_count: nonAirCount,
      token_8_count: counts[8]
    });
  }
  const voxelSha256 = createHash('sha256').update(voxels).digest('hex');
  const binding = {
    source: CONDITIONAL_PREPARATION_VERSION,
    candidate_id: id,
    content_sha256: contentSha256,
    parser_version: volume.parser_version,
    adapter_version: volume.version,
    mapping_version: CONDITIONAL_MATERIAL_MAPPING_VERSION,
    mapping_sha256: CONDITIONAL_MATERIAL_MAPPING_SHA256,
    declared_size: volume.declared_size,
    actual_bounds: volume.non_air_bounds,
    actual_extent: extent,
    translation_offset: offset,
    source_orientation: volume.source_orientation,
    shape: [GRID, GRID, GRID],
    token_counts: counts,
    token_proportions: counts.map((count) => count / (GRID ** 3)),
    non_air_count: nonAirCount,
    token_8_share: token8Share,
    entity_count: volume.entity_count,
    block_entity_count: volume.block_entity_count,
    voxel_sha256: voxelSha256,
    synthetic_only: syntheticOnly,
    authorizes_acquisition: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  };
  const preparationSha256 = createHash('sha256').update(canonical(binding)).digest('hex');
  return Object.freeze({
    voxels,
    record: deepFreeze({ ...binding, preparation_sha256: preparationSha256 })
  });
}

function canonical(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'preparation', candidateId, safeDetail);
}
