import { BlueprintWorkspace } from './blueprint/BlueprintWorkspace.js';
import { FurnishingAgent } from './blueprint/FurnishingAgent.js';
import { GardenAgent } from './blueprint/GardenAgent.js';
import { GridGeometryEngine } from '../engine/GridGeometryEngine.js';

export class SuperBlueprintAgent {
  constructor() {
    this.geometryEngine = new GridGeometryEngine();
    this.furnishingAgent = new FurnishingAgent();
    this.gardenAgent = new GardenAgent();
  }

  run({ design, architecture, topology }) {
    const workspace = new BlueprintWorkspace(design);
    const shell = this.geometryEngine.generateShell(workspace, architecture);
    const layout = this.geometryEngine.fitRoomsBsp(workspace, architecture, topology, shell);
    const furnishing = this.furnishingAgent.run(workspace, layout);
    const garden = this.gardenAgent.run(workspace, shell);

    workspace.setAgentOutputs({
      superArchitect: architecture,
      superPlanner: topology,
      geometry: {
        engine: 'CSG+BSP sparse voxel engine',
        csg: shell.csg,
        bsp: layout.bsp
      },
      shell,
      layout,
      furnishing,
      garden
    });
    return workspace.toBlueprint();
  }
}
