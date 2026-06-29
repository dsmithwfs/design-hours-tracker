# Design Hours Tracker

Time, mileage, and expense tracker for Wiginton Corporation designers. Ships as
a **Windows desktop app** (Electron, this repo) and a **mobile web app / PWA**
(the sibling `Design Hours Tracker Mobile` repo). Both share one data model and
sync in real time through Firebase.

---

## Repos & layout

| Path | What it is |
|------|------------|
| `Design Hours Tracker Electron/` | Desktop app (Electron). **Canonical home of the shared code.** |
| `Design Hours Tracker Mobile/`   | PWA deployed to Firebase Hosting + Capacitor Android shell. |

### Shared vs. platform-specific

`app.js`, `calc.js`, `firebase-sync.js`, and `firebase-config.js` are **identical**
in both apps. Edit them only in `Electron/src/`, then run `npm run sync` to copy
them into the mobile `www/`. The shared JS is browser-safe — every desktop-only
branch is guarded behind `window.electronAPI`, so it's inert in the webapp.

`style.css` and `index.html` are **intentionally different** (desktop sidebar
layout vs. mobile layout) and are maintained per app.

`calc.js` holds the pure logic (week math, hour totals, RT/OT split) and is the
only part with unit tests.

---

## Develop

```sh
npm install
npm start          # launch the desktop app
npm test           # run the unit tests (node --test, no deps)
npm run sync       # copy shared files Electron/src → Mobile/www
```

## Release the desktop app

One command — bumps the version, builds, publishes to GitHub Releases, tags,
and pushes:

```sh
node release.js            # patch (2.0.8 → 2.0.9)
node release.js minor      # or minor / major
```

Requires a GitHub token in `.env` as `GH_TOKEN=...` (gitignored), or pass
`--token <t>`. The auto-updater reads `latest.yml` from the published release.

## Deploy the web app

```sh
cd "../Design Hours Tracker Mobile"
npm run deploy             # set DHT_SA to the service-account JSON, or pass it as arg1
```

`deploy.js` regenerates the service worker with a fresh cache (so clients pick
up the update), writes `version.json`, and uploads `www/` to Firebase Hosting
via the service account — no Firebase CLI login needed. Live at
<https://wfsdestrack.web.app>.

---

## Firebase

- Config (`firebase-config.js`) holds the **public** web API key — safe to commit;
  access is enforced by Firestore rules, not key secrecy.
- Security rules live in [`firestore.rules`](firestore.rules) — each user can read/write
  only `users/{uid}/**`. **Verify they're published** (see the file's notes).

## Operational notes / constraints

- **Do not rotate** the GitHub PAT used for releases (stored in `.env`).
- **Do not move** the Firebase service-account JSON from
  `C:\Users\dsmith\Desktop\design-hour-tracker-firebase-adminsdk-fbsvc-8af7073304.json`.
- Local data lives in `localStorage`; Firestore is the durable synced copy.
  Use **Export backup** in-app for a manual snapshot.
