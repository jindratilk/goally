// Offline product illustrations. Every mission, task and finding below is fictional.
// Inputs are limited to the dashboard's public design tokens and bundled fonts.
// This renderer never opens a browser, calls the daemon or reads stored missions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';

const dashboard = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(dashboard, '../docs/images');
const css = fs.readFileSync(path.join(dashboard, 'src/index.css'), 'utf8');
for (const [family, file] of [
  ['Geist', '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'],
  ['JetBrains Mono', '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'],
]) assert.ok(GlobalFonts.registerFromPath(path.join(dashboard, 'node_modules', file), family), `Missing font: ${family}`);

function palette(dark) {
  const tokens = (selector) => Object.fromEntries([...css.match(selector)[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
  const vars = { ...tokens(/:root\s*\{([^}]+)\}/), ...(dark ? tokens(/\.dark\s*\{([^}]+)\}/) : {}) };
  const get = (key) => vars[key]?.startsWith('var(') ? get(vars[key].slice(6, -1)) : vars[key];
  return { bg: get('background'), card: get('card'), muted: get('muted'), text: get('ink'), secondary: get('muted-foreground'),
    subtle: get('subtle'), sidebar: get('sidebar'), success: get('success'), warning: get('warning'), danger: get('danger'),
    border: dark ? get('border') : '#ddddd6', input: dark ? get('input') : '#c7c8bc', accent: get('accent') };
}
const DARK = palette(true);
const LIGHT = palette(false);
const SCALE = 2;

const ICONS = {
  board: 'M3 3h18v18H3z M8 3v18 M16 3v18 M5.5 7h0 M11 7h2 M18.5 7h0',
  chart: 'M4 3v17h17 M8 15v-4 M13 15V7 M18 15V4',
  bot: 'M12 3v3 M8 3h4 M4 8h16v12H4z M1 12v4 M23 12v4 M8 12v2 M16 12v2 M8 17h8',
  radar: 'M12 12l7-7 M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5',
  activity: 'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5',
  history: 'M3 4v5h5 M3 9a9 9 0 1 1 0 6 M12 7v5l3 2',
  settings: 'M4 7l3-3 4 2h2l4-2 3 3-2 4v2l2 4-3 3-4-2h-2l-4 2-3-3 2-4v-2z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  phone: 'M6 2h12v20H6z M10 18h4',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  check: 'M5 12l4 4L19 6',
  monitor: 'M3 3h18v13H3z M12 16v5 M7 21h10',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l2 2 M18 18l2 2 M20 4l-2 2 M6 18l-2 2',
  moon: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10',
  pause: 'M8 5v14 M16 5v14',
};

function illustration(width, height, draw) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  function box(x, y, w, h, fill, radius = 10, stroke) {
    assert.ok(w > 0 && h > 0);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function text(value, x, y, size = 16, color = DARK.text, weight = 400, width, mono = false) {
    ctx.font = `${weight} ${size}px "${mono ? 'JetBrains Mono' : 'Geist'}"`;
    let rendered = value;
    if (width) {
      while (ctx.measureText(rendered).width > width && rendered.length) rendered = rendered.slice(0, -1);
      if (rendered !== value) rendered = rendered.slice(0, -1) + '…';
    }
    assert.ok(x >= 0 && y >= 0 && y + size < height, `Text outside image: ${value}`);
    ctx.fillStyle = color; ctx.fillText(rendered, x, y);
    return ctx.measureText(rendered).width;
  }
  function paragraph(value, x, y, width, size = 16, color = DARK.secondary, weight = 400, leading = 1.45) {
    ctx.font = `${weight} ${size}px "Geist"`;
    let line = '';
    for (const word of value.split(' ')) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) {
        text(line, x, y, size, color, weight); y += size * leading; line = word;
      } else line += `${line ? ' ' : ''}${word}`;
    }
    if (line) text(line, x, y, size, color, weight);
    return y + size * leading;
  }
  function line(x1, y1, x2, y2, color = DARK.border) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.stroke();
  }
  function dot(x, y, color, r = 3.5) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  function icon(name, x, y, size = 18, color = DARK.secondary) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke(new Path2D(ICONS[name])); ctx.restore();
  }
  function logo(x, y, size = 22, color = DARK.text) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24); ctx.lineWidth = 1.7; ctx.strokeStyle = color;
    for (const r of [9, 4]) { ctx.beginPath(); ctx.arc(12, 12, r, 0, Math.PI * 2); ctx.stroke(); }
    line(12, 12, 19, 5, color); ctx.restore();
  }
  function pill(label, x, y, color, background, size = 13) {
    ctx.font = `500 ${size}px Geist`;
    const w = ctx.measureText(label).width + 20;
    box(x, y, w, size + 12, background, 14);
    text(label, x + 10, y + 5, size, color, 500);
    return w;
  }
  draw({ ctx, box, text, paragraph, line, dot, icon, logo, pill });
  return canvas.toBuffer('image/png');
}

// Fixed demonstration scenario; deliberately independent of demo/live mission stores.
const boardTasks = [
  { id: 'CT-7', lane: 'qa', column: 0, title: 'Check keyboard and screen reader flow', footer: 'After CT-4, CT-6', waiting: true },
  { id: 'CT-8', lane: 'release', column: 0, title: 'Verify download on the preview', footer: 'After CT-4, CT-5, CT-6', waiting: true },
  { id: 'CT-4', lane: 'ui', column: 1, title: 'Add the export button to reports', footer: 'ui-agent · 2m 18s · 16 tools', running: true },
  { id: 'CT-5', lane: 'backend', column: 1, title: 'Keep active filters in the export', footer: 'api-agent · 1m 42s · 11 tools', running: true },
  { id: 'CT-6', lane: 'qa', column: 2, title: 'Test the complete download flow', footer: 'qa-agent · awaiting verification', flagged: true },
  { id: 'CT-1', lane: 'backend', column: 3, title: 'Create the CSV export endpoint', footer: 'test: src/api/export.test.ts', done: true },
  { id: 'CT-2', lane: 'backend', column: 3, title: 'Escape commas, quotes and newlines', footer: 'test: src/lib/csv.test.ts', done: true },
  { id: 'CT-3', lane: 'qa', column: 3, title: 'Cover empty results and Unicode', footer: 'test: src/lib/csv.test.ts', done: true },
];

function board() {
  const p = DARK;
  return illustration(1440, 900, ({ ctx, box, text, paragraph, line, dot, icon, logo }) => {
    box(0, 0, 1440, 900, '#e7e8df', 0);
    ctx.save(); ctx.shadowColor = '#23261d25'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    box(32, 32, 1376, 836, p.bg, 16); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(32, 32, 1376, 836, 16); ctx.clip();
    box(32, 32, 220, 836, p.sidebar, 0);
    line(252, 32, 252, 868);
    line(252, 96, 1408, 96);
    logo(55, 54); text('Goally', 90, 56, 18, p.text, 600);
    text('CSV export for reports', 278, 56, 18, p.text, 500);
    ctx.beginPath(); ctx.arc(910, 65, 10, 0, Math.PI * 2); ctx.strokeStyle = p.input; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(910, 65, 10, -Math.PI / 2, Math.PI / 4); ctx.strokeStyle = p.text; ctx.stroke();
    text('3 / 8 proven', 934, 57, 14, p.secondary);
    dot(1222, 65, p.success); text('Live', 1235, 57, 14, p.secondary);
    box(1290, 47, 92, 35, p.muted, 18, p.border); icon('pause', 1303, 56, 15); text('Pause', 1325, 55, 13, p.text, 500);

    for (const [i, [label, symbol, count]] of [['Board', 'board', '5'], ['Stats', 'chart'], ['Agents', 'bot', '2'], ['Goal Director', 'radar', '1'], ['Activity', 'activity']].entries()) {
      const y = 116 + i * 40;
      if (i === 0) box(44, y, 196, 36, p.card, 7, p.border);
      icon(symbol, 57, y + 9, 17, i === 0 ? p.text : p.secondary);
      text(label, 86, y + 9, 15, i === 0 ? p.text : p.secondary, i === 0 ? 500 : 400);
      if (count) text(count, 218, y + 10, 12, p.secondary);
    }
    text('ACTIVE GOALS', 57, 356, 11, p.subtle, 500);
    box(44, 383, 196, 36, p.muted, 7); dot(61, 401, p.text, 3);
    text('CSV export for reports', 75, 393, 12, p.text, 500);
    text('Refresh onboarding', 57, 435, 13, p.secondary);
    text('FINISHED', 57, 495, 11, p.subtle, 500);
    icon('check', 55, 530, 14, p.success); text('Keyboard shortcuts', 77, 530, 13, p.secondary);
    icon('check', 55, 565, 14, p.success); text('Search improvements', 77, 565, 13, p.secondary);
    for (const [i, [label, symbol]] of [['History', 'history'], ['Settings', 'settings'], ['Phone access', 'phone']].entries()) {
      const y = 747 + i * 35; icon(symbol, 57, y, 17); text(label, 86, y + 1, 14, p.secondary);
    }
    box(278, 124, 255, 39, p.card, 7, p.input); icon('search', 290, 134, 18); text('Filter tasks', 319, 135, 14, p.secondary);
    box(547, 124, 405, 39, p.muted, 7); box(551, 128, 84, 31, p.card, 5, p.border);
    for (const [x, label] of [[563, 'All lanes'], [652, 'backend'], [744, 'ui'], [793, 'qa'], [846, 'release']]) text(label, x, 136, 13, label === 'All lanes' ? p.text : p.secondary, 500);

    const columns = ['To-do', 'In progress', 'Testing', 'Launched'];
    columns.forEach((name, column) => {
      const x = 278 + column * 277;
      const tasks = boardTasks.filter((t) => t.column === column);
      box(x, 186, 263, 609, '#24251f', 12);
      const labelWidth = text(name, x + 14, 204, 13, p.secondary, 500);
      text(String(tasks.length), x + 25 + labelWidth, 205, 12, p.subtle);
      tasks.forEach((task, row) => {
        const y = 241 + row * 153;
        box(x + 8, y, 247, 141, p.card, 8, p.border);
        text(task.id, x + 21, y + 16, 11, p.secondary, 400, undefined, true);
        text(`· ${task.lane}`, x + 70, y + 16, 12, p.secondary);
        if (task.done) { ctx.beginPath(); ctx.arc(x + 231, y + 22, 6, 0, Math.PI * 2); ctx.strokeStyle = p.success; ctx.lineWidth = 1; ctx.stroke(); icon('check', x + 225, y + 16, 12, p.success); }
        if (task.running) dot(x + 231, y + 22, p.text);
        if (task.flagged) { text('!', x + 228, y + 13, 17, p.warning, 600); }
        paragraph(task.title, x + 21, y + 43, 209, 17, p.text, 500, 1.32);
        text(task.footer, x + 21, y + 112, 10.5, task.flagged ? p.warning : p.secondary, 400, 212, !!task.done);
      });
    });
    ctx.restore();
  });
}

function director() {
  const p = DARK;
  return illustration(760, 760, ({ box, text, paragraph, line, dot, icon, pill }) => {
    box(0, 0, 760, 760, '#e7e8df', 0); box(24, 24, 712, 712, p.card, 16, p.border);
    icon('radar', 52, 56, 27, p.text); text('Goal Director', 93, 55, 25, p.text, 600);
    text('An independent reviewer, right on the board.', 52, 99, 17, p.secondary);
    box(52, 147, 656, 67, p.muted, 9);
    text('Codex', 71, 168, 19, p.text, 500); dot(531, 181, p.success); text('Check complete', 545, 172, 14, p.success, 500);

    box(52, 237, 656, 302, p.card, 10, p.border);
    const badge = pill('medium', 72, 258, p.warning, '#3b3227');
    text('No proof', 86 + badge, 263, 14, p.secondary); text('· CT-6', 191 + badge, 263, 14, p.secondary);
    text('Download flow needs verification', 72, 307, 23, p.text, 500);
    paragraph('The UI and export endpoint passed separately. The filtered download has not been checked together.', 72, 350, 604, 17, p.secondary);
    box(72, 423, 616, 94, p.muted, 7);
    paragraph('Run the download flow with filters and attach the result before closing CT-6.', 89, 441, 580, 17, p.text, 400, 1.4);

    text('Message to main chat', 52, 570, 16, p.text, 500);
    for (const [i, label] of ['Queued', 'Delivered', 'Accepted'].entries()) {
      const x = 62 + i * 217;
      dot(x, 625, p.success, 4); text(label, x + 16, 616, 15, p.secondary);
      if (i < 2) line(x + 112, 625, x + 197, 625, p.border);
    }
    line(52, 665, 708, 665);
    text('Last check', 52, 686, 13, p.secondary); text('Just now', 153, 685, 14, p.text);
    text('Runs', 564, 686, 13, p.secondary); text('3', 674, 685, 14, p.text);
  });
}

function settings() {
  const p = LIGHT;
  return illustration(760, 760, ({ box, text, paragraph, line, dot, icon }) => {
    box(0, 0, 760, 760, '#e7e8df', 0);
    box(24, 24, 712, 298, p.card, 16, p.border);
    text('Appearance', 52, 50, 24, p.text, 500); text('Choose how Goally looks on this device.', 52, 89, 17, p.secondary);
    for (const [i, [label, symbol]] of [['System', 'monitor'], ['Light', 'sun'], ['Dark', 'moon']].entries()) {
      const x = 52 + i * 224;
      box(x, 135, 208, 142, i === 1 ? p.muted : p.card, 9, i === 1 ? p.secondary : p.border);
      const preview = i === 2 ? DARK : LIGHT;
      box(x + 9, 144, 190, 89, preview.bg, 5, preview.border);
      box(x + 9, 144, 43, 89, i === 0 ? p.sidebar : preview.sidebar, 4);
      if (i === 0) box(x + 105, 144, 94, 89, DARK.bg, 4);
      box(x + 65, 159, 74, 4, i === 2 ? DARK.secondary : p.secondary, 2);
      box(x + 65, 177, 55, 40, preview.card, 3, preview.border);
      box(x + 129, 177, 56, 40, i === 0 ? DARK.card : preview.card, 3, i === 0 ? DARK.border : preview.border);
      icon(symbol, x + 12, 248, 17, p.secondary); text(label, x + 39, 248, 15, p.text, 500);
      if (i === 1) icon('check', x + 176, 248, 17, p.text);
    }

    box(24, 342, 712, 394, p.card, 16, p.border);
    text('Goal Director', 52, 368, 24, p.text, 500);
    paragraph('Choose who reviews the plan, progress and proof.', 52, 407, 650, 17, p.secondary);
    for (const [i, label] of ['Grok Build', 'Claude', 'Codex'].entries()) {
      const x = 52 + i * 224;
      box(x, 454, 208, 82, i === 2 ? p.muted : p.card, 9, i === 2 ? p.secondary : p.border);
      text(label, x + 14, 469, 18, p.text, 500);
      if (i === 2) icon('check', x + 177, 470, 17, p.text);
      dot(x + 18, 511, p.success, 3); text('CLI found', x + 29, 502, 14, p.secondary);
    }
    line(52, 563, 708, 563, p.border);
    text('Reasoning effort', 52, 591, 17, p.text, 500);
    box(428, 582, 280, 40, p.muted, 8);
    for (const [i, label] of ['Low', 'Medium', 'High'].entries()) {
      const x = 433 + i * 91;
      if (i === 2) box(x, 587, 88, 30, p.card, 5, p.border);
      text(label, x + 16, 593, 14, i === 2 ? p.text : p.secondary, 500);
    }
    line(52, 646, 708, 646, p.border);
    text('Model', 52, 666, 17, p.text, 500);
    text('Leave empty to use your Codex default.', 52, 692, 13, p.secondary);
    box(428, 667, 280, 38, p.card, 7, p.input); text('default', 442, 679, 13, p.secondary, 400, undefined, true);
  });
}

const images = [['board', board], ['director', director], ['settings', settings]];
const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(output, { recursive: true });
for (const [name, render] of images) {
  const bytes = render();
  const destination = path.join(output, `${name}.png`);
  if (check) assert.ok(bytes.equals(fs.readFileSync(destination)), `${name}.png needs regeneration. Run npm run render:readme.`);
  else fs.writeFileSync(destination, bytes);
  console.log(`${check ? 'Verified' : 'Rendered'} ${name}.png · ${(bytes.length / 1024).toFixed(0)} KB`);
}
