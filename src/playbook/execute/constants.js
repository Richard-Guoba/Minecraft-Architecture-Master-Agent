import { deepFreeze } from '../shadow/canonical.js';

export const EXECUTE_SCHEMA_VERSION = 1;
export const EXECUTE_COMPILER_VERSION = 1;

export const PLAYBOOK_MODES = Object.freeze(['off', 'execute']);
export const DESIGN_LAYER_ORDER = Object.freeze([
  'brief', 'massing', 'structure', 'roof', 'facade'
]);
export const INVALIDATES_BY_LAYER = deepFreeze({
  brief: ['massing', 'structure', 'roof', 'facade'],
  massing: ['structure', 'roof', 'facade'],
  structure: ['roof', 'facade'],
  roof: ['facade'],
  facade: []
});
export const CHECKPOINT_STATUSES = Object.freeze([
  'draft', 'reviewing', 'accepted', 'rework_required', 'superseded', 'failed'
]);
export const P5_ERROR_CODES = Object.freeze([
  'P5_DESIGN_INVALID',
  'P5_CHECKPOINT_INVALID',
  'P5_REPAIR_INVALID',
  'P5_REPAIR_CONFLICT',
  'P5_STALE_BASE',
  'P5_REPLAY_FAILED',
  'P5_HARD_QA_FAILED',
  'P5_CORE_VIOLATION',
  'P5_INSTALL_FAILED',
  'P5_MODE_INVALID',
  'P5_OPTIONS_INCOMPATIBLE',
  'P5_AUTHORITY_INVALID',
  'P5_OUTPUT_OWNERSHIP',
  'P5_NO_ELIGIBLE_CANDIDATE'
]);

export const EXECUTABLE_REPAIR_ROWS = deepFreeze([
  {
    rule_id: 'rule:structure.compose-three-volumes',
    check_id: 'check:massing:three-volume-composition',
    design_layer: 'massing',
    repair_operation_id: 'repair:massing:resize-or-reposition-volume',
    invalidates_layers: ['structure', 'roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: [
      'center-primary-and-reattach-secondaries',
      'differentiate-equal-secondary-scale'
    ]
  },
  {
    rule_id: 'rule:structure.create-primary-secondary-hierarchy',
    check_id: 'check:massing:primary-secondary-hierarchy',
    design_layer: 'massing',
    repair_operation_id: 'repair:massing:strengthen-primary-volume',
    invalidates_layers: ['structure', 'roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: [
      'promote-largest-stable',
      'reduce-nondominant-secondary'
    ]
  },
  {
    rule_id: 'rule:structure.keep-support-volumes-subordinate',
    check_id: 'check:massing:subordinate-support-volume',
    design_layer: 'structure',
    repair_operation_id: 'repair:massing:reduce-support-volume-prominence',
    invalidates_layers: ['structure', 'roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: ['reduce-attached-support-scale']
  },
  {
    rule_id: 'rule:medieval.show-load-path',
    check_id: 'check:structure:visible-load-path',
    design_layer: 'structure',
    repair_operation_id: 'repair:structure:connect-support-path',
    invalidates_layers: ['roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: ['connect-known-structural-anchors']
  }
]);
