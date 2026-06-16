import path from 'node:path';

export const C = {
  red: '#A00000',
  redDark: '#7C0000',
  ink: '#111111',
  text: '#242424',
  gray: '#686868',
  line: '#D4D4D4',
  pale: '#F7F2F2',
  pale2: '#F3F3F3',
  code: '#111111',
  blue: '#245D8A',
  green: '#356E48',
  gold: '#9A7416'
};

export const F = {
  title: 'Microsoft YaHei',
  body: 'Microsoft YaHei',
  mono: 'Cascadia Mono'
};

export const asset = (ctx, rel) => path.join(ctx.workspaceDir, rel);

export async function base(slide, ctx, sec = '') {
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: '#FFFFFF' });
  ctx.addShape(slide, { x: 0, y: 48, w: 76, h: 84, fill: C.red });
  ctx.addShape(slide, { x: 790, y: 704, w: 490, h: 12, fill: C.red });
  await ctx.addImage(slide, { path: asset(ctx, 'assets/pku-logo.png'), x: 1040, y: 42, w: 190, h: 53, fit: 'contain' });
  if (sec) ctx.addText(slide, { text: sec, x: 54, y: 674, w: 400, h: 20, fontSize: 9.5, color: C.gray, typeface: F.body });
}

export async function title(slide, ctx, main, sub = '', sec = '') {
  await base(slide, ctx, sec);
  ctx.addText(slide, { text: main, x: 98, y: 52, w: 840, h: 48, fontSize: 26, color: C.ink, typeface: F.title });
  if (sub) ctx.addText(slide, { text: sub, x: 100, y: 110, w: 940, h: 28, fontSize: 13.2, color: C.gray, typeface: F.body });
}

export function panel(slide, ctx, { x, y, w, h, head = '', body = '', accent = C.red, fill = '#FFFFFF', headSize = 14, bodySize = 10.8 }) {
  ctx.addShape(slide, { x, y, w, h, fill, line: ctx.line(C.line, 1) });
  ctx.addShape(slide, { x, y, w: 7, h, fill: accent });
  if (head) ctx.addText(slide, { text: head, x: x + 16, y: y + 10, w: w - 28, h: 24, fontSize: headSize, color: C.ink, bold: true, typeface: F.body });
  if (body) ctx.addText(slide, { text: Array.isArray(body) ? body.join('\n') : body, x: x + 16, y: y + (head ? 40 : 12), w: w - 28, h: h - (head ? 48 : 20), fontSize: bodySize, color: C.text, typeface: F.body, valign: 'top' });
}

export function code(slide, ctx, { x, y, w, h, head = '', text, size = 10.2 }) {
  ctx.addShape(slide, { x, y, w, h, fill: C.code, line: ctx.line(C.code, 1) });
  if (head) {
    ctx.addShape(slide, { x, y, w, h: 26, fill: '#050505' });
    ctx.addText(slide, { text: head, x: x + 12, y: y + 7, w: w - 24, h: 14, fontSize: 10, color: '#FFFFFF', bold: true, typeface: F.mono });
  }
  ctx.addText(slide, { text, x: x + 12, y: y + (head ? 36 : 12), w: w - 24, h: h - (head ? 44 : 20), fontSize: size, color: '#F7F7F7', typeface: F.mono, valign: 'top' });
}

export function table(slide, ctx, { x, y, cols, rows, colWidths, rowH = 34, headH = 34, fontSize = 9.8 }) {
  let cx = x;
  for (let i = 0; i < cols.length; i += 1) {
    const w = colWidths[i];
    ctx.addShape(slide, { x: cx, y, w, h: headH, fill: C.red, line: ctx.line('#FFFFFF', 1) });
    ctx.addText(slide, { text: cols[i], x: cx + 8, y: y + 9, w: w - 16, h: headH - 10, fontSize: 10.4, color: '#FFFFFF', bold: true, typeface: F.body });
    cx += w;
  }
  for (let r = 0; r < rows.length; r += 1) {
    cx = x;
    const fill = r % 2 ? C.pale : '#FFFFFF';
    for (let c = 0; c < cols.length; c += 1) {
      const w = colWidths[c];
      ctx.addShape(slide, { x: cx, y: y + headH + r * rowH, w, h: rowH, fill, line: ctx.line(C.line, 1) });
      ctx.addText(slide, { text: rows[r][c], x: cx + 8, y: y + headH + r * rowH + 7, w: w - 16, h: rowH - 10, fontSize, color: C.text, typeface: F.body, valign: 'top' });
      cx += w;
    }
  }
}

export function tag(slide, ctx, text, x, y, w, color = C.red) {
  ctx.addShape(slide, { x, y, w, h: 25, fill: color, line: ctx.line(color, 1) });
  ctx.addText(slide, { text, x: x + 8, y: y + 6, w: w - 16, h: 14, fontSize: 9.4, color: '#FFFFFF', bold: true, align: 'center', typeface: F.body });
}

export function arrow(slide, ctx, x1, y1, x2, y2, color = C.red) {
  ctx.addShape(slide, { x: Math.min(x1, x2), y: y1 - 1, w: Math.abs(x2 - x1), h: 2, fill: color });
  ctx.addText(slide, { text: '>', x: x2 - 11, y: y1 - 13, w: 18, h: 22, fontSize: 17, color, bold: true, typeface: F.body });
}

export async function imageFrame(slide, ctx, { path: p, x, y, w, h, caption = '', fit = 'cover' }) {
  ctx.addShape(slide, { x: x - 2, y: y - 2, w: w + 4, h: h + 4, fill: '#FFFFFF', line: ctx.line(C.red, 2) });
  await ctx.addImage(slide, { path: p, x, y, w, h, fit });
  if (caption) {
    ctx.addShape(slide, { x, y: y + h + 6, w, h: 24, fill: C.red });
    ctx.addText(slide, { text: caption, x: x + 10, y: y + h + 12, w: w - 20, h: 13, fontSize: 9.5, color: '#FFFFFF', typeface: F.body });
  }
}

export function footnote(slide, ctx, text) {
  ctx.addText(slide, { text, x: 60, y: 648, w: 1040, h: 22, fontSize: 10, color: C.gray, typeface: F.body });
}
