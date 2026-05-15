'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { homedir } = require('os');

const iconPath    = path.join(__dirname, '..', '..', 'icons', 'icon_full.png');
const preloadPath = path.join(__dirname, 'preload.cjs');

const CONFIG_DIR    = path.join(homedir(), '.maestro-deck');
const RESOURCES_DIR = path.join(CONFIG_DIR, 'resources');
const PREFS_FILE    = path.join(RESOURCES_DIR, 'preferences.json');

const SPLASH_W      = 1015;
const SPLASH_H      = 388;
const SPLASH_MIN_MS = 1000;

let win               = null;
let baseUrl           = null;
let currentFolderPath = null;

function ensureResourcesDir() {
  if (!existsSync(RESOURCES_DIR)) mkdirSync(RESOURCES_DIR, { recursive: true });
}

function readPreferences() {
  try {
    if (existsSync(PREFS_FILE)) return JSON.parse(readFileSync(PREFS_FILE, 'utf8'));
  } catch {}
  return {};
}

function savePreferences(prefs) {
  ensureResourcesDir();
  const existing = readPreferences();
  writeFileSync(PREFS_FILE, JSON.stringify({ ...existing, ...prefs }, null, 2));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win-close',    () => win?.close());

ipcMain.on('open-main', (event, { path: folderPath }) => {
  if (!win || !baseUrl) return;
  const prefs = readPreferences();
  currentFolderPath = folderPath;
  win.loadURL(`${baseUrl}/main?path=${encodeURIComponent(folderPath)}`);
  const goMaximized = prefs.maximized ?? true;
  if (goMaximized) {
    win.maximize();
  } else {
    if (win.isMaximized()) win.unmaximize();
    if (prefs.width && prefs.height) win.setSize(prefs.width, prefs.height);
  }
});

ipcMain.on('close-folder', () => {
  if (!win || !baseUrl) return;
  currentFolderPath = null;
  win.loadURL(baseUrl + '/');
});

async function createWindow() {
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

  const [{ url, server }] = await Promise.all([
    (async () => {
      const { startServer } = await import(`file://${path.join(__dirname, 'server.js')}`);
      return startServer();
    })(),
    new Promise(r => setTimeout(r, SPLASH_MIN_MS)),
  ]);

  baseUrl = url;

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

  const saveSizeDebounced = debounce(() => {
    if (currentFolderPath && !win.isMaximized()) {
      const [w, h] = win.getSize();
      savePreferences({ maximized: false, width: w, height: h });
    }
  }, 500);

  win.on('resize', saveSizeDebounced);
  win.on('maximize', () => {
    if (currentFolderPath) savePreferences({ maximized: true });
  });
  win.on('unmaximize', () => {
    if (currentFolderPath) {
      const [w, h] = win.getSize();
      savePreferences({ maximized: false, width: w, height: h });
    }
  });

  await win.loadURL(url);

  win.show();
  splash.close();

  win.on('closed', () => {
    win = null;
    baseUrl = null;
    currentFolderPath = null;
    server.close();
  });
}

app.whenReady().then(createWindow).catch(err => {
  console.error(err);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
