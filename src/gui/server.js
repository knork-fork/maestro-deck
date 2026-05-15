import { createServer } from 'http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { exec } from 'child_process';
import { createHash } from 'crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(homedir(), '.maestro-deck');
const RESOURCES_DIR = join(CONFIG_DIR, 'resources');
const WORKSPACES_FILE = join(RESOURCES_DIR, 'workspaces.json');
const PREFERENCES_FILE = join(RESOURCES_DIR, 'preferences.json');
const APP_TILES_DIR = join(__dir, '..', 'tiles');
const USER_TILES_DIR = join(RESOURCES_DIR, 'tiles');
const PROJECTS_DIR = join(RESOURCES_DIR, 'projects');

function ensureConfigDir() {
  if (!existsSync(RESOURCES_DIR)) mkdirSync(RESOURCES_DIR, { recursive: true });
}

function ensureProjectsDir() {
  ensureConfigDir();
  if (!existsSync(PROJECTS_DIR)) mkdirSync(PROJECTS_DIR, { recursive: true });
}

function workspaceHash(p) {
  return createHash('sha256').update(p).digest('hex').slice(0, 16);
}

function getProjectDir(p) {
  ensureProjectsDir();
  const dir = join(PROJECTS_DIR, workspaceHash(p));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
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

function getPreferences() {
  ensureConfigDir();
  if (!existsSync(PREFERENCES_FILE)) return null;
  try { return JSON.parse(readFileSync(PREFERENCES_FILE, 'utf8')); } catch { return null; }
}

function savePreferencesData(prefs) {
  ensureConfigDir();
  writeFileSync(PREFERENCES_FILE, JSON.stringify(prefs, null, 2));
}

function touchWorkspace(path) {
  const ws = getWorkspaces().filter(w => w.path !== path);
  ws.unshift({ path, name: basename(path), openedAt: new Date().toISOString() });
  saveWorkspaces(ws.slice(0, 50));
}

function loadTiles() {
  const map = new Map();
  const sources = [
    { dir: APP_TILES_DIR, source: 'app' },
    { dir: USER_TILES_DIR, source: 'imported' },
  ];

  for (const { dir, source } of sources) {
    if (!existsSync(dir)) continue;
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }

    for (const name of entries) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) continue;
      const tileDir = join(dir, name);
      try {
        if (!statSync(tileDir).isDirectory()) continue;
      } catch { continue; }

      const jsonPath = join(tileDir, 'tile.json');
      if (!existsSync(jsonPath)) {
        console.warn(`[tiles] Skipping ${name}: missing tile.json`);
        continue;
      }
      let manifest;
      try { manifest = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch {
        console.warn(`[tiles] Skipping ${name}: tile.json parse error`);
        continue;
      }
      if (typeof manifest.label !== 'string' || !manifest.label ||
          typeof manifest.description !== 'string' ||
          typeof manifest.icon !== 'string' || !manifest.icon) {
        console.warn(`[tiles] Skipping ${name}: tile.json missing required fields (label, description, icon)`);
        continue;
      }
      if (!existsSync(join(tileDir, 'tile.html'))) {
        console.warn(`[tiles] Skipping ${name}: missing tile.html`);
        continue;
      }

      const hasJs = existsSync(join(tileDir, 'tile.js'));
      map.set(name, { dir: tileDir, source, manifest, hasJs });
    }
  }

  // Second pass: validate extends references
  for (const [name, entry] of map.entries()) {
    const ext = entry.manifest.extends;
    if (ext != null) {
      if (!/^[a-z][a-z0-9-]*$/.test(ext)) {
        console.warn(`[tiles] ${name}: extends "${ext}" is not a valid tile name`);
      } else if (!map.has(ext)) {
        console.warn(`[tiles] ${name}: extends "${ext}" not found`);
      }
    }
  }

  console.log(`[tiles] Loaded ${map.size} tile(s)`);
  return map;
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
  const html            = readFileSync(join(__dir, 'welcome.html'), 'utf8');
  const mainHtml        = readFileSync(join(__dir, 'main.html'), 'utf8');
  const titlebarJs      = readFileSync(join(__dir, 'titlebar.js'), 'utf8');
  const tilesFrameworkJs = readFileSync(join(__dir, 'tiles-framework.js'), 'utf8');
  const iconIcoPath = join(__dir, '..', '..', 'icons', 'favicon.ico');
  const iconPngPath = join(__dir, '..', '..', 'icons', 'icon_full.png');
  const iconIco = existsSync(iconIcoPath) ? readFileSync(iconIcoPath) : null;
  const iconPng = existsSync(iconPngPath) ? readFileSync(iconPngPath) : null;
  const port = await findPort();
  const tiles = loadTiles();

  const tileServeRe = /^\/tiles\/([a-z][a-z0-9-]*)\/([a-zA-Z0-9._-]+)$/;

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

      } else if (url.pathname === '/tiles-framework.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(tilesFrameworkJs);

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

      } else if (url.pathname === '/api/preferences' && req.method === 'GET') {
        const prefs = getPreferences();
        if (prefs === null) { res.writeHead(404); res.end(); return; }
        json(prefs);

      } else if (url.pathname === '/api/preferences' && req.method === 'POST') {
        const incoming = JSON.parse(await readBody(req));
        const existing = getPreferences() ?? {};
        savePreferencesData({ ...existing, ...incoming });
        json({ ok: true });

      } else if (url.pathname === '/api/tiles' && req.method === 'GET') {
        json([...tiles.entries()].map(([name, t]) => ({
          name,
          label:       t.manifest.label,
          description: t.manifest.description,
          icon:        t.manifest.icon,
          source:      t.source,
          hasJs:       t.hasJs,
        })));

      } else if (tileServeRe.test(url.pathname) && req.method === 'GET') {
        const [, tileName, fileName] = url.pathname.match(tileServeRe);
        if (fileName.includes('..')) { res.writeHead(400); res.end(); return; }
        const entry = tiles.get(tileName);
        if (!entry) { res.writeHead(404); res.end(); return; }
        const filePath = join(entry.dir, fileName);
        if (!existsSync(filePath)) { res.writeHead(404); res.end(); return; }
        const ext = fileName.split('.').pop();
        const mime = ext === 'js'   ? 'application/javascript'
                   : ext === 'html' ? 'text/html; charset=utf-8'
                   : ext === 'css'  ? 'text/css'
                   : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(filePath));

      } else if (url.pathname === '/api/layout' && req.method === 'GET') {
        const p = url.searchParams.get('path');
        if (!p) { json({ error: 'path required' }, 400); return; }
        const layoutFile = join(getProjectDir(p), 'layout.json');
        if (!existsSync(layoutFile)) { res.writeHead(404); res.end(); return; }
        json(JSON.parse(readFileSync(layoutFile, 'utf8')));

      } else if (url.pathname === '/api/layout' && req.method === 'POST') {
        const p = url.searchParams.get('path');
        if (!p) { json({ error: 'path required' }, 400); return; }
        const body = JSON.parse(await readBody(req));
        writeFileSync(join(getProjectDir(p), 'layout.json'), JSON.stringify(body, null, 2));
        json({ ok: true });

      } else if (url.pathname === '/api/tile-content' && req.method === 'GET') {
        const p = url.searchParams.get('path');
        const id = url.searchParams.get('id');
        if (!p || !id || !/^[a-zA-Z0-9_-]+$/.test(id)) { res.writeHead(400); res.end(); return; }
        const f = join(getProjectDir(p), `tile-${id}.json`);
        if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
        json(JSON.parse(readFileSync(f, 'utf8')));

      } else if (url.pathname === '/api/tile-content' && req.method === 'POST') {
        const p = url.searchParams.get('path');
        const id = url.searchParams.get('id');
        if (!p || !id || !/^[a-zA-Z0-9_-]+$/.test(id)) { res.writeHead(400); res.end(); return; }
        const body = JSON.parse(await readBody(req));
        writeFileSync(join(getProjectDir(p), `tile-${id}.json`), JSON.stringify(body, null, 2));
        json({ ok: true });

      } else if (url.pathname === '/api/tile-content' && req.method === 'DELETE') {
        const p = url.searchParams.get('path');
        const id = url.searchParams.get('id');
        if (!p || !id || !/^[a-zA-Z0-9_-]+$/.test(id)) { res.writeHead(400); res.end(); return; }
        const f = join(getProjectDir(p), `tile-${id}.json`);
        if (existsSync(f)) unlinkSync(f);
        json({ ok: true });

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
