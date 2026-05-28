export function renderPreviewHtml({ prompt, design, blueprint, validation }) {
  const payload = JSON.stringify({ prompt, design, blueprint, validation }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Minecraft 建筑预览</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111418;
      --panel: #1d232b;
      --text: #eef3f6;
      --muted: #a8b3bd;
      --accent: #69d2a0;
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 20% 0%, #26313b 0, #111418 42%);
      color: var(--text);
      display: grid;
      grid-template-rows: auto 1fr;
    }
    header {
      display: flex;
      gap: 18px;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: rgba(17, 20, 24, 0.88);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
      margin-top: 4px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    button {
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: #26313b;
      color: var(--text);
      border-radius: 6px;
      padding: 8px 10px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { border-color: var(--accent); }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      min-height: 0;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      background: linear-gradient(#18212a, #111418);
    }
    aside {
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(29, 35, 43, 0.92);
      padding: 16px;
      overflow: auto;
    }
    .stat {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-size: 14px;
    }
    .label { color: var(--muted); }
    @media (max-width: 760px) {
      main { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
      aside { border-left: 0; border-top: 1px solid rgba(255, 255, 255, 0.08); max-height: 240px; }
      header { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Minecraft 建筑预览</h1>
      <div class="meta" id="subtitle"></div>
    </div>
    <div class="actions">
      <button id="left" title="向左旋转">↺</button>
      <button id="right" title="向右旋转">↻</button>
      <button id="zoomIn" title="放大">＋</button>
      <button id="zoomOut" title="缩小">－</button>
      <button id="reset" title="重置视角">重置</button>
    </div>
  </header>
  <main>
    <canvas id="scene"></canvas>
    <aside id="stats"></aside>
  </main>
  <script>
    const data = ${payload};
    const canvas = document.getElementById('scene');
    const ctx = canvas.getContext('2d');
    const subtitle = document.getElementById('subtitle');
    const stats = document.getElementById('stats');
    let yaw = Math.PI / 4;
    let scale = 18;

    subtitle.textContent = data.prompt;
    stats.innerHTML = [
      ['风格', data.design.style],
      ['层数', data.design.floors],
      ['尺寸', data.validation.stats.bounds.width + ' × ' + data.validation.stats.bounds.height + ' × ' + data.validation.stats.bounds.depth],
      ['命令数', data.validation.stats.operationCount],
      ['fill', data.validation.stats.fillCount],
      ['setblock', data.validation.stats.setblockCount]
    ].map(([k, v]) => '<div class="stat"><span class="label">' + k + '</span><strong>' + v + '</strong></div>').join('');

    const colors = {
      stone_bricks: '#7e8589',
      smooth_sandstone: '#d7c990',
      stripped_dark_oak_log: '#6b4326',
      spruce_planks: '#8a5b32',
      dark_oak_planks: '#3f2618',
      glass: '#87cbe6',
      dark_oak_door: '#4a2d1d',
      bricks: '#9c4f3f',
      oak_leaves: '#3f7d3f',
      gravel: '#8d8b84',
      poppy: '#d9413d',
      cornflower: '#4477c7',
      glowstone: '#f0c66a',
      campfire: '#df7b32'
    };

    const blocks = expandBlocks(data.blueprint.operations);

    function expandBlocks(operations) {
      const result = [];
      for (const op of operations) {
        if (op.block === 'minecraft:air') continue;
        if (op.kind === 'setblock') {
          result.push({ ...op.at, block: op.block });
          continue;
        }
        const volume = (op.to.x - op.from.x + 1) * (op.to.y - op.from.y + 1) * (op.to.z - op.from.z + 1);
        if (volume > 2500) continue;
        for (let x = op.from.x; x <= op.to.x; x++) {
          for (let y = op.from.y; y <= op.to.y; y++) {
            for (let z = op.from.z; z <= op.to.z; z++) {
              result.push({ x, y, z, block: op.block });
            }
          }
        }
      }
      return result.slice(0, 12000);
    }

    function blockColor(block) {
      const id = block.replace('minecraft:', '').split('[')[0];
      return colors[id] || '#cccccc';
    }

    function project(p) {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const rx = p.x * cos - p.z * sin;
      const rz = p.x * sin + p.z * cos;
      return {
        x: canvas.width / 2 + (rx - rz) * scale * 0.58,
        y: canvas.height * 0.7 + (rx + rz) * scale * 0.25 - p.y * scale * 0.62
      };
    }

    function drawBlock(p) {
      const c = project(p);
      const s = scale * 0.55;
      ctx.fillStyle = blockColor(p.block);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - s * 0.45);
      ctx.lineTo(c.x + s, c.y);
      ctx.lineTo(c.x, c.y + s * 0.45);
      ctx.lineTo(c.x - s, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * devicePixelRatio);
      canvas.height = Math.floor(rect.height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      canvas.width = rect.width;
      canvas.height = rect.height;
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sorted = [...blocks].sort((a, b) => (a.x + a.z + a.y * 0.2) - (b.x + b.z + b.y * 0.2));
      for (const block of sorted) drawBlock(block);
    }

    document.getElementById('left').onclick = () => { yaw -= Math.PI / 12; draw(); };
    document.getElementById('right').onclick = () => { yaw += Math.PI / 12; draw(); };
    document.getElementById('zoomIn').onclick = () => { scale = Math.min(34, scale + 2); draw(); };
    document.getElementById('zoomOut').onclick = () => { scale = Math.max(8, scale - 2); draw(); };
    document.getElementById('reset').onclick = () => { yaw = Math.PI / 4; scale = 18; draw(); };
    addEventListener('resize', resize);
    resize();
  </script>
</body>
</html>`;
}
