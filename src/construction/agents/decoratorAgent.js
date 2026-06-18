import { keyFor } from '../engine/csgBuilder.js';
import { interiorSpecialistCapabilities, specialistAgentsForRoom } from './interiorRoomAgents.js';

export class ConstructionDecoratorAgent {
  run(rooms, materials = {}, context = {}) {
    const grid = context.grid;
    const buildSpec = context.buildSpec || {};
    const architecture = context.architecture || {};
    const styleFamily = architecture.style_family || buildSpec.style_family || 'general';
    const interior = context.interior || {};
    const detailByRoom = new Map((interior.room_details || []).map((detail) => [detail.room_id, detail]));
    const specialistAgents = interiorSpecialistCapabilities();
    const activeSpecialists = [];
    const placements = [];
    const suggestions = [];

    for (const room of rooms || []) {
      const plan = furnishRoom(room, materials, { styleFamily, architecture, buildSpec, roomDetail: detailByRoom.get(room.id), interior });
      if (!plan.blocks.length) continue;
      for (const specialist of plan.specialists || []) {
        activeSpecialists.push({
          ...specialist,
          room_id: room.id,
          room_type: room.type
        });
      }
      suggestions.push({
        room_id: room.id,
        type: room.type,
        local_only: true,
        style_family: styleFamily,
        specialist_agent: plan.specialists?.[0]?.agent_id,
        specialist_agents: (plan.specialists || []).map((specialist) => specialist.agent_id),
        capability_block_count: Math.max(0, ...(plan.specialists || []).map((specialist) => specialist.block_count || 0)),
        blocks: plan.blocks.map(({ at, module, ...item }) => item)
      });

      for (const item of plan.blocks) {
        if (placeBlock(grid, item, room)) placements.push(item);
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
      specialist_agents: specialistAgents,
      activeSpecialists,
      placementCount: placements.length,
      roomCount: suggestions.length,
      stats: placementStats(placements),
      capability_profile: decoratorCapabilityProfile({ placements, suggestions, specialistAgents, activeSpecialists }),
      placements: placements.map(serializablePlacement),
      suggestions
    };
  }
}

function furnishRoom(room, materials, context) {
  const builder = new RoomFurnishingBuilder(room, materials, context);
  if (!builder.usable) return { blocks: [] };
  const circulationRoom = ['corridor', 'stairs'].includes(room.type);

  if (circulationRoom) {
    builder.addCirculation();
  } else {
    builder.addLighting();
    builder.addStyleAccent();
    builder.addInteriorPlanAccent();
    builder.addCreativeDesignAccent();
    builder.addTemplateExperienceLayer();
    builder.addTemplateInteriorSceneLayer();
  }

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
      break;
    default:
      builder.addGenericRoom();
      break;
  }

  builder.addSemanticClauseLayer();
  builder.addTemplatePatternLayer();
  builder.addTemplateDesignLawLayer();
  const specialists = specialistAgentsForRoom(room, context).map((agent) => agent.run(builder));

  return { blocks: builder.blocks, specialists, specialist: specialists[0] };
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
    this.area = this.width * this.depth;
    const compactDecorRoom = !['corridor', 'stairs', 'balcony'].includes(room.type);
    const standardUsable = this.width >= 3 && this.depth >= 3;
    const compactUsable = compactDecorRoom && Math.min(this.width, this.depth) >= 2 && Math.max(this.width, this.depth) >= 4 && this.area >= 8;
    this.usable = (standardUsable || compactUsable) && room.max_y >= room.min_y;
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
    if (this.area <= 24) return;
    if (['bathroom', 'storage', 'utility', 'workshop'].includes(this.room.type)) return;
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
    if (this.area <= 36) return;
    this.add('room-accent', this.roomDetail.accent_block, this.room.max_x - 1, this.floorY, this.centerZ, this.roomDetail.mood || 'room-accent', 'decor_detail');
    if (this.roomDetail.task_light && this.width >= 5 && this.depth >= 5) {
      this.add('task-light', this.roomDetail.task_light, this.room.min_x + 1, this.ceilingY, this.room.max_z - 1, 'task-lighting', 'decor_light');
    }
  }

  addCreativeDesignAccent() {
    if (!this.roomDetail || ['bathroom', 'storage', 'utility', 'garage'].includes(this.room.type)) return;
    const floorAccent = this.roomDetail.floor_accent;
    if (floorAccent && this.area > 18) this.addCarpetPatch(floorAccent, `creative-${this.roomDetail.color_story || 'color'}-rug`);
    if (this.area <= 24) return;
    const display = String(this.roomDetail.display_strategy || '');
    const accent = this.roomDetail.accent_block || this.materials.accent || this.materials.trim || 'minecraft:smooth_quartz';
    if (/corner|niche/.test(display)) {
      this.add('display-niche', accent, this.room.max_x - 1, this.floorY, this.room.max_z - 1, display, 'decor_detail');
    } else if (/shelves|gallery|display/.test(display)) {
      this.add('display-shelf', 'minecraft:bookshelf', this.room.min_x + 1, this.floorY, this.room.max_z - 1, display, 'decor_furniture');
      this.add('display-light', this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials), this.room.min_x + 1, this.ceilingY, this.room.max_z - 1, display, 'decor_light');
    }
    if (['layered', 'playful', 'gallery'].includes(String(this.roomDetail.furniture_density || ''))) {
      this.add('color-candle', 'minecraft:candle', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'creative-color-edge', 'decor_light');
    }
  }

  addTemplateExperienceLayer() {
    const experience = this.roomDetail.template_experience || {};
    if (!experience || experience.role === 'neutral' || experience.active === false) return;
    if (['corridor', 'stairs'].includes(this.room.type)) return;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const accent = this.roomDetail.accent_block || this.materials.accent || this.materials.trim || 'minecraft:smooth_quartz';
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const seat = seatingBlockForSide(this.styleFamily, experience.furniture_facing || experience.view_side || 'south');
    const viewPoint = this.pointOnWall(experience.primary_window_side || experience.view_side || 'south');
    const anchorPoint = this.pointOnWall(experience.anchor_wall || oppositeSide(experience.primary_window_side || 'south'));
    const sidePoint = this.pointOnWall(experience.side_wall || sideClockwise(experience.primary_window_side || 'south'));

    if (experience.role === 'entry-axis') {
      this.addAxisRunner(carpet, experience.furniture_facing || experience.view_side || 'south', 'template-entry-axis-runner');
      this.add('template-arrival-marker', light, viewPoint.x, this.ceilingY, viewPoint.z, 'template-arrival-view-glimpse', 'decor_light');
      return;
    }

    if (experience.role === 'public-view') {
      this.add('template-view-frame-interior', accent, viewPoint.x, this.floorY, viewPoint.z, 'template-view-frame-interior', 'decor_detail');
      this.add('template-view-frame-light', light, viewPoint.x, this.ceilingY, viewPoint.z, 'template-view-frame-interior', 'decor_light');
      this.add('template-view-seat', seat, anchorPoint.x, this.floorY, anchorPoint.z, 'template-view-seat', 'decor_furniture');
      if (this.area > 24) this.add('template-view-rug', carpet, this.centerX, this.floorY, this.centerZ, 'template-public-furniture-faces-view', 'decor_floor');
      if (this.area > 30) this.add('template-view-plant', plantBlock(this.materials), sidePoint.x, this.floorY, sidePoint.z, 'template-view-soft-corner', 'decor_plant');
      return;
    }

    if (experience.role === 'service-band') {
      const workPoint = anchorPoint;
      this.add('template-service-wall', serviceBlockForRoom(this.room.type), workPoint.x, this.floorY, workPoint.z, 'template-service-work-wall', 'decor_utility');
      this.add('template-service-task-light', light, workPoint.x, this.ceilingY, workPoint.z, 'template-service-work-wall', 'decor_light');
      if (this.area > 18) {
        const storagePoint = this.offsetPointAlongWall(experience.anchor_wall || 'west', 1);
        this.add('template-service-storage', 'minecraft:barrel', storagePoint.x, this.floorY, storagePoint.z, 'template-service-kept-off-view-wall', 'decor_storage');
      }
      return;
    }

    if (experience.role === 'quiet-retreat') {
      if (this.room.type === 'study') {
        this.add('template-quiet-desk', 'minecraft:lectern', anchorPoint.x, this.floorY, anchorPoint.z, 'template-quiet-desk-faces-garden', 'decor_furniture');
        this.add('template-quiet-desk-light', light, anchorPoint.x, this.ceilingY, anchorPoint.z, 'template-quiet-desk-faces-garden', 'decor_light');
        this.add('template-library-away-from-view', 'minecraft:bookshelf', sidePoint.x, this.floorY, sidePoint.z, 'template-library-wall-away-from-view', 'decor_furniture');
      } else {
        this.add('template-quiet-window-seat', seat, anchorPoint.x, this.floorY, anchorPoint.z, 'template-quiet-window-seat', 'decor_furniture');
        if (this.area > 22) this.add('template-sleep-privacy-screen', this.materials.railing || 'minecraft:oak_fence', sidePoint.x, this.floorY, sidePoint.z, 'template-bed-away-from-view-glass', 'decor_detail');
      }
    }
  }

  addTemplateInteriorSceneLayer() {
    const scene = this.roomDetail.template_interior_scene || {};
    if (!scene.active || !Array.isArray(scene.components) || !scene.components.length) return;
    if (['corridor', 'stairs'].includes(this.room.type)) return;

    switch (scene.scene_type) {
      case 'view-lounge-scene':
        this.addViewLoungeScene(scene);
        break;
      case 'view-dining-scene':
        this.addViewDiningScene(scene);
        break;
      case 'kitchen-island-scene':
        this.addKitchenIslandScene(scene);
        break;
      case 'sleep-suite-scene':
        this.addSleepSuiteScene(scene);
        break;
      case 'study-reading-scene':
        this.addStudyReadingScene(scene);
        break;
      case 'entry-arrival-scene':
        this.addEntryArrivalScene(scene);
        break;
      case 'bath-spa-scene':
        this.addBathSpaScene(scene);
        break;
      case 'garden-room-scene':
        this.addGardenRoomScene(scene);
        break;
      case 'utility-wall-scene':
        this.addUtilityWallScene(scene);
        break;
      default:
        break;
    }
  }

  addViewLoungeScene(scene) {
    const hints = this.sceneHints(scene);
    const seat = seatingBlockForSide(this.styleFamily, hints.furnitureFacing);
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const focal = this.roomDetail.accent_block || this.materials.accent || 'minecraft:smooth_quartz';
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const anchor = hints.anchorWall;
    const viewWall = hints.primaryWindowSide;
    const sideWall = hints.sideWall;

    this.addSceneItem('template-scene-sofa-primary', seat, this.pointInsideFromWall(anchor, 0), 'scene-lounge-primary-seat-faces-view');
    if (this.area > 34) {
      this.addSceneItem('template-scene-sofa-side', seat, this.pointInsideFromWall(anchor, 0, -2), 'scene-lounge-side-seat-faces-view');
      this.addSceneItem('template-scene-sofa-side', seat, this.pointInsideFromWall(anchor, 0, 2), 'scene-lounge-side-seat-faces-view');
    }
    this.addSceneTable('template-scene-coffee-table', this.pointInsideFromWall(anchor, 2), 'scene-low-center-table');
    this.addSceneItem('template-scene-view-rug', carpet, { x: this.centerX, z: this.centerZ }, 'scene-lounge-floor-frame', 'decor_floor');
    this.addSceneItem('template-scene-focal-wall', focal, this.pointOnWall(viewWall), 'scene-view-wall-response', 'decor_detail');
    this.addSceneItem('template-scene-side-table', tableBaseBlockForStyle(this.styleFamily), this.pointInsideFromWall(anchor, 1, this.width >= 7 ? 2 : 1), 'scene-seat-support-surface');
    this.addSceneItem('template-scene-corner-plant', plantBlock(this.materials), this.pointOnWall(sideWall), 'scene-soft-corner', 'decor_plant');
    if (this.area > 42) this.addSceneItem('template-scene-lounge-pendant', light, { x: this.centerX, z: this.centerZ }, 'scene-lounge-layered-light', 'decor_light', this.ceilingY);
  }

  addViewDiningScene(scene) {
    const hints = this.sceneHints(scene);
    const table = tableBaseBlockForStyle(this.styleFamily);
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const serviceWall = hints.serviceWall;
    const viewWall = hints.primaryWindowSide;

    this.addSceneTable('template-scene-dining-table', { x: this.centerX, z: this.centerZ }, 'scene-dining-table-centers-room', table);
    if (this.area > 34) {
      this.addSceneItem('template-scene-dining-table-leaf', table, { x: this.centerX + 1, z: this.centerZ }, 'scene-dining-table-extension');
      this.addSceneItem('template-scene-dining-table-leaf', table, { x: this.centerX - 1, z: this.centerZ }, 'scene-dining-table-extension');
    }
    this.addSceneItem('template-scene-dining-chair', seatingBlockForSide(this.styleFamily, 'south'), { x: this.centerX, z: this.centerZ - 2 }, 'scene-dining-paired-seat');
    this.addSceneItem('template-scene-dining-chair', seatingBlockForSide(this.styleFamily, 'north'), { x: this.centerX, z: this.centerZ + 2 }, 'scene-dining-paired-seat');
    if (this.width >= 7) {
      this.addSceneItem('template-scene-dining-chair', seatingBlockForSide(this.styleFamily, 'east'), { x: this.centerX - 2, z: this.centerZ }, 'scene-dining-side-seat');
      this.addSceneItem('template-scene-dining-chair', seatingBlockForSide(this.styleFamily, 'west'), { x: this.centerX + 2, z: this.centerZ }, 'scene-dining-side-seat');
    }
    this.addSceneItem('template-scene-dining-pendant', light, { x: this.centerX, z: this.centerZ }, 'scene-pendant-over-table', 'decor_light', this.ceilingY);
    this.addSceneItem('template-scene-dining-sideboard', this.roomDetail.storage_block || 'minecraft:barrel', this.pointOnWall(serviceWall), 'scene-sideboard-on-service-edge', 'decor_storage');
    this.addSceneItem('template-scene-dining-rug', carpet, { x: this.centerX, z: this.centerZ }, 'scene-dining-floor-frame', 'decor_floor');
    this.addSceneItem('template-scene-window-planter', plantBlock(this.materials), this.pointOnWall(viewWall), 'scene-dining-view-softener', 'decor_plant');
  }

  addKitchenIslandScene(scene) {
    const hints = this.sceneHints(scene);
    const serviceWall = hints.anchorWall || hints.serviceWall;
    const islandBlock = this.materials.trim || this.materials.accent || 'minecraft:smooth_quartz';
    const counter = 'minecraft:smooth_quartz_slab[type=bottom]';
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const wallPoints = [-1, 0, 1].map((offset) => this.offsetPointAlongWall(serviceWall, offset));

    this.addSceneItem('template-scene-kitchen-service-wall', 'minecraft:furnace', wallPoints[0], 'scene-kitchen-range-wall', 'decor_utility');
    this.addSceneItem('template-scene-kitchen-prep', 'minecraft:crafting_table', wallPoints[1], 'scene-kitchen-prep-run', 'decor_utility');
    this.addSceneItem('template-scene-pantry-column', 'minecraft:barrel', wallPoints[2], 'scene-kitchen-storage-column', 'decor_storage');
    this.addSceneItem('template-scene-kitchen-sink', 'minecraft:cauldron', this.pointInsideFromWall(serviceWall, 0, 2), 'scene-kitchen-wet-station', 'decor_utility');

    const islandAxisNorthSouth = ['north', 'south'].includes(serviceWall);
    const islandOffsets = this.area > 40 ? [-1, 0, 1] : [0, 1];
    for (const offset of islandOffsets) {
      const point = islandAxisNorthSouth
        ? { x: this.centerX + offset, z: this.centerZ }
        : { x: this.centerX, z: this.centerZ + offset };
      this.addSceneItem('template-scene-kitchen-island', islandBlock, point, 'scene-kitchen-island-between-service-and-public');
      this.addSceneItem('template-scene-kitchen-island-top', counter, point, 'scene-kitchen-island-counter');
    }

    const stoolSide = oppositeSide(serviceWall);
    const stoolPoint = this.pointInsideFromWall(stoolSide, 1);
    this.addSceneItem('template-scene-bar-stool', seatingBlockForSide(this.styleFamily, serviceWall), stoolPoint, 'scene-bar-edge-faces-service-wall');
    if (this.area > 44) this.addSceneItem('template-scene-bar-stool', seatingBlockForSide(this.styleFamily, serviceWall), this.pointInsideFromWall(stoolSide, 1, 2), 'scene-bar-edge-faces-service-wall');
    this.addSceneItem('template-scene-kitchen-task-light', light, { x: this.centerX, z: this.centerZ }, 'scene-island-task-light', 'decor_light', this.ceilingY);
  }

  addSleepSuiteScene(scene) {
    const hints = this.sceneHints(scene);
    const headWall = hints.anchorWall || oppositeSide(hints.primaryWindowSide);
    const sideWall = hints.sideWall;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const accent = this.roomDetail.accent_block || this.materials.accent || 'minecraft:smooth_quartz';

    this.addSceneBed(headWall);
    this.addSceneItem('template-scene-bed-headboard', accent, this.pointOnWall(headWall), 'scene-bed-headboard-wall', 'decor_detail');
    this.addSceneItem('template-scene-bedside', 'minecraft:barrel', this.offsetPointAlongWall(headWall, -2), 'scene-bedside-pair', 'decor_storage');
    this.addSceneItem('template-scene-bedside', 'minecraft:barrel', this.offsetPointAlongWall(headWall, 2), 'scene-bedside-pair', 'decor_storage');
    this.addSceneItem('template-scene-bed-reading-light', light, this.offsetPointAlongWall(headWall, -2), 'scene-bedside-reading-light', 'decor_light', Math.min(this.floorY + 1, this.ceilingY));
    this.addSceneItem('template-scene-bed-reading-light', light, this.offsetPointAlongWall(headWall, 2), 'scene-bedside-reading-light', 'decor_light', Math.min(this.floorY + 1, this.ceilingY));
    this.addSceneItem('template-scene-wardrobe', this.roomDetail.storage_block || 'minecraft:barrel', this.pointOnWall(sideWall), 'scene-wardrobe-side-wall', 'decor_storage');
    this.addSceneItem('template-scene-bedroom-rug', carpet, this.pointInsideFromWall(oppositeSide(headWall), 1), 'scene-soft-rug-at-bed-foot', 'decor_floor');
  }

  addStudyReadingScene(scene) {
    const hints = this.sceneHints(scene);
    const anchor = hints.anchorWall;
    const quietWall = hints.primaryWindowSide;
    const sideWall = hints.sideWall;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);

    this.addSceneItem('template-scene-study-desk', 'minecraft:lectern', this.pointInsideFromWall(anchor, 0), 'scene-desk-anchor-faces-quiet-window');
    this.addSceneItem('template-scene-study-bookcase', 'minecraft:bookshelf', this.pointOnWall(sideWall), 'scene-library-wall-away-from-main-view');
    this.addSceneItem('template-scene-study-bookcase', 'minecraft:bookshelf', this.offsetPointAlongWall(sideWall, 1), 'scene-library-wall-away-from-main-view');
    this.addSceneItem('template-scene-reading-chair', seatingBlockForSide(this.styleFamily, hints.furnitureFacing), this.pointInsideFromWall(quietWall, 1), 'scene-reading-chair-near-quiet-window');
    this.addSceneTable('template-scene-study-side-table', this.pointInsideFromWall(quietWall, 1, 1), 'scene-study-side-table');
    this.addSceneItem('template-scene-study-light', light, this.pointInsideFromWall(anchor, 0), 'scene-desk-task-light', 'decor_light', this.ceilingY);
  }

  addEntryArrivalScene(scene) {
    const hints = this.sceneHints(scene);
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const sideWall = hints.sideWall;
    const anchor = hints.anchorWall;

    this.addAxisRunner(carpet, hints.furnitureFacing, 'template-scene-entry-runner');
    this.addSceneItem('template-scene-entry-bench', seatingBlockForSide(this.styleFamily, hints.furnitureFacing), this.pointOnWall(sideWall), 'scene-entry-bench-edge');
    this.addSceneItem('template-scene-coat-storage', this.roomDetail.storage_block || 'minecraft:barrel', this.pointOnWall(anchor), 'scene-entry-coat-storage', 'decor_storage');
    this.addSceneTable('template-scene-arrival-console', this.pointInsideFromWall(anchor, 1), 'scene-arrival-console');
    this.addSceneItem('template-scene-entry-pendant', light, { x: this.centerX, z: this.centerZ }, 'scene-entry-axis-light', 'decor_light', this.ceilingY);
  }

  addBathSpaScene(scene) {
    const hints = this.sceneHints(scene);
    const wetWall = hints.anchorWall || hints.serviceWall;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);

    this.addSceneItem('template-scene-bath-wet-wall', 'minecraft:cauldron', this.offsetPointAlongWall(wetWall, -1), 'scene-wet-wall-basin', 'decor_utility');
    this.addSceneItem('template-scene-vanity', 'minecraft:smooth_quartz_slab[type=bottom]', this.offsetPointAlongWall(wetWall, 0), 'scene-vanity-counter');
    this.addSceneItem('template-scene-bath-screen', this.materials.railing || 'minecraft:iron_bars', this.pointOnWall(hints.sideWall), 'scene-bath-privacy-screen', 'decor_detail');
    this.addSceneItem('template-scene-bath-mat', 'minecraft:light_blue_carpet', { x: this.centerX, z: this.centerZ }, 'scene-soft-bath-mat', 'decor_floor');
    this.addSceneItem('template-scene-mirror-light', light, this.offsetPointAlongWall(wetWall, 0), 'scene-mirror-task-light', 'decor_light', Math.min(this.floorY + 1, this.ceilingY));
  }

  addGardenRoomScene(scene) {
    const hints = this.sceneHints(scene);
    const viewWall = hints.primaryWindowSide;
    const sideWall = hints.sideWall;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);

    this.addSceneItem('template-scene-planting-edge', 'minecraft:composter', this.offsetPointAlongWall(viewWall, -1), 'scene-planting-edge', 'decor_plant');
    this.addSceneItem('template-scene-planting-edge', plantBlock(this.materials), this.offsetPointAlongWall(viewWall, 1), 'scene-planting-edge', 'decor_plant');
    this.addSceneTable('template-scene-garden-table', { x: this.centerX, z: this.centerZ }, 'scene-low-garden-table', this.styleFamily === 'japanese' ? 'minecraft:bamboo_planks' : tableBaseBlockForStyle(this.styleFamily));
    this.addSceneItem('template-scene-garden-seat', seatingBlockForSide(this.styleFamily, hints.furnitureFacing), this.pointOnWall(sideWall), 'scene-seat-near-green-view');
    this.addSceneItem('template-scene-display-pot', 'minecraft:decorated_pot', this.pointInsideFromWall(sideWall, 1), 'scene-garden-display-pot', 'decor_detail');
    this.addSceneItem('template-scene-garden-light', light, { x: this.centerX, z: this.centerZ }, 'scene-soft-garden-light', 'decor_light', this.ceilingY);
  }

  addUtilityWallScene(scene) {
    const hints = this.sceneHints(scene);
    const wall = hints.anchorWall || hints.serviceWall;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);

    this.addSceneItem('template-scene-utility-bench', 'minecraft:crafting_table', this.offsetPointAlongWall(wall, -1), 'scene-utility-work-bench', 'decor_utility');
    this.addSceneItem('template-scene-utility-storage', 'minecraft:barrel', this.offsetPointAlongWall(wall, 0), 'scene-utility-storage-wall', 'decor_storage');
    this.addSceneItem('template-scene-utility-storage', 'minecraft:chest', this.offsetPointAlongWall(wall, 1), 'scene-utility-storage-wall', 'decor_storage');
    this.addSceneItem('template-scene-utility-task-light', light, this.offsetPointAlongWall(wall, 0), 'scene-utility-task-light', 'decor_light', this.ceilingY);
  }

  sceneHints(scene = {}) {
    const hints = scene.layout_hints || {};
    const experience = this.roomDetail.template_experience || {};
    const viewSide = normalizeSide(hints.view_side || experience.view_side || 'south');
    const primaryWindowSide = normalizeSide(hints.primary_window_side || experience.primary_window_side || viewSide);
    const anchorWall = normalizeSide(hints.anchor_wall || experience.anchor_wall || oppositeSide(primaryWindowSide));
    return {
      viewSide,
      primaryWindowSide,
      anchorWall,
      focalWall: normalizeSide(hints.focal_wall || experience.focal_wall || primaryWindowSide),
      sideWall: normalizeSide(hints.side_wall || experience.side_wall || sideClockwise(primaryWindowSide)),
      serviceWall: normalizeSide(hints.service_wall || anchorWall),
      quietWall: normalizeSide(hints.quiet_wall || oppositeSide(viewSide)),
      furnitureFacing: normalizeSide(hints.furniture_facing || experience.furniture_facing || primaryWindowSide)
    };
  }

  addSceneItem(role, block, point, placement, module = 'decor_furniture', y = this.floorY) {
    if (!point) return;
    this.add(role, block, point.x, y, point.z, placement, module);
  }

  addSceneTable(role, point, placement, baseBlock = tableBaseBlockForStyle(this.styleFamily)) {
    if (!point) return;
    this.add(role, baseBlock, point.x, this.floorY, point.z, placement, 'decor_furniture');
    this.add(`${role}-top`, 'minecraft:oak_pressure_plate', point.x, this.floorY + 1, point.z, placement, 'decor_furniture');
  }

  addSceneBed(headWall) {
    const wall = normalizeSide(headWall);
    const block = bedBlockForStyle(this.styleFamily);
    const head = this.pointInsideFromWall(wall, 0);
    const foot = this.pointInsideFromWall(wall, 1);
    if (!head || !foot) return;
    this.add('template-scene-bed', `${block}[facing=${wall},part=foot]`, foot.x, this.floorY, foot.z, 'scene-bed-foot', 'decor_furniture');
    this.add('template-scene-bed', `${block}[facing=${wall},part=head]`, head.x, this.floorY, head.z, 'scene-bed-head', 'decor_furniture');
  }

  addSemanticClauseLayer() {
    if (['corridor', 'stairs'].includes(this.room.type)) return;
    const clauses = Array.isArray(this.roomDetail.semantic_clauses) ? this.roomDetail.semantic_clauses : [];
    if (!clauses.length) return;
    const budget = clampInt(this.roomDetail.semantic_budget ?? clauses.length, 0, 22, clauses.length);
    for (const clause of clauses.slice(0, budget)) this.applySemanticClause(String(clause.id || clause));
  }

  addTemplatePatternLayer() {
    const guidance = this.roomDetail.template_room_patterns?.guidance || [];
    if (!guidance.length) return;
    const budget = clampInt(this.roomDetail.template_pattern_strength === 'high' ? 4 : 3, 0, 5, 3);
    for (const pattern of guidance.slice(0, budget)) this.applyTemplatePattern(String(pattern.pattern_type || ''), pattern);
  }

  addTemplateDesignLawLayer() {
    const law = this.roomDetail.template_design_law || {};
    if (!law.active || ['corridor', 'stairs'].includes(this.room.type)) return;
    const requiredLayers = new Set(law.required_layers || []);
    const patternTypes = new Set(law.pattern_types || []);
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const accent = this.roomDetail.accent_block || this.materials.accent || this.materials.trim || 'minecraft:smooth_quartz';
    const storage = this.roomDetail.storage_block || this.materials.furniture || 'minecraft:barrel';
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const focalWall = this.roomDetail.template_experience?.focal_wall || this.roomDetail.template_interior_scene?.layout_hints?.focal_wall || 'east';
    const focal = this.pointOnWall(focalWall);
    const budget = this.area >= 42 ? 6 : this.area >= 24 ? 4 : 3;
    let added = 0;
    const addLaw = (role, block, point, placement, module = 'decor_detail', y = this.floorY) => {
      if (!point || added >= budget) return;
      this.add(role, block, point.x, y, point.z, placement, module);
      added += 1;
    };

    if (requiredLayers.has('identity-stack')) {
      addLaw('design-law-focal-wall', accent, focal, 'design-law-room-identity-stack', 'decor_detail');
      addLaw('design-law-task-light', light, focal, 'design-law-room-identity-stack', 'decor_light', this.ceilingY);
    }

    if (patternTypes.has('social_cluster')) {
      addLaw('design-law-social-anchor', carpet, { x: this.centerX, z: this.centerZ }, 'design-law-living-social-core', 'decor_floor');
      addLaw('design-law-support-surface', tableBaseBlockForStyle(this.styleFamily), this.pointInsideFromWall('south', 1), 'design-law-living-social-core', 'decor_furniture');
    }
    if (patternTypes.has('kitchen_work_wall')) {
      addLaw('design-law-work-wall-light', light, this.pointOnWall('north'), 'design-law-kitchen-work-wall', 'decor_light', this.ceilingY);
      addLaw('design-law-service-storage', storage, this.offsetPointAlongWall('north', 2), 'design-law-kitchen-work-wall', 'decor_storage');
    }
    if (patternTypes.has('sleep_niche')) {
      addLaw('design-law-bedside-soft-light', light, this.pointOnWall('south'), 'design-law-bedroom-sleep-niche', 'decor_light', Math.min(this.floorY + 1, this.ceilingY));
      addLaw('design-law-wardrobe-wall', storage, this.pointOnWall('east'), 'design-law-bedroom-sleep-niche', 'decor_storage');
    }
    if (patternTypes.has('library_focus_wall') || patternTypes.has('display_wall')) {
      addLaw('design-law-focus-wall-light', light, focal, 'design-law-study-library-focus', 'decor_light', this.ceilingY);
      addLaw('design-law-display-anchor', patternTypes.has('library_focus_wall') ? 'minecraft:bookshelf' : accent, focal, 'design-law-display-wall', 'decor_detail');
    }
    if (patternTypes.has('wet_wall')) {
      addLaw('design-law-mirror-light', light, this.pointOnWall('north'), 'design-law-bathroom-wet-wall', 'decor_light', Math.min(this.floorY + 1, this.ceilingY));
    }
    if (patternTypes.has('storage_wall') || patternTypes.has('workshop_bench_wall')) {
      addLaw('design-law-inventory-light', light, this.pointOnWall('north'), 'design-law-storage-service-wall', 'decor_light', this.ceilingY);
    }
    if (patternTypes.has('plant_corner')) {
      addLaw('design-law-soft-plant', plantBlock(this.materials), this.pointOnWall('south'), 'design-law-garden-room-edge', 'decor_plant');
    }
    if (patternTypes.has('layered_lighting')) {
      addLaw('design-law-accent-light', light, { x: this.centerX, z: this.centerZ }, 'design-law-layered-lighting', 'decor_light', this.ceilingY);
    }
  }

  applyTemplatePattern(patternType, pattern = {}) {
    const y = this.floorY;
    const ceiling = this.ceilingY;
    const north = this.room.min_z + 1;
    const south = this.room.max_z - 1;
    const west = this.room.min_x + 1;
    const east = this.room.max_x - 1;
    const cx = this.centerX;
    const cz = this.centerZ;
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const seat = seatingBlockForStyle(this.styleFamily);
    const storage = this.roomDetail.storage_block || this.materials.furniture || 'minecraft:barrel';
    const anchor = pattern.anchor?.wall || preferredPatternWall(patternType, this.room);
    const edge = anchorPointForWall(this.room, anchor);

    switch (patternType) {
      case 'kitchen_work_wall':
        this.add('template-pattern-range', 'minecraft:furnace', west, y, north, 'template-work-wall', 'decor_utility');
        this.add('template-pattern-prep', 'minecraft:crafting_table', clampInt(west + 1, west, east, west), y, north, 'template-work-wall', 'decor_utility');
        this.add('template-pattern-pantry', 'minecraft:barrel', clampInt(west + 2, west, east, east), y, north, 'template-work-wall', 'decor_storage');
        this.add('template-pattern-task-light', light, clampInt(west + 1, west, east, cx), ceiling, north, 'template-work-wall', 'decor_light');
        break;
      case 'sleep_niche':
        this.addBed();
        this.add('template-pattern-bedside', 'minecraft:barrel', west, y, south, 'template-sleep-niche', 'decor_storage');
        this.add('template-pattern-reading-light', light, west, Math.min(y + 1, ceiling), south, 'template-sleep-niche', 'decor_light');
        this.add('template-pattern-wardrobe', storage, east, y, north, 'template-sleep-niche', 'decor_storage');
        break;
      case 'library_focus_wall':
        this.add('template-pattern-library', 'minecraft:bookshelf', edge.x, y, edge.z, 'template-library-wall', 'decor_furniture');
        this.add('template-pattern-desk', 'minecraft:lectern', cx, y, anchor === 'north' ? north + 1 : north, 'template-library-wall', 'decor_furniture');
        this.add('template-pattern-reading-light', light, edge.x, ceiling, edge.z, 'template-library-wall', 'decor_light');
        break;
      case 'storage_wall':
        this.add('template-pattern-storage', storage, west, y, north, 'template-storage-wall', 'decor_storage');
        this.add('template-pattern-storage', 'minecraft:chest', clampInt(west + 1, west, east, east), y, north, 'template-storage-wall', 'decor_storage');
        if (this.area > 24) this.add('template-pattern-inventory-light', light, cx, ceiling, cz, 'template-storage-wall', 'decor_light');
        break;
      case 'wet_wall':
        this.add('template-pattern-basin', 'minecraft:cauldron', west, y, north, 'template-wet-wall', 'decor_utility');
        this.add('template-pattern-counter', 'minecraft:smooth_quartz_slab[type=bottom]', clampInt(west + 1, west, east, east), y, north, 'template-wet-wall', 'decor_furniture');
        this.add('template-pattern-mirror-light', light, west, ceiling, north, 'template-wet-wall', 'decor_light');
        break;
      case 'workshop_bench_wall':
        this.add('template-pattern-workbench', 'minecraft:crafting_table', west, y, north, 'template-workbench-wall', 'decor_utility');
        this.add('template-pattern-tool-rack', 'minecraft:smithing_table', clampInt(west + 1, west, east, east), y, north, 'template-workbench-wall', 'decor_utility');
        this.add('template-pattern-parts-storage', 'minecraft:barrel', east, y, south, 'template-workbench-wall', 'decor_storage');
        break;
      case 'display_wall':
        this.add('template-pattern-display', this.roomDetail.accent_block || 'minecraft:decorated_pot', edge.x, y, edge.z, 'template-display-wall', 'decor_detail');
        this.add('template-pattern-display-light', light, edge.x, ceiling, edge.z, 'template-display-wall', 'decor_light');
        break;
      case 'social_cluster':
        this.add('template-pattern-seat', seat, west, y, south, 'template-conversation-cluster', 'decor_furniture');
        if (this.area > 36) this.add('template-pattern-seat', seat, east, y, south, 'template-conversation-cluster', 'decor_furniture');
        this.addTable(cx, y, cz);
        this.add('template-pattern-rug', this.roomDetail.floor_accent || 'minecraft:white_carpet', cx, y, cz, 'template-conversation-cluster', 'decor_floor');
        break;
      case 'layered_lighting':
        this.add('template-pattern-layered-light', light, cx, ceiling, cz, 'template-lighting-layer', 'decor_light');
        if (this.area > 32) this.add('template-pattern-corner-light', light, east, ceiling, north, 'template-lighting-layer', 'decor_light');
        break;
      case 'plant_corner':
        this.add('template-pattern-plant', this.materials.plant || 'minecraft:potted_azalea_bush', east, y, south, 'template-plant-corner', 'decor_plant');
        break;
      case 'circulation_spine':
        this.add('template-pattern-wayfinding-light', light, cx, ceiling, cz, 'template-circulation-spine', 'decor_light');
        this.add('template-pattern-rail-marker', this.materials.railing || 'minecraft:oak_fence', edge.x, y, edge.z, 'template-circulation-spine', 'decor_detail');
        break;
      default:
        break;
    }
  }

  applySemanticClause(id) {
    if (!id || id === 'circulation-restraint' || id === 'universal-clear-circulation' || id.endsWith('clear-aisle')) return;
    const y = this.floorY;
    const y1 = Math.min(this.floorY + 1, this.ceilingY);
    const ceiling = this.ceilingY;
    const north = this.room.min_z + 1;
    const south = this.room.max_z - 1;
    const west = this.room.min_x + 1;
    const east = this.room.max_x - 1;
    const cx = this.centerX;
    const cz = this.centerZ;
    const accent = this.roomDetail.accent_block || this.materials.accent || this.materials.trim || 'minecraft:smooth_quartz';
    const light = this.roomDetail.task_light || lightBlockForStyle(this.styleFamily, this.materials);
    const storage = this.roomDetail.storage_block || this.materials.furniture || 'minecraft:barrel';
    const carpet = this.roomDetail.floor_accent || 'minecraft:white_carpet';
    const seat = seatingBlockForStyle(this.styleFamily);

    if (/threshold|marker|floor-zone|runner|rug|mat|textile|formal-runner|quiet-rug|aisle-runner/.test(id)) {
      this.add('semantic-floor-zone', carpet, cx, y, cz, id, 'decor_floor');
      if (this.area > 42 && !['bathroom', 'storage', 'utility'].includes(this.room.type)) {
        this.add('semantic-floor-zone', carpet, clampInt(cx - 1, west, east, cx), y, cz, id, 'decor_floor');
        this.add('semantic-floor-zone', carpet, clampInt(cx + 1, west, east, cx), y, cz, id, 'decor_floor');
      }
    }

    if (/light|sconce|glow|candle|lantern/.test(id)) {
      this.add('semantic-light', light, cx, ceiling, cz, id, 'decor_light');
      if (this.area > 36) this.add('semantic-task-light', light, east, ceiling, north, id, 'decor_light');
    }

    if (/storage|wardrobe|pantry|archive|sideboard|supply|parts|drop-zone|coat|crate/.test(id)) {
      this.add('semantic-storage', storage, west, y, north, id, 'decor_storage');
      if (this.area > 40) this.add('semantic-secondary-storage', 'minecraft:chest', east, y, south, id, 'decor_storage');
    }

    if (/display|gallery|bookshelf|library|personal|pedestal|tokonoma|ceramic|wall-depth|focal-wall/.test(id)) {
      const displayBlock = /bookshelf|library/.test(id) ? 'minecraft:bookshelf' : /ceramic|pot/.test(id) ? 'minecraft:decorated_pot' : accent;
      this.add('semantic-display', displayBlock, east, y, cz, id, 'decor_detail');
      if (this.area > 36) this.add('semantic-display-light', light, east, ceiling, cz, id, 'decor_light');
    }

    if (/plant|garden-view|indoor-planter|view-response|view-seat|window-view|water-view/.test(id)) {
      const plant = this.materials.plant || 'minecraft:potted_azalea_bush';
      this.add('semantic-plant', blockBase(plant).includes('leaves') ? 'minecraft:potted_azalea_bush' : plant, east, y, south, id, 'decor_plant');
      if (/seat|view/.test(id) && this.area > 30) this.add('semantic-view-seat', seat, west, y, south, id, 'decor_furniture');
    }

    if (/bench|seat|conversation|chair|negative-space|low-horizontality/.test(id)) {
      this.add('semantic-seat', seat, west, y, south, id, 'decor_furniture');
      if (this.area > 48) this.add('semantic-seat', seat, east, y, south, id, 'decor_furniture');
    }

    if (/table|breakfast|prep-counter|counter|workbench|desk|altar|dais/.test(id)) {
      const tableBlock = /desk|altar/.test(id) ? 'minecraft:lectern' : tableBaseBlockForStyle(this.styleFamily);
      this.add('semantic-table', tableBlock, cx, y, clampInt(north + 1, north, south, cz), id, 'decor_furniture');
    }

    if (/work-wall|prep|sink|wet-wall|wet-or-mechanical|utility-counter|service-spine/.test(id)) {
      const utilityBlock = /sink|wet/.test(id) ? 'minecraft:cauldron' : /vent|spine/.test(id) ? 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]' : 'minecraft:crafting_table';
      this.add('semantic-utility', utilityBlock, west, y, north, id, 'decor_utility');
      if (/kitchen|prep|work-wall/.test(id)) this.add('semantic-utility-storage', 'minecraft:barrel', west + 1, y, north, id, 'decor_storage');
    }

    if (/sleep|bedside/.test(id)) {
      this.add('semantic-bedside', 'minecraft:barrel', west, y, south, id, 'decor_storage');
      this.add('semantic-bedside-light', light, west, Math.min(y1, ceiling), south, id, 'decor_light');
    }

    if (/screen|privacy|rail|rack|ironwork|metal|rope|vertical-detail|guard-rail/.test(id)) {
      const block = /iron|metal|rail|rack/.test(id) ? 'minecraft:iron_bars' : this.materials.railing || 'minecraft:oak_fence';
      this.add('semantic-screen-or-rail', block, east, y, cz, id, 'decor_detail');
    }

    if (/banner|art|symmetry|paired|ceremonial|chapel|gothic|classical/.test(id)) {
      this.add('semantic-banner-left', 'minecraft:red_banner', west, y1, cz, id, 'decor_detail');
      if (this.area > 36) this.add('semantic-banner-right', 'minecraft:blue_banner', east, y1, cz, id, 'decor_detail');
    }

    if (/hearth|warm|fire|forge/.test(id)) {
      this.add('semantic-hearth', 'minecraft:campfire[lit=false]', cx, y, north, id, 'decor_detail');
    }

    if (/music|media|cyberpunk/.test(id)) {
      this.add('semantic-media', 'minecraft:jukebox', east, y, north, id, 'decor_detail');
      if (this.styleFamily === 'cyberpunk') this.add('semantic-neon', 'minecraft:sea_lantern', east, ceiling, north, id, 'decor_light');
    }
  }

  addEntry() {
    this.add('bench', seatingBlockForStyle(this.styleFamily), this.room.min_x + 1, this.floorY, this.centerZ, 'entry-bench', 'decor_furniture');
    this.add('storage', 'minecraft:barrel', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'entry-storage', 'decor_storage');
  }

  addLiving() {
    this.addSofa();
    this.addTable(this.centerX, this.floorY, clampInt(this.room.max_z - 3, this.room.min_z, this.room.max_z, this.centerZ));
    this.add('shelf', 'minecraft:bookshelf', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'reading-wall', 'decor_furniture');
    if (['gothic', 'classical', 'rustic', 'nordic'].includes(this.styleFamily)) {
      this.add('hearth', 'minecraft:campfire[lit=false]', this.centerX, this.floorY, this.room.min_z + 1, 'feature-hearth', 'decor_detail');
    }
  }

  addGreatHall() {
    this.addTable(this.centerX, this.floorY, this.centerZ);
    if (this.area > 20) {
      this.add('banner', 'minecraft:red_banner', this.room.min_x + 1, this.floorY, this.centerZ, 'ceremonial-side', 'decor_detail');
      this.add('banner', 'minecraft:blue_banner', this.room.max_x - 1, this.floorY, this.centerZ, 'ceremonial-side', 'decor_detail');
    }
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
    if (this.area <= 24) {
      this.add('reading-lamp', 'minecraft:redstone_lamp', this.centerX, Math.min(this.floorY + 1, this.ceilingY), this.room.min_z + 2, 'compact-study-light', 'decor_light');
      this.add('archive-barrel', 'minecraft:barrel', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'compact-study-storage', 'decor_storage');
      return;
    }
    this.add('books', 'minecraft:bookshelf', this.room.min_x + 2, this.floorY, this.room.max_z - 1, 'book-wall', 'decor_furniture');
  }

  addBathroom() {
    this.add('basin', 'minecraft:cauldron', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'wet-corner', 'decor_utility');
    this.add('counter', 'minecraft:smooth_quartz_slab[type=bottom]', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'wet-wall', 'decor_furniture');
    if (this.area > 18) this.add('mat', 'minecraft:light_blue_carpet', this.centerX, this.floorY, this.centerZ, 'floor-mat', 'decor_floor');
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
    this.add('lookout', 'minecraft:bell', this.room.max_x - 1, this.floorY, this.centerZ, 'lookout-edge', 'decor_detail');
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
    this.add('greenery', 'minecraft:oak_leaves[persistent=true]', this.room.min_x + 1, this.floorY, this.centerZ, 'green-edge', 'decor_plant');
  }

  addCirculation() {
    if (this.width >= 6 || this.depth >= 6) {
      this.add('wayfinding-light', lightBlockForStyle(this.styleFamily, this.materials), this.centerX, this.ceilingY, this.centerZ, 'circulation-light', 'decor_light');
    }
  }

  addGenericRoom() {
    if (this.room.type === 'storage') {
      this.add('vibrant-storage-barrel', 'minecraft:barrel', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'storage-wall', 'decor_storage');
      this.add('storage-chest', 'minecraft:chest', this.room.max_x - 1, this.floorY, this.room.min_z + 1, 'storage-wall', 'decor_storage');
      if (this.area > 18) this.add('inventory-light', lightBlockForStyle(this.styleFamily, this.materials), this.centerX, this.ceilingY, this.centerZ, 'storage-light', 'decor_light');
      return;
    }
    if (this.room.type === 'utility') {
      this.add('utility-counter', 'minecraft:smooth_quartz_slab[type=bottom]', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'utility-counter', 'decor_furniture');
      this.add('utility-workbench', 'minecraft:crafting_table', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'utility-workbench', 'decor_utility');
      this.add('utility-storage', 'minecraft:barrel', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'utility-storage', 'decor_storage');
      return;
    }
    if (this.room.type === 'workshop') {
      this.add('workbench', 'minecraft:crafting_table', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'workbench-wall', 'decor_utility');
      this.add('tool-rack', 'minecraft:smithing_table', this.room.min_x + 2, this.floorY, this.room.min_z + 1, 'tool-wall', 'decor_utility');
      this.add('parts-storage', 'minecraft:barrel', this.room.max_x - 1, this.floorY, this.room.max_z - 1, 'parts-storage', 'decor_storage');
      return;
    }
    this.add('storage', this.roomDetail.storage_block || this.materials.furniture || 'minecraft:bookshelf', this.room.min_x + 1, this.floorY, this.room.min_z + 1, 'general-corner', 'decor_furniture');
  }

  addSofa() {
    const block = seatingBlockForStyle(this.styleFamily);
    const z = this.room.max_z - 1;
    if (this.area <= 24) {
      this.add('seat', block, this.centerX, this.floorY, z, 'seating-edge', 'decor_furniture');
      return;
    }
    for (let x = this.centerX - 1; x <= this.centerX + 1; x += 1) this.add('seat', block, x, this.floorY, z, 'seating-edge', 'decor_furniture');
  }

  addTable(x, y, z) {
    this.add('table-base', tableBaseBlockForStyle(this.styleFamily), x, y, z, 'table-center', 'decor_furniture');
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
    const radiusZ = this.area <= 36 ? 0 : 1;
    const x1 = Math.max(this.room.min_x + 1, this.centerX - 1);
    const x2 = Math.min(this.room.max_x - 1, this.centerX + 1);
    const z1 = Math.max(this.room.min_z + 1, this.centerZ - radiusZ);
    const z2 = Math.min(this.room.max_z - 1, this.centerZ + radiusZ);
    for (let x = x1; x <= x2; x += 1) {
      for (let z = z1; z <= z2; z += 1) this.add('floor-accent', block, x, this.floorY, z, placement, 'decor_floor');
    }
  }

  addAxisRunner(block, side, placement) {
    const length = Math.min(5, Math.max(2, ['north', 'south'].includes(side) ? this.depth - 2 : this.width - 2));
    for (let step = 0; step < length; step += 1) {
      const offset = step - Math.floor(length / 2);
      const x = ['east', 'west'].includes(side) ? clampInt(this.centerX + offset, this.room.min_x + 1, this.room.max_x - 1, this.centerX) : this.centerX;
      const z = ['north', 'south'].includes(side) ? clampInt(this.centerZ + offset, this.room.min_z + 1, this.room.max_z - 1, this.centerZ) : this.centerZ;
      this.add('template-entry-runner', block, x, this.floorY, z, placement, 'decor_floor');
    }
  }

  pointOnWall(side) {
    return anchorPointForWall(this.room, normalizeSide(side));
  }

  offsetPointAlongWall(side, offset = 0) {
    const normalized = normalizeSide(side);
    const point = this.pointOnWall(normalized);
    if (['north', 'south'].includes(normalized)) {
      return { x: clampInt(point.x + offset, this.room.min_x + 1, this.room.max_x - 1, point.x), z: point.z };
    }
    return { x: point.x, z: clampInt(point.z + offset, this.room.min_z + 1, this.room.max_z - 1, point.z) };
  }

  pointInsideFromWall(side, inward = 1, lateral = 0) {
    const normalized = normalizeSide(side);
    const west = this.room.min_x + 1;
    const east = this.room.max_x - 1;
    const north = this.room.min_z + 1;
    const south = this.room.max_z - 1;
    if (normalized === 'north') {
      return {
        x: clampInt(this.centerX + lateral, west, east, this.centerX),
        z: clampInt(north + inward, north, south, north)
      };
    }
    if (normalized === 'south') {
      return {
        x: clampInt(this.centerX + lateral, west, east, this.centerX),
        z: clampInt(south - inward, north, south, south)
      };
    }
    if (normalized === 'west') {
      return {
        x: clampInt(west + inward, west, east, west),
        z: clampInt(this.centerZ + lateral, north, south, this.centerZ)
      };
    }
    return {
      x: clampInt(east - inward, west, east, east),
      z: clampInt(this.centerZ + lateral, north, south, this.centerZ)
    };
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
    return true;
  }

  addWithin(role, block, x, y, z, placement, module, agentId) {
    if (!pointInsideRoom(this.room, x, y, z)) return false;
    if (this.hasPlannedBlockAt(x, y, z)) return false;
    const added = this.add(role, block, x, y, z, placement, module);
    if (added && agentId) this.blocks[this.blocks.length - 1].agent_id = agentId;
    return added;
  }

  hasPlannedBlockAt(x, y, z) {
    return this.blocks.some((item) => item.at.x === x && item.at.y === y && item.at.z === z);
  }
}

function placeBlock(grid, item, room) {
  if (!grid) return true;
  const preferred = preferredDecorPoint(grid, room, item);
  const preferredPoint = normalizePlacementPoint(item, preferred, room);
  if (preferredPoint && writePlacement(grid, item, preferredPoint, room)) {
    item.at = preferredPoint;
    return true;
  }
  const plannedPoint = normalizePlacementPoint(item, item.at, room);
  if (plannedPoint && writePlacement(grid, item, plannedPoint, room)) {
    item.at = plannedPoint;
    return true;
  }
  const fallback = findDecorFallbackPoint(grid, room, item);
  if (!fallback) return false;
  const fallbackPoint = normalizePlacementPoint(item, fallback, room);
  if (!fallbackPoint) return false;
  item.at = fallbackPoint;
  return writePlacement(grid, item, fallbackPoint, room);
}

function writePlacement(grid, item, point, room) {
  if (!point) return false;
  if (!canPlaceDecorAt(grid, item, room, point)) return false;
  const key = keyFor(point.x, point.y, point.z);
  grid.set(key, { block: item.block, module: item.module });
  return true;
}

function preferredDecorPoint(grid, room, item) {
  if (!shouldPreferWallPlacement(item, room)) return undefined;
  if (isWallAdjacentPoint(room, item.at)) return undefined;
  return findDecorFallbackPoint(grid, room, item, { preferWall: true });
}

function findDecorFallbackPoint(grid, room, item, options = {}) {
  if (!room || !item?.at) return undefined;
  const yCandidates = fallbackYLevels(room, item);
  const xCandidates = interiorCoordinates(room.min_x, room.max_x);
  const zCandidates = interiorCoordinates(room.min_z, room.max_z);
  const candidates = [];

  for (const y of yCandidates) {
    for (const x of xCandidates) {
      for (const z of zCandidates) {
        candidates.push({ x, y, z, distance: manhattan(item.at, { x, y, z }) });
      }
    }
  }

  candidates.sort((a, b) => decorCandidateScore(a, room, item, options) - decorCandidateScore(b, room, item, options));
  for (const candidate of candidates) {
    const point = { x: candidate.x, y: candidate.y, z: candidate.z };
    if (!canPlaceDecorAt(grid, item, room, point)) continue;
    return point;
  }
  return undefined;
}

function canPlaceDecorAt(grid, item, room, point) {
  const existing = grid.get(keyFor(point.x, point.y, point.z));
  if (existing && !canOverwrite(existing.module)) return false;
  if (existing && String(existing.module || '').startsWith('decor_')) return false;
  return hasSafeSupport(grid, item, room, point);
}

function normalizePlacementPoint(item, point, room) {
  if (!point) return undefined;
  if (room && item.module === 'decor_floor' && isFullFloorAccent(item.block)) {
    return { ...point, y: room.min_y - 1 };
  }
  return point;
}

function fallbackYLevels(room, item) {
  const y = clampInt(item.at.y, room.min_y, room.max_y);
  if (item.module === 'decor_light' || item.placement?.includes('ceiling')) {
    return uniqueNumbers([y, room.max_y, room.max_y - 1]).filter((value) => value >= room.min_y && value <= room.max_y);
  }
  return uniqueNumbers([y, room.min_y]).filter((value) => value >= room.min_y && value <= room.max_y);
}

function interiorCoordinates(min, max) {
  return range(min, max);
}

function decorCandidateScore(candidate, room, item, options = {}) {
  const edge = edgeDistance(room, candidate);
  const wallBias = options.preferWall || shouldPreferWallPlacement(item, room) ? edge * 100 : edge;
  return wallBias + candidate.distance * 3 + candidate.y;
}

function edgeDistance(room, point) {
  return Math.min(
    Math.abs(point.x - room.min_x),
    Math.abs(point.x - room.max_x),
    Math.abs(point.z - room.min_z),
    Math.abs(point.z - room.max_z)
  );
}

function isWallAdjacentPoint(room, point) {
  if (!room || !point) return false;
  return edgeDistance(room, point) <= 1;
}

function shouldPreferWallPlacement(item, room) {
  if (!room || !item?.at) return false;
  if (item.at.y !== room.min_y) return false;
  if (['corridor', 'stairs'].includes(room.type)) return false;
  if (item.module === 'decor_light' || item.module === 'decor_floor') return false;
  if (/rug|runner|mat|pad|tile|carpet/i.test(`${item.role || ''} ${item.placement || ''}`)) return false;
  if (/table-base|table-top|tea-heart-table|tea-candle|low-table|low-tray/i.test(item.role || '')) return false;
  return ['decor_furniture', 'decor_storage', 'decor_utility', 'decor_detail', 'decor_plant'].includes(item.module);
}

function preferredPatternWall(patternType, room = {}) {
  if (patternType === 'sleep_niche') return 'south';
  if (patternType === 'kitchen_work_wall' || patternType === 'wet_wall' || patternType === 'workshop_bench_wall') return 'north';
  if (patternType === 'library_focus_wall' || patternType === 'display_wall') return room.max_x - room.min_x >= room.max_z - room.min_z ? 'east' : 'south';
  return 'north';
}

function anchorPointForWall(room, wall) {
  const cx = Math.floor((room.min_x + room.max_x) / 2);
  const cz = Math.floor((room.min_z + room.max_z) / 2);
  const west = room.min_x + 1;
  const east = room.max_x - 1;
  const north = room.min_z + 1;
  const south = room.max_z - 1;
  if (wall === 'west') return { x: west, z: cz };
  if (wall === 'east') return { x: east, z: cz };
  if (wall === 'south') return { x: cx, z: south };
  return { x: cx, z: north };
}

function hasSafeSupport(grid, item, room, point) {
  if (!room) return true;
  if (item.module === 'decor_light' && (item.placement?.includes('ceiling') || point.y >= room.max_y - 1)) return true;
  const below = grid.get(keyFor(point.x, point.y - 1, point.z));
  if (point.y <= room.min_y) return !below || canSupportDecoration(below.block, item.block);
  if (!below) return false;
  return canSupportDecoration(below.block, item.block);
}

function canSupportDecoration(supportBlock = '', decorBlock = '') {
  const support = blockBase(supportBlock);
  const decor = blockBase(decorBlock);
  if (!support || support === 'minecraft:air' || support === 'minecraft:water') return false;
  if (support.includes('_fence') || support.endsWith(':chain')) {
    return /lantern|bell|candle/.test(decor);
  }
  if (isNonFullSupport(support)) return false;
  return true;
}

function isNonFullSupport(block) {
  return /_slab$|_stairs$|_carpet$|_pressure_plate$|_trapdoor$|_button$|_pane$|_bars$|lantern$|candle$|flower_pot$|potted_|chain$/.test(block);
}

function isFullFloorAccent(block) {
  const base = blockBase(block);
  return !/_carpet$|_pressure_plate$|_slab$|_trapdoor$/.test(base);
}

function blockBase(block) {
  return String(block || '').split('[')[0];
}

function range(min, max) {
  const values = [];
  for (let value = min; value <= max; value += 1) values.push(value);
  return values;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(Number.isFinite))];
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
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
    'entry_path',
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

function pointInsideRoom(room, x, y, z) {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
    x >= room.min_x && x <= room.max_x &&
    y >= room.min_y && y <= room.max_y &&
    z >= room.min_z && z <= room.max_z;
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

function seatingBlockForSide(styleFamily, side) {
  const block = seatingBlockForStyle(styleFamily);
  if (!block.includes('_stairs[')) return block;
  return block.replace(/facing=(north|south|east|west)/, `facing=${normalizeSide(side)}`);
}

function serviceBlockForRoom(type) {
  if (type === 'kitchen') return 'minecraft:crafting_table';
  if (type === 'bathroom') return 'minecraft:cauldron';
  if (type === 'garage' || type === 'workshop') return 'minecraft:smithing_table';
  return 'minecraft:barrel';
}

function plantBlock(materials = {}) {
  const plant = materials.plant || 'minecraft:potted_azalea_bush';
  return blockBase(plant).includes('leaves') ? 'minecraft:potted_azalea_bush' : plant;
}

function normalizeSide(value) {
  const text = String(value || '').toLowerCase();
  if (/north/.test(text)) return 'north';
  if (/east/.test(text)) return 'east';
  if (/west/.test(text)) return 'west';
  return 'south';
}

function oppositeSide(side) {
  return {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east'
  }[normalizeSide(side)] || 'north';
}

function sideClockwise(side) {
  return {
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north'
  }[normalizeSide(side)] || 'west';
}

function tableBaseBlockForStyle(styleFamily) {
  if (styleFamily === 'modern' || styleFamily === 'classical') return 'minecraft:smooth_quartz';
  if (styleFamily === 'gothic') return 'minecraft:chiseled_stone_bricks';
  if (styleFamily === 'japanese') return 'minecraft:bamboo_planks';
  return 'minecraft:oak_planks';
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
  const byAgent = {};
  for (const item of placements) {
    byRole[item.role] = (byRole[item.role] || 0) + 1;
    byModule[item.module] = (byModule[item.module] || 0) + 1;
    byRoomType[item.type] = (byRoomType[item.type] || 0) + 1;
    if (item.agent_id) byAgent[item.agent_id] = (byAgent[item.agent_id] || 0) + 1;
  }
  return { byRole, byModule, byRoomType, byAgent };
}

function decoratorCapabilityProfile({ placements, suggestions, specialistAgents, activeSpecialists }) {
  const modules = new Set(placements.map((item) => item.module).filter(Boolean));
  const rooms = new Set(placements.map((item) => item.room_id).filter(Boolean));
  const vibrant = placements.filter((item) => String(item.role || '').startsWith('vibrant'));
  const functional = placements.filter((item) => ['decor_furniture', 'decor_storage', 'decor_utility'].includes(item.module));
  const templatePatternPlacements = placements.filter((item) => String(item.role || '').startsWith('template-pattern-'));
  const templateScenePlacements = placements.filter((item) => String(item.role || '').startsWith('template-scene-'));
  const templateDesignLawPlacements = placements.filter((item) => String(item.role || '').startsWith('design-law-'));
  const templateExperiencePlacements = placements.filter((item) =>
    String(item.role || '').startsWith('template-') &&
    !String(item.role || '').startsWith('template-pattern-') &&
    !String(item.role || '').startsWith('template-scene-')
  );
  return {
    registered_specialists: specialistAgents.length,
    active_specialists: new Set(activeSpecialists.map((item) => item.agent_id)).size,
    decorated_rooms: rooms.size,
    suggested_rooms: suggestions.length,
    module_layers: [...modules].sort(),
    functional_placement_count: functional.length,
    vibrant_placement_count: vibrant.length,
    template_pattern_placement_count: templatePatternPlacements.length,
    template_design_law_placement_count: templateDesignLawPlacements.length,
    template_experience_placement_count: templateExperiencePlacements.length,
    template_interior_scene_placement_count: templateScenePlacements.length,
    supports_template_room_patterns: templatePatternPlacements.length > 0,
    supports_template_design_laws: templateDesignLawPlacements.length > 0,
    supports_template_room_experience: templateExperiencePlacements.length > 0,
    supports_template_interior_scenes: templateScenePlacements.length > 0,
    supports_style_specialists: activeSpecialists.some((item) => String(item.agent_id || '').includes('interior-style-agent')),
    supports_room_specialists: activeSpecialists.some((item) => String(item.agent_id || '').includes('decoration-agent'))
  };
}

function serializablePlacement(item) {
  const placement = {
    room_id: item.room_id,
    type: item.type,
    role: item.role,
    block: item.block,
    placement: item.placement,
    module: item.module,
    at: item.at
  };
  if (item.agent_id) placement.agent_id = item.agent_id;
  return placement;
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
