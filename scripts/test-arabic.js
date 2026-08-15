/* Hold the Arabic shaper to its output, letter by letter.
 *
 *   node scripts/test-arabic.js
 *
 * Run by scripts/test.js, so it fails the suite rather than relying on anyone
 * remembering it.
 *
 * WHY THIS IS WRITTEN THE WAY IT IS
 *
 * The bug this replaces was jsPDF's own Arabic parser silently DROPPING
 * letters — "بيانات الوحدة" printed as "ﺑﻴﺎﻧﺎ ﻟﻮﺣﺪ", three letters short, no
 * error, no warning. Nobody who does not read Arabic would catch it, and the
 * document goes to a customer who does. So the assertions here are of two
 * kinds and both are needed:
 *
 *   1. EXACT expected glyph sequences, hand-checked against the Unicode chart,
 *      for a small set of words chosen to cover every joining behaviour.
 *   2. A ROUND TRIP over every Arabic string the app can print. fromPdf() is
 *      built from the inverse tables rather than from the same logic, so a
 *      string that survives forPdf -> fromPdf unchanged cannot have lost a
 *      letter or had two transposed. This is what catches the drop.
 *
 * The exact tests prove the shaping is RIGHT; the round trip proves nothing was
 * LOST. Either alone would have passed the bug that started this.
 */
const path = require('path');
const root = path.join(__dirname, '..');
const A = require(path.join(root, 'js/arabic.js'));
const { STRINGS, ASSUMPTIONS_AR } = require(path.join(root, 'js/i18n.js'));
const PDF_AR = require(path.join(root, 'js/pdf-ar.js'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, what) {
  if (cond) { pass++; return; }
  fail++; failures.push(what);
}
function eq(actual, expected, what) {
  const good = actual === expected;
  ok(good, good ? what : `${what}\n      expected ${show(expected)}\n      actual   ${show(actual)}`);
}
/* Codepoints, not glyphs: two different presentation forms of the same letter
 * are visually similar and identical in a terminal that cannot render them. */
const show = (s) => Array.from(s).map((c) => {
  const cp = c.codePointAt(0);
  return cp < 0x7f ? c : 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}).join(' ');

const U = (...cps) => String.fromCodePoint(...cps);

/* ---------------------------------------------------------------- shaping -- */

/* One letter alone takes its isolated form. */
eq(A.shapeArabic('ب'), U(0xFE8F), 'a lone beh is isolated');

/* Two dual-joining letters: initial then final. */
eq(A.shapeArabic('بب'), U(0xFE91, 0xFE90), 'beh-beh is initial + final');

/* Three: initial, medial, final — the full set. */
eq(A.shapeArabic('ببب'), U(0xFE91, 0xFE92, 0xFE90), 'beh x3 is initial + medial + final');

/* ALEF is right-joining: it takes a join from behind but does NOT reach
   forward, so the letter after it starts a new joining group. This is the rule
   that makes "بابا" break in the middle, and getting it backwards is the most
   common way to write a shaper that looks almost right. */
eq(A.shapeArabic('باب'), U(0xFE91, 0xFE8E, 0xFE8F),
   'alef takes a final form but does not join forward');

/* ء joins nothing in either direction. */
eq(A.shapeArabic('بءب'), U(0xFE8F, 0xFE80, 0xFE8F), 'hamza is always isolated and breaks the join');

/* LAM + ALEF is a mandatory ligature, and it is one glyph, not two. */
eq(A.shapeArabic('لا'), U(0xFEFB), 'lam-alef is a single isolated ligature');
eq(A.shapeArabic('بلا'), U(0xFE91, 0xFEFC), 'lam-alef takes its final form after a joining letter');
eq(A.shapeArabic('لأ'), U(0xFEF7), 'lam + alef-hamza-above ligates too');

/* A mark must not break the join: "بّب" joins exactly as "بب" does. */
eq(A.shapeArabic('بّب'), U(0xFE91, 0x0651, 0xFE90),
   'a shadda is transparent to joining and keeps its place');

/* The word the original bug mangled, asserted whole — all twelve letters, each
   form checked against the Unicode chart.

   Note how much of it is ISOLATED rather than joined, which is correct and is
   the part people get wrong by eye: بيانات has an alef in the middle, alef does
   not join forward, so the ن after it starts a fresh group and the final ت is
   isolated rather than final. Same again in الوحدة, twice. */
eq(A.shapeArabic('بيانات الوحدة'),
   U(0xFE91,          // ب initial
     0xFEF4,          // ي medial
     0xFE8E,          // ا final       — and joins nothing forward
     0xFEE7,          // ن initial
     0xFE8E,          // ا final
     0xFE95,          // ت ISOLATED, because the alef before it does not reach
     0x0020,
     0xFE8D,          // ا isolated
     0xFEDF,          // ل initial
     0xFEEE,          // و final
     0xFEA3,          // ح initial
     0xFEAA,          // د final
     0xFE93),         // ة isolated
   'the string jsPDF dropped three letters from shapes correctly');

/* Nothing non-Arabic is touched. */
eq(A.shapeArabic('Sky Plaza 39.78 m²'), 'Sky Plaza 39.78 m²', 'Latin passes through shaping untouched');

/* ----------------------------------------------------------------- order --- */

/* Pure Arabic simply reverses (after shaping). */
eq(A.visualOrder('اب'), 'با', 'a pure Arabic run is drawn right to left');

/* A number inside Arabic keeps its own digits in order but sits to the left. */
eq(A.visualOrder('خصم 20'), '20 مصخ', 'digits keep their order inside an Arabic run');

/* The percent sign belongs to the number, not to the Arabic. Without the
   European-terminator rule this comes out "%20", which is the single most
   visible bidi bug there is. */
eq(A.visualOrder('خصم 20%'), '20% مصخ', 'a percent sign stays with its number');

/* Thousands separators must not split a price into three atoms. */
eq(A.visualOrder('السعر 1,404,000'), '1,404,000 رعسلا', 'a grouped number stays whole');

/* A date is one atom: without this it renders "Aug 2026 15". */
eq(A.visualOrder('التسليم 15 Aug 2029'), '15 Aug 2029 ميلستلا', 'a date keeps its internal order');

/* An area, which mixes a decimal and a superscript. */
eq(A.visualOrder('المساحة 39.78 m²'), '39.78 m² ةحاسملا', 'an area keeps its number and unit together');

/* Brackets mirror at an RTL level. */
eq(A.visualOrder('الصيانة (9%)'), '(9%) ةنايصلا', 'brackets mirror so the pair still opens on the right');

/* A bracket pair with a NUMBER on the outside as well as the inside. This is
   the case that broke: the opening bracket had a digit on each side and got
   absorbed into the Latin run, its partner did not, and only one of the two
   was mirrored — the offer printed "(10%(" with two opening brackets. */
eq(A.visualOrder('المدة 20 (10%)'), '(10%) 20 ةدملا',
   'a bracket pair stays a pair when there are digits either side of it');

/* An isolate that leaked in from the screen strings must be dropped, not drawn
   as .notdef — a black box in the middle of a price. */
eq(A.visualOrder('خصم ⁦20%⁩'), '20% مصخ', 'bidi isolates are stripped rather than drawn');

/* ------------------------------------------------- nothing is ever dropped - */

/* Over EVERY Arabic string the document can print, two properties.
 *
 * The first is exact: shaping is a per-character mapping, so unshaping has to
 * give back precisely what went in. This is what catches the bug that started
 * all of this — a letter quietly not making it to the page.
 *
 * The second is a multiset: reordering is a permutation, so the characters that
 * come out have to be the characters that went in, whatever order they end up
 * in. Ordering itself is proved by the exact cases above, not here. */
/* Mirrored brackets are folded together before comparing: a "(" that correctly
 * became ")" is not a lost character, it is the same character facing the other
 * way. Everything else must match exactly. */
const MIRROR_FOLD = { ')': '(', ']': '[', '}': '{', '>': '<', '»': '«', '›': '‹' };
const sortedChars = (s) => Array.from(s).map((c) => MIRROR_FOLD[c] || c).sort().join('');

function survives(label, strings) {
  let dropped = 0, lost = 0;
  for (const s of strings) {
    if (!A.hasArabic(s)) continue;
    /* Placeholders are substituted before the string is ever drawn, so the
       braces are not interesting; the words around them are. */
    const clean = s.replace(/\{(\w+)\}/g, '1');

    const shaped = A.shapeArabic(clean);
    if (A.unshape(shaped) !== clean) {
      dropped++;
      if (dropped === 1) {
        failures.push(`  first shaping loss in ${label}:\n      in   ${show(clean)}\n      out  ${show(A.unshape(shaped))}`);
      }
    }

    const ordered = A.visualOrder(shaped);
    if (sortedChars(ordered) !== sortedChars(shaped)) {
      lost++;
      if (lost === 1) {
        failures.push(`  first ordering loss in ${label}:\n      in   ${show(shaped)}\n      out  ${show(ordered)}`);
      }
    }
  }
  ok(dropped === 0, `${label}: shaping loses nothing — unshape(shape(s)) === s (${dropped} broken)`);
  ok(lost === 0, `${label}: ordering loses nothing — same characters out as in (${lost} broken)`);
}

survives('UI dictionary', Object.values(STRINGS.ar));
survives('footer assumptions', ASSUMPTIONS_AR);
survives('PDF dictionary', PDF_AR.allStrings());

/* Both checks are only worth having if they can actually fail. Damage a string
 * each way and prove each one complains — an oracle that passes everything is
 * the same class of bug as the one this file exists to catch. */
{
  const shaped = A.shapeArabic('بيانات الوحدة');
  const missingLetter = shaped.replace(U(0xFE95), '');            // drop the teh
  ok(A.unshape(missingLetter) !== 'بيانات الوحدة',
     'the shaping check DOES fail when a letter is dropped');
  ok(sortedChars(missingLetter) !== sortedChars(shaped),
     'the ordering check DOES fail when a character goes missing');
}

/* Latin-only strings must come back identical, not merely equivalent — the PDF
 * calls forPdf() on every label in the document, English pages included. */
for (const s of ['Unit QSE-050', '1,404,000 EGP', '15 Aug 2026', 'Sky Plaza', '']) {
  eq(A.forPdf(s), s, `English passes through forPdf untouched: "${s}"`);
}

/* --------------------------------------------------- and what jsPDF does to it */

/* EVERY TEST ABOVE PASSED WHILE THE SHIPPED PDF WAS UNREADABLE, and that is why
 * this section exists. They all stop at forPdf()'s return value. jsPDF then ran
 * two passes of its own over that string and undid it:
 *
 *   preProcessText  -> processArabic() re-joined text that was already joined,
 *      and fused a lam that merely ended up beside an alef into U+FEFB.
 *   postProcessText -> the bidi engine reversed the run a SECOND time, putting
 *      the glyphs back in logical order so every joining form faced away from
 *      its neighbour. That is the whole of "letters are separated not
 *      connected", which was misread as a fault in Amiri and cost a font swap.
 *
 * So this asserts against the PDF BYTES rather than any function's return
 * value: build a one-line document, pull the glyph ids back out of the content
 * stream, and require exactly the glyphs forPdf() asked for, in that order.
 * Nothing jsPDF does to text can hide from that. See disarmJsPdfArabic().
 */
{
  const fs = require('fs');
  const g = globalThis;
  g.window = g;
  g.navigator = { userAgent: 'node', appVersion: '5.0' };
  g.document = {
    createElementNS: () => ({ setAttribute() {}, appendChild() {}, style: {} }),
    createElement: () => ({ style: {}, getContext: () => null, setAttribute() {} }),
    documentElement: { style: {} },
  };
  const mod = require(path.join(root, 'vendor/jspdf.umd.min.js'));
  const jsPDF = (g.jspdf && g.jspdf.jsPDF) || mod.jsPDF || mod;
  const FONTS = require(path.join(root, 'vendor/fonts-ar.js'));

  /* Read the cmap of the shipped subset, so "which glyph did forPdf() ask for"
     comes from the font rather than from an assumption. */
  const buf = fs.readFileSync(path.join(root, 'assets/fonts/Amiri-Regular.ttf'));
  const tbl = {};
  for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) {
    const o = 12 + i * 16;
    tbl[buf.toString('ascii', o, o + 4)] = buf.readUInt32BE(o + 8);
  }
  let sub = 0, subFmt = -1;
  for (let i = 0, n = buf.readUInt16BE(tbl.cmap + 2); i < n; i++) {
    const off = buf.readUInt32BE(tbl.cmap + 4 + i * 8 + 4);
    const fmt = buf.readUInt16BE(tbl.cmap + off);
    if (fmt === 12 || (fmt === 4 && subFmt !== 12)) { sub = tbl.cmap + off; subFmt = fmt; }
  }
  const gidFor = (cp) => {
    if (subFmt === 12) {
      for (let i = 0, n = buf.readUInt32BE(sub + 12); i < n; i++) {
        const r = sub + 16 + i * 12;
        const s = buf.readUInt32BE(r), e = buf.readUInt32BE(r + 4);
        if (cp >= s && cp <= e) return buf.readUInt32BE(r + 8) + (cp - s);
      }
      return 0;
    }
    const segX2 = buf.readUInt16BE(sub + 6);
    for (let i = 0; i < segX2 / 2; i++) {
      if (cp > buf.readUInt16BE(sub + 14 + i * 2)) continue;
      const start = buf.readUInt16BE(sub + 16 + segX2 + i * 2);
      if (cp < start) return 0;
      const delta = buf.readInt16BE(sub + 16 + segX2 * 2 + i * 2);
      const roAt = sub + 16 + segX2 * 3 + i * 2;
      const ro = buf.readUInt16BE(roAt);
      if (ro === 0) return (cp + delta) & 0xffff;
      const gi = buf.readUInt16BE(roAt + ro + (cp - start) * 2);
      return gi ? (gi + delta) & 0xffff : 0;
    }
    return 0;
  };

  /* The same disarming js/pdf.js applies, repeated rather than imported because
     pdf.js is a browser module this harness cannot require. If the two ever
     drift apart, the assertions below are what notices. */
  function disarm(doc) {
    const events = doc.internal && doc.internal.events;
    const topics = (events && events.getTopics && events.getTopics()) || {};
    for (const token of Object.keys(topics.preProcessText || {})) events.unsubscribe(token);
    const parser = jsPDF.API.__arabicParser__;
    if (parser) parser.processArabic = (a) => (typeof a === 'string' ? a : (a && a.text));
    const write = doc.text.bind(doc);
    doc.text = (s, x, y, o) =>
      write(s, x, y, { ...(o || {}), isInputVisual: true, isOutputVisual: true });
  }

  const drawn = (s, mode) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    FONTS.forEach(([file, family, style, b64]) => {
      doc.addFileToVFS(file, b64);
      doc.addFont(file, family, style);
    });
    if (mode !== 'raw') disarm(doc);
    doc.setFont('Amiri', 'normal').setFontSize(12);
    doc.text(A.forPdf(s), 100, 20);
    const bytes = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    const run = (bytes.match(/<([0-9A-Fa-f]{8,})>\s*Tj/) || [])[1] || '';
    return (run.match(/..../g) || []).map((h) => parseInt(h, 16)).join(',');
  };
  const asked = (s) => [...A.forPdf(s)].map((c) => gidFor(c.codePointAt(0))).join(',');

  /* "مدينة" is the sharp case for ORDER: it opens on a meem that must join
     forwards, so a reversed run puts that meem at the wrong end and turns every
     letter in the word the wrong way round. "إجمالي" is the sharp case for the
     LIGATURE: its alef and lam are adjacent only after reordering. */
  for (const s of ['مدينة', 'مدينة بدر القاهرة', 'إجمالي', 'خطة السداد',
                   'وحدة QSE-050', 'خصم 20% من السعر قبل الخصم']) {
    eq(drawn(s), asked(s), `jsPDF draws the glyphs forPdf() asked for: "${s}"`);
  }

  /* And prove the check has teeth — left to itself, jsPDF must break it. */
  ok(drawn('مدينة', 'raw') !== asked('مدينة'),
     'the check DOES fail when jsPDF is left to reprocess the text');

  /* These are the glyphs the 2026-08-15 font swap silently lost: an Arabic
     subset missing them drops every percentage and unit code from the offer. */
  for (const [ch, what] of [['%', 'a percent sign'], ['²', 'a superscript two'],
                            ['Q', 'a Latin capital'], ['-', 'a hyphen']]) {
    ok(gidFor(ch.codePointAt(0)) !== 0, `the Arabic subset can draw ${what} "${ch}"`);
  }

  /* Everything above proves the TECHNIQUE works. It cannot prove the PDF still
     uses it, because pdf.js is a browser module this harness cannot require and
     the disarming had to be repeated above. So read the source: an offer that
     stops calling disarmJsPdfArabic() goes straight back to disconnected
     letters, and that must not be a silent change. */
  const pdfSrc = fs.readFileSync(path.join(root, 'js/pdf.js'), 'utf8');
  ok(/function disarmJsPdfArabic\b/.test(pdfSrc),
     'js/pdf.js still defines disarmJsPdfArabic()');
  ok(/RTL \? disarmJsPdfArabic\(doc\)/.test(pdfSrc),
     'js/pdf.js still calls disarmJsPdfArabic() for an Arabic offer');
  ok(/isOutputVisual: true/.test(pdfSrc),
     'js/pdf.js still declares the output visual, so bidi cannot reverse the run');
}

/* ------------------------------------------------------------------ report  */

if (fail) {
  console.error(`arabic: ${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.error('  ✗ ' + f));
  process.exitCode = 1;
} else {
  console.log(`arabic: ${pass} passed — shaping exact, ordering exact, round trip clean`);
}

module.exports = { pass, fail, failures };
