import { createServer } from 'http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform, tmpdir } from 'os';
import { exec, spawn, spawnSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(homedir(), '.maestro-deck');
const RESOURCES_DIR = join(CONFIG_DIR, 'resources');
const WORKSPACES_FILE = join(RESOURCES_DIR, 'workspaces.json');

function ensureConfigDir() {
  if (!existsSync(RESOURCES_DIR)) mkdirSync(RESOURCES_DIR, { recursive: true });
}

function getWorkspaces() {
  ensureConfigDir();
  if (!existsSync(WORKSPACES_FILE)) return [];
  try { return JSON.parse(readFileSync(WORKSPACES_FILE, 'utf8')); } catch { return []; }
}

function saveWorkspaces(ws) {
  ensureConfigDir();
  writeFileSync(WORKSPACES_FILE, JSON.stringify(ws, null, 2));
}

function touchWorkspace(path) {
  const ws = getWorkspaces().filter(w => w.path !== path);
  ws.unshift({ path, name: basename(path), openedAt: new Date().toISOString() });
  saveWorkspaces(ws.slice(0, 50));
}

async function fetchReleases() {
  const res = await fetch('https://api.github.com/repos/knork-fork/maestro-deck/releases', {
    headers: { 'User-Agent': 'maestro-deck-gui' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function runDialog(cmd) {
  return new Promise(resolve => {
    exec(cmd, (err, stdout) => resolve(err ? null : stdout.trim() || null));
  });
}

async function pickFolder() {
  return (
    (await runDialog('zenity --file-selection --directory --title "Open Folder" 2>/dev/null')) ??
    (await runDialog('kdialog --getexistingdirectory "$HOME" 2>/dev/null'))
  );
}

async function createNewFolder() {
  const parent =
    (await runDialog('zenity --file-selection --directory --title "Choose parent directory" 2>/dev/null')) ??
    (await runDialog('kdialog --getexistingdirectory "$HOME" 2>/dev/null'));
  if (!parent) return null;

  const name =
    (await runDialog('zenity --entry --title "New Folder" --text "Folder name:" --entry-text "new-folder" 2>/dev/null')) ??
    (await runDialog('kdialog --inputbox "Folder name:" "new-folder" --title "New Folder" 2>/dev/null'));
  if (!name) return null;

  const fullPath = join(parent, name.trim());
  mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

function openInFileManager(path) {
  exec(`xdg-open "${path}" 2>/dev/null || open "${path}" 2>/dev/null`);
}

function tryPort(port) {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.once('listening', () => s.close(() => resolve(port)));
    s.listen(port, '127.0.0.1');
  });
}

async function findPort(start = 7337, tries = 20) {
  for (let p = start; p < start + tries; p++) {
    try { await tryPort(p); return p; } catch { /* taken */ }
  }
  throw new Error('No free port found in range');
}

export async function startServer() {
  const html     = readFileSync(join(__dir, 'welcome.html'), 'utf8');
  const mainHtml = readFileSync(join(__dir, 'main.html'), 'utf8');
  const titlebarJs = readFileSync(join(__dir, 'titlebar.js'), 'utf8');
  const iconIcoPath = join(__dir, '..', '..', 'icons', 'favicon.ico');
  const iconPngPath = join(__dir, '..', '..', 'icons', 'icon_full.png');
  const iconIco = existsSync(iconIcoPath) ? readFileSync(iconIcoPath) : null;
  const iconPng = existsSync(iconPngPath) ? readFileSync(iconPngPath) : null;
  const port = await findPort();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    const json = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);

      } else if (url.pathname === '/main' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(mainHtml);

      } else if (url.pathname === '/titlebar.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(titlebarJs);

      } else if (url.pathname === '/favicon.ico' && req.method === 'GET') {
        if (iconIco) {
          res.writeHead(200, { 'Content-Type': 'image/x-icon' });
          res.end(iconIco);
        } else {
          res.writeHead(404); res.end();
        }

      } else if (url.pathname === '/icon.png' && req.method === 'GET') {
        if (iconPng) {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(iconPng);
        } else {
          res.writeHead(404); res.end();
        }

      } else if (url.pathname === '/api/workspaces' && req.method === 'GET') {
        json(getWorkspaces());

      } else if (url.pathname === '/api/workspaces/touch' && req.method === 'POST') {
        const { path } = JSON.parse(await readBody(req));
        touchWorkspace(path);
        json({ ok: true });

      } else if (url.pathname === '/api/open-folder' && req.method === 'POST') {
        const path = await pickFolder();
        if (!path) { res.writeHead(204); res.end(); return; }
        touchWorkspace(path);
        json({ path });

      } else if (url.pathname === '/api/new-folder' && req.method === 'POST') {
        const path = await createNewFolder();
        if (!path) { res.writeHead(204); res.end(); return; }
        touchWorkspace(path);
        json({ path });

      } else if (url.pathname === '/api/open-in-files' && req.method === 'POST') {
        const { path } = JSON.parse(await readBody(req));
        openInFileManager(path);
        json({ ok: true });

      } else if (url.pathname === '/api/version' && req.method === 'GET') {
        const versionFile = join(__dir, '..', '..', 'version.txt');
        const version = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';
        json({ version });

      } else if (url.pathname === '/api/releases' && req.method === 'GET') {
        const releases = await fetchReleases();
        json(releases);

      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (e) {
      console.error(e);
      json({ error: e.message }, 500);
    }
  });

  const listenUrl = await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(`http://localhost:${port}`));
    server.on('error', reject);
  });

  return { url: listenUrl, server };
}
