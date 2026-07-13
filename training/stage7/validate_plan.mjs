import fs from 'node:fs/promises';
import {
  validateStage7Condition,
  validateStage7Plan
} from '../../src/construction/learning/coarseSemanticVoxelSchema.js';

async function main() {
  const [conditionPath, planPath] = process.argv.slice(2);
  if (!conditionPath || !planPath) {
    throw new Error('usage: node training/stage7/validate_plan.mjs <condition.json> <plan.json>');
  }
  const condition = JSON.parse(await fs.readFile(conditionPath, 'utf8'));
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  const conditionValidation = validateStage7Condition(condition);
  if (!conditionValidation.ok) {
    throw new Error(`invalid condition: ${conditionValidation.errors.join('; ')}`);
  }
  const planValidation = validateStage7Plan(plan, { condition });
  if (!planValidation.ok) {
    throw new Error(`invalid plan: ${planValidation.errors.join('; ')}`);
  }
  console.log(JSON.stringify({
    ok: true,
    condition_hash: condition.condition_hash,
    run_count: planValidation.stats.run_count
  }));
}

main().catch((error) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
