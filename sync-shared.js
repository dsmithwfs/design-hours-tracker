// sync-shared.js — copy the canonical shared sources into the mobile webapp.
//
// The Electron app (src/) is the single source of truth for the files that are
// identical across desktop and mobile. Platform-specific files (style.css,
// index.html) are intentionally NOT synced — desktop and mobile have different
// layouts. The shared JS is browser-safe: every Electron-only branch is guarded
// behind `window.electronAPI`, so it is inert in the webapp.
//
// Usage (from the Electron folder):  node sync-shared.js
// Run this after editing any shared file, before deploying the webapp.

const fs   = require('fs');
const path = require('path');

const SRC    = path.join(__dirname, 'src');
const MOBILE = path.join(__dirname, '..', 'Design Hours Tracker Mobile', 'www');

// Files that must stay byte-identical between the two apps.
const SHARED = ['app.js', 'calc.js', 'firebase-sync.js', 'firebase-config.js'];

if (!fs.existsSync(MOBILE)) {
  console.error('Mobile www folder not found at:', MOBILE);
  process.exit(1);
}

let copied = 0;
for (const f of SHARED) {
  const from = path.join(SRC, f);
  const to   = path.join(MOBILE, f);
  if (!fs.existsSync(from)) { console.warn('skip (missing):', f); continue; }
  const before = fs.existsSync(to) ? fs.readFileSync(to) : null;
  const after  = fs.readFileSync(from);
  if (before && before.equals(after)) { console.log('unchanged:', f); continue; }
  fs.writeFileSync(to, after);
  console.log('synced:   ', f);
  copied++;
}

console.log(`\nDone. ${copied} file(s) updated in mobile www.`);
console.log('Reminder: bump the SW cache + run the mobile deploy to ship the webapp.');
