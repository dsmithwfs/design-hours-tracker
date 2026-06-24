// Release helper: builds and publishes to GitHub Releases.
// Usage (run from the Electron folder after bumping version in package.json):
//   node release.js
// Or pass the token explicitly:
//   node release.js github_pat_xxxxx

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// Load token from argument, env, or .env file
let token = process.argv[2] || process.env.GH_TOKEN;
if (!token) {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    const match = fs.readFileSync(envFile, 'utf8').match(/^GH_TOKEN=(.+)$/m);
    if (match) token = match[1].trim();
  }
}
if (!token) {
  console.error('No GH_TOKEN found. Add it to .env or pass as argument: node release.js <token>');
  process.exit(1);
}

process.env.GH_TOKEN = token;

console.log('Building and publishing to GitHub Releases…');
execSync('npx electron-builder --win --x64 --publish always', {
  stdio: 'inherit',
  env: process.env,
});
