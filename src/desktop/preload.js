import { contextBridge, ipcRenderer } from 'electron';

// Expose safe desktop integration APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Native folder selection dialog
  selectDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),

  // Open URL safely in system's default browser
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Send native desktop notification
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),

  // Get system & desktop app info
  getSystemInfo: () => ipcRenderer.invoke('app:getSystemInfo'),

  // Listen for project folder passed from native OS menu or second instance
  onProjectSelected: (callback) => {
    ipcRenderer.on('project:selected', (_event, projectPath) => callback(projectPath));
  },

  // Window control (if custom titlebar used)
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close')
});
