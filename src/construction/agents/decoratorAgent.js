import { keyFor } from '../engine/csgBuilder.js';

export class ConstructionDecoratorAgent {
  run(rooms, materials = {}, context = {}) {
    const grid = context.grid;
    const buildSpec = context.buildSpec || {};
    const architecture = context.architecture || {};
    const styleFamily = architecture.style_family || buildSpec.style_family || 'general';
    const interior = context.interior || {};
    const detailByRoom = new Map((interior.room_details || []).map((detail) => [detail.room_id, detail]));
    const placements = [];
    const suggestions = [];

    for (const room of rooms || []) {
      const plan = furnishRoom(room, materials, { styleFamily, architecture, buildSpec, roomDetail: detailByRoom.get(room.id), interior });
      if (!plan.blocks.length) continue;
      suggestions.push({
        room_id: room.id,
        type: room.type,
        local_only: true,
        style_family: styleFamily,
        blocks: plan.blocks.map(({ at, module, ...item }) => item)
      });

      for (const item of plan.blocks) {
        if (placeBlock(grid, item)) placements.push(item);
      }
    }

    return {
      source: 'local-furnishing-agent',
      enabled: Boolean(grid),
      note: grid
        ? 'DecoratorAgent writes deterministic room-scale furniture and lighting into the voxel grid after circulation.'
        : 'DecoratorAgent generated room-scale furnishing suggestions without mutating a grid.',
      style_family: styleFamily,
      interior_source: interior.source || 'none',
      placementCount: placements.length,
      roomCount: suggestions.length,
      stats: placementStats(placements),
      placements: placements.map(serializablePlacement),
      suggestions
    };
  }
}

function furnishRoom(room, materials, context) {
  const builder = new RoomFurnishingBuilder(room, materials, context);
  if (!builder.usable) return { blocks: [] };

  builder.addLighting();
  builder.addStyleAccent();
  builder.addInteriorPlanAccent();

  switch (room.type) {
    case 'entry':
      builder.addEntry();
      break;
    case 'living':
    case 'lounge':
      builder.addLiving();
      break;
    case 'great_hall':
      builder.addGreatHall();
      break;
    case 'dining':
      builder.addDining();
      break;
    case 'kitchen':
      builder.addKitchen();
      break;
    case 'master_bedroom':
    case 'bedroom':
      builder.addBedroom();
      break;
    case 'study':
      builder.addStudy();
      break;
    case 'bathroom':
      builder.addBathroom();
      break;
    case 'tatami':
      builder.addTatami();
      break;
    case 'tea_room':
      builder.addTeaRoom();
      break;
    case 'tower':
      builder.addTowerRoom();
      break;
    case 'chapel':
      builder.addChapel();
      break;
    case 'armory':
      builder.addArmory();
      break;
    case 'garage':
      builder.addGarage();
      break;
    case 'sunroom':
    case 'greenhouse':
      builder.addSunroom();
      break;
    case 'corridor':
    case 'stairs':
      builder.addCirculation();
      break;
    default:
      builder.addGenericRoom();
      break;
  }

  return { blocks: builder.blocks };
}

class RoomFurnishingBuilder {
  constructor(room, materials, context) {
    this.room = room;
    this.materials = materials;
    this.context = context;
    this.roomDetail = context.roomDetail || {};
    this.blocks = [];
    this.width = room.max_x - room.min_x + 1;
    this.depth = room.max_z - room.min_z + 1;
    this.usable = this.width >= 3 && this.depth >= 3 && room.max_y >= room.min_y;
  }

  get styleFamily() {
    return String(this.context.styleFamily || 'general');
  }

  get floorY() {
    return this.room.min_y;
  }

  get ceilingY() {
    return this.room.max_y;
  }

  get centerX() {
    return Math.floor((this.room.min_x + this.room.max_x) / 2);
  }

  get centerZ() {
    return Math.floor((this.room.min_z + this.room.max_z) / 2);
  }

  addLighting() {
    const light = lightBlockForStyle(this.styleFamily, this.materials);
    this.add('light', light, this.centerX, this.ceilingY, this.centerZ, 'room-center-ceiling', 'decor_light');
    if (this.width >= 10 && this.depth >= 10) {
      this.add('light', light, this.room.min_x + 2, this.ceilingY, this.room.min_z + 2, 'corner-ceiling', 'decor_light');
      this.add('light', light, this.room.max_x - 2, this.ceilingY, this.room.max_z - 2, 'corner-ceiling', 'decor_light');
    }
  }

  addStyleAccent() {
    if (this.styleFamily === 'japanese') {
      this.add('plant', 'minecraft:potted_bamboo', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'quiet-corner', 'decor_plant');
    } else if (this.styleFamily === 'gothic') {
      this.add('ornament', 'minecraft:candle', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'stone-corner', 'decor_detail');
    } else if (this.styleFamily === 'modern') {
      this.add('accent', 'minecraft:white_carpet', this.centerX, this.floorY, this.centerZ, 'minimal-center-rug', 'decor_floor');
    } else if (this.styleFamily === 'desert') {
      this.add('plant', 'minecraft:potted_cactus', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'sunny-corner', 'decor_plant');
    }
  }

  addInteriorPlanAccent() {
    if (!this.roomDetail || !this.roomDetail.accent_block) return;
    if (['corridor', 'stairs'].includes(this.room.type)) return;
    this.add('room-accent', this.roomDetail.accent_block, this.room.max_x - 1, this.floorY, this.centerZ, this.roomDetail.mood || 'room-accent', 'decor_detail');
    if (this.roomDetail.task_light && this.width >= 5 && this.depth >= 5) {
      this.add('task-light', this.roomDetail.task_light, this.room.min_x + 1, this.ceilingY, this.room.max_z - 1, 'task-lighting', 'decor_light');
    }
  }

  addEntry() {
    this.add('bench', seatingBlockForStyle(this.styleFamily), this.room.min_x + 1, this.floorY, this.centerZ, 'entry-bench', 'decor_furniture');
    this.add('storage', 'minecraft:barrel', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'entry-storage', 'decor_storage');
  }

  addLiving() {
    this.addSofa();
    this.addTable(this.centerX, this.floorY, this.centerZ);
    this.add('shelf', 'minecraft:bookshelf', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'reading-wall', 'decor_furniture');
    if (['gothic', 'classical', 'rustic', 'nordic'].includes(this.styleFamily)) {
      this.add('hearth', 'minecraft:campfire[lit=false]', this.centerX, this.floorY, this.room.min_z + 1, 'feature-hearth', 'decor_detail');
    }
  }

  addGreatHall() {
    this.addTable(this.centerX, this.floorY, this.centerZ);
    this.add('banner', 'minecraft:red_banner', this.room.min_x + 1, this.floorY, this.centerZ, 'ceremonial-side', 'decor_detail');
    this.add('banner', 'minecraft:blue_banner', this.room.max_x - 1, this.floorY, this.centerZ, 'ceremonial-side', 'decor_detail');
    this.add('hearth', 'minecraft:campfire[lit=false]', this.centerX, this.floorY, this.room.min_z + 1, 'great-hall-hearth', 'decor_detail');
  }

  addDining() {
    this.addTable(this.centerX, this.floorY, this.centerZ);
    this.add('chair', seatingBlockForStyle(this.styleFamily), this.centerX - 2, this.floorY, this.centerZ, 'dining-seat', 'decor_furniture');
    this.add('chair', seatingBlockForStyle(this.styleFamily), this.centerX + 2, this.floorY, this.centerZ, 'dining-seat', 'decor_furniture');
  }

  addKitchen() {
    this.add('stove', 'minecraft:furnace', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'work-wall', 'decor_utility');
    this.add('prep', 'minecraft:crafting_table', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'work-wall', 'decor_utility');
    this.add('storage', 'minecraft:barrel', this.room.min_x + 3, this.floorY, this.room.min_z + 1, 'work-wall', 'decor_storage');
    this.add('sink', 'minecraft:cauldron', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'service-corner', 'decor_utility');
  }

  addBedroom() {
    this.addBed();
    this.add('nightstand', 'minecraft:barrel', this.room.min_x + 1, this.floorY, this.room.max_z - 1, 'bedside', 'decor_storage');
    this.add('shelf', 'minecraft:bookshelf', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'quiet-wall', 'decor_furniture');
  }

  addStudy() {
    this.add('desk', 'minecraft:lectern', this.centerX, this.floorY, this.room.min_z + 1, 'study-desk', 'decor_furniture');
    this.add('books', 'minecraft:bookshelf', this.room.min_x + 1, this.floorY, this.room.max_z - 1, 'book-wall', 'decor_furniture');
    this.add('books', 'minecraft:bookshelf', this.room.min_x + 2, this.floorY, this.room.max_z - 1, 'book-wall', 'decor_furniture');
  }

  addBathroom() {
    this.add('basin', 'minecraft:cauldron', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'wet-corner', 'decor_utility');
    this.add('counter', 'minecraft:smooth_quartz_slab[type=bottom]', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'wet-wall', 'decor_furniture');
    this.add('mat', 'minecraft:light_blue_carpet', this.centerX, this.floorY, this.centerZ, 'floor-mat', 'decor_floor');
  }

  addTatami() {
    this.addCarpetPatch('minecraft:lime_carpet', 'tatami-mat');
    this.add('low-table', 'minecraft:bamboo_slab[type=bottom]', this.centerX, this.floorY, this.centerZ, 'low-center-table', 'decor_furniture');
    this.add('screen', 'minecraft:bamboo_fence', this.room.max_x - 1, this.floorY, this.centerZ, 'screen-edge', 'decor_detail');
  }

  addTeaRoom() {
    this.addCarpetPatch('minecraft:green_carpet', 'tea-mat');
    this.add('tea-table', 'minecraft:bamboo_slab[type=bottom]', this.centerX, this.floorY, this.centerZ, 'tea-center', 'decor_furniture');
    this.add('plant', 'minecraft:potted_bamboo', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'garden-view-corner', 'decor_plant');
  }

  addTowerRoom() {
    this.add('lookout', 'minecraft:bell', this.centerX, this.floorY, this.centerZ, 'lookout-center', 'decor_detail');
    this.add('map-table', 'minecraft:cartography_table', this.room.min_x + 1, this.floorY, this.room.max_z - 1, 'tower-work-corner', 'decor_furniture');
  }

  addChapel() {
    this.add('lectern', 'minecraft:lectern', this.centerX, this.floorY, this.room.min_z + 1, 'chapel-front', 'decor_furniture');
    this.add('candle', 'minecraft:candle', this.centerX - 1, this.floorY, this.room.min_z + 2, 'chapel-candle', 'decor_light');
    this.add('candle', 'minecraft:candle', this.centerX + 1, this.floorY, this.room.min_z + 2, 'chapel-candle', 'decor_light');
  }

  addArmory() {
    this.add('anvil', 'minecraft:anvil', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'repair-corner', 'decor_utility');
    this.add('smithing', 'minecraft:smithing_table', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'repair-corner', 'decor_utility');
    this.add('storage', 'minecraft:barrel', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'armory-storage', 'decor_storage');
  }

  addGarage() {
    this.add('tool-storage', 'minecraft:barrel', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'garage-wall', 'decor_storage');
    this.add('workbench', 'minecraft:smithing_table', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'garage-wall', 'decor_utility');
    this.add('vehicle-pad', 'minecraft:smooth_stone', this.centerX, this.floorY, this.centerZ, 'vehicle-pad', 'decor_floor');
  }

  addSunroom() {
    this.add('planter', 'minecraft:composter', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'planting-corner', 'decor_plant');
    this.add('plant', 'minecraft:potted_bamboo', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'sunny-corner', 'decor_plant');
    this.add('greenery', 'minecraft:oak_leaves[persistent=true]', this.centerX, this.floorY, this.centerZ, 'green-center', 'decor_plant');
  }

  addCirculation() {
    if (this.width >= 6 || this.depth >= 6) {
      this.add('wayfinding-light', lightBlockForStyle(this.styleFamily, this.materials), this.centerX, this.ceilingY, this.centerZ, 'circulation-light', 'decor_light');
    }
  }

  addGenericRoom() {
    this.add('storage', this.roomDetail.storage_block || this.materials.furniture || 'minecraft:bookshelf', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'general-corner', 'decor_furniture');
  }

  addSofa() {
    const block = seatingBlockForStyle(this.styleFamily);
    const z = this.room.max_z - 1;
    for (let x = this.centerX - 1; x <= this.centerX + 1; x += 1) this.add('seat', block, x, this.floorY, z, 'seating-edge', 'decor_furniture');
  }

  addTable(x, y, z) {
    this.add('table-base', 'minecraft:oak_fence', x, y, z, 'table-center', 'decor_furniture');
    this.add('table-top', 'minecraft:oak_pressure_plate', x, y + 1, z, 'table-center', 'decor_furniture');
  }

  addBed() {
    const block = bedBlockForStyle(this.styleFamily);
    const x = this.room.min_x + 1;
    if (this.room.min_z + 2 <= this.room.max_z) {
      this.add('bed', `${block}[facing=south,part=foot]`, x, this.floorY, this.room.min_z + 1, 'sleeping-corner', 'decor_furniture');
      this.add('bed', `${block}[facing=south,part=head]`, x, this.floorY, this.room.min_z + 2, 'sleeping-corner', 'decor_furniture');
    }
  }

  addCarpetPatch(block, placement) {
    const x1 = Math.max(this.room.min_x + 1, this.centerX - 1);
    const x2 = Math.min(this.room.max_x - 1, this.centerX + 1);
    const z1 = Math.max(this.room.min_z + 1, this.centerZ - 1);
    const z2 = Math.min(this.room.max_z - 1, this.centerZ + 1);
    for (let x = x1; x <= x2; x += 1) {
      for (let z = z1; z <= z2; z += 1) this.add('floor-accent', block, x, this.floorY, z, placement, 'decor_floor');
    }
  }

  add(role, block, x, y, z, placement, module) {
    const point = clampPointToRoom(this.room, x, y, z);
    if (!point) return;
    this.blocks.push({
      room_id: this.room.id,
      type: this.room.type,
      role,
      block,
      placement,
      module,
      at: point
    });
  }
}

function placeBlock(grid, item) {
  if (!grid) return true;
  const key = keyFor(item.at.x, item.at.y, item.at.z);
  const existing = grid.get(key);
  if (existing && !canOverwrite(existing.module)) return false;
  grid.set(key, { block: item.block, module: item.module });
  return true;
}

function canOverwrite(module) {
  return ![
    'roof',
    'roof_detail',
    'roof_frame',
    'door',
    'stairs',
    'interior',
    'buttress',
    'columns',
    'arches',
    'windows',
    'structural_frame',
    'bracing',
    'retaining_wall',
    'foundation_anchor'
  ].includes(module);
}

function clampPointToRoom(room, x, y, z) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  const point = {
    x: clampInt(x, room.min_x, room.max_x),
    y: clampInt(y, room.min_y, room.max_y),
    z: clampInt(z, room.min_z, room.max_z)
  };
  return point;
}

function lightBlockForStyle(styleFamily, materials) {
  if (materials.lamp) return materials.lamp;
  if (styleFamily === 'modern' || styleFamily === 'futuristic') return 'minecraft:sea_lantern';
  if (styleFamily === 'gothic') return 'minecraft:soul_lantern';
  if (styleFamily === 'rustic' || styleFamily === 'nordic') return 'minecraft:lantern';
  return 'minecraft:glowstone';
}

function seatingBlockForStyle(styleFamily) {
  if (styleFamily === 'modern') return 'minecraft:smooth_quartz_stairs[facing=north,half=bottom]';
  if (styleFamily === 'japanese') return 'minecraft:bamboo_slab[type=bottom]';
  if (styleFamily === 'gothic') return 'minecraft:stone_brick_stairs[facing=north,half=bottom]';
  return 'minecraft:spruce_stairs[facing=north,half=bottom]';
}

function bedBlockForStyle(styleFamily) {
  if (styleFamily === 'modern') return 'minecraft:white_bed';
  if (styleFamily === 'gothic') return 'minecraft:black_bed';
  if (styleFamily === 'japanese') return 'minecraft:green_bed';
  return 'minecraft:red_bed';
}

function placementStats(placements) {
  const byRole = {};
  const byModule = {};
  const byRoomType = {};
  for (const item of placements) {
    byRole[item.role] = (byRole[item.role] || 0) + 1;
    byModule[item.module] = (byModule[item.module] || 0) + 1;
    byRoomType[item.type] = (byRoomType[item.type] || 0) + 1;
  }
  return { byRole, byModule, byRoomType };
}

function serializablePlacement(item) {
  return {
    room_id: item.room_id,
    type: item.type,
    role: item.role,
    block: item.block,
    placement: item.placement,
    module: item.module,
    at: item.at
  };
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
