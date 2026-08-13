/* Read floor-plan unit pins off the drawings.
 *
 * The drawings have no text layer, but the exported PNGs do not need one. Every
 * unit is labelled with a large, horizontal, zero-padded 3-digit number ("018"),
 * and every other annotation is either much smaller ("AREA : 22.50 M2") or
 * carries a decimal point ("208.00"). Font height alone separates them, so the
 * labels can be read straight off the raster and the pin is the label's centre.
 *
 * Run tile-ocr.ps1 first to produce tiles-<FLOOR>/, then:
 *
 *   node scripts/pins/pins.js Q            # assemble building Q on every floor
 *   node scripts/pins/pins.js Q SP         # one floor
 *   node scripts/pins/pins.js --clusters SP  # inspect raw clusters
 *
 * A building is only accepted when its clusters' numbers are exactly 1..N with
 * no duplicates, N being the count the LIVE SHEET reports for that building and
 * floor. Short of that it reports the gaps — it never fills them in.
 */
const fs = require('fs');
const path = require('path');

const W = 4967, H = 3509;   // native drawing size, all three are identical

/** Unit counts per building per drawing, from the live inventory. */
const EXPECTED = {
  SP:   { Q: 65, M: 32, O: 30, R: 50 },
  FT:   { Q: 64, M: 29, O: 29, R: 49 },
  SETH: { Q: 78, M: 27, O: 28, R: 49 },
};

/* Labels the tiled pass missed, recovered with zone-ocr.ps1 at 4x. Read values,
 * not guesses: each returned conf >= 96 on a y matching its row neighbours. */
const RECOVERED = {
  FT: { Q: { 55: [0.3107, 0.2801], 15: [0.3677, 0.6074] } },
};

function tileTokens(dir) {
  // PowerShell 5.1 Out-File -Encoding utf8 always writes a BOM.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''),
  );
  const out = [];
  for (const t of manifest) {
    const f = path.join(dir, t.name + '.tsv');
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean);
    const head = lines[0].split('\t');
    const ix = (n) => head.indexOf(n);
    const I = { left: ix('left'), top: ix('top'), width: ix('width'),
                height: ix('height'), conf: ix('conf'), text: ix('text') };
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split('\t');
      const text = (c[I.text] || '').trim();
      if (!text) continue;
      const h = +c[I.height];
      out.push({
        text, h: h / t.zoom, conf: +c[I.conf],
        x: (t.x0 + (+c[I.left] + +c[I.width] / 2) / t.zoom) / W,
        y: (t.y0 + (+c[I.top] + h / 2) / t.zoom) / H,
      });
    }
  }
  return out;
}

/** Big 3-digit labels, deduped across tile overlaps. */
function unitLabels(dir, minH = 9, maxH = 15) {
  const toks = tileTokens(dir)
    .filter((t) => /^\d{3}$/.test(t.text) && t.h >= minH && t.h <= maxH)
    .sort((a, b) => b.conf - a.conf);
  const kept = [];
  for (const t of toks) {
    const dup = kept.find(
      (k) => k.text === t.text && Math.hypot(k.x - t.x, (k.y - t.y) * (H / W)) < 0.012,
    );
    if (!dup) kept.push(t);
  }
  return kept.map((t) => ({ num: Number(t.text), conf: t.conf, x: t.x, y: t.y }));
}

/** Single-link clustering; eps is normalised on drawing width. */
function cluster(pts, eps = 0.035) {
  const parent = pts.map((_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dy = (pts[i].y - pts[j].y) * (H / W);   // isotropic on the page
      if (Math.hypot(pts[i].x - pts[j].x, dy) <= eps) {
        const ra = find(i), rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }
  const groups = new Map();
  pts.forEach((p, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(p);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function describe(g) {
  const nums = g.map((p) => p.num).sort((a, b) => a - b);
  const xs = g.map((p) => p.x), ys = g.map((p) => p.y);
  return { n: g.length, uniq: new Set(nums).size, min: nums[0], max: nums[nums.length - 1],
           x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
           nums: [...new Set(nums)] };
}

/**
 * Grow a building from its leftmost cluster, taking only clusters whose numbers
 * stay disjoint and in range. Q is the leftmost block on all three drawings,
 * which is what makes leftmost-first the right seed; a building that is not
 * leftmost needs its own seed rule, so check the --clusters output first.
 */
function assemble(dir, drawing, building) {
  const want = EXPECTED[drawing][building];
  const pts = unitLabels(dir).filter((p) => p.num >= 1 && p.num <= want);
  const groups = cluster(pts).map((g) => ({ g, d: describe(g) })).sort((a, b) => a.d.x0 - b.d.x0);

  const taken = [], seen = new Set();
  for (const { g } of groups) {
    if (taken.length >= want) break;
    const nums = g.map((p) => p.num);
    if (nums.some((n) => seen.has(n))) continue;          // overlap -> other building
    if (new Set(nums).size !== nums.length) continue;     // internal dupe -> merged blocks
    nums.forEach((n) => seen.add(n));
    taken.push(...g);
  }

  const rec = (RECOVERED[drawing] || {})[building] || {};
  for (const [n, xy] of Object.entries(rec)) {
    if (seen.has(Number(n))) continue;
    taken.push({ num: Number(n), x: xy[0], y: xy[1], conf: 96, recovered: true });
    seen.add(Number(n));
  }

  const missing = [];
  for (let n = 1; n <= want; n++) if (!seen.has(n)) missing.push(n);
  return { pins: taken.sort((a, b) => a.num - b.num), want, missing };
}

module.exports = { W, H, EXPECTED, tileTokens, unitLabels, cluster, describe, assemble };

if (require.main === module) {
  const args = process.argv.slice(2);
  const base = path.join(__dirname, '..', '..');
  const dirFor = (d) => path.join(base, 'scripts', 'pins', 'tiles-' + d);

  if (args[0] === '--clusters') {
    const d = args[1] || 'SP';
    for (const c of cluster(unitLabels(dirFor(d)))) {
      const k = describe(c);
      console.log(`n=${String(k.n).padEnd(3)} rng=${String(k.min + '-' + k.max).padEnd(8)}` +
                  ` x ${k.x0.toFixed(3)}-${k.x1.toFixed(3)}  y ${k.y0.toFixed(3)}-${k.y1.toFixed(3)}`);
    }
    return;
  }

  const building = args[0] || 'Q';
  const drawings = args[1] ? [args[1]] : ['SP', 'FT', 'SETH'];
  const floorOf = { SP: 'SP', FT: 'FT', SETH: 'SE' };
  const out = {};
  let bad = 0;
  for (const d of drawings) {
    const r = assemble(dirFor(d), d, building);
    const ok = r.missing.length === 0;
    if (!ok) bad++;
    console.log(`${building}${floorOf[d]}: ${r.pins.length}/${r.want}  ` +
                (ok ? 'COMPLETE' : `MISSING ${r.missing.join(',')}`));
    const low = r.pins.filter((p) => p.conf < 80);
    if (low.length) console.log(`   low confidence: ${low.map((p) => `${p.num}(${Math.round(p.conf)})`).join(' ')}`);
    out[floorOf[d]] = r.pins.map((p) => ({ num: p.num, x: +p.x.toFixed(4), y: +p.y.toFixed(4), conf: Math.round(p.conf) }));
  }
  const dest = path.join(__dirname, `${building}-pins.json`);
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${dest}`);
  if (bad) console.log('NOT complete — do not paste into js/plan.js until the gaps are resolved.');
}
