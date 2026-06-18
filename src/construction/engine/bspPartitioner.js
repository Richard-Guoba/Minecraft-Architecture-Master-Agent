import { fillBox } from './csgBuilder.js';

export class BSPPartitioner {
  constructor(buildSpec, materials) {
    this.spec = buildSpec;
    this.materials = materials;
  }

  fitRooms(shell, plannerJson = {}) {
    const rooms = [];
    const interiorDoors = [];
    const floorOpenings = [];
    const nodes = Array.isArray(plannerJson.nodes) ? plannerJson.nodes : [];
    const mainBox = shell.volumeBoxes.find((box) => box.id === 'main') || shell.volumeBoxes[0];
    const assignedNodeIds = new Set();
    const attachedRooms = this.fitAttachedVolumeRooms(shell, nodes, assignedNodeIds, mainBox);
    const mainRooms = [];

    for (let floor = 0; floor < this.spec.floors; floor += 1) {
      let floorNodes = nodes.filter((node) => Number(node.floor || 0) === floor && !assignedNodeIds.has(node.id) && node.type !== 'balcony');
      if (floor > 0) floorNodes = floorNodes.filter((node) => node.type !== 'stairs');
      if (!floorNodes.length) floorNodes = fallbackNodes(floor);
      floorNodes = orderNodesForFloor(floorNodes, plannerJson, this.spec, floor);

      const mainSpace = shell.interiorSpaces.find((space) => space.source === 'main' && Number(space.floor) === floor);
      const rect = mainSpace ? rectFromSpace(mainSpace, 'main') : fallbackMainRect(mainBox, this.spec, floor);
      mainRooms.push(...this.partition(shell.grid, rect, floorNodes, 0, interiorDoors, plannerJson.bsp_hints || {}));
    }

    rooms.push(...mainRooms, ...attachedRooms);
    this.connectAttachedRooms(shell.grid, attachedRooms, mainRooms, mainBox, interiorDoors);
    normalizeRoomIdsAndDoors(rooms, interiorDoors);
    sanitizeInteriorDoors(rooms, interiorDoors, { tolerance: clampInt(this.spec.shell_thickness || 1, 1, 3) + 1 });

    const roomIds = new Set(rooms.map((room) => room.id));
    const unassignedPlannerNodes = nodes
      .filter((node) => !roomIds.has(node.id) && node.type !== 'balcony')
      .map((node) => node.id);

    return {
      rooms,
      interiorDoors,
      floorOpenings,
      bsp: {
        nodeCount: nodes.length,
        edgeCount: (plannerJson.edges || []).length,
        roomCount: rooms.length,
        specialRoomCount: attachedRooms.length,
        assignedVolumeCount: attachedRooms.filter((room) => room.assigned_node).length,
        attachedDoorCount: interiorDoors.filter((door) => door.kind === 'attached-volume').length,
        openPlanSoftBoundaries: interiorDoors.filter((door) => door.kind === 'open-plan-threshold').length,
        unassignedPlannerNodes,
        splitStrategy: plannerJson.bsp_hints?.split_strategy || 'weighted',
        templateSpacePlanning: plannerJson.bsp_hints?.template_space_planning_active ? {
          active: true,
          viewSide: plannerJson.bsp_hints.template_view_side,
          serviceSide: plannerJson.bsp_hints.template_service_side,
          quietSide: plannerJson.bsp_hints.template_quiet_side,
          entrySequence: plannerJson.bsp_hints.template_entry_sequence || []
        } : { active: false }
      }
    };
  }

  fitAttachedVolumeRooms(shell, nodes, assignedNodeIds, mainBox) {
    const boxById = new Map(shell.volumeBoxes.map((box) => [box.id, box]));
    const spaces = shell.interiorSpaces
      .filter((space) => space.source !== 'main')
      .filter((space) => isHabitableAttachedVolume(boxById.get(space.source) || { id: space.source }))
      .filter((space) => spanSize(space.min_x, space.max_x) >= 3 && spanSize(space.min_z, space.max_z) >= 3)
      .sort((a, b) => volumeSortScore(boxById.get(a.source)) - volumeSortScore(boxById.get(b.source)) ||
        a.floor - b.floor ||
        rectArea(b) - rectArea(a));
    const rooms = [];

    for (const space of spaces) {
      if (rooms.some((room) => isMostlyCoveredByRoom(space, room))) continue;
      const box = boxById.get(space.source) || { id: space.source, module: 'attached', side: space.side };
      const node = matchNodeForSpace(space, box, nodes, assignedNodeIds);
      if (!node && !shouldCreateFallbackAttachedRoom(box)) continue;
      const fallback = fallbackNodeForSpace(space, box);
      const outsideRoom = trimAttachedRoomOutsideMain(roomFromSpace(space, node || fallback, box, Boolean(node)), mainBox, this.spec);
      const room = trimAttachedRoomAgainstExisting(outsideRoom, rooms);
      if (spanSize(room.min_x, room.max_x) < 3 || spanSize(room.min_z, room.max_z) < 3) continue;
      if (node) assignedNodeIds.add(node.id);
      rooms.push(room);
    }

    return rooms;
  }

  connectAttachedRooms(grid, attachedRooms, mainRooms, mainBox, interiorDoors) {
    for (const room of attachedRooms) {
      const door = attachedDoorForRoom(room, mainBox, this.spec);
      if (!door) continue;
      fillBox(grid, door.min_x, door.min_y, door.min_z, door.max_x, door.max_y, door.max_z, 'minecraft:air', 'interior');
      const candidates = mainRooms.filter((candidate) => candidate.floor === room.floor);
      const target = roomAtDoor(door, candidates, mainBox, this.spec) || nearestRoom(room, candidates);
      interiorDoors.push({
        kind: 'attached-volume',
        floor: room.floor,
        axis: door.axis,
        at: door.at,
        connects: [target?.id, room.id].filter(Boolean),
        source: room.source
      });
    }
  }

  partition(grid, rect, nodes, depth, interiorDoors, hints = {}) {
    if (!nodes.length) return [];
    if (nodes.length <= 1) return [roomFromRect(rect, nodes[0] || fallbackNodes(rect.floor)[0])];

    const width = rect.max_x - rect.min_x + 1;
    const depthSize = rect.max_z - rect.min_z + 1;
    if (width < 8 || depthSize < 8) return this.partitionLinear(grid, rect, nodes, interiorDoors, hints);

    let axis = chooseAxis(rect, depth, nodes, hints, this.spec);
    if (!canSplit(rect, axis)) axis = axis === 'x' ? 'z' : 'x';
    if (!canSplit(rect, axis)) return this.partitionLinear(grid, rect, nodes, interiorDoors, hints);

    const [leftNodes, rightNodes] = splitNodes(nodes);
    if (!leftNodes.length || !rightNodes.length) return this.partitionLinear(grid, rect, nodes, interiorDoors, hints);

    const ratio = weightSum(leftNodes) / Math.max(0.1, weightSum(nodes));
    const wallBlock = this.materials.interior_wall || 'minecraft:birch_planks';
    const softBoundary = shouldUseSoftBoundary(leftNodes, rightNodes, hints);
    const rooms = [];

    if (axis === 'x') {
      const splitX = clampInt(Math.round(rect.min_x + (rect.max_x - rect.min_x) * ratio), rect.min_x + 4, rect.max_x - 4);
      if (!softBoundary) fillBox(grid, splitX, rect.min_y, rect.min_z, splitX, rect.max_y, rect.max_z, wallBlock, 'interior');
      const leftRooms = this.partition(grid, { ...rect, max_x: splitX - 1 }, leftNodes, depth + 1, interiorDoors, hints);
      const rightRooms = this.partition(grid, { ...rect, min_x: splitX + 1 }, rightNodes, depth + 1, interiorDoors, hints);
      const door = doorForSplit(leftRooms, rightRooms, axis, splitX, rect);
      if (door) {
        if (!softBoundary) carveOpening(grid, splitX, rect.min_y, door.at.z, axis);
        interiorDoors.push({
          kind: softBoundary ? 'open-plan-threshold' : 'bsp-door',
          floor: rect.floor,
          axis,
          at: door.at,
          connects: door.connects
        });
      }
      rooms.push(...leftRooms, ...rightRooms);
      return rooms;
    }

    const splitZ = clampInt(Math.round(rect.min_z + (rect.max_z - rect.min_z) * ratio), rect.min_z + 4, rect.max_z - 4);
    if (!softBoundary) fillBox(grid, rect.min_x, rect.min_y, splitZ, rect.max_x, rect.max_y, splitZ, wallBlock, 'interior');
    const leftRooms = this.partition(grid, { ...rect, max_z: splitZ - 1 }, leftNodes, depth + 1, interiorDoors, hints);
    const rightRooms = this.partition(grid, { ...rect, min_z: splitZ + 1 }, rightNodes, depth + 1, interiorDoors, hints);
    const door = doorForSplit(leftRooms, rightRooms, axis, splitZ, rect);
    if (door) {
      if (!softBoundary) carveOpening(grid, door.at.x, rect.min_y, splitZ, axis);
      interiorDoors.push({
        kind: softBoundary ? 'open-plan-threshold' : 'bsp-door',
        floor: rect.floor,
        axis,
        at: door.at,
        connects: door.connects
      });
    }
    rooms.push(...leftRooms, ...rightRooms);
    return rooms;
  }

  partitionLinear(grid, rect, nodes, interiorDoors, hints = {}) {
    if (!nodes.length) return [];
    if (nodes.length === 1) return [roomFromRect(rect, nodes[0])];

    const width = rect.max_x - rect.min_x + 1;
    const depthSize = rect.max_z - rect.min_z + 1;
    const axis = width >= depthSize ? 'x' : 'z';
    const totalSpan = axis === 'x' ? width : depthSize;
    const tightMode = totalSpan < nodes.length * 3 + nodes.length - 1;
    const minSpan = tightMode ? (totalSpan >= nodes.length * 2 ? 2 : 1) : 3;
    const gap = tightMode ? 0 : 1;
    if (totalSpan < nodes.length * minSpan + gap * (nodes.length - 1)) return this.partitionPackedGrid(rect, nodes);

    const wallBlock = this.materials.interior_wall || 'minecraft:birch_planks';
    const maxCoord = axis === 'x' ? rect.max_x : rect.max_z;
    let cursor = axis === 'x' ? rect.min_x : rect.min_z;
    let remainingWeight = weightSum(nodes);
    const rooms = [];

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const remainingNodes = nodes.length - index - 1;
      const available = maxCoord - cursor + 1;
      const maxRoomSpan = available - remainingNodes * (minSpan + gap);
      const desired = Math.round(available * Number(node.weight || 1) / Math.max(0.1, remainingWeight));
      const span = index === nodes.length - 1 ? available : clampInt(desired, minSpan, Math.max(minSpan, maxRoomSpan));
      const end = Math.min(maxCoord, cursor + span - 1);
      const roomRect = axis === 'x'
        ? { ...rect, min_x: cursor, max_x: end }
        : { ...rect, min_z: cursor, max_z: end };
      rooms.push(roomFromRect(roomRect, node));
      remainingWeight -= Number(node.weight || 1);

      if (index < nodes.length - 1) {
        const wall = gap ? end + 1 : end;
        const softBoundary = shouldUseSoftBoundary([node], [nodes[index + 1]], hints);
        if (axis === 'x') {
          if (!softBoundary && gap) {
            fillBox(grid, wall, rect.min_y, rect.min_z, wall, rect.max_y, rect.max_z, wallBlock, 'interior');
            carveOpening(grid, wall, rect.min_y, Math.floor((rect.min_z + rect.max_z) / 2), axis);
          }
          interiorDoors.push({
            kind: softBoundary || tightMode ? 'open-plan-threshold' : 'bsp-door',
            floor: rect.floor,
            axis,
            at: { x: wall, z: Math.floor((rect.min_z + rect.max_z) / 2) },
            connects: [node.id, nodes[index + 1]?.id].filter(Boolean)
          });
        } else {
          if (!softBoundary && gap) {
            fillBox(grid, rect.min_x, rect.min_y, wall, rect.max_x, rect.max_y, wall, wallBlock, 'interior');
            carveOpening(grid, Math.floor((rect.min_x + rect.max_x) / 2), rect.min_y, wall, axis);
          }
          interiorDoors.push({
            kind: softBoundary || tightMode ? 'open-plan-threshold' : 'bsp-door',
            floor: rect.floor,
            axis,
            at: { x: Math.floor((rect.min_x + rect.max_x) / 2), z: wall },
            connects: [node.id, nodes[index + 1]?.id].filter(Boolean)
          });
        }
        cursor = end + gap + 1;
      }
    }

    return rooms;
  }

  partitionPackedGrid(rect, nodes) {
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / columns);
    const cellWidth = Math.max(1, Math.floor((rect.max_x - rect.min_x + 1) / columns));
    const cellDepth = Math.max(1, Math.floor((rect.max_z - rect.min_z + 1) / rows));
    return nodes.map((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const minX = rect.min_x + column * cellWidth;
      const minZ = rect.min_z + row * cellDepth;
      const maxX = column === columns - 1 ? rect.max_x : Math.min(rect.max_x, minX + cellWidth - 1);
      const maxZ = row === rows - 1 ? rect.max_z : Math.min(rect.max_z, minZ + cellDepth - 1);
      return roomFromRect({ ...rect, min_x: minX, max_x: maxX, min_z: minZ, max_z: maxZ }, node);
    });
  }
}

function carveOpening(grid, x, minY, z, axis) {
  if (axis === 'x') {
    for (const dz of [-1, 0, 1]) {
      for (let dy = 0; dy < 3; dy += 1) grid.delete(`${x},${minY + dy},${z + dz}`);
    }
  } else {
    for (const dx of [-1, 0, 1]) {
      for (let dy = 0; dy < 3; dy += 1) grid.delete(`${x + dx},${minY + dy},${z}`);
    }
  }
}

function chooseAxis(rect, depth, nodes, hints = {}, spec = {}) {
  const strategy = String(hints.split_strategy || 'weighted');
  const width = rect.max_x - rect.min_x + 1;
  const depthSize = rect.max_z - rect.min_z + 1;
  if (depth === 0 && Number(rect.floor || 0) === 0 && hints.keep_entry_on_front !== false && nodes.some((node) => node.id === 'entry' || node.access === 'main-door')) {
    return ['north', 'south'].includes(String(spec.door_side || 'south')) ? 'z' : 'x';
  }
  if (strategy === 'courtyard-ring' && depth === 0) return ['north', 'south'].includes(spec.door_side) ? 'z' : 'x';
  if (strategy === 'front-back-bands' && depth <= 1) return ['north', 'south'].includes(spec.door_side) ? 'z' : 'x';
  if (strategy === 'side-bands' && depth <= 1) return ['north', 'south'].includes(spec.door_side) ? 'x' : 'z';
  if (strategy === 'cross-axis') return depth % 2 === 0 ? (width >= depthSize ? 'x' : 'z') : (width >= depthSize ? 'z' : 'x');
  if (strategy === 'view-side-cluster' && depth === 1) return ['north', 'south'].includes(spec.door_side) ? 'x' : 'z';
  if (strategy === 'axis-balanced' && Math.abs(width - depthSize) < 6) return depth % 2 === 0 ? 'x' : 'z';
  if (strategy === 'open-plan-weighted' && nodes.some((node) => node.daylight === 'high')) return width >= depthSize ? 'x' : 'z';
  if (Math.abs(width - depthSize) < 4) return depth % 2 === 0 ? 'x' : 'z';
  return width >= depthSize ? 'x' : 'z';
}

function splitNodes(nodes) {
  const total = weightSum(nodes);
  let running = 0;
  for (let index = 1; index < nodes.length; index += 1) {
    running += Number(nodes[index - 1].weight || 1);
    if (running >= total / 2) return [nodes.slice(0, index), nodes.slice(index)];
  }
  return [nodes.slice(0, 1), nodes.slice(1)];
}

function doorForSplit(leftRooms, rightRooms, axis, splitCoord, rect) {
  const candidates = [];
  for (const left of leftRooms) {
    for (const right of rightRooms) {
      if (axis === 'x') {
        const overlapStart = Math.max(left.min_z, right.min_z);
        const overlapEnd = Math.min(left.max_z, right.max_z);
        if (overlapStart > overlapEnd) continue;
        const leftGap = Math.abs((splitCoord - 1) - left.max_x);
        const rightGap = Math.abs(right.min_x - (splitCoord + 1));
        if (leftGap > 0 || rightGap > 0) continue;
        candidates.push({
          at: { x: splitCoord, z: Math.floor((overlapStart + overlapEnd) / 2) },
          connects: [left.id, right.id].filter(Boolean),
          score: -(overlapEnd - overlapStart + 1)
        });
      } else {
        const overlapStart = Math.max(left.min_x, right.min_x);
        const overlapEnd = Math.min(left.max_x, right.max_x);
        if (overlapStart > overlapEnd) continue;
        const leftGap = Math.abs((splitCoord - 1) - left.max_z);
        const rightGap = Math.abs(right.min_z - (splitCoord + 1));
        if (leftGap > 0 || rightGap > 0) continue;
        candidates.push({
          at: { x: Math.floor((overlapStart + overlapEnd) / 2), z: splitCoord },
          connects: [left.id, right.id].filter(Boolean),
          score: -(overlapEnd - overlapStart + 1)
        });
      }
    }
  }

  if (candidates.length) return candidates.sort((a, b) => a.score - b.score)[0];
  return undefined;
}

function orderNodesForFloor(nodes, plannerJson = {}, spec = {}, floor = 0) {
  const strategy = String(plannerJson.bsp_hints?.split_strategy || 'weighted');
  const publicCore = plannerJson.circulation_rules?.public_core;
  const explicitOrder = explicitRoomOrder(plannerJson.bsp_hints?.room_order_by_floor, floor);
  if (explicitOrder.length) {
    return [...nodes].sort((a, b) => {
      return explicitNodeOrderScore(a, explicitOrder, spec, floor) - explicitNodeOrderScore(b, explicitOrder, spec, floor) ||
        Number(b.weight || 1) - Number(a.weight || 1);
    });
  }
  return [...nodes].sort((a, b) => {
    return nodeOrderScore(a, strategy, publicCore, spec, floor) - nodeOrderScore(b, strategy, publicCore, spec, floor) ||
      Number(b.weight || 1) - Number(a.weight || 1);
  });
}

function nodeOrderScore(node, strategy, publicCore, spec, floor) {
  const frontSide = String(spec.door_side || 'south');
  const entryOnHighSide = ['south', 'east'].includes(frontSide);
  if (floor === 0 && (node.id === 'entry' || node.access === 'main-door')) return entryOnHighSide ? 100 : -100;
  if (floor === 0 && node.type === 'stairs') return entryOnHighSide ? 95 : -95;
  if (node.id === publicCore) return 1;
  if (node.type === 'stairs') return floor === 0 ? 2 : 8;
  if (node.type === 'corridor') return 2;
  if (strategy === 'courtyard-ring' && ['tatami', 'tea_room'].includes(node.type)) return 3;
  if (strategy === 'open-plan-weighted' && ['living', 'dining', 'kitchen'].includes(node.type)) return 3;
  if (strategy === 'front-back-bands' && ['living', 'dining'].includes(node.type)) return 3;
  if (strategy === 'side-bands' && ['kitchen', 'bathroom', 'storage', 'utility'].includes(node.type)) return 3;
  if (strategy === 'view-side-cluster' && ['living', 'sunroom', 'greenhouse', 'lounge'].includes(node.type)) return 3;
  if (['living', 'great_hall', 'lounge'].includes(node.type)) return 4;
  if (['dining', 'kitchen'].includes(node.type)) return 5;
  if (['bathroom', 'storage', 'utility', 'armory', 'garage'].includes(node.type)) return 6;
  if (['master_bedroom', 'bedroom', 'study', 'chapel'].includes(node.type)) return 7;
  return spec.style_family === 'japanese' ? 5 : 8;
}

function shouldUseSoftBoundary(leftNodes, rightNodes, hints = {}) {
  if (!['open-plan-weighted', 'view-side-cluster', 'front-back-bands'].includes(String(hints.split_strategy || ''))) return false;
  if (String(hints.soft_boundary_bias || '') === 'low') return false;
  const openTypes = new Set(['living', 'dining', 'kitchen', 'lounge', 'sunroom']);
  return leftNodes.some((node) => openTypes.has(node.type)) && rightNodes.some((node) => openTypes.has(node.type));
}

function explicitRoomOrder(value = {}, floor = 0) {
  const order = value?.[floor] || value?.[String(floor)];
  return Array.isArray(order) ? order.map((item) => String(item)) : [];
}

function explicitNodeOrderScore(node, order, spec, floor) {
  const frontSide = String(spec.door_side || 'south');
  const entryOnHighSide = ['south', 'east'].includes(frontSide);
  if (floor === 0 && (node.id === 'entry' || node.access === 'main-door')) return entryOnHighSide ? 1000 : -1000;
  if (floor === 0 && node.type === 'stairs') return entryOnHighSide ? 950 : -950;
  const index = order.indexOf(node.id);
  if (index >= 0) return index;
  const typeIndex = order.indexOf(node.type);
  return typeIndex >= 0 ? typeIndex : 500;
}

function canSplit(rect, axis) {
  return axis === 'x' ? rect.max_x - rect.min_x >= 9 : rect.max_z - rect.min_z >= 9;
}

function weightSum(nodes) {
  return nodes.reduce((sum, node) => sum + Number(node.weight || 1), 0);
}

function roomFromRect(rect, node) {
  return {
    id: String(node.id || 'room'),
    label: String(node.label || node.id || '房间'),
    type: String(node.type || 'room'),
    floor: rect.floor,
    min_x: rect.min_x,
    max_x: rect.max_x,
    min_y: rect.min_y,
    max_y: rect.max_y,
    min_z: rect.min_z,
    max_z: rect.max_z,
    source: rect.source || 'main',
    zone: node.zone,
    privacy: node.privacy,
    orientation: node.orientation,
    access: node.access,
    tags: normalizeStringArray(node.tags)
  };
}

function roomFromSpace(space, node, box, assignedNode) {
  return {
    ...roomFromRect(rectFromSpace(space, space.source), node),
    source: space.source,
    volume: {
      id: box.id || space.source,
      module: box.module || 'attached',
      side: box.side || space.side || 'attached'
    },
    assigned_node: assignedNode
  };
}

function trimAttachedRoomOutsideMain(room, mainBox, spec = {}) {
  if (!mainBox || room.source === 'main') return room;
  const thickness = clampInt(spec.shell_thickness || 1, 1, 3);
  const interior = {
    min_x: mainBox.min_x + thickness,
    max_x: mainBox.max_x - thickness,
    min_z: mainBox.min_z + thickness,
    max_z: mainBox.max_z - thickness
  };
  const side = String(room.volume?.side || room.orientation || '').toLowerCase();
  const trimmed = { ...room };

  if (side.includes('north') && trimmed.min_z < interior.min_z && trimmed.max_z >= interior.min_z) {
    trimmed.max_z = Math.min(trimmed.max_z, interior.min_z - 1);
  } else if (side.includes('south') && trimmed.max_z > interior.max_z && trimmed.min_z <= interior.max_z) {
    trimmed.min_z = Math.max(trimmed.min_z, interior.max_z + 1);
  } else if (side.includes('east') && trimmed.max_x > interior.max_x && trimmed.min_x <= interior.max_x) {
    trimmed.min_x = Math.max(trimmed.min_x, interior.max_x + 1);
  } else if (side.includes('west') && trimmed.min_x < interior.min_x && trimmed.max_x >= interior.min_x) {
    trimmed.max_x = Math.min(trimmed.max_x, interior.min_x - 1);
  }

  return trimmed;
}

function trimAttachedRoomAgainstExisting(room, existingRooms = []) {
  let trimmed = { ...room };
  for (const existing of existingRooms) {
    if (Number(existing.floor || 0) !== Number(trimmed.floor || 0)) continue;
    if (overlapArea(trimmed, existing) <= 0) continue;
    const candidates = [];
    if (existing.min_x > trimmed.min_x) candidates.push({ ...trimmed, max_x: existing.min_x - 1 });
    if (existing.max_x < trimmed.max_x) candidates.push({ ...trimmed, min_x: existing.max_x + 1 });
    if (existing.min_z > trimmed.min_z) candidates.push({ ...trimmed, max_z: existing.min_z - 1 });
    if (existing.max_z < trimmed.max_z) candidates.push({ ...trimmed, min_z: existing.max_z + 1 });
    const viable = candidates
      .filter((candidate) => spanSize(candidate.min_x, candidate.max_x) >= 3 && spanSize(candidate.min_z, candidate.max_z) >= 3)
      .sort((a, b) => rectArea(b) - rectArea(a));
    if (!viable.length) return { ...trimmed, max_x: trimmed.min_x - 1 };
    trimmed = viable[0];
  }
  return trimmed;
}

function rectFromSpace(space, source) {
  return {
    floor: Number(space.floor || 0),
    min_x: space.min_x,
    max_x: space.max_x,
    min_y: space.min_y,
    max_y: space.max_y,
    min_z: space.min_z,
    max_z: space.max_z,
    source
  };
}

function fallbackMainRect(mainBox, spec, floor) {
  const thickness = clampInt(spec.shell_thickness || 1, 1, 3);
  return {
    floor,
    min_x: mainBox.min_x + thickness,
    max_x: mainBox.max_x - thickness,
    min_y: floor * spec.floor_height + 1,
    max_y: Math.min((floor + 1) * spec.floor_height - 1, mainBox.max_y),
    min_z: mainBox.min_z + thickness,
    max_z: mainBox.max_z - thickness,
    source: 'main'
  };
}

function matchNodeForSpace(space, box, nodes, assignedNodeIds) {
  const candidates = nodes
    .filter((node) => Number(node.floor || 0) === Number(space.floor || 0))
    .filter((node) => !assignedNodeIds.has(node.id))
    .filter((node) => node.type !== 'balcony')
    .map((node) => ({ node, score: scoreNodeForVolume(node, box) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.node.weight || 1) - Number(a.node.weight || 1));
  return candidates[0]?.node;
}

function scoreNodeForVolume(node, box) {
  const module = String(box.module || '');
  const side = String(box.side || '');
  const tags = normalizeStringArray(node.tags).join(' ');
  const text = `${node.id || ''} ${node.type || ''} ${tags}`.toLowerCase();
  if (module === 'tower') {
    if (node.type === 'tower') return 120;
    if (/tower|塔/.test(text) && node.type !== 'stairs') return 100;
  }
  if (module === 'sunroom') {
    if (node.type === 'sunroom') return 120;
    if (node.type === 'greenhouse') return 110;
  }
  if (module === 'garage' && node.type === 'garage') return 120;
  if (module === 'gallery') {
    if (['corridor', 'lounge'].includes(node.type)) return 90;
    if (/gallery|corridor|veranda|engawa|deck|view|platform|廊|露台|观景|平台/.test(text)) return 85;
  }
  if (module === 'wing') {
    if (/wing-room/.test(text) || node.type === 'lounge') return 100;
    if (side.includes('west') && ['dining', 'study', 'armory'].includes(node.type)) return 80;
    if (side.includes('east') && ['kitchen', 'bedroom', 'garage'].includes(node.type)) return 80;
  }
  if (module === 'courtyard' && ['tatami', 'tea_room', 'living', 'atrium', 'garden_room'].includes(node.type)) return 70;
  return 0;
}

function fallbackNodeForSpace(space, box) {
  const type = fallbackTypeForVolume(box);
  return {
    id: `${box.id || space.source}-floor-${space.floor}`,
    label: fallbackLabelForVolume(box, type),
    type,
    floor: Number(space.floor || 0),
    weight: 1,
    zone: fallbackZoneForType(type),
    privacy: fallbackPrivacyForType(type),
    orientation: box.side || space.side,
    tags: [box.module || 'attached']
  };
}

function fallbackTypeForVolume(box) {
  if (box.module === 'tower') return 'tower';
  if (box.module === 'sunroom') return 'sunroom';
  if (box.module === 'garage') return 'garage';
  if (box.module === 'gallery') return 'corridor';
  if (box.module === 'courtyard') return 'atrium';
  if (box.module === 'wing') return wingRoomType(box);
  return 'room';
}

function shouldCreateFallbackAttachedRoom(box = {}) {
  if (box.module === 'tower') return false;
  if (!isHabitableAttachedVolume(box)) return false;
  const tags = normalizeStringArray(box.tags).join(' ');
  const text = `${box.id || ''} ${box.role || ''} ${box.purpose || ''} ${tags}`.toLowerCase();
  return !/vertical-core|service-core|trunk-core|support|structural|anchor/.test(text);
}

function isHabitableAttachedVolume(box = {}) {
  const tags = normalizeStringArray(box.tags).join(' ');
  const text = `${box.id || ''} ${box.role || ''} ${box.purpose || ''} ${box.facade_role || ''} ${tags}`.toLowerCase();
  if (/chimney|flue|vent|lightwell|采光井|path|walkway|driveway|stilt|stilts|trunk|support|structural|anchor|retaining|foundation|main-shell/.test(text)) return false;
  return ['tower', 'sunroom', 'garage', 'gallery', 'wing', 'courtyard'].includes(String(box.module || ''));
}

function fallbackLabelForVolume(box, type) {
  if (type === 'tower') return '塔楼房间';
  if (type === 'sunroom') return '阳光房';
  if (type === 'garage') return '车库';
  if (type === 'corridor') return '连廊';
  if (type === 'atrium') return '采光庭院';
  return wingRoomLabel(type);
}

function fallbackZoneForType(type) {
  if (['garage', 'kitchen', 'bathroom', 'storage'].includes(type)) return 'service';
  if (['tower', 'bedroom', 'study'].includes(type)) return 'private';
  if (type === 'corridor') return 'circulation';
  return 'public';
}

function fallbackPrivacyForType(type) {
  if (['tower', 'bedroom', 'study'].includes(type)) return 'private';
  if (['garage', 'kitchen', 'bathroom', 'storage'].includes(type)) return 'service';
  if (type === 'corridor') return 'circulation';
  return 'public';
}

function attachedDoorForRoom(room, mainBox, spec) {
  const y1 = room.min_y;
  const y2 = Math.min(room.max_y, y1 + 2);
  const thickness = clampInt(spec.shell_thickness || 1, 1, 3);
  if (room.min_z < mainBox.min_z) {
    const x = clampInt(center(room).x, mainBox.min_x + thickness, mainBox.max_x - thickness);
    return {
      axis: 'z',
      at: { x, z: mainBox.min_z },
      min_x: x - 1,
      max_x: x + 1,
      min_y: y1,
      max_y: y2,
      min_z: room.max_z + 1,
      max_z: mainBox.min_z + thickness - 1
    };
  }
  if (room.min_x > mainBox.max_x) {
    const z = clampInt(center(room).z, mainBox.min_z + thickness, mainBox.max_z - thickness);
    return {
      axis: 'x',
      at: { x: mainBox.max_x, z },
      min_x: mainBox.max_x - thickness + 1,
      max_x: room.min_x - 1,
      min_y: y1,
      max_y: y2,
      min_z: z - 1,
      max_z: z + 1
    };
  }
  if (room.max_x < mainBox.min_x) {
    const z = clampInt(center(room).z, mainBox.min_z + thickness, mainBox.max_z - thickness);
    return {
      axis: 'x',
      at: { x: mainBox.min_x, z },
      min_x: room.max_x + 1,
      max_x: mainBox.min_x + thickness - 1,
      min_y: y1,
      max_y: y2,
      min_z: z - 1,
      max_z: z + 1
    };
  }
  if (room.min_z > mainBox.max_z) {
    const x = clampInt(center(room).x, mainBox.min_x + thickness, mainBox.max_x - thickness);
    return {
      axis: 'z',
      at: { x, z: mainBox.max_z },
      min_x: x - 1,
      max_x: x + 1,
      min_y: y1,
      max_y: y2,
      min_z: mainBox.max_z - thickness + 1,
      max_z: room.min_z - 1
    };
  }
  return undefined;
}

function roomAtDoor(door, rooms, mainBox, spec) {
  const thickness = clampInt(spec.shell_thickness || 1, 1, 3);
  const probe = doorProbe(door, mainBox, thickness);
  return rooms.find((room) => pointInRoom2d(probe.x, probe.z, room)) ||
    rooms.find((room) => doorReachesRoom(door, room, thickness + 1));
}

function doorProbe(door, mainBox, thickness) {
  if (door.axis === 'x') {
    return {
      x: door.at.x <= mainBox.min_x ? mainBox.min_x + thickness : mainBox.max_x - thickness,
      z: door.at.z
    };
  }
  return {
    x: door.at.x,
    z: door.at.z <= mainBox.min_z ? mainBox.min_z + thickness : mainBox.max_z - thickness
  };
}

function doorReachesRoom(door, room, tolerance = 2) {
  if (!door?.at) return false;
  if (door.axis === 'x') {
    return rangesOverlap(door.at.z - 1, door.at.z + 1, room.min_z, room.max_z) &&
      door.at.x >= room.min_x - tolerance &&
      door.at.x <= room.max_x + tolerance;
  }
  return rangesOverlap(door.at.x - 1, door.at.x + 1, room.min_x, room.max_x) &&
    door.at.z >= room.min_z - tolerance &&
    door.at.z <= room.max_z + tolerance;
}

export function sanitizeInteriorDoors(rooms = [], interiorDoors = [], { tolerance = 2 } = {}) {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const validDoors = interiorDoors.filter((door) => interiorDoorTouchesRooms(door, roomById, tolerance));
  interiorDoors.splice(0, interiorDoors.length, ...validDoors);
  return interiorDoors;
}

function interiorDoorTouchesRooms(door, roomById, tolerance) {
  if (!door?.at || !Number.isFinite(Number(door.at.x)) || !Number.isFinite(Number(door.at.z))) return false;
  if (!['x', 'z'].includes(String(door.axis))) return false;
  const connects = Array.isArray(door.connects) ? uniqueStrings(door.connects.filter(Boolean)) : [];
  if (connects.length < 2) return false;
  const rooms = connects.map((id) => roomById.get(id));
  if (rooms.some((room) => !room)) return false;
  const floor = Number.isFinite(Number(door.floor)) ? Number(door.floor) : Number(rooms[0].floor || 0);
  if (rooms.some((room) => Number(room.floor || 0) !== floor)) return false;
  return rooms.every((room) => doorReachesRoom(door, room, tolerance));
}

function normalizeRoomIdsAndDoors(rooms, interiorDoors) {
  const used = new Set();
  for (const room of rooms) {
    const originalId = String(room.id || 'room');
    const uniqueId = uniqueRoomId(room, used);
    if (uniqueId !== originalId) room.original_id = originalId;
    room.id = uniqueId;
    used.add(uniqueId);
  }

  const roomsByReference = new Map();
  for (const room of rooms) {
    addRoomReference(roomsByReference, room.id, room);
    if (room.original_id) addRoomReference(roomsByReference, room.original_id, room);
  }

  for (const door of interiorDoors) {
    const chosen = [];
    const resolved = (Array.isArray(door.connects) ? door.connects : [])
      .map((id) => resolveDoorRoom(id, door, roomsByReference, chosen))
      .filter(Boolean);
    door.connects = uniqueStrings(resolved.map((room) => room.id));
    if (resolved.length >= 2 && resolved.every((room) => room.floor === resolved[0].floor)) {
      door.floor = resolved[0].floor;
    }
  }
}

function uniqueRoomId(room, used) {
  const original = slugId(room.id || room.type || 'room');
  if (!used.has(original)) return original;
  const source = slugId(room.source || room.volume?.id || '');
  const type = slugId(room.type || 'room');
  const floor = Number(room.floor || 0);
  const bases = [
    source && `${source}-${type}`,
    `${type}-floor-${floor}`,
    `${original}-floor-${floor}`
  ].filter(Boolean);

  for (const base of bases) {
    if (!used.has(base)) return base;
  }
  let index = 2;
  while (used.has(`${original}-${index}`)) index += 1;
  return `${original}-${index}`;
}

function resolveDoorRoom(id, door, roomsByReference, chosen) {
  let candidates = roomsByReference.get(String(id || '')) || [];
  candidates = candidates.filter((room) => !chosen.includes(room));
  if (!candidates.length) return undefined;

  const doorFloor = Number.isFinite(Number(door.floor)) ? Number(door.floor) : undefined;
  const sameFloor = doorFloor === undefined ? candidates : candidates.filter((room) => Number(room.floor || 0) === doorFloor);
  if (sameFloor.length) candidates = sameFloor;
  const touching = candidates.filter((room) => doorReachesRoom(door, room, 2));
  if (touching.length) candidates = touching;

  const point = door.at ? { x: Number(door.at.x), z: Number(door.at.z) } : undefined;
  const selected = point
    ? [...candidates].sort((a, b) => distance(point, center(a)) - distance(point, center(b)))[0]
    : candidates[0];
  if (selected) chosen.push(selected);
  return selected;
}

function addRoomReference(map, id, room) {
  if (!id) return;
  if (!map.has(id)) map.set(id, []);
  map.get(id).push(room);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugId(value) {
  const slug = String(value || 'room')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'room';
}

function nearestRoom(room, candidates) {
  if (!candidates.length) return undefined;
  const origin = center(room);
  return [...candidates].sort((a, b) => distance(origin, center(a)) - distance(origin, center(b)))[0];
}

function center(room) {
  return {
    x: Math.floor((room.min_x + room.max_x) / 2),
    z: Math.floor((room.min_z + room.max_z) / 2)
  };
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function pointInRoom2d(x, z, room) {
  return x >= room.min_x && x <= room.max_x && z >= room.min_z && z <= room.max_z;
}

function isMostlyCoveredByRoom(space, room) {
  if (Number(space.floor || 0) !== Number(room.floor || 0)) return false;
  const overlap = overlapArea(space, room);
  if (overlap <= 0) return false;
  return overlap / Math.max(1, rectArea(space)) >= 0.7;
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.max_x, b.max_x) - Math.max(a.min_x, b.min_x) + 1);
  const z = Math.max(0, Math.min(a.max_z, b.max_z) - Math.max(a.min_z, b.min_z) + 1);
  return x * z;
}

function rectArea(rect) {
  return spanSize(rect.min_x, rect.max_x) * spanSize(rect.min_z, rect.max_z);
}

function rangesOverlap(aMin, aMax, bMin, bMax) {
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
}

function spanSize(min, max) {
  return max - min + 1;
}

function volumeSortScore(box = {}) {
  return {
    garage: 0,
    sunroom: 1,
    tower: 2,
    wing: 3,
    gallery: 4,
    courtyard: 5
  }[box.module] ?? 9;
}

function fallbackNodes(floor) {
  if (floor === 0) {
    return [
      { id: 'entry', label: '门厅', type: 'entry', floor: 0, weight: 0.8, zone: 'public', privacy: 'public' },
      { id: 'living', label: '客厅', type: 'living', floor: 0, weight: 1.5, zone: 'public', privacy: 'public' },
      { id: 'kitchen', label: '厨房', type: 'kitchen', floor: 0, weight: 0.9, zone: 'service', privacy: 'service' }
    ];
  }
  return [
    { id: `bedroom-${floor}`, label: '卧室', type: 'bedroom', floor, weight: 1.2, zone: 'private', privacy: 'private' },
    { id: `study-${floor}`, label: '书房', type: 'study', floor, weight: 0.8, zone: 'private', privacy: 'private' }
  ];
}

function wingRoomType(space) {
  if (Number(space.floor || 0) > 0) return String(space.side || '').includes('west') ? 'study' : 'bedroom';
  return String(space.side || '').includes('west') ? 'dining' : 'kitchen';
}

function wingRoomLabel(type) {
  return {
    study: '侧翼书房',
    bedroom: '侧翼卧室',
    dining: '侧翼餐厅',
    kitchen: '侧翼厨房',
    room: '附属房间'
  }[type] || '侧翼房间';
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
