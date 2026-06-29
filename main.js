const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawn } = require('child_process');

// ── Auto-updater ───────────────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('error', err => {
  console.warn('[updater]', err?.message || err);
  if (mainWindow) mainWindow.webContents.send('update-error', err?.message || String(err));
});

autoUpdater.on('update-downloaded', () => {
  // Notify renderer — more reliable than native dialog which can appear behind the window
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});

// Called from renderer when user clicks "Restart Now"
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: `Design Hours Tracker v${app.getVersion()}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.setMenuBarVisibility(false);

  // Security hardening: never open uncontrolled child windows, and never let the
  // renderer navigate away from the bundled app files. External http(s) links
  // (e.g. the Leaflet/OpenStreetMap attribution) open in the user's real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow = win;
  win.on('closed', () => { mainWindow = null; });
}

// ── Settings persistence ───────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'dht-settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf8');
}

// ── Daily reminder scheduler ───────────────────────────────────────────────
let reminderTimer = null;

function scheduleReminder(timeStr) {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  if (!timeStr) return;

  function fireNext() {
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next - now;
    reminderTimer = setTimeout(() => {
      new Notification({
        title: 'Design Hours Tracker',
        body: "Don't forget to log your hours for today!",
      }).show();
      fireNext();
    }, ms);
  }
  fireNext();
}

app.whenReady().then(() => {
  // Apply saved settings on startup
  const s = loadSettings();
  if (s.autoStart !== undefined) {
    app.setLoginItemSettings({ openAtLogin: !!s.autoStart });
  }
  if (s.reminderTime) scheduleReminder(s.reminderTime);

  createWindow();
  // Check for updates 5s after launch (gives window time to load first)
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Settings
ipcMain.handle('get-version',  () => app.getVersion());
ipcMain.handle('get-settings', () => loadSettings());
let _updateCheckInFlight = false;
ipcMain.handle('check-for-updates', () => {
  if (!app.isPackaged) return 'dev';
  if (_updateCheckInFlight) return 'checking';
  _updateCheckInFlight = true;
  return new Promise(resolve => {
    const done = r => { _updateCheckInFlight = false; resolve(r); };
    autoUpdater.once('update-not-available', () => done('latest'));
    autoUpdater.once('update-available',     () => done('available'));
    autoUpdater.once('error',                () => done('error'));
    const t = setTimeout(() => done('error'), 15000);
    autoUpdater.checkForUpdates().catch(() => { clearTimeout(t); done('error'); });
  });
});

ipcMain.handle('save-settings', (_event, s) => {
  saveSettings(s);
  app.setLoginItemSettings({ openAtLogin: !!s.autoStart });
  scheduleReminder(s.reminderTime || null);
  return { ok: true };
});

// Validate fill-timesheet IPC payload to prevent malformed or oversized data
function validateTimesheetPayload(p) {
  if (!p || typeof p !== 'object') throw new Error('Invalid payload');
  if (typeof p.weekEnding !== 'string' || p.weekEnding.length > 20) throw new Error('Invalid weekEnding');
  if (p.designerName !== undefined && (typeof p.designerName !== 'string' || p.designerName.length > 100)) throw new Error('Invalid designerName');
  if (p.employeeNum  !== undefined && (typeof p.employeeNum  !== 'string' || p.employeeNum.length  > 20))  throw new Error('Invalid employeeNum');
  if (!Array.isArray(p.jobs) || p.jobs.length > 10) throw new Error('Invalid jobs');
  for (const j of p.jobs) {
    if (typeof j.number !== 'string' || typeof j.name !== 'string') throw new Error('Invalid job entry');
    if (j.number.length > 50 || j.name.length > 100) throw new Error('Job field too long');
  }
  if (JSON.stringify(p).length > 512 * 1024) throw new Error('Payload too large');
}

// IPC: Fill timesheet — write payload to temp JSON, invoke PS1, open result
ipcMain.handle('fill-timesheet-pdf', async (_event, payload) => {
  validateTimesheetPayload(payload);
  const ts = Date.now();
  const tmpJson = path.join(os.tmpdir(), `dht-ts-pdf-${ts}.json`);
  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2), 'utf8');

  // Read scripts/assets from __dirname (works inside asar) and write to real temp files
  const srcRoot      = __dirname;
  const tmpPs1       = path.join(os.tmpdir(), `dht-fill-pdf-${ts}.ps1`);
  fs.writeFileSync(tmpPs1, fs.readFileSync(path.join(srcRoot, 'scripts', 'fill-timesheet-pdf.ps1')), 'utf8');

  const assetRoot    = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : __dirname;
  const templatePath = path.join(assetRoot, 'assets', 'Designer Timesheet.xlsx');

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-File', tmpPs1,
      '-JsonPath', tmpJson, '-TemplatePath', templatePath,
    ]);
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      try { fs.unlinkSync(tmpJson); } catch {}
      try { fs.unlinkSync(tmpPs1); } catch {}
      if (code === 0) {
        const match = stdout.match(/Saved: (.+\.pdf)/);
        resolve({ ok: true, savedPath: match ? match[1].trim() : null });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
      }
    });
  });
});

ipcMain.handle('fill-timesheet', async (_event, payload) => {
  validateTimesheetPayload(payload);
  const ts = Date.now();
  const tmpJson = path.join(os.tmpdir(), `dht-timesheet-${ts}.json`);
  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2), 'utf8');

  const srcRoot      = __dirname;
  const tmpPs1       = path.join(os.tmpdir(), `dht-fill-ts-${ts}.ps1`);
  fs.writeFileSync(tmpPs1, fs.readFileSync(path.join(srcRoot, 'scripts', 'fill-timesheet.ps1')), 'utf8');

  const assetRoot    = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : __dirname;
  const templatePath = path.join(assetRoot, 'assets', 'Designer Timesheet.xlsx');

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive',
      '-File', tmpPs1,
      '-JsonPath', tmpJson,
      '-TemplatePath', templatePath,
    ]);

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      try { fs.unlinkSync(tmpJson); } catch {}
      try { fs.unlinkSync(tmpPs1); } catch {}
      if (code === 0) {
        // Extract saved path from script output
        const match = stdout.match(/Saved: (.+\.xlsx)/);
        resolve({ ok: true, savedPath: match ? match[1].trim() : null, output: stdout });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
      }
    });
  });
});
