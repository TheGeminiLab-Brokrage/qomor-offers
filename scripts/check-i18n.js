/* Check the two dictionaries against what the app actually asks for.
 *
 *   node scripts/check-i18n.js
 *
 * A missing translation key is the characteristic bug of a bilingual UI, and it
 * is close to invisible: t() falls back to English, or to the key itself, so a
 * screen reading "pay.delivery" ships unless somebody happens to look at that
 * exact panel in that exact language. This reads every key the code and the
 * markup use and every key the dictionaries define, and reports the gaps in
 * both directions.
 *
 * Run by scripts/test.js, so it fails the suite rather than relying on anyone
 * remembering to run it.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const i18n = read('js/i18n.js');

/** The keys each language actually defines. */
function keysOf(lang) {
  const start = i18n.indexOf(`  ${lang}: {`);
  if (start < 0) throw new Error(`no "${lang}" table in js/i18n.js`);
  // The table ends at the first line that closes it at two-space indentation.
  const end = i18n.indexOf('\n  },', start);
  const body = i18n.slice(start, end);
  return new Set([...body.matchAll(/^\s*'([\w.-]+)':/gm)].map((m) => m[1]));
}

const en = keysOf('en');
const ar = keysOf('ar');

/* Keys the app asks for: any dotted quoted literal in the scripts, plus
 * data-i18n in the markup.
 *
 * Matching only `t('x'` was the first version and it under-reported: half the
 * calls are `t(n === 1 ? 'ago.min' : 'ago.mins', …)`, where the key is not
 * adjacent to the paren, and those keys were then reported as dead. Matching
 * every dotted literal over-reaches slightly in the other direction, which is
 * the safe way round — a key wrongly believed to be in use is a tidiness
 * problem; one wrongly believed dead invites someone to delete it. */
const used = new Set();
for (const f of ['js/app.js', 'js/i18n.js']) {
  for (const m of read(f).matchAll(/'([a-z][\w-]*(?:\.[\w-]+)+)'/g)) used.add(m[1]);
}
const html = read('index.html');
for (const m of html.matchAll(/data-i18n="([\w.-]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
  for (const pair of m[1].split(',')) {
    const key = pair.split(':')[1];
    if (key) used.add(key.trim());
  }
}

/* Keys reached only through a helper, never written as a literal at a call
 * site. Listed explicitly so the check does not report them as dead. */
const INDIRECT = ['dir', 'lang.en', 'lang.ar'];
INDIRECT.forEach((k) => used.add(k));

/* Dotted literals that are NOT translation keys. The broad scan above picks up
 * anything shaped like a key, which includes the localStorage name. */
['qomor.lang'].forEach((k) => used.delete(k));

const problems = [];
for (const k of used) {
  if (!en.has(k)) problems.push(`used but missing from EN: ${k}`);
  if (!ar.has(k)) problems.push(`used but missing from AR: ${k}`);
}
for (const k of en) if (!ar.has(k)) problems.push(`in EN but not AR: ${k}`);
for (const k of ar) if (!en.has(k)) problems.push(`in AR but not EN: ${k}`);
for (const k of en) if (!used.has(k)) problems.push(`defined but never used: ${k}`);

/* Arabic may use FEWER placeholders than English, but never a different one.
 *
 * Fewer is legitimate and common: English needs "{n} minute ago" to carry the
 * number, Arabic says "منذ دقيقة" and the singular is in the word itself.
 * Requiring an exact match flagged three correct translations. What is never
 * legitimate is Arabic naming a placeholder English does not, because the call
 * site was written against the English string and will not supply it — so it
 * would print the literal "{n}" on screen. */
function placeholders(lang, key) {
  const start = i18n.indexOf(`  ${lang}: {`);
  const end = i18n.indexOf('\n  },', start);
  const line = i18n.slice(start, end).match(new RegExp(`^\\s*'${key.replace(/\./g, '\\.')}':\\s*(.*)$`, 'm'));
  if (!line) return null;
  return [...line[1].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
for (const k of en) {
  if (!ar.has(k)) continue;
  const inEn = new Set(placeholders('en', k) || []);
  const extra = (placeholders('ar', k) || []).filter((p) => !inEn.has(p));
  if (extra.length) {
    problems.push(`AR uses a placeholder EN does not, so it will print literally — ${k}: {${extra.join('}, {')}}`);
  }
}

/* The assumptions are a list, not a key/value table, so they are held to each
 * other by COUNT. Getting this wrong is silent in the app — tAssumptions()
 * falls back to the whole English list, which looks like the translation was
 * never done rather than like a list that drifted out of step.
 *
 * REQUIRED, not scraped. Both lists used to be counted by a regex over the
 * source, and on 2026-08-18 ASSUMPTIONS stopped being an array literal — it is
 * derived from ASSUMPTION_ORDER over ASSUMPTION_TEXT now, so the pattern
 * matched nothing and threw. That took the whole suite down with it, because
 * test.js runs this file. Loading the modules cannot drift from the way they
 * are actually built. */
const { ASSUMPTIONS, ASSUMPTION_TEXT, ASSUMPTION_ORDER, TERMS_ORDER } = require('../js/config.js');
const { ASSUMPTIONS_AR } = require('../js/i18n.js');
const nEn = ASSUMPTIONS.length;
const nAr = ASSUMPTIONS_AR.length;

/* ASSUMPTION_ORDER is the only thing that decides what prints. A key in it with
 * no sentence behind it yields undefined, which reaches the page as the word
 * "undefined" rather than as a blank someone would catch in review. */
for (const key of ASSUMPTION_ORDER) {
  if (!ASSUMPTION_TEXT[key]) {
    problems.push(`ASSUMPTION_ORDER names "${key}", which ASSUMPTION_TEXT does not define`);
  }
}

/* The customer's terms page, in Arabic. pt() returns the KEY when it misses, so
 * an untranslated term prints the literal "terms.noFees" on a page the customer
 * reads. Nothing else checks pdf-ar.js against the list that drives the page. */
const { PDF_STRINGS } = require('../js/pdf-ar.js');
const termKeys = [
  ...TERMS_ORDER.map((k) => `terms.${k}`),
  'page.terms', 'terms.title', 'terms.avail', 'terms.availBody',
  'terms.credits', 'terms.partners', 'terms.and',
];
for (const key of termKeys) {
  if (PDF_STRINGS[key] === undefined) {
    problems.push(`the terms page asks for ${key}, which pdf-ar.js does not define`);
  }
}
if (nEn !== nAr) {
  problems.push(`ASSUMPTIONS has ${nEn} entries but ASSUMPTIONS_AR has ${nAr} — `
    + 'the Arabic footer falls back to English entirely until they match');
}

if (problems.length) {
  console.error(`i18n: ${problems.length} problem(s)`);
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exitCode = 1;
} else {
  console.log(`i18n: ${en.size} keys, EN and AR in step, all used, placeholders match, `
    + `${nEn} assumptions both sides`);
}

module.exports = { problems };
