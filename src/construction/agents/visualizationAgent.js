export class VisualizationAgent {
  render({ prompt, blueprint, validation }) {
    const bounds = blueprint.bounds;
    const width = bounds.maxX - bounds.minX + 1;
    const depth = bounds.maxZ - bounds.minZ + 1;
    const floors = floorList(blueprint);
    const moduleLegend = topModules(blueprint);
    const qaChecks = validation.checks || [];

    return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MC Architect Preview</title>
<style>
:root {
  color-scheme: light;
  --ink: #202124;
  --muted: #62676d;
  --line: #d8dadd;
  --paper: #ffffff;
  --band: #f3f5f7;
  --ok: #26734d;
  --warn: #a15c00;
  --bad: #9b2c2c;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, "Microsoft YaHei", sans-serif; color: var(--ink); background: var(--band); }
header { padding: 18px 24px 14px; background: var(--paper); border-bottom: 1px solid var(--line); }
h1 { margin: 0 0 6px; font-size: 22px; font-weight: 700; }
h2 { margin: 0 0 10px; font-size: 16px; }
p { margin: 0; color: var(--muted); line-height: 1.45; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; padding: 14px 24px; background: var(--paper); border-bottom: 1px solid var(--line); }
.metric { border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px; background: #fbfcfd; min-height: 58px; }
.metric strong { display: block; font-size: 18px; line-height: 1.1; }
.metric span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
main { padding: 18px 24px 28px; display: grid; gap: 18px; }
.section { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.floor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.floor h3 { margin: 0 0 8px; font-size: 14px; }
svg { width: 100%; height: auto; display: block; background: #fbfbf8; border: 1px solid var(--line); border-radius: 6px; }
.room { fill: #e2ebdc; stroke: #47664f; stroke-width: .45; }
.room.public { fill: #e8efd8; }
.room.private { fill: #dde9f4; }
.room.service { fill: #efe5d7; }
.room.circulation { fill: #eeeeee; }
.room.outdoor { fill: #e0f0df; }
.volume { fill: none; stroke: #4d5966; stroke-width: .7; stroke-dasharray: 2 1; }
.door-line { stroke: #7a4e19; stroke-width: .9; stroke-linecap: round; }
.path-line { stroke: #345c9c; stroke-width: .55; stroke-linecap: round; opacity: .85; }
.stair { fill: #7a4e19; stroke: #4b2c0a; stroke-width: .25; }
.decor { fill: #ad4e7a; opacity: .9; }
text { font-size: 3px; fill: #1f2a2f; dominant-baseline: hanging; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 10px; }
.legend span { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
.swatch { width: 12px; height: 12px; border: 1px solid var(--line); border-radius: 2px; background: #ddd; }
.tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { color: var(--muted); font-weight: 600; background: #fafafa; }
.ok { color: var(--ok); font-weight: 700; }
.warn { color: var(--warn); font-weight: 700; }
.bad { color: var(--bad); font-weight: 700; }
.checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
.check { border: 1px solid var(--line); border-radius: 6px; padding: 8px 9px; background: #fbfcfd; font-size: 13px; }
.check strong { display: block; margin-bottom: 3px; }
.small { font-size: 12px; color: var(--muted); }
</style>
<header>
  <h1>MC Architect Preview</h1>
  <p>${escapeHtml(prompt)}</p>
</header>
<section class="summary" aria-label="summary">
  ${metric(validation.ok ? '通过' : '未通过', 'QA 状态', validation.ok ? 'ok' : 'bad')}
  ${metric(`${blueprint.layout.rooms.length}`, '房间数量')}
  ${metric(`${blueprint.geometry.exporter.operationCount}`, 'fill 命令')}
  ${metric(`${blueprint.geometry.exporter.compressionRatio}x`, '导出压缩')}
  ${metric(`${validation.stats.circulation.reachableRoomCount}/${validation.stats.rooms.roomCount}`, '入口可达房间')}
  ${metric(`${blueprint.decorator.placementCount || 0}`, '装饰物件')}
  ${metric(`${agentCapabilityCount(blueprint)}`, 'Agent能力项')}
</section>
<main>
  <section class="section">
    <h2>多层平面</h2>
    <div class="floor-grid">
      ${floors.map((floor) => renderFloorSvg(floor, blueprint, validation, { width, depth })).join('')}
    </div>
    <div class="legend">
      <span><i class="swatch" style="background:#e8efd8"></i>公共</span>
      <span><i class="swatch" style="background:#dde9f4"></i>私密</span>
      <span><i class="swatch" style="background:#efe5d7"></i>服务</span>
      <span><i class="swatch" style="background:#eeeeee"></i>交通</span>
      <span><i class="swatch" style="background:#ad4e7a"></i>装饰</span>
      <span><i class="swatch" style="background:#7a4e19"></i>楼梯/门</span>
    </div>
  </section>
  <section class="section">
    <h2>统计</h2>
    <div class="tables">
      ${renderModuleTable(moduleLegend)}
      ${renderRoomTable(blueprint.layout.rooms)}
      ${renderExporterTable(blueprint.geometry.exporter)}
      ${renderAgentCapabilityTable(blueprint)}
    </div>
  </section>
  <section class="section">
    <h2>QA 检查</h2>
    <div class="checks">
      ${qaChecks.map(renderCheck).join('')}
    </div>
  </section>
</main>
</html>
`;
  }
}

function renderFloorSvg(floor, blueprint, validation, size) {
  const bounds = blueprint.bounds;
  const floorRooms = blueprint.layout.rooms.filter((room) => Number(room.floor || 0) === floor);
  const floorVolumes = blueprint.shell.volumeBoxes.filter((box) => box.bounds.minY <= floorTopY(blueprint, floor) && box.bounds.maxY >= floorBaseY(blueprint, floor));
  const floorDoors = blueprint.layout.interiorDoors.filter((door) => Number(door.floor || 0) === floor);
  const floorPaths = blueprint.paths.openedEdges.filter((edge) => Number(edge.floor || 0) === floor && edge.status === 'routed');
  const floorStairs = blueprint.paths.stairs.filter((step) => Number(step.floor || 0) === floor);
  const floorDecor = (blueprint.decorator.placements || []).filter((item) => roomFloor(item.room_id, blueprint) === floor).slice(0, 80);
  const unreachable = new Set(validation.stats.circulation.unreachableRooms || []);
  const viewBox = `0 0 ${size.width} ${size.depth}`;

  return `<article class="floor">
  <h3>${floor === 0 ? '一层' : `${floor + 1}层`}</h3>
  <svg viewBox="${viewBox}" role="img" aria-label="floor ${floor} plan">
    ${floorVolumes.map((box) => volumeRect(box, bounds)).join('')}
    ${floorRooms.map((room) => roomRect(room, bounds, unreachable.has(room.id))).join('')}
    ${floorDoors.map((door) => doorMark(door, bounds)).join('')}
    ${floorPaths.map((edge) => pathLine(edge, blueprint, bounds)).join('')}
    ${floorStairs.map((step) => stairMark(step, bounds)).join('')}
    ${floorDecor.map((item) => decorMark(item, bounds)).join('')}
  </svg>
</article>`;
}

function volumeRect(box, bounds) {
  const x = box.bounds.minX - bounds.minX;
  const z = box.bounds.minZ - bounds.minZ;
  const width = box.bounds.maxX - box.bounds.minX + 1;
  const depth = box.bounds.maxZ - box.bounds.minZ + 1;
  return `<rect class="volume" x="${x}" y="${z}" width="${width}" height="${depth}" />`;
}

function roomRect(room, bounds, unreachable) {
  const x = room.min_x - bounds.minX;
  const z = room.min_z - bounds.minZ;
  const width = room.max_x - room.min_x + 1;
  const depth = room.max_z - room.min_z + 1;
  const zone = room.zone || zoneForType(room.type);
  const label = escapeHtml(room.label || room.id);
  const mark = unreachable ? ' bad' : '';
  return `<rect class="room ${zone}${mark}" x="${x}" y="${z}" width="${width}" height="${depth}" /><text x="${x + 1}" y="${z + 1}">${label}</text>`;
}

function doorMark(door, bounds) {
  if (!door.at) return '';
  const x = door.at.x - bounds.minX;
  const z = door.at.z - bounds.minZ;
  if (door.axis === 'x') return `<line class="door-line" x1="${x}" y1="${z - 1}" x2="${x}" y2="${z + 1}" />`;
  return `<line class="door-line" x1="${x - 1}" y1="${z}" x2="${x + 1}" y2="${z}" />`;
}

function pathLine(edge, blueprint, bounds) {
  const a = blueprint.layout.rooms.find((room) => room.id === edge.from);
  const b = blueprint.layout.rooms.find((room) => room.id === edge.to);
  if (!a || !b) return '';
  const ac = center(a, bounds);
  const bc = center(b, bounds);
  return `<line class="path-line" x1="${ac.x}" y1="${ac.z}" x2="${bc.x}" y2="${bc.z}" />`;
}

function stairMark(step, bounds) {
  const x = step.x - bounds.minX;
  const z = step.z - bounds.minZ;
  return `<rect class="stair" x="${x}" y="${z}" width="1" height="1" />`;
}

function decorMark(item, bounds) {
  if (!item.at) return '';
  const x = item.at.x - bounds.minX;
  const z = item.at.z - bounds.minZ;
  return `<circle class="decor" cx="${x + 0.5}" cy="${z + 0.5}" r="0.55" />`;
}

function renderModuleTable(modules) {
  return `<table>
  <thead><tr><th>模块</th><th>格数</th></tr></thead>
  <tbody>${modules.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td></tr>`).join('')}</tbody>
</table>`;
}

function renderRoomTable(rooms) {
  return `<table>
  <thead><tr><th>房间</th><th>楼层</th><th>类型</th></tr></thead>
  <tbody>${rooms.slice(0, 18).map((room) => `<tr><td>${escapeHtml(room.label || room.id)}</td><td>${Number(room.floor || 0) + 1}</td><td>${escapeHtml(room.type)}</td></tr>`).join('')}</tbody>
</table>`;
}

function renderExporterTable(exporter) {
  return `<table>
  <thead><tr><th>导出项</th><th>值</th></tr></thead>
  <tbody>
    <tr><td>网格格数</td><td>${exporter.inputCellCount}</td></tr>
    <tr><td>朴素命令</td><td>${exporter.naiveOperationCount}</td></tr>
    <tr><td>优化命令</td><td>${exporter.operationCount}</td></tr>
    <tr><td>压缩倍率</td><td>${exporter.compressionRatio}x</td></tr>
    <tr><td>覆盖检查</td><td>${exporter.coverageOk ? '通过' : '失败'}</td></tr>
  </tbody>
</table>`;
}

function renderAgentCapabilityTable(blueprint) {
  const rows = [
    ['StylePreset', blueprint.stylePreset?.signatures?.length || 0, blueprint.stylePreset?.id || '-'],
    ['MaterialPalette', blueprint.materialPalette?.roles?.length || 0, `${blueprint.materialPalette?.controllableBlockCount || 0} blocks`],
    ['CreativeDesign', blueprint.creativeDesign?.authority?.variable_axes?.length || 0, blueprint.creativeDesign?.signature || '-'],
    ['Structure', (blueprint.structure?.support_elements?.length || 0) + (blueprint.structure?.bracing_elements?.length || 0) + (blueprint.structure?.reinforcement_elements?.length || 0), blueprint.structure?.stability?.lateral_system || '-'],
    ['Facade', blueprint.facade?.facade_elements?.length || 0, blueprint.facade?.window_system?.rhythm || '-'],
    ['Roof', blueprint.roof?.elements?.length || 0, blueprint.roof?.service_strategy?.maintenance_zone || blueprint.roof?.profile || '-'],
    ['Site', blueprint.site?.zones?.length || 0, blueprint.site?.terrain_response || '-'],
    ['Opening', (blueprint.opening?.daylight_targets?.length || 0) + (blueprint.opening?.secondary_exits?.length || 0), blueprint.opening?.emergency_egress?.strategy || '-'],
    ['Interior', blueprint.interior?.room_specialists?.length || 0, blueprint.interior?.comfort_strategy?.density_target || '-'],
    ['Decorator', blueprint.decorator?.capability_profile?.active_specialists || 0, `${blueprint.decorator?.capability_profile?.module_layers?.length || 0} layers`],
    ['Repair', blueprint.repair?.checks?.length || 0, blueprint.repair?.ok ? 'ok' : 'attention'],
    ['Optimizer', blueprint.geometry?.exporter?.moduleTypeCount || 0, `${blueprint.geometry?.exporter?.operationCount || 0} ops`]
  ];
  return `<table>
  <thead><tr><th>Agent</th><th>能力项</th><th>摘要</th></tr></thead>
  <tbody>${rows.map(([name, count, note]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td><td>${escapeHtml(note)}</td></tr>`).join('')}</tbody>
</table>`;
}

function renderCheck(item) {
  const status = item.ok ? '<span class="ok">通过</span>' : '<span class="bad">失败</span>';
  return `<div class="check"><strong>${escapeHtml(item.name)}</strong>${status}<div class="small">${escapeHtml(compactDetails(item.details))}</div></div>`;
}

function compactDetails(details = {}) {
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(',') : value}`)
    .join(' | ');
}

function floorList(blueprint) {
  const floors = new Set([0]);
  for (const room of blueprint.layout.rooms || []) floors.add(Number(room.floor || 0));
  for (const step of blueprint.paths.stairs || []) floors.add(Number(step.floor || 0));
  return [...floors].sort((a, b) => a - b);
}

function topModules(blueprint) {
  if (blueprint.geometry.exporter?.topModules?.length) return blueprint.geometry.exporter.topModules;
  return Object.entries(blueprint.modules || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function agentCapabilityCount(blueprint) {
  return (blueprint.stylePreset?.signatures?.length || 0) +
    (blueprint.materialPalette?.roles?.length || 0) +
    (blueprint.creativeDesign?.authority?.variable_axes?.length || 0) +
    (blueprint.structure?.support_elements?.length || 0) +
    (blueprint.structure?.bracing_elements?.length || 0) +
    (blueprint.structure?.reinforcement_elements?.length || 0) +
    (blueprint.facade?.facade_elements?.length || 0) +
    (blueprint.roof?.elements?.length || 0) +
    (blueprint.site?.zones?.length || 0) +
    (blueprint.opening?.daylight_targets?.length || 0) +
    (blueprint.interior?.room_specialists?.length || 0) +
    (blueprint.decorator?.capability_profile?.module_layers?.length || 0) +
    (blueprint.repair?.checks?.length || 0);
}

function roomFloor(roomId, blueprint) {
  return Number(blueprint.layout.rooms.find((room) => room.id === roomId)?.floor || 0);
}

function floorBaseY(blueprint, floor) {
  return floor * Number(blueprint.buildSpec.floor_height || 5) + 1;
}

function floorTopY(blueprint, floor) {
  return (floor + 1) * Number(blueprint.buildSpec.floor_height || 5) + 1;
}

function center(room, bounds) {
  return {
    x: Math.floor((room.min_x + room.max_x) / 2) - bounds.minX,
    z: Math.floor((room.min_z + room.max_z) / 2) - bounds.minZ
  };
}

function metric(value, label, tone = '') {
  return `<div class="metric ${tone}"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function zoneForType(type) {
  if (['kitchen', 'bathroom', 'garage', 'armory', 'storage', 'utility'].includes(type)) return 'service';
  if (['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room', 'tower'].includes(type)) return 'private';
  if (['stairs', 'corridor'].includes(type)) return 'circulation';
  return 'public';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
