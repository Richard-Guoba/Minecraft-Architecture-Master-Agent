export function validHouseSpecFixture() {
  return {
    source: 'residential-housespec-v1',
    schema_version: 1,
    minecraft_version: '1.21.1',
    request: {
      id: 'request-fixture',
      prompt: 'Build a warm two-floor survival house.',
      language: 'en',
      typology: 'residential_house'
    },
    generation: {
      seed: 18402933,
      seed_source: 'automatic',
      invariant_fields: [
        'envelope',
        'rooms',
        'relationships',
        'survival'
      ]
    },
    envelope: {
      max_width: 32,
      max_depth: 28,
      max_height: 24,
      floors: 2,
      floor_height_range: [4, 6],
      front_side: 'south',
      site_required: true,
      side_setback_range: [2, 5],
      front_setback_range: [3, 7],
      rear_setback_range: [3, 8]
    },
    style: {
      family: 'warm_modern',
      tags: ['wood', 'cozy'],
      mood: 'warm and inhabited',
      symmetry: 'balanced',
      ornament_level: 'rich',
      composition_intent: 'layered rooms around a bright living core'
    },
    palette: {
      foundation: 'minecraft:stone_bricks',
      wall_primary: 'minecraft:spruce_planks',
      wall_secondary: 'minecraft:white_concrete',
      floor_primary: 'minecraft:oak_planks',
      ceiling_primary: 'minecraft:stripped_spruce_log',
      roof_primary: 'minecraft:deepslate_tiles',
      trim_primary: 'minecraft:dark_oak_planks',
      wood_primary: 'minecraft:spruce_planks',
      glass_primary: 'minecraft:glass',
      door_primary: 'minecraft:spruce_door',
      stair_primary: 'minecraft:spruce_stairs',
      fabric_primary: 'minecraft:red_carpet',
      light_primary: 'minecraft:lantern',
      accent_primary: 'minecraft:flower_pot',
      landscape_primary: 'minecraft:moss_block'
    },
    rooms: [
      {
        id: 'entry',
        type: 'entry',
        floor: 0,
        required: true,
        target_area: [6, 12],
        importance: 'high',
        privacy: 'public',
        daylight: 'balanced',
        decoration_density: 'balanced',
        required_functions: ['entrance'],
        preferred_functions: ['storage'],
        forbidden_functions: [],
        required_objects: ['storage'],
        preferred_objects: ['plant', 'painting'],
        forbidden_objects: [],
        mood: 'welcoming',
        focal_points: ['front door']
      },
      {
        id: 'living',
        type: 'living_room',
        floor: 0,
        required: true,
        target_area: [28, 45],
        importance: 'high',
        privacy: 'public',
        daylight: 'high',
        decoration_density: 'rich',
        required_functions: ['seating'],
        preferred_functions: ['reading'],
        forbidden_functions: [],
        required_objects: ['seating', 'lighting'],
        preferred_objects: ['carpet', 'plant', 'painting'],
        forbidden_objects: [],
        mood: 'warm social focus',
        focal_points: ['gallery wall']
      },
      {
        id: 'bedroom_1',
        type: 'bedroom',
        floor: 1,
        required: true,
        target_area: [16, 28],
        importance: 'high',
        privacy: 'private',
        daylight: 'balanced',
        decoration_density: 'balanced',
        required_functions: ['sleeping', 'storage'],
        preferred_functions: ['reading'],
        forbidden_functions: [],
        required_objects: ['bed', 'storage', 'lighting'],
        preferred_objects: ['carpet', 'painting'],
        forbidden_objects: [],
        mood: 'quiet',
        focal_points: ['bed ensemble']
      }
    ],
    relationships: [
      { from: 'entry', to: 'living', kind: 'connected', required: true },
      { from: 'living', to: 'bedroom_1', kind: 'below', required: true }
    ],
    facade: {
      rhythm: 'balanced openings',
      transparency: 'medium',
      entrance_emphasis: 'strong',
      focal_elements: ['framed entry', 'living-room glazing']
    },
    roof: {
      character: 'layered pitched roof',
      overhang_range: [1, 3],
      preferred_forms: ['gable', 'cross_gable']
    },
    site: {
      mood: 'small inhabited garden',
      required_elements: ['entry_path'],
      preferred_elements: ['flowers', 'seating'],
      forbidden_elements: []
    },
    survival: {
      required: [
        'reachable_entrance',
        'connected_required_rooms',
        'connected_occupied_floors',
        'bed',
        'storage',
        'crafting',
        'cooking_or_smelting',
        'safe_lighting',
        'usable_clearance'
      ],
      optional: ['smoker', 'food_storage']
    },
    decoration: {
      default_density: 'rich',
      room_density: { entry: 'balanced', living: 'rich', bedroom_1: 'balanced' },
      required: ['lighting'],
      preferred: ['plants', 'paintings', 'carpets', 'warm_lights'],
      forbidden: [],
      themes: ['warm', 'inhabited'],
      focal_points: ['living gallery wall'],
      invent_optional_objects: true,
      max_clutter: 0.7,
      minimum_clearance: 1
    },
    constraints: {
      forbidden_features: ['blocked doors', 'unreachable stations'],
      must_preserve: ['survival', 'rooms', 'relationships'],
      maximum_full_candidates: 3
    }
  };
}
