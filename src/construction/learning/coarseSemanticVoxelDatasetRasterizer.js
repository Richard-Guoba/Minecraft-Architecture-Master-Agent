const RESOLUTION = Object.freeze([64, 64, 64]);
const DIRECTIONS = Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);
const HORIZONTAL = Object.freeze([[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]);
const ENVELOPE_PRIORITY = ['opening','roof','wall','floor','support','none'];
const SPACE_PRIORITY = ['vertical_circulation','circulation','public','private','service','void','outside'];
const SITE_PRIORITY = ['water','path','courtyard','vegetation','ground','none'];

export function rasterizeSchematicToStage7({ volume, caseRecord = {} } = {}) {
  validateVolume(volume);
  const originalBounds = sourceBounds(volume);
  const outsideAir = exteriorAirMask(volume);
  const size = [originalBounds.max_x-originalBounds.min_x+1, originalBounds.max_y-originalBounds.min_y+1, originalBounds.max_z-originalBounds.min_z+1];
  const frontSide = ['north','south','east','west'].includes(caseRecord.review?.canonical_front_side) ? caseRecord.review.canonical_front_side : 'south';
  const warnings = [];
  if (!caseRecord.review?.canonical_front_side) warnings.push('canonical front side is unreviewed; south used for diagnostics');
  const samples = [];

  for (let y=0;y<volume.height;y+=1) for (let z=0;z<volume.length;z+=1) for (let x=0;x<volume.width;x+=1) {
    const block = volume.blockAt(x,y,z);
    if (block.air) {
      if (!outsideAir[indexOf(volume,x,y,z)]) samples.push(classifyEnclosedAir({volume,x,y,z,originalBounds}));
      continue;
    }
    samples.push(classifySolid({volume,outsideAir,block,x,y,z}));
  }

  const cells = reduceSamples(samples, originalBounds, size, caseRecord.case_id || 'unknown-case');
  const stats = summarize(cells, samples.length);
  return {
    cells,
    original_bounds: originalBounds,
    normalized_transform: {
      resolution:[...RESOLUTION],
      source_size:[volume.width,volume.height,volume.length],
      occupied_size:size,
      ground_y:originalBounds.min_y,
      front_side:frontSide
    },
    stats,
    warnings
  };
}

function validateVolume(volume) {
  if (!volume || ![volume.width,volume.height,volume.length].every((value)=>Number.isInteger(value)&&value>0) || typeof volume.blockAt!=='function') throw new Error('invalid schematic block volume');
}

function sourceBounds(volume) {
  const bounds = {min_x:Infinity,min_y:Infinity,min_z:Infinity,max_x:-1,max_y:-1,max_z:-1};
  for (let y=0;y<volume.height;y+=1) for (let z=0;z<volume.length;z+=1) for (let x=0;x<volume.width;x+=1) {
    if (volume.blockAt(x,y,z).air) continue;
    bounds.min_x=Math.min(bounds.min_x,x); bounds.max_x=Math.max(bounds.max_x,x);
    bounds.min_y=Math.min(bounds.min_y,y); bounds.max_y=Math.max(bounds.max_y,y);
    bounds.min_z=Math.min(bounds.min_z,z); bounds.max_z=Math.max(bounds.max_z,z);
  }
  if (bounds.max_x<0) throw new Error('Stage 7 dataset extraction requires at least one non-air block');
  return bounds;
}

function exteriorAirMask(volume) {
  const count=volume.width*volume.height*volume.length;
  const outside=new Uint8Array(count);
  const queue=new Int32Array(count);
  let head=0,tail=0;
  const seed=(x,y,z)=>{
    const index=indexOf(volume,x,y,z);
    if (outside[index]||!volume.blockAt(x,y,z).air) return;
    outside[index]=1; queue[tail++]=index;
  };
  for (let y=0;y<volume.height;y+=1) for (let z=0;z<volume.length;z+=1) { seed(0,y,z); seed(volume.width-1,y,z); }
  for (let y=0;y<volume.height;y+=1) for (let x=0;x<volume.width;x+=1) { seed(x,y,0); seed(x,y,volume.length-1); }
  for (let z=0;z<volume.length;z+=1) for (let x=0;x<volume.width;x+=1) { seed(x,0,z); seed(x,volume.height-1,z); }
  while (head<tail) {
    const index=queue[head++];
    const x=index%volume.width;
    const yz=Math.floor(index/volume.width);
    const z=yz%volume.length;
    const y=Math.floor(yz/volume.length);
    for (const [dx,dy,dz] of DIRECTIONS) {
      const nx=x+dx,ny=y+dy,nz=z+dz;
      if (!inside(volume,nx,ny,nz)) continue;
      const next=indexOf(volume,nx,ny,nz);
      if (!outside[next]&&volume.blockAt(nx,ny,nz).air) { outside[next]=1; queue[tail++]=next; }
    }
  }
  return outside;
}

function classifySolid({volume,outsideAir,block,x,y,z}) {
  const name=String(block.name||block.state||'').replace(/^minecraft:/,'').replace(/\[.*$/,'');
  const site=siteLabel(block,name);
  if (site!=='none') return {x,y,z,envelope:'none',space:'outside',site,confidence:1};
  const exteriorAbove=isOutside(volume,outsideAir,x,y+1,z);
  const exteriorSide=HORIZONTAL.some(([dx,dy,dz])=>isOutside(volume,outsideAir,x+dx,y+dy,z+dz));
  const enclosedAbove=inside(volume,x,y+1,z)&&volume.blockAt(x,y+1,z).air&&!outsideAir[indexOf(volume,x,y+1,z)];
  let envelope='support';
  if (block.category==='opening'||/(door|trapdoor|glass|pane|gate)/.test(name)) envelope='opening';
  else if (block.category==='slab'||exteriorAbove) envelope='roof';
  else if (exteriorSide) envelope='wall';
  else if (enclosedAbove) envelope='floor';
  const space=/(stairs?|ladder|scaffolding|elevator)/.test(name)?'vertical_circulation':'outside';
  return {x,y,z,envelope,space,site:'none',confidence:envelope==='support'?0.8:0.9};
}

function classifyEnclosedAir({volume,x,y,z,originalBounds}) {
  const adjacentVertical=DIRECTIONS.some(([dx,dy,dz])=>{
    const block=volume.blockAt(x+dx,y+dy,z+dz);
    return /(stairs?|ladder|scaffolding|elevator)/.test(String(block.name||block.state||''));
  });
  const relative=(y-originalBounds.min_y)/Math.max(1,originalBounds.max_y-originalBounds.min_y);
  return {x,y,z,envelope:'none',space:adjacentVertical?'vertical_circulation':relative<=0.55?'public':'private',site:'none',confidence:adjacentVertical?0.9:0.7};
}

function siteLabel(block,name) {
  if (block.category==='water'||/(water|kelp|seagrass)/.test(name)) return 'water';
  if (/(path|road|pavement)/.test(name)) return 'path';
  if (block.category==='vegetation'||/(leaves|vine|flower|sapling|bush|cactus|bamboo|crop|fern)/.test(name)) return 'vegetation';
  if (block.category==='earth'||/(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|farmland)/.test(name)) return 'ground';
  return 'none';
}

function reduceSamples(samples,bounds,size,caseId) {
  const buckets=new Map();
  for (const sample of samples) {
    const x=gridCoordinate(sample.x,bounds.min_x,size[0]);
    const y=gridCoordinate(sample.y,bounds.min_y,size[1]);
    const z=gridCoordinate(sample.z,bounds.min_z,size[2]);
    const key=`${x},${y},${z}`;
    let bucket=buckets.get(key);
    if (!bucket) { bucket={x,y,z,envelope:new Map(),space:new Map(),site:new Map(),confidence:0,count:0}; buckets.set(key,bucket); }
    increment(bucket.envelope,sample.envelope); increment(bucket.space,sample.space); increment(bucket.site,sample.site);
    bucket.confidence+=sample.confidence; bucket.count+=1;
  }
  return [...buckets.values()].map((bucket)=>({
    x:bucket.x,y:bucket.y,z:bucket.z,
    envelope:chooseLabel(bucket.envelope,ENVELOPE_PRIORITY),
    space:chooseLabel(bucket.space,SPACE_PRIORITY),
    site:chooseLabel(bucket.site,SITE_PRIORITY),
    confidence:Math.max(0,Math.min(1,Number((bucket.confidence/bucket.count).toFixed(6)))),
    evidence_ids:[`source:${caseId}`]
  })).filter((cell)=>!(cell.envelope==='none'&&cell.space==='outside'&&cell.site==='none')).sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x);
}

function summarize(cells,sourceSampleCount) {
  const counts={envelope:{},space:{},site:{}};
  for (const cell of cells) for (const layer of ['envelope','space','site']) incrementObject(counts[layer],cell[layer]);
  return {source_sample_count:sourceSampleCount,logical_cell_count:cells.length,layer_counts:counts};
}

function gridCoordinate(value,min,size) { return size<=1?0:Math.max(0,Math.min(63,Math.floor(((value-min)*64)/size))); }
function chooseLabel(counts,priority) { return [...counts.entries()].sort((a,b)=>b[1]-a[1]||priority.indexOf(a[0])-priority.indexOf(b[0]))[0]?.[0]||priority.at(-1); }
function increment(map,key) { map.set(key,(map.get(key)||0)+1); }
function incrementObject(object,key) { object[key]=(object[key]||0)+1; }
function inside(volume,x,y,z) { return x>=0&&y>=0&&z>=0&&x<volume.width&&y<volume.height&&z<volume.length; }
function indexOf(volume,x,y,z) { return y*volume.length*volume.width+z*volume.width+x; }
function isOutside(volume,mask,x,y,z) { return !inside(volume,x,y,z)||Boolean(mask[indexOf(volume,x,y,z)]); }
