/* Bakes the live inventory into js/data.js as an offline fallback.
 *
 * The app always prefers the live sheet. A snapshot only appears when that
 * sheet cannot be reached — no signal in a meeting room, Google stalling, the
 * sheet unpublished by accident — and the UI labels it stale when it does.
 *
 * THIS SCRIPT WAS COPIED FROM THE ELIWAH BUILD AND NEVER ADAPTED, so it had
 * never once worked here (found 2026-08-23). It read a `PROJECTS` array with a
 * `sheetUrls` field, which is the Eliwah config's shape; this app has a single
 * `CONFIG` carrying a `sheets` ARRAY of workbooks. `PROJECTS` was undefined,
 * the script threw immediately, and js/data.js was never written — which is why
 * this app had no offline copy at all and showed nothing at all when the sheet
 * could not be reached.
 *
 * TWO WORKBOOKS, KEPT SEPARATE. The project inventory and the third floor are
 * different files with their own header rows, so they are stored as separate
 * CSVs rather than glued together. Concatenating them would corrupt both the
 * moment the client changes a column in one.
 *
 * Run: node scripts/snapshot.js
 */
const fs = require('fs');
const path = require('path');

// config.js is browser-shaped; give it a module scope to read CONFIG out of.
const src = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
const { CONFIG } = new Function(`${src}; return { CONFIG };`)();

const TIMEOUT_MS = 30000;   // generous: a build step, not an agent waiting

async function fetchOne(source) {
  for (const url of source.urls) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) { console.warn(`  ${source.key}: ${res.status} from ${url}`); continue; }
      const text = await res.text();
      if (/^\s*</.test(text)) { console.warn(`  ${source.key}: got HTML (sheet not published?)`); continue; }
      return { csv: text, from: url };
    } catch (err) {
      console.warn(`  ${source.key}: ${err.name === 'TimeoutError'
        ? `no answer within ${TIMEOUT_MS / 1000}s` : err.message}`);
    }
  }
  return null;
}

(async () => {
  const sources = CONFIG.sheets || [];
  console.log(`Snapshotting ${CONFIG.name} — ${sources.length} workbook(s)`);

  const sheets = [];
  for (const source of sources) {
    const got = await fetchOne(source);
    if (!got) {
      /* A PARTIAL SNAPSHOT IS WORSE THAN NONE. With the third-floor workbook
         missing, the saved copy would open looking perfectly healthy with the
         entire third floor absent, and an agent would tell a customer it was
         gone. Refuse to write rather than bake that in. */
      console.error(`\nCould not reach ${source.label}. js/data.js left alone —`);
      console.error('a snapshot missing one workbook would read as a sold-out floor.');
      process.exit(1);
    }
    const rows = got.csv.trim().split('\n').length - 1;
    console.log(`  ${source.key}: ${rows} rows`);
    sheets.push({ key: source.key, label: source.label, rows, csv: got.csv });
  }

  const takenAt = new Date().toISOString();
  const body = sheets.map((s) => `      {
        key: ${JSON.stringify(s.key)},
        label: ${JSON.stringify(s.label)},
        rows: ${s.rows},
        csv: ${JSON.stringify(s.csv)},
      },`).join('\n');

  const out = `/* Offline fallback snapshot of the inventory, keyed by project id.
 *
 * GENERATED — do not edit by hand. Run \`node scripts/snapshot.js\` to refresh.
 * Written: ${takenAt}
 *
 * The app uses the LIVE sheet whenever it can reach it. This is shown only when
 * every URL for a workbook has failed or timed out, and the UI marks it stale so
 * nobody quotes from it believing it is current.
 *
 * Keyed by project id so one project can never be shown another's units. Held
 * as one entry PER WORKBOOK rather than one glued CSV: the two files have their
 * own header rows and merging them would corrupt both.
 */
const SNAPSHOTS = {
  ${JSON.stringify(CONFIG.id)}: {
    takenAt: ${JSON.stringify(takenAt)},
    sheets: [
${body}
    ],
  },
};

if (typeof module !== 'undefined') module.exports = { SNAPSHOTS };
`;

  fs.writeFileSync(path.join(__dirname, '../js/data.js'), out, 'utf8');
  const kb = Math.round(Buffer.byteLength(out) / 1024);
  console.log(`\nWrote js/data.js — ${sheets.reduce((n, s) => n + s.rows, 0)} rows, ${kb} KB`);
})();
