import { keyFor } from '../engine/csgBuilder.js';

const SOURCE = 'local-interior-clearance-repair-agent';
const VERSION = 1;

export class InteriorClearanceRepairAgent {
  run({ grid, layout = {}, decorator = {} } = {}) {
    const rooms = (layout.rooms || [])
      .filter((room) => room && Number(room.floor || 0) === 0)
      .filter((room) => !['corridor', 'stairs', 'balcony', 'porch'].includes(room.type));
    const placementByKey = placementIndex(decorator.placements || []);
    const removed = [];
    const checked = [];

    for (const room of rooms) {
      const scan = insetRoomHeadroomScan(room);
      const blocked = blockingHeadroomPoints(grid, room, scan, placementByKey);
      const budget = roomBlockingBudget(room, scan);
      checked.push({
        room_id: room.id,
        type: room.type,
        blocked_before: blocked.length,
        budget
      });
      if (blocked.length <= budget) continue;
      const candidates = blocked
        .filter((item) => !protectedModule(item.module))
        .sort((a, b) => removalPriority(a) - removalPriority(b));
      let current = blocked.length;
      for (const item of candidates) {
        if (current <= budget) break;
        grid?.delete(item.key);
        removed.push({
          room_id: room.id,
          type: room.type,
          at: item.point,
          block: item.block,
          module: item.module,
          role: item.placement?.role,
          source: item.placement ? 'decorator-placement' : 'grid-module'
        });
        current -= 1;
      }
      checked[checked.length - 1].blocked_after = current;
    }

    if (removed.length && decorator.placements) {
      const removedKeys = new Set(removed.map((item) => pointKey(item.at.x, item.at.y, item.at.z)));
      decorator.placements = decorator.placements.filter((item) => !removedKeys.has(pointKey(item.at?.x, item.at?.y, item.at?.z)));
      refreshDecoratorProfile(decorator);
    }

    return {
      source: SOURCE,
      version: VERSION,
      active: removed.length > 0,
      reason: removed.length ? 'ground-floor-room-clearance-repaired' : 'ground-floor-room-clearance-ok',
      checked_room_count: checked.length,
      removed_count: removed.length,
      checked,
      removed,
      engine_hints: {
        mutates_grid_before_export: removed.length > 0,
        protects_ground_floor_headroom: true,
        max_blocking_ratio: 0.32
      }
    };
  }
}

export function roomBlockingBudget(room = {}, scan = insetRoomHeadroomScan(room)) {
  const area = Math.max(1, (scan.max_x - scan.min_x + 1) * (scan.max_z - scan.min_z + 1));
  const type = String(room.type || '');
  const ratio = ['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'workshop'].includes(type)
    ? 0.34
    : ['entry', 'sunroom', 'greenhouse'].includes(type)
      ? 0.24
      : 0.30;
  const minimum = ['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'workshop'].includes(type) ? 4 : 3;
  return Math.max(minimum, Math.floor(area * ratio));
}

export function isBlockingHeadroomBlock(block) {
  if (!block) return false;
  const id = String(block || '').split('[')[0];
  return !/_carpet$|_pressure_plate$|_button$|_torch$|_door$|_trapdoor$|_pane$|_candle$|lantern$|potted_|flower_pot$|chain$|ladder$|vine$|moss_carpet$/.test(id);
}

function blockingHeadroomPoints(grid, room, scan, placementByKey) {
  const points = [];
  if (!grid) return points;
  const y = room.min_y;
  for (let x = scan.min_x; x <= scan.max_x; x += 1) {
    for (let z = scan.min_z; z <= scan.max_z; z += 1) {
      const key = keyFor(x, y, z);
      const cell = grid.get(key);
      if (!cell || !isBlockingHeadroomBlock(cell.block)) continue;
      points.push({
        key,
        point: { x, y, z },
        block: cell.block,
        module: cell.module,
        placement: placementByKey.get(key)
      });
    }
  }
  return points;
}

function insetRoomHeadroomScan(room = {}) {
  const width = room.max_x - room.min_x + 1;
  const depth = room.max_z - room.min_z + 1;
  const insetX = width >= 5 ? 1 : 0;
  const insetZ = depth >= 5 ? 1 : 0;
  return {
    min_x: room.min_x + insetX,
    max_x: room.max_x - insetX,
    min_z: room.min_z + insetZ,
    max_z: room.max_z - insetZ
  };
}

function placementIndex(placements = []) {
  const index = new Map();
  for (const item of placements) {
    const at = item.at || {};
    if ([at.x, at.y, at.z].every(Number.isFinite)) index.set(keyFor(at.x, at.y, at.z), item);
  }
  return index;
}

function removalPriority(item = {}) {
  const module = String(item.module || '');
  const role = String(item.placement?.role || '');
  if (!module.startsWith('decor_')) return 0;
  if (/banner|display|accent|detail|plant|rug|mat|runner|floor-zone/.test(role)) return 1;
  if (['decor_detail', 'decor_plant'].includes(module)) return 2;
  if (['decor_storage', 'decor_utility'].includes(module)) return 3;
  if (module === 'decor_furniture') return 4;
  return 5;
}

function protectedModule(module) {
  return ['door', 'stairs', 'windows', 'skylight', 'roof', 'roof_frame', 'structural_frame', 'bracing', 'columns'].includes(String(module || ''));
}

function refreshDecoratorProfile(decorator = {}) {
  const placements = decorator.placements || [];
  decorator.placementCount = placements.length;
  decorator.capability_profile ||= {};
  const profile = decorator.capability_profile;
  profile.decorated_rooms = new Set(placements.map((item) => item.room_id)).size;
  profile.module_layers = [...new Set(placements.map((item) => item.module).filter(Boolean))].sort();
  profile.functional_placement_count = placements.filter((item) => ['decor_furniture', 'decor_storage', 'decor_utility'].includes(item.module)).length;
  profile.template_pattern_placement_count = placements.filter((item) => String(item.role || '').startsWith('template-pattern-')).length;
  profile.template_design_law_placement_count = placements.filter((item) => String(item.role || '').startsWith('design-law-')).length;
  profile.template_experience_placement_count = placements.filter((item) => isExperienceRole(item.role)).length;
  profile.template_interior_scene_placement_count = placements.filter((item) => String(item.role || '').startsWith('template-scene-')).length;
  profile.supports_template_room_patterns = profile.template_pattern_placement_count > 0;
  profile.supports_template_design_laws = profile.template_design_law_placement_count > 0;
  profile.supports_template_room_experience = profile.template_experience_placement_count > 0;
  profile.supports_template_interior_scenes = profile.template_interior_scene_placement_count > 0;
  decorator.stats = placementStats(placements);
}

function placementStats(placements = []) {
  const stats = { byRole: {}, byModule: {}, byRoomType: {}, byAgent: {} };
  for (const item of placements) {
    stats.byRole[item.role] = (stats.byRole[item.role] || 0) + 1;
    stats.byModule[item.module] = (stats.byModule[item.module] || 0) + 1;
    stats.byRoomType[item.type] = (stats.byRoomType[item.type] || 0) + 1;
    if (item.agent_id) stats.byAgent[item.agent_id] = (stats.byAgent[item.agent_id] || 0) + 1;
  }
  return stats;
}

function isExperienceRole(role) {
  const text = String(role || '');
  return text.startsWith('template-') &&
    !text.startsWith('template-pattern-') &&
    !text.startsWith('template-scene-');
}

function pointKey(x, y, z) {
  return `${x},${y},${z}`;
}
