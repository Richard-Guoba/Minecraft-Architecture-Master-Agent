import { createHash } from 'node:crypto';
import path from 'node:path';
import { decodeBoundedNbt } from '../../boundedNbt.js';
import {
  fingerprintCategoricalEntries
} from '../../structuralFingerprint.js';
import { mapTrainingToken } from '../../tokenTaxonomy.js';
import {
  isAirIdentifier,
  validateVanillaStructureNbt
} from '../../vanillaStructureNbt.js';
import { TrainingDataError } from '../../trainingError.js';
import { RESIDENTIAL_INTAKE_LIMITS } from './limits.js';
import { decodeResidentialSchematic } from './schematicArtifact.js';

const FORMATS = new Map([
  ['.schem', 'schem'],
  ['.schematic', 'schematic'],
  ['.nbt', 'structure_nbt']
]);

export function supportedResidentialFormat(filename) {
  return FORMATS.get(path.extname(String(filename)).toLowerCase()) ?? null;
}

export function parseResidentialArtifact({
  bytes,
  originalFilename,
  sourceId,
  limits = RESIDENTIAL_INTAKE_LIMITS,
  occupiedExtentLimit = null
}) {
  const format = supportedResidentialFormat(originalFilename);
  if (!format) {
    throw new TrainingDataError(
      'ARTIFACT_FORMAT_UNSUPPORTED',
      String(originalFilename),
      { stage: 'format', source_id: sourceId }
    );
  }
  const exactSha256 = createHash('sha256').update(bytes).digest('hex');
  const normalized = format === 'structure_nbt'
    ? fromVanilla(bytes, sourceId, limits)
    : fromSchematic(bytes, sourceId, format, limits);
  const measured = measure(normalized, sourceId);
  if (
    occupiedExtentLimit !== null
    && measured.occupied_bounds.extent.some(
      (axis) => axis > occupiedExtentLimit
    )
  ) {
    throw new TrainingDataError(
      'SOURCE_OCCUPIED_BOUNDS_LIMIT',
      `artifact:${sourceId}`,
      {
        stage: 'measurement',
        source_id: sourceId,
        occupied_extent: measured.occupied_bounds.extent,
        max_extent: occupiedExtentLimit,
        exact_sha256: exactSha256
      }
    );
  }
  const fingerprint = fingerprintCategoricalEntries({
    sourceId,
    contentSha256: exactSha256,
    extent: {
      x: measured.occupied_bounds.extent[0],
      y: measured.occupied_bounds.extent[1],
      z: measured.occupied_bounds.extent[2]
    },
    entries: measured.tight_entries
  });
  return deepFreeze({
    format,
    byte_size: bytes.length,
    exact_sha256: exactSha256,
    declared_size: [
      normalized.declared_size.x,
      normalized.declared_size.y,
      normalized.declared_size.z
    ],
    source_occupied_bounds: measured.source_occupied_bounds,
    occupied_bounds: measured.occupied_bounds,
    block_entity_count: normalized.block_entity_count,
    entity_count: normalized.entity_count,
    structural_fingerprint: fingerprint
  });
}

function fromSchematic(bytes, sourceId, format, limits) {
  const artifact = decodeResidentialSchematic(bytes, {
    sourceId,
    format,
    limits
  });
  const entries = [];
  const layerSize = artifact.declared_size.x * artifact.declared_size.z;
  for (let index = 0; index < artifact.block_count; index += 1) {
    const block = artifact.blockAtIndex(index);
    const token = mapTrainingToken(block);
    if (token === 0) continue;
    appendOccupiedEntry(entries, {
      x: index % artifact.declared_size.x,
      y: Math.floor(index / layerSize),
      z: Math.floor(index / artifact.declared_size.x) % artifact.declared_size.z,
      token
    }, sourceId, limits);
  }
  return {
    declared_size: artifact.declared_size,
    block_entity_count: artifact.block_entity_count,
    entity_count: artifact.entity_count,
    entries
  };
}

function fromVanilla(bytes, sourceId, limits) {
  const decoded = decodeBoundedNbt(bytes, {
    sourceId,
    limits,
    materializeArrays: true
  });
  const entities = decoded.value?.entities;
  if (entities !== undefined && !Array.isArray(entities)) {
    throw new TrainingDataError(
      'STRUCTURE_ENTITIES_INVALID',
      `structure:${sourceId}`,
      { stage: 'structure', source_id: sourceId }
    );
  }
  if (entities?.length > limits.maxEntities) {
    throw new TrainingDataError(
      'STRUCTURE_ENTITY_LIMIT',
      `structure:${sourceId}`,
      {
        stage: 'structure',
        source_id: sourceId,
        entity_count: entities.length
      }
    );
  }
  const artifact = validateVanillaStructureNbt(
    decoded,
    { sourceId, limits }
  );
  const entries = [];
  for (const block of artifact.blocks) {
    const state = artifact.palette[block.palette_index];
    if (isAirIdentifier(state.name)) continue;
    appendOccupiedEntry(entries, {
      x: block.x,
      y: block.y,
      z: block.z,
      token: mapTrainingToken({
        air: false,
        category: categoryFor(canonicalName(state.canonical_state))
      })
    }, sourceId, limits);
  }
  return {
    declared_size: artifact.declared_size,
    block_entity_count: artifact.block_entity_count,
    entity_count: artifact.entity_count,
    entries
  };
}

function appendOccupiedEntry(entries, entry, sourceId, limits) {
  const entryCount = entries.length + 1;
  if (entryCount > limits.maxOccupiedAnalysisEntries) {
    throw new TrainingDataError(
      'SOURCE_OCCUPIED_ENTRY_LIMIT',
      `artifact:${sourceId}`,
      {
        stage: 'measurement',
        source_id: sourceId,
        entry_count: entryCount,
        max_entries: limits.maxOccupiedAnalysisEntries
      }
    );
  }
  entries.push(entry);
}

function canonicalName(canonicalState) {
  return canonicalState.slice(
    canonicalState.indexOf(':') + 1,
    canonicalState.indexOf('[') === -1
      ? canonicalState.length
      : canonicalState.indexOf('[')
  );
}

function categoryFor(name) {
  if (['air', 'cave_air', 'void_air'].includes(name)) return 'air';
  if (/(water|kelp|seagrass)/u.test(name)) return 'water';
  if (/(glass|pane)/u.test(name)) return 'glass';
  if (/(torch|lantern|lamp|glowstone|sea_lantern|end_rod|beacon|light)/u.test(name)) return 'light';
  if (/(leaves|leaf|vine|grass|fern|flower|azalea|sapling|bush|cactus|bamboo|lily|moss_carpet|mushroom|roots)/u.test(name)) return 'vegetation';
  if (/(fence|wall|bars|railing)/u.test(name)) return 'fence';
  if (/stairs?$/u.test(name)) return 'stair';
  if (/slab/u.test(name)) return 'slab';
  if (/(door|trapdoor|gate|button|pressure_plate|ladder)/u.test(name)) return 'opening';
  if (/(chest|barrel|table|pot|skull|banner|bed|lectern|bookshelf|anvil|hopper|cauldron|campfire|carpet|chain|decorated_pot)/u.test(name)) return 'decor';
  if (/(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|soul_sand|red_sand|terracotta|farmland)/u.test(name)) return 'earth';
  if (/(stone|cobble|deepslate|blackstone|basalt|tuff|calcite|andesite|diorite|granite|brick|quartz|sandstone|prismarine|end_stone|netherrack|obsidian|purpur)/u.test(name)) return 'rock';
  if (/(planks|log|wood|stem|hyphae|stripped|wool)/u.test(name)) return 'wood';
  return 'other';
}

function measure(normalized, sourceId) {
  if (normalized.entries.length === 0) {
    throw new TrainingDataError('SOURCE_EMPTY', `artifact:${sourceId}`, {
      stage: 'measurement', source_id: sourceId
    });
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-1, -1, -1];
  for (const entry of normalized.entries) {
    min[0] = Math.min(min[0], entry.x);
    min[1] = Math.min(min[1], entry.y);
    min[2] = Math.min(min[2], entry.z);
    max[0] = Math.max(max[0], entry.x);
    max[1] = Math.max(max[1], entry.y);
    max[2] = Math.max(max[2], entry.z);
  }
  const extent = max.map((value, axis) => value - min[axis] + 1);
  const tightEntries = normalized.entries.map((entry) => ({
    x: entry.x - min[0],
    y: entry.y - min[1],
    z: entry.z - min[2],
    token: entry.token
  }));
  return {
    source_occupied_bounds: { min, max, extent },
    occupied_bounds: {
      min: [0, 0, 0],
      max: extent.map((value) => value - 1),
      extent
    },
    tight_entries: tightEntries
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
