// Release helper: copies Electron build output into the Firebase www/updates/
// folder so the next deploy.js run serves them as auto-update files.
//
// Usage (run from the Electron folder after "npm run dist"):
//   node release.js
//
// Then run deploy from the Mobile folder:
//   node deploy.js "C:\path\to\service-account.json" wfsdestrack www

const fs   = require('fs');
const path = require('path');

const DIST_DIR    = path.join(__dirname, 'dist');
const UPDATES_DIR = path.join(__dirname, '..', 'Design Hours Tracker Mobile', 'www', 'updates');

if (!fs.existsSync(DIST_DIR)) {
  console.error('dist/ not found — run "npm run dist" first.');
  process.exit(1);
}

fs.mkdirSync(UPDATES_DIR, { recursive: true });

let copied = 0;
for (const file of fs.readdirSync(DIST_DIR)) {
  // Copy: the installer .exe, .blockmap, and latest.yml
  if (file.endsWith('.exe') || file.endsWith('.blockmap') || file === 'latest.yml') {
    const src = path.join(DIST_DIR, file);
    const dst = path.join(UPDATES_DIR, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dst);
      console.log('Copied:', file);
      copied++;
    }
  }
}

if (copied === 0) {
  console.error('No installer files found in dist/. Did the build succeed?');
  process.exit(1);
}

console.log(`\nDone. Now run deploy.js from the Mobile folder to publish the update.`);
console.log(`  node deploy.js "C:\\path\\to\\service-account.json" wfsdestrack www`);
