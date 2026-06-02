import { BlueprintWorkspace } from './blueprint/BlueprintWorkspace.js';
import { ShellAgent } from './blueprint/ShellAgent.js';
import { LayoutAgent } from './blueprint/LayoutAgent.js';
import { GardenAgent } from './blueprint/GardenAgent.js';
import { FurnishingAgent } from './blueprint/FurnishingAgent.js';

export class BlueprintAgent {
  constructor() {
    this.shellAgent = new ShellAgent();
    this.layoutAgent = new LayoutAgent();
    this.gardenAgent = new GardenAgent();
    this.furnishingAgent = new FurnishingAgent();
  }

  run(design) {
    const workspace = new BlueprintWorkspace(design);
    const shell = this.shellAgent.run(workspace);
    const layout = this.layoutAgent.run(workspace, shell);
    const furnishing = this.furnishingAgent.run(workspace, layout);
    const garden = this.gardenAgent.run(workspace, shell);

    workspace.setAgentOutputs({ shell, layout, furnishing, garden });
    return workspace.toBlueprint();
  }
}
