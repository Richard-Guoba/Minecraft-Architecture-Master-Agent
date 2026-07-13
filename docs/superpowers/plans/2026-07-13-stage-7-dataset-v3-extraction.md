# Stage 7 Dataset v3 Extraction Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, topology-aware Dataset v3 extractor that fixes sparse `64^3` scaling, preserves Dataset v1/v2 byte-for-byte, fails closed on semantic and governance uncertainty, and produces a six-pilot v2/v3 diagnostic comparison without training real data.

**Architecture:** Keep the existing v1/v2 rasterizer untouched. Dataset v3 selects a new interval-partition transform, geometry-evidence reducer, topology builder, and v3 repair/validation policy through version dispatch in the existing case and dataset writers. Existing source governance may transfer to v3, but semantic approval transfers only through a review record bound to the exact source hash, extractor version, and uncorrected v3 review-plan hash.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, JSON/JSONL, SHA-256 canonical hashing, PowerShell verification commands, existing Stage 7 schema/repair/dataset modules.

## Global Constraints

- Treat every versioned file under `mc_templates/datasets/coarse_semantic_voxels/v1/` and `v2/` as immutable.
- Dataset v3 resolution remains exactly `[64,64,64]` with the existing canonical Stage 7 layer vocabularies.
- Keep the existing fixed `sha256-case-id-v1` split assignments; no case may move between train, validation, and test.
- Use `SOURCE_DATE_EPOCH=1783814400` for canonical and independent reproduction builds.
- No real case may become semantic-accepted in v3 without a review bound to its source SHA-256, extractor version, and uncorrected v3 review-plan SHA-256.
- No real case may enter training without `local-training`, approved requested learning areas, accepted automated semantics, and a valid v3 plan-bound review.
- The six McBuild pilots remain `research-only`, `local-analysis` only, and training-ineligible throughout this plan.
- Do not add Python, PyTorch, a model, a checkpoint, real-data training, learned Apply Mode, or Stage 8 terrain behavior in Subproject A.
- Preserve normal Node.js generation behavior and keep Stage 7 learned execution shadow-only.
- Start from a clean workspace. At execution time, create isolation through `superpowers:using-git-worktrees` unless the user explicitly keeps direct work on `main`.
- Baseline before implementation: `npm test` must report 388 passed, 0 failed.

## File Responsibility Map

### New production files

- `src/construction/learning/stage7GridTransformV3.js` — integer-only occupied-bounds partitioning between source axes and `0..63` target axes.
- `src/construction/learning/stage7SemanticEvidenceV3.js` — source exterior-air analysis, block evidence classification, dense target evidence accumulation, deterministic layer voting.
- `src/construction/learning/stage7SemanticTopologyV3.js` — primary-envelope selection, interior/outside separation, entrance, horizontal circulation, and vertical-core derivation.
- `src/construction/learning/stage7SemanticValidatorV3.js` — v3 automated semantic verdict, bounded repair-policy enforcement, repair audit, and topology metrics.
- `src/construction/learning/coarseSemanticVoxelDatasetRasterizerV3.js` — orchestration adapter returning the same raster result shape consumed by dataset-case construction.
- `src/construction/learning/stage7DatasetReviewScopeV3.js` — exact plan-bound v3 semantic-review matching.
- `src/construction/learning/stage7DatasetV3Comparison.js` — deterministic per-layer component diagnostics and v2/v3 pilot comparison rendering.
- `src/compareStage7DatasetVersions.js` — CLI for the six-pilot comparison.

### New test and fixture files

- `test/stage7GridTransformV3.test.js`
- `test/stage7SemanticEvidenceV3.test.js`
- `test/stage7SemanticTopologyV3.test.js`
- `test/stage7SemanticValidatorV3.test.js`
- `test/coarseSemanticVoxelDatasetV3.test.js`
- `test/stage7DatasetV3Cli.test.js`
- `test/stage7DatasetV3Comparison.test.js`
- `test/fixtures/stage7DatasetV3Fixtures.js`
- `test/fixtures/stage7DatasetV3Golden.json`

### Existing files modified by version dispatch

- `src/construction/learning/stage7DatasetReviewOverlay.js`
- `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- `src/construction/learning/coarseSemanticVoxelDataset.js`
- `src/buildCoarseSemanticVoxelDataset.js`
- `package.json`
- `test/stage7DatasetReviewOverlay.test.js`
- `test/coarseSemanticVoxelDatasetCase.test.js`
- `test/coarseSemanticVoxelDataset.test.js`
- `test/stage7DatasetCli.test.js`
- `docs/benchmarks/stage7-dataset-v3.md` — reproducibility evidence, immutable-version hashes, fixture/full-suite results, and strict-gate outcome.
- `docs/benchmarks/stage7-dataset-v2-v3-pilot-comparison.md` — generated and committed only after both local datasets reproduce.

---

### Task 1: Add the Integer-Only v3 Grid Transform

**Files:**
- Create: `src/construction/learning/stage7GridTransformV3.js`
- Create: `test/stage7GridTransformV3.test.js`

**Interfaces:**
- Consumes: positive integer source axis length and source coordinate; occupied source bounds and reviewed front side.
- Produces: `targetIntervalForSource(index, length) -> [start, end]`, `sourceIntervalForTarget(index, length) -> [start, end]`, `buildStage7GridTransformV3({ volume, occupiedBounds, frontSide }) -> transform`.

- [ ] **Step 1: Write the failing partition tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetIntervalForSource,
  sourceIntervalForTarget,
  buildStage7GridTransformV3
} from '../src/construction/learning/stage7GridTransformV3.js';

test('v3 target intervals exactly partition 0..63 for source axes at or below 64', () => {
  for (const length of [1,17,23,64]) {
    const covered=[];
    for (let index=0;index<length;index+=1) {
      const [start,end]=targetIntervalForSource(index,length);
      assert.ok(start>=0&&end<=63&&start<=end);
      for (let value=start;value<=end;value+=1) covered.push(value);
    }
    assert.deepEqual(covered,Array.from({length:64},(_,index)=>index));
  }
});

test('v3 source intervals exactly partition axes above 64', () => {
  for (const length of [66,128]) {
    const covered=[];
    for (let index=0;index<64;index+=1) {
      const [start,end]=sourceIntervalForTarget(index,length);
      assert.ok(start>=0&&end<length&&start<=end);
      for (let value=start;value<=end;value+=1) covered.push(value);
    }
    assert.deepEqual(covered,Array.from({length},(_,index)=>index));
  }
});

test('v3 transform records occupied bounds, source size, ground, and reviewed front', () => {
  const transform=buildStage7GridTransformV3({
    volume:{width:23,height:16,length:66},
    occupiedBounds:{min_x:2,min_y:1,min_z:3,max_x:20,max_y:14,max_z:65},
    frontSide:'north'
  });
  assert.deepEqual(transform.resolution,[64,64,64]);
  assert.deepEqual(transform.source_size,[23,16,66]);
  assert.deepEqual(transform.occupied_size,[19,14,63]);
  assert.equal(transform.ground_y,1);
  assert.equal(transform.front_side,'north');
  assert.equal(transform.transform_version,'stage7-interval-partition-v1');
});
```

- [ ] **Step 2: Run the transform test and verify RED**

Run:

```powershell
node --test test/stage7GridTransformV3.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7GridTransformV3.js`.

- [ ] **Step 3: Implement the complete transform module**

```js
export const STAGE7_V3_GRID_SIZE=64;
export const STAGE7_V3_TRANSFORM_VERSION='stage7-interval-partition-v1';

export function targetIntervalForSource(index,length) {
  assertCoordinate(index,length,'source');
  if (length>STAGE7_V3_GRID_SIZE) {
    const target=Math.min(STAGE7_V3_GRID_SIZE-1,Math.floor(index*STAGE7_V3_GRID_SIZE/length));
    return [target,target];
  }
  return [
    Math.floor(index*STAGE7_V3_GRID_SIZE/length),
    Math.floor((index+1)*STAGE7_V3_GRID_SIZE/length)-1
  ];
}

export function sourceIntervalForTarget(index,length) {
  if (!Number.isInteger(index)||index<0||index>=STAGE7_V3_GRID_SIZE) throw new Error('target index must be an integer in [0,63]');
  if (!Number.isInteger(length)||length<=0) throw new Error('axis length must be a positive integer');
  if (length<=STAGE7_V3_GRID_SIZE) {
    const source=Math.min(length-1,Math.floor(index*length/STAGE7_V3_GRID_SIZE));
    return [source,source];
  }
  return [
    Math.floor(index*length/STAGE7_V3_GRID_SIZE),
    Math.floor((index+1)*length/STAGE7_V3_GRID_SIZE)-1
  ];
}

export function buildStage7GridTransformV3({volume,occupiedBounds,frontSide}={}) {
  if (!volume||![volume.width,volume.height,volume.length].every((value)=>Number.isInteger(value)&&value>0)) throw new Error('v3 transform requires positive source dimensions');
  const bounds=normalizeBounds(occupiedBounds);
  if (!['north','south','east','west'].includes(frontSide)) throw new Error('v3 transform requires a reviewed canonical front side');
  return {
    resolution:[64,64,64],
    source_size:[volume.width,volume.height,volume.length],
    occupied_size:[bounds.max_x-bounds.min_x+1,bounds.max_y-bounds.min_y+1,bounds.max_z-bounds.min_z+1],
    ground_y:bounds.min_y,
    front_side:frontSide,
    vertical_axis:'y-up',
    transform_version:STAGE7_V3_TRANSFORM_VERSION,
    occupied_bounds:bounds
  };
}

function assertCoordinate(index,length,label) {
  if (!Number.isInteger(length)||length<=0) throw new Error('axis length must be a positive integer');
  if (!Number.isInteger(index)||index<0||index>=length) throw new Error(`${label} index must be inside its axis`);
}

function normalizeBounds(value={}) {
  const result={};
  for (const field of ['min_x','min_y','min_z','max_x','max_y','max_z']) {
    if (!Number.isInteger(value[field])) throw new Error(`occupied bounds require ${field}`);
    result[field]=value[field];
  }
  if (result.min_x>result.max_x||result.min_y>result.max_y||result.min_z>result.max_z) throw new Error('occupied bounds are inverted');
  return result;
}
```

- [ ] **Step 4: Run the transform test and verify GREEN**

Run: `node --test test/stage7GridTransformV3.test.js`

Expected: 3 passed, 0 failed.

- [ ] **Step 5: Commit the transform**

```powershell
git add src/construction/learning/stage7GridTransformV3.js test/stage7GridTransformV3.test.js
git commit -m "feat(stage7): add dataset v3 grid transform"
```

---

### Task 2: Build Controlled v3 Fixtures and Dense Geometry Evidence

**Files:**
- Create: `test/fixtures/stage7DatasetV3Fixtures.js`
- Create: `src/construction/learning/stage7SemanticEvidenceV3.js`
- Create: `test/stage7SemanticEvidenceV3.test.js`

**Interfaces:**
- Consumes: schematic-like `volume` with `width`, `height`, `length`, `source_sha256`, and `blockAt(x,y,z)`; transform from Task 1.
- Produces: `collectStage7SemanticEvidenceV3({volume, transform, caseId}) -> {voxels, sourceSampleCount, exteriorAirCount}` where `voxels` is a canonical `Map<string,EvidenceVoxel>` keyed by `x,y,z`; `chooseDominantEvidenceLabel(counts, tieOrder) -> label` centralizes deterministic volume voting.

- [ ] **Step 1: Create the reusable fixture builder and exact fixture constructors**

```js
export function stage7VolumeFixture({width,height,length,states,hash='a'.repeat(64)}={}) {
  const blocks=new Map(Object.entries(states||{}));
  return {
    source_sha256:hash,width,height,length,block_count:width*height*length,
    blockAt(x,y,z) {
      const state=blocks.get(`${x},${y},${z}`)||'minecraft:air';
      const name=state.replace(/^minecraft:/,'').replace(/\[.*$/,'');
      const category=/water/.test(name)?'water':/(dirt|grass_block|sand)/.test(name)?'earth':/(leaves|flower)/.test(name)?'vegetation':/(door|ladder)/.test(name)?'opening':/stairs?$/.test(name)?'stair':/slab/.test(name)?'slab':/glass|pane/.test(name)?'glass':state==='minecraft:air'?'air':'wood';
      return {state,name,category,air:state==='minecraft:air'};
    }
  };
}

export function oneFloorHouseV3Fixture({sealed=false,roofStairs=false,axisLength=9}={}) {
  const states={};
  const set=(x,y,z,state)=>{states[`${x},${y},${z}`]=state;};
  for (let x=1;x<=7;x+=1) for (let z=1;z<=7;z+=1) {
    set(x,1,z,'minecraft:oak_planks');
    set(x,5,z,roofStairs?'minecraft:oak_stairs':'minecraft:oak_slab');
  }
  for (let y=2;y<=4;y+=1) for (let i=1;i<=7;i+=1) {
    set(1,y,i,'minecraft:oak_planks'); set(7,y,i,'minecraft:oak_planks');
    set(i,y,1,'minecraft:oak_planks'); set(i,y,7,'minecraft:oak_planks');
  }
  if (!sealed) {
    set(4,2,7,'minecraft:oak_door[half=lower]');
    set(4,3,7,'minecraft:oak_door[half=upper]');
    for (let z=7;z<axisLength;z+=1) set(4,1,z,'minecraft:dirt_path');
  }
  return stage7VolumeFixture({width:axisLength,height:7,length:axisLength,states});
}

export function twoFloorHouseV3Fixture({disconnectedStairs=false}={}) {
  const base=oneFloorHouseV3Fixture();
  const states={};
  for (let y=1;y<=9;y+=1) for (let z=0;z<9;z+=1) for (let x=0;x<9;x+=1) {
    const block=base.blockAt(x,Math.min(y,6),z);
    if (!block.air&&y<=6) states[`${x},${y},${z}`]=block.state;
  }
  for (let x=1;x<=7;x+=1) for (let z=1;z<=7;z+=1) states[`${x},6,${z}`]='minecraft:oak_planks';
  for (let y=7;y<=9;y+=1) for (let i=1;i<=7;i+=1) {
    states[`1,${y},${i}`]='minecraft:oak_planks'; states[`7,${y},${i}`]='minecraft:oak_planks';
    states[`${i},${y},1`]='minecraft:oak_planks'; states[`${i},${y},7`]='minecraft:oak_planks';
  }
  for (let x=1;x<=7;x+=1) for (let z=1;z<=7;z+=1) states[`${x},10,${z}`]='minecraft:oak_slab';
  const stairYs=disconnectedStairs?[2,5,8]:[2,3,4,5,6,7];
  for (const y of stairYs) states[`3,${y},4`]='minecraft:oak_stairs';
  return stage7VolumeFixture({width:9,height:12,length:9,states,hash:'b'.repeat(64)});
}

export function detachedPavilionV3Fixture() {
  const house=oneFloorHouseV3Fixture({sealed:true,axisLength:17});
  const states={};
  for (let y=0;y<house.height;y+=1) for (let z=0;z<house.length;z+=1) for (let x=0;x<house.width;x+=1) {
    const block=house.blockAt(x,y,z); if (!block.air) states[`${x},${y},${z}`]=block.state;
  }
  for (let y=1;y<=5;y+=1) states[`14,${y},14`]='minecraft:ladder';
  states['14,1,13']='minecraft:oak_door';
  return stage7VolumeFixture({width:17,height:7,length:17,states,hash:'c'.repeat(64)});
}

export function axisLengthV3Fixture(length) {
  const states={};
  for (let x=0;x<length;x+=1) states[`${x},0,0`]='minecraft:stone';
  return stage7VolumeFixture({width:length,height:1,length:1,states,hash:'d'.repeat(64)});
}

export function siteSceneV3Fixture() {
  const states={};
  for (let x=0;x<9;x+=1) for (let z=0;z<9;z+=1) states[`${x},0,${z}`]='minecraft:grass_block';
  for (let z=0;z<9;z+=1) states[`4,0,${z}`]='minecraft:dirt_path';
  states['1,0,1']='minecraft:water';
  states['7,1,7']='minecraft:oak_leaves';
  return stage7VolumeFixture({width:9,height:3,length:9,states,hash:'e'.repeat(64)});
}
```

- [ ] **Step 2: Write failing dense-evidence tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7GridTransformV3 } from '../src/construction/learning/stage7GridTransformV3.js';
import { collectStage7SemanticEvidenceV3, chooseDominantEvidenceLabel } from '../src/construction/learning/stage7SemanticEvidenceV3.js';
import { oneFloorHouseV3Fixture, axisLengthV3Fixture, siteSceneV3Fixture } from './fixtures/stage7DatasetV3Fixtures.js';

function bounds(volume) { return {min_x:0,min_y:0,min_z:0,max_x:volume.width-1,max_y:volume.height-1,max_z:volume.length-1}; }

test('dense evidence expands a 17-cell source axis without target gaps', () => {
  const volume=axisLengthV3Fixture(17);
  const transform=buildStage7GridTransformV3({volume,occupiedBounds:bounds(volume),frontSide:'south'});
  const result=collectStage7SemanticEvidenceV3({volume,transform,caseId:'axis-17'});
  const occupied=[...result.voxels.values()].filter((voxel)=>voxel.occupancy>0);
  assert.deepEqual([...new Set(occupied.map((voxel)=>voxel.x))],Array.from({length:64},(_,index)=>index));
});

test('dense evidence aggregates a 128-cell source axis into all 64 targets', () => {
  const volume=axisLengthV3Fixture(128);
  const transform=buildStage7GridTransformV3({volume,occupiedBounds:bounds(volume),frontSide:'south'});
  const result=collectStage7SemanticEvidenceV3({volume,transform,caseId:'axis-128'});
  const occupied=[...result.voxels.values()].filter((voxel)=>voxel.occupancy>0);
  assert.deepEqual([...new Set(occupied.map((voxel)=>voxel.x))],Array.from({length:64},(_,index)=>index));
  assert.ok(occupied.every((voxel)=>voxel.samples===2));
});

test('geometry evidence distinguishes doors, roof stairs, and interior air', () => {
  const volume=oneFloorHouseV3Fixture({roofStairs:true});
  const transform=buildStage7GridTransformV3({volume,occupiedBounds:bounds(volume),frontSide:'south'});
  const result=collectStage7SemanticEvidenceV3({volume,transform,caseId:'roof-stair-house'});
  const values=[...result.voxels.values()];
  assert.ok(values.some((voxel)=>voxel.flags.includes('opening-candidate')));
  assert.ok(values.some((voxel)=>voxel.flags.includes('stair-candidate')&&voxel.flags.includes('exterior-above')));
  assert.ok(values.some((voxel)=>voxel.flags.includes('interior-air')));
  assert.ok(result.sourceSampleCount>0);
});

test('site evidence distinguishes ground, path, water, and vegetation', () => {
  const volume=siteSceneV3Fixture();
  const transform=buildStage7GridTransformV3({volume,occupiedBounds:bounds(volume),frontSide:'south'});
  const values=[...collectStage7SemanticEvidenceV3({volume,transform,caseId:'site-scene'}).voxels.values()];
  for (const flag of ['ground','path','water','vegetation']) {
    assert.ok(values.some((voxel)=>voxel.flags.includes(flag)),`missing ${flag}`);
  }
});

test('evidence voting uses volume first and the declared canonical order only for ties', () => {
  assert.equal(chooseDominantEvidenceLabel({water:1,path:2},['water','path','none']),'path');
  assert.equal(chooseDominantEvidenceLabel({water:1,path:1},['water','path','none']),'water');
  assert.equal(chooseDominantEvidenceLabel({},['water','path','none']),'none');
});
```

- [ ] **Step 3: Run the evidence tests and verify RED**

Run: `node --test test/stage7SemanticEvidenceV3.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7SemanticEvidenceV3.js`.

- [ ] **Step 4: Implement dense evidence accumulation**

Create `stage7SemanticEvidenceV3.js` with these exact exports and result fields:

```js
import { targetIntervalForSource } from './stage7GridTransformV3.js';

const NEIGHBOURS=Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);

export function collectStage7SemanticEvidenceV3({volume,transform,caseId}={}) {
  if (!volume||typeof volume.blockAt!=='function') throw new Error('v3 evidence requires a schematic block volume');
  const bounds=transform?.occupied_bounds;
  if (!bounds) throw new Error('v3 evidence requires occupied bounds');
  const outside=exteriorAirMask(volume);
  const voxels=new Map();
  let sourceSampleCount=0;
  for (let y=bounds.min_y;y<=bounds.max_y;y+=1) for (let z=bounds.min_z;z<=bounds.max_z;z+=1) for (let x=bounds.min_x;x<=bounds.max_x;x+=1) {
    const block=volume.blockAt(x,y,z);
    const flags=classifyEvidence({volume,outside,block,x,y,z});
    sourceSampleCount+=1;
    const xr=targetIntervalForSource(x-bounds.min_x,transform.occupied_size[0]);
    const yr=targetIntervalForSource(y-bounds.min_y,transform.occupied_size[1]);
    const zr=targetIntervalForSource(z-bounds.min_z,transform.occupied_size[2]);
    for (let ty=yr[0];ty<=yr[1];ty+=1) for (let tz=zr[0];tz<=zr[1];tz+=1) for (let tx=xr[0];tx<=xr[1];tx+=1) {
      const key=`${tx},${ty},${tz}`;
      const voxel=voxels.get(key)||{x:tx,y:ty,z:tz,occupancy:0,samples:0,flags:new Map(),categories:new Map(),evidence_ids:[`source:${caseId}`]};
      voxel.samples+=1;
      if (!block.air) voxel.occupancy+=1;
      increment(voxel.categories,block.category||'other');
      for (const flag of flags) increment(voxel.flags,flag);
      voxels.set(key,voxel);
    }
  }
  return {
    voxels:new Map([...voxels.entries()].sort(([a],[b])=>compareKeys(a,b)).map(([key,value])=>[key,{
      ...value,
      flags:sortedKeys(value.flags),
      flag_counts:Object.fromEntries([...value.flags].sort(([a],[b])=>a.localeCompare(b))),
      categories:Object.fromEntries([...value.categories].sort())
    }])),
    sourceSampleCount,
    exteriorAirCount:outside.reduce((sum,value)=>sum+value,0)
  };
}

function classifyEvidence({volume,outside,block,x,y,z}) {
  const name=String(block.name||block.state||'').replace(/^minecraft:/,'').replace(/\[.*$/,'');
  if (block.air) return outside[indexOf(volume,x,y,z)]?['outside-air']:['interior-air'];
  const flags=['solid'];
  if (isOutside(volume,outside,x,y+1,z)) flags.push('exterior-above');
  if (NEIGHBOURS.some(([dx,dy,dz])=>dy===0&&isOutside(volume,outside,x+dx,y+dy,z+dz))) flags.push('exterior-side');
  if (/(door|gate)/.test(name)) flags.push('opening-candidate');
  if (/(glass|pane)/.test(name)) flags.push('window-candidate');
  if (/stairs?$/.test(name)) flags.push('stair-candidate');
  if (/(ladder|scaffolding)/.test(name)) flags.push('ladder-candidate');
  if (/slab/.test(name)) flags.push('slab-candidate');
  if (/(fence|fence_gate|cobblestone_wall)/.test(name)) flags.push('fence-candidate');
  if (/(torch|lantern|light|glowstone)/.test(name)) flags.push('light-candidate');
  if (block.category==='water') flags.push('water');
  if (block.category==='earth') flags.push('ground');
  if (block.category==='vegetation') flags.push('vegetation');
  if (/(path|road|pavement)/.test(name)) flags.push('path');
  return [...new Set(flags)].sort();
}

export function chooseDominantEvidenceLabel(counts={},tieOrder=[]) {
  let selected=tieOrder.at(-1),best=0;
  for (const label of tieOrder) {
    const count=Number(counts[label]||0);
    if (count>best) { selected=label; best=count; }
  }
  return selected;
}

function exteriorAirMask(volume) {
  const count=volume.width*volume.height*volume.length;
  const outside=new Uint8Array(count); const queue=new Int32Array(count); let head=0,tail=0;
  const seed=(x,y,z)=>{const index=indexOf(volume,x,y,z);if(outside[index]||!volume.blockAt(x,y,z).air)return;outside[index]=1;queue[tail++]=index;};
  for (let y=0;y<volume.height;y+=1) for (let z=0;z<volume.length;z+=1) {seed(0,y,z);seed(volume.width-1,y,z);}
  for (let y=0;y<volume.height;y+=1) for (let x=0;x<volume.width;x+=1) {seed(x,y,0);seed(x,y,volume.length-1);}
  for (let z=0;z<volume.length;z+=1) for (let x=0;x<volume.width;x+=1) {seed(x,0,z);seed(x,volume.height-1,z);}
  while(head<tail){const index=queue[head++],x=index%volume.width,yz=Math.floor(index/volume.width),z=yz%volume.length,y=Math.floor(yz/volume.length);for(const[dx,dy,dz]of NEIGHBOURS){const nx=x+dx,ny=y+dy,nz=z+dz;if(!inside(volume,nx,ny,nz))continue;const next=indexOf(volume,nx,ny,nz);if(!outside[next]&&volume.blockAt(nx,ny,nz).air){outside[next]=1;queue[tail++]=next;}}}
  return outside;
}

function increment(map,key){map.set(key,(map.get(key)||0)+1);}
function sortedKeys(map){return [...map.entries()].filter(([,count])=>count>0).sort(([a],[b])=>a.localeCompare(b)).map(([key])=>key);}
function compareKeys(a,b){const av=a.split(',').map(Number),bv=b.split(',').map(Number);return av[2]-bv[2]||av[1]-bv[1]||av[0]-bv[0];}
function inside(volume,x,y,z){return x>=0&&y>=0&&z>=0&&x<volume.width&&y<volume.height&&z<volume.length;}
function indexOf(volume,x,y,z){return y*volume.length*volume.width+z*volume.width+x;}
function isOutside(volume,mask,x,y,z){return !inside(volume,x,y,z)||Boolean(mask[indexOf(volume,x,y,z)]);}
```

- [ ] **Step 5: Run evidence and transform tests**

Run:

```powershell
node --test test/stage7GridTransformV3.test.js test/stage7SemanticEvidenceV3.test.js
```

Expected: 8 passed, 0 failed.

- [ ] **Step 6: Commit fixtures and evidence**

```powershell
git add src/construction/learning/stage7SemanticEvidenceV3.js test/fixtures/stage7DatasetV3Fixtures.js test/stage7SemanticEvidenceV3.test.js
git commit -m "feat(stage7): collect dense dataset v3 evidence"
```

---

### Task 3: Derive v3 Envelope, Site, Space, and Traversable Topology

**Files:**
- Create: `src/construction/learning/stage7SemanticTopologyV3.js`
- Create: `test/stage7SemanticTopologyV3.test.js`
- Modify: `test/fixtures/stage7DatasetV3Fixtures.js`

**Interfaces:**
- Consumes: dense evidence result from Task 2 and transform from Task 1.
- Produces: `buildStage7SemanticTopologyV3({evidence, transform, caseId}) -> {cells, topology, stats, warnings}`; `topology` includes component counts, entrance keys, circulation keys, vertical-core keys, floor levels, and roof/vertical overlap.

- [ ] **Step 1: Write failing positive and negative topology tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7GridTransformV3 } from '../src/construction/learning/stage7GridTransformV3.js';
import { collectStage7SemanticEvidenceV3 } from '../src/construction/learning/stage7SemanticEvidenceV3.js';
import { buildStage7SemanticTopologyV3 } from '../src/construction/learning/stage7SemanticTopologyV3.js';
import { oneFloorHouseV3Fixture, twoFloorHouseV3Fixture, detachedPavilionV3Fixture, siteSceneV3Fixture } from './fixtures/stage7DatasetV3Fixtures.js';

function extract(volume,caseId) {
  const occupiedBounds={min_x:0,min_y:0,min_z:0,max_x:volume.width-1,max_y:volume.height-1,max_z:volume.length-1};
  const transform=buildStage7GridTransformV3({volume,occupiedBounds,frontSide:'south'});
  const evidence=collectStage7SemanticEvidenceV3({volume,transform,caseId});
  return buildStage7SemanticTopologyV3({evidence,transform,caseId});
}

test('one-floor fixture has a real entrance, circulation, floor, roof, and no vertical core', () => {
  const result=extract(oneFloorHouseV3Fixture(),'one-floor');
  assert.ok(result.topology.entrance_keys.length>0);
  assert.ok(result.topology.circulation_keys.length>0);
  assert.deepEqual(result.topology.vertical_core_keys,[]);
  assert.ok(result.cells.some((cell)=>cell.envelope==='floor'));
  assert.ok(result.cells.some((cell)=>cell.envelope==='roof'));
});

test('connected two-floor stairs form one vertical core and disconnected stairs do not', () => {
  const connected=extract(twoFloorHouseV3Fixture(),'two-floor');
  const disconnected=extract(twoFloorHouseV3Fixture({disconnectedStairs:true}),'broken-stairs');
  assert.ok(connected.topology.vertical_core_keys.length>0);
  assert.deepEqual(disconnected.topology.vertical_core_keys,[]);
});

test('roof stairs stay roof and detached pavilion cannot donate the entrance or core', () => {
  const roof=extract(oneFloorHouseV3Fixture({roofStairs:true}),'roof-stairs');
  assert.equal(roof.topology.roof_vertical_overlap,0);
  const detached=extract(detachedPavilionV3Fixture(),'detached');
  assert.deepEqual(detached.topology.entrance_keys,[]);
  assert.deepEqual(detached.topology.vertical_core_keys,[]);
});

test('sealed primary house has no exterior-connected entrance', () => {
  const sealed=extract(oneFloorHouseV3Fixture({sealed:true}),'sealed-house');
  assert.deepEqual(sealed.topology.entrance_keys,[]);
  assert.deepEqual(sealed.topology.circulation_keys,[]);
});

test('site scene preserves ground, path, water, and vegetation labels', () => {
  const site=extract(siteSceneV3Fixture(),'site-scene');
  for (const value of ['ground','path','water','vegetation']) {
    assert.ok(site.cells.some((cell)=>cell.site===value),`missing site ${value}`);
  }
});
```

- [ ] **Step 2: Run topology tests and verify RED**

Run: `node --test test/stage7SemanticTopologyV3.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7SemanticTopologyV3.js`.

- [ ] **Step 3: Implement the topology module with explicit phases**

Implement `buildStage7SemanticTopologyV3` with this exact orchestration and exported result shape:

```js
import { chooseDominantEvidenceLabel } from './stage7SemanticEvidenceV3.js';

const NEIGHBOURS_6=Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);
const ENVELOPE_TIE_ORDER=Object.freeze(['roof','wall','floor','support','none']);
const SITE_TIE_ORDER=Object.freeze(['water','path','vegetation','ground','none']);

export function buildStage7SemanticTopologyV3({evidence,transform,caseId}={}) {
  const voxels=evidence?.voxels;
  if (!(voxels instanceof Map)) throw new Error('v3 topology requires evidence voxels');
  const classified=new Map();
  for (const [key,voxel] of voxels) classified.set(key,classifyVoxel(voxel,caseId));
  const solidComponents=components(classified,(cell)=>cell.envelope!=='none'&&cell.site==='none');
  const primaryKeys=new Set(solidComponents[0]||[]);
  const interiorKeys=new Set([...classified.entries()].filter(([,cell])=>cell.flags.includes('interior-air')&&insideBounds(cell,boundsOfKeys(primaryKeys,classified))).map(([key])=>key));
  const floorLevels=acceptedFloorLevels(classified,primaryKeys,interiorKeys);
  const roofKeys=new Set([...classified.entries()].filter(([key,cell])=>primaryKeys.has(key)&&cell.envelope==='roof').map(([key])=>key));
  const openingKeys=findConfirmedOpenings(classified,primaryKeys,interiorKeys);
  const entranceKeys=findEntrances(classified,openingKeys,interiorKeys);
  const circulationKeys=entranceKeys.length?floodInterior(classified,interiorKeys,entranceKeys):[];
  const verticalCoreKeys=findVerticalCore(classified,primaryKeys,floorLevels);
  const openingSet=new Set(openingKeys),entranceSet=new Set(entranceKeys),circulationSet=new Set(circulationKeys),verticalCoreSet=new Set(verticalCoreKeys);
  const cells=[...classified.values()].map((cell)=>{
    const key=keyOf(cell);
    const space=entranceSet.has(key)?'circulation':verticalCoreSet.has(key)?'vertical_circulation':circulationSet.has(key)?'circulation':interiorKeys.has(key)?(cell.y<=median(floorLevels)?'public':'private'):'outside';
    const envelope=verticalCoreSet.has(key)?'none':openingSet.has(key)?'opening':cell.envelope;
    return {...stripEvidence(cell),envelope,space};
  }).filter(hasSemanticValue).sort(compareCells);
  return {
    cells,
    topology:{
      massing_component_count:solidComponents.length,
      primary_component_size:primaryKeys.size,
      opening_keys:[...openingKeys].sort(),
      entrance_keys:[...entranceKeys].sort(),
      circulation_keys:[...circulationKeys].sort(),
      vertical_core_keys:[...verticalCoreKeys].sort(),
      floor_levels:[...floorLevels].sort((a,b)=>a-b),
      roof_vertical_overlap:verticalCoreKeys.filter((key)=>roofKeys.has(key)).length
    },
    stats:summarize(cells,evidence.sourceSampleCount),
    warnings:[]
  };
}
```

Add the following private helpers in the same file; each helper must be deterministic and must sort keys before traversal:

```js
function classifyVoxel(voxel,caseId) {
  const flags=[...voxel.flags];
  const envelope=chooseEnvelope(voxel);
  const site=chooseSite(voxel.flag_counts);
  return {x:voxel.x,y:voxel.y,z:voxel.z,envelope:site==='none'?envelope:'none',space:'outside',site,confidence:1,evidence_ids:[`source:${caseId}`],flags,flag_counts:voxel.flag_counts};
}

function chooseEnvelope(voxel) {
  const flags=voxel.flags,counts=voxel.flag_counts||{};
  if (flags.includes('outside-air')||flags.includes('interior-air')) return 'none';
  const solid=counts.solid||0,roof=counts['exterior-above']||0,wall=counts['exterior-side']||0;
  return chooseDominantEvidenceLabel({
    roof,wall,
    floor:Math.max(0,solid-Math.max(roof,wall)),
    support:counts['fence-candidate']||0,
    none:0
  },ENVELOPE_TIE_ORDER);
}

function chooseSite(flagCounts) { return chooseDominantEvidenceLabel(flagCounts,SITE_TIE_ORDER); }

function components(cells,predicate) {
  const remaining=new Set([...cells.entries()].filter(([,cell])=>predicate(cell)).map(([key])=>key));
  const result=[];
  for (const start of [...remaining].sort()) {
    if (!remaining.has(start)) continue;
    const queue=[start],component=[]; remaining.delete(start);
    for (let head=0;head<queue.length;head+=1) {
      const key=queue[head],cell=cells.get(key); component.push(key);
      for (const [dx,dy,dz] of NEIGHBOURS_6) {const next=`${cell.x+dx},${cell.y+dy},${cell.z+dz}`;if(remaining.delete(next))queue.push(next);}
    }
    result.push(component.sort());
  }
  return result.sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]));
}
```

Add these complete helpers below `components`:

```js
function acceptedFloorLevels(cells,primaryKeys,interiorKeys) {
  const counts=new Map();
  for (const [key,cell] of cells) {
    if (!primaryKeys.has(key)||cell.envelope!=='floor') continue;
    if (!interiorKeys.has(`${cell.x},${cell.y+1},${cell.z}`)) continue;
    counts.set(cell.y,(counts.get(cell.y)||0)+1);
  }
  const levels=[...counts.entries()].filter(([,count])=>count>=4).map(([y])=>y).sort((a,b)=>a-b);
  const bands=[];
  for (const level of levels) {
    const band=bands.at(-1);
    if (!band||level>band.at(-1)+1) bands.push([level]); else band.push(level);
  }
  return bands.map((band)=>band.at(-1));
}

function findConfirmedOpenings(cells,primaryKeys,interiorKeys) {
  return [...cells.entries()].filter(([key,cell])=>
    primaryKeys.has(key)&&
    (cell.flags.includes('opening-candidate')||cell.flags.includes('window-candidate'))&&
    cell.flags.includes('exterior-side')&&
    neighbourKeys(cell).some((next)=>interiorKeys.has(next))
  ).map(([key])=>key).sort();
}

function findEntrances(cells,openingKeys,interiorKeys) {
  const accepted=new Set(openingKeys);
  const candidates=new Map([...cells.entries()].filter(([key,cell])=>accepted.has(key)&&cell.flags.includes('opening-candidate')));
  for (const component of components(candidates,()=>true)) {
    const touchesOutside=component.some((key)=>cells.get(key).flags.includes('exterior-side'));
    const touchesInside=component.some((key)=>neighbourKeys(cells.get(key)).some((next)=>interiorKeys.has(next)));
    if (touchesOutside&&touchesInside) return component;
  }
  return [];
}

function floodInterior(cells,interiorKeys,entranceKeys) {
  const seeds=[];
  for (const key of entranceKeys) for (const next of neighbourKeys(cells.get(key))) if (interiorKeys.has(next)) seeds.push(next);
  const visited=new Set([...new Set(seeds)].sort()),queue=[...visited];
  for (let head=0;head<queue.length;head+=1) {
    const cell=cells.get(queue[head]);
    for (const next of neighbourKeys(cell)) if (interiorKeys.has(next)&&!visited.has(next)) {visited.add(next);queue.push(next);}
  }
  return [...visited].sort();
}

function findVerticalCore(cells,primaryKeys,floorLevels) {
  if (floorLevels.length<2) return [];
  const candidates=new Map([...cells.entries()].filter(([key,cell])=>primaryKeys.has(key)&&(cell.flags.includes('stair-candidate')||cell.flags.includes('ladder-candidate'))));
  for (const component of components(candidates,()=>true)) {
    const ys=component.map((key)=>cells.get(key).y);
    if (Math.min(...ys)<=floorLevels[0]+1&&Math.max(...ys)>=floorLevels.at(-1)-1) return component;
  }
  return [];
}

function boundsOfKeys(keys,cells) {
  if (!keys.size) return null;
  const result={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for (const key of keys) {const cell=cells.get(key);result.minX=Math.min(result.minX,cell.x);result.maxX=Math.max(result.maxX,cell.x);result.minY=Math.min(result.minY,cell.y);result.maxY=Math.max(result.maxY,cell.y);result.minZ=Math.min(result.minZ,cell.z);result.maxZ=Math.max(result.maxZ,cell.z);}
  return result;
}

function insideBounds(cell,bounds){return Boolean(bounds)&&cell.x>=bounds.minX&&cell.x<=bounds.maxX&&cell.y>=bounds.minY&&cell.y<=bounds.maxY&&cell.z>=bounds.minZ&&cell.z<=bounds.maxZ;}
function neighbourKeys(cell){return NEIGHBOURS_6.map(([dx,dy,dz])=>`${cell.x+dx},${cell.y+dy},${cell.z+dz}`);}
function median(values){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)/2)];}
function stripEvidence(cell){const {flags,flag_counts,...canonical}=cell;return canonical;}
function hasSemanticValue(cell){return cell.envelope!=='none'||cell.space!=='outside'||cell.site!=='none';}
function keyOf(cell){return `${cell.x},${cell.y},${cell.z}`;}
function compareCells(a,b){return a.z-b.z||a.y-b.y||a.x-b.x;}
function summarize(cells,sourceSampleCount){const layer_counts={envelope:{},space:{},site:{}};for(const cell of cells)for(const layer of ['envelope','space','site'])layer_counts[layer][cell[layer]]=(layer_counts[layer][cell[layer]]||0)+1;return {source_sample_count:sourceSampleCount,logical_cell_count:cells.length,layer_counts};}
```

- [ ] **Step 4: Run topology, evidence, and transform tests**

Run:

```powershell
node --test test/stage7GridTransformV3.test.js test/stage7SemanticEvidenceV3.test.js test/stage7SemanticTopologyV3.test.js
```

Expected: 13 passed, 0 failed.

- [ ] **Step 5: Commit topology derivation**

```powershell
git add src/construction/learning/stage7SemanticTopologyV3.js test/stage7SemanticTopologyV3.test.js test/fixtures/stage7DatasetV3Fixtures.js
git commit -m "feat(stage7): derive dataset v3 topology"
```

---

### Task 4: Add v3 Semantic Validation, Bounded Repair Policy, and Cell Audit

**Files:**
- Create: `src/construction/learning/stage7SemanticValidatorV3.js`
- Create: `test/stage7SemanticValidatorV3.test.js`

**Interfaces:**
- Consumes: `{cells, topology, requiredFloors}` from Task 3; the existing `repairCoarseSemanticVoxelPlan` result when a canonical plan is available.
- Produces: `validateStage7SemanticTopologyV3(...) -> {accepted, blockers, metrics}` and `enforceStage7V3RepairPolicy({beforeCells, repairResult}) -> {accepted, blockers, repair_audit, plan}`.

- [ ] **Step 1: Write failing validator and repair-policy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStage7SemanticTopologyV3,
  enforceStage7V3RepairPolicy
} from '../src/construction/learning/stage7SemanticValidatorV3.js';

const cell=(x,y,z,values={})=>({x,y,z,envelope:values.envelope||'none',space:values.space||'outside',site:values.site||'none',confidence:1,evidence_ids:['fixture:v3']});

test('v3 validator accepts complete one-floor topology and rejects missing entrance', () => {
  const cells=[cell(1,1,1,{envelope:'floor'}),cell(1,2,1,{space:'circulation'}),cell(2,2,1,{space:'public'}),cell(1,3,1,{envelope:'roof'}),cell(0,2,1,{envelope:'opening',space:'circulation'})];
  const topology={massing_component_count:1,primary_component_size:3,entrance_keys:['0,2,1'],circulation_keys:['1,2,1'],vertical_core_keys:[],floor_levels:[1],roof_vertical_overlap:0};
  assert.equal(validateStage7SemanticTopologyV3({cells,topology,requiredFloors:1}).accepted,true);
  const rejected=validateStage7SemanticTopologyV3({cells,topology:{...topology,entrance_keys:[]},requiredFloors:1});
  assert.ok(rejected.blockers.some((item)=>item.id==='missing-entrance'));
});

test('v3 validator requires one connected vertical core for multiple floors', () => {
  const result=validateStage7SemanticTopologyV3({
    cells:[cell(1,1,1,{envelope:'floor'}),cell(1,8,1,{envelope:'floor'}),cell(1,9,1,{envelope:'roof'}),cell(0,2,1,{envelope:'opening',space:'circulation'}),cell(1,2,1,{space:'circulation'})],
    topology:{massing_component_count:1,primary_component_size:4,entrance_keys:['0,2,1'],circulation_keys:['1,2,1'],vertical_core_keys:[],floor_levels:[1,8],roof_vertical_overlap:0},
    requiredFloors:2
  });
  assert.ok(result.blockers.some((item)=>item.id==='missing-vertical-circulation'));

  const discontinuous=validateStage7SemanticTopologyV3({
    cells:[cell(1,1,1,{envelope:'floor'}),cell(1,9,1,{envelope:'roof'}),cell(0,2,1,{envelope:'opening',space:'circulation'}),cell(1,2,1,{space:'circulation'}),cell(2,2,1,{space:'public'})],
    topology:{massing_component_count:1,primary_component_size:4,entrance_keys:['0,2,1'],circulation_keys:['1,2,1'],vertical_core_keys:['1,2,1'],floor_levels:[1],roof_vertical_overlap:0},
    requiredFloors:2
  });
  assert.ok(discontinuous.blockers.some((item)=>item.id==='missing-floor-continuity'));
});

test('v3 repair policy rejects invented roof caps and audits permitted cell changes', () => {
  const before=[cell(1,1,1,{envelope:'wall'})];
  const invented={accepted:true,plan:{runs:[]},repairs:[{reason:'missing-roof-cap',cells:['1,2,1']}],decodedCells:[...before,cell(1,2,1,{envelope:'roof'})]};
  const rejected=enforceStage7V3RepairPolicy({beforeCells:before,repairResult:invented});
  assert.equal(rejected.accepted,false);
  assert.ok(rejected.blockers.some((item)=>item.id==='v3-repair-policy-exceeded'));

  const permitted={accepted:true,plan:{runs:[]},repairs:[{reason:'one-cell-envelope-gap',cells:['2,1,1']}],decodedCells:[...before,cell(2,1,1,{envelope:'wall'})]};
  const accepted=enforceStage7V3RepairPolicy({beforeCells:before,repairResult:permitted});
  assert.equal(accepted.accepted,true);
  assert.deepEqual(accepted.repair_audit[0],{
    coordinate:[2,1,1],
    before:{envelope:'none',space:'outside',site:'none'},
    after:{envelope:'wall',space:'outside',site:'none'},
    reason:'one-cell-envelope-gap'
  });
});
```

- [ ] **Step 2: Run validator tests and verify RED**

Run: `node --test test/stage7SemanticValidatorV3.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7SemanticValidatorV3.js`.

- [ ] **Step 3: Implement topology blockers and exact repair budgets**

```js
import { decodeStage7Runs } from './coarseSemanticVoxelSchema.js';

export const STAGE7_V3_REPAIR_BUDGETS=Object.freeze({
  'merge-adjacent-runs':262144,
  'isolated-component':8,
  'one-cell-envelope-gap':1,
  'circulation-envelope-conflict':8
});

export function validateStage7SemanticTopologyV3({cells=[],topology={},requiredFloors=1}={}) {
  const blockers=[];
  requireValue(topology.massing_component_count>0,'missing-primary-envelope','primary envelope is missing');
  requireValue(topology.massing_component_count<=16,'too-many-massing-components','massing component count exceeds 16');
  requireValue(cells.some((cell)=>['public','private','service'].includes(cell.space)),'missing-usable-space','usable interior space is missing');
  requireValue((topology.entrance_keys||[]).length>0,'missing-entrance','exterior-connected entrance is missing');
  requireValue((topology.circulation_keys||[]).length>0,'missing-circulation','entrance-connected circulation is missing');
  requireValue(cells.some((cell)=>cell.envelope==='roof'),'missing-roof','roof coverage is missing');
  requireValue((topology.floor_levels||[]).length>=requiredFloors,'missing-floor-continuity','accepted floor levels are incomplete');
  requireValue(requiredFloors<=1||(topology.vertical_core_keys||[]).length>0,'missing-vertical-circulation','connected vertical core is missing');
  requireValue((topology.roof_vertical_overlap||0)===0,'roof-vertical-overlap','roof cells cannot be vertical circulation');
  return {accepted:blockers.length===0,blockers,metrics:{...topology,cell_count:cells.length}};

  function requireValue(ok,id,message){if(!ok)blockers.push({id,severity:'blocker',message});}
}

export function enforceStage7V3RepairPolicy({beforeCells=[],repairResult={}}={}) {
  const blockers=[...(repairResult.blockers||[])];
  const counts={};
  for (const repair of repairResult.repairs||[]) counts[repair.reason]=(counts[repair.reason]||0)+(repair.cells?.length||0);
  for (const [reason,count] of Object.entries(counts)) {
    const budget=STAGE7_V3_REPAIR_BUDGETS[reason];
    if (budget===undefined||count>budget) blockers.push({id:'v3-repair-policy-exceeded',severity:'blocker',message:`${reason} changed ${count} cells; budget ${budget??0}`});
  }
  const afterCells=repairResult.decodedCells||decodeStage7Runs(repairResult.plan?.runs||[]);
  const repairAudit=diffCells(beforeCells,afterCells,repairResult.repairs||[]);
  return {accepted:Boolean(repairResult.accepted)&&blockers.length===0,blockers,repair_audit:repairAudit,plan:repairResult.plan};
}

function diffCells(beforeCells,afterCells,repairs) {
  const empty={envelope:'none',space:'outside',site:'none'};
  const before=new Map(beforeCells.map((cell)=>[keyOf(cell),cell]));
  const after=new Map(afterCells.map((cell)=>[keyOf(cell),cell]));
  const reasonByKey=new Map();
  for (const repair of repairs) for (const key of repair.cells||[]) if (!reasonByKey.has(key)) reasonByKey.set(key,repair.reason);
  const keys=[...new Set([...before.keys(),...after.keys()])].sort();
  return keys.filter((key)=>semanticJson(before.get(key)||empty)!==semanticJson(after.get(key)||empty)).map((key)=>({
    coordinate:key.split(',').map(Number),
    before:semantic(before.get(key)||empty),
    after:semantic(after.get(key)||empty),
    reason:reasonByKey.get(key)||'canonical-run-normalization'
  }));
}

function semantic(cell){return {envelope:cell.envelope||'none',space:cell.space||'outside',site:cell.site||'none'};}
function semanticJson(cell){return JSON.stringify(semantic(cell));}
function keyOf(cell){return `${cell.x},${cell.y},${cell.z}`;}
```

- [ ] **Step 4: Run focused v3 semantic tests**

Run:

```powershell
node --test test/stage7SemanticTopologyV3.test.js test/stage7SemanticValidatorV3.test.js
```

Expected: 8 passed, 0 failed.

- [ ] **Step 5: Commit v3 validation policy**

```powershell
git add src/construction/learning/stage7SemanticValidatorV3.js test/stage7SemanticValidatorV3.test.js
git commit -m "feat(stage7): validate dataset v3 semantics"
```

---

### Task 5: Bind v3 Semantic Reviews to the Exact Extraction Plan

**Files:**
- Create: `src/construction/learning/stage7DatasetReviewScopeV3.js`
- Create: `test/stage7DatasetReviewScopeV3.test.js`
- Modify: `src/construction/learning/stage7DatasetReviewOverlay.js`
- Modify: `test/stage7DatasetReviewOverlay.test.js`

**Interfaces:**
- Consumes: normalized review record and `{sourceSha256, extractorVersion, reviewPlanSha256}`.
- Produces: `evaluateStage7V3ReviewScope(...) -> {applies, semanticAccepted, blockers}`. Exact binding and the human decision are separate: a scoped record applies when its hashes match, but whole-case semantic acceptance additionally requires explicit approval of `envelope`, `site`, and `space`. Old unscoped records continue to provide governance and orientation but never v3 semantic approval.

- [ ] **Step 1: Write failing overlay and scope tests**

Append to `test/stage7DatasetReviewOverlay.test.js`:

```js
test('v3 review scope normalizes dataset, extractor, and plan binding', () => {
  const record=completeReview({
    dataset_version:'v3',
    extractor_version:'stage7-coarse-semantic-voxel-schematic-extractor-v3',
    plan_sha256:'c'.repeat(64)
  });
  const parsed=parseStage7DatasetReviewOverlay(JSON.stringify(record));
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.records[0].dataset_version,'v3');
  assert.equal(parsed.records[0].plan_sha256,'c'.repeat(64));
});

test('partial v3 review scope is rejected while legacy unscoped records stay valid', () => {
  const partial=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview({dataset_version:'v3'})));
  assert.match(partial.errors[0].message,/review scope requires dataset_version, extractor_version, and plan_sha256/);
  assert.deepEqual(parseStage7DatasetReviewOverlay(JSON.stringify(completeReview())).errors,[]);
});
```

Create `test/stage7DatasetReviewScopeV3.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStage7V3ReviewScope } from '../src/construction/learning/stage7DatasetReviewScopeV3.js';

const expected={sourceSha256:'a'.repeat(64),extractorVersion:'stage7-coarse-semantic-voxel-schematic-extractor-v3',reviewPlanSha256:'c'.repeat(64)};

test('only an exact v3 source, extractor, and plan binding applies', () => {
  const record={
    source_sha256:expected.sourceSha256,dataset_version:'v3',extractor_version:expected.extractorVersion,
    plan_sha256:expected.reviewPlanSha256,approved_learning_areas:['envelope','site','space'],blocked_learning_areas:[]
  };
  assert.deepEqual(evaluateStage7V3ReviewScope({reviewRecord:record,...expected}),{applies:true,semanticAccepted:true,blockers:[]});
  for (const changed of [
    {...record,source_sha256:'b'.repeat(64)},
    {...record,extractor_version:'stale-extractor'},
    {...record,plan_sha256:'d'.repeat(64)},
    {source_sha256:expected.sourceSha256}
  ]) assert.equal(evaluateStage7V3ReviewScope({reviewRecord:changed,...expected}).applies,false);
});

test('an exact scoped review with a blocked layer applies but rejects whole-case semantics', () => {
  const record={
    source_sha256:expected.sourceSha256,dataset_version:'v3',extractor_version:expected.extractorVersion,
    plan_sha256:expected.reviewPlanSha256,approved_learning_areas:['envelope','site'],blocked_learning_areas:['space']
  };
  const result=evaluateStage7V3ReviewScope({reviewRecord:record,...expected});
  assert.equal(result.applies,true);
  assert.equal(result.semanticAccepted,false);
  assert.deepEqual(result.blockers,['v3-semantic-review-rejected']);
});
```

- [ ] **Step 2: Run scope tests and verify RED**

Run:

```powershell
node --test test/stage7DatasetReviewOverlay.test.js test/stage7DatasetReviewScopeV3.test.js
```

Expected: FAIL because the three fields are unknown and the new module is missing.

- [ ] **Step 3: Extend the append-only overlay without changing old records**

In `stage7DatasetReviewOverlay.js`:

```js
const ROOT_FIELDS=new Set([
  'record_id','case_id','source_sha256','reviewed_by','reviewed_at','status','canonical_front_side',
  'source_author','source_uploader','author_evidence','license_status','allowed_uses','license_evidence',
  'approved_learning_areas','blocked_learning_areas','semantic_corrections','notes',
  'dataset_version','extractor_version','plan_sha256'
]);
```

Add to `normalizeRecord`:

```js
dataset_version:raw.dataset_version?String(raw.dataset_version).trim():null,
extractor_version:raw.extractor_version?String(raw.extractor_version).trim():null,
plan_sha256:raw.plan_sha256?String(raw.plan_sha256).trim().toLowerCase():null,
```

Add to `validateStage7DatasetReviewRecord`:

```js
const scoped=[record.dataset_version,record.extractor_version,record.plan_sha256];
if (scoped.some(Boolean)&&!scoped.every(Boolean)) errors.push('review scope requires dataset_version, extractor_version, and plan_sha256');
if (record.plan_sha256&&!/^[a-f0-9]{64}$/.test(record.plan_sha256)) errors.push('plan_sha256 must be lowercase SHA-256');
if (record.dataset_version&&record.dataset_version!=='v3') errors.push(`unsupported review dataset_version ${record.dataset_version}`);
if (scoped.every(Boolean)) {
  if (!record.reviewed_by) errors.push('scoped semantic review requires reviewed_by');
  if (!Number.isFinite(Date.parse(record.reviewed_at))) errors.push('scoped semantic review requires reviewed_at');
  for (const layer of TARGET_LAYERS) if (!approved.has(layer)&&!blocked.has(layer)) errors.push(`scoped semantic review requires an explicit ${layer} decision`);
}
```

- [ ] **Step 4: Implement exact v3 scope matching**

```js
export function evaluateStage7V3ReviewScope({reviewRecord,sourceSha256,extractorVersion,reviewPlanSha256}={}) {
  const blockers=[];
  if (!reviewRecord?.dataset_version) blockers.push('v3-semantic-review-unbound');
  else {
    if (reviewRecord.dataset_version!=='v3') blockers.push('v3-review-dataset-mismatch');
    if (reviewRecord.source_sha256!==sourceSha256) blockers.push('v3-review-source-mismatch');
    if (reviewRecord.extractor_version!==extractorVersion) blockers.push('v3-review-extractor-mismatch');
    if (reviewRecord.plan_sha256!==reviewPlanSha256) blockers.push('v3-review-plan-mismatch');
  }
  const applies=blockers.length===0;
  const approved=new Set(reviewRecord?.approved_learning_areas||[]);
  const blocked=new Set(reviewRecord?.blocked_learning_areas||[]);
  const semanticAccepted=applies&&['envelope','site','space'].every((layer)=>approved.has(layer)&&!blocked.has(layer));
  if (applies&&!semanticAccepted) blockers.push('v3-semantic-review-rejected');
  return {applies,semanticAccepted,blockers:blockers.sort()};
}
```

- [ ] **Step 5: Run review tests and verify GREEN**

Run:

```powershell
node --test test/stage7DatasetReviewOverlay.test.js test/stage7DatasetReviewScopeV3.test.js
```

Expected: all tests pass; existing v2 review records remain valid.

- [ ] **Step 6: Commit plan-bound review support**

```powershell
git add src/construction/learning/stage7DatasetReviewOverlay.js src/construction/learning/stage7DatasetReviewScopeV3.js test/stage7DatasetReviewOverlay.test.js test/stage7DatasetReviewScopeV3.test.js
git commit -m "feat(stage7): bind dataset v3 semantic reviews"
```

---

### Task 6: Orchestrate the v3 Rasterizer and Dataset Case Record

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelDatasetRasterizerV3.js`
- Create: `test/coarseSemanticVoxelDatasetV3.test.js`
- Create: `test/fixtures/stage7DatasetV3Golden.json`
- Modify: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- Modify: `test/coarseSemanticVoxelDatasetCase.test.js`

**Interfaces:**
- Consumes: `volume`, merged `caseRecord`, optional raw `reviewRecord`, `datasetVersion:'v3'`.
- Produces: a Dataset v3 case with `review_plan_sha256`, `automated_semantic_status`, plan-bound `semantic_status`, transform/extractor versions, topology metrics, and repair audit.

- [ ] **Step 1: Write the failing v3 rasterizer and case tests**

Create `test/coarseSemanticVoxelDatasetV3.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildStage7DatasetCase, STAGE7_DATASET_EXTRACTOR_V3 } from '../src/construction/learning/coarseSemanticVoxelDatasetCase.js';
import { oneFloorHouseV3Fixture } from './fixtures/stage7DatasetV3Fixtures.js';
import { reviewedCaseFixture } from './fixtures/stage7DatasetFixtures.js';

test('v3 case is automated separately from human semantic acceptance', () => {
  const volume=oneFloorHouseV3Fixture();
  const caseRecord=reviewedCaseFixture();
  const first=buildStage7DatasetCase({volume,caseRecord,reviewRecord:null,datasetVersion:'v3',localArtifactRoot:'.tmp/v3-test'});
  assert.equal(first.record.dataset_version,'v3');
  assert.equal(first.record.extraction.extractor_version,STAGE7_DATASET_EXTRACTOR_V3);
  assert.match(first.record.artifacts.review_plan_sha256,/^[a-f0-9]{64}$/);
  assert.equal(first.record.training.eligible,false);
  assert.ok(first.record.training.blockers.includes('v3-semantic-review-unbound'));
  assert.notEqual(first.record.extraction.semantic_status,'accepted');
});

test('v3 unreviewed front remains diagnostic-only and cannot become accepted', () => {
  const volume=oneFloorHouseV3Fixture();
  const caseRecord=reviewedCaseFixture();
  caseRecord.review.canonical_front_side=null;
  const result=buildStage7DatasetCase({volume,caseRecord,datasetVersion:'v3'});
  assert.equal(result.record.normalized_transform.front_side,'south');
  assert.ok(result.record.extraction.warnings.includes('canonical front side is unreviewed; south used for diagnostics'));
  assert.ok(result.record.training.blockers.includes('canonical-front-side-unreviewed'));
  assert.notEqual(result.record.extraction.semantic_status,'accepted');
});

test('exact v3 plan-bound positive review can accept an automated-valid fixture', () => {
  const volume=oneFloorHouseV3Fixture();
  const caseRecord=reviewedCaseFixture();
  const preview=buildStage7DatasetCase({volume,caseRecord,datasetVersion:'v3'});
  const reviewRecord={
    record_id:'fixture-v3-review',case_id:caseRecord.case_id,source_sha256:volume.source_sha256,
    reviewed_by:'fixture-curator',reviewed_at:'2026-07-13T00:00:00.000Z',status:'limited',
    source_author:'fixture-author',source_uploader:'fixture-uploader',author_evidence:'Fixture provenance.',
    canonical_front_side:'south',license_status:'verified',allowed_uses:['local-analysis','local-training'],
    license_evidence:'Fixture-only permission.',approved_learning_areas:['envelope','site','space'],blocked_learning_areas:[],semantic_corrections:[],notes:'',
    dataset_version:'v3',extractor_version:STAGE7_DATASET_EXTRACTOR_V3,plan_sha256:preview.record.artifacts.review_plan_sha256
  };
  const accepted=buildStage7DatasetCase({volume,caseRecord,reviewRecord,datasetVersion:'v3'});
  assert.equal(accepted.record.extraction.automated_semantic_status,'accepted');
  assert.equal(accepted.record.extraction.semantic_status,'accepted');
  assert.equal(accepted.record.training.eligible,true);
});

test('one-floor v3 fixture matches the reviewed golden transform, layers, topology, blockers, and hash', async () => {
  const result=buildStage7DatasetCase({volume:oneFloorHouseV3Fixture(),caseRecord:reviewedCaseFixture(),datasetVersion:'v3'});
  const actual={
    source:'stage7-dataset-v3-fixture-golden-v1',schema_version:1,fixture:'one-floor-house-v3',
    extractor_version:result.record.extraction.extractor_version,
    transform:result.record.normalized_transform,
    layer_counts:result.record.extraction.stats.layer_counts,
    topology:result.record.extraction.topology,
    automated_semantic_status:result.record.extraction.automated_semantic_status,
    blockers:result.record.extraction.blockers,
    review_plan_sha256:result.record.artifacts.review_plan_sha256
  };
  const goldenUrl=new URL('./fixtures/stage7DatasetV3Golden.json',import.meta.url);
  if (process.env.UPDATE_STAGE7_V3_GOLDEN==='1') await fs.writeFile(goldenUrl,`${JSON.stringify(actual,null,2)}\n`,'utf8');
  const expected=JSON.parse(await fs.readFile(goldenUrl,'utf8'));
  assert.deepEqual(actual,expected);
});
```

Append to `test/coarseSemanticVoxelDatasetCase.test.js`:

```js
test('Dataset v1 and v2 continue to use extractor v1 and retain their record shapes', () => {
  for (const datasetVersion of ['v1','v2']) {
    const result=buildStage7DatasetCase({volume:hollowHouseVolumeFixture(),caseRecord:reviewedCaseFixture(),datasetVersion});
    assert.equal(result.rawPlan.provider.name,'stage7-coarse-semantic-voxel-schematic-extractor-v1');
    assert.equal(Object.hasOwn(result.record.artifacts,'review_plan_sha256'),false);
    assert.equal(Object.hasOwn(result.record.extraction,'automated_semantic_status'),false);
    assert.equal(Object.hasOwn(result.record.extraction,'correction_count'),datasetVersion==='v2');
  }
});
```

- [ ] **Step 2: Run case tests and verify RED**

Run:

```powershell
node --test test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDatasetV3.test.js
```

Expected: FAIL because the v3 rasterizer and extractor constant do not exist.

- [ ] **Step 3: Implement the v3 rasterizer orchestration**

```js
import { buildStage7GridTransformV3 } from './stage7GridTransformV3.js';
import { collectStage7SemanticEvidenceV3 } from './stage7SemanticEvidenceV3.js';
import { buildStage7SemanticTopologyV3 } from './stage7SemanticTopologyV3.js';

export function rasterizeSchematicToStage7V3({volume,caseRecord}={}) {
  const originalBounds=sourceBounds(volume);
  const reviewedFront=caseRecord.review?.canonical_front_side;
  const frontSide=['north','south','east','west'].includes(reviewedFront)?reviewedFront:'south';
  const warnings=reviewedFront?[]:['canonical front side is unreviewed; south used for diagnostics'];
  const transform=buildStage7GridTransformV3({volume,occupiedBounds:originalBounds,frontSide});
  const evidence=collectStage7SemanticEvidenceV3({volume,transform,caseId:caseRecord.case_id});
  const semantic=buildStage7SemanticTopologyV3({evidence,transform,caseId:caseRecord.case_id});
  return {
    cells:semantic.cells,
    original_bounds:originalBounds,
    normalized_transform:transform,
    topology:semantic.topology,
    stats:{...semantic.stats,topology:semantic.topology},
    warnings:[...warnings,...semantic.warnings]
  };
}

function sourceBounds(volume) {
  const bounds={min_x:Infinity,min_y:Infinity,min_z:Infinity,max_x:-1,max_y:-1,max_z:-1};
  for(let y=0;y<volume.height;y+=1)for(let z=0;z<volume.length;z+=1)for(let x=0;x<volume.width;x+=1){if(volume.blockAt(x,y,z).air)continue;bounds.min_x=Math.min(bounds.min_x,x);bounds.max_x=Math.max(bounds.max_x,x);bounds.min_y=Math.min(bounds.min_y,y);bounds.max_y=Math.max(bounds.max_y,y);bounds.min_z=Math.min(bounds.min_z,z);bounds.max_z=Math.max(bounds.max_z,z);}
  if(bounds.max_x<0)throw new Error('Stage 7 dataset extraction requires at least one non-air block');
  return bounds;
}
```

- [ ] **Step 4: Refactor `buildStage7DatasetCase` by version without changing v1/v2**

Add imports and constants:

```js
import { rasterizeSchematicToStage7V3 } from './coarseSemanticVoxelDatasetRasterizerV3.js';
import { evaluateStage7V3ReviewScope } from './stage7DatasetReviewScopeV3.js';
import { validateStage7SemanticTopologyV3, enforceStage7V3RepairPolicy } from './stage7SemanticValidatorV3.js';
import { decodeStage7Runs } from './coarseSemanticVoxelSchema.js';

export const STAGE7_DATASET_EXTRACTOR_V3='stage7-coarse-semantic-voxel-schematic-extractor-v3';
```

Replace the single raster/correction/plan sequence with this versioned sequence:

```js
const isV3=datasetVersion==='v3';
const extractor=isV3?STAGE7_DATASET_EXTRACTOR_V3:STAGE7_DATASET_EXTRACTOR;
const raster=isV3?rasterizeSchematicToStage7V3({volume,caseRecord}):rasterizeSchematicToStage7({volume,caseRecord});
const condition=buildDatasetCondition({caseRecord,raster,volume});
const conditionValidation=validateStage7Condition(condition);
if(!conditionValidation.ok)throw new Error(`invalid extracted Stage 7 condition: ${conditionValidation.errors.join('; ')}`);
const provider={kind:'dataset-extraction',name:extractor,model_version:null,dataset_version:datasetVersion};
const evidence=[{id:`source:${caseRecord.case_id}`,kind:'raw-schematic',source_id:volume.source_sha256,detail:caseRecord.file||caseRecord.source?.file||''}];
const reviewPlan=createStage7Plan({condition,provider,cells:raster.cells,evidence});
const reviewPlanSha256=hashCanonicalValue(reviewPlan);
const reviewScope=isV3?evaluateStage7V3ReviewScope({reviewRecord,sourceSha256:volume.source_sha256,extractorVersion:extractor,reviewPlanSha256}):{applies:true,semanticAccepted:true,blockers:[]};
const corrections=reviewScope.applies?(reviewRecord?.semantic_corrections||[]):[];
const correctionEvidenceId=corrections.length?`review:${reviewRecord.record_id}`:null;
const corrected=applyStage7DatasetCorrections({cells:raster.cells,corrections,evidenceId:correctionEvidenceId});
const rawPlan=createStage7Plan({
  condition,provider,cells:corrected.cells,
  evidence:[...evidence,...(corrections.length?[{id:correctionEvidenceId,kind:'human-semantic-correction',source_id:reviewRecord.record_id,detail:`${corrections.length} reviewed sparse correction(s)`}]:[])]
});
const schema=validateStage7Plan(rawPlan,{condition});
if(!schema.ok)throw new Error(`invalid extracted Stage 7 plan: ${schema.errors.join('; ')}`);
const repair=repairCoarseSemanticVoxelPlan({plan:rawPlan,condition});
const topologyValidation=isV3?validateStage7SemanticTopologyV3({cells:corrected.cells,topology:raster.topology,requiredFloors:condition.dimensions.floors}):null;
const repairPolicy=isV3?enforceStage7V3RepairPolicy({beforeCells:corrected.cells,repairResult:{...repair,decodedCells:repair.plan?decodeStage7Runs(repair.plan.runs):[]}}):null;
const automatedAccepted=isV3?topologyValidation.accepted&&repairPolicy.accepted:repair.accepted;
const semanticAccepted=automatedAccepted&&reviewScope.semanticAccepted;
```

In `buildDatasetCondition`, use topology-derived floor bands for v3 and retain the exact existing height heuristic for v1/v2:

```js
const derivedFloors=Array.isArray(raster.topology?.floor_levels)&&raster.topology.floor_levels.length?raster.topology.floor_levels.length:null;
const floors=derivedFloors||Math.max(1,Math.min(5,Math.round(occupied[1]/4)));
// dimensions.floors uses `floors`; every other existing condition field remains unchanged.
```

For v3 record fields use:

```js
artifacts:{
  condition_sha256:hashCanonicalValue(condition),
  ...(isV3?{review_plan_sha256:reviewPlanSha256}:{}),
  plan_sha256:hashCanonicalValue(rawPlan),
  repaired_plan_sha256:automatedAccepted?hashCanonicalValue(repair.plan):null,
  local_condition_path:paths.condition,local_plan_path:paths.rawPlan,
  local_repaired_plan_path:automatedAccepted?paths.repairedPlan:null
},
extraction:{
  schema_valid:schema.ok,
  ...(isV3?{extractor_version:extractor,automated_semantic_status:automatedAccepted?'accepted':'rejected'}:{}),
  semantic_status:isV3?(semanticAccepted?'accepted':!automatedAccepted||reviewScope.applies?'rejected':'pending-review'):(repair.accepted?'accepted':'rejected'),
  run_count:rawPlan.runs.length,
  ...((datasetVersion==='v2'||isV3)?{
    correction_count:corrected.applied.length,
    correction_sha256:corrected.applied.length?hashCanonicalValue(corrected.applied):null
  }:{}),
  repair_count:repair.repairs?.length||0,
  ...(isV3?{repair_classes:[...new Set((repair.repairs||[]).map((item)=>item.reason))].sort(),repair_audit:repairPolicy.repair_audit,topology:raster.topology}:{}),
  blockers:[...new Set([...(repair.blockers||[]).map((item)=>item.id||String(item)),...(topologyValidation?.blockers||[]).map((item)=>item.id),...(repairPolicy?.blockers||[]).map((item)=>item.id)])].sort(),
  warnings:[...new Set([...(raster.warnings||[]),...(repair.warnings||[])])].sort(),stats:raster.stats
}
```

For v3 training eligibility, require `governance.eligible && semanticAccepted`; append every `reviewScope.blockers` value and `semantic-validation-rejected` when automated semantics fail. Thus an unbound automated-valid plan is `pending-review`, while an exactly bound record that blocks any of the three layers is explicitly `rejected`. Preserve the exact existing v1/v2 eligibility expression and record keys in the non-v3 branch.

- [ ] **Step 5: Generate and inspect the controlled-fixture golden once**

Run:

```powershell
$env:UPDATE_STAGE7_V3_GOLDEN='1'
node --test test/coarseSemanticVoxelDatasetV3.test.js
Remove-Item Env:UPDATE_STAGE7_V3_GOLDEN
Get-Content test/fixtures/stage7DatasetV3Golden.json
git status --short test/fixtures/stage7DatasetV3Golden.json
```

Expected: the generated JSON contains no timestamps or local absolute paths; its transform is `stage7-interval-partition-v1`, its extractor is v3, and it pins layer counts, topology, blocker IDs, and a lowercase 64-character review-plan SHA-256. Inspect those semantics before accepting the file; never update the golden merely to silence a regression.

- [ ] **Step 6: Run case, overlay, golden, and v3 semantic tests**

Run:

```powershell
node --test test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDatasetV3.test.js test/stage7DatasetReviewOverlay.test.js test/stage7DatasetReviewScopeV3.test.js test/stage7SemanticValidatorV3.test.js
```

Expected: all focused tests pass, the golden comparison is green without the update variable, and the v1/v2 shape regression is green.

- [ ] **Step 7: Commit v3 case construction**

```powershell
git add src/construction/learning/coarseSemanticVoxelDatasetRasterizerV3.js src/construction/learning/coarseSemanticVoxelDatasetCase.js test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDatasetV3.test.js test/fixtures/stage7DatasetV3Golden.json
git commit -m "feat(stage7): build dataset v3 cases"
```

---

### Task 7: Add Dataset v3 Indexing, Atomic Publication, Readiness, and CLI Support

**Files:**
- Modify: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Modify: `src/buildCoarseSemanticVoxelDataset.js`
- Modify: `test/coarseSemanticVoxelDataset.test.js`
- Modify: `test/stage7DatasetCli.test.js`
- Create: `test/stage7DatasetV3Cli.test.js`

**Interfaces:**
- Consumes: v3 case records from Task 6, existing fixed split algorithm, review overlay path, and CLI `--dataset-version v3`.
- Produces: atomic `v3/manifest.json`, `cases.jsonl`, `splits.json`, `reports/summary.md`, and `reports/readiness.md`; `writeStage7DatasetArtifacts(...)` retains its existing public signature.

- [ ] **Step 1: Record immutable v1/v2 hashes before changing the writer**

Run:

```powershell
$v1=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v1 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
$v2=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v2 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
$v1 | Set-Content .tmp/stage7-v3-v1-before.sha256
$v2 | Set-Content .tmp/stage7-v3-v2-before.sha256
```

Expected: two ignored hash inventories exist under `.tmp/`; `git status --short` remains unchanged.

- [ ] **Step 2: Write failing v3 index and CLI tests**

Append to `test/coarseSemanticVoxelDataset.test.js`:

```js
test('Dataset v3 manifest keeps v2 as parent and requires plan-bound semantic acceptance', () => {
  const record=datasetRecordFixture();
  record.dataset_version='v3';
  record.training.eligible=false;
  record.training.blockers=['v3-semantic-review-unbound'];
  record.artifacts.review_plan_sha256='e'.repeat(64);
  record.extraction={...record.extraction,extractor_version:'stage7-coarse-semantic-voxel-schematic-extractor-v3',automated_semantic_status:'accepted',semantic_status:'pending-review',repair_classes:[],repair_audit:[],topology:{}};
  const result=buildStage7DatasetIndex({records:[record],datasetVersion:'v3',generatedAt:'2026-07-12T00:00:00.000Z'});
  assert.equal(result.manifest.parent_dataset_version,'v2');
  assert.equal(result.manifest.extractor,'stage7-coarse-semantic-voxel-schematic-extractor-v3');
  assert.equal(result.manifest.training_eligible_count,0);
  assert.equal(result.manifest.semantic_accepted_count,0);
  assert.equal(result.splits.assignments[record.case_id],assignStage7DatasetSplit({caseId:record.case_id,origin:'real'}));
});
```

Create `test/stage7DatasetV3Cli.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseStage7DatasetArgs } from '../src/buildCoarseSemanticVoxelDataset.js';
import { writeStage7DatasetArtifacts } from '../src/construction/learning/coarseSemanticVoxelDataset.js';

test('Stage 7 dataset CLI accepts v3', () => {
  assert.equal(parseStage7DatasetArgs(['--dataset-version','v3']).datasetVersion,'v3');
});

test('failed v3 source validation leaves an existing canonical target untouched', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'stage7-v3-atomic-'));
  const target=path.join(root,'out');
  await fs.mkdir(target,{recursive:true});
  await fs.writeFile(path.join(target,'sentinel.txt'),'unchanged','utf8');
  const knowledgeBase=path.join(root,'kb.json');
  await fs.writeFile(knowledgeBase,JSON.stringify({cases:[{case_id:'bad',file:'../escape.schematic'}]}),'utf8');
  await assert.rejects(writeStage7DatasetArtifacts({templateRoot:root,knowledgeBasePath:knowledgeBase,outputDir:target,datasetVersion:'v3'}),/escapes template root/);
  assert.equal(await fs.readFile(path.join(target,'sentinel.txt'),'utf8'),'unchanged');
  assert.deepEqual((await fs.readdir(target)).sort(),['sentinel.txt']);
});
```

Append to `test/stage7DatasetCli.test.js`:

```js
// Extend the existing production-module import to include `helpTextForTest`:
// import { helpTextForTest, parseStage7DatasetArgs } from '../src/buildCoarseSemanticVoxelDataset.js';
test('dataset help advertises v1, v2, and v3 without changing the default', () => {
  assert.equal(parseStage7DatasetArgs([]).datasetVersion,'v1');
  assert.match(helpTextForTest(),/--dataset-version v1\|v2\|v3/);
});
```

Export `helpTextForTest` from `src/buildCoarseSemanticVoxelDataset.js` as a test-only alias of the same production help string; do not duplicate the text.

- [ ] **Step 3: Run index and CLI tests and verify RED**

Run:

```powershell
node --test test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js test/stage7DatasetV3Cli.test.js
```

Expected: FAIL with `--dataset-version must be v1 or v2` and unsupported v3 dataset source errors.

- [ ] **Step 4: Add v3 dataset configuration and manifest dispatch**

In `coarseSemanticVoxelDataset.js`, import `STAGE7_DATASET_EXTRACTOR_V3` and update configuration:

```js
function datasetConfig(version) {
  if (version==='v1') return {source:STAGE7_DATASET_SOURCE,schemaVersion:STAGE7_DATASET_SCHEMA_VERSION,extractor:STAGE7_DATASET_EXTRACTOR,parent:null,readiness:false};
  if (version==='v2') return {source:'stage7-coarse-semantic-voxel-dataset-v2',schemaVersion:2,extractor:STAGE7_DATASET_EXTRACTOR,parent:'v1',readiness:true};
  if (version==='v3') return {source:'stage7-coarse-semantic-voxel-dataset-v3',schemaVersion:3,extractor:STAGE7_DATASET_EXTRACTOR_V3,parent:'v2',readiness:true};
  throw new Error(`unsupported Stage 7 dataset version: ${version}`);
}
```

Build manifest version fields from config rather than `datasetVersion==='v2'` checks:

```js
const manifest={
  source:config.source,schema_version:config.schemaVersion,dataset_version:datasetVersion,
  ...(config.parent?{parent_dataset_version:config.parent}:{}),
  generated_at:generatedAt,extractor:config.extractor,split_algorithm:STAGE7_DATASET_SPLIT_ALGORITHM,
  case_count:sorted.length,training_eligible_count:trainingCaseIds.length,training_case_ids:trainingCaseIds,
  origin_counts:countBy(sorted,'origin'),split_counts:countBy(sorted,'split'),
  artifacts:{cases:'cases.jsonl',splits:'splits.json',reports:'reports/',...(config.readiness?{readiness:'reports/readiness.md'}:{})}
};
if (config.readiness) {
  result.readiness=buildStage7DatasetReadiness(result);
  manifest.reviewed_count=result.readiness.reviewed_count;
  manifest.semantic_accepted_count=result.readiness.semantic_accepted_count;
  manifest.ready_for_m3_real_data=result.readiness.ready_for_m3_real_data;
}
```

In `validateStage7Dataset`, require these v3-only fields:

```js
if (manifest.dataset_version==='v3') {
  if (!/^[a-f0-9]{64}$/.test(record?.artifacts?.review_plan_sha256||'')) errors.push(`missing v3 review plan hash: ${id}`);
  if (record?.extraction?.extractor_version!=='stage7-coarse-semantic-voxel-schematic-extractor-v3') errors.push(`missing v3 extractor version: ${id}`);
  if (!['accepted','rejected','pending-review'].includes(record?.extraction?.semantic_status)) errors.push(`invalid v3 semantic status: ${id}`);
  if (!['accepted','rejected'].includes(record?.extraction?.automated_semantic_status)) errors.push(`invalid v3 automated semantic status: ${id}`);
  if (!Array.isArray(record?.extraction?.repair_classes)||!Array.isArray(record?.extraction?.repair_audit)) errors.push(`missing v3 repair diagnostics: ${id}`);
  if (!record?.extraction?.topology||typeof record.extraction.topology!=='object') errors.push(`missing v3 topology diagnostics: ${id}`);
  if (record?.training?.eligible&&record.extraction.semantic_status!=='accepted') errors.push(`v3 eligible case lacks plan-bound semantic acceptance: ${id}`);
}
```

- [ ] **Step 5: Add CLI `v3` parsing and one shared help string**

```js
if (flag==='--dataset-version') {
  const value=requireValue(argv,++index,flag);
  if (!['v1','v2','v3'].includes(value)) throw new Error('--dataset-version must be v1, v2, or v3');
  options.datasetVersion=value;
  continue;
}

function helpText() { return `Usage: npm run dataset:stage7 -- [options]\n\n  --root <path>\n  --knowledge-base <path>\n  --out <path>\n  --local-artifacts <path>\n  --dataset-version v1|v2|v3\n  --review-overlay <path>\n  --case <case-id>\n  --require-reviewed <integer>\n  --require-semantic-accepted <integer>\n  --require-eligible <integer>\n  --help`; }
export const helpTextForTest=helpText;
```

- [ ] **Step 6: Run dataset, case, review, and CLI tests**

Run:

```powershell
node --test test/coarseSemanticVoxelDataset.test.js test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDatasetV3.test.js test/stage7DatasetReviewOverlay.test.js test/stage7DatasetReviewScopeV3.test.js test/stage7DatasetCli.test.js test/stage7DatasetV3Cli.test.js
```

Expected: all focused tests pass.

- [ ] **Step 7: Verify v1/v2 byte immutability before committing**

Run:

```powershell
$v1After=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v1 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
$v2After=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v2 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
if (Compare-Object (Get-Content .tmp/stage7-v3-v1-before.sha256) $v1After) { throw 'Dataset v1 changed' }
if (Compare-Object (Get-Content .tmp/stage7-v3-v2-before.sha256) $v2After) { throw 'Dataset v2 changed' }
```

Expected: no output and exit code 0.

- [ ] **Step 8: Commit v3 writer and CLI support**

```powershell
git add src/construction/learning/coarseSemanticVoxelDataset.js src/buildCoarseSemanticVoxelDataset.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js test/stage7DatasetV3Cli.test.js
git commit -m "feat(stage7): write dataset v3 atomically"
```

---

### Task 8: Generate the Deterministic Six-Pilot v2/v3 Comparison

**Files:**
- Create: `src/construction/learning/stage7DatasetV3Comparison.js`
- Create: `src/compareStage7DatasetVersions.js`
- Create: `test/stage7DatasetV3Comparison.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: v2 and v3 `cases.jsonl`, v2/v3 local `plan.raw.json` roots, and the frozen six pilot IDs.
- Produces: `compareStage7PilotDatasets(...) -> comparison`, `renderStage7DatasetV3Comparison(comparison) -> markdown`, and CLI output at an explicit `--out` path.

- [ ] **Step 1: Write failing component and rendering tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage7Plan, hashCanonicalValue } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import { analyzeStage7PlanTopology, compareStage7PilotDatasets, renderStage7DatasetV3Comparison } from '../src/construction/learning/stage7DatasetV3Comparison.js';

function plan(cells) {
  const payload={source:'stage7-coarse-semantic-voxel-condition-v1',schema_version:1,prompt:'comparison',seed:1,dimensions:{width:8,depth:8,floors:1,floor_height:4,total_height:6,lot_width:8,lot_depth:8},design:{front_side:'south'},references:[],constraints:{resolution:[64,64,64],max_total_height:40,minecraft_fill_limit:32768}};
  const condition={...payload,condition_hash:hashCanonicalValue(payload)};
  return createStage7Plan({condition,provider:{kind:'dataset-extraction',name:'fixture'},cells,evidence:[]});
}

test('comparison diagnostics count disconnected vertical cells and roof overlap', () => {
  const cells=[
    {x:1,y:1,z:1,envelope:'roof',space:'vertical_circulation',site:'none',confidence:1,evidence_ids:[]},
    {x:3,y:1,z:1,envelope:'roof',space:'vertical_circulation',site:'none',confidence:1,evidence_ids:[]}
  ];
  const result=analyzeStage7PlanTopology(plan(cells));
  assert.equal(result.space.vertical_circulation.component_count,2);
  assert.equal(result.space.vertical_circulation.isolated_component_count,2);
  assert.equal(result.space.vertical_circulation.largest_component,1);
  assert.equal(result.roof_vertical_overlap,2);
  assert.equal(result.entrance_count,0);
  assert.equal(result.floor_level_count,0);
});

test('pilot comparison renders fixed metrics without positive review claims', () => {
  const comparison=compareStage7PilotDatasets({
    pilotCaseIds:['house-fixture'],
    v2Records:[{case_id:'house-fixture',extraction:{repair_count:10,blockers:['missing-circulation']},artifacts:{plan_sha256:'a'.repeat(64)}}],
    v3Records:[{case_id:'house-fixture',extraction:{repair_count:1,repair_classes:['one-cell-envelope-gap'],blockers:[],semantic_status:'pending-review'},artifacts:{plan_sha256:'b'.repeat(64)}}],
    v2Plans:new Map([['house-fixture',plan([])]]),v3Plans:new Map([['house-fixture',plan([])]])
  });
  const markdown=renderStage7DatasetV3Comparison(comparison);
  assert.match(markdown,/house-fixture/);
  assert.match(markdown,/pending-review/);
  assert.match(markdown,/one-cell-envelope-gap/);
  assert.match(markdown,/not-recorded-by-v2/);
  assert.match(markdown,/Diagnostic only/);
  assert.doesNotMatch(markdown,/training approved/i);
});
```

- [ ] **Step 2: Run comparison tests and verify RED**

Run: `node --test test/stage7DatasetV3Comparison.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7DatasetV3Comparison.js`.

- [ ] **Step 3: Implement deterministic topology metrics and comparison records**

```js
import { decodeStage7Runs } from './coarseSemanticVoxelSchema.js';

const NEIGHBOURS=Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);

export function analyzeStage7PlanTopology(plan) {
  const cells=decodeStage7Runs(plan?.runs||[]);
  const result={envelope:{},space:{},site:{},roof_vertical_overlap:0,entrance_count:0,circulation_count:0,vertical_core_count:0,floor_level_count:0,roof_coverage_ratio:0};
  for (const [layer,ignored] of [['envelope','none'],['space','outside'],['site','none']]) {
    const values=[...new Set(cells.map((cell)=>cell[layer]).filter((value)=>value!==ignored))].sort();
    for (const value of values) {
      const selected=cells.filter((cell)=>cell[layer]===value);
      const sizes=componentSizes(selected);
      result[layer][value]={cell_count:selected.length,component_count:sizes.length,isolated_component_count:sizes.filter((size)=>size===1).length,largest_component:sizes[0]||0};
    }
  }
  result.roof_vertical_overlap=cells.filter((cell)=>cell.envelope==='roof'&&cell.space==='vertical_circulation').length;
  result.entrance_count=cells.filter((cell)=>cell.envelope==='opening'&&cell.space==='circulation').length;
  result.circulation_count=cells.filter((cell)=>cell.space==='circulation').length;
  result.vertical_core_count=cells.filter((cell)=>cell.space==='vertical_circulation').length;
  result.floor_level_count=new Set(cells.filter((cell)=>cell.envelope==='floor').map((cell)=>cell.y)).size;
  result.roof_coverage_ratio=roofCoverageRatio(cells);
  return result;
}

export function compareStage7PilotDatasets({pilotCaseIds,v2Records,v3Records,v2Plans,v3Plans}={}) {
  const v2=new Map(v2Records.map((record)=>[record.case_id,record]));
  const v3=new Map(v3Records.map((record)=>[record.case_id,record]));
  return {
    source:'stage7-dataset-v2-v3-pilot-comparison-v1',schema_version:1,
    cases:[...pilotCaseIds].sort().map((caseId)=>({
      case_id:caseId,
      v2:summary(v2.get(caseId),analyzeStage7PlanTopology(v2Plans.get(caseId))),
      v3:summary(v3.get(caseId),analyzeStage7PlanTopology(v3Plans.get(caseId)))
    }))
  };
}

function componentSizes(cells) {
  const byKey=new Map(cells.map((cell)=>[keyOf(cell),cell])),remaining=new Set(byKey.keys()),sizes=[];
  for (const start of [...remaining].sort()) {if(!remaining.has(start))continue;const queue=[start];remaining.delete(start);for(let head=0;head<queue.length;head+=1){const cell=byKey.get(queue[head]);for(const[dx,dy,dz]of NEIGHBOURS){const next=`${cell.x+dx},${cell.y+dy},${cell.z+dz}`;if(remaining.delete(next))queue.push(next);}}sizes.push(queue.length);}
  return sizes.sort((a,b)=>b-a);
}

function roofCoverageRatio(cells) {
  const massing=new Map(),roof=new Set();
  for (const cell of cells) {
    const key=`${cell.x},${cell.z}`;
    if (['wall','floor','support'].includes(cell.envelope)) massing.set(key,Math.max(massing.get(key)??-1,cell.y));
    if (cell.envelope==='roof') roof.add(key);
  }
  if (!massing.size) return 0;
  return Number(([...massing.keys()].filter((key)=>roof.has(key)).length/massing.size).toFixed(4));
}

function summary(record,topology){return {
  plan_sha256:record?.artifacts?.plan_sha256||'',
  semantic_status:record?.extraction?.semantic_status||'missing',
  repair_count:record?.extraction?.repair_count||0,
  repair_classes:record?.extraction?.repair_classes||['not-recorded-by-v2'],
  blockers:[...(record?.extraction?.blockers||[])],topology
};}
function keyOf(cell){return `${cell.x},${cell.y},${cell.z}`;}
```

Implement `renderStage7DatasetV3Comparison` as a stable Markdown table with one row per case containing v2/v3 plan hash, semantic status, total and isolated component counts, largest vertical component, entrance/circulation/vertical counts, floor-level count, roof coverage ratio, roof/vertical overlap, repair count/classes, and blockers. Use `not-recorded-by-v2` rather than inventing historical repair classes. End with this exact notice:

```text
Diagnostic only: metric improvement does not transfer license permission, approve a learning area, or create a positive semantic review.
```

- [ ] **Step 4: Implement the comparison CLI and package script**

`src/compareStage7DatasetVersions.js` must parse these required flags:

```text
--v2-index <path>
--v3-index <path>
--v2-local <path>
--v3-local <path>
--out <path>
```

Use one production help string and fail closed on incomplete input:

```js
const HELP_TEXT=`Usage: npm run compare:stage7-datasets -- [options]\n\n  --v2-index <path>\n  --v3-index <path>\n  --v2-local <path>\n  --v3-local <path>\n  --out <path>\n  --help\n\nThe comparison always uses the fixed six Stage 7 pilot cases.`;
const REQUIRED_FLAGS=Object.freeze(['v2Index','v3Index','v2Local','v3Local','out']);

export function parseStage7ComparisonArgs(argv) {
  const names=new Map([['--v2-index','v2Index'],['--v3-index','v3Index'],['--v2-local','v2Local'],['--v3-local','v3Local'],['--out','out']]);
  const options={help:false};
  for (let index=0;index<argv.length;index+=1) {
    const flag=argv[index];
    if (flag==='--help') { options.help=true; continue; }
    const name=names.get(flag);
    if (!name) throw new Error(`unknown option: ${flag}`);
    const value=argv[++index];
    if (!value||value.startsWith('--')) throw new Error(`${flag} requires a value`);
    options[name]=value;
  }
  if (!options.help) for (const name of REQUIRED_FLAGS) if (!options[name]) throw new Error(`missing required option: ${name}`);
  return options;
}
```

The CLI prints `HELP_TEXT` and exits 0 for `--help`. Otherwise it reads each JSONL index, reads `cases/<case_id>/plan.raw.json` for every ID in `STAGE7_PILOT_CASE_IDS`, errors if any record or plan is missing, calls the comparison functions, creates the output parent directory, and writes UTF-8 Markdown with exactly one final newline. Add:

```json
"compare:stage7-datasets": "node src/compareStage7DatasetVersions.js"
```

to `package.json` scripts.

- [ ] **Step 5: Run comparison tests and CLI help**

Run:

```powershell
node --test test/stage7DatasetV3Comparison.test.js
npm run compare:stage7-datasets -- --help
```

Expected: comparison tests pass; help lists all five paths and says the six-case set is fixed.

- [ ] **Step 6: Commit comparison tooling**

```powershell
git add src/construction/learning/stage7DatasetV3Comparison.js src/compareStage7DatasetVersions.js test/stage7DatasetV3Comparison.test.js package.json
git commit -m "feat(stage7): compare dataset v2 and v3 pilots"
```

---

### Task 9: Build, Reproduce, Compare, Document, and Verify Dataset v3

**Files:**
- Create: `mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v3/cases.jsonl`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v3/splits.json`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v3/reports/summary.md`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v3/reports/readiness.md`
- Create: `docs/benchmarks/stage7-dataset-v3.md`
- Create: `docs/benchmarks/stage7-dataset-v2-v3-pilot-comparison.md`

**Interfaces:**
- Consumes: the complete v3 implementation, frozen review overlay, fixed epoch, and six source schematics.
- Produces: canonical and independently reproduced Dataset v3 artifacts, immutable v1/v2 hash evidence, diagnostic comparison, benchmark record, and a clean reviewed commit.

- [ ] **Step 1: Run every focused v3 test**

Run:

```powershell
node --test test/stage7GridTransformV3.test.js test/stage7SemanticEvidenceV3.test.js test/stage7SemanticTopologyV3.test.js test/stage7SemanticValidatorV3.test.js test/stage7DatasetReviewScopeV3.test.js test/coarseSemanticVoxelDatasetV3.test.js test/stage7DatasetV3Cli.test.js test/stage7DatasetV3Comparison.test.js test/stage7DatasetReviewOverlay.test.js test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js
```

Expected: all focused tests pass with 0 failed, 0 cancelled, and 0 skipped.

- [ ] **Step 2: Run the complete Node.js suite**

Run: `npm test`

Expected: every test passes; pass count is greater than the 388-test baseline; 0 failed.

- [ ] **Step 3: Build canonical Dataset v3 with the frozen overlay**

Run:

```powershell
$v1BeforeCanonical=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v1 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
$v2BeforeCanonical=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v2 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
if (Compare-Object (Get-Content .tmp/stage7-v3-v1-before.sha256) $v1BeforeCanonical) { throw 'Dataset v1 changed before canonical v3 build' }
if (Compare-Object (Get-Content .tmp/stage7-v3-v2-before.sha256) $v2BeforeCanonical) { throw 'Dataset v2 changed before canonical v3 build' }
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-eligible 0
$v1AfterCanonical=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v1 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
$v2AfterCanonical=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v2 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
if (Compare-Object $v1BeforeCanonical $v1AfterCanonical) { throw 'Dataset v1 changed during canonical v3 build' }
if (Compare-Object $v2BeforeCanonical $v2AfterCanonical) { throw 'Dataset v2 changed during canonical v3 build' }
```

Expected:

```text
Cases: 64
Training eligible: 0
Splits: train=56, validation=3, test=5
```

The six pilots retain their reviewed governance and orientation. No case is reported semantic-accepted without a v3 plan-bound record.

- [ ] **Step 4: Build an independent Dataset v3 tree**

Run:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-eligible 0 --out .tmp/stage7-v3-reproduction/index --local-artifacts .tmp/stage7-v3-reproduction/local
```

Expected: 64 cases, 0 eligible, and fixed 56/3/5 splits.

- [ ] **Step 5: Compare every canonical and independent v3 file recursively**

Run:

```powershell
$canonical=(Resolve-Path 'mc_templates/datasets/coarse_semantic_voxels/v3').Path
$check=(Resolve-Path '.tmp/stage7-v3-reproduction/index').Path
$canonicalFiles=Get-ChildItem -Recurse -File $canonical|ForEach-Object{$_.FullName.Substring($canonical.Length+1)}|Sort-Object
$checkFiles=Get-ChildItem -Recurse -File $check|ForEach-Object{$_.FullName.Substring($check.Length+1)}|Sort-Object
if(Compare-Object $canonicalFiles $checkFiles){throw 'Dataset v3 reproduction file list mismatch'}
$rows=foreach($file in Get-ChildItem -Recurse -File $canonical|Sort-Object FullName){
  $relative=$file.FullName.Substring($canonical.Length+1)
  $other=Join-Path $check $relative
  [pscustomobject]@{File=$relative;Canonical=(Get-FileHash -Algorithm SHA256 $file.FullName).Hash;Independent=if(Test-Path $other){(Get-FileHash -Algorithm SHA256 $other).Hash}else{'MISSING'}}
}
$rows|Format-Table -AutoSize
if(($rows|Where-Object{$_.Canonical -ne $_.Independent}).Count){throw 'Dataset v3 reproduction mismatch'}
```

Expected: all five versioned files have identical SHA-256 values.

- [ ] **Step 6: Rebuild local v2 diagnostics without changing canonical v2**

Run:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v2 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-eligible 0 --out .tmp/stage7-v3-comparison/v2-index --local-artifacts .tmp/stage7-v3-comparison/v2-local
```

Expected: 64 cases, 0 eligible, and no tracked v2 changes.

- [ ] **Step 7: Generate the six-pilot comparison report**

Run:

```powershell
npm run compare:stage7-datasets -- --v2-index .tmp/stage7-v3-comparison/v2-index/cases.jsonl --v3-index mc_templates/datasets/coarse_semantic_voxels/v3/cases.jsonl --v2-local .tmp/stage7-v3-comparison/v2-local --v3-local .tmp/stage7-dataset/v3 --out docs/benchmarks/stage7-dataset-v2-v3-pilot-comparison.md
```

Expected: six rows, v2/v3 hashes and topology metrics, and the exact diagnostic-only notice. The report must not call any case training-approved or semantic-accepted unless an exact v3 plan-bound review exists.

- [ ] **Step 8: Run the strict v3 readiness gate and verify fail-closed behavior**

Run:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-reviewed 6 --require-semantic-accepted 3 --require-eligible 3 --out .tmp/stage7-v3-strict/index --local-artifacts .tmp/stage7-v3-strict/local
$gate=$LASTEXITCODE
if($gate -eq 0){throw 'Dataset v3 readiness gate unexpectedly passed'}
Write-Output "STRICT_V3_GATE_EXIT=$gate"
```

Expected: non-zero, with explicit counts showing fewer than 3 semantic-accepted and fewer than 3 eligible cases.

- [ ] **Step 9: Write the v3 benchmark evidence document**

Create `docs/benchmarks/stage7-dataset-v3.md` with:

- scope and extractor/transform versions;
- fixed epoch and exact reproduction commands;
- 64-case and 56/3/5 split counts;
- SHA-256 for all five versioned artifacts;
- v1/v2 immutability check results;
- fixture test and full-suite counts;
- six-pilot comparison path;
- strict gate exit and current blocker counts;
- an explicit statement that no real training was run and no positive review was generated by automation.

- [ ] **Step 10: Verify v1/v2 hashes, reports, diff, and workspace**

Run:

```powershell
$v1After=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v1 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
$v2After=Get-ChildItem -Recurse -File mc_templates/datasets/coarse_semantic_voxels/v2 | Sort-Object FullName | ForEach-Object { "{0} {1}" -f $_.FullName.Substring((Resolve-Path '.').Path.Length+1),(Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
if (Compare-Object (Get-Content .tmp/stage7-v3-v1-before.sha256) $v1After) { throw 'Dataset v1 changed' }
if (Compare-Object (Get-Content .tmp/stage7-v3-v2-before.sha256) $v2After) { throw 'Dataset v2 changed' }
git diff --check
git status --short
```

Expected: immutable hashes match; only v3 implementation, v3 artifacts, package script, comparison, and benchmark documentation are changed; no `.tmp`, checkpoint, Python environment, or training output is tracked.

- [ ] **Step 11: Run fresh full verification immediately before the final commit**

Run:

```powershell
npm test
git diff --check
```

Expected: all tests pass and diff check exits 0.

- [ ] **Step 12: Commit canonical Dataset v3 and evidence**

```powershell
git add src test package.json mc_templates/datasets/coarse_semantic_voxels/v3 docs/benchmarks/stage7-dataset-v3.md docs/benchmarks/stage7-dataset-v2-v3-pilot-comparison.md
git diff --cached --check
git status --short
git commit -m "feat(stage7): complete dataset v3 extraction foundation"
```

## Implementation Completion Report

When Subproject A is complete, report:

- commit hashes for Tasks 1 through 9;
- focused and full test counts;
- canonical and independent Dataset v3 SHA-256 values;
- proof that v1/v2 hashes did not change;
- six-pilot v2/v3 diagnostic changes without semantic or license overclaim;
- strict v3 readiness exit code and remaining blockers;
- confirmation that no Python/PyTorch environment, model, checkpoint, or real-data training was created;
- whether the accepted Dataset v3 interface is ready for a separate Subproject B implementation plan.
