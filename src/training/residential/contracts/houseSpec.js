import { failContract } from './contractError.js';
import {
  assertArray,
  assertBoolean,
  assertEnum,
  assertExactObject,
  assertFiniteNumber,
  assertId,
  assertInteger,
  assertIntegerPair,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  DENSITIES,
  HOUSE_SPEC_SOURCE,
  MATERIAL_ROLES,
  OBJECT_ROLES,
  RELATIONSHIP_KINDS,
  RESIDENTIAL_MINECRAFT_VERSION,
  RESIDENTIAL_SCHEMA_VERSION,
  ROOM_TYPES,
  SIDES,
  SURVIVAL_BASELINE
} from './vocabularies.js';

const TOP_LEVEL = [
  'source',
  'schema_version',
  'minecraft_version',
  'request',
  'generation',
  'envelope',
  'style',
  'palette',
  'rooms',
  'relationships',
  'facade',
  'roof',
  'site',
  'survival',
  'decoration',
  'constraints'
];
const ROOM_FIELDS = [
  'id',
  'type',
  'floor',
  'required',
  'target_area',
  'importance',
  'privacy',
  'daylight',
  'decoration_density',
  'required_functions',
  'preferred_functions',
  'forbidden_functions',
  'required_objects',
  'preferred_objects',
  'forbidden_objects',
  'mood',
  'focal_points'
];
const BLOCK_ID = /^minecraft:[a-z0-9_./-]+$/u;

export function validateHouseSpec(value) {
  const document = cloneDocument(value, 'HouseSpec');
  assertExactObject(document, 'HouseSpec', TOP_LEVEL);
  if (document.source !== HOUSE_SPEC_SOURCE) {
    failContract('HOUSE_SPEC_SOURCE_INVALID', 'HouseSpec.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'HOUSE_SPEC_VERSION_INVALID',
      'HouseSpec.schema_version',
      document.schema_version
    );
  }
  if (document.minecraft_version !== RESIDENTIAL_MINECRAFT_VERSION) {
    failContract(
      'HOUSE_SPEC_MINECRAFT_VERSION_INVALID',
      'HouseSpec.minecraft_version',
      document.minecraft_version
    );
  }
  validateRequest(document.request);
  validateGeneration(document.generation);
  validateEnvelope(document.envelope);
  validateStyle(document.style);
  validatePalette(document.palette);
  const roomIds = validateRooms(document.rooms, document.envelope.floors);
  validateRelationships(document.relationships, roomIds);
  validateFacade(document.facade);
  validateRoof(document.roof);
  validateSite(document.site);
  validateSurvival(document.survival);
  validateDecoration(document.decoration, roomIds);
  validateConstraints(document.constraints);
  return deepFreeze(document);
}

function validateRequest(value) {
  assertExactObject(value, 'HouseSpec.request', [
    'id', 'prompt', 'language', 'typology'
  ]);
  assertId(value.id, 'HouseSpec.request.id');
  assertString(value.prompt, 'HouseSpec.request.prompt', { maximum: 16000 });
  assertEnum(value.language, 'HouseSpec.request.language', ['en', 'zh', 'mixed']);
  if (value.typology !== 'residential_house') {
    failContract(
      'HOUSE_SPEC_TYPOLOGY_INVALID',
      'HouseSpec.request.typology',
      value.typology
    );
  }
}

function validateGeneration(value) {
  assertExactObject(value, 'HouseSpec.generation', [
    'seed', 'seed_source', 'invariant_fields'
  ]);
  assertInteger(value.seed, 'HouseSpec.generation.seed', {
    minimum: -2147483648,
    maximum: 2147483647
  });
  assertEnum(
    value.seed_source,
    'HouseSpec.generation.seed_source',
    ['automatic', 'explicit']
  );
  assertUniqueStringArray(
    value.invariant_fields,
    'HouseSpec.generation.invariant_fields',
    {
      minimum: 1,
      allowed: ['envelope', 'rooms', 'relationships', 'survival', 'style']
    }
  );
}

function validateEnvelope(value) {
  const fields = [
    'max_width',
    'max_depth',
    'max_height',
    'floors',
    'floor_height_range',
    'front_side',
    'site_required',
    'side_setback_range',
    'front_setback_range',
    'rear_setback_range'
  ];
  assertExactObject(value, 'HouseSpec.envelope', fields);
  for (const field of ['max_width', 'max_depth', 'max_height']) {
    assertInteger(value[field], `HouseSpec.envelope.${field}`, {
      minimum: 1,
      maximum: 64
    });
  }
  assertInteger(value.floors, 'HouseSpec.envelope.floors', {
    minimum: 1,
    maximum: 5
  });
  assertIntegerPair(
    value.floor_height_range,
    'HouseSpec.envelope.floor_height_range',
    { minimum: 3, maximum: 16 }
  );
  assertEnum(value.front_side, 'HouseSpec.envelope.front_side', SIDES);
  assertBoolean(value.site_required, 'HouseSpec.envelope.site_required');
  for (const field of [
    'side_setback_range',
    'front_setback_range',
    'rear_setback_range'
  ]) {
    assertIntegerPair(value[field], `HouseSpec.envelope.${field}`, {
      minimum: 0,
      maximum: 32
    });
  }
}

function validateStyle(value) {
  assertExactObject(value, 'HouseSpec.style', [
    'family',
    'tags',
    'mood',
    'symmetry',
    'ornament_level',
    'composition_intent'
  ]);
  assertId(value.family, 'HouseSpec.style.family');
  assertUniqueStringArray(value.tags, 'HouseSpec.style.tags');
  assertString(value.mood, 'HouseSpec.style.mood', { maximum: 512 });
  assertEnum(
    value.symmetry,
    'HouseSpec.style.symmetry',
    ['asymmetric', 'balanced', 'symmetric']
  );
  assertEnum(
    value.ornament_level,
    'HouseSpec.style.ornament_level',
    DENSITIES
  );
  assertString(
    value.composition_intent,
    'HouseSpec.style.composition_intent',
    { maximum: 1024 }
  );
}

function validatePalette(value) {
  assertExactObject(
    value,
    'HouseSpec.palette',
    MATERIAL_ROLES,
    MATERIAL_ROLES
  );
  for (const role of MATERIAL_ROLES) {
    const block = value[role];
    if (typeof block !== 'string' || !BLOCK_ID.test(block)) {
      failContract(
        'HOUSE_SPEC_BLOCK_ID_INVALID',
        `HouseSpec.palette.${role}`,
        String(block)
      );
    }
  }
}

function validateRooms(value, floors) {
  assertArray(value, 'HouseSpec.rooms', { minimum: 1, maximum: 64 });
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const room = value[index];
    const roomPath = `HouseSpec.rooms[${index}]`;
    assertExactObject(room, roomPath, ROOM_FIELDS);
    assertId(room.id, `${roomPath}.id`);
    if (ids.has(room.id)) {
      failContract('HOUSE_SPEC_ROOM_DUPLICATE', `${roomPath}.id`, room.id);
    }
    ids.add(room.id);
    assertEnum(room.type, `${roomPath}.type`, ROOM_TYPES);
    assertInteger(room.floor, `${roomPath}.floor`, {
      minimum: 0,
      maximum: floors - 1
    });
    assertBoolean(room.required, `${roomPath}.required`);
    assertIntegerPair(room.target_area, `${roomPath}.target_area`, {
      minimum: 1,
      maximum: 4096
    });
    assertEnum(room.importance, `${roomPath}.importance`, ['low', 'medium', 'high']);
    assertEnum(
      room.privacy,
      `${roomPath}.privacy`,
      ['public', 'shared', 'private', 'service']
    );
    assertEnum(room.daylight, `${roomPath}.daylight`, ['low', 'balanced', 'high']);
    assertEnum(room.decoration_density, `${roomPath}.decoration_density`, DENSITIES);
    for (const field of [
      'required_functions',
      'preferred_functions',
      'forbidden_functions'
    ]) {
      assertUniqueStringArray(room[field], `${roomPath}.${field}`);
    }
    for (const field of [
      'required_objects',
      'preferred_objects',
      'forbidden_objects'
    ]) {
      assertUniqueStringArray(room[field], `${roomPath}.${field}`, {
        allowed: OBJECT_ROLES
      });
    }
    assertString(room.mood, `${roomPath}.mood`, { maximum: 512 });
    assertUniqueStringArray(room.focal_points, `${roomPath}.focal_points`);
  }
  return ids;
}

function validateRelationships(value, roomIds) {
  assertArray(value, 'HouseSpec.relationships', { maximum: 256 });
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const relation = value[index];
    const relationPath = `HouseSpec.relationships[${index}]`;
    assertExactObject(relation, relationPath, ['from', 'to', 'kind', 'required']);
    for (const field of ['from', 'to']) {
      assertId(relation[field], `${relationPath}.${field}`);
      if (!roomIds.has(relation[field])) {
        failContract(
          'HOUSE_SPEC_RELATIONSHIP_ROOM_UNKNOWN',
          `${relationPath}.${field}`,
          relation[field]
        );
      }
    }
    if (relation.from === relation.to) {
      failContract(
        'HOUSE_SPEC_RELATIONSHIP_SELF',
        relationPath,
        relation.from
      );
    }
    assertEnum(relation.kind, `${relationPath}.kind`, RELATIONSHIP_KINDS);
    assertBoolean(relation.required, `${relationPath}.required`);
    const key = `${relation.from}|${relation.to}|${relation.kind}`;
    if (seen.has(key)) {
      failContract('HOUSE_SPEC_RELATIONSHIP_DUPLICATE', relationPath, key);
    }
    seen.add(key);
  }
}

function validateFacade(value) {
  assertExactObject(value, 'HouseSpec.facade', [
    'rhythm', 'transparency', 'entrance_emphasis', 'focal_elements'
  ]);
  assertString(value.rhythm, 'HouseSpec.facade.rhythm', { maximum: 512 });
  assertEnum(
    value.transparency,
    'HouseSpec.facade.transparency',
    ['low', 'medium', 'high']
  );
  assertEnum(
    value.entrance_emphasis,
    'HouseSpec.facade.entrance_emphasis',
    ['subtle', 'balanced', 'strong']
  );
  assertUniqueStringArray(
    value.focal_elements,
    'HouseSpec.facade.focal_elements'
  );
}

function validateRoof(value) {
  assertExactObject(value, 'HouseSpec.roof', [
    'character', 'overhang_range', 'preferred_forms'
  ]);
  assertString(value.character, 'HouseSpec.roof.character', { maximum: 512 });
  assertIntegerPair(value.overhang_range, 'HouseSpec.roof.overhang_range', {
    minimum: 0,
    maximum: 8
  });
  assertUniqueStringArray(value.preferred_forms, 'HouseSpec.roof.preferred_forms');
}

function validateSite(value) {
  assertExactObject(value, 'HouseSpec.site', [
    'mood', 'required_elements', 'preferred_elements', 'forbidden_elements'
  ]);
  assertString(value.mood, 'HouseSpec.site.mood', { maximum: 512 });
  for (const field of [
    'required_elements',
    'preferred_elements',
    'forbidden_elements'
  ]) {
    assertUniqueStringArray(value[field], `HouseSpec.site.${field}`);
  }
}

function validateSurvival(value) {
  assertExactObject(value, 'HouseSpec.survival', ['required', 'optional']);
  assertUniqueStringArray(value.required, 'HouseSpec.survival.required');
  assertUniqueStringArray(value.optional, 'HouseSpec.survival.optional');
  for (const required of SURVIVAL_BASELINE) {
    if (!value.required.includes(required)) {
      failContract(
        'HOUSE_SPEC_SURVIVAL_REQUIRED',
        'HouseSpec.survival.required',
        required
      );
    }
  }
}

function validateDecoration(value, roomIds) {
  assertExactObject(value, 'HouseSpec.decoration', [
    'default_density',
    'room_density',
    'required',
    'preferred',
    'forbidden',
    'themes',
    'focal_points',
    'invent_optional_objects',
    'max_clutter',
    'minimum_clearance'
  ]);
  assertEnum(value.default_density, 'HouseSpec.decoration.default_density', DENSITIES);
  assertExactObject(
    value.room_density,
    'HouseSpec.decoration.room_density',
    [...roomIds],
    []
  );
  for (const [roomId, density] of Object.entries(value.room_density)) {
    assertEnum(density, `HouseSpec.decoration.room_density.${roomId}`, DENSITIES);
  }
  for (const field of [
    'required',
    'preferred',
    'forbidden',
    'themes',
    'focal_points'
  ]) {
    assertUniqueStringArray(value[field], `HouseSpec.decoration.${field}`);
  }
  assertBoolean(
    value.invent_optional_objects,
    'HouseSpec.decoration.invent_optional_objects'
  );
  if (!value.invent_optional_objects) {
    failContract(
      'HOUSE_SPEC_DECORATION_INVENTION_REQUIRED',
      'HouseSpec.decoration.invent_optional_objects',
      'version one requires true'
    );
  }
  assertFiniteNumber(value.max_clutter, 'HouseSpec.decoration.max_clutter', {
    minimum: 0,
    maximum: 1
  });
  assertInteger(
    value.minimum_clearance,
    'HouseSpec.decoration.minimum_clearance',
    { minimum: 1, maximum: 4 }
  );
}

function validateConstraints(value) {
  assertExactObject(value, 'HouseSpec.constraints', [
    'forbidden_features', 'must_preserve', 'maximum_full_candidates'
  ]);
  assertUniqueStringArray(
    value.forbidden_features,
    'HouseSpec.constraints.forbidden_features'
  );
  assertUniqueStringArray(value.must_preserve, 'HouseSpec.constraints.must_preserve');
  assertInteger(
    value.maximum_full_candidates,
    'HouseSpec.constraints.maximum_full_candidates',
    { minimum: 1, maximum: 3 }
  );
}
