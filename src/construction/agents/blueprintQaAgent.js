const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;
const MAX_FILL_VOLUME = 32768;
const AGENT_CONTRACTS = [
  ['stylePreset', 'local-style-preset-memory'],
  ['materialPalette', 'local-material-palette'],
  ['structure', 'fallback-structure'],
  ['facade', 'local-facade-agent'],
  ['roof', 'local-roof-agent'],
  ['site', 'local-site-landscape-agent'],
  ['opening', 'local-opening-connectivity-agent'],
  ['interior', 'local-interior-detail-agent'],
  ['repair', 'local-constraint-repair-agent']
];

export class BlueprintQAAgent {
  run(blueprint) {
    const errors = [];
    const warnings = [];
    const checks = [];

    const commandStats = validateOperations(blueprint.operations || [], errors, checks);
    const boundsStats = validateBounds(blueprint.bounds || {}, warnings, checks);
    const exporterStats = validateExporter(blueprint, errors, warnings, checks);
    const roomStats = validateRooms(blueprint, errors, warnings, checks);
    const spatialGeometryStats = validateSpatialGeometry(blueprint, errors, warnings, checks);
    const circulationStats = validateCirculation(blueprint, errors, warnings, checks);
    const semanticStats = validateSemanticCompleteness(blueprint, errors, warnings, checks);
    const agentContractStats = validateAgentContracts(blueprint, errors, warnings, checks);

    if ((blueprint.operations || []).length > 8000) warnings.push('函数命令数量接近 Minecraft 单次执行压力上限。');

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      checks,
      stats: {
        operationCount: commandStats.operationCount,
        fillCount: commandStats.fillCount,
        setblockCount: commandStats.setblockCount,
        bounds: boundsStats,
        modules: blueprint.modules || {},
        blockTypeCount: commandStats.blockTypeCount,
        largestFillVolume: commandStats.largestFillVolume,
        exporter: exporterStats,
        rooms: roomStats,
        spatialGeometry: spatialGeometryStats,
        circulation: circulationStats,
        semantic: semanticStats,
        agentContracts: agentContractStats
      }
    };
  }
}

function validateOperations(operations, errors, checks) {
  let fillCount = 0;
  let setblockCount = 0;
  let largestFillVolume = 0;
  const blocks = new Set();
  const illegalBlocks = [];
  const oversizedFills = [];
  const unknownKinds = [];

  for (const operation of operations) {
    if (!BLOCK_PATTERN.test(operation.block)) illegalBlocks.push(operation.block);
    blocks.add(operation.block);

    if (operation.kind === 'fill') {
      fillCount += 1;
      const volume = operationVolume(operation);
      largestFillVolume = Math.max(largestFillVolume, volume);
      if (volume > MAX_FILL_VOLUME) oversizedFills.push({ block: operation.block, volume });
    } else if (operation.kind === 'setblock') {
      setblockCount += 1;
    } else {
      unknownKinds.push(operation.kind);
    }
  }

  for (const block of [...new Set(illegalBlocks)]) errors.push(`非法方块 ID: ${block}`);
  for (const item of oversizedFills) errors.push(`fill 命令体积超过 Minecraft 限制: ${item.volume}`);
  for (const kind of [...new Set(unknownKinds)]) errors.push(`未知操作类型: ${kind}`);

  checks.push(check('commands', !illegalBlocks.length && !oversizedFills.length && !unknownKinds.length, {
    operationCount: operations.length,
    fillCount,
    setblockCount,
    blockTypeCount: blocks.size,
    largestFillVolume
  }));

  return {
    operationCount: operations.length,
    fillCount,
    setblockCount,
    blockTypeCount: blocks.size,
    largestFillVolume
  };
}

function validateBounds(bounds, warnings, checks) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const depth = bounds.maxZ - bounds.minZ + 1;
  if (width > 80 || depth > 80 || height > 40) warnings.push(`建筑边界较大: ${width}x${height}x${depth}`);
  checks.push(check('bounds', width > 0 && depth > 0 && height > 0 && width <= 80 && depth <= 80 && height <= 40, { width, height, depth }));
  return { width, height, depth };
}

function validateExporter(blueprint, errors, warnings, checks) {
  const exporter = blueprint.geometry?.exporter;
  if (!exporter) {
    warnings.push('缺少 Exporter 优化统计。');
    checks.push(check('exporter', false, { reason: 'missing-exporter-stats' }));
    return {};
  }

  if (!exporter.coverageOk) errors.push('Exporter 覆盖检查失败：导出 fill 体积与网格格数不一致。');
  if (exporter.operationCount !== (blueprint.operations || []).length) errors.push('Exporter operationCount 与实际 operations 数量不一致。');
  if (blueprint.geometry?.gridCellCount && exporter.inputCellCount !== blueprint.geometry.gridCellCount) {
    errors.push('Exporter inputCellCount 与 geometry.gridCellCount 不一致。');
  }
  if (exporter.largestOperationVolume > (exporter.maxFillVolume || MAX_FILL_VOLUME)) {
    errors.push(`Exporter 最大 fill 体积超过限制: ${exporter.largestOperationVolume}`);
  }
  if (exporter.operationCount > exporter.naiveOperationCount) warnings.push('Exporter 优化后命令数高于朴素行压缩。');

  checks.push(check('exporter', Boolean(exporter.coverageOk) && exporter.operationCount === (blueprint.operations || []).length, {
    strategy: exporter.strategy,
    operationCount: exporter.operationCount,
    naiveOperationCount: exporter.naiveOperationCount,
    compressionRatio: exporter.compressionRatio
  }));
  return exporter;
}

function validateRooms(blueprint, errors, warnings, checks) {
  const rooms = blueprint.layout?.rooms || [];
  const ids = new Set();
  const duplicateIds = [];
  const invalidRooms = [];
  for (const room of rooms) {
    if (ids.has(room.id)) duplicateIds.push(room.id);
    ids.add(room.id);
    if (room.max_x < room.min_x || room.max_y < room.min_y || room.max_z < room.min_z) invalidRooms.push(room.id);
  }

  if (!rooms.length) errors.push('没有生成任何室内房间。');
  for (const id of duplicateIds) errors.push(`房间 ID 重复: ${id}`);
  for (const id of invalidRooms) errors.push(`房间边界无效: ${id}`);
  if (!rooms.some((room) => room.type === 'entry' || room.id === 'entry')) warnings.push('没有明确的入口房间。');

  checks.push(check('rooms', rooms.length > 0 && !duplicateIds.length && !invalidRooms.length, {
    roomCount: rooms.length,
    duplicateIds,
    invalidRooms
  }));
  return { roomCount: rooms.length, duplicateIds, invalidRooms };
}

function validateSpatialGeometry(blueprint, errors, warnings, checks) {
  const rooms = (blueprint.layout?.rooms || []).map(normalizeRoomBox).filter(Boolean);
  const spaces = (blueprint.shell?.interiorSpaces || []).map(normalizeInteriorSpace).filter(Boolean);
  const volumes = (blueprint.shell?.volumeBoxes || []).map(normalizeVolumeBox).filter(Boolean);
  const mainBox = volumes.find((box) => box.id === 'main') || volumes[0];
  const shellThickness = clampInt(blueprint.buildSpec?.shell_thickness || 1, 1, 3);
  const floorHeight = clampInt(blueprint.buildSpec?.floor_height || 5, 1, 16, 5);
  const floorCount = clampInt(blueprint.buildSpec?.floors || 1, 1, 8, 1);

  const invalidVolumes = volumes.filter((box) => !isValidBox(box)).map((box) => box.id);
  const detachedVolumes = mainBox
    ? volumes
      .filter((box) => box.id !== mainBox.id && box.boolean_mode !== 'subtract')
      .filter((box) => !hasFaceContactOrOverlap(mainBox, box))
      .map((box) => box.id)
    : [];
  const invalidSpaces = spaces.filter((space) => !isValidBox(space)).map((space) => `${space.source}:F${space.floor}`);
  const roomsOutsideInterior = rooms
    .filter((room) => !roomContainedByInterior(room, spaces))
    .map((room) => room.id);
  const overlappingRooms = roomOverlaps(rooms).map(([a, b]) => `${a}/${b}`);
  const doorIssues = validateInteriorDoorGeometry(blueprint.layout?.interiorDoors || [], rooms, shellThickness);
  const mainDoorIssues = validateMainDoorGeometry(blueprint.paths?.mainDoor, rooms, mainBox, shellThickness);
  const stairIssues = validateStairGeometry(blueprint.paths?.stairs || [], rooms, floorHeight);
  const floorOpeningIssues = validateFloorOpeningGeometry(blueprint.layout?.floorOpenings || [], blueprint.paths?.stairs || [], rooms, floorHeight, floorCount);

  if (invalidVolumes.length) errors.push(`体块边界无效: ${invalidVolumes.join(', ')}`);
  if (detachedVolumes.length) errors.push(`附属体块未与主体共享墙面或重叠接合: ${detachedVolumes.join(', ')}`);
  if (invalidSpaces.length) errors.push(`室内空间边界无效: ${invalidSpaces.join(', ')}`);
  if (roomsOutsideInterior.length) errors.push(`房间不在任何可用室内空间内: ${roomsOutsideInterior.join(', ')}`);
  if (overlappingRooms.length) errors.push(`同层房间发生平面重叠: ${overlappingRooms.join(', ')}`);
  if (doorIssues.length) errors.push(`门洞空间关系异常: ${doorIssues.join('; ')}`);
  if (mainDoorIssues.length) errors.push(`主入口空间关系异常: ${mainDoorIssues.join('; ')}`);
  if (stairIssues.length) errors.push(`楼梯空间关系异常: ${stairIssues.join('; ')}`);
  if (floorOpeningIssues.length) errors.push(`楼板开洞空间关系异常: ${floorOpeningIssues.join('; ')}`);
  if (!spaces.length) warnings.push('缺少 shell.interiorSpaces，空间几何校验覆盖较弱。');

  const ok = !invalidVolumes.length &&
    !detachedVolumes.length &&
    !invalidSpaces.length &&
    !roomsOutsideInterior.length &&
    !overlappingRooms.length &&
    !doorIssues.length &&
    !mainDoorIssues.length &&
    !stairIssues.length &&
    !floorOpeningIssues.length;

  checks.push(check('spatial-geometry', ok, {
    roomCount: rooms.length,
    interiorSpaceCount: spaces.length,
    detachedVolumes,
    roomsOutsideInterior,
    overlappingRooms,
    doorIssueCount: doorIssues.length,
    mainDoorIssueCount: mainDoorIssues.length,
    stairIssueCount: stairIssues.length,
    floorOpeningIssueCount: floorOpeningIssues.length
  }));

  return {
    roomCount: rooms.length,
    interiorSpaceCount: spaces.length,
    detachedVolumes,
    roomsOutsideInterior,
    overlappingRooms,
    doorIssues,
    mainDoorIssues,
    stairIssues,
    floorOpeningIssues
  };
}

function validateCirculation(blueprint, errors, warnings, checks) {
  const rooms = blueprint.layout?.rooms || [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const graph = buildRoomGraph(blueprint);
  const entryId = rooms.find((room) => room.id === 'entry')?.id || rooms.find((room) => room.type === 'entry')?.id;
  const reachable = entryId ? reachableFrom(graph, entryId) : new Set();
  const unreachableRooms = [...roomIds].filter((id) => !reachable.has(id));
  const floors = Number(blueprint.buildSpec?.floors || 1);
  const stairs = blueprint.paths?.stairs || [];
  const floorOpenings = blueprint.layout?.floorOpenings || [];
  const mainDoor = blueprint.paths?.mainDoor;
  const failedEdgeCount = Number(blueprint.geometry?.pathfinder?.failedEdgeCount || 0);

  if (!mainDoor) errors.push('缺少主入口门洞。');
  if ((blueprint.modules?.door || 0) <= 0) errors.push('蓝图中没有门模块。');
  if (floors > 1 && !stairs.length) errors.push('多层建筑缺少楼梯。');
  if (floors > 1 && floorOpenings.length < floors - 1) warnings.push('楼板开洞数量少于楼层连接需求。');
  if (failedEdgeCount > 0) errors.push(`A* 存在 ${failedEdgeCount} 条未连通边。`);
  if (unreachableRooms.length) warnings.push(`存在未从入口连通的房间: ${unreachableRooms.join(', ')}`);

  checks.push(check('circulation', Boolean(mainDoor) && failedEdgeCount === 0 && (floors <= 1 || stairs.length > 0), {
    entryId,
    reachableRoomCount: reachable.size,
    unreachableRooms,
    stairCount: stairs.length,
    floorOpeningCount: floorOpenings.length,
    failedEdgeCount
  }));

  return {
    entryId,
    reachableRoomCount: reachable.size,
    unreachableRooms,
    stairCount: stairs.length,
    floorOpeningCount: floorOpenings.length,
    failedEdgeCount
  };
}

function validateSemanticCompleteness(blueprint, errors, warnings, checks) {
  const modules = blueprint.modules || {};
  const rooms = blueprint.layout?.rooms || [];
  const decorator = blueprint.decorator || {};
  const hasShell = (modules.walls || 0) + (modules.wing || 0) + (modules.tower || 0) + (modules.sunroom || 0) > 0;
  const hasRoof = (modules.roof || 0) + (modules.roof_detail || 0) > 0;
  const hasInterior = rooms.length > 0 && (modules.interior || 0) > 0;
  const hasDecoration = Boolean(decorator.enabled) && Number(decorator.placementCount || 0) > 0;

  if (!hasShell) errors.push('缺少建筑外壳模块。');
  if (!hasRoof) warnings.push('缺少屋顶模块。');
  if (!hasInterior) warnings.push('室内隔墙或房间布局模块较弱。');
  if (!hasDecoration) warnings.push('没有写入室内装饰。');

  checks.push(check('semantic-completeness', hasShell && hasRoof && rooms.length > 0, {
    hasShell,
    hasRoof,
    hasInterior,
    hasDecoration,
    decoratorPlacements: decorator.placementCount || 0
  }));

  return {
    hasShell,
    hasRoof,
    hasInterior,
    hasDecoration,
    decoratorPlacements: decorator.placementCount || 0
  };
}

function validateAgentContracts(blueprint, errors, warnings, checks) {
  const missing = [];
  const sourceMismatches = [];
  const summaryMismatches = [];

  for (const [key, expectedSource] of AGENT_CONTRACTS) {
    const output = blueprint[key];
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      missing.push(key);
      continue;
    }
    if (output.source && output.source !== expectedSource) {
      sourceMismatches.push({ key, expectedSource, actualSource: output.source });
    }
  }

  for (const key of missing) errors.push(`缺少 agent 输出: ${key}`);
  for (const item of sourceMismatches) {
    warnings.push(`${item.key} 来源不是预期 agent: ${item.actualSource}，预期 ${item.expectedSource}`);
  }

  const materialWarnings = blueprint.materialPalette?.warnings || [];
  const materialValid = blueprint.materialPalette?.valid !== false;
  if (!materialValid) errors.push(`MaterialPaletteAgent 输出包含非法方块: ${materialWarnings.join('; ') || 'unknown'}`);
  if (materialWarnings.length && materialValid) warnings.push(`MaterialPaletteAgent 材料警告: ${materialWarnings.join('; ')}`);

  const paletteMismatches = materialPaletteMismatches(blueprint);
  if (paletteMismatches.length) {
    errors.push(`architecture.materials 未同步 MaterialPaletteAgent: ${paletteMismatches.join(', ')}`);
  }

  compareSummaryCount(summaryMismatches, 'structure.support_elements', blueprint.structure?.support_elements, blueprint.geometry?.structure?.supportElementCount);
  compareSummaryCount(summaryMismatches, 'facade.facade_elements', blueprint.facade?.facade_elements, blueprint.geometry?.facade?.elementCount);
  compareSummaryCount(summaryMismatches, 'roof.elements', blueprint.roof?.elements, blueprint.geometry?.roof?.elementCount);
  compareSummaryCount(summaryMismatches, 'site.zones', blueprint.site?.zones, blueprint.geometry?.site?.zoneCount);

  for (const item of summaryMismatches) {
    errors.push(`${item.name} 与 geometry 摘要数量不一致: agent=${item.expected}, geometry=${item.actual}`);
  }

  const openingPlanned = numberOrUndefined(blueprint.opening?.engine_hints?.planned_opening_count);
  const pathfinderPlanned = numberOrUndefined(blueprint.geometry?.pathfinder?.plannedOpeningCount);
  const openingMismatch = openingPlanned !== undefined && pathfinderPlanned !== undefined && openingPlanned !== pathfinderPlanned;
  if (openingMismatch) {
    errors.push(`OpeningConnectivityAgent 计划开口数与 A* 记录不一致: opening=${openingPlanned}, pathfinder=${pathfinderPlanned}`);
  }

  const interiorRoomCount = numberOrUndefined(blueprint.interior?.room_count);
  const actualRoomCount = (blueprint.layout?.rooms || []).length;
  const interiorMismatch = interiorRoomCount !== undefined && interiorRoomCount !== actualRoomCount;
  if (interiorMismatch) {
    errors.push(`InteriorDetailAgent 房间数与 BSP 结果不一致: interior=${interiorRoomCount}, rooms=${actualRoomCount}`);
  }

  const failedRepairChecks = (blueprint.repair?.checks || []).filter((item) => !item.ok).map((item) => item.name);
  if (blueprint.repair && blueprint.repair.ok === false) {
    warnings.push(`ConstraintRepairAgent 标记需关注: ${failedRepairChecks.join(', ') || blueprint.repair.suggestions?.join('; ') || 'unknown'}`);
  }

  const ok = !missing.length &&
    !sourceMismatches.length &&
    materialValid &&
    !paletteMismatches.length &&
    !summaryMismatches.length &&
    !openingMismatch &&
    !interiorMismatch &&
    blueprint.repair?.ok !== false;

  checks.push(check('agent-contracts', ok, {
    requiredAgentCount: AGENT_CONTRACTS.length,
    missing,
    sourceMismatches,
    materialValid,
    paletteMismatches,
    summaryMismatches,
    openingPlanned,
    pathfinderPlanned,
    interiorRoomCount,
    actualRoomCount,
    repairOk: blueprint.repair?.ok !== false,
    failedRepairChecks
  }));

  return {
    requiredAgentCount: AGENT_CONTRACTS.length,
    missing,
    sourceMismatches,
    materialValid,
    paletteMismatches,
    summaryMismatches,
    openingPlanned,
    pathfinderPlanned,
    interiorRoomCount,
    actualRoomCount,
    repairOk: blueprint.repair?.ok !== false,
    failedRepairChecks
  };
}

function normalizeRoomBox(room = {}) {
  return normalizeSpatialBox(room, {
    id: String(room.id || 'room'),
    source: String(room.source || ''),
    floor: numberOrUndefined(room.floor) ?? 0,
    type: String(room.type || 'room')
  });
}

function normalizeInteriorSpace(space = {}) {
  return normalizeSpatialBox(space, {
    id: `${space.source || 'space'}:F${space.floor || 0}`,
    source: String(space.source || ''),
    floor: numberOrUndefined(space.floor) ?? 0
  });
}

function normalizeVolumeBox(box = {}) {
  return normalizeSpatialBox(box, {
    id: String(box.id || 'volume'),
    source: String(box.id || ''),
    module: String(box.module || ''),
    boolean_mode: String(box.boolean_mode || box.booleanMode || 'union')
  });
}

function normalizeSpatialBox(value = {}, extra = {}) {
  return {
    ...extra,
    min_x: readCoordinate(value, 'min_x', 'minX'),
    max_x: readCoordinate(value, 'max_x', 'maxX'),
    min_y: readCoordinate(value, 'min_y', 'minY'),
    max_y: readCoordinate(value, 'max_y', 'maxY'),
    min_z: readCoordinate(value, 'min_z', 'minZ'),
    max_z: readCoordinate(value, 'max_z', 'maxZ')
  };
}

function readCoordinate(value, snakeKey, camelKey) {
  const bounds = value.bounds || {};
  const raw = value[snakeKey] ?? value[camelKey] ?? bounds[camelKey];
  const number = Number(raw);
  return Number.isFinite(number) ? number : NaN;
}

function isValidBox(box) {
  return ['min_x', 'max_x', 'min_y', 'max_y', 'min_z', 'max_z'].every((keyName) => Number.isFinite(box[keyName])) &&
    box.min_x <= box.max_x &&
    box.min_y <= box.max_y &&
    box.min_z <= box.max_z;
}

function hasFaceContactOrOverlap(a, b) {
  if (!isValidBox(a) || !isValidBox(b)) return false;
  const yOverlap = rangesOverlap(a.min_y, a.max_y, b.min_y, b.max_y);
  const xOverlap = rangesOverlap(a.min_x, a.max_x, b.min_x, b.max_x);
  const zOverlap = rangesOverlap(a.min_z, a.max_z, b.min_z, b.max_z);
  const xFaceContact = (a.max_x + 1 === b.min_x || b.max_x + 1 === a.min_x) && zOverlap;
  const zFaceContact = (a.max_z + 1 === b.min_z || b.max_z + 1 === a.min_z) && xOverlap;
  return yOverlap && ((xOverlap && zOverlap) || xFaceContact || zFaceContact);
}

function roomContainedByInterior(room, spaces) {
  if (!spaces.length) return true;
  const sameSource = spaces.filter((space) => space.floor === room.floor && room.source && space.source === room.source);
  const candidates = sameSource.length ? sameSource : spaces.filter((space) => space.floor === room.floor);
  return candidates.some((space) => containsBox(space, room));
}

function containsBox(outer, inner) {
  return isValidBox(outer) && isValidBox(inner) &&
    inner.min_x >= outer.min_x &&
    inner.max_x <= outer.max_x &&
    inner.min_y >= outer.min_y &&
    inner.max_y <= outer.max_y &&
    inner.min_z >= outer.min_z &&
    inner.max_z <= outer.max_z;
}

function roomOverlaps(rooms) {
  const overlaps = [];
  const validRooms = rooms.filter(isValidBox);
  for (let i = 0; i < validRooms.length; i += 1) {
    for (let j = i + 1; j < validRooms.length; j += 1) {
      const a = validRooms[i];
      const b = validRooms[j];
      if (a.floor !== b.floor) continue;
      if (overlapArea2d(a, b) > 0) overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}

function validateInteriorDoorGeometry(doors, rooms, shellThickness) {
  const issues = [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  for (const door of doors) {
    const connects = Array.isArray(door.connects) ? door.connects.filter(Boolean) : [];
    const label = connects.join('<->') || door.kind || 'door';
    if (!door.at || !Number.isFinite(Number(door.at.x)) || !Number.isFinite(Number(door.at.z))) {
      issues.push(`${label} 缺少门洞坐标`);
      continue;
    }
    if (!['x', 'z'].includes(String(door.axis))) {
      issues.push(`${label} 门洞轴向无效`);
      continue;
    }
    if (connects.length < 2) {
      issues.push(`${label} 未声明两侧房间`);
      continue;
    }
    const connectedRooms = connects.map((id) => roomById.get(id));
    const missing = connects.filter((id, index) => !connectedRooms[index]);
    if (missing.length) {
      issues.push(`${label} 引用不存在房间 ${missing.join(',')}`);
      continue;
    }
    const floor = numberOrUndefined(door.floor) ?? connectedRooms[0].floor;
    if (connectedRooms.some((room) => room.floor !== floor)) {
      issues.push(`${label} 门洞楼层与房间楼层不一致`);
      continue;
    }
    const missedRooms = connectedRooms.filter((room) => !doorReachesRoom(door, room, shellThickness + 1));
    if (missedRooms.length) issues.push(`${label} 未贴到房间 ${missedRooms.map((room) => room.id).join(',')}`);
  }
  return issues;
}

function validateMainDoorGeometry(mainDoor, rooms, mainBox, shellThickness) {
  const issues = [];
  if (!mainDoor || !mainBox) return issues;
  const target = rooms.find((room) => room.id === mainDoor.targetRoom);
  if (!target) {
    if (mainDoor.targetRoom) issues.push(`目标房间不存在: ${mainDoor.targetRoom}`);
    return issues;
  }
  if (target.floor !== 0) issues.push(`主入口目标不在一层: ${target.id}`);
  if (!mainDoorReachesRoom(mainDoor, target, mainBox, shellThickness + 1)) {
    issues.push(`主入口未贴到目标房间 ${target.id}`);
  }
  return issues;
}

function validateStairGeometry(stairs, rooms, floorHeight) {
  const issues = [];
  const roomByFloor = new Map(rooms.map((room) => [`${room.id}:F${room.floor}`, room]));
  for (const step of stairs) {
    const floor = numberOrUndefined(step.floor) ?? 0;
    const room = roomByFloor.get(`${step.sourceRoom}:F${floor}`);
    if (!room) continue;
    if (!pointInBox2d(room, Number(step.x), Number(step.z))) {
      issues.push(`${step.sourceRoom}:F${floor} 第 ${step.step} 级越出楼梯间`);
    }
    const expectedY = floor * floorHeight + 2 + Number(step.step || 0);
    if (Number(step.y) !== expectedY) issues.push(`${step.sourceRoom}:F${floor} 第 ${step.step} 级高度应为 ${expectedY}`);
  }
  return issues;
}

function validateFloorOpeningGeometry(openings, stairs, rooms, floorHeight, floorCount) {
  const issues = [];
  const roomByFloor = new Map(rooms.map((room) => [`${room.id}:F${room.floor}`, room]));
  for (const opening of openings) {
    const floor = numberOrUndefined(opening.floor);
    if (floor === undefined) {
      issues.push('楼板开洞缺少楼层');
      continue;
    }
    const expectedY = floor * floorHeight + 1;
    if (Number(opening.y) !== expectedY) issues.push(`F${floor} 楼板开洞高度应为 ${expectedY}`);
    const lowerRoom = roomByFloor.get(`${opening.sourceRoom}:F${floor - 1}`);
    if (lowerRoom && !rectInsideRoom2d(opening, lowerRoom)) {
      issues.push(`${opening.sourceRoom}:F${floor - 1} 楼板开洞不在楼梯间投影内`);
    }
    const topStep = stairs.find((step) => Number(step.floor) === floor - 1 && Number(step.step) === floorHeight - 1);
    if (topStep && !pointInOpening(opening, Number(topStep.x), Number(topStep.z))) {
      issues.push(`F${floor} 楼板开洞未覆盖上一层楼梯末级`);
    }
  }
  if (floorCount > 1 && openings.length > 0) {
    const floorsWithOpenings = new Set(openings.map((opening) => Number(opening.floor)));
    for (let floor = 1; floor < floorCount; floor += 1) {
      if (!floorsWithOpenings.has(floor)) issues.push(`缺少 F${floor} 楼板开洞`);
    }
  }
  return issues;
}

function doorReachesRoom(door, room, tolerance) {
  const x = Number(door.at.x);
  const z = Number(door.at.z);
  if (door.axis === 'x') {
    return rangesOverlap(z - 1, z + 1, room.min_z, room.max_z) &&
      x >= room.min_x - tolerance &&
      x <= room.max_x + tolerance;
  }
  return rangesOverlap(x - 1, x + 1, room.min_x, room.max_x) &&
    z >= room.min_z - tolerance &&
    z <= room.max_z + tolerance;
}

function mainDoorReachesRoom(mainDoor, room, mainBox, tolerance) {
  const side = String(mainDoor.side || 'south');
  const width = clampInt(mainDoor.width || 1, 1, 8, 1);
  if (['east', 'west'].includes(side)) {
    const x = side === 'east' ? mainBox.max_x : mainBox.min_x;
    const z1 = Number(mainDoor.z);
    const z2 = z1 + width - 1;
    return rangesOverlap(z1, z2, room.min_z, room.max_z) &&
      x >= room.min_x - tolerance &&
      x <= room.max_x + tolerance;
  }
  const z = side === 'south' ? mainBox.max_z : mainBox.min_z;
  const x1 = Number(mainDoor.x);
  const x2 = x1 + width - 1;
  return rangesOverlap(x1, x2, room.min_x, room.max_x) &&
    z >= room.min_z - tolerance &&
    z <= room.max_z + tolerance;
}

function rectInsideRoom2d(rect, room) {
  return Number(rect.min_x) >= room.min_x &&
    Number(rect.max_x) <= room.max_x &&
    Number(rect.min_z) >= room.min_z &&
    Number(rect.max_z) <= room.max_z;
}

function pointInOpening(opening, x, z) {
  return x >= Number(opening.min_x) &&
    x <= Number(opening.max_x) &&
    z >= Number(opening.min_z) &&
    z <= Number(opening.max_z);
}

function pointInBox2d(box, x, z) {
  return x >= box.min_x && x <= box.max_x && z >= box.min_z && z <= box.max_z;
}

function overlapArea2d(a, b) {
  const x = Math.max(0, Math.min(a.max_x, b.max_x) - Math.max(a.min_x, b.min_x) + 1);
  const z = Math.max(0, Math.min(a.max_z, b.max_z) - Math.max(a.min_z, b.min_z) + 1);
  return x * z;
}

function rangesOverlap(aMin, aMax, bMin, bMax) {
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
}

function buildRoomGraph(blueprint) {
  const graph = new Map();
  for (const room of blueprint.layout?.rooms || []) graph.set(room.id, new Set());

  for (const door of blueprint.layout?.interiorDoors || []) {
    addConnects(graph, door.connects || []);
  }
  for (const edge of blueprint.paths?.openedEdges || []) {
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

function check(name, ok, details = {}) {
  return { name, ok, details };
}

function operationVolume(operation) {
  return (
    Math.abs(operation.to.x - operation.from.x) + 1
  ) * (
    Math.abs(operation.to.y - operation.from.y) + 1
  ) * (
    Math.abs(operation.to.z - operation.from.z) + 1
  );
}

function materialPaletteMismatches(blueprint) {
  const paletteMaterials = blueprint.materialPalette?.materials || {};
  const architectureMaterials = blueprint.architecture?.materials || {};
  const mismatches = [];
  for (const [role, block] of Object.entries(paletteMaterials)) {
    if (architectureMaterials[role] !== block) mismatches.push(role);
  }
  return mismatches;
}

function compareSummaryCount(mismatches, name, agentArray, geometryCount) {
  if (!Array.isArray(agentArray)) return;
  if (geometryCount === undefined) {
    mismatches.push({ name, expected: agentArray.length, actual: 'missing' });
    return;
  }
  const actual = Number(geometryCount);
  if (!Number.isFinite(actual) || actual !== agentArray.length) {
    mismatches.push({ name, expected: agentArray.length, actual: geometryCount });
  }
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
