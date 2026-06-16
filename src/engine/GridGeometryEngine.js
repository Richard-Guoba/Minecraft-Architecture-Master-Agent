import { doorState, point } from '../agents/blueprint/BlueprintWorkspace.js';

const DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

export class GridGeometryEngine {
  generateShell(workspace, architecture) {
    this.workspace = workspace;
    this.design = workspace.design;
    this.architecture = architecture;
    this.palette = workspace.design.palette;
    this.volumeBoxes = this.resolveVolumes(architecture);
    const solid = this.buildCsgGrid(this.volumeBoxes);
    this.emitShellFromGrid(solid);
    this.addFloors();
    this.addStructuralFrame();
    this.addRoofs();
    this.addOpeningsAndFacade();

    return {
      exteriorBounds: workspace.bounds,
      interiorSpaces: this.interiorSpaces(),
      extensions: this.volumeBoxes
        .filter((box) => box.module === 'wing')
        .map((box) => ({
          type: this.design.plan?.footprint?.type || 'extension',
          side: box.side,
          floors: box.floors,
          bounds: pickBounds(box)
        })),
      courtyard: this.courtyard,
      openings: {
        mainDoor: workspace.doorOpening(),
        window: workspace.elements.window || {}
      },
      roof: workspace.elements.roof || {},
      csg: {
        volumeCount: this.volumeBoxes.length,
        solidCellCount: solid.size,
        philosophy: architecture.philosophy
      }
    };
  }

  fitRoomsBsp(workspace, architecture, topology, shell) {
    this.workspace = workspace;
    this.design = workspace.design;
    this.palette = workspace.design.palette;
    const { width, depth, floorHeight, wallHeight } = workspace.design.dimensions;
    const rooms = [];
    const interiorDoors = [];
    const floorOpenings = [];
    const mainInner = {
      minX: workspace.wallThickness(),
      maxX: width - 1 - workspace.wallThickness(),
      minZ: workspace.wallThickness(),
      maxZ: depth - 1 - workspace.wallThickness()
    };

    for (let level = 0; level < workspace.design.floors; level += 1) {
      const levelNodes = topology.nodes
        .filter((node) => node.level === level && !['balcony'].includes(node.type))
        .filter((node) => level > 0 || node.type !== 'corridor');
      const fallbackNodes = level === 0
        ? [
          { id: 'entry', label: '门厅', type: 'entry', weight: 0.7 },
          { id: 'living', label: '客厅', type: 'living', weight: 1.5 },
          { id: 'kitchen', label: '厨房', type: 'kitchen', weight: 0.9 }
        ]
        : [
          { id: `bedroom-${level}`, label: '卧室', type: 'bedroom', weight: 1 },
          { id: `study-${level}`, label: '书房', type: 'study', weight: 0.7 }
        ];
      const nodes = levelNodes.length ? levelNodes : fallbackNodes;
      const rect = {
        level,
        minX: mainInner.minX,
        maxX: mainInner.maxX,
        minZ: mainInner.minZ,
        maxZ: mainInner.maxZ,
        minY: level * floorHeight + 2,
        maxY: Math.min((level + 1) * floorHeight, wallHeight)
      };
      rooms.push(...this.partitionBsp(rect, nodes, 0, interiorDoors));
    }

    for (const space of shell.interiorSpaces.filter((item) => item.source === 'super-wing')) {
      rooms.push({
        level: space.level,
        tag: space.side === 'west' ? (space.level === 0 ? 'dining' : 'study') : (space.level === 0 ? 'kitchen' : 'bedroom'),
        minX: space.minX,
        maxX: space.maxX,
        minY: space.minY,
        maxY: space.maxY,
        minZ: space.minZ,
        maxZ: space.maxZ
      });
    }

    const stairs = workspace.design.floors > 1 && workspace.elements.interior?.stairs !== false
      ? this.addBspStairs(floorOpenings)
      : [];

    return {
      rooms,
      stairs,
      interiorDoors,
      floorOpenings,
      topology,
      bsp: {
        nodeCount: topology.nodes.length,
        edgeCount: topology.edges.length,
        splitStrategy: topology.bspHints?.splitStrategy || 'weighted'
      }
    };
  }

  resolveVolumes(architecture) {
    const { width, depth, wallHeight, floorHeight } = this.design.dimensions;
    const center = Math.floor(width / 2);
    const boxes = [];
    const main = {
      id: 'main',
      role: '主体体块',
      module: 'walls',
      minX: 0,
      maxX: width - 1,
      minY: 1,
      maxY: wallHeight,
      minZ: 0,
      maxZ: depth - 1,
      floors: this.design.floors,
      side: 'center',
      booleanMode: 'union'
    };
    boxes.push(main);

    for (const volume of architecture.volumes || []) {
      if (volume.id === 'main') continue;
      const relation = String(volume.placement?.relation || volume.id || '').toLowerCase();
      const scale = volume.scale || {};
      const boxWidth = clamp(Math.round(width * (scale.x || 0.3)), 4, Math.max(4, Math.floor(width * 0.5)));
      const boxDepth = clamp(Math.round(depth * (scale.z || 0.5)), 4, Math.max(4, depth));
      const boxHeight = clamp(Math.round(wallHeight * (scale.y || 1)), floorHeight, wallHeight);
      const floors = Math.max(1, Math.min(this.design.floors, Math.round(boxHeight / floorHeight)));
      const half = Math.floor(boxWidth / 2);
      let box = {
        id: volume.id,
        role: volume.role,
        module: moduleForVolume(volume),
        minX: center - half,
        maxX: center - half + boxWidth - 1,
        minY: 1,
        maxY: boxHeight,
        minZ: depth,
        maxZ: depth + boxDepth - 1,
        floors,
        side: 'front',
        booleanMode: volume.booleanMode || 'union'
      };

      if (relation.includes('west') || volume.id.includes('west')) {
        box = {
          ...box,
          minX: -boxWidth,
          maxX: -1,
          minZ: clamp(Math.floor(depth * 0.18), 1, Math.max(1, depth - boxDepth - 1)),
          side: 'west'
        };
        box.maxZ = box.minZ + boxDepth - 1;
      } else if (relation.includes('east') || volume.id.includes('east') || volume.id.includes('glass-wing')) {
        box = {
          ...box,
          minX: width,
          maxX: width + boxWidth - 1,
          minZ: relation.includes('rear')
            ? clamp(Math.floor(depth * 0.12), 1, Math.max(1, depth - boxDepth - 1))
            : clamp(Math.floor(depth * 0.18), 1, Math.max(1, depth - boxDepth - 1)),
          side: 'east'
        };
        box.maxZ = box.minZ + boxDepth - 1;
      } else if (relation.includes('front') || volume.id.includes('porch') || volume.id.includes('gate')) {
        box.minX = center - half;
        box.maxX = box.minX + boxWidth - 1;
        box.minZ = depth;
        box.maxZ = depth + boxDepth - 1;
        box.side = 'front';
      }

      boxes.push(box);
    }

    return boxes;
  }

  buildCsgGrid(boxes) {
    const grid = new Map();
    for (const box of boxes) {
      for (let x = box.minX; x <= box.maxX; x += 1) {
        for (let y = box.minY; y <= box.maxY; y += 1) {
          for (let z = box.minZ; z <= box.maxZ; z += 1) {
            const key = keyFor(x, y, z);
            if (box.booleanMode === 'subtract') {
              grid.delete(key);
            } else {
              grid.set(key, { module: box.module, role: box.role });
            }
          }
        }
      }
    }
    return grid;
  }

  emitShellFromGrid(grid) {
    const runs = new Map();
    for (const [key, meta] of grid.entries()) {
      const [x, y, z] = parseKey(key);
      if (!isSurfaceCell(grid, x, y, z)) continue;
      const module = meta.module === 'wing' ? 'wing' : (meta.module === 'porch' ? 'porch' : 'walls');
      const runKey = `${y}|${z}|${module}`;
      if (!runs.has(runKey)) runs.set(runKey, []);
      runs.get(runKey).push(x);
    }

    for (const [runKey, xs] of runs.entries()) {
      const [yRaw, zRaw, module] = runKey.split('|');
      const y = Number(yRaw);
      const z = Number(zRaw);
      xs.sort((a, b) => a - b);
      let start = xs[0];
      let previous = xs[0];
      for (let index = 1; index <= xs.length; index += 1) {
        const current = xs[index];
        if (current === previous + 1) {
          previous = current;
          continue;
        }
        this.workspace.fill(point(start, y, z), point(previous, y, z), this.palette.wall, module);
        start = current;
        previous = current;
      }
    }
  }

  addFloors() {
    const { floorHeight } = this.design.dimensions;
    for (const box of this.volumeBoxes) {
      const module = box.module === 'wing' ? 'wing' : (box.module === 'porch' ? 'porch' : 'floors');
      this.workspace.fill(point(box.minX, 0, box.minZ), point(box.maxX, 0, box.maxZ), this.palette.foundation, box.module === 'porch' ? 'porch' : 'foundation');
      for (let level = 0; level < box.floors; level += 1) {
        const y = level * floorHeight + 1;
        if (box.maxX - box.minX <= 2 || box.maxZ - box.minZ <= 2) continue;
        this.workspace.fill(point(box.minX + 1, y, box.minZ + 1), point(box.maxX - 1, y, box.maxZ - 1), this.palette.floor, module);
      }
    }
  }

  addStructuralFrame() {
    const { floorHeight } = this.design.dimensions;
    for (const box of this.volumeBoxes) {
      if (box.module === 'porch') continue;
      this.decorateBox(box, floorHeight);
    }
  }

  decorateBox(box, floorHeight) {
    const column = this.palette.column || this.palette.trim;
    const belt = this.palette.belt || this.palette.trim;
    const plinth = this.palette.plinth || this.palette.foundation;
    const module = box.module === 'wing' ? 'wing' : 'facade';

    this.workspace.fill(point(box.minX, 1, box.minZ), point(box.maxX, 2, box.minZ), plinth, module);
    this.workspace.fill(point(box.minX, 1, box.maxZ), point(box.maxX, 2, box.maxZ), plinth, module);
    this.workspace.fill(point(box.minX, 1, box.minZ), point(box.minX, 2, box.maxZ), plinth, module);
    this.workspace.fill(point(box.maxX, 1, box.minZ), point(box.maxX, 2, box.maxZ), plinth, module);

    for (const x of [box.minX, box.maxX]) {
      for (const z of [box.minZ, box.maxZ]) {
        this.workspace.fill(point(x, 1, z), point(x, box.maxY + 1, z), column, 'columns');
      }
    }

    for (const y of [...new Set([Math.min(floorHeight + 1, box.maxY), box.maxY])]) {
      this.workspace.fill(point(box.minX, y, box.minZ), point(box.maxX, y, box.minZ), belt, module);
      this.workspace.fill(point(box.minX, y, box.maxZ), point(box.maxX, y, box.maxZ), belt, module);
      this.workspace.fill(point(box.minX, y, box.minZ), point(box.minX, y, box.maxZ), belt, module);
      this.workspace.fill(point(box.maxX, y, box.minZ), point(box.maxX, y, box.maxZ), belt, module);
    }
  }

  addRoofs() {
    const rules = this.architecture.roofRules || {};
    for (const box of this.volumeBoxes) {
      if (box.module === 'porch') continue;
      const roofHeight = box.module === 'wing'
        ? Math.max(3, (rules.height || this.design.dimensions.roofHeight) - 1)
        : (rules.height || this.design.dimensions.roofHeight);
      const overhang = rules.overhang ?? 1;
      const style = box.module === 'wing' && this.architecture.footprint === 'winged' ? 'gabled' : (rules.style || 'gabled');
      if (style === 'flat') this.flatRoofForBox(box, overhang);
      else this.gabledRoofForBox(box, roofHeight, overhang);
    }
  }

  gabledRoofForBox(box, roofHeight, overhang) {
    for (let layer = 0; layer < roofHeight; layer += 1) {
      const x1 = box.minX - overhang + layer;
      const x2 = box.maxX + overhang - layer;
      if (x1 > x2) break;
      const y = box.maxY + 1 + layer;
      this.workspace.fill(point(x1, y, box.minZ - overhang), point(x2, y, box.maxZ + overhang), this.palette.roof, box.module === 'wing' ? 'wing' : 'roof');
    }
    const ridgeX = Math.floor((box.minX + box.maxX) / 2);
    const ridgeY = box.maxY + roofHeight + 1;
    this.workspace.fill(point(ridgeX, ridgeY, box.minZ - overhang), point(ridgeX, ridgeY, box.maxZ + overhang), this.palette.roofAccent || this.palette.trim, 'roof_detail');
    this.workspace.fill(point(box.minX - overhang, box.maxY + 1, box.minZ - overhang), point(box.maxX + overhang, box.maxY + 1, box.minZ - overhang), this.palette.eave || this.palette.trim, 'roof_detail');
    this.workspace.fill(point(box.minX - overhang, box.maxY + 1, box.maxZ + overhang), point(box.maxX + overhang, box.maxY + 1, box.maxZ + overhang), this.palette.eave || this.palette.trim, 'roof_detail');
  }

  flatRoofForBox(box, overhang) {
    const y = box.maxY + 1;
    this.workspace.fill(point(box.minX - overhang, y, box.minZ - overhang), point(box.maxX + overhang, y, box.maxZ + overhang), this.palette.roof, box.module === 'wing' ? 'wing' : 'roof');
    this.workspace.fill(point(box.minX - overhang, y + 1, box.minZ - overhang), point(box.maxX + overhang, y + 1, box.minZ - overhang), this.palette.trim, 'roof_detail');
    this.workspace.fill(point(box.minX - overhang, y + 1, box.maxZ + overhang), point(box.maxX + overhang, y + 1, box.maxZ + overhang), this.palette.trim, 'roof_detail');
    this.workspace.fill(point(box.minX - overhang, y + 1, box.minZ - overhang), point(box.minX - overhang, y + 1, box.maxZ + overhang), this.palette.trim, 'roof_detail');
    this.workspace.fill(point(box.maxX + overhang, y + 1, box.minZ - overhang), point(box.maxX + overhang, y + 1, box.maxZ + overhang), this.palette.trim, 'roof_detail');
  }

  addOpeningsAndFacade() {
    this.addMainDoor();
    this.addWindows();
    this.addPorch();
    this.addBalcony();
    this.addChimney();
    this.addDormers();
    this.addCourtyardMarker();
  }

  addMainDoor() {
    const { width, depth } = this.design.dimensions;
    const opening = this.workspace.doorOpening();
    const side = opening.side;
    const doorWidth = clamp(this.workspace.elements.door?.width || 1, 1, 3);
    const doorHeight = clamp(this.workspace.elements.door?.height || 2, 2, 4);
    const center = Math.floor((opening.start + opening.end) / 2);
    const doorStart = center - Math.floor(doorWidth / 2);
    const positions = Array.from({ length: doorWidth }, (_, index) => doorStart + index);

    if (side === 'south' || side === 'north') {
      const z = side === 'south' ? depth - 1 : 0;
      const outsideZ = side === 'south' ? depth : -1;
      this.workspace.fill(point(opening.start, 1, z), point(opening.end, doorHeight + 1, z), 'minecraft:air', 'door');
      positions.forEach((x, index) => this.placeDoorBlock(point(x, 1, z), side, index, positions.length));
      this.workspace.fill(point(opening.start, 0, outsideZ), point(opening.end, 0, outsideZ), this.palette.path, 'door');
      return;
    }

    const x = side === 'east' ? width - 1 : 0;
    const outsideX = side === 'east' ? width : -1;
    this.workspace.fill(point(x, 1, opening.start), point(x, doorHeight + 1, opening.end), 'minecraft:air', 'door');
    positions.forEach((z, index) => this.placeDoorBlock(point(x, 1, z), side, index, positions.length));
    this.workspace.fill(point(outsideX, 0, opening.start), point(outsideX, 0, opening.end), this.palette.path, 'door');
  }

  placeDoorBlock(basePoint, facing, index, count) {
    const hinge = count > 1 && index === count - 1 ? 'right' : 'left';
    this.workspace.setblock(basePoint, doorState(this.palette.doorBase, facing, 'lower', hinge), 'door');
    this.workspace.setblock(point(basePoint.x, basePoint.y + 1, basePoint.z), doorState(this.palette.doorBase, facing, 'upper', hinge), 'door');
  }

  addWindows() {
    const { floorHeight } = this.design.dimensions;
    const spec = this.workspace.elements.window || {};
    const windowWidth = clamp(spec.width || 2, 1, 6);
    const windowHeight = clamp(spec.height || 2, 1, Math.max(2, floorHeight - 2));
    const spacing = clamp(spec.spacing || 6, 3, 10);
    const doorOpening = this.workspace.doorOpening();

    for (const box of this.volumeBoxes.filter((item) => item.module !== 'porch')) {
      const xPositions = windowPositions(box.minX, box.maxX, windowWidth, spacing);
      const zPositions = windowPositions(box.minZ, box.maxZ, windowWidth, spacing);
      for (let level = 0; level < box.floors; level += 1) {
        const baseY = level * floorHeight + 2;
        for (const x of xPositions) {
          const overlapsDoor = box.id === 'main' && level === 0 && doorOpening.side === 'south' && x <= doorOpening.end && x + windowWidth - 1 >= doorOpening.start;
          this.placeWindowOnZ(box.minZ, x, baseY, windowWidth, windowHeight);
          if (!overlapsDoor) this.placeWindowOnZ(box.maxZ, x, baseY, windowWidth, windowHeight);
        }
        for (const z of zPositions) {
          this.placeWindowOnX(box.minX, z, baseY, windowWidth, windowHeight);
          this.placeWindowOnX(box.maxX, z, baseY, windowWidth, windowHeight);
        }
      }
    }
  }

  placeWindowOnZ(z, x, baseY, width, height) {
    const frame = this.palette.windowFrame || this.palette.trim;
    const sill = this.palette.windowSill || this.palette.trim;
    this.workspace.fill(point(x, baseY, z), point(x + width - 1, baseY + height - 1, z), this.palette.glass, 'windows');
    this.workspace.fill(point(x - 1, baseY - 1, z), point(x + width, baseY - 1, z), sill, 'facade');
    this.workspace.fill(point(x - 1, baseY, z), point(x - 1, baseY + height - 1, z), frame, 'facade');
    this.workspace.fill(point(x + width, baseY, z), point(x + width, baseY + height - 1, z), frame, 'facade');
    this.workspace.fill(point(x - 1, baseY + height, z), point(x + width, baseY + height, z), sill, 'facade');
  }

  placeWindowOnX(x, z, baseY, width, height) {
    const frame = this.palette.windowFrame || this.palette.trim;
    const sill = this.palette.windowSill || this.palette.trim;
    this.workspace.fill(point(x, baseY, z), point(x, baseY + height - 1, z + width - 1), this.palette.glass, 'windows');
    this.workspace.fill(point(x, baseY - 1, z - 1), point(x, baseY - 1, z + width), sill, 'facade');
    this.workspace.fill(point(x, baseY, z - 1), point(x, baseY + height - 1, z - 1), frame, 'facade');
    this.workspace.fill(point(x, baseY, z + width), point(x, baseY + height - 1, z + width), frame, 'facade');
    this.workspace.fill(point(x, baseY + height, z - 1), point(x, baseY + height, z + width), sill, 'facade');
  }

  addPorch() {
    if (!this.architecture.facadeRules?.porch && !this.workspace.elements.europeanVilla?.enabled) return;
    const porch = this.volumeBoxes.find((box) => box.module === 'porch');
    if (!porch) return;
    const { width, depth, floorHeight } = this.design.dimensions;
    const center = Math.floor(width / 2);
    const frontZ = depth;
    const columnXs = [porch.minX, porch.maxX];
    const columnZs = [frontZ, porch.maxZ];

    this.workspace.fill(point(porch.minX, 1, porch.minZ), point(porch.maxX, 1, porch.maxZ), this.palette.floor, 'porch');
    this.workspace.fill(point(porch.minX, 1, porch.maxZ + 1), point(porch.maxX, 1, porch.maxZ + 1), 'minecraft:stone_brick_stairs[facing=south,half=bottom]', 'porch');
    for (const x of columnXs) {
      for (const z of columnZs) {
        this.workspace.fill(point(x, 2, z), point(x, floorHeight, z), this.palette.column || this.palette.trim, 'columns');
      }
    }
    const y = floorHeight + 1;
    this.workspace.fill(point(porch.minX - 1, y, porch.minZ - 1), point(porch.maxX + 1, y, porch.maxZ + 1), this.palette.floor, 'porch');
    this.workspace.fill(point(porch.minX - 1, y + 1, porch.maxZ + 1), point(porch.maxX + 1, y + 1, porch.maxZ + 1), this.palette.roofAccent || this.palette.trim, 'roof_detail');
    this.workspace.setblock(point(center - 3, 3, porch.maxZ), this.palette.lamp, 'lighting');
    this.workspace.setblock(point(center + 3, 3, porch.maxZ), this.palette.lamp, 'lighting');
  }

  addBalcony() {
    if (!this.workspace.elements.balcony?.enabled || this.design.floors < 2) return;
    const { width, depth, floorHeight } = this.design.dimensions;
    const center = Math.floor(width / 2);
    const half = this.workspace.elements.europeanVilla?.enabled ? 4 : 3;
    const y = floorHeight + 1;
    this.workspace.fill(point(center - half, y, depth), point(center + half, y, depth + 2), this.palette.floor, 'balcony');
    this.workspace.fill(point(center - half, y + 1, depth + 2), point(center + half, y + 1, depth + 2), 'minecraft:dark_oak_fence', 'balcony');
    this.workspace.fill(point(center - 1, y + 1, depth - 1), point(center + 1, y + 3, depth - 1), 'minecraft:air', 'balcony');
    this.workspace.setblock(point(center - 1, y + 1, depth - 1), doorState(this.palette.doorBase, 'south', 'lower', 'left'), 'balcony');
    this.workspace.setblock(point(center - 1, y + 2, depth - 1), doorState(this.palette.doorBase, 'south', 'upper', 'left'), 'balcony');
    this.workspace.setblock(point(center, y + 1, depth - 1), doorState(this.palette.doorBase, 'south', 'lower', 'right'), 'balcony');
    this.workspace.setblock(point(center, y + 2, depth - 1), doorState(this.palette.doorBase, 'south', 'upper', 'right'), 'balcony');
  }

  addChimney() {
    if (!this.workspace.elements.chimney?.enabled) return;
    const { width, depth, wallHeight, roofHeight } = this.design.dimensions;
    const x = Math.max(2, width - 6);
    const z = Math.max(3, Math.floor(depth * 0.22));
    this.workspace.fill(point(x, wallHeight + 1, z), point(x + 1, wallHeight + roofHeight + 3, z + 1), this.palette.chimney, 'chimney');
    this.workspace.fill(point(x - 1, wallHeight + roofHeight + 3, z - 1), point(x + 2, wallHeight + roofHeight + 3, z + 2), this.palette.chimney, 'chimney');
    this.workspace.setblock(point(x, wallHeight + roofHeight + 4, z), 'minecraft:campfire[lit=true]', 'chimney');
  }

  addDormers() {
    const count = Number(this.architecture.roofRules?.dormers || 0);
    if (count <= 0) return;
    const { width, depth, wallHeight } = this.design.dimensions;
    const center = Math.floor(width / 2);
    const offsets = count >= 2 ? [-5, 5] : [0];
    for (const offset of offsets) {
      const x = center + offset;
      const z = depth - 2;
      const y = wallHeight + 3;
      this.workspace.fill(point(x - 1, y, z), point(x + 1, y + 2, z), this.palette.wall, 'roof_detail');
      this.workspace.setblock(point(x, y + 1, z), this.palette.glass, 'windows');
      this.workspace.fill(point(x - 2, y + 3, z - 1), point(x + 2, y + 3, z + 1), this.palette.roof, 'roof_detail');
      this.workspace.setblock(point(x, y + 4, z), this.palette.roofAccent || this.palette.trim, 'roof_detail');
    }
  }

  addCourtyardMarker() {
    if (this.architecture.footprint !== 'courtyard') return;
    const { width, depth } = this.design.dimensions;
    const center = Math.floor(width / 2);
    this.workspace.fill(point(center - 4, 1, depth), point(center + 4, 1, depth + 2), this.palette.floor, 'courtyard');
    this.workspace.fill(point(center - 4, 2, depth + 2), point(center + 4, 4, depth + 2), this.palette.trim, 'courtyard');
    this.courtyard = { type: 'front-gate', bounds: { minX: center - 4, maxX: center + 4, minZ: depth, maxZ: depth + 2 } };
  }

  partitionBsp(rect, nodes, depth, interiorDoors) {
    if (nodes.length <= 1 || rect.maxX - rect.minX < 7 || rect.maxZ - rect.minZ < 7) {
      const node = nodes[0] || { id: 'room', type: 'room', label: '房间' };
      return [roomFromRect(rect, node)];
    }

    const axis = chooseAxis(rect, depth);
    const [leftNodes, rightNodes] = splitNodesByWeight(nodes);
    const ratio = weightSum(leftNodes) / Math.max(0.1, weightSum(nodes));
    const rooms = [];
    if (axis === 'x') {
      const splitX = clamp(Math.round(rect.minX + (rect.maxX - rect.minX) * ratio), rect.minX + 4, rect.maxX - 4);
      this.workspace.fill(point(splitX, rect.minY, rect.minZ), point(splitX, rect.maxY - 1, rect.maxZ), this.palette.interiorWall, 'interior');
      const doorZ = Math.floor((rect.minZ + rect.maxZ) / 2);
      this.workspace.fill(point(splitX, rect.minY, doorZ - 1), point(splitX, rect.minY + 1, doorZ + 1), 'minecraft:air', 'interior');
      interiorDoors.push({ level: rect.level, axis, at: { x: splitX, z: doorZ }, connects: [leftNodes[0]?.id, rightNodes[0]?.id].filter(Boolean) });
      rooms.push(...this.partitionBsp({ ...rect, maxX: splitX - 1 }, leftNodes, depth + 1, interiorDoors));
      rooms.push(...this.partitionBsp({ ...rect, minX: splitX + 1 }, rightNodes, depth + 1, interiorDoors));
      return rooms;
    }

    const splitZ = clamp(Math.round(rect.minZ + (rect.maxZ - rect.minZ) * ratio), rect.minZ + 4, rect.maxZ - 4);
    this.workspace.fill(point(rect.minX, rect.minY, splitZ), point(rect.maxX, rect.maxY - 1, splitZ), this.palette.interiorWall, 'interior');
    const doorX = Math.floor((rect.minX + rect.maxX) / 2);
    this.workspace.fill(point(doorX - 1, rect.minY, splitZ), point(doorX + 1, rect.minY + 1, splitZ), 'minecraft:air', 'interior');
    interiorDoors.push({ level: rect.level, axis, at: { x: doorX, z: splitZ }, connects: [leftNodes[0]?.id, rightNodes[0]?.id].filter(Boolean) });
    rooms.push(...this.partitionBsp({ ...rect, maxZ: splitZ - 1 }, leftNodes, depth + 1, interiorDoors));
    rooms.push(...this.partitionBsp({ ...rect, minZ: splitZ + 1 }, rightNodes, depth + 1, interiorDoors));
    return rooms;
  }

  addBspStairs(floorOpenings) {
    const { floorHeight } = this.design.dimensions;
    const inner = this.workspace.innerBounds();
    const startX = inner.minX + 2;
    const startZ = inner.maxZ - 2;
    const stairs = [];
    const stairBlock = stairFacing(this.palette.stairs, 'north');
    for (let level = 0; level < this.design.floors - 1; level += 1) {
      const upperFloorY = (level + 1) * floorHeight + 1;
      const opening = {
        level: level + 1,
        minX: startX - 1,
        maxX: startX + 3,
        y: upperFloorY,
        minZ: startZ - floorHeight - 1,
        maxZ: startZ
      };
      floorOpenings.push(opening);
      this.workspace.fill(point(opening.minX, opening.y, opening.minZ), point(opening.maxX, opening.y, opening.maxZ), 'minecraft:air', 'stairs');
      for (let step = 0; step < floorHeight; step += 1) {
        const y = level * floorHeight + 2 + step;
        const z = startZ - step;
        for (const dx of [0, 1]) this.workspace.setblock(point(startX + dx, y, z), stairBlock, 'stairs');
        this.workspace.setblock(point(startX - 1, y, z), 'minecraft:dark_oak_fence', 'stairs');
        stairs.push({ level, step, at: { x: startX, y, z } });
      }
    }
    return stairs;
  }

  interiorSpaces() {
    const { floorHeight } = this.design.dimensions;
    const spaces = [];
    for (const box of this.volumeBoxes.filter((item) => item.module !== 'porch')) {
      for (let level = 0; level < box.floors; level += 1) {
        spaces.push({
          level,
          minX: box.minX + 1,
          maxX: box.maxX - 1,
          minY: level * floorHeight + 2,
          maxY: Math.min((level + 1) * floorHeight, box.maxY),
          minZ: box.minZ + 1,
          maxZ: box.maxZ - 1,
          source: box.module === 'wing' ? 'super-wing' : undefined,
          side: box.side
        });
      }
    }
    return spaces;
  }
}

function moduleForVolume(volume) {
  const text = `${volume.id} ${volume.role} ${volume.placement?.relation || ''}`.toLowerCase();
  if (/wing|侧翼/.test(text)) return 'wing';
  if (/porch|门廊|gate|门楼/.test(text)) return 'porch';
  return 'walls';
}

function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

function parseKey(key) {
  return key.split(',').map(Number);
}

function isSurfaceCell(grid, x, y, z) {
  return DIRECTIONS.some(([dx, dy, dz]) => !grid.has(keyFor(x + dx, y + dy, z + dz)));
}

function pickBounds(box) {
  return {
    minX: box.minX,
    maxX: box.maxX,
    minZ: box.minZ,
    maxZ: box.maxZ
  };
}

function windowPositions(min, max, width, spacing) {
  const positions = [];
  const start = min + 3;
  const end = max - width - 2;
  for (let value = start; value <= end; value += spacing) positions.push(value);
  if (!positions.length && max - min + 1 >= width + 2) positions.push(Math.floor((min + max - width) / 2));
  return positions;
}

function chooseAxis(rect, depth) {
  const width = rect.maxX - rect.minX + 1;
  const depthSize = rect.maxZ - rect.minZ + 1;
  if (Math.abs(width - depthSize) < 4) return depth % 2 === 0 ? 'x' : 'z';
  return width >= depthSize ? 'x' : 'z';
}

function splitNodesByWeight(nodes) {
  const total = weightSum(nodes);
  let leftWeight = 0;
  for (let index = 1; index < nodes.length; index += 1) {
    leftWeight += Number(nodes[index - 1].weight || 1);
    if (leftWeight >= total / 2) return [nodes.slice(0, index), nodes.slice(index)];
  }
  return [nodes.slice(0, 1), nodes.slice(1)];
}

function weightSum(nodes) {
  return nodes.reduce((sum, node) => sum + Number(node.weight || 1), 0);
}

function roomFromRect(rect, node) {
  return {
    level: rect.level,
    tag: node.type || node.id,
    id: node.id,
    label: node.label,
    minX: rect.minX,
    maxX: rect.maxX,
    minY: rect.minY,
    maxY: rect.maxY,
    minZ: rect.minZ,
    maxZ: rect.maxZ
  };
}

function stairFacing(block, facing) {
  const raw = String(block || 'minecraft:spruce_stairs[facing=south,half=bottom]');
  if (raw.includes('facing=')) return raw.replace(/facing=[a-z]+/, `facing=${facing}`);
  const [id, state] = raw.split('[');
  return `${id}[facing=${facing}${state ? `,${state}` : ',half=bottom]'}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}
