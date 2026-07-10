import { PATCH_CATEGORIES } from './templateSemanticPatchDataset.js';

export const PATCH_COMPLETER_SOURCE = 'stage6-semantic-patch-completer-v1';

const BLOCKING_OCCUPANCY = new Set(['solid', 'furniture']);

export function completeSemanticVoxelPatch({
  dataset = {},
  category = '',
  context = {},
  constraints = {}
} = {}) {
  const normalizedCategory = normalizeToken(category);
  if (!PATCH_CATEGORIES.includes(normalizedCategory)) {
    return inactiveCompletion(normalizedCategory || category, `unknown category: ${category || 'empty'}`);
  }

  const candidates = (dataset.patches || []).filter((patch) => patch.category === normalizedCategory);
  if (!candidates.length) {
    return inactiveCompletion(normalizedCategory, `no candidate patch for category ${normalizedCategory}`);
  }

  const scored = candidates
    .map((patch) => ({
      patch,
      score: scorePatch(patch, context),
      matched_signals: matchedSignals(patch, context)
    }))
    .sort((a, b) => b.score - a.score || compareString(a.patch.patch_id, b.patch.patch_id));

  const selected = scored[0];
  const repaired = repairSemanticVoxelPatchConflicts({ patch: selected.patch, constraints });
  const warnings = [];
  if (!repaired.semantic_voxels.length) warnings.push('all semantic voxels were removed by repair constraints');

  return {
    source: PATCH_COMPLETER_SOURCE,
    active: true,
    mode: 'retrieval-completion',
    category: normalizedCategory,
    selected_patch_id: selected.patch.patch_id,
    case_id: selected.patch.case_id,
    score: selected.score,
    matched_signals: selected.matched_signals,
    dimensions: selected.patch.dimensions,
    anchor: selected.patch.anchor,
    semantic_voxels: repaired.semantic_voxels,
    repairs: repaired.repairs,
    warnings
  };
}

export function repairSemanticVoxelPatchConflicts({ patch = {}, constraints = {} } = {}) {
  const dimensions = patch.dimensions || {};
  const blockedRoles = new Set((constraints.blocked_roles || []).map((role) => normalizeToken(role)));
  const clearanceBoxes = (constraints.clearance_boxes || []).map(normalizeBox).filter(Boolean);
  const semanticVoxels = [];
  const repairs = [];

  for (const voxel of patch.semantic_voxels || []) {
    if (!insideDimensions(voxel, dimensions)) {
      repairs.push(repairRecord('out-of-bounds', voxel));
      continue;
    }
    if (blockedRoles.has(normalizeToken(voxel.role))) {
      repairs.push(repairRecord('blocked-role', voxel));
      continue;
    }
    if (BLOCKING_OCCUPANCY.has(voxel.occupancy) && clearanceBoxes.some((box) => insideBox(voxel, box))) {
      repairs.push(repairRecord('clearance-collision', voxel));
      continue;
    }
    semanticVoxels.push({ ...voxel });
  }

  return {
    patch_id: patch.patch_id || '',
    semantic_voxels: semanticVoxels,
    repairs
  };
}

function scorePatch(patch = {}, context = {}) {
  const tokens = contextTokens(context);
  const patchTags = new Set((patch.tags || []).map((tag) => normalizeToken(tag)));
  let score = Math.round(averageConfidence(patch.semantic_voxels || []) * 20);

  if (normalizeToken(context.style_family || context.style) === normalizeToken(patch.style_family)) score += 25;
  if (normalizeToken(context.typology) === normalizeToken(patch.typology)) score += 15;

  for (const tag of patchTags) {
    if (tokens.has(tag)) score += 10;
  }
  for (const voxel of patch.semantic_voxels || []) {
    const role = normalizeToken(voxel.role);
    const material = normalizeToken(voxel.material_role);
    if (tokens.has(role) || tokens.has(material)) score += 6;
  }
  if (tokens.has(patch.category)) score += 6;

  return Math.max(0, Math.min(100, score - riskPenalty(patch)));
}

function matchedSignals(patch = {}, context = {}) {
  const tokens = contextTokens(context);
  const signals = [];
  if (normalizeToken(context.style_family || context.style) === normalizeToken(patch.style_family)) {
    signals.push(`style:${patch.style_family}`);
  }
  if (normalizeToken(context.typology) === normalizeToken(patch.typology)) {
    signals.push(`typology:${patch.typology}`);
  }
  for (const tag of patch.tags || []) {
    const normalized = normalizeToken(tag);
    if (tokens.has(normalized)) signals.push(`tag:${normalized}`);
  }
  for (const voxel of patch.semantic_voxels || []) {
    const role = normalizeToken(voxel.role);
    if (tokens.has(role)) signals.push(`role:${role}`);
  }
  return [...new Set(signals)].sort();
}

function contextTokens(context = {}) {
  const values = [
    context.prompt,
    context.style_family,
    context.style,
    context.typology,
    ...(context.tags || [])
  ];
  const tokens = new Set();
  const text = values.join(' ').toLowerCase();
  for (const value of values) {
    for (const token of tokenize(value)) tokens.add(token);
  }
  if (/湖|水|lake|water|waterfront|lakeside/.test(text)) tokens.add('water-edge');
  if (/glass|玻璃|window/.test(text)) tokens.add('large-glass');
  if (/garden|花园/.test(text)) tokens.add('garden');
  if (/courtyard|庭院/.test(text)) tokens.add('courtyard');
  if (/interior|内饰|家具|room|living|bedroom|kitchen/.test(text)) tokens.add('interior');
  if (/roof|屋顶|terrace|露台/.test(text)) {
    tokens.add('roof');
    tokens.add('flat-terrace');
  }
  if (/facade|立面/.test(text)) tokens.add('facade');
  return tokens;
}

function averageConfidence(voxels = []) {
  if (!voxels.length) return 0;
  return voxels.reduce((sum, voxel) => sum + Number(voxel.confidence || 0), 0) / voxels.length;
}

function riskPenalty(patch = {}) {
  const text = (patch.risk_controls || []).join(' ').toLowerCase();
  if (/research-only|do not use|rejected/.test(text)) return 20;
  if (/limited|review/.test(text)) return 8;
  return 0;
}

function inactiveCompletion(category, warning) {
  return {
    source: PATCH_COMPLETER_SOURCE,
    active: false,
    mode: 'inactive',
    category,
    selected_patch_id: '',
    score: 0,
    matched_signals: [],
    semantic_voxels: [],
    repairs: [],
    warnings: [warning]
  };
}

function repairRecord(reason, voxel = {}) {
  return {
    reason,
    role: voxel.role || '',
    occupancy: voxel.occupancy || '',
    x: Number(voxel.x || 0),
    y: Number(voxel.y || 0),
    z: Number(voxel.z || 0)
  };
}

function insideDimensions(voxel = {}, dimensions = {}) {
  const x = Number(voxel.x);
  const y = Number(voxel.y);
  const z = Number(voxel.z);
  return Number.isInteger(x)
    && Number.isInteger(y)
    && Number.isInteger(z)
    && x >= 0
    && y >= 0
    && z >= 0
    && x < Number(dimensions.width || 0)
    && y < Number(dimensions.height || 0)
    && z < Number(dimensions.depth || 0);
}

function normalizeBox(box = {}) {
  const normalized = {
    x: Math.trunc(Number(box.x || 0)),
    y: Math.trunc(Number(box.y || 0)),
    z: Math.trunc(Number(box.z || 0)),
    width: Math.trunc(Number(box.width || 0)),
    height: Math.trunc(Number(box.height || 0)),
    depth: Math.trunc(Number(box.depth || 0))
  };
  if (normalized.width <= 0 || normalized.height <= 0 || normalized.depth <= 0) return null;
  return normalized;
}

function insideBox(voxel = {}, box = {}) {
  const x = Number(voxel.x || 0);
  const y = Number(voxel.y || 0);
  const z = Number(voxel.z || 0);
  return x >= box.x
    && y >= box.y
    && z >= box.z
    && x < box.x + box.width
    && y < box.y + box.height
    && z < box.z + box.depth;
}

function tokenize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replaceAll('_', '-')
    .split(/[^\p{Letter}\p{Number}-]+/gu)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function compareString(left = '', right = '') {
  const a = String(left || '');
  const b = String(right || '');
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
