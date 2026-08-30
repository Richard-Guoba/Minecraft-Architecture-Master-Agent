import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

export const P6_SCHEMA_VERSION = 1;
export const P6_PROTOCOL_VERSION = '0.1.0';
export const P6_FIXED_PROMPT = 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base';
export const P6_MINECRAFT_VERSION = '1.21.9';
export const P6_FIXED_REQUEST = deepFreeze({
  schema_version: P6_SCHEMA_VERSION,
  protocol_version: P6_PROTOCOL_VERSION,
  candidate_count: 3,
  candidate_force_rounds: false,
  candidate_rounds: 1,
  minecraft_version: P6_MINECRAFT_VERSION,
  mode: 'mock',
  playbook_version: '0.1.0',
  prompt: P6_FIXED_PROMPT,
  root_seed: 424242
});

export const P6_VISUAL_SETTINGS = deepFreeze({
  schema_version: P6_SCHEMA_VERSION,
  protocol_version: P6_PROTOCOL_VERSION,
  aspect_ratio: '16:9',
  clouds: 'off',
  default_resource_pack: true,
  entities_present: false,
  fancy_graphics: true,
  height_px: 1080,
  hidden_overlays: [
    'gui',
    'hand',
    'crosshair',
    'chat',
    'subtitles',
    'debug'
  ],
  horizontal_fov_degrees: 70,
  particles_present: false,
  shader_pack: 'none',
  time_of_day: 6000,
  weather: 'clear',
  width_px: 1920
});

export const P6_VIEW_IDS = deepFreeze([
  'front-south',
  'side-east',
  'quarter-southeast',
  'quarter-southwest',
  'roof-birdseye',
  'entry-eye'
]);

export const P6_CAMERA_VIEW_PURPOSES = deepFreeze({
  'front-south': 'principal-facade-hierarchy',
  'side-east': 'side-facade-depth',
  'quarter-southeast': 'volume-attachment-roof-silhouette',
  'quarter-southwest': 'opposite-volume-relationship',
  'roof-birdseye': 'roof-composition-footprint',
  'entry-eye': 'approach-scale-entrance-legibility'
});

export const P6_CAMERA_PROTOCOL = deepFreeze({
  schema_version: P6_SCHEMA_VERSION,
  protocol_version: P6_PROTOCOL_VERSION,
  decimal_precision: 6,
  distance_override_policy: 'uniform-per-view-across-solutions-only',
  entry_eye_offset_blocks: 8,
  formulas: [
    {
      position_formula: '(centerX, eyeY, maxZ + far)',
      purpose: P6_CAMERA_VIEW_PURPOSES['front-south'],
      target_formula: '(centerX, eyeY, centerZ)',
      view_id: 'front-south'
    },
    {
      position_formula: '(maxX + far, eyeY, centerZ)',
      purpose: P6_CAMERA_VIEW_PURPOSES['side-east'],
      target_formula: '(centerX, eyeY, centerZ)',
      view_id: 'side-east'
    },
    {
      position_formula: '(maxX + 0.95R, eyeY + 0.10H, maxZ + 0.95R)',
      purpose: P6_CAMERA_VIEW_PURPOSES['quarter-southeast'],
      target_formula: 'C',
      view_id: 'quarter-southeast'
    },
    {
      position_formula: '(minX - 0.95R, eyeY + 0.10H, maxZ + 0.95R)',
      purpose: P6_CAMERA_VIEW_PURPOSES['quarter-southwest'],
      target_formula: 'C',
      view_id: 'quarter-southwest'
    },
    {
      position_formula: '(centerX, maxY + max(16, 1.50R), centerZ)',
      purpose: P6_CAMERA_VIEW_PURPOSES['roof-birdseye'],
      target_formula: 'C',
      view_id: 'roof-birdseye'
    },
    {
      position_formula: 'eight blocks south of the main-entry center at player eye height',
      purpose: P6_CAMERA_VIEW_PURPOSES['entry-eye'],
      target_formula: 'main-entry center',
      view_id: 'entry-eye'
    }
  ]
});

export const P6_OBSERVATION_RATINGS = deepFreeze([
  'strong',
  'usable',
  'weak',
  'fail',
  'unknown'
]);

export const P6_OBSERVATION_CRITERIA = deepFreeze([
  'massing-hierarchy',
  'structural-legibility',
  'silhouette',
  'roof-composition',
  'facade-rhythm-depth',
  'material-role-legibility',
  'detail-density',
  'scene-integration',
  'style-consistency'
]);

export const P6_OBSERVATION_CRITERIA_DOCUMENT = deepFreeze({
  schema_version: P6_SCHEMA_VERSION,
  protocol_version: P6_PROTOCOL_VERSION,
  allowed_ratings: P6_OBSERVATION_RATINGS,
  criteria: P6_OBSERVATION_CRITERIA
});

export const P6_PREFERENCE_VALUES = deepFreeze(['left', 'right', 'tie']);
export const P6_PREFERENCE_CONFIDENCE = deepFreeze(['low', 'medium', 'high']);
export const P6_REASON_TAGS = deepFreeze([
  'massing',
  'hierarchy',
  'silhouette',
  'roof',
  'facade',
  'materials',
  'detail',
  'scene',
  'style-consistency',
  'capture-uncertainty'
]);

export const P6_REASON_TAGS_DOCUMENT = deepFreeze({
  schema_version: P6_SCHEMA_VERSION,
  protocol_version: P6_PROTOCOL_VERSION,
  reason_tags: P6_REASON_TAGS
});

export const P6_ERROR_CODES = deepFreeze([
  'P6_OPTIONS_INVALID',
  'P6_COHORT_INCOMPLETE',
  'P6_AUTHORITY_INVALID',
  'P6_CAMERA_PROTOCOL_INVALID',
  'P6_RENDER_FAILED',
  'P6_CAPTURE_AUTHORIZATION_REQUIRED',
  'P6_CAPTURE_INVALID',
  'P6_OBSERVATION_INVALID',
  'P6_COMPARISON_INVALID',
  'P6_HUMAN_PREFERENCE_REQUIRED',
  'P6_GATE_FAILED',
  'P6_INSTALL_FAILED'
]);

export const P6_PROTOCOL_DOCUMENTS = deepFreeze({
  'camera-protocol.json': P6_CAMERA_PROTOCOL,
  'fixed-request.json': P6_FIXED_REQUEST,
  'observation-criteria.json': P6_OBSERVATION_CRITERIA_DOCUMENT,
  'reason-tags.json': P6_REASON_TAGS_DOCUMENT,
  'visual-settings.json': P6_VISUAL_SETTINGS
});

export const P6_PROTOCOL_FILE_HASHES = deepFreeze(
  Object.fromEntries(
    Object.entries(P6_PROTOCOL_DOCUMENTS).map(([filename, value]) => [filename, sha256(stableJson(value))])
  )
);
