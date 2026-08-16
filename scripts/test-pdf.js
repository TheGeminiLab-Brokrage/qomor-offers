/* Render a real offer PDF outside the browser, so the export can be checked
 * without clicking through the UI.
 *
 *   node scripts/test-pdf.js                 # first available unit, longest plan
 *   node scripts/test-pdf.js QSP-033 8y
 *   node scripts/test-pdf.js QSE-050         # a clinic, to exercise that page
 *
 * jsPDF is browser-shaped, so this stubs the few DOM bits pdf.js touches:
 * Image (dimensions + data URL), fetch, FileReader, and doc.save.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const isPng = (buf) => buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;

/** Width/height of a JPEG (SOFn marker) or a PNG (IHDR). */
function imageSize(buf) {
  if (isPng(buf)) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

const realFetch = globalThis.fetch;
const g = globalThis;
g.window = g;
g.navigator = { userAgent: 'node', appVersion: '5.0' };
g.document = {
  createElementNS: () => ({ setAttribute() {}, appendChild() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null, setAttribute() {} }),
  documentElement: { style: {} },
};

/* pdf.js reads artwork via fetch -> blob -> FileReader -> data URL, then
 * measures it with an <img>. Stub exactly that chain so this drives the same
 * code path the browser does. Anything absolute goes to the real network,
 * because sheet.js fetches the live inventory through the same global. */
g.fetch = async (p, opts) => {
  if (/^https?:/i.test(String(p))) return realFetch(p, opts);
  const buf = fs.readFileSync(path.join(root, p));
  // The real Blob carries a MIME type and pdf.js uses it to choose the format
  // it hands jsPDF, so the stub has to report one too — the logo is a PNG.
  const type = isPng(buf) ? 'image/png' : 'image/jpeg';
  return { ok: true, status: 200, blob: async () => ({ _buf: buf, type }) };
};
g.FileReader = class {
  readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,` + blob._buf.toString('base64');
    queueMicrotask(() => this.onload && this.onload());
  }
};
g.Image = class {
  set src(v) {
    this._src = v;
    const buf = v.startsWith('data:')
      ? Buffer.from(v.slice(v.indexOf(',') + 1), 'base64')
      : fs.readFileSync(path.join(root, v));
    Object.assign(this, imageSize(buf));
    queueMicrotask(() => this.onload && this.onload());
  }
  get src() { return this._src; }
};

// The UMD build prefers module.exports under Node, so wire it onto the fake
// window that pdf.js reads from. Same for the brand fonts: in the browser
// pdf.js pulls both in with a <script> tag on first use, and finding them
// already on `window` is exactly how it decides not to.
g.jspdf = require(path.join(root, 'vendor/jspdf.umd.min.js'));
g.QOMOR_FONTS = require(path.join(root, 'vendor/fonts.js'));
g.QOMOR_FONTS_AR = require(path.join(root, 'vendor/fonts-ar.js'));

const load = (...files) =>
  files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n')
       .replace(/typeof module !== 'undefined'/g, 'false');

/* js/arabic.js and js/pdf-ar.js are loaded into the same scope as pdf.js, which
 * is how they are loaded in the browser too — pdf.js calls forPdf() and pt() as
 * bare globals rather than importing them, because this codebase has no module
 * system and adding one for two files is not the trade. */
const scope = new Function(`${load('js/arabic.js', 'js/pdf-ar.js', 'js/config.js',
                                   'js/plan.js', 'js/sheet.js', 'js/engine.js', 'js/pdf.js')}
  return { CONFIG, PLANS, MASSING, parseCSV, normalizeRows, buildOfferPDF, offerFilename };`)();

(async () => {
  const { CONFIG } = scope;
  const wantCode = (process.argv[2] || '').toUpperCase();
  const wantPlan = process.argv[3] || CONFIG.plans[CONFIG.plans.length - 1].id;

  /* Every workbook, merged — the third floor lives in its own one, so reading
     only the first would make a TH unit impossible to render here. */
  const units = [], warnings = [];
  for (const source of CONFIG.sheets) {
    const res = await fetch(source.urls[0]);
    const got = scope.normalizeRows(scope.parseCSV(await res.text()));
    units.push(...got.units);
    warnings.push(...got.warnings);
  }
  const available = units.filter((u) => u.state === 'available');
  if (!available.length) throw new Error('no available units in the live sheet');

  const unit = wantCode
    ? units.find((u) => u.code === wantCode)
    : available[0];
  if (!unit) throw new Error(`no unit ${wantCode} in the live sheet`);

  const plan = CONFIG.plans.find((p) => p.id === wantPlan);
  if (!plan) throw new Error(`no plan "${wantPlan}"`);
  const floor = scope.PLANS[unit.floorCode] || { label: unit.floorName };

  /* `ar` as a third argument writes the Arabic offer — the same switch the app
     makes from the language the agent is reading. */
  const language = (process.argv[4] || 'en').toLowerCase();
  const { doc, filename } = await scope.buildOfferPDF(unit, plan, floor, new Date(), language);
  const outDir = path.join(root, 'raw');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, language === 'ar' ? filename.replace(/\.pdf$/, ' AR.pdf') : filename);
  fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));

  console.log(`unit     ${unit.code}  ${unit.type}  ${unit.floorName}  ${unit.area} m²`);
  console.log(`plan     ${plan.label}`);
  console.log(`lang     ${language}`);
  console.log(`pages    ${doc.getNumberOfPages()}`);
  console.log(`wrote    ${path.relative(root, out)}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  if (warnings.length) console.log(`sheet    ${warnings.length} warnings`);
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
