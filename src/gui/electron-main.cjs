'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const iconPath    = path.join(__dirname, '..', '..', 'icons', 'icon_full.png');
const preloadPath = path.join(__dirname, 'preload.cjs');

const SPLASH_W = 1015;
const SPLASH_H = 388;
const SPLASH_MIN_MS = 1000;

let win = null;

ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win-close',    () => win?.close());

async function createWindow() {
  // Show splash immediately.
  const splash = new BrowserWindow({
    width: SPLASH_W,
    height: SPLASH_H,
    frame: false,
    transparent: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    show: false,
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());

  // Start server and prepare main window in parallel with the splash timer.
  const [{ url, server }] = await Promise.all([
    (async () => {
      const { startServer } = await import(`file://${path.join(__dirname, 'server.js')}`);
      return startServer();
    })(),
    new Promise(r => setTimeout(r, SPLASH_MIN_MS)),
  ]);

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

  // Swap: show main window, close splash.
  win.show();
  splash.close();

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
