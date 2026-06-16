const DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

export class CSGBuilder {
  constructor(buildSpec, materials) {
    this.spec = buildSpec;
    this.materials = materials;
  }

  generateShell(architectureJson) {
    const volumeBoxes = this.resolveVolumes(architectureJson.volumes || []);
    const solid = this.buildSolid(volumeBoxes);
    const grid = new Map();

    for (const pointKey of solid) {
      const point = parseKey(pointKey);
      if (!isSurfaceCell(solid, point)) continue;
      const meta = this.metaForPoint(point, volumeBoxes);
      grid.set(pointKey, cell(this.materials.wall || 'minecraft:smooth_sandstone', meta.module || 'walls'));
    }

    this.addFloorsAndFoundations(grid, volumeBoxes);
    this.addRoofs(grid, volumeBoxes, architectureJson.roof_rules || {});
    this.addWindows(grid, volumeBoxes, architectureJson.facade_rules || {});
    this.addSite(grid, architectureJson.site_rules || {});

    return {
      grid,
      solid,
      volumeBoxes,
      bounds: computeBounds(grid),
      interiorSpaces: this.interiorSpaces(volumeBoxes),
      csg: {
        volumeCount: volumeBoxes.length,
        solidCellCount: solid.size,
        surfaceCellCount: [...solid].filter((keyValue) => isSurfaceCell(solid, parseKey(keyValue))).length,
        philosophy: architectureJson.philosophy || '先造壳，后填瓤。'
      }
    };
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
        boolean_mode: 'union'
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
    const boxWidth = clampInt(Math.round(width * scale[0]), 4, Math.max(4, Math.floor(width / 2)));
    const boxDepth = clampInt(Math.round(depth * scale[2]), 4, Math.max(4, depth));
    const boxHeight = clampInt(Math.round(wallHeight * scale[1]), Math.max(4, this.spec.floor_height), Math.max(4, wallHeight + 4));
    const relation = String(volume.placement?.relation || volume.id || '').toLowerCase();
    let minX = Math.floor(width / 2) - Math.floor(boxWidth / 2);
    let minZ = depth;
    let side = 'front';

    if (relation.includes('west') || relation.includes('西')) {
      minX = -boxWidth;
      minZ = clampInt(Math.round(depth * 0.2), 1, Math.max(1, depth - boxDepth - 1));
      side = 'west';
    } else if (relation.includes('east') || relation.includes('东')) {
      minX = width;
      minZ = clampInt(Math.round(depth * (relation.includes('rear') ? 0.12 : 0.2)), 1, Math.max(1, depth - boxDepth - 1));
      side = 'east';
    } else if (relation.includes('north') || relation.includes('rear') || relation.includes('北')) {
      minZ = -boxDepth;
      side = 'rear';
    }

    const module = moduleForVolume(volume);
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
      boolean_mode: String(volume.boolean_mode || 'union')
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

  addFloorsAndFoundations(grid, boxes) {
    for (const box of boxes) {
      const module = box.module === 'porch' ? 'porch' : 'foundation';
      fillBox(grid, box.min_x, 0, box.min_z, box.max_x, 0, box.max_z, this.materials.foundation || 'minecraft:stone_bricks', module);
      if (box.module === 'porch') continue;
      for (let level = 0; level < box.floors; level += 1) {
        const y = level * this.spec.floor_height + 1;
        if (y > box.max_y) continue;
        fillBox(grid, box.min_x + 1, y, box.min_z + 1, box.max_x - 1, y, box.max_z - 1, this.materials.floor || 'minecraft:spruce_planks', 'floors');
      }
    }
  }

  addRoofs(grid, boxes, roofRules) {
    const roofStyle = String(roofRules.style || 'gabled');
    const overhang = Number(roofRules.overhang ?? 1);
    for (const box of boxes) {
      if (box.module === 'porch') {
        this.addFlatRoof(grid, box, Math.max(0, overhang), 'porch');
      } else if (roofStyle === 'flat' || box.shape === 'cylinder') {
        this.addFlatRoof(grid, box, Math.max(0, overhang), 'roof');
      } else {
        this.addGabledRoof(grid, box, this.spec.roof_height, overhang);
      }
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

  addWindows(grid, boxes, facadeRules) {
    const wide = Boolean(facadeRules.large_glass);
    const windowWidth = wide ? 4 : 2;
    const windowHeight = wide ? 3 : 2;
    const glass = this.materials.glass || 'minecraft:glass';

    for (const box of boxes) {
      if (box.module === 'porch') continue;
      const xs = windowPositions(box.min_x, box.max_x, windowWidth, 6);
      const zs = windowPositions(box.min_z, box.max_z, windowWidth, 6);
      for (let level = 0; level < box.floors; level += 1) {
        const baseY = level * this.spec.floor_height + 3;
        if (baseY + windowHeight - 1 >= box.max_y) continue;
        for (const x of xs) {
          fillBox(grid, x, baseY, box.min_z, x + windowWidth - 1, baseY + windowHeight - 1, box.min_z, glass, 'windows');
          fillBox(grid, x, baseY, box.max_z, x + windowWidth - 1, baseY + windowHeight - 1, box.max_z, glass, 'windows');
        }
        for (const z of zs) {
          fillBox(grid, box.min_x, baseY, z, box.min_x, baseY + windowHeight - 1, z + windowWidth - 1, glass, 'windows');
          fillBox(grid, box.max_x, baseY, z, box.max_x, baseY + windowHeight - 1, z + windowWidth - 1, glass, 'windows');
        }
      }
    }
  }

  addSite(grid, siteRules) {
    if (!siteRules.formal_garden && !siteRules.water_feature) return;
    const center = Math.floor(this.spec.width / 2);
    fillBox(grid, center - 1, 0, this.spec.depth, center + 1, 0, this.spec.depth + this.spec.garden_depth, this.materials.path || 'minecraft:gravel', 'garden');
    if (siteRules.water_feature) {
      const z = this.spec.depth + Math.max(2, Math.floor(this.spec.garden_depth / 2));
      fillBox(grid, center - 2, 0, z, center + 2, 0, z + 2, 'minecraft:water', 'water_feature');
    }
  }

  interiorSpaces(boxes) {
    const spaces = [];
    for (const box of boxes) {
      if (box.module === 'porch') continue;
      for (let floor = 0; floor < box.floors; floor += 1) {
        spaces.push({
          floor,
          min_x: box.min_x + 1,
          max_x: box.max_x - 1,
          min_y: floor * this.spec.floor_height + 2,
          max_y: Math.min((floor + 1) * this.spec.floor_height, box.max_y),
          min_z: box.min_z + 1,
          max_z: box.max_z - 1,
          source: box.id,
          side: box.side
        });
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

function pointInBox(point, box) {
  return point.x >= box.min_x && point.x <= box.max_x &&
    point.y >= box.min_y && point.y <= box.max_y &&
    point.z >= box.min_z && point.z <= box.max_z;
}

function moduleForVolume(volume) {
  const text = `${volume.id || ''} ${volume.role || ''} ${volume.placement?.relation || ''}`.toLowerCase();
  if (/porch|gate|门廊|门楼/.test(text)) return 'porch';
  if (/wing|侧翼/.test(text)) return 'wing';
  return 'walls';
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

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}
