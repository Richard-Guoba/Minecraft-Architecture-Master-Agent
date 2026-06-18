import { exteriorDetailKitsForFamily } from '../agents/exteriorDetailKits.js';

const DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];
const HORIZONTAL_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
const FLOOR_HEADROOM_SHELL_MODULES = new Set(['walls', 'wing', 'sunroom', 'garage', 'gallery', 'tower', 'courtyard']);

export class CSGBuilder {
  constructor(buildSpec, materials) {
    this.spec = buildSpec;
    this.materials = materials;
  }

  generateShell(architectureJson, planInput = {}) {
    this.architecture = architectureJson || {};
    const plans = normalizePlanBundle(planInput);
    this.structure = plans.structure || {};
    this.facadePlan = plans.facade || {};
    this.roofPlan = plans.roof || {};
    this.sitePlan = plans.site || {};
    const volumeBoxes = this.resolveVolumes(architectureJson.volumes || []);
    const solid = this.buildSolid(volumeBoxes);
    const grid = new Map();
    const shellThickness = this.shellThickness(architectureJson);

    for (const pointKey of solid) {
      const point = parseKey(pointKey);
      if (!isShellCell(solid, point, shellThickness)) continue;
      const meta = this.metaForPoint(point, volumeBoxes);
      grid.set(pointKey, cell(this.shellBlockForMeta(meta), meta.module || 'walls'));
    }

    this.clearInteriorFloorHeadroom(grid, volumeBoxes, solid);
    this.addFloorsAndFoundations(grid, volumeBoxes);
    this.addStructuralDetails(grid, volumeBoxes, architectureJson.structural_rules || {}, this.structure);
    this.addRoofs(grid, volumeBoxes, architectureJson.roof_rules || {}, this.roofPlan);
    this.addWindows(grid, volumeBoxes, architectureJson.facade_rules || {}, this.facadePlan);
    this.addFacadeDetails(grid, volumeBoxes, architectureJson.facade_rules || {}, this.facadePlan);
    this.addRoofPlanDetails(grid, volumeBoxes, this.roofPlan);
    this.addSite(grid, architectureJson.site_rules || {});
    this.addSiteLandscape(grid, this.sitePlan);

    const structureSummary = summarizeStructurePlan(this.structure);
    const facadeSummary = summarizeFacadePlan(this.facadePlan);
    const roofSummary = summarizeRoofPlan(this.roofPlan);
    const siteSummary = summarizeSitePlan(this.sitePlan);

    return {
      grid,
      solid,
      volumeBoxes,
      bounds: computeBounds(grid),
      interiorSpaces: this.interiorSpaces(volumeBoxes),
      csg: {
        volumeCount: volumeBoxes.length,
        solidCellCount: solid.size,
        surfaceCellCount: [...solid].filter((keyValue) => isShellCell(solid, parseKey(keyValue), shellThickness)).length,
        shellThickness,
        roofStyle: String(architectureJson.roof_rules?.style || this.spec.roof_style || 'gabled'),
        structuralSystem: architectureJson.structural_rules?.system || this.spec.structural?.system || 'standard-shell',
        structure: structureSummary,
        facade: facadeSummary,
        roof: roofSummary,
        site: siteSummary,
        roofPlan: roofSummary,
        sitePlan: siteSummary,
        philosophy: architectureJson.philosophy || '先造壳，后填瓤。'
      }
    };
  }

  shellThickness(architectureJson = this.architecture || {}) {
    return clampInt(
      Number(this.spec.shell_thickness || architectureJson.envelope_rules?.shell_thickness || architectureJson.envelope_rules?.shellThickness || 1),
      1,
      3
    );
  }

  resolveVolumes(volumes) {
    const { width, depth, wall_height: wallHeight, floors } = this.spec;
    const boxes = [
      {
        id: 'main',
        role: '主体外壳',
        shape: 'box',
        module: 'walls',
        min_x: 0,
        max_x: width - 1,
        min_y: 1,
        max_y: wallHeight,
        min_z: 0,
        max_z: depth - 1,
        floors,
        side: 'center',
        boolean_mode: 'union',
        tags: ['primary-mass'],
        purpose: 'main-building-envelope'
      }
    ];

    for (const volume of volumes) {
      if (String(volume.id) === 'main') continue;
      boxes.push(this.resolveAttachedVolume(volume, width, depth, wallHeight));
    }
    return boxes;
  }

  resolveAttachedVolume(volume, width, depth, wallHeight) {
    const scale = normalizeScale(volume.scale);
    const module = moduleForVolume(volume);
    const boxWidth = clampInt(Math.round(width * scale[0]), 4, Math.max(4, Math.floor(width / 2)));
    const boxDepth = clampInt(Math.round(depth * scale[2]), 4, Math.max(4, depth));
    const maxHeight = module === 'tower' ? wallHeight + Math.max(3, this.spec.roof_height || 4) : module === 'porch' ? Math.max(4, Math.ceil(wallHeight * 0.65)) : wallHeight + 4;
    const boxHeight = clampInt(Math.round(wallHeight * scale[1]), Math.max(4, this.spec.floor_height), Math.max(4, maxHeight));
    const relation = String(volume.placement?.relation || volume.id || '').toLowerCase();
    const hasWest = relation.includes('west') || relation.includes('西');
    const hasEast = relation.includes('east') || relation.includes('东');
    const hasNorth = relation.includes('north') || relation.includes('rear') || relation.includes('北');
    const hasSouth = relation.includes('front') || relation.includes('south') || relation.includes('南');
    let minX = Math.floor(width / 2) - Math.floor(boxWidth / 2);
    let minZ = depth;
    let side = 'front';

    const alignedZ = () => {
      if (hasNorth) return 0;
      if (hasSouth) return Math.max(0, depth - boxDepth);
      return clampInt(Math.round(depth * 0.2), 1, Math.max(1, depth - boxDepth - 1));
    };
    const alignedX = () => {
      if (hasWest) return 0;
      if (hasEast) return Math.max(0, width - boxWidth);
      return Math.floor(width / 2) - Math.floor(boxWidth / 2);
    };

    if (hasWest) {
      minX = module === 'tower' ? -Math.ceil(boxWidth / 2) : -boxWidth;
      side = 'west';
    } else if (hasEast) {
      minX = module === 'tower' ? width - Math.floor(boxWidth / 2) : width;
      side = 'east';
    }

    if ((hasEast || hasWest) && module !== 'tower') {
      minZ = alignedZ();
      side = hasEast && hasNorth ? 'north-east'
        : hasWest && hasNorth ? 'north-west'
          : hasEast && hasSouth ? 'south-east'
            : hasWest && hasSouth ? 'south-west'
              : side;
    } else if (hasNorth) {
      minZ = module === 'tower' ? -Math.ceil(boxDepth / 2) : -boxDepth;
      side = hasEast ? 'north-east' : hasWest ? 'north-west' : 'rear';
    } else if (hasSouth) {
      minZ = depth;
      side = hasEast ? 'south-east' : hasWest ? 'south-west' : 'front';
    } else if (hasEast || hasWest) {
      minZ = clampInt(Math.round(depth * 0.2), 1, Math.max(1, depth - boxDepth - 1));
    } else {
      minX = alignedX();
    }

    return {
      id: String(volume.id || 'volume'),
      role: String(volume.role || volume.id || '体块'),
      shape: String(volume.shape || 'box'),
      module,
      min_x: minX,
      max_x: minX + boxWidth - 1,
      min_y: 1,
      max_y: boxHeight,
      min_z: minZ,
      max_z: minZ + boxDepth - 1,
      floors: Math.max(1, Math.min(this.spec.floors, Math.round(boxHeight / Math.max(1, this.spec.floor_height)))),
      side,
      boolean_mode: String(volume.boolean_mode || 'union'),
      tags: Array.isArray(volume.tags) ? volume.tags.map(String) : [],
      purpose: volume.purpose,
      facade_role: volume.facade_role,
      roof_policy: volume.roof_policy
    };
  }

  buildSolid(boxes) {
    const solid = new Set();
    for (const box of boxes) {
      const keys = cellsForVolume(box);
      if (box.boolean_mode === 'subtract') {
        for (const keyValue of keys) solid.delete(keyValue);
      } else {
        for (const keyValue of keys) solid.add(keyValue);
      }
    }
    return solid;
  }

  metaForPoint(point, boxes) {
    for (const box of [...boxes].reverse()) {
      if (pointInBox(point, box)) return box;
    }
    return { module: 'walls' };
  }

  shellBlockForMeta(meta) {
    const tags = Array.isArray(meta.tags) ? meta.tags.join(' ') : '';
    const text = `${meta.module || ''} ${meta.facade_role || ''} ${tags}`.toLowerCase();
    if (/sunroom|greenhouse|transparent|glass/.test(text)) return this.materials.glass || 'minecraft:glass';
    if (/gallery|porch/.test(text)) return this.materials.trim || this.materials.wall || 'minecraft:smooth_sandstone';
    if (/garage/.test(text)) return this.materials.foundation || this.materials.wall || 'minecraft:stone_bricks';
    return this.materials.wall || 'minecraft:smooth_sandstone';
  }

  addFloorsAndFoundations(grid, boxes) {
    const thickness = this.shellThickness();
    for (const box of boxes) {
      const module = box.module === 'porch' ? 'porch' : 'foundation';
      fillBox(grid, box.min_x, 0, box.min_z, box.max_x, 0, box.max_z, this.materials.foundation || 'minecraft:stone_bricks', module);
      if (box.module === 'porch') continue;
      for (let level = 0; level < box.floors; level += 1) {
        const y = level * this.spec.floor_height;
        if (y > box.max_y) continue;
        fillBox(grid, box.min_x + thickness, y, box.min_z + thickness, box.max_x - thickness, y, box.max_z - thickness, this.materials.floor || 'minecraft:spruce_planks', 'floors');
      }
    }
  }

  clearInteriorFloorHeadroom(grid, boxes, solid) {
    const thickness = this.shellThickness();
    const groundSpaces = this.interiorSpaces(boxes).filter((space) => Number(space.floor || 0) === 0);
    for (const space of groundSpaces) {
      for (let x = space.min_x; x <= space.max_x; x += 1) {
        for (let z = space.min_z; z <= space.max_z; z += 1) {
          const y = space.min_y;
          if (!hasHorizontalInteriorBuffer(solid, x, y, z, thickness)) continue;
          const keyValue = keyFor(x, y, z);
          const existing = grid.get(keyValue);
          if (existing && FLOOR_HEADROOM_SHELL_MODULES.has(existing.module)) grid.delete(keyValue);
        }
      }
    }
  }

  addRoofs(grid, boxes, roofRules, roofPlan = {}) {
    const roofStyle = String(roofRules.style || this.spec.roof_style || 'gabled');
    const overhang = Number(roofRules.overhang ?? this.spec.roof_overhang ?? 1);
    for (const box of boxes) {
      const boxRoofStyle = box.roof_policy || roofStyle;
      if (box.module === 'porch') {
        this.addFlatRoof(grid, box, Math.max(0, overhang), 'porch');
      } else if (box.module === 'tower' || box.shape === 'cylinder') {
        this.addTowerRoof(grid, box, Math.max(2, this.spec.roof_height || 4), overhang);
      } else if (boxRoofStyle === 'flat') {
        this.addFlatRoof(grid, box, Math.max(0, overhang), 'roof');
      } else if (boxRoofStyle === 'hipped') {
        this.addHippedRoof(grid, box, this.spec.roof_height, overhang);
      } else if (boxRoofStyle === 'pagoda') {
        this.addPagodaRoof(grid, box, this.spec.roof_height, Math.max(1, overhang));
      } else if (boxRoofStyle === 'domed') {
        this.addDomedRoof(grid, box, this.spec.roof_height, Math.max(0, overhang));
      } else {
        this.addGabledRoof(grid, box, this.spec.roof_height, overhang);
      }
      if (box.module !== 'porch' && Number(roofRules.dormers || 0) > 0) this.addDormers(grid, box, Number(roofRules.dormers));
      if (box.module !== 'porch' && (roofRules.skylights || roofPlan.engine_hints?.render_skylight_grid || box.module === 'sunroom')) this.addSkylights(grid, box);
    }
  }

  addFlatRoof(grid, box, overhang, module) {
    fillBox(
      grid,
      box.min_x - overhang,
      box.max_y + 1,
      box.min_z - overhang,
      box.max_x + overhang,
      box.max_y + 1,
      box.max_z + overhang,
      this.materials.roof || 'minecraft:dark_oak_planks',
      module
    );
    if (module === 'roof' && (this.architecture?.roof_rules?.roof_terrace || this.spec.roof_style === 'flat')) {
      this.addParapet(grid, box, overhang);
    }
  }

  addGabledRoof(grid, box, roofHeight, overhang) {
    for (let layer = 0; layer < Math.max(1, roofHeight); layer += 1) {
      const x1 = box.min_x - overhang + layer;
      const x2 = box.max_x + overhang - layer;
      if (x1 > x2) break;
      fillBox(grid, x1, box.max_y + 1 + layer, box.min_z - overhang, x2, box.max_y + 1 + layer, box.max_z + overhang, this.materials.roof || 'minecraft:dark_oak_planks', 'roof');
    }
    const ridgeX = Math.floor((box.min_x + box.max_x) / 2);
    const ridgeY = box.max_y + Math.max(1, roofHeight) + 1;
    fillBox(grid, ridgeX, ridgeY, box.min_z - overhang, ridgeX, ridgeY, box.max_z + overhang, this.materials.trim || 'minecraft:smooth_quartz', 'roof_detail');
  }

  addStructuralDetails(grid, boxes, structuralRules, structurePlan = {}) {
    const mainBox = boxes.find((box) => box.id === 'main') || boxes[0];
    const supports = String(structuralRules.primary_supports || this.spec.structural?.supports || '');
    const system = String(structuralRules.system || this.spec.structural?.system || '');
    const supportElements = normalizePlanItems(structurePlan.support_elements);
    const bracingElements = normalizePlanItems(structurePlan.bracing_elements);
    const reinforcementElements = normalizePlanItems(structurePlan.reinforcement_elements);
    const roofFrameElements = normalizePlanItems(structurePlan.roof_frame?.elements);
    const hints = structurePlan.engine_hints || {};
    const wantsColumns = /column|pillar|pilaster|regular-columns|柱/i.test(`${supports} ${system}`) ||
      hints.render_column_grid ||
      this.spec.facade?.porch ||
      this.architecture?.facade_rules?.columns;
    const wantsButtresses = /buttress|gothic|vault|扶壁/i.test(`${supports} ${system}`) ||
      hints.render_buttresses ||
      this.architecture?.facade_rules?.pointed_arches;
    const wantsStilts = /stilt|tree-trunk|高脚|吊脚/i.test(`${supports} ${system}`) || hints.render_stilts;
    const columnGrid = supportElements.find((item) => item.kind === 'column-grid');

    for (const box of boxes) {
      if (box.module === 'porch') continue;
      if (wantsColumns) this.addCornerPilasters(grid, box);
      if (wantsButtresses) this.addButtresses(grid, box);
      if (wantsStilts && box.id === mainBox.id) this.addStilts(grid, box);
      if (columnGrid && box.id === 'main') this.addColumnGrid(grid, box, Number(columnGrid.spacing || 5));
      if (reinforcementElements.some((item) => item.kind === 'ring-beams')) this.addRingBeams(grid, box);
      if (roofFrameElements.length) this.addRoofFrame(grid, box, roofFrameElements[0]);
    }

    if (hints.render_tree_trunk) this.addTreeTrunkCore(grid, boxes);
    if (hints.render_cantilever_braces || bracingElements.some((item) => item.kind === 'knee-brace')) this.addCantileverBraces(grid, boxes);
    if (hints.render_retaining_ribs || reinforcementElements.some((item) => item.kind === 'retaining-ribs')) this.addRetainingRibs(grid, mainBox);
    if (hints.render_glass_ribs || supportElements.some((item) => item.kind === 'glass-ribs')) this.addGlassRibs(grid, boxes);
    if (hints.render_service_braces || bracingElements.some((item) => item.kind === 'x-brace')) this.addServiceCoreBraces(grid, boxes);
    if (bracingElements.some((item) => item.kind === 'anchor-ties')) this.addFoundationAnchors(grid, boxes);
    if (hints.render_shear_walls || bracingElements.some((item) => item.kind === 'shear-wall')) this.addShearWalls(grid, mainBox);
    if (hints.render_wind_ties || bracingElements.some((item) => item.kind === 'tie-down')) this.addWindTies(grid, boxes);
    if (hints.render_firebreaks || reinforcementElements.some((item) => item.kind === 'firebreak-wall')) this.addFirebreakWall(grid, mainBox);
    if (hints.render_flood_vents || reinforcementElements.some((item) => item.kind === 'flood-vented-plinth')) this.addFloodVents(grid, mainBox);
    if (hints.render_service_platform_frame || roofFrameElements.some((item) => item.kind === 'service-platform-frame')) this.addRoofServicePlatformFrame(grid, mainBox);

    if (this.architecture?.facade_rules?.porch || this.spec.facade?.porch) {
      this.addEntryColumns(grid, mainBox);
    }
  }

  addCornerPilasters(grid, box) {
    const block = this.materials.trim || 'minecraft:smooth_quartz';
    const y1 = 1;
    const y2 = box.max_y;
    const corners = [
      [box.min_x, box.min_z],
      [box.max_x, box.min_z],
      [box.min_x, box.max_z],
      [box.max_x, box.max_z]
    ];
    for (const [x, z] of corners) {
      fillBox(grid, x, y1, z, x, y2, z, block, 'structural_frame');
    }
  }

  addButtresses(grid, box) {
    const block = this.materials.foundation || 'minecraft:stone_bricks';
    const y2 = Math.max(3, box.max_y - 1);
    const xs = windowPositions(box.min_x, box.max_x, 1, 6);
    for (const x of xs) {
      fillBox(grid, x, 1, box.min_z - 1, x, y2, box.min_z - 1, block, 'buttress');
      fillBox(grid, x, 1, box.max_z + 1, x, y2, box.max_z + 1, block, 'buttress');
    }
  }

  addStilts(grid, box) {
    const block = this.materials.foundation || 'minecraft:jungle_log';
    for (let x = box.min_x + 2; x <= box.max_x - 2; x += 5) {
      for (let z = box.min_z + 2; z <= box.max_z - 2; z += 5) {
        fillBox(grid, x, 0, z, x, 2, z, block, 'structural_frame');
      }
    }
  }

  addColumnGrid(grid, box, spacing = 5) {
    const block = this.materials.trim || this.materials.foundation || 'minecraft:smooth_quartz';
    const step = clampInt(spacing, 3, 8, 5);
    const y1 = 1;
    const y2 = box.max_y;
    for (let x = box.min_x + step; x <= box.max_x - step; x += step) {
      for (let z = box.min_z + step; z <= box.max_z - step; z += step) {
        fillBox(grid, x, y1, z, x, y2, z, block, 'structural_frame');
      }
    }
  }

  addRingBeams(grid, box) {
    const block = this.materials.trim || this.materials.foundation || 'minecraft:smooth_quartz';
    for (let floor = 1; floor <= Math.max(1, box.floors); floor += 1) {
      const y = Math.min(box.max_y, floor * this.spec.floor_height + 1);
      fillBox(grid, box.min_x, y, box.min_z, box.max_x, y, box.min_z, block, 'structural_frame');
      fillBox(grid, box.min_x, y, box.max_z, box.max_x, y, box.max_z, block, 'structural_frame');
      fillBox(grid, box.min_x, y, box.min_z, box.min_x, y, box.max_z, block, 'structural_frame');
      fillBox(grid, box.max_x, y, box.min_z, box.max_x, y, box.max_z, block, 'structural_frame');
    }
  }

  addRoofFrame(grid, box, element = {}) {
    if (box.module === 'porch') return;
    const block = this.materials.trim || this.materials.foundation || 'minecraft:smooth_quartz';
    const y = box.max_y + 1;
    const step = element.kind === 'glass-roof-ribs' ? 3 : 4;
    for (let x = box.min_x + 2; x <= box.max_x - 2; x += step) {
      fillBox(grid, x, y, box.min_z, x, y, box.max_z, block, 'roof_frame');
    }
    for (let z = box.min_z + 2; z <= box.max_z - 2; z += step) {
      fillBox(grid, box.min_x, y, z, box.max_x, y, z, block, 'roof_frame');
    }
  }

  addShearWalls(grid, box) {
    const block = this.materials.secondary_wall || this.materials.foundation || 'minecraft:stone_bricks';
    const y1 = 1;
    const y2 = box.max_y;
    const x1 = Math.floor((box.min_x * 2 + box.max_x) / 3);
    const x2 = Math.floor((box.min_x + box.max_x * 2) / 3);
    fillBox(grid, x1, y1, box.min_z + 1, x1, y2, box.min_z + 4, block, 'shear_wall');
    fillBox(grid, x2, y1, box.max_z - 4, x2, y2, box.max_z - 1, block, 'shear_wall');
  }

  addWindTies(grid, boxes) {
    const block = this.materials.railing || this.materials.trim || 'minecraft:iron_bars';
    for (const box of boxes.filter((item) => item.module !== 'porch')) {
      fillBox(grid, box.min_x, 1, box.min_z, box.min_x, box.max_y + 1, box.min_z, block, 'wind_tie');
      fillBox(grid, box.max_x, 1, box.max_z, box.max_x, box.max_y + 1, box.max_z, block, 'wind_tie');
    }
  }

  addFirebreakWall(grid, box) {
    const block = this.materials.secondary_wall || 'minecraft:bricks';
    const x = Math.floor((box.min_x + box.max_x) / 2);
    fillBox(grid, x, 1, box.min_z + 1, x, Math.min(box.max_y, this.spec.floor_height), box.min_z + 5, block, 'firebreak');
  }

  addFloodVents(grid, box) {
    const block = this.materials.railing || 'minecraft:iron_bars';
    for (let x = box.min_x + 3; x <= box.max_x - 3; x += 5) {
      fillBox(grid, x, 1, box.max_z + 1, x + 1, 1, box.max_z + 1, block, 'flood_vent');
    }
  }

  addRoofServicePlatformFrame(grid, box) {
    const block = this.materials.trim || this.materials.railing || 'minecraft:iron_bars';
    const y = box.max_y + 3;
    const cx = Math.floor((box.min_x + box.max_x) / 2);
    const cz = Math.floor((box.min_z + box.max_z) / 2);
    fillBox(grid, cx - 4, y, cz - 2, cx + 4, y, cz - 2, block, 'roof_service_frame');
    fillBox(grid, cx - 4, y, cz + 2, cx + 4, y, cz + 2, block, 'roof_service_frame');
    fillBox(grid, cx - 4, y, cz - 2, cx - 4, y, cz + 2, block, 'roof_service_frame');
    fillBox(grid, cx + 4, y, cz - 2, cx + 4, y, cz + 2, block, 'roof_service_frame');
  }

  addTreeTrunkCore(grid, boxes) {
    const trunk = boxes.find((box) => box.id === 'trunk-core') || boxes.find((box) => box.tags?.includes('support-trunk'));
    const main = boxes.find((box) => box.id === 'main') || boxes[0];
    if (!main) return;
    const block = this.materials.foundation || 'minecraft:jungle_log';
    const cx = trunk ? Math.floor((trunk.min_x + trunk.max_x) / 2) : Math.floor((main.min_x + main.max_x) / 2);
    const cz = trunk ? Math.floor((trunk.min_z + trunk.max_z) / 2) : Math.floor((main.min_z + main.max_z) / 2);
    const y2 = Math.max(main.max_y, trunk?.max_y || main.max_y);
    fillBox(grid, cx - 1, 0, cz - 1, cx + 1, y2, cz + 1, block, 'structural_frame');
  }

  addCantileverBraces(grid, boxes) {
    const block = this.materials.foundation || this.materials.trim || 'minecraft:stone_bricks';
    const targets = boxes.filter((box) => box.module === 'gallery' || /deck|platform|cantilever|view/.test(`${box.id} ${box.facade_role} ${(box.tags || []).join(' ')}`));
    for (const box of targets) {
      const yTop = Math.max(2, Math.min(box.max_y, Math.floor(this.spec.floor_height * 0.7)));
      const xs = [box.min_x + 1, box.max_x - 1].filter((value, index, list) => index === 0 || value !== list[0]);
      for (const x of xs) {
        if (box.side.includes('front') || box.min_z >= this.spec.depth) {
          drawSteppedBrace(grid, { x, y: 1, z: box.max_z }, { x, y: yTop, z: Math.max(box.min_z, this.spec.depth - 1) }, block, 'bracing');
        } else if (box.side.includes('rear') || box.max_z < 0) {
          drawSteppedBrace(grid, { x, y: 1, z: box.min_z }, { x, y: yTop, z: Math.min(box.max_z, 0) }, block, 'bracing');
        } else {
          const z = Math.floor((box.min_z + box.max_z) / 2);
          const outerX = box.side.includes('west') ? box.min_x : box.max_x;
          const innerX = box.side.includes('west') ? Math.min(box.max_x, 0) : Math.max(box.min_x, this.spec.width - 1);
          drawSteppedBrace(grid, { x: outerX, y: 1, z }, { x: innerX, y: yTop, z }, block, 'bracing');
        }
      }
    }
  }

  addRetainingRibs(grid, box) {
    if (!box) return;
    const block = this.materials.foundation || 'minecraft:deepslate_bricks';
    const y2 = Math.max(3, box.max_y - 1);
    const spacing = 4;
    for (let x = box.min_x + 1; x <= box.max_x - 1; x += spacing) {
      fillBox(grid, x, 1, box.min_z - 1, x, y2, box.min_z - 1, block, 'retaining_wall');
      fillBox(grid, x, 1, box.max_z + 1, x, y2, box.max_z + 1, block, 'retaining_wall');
    }
    for (let z = box.min_z + 1; z <= box.max_z - 1; z += spacing) {
      fillBox(grid, box.min_x - 1, 1, z, box.min_x - 1, y2, z, block, 'retaining_wall');
      fillBox(grid, box.max_x + 1, 1, z, box.max_x + 1, y2, z, block, 'retaining_wall');
    }
  }

  addGlassRibs(grid, boxes) {
    const block = this.materials.trim || 'minecraft:oxidized_copper';
    for (const box of boxes.filter((item) => item.module === 'sunroom')) {
      for (let x = box.min_x + 1; x <= box.max_x - 1; x += 3) {
        fillBox(grid, x, 1, box.min_z, x, box.max_y, box.min_z, block, 'structural_frame');
        fillBox(grid, x, 1, box.max_z, x, box.max_y, box.max_z, block, 'structural_frame');
      }
      for (let z = box.min_z + 1; z <= box.max_z - 1; z += 3) {
        fillBox(grid, box.min_x, 1, z, box.min_x, box.max_y, z, block, 'structural_frame');
        fillBox(grid, box.max_x, 1, z, box.max_x, box.max_y, z, block, 'structural_frame');
      }
    }
  }

  addServiceCoreBraces(grid, boxes) {
    const block = this.materials.trim || 'minecraft:cyan_concrete';
    const targets = boxes.filter((box) => box.id === 'service-core' || /service-core|neon/.test(`${box.id} ${(box.tags || []).join(' ')}`));
    for (const box of targets) {
      drawSteppedBrace(grid, { x: box.min_x, y: 2, z: box.min_z }, { x: box.max_x, y: Math.max(3, box.max_y - 1), z: box.max_z }, block, 'bracing');
      drawSteppedBrace(grid, { x: box.max_x, y: 2, z: box.min_z }, { x: box.min_x, y: Math.max(3, box.max_y - 1), z: box.max_z }, block, 'bracing');
    }
  }

  addFoundationAnchors(grid, boxes) {
    const block = this.materials.foundation || 'minecraft:stone_bricks';
    for (const box of boxes.filter((item) => item.module === 'gallery' || item.module === 'tower')) {
      const z = box.side.includes('front') ? Math.max(this.spec.depth - 1, box.min_z) : box.side.includes('rear') ? Math.min(0, box.max_z) : Math.floor((box.min_z + box.max_z) / 2);
      fillBox(grid, box.min_x, 0, z, box.max_x, 0, z, block, 'foundation_anchor');
    }
  }

  addEntryColumns(grid, mainBox) {
    const side = String(this.spec.door_side || this.architecture?.facade_rules?.front_side || 'south');
    const block = this.materials.trim || 'minecraft:smooth_quartz';
    const y1 = 1;
    const y2 = Math.min(mainBox.max_y, Math.max(3, this.spec.floor_height));
    const centerX = Math.floor((mainBox.min_x + mainBox.max_x) / 2);
    const centerZ = Math.floor((mainBox.min_z + mainBox.max_z) / 2);
    if (['south', 'north'].includes(side)) {
      const z = side === 'south' ? mainBox.max_z + 2 : mainBox.min_z - 2;
      for (const x of [centerX - 3, centerX + 3]) fillBox(grid, x, y1, z, x, y2, z, block, 'columns');
      fillBox(grid, centerX - 4, y2 + 1, z, centerX + 4, y2 + 1, z, block, 'porch');
    } else {
      const x = side === 'east' ? mainBox.max_x + 2 : mainBox.min_x - 2;
      for (const z of [centerZ - 3, centerZ + 3]) fillBox(grid, x, y1, z, x, y2, z, block, 'columns');
      fillBox(grid, x, y2 + 1, centerZ - 4, x, y2 + 1, centerZ + 4, block, 'porch');
    }
  }

  addHippedRoof(grid, box, roofHeight, overhang) {
    for (let layer = 0; layer < Math.max(1, roofHeight); layer += 1) {
      const inset = Math.floor(layer / 2);
      const x1 = box.min_x - overhang + inset;
      const x2 = box.max_x + overhang - inset;
      const z1 = box.min_z - overhang + inset;
      const z2 = box.max_z + overhang - inset;
      if (x1 > x2 || z1 > z2) break;
      fillBox(grid, x1, box.max_y + 1 + layer, z1, x2, box.max_y + 1 + layer, z2, this.materials.roof || 'minecraft:dark_oak_planks', 'roof');
    }
    const cx = Math.floor((box.min_x + box.max_x) / 2);
    const cz = Math.floor((box.min_z + box.max_z) / 2);
    fillBox(grid, cx - 1, box.max_y + roofHeight + 1, cz - 1, cx + 1, box.max_y + roofHeight + 1, cz + 1, this.materials.trim || 'minecraft:smooth_quartz', 'roof_detail');
  }

  addPagodaRoof(grid, box, roofHeight, overhang) {
    const layers = Math.max(2, roofHeight);
    for (let layer = 0; layer < layers; layer += 1) {
      const step = Math.floor(layer / 2);
      const extra = layer % 2 === 0 ? overhang : Math.max(0, overhang - 1);
      const x1 = box.min_x - extra + step;
      const x2 = box.max_x + extra - step;
      const z1 = box.min_z - extra + step;
      const z2 = box.max_z + extra - step;
      if (x1 > x2 || z1 > z2) break;
      fillBox(grid, x1, box.max_y + 1 + layer, z1, x2, box.max_y + 1 + layer, z2, this.materials.roof || 'minecraft:deepslate_tiles', 'roof');
    }
    const y = box.max_y + layers + 1;
    fillBox(grid, box.min_x, y, box.min_z, box.max_x, y, box.min_z, this.materials.trim || 'minecraft:stripped_dark_oak_log', 'roof_detail');
    fillBox(grid, box.min_x, y, box.max_z, box.max_x, y, box.max_z, this.materials.trim || 'minecraft:stripped_dark_oak_log', 'roof_detail');
  }

  addTowerRoof(grid, box, roofHeight, overhang) {
    const centerX = Math.floor((box.min_x + box.max_x) / 2);
    const centerZ = Math.floor((box.min_z + box.max_z) / 2);
    const radius = Math.max(1, Math.floor(Math.min(box.max_x - box.min_x + 1, box.max_z - box.min_z + 1) / 2) + overhang);
    for (let layer = 0; layer < Math.max(2, roofHeight); layer += 1) {
      const r = Math.max(0, radius - layer);
      if (r <= 0) {
        fillBox(grid, centerX, box.max_y + 1 + layer, centerZ, centerX, box.max_y + 1 + layer, centerZ, this.materials.trim || 'minecraft:smooth_quartz', 'roof_detail');
        break;
      }
      fillDisk(grid, centerX, box.max_y + 1 + layer, centerZ, r, this.materials.roof || 'minecraft:dark_oak_planks', 'roof');
    }
  }

  addDomedRoof(grid, box, roofHeight, overhang) {
    const centerX = Math.floor((box.min_x + box.max_x) / 2);
    const centerZ = Math.floor((box.min_z + box.max_z) / 2);
    const baseRadius = Math.max(2, Math.floor(Math.min(box.max_x - box.min_x + 1, box.max_z - box.min_z + 1) / 2) + overhang);
    const layers = Math.max(2, roofHeight);
    for (let layer = 0; layer < layers; layer += 1) {
      const progress = layer / Math.max(1, layers - 1);
      const radius = Math.max(1, Math.round(baseRadius * Math.cos(progress * Math.PI / 2)));
      fillDisk(grid, centerX, box.max_y + 1 + layer, centerZ, radius, this.materials.roof || 'minecraft:smooth_quartz', 'roof');
    }
    fillBox(grid, centerX, box.max_y + layers + 1, centerZ, centerX, box.max_y + layers + 1, centerZ, this.materials.trim || 'minecraft:gold_block', 'roof_detail');
  }

  addDormers(grid, box, count) {
    const dormerCount = clampInt(count, 1, 4);
    const block = this.materials.trim || 'minecraft:smooth_quartz';
    const glass = this.materials.glass || 'minecraft:glass';
    const y = box.max_y + 2;
    const z = this.spec.door_side === 'north' ? box.min_z - 1 : box.max_z + 1;
    const xs = windowPositions(box.min_x + 2, box.max_x - 2, 1, Math.max(4, Math.floor((box.max_x - box.min_x + 1) / dormerCount)));
    for (const x of xs.slice(0, dormerCount)) {
      fillBox(grid, x - 1, y, z, x + 1, y + 1, z, block, 'roof_detail');
      fillBox(grid, x, y, z, x, y + 1, z, glass, 'windows');
      fillBox(grid, x - 1, y + 2, z, x + 1, y + 2, z, this.materials.roof || 'minecraft:dark_oak_planks', 'roof_detail');
    }
  }

  addSkylights(grid, box) {
    const y = box.max_y + 2;
    const centerX = Math.floor((box.min_x + box.max_x) / 2);
    const centerZ = Math.floor((box.min_z + box.max_z) / 2);
    fillBox(grid, centerX - 2, y, centerZ - 1, centerX + 2, y, centerZ + 1, this.materials.glass || 'minecraft:glass', 'skylight');
  }

  addParapet(grid, box, overhang) {
    const y = box.max_y + 2;
    const block = this.materials.trim || 'minecraft:light_gray_concrete';
    fillBox(grid, box.min_x - overhang, y, box.min_z - overhang, box.max_x + overhang, y, box.min_z - overhang, block, 'roof_detail');
    fillBox(grid, box.min_x - overhang, y, box.max_z + overhang, box.max_x + overhang, y, box.max_z + overhang, block, 'roof_detail');
    fillBox(grid, box.min_x - overhang, y, box.min_z - overhang, box.min_x - overhang, y, box.max_z + overhang, block, 'roof_detail');
    fillBox(grid, box.max_x + overhang, y, box.min_z - overhang, box.max_x + overhang, y, box.max_z + overhang, block, 'roof_detail');
  }

  addWindows(grid, boxes, facadeRules, facadePlan = {}) {
    const wide = Boolean(facadeRules.large_glass || this.spec.facade?.large_glass);
    const glazingRatio = String(facadeRules.glazing_ratio || this.spec.facade?.glazing_ratio || 'medium');
    const narrow = glazingRatio === 'low';
    const planned = facadePlan.window_system || {};
    const windowWidth = clampInt(planned.width || (wide ? 4 : narrow ? 1 : 2), 1, 5, wide ? 4 : 2);
    const windowHeight = clampInt(planned.height || (wide ? 3 : 2), 1, 4, wide ? 3 : 2);
    const spacing = clampInt(planned.spacing || (wide ? 5 : narrow ? 8 : 6), 3, 10, wide ? 5 : 6);
    const glass = this.materials.glass || 'minecraft:glass';

    for (const box of boxes) {
      if (box.module === 'porch') continue;
      const xs = windowPositions(box.min_x, box.max_x, windowWidth, spacing);
      const zs = windowPositions(box.min_z, box.max_z, windowWidth, spacing);
      for (let level = 0; level < box.floors; level += 1) {
        const baseY = level * this.spec.floor_height + 2;
        const maxWindowY = Math.min(box.max_y - 1, (level + 1) * this.spec.floor_height);
        const actualWindowHeight = Math.min(windowHeight, maxWindowY - baseY + 1);
        if (actualWindowHeight < 1) continue;
        for (const x of xs) {
          fillBox(grid, x, baseY, box.min_z, x + windowWidth - 1, baseY + actualWindowHeight - 1, box.min_z, glass, 'windows');
          fillBox(grid, x, baseY, box.max_z, x + windowWidth - 1, baseY + actualWindowHeight - 1, box.max_z, glass, 'windows');
        }
        for (const z of zs) {
          fillBox(grid, box.min_x, baseY, z, box.min_x, baseY + actualWindowHeight - 1, z + windowWidth - 1, glass, 'windows');
          fillBox(grid, box.max_x, baseY, z, box.max_x, baseY + actualWindowHeight - 1, z + windowWidth - 1, glass, 'windows');
        }
      }
    }
  }

  addFacadeDetails(grid, boxes, facadeRules, facadePlan = {}) {
    const mainBox = boxes.find((box) => box.id === 'main') || boxes[0];
    if (!mainBox) return;
    const hints = facadePlan.engine_hints || {};
    if (hints.render_wall_relief ?? true) this.addWallReliefPanels(grid, mainBox, facadePlan);
    if (facadeRules.arches || facadeRules.pointed_arches || this.spec.facade?.arches) this.addEntryArch(grid, mainBox, Boolean(facadeRules.pointed_arches), facadePlan);
    if (facadeRules.balcony || this.spec.facade?.balcony) this.addBalcony(grid, mainBox, facadePlan);
    if (facadeRules.bay_windows) this.addBayWindow(grid, mainBox);
    if (hints.render_window_trim ?? true) this.addWindowTrimBands(grid, mainBox, facadePlan);
    if (hints.render_window_surrounds ?? true) this.addWindowSurrounds(grid, mainBox, facadePlan);
    if (hints.render_shutters) this.addShutters(grid, mainBox, facadePlan);
    if (hints.render_neon_trim) this.addNeonTrim(grid, mainBox, facadePlan);
    if (hints.render_balcony_rail) this.addBalconyRail(grid, mainBox, facadePlan);
    if (hints.render_protected_slits) this.addProtectedSlitFrames(grid, mainBox, facadePlan);
    if (hints.render_entry_detail ?? true) this.addEntryDetail(grid, mainBox, facadePlan);
    if (hints.render_awnings) this.addAwnings(grid, mainBox, facadePlan);
    if (hints.render_flower_boxes) this.addFlowerBoxes(grid, mainBox, facadePlan);
    if (hints.render_service_vents) this.addServiceVents(grid, mainBox, facadePlan);
    if (hints.render_address_marker) this.addAddressMarker(grid, mainBox, facadePlan);
    if (hints.render_privacy_fins) this.addPrivacyFins(grid, mainBox, facadePlan);
    if (facadeRules.screen || this.spec.facade?.screens) this.addScreenFacade(grid, mainBox, facadePlan);
  }

  addWallReliefPanels(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('wall_relief', facadePlan, family, this.materials);
    const reliefBlock = blocks[0] || reliefBlockForStyle(family, this.materials);
    const accentBlock = blocks[1] || this.materials.secondary_wall || this.materials.accent || this.materials.trim || 'minecraft:quartz_bricks';
    const pierBlock = blocks[2] || reliefBlock;
    const density = String(facadePlan.relief_density || 'medium');
    const minClearSpan = clampInt(
      facadePlan.exterior_detail_requirements?.min_blank_wall_span_for_relief ||
      facadePlan.composition_strategy?.ornament_budget?.min_blank_wall_span ||
      4,
      3,
      8,
      4
    );
    const spacing = density === 'high' ? 5 : density === 'low' || density === 'organic-low' ? 8 : ['modern', 'industrial', 'futuristic', 'cyberpunk'].includes(family) ? 7 : 6;
    const cornerStep = density === 'high' ? 1 : 2;
    const beltEvery = density === 'organic-low' ? 3 : 2;

    for (let floor = 0; floor < Math.max(1, box.floors); floor += 1) {
      const floorY = floor * this.spec.floor_height;
      const minY = floorY + 1;
      const maxY = Math.min(box.max_y - 1, (floor + 1) * this.spec.floor_height - 1);
      if (minY > maxY) continue;
      const beltY = minY;
      const topY = Math.max(minY, maxY);
      const midY = clampInt(Math.floor((minY + maxY) / 2), minY, maxY, minY);

      for (let y = minY; y <= maxY; y += cornerStep) {
        this.placeClearFacadeCell(grid, box.min_x + 1, y, box.min_z - 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.max_x - 1, y, box.min_z - 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.min_x + 1, y, box.max_z + 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.max_x - 1, y, box.max_z + 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.min_x - 1, y, box.min_z + 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.min_x - 1, y, box.max_z - 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.max_x + 1, y, box.min_z + 1, pierBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.max_x + 1, y, box.max_z - 1, pierBlock, 'facade_relief', 1);
      }

      for (let x = box.min_x + 2; x <= box.max_x - 2; x += beltEvery) {
        this.placeClearFacadeCell(grid, x, beltY, box.max_z + 1, reliefBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, x, beltY, box.min_z - 1, reliefBlock, 'facade_relief', 1);
        if (floor > 0 || density !== 'low') {
          this.placeClearFacadeCell(grid, x, topY, box.max_z + 1, accentBlock, 'facade_relief', 1);
          this.placeClearFacadeCell(grid, x, topY, box.min_z - 1, accentBlock, 'facade_relief', 1);
        }
      }
      for (let z = box.min_z + 2; z <= box.max_z - 2; z += beltEvery) {
        this.placeClearFacadeCell(grid, box.min_x - 1, beltY, z, reliefBlock, 'facade_relief', 1);
        this.placeClearFacadeCell(grid, box.max_x + 1, beltY, z, reliefBlock, 'facade_relief', 1);
        if (floor > 0 || density !== 'low') {
          this.placeClearFacadeCell(grid, box.min_x - 1, topY, z, accentBlock, 'facade_relief', 1);
          this.placeClearFacadeCell(grid, box.max_x + 1, topY, z, accentBlock, 'facade_relief', 1);
        }
      }

      for (let x = box.min_x + minClearSpan; x <= box.max_x - minClearSpan; x += spacing) {
        this.placeClearFacadeCell(grid, x, midY, box.max_z + 1, accentBlock, 'facade_relief', minClearSpan);
        this.placeClearFacadeCell(grid, x, midY, box.min_z - 1, accentBlock, 'facade_relief', minClearSpan);
      }
      for (let z = box.min_z + minClearSpan; z <= box.max_z - minClearSpan; z += spacing) {
        this.placeClearFacadeCell(grid, box.min_x - 1, midY, z, accentBlock, 'facade_relief', minClearSpan);
        this.placeClearFacadeCell(grid, box.max_x + 1, midY, z, accentBlock, 'facade_relief', minClearSpan);
      }
    }
  }

  addWindowSurrounds(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('window_surround', facadePlan, family, this.materials);
    const block = blocks[0] || facadePlan.window_system?.trim || this.materials.accent || this.materials.trim || 'minecraft:smooth_quartz';
    const planned = facadePlan.window_system || {};
    const wide = Boolean(this.architecture?.facade_rules?.large_glass || this.spec.facade?.large_glass);
    const glazingRatio = String(this.architecture?.facade_rules?.glazing_ratio || this.spec.facade?.glazing_ratio || planned.glazing_ratio || 'medium');
    const narrow = glazingRatio === 'low';
    const windowWidth = clampInt(planned.width || (wide ? 4 : narrow ? 1 : 2), 1, 5, wide ? 4 : 2);
    const windowHeight = clampInt(planned.height || (wide ? 3 : 2), 1, 4, wide ? 3 : 2);
    const spacing = clampInt(planned.spacing || (wide ? 5 : narrow ? 8 : 6), 3, 10, wide ? 5 : 6);
    const xs = windowPositions(box.min_x, box.max_x, windowWidth, spacing);
    const zs = windowPositions(box.min_z, box.max_z, windowWidth, spacing);
    const clearGap = Math.max(0, spacing - windowWidth);
    const pattern = String(facadePlan.window_surround_pattern || facadePlan.composition_strategy?.window_surround_policy?.pattern || 'sill-lintel-with-optional-jambs');
    const frameOptions = {
      sideJambs: clearGap >= 4 && !/minimal/.test(pattern),
      grille: narrow || /tracery|protected/.test(pattern),
      shutters: false,
      hardware: false
    };

    for (let level = 0; level < Math.max(1, box.floors); level += 1) {
      const baseY = level * this.spec.floor_height + 2;
      const maxWindowY = Math.min(box.max_y - 1, (level + 1) * this.spec.floor_height - 1);
      const actualWindowHeight = Math.min(windowHeight, maxWindowY - baseY + 1);
      if (actualWindowHeight < 1) continue;
      for (const x of xs) {
        this.addWindowFrameZ(grid, x, x + windowWidth - 1, box.min_z - 1, baseY, actualWindowHeight, blocks, block, frameOptions);
        this.addWindowFrameZ(grid, x, x + windowWidth - 1, box.max_z + 1, baseY, actualWindowHeight, blocks, block, frameOptions);
      }
      for (const z of zs) {
        this.addWindowFrameX(grid, box.min_x - 1, z, z + windowWidth - 1, baseY, actualWindowHeight, blocks, block, frameOptions);
        this.addWindowFrameX(grid, box.max_x + 1, z, z + windowWidth - 1, baseY, actualWindowHeight, blocks, block, frameOptions);
      }
    }
  }

  addWindowFrameZ(grid, x1, x2, z, baseY, height, blocks, fallbackBlock, options = {}) {
    const sill = blockAt(blocks, 0, fallbackBlock);
    const lintel = blockAt(blocks, 1, fallbackBlock);
    const jamb = blockAt(blocks, 2, fallbackBlock);
    const bar = blockAt(blocks, 3, fallbackBlock);
    const shutter = blockAt(blocks, 4, fallbackBlock);
    const hardware = blockAt(blocks, 5, fallbackBlock);
    for (let x = x1; x <= x2; x += 1) {
      this.placeFacadeCell(grid, x, baseY - 1, z, sill, 'facade_detail');
      this.placeFacadeCell(grid, x, baseY + height, z, lintel, 'facade_detail');
    }
    if (options.sideJambs) {
      for (let y = baseY; y <= baseY + height - 1; y += 1) {
        this.placeFacadeCell(grid, x1 - 1, y, z, jamb, 'facade_detail');
        this.placeFacadeCell(grid, x2 + 1, y, z, jamb, 'facade_detail');
      }
    }
    if (options.shutters) {
      for (let y = baseY; y <= baseY + height - 1; y += Math.max(1, height - 1)) {
        this.placeFacadeCell(grid, x1 - 2, y, z, shutter, 'facade_detail');
        this.placeFacadeCell(grid, x2 + 2, y, z, shutter, 'facade_detail');
      }
    }
    if (options.grille && height >= 3) {
      const midY = baseY + Math.floor(Math.max(1, height) / 2);
      for (let x = x1; x <= x2; x += 2) this.placeFacadeCell(grid, x, midY, z, bar, 'facade_detail');
    }
    if (options.hardware) {
      this.placeFacadeCell(grid, x1 - 2, baseY - 1, z, hardware, 'facade_detail');
      this.placeFacadeCell(grid, x2 + 2, baseY - 1, z, hardware, 'facade_detail');
    }
  }

  addWindowFrameX(grid, x, z1, z2, baseY, height, blocks, fallbackBlock, options = {}) {
    const sill = blockAt(blocks, 0, fallbackBlock);
    const lintel = blockAt(blocks, 1, fallbackBlock);
    const jamb = blockAt(blocks, 2, fallbackBlock);
    const bar = blockAt(blocks, 3, fallbackBlock);
    const shutter = blockAt(blocks, 4, fallbackBlock);
    const hardware = blockAt(blocks, 5, fallbackBlock);
    for (let z = z1; z <= z2; z += 1) {
      this.placeFacadeCell(grid, x, baseY - 1, z, sill, 'facade_detail');
      this.placeFacadeCell(grid, x, baseY + height, z, lintel, 'facade_detail');
    }
    if (options.sideJambs) {
      for (let y = baseY; y <= baseY + height - 1; y += 1) {
        this.placeFacadeCell(grid, x, y, z1 - 1, jamb, 'facade_detail');
        this.placeFacadeCell(grid, x, y, z2 + 1, jamb, 'facade_detail');
      }
    }
    if (options.shutters) {
      for (let y = baseY; y <= baseY + height - 1; y += Math.max(1, height - 1)) {
        this.placeFacadeCell(grid, x, y, z1 - 2, shutter, 'facade_detail');
        this.placeFacadeCell(grid, x, y, z2 + 2, shutter, 'facade_detail');
      }
    }
    if (options.grille && height >= 3) {
      const midY = baseY + Math.floor(Math.max(1, height) / 2);
      for (let z = z1; z <= z2; z += 2) this.placeFacadeCell(grid, x, midY, z, bar, 'facade_detail');
    }
    if (options.hardware) {
      this.placeFacadeCell(grid, x, baseY - 1, z1 - 2, hardware, 'facade_detail');
      this.placeFacadeCell(grid, x, baseY - 1, z2 + 2, hardware, 'facade_detail');
    }
  }

  addEntryDetail(grid, box, facadePlan = {}) {
    const side = String(this.spec.door_side || this.architecture?.facade_rules?.front_side || 'south');
    const style = String(facadePlan.entry_detail_style || 'framed-entry');
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('entry_portal', facadePlan, family, this.materials);
    const post = blockAt(blocks, 0, this.materials.trim || this.materials.accent || 'minecraft:smooth_quartz');
    const cap = blockAt(blocks, 1, post);
    const threshold = blockAt(blocks, 2, this.materials.foundation || 'minecraft:stone_bricks');
    const chainBlock = blockAt(blocks, 3, post);
    const lampBlock = blockAt(blocks, 4, this.materials.lamp || 'minecraft:lantern');
    const sidePanel = blockAt(blocks, 5, post);
    const hardware = blockAt(blocks, 6, post);
    const widthBonus = /wide|double|canopy/.test(style) ? 4 : /recessed|solid/.test(style) ? 2 : 3;
    const heightBonus = /double-height/.test(style) ? 3 : /canopy/.test(style) ? 2 : 1;
    const width = Math.max(2, Number(this.spec.door_width || 2) + widthBonus);
    const height = Math.max(3, Number(this.spec.door_height || 3) + heightBonus);
    const cx = Math.floor((box.min_x + box.max_x) / 2);
    const cz = Math.floor((box.min_z + box.max_z) / 2);
    if (['south', 'north'].includes(side)) {
      const z = side === 'south' ? box.max_z + 1 : box.min_z - 1;
      const x1 = cx - Math.floor(width / 2);
      const x2 = cx + Math.floor(width / 2);
      for (let y = 1; y <= height; y += 1) {
        this.placeFacadeCell(grid, x1, y, z, y % 2 === 0 ? chainBlock : post, 'entry_detail');
        this.placeFacadeCell(grid, x2, y, z, y % 2 === 0 ? chainBlock : post, 'entry_detail');
      }
      for (let x = x1; x <= x2; x += 1) {
        this.placeFacadeCell(grid, x, height + 1, z, x === x1 || x === x2 ? post : cap, 'entry_detail');
        this.placeFacadeCell(grid, x, 0, z, threshold, 'entry_detail');
      }
      this.placeFacadeCell(grid, x1 - 1, 2, z, sidePanel, 'entry_detail');
      this.placeFacadeCell(grid, x2 + 1, 2, z, sidePanel, 'entry_detail');
      this.placeFacadeCell(grid, x1 - 1, 1, z, hardware, 'entry_detail');
      this.placeFacadeCell(grid, x2 + 1, 1, z, hardware, 'entry_detail');
      this.placeFacadeCell(grid, cx, height + 2, z, lampBlock, 'entry_detail');
      this.placeFacadeCell(grid, cx - 1, height, z, chainBlock, 'entry_detail');
      this.placeFacadeCell(grid, cx + 1, height, z, chainBlock, 'entry_detail');
      this.placeFacadeCell(grid, x1 - 2, height + 1, z, sidePanel, 'entry_detail');
      this.placeFacadeCell(grid, x2 + 2, height + 1, z, sidePanel, 'entry_detail');
      this.placeFacadeCell(grid, x1 - 2, height + 2, z, hardware, 'entry_detail');
      this.placeFacadeCell(grid, x2 + 2, height + 2, z, lampBlock, 'entry_detail');
      const detailZ = z + (side === 'south' ? 1 : -1);
      for (let i = 0; i < 6; i += 1) this.placeFacadeCell(grid, cx - 3 + i, height + 3, detailZ, blockAt(blocks, i, post), 'entry_detail');
      return;
    }
    const x = side === 'east' ? box.max_x + 1 : box.min_x - 1;
    const z1 = cz - Math.floor(width / 2);
    const z2 = cz + Math.floor(width / 2);
    for (let y = 1; y <= height; y += 1) {
      this.placeFacadeCell(grid, x, y, z1, y % 2 === 0 ? chainBlock : post, 'entry_detail');
      this.placeFacadeCell(grid, x, y, z2, y % 2 === 0 ? chainBlock : post, 'entry_detail');
    }
    for (let z = z1; z <= z2; z += 1) {
      this.placeFacadeCell(grid, x, height + 1, z, z === z1 || z === z2 ? post : cap, 'entry_detail');
      this.placeFacadeCell(grid, x, 0, z, threshold, 'entry_detail');
    }
    this.placeFacadeCell(grid, x, 2, z1 - 1, sidePanel, 'entry_detail');
    this.placeFacadeCell(grid, x, 2, z2 + 1, sidePanel, 'entry_detail');
    this.placeFacadeCell(grid, x, 1, z1 - 1, hardware, 'entry_detail');
    this.placeFacadeCell(grid, x, 1, z2 + 1, hardware, 'entry_detail');
    this.placeFacadeCell(grid, x, height + 2, cz, lampBlock, 'entry_detail');
    this.placeFacadeCell(grid, x, height, cz - 1, chainBlock, 'entry_detail');
    this.placeFacadeCell(grid, x, height, cz + 1, chainBlock, 'entry_detail');
    this.placeFacadeCell(grid, x, height + 1, z1 - 2, sidePanel, 'entry_detail');
    this.placeFacadeCell(grid, x, height + 1, z2 + 2, sidePanel, 'entry_detail');
    this.placeFacadeCell(grid, x, height + 2, z1 - 2, hardware, 'entry_detail');
    this.placeFacadeCell(grid, x, height + 2, z2 + 2, lampBlock, 'entry_detail');
    const detailX = x + (side === 'east' ? 1 : -1);
    for (let i = 0; i < 6; i += 1) this.placeFacadeCell(grid, detailX, height + 3, cz - 3 + i, blockAt(blocks, i, post), 'entry_detail');
  }

  placeFacadeCell(grid, x, y, z, block, module) {
    if (y < 0) return;
    const existing = grid.get(keyFor(x, y, z));
    if (existing && ['door', 'entry_path', 'stairs'].includes(existing.module)) return;
    if (existing?.module === 'arches' && module !== 'arches') return;
    if (module !== 'windows' && directlyFacesWindow(grid, x, y, z)) return;
    grid.set(keyFor(x, y, z), cell(block, module));
  }

  placeClearFacadeCell(grid, x, y, z, block, module, clearance = 2) {
    if (hasNearbyWindow(grid, x, y, z, clearance)) return false;
    this.placeFacadeCell(grid, x, y, z, block, module);
    return true;
  }

  addScreenFacade(grid, box, facadePlan = {}) {
    const side = String(this.spec.door_side || 'south');
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('decorative_screens', facadePlan, family, this.materials);
    const post = blockAt(blocks, 0, this.materials.trim || 'minecraft:stripped_dark_oak_log');
    const panel = blockAt(blocks, 1, post);
    const rail = blockAt(blocks, 2, post);
    const cap = blockAt(blocks, 3, post);
    const lamp = blockAt(blocks, 4, this.materials.lamp || 'minecraft:lantern');
    const hardware = blockAt(blocks, 5, post);
    const y1 = 2;
    const y2 = Math.min(box.max_y, this.spec.floor_height);
    if (['south', 'north'].includes(side)) {
      const z = side === 'south' ? box.max_z + 3 : box.min_z - 3;
      for (let x = box.min_x + 2; x <= box.max_x - 2; x += 3) {
        for (let y = y1; y <= y2; y += 1) this.placeFacadeCell(grid, x, y, z, y % 2 === 0 ? post : panel, 'screens');
        this.placeFacadeCell(grid, x + 1, y1, z, rail, 'screens');
        this.placeFacadeCell(grid, x + 1, y2, z, cap, 'screens');
        this.placeFacadeCell(grid, x, y2 + 1, z, lamp, 'screens');
        this.placeFacadeCell(grid, x - 1, y1, z, hardware, 'screens');
      }
    } else {
      const x = side === 'east' ? box.max_x + 3 : box.min_x - 3;
      for (let z = box.min_z + 2; z <= box.max_z - 2; z += 3) {
        for (let y = y1; y <= y2; y += 1) this.placeFacadeCell(grid, x, y, z, y % 2 === 0 ? post : panel, 'screens');
        this.placeFacadeCell(grid, x, y1, z + 1, rail, 'screens');
        this.placeFacadeCell(grid, x, y2, z + 1, cap, 'screens');
        this.placeFacadeCell(grid, x, y2 + 1, z, lamp, 'screens');
        this.placeFacadeCell(grid, x, y1, z - 1, hardware, 'screens');
      }
    }
  }

  addEntryArch(grid, box, pointed, facadePlan = {}) {
    const side = String(this.spec.door_side || 'south');
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('entry_portal', facadePlan, family, this.materials);
    const post = blockAt(blocks, 0, this.materials.trim || 'minecraft:smooth_quartz');
    const cap = blockAt(blocks, 1, post);
    const rib = blockAt(blocks, 2, post);
    const chainBlock = blockAt(blocks, 3, post);
    const lampBlock = blockAt(blocks, 4, this.materials.lamp || 'minecraft:lantern');
    const width = Math.max(3, Number(this.spec.door_width || 2) + 2);
    const height = Math.max(3, Number(this.spec.door_height || 3) + 1);
    const centerX = Math.floor((box.min_x + box.max_x) / 2);
    const centerZ = Math.floor((box.min_z + box.max_z) / 2);
    if (['south', 'north'].includes(side)) {
      const z = side === 'south' ? box.max_z + 1 : box.min_z - 1;
      const x1 = centerX - Math.floor(width / 2);
      const x2 = centerX + Math.floor(width / 2);
      for (let y = 1; y <= height; y += 1) {
        this.placeFacadeCell(grid, x1, y, z, y % 2 ? post : rib, 'arches');
        this.placeFacadeCell(grid, x2, y, z, y % 2 ? post : rib, 'arches');
      }
      for (let x = x1; x <= x2; x += 1) this.placeFacadeCell(grid, x, height, z, x % 2 ? cap : rib, 'arches');
      this.placeFacadeCell(grid, centerX - 1, height - 1, z, chainBlock, 'arches');
      this.placeFacadeCell(grid, centerX + 1, height - 1, z, chainBlock, 'arches');
      this.placeFacadeCell(grid, centerX, height + 1, z, pointed ? cap : lampBlock, 'arches');
      if (pointed) this.placeFacadeCell(grid, centerX, height + 2, z, lampBlock, 'arches');
      for (let i = 0; i < 5; i += 1) this.placeFacadeCell(grid, centerX - 2 + i, height + 3, z, blockAt(blocks, i, post), 'arches');
    } else {
      const x = side === 'east' ? box.max_x + 1 : box.min_x - 1;
      const z1 = centerZ - Math.floor(width / 2);
      const z2 = centerZ + Math.floor(width / 2);
      for (let y = 1; y <= height; y += 1) {
        this.placeFacadeCell(grid, x, y, z1, y % 2 ? post : rib, 'arches');
        this.placeFacadeCell(grid, x, y, z2, y % 2 ? post : rib, 'arches');
      }
      for (let z = z1; z <= z2; z += 1) this.placeFacadeCell(grid, x, height, z, z % 2 ? cap : rib, 'arches');
      this.placeFacadeCell(grid, x, height - 1, centerZ - 1, chainBlock, 'arches');
      this.placeFacadeCell(grid, x, height - 1, centerZ + 1, chainBlock, 'arches');
      this.placeFacadeCell(grid, x, height + 1, centerZ, pointed ? cap : lampBlock, 'arches');
      if (pointed) this.placeFacadeCell(grid, x, height + 2, centerZ, lampBlock, 'arches');
      for (let i = 0; i < 5; i += 1) this.placeFacadeCell(grid, x, height + 3, centerZ - 2 + i, blockAt(blocks, i, post), 'arches');
    }
  }

  addBalcony(grid, box, facadePlan = {}) {
    if (this.spec.floors <= 1) return;
    const side = String(this.spec.door_side || 'south');
    const floorY = this.spec.floor_height + 1;
    const railY = floorY + 1;
    const centerX = Math.floor((box.min_x + box.max_x) / 2);
    const centerZ = Math.floor((box.min_z + box.max_z) / 2);
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('balcony_rail', facadePlan, family, this.materials);
    const floorBlock = blockAt(blocks, 2, this.materials.floor || 'minecraft:spruce_planks');
    const railBlock = blockAt(blocks, 0, this.materials.trim || 'minecraft:smooth_quartz');
    const bracketBlock = blockAt(blocks, 1, railBlock);
    const capBlock = blockAt(blocks, 3, railBlock);
    if (['south', 'north'].includes(side)) {
      const z1 = side === 'south' ? box.max_z + 1 : box.min_z - 3;
      const z2 = side === 'south' ? box.max_z + 3 : box.min_z - 1;
      fillBox(grid, centerX - 3, floorY, z1, centerX + 3, floorY, z2, floorBlock, 'balcony');
      fillBox(grid, centerX - 3, railY, z2, centerX + 3, railY, z2, railBlock, 'balcony');
      this.placeFacadeCell(grid, centerX - 3, floorY - 1, z2, bracketBlock, 'balcony');
      this.placeFacadeCell(grid, centerX + 3, floorY - 1, z2, bracketBlock, 'balcony');
      this.placeFacadeCell(grid, centerX, railY + 1, z2, capBlock, 'balcony');
    } else {
      const x1 = side === 'east' ? box.max_x + 1 : box.min_x - 3;
      const x2 = side === 'east' ? box.max_x + 3 : box.min_x - 1;
      fillBox(grid, x1, floorY, centerZ - 3, x2, floorY, centerZ + 3, floorBlock, 'balcony');
      fillBox(grid, x2, railY, centerZ - 3, x2, railY, centerZ + 3, railBlock, 'balcony');
      this.placeFacadeCell(grid, x2, floorY - 1, centerZ - 3, bracketBlock, 'balcony');
      this.placeFacadeCell(grid, x2, floorY - 1, centerZ + 3, bracketBlock, 'balcony');
      this.placeFacadeCell(grid, x2, railY + 1, centerZ, capBlock, 'balcony');
    }
  }

  addBayWindow(grid, box, facadePlan = {}) {
    const block = this.materials.glass || 'minecraft:glass';
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('window_surround', facadePlan, family, this.materials);
    const trim = blockAt(blocks, 0, this.materials.trim || 'minecraft:smooth_quartz');
    const cap = blockAt(blocks, 1, trim);
    const jamb = blockAt(blocks, 2, trim);
    const grille = blockAt(blocks, 3, trim);
    const shutter = blockAt(blocks, 4, trim);
    const x = Math.floor((box.min_x + box.max_x) / 2);
    const z = box.max_z + 1;
    fillBox(grid, x - 2, 2, z, x + 2, 4, z, block, 'windows');
    fillBox(grid, x - 3, 1, z, x + 3, 1, z, trim, 'facade');
    fillBox(grid, x - 3, 5, z, x + 3, 5, z, cap, 'facade');
    this.placeFacadeCell(grid, x - 3, 2, z, jamb, 'facade_detail');
    this.placeFacadeCell(grid, x + 3, 2, z, jamb, 'facade_detail');
    this.placeFacadeCell(grid, x, 3, z, grille, 'facade_detail');
    this.placeFacadeCell(grid, x - 4, 3, z, shutter, 'facade_detail');
    this.placeFacadeCell(grid, x + 4, 3, z, shutter, 'facade_detail');
  }

  addWindowTrimBands(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('window_surround', facadePlan, family, this.materials);
    const block = blockAt(blocks, 0, facadePlan.window_system?.trim || this.materials.accent || this.materials.trim || 'minecraft:smooth_quartz');
    for (let floor = 0; floor < Math.max(1, box.floors); floor += 1) {
      const y = floor * this.spec.floor_height + 1;
      if (y >= box.max_y) continue;
      for (let x = box.min_x; x <= box.max_x; x += 1) {
        this.placeClearFacadeCell(grid, x, y, box.min_z - 1, block, 'facade_trim', 1);
        this.placeClearFacadeCell(grid, x, y, box.max_z + 1, block, 'facade_trim', 1);
      }
      for (let z = box.min_z; z <= box.max_z; z += 1) {
        this.placeClearFacadeCell(grid, box.min_x - 1, y, z, block, 'facade_trim', 1);
        this.placeClearFacadeCell(grid, box.max_x + 1, y, z, block, 'facade_trim', 1);
      }
    }
  }

  addShutters(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('window_surround', facadePlan, family, this.materials);
    const block = blockAt(blocks, 4, facadePlan.window_system?.sill || this.materials.accent || this.materials.trim || 'minecraft:dark_oak_planks');
    const hardware = blockAt(blocks, 5, block);
    const cap = blockAt(blocks, 1, block);
    const y1 = 3;
    const y2 = Math.min(box.max_y, 4);
    const spacing = clampInt(facadePlan.window_system?.spacing || 6, 4, 10, 6);
    for (let x = box.min_x + 3; x <= box.max_x - 3; x += spacing) {
      fillBox(grid, x - 1, y1, box.max_z + 1, x - 1, y2, box.max_z + 1, block, 'facade_detail');
      fillBox(grid, x + 2, y1, box.max_z + 1, x + 2, y2, box.max_z + 1, block, 'facade_detail');
      this.placeFacadeCell(grid, x - 1, y1 - 1, box.max_z + 1, hardware, 'facade_detail');
      this.placeFacadeCell(grid, x + 2, y1 - 1, box.max_z + 1, hardware, 'facade_detail');
      this.placeFacadeCell(grid, x, y2 + 1, box.max_z + 1, cap, 'facade_detail');
    }
  }

  addNeonTrim(grid, box) {
    const block = this.materials.facade_light || this.materials.neon || 'minecraft:sea_lantern';
    const y = Math.min(box.max_y + 1, Math.max(3, this.spec.wall_height));
    fillBox(grid, box.min_x, y, box.max_z + 1, box.max_x, y, box.max_z + 1, block, 'facade_light');
    fillBox(grid, box.max_x + 1, 2, box.min_z, box.max_x + 1, Math.min(box.max_y, y), box.min_z, block, 'facade_light');
  }

  addBalconyRail(grid, box, facadePlan = {}) {
    if (this.spec.floors <= 1) return;
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('balcony_rail', facadePlan, family, this.materials);
    const block = blockAt(blocks, 0, this.materials.railing || this.materials.trim || 'minecraft:iron_bars');
    const chainBlock = blockAt(blocks, 1, block);
    const capBlock = blockAt(blocks, 2, block);
    const postBlock = blockAt(blocks, 3, block);
    const lampBlock = blockAt(blocks, 4, block);
    const hardwareBlock = blockAt(blocks, 5, block);
    const y = this.spec.floor_height + 2;
    const side = String(this.spec.door_side || 'south');
    if (['south', 'north'].includes(side)) {
      const z = side === 'south' ? box.max_z + 3 : box.min_z - 3;
      const cx = Math.floor((box.min_x + box.max_x) / 2);
      for (let x = cx - 4; x <= cx + 4; x += 1) this.placeFacadeCell(grid, x, y, z, x % 2 ? block : chainBlock, 'railing');
      this.placeFacadeCell(grid, cx - 4, y + 1, z, postBlock, 'railing');
      this.placeFacadeCell(grid, cx + 4, y + 1, z, postBlock, 'railing');
      this.placeFacadeCell(grid, cx, y + 1, z, capBlock, 'railing');
      this.placeFacadeCell(grid, cx, y + 2, z, lampBlock, 'railing');
      this.placeFacadeCell(grid, cx - 2, y + 1, z, hardwareBlock, 'railing');
      this.placeFacadeCell(grid, cx + 2, y + 1, z, hardwareBlock, 'railing');
    } else {
      const x = side === 'east' ? box.max_x + 3 : box.min_x - 3;
      const cz = Math.floor((box.min_z + box.max_z) / 2);
      for (let z = cz - 4; z <= cz + 4; z += 1) this.placeFacadeCell(grid, x, y, z, z % 2 ? block : chainBlock, 'railing');
      this.placeFacadeCell(grid, x, y + 1, cz - 4, postBlock, 'railing');
      this.placeFacadeCell(grid, x, y + 1, cz + 4, postBlock, 'railing');
      this.placeFacadeCell(grid, x, y + 1, cz, capBlock, 'railing');
      this.placeFacadeCell(grid, x, y + 2, cz, lampBlock, 'railing');
      this.placeFacadeCell(grid, x, y + 1, cz - 2, hardwareBlock, 'railing');
      this.placeFacadeCell(grid, x, y + 1, cz + 2, hardwareBlock, 'railing');
    }
  }

  addProtectedSlitFrames(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('window_surround', facadePlan, family, this.materials);
    const block = blockAt(blocks, 0, this.materials.accent || this.materials.trim || 'minecraft:mossy_cobblestone');
    const bar = blockAt(blocks, 3, block);
    const shutter = blockAt(blocks, 4, block);
    const hardware = blockAt(blocks, 5, block);
    for (let x = box.min_x + 4; x <= box.max_x - 4; x += 7) {
      fillBox(grid, x - 1, 2, box.max_z + 1, x + 1, 2, box.max_z + 1, block, 'facade_trim');
      fillBox(grid, x - 1, 5, box.max_z + 1, x + 1, 5, box.max_z + 1, block, 'facade_trim');
      fillBox(grid, x, 3, box.max_z + 1, x, 4, box.max_z + 1, bar, 'facade_detail');
      this.placeFacadeCell(grid, x - 2, 3, box.max_z + 1, shutter, 'facade_detail');
      this.placeFacadeCell(grid, x + 2, 3, box.max_z + 1, shutter, 'facade_detail');
      this.placeFacadeCell(grid, x, 1, box.max_z + 1, hardware, 'facade_detail');
    }
  }

  addAwnings(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('shade_awnings', facadePlan, family, this.materials);
    const canopy = blockAt(blocks, 0, this.materials.awning || 'minecraft:white_carpet');
    const soffit = blockAt(blocks, 1, canopy);
    const lip = blockAt(blocks, 2, canopy);
    const hanger = blockAt(blocks, 3, canopy);
    const lamp = blockAt(blocks, 4, this.materials.lamp || 'minecraft:lantern');
    const bracket = blockAt(blocks, 5, canopy);
    const sidePanel = blockAt(blocks, 6, canopy);
    const side = String(this.spec.door_side || 'south');
    const y = Math.max(5, Number(this.spec.door_height || 3) + 3);
    const cx = Math.floor((box.min_x + box.max_x) / 2);
    const cz = Math.floor((box.min_z + box.max_z) / 2);
    if (['south', 'north'].includes(side)) {
      const z1 = side === 'south' ? box.max_z + 1 : box.min_z - 2;
      const z2 = side === 'south' ? box.max_z + 2 : box.min_z - 1;
      fillBox(grid, cx - 3, y, z1, cx + 3, y, z1, canopy, 'awning');
      fillBox(grid, cx - 3, y, z2, cx + 3, y, z2, soffit, 'awning');
      fillBox(grid, cx - 3, y - 1, z2, cx + 3, y - 1, z2, lip, 'awning');
      this.placeFacadeCell(grid, cx - 3, y - 1, z1, bracket, 'awning');
      this.placeFacadeCell(grid, cx + 3, y - 1, z1, bracket, 'awning');
      this.placeFacadeCell(grid, cx - 4, y, z1, sidePanel, 'awning');
      this.placeFacadeCell(grid, cx + 4, y, z1, sidePanel, 'awning');
      this.placeFacadeCell(grid, cx, y - 2, z2, hanger, 'awning');
      this.placeFacadeCell(grid, cx, y - 3, z2, lamp, 'awning');
    } else {
      const x1 = side === 'east' ? box.max_x + 1 : box.min_x - 2;
      const x2 = side === 'east' ? box.max_x + 2 : box.min_x - 1;
      fillBox(grid, x1, y, cz - 3, x1, y, cz + 3, canopy, 'awning');
      fillBox(grid, x2, y, cz - 3, x2, y, cz + 3, soffit, 'awning');
      fillBox(grid, x2, y - 1, cz - 3, x2, y - 1, cz + 3, lip, 'awning');
      this.placeFacadeCell(grid, x1, y - 1, cz - 3, bracket, 'awning');
      this.placeFacadeCell(grid, x1, y - 1, cz + 3, bracket, 'awning');
      this.placeFacadeCell(grid, x1, y, cz - 4, sidePanel, 'awning');
      this.placeFacadeCell(grid, x1, y, cz + 4, sidePanel, 'awning');
      this.placeFacadeCell(grid, x2, y - 2, cz, hanger, 'awning');
      this.placeFacadeCell(grid, x2, y - 3, cz, lamp, 'awning');
    }
  }

  addFlowerBoxes(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('plant_boxes', facadePlan, family, this.materials);
    const face = blockAt(blocks, 0, this.materials.flower_box || this.materials.planter || 'minecraft:flower_pot');
    const basin = blockAt(blocks, 1, face);
    const bracket = blockAt(blocks, 6, face);
    const planned = facadePlan.window_system || {};
    const wide = Boolean(this.architecture?.facade_rules?.large_glass || this.spec.facade?.large_glass);
    const windowWidth = clampInt(planned.width || (wide ? 4 : 2), 1, 5, wide ? 4 : 2);
    const spacing = clampInt(planned.spacing || (wide ? 5 : 6), 3, 10, wide ? 5 : 6);
    const xs = windowPositions(box.min_x, box.max_x, windowWidth, spacing);
    for (let index = 0; index < xs.length; index += 2) {
      const x = xs[index];
      const y = 1;
      for (let px = x; px <= x + windowWidth - 1; px += 1) {
        this.placeFacadeCell(grid, px, y, box.max_z + 1, px === x || px === x + windowWidth - 1 ? face : basin, 'flower_box');
      }
      this.placeFacadeCell(grid, x - 1, y, box.max_z + 1, bracket, 'flower_box');
      this.placeFacadeCell(grid, x + windowWidth, y, box.max_z + 1, bracket, 'flower_box');
    }
  }

  addServiceVents(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('service_utilities', facadePlan, family, this.materials);
    const vent = blockAt(blocks, 0, this.materials.service_vent || 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]');
    const grate = blockAt(blocks, 1, vent);
    const rod = blockAt(blocks, 2, vent);
    const chainBlock = blockAt(blocks, 3, vent);
    const utility = blockAt(blocks, 4, vent);
    const button = blockAt(blocks, 5, vent);
    const indicator = blockAt(blocks, 6, this.materials.facade_light || 'minecraft:redstone_lamp');
    for (let y = 3; y <= Math.min(box.max_y, this.spec.floor_height + 3); y += 3) {
      this.placeFacadeCell(grid, box.max_x + 1, y, box.min_z + 3, vent, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 1, y, box.min_z + 4, grate, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 1, y, box.min_z + 5, vent, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 1, y + 1, box.min_z + 4, rod, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 2, y, box.min_z + 4, chainBlock, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 2, y - 1, box.min_z + 4, utility, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 1, y - 1, box.min_z + 3, button, 'service_vent');
      this.placeFacadeCell(grid, box.max_x + 1, y - 1, box.min_z + 5, indicator, 'service_vent');
    }
  }

  addAddressMarker(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('identity_marker', facadePlan, family, this.materials);
    const sign = blockAt(blocks, 0, this.materials.trim || 'minecraft:oak_wall_sign');
    const hangingSign = blockAt(blocks, 1, sign);
    const lamp = blockAt(blocks, 2, this.materials.facade_light || this.materials.neon || 'minecraft:glowstone');
    const chainBlock = blockAt(blocks, 3, lamp);
    const button = blockAt(blocks, 4, sign);
    const plate = blockAt(blocks, 5, sign);
    const cap = blockAt(blocks, 6, sign);
    const side = String(this.spec.door_side || 'south');
    const y = Math.max(2, Number(this.spec.door_height || 3));
    const cx = Math.floor((box.min_x + box.max_x) / 2);
    const cz = Math.floor((box.min_z + box.max_z) / 2);
    if (['south', 'north'].includes(side)) {
      const z = side === 'south' ? box.max_z + 1 : box.min_z - 1;
      this.placeFacadeCell(grid, cx + 3, y, z, sign, 'address_marker');
      this.placeFacadeCell(grid, cx + 4, y, z, hangingSign, 'address_marker');
      this.placeFacadeCell(grid, cx + 4, y + 1, z, chainBlock, 'address_marker');
      this.placeFacadeCell(grid, cx + 4, y + 2, z, lamp, 'address_marker');
      this.placeFacadeCell(grid, cx + 2, y, z, button, 'address_marker');
      this.placeFacadeCell(grid, cx + 3, y - 1, z, plate, 'address_marker');
      this.placeFacadeCell(grid, cx + 3, y + 1, z, cap, 'address_marker');
    } else {
      const x = side === 'east' ? box.max_x + 1 : box.min_x - 1;
      this.placeFacadeCell(grid, x, y, cz + 3, sign, 'address_marker');
      this.placeFacadeCell(grid, x, y, cz + 4, hangingSign, 'address_marker');
      this.placeFacadeCell(grid, x, y + 1, cz + 4, chainBlock, 'address_marker');
      this.placeFacadeCell(grid, x, y + 2, cz + 4, lamp, 'address_marker');
      this.placeFacadeCell(grid, x, y, cz + 2, button, 'address_marker');
      this.placeFacadeCell(grid, x, y - 1, cz + 3, plate, 'address_marker');
      this.placeFacadeCell(grid, x, y + 1, cz + 3, cap, 'address_marker');
    }
  }

  addPrivacyFins(grid, box, facadePlan = {}) {
    const family = String(this.architecture?.style_family || this.spec.style_family || 'general');
    const blocks = exteriorKitBlocks('privacy_screen', facadePlan, family, this.materials);
    const fin = blockAt(blocks, 0, this.materials.railing || this.materials.trim || 'minecraft:iron_bars');
    const panel = blockAt(blocks, 1, fin);
    const chainBlock = blockAt(blocks, 2, fin);
    const pane = blockAt(blocks, 3, fin);
    const cap = blockAt(blocks, 4, fin);
    const post = blockAt(blocks, 5, fin);
    const hardware = blockAt(blocks, 6, fin);
    const y1 = 2;
    const y2 = Math.min(box.max_y, this.spec.floor_height);
    for (let x = box.min_x + 2; x <= box.max_x - 2; x += 4) {
      for (let y = y1; y <= y2; y += 1) {
        this.placeFacadeCell(grid, x, y, box.min_z - 1, y % 2 ? fin : panel, 'privacy_fin');
        if (y % 2 === 0) this.placeFacadeCell(grid, x + 1, y, box.min_z - 1, pane, 'privacy_fin');
      }
      this.placeFacadeCell(grid, x, y1 - 1, box.min_z - 1, post, 'privacy_fin');
      this.placeFacadeCell(grid, x, y2 + 1, box.min_z - 1, cap, 'privacy_fin');
      this.placeFacadeCell(grid, x - 1, y2, box.min_z - 1, chainBlock, 'privacy_fin');
      this.placeFacadeCell(grid, x + 2, y1, box.min_z - 1, hardware, 'privacy_fin');
    }
  }

  addRoofPlanDetails(grid, boxes, roofPlan = {}) {
    if (!roofPlan || !roofPlan.engine_hints) return;
    const mainBox = boxes.find((box) => box.id === 'main') || boxes[0];
    if (!mainBox) return;
    if (roofPlan.engine_hints.render_ridge_caps) this.addRidgeCaps(grid, boxes, roofPlan);
    if (roofPlan.engine_hints.render_gutters) this.addGutters(grid, boxes, roofPlan);
    if (roofPlan.engine_hints.render_chimney) this.addChimney(grid, mainBox, roofPlan);
    if (roofPlan.engine_hints.render_roof_garden) this.addRoofGarden(grid, mainBox, roofPlan);
    if (roofPlan.engine_hints.render_neon_sign) this.addRoofSign(grid, mainBox, roofPlan);
    if (roofPlan.engine_hints.render_snow_caps) this.addSnowCaps(grid, boxes, roofPlan);
    if (roofPlan.engine_hints.render_canopy_caps) this.addCanopyCaps(grid, boxes, roofPlan);
    if (roofPlan.engine_hints.render_dormers) this.addPlanDormers(grid, mainBox, roofPlan);
    if (roofPlan.engine_hints.render_solar_panels) this.addSolarPanels(grid, mainBox, roofPlan);
    if (roofPlan.engine_hints.render_rain_collectors) this.addRainCollectors(grid, mainBox, roofPlan);
    if (roofPlan.engine_hints.render_roof_access) this.addRoofAccessHatch(grid, mainBox, roofPlan);
  }

  addRidgeCaps(grid, boxes, roofPlan = {}) {
    const block = roofPlan.materials?.trim || this.materials.roof_detail || this.materials.trim || 'minecraft:smooth_quartz';
    for (const box of boxes.filter((item) => item.module !== 'porch')) {
      const y = box.max_y + Math.max(2, Math.floor((this.spec.roof_height || 3) / 2));
      const z = Math.floor((box.min_z + box.max_z) / 2);
      fillBox(grid, box.min_x + 1, y, z, box.max_x - 1, y, z, block, 'roof_detail');
    }
  }

  addGutters(grid, boxes, roofPlan = {}) {
    const block = roofPlan.materials?.trim || this.materials.roof_detail || this.materials.trim || 'minecraft:iron_bars';
    for (const box of boxes.filter((item) => item.module !== 'porch')) {
      const y = box.max_y + 1;
      fillBox(grid, box.min_x, y, box.min_z - 1, box.max_x, y, box.min_z - 1, block, 'roof_detail');
      fillBox(grid, box.min_x, y, box.max_z + 1, box.max_x, y, box.max_z + 1, block, 'roof_detail');
    }
  }

  addChimney(grid, box, roofPlan = {}) {
    const block = roofPlan.materials?.chimney || this.materials.chimney || this.materials.foundation || 'minecraft:bricks';
    const x = clampInt(box.max_x - 4, box.min_x + 2, box.max_x - 2, box.max_x - 3);
    const z = clampInt(box.min_z + 3, box.min_z + 2, box.max_z - 2, box.min_z + 3);
    const y1 = box.max_y + 1;
    fillBox(grid, x, y1, z, x + 1, y1 + 4, z + 1, block, 'chimney');
  }

  addRoofGarden(grid, box, roofPlan = {}) {
    const plant = roofPlan.materials?.garden || this.materials.plant || 'minecraft:oak_leaves[persistent=true]';
    const plantPalette = blockPalette(roofPlan.materials?.garden_palette, plant, this.materials.plant_secondary);
    const understory = blockPalette(roofPlan.materials?.understory_palette, 'minecraft:moss_carpet');
    const soil = this.materials.landscape || 'minecraft:moss_block';
    const y = box.max_y + 2;
    const x1 = Math.max(box.min_x + 3, Math.floor((box.min_x + box.max_x) / 2) - 4);
    const x2 = Math.min(box.max_x - 3, x1 + 8);
    const z1 = Math.max(box.min_z + 3, Math.floor((box.min_z + box.max_z) / 2) - 3);
    const z2 = Math.min(box.max_z - 3, z1 + 6);
    fillBox(grid, x1, y, z1, x2, y, z2, soil, 'roof_garden');
    for (let x = x1; x <= x2; x += 3) {
      for (let z = z1; z <= z2; z += 3) {
        fillBox(grid, x, y + 1, z, x, y + 1, z, blockAt(plantPalette, x + z, plant), 'roof_garden');
        if ((x + z) % 2 === 0) fillBox(grid, x + 1, y + 1, z, x + 1, y + 1, z, blockAt(understory, x + z, 'minecraft:moss_carpet'), 'roof_garden');
      }
    }
  }

  addRoofSign(grid, box, roofPlan = {}) {
    const block = roofPlan.materials?.light || this.materials.facade_light || 'minecraft:sea_lantern';
    const y = box.max_y + Math.max(3, this.spec.roof_height || 3);
    const z = box.max_z + 1;
    const cx = Math.floor((box.min_x + box.max_x) / 2);
    fillBox(grid, cx - 3, y, z, cx + 3, y + 1, z, block, 'roof_sign');
  }

  addSnowCaps(grid, boxes) {
    for (const box of boxes.filter((item) => item.module !== 'porch')) {
      fillBox(grid, box.min_x, box.max_y + this.spec.roof_height + 1, box.min_z, box.max_x, box.max_y + this.spec.roof_height + 1, box.max_z, 'minecraft:snow', 'roof_detail');
    }
  }

  addCanopyCaps(grid, boxes, roofPlan = {}) {
    const block = roofPlan.materials?.garden || this.materials.plant || 'minecraft:oak_leaves[persistent=true]';
    const palette = blockPalette(roofPlan.materials?.garden_palette, block, this.materials.plant_secondary, 'minecraft:vine', 'minecraft:moss_carpet');
    for (const box of boxes.filter((item) => item.id === 'main' || item.tags?.includes('treehouse'))) {
      const y = box.max_y + 2;
      for (let x = box.min_x - 1; x <= box.max_x + 1; x += 1) {
        for (let z = box.min_z - 1; z <= box.max_z + 1; z += 1) {
          const edge = x === box.min_x - 1 || x === box.max_x + 1 || z === box.min_z - 1 || z === box.max_z + 1;
          fillBox(grid, x, y, z, x, y, z, blockAt(palette, edge ? x + z + 1 : x + z, block), 'roof_garden');
          if (edge && (x + z) % 5 === 0) fillBox(grid, x, y - 1, z, x, y - 1, z, 'minecraft:vine', 'roof_garden');
        }
      }
    }
  }

  addPlanDormers(grid, box, roofPlan = {}) {
    const block = roofPlan.materials?.trim || this.materials.roof_detail || this.materials.trim || 'minecraft:smooth_quartz';
    const glass = this.materials.glass || 'minecraft:glass';
    const count = clampInt((roofPlan.elements || []).find((item) => item.kind === 'dormer')?.count || 2, 1, 4, 2);
    const y = box.max_y + 2;
    for (let index = 0; index < count; index += 1) {
      const x = box.min_x + Math.floor(((index + 1) * (box.max_x - box.min_x + 1)) / (count + 1));
      fillBox(grid, x - 1, y, box.max_z + 1, x + 1, y + 1, box.max_z + 1, block, 'dormer');
      fillBox(grid, x, y, box.max_z + 2, x, y + 1, box.max_z + 2, glass, 'dormer_window');
    }
  }

  addSolarPanels(grid, box, roofPlan = {}) {
    const block = roofPlan.materials?.solar || this.materials.solar_panel || 'minecraft:daylight_detector';
    const y = box.max_y + Math.max(2, Math.floor((this.spec.roof_height || 3) / 2));
    const x1 = Math.floor((box.min_x + box.max_x) / 2) - 4;
    const z1 = Math.floor((box.min_z + box.max_z) / 2) - 2;
    fillBox(grid, x1, y, z1, x1 + 8, y, z1 + 3, block, 'solar_panel');
  }

  addRainCollectors(grid, box, roofPlan = {}) {
    const chain = roofPlan.materials?.rain_chain || this.materials.rain_chain || 'minecraft:chain';
    const barrel = roofPlan.materials?.drainage || this.materials.drainage || 'minecraft:cauldron';
    const x = box.max_x + 1;
    const z = box.max_z + 1;
    fillBox(grid, x, 1, z, x, box.max_y + 1, z, chain, 'rain_chain');
    fillBox(grid, x, 0, z, x, 0, z, barrel, 'rain_cistern');
  }

  addRoofAccessHatch(grid, box) {
    const block = this.materials.trim || 'minecraft:smooth_quartz';
    const y = box.max_y + 2;
    const x = box.min_x + 3;
    const z = box.min_z + 3;
    fillBox(grid, x, y, z, x + 2, y, z + 2, block, 'roof_access');
  }

  addSite(grid, siteRules) {
    if (!siteRules.formal_garden && !siteRules.water_feature && !siteRules.dry_garden && !siteRules.patio && !siteRules.enclosed_courtyard) return;
    const center = Math.floor(this.spec.width / 2);
    const gardenDepth = Math.max(3, Number(this.spec.garden_depth || 6));
    const pathBlock = this.materials.path || 'minecraft:gravel';
    this.addEntryPath(grid, {
      side: this.spec.door_side || 'south',
      width: 1,
      length: gardenDepth,
      block: pathBlock,
      module: 'garden'
    });
    if (siteRules.formal_garden) {
      this.addFormalGarden(grid, center, gardenDepth);
    }
    if (siteRules.dry_garden) {
      this.addDryGarden(grid, center, gardenDepth);
    }
    if (siteRules.patio || siteRules.enclosed_courtyard) {
      this.addPatio(grid, center, gardenDepth);
    }
    if (siteRules.water_feature) {
      const z = this.spec.depth + Math.max(2, Math.floor(gardenDepth / 2));
      this.addContainedWaterRect(grid, center - 2, z, center + 2, z + 2, {
        edge: this.materials.foundation || 'minecraft:stone_bricks',
        water: this.materials.water || 'minecraft:water',
        edgeModule: 'water_feature',
        waterModule: 'water_feature'
      });
    }
  }

  addFormalGarden(grid, center, gardenDepth) {
    const hedge = 'minecraft:oak_leaves[persistent=true]';
    const leftX1 = Math.max(-6, center - 9);
    const rightX2 = Math.min(this.spec.width + 5, center + 9);
    const z1 = this.spec.depth + 2;
    const z2 = this.spec.depth + gardenDepth;
    fillBox(grid, leftX1, 0, z1, center - 3, 0, z2, 'minecraft:grass_block', 'garden');
    fillBox(grid, center + 3, 0, z1, rightX2, 0, z2, 'minecraft:grass_block', 'garden');
    for (let z = z1 + 1; z <= z2; z += 3) {
      fillBox(grid, leftX1, 1, z, center - 3, 1, z, hedge, 'garden');
      fillBox(grid, center + 3, 1, z, rightX2, 1, z, hedge, 'garden');
    }
  }

  addDryGarden(grid, center, gardenDepth) {
    const z1 = this.spec.depth + 2;
    const z2 = this.spec.depth + gardenDepth;
    fillBox(grid, center - 7, 0, z1, center + 7, 0, z2, 'minecraft:sand', 'dry_garden');
    for (let z = z1 + 1; z <= z2; z += 3) {
      fillBox(grid, center - 6, 1, z, center - 6, 1, z, 'minecraft:cobblestone', 'dry_garden');
      fillBox(grid, center + 5, 1, z + 1, center + 5, 1, z + 1, 'minecraft:mossy_cobblestone', 'dry_garden');
    }
  }

  addPatio(grid, center, gardenDepth) {
    const z1 = this.spec.depth + 1;
    const z2 = this.spec.depth + Math.min(gardenDepth, 5);
    fillBox(grid, center - 5, 0, z1, center + 5, 0, z2, this.materials.foundation || 'minecraft:stone_bricks', 'patio');
  }

  addSiteLandscape(grid, sitePlan = {}) {
    if (!sitePlan || !sitePlan.engine_hints) return;
    const center = Math.floor(this.spec.width / 2);
    const gardenDepth = Math.max(3, Number(this.spec.garden_depth || 6));
    const zStart = this.spec.depth + 1;
    const zEnd = this.spec.depth + gardenDepth;
    if (sitePlan.engine_hints.render_entry_path) {
      const width = Math.max(1, Number(sitePlan.entry_sequence?.path_width || 2));
      this.addEntryPath(grid, {
        side: sitePlan.entry_sequence?.side || this.spec.door_side || 'south',
        width,
        length: gardenDepth,
        block: sitePlan.materials?.path || this.materials.path || 'minecraft:gravel',
        module: 'landscape_path'
      });
    }
    if (sitePlan.engine_hints.render_path_lights) this.addPathLights(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_layered_terrain) this.addLayeredTerrain(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_terrain_retaining) this.addTerrainRetaining(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_boundary) this.addSiteBoundary(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_tree_clusters) this.addTreeClusters(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_rock_edges) this.addRockEdges(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_water_edge) this.addWaterEdge(grid, center, zStart, sitePlan);
    if (sitePlan.engine_hints.render_sunken_court) this.addSunkenCourtMarkers(grid, center, zStart, sitePlan);
    if (sitePlan.engine_hints.render_deck_transition) this.addDeckTransitionRail(grid, center, zStart, sitePlan);
    if (sitePlan.engine_hints.render_planting_beds) this.addPlantingBeds(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_garden_composition) this.addGardenComposition(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_pool) this.addPool(grid, center, zStart, sitePlan);
    if (sitePlan.engine_hints.render_outdoor_seating) this.addOutdoorSeating(grid, center, zStart, sitePlan);
    if (sitePlan.engine_hints.render_mailbox) this.addMailbox(grid, center, zStart, sitePlan);
    if (sitePlan.engine_hints.render_accessible_markers) this.addAccessibleMarkers(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_template_approach_sequence) this.addTemplateApproachSequence(grid, center, zStart, zEnd, sitePlan);
    if (sitePlan.engine_hints.render_template_view_frame) this.addTemplateViewFrame(grid, center, zStart, sitePlan);
  }

  addLayeredTerrain(grid, center, zStart, zEnd, sitePlan = {}) {
    const earth = sitePlan.materials?.earth || this.materials.earth || 'minecraft:dirt';
    const grass = sitePlan.materials?.grass || this.materials.landscape || 'minecraft:grass_block';
    const rock = sitePlan.materials?.rock || this.materials.retaining || 'minecraft:stone';
    const left = center - 12;
    const right = center + 12;
    const far = zEnd + 2;
    for (let z = zStart - 1; z <= far; z += 1) {
      for (let x = left; x <= right; x += 1) {
        const fromPath = Math.abs(x - center);
        if (fromPath <= 2) continue;
        const edgeRise = Math.max(0, Math.floor((fromPath - 5) / 3));
        const depthRise = z > zStart + 4 ? 1 : 0;
        const height = Math.min(3, edgeRise + depthRise);
        const surface = height >= 2 && (x + z) % 3 === 0 ? rock : grass;
        fillBox(grid, x, -1, z, x, -1, z, earth, 'terrain_fill');
        fillBox(grid, x, 0, z, x, 0, z, surface, 'terrain_surface');
        if (height >= 1) fillBox(grid, x, 1, z, x, 1, z, height >= 2 ? rock : earth, 'terrain_slope');
        if (height >= 2 && (x + z) % 2 === 0) fillBox(grid, x, 2, z, x, 2, z, rock, 'terrain_rock');
      }
    }
  }

  addTerrainRetaining(grid, center, zStart, zEnd, sitePlan = {}) {
    const block = sitePlan.materials?.rock || sitePlan.materials?.path_secondary || this.materials.retaining || 'minecraft:stone_bricks';
    const left = center - 8;
    const right = center + 8;
    const terraceZ = Math.min(zEnd, zStart + 4);
    fillBox(grid, left, 1, terraceZ, center - 3, 1, terraceZ, block, 'retaining_edge');
    fillBox(grid, center + 3, 1, terraceZ, right, 1, terraceZ, block, 'retaining_edge');
    fillBox(grid, left, 1, zStart, left, 2, zEnd, block, 'retaining_edge');
    fillBox(grid, right, 1, zStart, right, 2, zEnd, block, 'retaining_edge');
  }

  addEntryPath(grid, { side = 'south', width = 2, length = 6, block, module }) {
    const pathBlock = block || this.materials.path || 'minecraft:gravel';
    const halfWidth = Math.max(1, Number(width || 1));
    const pathLength = Math.max(1, Number(length || 1));
    const centerX = Math.floor(this.spec.width / 2);
    const centerZ = Math.floor(this.spec.depth / 2);
    if (side === 'north') {
      fillBox(grid, centerX - halfWidth, 0, -pathLength, centerX + halfWidth, 0, 0, pathBlock, module);
      return;
    }
    if (side === 'east') {
      fillBox(grid, this.spec.width, 0, centerZ - halfWidth, this.spec.width + pathLength, 0, centerZ + halfWidth, pathBlock, module);
      return;
    }
    if (side === 'west') {
      fillBox(grid, -pathLength, 0, centerZ - halfWidth, 0, 0, centerZ + halfWidth, pathBlock, module);
      return;
    }
    fillBox(grid, centerX - halfWidth, 0, this.spec.depth, centerX + halfWidth, 0, this.spec.depth + pathLength, pathBlock, module);
  }

  addPathLights(grid, center, zStart, zEnd, sitePlan = {}) {
    const block = sitePlan.materials?.light || this.materials.path_light || 'minecraft:glowstone';
    for (let z = zStart + 1; z <= zEnd; z += 3) {
      fillBox(grid, center - 3, 1, z, center - 3, 1, z, block, 'path_light');
      fillBox(grid, center + 3, 1, z, center + 3, 1, z, block, 'path_light');
    }
  }

  addSiteBoundary(grid, center, zStart, zEnd, sitePlan = {}) {
    const block = sitePlan.materials?.fence || this.materials.railing || 'minecraft:oak_fence';
    const left = center - 9;
    const right = center + 9;
    fillBox(grid, left, 1, zStart, left, 1, zEnd, block, 'fence');
    fillBox(grid, right, 1, zStart, right, 1, zEnd, block, 'fence');
    fillBox(grid, left, 1, zEnd, right, 1, zEnd, block, 'fence');
  }

  addTreeClusters(grid, center, zStart, zEnd, sitePlan = {}) {
    const trunk = this.materials.foundation || 'minecraft:oak_log';
    const leaves = sitePlan.materials?.plant || this.materials.plant || 'minecraft:oak_leaves[persistent=true]';
    const palette = blockPalette(sitePlan.materials?.plant_palette, leaves, sitePlan.materials?.plant_secondary, this.materials.plant_secondary);
    const understory = blockPalette(sitePlan.materials?.understory_palette, 'minecraft:moss_carpet', 'minecraft:fern');
    for (const [x, z] of [[center - 8, zStart + 2], [center + 8, zEnd - 1]]) {
      fillBox(grid, x, 1, z, x, 3, z, trunk, 'landscape');
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          fillBox(grid, x + dx, 4, z + dz, x + dx, 4, z + dz, blockAt(palette, dx + dz + x, leaves), 'landscape');
        }
      }
      fillBox(grid, x - 2, 1, z + 1, x - 2, 1, z + 1, blockAt(understory, x + z, 'minecraft:moss_carpet'), 'landscape');
      fillBox(grid, x + 2, 1, z - 1, x + 2, 1, z - 1, blockAt(understory, x + z + 1, 'minecraft:fern'), 'landscape');
      fillBox(grid, x, 3, z + 1, x, 3, z + 1, 'minecraft:vine', 'landscape');
    }
  }

  addRockEdges(grid, center, zStart, zEnd, sitePlan = {}) {
    const block = sitePlan.materials?.landscape || this.materials.landscape || 'minecraft:stone';
    for (let z = zStart; z <= zEnd; z += 2) {
      fillBox(grid, center - 10, 0, z, center - 10, 1, z, block, 'landscape');
      fillBox(grid, center + 10, 0, z + 1, center + 10, 1, z + 1, block, 'landscape');
    }
  }

  addWaterEdge(grid, center, zStart, sitePlan = {}) {
    const water = sitePlan.materials?.water || this.materials.water || 'minecraft:water';
    this.addContainedWaterRect(grid, center - 7, zStart + 3, center + 7, zStart + 5, {
      edge: sitePlan.materials?.pool_edge || this.materials.pool_edge || this.materials.foundation || 'minecraft:stone_bricks',
      water,
      edgeModule: 'water_feature',
      waterModule: 'water_feature'
    });
  }

  addSunkenCourtMarkers(grid, center, zStart, sitePlan = {}) {
    const block = sitePlan.materials?.landscape || this.materials.retaining || 'minecraft:mossy_cobblestone';
    fillBox(grid, center - 6, 0, zStart, center + 6, 0, zStart, block, 'sunken_court');
    fillBox(grid, center - 6, 1, zStart, center - 6, 1, zStart + 4, block, 'sunken_court');
    fillBox(grid, center + 6, 1, zStart, center + 6, 1, zStart + 4, block, 'sunken_court');
  }

  addDeckTransitionRail(grid, center, zStart, sitePlan = {}) {
    const block = sitePlan.materials?.fence || this.materials.railing || 'minecraft:oak_fence';
    fillBox(grid, center - 5, 1, zStart, center + 5, 1, zStart, block, 'railing');
  }

  addPlantingBeds(grid, center, zStart, zEnd, sitePlan = {}) {
    const soil = sitePlan.materials?.landscape || this.materials.landscape || 'minecraft:grass_block';
    const plant = sitePlan.materials?.plant || this.materials.plant || 'minecraft:oak_leaves[persistent=true]';
    const palette = blockPalette(sitePlan.materials?.plant_palette, plant, sitePlan.materials?.plant_secondary, this.materials.plant_secondary);
    const z1 = Math.min(zEnd, zStart + 2);
    const z2 = Math.min(zEnd, zStart + 5);
    fillBox(grid, center - 9, 0, z1, center - 5, 0, z2, soil, 'planting_bed');
    fillBox(grid, center + 5, 0, z1, center + 9, 0, z2, soil, 'planting_bed');
    for (let x = center - 9; x <= center - 5; x += 2) fillBox(grid, x, 1, z2, x, 1, z2, blockAt(palette, x, plant), 'planting_bed');
    for (let x = center + 5; x <= center + 9; x += 2) fillBox(grid, x, 1, z2, x, 1, z2, blockAt(palette, x + 1, plant), 'planting_bed');
  }

  addGardenComposition(grid, center, zStart, zEnd, sitePlan = {}) {
    const path = sitePlan.materials?.path_secondary || sitePlan.materials?.path || this.materials.path || 'minecraft:gravel';
    const edge = sitePlan.materials?.garden_edge || sitePlan.materials?.fence || this.materials.railing || 'minecraft:oak_fence';
    const soil = sitePlan.materials?.grass || sitePlan.materials?.landscape || this.materials.landscape || 'minecraft:grass_block';
    const plant = sitePlan.materials?.plant || this.materials.plant || 'minecraft:oak_leaves[persistent=true]';
    const palette = blockPalette(sitePlan.materials?.plant_palette, plant, sitePlan.materials?.plant_secondary, 'minecraft:flowering_azalea_leaves[persistent=true]', 'minecraft:fern');
    const water = sitePlan.materials?.water || this.materials.water || 'minecraft:water';
    const zMid = Math.floor((zStart + zEnd) / 2);
    const left1 = center - 10;
    const left2 = center - 5;
    const right1 = center + 5;
    const right2 = center + 10;

    fillBox(grid, center - 1, 0, zStart, center + 1, 0, zEnd, path, 'garden_axis');
    fillBox(grid, center - 10, 0, zMid, center + 10, 0, zMid, path, 'garden_cross_path');
    fillBox(grid, left1, 0, zStart + 1, left2, 0, zMid - 1, soil, 'garden_room');
    fillBox(grid, right1, 0, zStart + 1, right2, 0, zMid - 1, soil, 'garden_room');
    fillBox(grid, left1, 0, zMid + 1, left2, 0, zEnd, soil, 'garden_room');
    fillBox(grid, right1, 0, zMid + 1, right2, 0, zEnd, soil, 'garden_room');

    for (const [x1, x2] of [[left1, left2], [right1, right2]]) {
      fillBox(grid, x1, 1, zStart + 1, x2, 1, zStart + 1, edge, 'garden_hedge');
      fillBox(grid, x1, 1, zEnd, x2, 1, zEnd, edge, 'garden_hedge');
      for (let z = zStart + 2; z <= zEnd - 1; z += 3) {
        fillBox(grid, x1, 1, z, x1, 1, z, blockAt(palette, x1 + z, plant), 'garden_planting');
        fillBox(grid, x2, 1, z, x2, 1, z, blockAt(palette, x2 + z, plant), 'garden_planting');
      }
    }

    this.addContainedWaterRect(grid, center - 2, zMid - 1, center + 2, zMid + 1, {
      edge: sitePlan.materials?.pool_edge || this.materials.foundation || 'minecraft:stone_bricks',
      water,
      edgeModule: 'garden_water_edge',
      waterModule: 'garden_water'
    });
  }

  addTemplateApproachSequence(grid, center, zStart, zEnd, sitePlan = {}) {
    const path = sitePlan.materials?.path_secondary || sitePlan.materials?.path || this.materials.path || 'minecraft:gravel';
    const edge = sitePlan.materials?.garden_edge || sitePlan.materials?.fence || this.materials.railing || 'minecraft:oak_fence';
    const rock = sitePlan.materials?.rock || this.materials.retaining || 'minecraft:stone_bricks';
    const light = sitePlan.materials?.light || this.materials.path_light || this.materials.lamp || 'minecraft:glowstone';
    const z1 = zStart;
    const z2 = Math.min(zEnd, zStart + 7);
    fillBox(grid, center - 2, 0, z1, center + 2, 0, z2, path, 'template_approach_path');
    fillBox(grid, center - 6, 0, z1 + 1, center - 4, 0, z2 - 1, sitePlan.materials?.grass || 'minecraft:grass_block', 'template_forecourt');
    fillBox(grid, center + 4, 0, z1 + 1, center + 6, 0, z2 - 1, sitePlan.materials?.grass || 'minecraft:grass_block', 'template_forecourt');
    fillBox(grid, center - 6, 1, z1 + 1, center - 6, 1, z2 - 1, edge, 'template_forecourt_edge');
    fillBox(grid, center + 6, 1, z1 + 1, center + 6, 1, z2 - 1, edge, 'template_forecourt_edge');
    fillBox(grid, center - 4, 1, z1, center - 4, 3, z1, rock, 'template_entry_frame');
    fillBox(grid, center + 4, 1, z1, center + 4, 3, z1, rock, 'template_entry_frame');
    fillBox(grid, center - 4, 4, z1, center + 4, 4, z1, rock, 'template_entry_frame');
    for (let z = z1 + 2; z <= z2; z += 3) {
      fillBox(grid, center - 3, 1, z, center - 3, 1, z, light, 'template_approach_light');
      fillBox(grid, center + 3, 1, z, center + 3, 1, z, light, 'template_approach_light');
    }
  }

  addTemplateViewFrame(grid, center, zStart, sitePlan = {}) {
    const block = sitePlan.materials?.fence || this.materials.railing || 'minecraft:iron_bars';
    const trim = sitePlan.materials?.pool_edge || this.materials.foundation || 'minecraft:smooth_quartz';
    const z = zStart + 6;
    fillBox(grid, center - 7, 0, z, center + 7, 0, z + 1, trim, 'template_view_deck');
    fillBox(grid, center - 7, 1, z + 1, center + 7, 1, z + 1, block, 'template_view_frame');
    fillBox(grid, center - 7, 1, z, center - 7, 3, z + 1, block, 'template_view_frame');
    fillBox(grid, center + 7, 1, z, center + 7, 3, z + 1, block, 'template_view_frame');
  }

  addOutdoorSeating(grid, center, zStart, sitePlan = {}) {
    const seat = sitePlan.materials?.outdoor_seat || this.materials.outdoor_seat || 'minecraft:spruce_stairs[facing=north,half=bottom]';
    const firepit = sitePlan.materials?.firepit || this.materials.firepit || 'minecraft:campfire[lit=false]';
    const z = zStart + 7;
    fillBox(grid, center, 0, z, center, 0, z, firepit, 'outdoor_living');
    fillBox(grid, center - 2, 0, z, center - 2, 0, z, seat, 'outdoor_living');
    fillBox(grid, center + 2, 0, z, center + 2, 0, z, seat, 'outdoor_living');
  }

  addPool(grid, center, zStart, sitePlan = {}) {
    const edge = sitePlan.materials?.pool_edge || this.materials.pool_edge || 'minecraft:smooth_quartz';
    const water = sitePlan.materials?.water || this.materials.water || 'minecraft:water';
    const z1 = zStart + 2;
    const z2 = zStart + 6;
    this.addContainedWaterRect(grid, center - 5, z1 + 1, center + 5, z2 - 1, {
      edge,
      water,
      edgeModule: 'pool_edge',
      waterModule: 'pool_water'
    });
  }

  addContainedWaterRect(grid, minX, minZ, maxX, maxZ, { edge, water, edgeModule, waterModule }) {
    fillBox(grid, minX - 1, 0, minZ - 1, maxX + 1, 0, maxZ + 1, edge, edgeModule);
    fillBox(grid, minX, 0, minZ, maxX, 0, maxZ, water, waterModule);
  }

  addMailbox(grid, center, zStart, sitePlan = {}) {
    const block = sitePlan.materials?.mailbox || this.materials.mailbox || 'minecraft:barrel';
    fillBox(grid, center + 4, 1, zStart, center + 4, 1, zStart, block, 'mailbox');
  }

  addAccessibleMarkers(grid, center, zStart, zEnd, sitePlan = {}) {
    const block = sitePlan.materials?.accessibility_marker || this.materials.accessibility_marker || 'minecraft:light_blue_carpet';
    for (let z = zStart; z <= zEnd; z += 2) fillBox(grid, center, 1, z, center, 1, z, block, 'accessible_marker');
  }

  interiorSpaces(boxes) {
    const spaces = [];
    const thickness = this.shellThickness();
    for (const box of boxes) {
      if (!isInteriorSpaceVolume(box)) continue;
      for (let floor = 0; floor < box.floors; floor += 1) {
        const space = {
          floor,
          min_x: box.min_x + thickness,
          max_x: box.max_x - thickness,
          min_y: floor * this.spec.floor_height + 1,
          max_y: Math.min((floor + 1) * this.spec.floor_height - 1, box.max_y),
          min_z: box.min_z + thickness,
          max_z: box.max_z - thickness,
          source: box.id,
          side: box.side
        };
        if (isValidInteriorSpace(space)) spaces.push(space);
      }
    }
    return spaces;
  }
}

export function fillBox(grid, minX, minY, minZ, maxX, maxY, maxZ, block, module) {
  if (minX > maxX || minY > maxY || minZ > maxZ) return;
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const keyValue = keyFor(x, y, z);
        if (block === 'minecraft:air') grid.delete(keyValue);
        else grid.set(keyValue, cell(block, module));
      }
    }
  }
}

export function fillDisk(grid, centerX, y, centerZ, radius, block, module) {
  for (let x = centerX - radius; x <= centerX + radius; x += 1) {
    for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
      if ((x - centerX) ** 2 + (z - centerZ) ** 2 <= radius ** 2) {
        grid.set(keyFor(x, y, z), cell(block, module));
      }
    }
  }
}

function drawSteppedBrace(grid, from, to, block, module) {
  const steps = Math.max(
    1,
    Math.abs(Number(to.x) - Number(from.x)),
    Math.abs(Number(to.y) - Number(from.y)),
    Math.abs(Number(to.z) - Number(from.z))
  );
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const x = Math.round(Number(from.x) + (Number(to.x) - Number(from.x)) * ratio);
    const y = Math.round(Number(from.y) + (Number(to.y) - Number(from.y)) * ratio);
    const z = Math.round(Number(from.z) + (Number(to.z) - Number(from.z)) * ratio);
    grid.set(keyFor(x, y, z), cell(block, module));
  }
}

function normalizePlanItems(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function normalizePlanBundle(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  if (value.structure || value.facade || value.roof || value.site) {
    return {
      structure: value.structure || {},
      facade: value.facade || {},
      roof: value.roof || {},
      site: value.site || {}
    };
  }
  return {
    structure: value,
    facade: {},
    roof: {},
    site: {}
  };
}

function summarizeStructurePlan(plan = {}) {
  return {
    system: plan.system || 'standard-shell',
    foundationStrategy: plan.foundation?.strategy || 'unknown',
    supportElementCount: normalizePlanItems(plan.support_elements).length,
    bracingElementCount: normalizePlanItems(plan.bracing_elements).length,
    reinforcementElementCount: normalizePlanItems(plan.reinforcement_elements).length,
    roofFrameElementCount: normalizePlanItems(plan.roof_frame?.elements).length,
    loadPathCount: normalizePlanItems(plan.load_paths).length,
    lateralSystem: plan.stability?.lateral_system || 'unknown'
  };
}

function summarizeFacadePlan(plan = {}) {
  return {
    rhythm: plan.window_system?.rhythm || 'balanced',
    glazingRatio: plan.window_system?.glazing_ratio || 'medium',
    elementCount: Array.isArray(plan.facade_elements) ? plan.facade_elements.length : 0,
    exteriorDetailKitCount: Array.isArray(plan.exterior_detail_kits) ? plan.exterior_detail_kits.length : 0,
    exteriorBlockPaletteCount: Array.isArray(plan.exterior_block_palette) ? plan.exterior_block_palette.length : 0,
    frontSide: plan.front_side || 'south'
  };
}

function summarizeRoofPlan(plan = {}) {
  return {
    style: plan.style || 'gabled',
    profile: plan.profile || 'style-default',
    elementCount: normalizePlanItems(plan.elements).length,
    drainage: plan.drainage || 'unknown'
  };
}

function summarizeSitePlan(plan = {}) {
  return {
    mood: plan.mood || 'simple',
    zoneCount: Array.isArray(plan.zones) ? plan.zones.length : 0,
    boundary: plan.boundary || 'open-setback',
    terrain: plan.terrain_response || 'flat-lot'
  };
}

export function computeBounds(grid) {
  if (!grid.size) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  const points = [...grid.keys()].map(parseKey);
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z))
  };
}

export function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

export function parseKey(value) {
  const [x, y, z] = value.split(',').map(Number);
  return { x, y, z };
}

function cell(block, module) {
  return { block, module };
}

function cellsForVolume(box) {
  const keys = [];
  if (box.shape === 'cylinder') {
    const cx = (box.min_x + box.max_x) / 2;
    const cz = (box.min_z + box.max_z) / 2;
    const rx = Math.max(1, (box.max_x - box.min_x + 1) / 2);
    const rz = Math.max(1, (box.max_z - box.min_z + 1) / 2);
    for (let x = box.min_x; x <= box.max_x; x += 1) {
      for (let y = box.min_y; y <= box.max_y; y += 1) {
        for (let z = box.min_z; z <= box.max_z; z += 1) {
          if (((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1) keys.push(keyFor(x, y, z));
        }
      }
    }
    return keys;
  }

  for (let x = box.min_x; x <= box.max_x; x += 1) {
    for (let y = box.min_y; y <= box.max_y; y += 1) {
      for (let z = box.min_z; z <= box.max_z; z += 1) keys.push(keyFor(x, y, z));
    }
  }
  return keys;
}

function isSurfaceCell(solid, point) {
  return DIRECTIONS.some(([dx, dy, dz]) => !solid.has(keyFor(point.x + dx, point.y + dy, point.z + dz)));
}

function isShellCell(solid, point, thickness = 1) {
  if (isSurfaceCell(solid, point)) return true;
  const shellThickness = clampInt(thickness, 1, 3);
  return DIRECTIONS.some(([dx, dy, dz]) => {
    for (let step = 1; step <= shellThickness; step += 1) {
      if (!solid.has(keyFor(point.x + dx * step, point.y + dy * step, point.z + dz * step))) return true;
    }
    return false;
  });
}

function hasHorizontalInteriorBuffer(solid, x, y, z, thickness = 1) {
  const shellThickness = clampInt(thickness, 1, 3);
  return HORIZONTAL_DIRECTIONS.every(([dx, dz]) => {
    for (let step = 1; step <= shellThickness; step += 1) {
      if (!solid.has(keyFor(x + dx * step, y, z + dz * step))) return false;
    }
    return true;
  });
}

function pointInBox(point, box) {
  return point.x >= box.min_x && point.x <= box.max_x &&
    point.y >= box.min_y && point.y <= box.max_y &&
    point.z >= box.min_z && point.z <= box.max_z;
}

function moduleForVolume(volume) {
  const tags = Array.isArray(volume.tags) ? volume.tags.join(' ') : '';
  const text = `${volume.id || ''} ${volume.role || ''} ${volume.purpose || ''} ${volume.facade_role || ''} ${volume.placement?.relation || ''} ${tags}`.toLowerCase();
  if (/tower|turret|vertical-accent|塔|尖塔|钟楼|角塔/.test(text)) return 'tower';
  if (/sunroom|greenhouse|transparent|glass|阳光房|温室|花房|玻璃/.test(text)) return 'sunroom';
  if (/garage|parking|车库|停车/.test(text)) return 'garage';
  if (/gallery|corridor|veranda|engawa|deck|platform|view|overlook|cantilever|连廊|回廊|侧廊|缘侧|露台|平台|观景|悬挑/.test(text)) return 'gallery';
  if (/porch|gate|threshold|entry|entrance|门廊|门楼|玄关|入口|前院门楼/.test(text)) return 'porch';
  if (/wing|侧翼|翼楼/.test(text)) return 'wing';
  if (/courtyard|patio|lightwell|atrium|庭院|院落|内院|采光井|天井/.test(text)) return 'courtyard';
  return 'walls';
}

function isInteriorSpaceVolume(box = {}) {
  if (box.boolean_mode === 'subtract') return false;
  if (box.id === 'main') return true;
  if (box.module === 'porch') return false;
  const tags = Array.isArray(box.tags) ? box.tags.join(' ') : '';
  const text = `${box.id || ''} ${box.role || ''} ${box.purpose || ''} ${box.facade_role || ''} ${tags}`.toLowerCase();
  if (/chimney|flue|vent|lightwell|采光井|path|walkway|driveway|stilt|stilts|trunk|support|structural|anchor|retaining|foundation|main-shell/.test(text)) return false;
  return ['tower', 'sunroom', 'garage', 'gallery', 'wing', 'courtyard'].includes(box.module);
}

function isValidInteriorSpace(space = {}) {
  return space.max_x >= space.min_x &&
    space.max_y >= space.min_y &&
    space.max_z >= space.min_z &&
    space.max_x - space.min_x + 1 >= 3 &&
    space.max_z - space.min_z + 1 >= 3;
}

function normalizeScale(value) {
  if (Array.isArray(value) && value.length >= 3) return value.map(Number);
  if (value && typeof value === 'object') return [Number(value.x || 1), Number(value.y || 1), Number(value.z || 1)];
  return [1, 1, 1];
}

function windowPositions(min, max, width, spacing) {
  const positions = [];
  for (let value = min + 3; value <= max - width - 2; value += spacing) positions.push(value);
  if (!positions.length && max - min + 1 >= width + 2) positions.push(Math.floor((min + max - width) / 2));
  return positions;
}

function exteriorKitBlocks(id, facadePlan = {}, family = 'general', materials = {}) {
  const plannedKits = Array.isArray(facadePlan.exterior_detail_kits) ? facadePlan.exterior_detail_kits : [];
  const planned = plannedKits.find((kit) => kit?.id === id);
  const blocks = planned?.blocks?.length
    ? planned.blocks
    : exteriorDetailKitsForFamily(family, materials).find((kit) => kit.id === id)?.blocks;
  return Array.isArray(blocks) ? blocks.filter(Boolean) : [];
}

function blockAt(blocks, index, fallback) {
  if (!Array.isArray(blocks) || !blocks.length) return fallback;
  const normalized = Math.abs(Number(index) || 0) % blocks.length;
  return blocks[normalized] || fallback;
}

function blockPalette(...values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).map(String))];
}

function directlyFacesWindow(grid, x, y, z) {
  return HORIZONTAL_DIRECTIONS.some(([dx, dz]) => grid.get(keyFor(x + dx, y, z + dz))?.module === 'windows');
}

function hasNearbyWindow(grid, x, y, z, radius = 2) {
  const limit = Math.max(0, Number(radius) || 0);
  for (let dx = -limit; dx <= limit; dx += 1) {
    for (let dz = -limit; dz <= limit; dz += 1) {
      if (Math.abs(dx) + Math.abs(dz) > limit) continue;
      if (grid.get(keyFor(x + dx, y, z + dz))?.module === 'windows') return true;
    }
  }
  return false;
}

function reliefBlockForStyle(family, materials = {}) {
  if (materials.wall_detail) return materials.wall_detail;
  if (family === 'modern' || family === 'futuristic') return 'minecraft:smooth_quartz_slab[type=bottom]';
  if (family === 'industrial') return 'minecraft:polished_deepslate_slab[type=bottom]';
  if (family === 'cyberpunk') return materials.neon || materials.facade_light || 'minecraft:sea_lantern';
  if (family === 'desert' || family === 'mediterranean') return 'minecraft:cut_sandstone';
  if (family === 'gothic') return 'minecraft:chiseled_stone_bricks';
  return materials.accent || materials.trim || 'minecraft:quartz_bricks';
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
