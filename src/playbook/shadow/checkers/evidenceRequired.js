import { checkResult } from './result.js';

export function evidenceRequiredChecker({ missing, unknowns = [] }) {
  return {
    evaluate() {
      return checkResult('unknown', { missing, unknowns });
    }
  };
}
