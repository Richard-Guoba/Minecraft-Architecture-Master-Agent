import { evidenceRequiredChecker } from './checkers/evidenceRequired.js';
import {
  checkPrimarySecondaryHierarchy,
  checkSubordinateSupportVolume,
  checkThreeVolumeComposition
} from './checkers/massing.js';
import { checkVisibleLoadPath } from './checkers/structure.js';
import { deepFreeze } from './canonical.js';
import { shadowError } from './contracts.js';

const CHECKER_ROWS = Object.freeze([
  row('check:massing:three-volume-composition', 'rule:structure.compose-three-volumes', 'massing', 'structural', checkThreeVolumeComposition),
  row('check:massing:continuous-blank-plane', 'rule:structure.layer-volumes-to-reduce-blankness', 'massing', 'evidence-required', evidence(['brief.primary_viewpoint', 'massing.blank_plane_regions'], ['unknown:blank-plane-threshold'])),
  row('check:massing:primary-secondary-hierarchy', 'rule:structure.create-primary-secondary-hierarchy', 'massing', 'structural', checkPrimarySecondaryHierarchy),
  row('check:massing:subordinate-support-volume', 'rule:structure.keep-support-volumes-subordinate', 'structure', 'structural', checkSubordinateSupportVolume),
  row('check:roof:border-readability', 'rule:roof.border-with-material-contrast', 'roof', 'evidence-required', evidence(['roof.surface_regions.visual_contrast'], ['unknown:aesthetic-evaluator'])),
  row('check:roof:slope-massing-fit', 'rule:roof.scale-slope-to-massing', 'roof', 'evidence-required', evidence(['roof.span_and_slope_ratio'], ['unknown:roof-slope-table'])),
  row('check:roof:large-flat-plane', 'rule:roof.break-large-flat-plane', 'roof', 'evidence-required', evidence(['roof.surface_regions.area'], ['unknown:blank-plane-threshold'])),
  row('check:facade:opening-inside-frame', 'rule:facade.frame-before-openings', 'facade', 'evidence-required', evidence(['structure.frames', 'facade.bay_grid', 'facade.opening_sequence'])),
  row('check:facade:frame-infill-depth', 'rule:facade.offset-frame-for-depth', 'facade', 'evidence-required', evidence(['facade.frame_depth', 'facade.infill_depth'])),
  row('check:facade:large-wall-partition', 'rule:facade.partition-large-wall', 'facade', 'evidence-required', evidence(['facade.bay_grid', 'facade.wall_span'], ['unknown:blank-plane-threshold'])),
  row('check:facade:repetitive-bay-signature', 'rule:facade.break-repetitive-bays', 'facade', 'evidence-required', evidence(['facade.bay_grid', 'facade.motif_signatures'], ['unknown:repetition-limit'])),
  row('check:structure:purposeful-overhang', 'rule:medieval.extend-only-needed-facades', 'structure', 'evidence-required', evidence(['structure.overhangs', 'structure.support_paths'], ['unknown:medieval-scale-generalization'])),
  row('check:structure:visible-load-path', 'rule:medieval.show-load-path', 'structure', 'structural', checkVisibleLoadPath),
  row('check:roof:overhang-axis-alignment', 'rule:medieval.align-roof-with-overhang', 'roof', 'evidence-required', evidence(['structure.overhangs', 'structure.support_paths', 'roof.ridge_axis'], ['unknown:medieval-scale-generalization'])),
  row('check:structure:tall-timber-base-weight', 'rule:medieval.use-stone-base-for-height', 'structure', 'evidence-required', evidence(['structure.base_strategy', 'massing.height_scale'], ['unknown:medieval-scale-generalization'])),
  row('check:massing:tower-joint-continuity', 'rule:case.join-crossed-massing-with-tower', 'massing', 'evidence-required', evidence(['case.source_identity', 'massing.volume_relations'], ['unknown:cross-author-validity'])),
  row('check:facade:motif-unity-with-bay-variation', 'rule:case.repeat-motif-for-unity', 'facade', 'evidence-required', evidence(['case.source_identity', 'facade.motif_signatures', 'facade.variation_axes'], ['unknown:cross-author-validity'])),
  row('check:facade:connected-vegetation-path', 'rule:case.use-greenery-as-composition', 'facade', 'evidence-required', evidence(['case.source_identity', 'facade.vegetation_path'], ['unknown:aesthetic-evaluator'])),
  row('check:brief:viewpoint-detail-allocation', 'rule:case.allocate-detail-by-viewpoint', 'brief', 'evidence-required', evidence(['case.source_identity', 'brief.primary_viewpoint', 'brief.detail_budget'], ['unknown:aesthetic-evaluator'])),
  row('check:roof:warm-dark-visual-balance', 'rule:case.balance-warm-mass-with-dark-roof', 'roof', 'evidence-required', evidence(['case.source_identity', 'roof.surface_regions.visual_color_balance'], ['unknown:aesthetic-evaluator'])),
  row('check:brief:foreground-background-intent', 'rule:case.compose-context-depth', 'brief', 'evidence-required', evidence(['case.source_identity', 'brief.primary_viewpoint', 'brief.scene_intent'], ['unknown:aesthetic-evaluator']))
]);

export function createCheckerDefinitions() {
  return deepFreeze(CHECKER_ROWS.map(({ check_id, rule_id, design_layer, kind, evaluate }) => ({
    check_id, rule_id, design_layer, kind, evaluate
  })));
}

export function createCheckerRegistry() {
  return readonlyMap(createCheckerDefinitions().map((definition) => [definition.check_id, definition]));
}

export function validateCheckerRegistry(cards, registry) {
  const definitions = definitionsFrom(registry);
  if (!Array.isArray(cards) || cards.length !== CHECKER_ROWS.length || definitions.length !== CHECKER_ROWS.length) {
    incomplete();
  }

  const expectedByCheck = new Map(CHECKER_ROWS.map((definition) => [definition.check_id, definition]));
  const cardsByCheck = new Map();
  for (const card of cards) {
    const checks = card?.runtime_projection?.observable_checks;
    if (!Array.isArray(checks) || checks.length !== 1 || typeof checks[0] !== 'string' || cardsByCheck.has(checks[0])) {
      incomplete();
    }
    cardsByCheck.set(checks[0], card);
  }

  const seen = new Set();
  for (const { mapKey, definition } of definitions) {
    const expected = expectedByCheck.get(definition?.check_id);
    if (
      !expected
      || seen.has(definition.check_id)
      || mapKey !== undefined && mapKey !== definition.check_id
      || definition.rule_id !== expected.rule_id
      || definition.design_layer !== expected.design_layer
      || definition.kind !== expected.kind
      || typeof definition.evaluate !== 'function'
    ) incomplete();
    seen.add(definition.check_id);

    const card = cardsByCheck.get(definition.check_id);
    if (
      !card
      || card.rule_id !== definition.rule_id
      || card.design_layer !== definition.design_layer
      || card.runtime_projection.observable_checks.length !== 1
    ) incomplete();
  }

  if (seen.size !== CHECKER_ROWS.length || cardsByCheck.size !== CHECKER_ROWS.length) incomplete();
  return readonlyMap(cards.map((card) => {
    const checkId = card.runtime_projection.observable_checks[0];
    const definition = definitions.find(({ definition: item }) => item.check_id === checkId)?.definition;
    if (!definition) incomplete();
    return [checkId, definition];
  }));
}

function readonlyMap(entries) {
  const map = new Map(entries);
  const immutable = new Proxy(map, {
    get(target, property) {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return rejectMapMutation;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return Object.freeze(immutable);
}

function rejectMapMutation() {
  throw new TypeError('ReadonlyMap cannot be mutated');
}

function row(check_id, rule_id, design_layer, kind, evaluate) {
  return Object.freeze({ check_id, rule_id, design_layer, kind, evaluate });
}

function evidence(missing, unknowns = []) {
  return evidenceRequiredChecker({ missing, unknowns }).evaluate;
}

function definitionsFrom(registry) {
  if (registry instanceof Map) {
    return [...registry.entries()].map(([mapKey, definition]) => ({ mapKey, definition }));
  }
  if (Array.isArray(registry)) return registry.map((definition) => ({ definition }));
  incomplete();
}

function incomplete() {
  throw shadowError('CHECK_REGISTRY_INCOMPLETE');
}
