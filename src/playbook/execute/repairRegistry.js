import { EXECUTABLE_REPAIR_ROWS } from './constants.js';
import { executeError } from './contracts.js';
import { compileMassingRepair, chooseDefaultMassingVariant } from './repairCompilers/massing.js';
import { compileStructureRepair, chooseDefaultStructureVariant } from './repairCompilers/structure.js';
import { createCheckerDefinitions } from '../shadow/checkerRegistry.js';

const COMPILERS = Object.freeze({
  'repair:massing:resize-or-reposition-volume': compileMassingRepair,
  'repair:massing:strengthen-primary-volume': compileMassingRepair,
  'repair:massing:reduce-support-volume-prominence': compileMassingRepair,
  'repair:structure:connect-support-path': compileStructureRepair
});
const DEFAULTS = Object.freeze({
  'repair:massing:resize-or-reposition-volume': chooseDefaultMassingVariant,
  'repair:massing:strengthen-primary-volume': chooseDefaultMassingVariant,
  'repair:massing:reduce-support-volume-prominence': chooseDefaultMassingVariant,
  'repair:structure:connect-support-path': chooseDefaultStructureVariant
});

const DEFINITIONS = Object.freeze(EXECUTABLE_REPAIR_ROWS.map((row) => Object.freeze({
  ...row,
  compile: COMPILERS[row.repair_operation_id],
  chooseDefault: DEFAULTS[row.repair_operation_id]
})));

export function createExecutableRepairRegistry() {
  return readonlyMap(DEFINITIONS.map((row) => [row.repair_operation_id, row]));
}

export function validateExecutableRepairRegistry({ cards, checkerDefinitions, registry } = {}) {
  try {
    const supplied = rowsFrom(registry);
    const expectedCheckers = createCheckerDefinitions();
    if (!Array.isArray(cards) || cards.length !== expectedCheckers.length
      || !Array.isArray(checkerDefinitions) || checkerDefinitions.length !== expectedCheckers.length
      || supplied.length !== DEFINITIONS.length) invalid();
    for (const [index, checker] of checkerDefinitions.entries()) {
      const expected = expectedCheckers[index];
      if (checker?.check_id !== expected.check_id || checker.rule_id !== expected.rule_id
        || checker.design_layer !== expected.design_layer || checker.kind !== expected.kind
        || checker.evaluate !== expected.evaluate) invalid();
    }
    const checkerById = new Map(checkerDefinitions.map((row) => [row?.check_id, row]));
    if (checkerById.size !== checkerDefinitions.length) invalid();
    const cardByRule = new Map(cards.map((card) => [card?.rule_id, card]));
    if (cardByRule.size !== cards.length) invalid();
    const output = [];
    for (const [index, suppliedRow] of supplied.entries()) {
      const expected = DEFINITIONS[index];
      const { mapKey, row } = suppliedRow;
      if (!row || mapKey !== undefined && mapKey !== row.repair_operation_id
        || row.repair_operation_id !== expected.repair_operation_id
        || row.rule_id !== expected.rule_id || row.check_id !== expected.check_id
        || row.design_layer !== expected.design_layer || row.compiler_version !== expected.compiler_version
        || !sameArray(row.invalidates_layers, expected.invalidates_layers)
        || !sameArray(row.allowed_variant_ids, expected.allowed_variant_ids)
        || row.compile !== expected.compile || row.chooseDefault !== expected.chooseDefault) invalid();
      const checker = checkerById.get(row.check_id);
      const card = cardByRule.get(row.rule_id);
      if (!checker || checker.rule_id !== row.rule_id || checker.design_layer !== row.design_layer
        || checker.kind !== 'structural' || typeof checker.evaluate !== 'function'
        || !card || card.teaching_role !== 'core-procedure' || card.design_layer !== row.design_layer
        || !sameArray(card.runtime_projection?.observable_checks, [row.check_id])
        || !sameArray(card.runtime_projection?.repair_operations, [row.repair_operation_id])
        || !sameArray(card.runtime_projection?.invalidates_layers, row.invalidates_layers)) invalid();
      output.push([row.repair_operation_id, expected]);
    }
    return readonlyMap(output);
  } catch (error) {
    if (error?.code === 'P5_AUTHORITY_INVALID') throw error;
    throw executeError('P5_AUTHORITY_INVALID');
  }
}

function rowsFrom(registry) {
  if (registry instanceof Map) return [...registry.entries()].map(([mapKey, row]) => ({ mapKey, row }));
  if (Array.isArray(registry)) return registry.map((row) => ({ row }));
  invalid();
}
function readonlyMap(entries) {
  const map = new Map(entries);
  let immutable;
  immutable = new Proxy(map, { get(target, property) {
    if (['set', 'delete', 'clear'].includes(property)) return rejectMutation;
    if (property === 'forEach') return (callback, thisArg) => target.forEach((value, key) => callback.call(thisArg, value, key, immutable));
    const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  return Object.freeze(immutable);
}
function rejectMutation() { throw new TypeError('ReadonlyMap cannot be mutated'); }
function sameArray(left, right) { return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]); }
function invalid() { throw executeError('P5_AUTHORITY_INVALID'); }
