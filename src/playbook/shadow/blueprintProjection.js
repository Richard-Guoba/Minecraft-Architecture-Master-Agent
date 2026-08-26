import { deepFreeze } from './canonical.js';
import { shadowError } from './contracts.js';

export function projectBlueprint(blueprint) {
  if (!isPlainObject(blueprint) || blueprint.workflow !== 'construction_method_v1') {
    throw shadowError('BLUEPRINT_INVALID');
  }

  return deepFreeze({
    brief: {
      prompt: stringOrNull(blueprint.prompt),
      style: stringOrNull(blueprint.architecture?.style),
      style_family: stringOrNull(blueprint.architecture?.style_family),
      typology: stringOrNull(blueprint.architecture?.typology)
    },
    massing: {
      volumes: arrayOrNull(blueprint.architecture?.volumes),
      volume_boxes: arrayOrNull(blueprint.shell?.volumeBoxes),
      bounds: objectOrNull(blueprint.bounds)
    },
    structure: {
      system: stringOrNull(blueprint.structure?.system),
      structural_intent: objectOrNull(blueprint.structure?.structural_intent),
      foundation: objectOrNull(blueprint.structure?.foundation),
      load_paths: arrayOrNull(blueprint.structure?.load_paths),
      support_elements: arrayOrNull(blueprint.structure?.support_elements)
    },
    roof: {
      style: stringOrNull(blueprint.roof?.style),
      profile: stringOrNull(blueprint.roof?.profile),
      materials: objectOrNull(blueprint.roof?.materials),
      elements: arrayOrNull(blueprint.roof?.elements),
      overhang: finiteNumberOrNull(blueprint.roof?.overhang)
    },
    facade: {
      composition_strategy: objectOrNull(blueprint.facade?.composition_strategy),
      depth_layers: arrayOrNull(blueprint.facade?.facade_depth_layers),
      elements: arrayOrNull(blueprint.facade?.facade_elements),
      window_system: objectOrNull(blueprint.facade?.window_system)
    },
    pointers: fixedPointerMap()
  });
}

function stringOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayOrNull(value) {
  return Array.isArray(value) && isJsonValue(value) ? structuredClone(value) : null;
}

function objectOrNull(value) {
  return isPlainObject(value) && isJsonValue(value) ? structuredClone(value) : null;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value) {
  return isJsonValueWithin(value, new WeakSet());
}

function isJsonValueWithin(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !isPlainObject(value)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = children.every((child) => isJsonValueWithin(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function fixedPointerMap() {
  return {
    brief: {
      prompt: '/prompt',
      style: '/architecture/style',
      style_family: '/architecture/style_family',
      typology: '/architecture/typology'
    },
    massing: {
      volumes: '/architecture/volumes',
      volume_boxes: '/shell/volumeBoxes',
      bounds: '/bounds'
    },
    structure: {
      system: '/structure/system',
      structural_intent: '/structure/structural_intent',
      foundation: '/structure/foundation',
      load_paths: '/structure/load_paths',
      support_elements: '/structure/support_elements'
    },
    roof: {
      style: '/roof/style',
      profile: '/roof/profile',
      materials: '/roof/materials',
      elements: '/roof/elements',
      overhang: '/roof/overhang'
    },
    facade: {
      composition_strategy: '/facade/composition_strategy',
      depth_layers: '/facade/facade_depth_layers',
      elements: '/facade/facade_elements',
      window_system: '/facade/window_system'
    }
  };
}
