const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawn } = require('child_process');

// ── Auto-updater ───────────────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('error', () => {}); // silently ignore network/offline errors

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version of Design Hours Tracker has been downloaded.',
    detail: 'Restart now to apply the update, or it will install automatically on next launch.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

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

ipcMain.handle('save-settings', (_event, s) => {
  saveSettings(s);
  app.setLoginItemSettings({ openAtLogin: !!s.autoStart });
  scheduleReminder(s.reminderTime || null);
  return { ok: true };
});

// IPC: Fill timesheet — write payload to temp JSON, invoke PS1, open result
ipcMain.handle('fill-timesheet', async (_event, payload) => {
  const tmpJson = path.join(os.tmpdir(), `dht-timesheet-${Date.now()}.json`);
  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2), 'utf8');

  const root         = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : __dirname;
  const ps1          = path.join(root, 'scripts', 'fill-timesheet.ps1');
  const templatePath = path.join(root, 'assets', 'Designer Timesheet.xlsx');

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-NonInteractive',
      '-File', ps1,
      '-JsonPath', tmpJson,
      '-TemplatePath', templatePath,
    ]);

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      try { fs.unlinkSync(tmpJson); } catch {}
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
