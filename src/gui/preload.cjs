'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),
});

window.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.src = '/titlebar.js';
  document.head.appendChild(script);
});
