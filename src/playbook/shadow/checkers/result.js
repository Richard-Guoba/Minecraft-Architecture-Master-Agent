import { deepFreeze } from '../canonical.js';

export function checkResult(status, {
  evidence = [], observations = [], missing = [], unknowns = []
} = {}) {
  return deepFreeze({
    status,
    evidence_json_pointers: [...evidence],
    observations: [...observations],
    missing_signals: [...missing],
    unknown_ids: [...unknowns]
  });
}
