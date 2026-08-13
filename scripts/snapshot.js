/* Bakes each live project's sheet into js/data.js as an offline fallback.
 *
 * The app always prefers the live sheet; a snapshot only appears if that sheet
 * is unreachable (no signal in a meeting room, sheet unpublished by accident),
 * and the UI labels it as stale when it does.
 *
 * Snapshots are keyed by project id so one project can never be served another
 * project's inventory.
 *
 * Run: node scripts/snapshot.js
 */
const fs = require('fs');
const path = require('path');

// config.js is browser-shaped; give it a module scope to read PROJECTS out of.
const src = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
const { PROJECTS } = new Function(`${src}; return { PROJECTS };`)();

async function fetchSheet(project) {
  for (const url of project.sheetUrls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { console.warn(`  ${project.id}: ${res.status} from ${url}`); continue; }
      const text = await res.text();
      if (/^\s*</.test(text)) { console.warn(`  ${project.id}: got HTML (sheet not published?)`); continue; }
      return { csv: text, from: url };
    } catch (err) { console.warn(`  ${project.id}: ${err.message}`); }
  }
  return null;
}

(async () => {
  const live = PROJECTS.filter((p) => p.live && p.sheetId);
  const out = {};
  let failed = 0;

  for (const project of live) {
    const got = await fetchSheet(project);
    if (!got) { console.error(`  ${project.id}: could not reach the sheet — keeping any existing snapshot`); failed++; continue; }
    out[project.id] = {
      takenAt: new Date().toISOString(),
      rows: got.csv.trim().split('\n').length - 1,
      from: got.from,
      csv: got.csv,
    };
    console.log(`  ${project.id}: ${out[project.id].rows} rows`);
  }

  if (!Object.keys(out).length) {
    console.error('No sheets reachable — js/data.js left alone.');
    process.exit(1);
  }

  // Preserve snapshots for any project we could not reach this run.
  const dataPath = path.join(__dirname, '../js/data.js');
  if (fs.existsSync(dataPath)) {
    try {
      const prev = new Function(`${fs.readFileSync(dataPath, 'utf8')}; return typeof SNAPSHOTS === 'undefined' ? {} : SNAPSHOTS;`)();
      for (const [id, snap] of Object.entries(prev)) if (!out[id]) out[id] = snap;
    } catch { /* previous file unreadable — start fresh */ }
  }

  const body = Object.entries(out)
    .map(([id, s]) => `  ${JSON.stringify(id)}: {\n    takenAt: ${JSON.stringify(s.takenAt)},\n    rows: ${s.rows},\n    csv: ${JSON.stringify(s.csv)},\n  },`)
    .join('\n');

  fs.writeFileSync(dataPath, `/* Offline fallback snapshots of the inventory sheets, keyed by project id.
 *
 * GENERATED — do not edit by hand. Run \`node scripts/snapshot.js\` to refresh.
 * Written: ${new Date().toISOString()}
 *
 * The app uses the LIVE sheet whenever it can reach it. These are only shown
 * when the fetch fails, and the UI marks them as out of date when that happens.
 */
const SNAPSHOTS = {
${body}
};

if (typeof module !== 'undefined') module.exports = { SNAPSHOTS };
`);

  console.log(`Snapshot written for ${Object.keys(out).length} project(s)${failed ? ` (${failed} unreachable)` : ''}`);
})();
