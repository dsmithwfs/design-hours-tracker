const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fillTimesheet:    payload => ipcRenderer.invoke('fill-timesheet', payload),
  fillTimesheetPdf: payload => ipcRenderer.invoke('fill-timesheet-pdf', payload),
  getSettings:    ()      => ipcRenderer.invoke('get-settings'),
  saveSettings:   s       => ipcRenderer.invoke('save-settings', s),
  getVersion:     ()      => ipcRenderer.invoke('get-version'),
  checkForUpdates:    ()   => ipcRenderer.invoke('check-for-updates'),
  installUpdate:      ()   => ipcRenderer.invoke('install-update'),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', cb),
  onUpdateError:      (cb) => ipcRenderer.on('update-error', (_e, msg) => cb(msg)),
});
