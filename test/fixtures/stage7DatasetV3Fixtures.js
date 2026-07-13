export function stage7VolumeFixture({ width, height, length, states, hash = 'a'.repeat(64) } = {}) {
  const blocks = new Map(Object.entries(states || {}));
  return {
    source_sha256: hash,
    width,
    height,
    length,
    block_count: width * height * length,
    blockAt(x, y, z) {
      const state = blocks.get(`${x},${y},${z}`) || 'minecraft:air';
      const name = state.replace(/^minecraft:/, '').replace(/\[.*$/, '');
      const category = /water/.test(name) ? 'water'
        : /(dirt|grass_block|sand)/.test(name) ? 'earth'
          : /(leaves|flower)/.test(name) ? 'vegetation'
            : /(door|ladder)/.test(name) ? 'opening'
              : /stairs?$/.test(name) ? 'stair'
                : /slab/.test(name) ? 'slab'
                  : /glass|pane/.test(name) ? 'glass'
                    : state === 'minecraft:air' ? 'air' : 'wood';
      return { state, name, category, air: state === 'minecraft:air' };
    }
  };
}

export function oneFloorHouseV3Fixture({ sealed = false, roofStairs = false, axisLength = 9 } = {}) {
  const states = {};
  const set = (x, y, z, state) => { states[`${x},${y},${z}`] = state; };
  for (let x = 1; x <= 7; x += 1) {
    for (let z = 1; z <= 7; z += 1) {
      set(x, 1, z, 'minecraft:oak_planks');
      set(x, 5, z, roofStairs ? 'minecraft:oak_stairs' : 'minecraft:oak_slab');
    }
  }
  for (let y = 2; y <= 4; y += 1) {
    for (let i = 1; i <= 7; i += 1) {
      set(1, y, i, 'minecraft:oak_planks');
      set(7, y, i, 'minecraft:oak_planks');
      set(i, y, 1, 'minecraft:oak_planks');
      set(i, y, 7, 'minecraft:oak_planks');
    }
  }
  if (!sealed) {
    set(4, 2, 7, 'minecraft:oak_door[half=lower]');
    set(4, 3, 7, 'minecraft:oak_door[half=upper]');
    for (let z = 7; z < axisLength; z += 1) set(4, 1, z, 'minecraft:dirt_path');
  }
  return stage7VolumeFixture({ width: axisLength, height: 7, length: axisLength, states });
}

export function twoFloorHouseV3Fixture({ disconnectedStairs = false } = {}) {
  const base = oneFloorHouseV3Fixture();
  const states = {};
  for (let y = 1; y <= 9; y += 1) {
    for (let z = 0; z < 9; z += 1) {
      for (let x = 0; x < 9; x += 1) {
        const block = base.blockAt(x, Math.min(y, 6), z);
        if (!block.air && y <= 6) states[`${x},${y},${z}`] = block.state;
      }
    }
  }
  for (let x = 1; x <= 7; x += 1) {
    for (let z = 1; z <= 7; z += 1) states[`${x},6,${z}`] = 'minecraft:oak_planks';
  }
  for (let y = 7; y <= 9; y += 1) {
    for (let i = 1; i <= 7; i += 1) {
      states[`1,${y},${i}`] = 'minecraft:oak_planks';
      states[`7,${y},${i}`] = 'minecraft:oak_planks';
      states[`${i},${y},1`] = 'minecraft:oak_planks';
      states[`${i},${y},7`] = 'minecraft:oak_planks';
    }
  }
  for (let x = 1; x <= 7; x += 1) {
    for (let z = 1; z <= 7; z += 1) states[`${x},10,${z}`] = 'minecraft:oak_slab';
  }
  const stairYs = disconnectedStairs ? [2, 5, 8] : [2, 3, 4, 5, 6, 7];
  for (const y of stairYs) states[`3,${y},4`] = 'minecraft:oak_stairs';
  return stage7VolumeFixture({ width: 9, height: 12, length: 9, states, hash: 'b'.repeat(64) });
}

export function detachedPavilionV3Fixture() {
  const house = oneFloorHouseV3Fixture({ sealed: true, axisLength: 17 });
  const states = {};
  for (let y = 0; y < house.height; y += 1) {
    for (let z = 0; z < house.length; z += 1) {
      for (let x = 0; x < house.width; x += 1) {
        const block = house.blockAt(x, y, z);
        if (!block.air) states[`${x},${y},${z}`] = block.state;
      }
    }
  }
  for (let y = 1; y <= 5; y += 1) states[`14,${y},14`] = 'minecraft:ladder';
  states['14,1,13'] = 'minecraft:oak_door';
  return stage7VolumeFixture({ width: 17, height: 7, length: 17, states, hash: 'c'.repeat(64) });
}

export function axisLengthV3Fixture(length) {
  const states = {};
  for (let x = 0; x < length; x += 1) states[`${x},0,0`] = 'minecraft:stone';
  return stage7VolumeFixture({ width: length, height: 1, length: 1, states, hash: 'd'.repeat(64) });
}

export function siteSceneV3Fixture() {
  const states = {};
  for (let x = 0; x < 9; x += 1) {
    for (let z = 0; z < 9; z += 1) states[`${x},0,${z}`] = 'minecraft:grass_block';
  }
  for (let z = 0; z < 9; z += 1) states[`4,0,${z}`] = 'minecraft:dirt_path';
  states['1,0,1'] = 'minecraft:water';
  states['7,1,7'] = 'minecraft:oak_leaves';
  return stage7VolumeFixture({ width: 9, height: 3, length: 9, states, hash: 'e'.repeat(64) });
}
