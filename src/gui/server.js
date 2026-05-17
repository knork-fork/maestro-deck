import { createServer } from 'http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, readlinkSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform } from 'os';
import { exec, execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import { Agent } from 'undici';

const proxyAgent = new Agent({ connect: { rejectUnauthorized: false } });

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(homedir(), '.maestro-deck');
const RESOURCES_DIR = join(CONFIG_DIR, 'resources');
const WORKSPACES_FILE = join(RESOURCES_DIR, 'workspaces.json');
const PREFERENCES_FILE = join(RESOURCES_DIR, 'preferences.json');
const APP_TILES_DIR = join(__dir, '..', 'tiles');
const USER_TILES_DIR = join(RESOURCES_DIR, 'tiles');
const APP_PLUGINS_DIR = join(__dir, '..', 'plugins');
const USER_PLUGINS_DIR = join(RESOURCES_DIR, 'plugins');
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

function validateLayoutNode(node, tiles) {
  if (!node || typeof node !== 'object') return 'layout node is not an object';
  if (node.type === 'leaf') {
    if (typeof node.tileType !== 'string' || !node.tileType) return 'leaf missing tileType';
    if (!tiles.has(node.tileType)) return `leaf references unknown tileType "${node.tileType}"`;
    if (node.initCmd != null && typeof node.initCmd !== 'string') return 'leaf initCmd must be a string';
    return null;
  }
  if (node.type === 'split') {
    if (node.dir !== 'h' && node.dir !== 'v') return 'split dir must be "h" or "v"';
    if (typeof node.ratio !== 'number' || !(node.ratio > 0 && node.ratio < 1)) return 'split ratio must be a number in (0,1)';
    return validateLayoutNode(node.a, tiles) || validateLayoutNode(node.b, tiles);
  }
  return `node type must be "leaf" or "split" (got ${JSON.stringify(node.type)})`;
}

function loadPlugins(tiles) {
  const map = new Map();
  const sources = [
    { dir: APP_PLUGINS_DIR, source: 'app' },
    { dir: USER_PLUGINS_DIR, source: 'user' },
  ];

  for (const { dir, source } of sources) {
    if (!existsSync(dir)) continue;
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }

    for (const name of entries) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) continue;
      const pluginDir = join(dir, name);
      try {
        if (!statSync(pluginDir).isDirectory()) continue;
      } catch { continue; }

      const jsonPath = join(pluginDir, 'plugin.json');
      if (!existsSync(jsonPath)) {
        console.warn(`[plugins] Skipping ${name}: missing plugin.json`);
        continue;
      }
      let manifest;
      try { manifest = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch {
        console.warn(`[plugins] Skipping ${name}: plugin.json parse error`);
        continue;
      }
      if (typeof manifest.label !== 'string' || !manifest.label ||
          typeof manifest.description !== 'string' ||
          typeof manifest.icon !== 'string' || !manifest.icon) {
        console.warn(`[plugins] Skipping ${name}: plugin.json missing required fields (label, description, icon)`);
        continue;
      }
      const hasTileType = typeof manifest.tileType === 'string' && manifest.tileType;
      const hasLayout = manifest.layout != null;
      if (!hasTileType && !hasLayout) {
        console.warn(`[plugins] Skipping ${name}: plugin.json must have either "tileType" or "layout"`);
        continue;
      }
      if (hasLayout) {
        const err = validateLayoutNode(manifest.layout, tiles);
        if (err) {
          console.warn(`[plugins] Skipping ${name}: invalid layout — ${err}`);
          continue;
        }
      }

      map.set(name, { source, manifest });
    }
  }

  console.log(`[plugins] Loaded ${map.size} plugin(s)`);
  return map;
}

// ───────────────────────────── Terminal (PTY) ─────────────────────────────

const terminals = new Map(); // tileId → { pty, sockets:Set, cwd, cwdTimer }

const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';

function pickShell() {
  if (IS_WIN) return process.env.ComSpec || 'powershell.exe';
  if (process.env.SHELL && existsSync(process.env.SHELL)) return process.env.SHELL;
  if (existsSync('/bin/bash')) return '/bin/bash';
  return '/bin/sh';
}

function getCwd(pid) {
  try {
    if (process.platform === 'linux') {
      return readlinkSync(`/proc/${pid}/cwd`);
    }
    if (IS_MAC) {
      const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const m = out.split('\n').find(l => l.startsWith('n'));
      if (m) return m.slice(1).trim();
    }
  } catch { /* ignore */ }
  return null;
}

function killTerminal(id) {
  const t = terminals.get(id);
  if (!t) return;
  terminals.delete(id);
  if (t.cwdTimer) clearInterval(t.cwdTimer);
  for (const ws of t.sockets) {
    try { ws.close(); } catch {}
  }
  try { t.pty.kill(); } catch {}
}

function killAllTerminals() {
  for (const id of [...terminals.keys()]) killTerminal(id);
}

function attachTerminalWS(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://localhost`);
    if (url.pathname !== '/ws/terminal') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => handleTerminalSocket(ws, url));
  });
}

function handleTerminalSocket(ws, url) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    try { ws.close(); } catch {}
    return;
  }
  let entry = terminals.get(id);

  function send(obj) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  }

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'spawn') {
      if (!entry) {
        const shell = pickShell();
        const cols = Math.max(2, msg.cols | 0) || 80;
        const rows = Math.max(1, msg.rows | 0) || 24;
        const cwd  = (typeof msg.cwd === 'string' && msg.cwd && existsSync(msg.cwd))
          ? msg.cwd
          : homedir();
        let child;
        try {
          child = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols, rows,
            cwd,
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
          });
        } catch (e) {
          send({ type: 'error', message: `failed to spawn shell: ${e.message}` });
          try { ws.close(); } catch {}
          return;
        }

        entry = { pty: child, sockets: new Set(), cwd, cwdTimer: null };
        terminals.set(id, entry);

        child.onData(data => {
          for (const sock of entry.sockets) {
            if (sock.readyState === sock.OPEN) {
              try { sock.send(JSON.stringify({ type: 'data', data })); } catch {}
            }
          }
        });
        child.onExit(({ exitCode }) => {
          for (const sock of entry.sockets) {
            if (sock.readyState === sock.OPEN) {
              try { sock.send(JSON.stringify({ type: 'exit', code: exitCode })); } catch {}
            }
          }
          if (entry.cwdTimer) clearInterval(entry.cwdTimer);
          terminals.delete(id);
        });

        // Periodically resolve cwd from the OS and push to attached clients.
        entry.cwdTimer = setInterval(() => {
          const next = getCwd(child.pid);
          if (next && next !== entry.cwd) {
            entry.cwd = next;
            for (const sock of entry.sockets) {
              if (sock.readyState === sock.OPEN) {
                try { sock.send(JSON.stringify({ type: 'cwd', cwd: next })); } catch {}
              }
            }
          }
        }, 1500);
      } else {
        // Existing PTY — just resize to the joiner's geometry.
        try { entry.pty.resize(msg.cols | 0 || entry.pty.cols, msg.rows | 0 || entry.pty.rows); } catch {}
      }
      entry.sockets.add(ws);
      if (entry.cwd) send({ type: 'cwd', cwd: entry.cwd });
      return;
    }

    if (!entry) return;

    if (msg.type === 'input' && typeof msg.data === 'string') {
      try { entry.pty.write(msg.data); } catch {}
    } else if (msg.type === 'resize') {
      try { entry.pty.resize(Math.max(2, msg.cols | 0), Math.max(1, msg.rows | 0)); } catch {}
    } else if (msg.type === 'dispose') {
      killTerminal(id);
    }
  });

  ws.on('close', () => {
    if (entry) entry.sockets.delete(ws);
  });
}

// ─────────────────────────────────────────────────────────────────────────

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
  const preferencesModalJs = readFileSync(join(__dir, 'preferences-modal.js'), 'utf8');
  const iconIcoPath = join(__dir, '..', '..', 'icons', 'favicon.ico');
  const iconPngPath = join(__dir, '..', '..', 'icons', 'icon_full.png');
  const iconIco = existsSync(iconIcoPath) ? readFileSync(iconIcoPath) : null;
  const iconPng = existsSync(iconPngPath) ? readFileSync(iconPngPath) : null;
  const port = await findPort();
  let tiles = loadTiles();
  let plugins = loadPlugins(tiles);

  const tileServeRe = /^\/tiles\/([a-z][a-z0-9-]*)\/((?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+)$/;

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

      } else if (url.pathname === '/preferences-modal.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(preferencesModalJs);

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

      } else if (url.pathname === '/api/reload-defs' && req.method === 'POST') {
        tiles = loadTiles();
        plugins = loadPlugins(tiles);
        json({ ok: true, tiles: tiles.size, plugins: plugins.size });

      } else if (url.pathname === '/api/tiles' && req.method === 'GET') {
        json([...tiles.entries()].map(([name, t]) => ({
          name,
          label:       t.manifest.label,
          description: t.manifest.description,
          icon:        t.manifest.icon,
          source:      t.source,
          hasJs:       t.hasJs,
        })));

      } else if (url.pathname === '/api/plugins' && req.method === 'GET') {
        json([...plugins.entries()].map(([name, p]) => ({
          name,
          label:       p.manifest.label,
          description: p.manifest.description,
          icon:        p.manifest.icon,
          tileType:    p.manifest.tileType ?? null,
          initCmd:     p.manifest.initCmd ?? null,
          layout:      p.manifest.layout ?? null,
          source:      p.source,
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

      } else if (url.pathname === '/api/workspace-tiles' && req.method === 'DELETE') {
        const p = url.searchParams.get('path');
        if (!p) { json({ error: 'path required' }, 400); return; }
        const dir = getProjectDir(p);
        const files = readdirSync(dir).filter(f => /^tile-[a-zA-Z0-9_-]+\.json$/.test(f));
        for (const f of files) {
          const id = f.replace(/^tile-/, '').replace(/\.json$/, '');
          killTerminal(id);
          unlinkSync(join(dir, f));
        }
        json({ ok: true, deleted: files.length });

      } else if (url.pathname === '/api/project' && req.method === 'DELETE') {
        const p = url.searchParams.get('path');
        if (!p) { json({ error: 'path required' }, 400); return; }
        const dir = getProjectDir(p);
        if (existsSync(dir)) {
          // Kill all terminals for tiles in this project
          for (const f of readdirSync(dir)) {
            const m = f.match(/^tile-([a-zA-Z0-9_-]+)\.json$/);
            if (m) killTerminal(m[1]);
          }
          rmSync(dir, { recursive: true, force: true });
        }
        json({ ok: true });

      } else if (url.pathname === '/api/all-projects' && req.method === 'DELETE') {
        killAllTerminals();
        if (existsSync(PROJECTS_DIR)) {
          for (const entry of readdirSync(PROJECTS_DIR)) {
            rmSync(join(PROJECTS_DIR, entry), { recursive: true, force: true });
          }
        }
        json({ ok: true });

      } else if (url.pathname === '/api/http-proxy' && req.method === 'POST') {
        const { method: reqMethod, url: reqUrl, headers: reqHeaders, body: reqBody } = JSON.parse(await readBody(req));
        let parsed;
        try { parsed = new URL(reqUrl); } catch { json({ ok: false, error: 'Invalid URL', durationMs: 0 }); return; }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          json({ ok: false, error: `Protocol not allowed: ${parsed.protocol}`, durationMs: 0 }); return;
        }
        const t0 = performance.now();
        try {
          const fetchOpts = { method: reqMethod, headers: reqHeaders ?? {}, redirect: 'follow', dispatcher: proxyAgent };
          if (reqBody != null && reqMethod !== 'GET' && reqMethod !== 'HEAD') fetchOpts.body = reqBody;
          const proxyRes = await fetch(reqUrl, fetchOpts);
          const body = await proxyRes.text();
          const durationMs = Math.round(performance.now() - t0);
          const respHeaders = {};
          proxyRes.headers.forEach((v, k) => { respHeaders[k] = v; });
          json({ ok: true, status: proxyRes.status, statusText: proxyRes.statusText, headers: respHeaders, body, durationMs, finalUrl: proxyRes.url });
        } catch (e) {
          json({ ok: false, error: e.message, durationMs: Math.round(performance.now() - t0) });
        }

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
        killTerminal(id);
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

  attachTerminalWS(server);
  server.on('close', killAllTerminals);

  const listenUrl = await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(`http://localhost:${port}`));
    server.on('error', reject);
  });

  return { url: listenUrl, server };
}
