const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fillTimesheet:  payload => ipcRenderer.invoke('fill-timesheet', payload),
  getSettings:    ()      => ipcRenderer.invoke('get-settings'),
  saveSettings:   s       => ipcRenderer.invoke('save-settings', s),
  getVersion:     ()      => ipcRenderer.invoke('get-version'),
});
