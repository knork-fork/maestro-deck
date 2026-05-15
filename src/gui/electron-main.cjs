'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const iconPath = path.join(__dirname, '..', '..', 'icons', 'icon_full.png');
const preloadPath = path.join(__dirname, 'preload.cjs');

let win = null;

ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win-close',    () => win?.close());

async function createWindow() {
  const { startServer } = await import(`file://${path.join(__dirname, 'server.js')}`);
  const { url, server } = await startServer();

  win = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    icon: iconPath,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: preloadPath,
    },
    show: false,
  });

  await win.loadURL(url);
  win.show();

  win.on('closed', () => {
    win = null;
    server.close();
  });
}

app.whenReady().then(createWindow).catch(err => {
  console.error(err);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
