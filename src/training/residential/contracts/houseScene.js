import { failContract } from './contractError.js';
import {
  assertArray,
  assertArtifactPath,
  assertBoolean,
  assertCell,
  assertEnum,
  assertExactObject,
  assertFiniteNumber,
  assertId,
  assertInteger,
  assertSha256,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  HOUSE_SCENE_SOURCE,
  MATERIAL_ROLES,
  OBJECT_ROLES,
  RESIDENTIAL_MINECRAFT_VERSION,
  RESIDENTIAL_RESOLUTION,
  RESIDENTIAL_SCHEMA_VERSION,
  SIDES
} from './vocabularies.js';

const TOP_LEVEL = [
  'source',
  'schema_version',
  'minecraft_version',
  'resolution',
  'house_spec_hash',
  'seed',
  'vocabularies',
  'grids',
  'room_index',
  'objects',
  'generation',
  'validation',
  'repair'
];
const LAYERS = Object.freeze({
  structure_role: 'uint8',
  room_id: 'uint16-le',
  space_role: 'uint8',
  material_role: 'uint8'
});
const ATTACHMENTS = ['floor', 'wall', 'ceiling', 'free_standing'];

export function validateHouseScene(value) {
  const document = cloneDocument(value, 'HouseScene');
  assertExactObject(document, 'HouseScene', TOP_LEVEL);
  if (document.source !== HOUSE_SCENE_SOURCE) {
    failContract('HOUSE_SCENE_SOURCE_INVALID', 'HouseScene.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'HOUSE_SCENE_VERSION_INVALID',
      'HouseScene.schema_version',
      document.schema_version
    );
  }
  if (document.minecraft_version !== RESIDENTIAL_MINECRAFT_VERSION) {
    failContract(
      'HOUSE_SCENE_MINECRAFT_VERSION_INVALID',
      'HouseScene.minecraft_version',
      document.minecraft_version
    );
  }
  if (
    !Array.isArray(document.resolution)
    || document.resolution.length !== 3
    || document.resolution.some(
      (value, index) => value !== RESIDENTIAL_RESOLUTION[index]
    )
  ) {
    failContract(
      'HOUSE_SCENE_RESOLUTION_INVALID',
      'HouseScene.resolution',
      JSON.stringify(document.resolution)
    );
  }
  assertSha256(document.house_spec_hash, 'HouseScene.house_spec_hash');
  assertInteger(document.seed, 'HouseScene.seed', {
    minimum: -2147483648,
    maximum: 2147483647
  });
  validateVocabularies(document.vocabularies);
  validateGrids(document.grids);
  const roomIds = validateRoomIndex(document.room_index);
  validateObjects(document.objects, roomIds);
  validateGeneration(document.generation, document.seed);
  validateValidation(document.validation);
  validateRepair(document.repair);
  return deepFreeze(document);
}

function validateVocabularies(value) {
  const fields = [
    'structure_role', 'space_role', 'material_role', 'object_role'
  ];
  assertExactObject(value, 'HouseScene.vocabularies', fields);
  for (const field of fields) {
    if (value[field] !== 1) {
      failContract(
        'HOUSE_SCENE_VOCABULARY_VERSION_INVALID',
        `HouseScene.vocabularies.${field}`,
        value[field]
      );
    }
  }
}

function validateGrids(value) {
  assertArray(value, 'HouseScene.grids', { maximum: 4 });
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const grid = value[index];
    const gridPath = `HouseScene.grids[${index}]`;
    assertExactObject(grid, gridPath, [
      'name', 'encoding', 'shape', 'file', 'sha256'
    ]);
    assertEnum(grid.name, `${gridPath}.name`, Object.keys(LAYERS));
    if (seen.has(grid.name)) {
      failContract('HOUSE_SCENE_GRID_DUPLICATE', `${gridPath}.name`, grid.name);
    }
    seen.add(grid.name);
    if (grid.encoding !== LAYERS[grid.name]) {
      failContract(
        'HOUSE_SCENE_GRID_ENCODING_INVALID',
        `${gridPath}.encoding`,
        grid.encoding
      );
    }
    if (
      !Array.isArray(grid.shape)
      || grid.shape.length !== 3
      || grid.shape.some(
        (dimension, axis) => dimension !== RESIDENTIAL_RESOLUTION[axis]
      )
    ) {
      failContract(
        'HOUSE_SCENE_GRID_SHAPE_INVALID',
        `${gridPath}.shape`,
        JSON.stringify(grid.shape)
      );
    }
    assertArtifactPath(grid.file, `${gridPath}.file`);
    assertSha256(grid.sha256, `${gridPath}.sha256`);
  }
  for (const layer of Object.keys(LAYERS)) {
    if (!seen.has(layer)) {
      failContract('HOUSE_SCENE_GRID_MISSING', 'HouseScene.grids', layer);
    }
  }
}

function validateRoomIndex(value) {
  assertArray(value, 'HouseScene.room_index', { minimum: 1, maximum: 65535 });
  const indexes = new Set();
  const roomIds = new Set();
  for (let item = 0; item < value.length; item += 1) {
    const record = value[item];
    const itemPath = `HouseScene.room_index[${item}]`;
    assertExactObject(record, itemPath, ['index', 'room_id']);
    assertInteger(record.index, `${itemPath}.index`, {
      minimum: 1,
      maximum: 65535
    });
    assertId(record.room_id, `${itemPath}.room_id`);
    if (indexes.has(record.index) || roomIds.has(record.room_id)) {
      failContract(
        'HOUSE_SCENE_ROOM_DUPLICATE',
        itemPath,
        `${record.index}:${record.room_id}`
      );
    }
    indexes.add(record.index);
    roomIds.add(record.room_id);
  }
  return roomIds;
}

function validateObjects(value, roomIds) {
  assertArray(value, 'HouseScene.objects', { maximum: 8192 });
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const object = value[index];
    const objectPath = `HouseScene.objects[${index}]`;
    assertExactObject(object, objectPath, [
      'id',
      'role',
      'room_id',
      'anchor',
      'facing',
      'attachment',
      'occupied_cells',
      'support_cells',
      'clearance_cells',
      'material_role',
      'group_id',
      'required',
      'confidence',
      'provenance'
    ]);
    assertId(object.id, `${objectPath}.id`);
    if (ids.has(object.id)) {
      failContract('HOUSE_SCENE_OBJECT_DUPLICATE', `${objectPath}.id`, object.id);
    }
    ids.add(object.id);
    assertEnum(object.role, `${objectPath}.role`, OBJECT_ROLES);
    assertId(object.room_id, `${objectPath}.room_id`);
    if (!roomIds.has(object.room_id)) {
      failContract(
        'HOUSE_SCENE_OBJECT_ROOM_UNKNOWN',
        `${objectPath}.room_id`,
        object.room_id
      );
    }
    assertCell(object.anchor, `${objectPath}.anchor`);
    assertEnum(object.facing, `${objectPath}.facing`, SIDES);
    assertEnum(object.attachment, `${objectPath}.attachment`, ATTACHMENTS);
    for (const field of [
      'occupied_cells', 'support_cells', 'clearance_cells'
    ]) {
      assertArray(object[field], `${objectPath}.${field}`, {
        minimum: field === 'occupied_cells' ? 1 : 0,
        maximum: 256
      });
      const cells = new Set();
      for (let cell = 0; cell < object[field].length; cell += 1) {
        assertCell(object[field][cell], `${objectPath}.${field}[${cell}]`);
        const key = object[field][cell].join(',');
        if (cells.has(key)) {
          failContract(
            'HOUSE_SCENE_OBJECT_CELL_DUPLICATE',
            `${objectPath}.${field}[${cell}]`,
            key
          );
        }
        cells.add(key);
      }
    }
    assertEnum(object.material_role, `${objectPath}.material_role`, MATERIAL_ROLES);
    if (object.group_id !== null) {
      assertId(object.group_id, `${objectPath}.group_id`);
    }
    assertBoolean(object.required, `${objectPath}.required`);
    assertFiniteNumber(object.confidence, `${objectPath}.confidence`, {
      minimum: 0,
      maximum: 1
    });
    assertEnum(
      object.provenance,
      `${objectPath}.provenance`,
      ['structure_model', 'decoration_model']
    );
  }
}

function validateGeneration(value, sceneSeed) {
  const fields = [
    'structure_model_version',
    'structure_checkpoint_sha256',
    'decoration_model_version',
    'decoration_checkpoint_sha256',
    'dataset_sha256',
    'split_sha256',
    'sampling_protocol',
    'seed'
  ];
  assertExactObject(value, 'HouseScene.generation', fields);
  for (const field of [
    'structure_model_version',
    'decoration_model_version',
    'sampling_protocol'
  ]) {
    assertId(value[field], `HouseScene.generation.${field}`);
  }
  for (const field of [
    'structure_checkpoint_sha256',
    'decoration_checkpoint_sha256',
    'dataset_sha256',
    'split_sha256'
  ]) {
    assertSha256(value[field], `HouseScene.generation.${field}`);
  }
  assertInteger(value.seed, 'HouseScene.generation.seed', {
    minimum: -2147483648,
    maximum: 2147483647
  });
  if (value.seed !== sceneSeed) {
    failContract(
      'HOUSE_SCENE_SEED_MISMATCH',
      'HouseScene.generation.seed',
      `${value.seed} != ${sceneSeed}`
    );
  }
}

function validateValidation(value) {
  assertExactObject(value, 'HouseScene.validation', [
    'status', 'blockers', 'warnings'
  ]);
  assertEnum(value.status, 'HouseScene.validation.status', [
    'not_run', 'passed', 'failed'
  ]);
  assertUniqueStringArray(value.blockers, 'HouseScene.validation.blockers');
  assertUniqueStringArray(value.warnings, 'HouseScene.validation.warnings');
}

function validateRepair(value) {
  assertExactObject(value, 'HouseScene.repair', ['applied', 'changes']);
  assertBoolean(value.applied, 'HouseScene.repair.applied');
  assertArray(value.changes, 'HouseScene.repair.changes', { maximum: 4096 });
  for (let index = 0; index < value.changes.length; index += 1) {
    const change = value.changes[index];
    const changePath = `HouseScene.repair.changes[${index}]`;
    assertExactObject(change, changePath, [
      'kind', 'object_id', 'cells', 'reason'
    ]);
    assertId(change.kind, `${changePath}.kind`);
    if (change.object_id !== null) {
      assertId(change.object_id, `${changePath}.object_id`);
    }
    assertArray(change.cells, `${changePath}.cells`, { maximum: 256 });
    for (let cell = 0; cell < change.cells.length; cell += 1) {
      assertCell(change.cells[cell], `${changePath}.cells[${cell}]`);
    }
    assertString(change.reason, `${changePath}.reason`, { maximum: 1024 });
  }
  if (value.applied !== (value.changes.length > 0)) {
    failContract(
      'HOUSE_SCENE_REPAIR_STATE_INVALID',
      'HouseScene.repair.applied',
      'applied must match non-empty changes'
    );
  }
}
