const EVALUATION_VERSION = 2;

const DECORATION_STYLE_AGENT_HINTS = {
  modern: 'modern',
  industrial: 'modern',
  futuristic: 'modern',
  japanese: 'japanese',
  gothic: 'gothic',
  cyberpunk: 'cyberpunk',
  alpine: 'alpine',
  rustic: 'alpine',
  nordic: 'alpine',
  coastal: 'coastal',
  subterranean: 'subterranean',
  treehouse: 'treehouse',
  desert: 'desert',
  mediterranean: 'desert',
  'chinese-courtyard': 'chinese-courtyard',
  classical: 'classical',
  'greenhouse-house': 'greenhouse'
};

const DECORATION_ROOM_ROLE_TOKENS = {
  entry: ['entry', 'bench', 'storage', 'bell', 'runner', 'coat'],
  living: ['seat', 'sofa', 'table', 'rug', 'media', 'book', 'plant', 'hearth'],
  lounge: ['seat', 'sofa', 'table', 'rug', 'media', 'book', 'plant'],
  great_hall: ['table', 'banner', 'hearth', 'light', 'seat'],
  dining: ['table', 'chair', 'seat', 'candle', 'sideboard', 'runner'],
  kitchen: ['stove', 'smoker', 'furnace', 'prep', 'sink', 'basin', 'counter', 'storage', 'pantry'],
  bedroom: ['bed', 'wardrobe', 'dresser', 'nightstand', 'rug', 'chest', 'candle'],
  master_bedroom: ['bed', 'wardrobe', 'dresser', 'nightstand', 'rug', 'chest', 'candle'],
  study: ['desk', 'lectern', 'book', 'library', 'cartography', 'archive', 'lamp', 'chair'],
  bathroom: ['basin', 'vanity', 'mat', 'storage', 'shower', 'linen', 'counter'],
  utility: ['storage', 'work', 'utility', 'counter'],
  storage: ['storage', 'barrel', 'chest'],
  garage: ['tool', 'workbench', 'storage', 'vehicle', 'smithing'],
  workshop: ['work', 'bench', 'tool', 'storage'],
  tatami: ['tatami', 'low', 'screen', 'bamboo', 'lantern'],
  tea_room: ['tea', 'table', 'candle', 'storage', 'plant'],
  sunroom: ['plant', 'green', 'planter', 'composter', 'moss'],
  greenhouse: ['plant', 'green', 'planter', 'composter', 'moss'],
  tower: ['lookout', 'map', 'cartography', 'bell'],
  chapel: ['lectern', 'candle', 'banner', 'carpet'],
  armory: ['anvil', 'smithing', 'storage', 'grindstone'],
  room: ['storage', 'light', 'accent']
};

const CRITERIA = [
  criterion('input.prompt.present', 'Input', 'Prompt is present and descriptive', 1, (ctx) => text(ctx.result.prompt).length >= 8, (ctx) => text(ctx.result.prompt).length),
  criterion('input.seed.present', 'Input', 'Seed is recorded for reproducibility', 1, (ctx) => Number.isInteger(ctx.result.seed ?? ctx.blueprint.seed), (ctx) => ctx.result.seed ?? ctx.blueprint.seed),
  criterion('input.workflow.current', 'Input', 'Uses construction_method_v1', 1, (ctx) => ctx.result.workflow === 'construction_method_v1' || ctx.blueprint.workflow === 'construction_method_v1', (ctx) => ctx.result.workflow || ctx.blueprint.workflow),

  criterion('spec.dimensions.positive', 'Build Spec', 'Width and depth are positive', 1, (ctx) => number(ctx.spec.width) > 0 && number(ctx.spec.depth) > 0, (ctx) => `${ctx.spec.width}x${ctx.spec.depth}`),
  criterion('spec.dimensions.within-limit', 'Build Spec', 'Footprint stays inside configured limits', 2, (ctx) => number(ctx.spec.width) <= number(ctx.spec.constraints?.max_width, 80) && number(ctx.spec.depth) <= number(ctx.spec.constraints?.max_depth, 80), (ctx) => `${ctx.spec.width}x${ctx.spec.depth}`),
  criterion('spec.floors.range', 'Build Spec', 'Floor count is supported', 2, (ctx) => between(number(ctx.spec.floors), 1, number(ctx.spec.constraints?.max_floors, 5)), (ctx) => ctx.spec.floors),
  criterion('spec.height.limit', 'Build Spec', 'Total height stays under Minecraft-friendly limit', 2, (ctx) => number(ctx.spec.total_height) <= number(ctx.spec.constraints?.max_total_height, 40), (ctx) => ctx.spec.total_height),
  criterion('spec.shell.thickness', 'Build Spec', 'Shell thickness is valid', 1, (ctx) => between(number(ctx.spec.shell_thickness), 1, 3), (ctx) => ctx.spec.shell_thickness),
  criterion('spec.door.side', 'Build Spec', 'Door side is normalized', 1, (ctx) => ['north', 'south', 'east', 'west'].includes(text(ctx.spec.door_side)), (ctx) => ctx.spec.door_side),

  criterion('architecture.source', 'Architecture', 'Architecture agent output exists', 1, (ctx) => Boolean(ctx.architecture.source), (ctx) => ctx.architecture.source),
  criterion('architecture.style', 'Architecture', 'Style and style family are recorded', 1, (ctx) => Boolean(ctx.architecture.style && ctx.architecture.style_family), (ctx) => `${ctx.architecture.style}/${ctx.architecture.style_family}`),
  criterion('architecture.volumes.count', 'Architecture', 'At least one semantic volume is present', 2, (ctx) => array(ctx.architecture.volumes).length > 0, (ctx) => array(ctx.architecture.volumes).length),
  criterion('architecture.volumes.relative', 'Architecture', 'Volumes avoid absolute XYZ coordinates', 2, (ctx) => array(ctx.architecture.volumes).every((volume) => !('x' in volume) && !('y' in volume) && !('z' in volume)), (ctx) => array(ctx.architecture.volumes).length),
  criterion('architecture.materials.roles', 'Architecture', 'Architecture has a useful material map', 2, (ctx) => Object.keys(ctx.architecture.materials || {}).length >= 6, (ctx) => Object.keys(ctx.architecture.materials || {}).length),
  criterion('architecture.preferred-modules', 'Architecture', 'Preferred module list is recorded', 1, (ctx) => array(ctx.spec.modules?.preferred).length >= 4, (ctx) => array(ctx.spec.modules?.preferred).join(', ')),

  criterion('palette.source', 'Materials', 'MaterialPaletteAgent output exists', 1, (ctx) => ctx.blueprint.materialPalette?.source === 'local-material-palette', (ctx) => ctx.blueprint.materialPalette?.source),
  criterion('palette.valid', 'Materials', 'Selected palette blocks are valid', 3, (ctx) => ctx.blueprint.materialPalette?.valid !== false, (ctx) => array(ctx.blueprint.materialPalette?.warnings).join('; ')),
  criterion('palette.catalog.size', 'Materials', 'Minecraft 1.21.1 catalog is available', 2, (ctx) => number(ctx.blueprint.materialPalette?.block_catalog?.blockCount) >= 1000, (ctx) => ctx.blueprint.materialPalette?.block_catalog?.blockCount),
  criterion('palette.options.catalog', 'Materials', 'Full material option catalog is exposed', 2, (ctx) => number(ctx.blueprint.materialPalette?.controllableBlockCount) >= 1000, (ctx) => ctx.blueprint.materialPalette?.controllableBlockCount),
  criterion('palette.roles.broad', 'Materials', 'Role material options cover many roles', 1, (ctx) => array(ctx.blueprint.materialPalette?.option_roles).length >= 10, (ctx) => array(ctx.blueprint.materialPalette?.option_roles).length),

  criterion('structure.source', 'Structure', 'StructureAgent output exists', 1, (ctx) => ctx.blueprint.structure?.source === 'fallback-structure', (ctx) => ctx.blueprint.structure?.source),
  criterion('structure.foundation', 'Structure', 'Foundation strategy is present', 1, (ctx) => Boolean(ctx.blueprint.structure?.foundation?.strategy), (ctx) => ctx.blueprint.structure?.foundation?.strategy),
  criterion('structure.supports', 'Structure', 'Support elements are present', 2, (ctx) => array(ctx.blueprint.structure?.support_elements).length > 0, (ctx) => array(ctx.blueprint.structure?.support_elements).length),
  criterion('structure.load-paths', 'Structure', 'Load paths are described', 2, (ctx) => array(ctx.blueprint.structure?.load_paths).length > 0, (ctx) => array(ctx.blueprint.structure?.load_paths).length),
  criterion('structure.geometry-summary', 'Structure', 'Geometry structure summary matches agent output', 1, (ctx) => number(ctx.geometry.structure?.supportElementCount) === array(ctx.blueprint.structure?.support_elements).length, (ctx) => `${ctx.geometry.structure?.supportElementCount}/${array(ctx.blueprint.structure?.support_elements).length}`),

  criterion('surface.facade.source', 'Surface', 'FacadeAgent output exists', 1, (ctx) => ctx.blueprint.facade?.source === 'local-facade-agent', (ctx) => ctx.blueprint.facade?.source),
  criterion('surface.facade.elements', 'Surface', 'Facade has buildable elements', 2, (ctx) => array(ctx.blueprint.facade?.facade_elements).length > 0, (ctx) => array(ctx.blueprint.facade?.facade_elements).length),
  criterion('surface.roof.source', 'Surface', 'RoofAgent output exists', 1, (ctx) => ctx.blueprint.roof?.source === 'local-roof-agent', (ctx) => ctx.blueprint.roof?.source),
  criterion('surface.roof.style', 'Surface', 'Roof style is selected', 1, (ctx) => Boolean(ctx.blueprint.roof?.style || ctx.geometry.roof?.style), (ctx) => ctx.blueprint.roof?.style || ctx.geometry.roof?.style),
  criterion('surface.site.source', 'Surface', 'SiteLandscapeAgent output exists', 1, (ctx) => ctx.blueprint.site?.source === 'local-site-landscape-agent', (ctx) => ctx.blueprint.site?.source),
  criterion('surface.site.zones', 'Surface', 'Site plan has zones', 1, (ctx) => array(ctx.blueprint.site?.zones).length > 0, (ctx) => array(ctx.blueprint.site?.zones).length),
  criterion('surface.opening.source', 'Surface', 'OpeningConnectivityAgent output exists', 1, (ctx) => ctx.blueprint.opening?.source === 'local-opening-connectivity-agent', (ctx) => ctx.blueprint.opening?.source),

  criterion('topology.nodes.count', 'Topology', 'Planner produced room nodes', 2, (ctx) => array(ctx.topology.nodes).length >= 3, (ctx) => array(ctx.topology.nodes).length),
  criterion('topology.nodes.unique', 'Topology', 'Planner node IDs are unique', 3, (ctx) => uniqueCount(array(ctx.topology.nodes).map((node) => node.id)) === array(ctx.topology.nodes).length, (ctx) => duplicateValues(array(ctx.topology.nodes).map((node) => node.id)).join(', ')),
  criterion('topology.edges.count', 'Topology', 'Planner produced circulation edges', 2, (ctx) => array(ctx.topology.edges).length > 0, (ctx) => array(ctx.topology.edges).length),
  criterion('topology.floor-program', 'Topology', 'Floor program covers all floors', 2, (ctx) => array(ctx.topology.floor_program).length === number(ctx.spec.floors), (ctx) => `${array(ctx.topology.floor_program).length}/${ctx.spec.floors}`),
  criterion('topology.no-coordinates', 'Topology', 'Planner nodes avoid absolute coordinates', 2, (ctx) => array(ctx.topology.nodes).every((node) => !('x' in node) && !('y' in node) && !('z' in node)), (ctx) => array(ctx.topology.nodes).length),

  criterion('layout.rooms.count', 'Layout', 'BSP generated rooms', 2, (ctx) => array(ctx.layout.rooms).length >= Math.min(3, array(ctx.topology.nodes).length), (ctx) => array(ctx.layout.rooms).length),
  criterion('layout.rooms.unique', 'Layout', 'BSP room IDs are unique', 3, (ctx) => uniqueCount(array(ctx.layout.rooms).map((room) => room.id)) === array(ctx.layout.rooms).length, (ctx) => duplicateValues(array(ctx.layout.rooms).map((room) => room.id)).join(', ')),
  criterion('layout.rooms.valid-bounds', 'Layout', 'Room bounds are valid', 3, (ctx) => array(ctx.layout.rooms).every(validRoomBounds), (ctx) => array(ctx.layout.rooms).length),
  criterion('layout.doors.count', 'Layout', 'Interior doors or soft thresholds exist', 2, (ctx) => array(ctx.layout.interiorDoors).length > 0, (ctx) => array(ctx.layout.interiorDoors).length),
  criterion('layout.bsp.summary', 'Layout', 'BSP summary matches room count', 1, (ctx) => number(ctx.geometry.bsp?.roomCount) === array(ctx.layout.rooms).length, (ctx) => `${ctx.geometry.bsp?.roomCount}/${array(ctx.layout.rooms).length}`),

  criterion('circulation.main-door', 'Circulation', 'Main door is carved', 3, (ctx) => Boolean(ctx.blueprint.paths?.mainDoor), (ctx) => ctx.blueprint.paths?.mainDoor?.side),
  criterion('circulation.failed-edges', 'Circulation', 'A* has no failed topology edges', 3, (ctx) => number(ctx.geometry.pathfinder?.failedEdgeCount) === 0, (ctx) => ctx.geometry.pathfinder?.failedEdgeCount),
  criterion('circulation.routed-edges', 'Circulation', 'A* routed at least one edge', 2, (ctx) => number(ctx.geometry.pathfinder?.routedEdgeCount) > 0, (ctx) => ctx.geometry.pathfinder?.routedEdgeCount),
  criterion('circulation.reachability', 'Circulation', 'Most rooms are reachable from entry', 3, (ctx) => number(ctx.validation.stats?.circulation?.reachableRoomCount) >= Math.ceil(array(ctx.layout.rooms).length * 0.75), (ctx) => `${ctx.validation.stats?.circulation?.reachableRoomCount}/${array(ctx.layout.rooms).length}`),
  criterion('circulation.stairs-if-needed', 'Circulation', 'Multi-floor builds include stairs', 3, (ctx) => number(ctx.spec.floors) <= 1 || array(ctx.blueprint.paths?.stairs).length > 0, (ctx) => array(ctx.blueprint.paths?.stairs).length),
  criterion('circulation.floor-openings', 'Circulation', 'Floor openings support vertical travel', 2, (ctx) => number(ctx.spec.floors) <= 1 || array(ctx.layout.floorOpenings).length >= number(ctx.spec.floors) - 1, (ctx) => array(ctx.layout.floorOpenings).length),

  criterion('habitation.entry.exists', 'Habitation', 'Human-scale main entry exists', 4, (ctx) => habitationProfile(ctx).hasMainDoor, (ctx) => habitationProfile(ctx).entrySummary),
  criterion('habitation.entry.target-room', 'Habitation', 'Main entry targets a real entry room', 3, (ctx) => habitationProfile(ctx).entryTargetExists, (ctx) => habitationProfile(ctx).entryTargetId),
  criterion('habitation.entry.ground-floor', 'Habitation', 'Main entry lands on the ground floor', 3, (ctx) => habitationProfile(ctx).entryOnGroundFloor, (ctx) => habitationProfile(ctx).entryFloor),
  criterion('habitation.entry.side-consistent', 'Habitation', 'Door side matches facade, opening plan, and build spec', 2, (ctx) => habitationProfile(ctx).entrySideConsistent, (ctx) => habitationProfile(ctx).entrySides.join('/')),
  criterion('habitation.entry.width', 'Habitation', 'Main entry is wide enough for a player path', 2, (ctx) => habitationProfile(ctx).entryWidth >= 1, (ctx) => habitationProfile(ctx).entryWidth),
  criterion('habitation.entry.height', 'Habitation', 'Main entry has enough headroom', 2, (ctx) => habitationProfile(ctx).entryHeight >= 2, (ctx) => habitationProfile(ctx).entryHeight),
  criterion('habitation.entry.immediate-approach', 'Habitation', 'Door has a walkable exterior landing immediately outside', 4, (ctx) => habitationProfile(ctx).immediateApproachOk, (ctx) => habitationProfile(ctx).approachSummary),
  criterion('habitation.entry.long-approach', 'Habitation', 'Exterior path visibly leads from the lot toward the door', 3, (ctx) => habitationProfile(ctx).longApproachOk, (ctx) => habitationProfile(ctx).approachSummary),

  criterion('habitation.enclosure.shell', 'Habitation', 'House has shell, roof, and floor modules', 4, (ctx) => habitationProfile(ctx).hasHabitableShell, (ctx) => habitationProfile(ctx).shellSummary),
  criterion('habitation.enclosure.boundary', 'Habitation', 'Exterior boundary is mostly closed by solid or glass blocks', 4, (ctx) => habitationProfile(ctx).boundaryCoverage >= 0.62, (ctx) => percentText(habitationProfile(ctx).boundaryCoverage)),
  criterion('habitation.enclosure.roof', 'Habitation', 'Roof or skylight coverage protects the interior footprint', 4, (ctx) => habitationProfile(ctx).roofCoverage >= 0.68, (ctx) => percentText(habitationProfile(ctx).roofCoverage)),
  criterion('habitation.enclosure.floor', 'Habitation', 'Ground floor footprint has floor/foundation coverage', 3, (ctx) => habitationProfile(ctx).floorCoverage >= 0.78, (ctx) => percentText(habitationProfile(ctx).floorCoverage)),
  criterion('habitation.enclosure.rooms-contained', 'Habitation', 'Rooms stay inside usable interior space', 3, (ctx) => habitationProfile(ctx).roomsContained, (ctx) => array(ctx.validation.stats?.spatialGeometry?.roomsOutsideInterior).join(', ')),
  criterion('habitation.enclosure.attached-volumes', 'Habitation', 'Attached residential volumes are joined to the main house', 3, (ctx) => habitationProfile(ctx).attachedVolumesJoined, (ctx) => array(ctx.validation.stats?.spatialGeometry?.detachedVolumes).join(', ')),

  criterion('habitation.program.public-core', 'Habitation', 'Entry, living, and kitchen core exists', 4, (ctx) => habitationProfile(ctx).hasPublicCore, (ctx) => habitationProfile(ctx).programSummary),
  criterion('habitation.program.sleeping', 'Habitation', 'At least one sleeping/private bedroom zone exists', 4, (ctx) => habitationProfile(ctx).hasSleepingRoom, (ctx) => habitationProfile(ctx).bedroomCount),
  criterion('habitation.program.sanitation', 'Habitation', 'At least one bathroom or washroom exists', 4, (ctx) => habitationProfile(ctx).bathroomCount > 0, (ctx) => habitationProfile(ctx).bathroomCount),
  criterion('habitation.program.storage', 'Habitation', 'Storage or utility capacity exists', 2, (ctx) => habitationProfile(ctx).hasStorageOrUtility, (ctx) => habitationProfile(ctx).storageSummary),
  criterion('habitation.program.zones', 'Habitation', 'Public, private, service, and circulation zones are represented', 2, (ctx) => habitationProfile(ctx).hasBalancedZones, (ctx) => habitationProfile(ctx).zoneSummary),

  criterion('habitation.circulation.all-reachable', 'Habitation', 'Every generated room is reachable from the entry graph', 5, (ctx) => habitationProfile(ctx).allRoomsReachable, (ctx) => habitationProfile(ctx).reachabilitySummary),
  criterion('habitation.circulation.required-rooms', 'Habitation', 'Core living, kitchen, bedroom, and bathroom rooms are reachable', 4, (ctx) => habitationProfile(ctx).requiredRoomsReachable, (ctx) => habitationProfile(ctx).unreachableRequiredRooms.join(', ')),
  criterion('habitation.circulation.public-service-flow', 'Habitation', 'Kitchen connects to living or dining flow', 3, (ctx) => habitationProfile(ctx).serviceFlowOk, (ctx) => habitationProfile(ctx).serviceFlowSummary),
  criterion('habitation.circulation.upper-floors', 'Habitation', 'Upper floors connect back to entry circulation', 4, (ctx) => habitationProfile(ctx).upperFloorsReachable, (ctx) => habitationProfile(ctx).upperFloorSummary),
  criterion('habitation.circulation.failed-edges', 'Habitation', 'No failed circulation edges remain', 4, (ctx) => habitationProfile(ctx).failedEdges === 0, (ctx) => habitationProfile(ctx).failedEdges),

  criterion('habitation.layout.room-area', 'Habitation', 'Core rooms have usable floor area', 3, (ctx) => habitationProfile(ctx).minCoreRoomArea >= 9, (ctx) => habitationProfile(ctx).minCoreRoomArea),
  criterion('habitation.layout.average-area', 'Habitation', 'Average room area is not cramped', 2, (ctx) => habitationProfile(ctx).averageRoomArea >= 12, (ctx) => habitationProfile(ctx).averageRoomArea),
  criterion('habitation.layout.headroom', 'Habitation', 'Rooms have player-scale headroom', 2, (ctx) => habitationProfile(ctx).minRoomHeight >= 3, (ctx) => habitationProfile(ctx).minRoomHeight),
  criterion('habitation.layout.no-overlap', 'Habitation', 'Rooms do not overlap on the same floor', 4, (ctx) => habitationProfile(ctx).overlapCount === 0, (ctx) => habitationProfile(ctx).overlapCount),

  criterion('habitation.comfort.daylight', 'Habitation', 'Residential rooms receive windows, skylight, or glass daylight', 3, (ctx) => habitationProfile(ctx).hasDaylight, (ctx) => habitationProfile(ctx).daylightSummary),
  criterion('habitation.comfort.lighting', 'Habitation', 'Interior or path lighting exists', 2, (ctx) => habitationProfile(ctx).hasLighting, (ctx) => habitationProfile(ctx).lightingSummary),
  criterion('habitation.comfort.furnishing', 'Habitation', 'Interior furnishing density supports daily use', 3, (ctx) => habitationProfile(ctx).furnishingDensity >= 3, (ctx) => habitationProfile(ctx).furnishingDensity),
  criterion('habitation.safety.door-clearance', 'Habitation', 'Main door geometry has no QA clearance issue', 3, (ctx) => habitationProfile(ctx).mainDoorClear, (ctx) => array(ctx.validation.stats?.spatialGeometry?.mainDoorIssues).join('; ')),

  criterion('interior.source', 'Interior', 'InteriorDetailAgent output exists', 1, (ctx) => ctx.blueprint.interior?.source === 'local-interior-detail-agent', (ctx) => ctx.blueprint.interior?.source),
  criterion('interior.room-details', 'Interior', 'Interior detail count matches room count', 2, (ctx) => number(ctx.blueprint.interior?.room_count) === array(ctx.layout.rooms).length, (ctx) => `${ctx.blueprint.interior?.room_count}/${array(ctx.layout.rooms).length}`),
  criterion('interior.specialists.count', 'Interior', 'Many interior specialists are registered', 2, (ctx) => array(ctx.blueprint.interior?.room_specialists).length >= 20, (ctx) => array(ctx.blueprint.interior?.room_specialists).length),
  criterion('interior.specialists.blocks', 'Interior', 'Every interior specialist controls 50+ blocks', 3, (ctx) => array(ctx.blueprint.interior?.room_specialists).every((agent) => number(agent.block_count) >= 50), (ctx) => min(array(ctx.blueprint.interior?.room_specialists).map((agent) => number(agent.block_count)))),
  criterion('interior.decorator.enabled', 'Interior', 'DecoratorAgent wrote decorations', 3, (ctx) => ctx.blueprint.decorator?.enabled && number(ctx.blueprint.decorator?.placementCount) > 0, (ctx) => ctx.blueprint.decorator?.placementCount),
  criterion('interior.decorator.density', 'Interior', 'Decoration density is meaningful', 2, (ctx) => number(ctx.blueprint.decorator?.placementCount) >= array(ctx.layout.rooms).length * 4, (ctx) => `${ctx.blueprint.decorator?.placementCount}/${array(ctx.layout.rooms).length}`),
  criterion('interior.decorator.unique-blocks', 'Interior', 'Interior uses many distinct decor blocks', 2, (ctx) => uniqueDecorBlocks(ctx).size >= 15, (ctx) => uniqueDecorBlocks(ctx).size),
  criterion('interior.vibrant.layer', 'Interior', 'Vibrant accent layer is present', 3, (ctx) => vibrantPlacements(ctx).length > 0, (ctx) => vibrantPlacements(ctx).length),
  criterion('interior.vibrant.variety', 'Interior', 'Vibrant layer uses varied blocks', 2, (ctx) => uniqueCount(vibrantPlacements(ctx).map((item) => blockBase(item.block))) >= 8, (ctx) => uniqueCount(vibrantPlacements(ctx).map((item) => blockBase(item.block)))),
  criterion('interior.modules.floor', 'Interior', 'Decorative floor accents exist', 1, (ctx) => number(ctx.blueprint.modules?.decor_floor) > 0, (ctx) => ctx.blueprint.modules?.decor_floor),
  criterion('interior.modules.light', 'Interior', 'Decorative lighting exists', 1, (ctx) => number(ctx.blueprint.modules?.decor_light) > 0, (ctx) => ctx.blueprint.modules?.decor_light),
  criterion('interior.modules.plant', 'Interior', 'Decorative plants exist', 1, (ctx) => number(ctx.blueprint.modules?.decor_plant) > 0, (ctx) => ctx.blueprint.modules?.decor_plant),

  criterion('decoration.coverage.habitable-rooms', 'Decoration', 'Most habitable rooms receive decoration', 3, (ctx) => decorationProfile(ctx).decoratedHabitableRatio >= 0.9, (ctx) => decorationProfile(ctx).coverageSummary),
  criterion('decoration.density.layered', 'Decoration', 'Decoration is rich enough to feel layered', 3, (ctx) => decorationProfile(ctx).averagePlacementsPerHabitableRoom >= 8, (ctx) => decorationProfile(ctx).densitySummary),
  criterion('decoration.density.not-cluttered', 'Decoration', 'Decoration density stays below clutter level', 3, (ctx) => decorationProfile(ctx).averageRoomDensity <= 0.65 && decorationProfile(ctx).maxRoomDensity <= 1, (ctx) => decorationProfile(ctx).densitySummary),
  criterion('decoration.palette.balanced-variety', 'Decoration', 'Palette has rich variety without one block dominating', 3, (ctx) => decorationProfile(ctx).uniqueBlockCount >= decorationProfile(ctx).requiredUniqueBlocks && decorationProfile(ctx).dominantBlockShare <= 0.25, (ctx) => decorationProfile(ctx).paletteSummary),
  criterion('decoration.vibrant.distributed', 'Decoration', 'Vibrant accents are distributed across rooms', 3, (ctx) => decorationProfile(ctx).vibrantRoomRatio >= 0.6 && decorationProfile(ctx).vibrantBlockVariety >= 10, (ctx) => decorationProfile(ctx).vibrantSummary),
  criterion('decoration.modules.layered', 'Decoration', 'Decoration uses floor, light, furniture, detail, and living layers', 3, (ctx) => decorationProfile(ctx).moduleLayerOk, (ctx) => decorationProfile(ctx).moduleSummary),
  criterion('decoration.room-fit.functional', 'Decoration', 'Room decorations match room function', 4, (ctx) => decorationProfile(ctx).roleFitRatio >= 0.8, (ctx) => decorationProfile(ctx).roleFitSummary),
  criterion('decoration.circulation.restraint', 'Decoration', 'Corridors and stairs stay readable instead of over-decorated', 3, (ctx) => decorationProfile(ctx).circulationShare <= 0.18 && decorationProfile(ctx).circulationMaxDensity <= 0.55, (ctx) => decorationProfile(ctx).circulationSummary),
  criterion('decoration.placement.anchored', 'Decoration', 'Decor blocks are anchored to real rooms and named placement zones', 3, (ctx) => decorationProfile(ctx).anchoredRatio >= 0.95, (ctx) => decorationProfile(ctx).anchorSummary),
  criterion('decoration.style.coherent-specialists', 'Decoration', 'Active decoration specialists reinforce the selected style', 3, (ctx) => decorationProfile(ctx).styleAnchored && decorationProfile(ctx).specialistCoverageRatio >= 0.75, (ctx) => decorationProfile(ctx).styleSummary),

  criterion('export.operations.count', 'Export', 'Exporter produced commands', 3, (ctx) => array(ctx.blueprint.operations).length > 0, (ctx) => array(ctx.blueprint.operations).length),
  criterion('export.operations.match', 'Export', 'Exporter operation count matches blueprint', 2, (ctx) => number(ctx.geometry.exporter?.operationCount) === array(ctx.blueprint.operations).length, (ctx) => `${ctx.geometry.exporter?.operationCount}/${array(ctx.blueprint.operations).length}`),
  criterion('export.coverage', 'Export', 'Exporter coverage check passed', 3, (ctx) => ctx.geometry.exporter?.coverageOk === true, (ctx) => ctx.geometry.exporter?.coverageOk),
  criterion('export.compression', 'Export', 'Exporter compresses below naive setblock output', 2, (ctx) => number(ctx.geometry.exporter?.operationCount) < number(ctx.geometry.exporter?.naiveOperationCount), (ctx) => `${ctx.geometry.exporter?.operationCount}/${ctx.geometry.exporter?.naiveOperationCount}`),
  criterion('export.fill-limit', 'Export', 'Largest fill respects Minecraft limit', 3, (ctx) => number(ctx.geometry.exporter?.largestOperationVolume) <= number(ctx.geometry.exporter?.maxFillVolume, 32768), (ctx) => ctx.geometry.exporter?.largestOperationVolume),
  criterion('export.block-variety', 'Export', 'Export includes a healthy block variety', 2, (ctx) => number(ctx.validation.stats?.blockTypeCount) >= 12, (ctx) => ctx.validation.stats?.blockTypeCount),

  criterion('qa.ok', 'QA', 'BlueprintQAAgent passed', 5, (ctx) => ctx.validation.ok === true, (ctx) => array(ctx.validation.errors).join('; ')),
  criterion('qa.commands', 'QA', 'Command validation passed', 3, (ctx) => checkOk(ctx.validation, 'commands'), (ctx) => checkOk(ctx.validation, 'commands')),
  criterion('qa.rooms', 'QA', 'Room validation passed', 3, (ctx) => checkOk(ctx.validation, 'rooms'), (ctx) => checkOk(ctx.validation, 'rooms')),
  criterion('qa.spatial', 'QA', 'Spatial geometry validation passed', 3, (ctx) => checkOk(ctx.validation, 'spatial-geometry'), (ctx) => checkOk(ctx.validation, 'spatial-geometry')),
  criterion('qa.circulation', 'QA', 'Circulation validation passed', 3, (ctx) => checkOk(ctx.validation, 'circulation'), (ctx) => checkOk(ctx.validation, 'circulation')),
  criterion('qa.agent-contracts', 'QA', 'Integrated agent contracts passed', 3, (ctx) => checkOk(ctx.validation, 'agent-contracts'), (ctx) => checkOk(ctx.validation, 'agent-contracts')),
  criterion('qa.warning-budget', 'QA', 'Warning count stays low', 1, (ctx) => array(ctx.validation.warnings).length <= 3, (ctx) => array(ctx.validation.warnings).length)
];

const BUILDING_SCORE_RUBRIC = [
  scoreDimension('base.requirements', 'base', '需求解析与可复现', 4, '输入、seed、工作流和风格语义清楚，可复跑可追踪。', {
    criteria: ['input.prompt.present', 'input.seed.present', 'input.workflow.current', 'architecture.style']
  }),
  scoreDimension('base.build-spec', 'base', '尺寸体量合法性', 6, '宽深高、楼层、外壳厚度和入口方向都在 Minecraft 可建造范围内。', {
    criteria: ['spec.dimensions.positive', 'spec.dimensions.within-limit', 'spec.floors.range', 'spec.height.limit', 'spec.shell.thickness', 'spec.door.side']
  }),
  scoreDimension('base.shell-structure', 'base', '结构与围护完整性', 8, '有基础、支撑、屋顶、楼板和围护闭合，房间被包进可居住空间。', {
    criteria: ['structure.source', 'structure.foundation', 'structure.supports', 'structure.load-paths', 'structure.geometry-summary', 'habitation.enclosure.shell', 'habitation.enclosure.boundary', 'habitation.enclosure.roof', 'habitation.enclosure.floor', 'habitation.enclosure.rooms-contained']
  }),
  scoreDimension('base.residential-program', 'base', '住宅功能完整性', 8, '入口、客厅、厨房、卧室、卫生间、储藏/设备和分区都满足人类居住的基本需求。', {
    criteria: ['habitation.program.public-core', 'habitation.program.sleeping', 'habitation.program.sanitation', 'habitation.program.storage', 'habitation.program.zones']
  }),
  scoreDimension('base.entry-circulation', 'base', '入口与连通性', 9, '外界能找到门，门能进入真实房间，室内边、楼梯和上层都可达。', {
    criteria: ['circulation.main-door', 'circulation.failed-edges', 'circulation.routed-edges', 'circulation.reachability', 'circulation.stairs-if-needed', 'circulation.floor-openings', 'habitation.entry.exists', 'habitation.entry.target-room', 'habitation.entry.ground-floor', 'habitation.entry.side-consistent', 'habitation.entry.width', 'habitation.entry.height', 'habitation.entry.immediate-approach', 'habitation.entry.long-approach', 'habitation.circulation.all-reachable', 'habitation.circulation.upper-floors']
  }),
  scoreDimension('base.room-layout', 'base', '房间尺度与布局', 7, '房间数量、边界、面积、层高、门洞和不重叠性合理。', {
    criteria: ['topology.nodes.count', 'topology.nodes.unique', 'topology.edges.count', 'topology.floor-program', 'layout.rooms.count', 'layout.rooms.unique', 'layout.rooms.valid-bounds', 'layout.doors.count', 'layout.bsp.summary', 'habitation.layout.room-area', 'habitation.layout.average-area', 'habitation.layout.headroom', 'habitation.layout.no-overlap']
  }),
  scoreDimension('base.minecraft-export', 'base', 'MC 方块与命令可执行', 6, '导出命令存在、覆盖正确、fill 体积合法，QA 的命令/空间/房间/连通检查通过。', {
    criteria: ['export.operations.count', 'export.operations.match', 'export.coverage', 'export.fill-limit', 'qa.ok', 'qa.commands', 'qa.rooms', 'qa.spatial', 'qa.circulation', 'qa.agent-contracts']
  }),
  scoreDimension('base.materials-basic', 'base', '基础材料可用性', 4, '主材、调色板、1.21 方块目录和基础方块多样性可用。', {
    criteria: ['architecture.materials.roles', 'palette.source', 'palette.valid', 'palette.catalog.size', 'palette.roles.broad', 'export.block-variety']
  }),
  scoreDimension('base.daylight-lighting', 'base', '采光与照明', 4, '住宅房间有窗/天窗/玻璃采光，并有室内或路径照明。', {
    criteria: ['habitation.comfort.daylight', 'habitation.comfort.lighting', 'surface.opening.source']
  }),
  scoreDimension('base.basic-interior', 'base', '基础室内可用性', 4, '室内细节与装饰 agent 生效，陈设密度足以支撑日常使用。', {
    criteria: ['interior.source', 'interior.room-details', 'interior.decorator.enabled', 'interior.decorator.density', 'habitation.comfort.furnishing']
  }),

  scoreDimension('advanced.style-expression', 'advanced', '风格一致与建筑表达', 5, '风格、体块、立面、屋顶、场地和内饰专家共同服务同一建筑语言。', {
    criteria: ['architecture.style', 'architecture.preferred-modules', 'surface.facade.elements', 'surface.roof.style', 'surface.site.zones', 'decoration.style.coherent-specialists']
  }),
  scoreDimension('advanced.surface-site-detail', 'advanced', '表皮/屋顶/场地细节', 6, '遮阳、花箱、通风、门牌、屋顶设备、泳池、种植床等高级模块真实落块。', {
    measure: (ctx) => contextualSurfaceSiteScore(ctx)
  }),
  scoreDimension('advanced.material-variety', 'advanced', '材料与方块覆盖面', 5, '材料角色广、MC 1.21 方块池完整，导出和内饰使用足够多不同方块。', {
    criteria: ['palette.options.catalog', 'palette.roles.broad', 'interior.decorator.unique-blocks', 'export.block-variety', 'decoration.palette.balanced-variety']
  }),
  scoreDimension('advanced.vibrant-interior', 'advanced', '缤纷内饰与层次', 8, '房间覆盖、密度、彩色点缀、功能适配和 floor/light/furniture/detail/living 多层装饰都成立。', {
    criteria: ['interior.specialists.count', 'interior.specialists.blocks', 'interior.vibrant.layer', 'interior.vibrant.variety', 'interior.modules.floor', 'interior.modules.light', 'interior.modules.plant', 'decoration.coverage.habitable-rooms', 'decoration.density.layered', 'decoration.density.not-cluttered', 'decoration.vibrant.distributed', 'decoration.modules.layered', 'decoration.room-fit.functional', 'decoration.circulation.restraint', 'decoration.placement.anchored']
  }),
  scoreDimension('advanced.resilience-utilities', 'advanced', '韧性与高级设施', 5, '抗震/抗风/防火/防洪/屋顶设备、太阳能和雨水回收等功能进入结构或模块。', {
    measure: (ctx) => contextualResilienceUtilityScore(ctx)
  }),
  scoreDimension('advanced.human-comfort-site', 'advanced', '人性化舒适与外部体验', 5, '外部路径、无障碍、室外活动、种植/水景和公共服务流线让房子更像可居住场所。', {
    measure: (ctx, checksById) => averageScore([
      criteriaRatio(checksById, ['habitation.entry.immediate-approach', 'habitation.entry.long-approach', 'habitation.circulation.public-service-flow', 'habitation.comfort.daylight', 'habitation.comfort.lighting']),
      contextualComfortSiteScore(ctx)
    ], 'comfort checks and site modules')
  }),
  scoreDimension('advanced.maintainability', 'advanced', '可维护性与诊断', 3, '修复 agent、警告预算、导出压缩、执行提示和预览报告支持持续迭代。', {
    measure: (ctx) => booleanScore([
      ctx.blueprint.repair?.ok === true,
      array(ctx.validation.warnings).length <= 3,
      ctx.geometry.exporter?.coverageOk === true,
      number(ctx.geometry.exporter?.compressionRatio) >= 1.2,
      Boolean(ctx.result.artifacts?.previewHtml || ctx.blueprint.artifacts?.previewHtml)
    ], 'repair/warnings/export/preview')
  }),
  scoreDimension('advanced.creativity', 'advanced', '创意体块与特殊空间', 3, '特殊体块、风格预设、高级模块和 agent 能力项让建筑不止是普通盒子。', {
    measure: (ctx) => creativityScore(ctx)
  })
];

export class ConstructionEvaluationAgent {
  run(result) {
    const ctx = evaluationContext(result);
    const checks = CRITERIA.map((item) => runCriterion(item, ctx));
    const maxScore = checks.reduce((sum, item) => sum + item.weight, 0);
    const score = checks.reduce((sum, item) => sum + item.points, 0);
    const ratio = maxScore ? score / maxScore : 0;
    const categoryScores = summarizeCategories(checks);
    const failed = checks.filter((item) => !item.ok);

    return {
      source: 'local-construction-evaluation-agent',
      version: EVALUATION_VERSION,
      prompt: ctx.result.prompt || ctx.blueprint.prompt || '',
      score,
      maxScore,
      ratio: Number(ratio.toFixed(4)),
      percent: Math.round(ratio * 100),
      grade: gradeForRatio(ratio),
      passedChecks: checks.length - failed.length,
      totalChecks: checks.length,
      categoryScores,
      scorecard: buildingScorecard(ctx, checks),
      redFlags: failed.filter((item) => item.weight >= 3).map(summaryForCheck),
      weakChecks: failed.map(summaryForCheck),
      strengths: checks.filter((item) => item.ok && item.weight >= 3).slice(0, 8).map(summaryForCheck),
      metrics: metrics(ctx),
      checks
    };
  }
}

export function evaluationCriteria() {
  return CRITERIA.map(({ id, category, label, weight }) => ({ id, category, label, weight }));
}

export function buildingScoreRubric() {
  return BUILDING_SCORE_RUBRIC.map(({ id, section, label, maxPoints, description, criteria }) => ({
    id,
    section,
    sectionLabel: sectionLabel(section),
    label,
    maxPoints,
    description,
    criteria: criteria || []
  }));
}

function criterion(id, category, label, weight, pass, value) {
  return { id, category, label, weight, pass, value };
}

function scoreDimension(id, section, label, maxPoints, description, options = {}) {
  return { id, section, label, maxPoints, description, ...options };
}

function runCriterion(item, ctx) {
  try {
    const ok = Boolean(item.pass(ctx));
    return {
      id: item.id,
      category: item.category,
      label: item.label,
      weight: item.weight,
      ok,
      points: ok ? item.weight : 0,
      value: item.value ? item.value(ctx) : undefined
    };
  } catch (error) {
    return {
      id: item.id,
      category: item.category,
      label: item.label,
      weight: item.weight,
      ok: false,
      points: 0,
      value: error.message
    };
  }
}

function evaluationContext(result = {}) {
  const blueprint = result.blueprint || result;
  return {
    result,
    blueprint,
    validation: result.validation || blueprint.validation || {},
    architecture: result.architecture || blueprint.architecture || {},
    topology: result.topology || blueprint.topology || {},
    spec: result.buildSpec || blueprint.buildSpec || {},
    geometry: result.geometry || blueprint.geometry || {},
    layout: blueprint.layout || {}
  };
}

function buildingScorecard(ctx, checks) {
  const checksById = new Map(checks.map((item) => [item.id, item]));
  const dimensions = BUILDING_SCORE_RUBRIC.map((item) => runScoreDimension(item, ctx, checksById));
  const baseScore = roundTo(sum(dimensions.filter((item) => item.section === 'base').map((item) => item.points)), 1);
  const advancedScore = roundTo(sum(dimensions.filter((item) => item.section === 'advanced').map((item) => item.points)), 1);
  const totalScore = roundTo(baseScore + advancedScore, 1);

  return {
    scale: '基础分60 + 高级分40',
    totalScore,
    maxScore: 100,
    percent: Math.round(totalScore),
    grade: gradeForRatio(totalScore / 100),
    baseScore,
    baseMaxScore: rubricMax('base'),
    advancedScore,
    advancedMaxScore: rubricMax('advanced'),
    dimensions
  };
}

function runScoreDimension(item, ctx, checksById) {
  const outcome = item.measure ? item.measure(ctx, checksById) : criteriaRatio(checksById, item.criteria);
  const ratio = clamp01(number(outcome.ratio));
  return {
    id: item.id,
    section: item.section,
    sectionLabel: sectionLabel(item.section),
    label: item.label,
    description: item.description,
    points: roundTo(item.maxPoints * ratio, 1),
    maxPoints: item.maxPoints,
    percent: Math.round(ratio * 100),
    evidence: outcome.evidence || '',
    criteria: item.criteria || []
  };
}

function criteriaRatio(checksById, ids = []) {
  const selected = ids.map((id) => checksById.get(id)).filter(Boolean);
  if (!selected.length) return { ratio: 0, evidence: '0/0 checks' };
  const score = sum(selected.map((item) => item.points));
  const maxScore = sum(selected.map((item) => item.weight));
  const passed = selected.filter((item) => item.ok).length;
  return {
    ratio: ratio01(score, maxScore),
    evidence: `${passed}/${selected.length} checks, ${roundTo(score, 1)}/${roundTo(maxScore, 1)} weighted`
  };
}

function averageScore(outcomes, label = 'combined') {
  const valid = outcomes.filter(Boolean);
  const ratio = valid.length ? sum(valid.map((item) => clamp01(number(item.ratio)))) / valid.length : 0;
  return {
    ratio,
    evidence: `${label}: ${valid.map((item) => item.evidence).filter(Boolean).join(' + ')}`
  };
}

function booleanScore(values, label) {
  const checks = values.map(Boolean);
  const passed = checks.filter(Boolean).length;
  return {
    ratio: ratio01(passed, checks.length),
    evidence: `${label}: ${passed}/${checks.length}`
  };
}

function contextualSurfaceSiteScore(ctx) {
  const expected = new Set(['windows', 'facade_trim', 'roof', 'landscape_path']);
  const facadeHints = ctx.blueprint.facade?.engine_hints || {};
  const roofHints = ctx.blueprint.roof?.engine_hints || {};
  const siteHints = ctx.blueprint.site?.engine_hints || {};

  if (facadeHints.render_wall_relief) expected.add('facade_relief');
  if (facadeHints.render_window_surrounds) expected.add('facade_detail');
  if (facadeHints.render_entry_detail) expected.add('entry_detail');
  if (facadeHints.render_awnings) expected.add('awning');
  if (facadeHints.render_flower_boxes) expected.add('flower_box');
  if (facadeHints.render_service_vents) expected.add('service_vent');
  if (facadeHints.render_address_marker) expected.add('address_marker');
  if (facadeHints.render_privacy_fins) expected.add('privacy_fin');
  if (roofHints.render_dormers) expected.add('dormer');
  if (roofHints.render_solar_panels) expected.add('solar_panel');
  if (roofHints.render_rain_collectors) expected.add('rain_chain');
  if (roofHints.render_roof_access) expected.add('roof_access');
  if (siteHints.render_water_edge) expected.add('water_feature');
  if (siteHints.render_pool) expected.add('pool_water');
  if (siteHints.render_planting_beds) expected.add('planting_bed');
  if (siteHints.render_outdoor_seating) expected.add('outdoor_living');
  if (siteHints.render_mailbox) expected.add('mailbox');
  if (siteHints.render_accessible_markers) expected.add('accessible_marker');
  if (siteHints.render_path_lights) expected.add('path_light');

  return expectedModuleScore(ctx, [...expected], 'surface/site expected modules');
}

function contextualResilienceUtilityScore(ctx) {
  const expected = new Set();
  const structureHints = ctx.blueprint.structure?.engine_hints || {};
  const roofHints = ctx.blueprint.roof?.engine_hints || {};
  const structureOk = array(ctx.blueprint.structure?.support_elements).length > 0 &&
    array(ctx.blueprint.structure?.load_paths).length > 0;

  if (structureHints.render_shear_walls) expected.add('shear_wall');
  if (structureHints.render_wind_ties) expected.add('wind_tie');
  if (structureHints.render_firebreaks) expected.add('firebreak');
  if (structureHints.render_flood_vents) expected.add('flood_vent');
  if (structureHints.render_service_platform_frame) expected.add('roof_service_frame');
  if (roofHints.render_solar_panels) expected.add('solar_panel');
  if (roofHints.render_rain_collectors) {
    expected.add('rain_chain');
    expected.add('rain_cistern');
  }

  if (!expected.size) {
    return {
      ratio: structureOk ? 1 : 0,
      evidence: structureOk ? 'no advanced resilience requested; structural supports and load paths present' : 'no advanced resilience requested; structural evidence missing'
    };
  }
  return expectedModuleScore(ctx, [...expected], 'resilience/utility expected modules');
}

function contextualComfortSiteScore(ctx) {
  const expected = new Set(['landscape_path']);
  const siteHints = ctx.blueprint.site?.engine_hints || {};
  const siteRules = ctx.architecture.site_rules || {};

  if (siteHints.render_path_lights) expected.add('path_light');
  if (siteHints.render_water_edge || siteRules.water_feature) expected.add('water_feature');
  if (siteHints.render_planting_beds || siteRules.planting_beds) expected.add('planting_bed');
  if (siteHints.render_outdoor_seating || siteRules.outdoor_seating || siteRules.patio) expected.add('outdoor_living');
  if (siteHints.render_pool || siteRules.pool) expected.add('pool_water');
  if (siteHints.render_mailbox || siteRules.mailbox) expected.add('mailbox');
  if (siteHints.render_accessible_markers || siteRules.accessible_route) expected.add('accessible_marker');

  return expectedModuleScore(ctx, [...expected], 'comfort/site expected modules');
}

function expectedModuleScore(ctx, expectedModules, label) {
  const modules = ctx.blueprint.modules || {};
  const present = expectedModules.filter((name) => number(modules[name]) > 0);
  return {
    ratio: ratio01(present.length, expectedModules.length),
    evidence: `${label}: ${present.length}/${expectedModules.length} present${expectedModules.length ? ` (${present.join(', ') || 'none'} / ${expectedModules.join(', ')})` : ''}`
  };
}

function modulePresenceScore(ctx, modules, targetCount) {
  const counts = ctx.blueprint.modules || {};
  const present = modules.filter((name) => number(counts[name]) > 0);
  const scoredCount = Math.min(present.length, targetCount);
  return {
    ratio: ratio01(scoredCount, targetCount),
    evidence: `${present.length}/${modules.length} modules present: ${present.slice(0, 10).join(', ') || 'none'}`
  };
}

function massingProfile(ctx) {
  if (ctx._massingProfile) return ctx._massingProfile;
  const boxes = array(ctx.blueprint.shell?.volumeBoxes)
    .map(normalizeVolume)
    .filter((box) => validBox(box) && box.module !== 'porch' && box.module !== 'foundation');
  const modules = ctx.blueprint.modules || {};
  const facadeDepthModules = sum(['facade_relief', 'facade_detail', 'entry_detail', 'awning', 'flower_box', 'privacy_fin', 'balcony', 'screens', 'buttress'].map((name) => number(modules[name])));
  const attachedVolumes = boxes.filter((box) => box.id && box.id !== 'main').length;
  const moduleVariety = uniqueCount(boxes.map((box) => box.module));
  const footprintCells = new Set();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.min_x);
    maxX = Math.max(maxX, box.max_x);
    minZ = Math.min(minZ, box.min_z);
    maxZ = Math.max(maxZ, box.max_z);
    for (let x = box.min_x; x <= box.max_x; x += 1) {
      for (let z = box.min_z; z <= box.max_z; z += 1) footprintCells.add(`${x},${z}`);
    }
  }

  const boundsArea = Number.isFinite(minX) ? Math.max(1, (maxX - minX + 1) * (maxZ - minZ + 1)) : 1;
  const footprintVoidRatio = roundTo(clamp01((boundsArea - footprintCells.size) / boundsArea), 2);
  const score = Math.round(clamp01(
    attachedVolumes * 0.16 +
    moduleVariety * 0.08 +
    footprintVoidRatio * 1.4 +
    Math.min(facadeDepthModules, 80) / 160
  ) * 100);

  ctx._massingProfile = {
    volumeCount: boxes.length,
    attachedVolumes,
    moduleVariety,
    footprintVoidRatio,
    facadeDepthModules,
    score,
    notMatchbox: score >= 35,
    matchboxRisk: score < 35 ? 'high' : score < 55 ? 'medium' : 'low'
  };
  return ctx._massingProfile;
}

function waterContainmentStats(ctx, grid) {
  if (ctx._waterContainmentStats) return ctx._waterContainmentStats;
  const waterCells = [...grid.entries()]
    .filter(([, block]) => blockBase(block) === 'minecraft:water')
    .map(([key]) => {
      const [x, y, z] = key.split(',').map(Number);
      return { x, y, z };
    });
  let leakCount = 0;
  for (const cell of waterCells) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = grid.get(pointKey(cell.x + dx, cell.y, cell.z + dz));
      if (!neighbor) leakCount += 1;
    }
  }
  ctx._waterContainmentStats = {
    waterCellCount: waterCells.length,
    leakCount,
    contained: waterCells.length === 0 || leakCount === 0
  };
  return ctx._waterContainmentStats;
}

function creativityScore(ctx) {
  const modules = ctx.blueprint.modules || {};
  const massing = massingProfile(ctx);
  const advancedModules = ['gallery', 'tower', 'sunroom', 'greenhouse', 'roof_garden', 'roof_sign', 'pool_water', 'solar_panel', 'rain_chain', 'awning', 'privacy_fin', 'facade_relief', 'facade_detail', 'entry_detail', 'tree_trunk', 'retaining_wall', 'buttress', 'outdoor_living'];
  const presentAdvanced = advancedModules.filter((name) => number(modules[name]) > 0);
  const checks = [
    array(ctx.architecture.volumes).length >= 2,
    array(ctx.blueprint.stylePreset?.signatures).length >= 3,
    presentAdvanced.length >= 3,
    massing.notMatchbox,
    number(ctx.geometry.exporter?.moduleTypeCount || Object.keys(modules).length) >= 24,
    number(ctx.blueprint.decorator?.capability_profile?.active_specialists) >= 4
  ];
  const passed = checks.filter(Boolean).length;
  return {
    ratio: ratio01(passed, checks.length),
    evidence: `${passed}/${checks.length}; massing=${massing.score}/100, advanced=${presentAdvanced.slice(0, 8).join(', ') || 'none'}`
  };
}

function rubricMax(section) {
  return sum(BUILDING_SCORE_RUBRIC.filter((item) => item.section === section).map((item) => item.maxPoints));
}

function sectionLabel(section) {
  return section === 'base' ? '基础分' : '高级分';
}

function summarizeCategories(checks) {
  const categories = {};
  for (const item of checks) {
    categories[item.category] ||= { score: 0, maxScore: 0, passed: 0, total: 0, percent: 0 };
    categories[item.category].score += item.points;
    categories[item.category].maxScore += item.weight;
    categories[item.category].passed += item.ok ? 1 : 0;
    categories[item.category].total += 1;
  }
  for (const item of Object.values(categories)) {
    item.percent = item.maxScore ? Math.round((item.score / item.maxScore) * 100) : 0;
  }
  return categories;
}

function metrics(ctx) {
  const habitation = habitationProfile(ctx);
  const decoration = decorationProfile(ctx);
  const massing = massingProfile(ctx);
  const water = waterContainmentStats(ctx, voxelGrid(ctx));
  return {
    style: ctx.architecture.style,
    styleFamily: ctx.architecture.style_family,
    typology: ctx.spec.typology,
    footprint: ctx.spec.footprint,
    dimensions: `${ctx.spec.width}x${ctx.spec.depth}x${ctx.spec.total_height}`,
    floors: ctx.spec.floors,
    rooms: array(ctx.layout.rooms).length,
    operations: array(ctx.blueprint.operations).length,
    blockTypes: ctx.validation.stats?.blockTypeCount || 0,
    decorPlacements: ctx.blueprint.decorator?.placementCount || 0,
    uniqueDecorBlocks: uniqueDecorBlocks(ctx).size,
    vibrantPlacements: vibrantPlacements(ctx).length,
    decorationRoomsDecorated: decoration.decoratedHabitableRoomCount,
    decorationHabitableCoverage: Math.round(decoration.decoratedHabitableRatio * 100),
    decorationAveragePlacementsPerRoom: decoration.averagePlacementsPerHabitableRoom,
    decorationAverageDensity: decoration.averageRoomDensity,
    decorationMaxDensity: decoration.maxRoomDensity,
    decorationDominantBlockShare: Math.round(decoration.dominantBlockShare * 100),
    decorationVibrantRooms: decoration.vibrantRoomCount,
    decorationRoleFit: Math.round(decoration.roleFitRatio * 100),
    decorationModuleCount: decoration.moduleCount,
    decorationCirculationShare: Math.round(decoration.circulationShare * 100),
    decorationAnchoredPlacements: Math.round(decoration.anchoredRatio * 100),
    decorationStyleAnchored: decoration.styleAnchored,
    decorationEdgeAnchored: Math.round(decoration.edgeAnchoredRatio * 100),
    decorationSupportedPlacements: Math.round(decoration.supportedRatio * 100),
    massingVariationScore: massing.score,
    matchboxRisk: massing.matchboxRisk,
    facadeDepthModules: massing.facadeDepthModules,
    waterContained: water.contained,
    waterLeakCount: water.leakCount,
    failedEdges: ctx.geometry.pathfinder?.failedEdgeCount || 0,
    warnings: array(ctx.validation.warnings).length,
    reachableRooms: habitation.reachableRoomCount,
    unreachableRooms: habitation.unreachableRooms.length,
    entrySide: habitation.entrySide,
    entryApproachCoverage: Math.round(habitation.approachCoverage * 100),
    boundaryCoverage: Math.round(habitation.boundaryCoverage * 100),
    roofCoverage: Math.round(habitation.roofCoverage * 100),
    floorCoverage: Math.round(habitation.floorCoverage * 100),
    bedroomCount: habitation.bedroomCount,
    bathroomCount: habitation.bathroomCount,
    kitchenCount: habitation.kitchenCount,
    storageCount: habitation.storageCount,
    minCoreRoomArea: habitation.minCoreRoomArea,
    averageRoomArea: habitation.averageRoomArea,
    habitation: {
      entry: habitation.entrySummary,
      approach: habitation.approachSummary,
      shell: habitation.shellSummary,
      program: habitation.programSummary,
      reachability: habitation.reachabilitySummary,
      serviceFlow: habitation.serviceFlowSummary,
      upperFloors: habitation.upperFloorSummary,
      daylight: habitation.daylightSummary,
      lighting: habitation.lightingSummary
    },
    decoration: {
      coverage: decoration.coverageSummary,
      density: decoration.densitySummary,
      palette: decoration.paletteSummary,
      vibrant: decoration.vibrantSummary,
      modules: decoration.moduleSummary,
      roomFit: decoration.roleFitSummary,
      circulation: decoration.circulationSummary,
      anchors: decoration.anchorSummary,
      style: decoration.styleSummary,
      edgeFit: decoration.edgeSummary,
      support: decoration.supportSummary
    },
    massing: {
      score: massing.score,
      attachedVolumes: massing.attachedVolumes,
      footprintVoidRatio: massing.footprintVoidRatio,
      facadeDepthModules: massing.facadeDepthModules,
      matchboxRisk: massing.matchboxRisk
    },
    water: {
      contained: water.contained,
      leaks: water.leakCount
    }
  };
}

function decorationProfile(ctx) {
  if (ctx._decorationProfile) return ctx._decorationProfile;

  const rooms = array(ctx.layout.rooms);
  const placements = array(ctx.blueprint.decorator?.placements);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const habitableRooms = rooms.filter((room) => !['corridor', 'stairs', 'balcony'].includes(room.type));
  const decoratedRoomIds = new Set(placements.map((item) => item.room_id).filter(Boolean));
  const decoratedHabitableRooms = habitableRooms.filter((room) => decoratedRoomIds.has(room.id));
  const placementsByRoom = groupBy(placements, (item) => item.room_id || 'unknown');
  const blockCounts = countBy(placements, (item) => blockBase(item.block));
  const moduleCounts = countBy(placements, (item) => item.module || 'unknown');
  const uniqueBlockCount = Object.keys(blockCounts).filter(Boolean).length;
  const dominantBlockCount = Math.max(0, ...Object.values(blockCounts));
  const vibrant = vibrantPlacements(ctx);
  const vibrantRoomIds = new Set(vibrant.map((item) => item.room_id).filter(Boolean));
  const vibrantBlockVariety = uniqueCount(vibrant.map((item) => blockBase(item.block)));
  const roomDensities = rooms.map((room) => roomDensity(room, placementsByRoom.get(room.id) || []));
  const habitablePlacementCount = sum(habitableRooms.map((room) => (placementsByRoom.get(room.id) || []).length));
  const averagePlacementsPerHabitableRoom = roundTo(habitablePlacementCount / Math.max(1, habitableRooms.length), 1);
  const averageRoomDensity = roundTo(sum(roomDensities) / Math.max(1, roomDensities.length), 2);
  const maxRoomDensity = roundTo(Math.max(0, ...roomDensities), 2);
  const modules = new Set(Object.keys(moduleCounts).filter((name) => name.startsWith('decor_')));
  const hasFloor = modules.has('decor_floor');
  const hasLight = modules.has('decor_light');
  const hasFurniture = modules.has('decor_furniture');
  const hasDetail = modules.has('decor_detail');
  const hasLivingLayer = modules.has('decor_plant') || modules.has('decor_storage') || modules.has('decor_utility');
  const circulationRooms = rooms.filter((room) => ['corridor', 'stairs'].includes(room.type));
  const circulationPlacementCount = sum(circulationRooms.map((room) => (placementsByRoom.get(room.id) || []).length));
  const circulationDensities = circulationRooms.map((room) => roomDensity(room, placementsByRoom.get(room.id) || []));
  const anchoredCount = placements.filter((item) => placementAnchored(item, roomById)).length;
  const edgeEligiblePlacements = placements.filter((item) => placementNeedsEdgeAnchor(item, roomById));
  const edgeAnchoredCount = edgeEligiblePlacements.filter((item) => placementEdgeAnchored(item, roomById)).length;
  const supportedCount = placements.filter((item) => placementSupported(ctx, item, roomById)).length;
  const roleFit = decorationRoleFit(rooms, placementsByRoom);
  const style = decorationStyleStats(ctx, habitableRooms, placementsByRoom);
  const requiredUniqueBlocks = Math.min(50, Math.max(20, habitableRooms.length * 4));

  ctx._decorationProfile = {
    placementCount: placements.length,
    habitableRoomCount: habitableRooms.length,
    decoratedHabitableRoomCount: decoratedHabitableRooms.length,
    decoratedHabitableRatio: ratio01(decoratedHabitableRooms.length, habitableRooms.length),
    averagePlacementsPerHabitableRoom,
    averageRoomDensity,
    maxRoomDensity,
    uniqueBlockCount,
    requiredUniqueBlocks,
    dominantBlockShare: ratio01(dominantBlockCount, placements.length),
    vibrantCount: vibrant.length,
    vibrantRoomCount: vibrantRoomIds.size,
    vibrantRoomRatio: ratio01(vibrantRoomIds.size, Math.max(1, decoratedHabitableRooms.length)),
    vibrantBlockVariety,
    moduleCount: modules.size,
    moduleLayerOk: modules.size >= 5 && hasFloor && hasLight && hasFurniture && hasDetail && hasLivingLayer,
    roleFitRatio: roleFit.ratio,
    circulationShare: ratio01(circulationPlacementCount, placements.length),
    circulationMaxDensity: roundTo(Math.max(0, ...circulationDensities), 2),
    anchoredRatio: ratio01(anchoredCount, placements.length),
    edgeAnchoredRatio: ratio01(edgeAnchoredCount, edgeEligiblePlacements.length),
    supportedRatio: ratio01(supportedCount, placements.length),
    styleAnchored: style.styleAnchored,
    specialistCoverageRatio: style.specialistCoverageRatio,
    coverageSummary: `${decoratedHabitableRooms.length}/${habitableRooms.length} habitable rooms`,
    densitySummary: `avg=${averagePlacementsPerHabitableRoom}/room, density=${averageRoomDensity}, max=${maxRoomDensity}`,
    paletteSummary: `${uniqueBlockCount}/${requiredUniqueBlocks} unique, dominant=${percentText(ratio01(dominantBlockCount, placements.length))}`,
    vibrantSummary: `${vibrant.length} accents, rooms=${vibrantRoomIds.size}/${decoratedHabitableRooms.length}, unique=${vibrantBlockVariety}`,
    moduleSummary: [...modules].sort().join(', '),
    roleFitSummary: `${roleFit.fit}/${roleFit.total} room functions matched${roleFit.missing.length ? `; weak=${roleFit.missing.slice(0, 4).join(', ')}` : ''}`,
    circulationSummary: `${circulationPlacementCount}/${placements.length} placements, maxDensity=${roundTo(Math.max(0, ...circulationDensities), 2)}`,
    anchorSummary: `${anchoredCount}/${placements.length} anchored`,
    edgeSummary: `${edgeAnchoredCount}/${edgeEligiblePlacements.length} wall-adjacent`,
    supportSummary: `${supportedCount}/${placements.length} supported`,
    styleSummary: `${style.styleFamily}: styleAgent=${style.expectedStyleHint || 'room-specialists'}, active=${style.hasExpectedStyleAgent}, coverage=${percentText(style.specialistCoverageRatio)}`
  };
  return ctx._decorationProfile;
}

function habitationProfile(ctx) {
  if (ctx._habitationProfile) return ctx._habitationProfile;

  const rooms = array(ctx.layout.rooms);
  const modules = ctx.blueprint.modules || {};
  const mainDoor = ctx.blueprint.paths?.mainDoor || {};
  const entryRoom = selectEntryRoom(rooms, mainDoor);
  const graph = buildRoomGraph(ctx);
  const reachable = entryRoom?.id ? reachableFrom(graph, entryRoom.id) : new Set();
  const roomTypes = countRoomTypes(rooms);
  const voxel = voxelGrid(ctx);
  const enclosure = enclosureStats(ctx, voxel);
  const approach = entryApproachStats(ctx, voxel);
  const coreRooms = rooms.filter(isCoreRoom);
  const requiredRooms = rooms.filter(isRequiredDailyRoom);
  const unreachableRooms = rooms.map((room) => room.id).filter((id) => !reachable.has(id));
  const unreachableRequiredRooms = requiredRooms.map((room) => room.id).filter((id) => !reachable.has(id));
  const serviceFlow = serviceFlowStats(ctx, graph);
  const upperFloors = upperFloorStats(ctx, rooms, reachable);
  const zones = new Set(rooms.map((room) => text(room.zone || room.privacy || zoneForRoomType(room.type))).filter(Boolean));
  const roomAreas = rooms.map(roomArea).filter((value) => value > 0);
  const coreAreas = coreRooms.map(roomArea).filter((value) => value > 0);
  const roomHeights = rooms.map((room) => number(room.max_y) - number(room.min_y) + 1).filter((value) => value > 0);
  const entrySides = [
    mainDoor.side,
    ctx.spec.door_side,
    ctx.blueprint.opening?.main_entry?.side,
    ctx.blueprint.facade?.front_side
  ].map((value) => text(value)).filter(Boolean);
  const normalizedEntrySides = [...new Set(entrySides)];
  const bedroomCount = typeCount(roomTypes, ['bedroom', 'master_bedroom']);
  const bathroomCount = typeCount(roomTypes, ['bathroom']);
  const kitchenCount = typeCount(roomTypes, ['kitchen']);
  const storageCount = typeCount(roomTypes, ['storage', 'utility']);
  const hasStorageOrUtility = storageCount > 0 || number(modules.decor_storage) > 0 || number(modules.decor_utility) > 0;
  const failedEdges = number(ctx.geometry.pathfinder?.failedEdgeCount);
  const overlapCount = array(ctx.validation.stats?.spatialGeometry?.overlappingRooms).length;
  const daylightBlocks = number(modules.windows) + number(modules.skylight) + number(modules.sunroom) + number(modules.greenhouse);
  const lightingBlocks = number(modules.decor_light) + number(modules.path_light) + number(modules.facade_light) + number(modules.skylight);
  const furnishingBlocks = number(modules.decor_furniture) + number(modules.decor_storage) + number(modules.decor_utility) + number(modules.decor_detail);
  const furnishingDensity = roundTo(furnishingBlocks / Math.max(1, rooms.length), 1);

  ctx._habitationProfile = {
    hasMainDoor: Boolean(mainDoor.side),
    entrySide: text(mainDoor.side || ctx.spec.door_side || 'south'),
    entrySides: normalizedEntrySides,
    entrySideConsistent: normalizedEntrySides.length <= 1,
    entryWidth: number(mainDoor.width),
    entryHeight: number(mainDoor.height),
    entryTargetId: text(mainDoor.targetRoom || entryRoom?.id || ''),
    entryTargetExists: Boolean(entryRoom),
    entryOnGroundFloor: Boolean(entryRoom) && Number(entryRoom.floor || 0) === 0,
    entryFloor: entryRoom ? Number(entryRoom.floor || 0) : undefined,
    immediateApproachOk: approach.immediateOk,
    longApproachOk: approach.longOk,
    approachCoverage: approach.coverage,
    approachSummary: `${approach.coveredSteps}/${approach.totalSteps} steps (${percentText(approach.coverage)})`,
    entrySummary: `${mainDoor.side || 'none'} ${mainDoor.width || 0}x${mainDoor.height || 0} -> ${mainDoor.targetRoom || 'none'}`,

    hasHabitableShell: number(modules.walls) + number(modules.wing) + number(modules.tower) + number(modules.sunroom) > 0 &&
      number(modules.roof) + number(modules.roof_detail) + number(modules.skylight) > 0 &&
      number(modules.floors) + number(modules.foundation) > 0,
    boundaryCoverage: enclosure.boundaryCoverage,
    roofCoverage: enclosure.roofCoverage,
    floorCoverage: enclosure.floorCoverage,
    shellSummary: `boundary=${percentText(enclosure.boundaryCoverage)}, roof=${percentText(enclosure.roofCoverage)}, floor=${percentText(enclosure.floorCoverage)}`,
    roomsContained: array(ctx.validation.stats?.spatialGeometry?.roomsOutsideInterior).length === 0,
    attachedVolumesJoined: array(ctx.validation.stats?.spatialGeometry?.detachedVolumes).length === 0,

    hasPublicCore: Boolean(entryRoom) && typeCount(roomTypes, ['living', 'great_hall', 'lounge', 'tatami']) > 0 && kitchenCount > 0,
    hasSleepingRoom: bedroomCount > 0 || typeCount(roomTypes, ['tatami', 'tower']) > 0,
    bedroomCount,
    bathroomCount,
    kitchenCount,
    storageCount,
    hasStorageOrUtility,
    hasBalancedZones: zones.has('public') && zones.has('service') && (zones.has('private') || bedroomCount > 0) && (zones.has('circulation') || number(ctx.spec.floors) <= 1),
    programSummary: `entry=${Boolean(entryRoom)}, living=${typeCount(roomTypes, ['living', 'great_hall', 'lounge', 'tatami'])}, kitchen=${kitchenCount}, bedroom=${bedroomCount}, bath=${bathroomCount}`,
    storageSummary: `storageRooms=${storageCount}, storageModules=${number(modules.decor_storage)}`,
    zoneSummary: [...zones].sort().join(', '),

    reachableRoomCount: reachable.size,
    unreachableRooms,
    allRoomsReachable: rooms.length > 0 && unreachableRooms.length === 0,
    requiredRoomsReachable: unreachableRequiredRooms.length === 0,
    unreachableRequiredRooms,
    reachabilitySummary: `${reachable.size}/${rooms.length}`,
    serviceFlowOk: serviceFlow.ok,
    serviceFlowSummary: serviceFlow.summary,
    upperFloorsReachable: upperFloors.ok,
    upperFloorSummary: upperFloors.summary,
    failedEdges,

    minCoreRoomArea: min(coreAreas),
    averageRoomArea: roundTo(roomAreas.reduce((sum, value) => sum + value, 0) / Math.max(1, roomAreas.length), 1),
    minRoomHeight: min(roomHeights),
    overlapCount,

    hasDaylight: daylightBlocks > 0,
    daylightSummary: `windows/skylight/glass=${daylightBlocks}`,
    hasLighting: lightingBlocks > 0,
    lightingSummary: `lighting=${lightingBlocks}`,
    furnishingDensity,
    mainDoorClear: array(ctx.validation.stats?.spatialGeometry?.mainDoorIssues).length === 0
  };
  return ctx._habitationProfile;
}

function voxelGrid(ctx) {
  if (ctx._voxelGrid) return ctx._voxelGrid;
  const grid = new Map();
  for (const operation of array(ctx.blueprint.operations)) {
    if (operation.kind === 'fill') {
      const from = operation.from || {};
      const to = operation.to || {};
      const minX = Math.min(number(from.x), number(to.x));
      const maxX = Math.max(number(from.x), number(to.x));
      const minY = Math.min(number(from.y), number(to.y));
      const maxY = Math.max(number(from.y), number(to.y));
      const minZ = Math.min(number(from.z), number(to.z));
      const maxZ = Math.max(number(from.z), number(to.z));
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          for (let z = minZ; z <= maxZ; z += 1) setVoxel(grid, x, y, z, operation.block);
        }
      }
    } else if (operation.kind === 'setblock') {
      const at = operation.at || {};
      setVoxel(grid, number(at.x), number(at.y), number(at.z), operation.block);
    }
  }
  ctx._voxelGrid = grid;
  return grid;
}

function setVoxel(grid, x, y, z, block) {
  const key = pointKey(x, y, z);
  if (blockBase(block) === 'minecraft:air') grid.delete(key);
  else grid.set(key, blockBase(block));
}

function enclosureStats(ctx, grid) {
  const volumes = array(ctx.blueprint.shell?.volumeBoxes)
    .map(normalizeVolume)
    .filter((box) => box.module !== 'porch' && validBox(box));
  if (!volumes.length) return { boundaryCoverage: 0, roofCoverage: 0, floorCoverage: 0 };

  let boundaryTotal = 0;
  let boundarySolid = 0;
  let roofTotal = 0;
  let roofSolid = 0;
  let floorTotal = 0;
  let floorSolid = 0;
  const roofHeight = Math.max(1, number(ctx.spec.roof_height, 2) + 2);

  for (const box of volumes) {
    for (let y = Math.max(1, box.min_y); y <= box.max_y; y += 1) {
      for (let x = box.min_x; x <= box.max_x; x += 1) {
        boundaryTotal += 2;
        if (hasVoxel(grid, x, y, box.min_z)) boundarySolid += 1;
        if (hasVoxel(grid, x, y, box.max_z)) boundarySolid += 1;
      }
      for (let z = box.min_z + 1; z <= box.max_z - 1; z += 1) {
        boundaryTotal += 2;
        if (hasVoxel(grid, box.min_x, y, z)) boundarySolid += 1;
        if (hasVoxel(grid, box.max_x, y, z)) boundarySolid += 1;
      }
    }

    for (let x = box.min_x; x <= box.max_x; x += 1) {
      for (let z = box.min_z; z <= box.max_z; z += 1) {
        floorTotal += 1;
        if (hasVoxel(grid, x, Math.max(0, box.min_y - 1), z) || hasVoxel(grid, x, box.min_y, z)) floorSolid += 1;

        roofTotal += 1;
        let capped = false;
        for (let y = box.max_y; y <= box.max_y + roofHeight; y += 1) {
          if (hasVoxel(grid, x, y, z)) {
            capped = true;
            break;
          }
        }
        if (capped) roofSolid += 1;
      }
    }
  }

  return {
    boundaryCoverage: ratio01(boundarySolid, boundaryTotal),
    roofCoverage: ratio01(roofSolid, roofTotal),
    floorCoverage: ratio01(floorSolid, floorTotal)
  };
}

function entryApproachStats(ctx, grid) {
  const mainDoor = ctx.blueprint.paths?.mainDoor || {};
  const side = text(mainDoor.side || ctx.spec.door_side || 'south');
  const width = Math.max(1, number(mainDoor.width, 1));
  const length = Math.max(1, number(mainDoor.approachLength || mainDoor.approach?.length || ctx.spec.garden_depth, 1));
  const steps = [];
  if (!mainDoor.side) return { immediateOk: false, longOk: false, coverage: 0, coveredSteps: 0, totalSteps: length };

  if (['south', 'north'].includes(side)) {
    const zStart = number(mainDoor.z) + (side === 'south' ? 1 : -1);
    const direction = side === 'south' ? 1 : -1;
    for (let step = 0; step < length; step += 1) {
      const z = zStart + direction * step;
      steps.push(range(number(mainDoor.x) - 1, number(mainDoor.x) + width).some((x) => hasVoxel(grid, x, 0, z)));
    }
  } else {
    const xStart = number(mainDoor.x) + (side === 'east' ? 1 : -1);
    const direction = side === 'east' ? 1 : -1;
    for (let step = 0; step < length; step += 1) {
      const x = xStart + direction * step;
      steps.push(range(number(mainDoor.z) - 1, number(mainDoor.z) + width).some((z) => hasVoxel(grid, x, 0, z)));
    }
  }

  const coveredSteps = steps.filter(Boolean).length;
  const coverage = ratio01(coveredSteps, steps.length);
  return {
    immediateOk: steps[0] === true,
    longOk: steps.length >= 3 && coverage >= 0.6,
    coverage,
    coveredSteps,
    totalSteps: steps.length
  };
}

function buildRoomGraph(ctx) {
  const graph = new Map();
  for (const room of array(ctx.layout.rooms)) graph.set(room.id, new Set());
  for (const door of array(ctx.layout.interiorDoors)) addConnects(graph, door.connects || []);
  for (const edge of array(ctx.blueprint.paths?.openedEdges)) {
    if (['routed', 'vertical-edge'].includes(edge.status)) addEdge(graph, edge.from, edge.to);
  }
  return graph;
}

function addConnects(graph, connects) {
  if (connects.length < 2) return;
  addEdge(graph, connects[0], connects[1]);
}

function addEdge(graph, a, b) {
  if (!a || !b || !graph.has(a) || !graph.has(b)) return;
  graph.get(a).add(b);
  graph.get(b).add(a);
}

function reachableFrom(graph, start) {
  const seen = new Set();
  const stack = graph.has(start) ? [start] : [];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.get(current) || []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

function selectEntryRoom(rooms, mainDoor = {}) {
  return rooms.find((room) => room.id === mainDoor.targetRoom) ||
    rooms.find((room) => room.id === 'entry' && number(room.floor) === 0) ||
    rooms.find((room) => room.type === 'entry' && number(room.floor) === 0) ||
    rooms.find((room) => room.access === 'main-door' && number(room.floor) === 0) ||
    rooms.find((room) => room.zone === 'public' && number(room.floor) === 0);
}

function serviceFlowStats(ctx, graph) {
  const rooms = array(ctx.layout.rooms);
  const kitchens = rooms.filter((room) => room.type === 'kitchen');
  const publicRooms = rooms.filter((room) => ['living', 'great_hall', 'dining', 'lounge', 'tatami'].includes(room.type));
  if (!kitchens.length || !publicRooms.length) return { ok: false, summary: `kitchen=${kitchens.length}, public=${publicRooms.length}` };
  const ok = kitchens.some((kitchen) => publicRooms.some((room) => graphConnected(graph, kitchen.id, room.id)));
  return { ok, summary: `kitchen=${kitchens.map((room) => room.id).join(',')}; public=${publicRooms.map((room) => room.id).join(',')}` };
}

function upperFloorStats(ctx, rooms, reachable) {
  const floors = number(ctx.spec.floors, 1);
  if (floors <= 1) return { ok: true, summary: 'single-floor' };
  const upperRooms = rooms.filter((room) => number(room.floor) > 0);
  const reachableUpper = upperRooms.filter((room) => reachable.has(room.id));
  const hasStairs = array(ctx.blueprint.paths?.stairs).length > 0;
  const openings = array(ctx.layout.floorOpenings).length;
  return {
    ok: hasStairs && openings >= floors - 1 && reachableUpper.length === upperRooms.length,
    summary: `${reachableUpper.length}/${upperRooms.length} upper rooms, stairs=${hasStairs}, openings=${openings}`
  };
}

function graphConnected(graph, start, target) {
  if (!graph.has(start) || !graph.has(target)) return false;
  return reachableFrom(graph, start).has(target);
}

function countRoomTypes(rooms) {
  const counts = {};
  for (const room of rooms) {
    const key = text(room.type || 'room');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function typeCount(counts, types) {
  return types.reduce((sum, type) => sum + number(counts[type]), 0);
}

function isRequiredDailyRoom(room) {
  return ['entry', 'living', 'great_hall', 'lounge', 'kitchen', 'dining', 'bedroom', 'master_bedroom', 'bathroom'].includes(room.type);
}

function isCoreRoom(room) {
  return ['entry', 'living', 'great_hall', 'lounge', 'kitchen', 'dining', 'bedroom', 'master_bedroom', 'bathroom', 'tatami'].includes(room.type);
}

function roomArea(room) {
  return Math.max(0, number(room.max_x) - number(room.min_x) + 1) *
    Math.max(0, number(room.max_z) - number(room.min_z) + 1);
}

function zoneForRoomType(type) {
  if (['entry', 'living', 'great_hall', 'dining', 'lounge', 'sunroom'].includes(type)) return 'public';
  if (['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room', 'tower'].includes(type)) return 'private';
  if (['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'workshop', 'armory'].includes(type)) return 'service';
  if (['stairs', 'corridor'].includes(type)) return 'circulation';
  return 'room';
}

function normalizeVolume(box = {}) {
  const bounds = box.bounds || {};
  return {
    id: text(box.id),
    module: text(box.module),
    min_x: number(box.min_x ?? box.minX ?? bounds.minX),
    max_x: number(box.max_x ?? box.maxX ?? bounds.maxX),
    min_y: number(box.min_y ?? box.minY ?? bounds.minY),
    max_y: number(box.max_y ?? box.maxY ?? bounds.maxY),
    min_z: number(box.min_z ?? box.minZ ?? bounds.minZ),
    max_z: number(box.max_z ?? box.maxZ ?? bounds.maxZ)
  };
}

function validBox(box) {
  return Number.isFinite(box.min_x) && Number.isFinite(box.max_x) &&
    Number.isFinite(box.min_y) && Number.isFinite(box.max_y) &&
    Number.isFinite(box.min_z) && Number.isFinite(box.max_z) &&
    box.min_x <= box.max_x && box.min_y <= box.max_y && box.min_z <= box.max_z;
}

function hasVoxel(grid, x, y, z) {
  return grid.has(pointKey(x, y, z));
}

function pointKey(x, y, z) {
  return `${x},${y},${z}`;
}

function range(start, end) {
  const values = [];
  for (let value = Math.min(start, end); value <= Math.max(start, end); value += 1) values.push(value);
  return values;
}

function ratio01(value, total) {
  return total > 0 ? value / total : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, number(value)));
}

function percentText(value) {
  return `${Math.round(number(value) * 100)}%`;
}

function roundTo(value, digits = 0) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function gradeForRatio(ratio) {
  if (ratio >= 0.95) return 'S';
  if (ratio >= 0.9) return 'A';
  if (ratio >= 0.82) return 'B';
  if (ratio >= 0.72) return 'C';
  return 'D';
}

function summaryForCheck(item) {
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    weight: item.weight,
    value: item.value
  };
}

function checkOk(validation, name) {
  return array(validation.checks).find((item) => item.name === name)?.ok === true;
}

function roomDensity(room, placements = []) {
  return roundTo(placements.length / Math.max(1, roomArea(room)), 2);
}

function placementAnchored(item, roomById) {
  const at = item.at || {};
  return Boolean(
    roomById.has(item.room_id) &&
    text(item.placement).length >= 3 &&
    text(item.module).startsWith('decor_') &&
    text(item.role).length >= 2 &&
    text(item.block).startsWith('minecraft:') &&
    Number.isFinite(number(at.x, NaN)) &&
    Number.isFinite(number(at.y, NaN)) &&
    Number.isFinite(number(at.z, NaN))
  );
}

function placementNeedsEdgeAnchor(item, roomById) {
  const room = roomById.get(item.room_id);
  if (!room || ['corridor', 'stairs'].includes(room.type)) return false;
  if (text(item.module) === 'decor_floor') return false;
  if (text(item.module) === 'decor_light' && /ceiling|light/i.test(text(item.placement))) return false;
  if (/rug|runner|mat|pad|tile|carpet|table/i.test(`${item.role || ''} ${item.placement || ''}`)) return false;
  return ['decor_furniture', 'decor_storage', 'decor_utility', 'decor_detail', 'decor_plant'].includes(text(item.module));
}

function placementEdgeAnchored(item, roomById) {
  const room = roomById.get(item.room_id);
  const at = item.at || {};
  if (!room || !Number.isFinite(number(at.x, NaN)) || !Number.isFinite(number(at.z, NaN))) return false;
  const edgeDistance = Math.min(
    Math.abs(number(at.x) - number(room.min_x)),
    Math.abs(number(at.x) - number(room.max_x)),
    Math.abs(number(at.z) - number(room.min_z)),
    Math.abs(number(at.z) - number(room.max_z))
  );
  return edgeDistance <= 1 || /wall|corner|edge|line|side|shelf|storage|bench|entry|window|alcove|cove/i.test(text(item.placement));
}

function placementSupported(ctx, item, roomById) {
  const room = roomById.get(item.room_id);
  const at = item.at || {};
  if (!room || !Number.isFinite(number(at.x, NaN)) || !Number.isFinite(number(at.y, NaN)) || !Number.isFinite(number(at.z, NaN))) return false;
  if (text(item.module) === 'decor_light' && (number(at.y) >= number(room.max_y) - 1 || /ceiling/i.test(text(item.placement)))) return true;
  const grid = voxelGrid(ctx);
  const support = grid.get(pointKey(number(at.x), number(at.y) - 1, number(at.z)));
  if (!support) return false;
  return blockSupportsDecor(support, item.block);
}

function blockSupportsDecor(supportBlock = '', decorBlock = '') {
  const support = blockBase(supportBlock);
  const decor = blockBase(decorBlock);
  if (!support || support === 'minecraft:air' || support === 'minecraft:water') return false;
  if (support.includes('_fence') || support.endsWith(':chain')) return /lantern|bell|candle/.test(decor);
  if (/_slab$|_stairs$|_carpet$|_pressure_plate$|_trapdoor$|_button$|_pane$|_bars$|lantern$|candle$|flower_pot$|potted_|chain$/.test(support)) return false;
  return true;
}

function decorationRoleFit(rooms, placementsByRoom) {
  const targets = rooms.filter((room) => !['corridor', 'stairs', 'balcony'].includes(room.type));
  let fit = 0;
  const missing = [];

  for (const room of targets) {
    const placements = placementsByRoom.get(room.id) || [];
    const tokens = DECORATION_ROOM_ROLE_TOKENS[room.type] || DECORATION_ROOM_ROLE_TOKENS.room;
    const roles = placements.map((item) => `${item.role || ''} ${item.placement || ''} ${blockBase(item.block)}`.toLowerCase());
    const matched = tokens.filter((token) => roles.some((role) => role.includes(token)));
    const required = Math.min(3, Math.max(2, Math.ceil(tokens.length * 0.25)));
    if (matched.length >= required) fit += 1;
    else missing.push(`${room.id}:${matched.length}/${required}`);
  }

  return {
    fit,
    total: targets.length,
    ratio: ratio01(fit, targets.length),
    missing
  };
}

function decorationStyleStats(ctx, habitableRooms, placementsByRoom) {
  const styleFamily = text(ctx.architecture.style_family || ctx.spec.style_family || ctx.blueprint.decorator?.style_family || 'general');
  const expectedStyleHint = DECORATION_STYLE_AGENT_HINTS[styleFamily];
  const activeIds = [
    ...array(ctx.blueprint.decorator?.activeSpecialists).map((item) => item.agent_id || item.source),
    ...array(ctx.blueprint.decorator?.placements).map((item) => item.agent_id)
  ].map((value) => text(value)).filter(Boolean);
  const hasExpectedStyleAgent = expectedStyleHint
    ? activeIds.some((id) => id.includes(`${expectedStyleHint}-interior-style-agent`) || id.includes(`${expectedStyleHint}-style-agent`) || id.includes(expectedStyleHint))
    : activeIds.some((id) => id.includes('interior-style-agent'));
  const specialistRoomCount = habitableRooms.filter((room) => array(placementsByRoom.get(room.id)).some((item) => item.agent_id)).length;
  const specialistCoverageRatio = ratio01(specialistRoomCount, habitableRooms.length);
  const styleAnchored = expectedStyleHint ? hasExpectedStyleAgent : specialistCoverageRatio >= 0.75;

  return {
    styleFamily,
    expectedStyleHint,
    hasExpectedStyleAgent,
    specialistCoverageRatio,
    styleAnchored
  };
}

function uniqueDecorBlocks(ctx) {
  return new Set(array(ctx.blueprint.decorator?.placements).map((item) => blockBase(item.block)).filter(Boolean));
}

function vibrantPlacements(ctx) {
  return array(ctx.blueprint.decorator?.placements).filter((item) => text(item.role).startsWith('vibrant'));
}

function validRoomBounds(room) {
  return number(room.max_x) >= number(room.min_x) &&
    number(room.max_y) >= number(room.min_y) &&
    number(room.max_z) >= number(room.min_z);
}

function blockBase(block) {
  return text(block).split('[')[0];
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function uniqueCount(values) {
  return new Set(values.filter((value) => value !== undefined && value !== '')).size;
}

function groupBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = text(keyFn(value));
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sum(values) {
  return values.reduce((total, value) => total + number(value), 0);
}

function between(value, minValue, maxValue) {
  return value >= minValue && value <= maxValue;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function min(values) {
  return values.length ? Math.min(...values) : 0;
}

function text(value) {
  return String(value || '');
}
