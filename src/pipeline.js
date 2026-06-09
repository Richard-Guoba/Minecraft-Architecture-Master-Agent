import path from 'node:path';
import { RequirementAgent } from './agents/RequirementAgent.js';
import { SkillRouterAgent } from './agents/SkillRouterAgent.js';
import { PlannerAgent } from './agents/PlannerAgent.js';
import { DesignerAgent } from './agents/DesignerAgent.js';
import { BlueprintAgent } from './agents/BlueprintAgent.js';
import { ValidatorAgent } from './agents/ValidatorAgent.js';
import { CriticAgent } from './agents/CriticAgent.js';
import { RepairAgent } from './agents/RepairAgent.js';
import { ExportAgent } from './agents/ExportAgent.js';
import { ZhipuClient } from './llm/ZhipuClient.js';
import { createTimestamp, ensureDir } from './lib/fs.js';

export async function runPipeline({
  prompt,
  mode = 'auto',
  mcVersion = '1.21',
  outRoot,
  seed,
  cwd = process.cwd(),
  minecraftDir,
  world,
  autoBuild = false
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required.');
  }

  const outputDir = path.join(path.resolve(outRoot || path.join(cwd, 'out')), createTimestamp());
  await ensureDir(outputDir);

  const llmClient = new ZhipuClient({
    apiKey: process.env.ZHIPU_API_KEY,
    baseUrl: process.env.ZHIPU_BASE_URL,
    model: process.env.ZHIPU_MODEL
  });

  const requirementAgent = new RequirementAgent({ llmClient, mode });
  const skillRouterAgent = new SkillRouterAgent({ llmClient, mode });
  const plannerAgent = new PlannerAgent({ llmClient, mode });
  const designerAgent = new DesignerAgent({ seed });
  const blueprintAgent = new BlueprintAgent();
  const validatorAgent = new ValidatorAgent();
  const criticAgent = new CriticAgent({ llmClient, mode });
  const repairAgent = new RepairAgent();
  const exportAgent = new ExportAgent({ outputDir, mcVersion, minecraftDir, world, autoBuild });

  const requirement = await requirementAgent.run(prompt);
  const skill = await skillRouterAgent.run(requirement);
  const plan = await plannerAgent.run(requirement, skill);
  let design = designerAgent.run(requirement, plan, skill);
  let blueprint = blueprintAgent.run(design);
  let validation = validatorAgent.run(blueprint, design);
  let critique = await criticAgent.run({ requirement, skill, plan, design, blueprint, validation });
  const repair = repairAgent.run({ requirement, skill, plan, critique });
  let finalRequirement = requirement;
  let finalPlan = plan;

  if (repair.applied) {
    finalRequirement = repair.requirement;
    finalPlan = repair.plan;
    design = designerAgent.run(finalRequirement, finalPlan, skill);
    blueprint = blueprintAgent.run(design);
    validation = validatorAgent.run(blueprint, design);
    critique = await criticAgent.run({
      requirement: finalRequirement,
      skill,
      plan: finalPlan,
      design,
      blueprint,
      validation,
      repaired: true
    });
  }

  const artifacts = await exportAgent.run({
    prompt,
    requirement: finalRequirement,
    originalRequirement: requirement,
    skill,
    plan: finalPlan,
    critique,
    repair,
    design,
    blueprint,
    validation
  });

  return {
    prompt,
    outputDir,
    requirement: finalRequirement,
    originalRequirement: requirement,
    skill,
    plan: finalPlan,
    design,
    blueprint,
    validation,
    critique,
    repair,
    artifacts
  };
}
