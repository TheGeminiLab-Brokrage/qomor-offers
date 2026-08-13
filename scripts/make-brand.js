/* Builds the brand images from the supplied Eliwah logo.
 *
 *   node scripts/make-brand.js
 *
 * Two outputs, both derived from `assets/icons/eliwah-logo.jpg`:
 *
 *   assets/icons/icon-{512,192,180}.png  home-screen icons: the EG monogram,
 *                                        centred on the app's brand gradient
 *   assets/logo-eliwah.png               horizontal lockup (monogram + divider
 *                                        + both wordmarks), WHITE on
 *                                        transparent, for the page header
 *   assets/logo-eliwah-dark.png          the same lockup in brand ink, for the
 *                                        white band on the PDF cover
 *   assets/logo-mark.png                 the monogram alone, white on
 *                                        transparent, for the PDF's 20mm header
 *                                        bar — the full lockup's wordmark is
 *                                        illegible mush at that height, so the
 *                                        bar pairs this with vector type
 *
 * The supplied logo is a 1270x1280 JPEG on a teal gradient, with an ECG line
 * running behind it and "9MC - EMC / NEW CAPITAL - NEW CAIRO" underneath. There
 * is no transparent original, so cropping a rectangle out of it drags the teal
 * background onto whatever it is placed on.
 *
 * Instead: threshold the luminance. The artwork is pure white on a mid-teal
 * ground (luminance ~1.0 against ~0.36) and the ECG line is *darker* than the
 * ground, so a single cut at 0.6 isolates exactly the glyphs and nothing else.
 * The soft band up to 0.85 keeps their antialiased edges.
 *
 * Then measure what was found and lay it out — never trust a hand-guessed crop
 * box, because the measured bounding box is what makes the result centred.
 *
 * Runs in headless Chrome because canvas does the pixel work; the JPEG is
 * inlined as a data: URI so getImageData isn't blocked by the file:// origin.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const SRC = path.join(root, 'assets/icons/eliwah-logo.jpg');
const PAGE = path.join(root, 'raw/brand.html');

/* Search windows in source pixels. Each contains only the artwork wanted, so
 * the measured bounding box can't be polluted by a neighbouring element. */
const WINDOWS = {
  // Monogram alone. Stops short of the divider bar at x~608.
  monogram: { x: 240, y: 380, w: 360, h: 410 },
  // Monogram + divider + Arabic + "ELIWAH GROUP", but above the strapline.
  lockup:   { x: 270, y: 370, w: 745, h: 430 },
};

const ICON_SIZES = [512, 192, 180];
const ICON_BASE = 512;          // CSS-px viewport every icon is rendered in
const GLYPH_FRACTION = 0.58;    // monogram height as a share of the icon
const ART_PAD = 0.04;           // transparent margin, share of output height

/* Transparent artwork to emit: which source window, what ink, how tall.
 * The lockup is drawn twice because it has to sit on both teal and white. */
const ARTWORK = [
  { file: 'assets/logo-eliwah.png',      win: 'lockup',   ink: '#ffffff', h: 260 },
  { file: 'assets/logo-eliwah-dark.png', win: 'lockup',   ink: '#0a3a48', h: 260 },
  { file: 'assets/logo-mark.png',        win: 'monogram', ink: '#ffffff', h: 260 },
];

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome not found — install it or point CHROME at a binary.');

const dataUri = 'data:image/jpeg;base64,' + fs.readFileSync(SRC).toString('base64');

/**
 * The page. `mode` picks the layout; everything else is measured at run time.
 * On a measure pass it reports the bounding box through document.title, which
 * is the one channel --dump-dom will hand back.
 */
function buildPage(mode, ink = '#ffffff', win = 'lockup') {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>pending</title><style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  canvas { display: block; width: 100vw; height: 100vh; }
</style></head>
<body><canvas id="c"></canvas><script>
const MODE = ${JSON.stringify(mode)};
const INK = ${JSON.stringify(ink)};
const WIN = ${JSON.stringify(WINDOWS)};
const WIN_NAME = ${JSON.stringify(win)};
const GLYPH_FRACTION = ${GLYPH_FRACTION};
const ART_PAD = ${ART_PAD};

const inkRgb = [1, 3, 5].map((i) => parseInt(INK.slice(i, i + 2), 16));

/** Threshold a source window to ink-on-transparent and measure what's there. */
function isolate(img, win) {
  const off = document.createElement('canvas');
  off.width = win.w; off.height = win.h;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, win.x, win.y, win.w, win.h, 0, 0, win.w, win.h);
  const data = ctx.getImageData(0, 0, win.w, win.h);
  const d = data.data;

  // White artwork sits at luminance ~1.0, the teal ground at ~0.36, and the ECG
  // line below that. The 0.60-0.85 ramp keeps antialiased edges smooth.
  const LO = 0.60, HI = 0.85;
  let minX = win.w, minY = win.h, maxX = -1, maxY = -1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const a = Math.max(0, Math.min(1, (lum - LO) / (HI - LO)));
    d[i] = inkRgb[0]; d[i + 1] = inkRgb[1]; d[i + 2] = inkRgb[2];
    d[i + 3] = Math.round(a * 255);
    if (a > 0.5) {
      const x = p % win.w, y = (p / win.w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  ctx.putImageData(data, 0, 0);
  return { canvas: off, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const img = new Image();
img.onload = () => {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');

  if (MODE === 'measure') {
    const box = isolate(img, WIN[WIN_NAME]);
    document.title = box ? 'BOX ' + box.w + ' ' + box.h : 'BOX-FAIL';
    return;
  }

  if (MODE === 'icon') {
    const S = Math.min(window.innerWidth, window.innerHeight);
    c.width = c.height = S;
    // Brand gradient, the same ramp as the site header.
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#0a3a48');
    g.addColorStop(0.55, '#0b7e99');
    g.addColorStop(1, '#12a8cb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    const box = isolate(img, WIN.monogram);
    if (!box) { document.title = 'ERROR: no monogram found'; return; }
    const scale = (S * GLYPH_FRACTION) / box.h;
    const dw = box.w * scale, dh = box.h * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(box.canvas, box.x, box.y, box.w, box.h, (S - dw) / 2, (S - dh) / 2, dw, dh);
    document.title = 'icon ' + S;
    return;
  }

  // 'art': transparent, artwork fitted with a small even margin.
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  const box = isolate(img, WIN[WIN_NAME]);
  if (!box) { document.title = 'ERROR: nothing found in ' + WIN_NAME; return; }
  const pad = c.height * ART_PAD;
  const scale = Math.min((c.width - 2 * pad) / box.w, (c.height - 2 * pad) / box.h);
  const dw = box.w * scale, dh = box.h * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(box.canvas, box.x, box.y, box.w, box.h,
    (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  document.title = WIN_NAME + ' ' + c.width + 'x' + c.height;
};
img.src = '${dataUri}';
</script></body></html>`;
}

/** Run Chrome against the page. Returns stdout when `dumpDom` is set. */
function chrome(args, { dumpDom = false } = {}) {
  const base = [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    // Without this the screenshot is composited onto opaque white and the
    // lockup loses its transparency.
    '--default-background-color=00000000',
    '--virtual-time-budget=4000',
  ];
  const out = execFileSync(CHROME, [...base, ...args, `file:///${PAGE.replace(/\\/g, '/')}`],
    { stdio: dumpDom ? ['ignore', 'pipe', 'ignore'] : 'ignore', maxBuffer: 64 * 1024 * 1024 });
  return dumpDom ? String(out) : '';
}

function screenshot(out, w, h, scale = 1) {
  // --screenshot needs an absolute path on Windows or it writes nothing and
  // still exits 0, so always pass one and assert the file afterwards.
  chrome([
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    `--screenshot=${out}`,
  ]);
  if (!fs.existsSync(out)) throw new Error(`Chrome wrote nothing for ${path.basename(out)}`);
  console.log(`wrote ${path.relative(root, out)}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

/* ---- icons ---------------------------------------------------------------
 * Chrome clamps the window below a few hundred pixels wide, so asking for a
 * 180x180 window silently gives a wider viewport and the screenshot captures a
 * zoomed-in corner. Render every size in the same 512 CSS-px viewport and let
 * the device scale factor do the downsampling instead. */
fs.writeFileSync(PAGE, buildPage('icon'));
for (const size of ICON_SIZES) {
  screenshot(path.join(root, `assets/icons/icon-${size}.png`), ICON_BASE, ICON_BASE, size / ICON_BASE);
}

/* ---- transparent artwork ------------------------------------------------
 * Measure each window first: the output has to be the aspect ratio of the
 * artwork, and the only honest source for that is the thresholded bounding box.
 * Measurements are cached because both lockup variants share one window. */
const measured = {};
function measure(win) {
  if (measured[win]) return measured[win];
  fs.writeFileSync(PAGE, buildPage('measure', '#ffffff', win));
  const dom = chrome(['--window-size=800,500', '--dump-dom'], { dumpDom: true });
  const m = /BOX (\d+) (\d+)/.exec(dom);
  if (!m) throw new Error(`could not measure "${win}" — Chrome reported: ${(/<title>([^<]*)/.exec(dom) || [])[1]}`);
  const [, w, h] = m.map(Number);
  console.log(`measured ${win}: ${w}x${h} source px  (aspect ${(w / h).toFixed(3)})`);
  measured[win] = { w, h };
  return measured[win];
}

/* Chrome refuses to open a window narrower than a few hundred pixels: it
 * silently widens the viewport, the canvas lays out at that larger width, and
 * the screenshot then captures a slice of it. The 204px-wide monogram came out
 * as a sliver of the divider bar because of exactly this.
 *
 * So render every piece in a viewport scaled up past that floor and let the
 * device scale factor bring it back down to the size actually wanted. */
const MIN_VIEWPORT = 800;

for (const a of ARTWORK) {
  const box = measure(a.win);
  const outW = Math.round((a.h * box.w) / box.h);
  const k = Math.max(1, Math.ceil(MIN_VIEWPORT / outW), Math.ceil(MIN_VIEWPORT / a.h));
  fs.writeFileSync(PAGE, buildPage('art', a.ink, a.win));
  screenshot(path.join(root, a.file), outW * k, a.h * k, 1 / k);
}

console.log('\nAspect ratios to keep in sync with the code:');
for (const win of ['lockup', 'monogram']) {
  const b = measure(win);
  console.log(`  ${win}: ${(b.w / b.h).toFixed(3)}`);
}
