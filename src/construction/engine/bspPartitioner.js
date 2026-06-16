import { fillBox } from './csgBuilder.js';

export class BSPPartitioner {
  constructor(buildSpec, materials) {
    this.spec = buildSpec;
    this.materials = materials;
  }

  fitRooms(shell, plannerJson) {
    const rooms = [];
    const interiorDoors = [];
    const floorOpenings = [];
    const mainBox = shell.volumeBoxes.find((box) => box.id === 'main') || shell.volumeBoxes[0];
    const nodes = plannerJson.nodes || [];

    for (let floor = 0; floor < this.spec.floors; floor += 1) {
      let floorNodes = nodes.filter((node) => Number(node.floor || 0) === floor && node.type !== 'balcony');
      if (floor > 0) floorNodes = floorNodes.filter((node) => node.type !== 'stairs');
      if (!floorNodes.length) floorNodes = fallbackNodes(floor);

      const rect = {
        floor,
        min_x: mainBox.min_x + 2,
        max_x: mainBox.max_x - 2,
        min_y: floor * this.spec.floor_height + 2,
        max_y: Math.min((floor + 1) * this.spec.floor_height, mainBox.max_y) - 1,
        min_z: mainBox.min_z + 2,
        max_z: mainBox.max_z - 2
      };
      rooms.push(...this.partition(shell.grid, rect, floorNodes, 0, interiorDoors));
    }

    for (const space of shell.interiorSpaces) {
      if (space.source === 'main') continue;
      if (space.max_x - space.min_x < 4 || space.max_z - space.min_z < 4) continue;
      const roomType = wingRoomType(space);
      rooms.push({
        id: `${space.source}-floor-${space.floor}`,
        label: wingRoomLabel(roomType),
        type: roomType,
        floor: space.floor,
        min_x: space.min_x,
        max_x: space.max_x,
        min_y: space.min_y,
        max_y: space.max_y,
        min_z: space.min_z,
        max_z: space.max_z
      });
    }

    return {
      rooms,
      interiorDoors,
      floorOpenings,
      bsp: {
        nodeCount: nodes.length,
        edgeCount: (plannerJson.edges || []).length,
        roomCount: rooms.length,
        splitStrategy: plannerJson.bsp_hints?.split_strategy || 'weighted'
      }
    };
  }

  partition(grid, rect, nodes, depth, interiorDoors) {
    if (nodes.length <= 1 || rect.max_x - rect.min_x < 8 || rect.max_z - rect.min_z < 8) {
      return [roomFromRect(rect, nodes[0] || fallbackNodes(rect.floor)[0])];
    }

    const axis = chooseAxis(rect, depth);
    const [leftNodes, rightNodes] = splitNodes(nodes);
    const ratio = weightSum(leftNodes) / Math.max(0.1, weightSum(nodes));
    const rooms = [];
    const wallBlock = this.materials.interior_wall || 'minecraft:birch_planks';

    if (axis === 'x') {
      const splitX = clampInt(Math.round(rect.min_x + (rect.max_x - rect.min_x) * ratio), rect.min_x + 4, rect.max_x - 4);
      fillBox(grid, splitX, rect.min_y, rect.min_z, splitX, rect.max_y, rect.max_z, wallBlock, 'interior');
      const doorZ = Math.floor((rect.min_z + rect.max_z) / 2);
      carveOpening(grid, splitX, rect.min_y, doorZ, axis);
      interiorDoors.push({ floor: rect.floor, axis, at: { x: splitX, z: doorZ }, connects: [leftNodes[0]?.id, rightNodes[0]?.id].filter(Boolean) });
      rooms.push(...this.partition(grid, { ...rect, max_x: splitX - 1 }, leftNodes, depth + 1, interiorDoors));
      rooms.push(...this.partition(grid, { ...rect, min_x: splitX + 1 }, rightNodes, depth + 1, interiorDoors));
      return rooms;
    }

    const splitZ = clampInt(Math.round(rect.min_z + (rect.max_z - rect.min_z) * ratio), rect.min_z + 4, rect.max_z - 4);
    fillBox(grid, rect.min_x, rect.min_y, splitZ, rect.max_x, rect.max_y, splitZ, wallBlock, 'interior');
    const doorX = Math.floor((rect.min_x + rect.max_x) / 2);
    carveOpening(grid, doorX, rect.min_y, splitZ, axis);
    interiorDoors.push({ floor: rect.floor, axis, at: { x: doorX, z: splitZ }, connects: [leftNodes[0]?.id, rightNodes[0]?.id].filter(Boolean) });
    rooms.push(...this.partition(grid, { ...rect, max_z: splitZ - 1 }, leftNodes, depth + 1, interiorDoors));
    rooms.push(...this.partition(grid, { ...rect, min_z: splitZ + 1 }, rightNodes, depth + 1, interiorDoors));
    return rooms;
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

function chooseAxis(rect, depth) {
  const width = rect.max_x - rect.min_x + 1;
  const depthSize = rect.max_z - rect.min_z + 1;
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
    max_z: rect.max_z
  };
}

function fallbackNodes(floor) {
  if (floor === 0) {
    return [
      { id: 'entry', label: '门厅', type: 'entry', floor: 0, weight: 0.8 },
      { id: 'living', label: '客厅', type: 'living', floor: 0, weight: 1.5 },
      { id: 'kitchen', label: '厨房', type: 'kitchen', floor: 0, weight: 0.9 }
    ];
  }
  return [
    { id: `bedroom-${floor}`, label: '卧室', type: 'bedroom', floor, weight: 1.2 },
    { id: `study-${floor}`, label: '书房', type: 'study', floor, weight: 0.8 }
  ];
}

function wingRoomType(space) {
  if (space.floor > 0) return space.side === 'west' ? 'study' : 'bedroom';
  return space.side === 'west' ? 'dining' : 'kitchen';
}

function wingRoomLabel(type) {
  return {
    study: '侧翼书房',
    bedroom: '侧翼卧室',
    dining: '侧翼餐厅',
    kitchen: '侧翼厨房'
  }[type] || '侧翼房间';
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}
