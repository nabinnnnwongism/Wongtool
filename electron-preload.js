'use strict';
// electron-preload.js
// Bridges a tiny set of system actions from the renderer to the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Fire-and-forget system actions
  ejecutar: (channel, ...args) => {
    const allowed = ['reiniciarSteam', 'window:close', 'window:minimize', 'window:maximize'];
    if (allowed.includes(channel)) ipcRenderer.send(channel, ...args);
  },
  // Async invoke (dialog, etc.)
  ejecutarAsync: (channel, payload) => ipcRenderer.invoke('invoke', channel, payload),
  // Directory picker
  openDirectory: (opts) => ipcRenderer.invoke('dialog:openDirectory', opts),
});
