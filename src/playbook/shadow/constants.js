export const SHADOW_SCHEMA_VERSION = 1;
export const EVALUATOR_VERSION = '0.1.0';
export const PLAYBOOK_VERSION = '0.1.0';
export const SCHOOL_ID = 'heihui-jileniao';
export const ASSESSMENT_STATUSES = Object.freeze([
  'satisfied', 'violated', 'unknown', 'not-applicable'
]);
export const LAYER_ORDER = Object.freeze([
  'brief', 'massing', 'space', 'structure', 'roof',
  'facade', 'materials', 'interior', 'scene'
]);
export const EVALUATED_LAYERS = Object.freeze([
  'brief', 'massing', 'structure', 'roof', 'facade'
]);
export const NOT_COVERED_LAYERS = Object.freeze([
  'space', 'materials', 'interior', 'scene'
]);
export const SHADOW_OUTPUT_FILES = Object.freeze([
  'manifest.json', 'review.json', 'prompt-packet.json',
  'explanation.json', 'report.md'
]);

export const FATAL_SHADOW_ERROR_CODES = Object.freeze([
  'INVALID_ARGUMENT',
  'RUN_OUTSIDE_OUT_ROOT',
  'SYMLINK_NOT_ALLOWED',
  'BLUEPRINT_MISSING',
  'BLUEPRINT_INVALID',
  'PLAYBOOK_CORPUS_INVALID',
  'CHECK_REGISTRY_INCOMPLETE',
  'SHADOW_OUTPUT_OWNERSHIP',
  'SHADOW_INSTALL_FAILED'
]);

export const LLM_DEGRADATION_CODES = Object.freeze([
  'LLM_UNCONFIGURED',
  'LLM_REQUEST_FAILED',
  'LLM_OUTPUT_INVALID',
  'LLM_AUTHORITY_VIOLATION'
]);
