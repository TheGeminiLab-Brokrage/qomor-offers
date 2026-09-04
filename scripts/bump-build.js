/* Bump the build number everywhere it appears.  node scripts/bump-build.js
 *
 * RUN THIS BEFORE EVERY DEPLOY. The number lives in three places that must
 * agree, and agreeing is not cosmetic:
 *
 *   sw.js          BUILD — names the cache, and stamps the precached shell
 *   index.html     ?v=<build> on every script and stylesheet
 *   js/config.js   telemetry version, so a bad build is identifiable in the data
 *
 * If index.html asks for ?v=34 and sw.js precached ?v=33, the app still works
 * online and silently loses offline support — the precached copies can never be
 * hit, because a cache lookup matches the whole URL including the query. That
 * is exactly the kind of failure nobody notices until an agent is somewhere
 * with no signal, so scripts/test.js asserts all three match on every run.
 *
 * Pass a number to set it explicitly, otherwise the current one is incremented:
 *   node scripts/bump-build.js        -> 33 becomes 34
 *   node scripts/bump-build.js 40     -> sets 40
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const file = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(file(p), 'utf8');

const sw = read('sw.js');
const current = /const BUILD = '(\d+)';/.exec(sw);
if (!current) {
  console.error('sw.js has no `const BUILD = \'…\';` line — cannot bump.');
  process.exit(1);
}

const arg = process.argv[2];
const next = arg ? String(Number(arg)) : String(Number(current[1]) + 1);
if (!/^\d+$/.test(next)) {
  console.error(`"${arg}" is not a build number.`);
  process.exit(1);
}

/* Written back with the SAME encoding they were read in. Do not route these
 * files through anything that re-encodes: js/i18n.js is full of Arabic, and one
 * careless round trip through a Windows codepage has destroyed a dictionary on
 * this machine before. */
const write = (p, text) => fs.writeFileSync(file(p), text, 'utf8');

write('sw.js', sw.replace(/const BUILD = '\d+';/, `const BUILD = '${next}';`));

write('index.html', read('index.html').replace(/\?v=\d+/g, `?v=${next}`));

write('js/config.js', read('js/config.js')
  .replace(/version: 'qomor-offers-v\d+'/, `version: 'qomor-offers-v${next}'`));

console.log(`build ${current[1]} -> ${next}  (sw.js, index.html, js/config.js)`);
