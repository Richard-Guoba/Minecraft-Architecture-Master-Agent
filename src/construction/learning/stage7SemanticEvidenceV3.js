import { targetIntervalForSource } from './stage7GridTransformV3.js';

const NEIGHBOURS = Object.freeze([
  [1, 0, 0], [-1, 0, 0], [0, 1, 0],
  [0, -1, 0], [0, 0, 1], [0, 0, -1]
]);

export function collectStage7SemanticEvidenceV3({ volume, transform, caseId } = {}) {
  if (!volume || typeof volume.blockAt !== 'function') {
    throw new Error('v3 evidence requires a schematic block volume');
  }
  const bounds = transform?.occupied_bounds;
  if (!bounds) throw new Error('v3 evidence requires occupied bounds');
  const outside = exteriorAirMask(volume);
  const voxels = new Map();
  let sourceSampleCount = 0;

  for (let y = bounds.min_y; y <= bounds.max_y; y += 1) {
    for (let z = bounds.min_z; z <= bounds.max_z; z += 1) {
      for (let x = bounds.min_x; x <= bounds.max_x; x += 1) {
        const block = volume.blockAt(x, y, z);
        const flags = classifyEvidence({ volume, outside, block, x, y, z });
        sourceSampleCount += 1;
        const xr = targetIntervalForSource(x - bounds.min_x, transform.occupied_size[0]);
        const yr = targetIntervalForSource(y - bounds.min_y, transform.occupied_size[1]);
        const zr = targetIntervalForSource(z - bounds.min_z, transform.occupied_size[2]);

        for (let ty = yr[0]; ty <= yr[1]; ty += 1) {
          for (let tz = zr[0]; tz <= zr[1]; tz += 1) {
            for (let tx = xr[0]; tx <= xr[1]; tx += 1) {
              const key = `${tx},${ty},${tz}`;
              const voxel = voxels.get(key) || {
                x: tx,
                y: ty,
                z: tz,
                occupancy: 0,
                samples: 0,
                flags: new Map(),
                categories: new Map(),
                evidence_ids: [`source:${caseId}`]
              };
              voxel.samples += 1;
              if (!block.air) voxel.occupancy += 1;
              increment(voxel.categories, block.category || 'other');
              for (const flag of flags) increment(voxel.flags, flag);
              voxels.set(key, voxel);
            }
          }
        }
      }
    }
  }

  return {
    voxels: new Map([...voxels.entries()]
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([key, value]) => [key, {
        ...value,
        flags: sortedKeys(value.flags),
        flag_counts: Object.fromEntries(
          [...value.flags].sort(([left], [right]) => left.localeCompare(right))
        ),
        categories: Object.fromEntries([...value.categories].sort())
      }])),
    sourceSampleCount,
    exteriorAirCount: outside.reduce((sum, value) => sum + value, 0)
  };
}

export function chooseDominantEvidenceLabel(counts = {}, tieOrder = []) {
  let selected = tieOrder.at(-1);
  let best = 0;
  for (const label of tieOrder) {
    const count = Number(counts[label] || 0);
    if (count > best) {
      selected = label;
      best = count;
    }
  }
  return selected;
}

function classifyEvidence({ volume, outside, block, x, y, z }) {
  const name = String(block.name || block.state || '')
    .replace(/^minecraft:/, '')
    .replace(/\[.*$/, '');
  if (block.air) {
    return outside[indexOf(volume, x, y, z)] ? ['outside-air'] : ['interior-air'];
  }
  const flags = ['solid'];
  if (isOutside(volume, outside, x, y + 1, z)) flags.push('exterior-above');
  if (NEIGHBOURS.some(([dx, dy, dz]) => (
    dy === 0 && isOutside(volume, outside, x + dx, y + dy, z + dz)
  ))) flags.push('exterior-side');
  if (/(door|gate)/.test(name)) flags.push('opening-candidate');
  if (/(glass|pane)/.test(name)) flags.push('window-candidate');
  if (/stairs?$/.test(name)) flags.push('stair-candidate');
  if (/(ladder|scaffolding)/.test(name)) flags.push('ladder-candidate');
  if (/slab/.test(name)) flags.push('slab-candidate');
  if (/(fence|fence_gate|cobblestone_wall)/.test(name)) flags.push('fence-candidate');
  if (/(torch|lantern|light|glowstone)/.test(name)) flags.push('light-candidate');
  if (block.category === 'water') flags.push('water');
  if (block.category === 'earth') flags.push('ground');
  if (block.category === 'vegetation') flags.push('vegetation');
  if (/(path|road|pavement)/.test(name)) flags.push('path');
  return [...new Set(flags)].sort();
}

function exteriorAirMask(volume) {
  const count = volume.width * volume.height * volume.length;
  const outside = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const seed = (x, y, z) => {
    const index = indexOf(volume, x, y, z);
    if (outside[index] || !volume.blockAt(x, y, z).air) return;
    outside[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let y = 0; y < volume.height; y += 1) {
    for (let z = 0; z < volume.length; z += 1) {
      seed(0, y, z);
      seed(volume.width - 1, y, z);
    }
  }
  for (let y = 0; y < volume.height; y += 1) {
    for (let x = 0; x < volume.width; x += 1) {
      seed(x, y, 0);
      seed(x, y, volume.length - 1);
    }
  }
  for (let z = 0; z < volume.length; z += 1) {
    for (let x = 0; x < volume.width; x += 1) {
      seed(x, 0, z);
      seed(x, volume.height - 1, z);
    }
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % volume.width;
    const yz = Math.floor(index / volume.width);
    const z = yz % volume.length;
    const y = Math.floor(yz / volume.length);
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inside(volume, nx, ny, nz)) continue;
      const next = indexOf(volume, nx, ny, nz);
      if (!outside[next] && volume.blockAt(nx, ny, nz).air) {
        outside[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }
  return outside;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedKeys(map) {
  return [...map.entries()]
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key]) => key);
}

function compareKeys(left, right) {
  const leftValues = left.split(',').map(Number);
  const rightValues = right.split(',').map(Number);
  return leftValues[2] - rightValues[2]
    || leftValues[1] - rightValues[1]
    || leftValues[0] - rightValues[0];
}

function inside(volume, x, y, z) {
  return x >= 0 && y >= 0 && z >= 0
    && x < volume.width && y < volume.height && z < volume.length;
}

function indexOf(volume, x, y, z) {
  return y * volume.length * volume.width + z * volume.width + x;
}

function isOutside(volume, mask, x, y, z) {
  return !inside(volume, x, y, z) || Boolean(mask[indexOf(volume, x, y, z)]);
}
