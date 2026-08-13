/* Draws the clinic pins (and, where they exist, the traced room polygons) onto
 * the floor-plan render so placement can be checked by eye.
 *
 *   node scripts/verify-plan.js emc   ->  raw/verify-emc.png   (from raw/map.png)
 *   node scripts/verify-plan.js mc9   ->  raw/verify-mc9.png   (from raw/map9.png)
 */
const fs = require('fs');
const path = require('path');
const png = require('./png');

const key = (process.argv[2] || 'emc').toLowerCase();
const SOURCES = { emc: 'raw/map.png', mc9: 'raw/map9.png' };
if (!SOURCES[key]) { console.error(`unknown plan "${key}" — use emc or mc9`); process.exit(1); }

const root = path.join(__dirname, '..');
const src = path.join(root, SOURCES[key]);
if (!fs.existsSync(src)) {
  console.error(`missing ${SOURCES[key]} — regenerate it with pdftoppm (see README)`);
  process.exit(1);
}

const scope = new Function(`${fs.readFileSync(path.join(root, 'js/plan.js'), 'utf8')}; return PLANS;`)();
const plan = scope[key];

const img = png.decode(src);
const { w: W, h: H, ch } = img;

// The render and the reference space can differ in scale; map between them.
const sx = W / plan.refW, sy = H / plan.refH;

const put = (x, y, [r, g, b], a = 1) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * ch;
  img.data[i] = img.data[i] * (1 - a) + r * a;
  img.data[i + 1] = img.data[i + 1] * (1 - a) + g * a;
  img.data[i + 2] = img.data[i + 2] * (1 - a) + b * a;
};

const line = (x0, y0, x1, y1, colour) => {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    for (let d = -1; d <= 1; d++) put(x + d, y, colour), put(x, y + d, colour);
  }
};

const disc = (cx, cy, r, colour, ring) => {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d <= r - 2) put(cx + x, cy + y, colour, 0.85);
      else if (d <= r) put(cx + x, cy + y, ring);
    }
  }
};

const GLYPHS = {
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 1, 1], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7],
};
const text = (s, x, y, scale, colour) => {
  let cx = x;
  for (const chr of s) {
    const g = GLYPHS[chr];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (!(g[r] & (1 << (2 - c)))) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        put(cx + c * scale + dx, y + r * scale + dy, colour);
      }
    }
    cx += 4 * scale;
  }
};

const GREEN = [26, 150, 96], WHITE = [255, 255, 255], RED = [220, 30, 40];

if (plan.polygons) {
  for (const pts of Object.values(plan.polygons)) {
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      line(ax * sx, ay * sy, bx * sx, by * sy, RED);
    }
  }
}

const r = Math.round(Math.max(11, 0.014 * W));
for (const [n, pin] of Object.entries(plan.pins)) {
  const cx = Math.round(pin.x * sx), cy = Math.round(pin.y * sy);
  disc(cx, cy, r, GREEN, WHITE);
  const scale = Math.max(2, Math.round(r / 5));
  const tw = String(n).length * 4 * scale, th = 5 * scale;
  text(String(n), Math.round(cx - tw / 2) + 1, Math.round(cy - th / 2), scale, WHITE);
}

const out = path.join(root, `raw/verify-${key}.png`);
png.encode(img, out);
console.log(`drew ${Object.keys(plan.pins).length} pins -> raw/verify-${key}.png`);
