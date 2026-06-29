// One-command release for the Electron app.
//
//   node release.js              → patch bump (2.0.8 → 2.0.9)
//   node release.js minor        → minor bump
//   node release.js major        → major bump
//   node release.js --token <t>  → pass the GitHub token explicitly
//
// Steps: sync shared code → bump version → commit → build + publish to
// GitHub Releases (electron-builder) → tag → push commit and tag.
//
// The GitHub token is read from --token, $GH_TOKEN, or a GH_TOKEN= line in
// .env (gitignored). electron-builder uses it to create the release.

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let bump = 'patch';
let token = process.env.GH_TOKEN;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--token') token = args[++i];
  else if (['patch', 'minor', 'major'].includes(args[i])) bump = args[i];
}
if (!token) {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^GH_TOKEN=(.+)$/m);
    if (m) token = m[1].trim();
  }
}
if (!token) {
  console.error('No GitHub token. Add GH_TOKEN to .env or pass --token <token>.');
  process.exit(1);
}

const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, GH_TOKEN: token }, ...opts });

// 1. Keep the mobile webapp's shared files in lock-step with this release.
console.log('→ Syncing shared code to mobile…');
run('node sync-shared.js');

// 2. Bump version (updates package.json + package-lock; no git tag yet).
console.log(`→ Bumping ${bump} version…`);
run(`npm version ${bump} --no-git-tag-version`);
const version = require('./package.json').version;
console.log(`   now v${version}`);

// 3. Commit the bump.
run('git add package.json package-lock.json');
run(`git commit -m "chore: release v${version}"`);

// 4. Build + publish to GitHub Releases.
console.log('→ Building and publishing…');
run('npx electron-builder --win --x64 --publish always');

// 5. Tag and push.
run(`git tag v${version}`);
run('git push origin HEAD --follow-tags');

console.log(`\n✅ Released v${version}. Don't forget to deploy the webapp:  cd "../Design Hours Tracker Mobile" && npm run deploy`);
