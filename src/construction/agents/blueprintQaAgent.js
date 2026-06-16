const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;
const MAX_FILL_VOLUME = 32768;

export class BlueprintQAAgent {
  run(blueprint) {
    const errors = [];
    const warnings = [];
    const checks = [];

    const commandStats = validateOperations(blueprint.operations || [], errors, checks);
    const boundsStats = validateBounds(blueprint.bounds || {}, warnings, checks);
    const exporterStats = validateExporter(blueprint, errors, warnings, checks);
    const roomStats = validateRooms(blueprint, errors, warnings, checks);
    const circulationStats = validateCirculation(blueprint, errors, warnings, checks);
    const semanticStats = validateSemanticCompleteness(blueprint, errors, warnings, checks);

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
        circulation: circulationStats,
        semantic: semanticStats
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
