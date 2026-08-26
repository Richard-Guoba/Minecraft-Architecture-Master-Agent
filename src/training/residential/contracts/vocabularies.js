const frozen = (values) => Object.freeze([...values]);

export const RESIDENTIAL_SCHEMA_VERSION = 1;
export const HOUSE_SPEC_SOURCE = 'residential-housespec-v1';
export const HOUSE_SCENE_SOURCE = 'residential-housescene-v1';
export const SOURCE_PROFILE_SOURCE = 'residential-source-profile-v1';
export const REVIEW_RECORD_SOURCE = 'residential-review-record-v1';
export const WORKSPACE_SOURCE = 'residential-workspace-v1';
export const RESIDENTIAL_MINECRAFT_VERSION = '1.21.1';
export const RESIDENTIAL_RESOLUTION = frozen([64, 64, 64]);

export const SIDES = frozen(['north', 'south', 'east', 'west']);
export const DENSITIES = frozen(['minimal', 'balanced', 'rich']);
export const ROOM_TYPES = frozen([
  'entry',
  'living_room',
  'dining_room',
  'kitchen',
  'bedroom',
  'primary_bedroom',
  'bathroom',
  'study',
  'storage',
  'utility',
  'workshop',
  'stairs',
  'corridor',
  'landing',
  'balcony',
  'porch',
  'garage',
  'sunroom'
]);
export const RELATIONSHIP_KINDS = frozen([
  'connected',
  'adjacent',
  'near',
  'separated',
  'above',
  'below',
  'opens_to',
  'shares_daylight_side'
]);
export const MATERIAL_ROLES = frozen([
  'foundation',
  'wall_primary',
  'wall_secondary',
  'floor_primary',
  'ceiling_primary',
  'roof_primary',
  'trim_primary',
  'wood_primary',
  'glass_primary',
  'door_primary',
  'stair_primary',
  'fabric_primary',
  'light_primary',
  'accent_primary',
  'landscape_primary'
]);
export const STRUCTURE_ROLES = frozen([
  'air',
  'outside',
  'ground',
  'foundation',
  'floor',
  'wall',
  'ceiling',
  'roof_full',
  'roof_stair',
  'roof_slab',
  'opening',
  'door',
  'window',
  'stair',
  'ladder',
  'railing',
  'support',
  'water',
  'circulation_reserve',
  'interaction_reserve'
]);
export const SPACE_ROLES = frozen([
  'outside',
  'room',
  'circulation',
  'vertical_circulation',
  'void',
  'site'
]);
export const OBJECT_ROLES = frozen([
  'bed',
  'storage',
  'crafting',
  'furnace',
  'smoker',
  'blast_furnace',
  'cooking_surface',
  'table',
  'seating',
  'bookshelf',
  'shelf',
  'lighting',
  'utility',
  'food_display',
  'carpet',
  'rug',
  'plant',
  'flower_pot',
  'painting',
  'item_frame',
  'mob_head',
  'wall_ornament',
  'curtain',
  'screen',
  'banner',
  'candle',
  'lantern',
  'sculpture',
  'display_object',
  'exterior_ornament'
]);
export const SCENE_GROUP_ROLES = frozen([
  'bed_ensemble',
  'cooking_station',
  'crafting_station',
  'dining_set',
  'reading_corner',
  'gallery_wall',
  'storage_wall',
  'lighting_cluster',
  'planting_cluster',
  'entrance_composition'
]);
export const SURVIVAL_BASELINE = frozen([
  'reachable_entrance',
  'connected_required_rooms',
  'connected_occupied_floors',
  'bed',
  'storage',
  'crafting',
  'cooking_or_smelting',
  'safe_lighting',
  'usable_clearance'
]);
