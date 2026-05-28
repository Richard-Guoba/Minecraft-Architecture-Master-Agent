import path from 'node:path';
import { RequirementAgent } from './agents/RequirementAgent.js';
import { DesignerAgent } from './agents/DesignerAgent.js';
import { BlueprintAgent } from './agents/BlueprintAgent.js';
import { ValidatorAgent } from './agents/ValidatorAgent.js';
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
  const designerAgent = new DesignerAgent({ seed });
  const blueprintAgent = new BlueprintAgent();
  const validatorAgent = new ValidatorAgent();
  const exportAgent = new ExportAgent({ outputDir, mcVersion, minecraftDir, world, autoBuild });

  const requirement = await requirementAgent.run(prompt);
  const design = designerAgent.run(requirement);
  const blueprint = blueprintAgent.run(design);
  const validation = validatorAgent.run(blueprint, design);
  const artifacts = await exportAgent.run({ prompt, requirement, design, blueprint, validation });

  return {
    prompt,
    outputDir,
    requirement,
    design,
    blueprint,
    validation,
    artifacts
  };
}
