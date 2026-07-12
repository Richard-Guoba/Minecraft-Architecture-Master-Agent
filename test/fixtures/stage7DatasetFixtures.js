export function hollowHouseVolumeFixture() {
  const width = 9, height = 7, length = 9;
  const blocks = new Map();
  const set = (x, y, z, state) => blocks.set(`${x},${y},${z}`, state);
  for (let x = 1; x <= 7; x += 1) for (let z = 1; z <= 7; z += 1) {
    set(x, 1, z, 'minecraft:oak_planks');
    set(x, 5, z, 'minecraft:oak_slab');
  }
  for (let y = 2; y <= 4; y += 1) for (let i = 1; i <= 7; i += 1) {
    set(1, y, i, 'minecraft:oak_planks'); set(7, y, i, 'minecraft:oak_planks');
    set(i, y, 1, 'minecraft:oak_planks'); set(i, y, 7, 'minecraft:oak_planks');
  }
  set(4, 2, 7, 'minecraft:oak_door[half=lower]');
  set(4, 3, 7, 'minecraft:oak_door[half=upper]');
  for (let x = 0; x < width; x += 1) set(x, 0, 8, x < 4 ? 'minecraft:water' : 'minecraft:grass_block');
  return {
    source_sha256: 'a'.repeat(64), width, height, length, block_count: width * height * length,
    blockAt(x, y, z) {
      const state = blocks.get(`${x},${y},${z}`) || 'minecraft:air';
      const name = state.replace(/^minecraft:/, '').replace(/\[.*$/, '');
      const category = /water/.test(name) ? 'water' : /grass/.test(name) ? 'earth' : /door/.test(name) ? 'opening' : /slab/.test(name) ? 'slab' : state === 'minecraft:air' ? 'air' : 'wood';
      return { state, name, category, air: state === 'minecraft:air' };
    }
  };
}

export function pendingCaseFixture() {
  return {
    case_id:'house-hollow', title:'Hollow House', file:'House/Hollow House.schematic', case_version:`sha256:${'b'.repeat(64)}`,
    identity:{ style_family:'rustic', typology:'house' },
    source:{ url:'https://example.invalid/hollow-house', author:'', license_status:'unknown', allowed_uses:[], public_release_allowed:false },
    review:{ status:'pending', reviewed_by:'', reviewed_at:'', approved_learning_areas:[], blocked_learning_areas:[], canonical_front_side:null, review_record_ids:[] }
  };
}

export function reviewedCaseFixture() {
  const value = pendingCaseFixture();
  return { ...value,
    source:{ ...value.source, license_status:'restricted', allowed_uses:['local-analysis','local-training'], license_evidence:'fixture license record' },
    review:{ ...value.review, status:'limited', reviewed_by:'fixture-curator', reviewed_at:'2026-07-12T00:00:00.000Z', approved_learning_areas:['envelope','site','space'], canonical_front_side:'south', review_record_ids:['fixture-review'] }
  };
}
