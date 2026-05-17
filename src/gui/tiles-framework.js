// Tile canvas framework — i3-style BSP tiling layout with first-class tabs.

import { openPreferencesModal } from '/preferences-modal.js';

const SIDEBAR_DEFAULT_WIDTH = 280;
const TABS_SIDEBAR_DEFAULT_WIDTH = 200;
const MIN_TILE_W = 150;
const MIN_TILE_H = 100;
const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, Ubuntu, sans-serif`;
const TAB_COLORS = ['#6b7280','#3b82f6','#22c55e','#eab308','#f97316','#ef4444','#a855f7'];

const state = {
  workspacePath: '',
  tiles: [],                          // tile definitions from /api/tiles
  plugins: [],                        // plugin definitions from /api/plugins
  hiddenTiles: new Set(),
  // First-class tabs
  tabs: [],                           // TabState[]
  activeTabIndex: 0,
  focusedId: null,
  saveLayoutTimer: null,
  // Right sidebar
  sidebarOpen: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  activeTab: 'tiles',
  // Left sidebar (tabs list)
  tabsSidebarOpen: false,
  tabsSidebarWidth: TABS_SIDEBAR_DEFAULT_WIDTH,
};

// ═══ Styles ═════════════════════════════════════════════════════════════════

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Canvas container ── */
    #canvas-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    /* ── Per-tab canvas ── */
    .tab-canvas {
      position: absolute;
      inset: 0;
      display: flex;
      overflow: hidden;
      padding: 6px;
      font-family: ${FONT_STACK};
    }
    .tab-canvas.hidden { display: none; }

    /* ── Splits & panes ── */
    .split { display: flex; flex: 1 1 0; min-width: 0; min-height: 0; }
    .split[data-dir="h"] { flex-direction: row; }
    .split[data-dir="v"] { flex-direction: column; }
    .pane { display: flex; min-width: 0; min-height: 0; overflow: hidden; }

    .splitter {
      flex: 0 0 7px;
      position: relative;
      background: transparent;
    }
    .split[data-dir="h"] > .splitter { cursor: col-resize; }
    .split[data-dir="v"] > .splitter { cursor: row-resize; }
    .splitter::before {
      content: '';
      position: absolute;
      background: #1e1e1e;
      transition: background 0.12s;
    }
    .split[data-dir="h"] > .splitter::before { top: 0; bottom: 0; left: 3px; width: 1px; }
    .split[data-dir="v"] > .splitter::before { left: 0; right: 0; top: 3px; height: 1px; }
    .splitter:hover::before, .splitter.dragging::before { background: #4fc1ff; }

    /* ── Tile ── */
    .tile {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: #1a1a1a;
      overflow: hidden;
    }
    .tile::after {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px solid transparent;
      pointer-events: none;
      z-index: 100;
    }
    .tile.focused::after { border-color: #ffffff; }
    body.window-blurred .tile.focused::after { border-color: transparent; }
    .tile.notify:not(.focused)::after { border-color: #f0c040; }
    .tile.stale-notify:not(.focused)::after { border-color: #50c060; }

    .tile-titlebar {
      height: 16px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 0 2px;
      flex-shrink: 0;
      cursor: move;
      user-select: none;
    }
    .tile-close {
      width: 16px;
      height: 14px;
      background: none;
      border: none;
      color: #555;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
    }
    .tile-close:hover { color: #ccc; background: rgba(255,255,255,0.08); }
    .tile-expand {
      width: 16px;
      height: 14px;
      background: none;
      border: none;
      color: #555;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
    }
    .tile-expand:hover { color: #ccc; background: rgba(255,255,255,0.08); }

    .tile-content {
      flex: 1 1 0;
      display: grid;
      grid-template: 1fr / 1fr;
      overflow: hidden;
      position: relative;
      min-height: 0;
      min-width: 0;
    }
    .tile-content > * {
      min-width: 0;
      min-height: 0;
      width: 100%;
      height: 100%;
    }

    /* ── Drop preview ── */
    .tile-drop-preview {
      position: absolute;
      pointer-events: none;
      border: 2px dashed #4fc1ff;
      background: rgba(79,193,255,0.08);
      border-radius: 3px;
      z-index: 1000;
      box-sizing: border-box;
    }
    .tile-drop-preview.swap {
      border-style: solid;
      background: rgba(79,193,255,0.14);
    }

    /* ── Right sidebar ── */
    #sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: #000;
      font-family: ${FONT_STACK};
      flex-shrink: 0;
    }
    #sidebar-divider {
      width: 1px;
      background: #222;
      flex-shrink: 0;
      cursor: col-resize;
      position: relative;
      transition: background 0.15s;
    }
    #sidebar-divider:hover,
    #sidebar-divider.dragging { background: #3a3a3a; }
    #sidebar-divider::after {
      content: '';
      position: absolute;
      top: 0; left: -4px; right: -4px; bottom: 0;
    }

    #sb-tabs {
      display: flex;
      border-bottom: 1px solid #1e1e1e;
      flex-shrink: 0;
    }
    .sb-tab {
      flex: 1;
      padding: 9px 0;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #666;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .sb-tab:hover { color: #ccc; }
    .sb-tab.active { color: #fff; border-bottom-color: #4fc1ff; }

    #sb-search-wrap {
      padding: 8px;
      flex-shrink: 0;
    }
    #sb-search {
      width: 100%;
      background: #111;
      border: 1px solid #333;
      border-radius: 3px;
      padding: 6px 9px;
      color: #ddd;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
    }
    #sb-search:focus { border-color: #4fc1ff; }
    #sb-search::placeholder { color: #555; }

    .sb-panel { flex: 1; overflow-y: auto; min-height: 0; }
    .sb-panel.hidden { display: none; }

    .sb-section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #888;
      padding: 12px 12px 6px;
    }

    .sb-tile-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      cursor: grab;
      border-radius: 3px;
      margin: 1px 4px;
      user-select: none;
    }
    .sb-tile-item:hover { background: #181818; }
    .sb-tile-item:active { cursor: grabbing; }

    .sb-tile-icon {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
    }
    .sb-tile-icon svg { width: 20px; height: 20px; }

    .sb-tile-info { min-width: 0; }
    .sb-tile-label { font-size: 13px; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-tile-desc  { font-size: 12px; color: #777; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    #sb-clear-all {
      flex-shrink: 0;
      width: calc(100% - 16px);
      margin: 8px;
      padding: 8px 12px;
      background: rgba(180,60,60,0.12);
      border: 1px solid rgba(180,60,60,0.3);
      border-radius: 4px;
      color: #c0504a;
      font-size: 12px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: color 0.15s, background 0.15s, border-color 0.15s;
    }
    #sb-clear-all:hover { color: #e07070; background: rgba(180,60,60,0.22); border-color: rgba(180,60,60,0.55); }
    #sb-clear-all svg { flex-shrink: 0; width: 14px; height: 14px; }

    /* ── Left sidebar (tabs list) ── */
    #tabs-sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: #000;
      font-family: ${FONT_STACK};
      flex-shrink: 0;
      width: 0px;
      transition: width 0.15s;
    }
    #tabs-sidebar-divider {
      width: 1px;
      background: #222;
      flex-shrink: 0;
      cursor: col-resize;
      position: relative;
      transition: background 0.15s;
      display: none;
    }
    #tabs-sidebar-divider:hover,
    #tabs-sidebar-divider.dragging { background: #3a3a3a; }
    #tabs-sidebar-divider::after {
      content: '';
      position: absolute;
      top: 0; left: -4px; right: -4px; bottom: 0;
    }

    #tl-list {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 4px 0;
    }

    .tl-tab-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      cursor: pointer;
      border-radius: 3px;
      margin: 1px 4px;
      user-select: none;
    }
    .tl-tab-item:hover { background: #181818; }
    .tl-tab-item.active { background: #1e1e1e; }

    .tl-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .tl-tab-label {
      flex: 1;
      font-size: 13px;
      color: #ddd;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .tl-tab-actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
      visibility: hidden;
    }
    .tl-tab-item:hover .tl-tab-actions { visibility: visible; }

    .tl-action-btn {
      width: 18px;
      height: 18px;
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
    }
    .tl-action-btn:hover { color: #ccc; background: rgba(255,255,255,0.08); }

    .tl-create-btn {
      margin: 6px 8px;
      padding: 7px 10px;
      background: #111;
      border: 1px solid #333;
      border-radius: 4px;
      color: #888;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.12s, color 0.12s;
      flex-shrink: 0;
    }
    .tl-create-btn:hover { border-color: #555; color: #ccc; }

    /* ── Tab edit modal ── */
    #md-tab-edit-overlay {
      position: fixed;
      inset: 0;
      z-index: 20000;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #md-tab-edit-box {
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 20px 24px;
      min-width: 280px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      color: #ddd;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    }
    #md-tab-edit-box label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #888;
      margin-bottom: 6px;
    }
    #md-tab-edit-name {
      width: 100%;
      background: #111;
      border: 1px solid #333;
      border-radius: 3px;
      padding: 6px 9px;
      color: #ddd;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      margin-bottom: 14px;
    }
    #md-tab-edit-name:focus { border-color: #4fc1ff; }
    .tl-color-swatches {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .tl-color-swatch {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.1s, transform 0.1s;
      flex-shrink: 0;
    }
    .tl-color-swatch:hover { transform: scale(1.15); }
    .tl-color-swatch.selected { border-color: #fff; }
    #md-tab-edit-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .md-btn-cancel {
      background: transparent;
      border: 1px solid #666;
      border-radius: 4px;
      color: #ccc;
      padding: 5px 12px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      cursor: pointer;
    }
    .md-btn-cancel:hover { border-color: #999; color: #eee; }
    .md-btn-ok {
      background: #3a6ea5;
      border: 1px solid #2d5a8e;
      border-radius: 4px;
      color: #fff;
      padding: 5px 12px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      cursor: pointer;
    }
    .md-btn-ok:hover { background: #2d5a8e; }
  `;
  document.head.appendChild(style);
}

// ═══ Helpers ════════════════════════════════════════════════════════════════

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 18);
}

// ═══ Preferences ════════════════════════════════════════════════════════════

async function loadPreferences() {
  try {
    const res = await fetch('/api/preferences');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function savePreferences(patch) {
  try {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch { /* ignore */ }
}

// ═══ Right sidebar ══════════════════════════════════════════════════════════

function persistSidebarPrefs() {
  savePreferences({
    sidebar: { open: state.sidebarOpen, width: state.sidebarWidth, activeTab: state.activeTab },
    hiddenTiles: [...state.hiddenTiles],
  });
}

function applySidebar(animated = false) {
  const sidebar = document.getElementById('sidebar');
  const divider = document.getElementById('sidebar-divider');
  if (!sidebar || !divider) return;

  if (!animated) {
    sidebar.style.transition = 'none';
    divider.style.transition = 'none';
  }
  if (state.sidebarOpen) {
    sidebar.style.width = `${state.sidebarWidth}px`;
    divider.style.display = '';
  } else {
    sidebar.style.width = '0px';
    divider.style.display = 'none';
  }
  window.dispatchEvent(new CustomEvent('md-sidebar-state', { detail: { open: state.sidebarOpen } }));
  if (!animated) {
    requestAnimationFrame(() => {
      sidebar.style.transition = '';
      divider.style.transition = '';
    });
  }
}

function initSidebar(prefs) {
  if (prefs?.sidebar != null) {
    state.sidebarOpen  = prefs.sidebar.open ?? true;
    state.sidebarWidth = prefs.sidebar.width ?? SIDEBAR_DEFAULT_WIDTH;
    const savedTab = prefs.sidebar.activeTab ?? 'tiles';
    state.activeTab = savedTab === 'skills' ? 'tiles' : savedTab;
  }
  state.hiddenTiles = new Set(prefs?.hiddenTiles ?? []);
  applySidebar(false);

  window.addEventListener('md-toggle-sidebar', () => {
    state.sidebarOpen = !state.sidebarOpen;
    applySidebar(true);
    persistSidebarPrefs();
  });

  const divider = document.getElementById('sidebar-divider');
  const sidebar = document.getElementById('sidebar');

  divider?.addEventListener('mousedown', e => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = state.sidebarWidth;
    divider.classList.add('dragging');
    sidebar.style.transition = 'none';

    function onMove(e) {
      state.sidebarWidth = Math.max(120, Math.min(900, startWidth + (startX - e.clientX)));
      sidebar.style.width = `${state.sidebarWidth}px`;
    }
    function onUp() {
      divider.classList.remove('dragging');
      sidebar.style.transition = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persistSidebarPrefs();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ═══ Right sidebar tile list ════════════════════════════════════════════════

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div id="sb-tabs">
      <button class="sb-tab${state.activeTab === 'tiles' ? ' active' : ''}" data-tab="tiles">Tiles</button>
      <button class="sb-tab${state.activeTab === 'plugins' ? ' active' : ''}" data-tab="plugins">Plugins</button>
    </div>
    <div id="sb-search-wrap">
      <input id="sb-search" type="search" placeholder="Search ${state.activeTab === 'plugins' ? 'plugins' : 'tiles'}…" autocomplete="off" spellcheck="false">
    </div>
    <div id="sb-panel-tiles" class="sb-panel${state.activeTab === 'tiles' ? '' : ' hidden'}">
      <!--<div class="sb-section-label" id="sb-label-app">Tiles</div>-->
      <div id="sb-app-tiles"></div>
      <!--<div class="sb-section-label" id="sb-label-imported">Imported</div>-->
      <div id="sb-imported-tiles"></div>
    </div>
    <div id="sb-panel-plugins" class="sb-panel${state.activeTab === 'plugins' ? '' : ' hidden'}"></div>
    <button id="sb-clear-all">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <polyline points="3,4 13,4"/>
        <path d="M5 4V2h6v2"/>
        <path d="M4 4l1 10h6l1-10"/>
        <line x1="6.5" y1="7" x2="6.5" y2="11"/>
        <line x1="9.5" y1="7" x2="9.5" y2="11"/>
      </svg>
      Clear all tiles
    </button>
  `;

  sidebar.querySelectorAll('.sb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sidebar.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      state.activeTab = tabName;
      document.getElementById('sb-panel-tiles')?.classList.toggle('hidden', tabName !== 'tiles');
      document.getElementById('sb-panel-plugins')?.classList.toggle('hidden', tabName !== 'plugins');
      const searchEl = document.getElementById('sb-search');
      if (tabName === 'plugins') {
        if (searchEl) { searchEl.value = ''; searchEl.placeholder = 'Search plugins…'; }
        renderPluginList('');
      } else if (tabName === 'tiles') {
        if (searchEl) { searchEl.value = ''; searchEl.placeholder = 'Search tiles…'; }
        renderTileList('');
      }
      persistSidebarPrefs();
    });
  });

  document.getElementById('sb-search')?.addEventListener('input', e => {
    const filter = e.target.value.trim().toLowerCase();
    if (state.activeTab === 'plugins') renderPluginList(filter);
    else renderTileList(filter);
  });

  document.getElementById('sb-clear-all')?.addEventListener('click', confirmClearAll);

  renderTileList('');
  renderPluginList('');
}

function renderTileList(filter) {
  const appContainer      = document.getElementById('sb-app-tiles');
  const importedContainer = document.getElementById('sb-imported-tiles');
  const appLabel          = document.getElementById('sb-label-app');
  const importedLabel     = document.getElementById('sb-label-imported');
  if (!appContainer || !importedContainer) return;

  appContainer.innerHTML = '';
  importedContainer.innerHTML = '';

  let appCount = 0;
  let importedCount = 0;

  for (const tile of state.tiles) {
    if (state.hiddenTiles.has(tile.name)) continue;
    if (filter && !tile.label.toLowerCase().includes(filter) && !tile.description.toLowerCase().includes(filter)) {
      continue;
    }
    const el = buildTileListItem(tile);
    if (tile.source === 'app') {
      appContainer.appendChild(el);
      appCount++;
    } else {
      importedContainer.appendChild(el);
      importedCount++;
    }
  }

  if (appLabel)      appLabel.style.display      = appCount      === 0 ? 'none' : '';
  if (importedLabel) importedLabel.style.display = importedCount === 0 ? 'none' : '';
}

function renderPluginList(filter) {
  const panel = document.getElementById('sb-panel-plugins');
  if (!panel) return;
  panel.innerHTML = '';

  const filtered = state.plugins.filter(p =>
    !filter ||
    p.label.toLowerCase().includes(filter) ||
    p.description.toLowerCase().includes(filter)
  );

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 12px 16px; color: #888; font-size: 12px;';
    empty.textContent = filter ? 'No plugins match.' : 'No plugins installed.';
    panel.appendChild(empty);
    return;
  }

  for (const plugin of filtered) {
    const el = document.createElement('div');
    el.className = 'sb-tile-item';
    el.draggable = true;
    el.dataset.pluginName = plugin.name;
    el.title = plugin.description;

    const iconEl = document.createElement('span');
    iconEl.className = 'sb-tile-icon';
    iconEl.innerHTML = plugin.icon;

    const infoEl = document.createElement('div');
    infoEl.className = 'sb-tile-info';
    infoEl.innerHTML = `
      <div class="sb-tile-label">${escapeHtml(plugin.label)}</div>
      <div class="sb-tile-desc">${escapeHtml(plugin.description)}</div>
    `;

    el.appendChild(iconEl);
    el.appendChild(infoEl);

    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('plugin-name', plugin.name);
      e.dataTransfer.effectAllowed = 'copy';
    });

    panel.appendChild(el);
  }
}

function buildTileListItem(tile) {
  const el = document.createElement('div');
  el.className = 'sb-tile-item';
  el.draggable = true;
  el.dataset.tileName = tile.name;
  el.title = tile.description;

  const iconEl = document.createElement('span');
  iconEl.className = 'sb-tile-icon';
  iconEl.innerHTML = tile.icon;

  const infoEl = document.createElement('div');
  infoEl.className = 'sb-tile-info';
  infoEl.innerHTML = `
    <div class="sb-tile-label">${escapeHtml(tile.label)}</div>
    <div class="sb-tile-desc">${escapeHtml(tile.description)}</div>
  `;

  el.appendChild(iconEl);
  el.appendChild(infoEl);

  el.addEventListener('dragstart', e => {
    e.dataTransfer.setData('tile-name', tile.name);
    e.dataTransfer.effectAllowed = 'copy';
  });

  return el;
}

// ═══ Left sidebar (tabs list) ════════════════════════════════════════════════

function persistTabsSidebarPrefs() {
  savePreferences({ tabsSidebar: { open: state.tabsSidebarOpen, width: state.tabsSidebarWidth } });
}

function applyTabsSidebar(animated = false) {
  const sidebar = document.getElementById('tabs-sidebar');
  const divider = document.getElementById('tabs-sidebar-divider');
  if (!sidebar || !divider) return;

  if (!animated) {
    sidebar.style.transition = 'none';
  }
  if (state.tabsSidebarOpen) {
    sidebar.style.width = `${state.tabsSidebarWidth}px`;
    divider.style.display = 'block';
  } else {
    sidebar.style.width = '0px';
    divider.style.display = 'none';
  }
  window.dispatchEvent(new CustomEvent('md-tabs-sidebar-state', { detail: { open: state.tabsSidebarOpen } }));
  if (!animated) {
    requestAnimationFrame(() => {
      sidebar.style.transition = '';
    });
  }
}

function initTabsSidebar(prefs) {
  if (prefs?.tabsSidebar != null) {
    state.tabsSidebarOpen  = prefs.tabsSidebar.open ?? false;
    state.tabsSidebarWidth = prefs.tabsSidebar.width ?? TABS_SIDEBAR_DEFAULT_WIDTH;
  }
  applyTabsSidebar(false);

  window.addEventListener('md-toggle-tabs-sidebar', () => {
    state.tabsSidebarOpen = !state.tabsSidebarOpen;
    applyTabsSidebar(true);
    persistTabsSidebarPrefs();
  });

  const divider = document.getElementById('tabs-sidebar-divider');
  const sidebar = document.getElementById('tabs-sidebar');

  divider?.addEventListener('mousedown', e => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = state.tabsSidebarWidth;
    divider.classList.add('dragging');
    sidebar.style.transition = 'none';

    function onMove(e) {
      state.tabsSidebarWidth = Math.max(120, Math.min(500, startWidth + (e.clientX - startX)));
      sidebar.style.width = `${state.tabsSidebarWidth}px`;
    }
    function onUp() {
      divider.classList.remove('dragging');
      sidebar.style.transition = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persistTabsSidebarPrefs();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function buildTabsList() {
  const sidebar = document.getElementById('tabs-sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = '';

  const list = document.createElement('div');
  list.id = 'tl-list';

  for (let i = 0; i < state.tabs.length; i++) {
    const tab = state.tabs[i];
    const item = document.createElement('div');
    item.className = 'tl-tab-item' + (i === state.activeTabIndex ? ' active' : '');

    const dot = document.createElement('div');
    dot.className = 'tl-dot';
    dot.style.background = tab.color;

    const label = document.createElement('span');
    label.className = 'tl-tab-label';
    label.textContent = tab.label;

    const actions = document.createElement('div');
    actions.className = 'tl-tab-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'tl-action-btn';
    editBtn.title = 'Edit tab';
    editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    editBtn.addEventListener('click', e => { e.stopPropagation(); openTabEditModal(i); });

    actions.appendChild(editBtn);

    if (state.tabs.length > 1) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tl-action-btn';
      deleteBtn.title = 'Delete tab';
      deleteBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      deleteBtn.addEventListener('click', e => { e.stopPropagation(); confirmDeleteTab(i); });
      actions.appendChild(deleteBtn);
    }

    item.appendChild(dot);
    item.appendChild(label);
    item.appendChild(actions);

    item.addEventListener('click', () => switchToTab(i));
    list.appendChild(item);
  }

  const createBtn = document.createElement('button');
  createBtn.className = 'tl-create-btn';
  createBtn.textContent = '+ Create Tab';
  createBtn.addEventListener('click', createTab);

  sidebar.appendChild(list);
  sidebar.appendChild(createBtn);
}

// ═══ Tab management ══════════════════════════════════════════════════════════

function createTabCanvas() {
  const el = document.createElement('div');
  el.className = 'tab-canvas hidden';
  document.getElementById('canvas-container').appendChild(el);
  return el;
}

function activeTab() {
  return state.tabs[state.activeTabIndex];
}

function switchToTab(index) {
  for (const tab of state.tabs) tab.canvasEl.classList.add('hidden');
  state.activeTabIndex = index;
  state.tabs[index].canvasEl.classList.remove('hidden');
  buildTabsList();
  scheduleSaveLayout();
}

function createTab() {
  const n = state.tabs.length + 1;
  const canvasEl = createTabCanvas();
  const tab = {
    id: generateId(),
    label: `Tab ${n}`,
    color: TAB_COLORS[0],
    layoutTree: null,
    canvasEl,
    leaves: new Map(),
  };
  state.tabs.push(tab);
  initCanvasDnD(tab);
  switchToTab(state.tabs.length - 1);
  scheduleSaveLayout();
}

async function deleteTab(index) {
  const tab = state.tabs[index];

  const leafIds = new Set();
  if (tab.layoutTree) collectLeafIds(tab.layoutTree, leafIds);

  for (const id of leafIds) {
    const info = tab.leaves.get(id);
    if (info) {
      try { info.cleanup?.(); } catch {}
      clearTimeout(info._saveTimer);
    }
  }
  tab.leaves.clear();
  tab.canvasEl.remove();

  for (const id of leafIds) {
    try {
      await fetch(
        `/api/tile-content?path=${encodeURIComponent(state.workspacePath)}&id=${id}`,
        { method: 'DELETE' }
      );
    } catch {}
  }

  state.tabs.splice(index, 1);

  if (state.tabs.length === 0) {
    createTab();
    return;
  }

  state.activeTabIndex = Math.min(state.activeTabIndex, state.tabs.length - 1);
  switchToTab(state.activeTabIndex);
  scheduleSaveLayout();
}

function openTabEditModal(index) {
  const tab = state.tabs[index];
  let selectedColor = tab.color;

  const overlay = document.createElement('div');
  overlay.id = 'md-tab-edit-overlay';

  const box = document.createElement('div');
  box.id = 'md-tab-edit-box';

  const swatchesHtml = TAB_COLORS.map(c =>
    `<div class="tl-color-swatch${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></div>`
  ).join('');

  box.innerHTML = `
    <label>Tab name</label>
    <input id="md-tab-edit-name" type="text" value="${escapeHtml(tab.label)}" maxlength="40" autocomplete="off">
    <label>Color</label>
    <div class="tl-color-swatches">${swatchesHtml}</div>
    <div id="md-tab-edit-buttons">
      <button class="md-btn-cancel" id="md-tab-edit-cancel">Cancel</button>
      <button class="md-btn-ok" id="md-tab-edit-save">Save</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const nameInput = box.querySelector('#md-tab-edit-name');
  nameInput.focus();
  nameInput.select();

  box.querySelectorAll('.tl-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      box.querySelectorAll('.tl-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  function dismiss() { overlay.remove(); }

  function save() {
    const newLabel = nameInput.value.trim() || tab.label;
    tab.label = newLabel;
    tab.color = selectedColor;
    dismiss();
    buildTabsList();
    scheduleSaveLayout();
  }

  box.querySelector('#md-tab-edit-cancel').addEventListener('click', dismiss);
  box.querySelector('#md-tab-edit-save').addEventListener('click', save);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) dismiss(); });
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') dismiss();
  });
}

function confirmDeleteTab(index) {
  const tab = state.tabs[index];
  const overlay = document.createElement('div');
  overlay.id = 'md-confirm-overlay';

  const box = document.createElement('div');
  box.id = 'md-confirm-box';
  box.innerHTML = `
    <p>Delete tab?</p>
    <span>Delete "${escapeHtml(tab.label)}"? All tile content on this tab will be removed. This cannot be undone.</span>
    <div id="md-confirm-buttons">
      <button id="md-confirm-cancel">Cancel</button>
      <button id="md-confirm-ok">Delete tab</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const cancel = box.querySelector('#md-confirm-cancel');
  const ok = box.querySelector('#md-confirm-ok');

  function dismiss() { overlay.remove(); }

  cancel.focus();
  cancel.addEventListener('click', dismiss);
  ok.addEventListener('click', () => { dismiss(); deleteTab(index); });
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
  });
}

// ═══ Tile definitions ════════════════════════════════════════════════════════

async function loadTileDefinitions() {
  try {
    const res = await fetch('/api/tiles');
    state.tiles = await res.json();
  } catch (e) {
    console.error('[tiles] Failed to load tile definitions:', e);
    state.tiles = [];
  }
  try {
    const res = await fetch('/api/plugins');
    state.plugins = await res.json();
  } catch (e) {
    console.error('[plugins] Failed to load plugin definitions:', e);
    state.plugins = [];
  }
}

// ═══ Tree operations (per-tab) ═══════════════════════════════════════════════

function findLeafAndParent(node, id, parent = null, side = null) {
  if (!node) return null;
  if (node.type === 'leaf') {
    return node.id === id ? { leaf: node, parent, side } : null;
  }
  return findLeafAndParent(node.a, id, node, 'a') || findLeafAndParent(node.b, id, node, 'b');
}

function replaceNode(tab, parent, side, newNode) {
  if (parent == null) {
    tab.layoutTree = newNode;
  } else {
    parent[side] = newNode;
  }
}

function buildSubtreeFromLayout(spec, seedJobs) {
  if (spec.type === 'leaf') {
    const id = generateId();
    if (spec.initCmd) seedJobs.push({ id, initCmd: spec.initCmd });
    return { type: 'leaf', id, tileType: spec.tileType, notifyState: null };
  }
  return {
    type: 'split',
    dir: spec.dir,
    ratio: spec.ratio,
    a: buildSubtreeFromLayout(spec.a, seedJobs),
    b: buildSubtreeFromLayout(spec.b, seedJobs),
  };
}

function firstLeafId(node) {
  if (!node) return null;
  if (node.type === 'leaf') return node.id;
  return firstLeafId(node.a) || firstLeafId(node.b);
}

// When inserting a multi-tile subtree (e.g. from a plugin layout) on an edge,
// align it with any parallel structure that already exists at the drop site.
// Example: dropping a vertical {terminal, notepad} pair on the right edge of a
// tile that's already the top of a vertical {terminal, notepad} should produce
// two columns side-by-side — not a nested split inside one column.
function findInsertAnchor(tab, targetLeafId, edge, subtreeNode) {
  const tree = tab.layoutTree;
  if (!tree) return null;
  const path = getPathToLeaf(tree, targetLeafId);
  if (path === null) return null;

  let leafNode = tree;
  for (const step of path) leafNode = step.splitNode[step.side];

  const newOuterDir = (edge === 'top' || edge === 'bottom') ? 'v' : 'h';
  const shouldPromote = subtreeNode.type === 'split'
    && newOuterDir !== subtreeNode.dir
    && path.length > 0;

  if (!shouldPromote) {
    const last = path.length > 0 ? path[path.length - 1] : null;
    return {
      anchorNode: leafNode,
      parent: last ? last.splitNode : null,
      side: last ? last.side : null,
    };
  }

  let i = path.length - 1;
  while (i >= 0 && path[i].splitNode.dir === subtreeNode.dir) i--;

  if (i === -1) {
    return { anchorNode: tab.layoutTree, parent: null, side: null };
  }
  const anchorNode = (i + 1 < path.length) ? path[i + 1].splitNode : leafNode;
  return {
    anchorNode,
    parent: path[i].splitNode,
    side: path[i].side,
  };
}

function insertSubtree(tab, targetLeafId, edge, subtreeNode) {
  if (!tab.layoutTree) {
    tab.layoutTree = subtreeNode;
    return;
  }
  const anchor = findInsertAnchor(tab, targetLeafId, edge, subtreeNode);
  if (!anchor) return;
  const { anchorNode, parent, side } = anchor;
  const dir = (edge === 'top' || edge === 'bottom') ? 'v' : 'h';
  const newOnA = (edge === 'top' || edge === 'left');
  const splitNode = {
    type: 'split',
    dir,
    ratio: 0.5,
    a: newOnA ? subtreeNode : anchorNode,
    b: newOnA ? anchorNode : subtreeNode,
  };
  replaceNode(tab, parent, side, splitNode);
}

function insertTile(tab, targetId, edge, newLeaf) {
  if (!tab.layoutTree) {
    tab.layoutTree = newLeaf;
    return;
  }
  const found = findLeafAndParent(tab.layoutTree, targetId);
  if (!found) return;
  const { leaf, parent, side } = found;

  const dir = (edge === 'top' || edge === 'bottom') ? 'v' : 'h';
  const newOnA = (edge === 'top' || edge === 'left');
  const splitNode = {
    type: 'split',
    dir,
    ratio: 0.5,
    a: newOnA ? newLeaf : leaf,
    b: newOnA ? leaf    : newLeaf,
  };
  replaceNode(tab, parent, side, splitNode);
}

function removeLeaf(tab, id) {
  const found = findLeafAndParent(tab.layoutTree, id);
  if (!found) return;
  const { parent, side } = found;
  if (parent == null) {
    tab.layoutTree = null;
    return;
  }
  const sibling = side === 'a' ? parent.b : parent.a;
  const grand = findParentOf(tab.layoutTree, parent);
  if (grand == null || grand.parent == null) {
    tab.layoutTree = sibling;
  } else {
    grand.parent[grand.side] = sibling;
  }
}

function findParentOf(node, target, parent = null, side = null) {
  if (!node || node.type === 'leaf') return null;
  if (node === target) return { parent, side };
  return findParentOf(node.a, target, node, 'a') || findParentOf(node.b, target, node, 'b');
}

function swapLeaves(tab, idA, idB) {
  if (idA === idB) return;
  const fa = findLeafAndParent(tab.layoutTree, idA);
  const fb = findLeafAndParent(tab.layoutTree, idB);
  if (!fa || !fb) return;
  replaceNode(tab, fa.parent, fa.side, fb.leaf);
  replaceNode(tab, fb.parent, fb.side, fa.leaf);
}

function findTabForLeaf(id) {
  for (const tab of state.tabs) {
    if (tab.leaves.has(id)) return tab;
  }
  return null;
}

function getPathToLeaf(node, id) {
  if (node.type === 'leaf') return node.id === id ? [] : null;
  const pathA = getPathToLeaf(node.a, id);
  if (pathA !== null) return [{ splitNode: node, side: 'a' }, ...pathA];
  const pathB = getPathToLeaf(node.b, id);
  if (pathB !== null) return [{ splitNode: node, side: 'b' }, ...pathB];
  return null;
}

function expandTile(leafId) {
  const tab = findTabForLeaf(leafId);
  if (!tab || !tab.layoutTree) return;
  const tileEl = document.getElementById(`tile-${leafId}`);
  if (!tileEl) return;

  const path = getPathToLeaf(tab.layoutTree, leafId);
  if (!path || path.length === 0) return;

  const domSplits = [];
  let cur = tileEl.closest('.pane');
  while (cur) {
    const splitEl = cur.parentElement;
    if (!splitEl?.classList.contains('split')) break;
    domSplits.push(splitEl);
    cur = splitEl.closest('.pane');
  }
  domSplits.reverse();

  const splitterPx = 7;
  for (let i = 0; i < path.length; i++) {
    const { splitNode, side } = path[i];
    const splitEl = domSplits[i];
    if (!splitEl) continue;

    const isH = splitNode.dir === 'h';
    const rect = splitEl.getBoundingClientRect();
    const total = isH ? rect.width : rect.height;
    const usable = total - splitterPx;
    if (usable <= 0) continue;

    const minTile = isH ? MIN_TILE_W : MIN_TILE_H;
    const minRatio = minTile / usable;
    const maxRatio = (usable - minTile) / usable;
    const newRatio = side === 'a' ? maxRatio : minRatio;

    splitNode.ratio = newRatio;
    const panes = splitEl.querySelectorAll(':scope > .pane');
    if (panes[0]) panes[0].style.flex = `${newRatio} 0 0`;
    if (panes[1]) panes[1].style.flex = `${1 - newRatio} 0 0`;
  }

  scheduleSaveLayout();
}

// ═══ Render (diff-by-id to preserve tile DOM) ═══════════════════════════════

function renderTree(tab) {
  const canvas = tab.canvasEl;
  if (!canvas) return;

  const newLeafIds = new Set();
  if (tab.layoutTree) collectLeafIds(tab.layoutTree, newLeafIds);

  for (const [id, info] of tab.leaves) {
    if (newLeafIds.has(id) && info.el && info.el.parentNode) {
      info.el.parentNode.removeChild(info.el);
    }
  }

  canvas.innerHTML = '';

  if (tab.layoutTree) {
    canvas.appendChild(renderNode(tab, tab.layoutTree));
  }

  for (const id of [...tab.leaves.keys()]) {
    if (!newLeafIds.has(id)) {
      const info = tab.leaves.get(id);
      if (typeof info.cleanup === 'function') {
        try { info.cleanup(); } catch (e) { console.error('[tiles] cleanup error:', e); }
      }
      clearTimeout(info._saveTimer);
      tab.leaves.delete(id);
    }
  }

  if (state.focusedId && tab.leaves.has(state.focusedId)) {
    tab.leaves.get(state.focusedId).el?.classList.add('focused');
  }
}

function collectLeafIds(node, set) {
  if (node.type === 'leaf') {
    set.add(node.id);
    return;
  }
  collectLeafIds(node.a, set);
  collectLeafIds(node.b, set);
}

function renderNode(tab, node) {
  if (node.type === 'leaf') return renderLeaf(tab, node);

  const splitEl = document.createElement('div');
  splitEl.className = 'split';
  splitEl.dataset.dir = node.dir;

  const paneA = document.createElement('div');
  paneA.className = 'pane';
  paneA.style.flex = `${node.ratio} 0 0`;
  paneA.appendChild(renderNode(tab, node.a));

  const splitter = document.createElement('div');
  splitter.className = 'splitter';
  initSplitterDrag(splitter, node, paneA, splitEl);

  const paneB = document.createElement('div');
  paneB.className = 'pane';
  paneB.style.flex = `${1 - node.ratio} 0 0`;
  paneB.appendChild(renderNode(tab, node.b));

  splitEl.appendChild(paneA);
  splitEl.appendChild(splitter);
  splitEl.appendChild(paneB);
  return splitEl;
}

function renderLeaf(tab, leafNode) {
  const cached = tab.leaves.get(leafNode.id);
  if (cached?.el) {
    cached.el.classList.toggle('notify',       leafNode.notifyState === 'notify');
    cached.el.classList.toggle('stale-notify', leafNode.notifyState === 'stale-notify');
    cached.notifyState = leafNode.notifyState;
    return cached.el;
  }
  const el = buildTileElement(leafNode);
  const contentEl = el.querySelector('.tile-content');
  tab.leaves.set(leafNode.id, {
    el,
    contentEl,
    cleanup: null,
    _saveTimer: null,
    tileType: leafNode.tileType,
    notifyState: leafNode.notifyState,
  });
  mountTileContent(tab, leafNode, contentEl).catch(e => console.error('[tiles] mount error:', e));
  return el;
}

// ═══ Tile element ════════════════════════════════════════════════════════════

function buildTileElement(leafNode) {
  const def = state.tiles.find(t => t.name === leafNode.tileType);
  const label = def?.label ?? leafNode.tileType;

  const el = document.createElement('div');
  el.className = 'tile';
  el.id = `tile-${leafNode.id}`;
  el.title = label;
  el.setAttribute('aria-label', label);
  if (leafNode.notifyState === 'notify')       el.classList.add('notify');
  if (leafNode.notifyState === 'stale-notify') el.classList.add('stale-notify');

  const titlebar = document.createElement('div');
  titlebar.className = 'tile-titlebar';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'tile-expand';
  expandBtn.title = 'Expand';
  expandBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 3 L1 1 L3 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 5 L7 7 L5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tile-close';
  closeBtn.title = 'Close';
  closeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  titlebar.appendChild(expandBtn);
  titlebar.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'tile-content';

  el.appendChild(titlebar);
  el.appendChild(content);

  el.addEventListener('mousedown', () => focusTile(leafNode.id));

  expandBtn.addEventListener('click', e => {
    e.stopPropagation();
    expandTile(leafNode.id);
  });

  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    confirmCloseTile(leafNode.id);
  });

  initTileMoveDrag(titlebar, leafNode.id);

  return el;
}

// ═══ Focus ═══════════════════════════════════════════════════════════════════

function focusTile(id) {
  if (state.focusedId === id) return;
  if (state.focusedId) {
    findTabForLeaf(state.focusedId)?.leaves.get(state.focusedId)?.el?.classList.remove('focused');
  }
  state.focusedId = id;
  findTabForLeaf(id)?.leaves.get(id)?.el?.classList.add('focused');
}

function blurAll() {
  if (state.focusedId) {
    findTabForLeaf(state.focusedId)?.leaves.get(state.focusedId)?.el?.classList.remove('focused');
    state.focusedId = null;
  }
}

// ═══ Splitter drag ════════════════════════════════════════════════════════════

function initSplitterDrag(splitterEl, splitNode, paneAEl, splitContainerEl) {
  splitterEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    splitterEl.classList.add('dragging');

    const rect = splitContainerEl.getBoundingClientRect();
    const isH = splitNode.dir === 'h';
    const total = isH ? rect.width : rect.height;
    const splitterPx = 7;
    const usable = total - splitterPx;
    if (usable <= 0) return;

    const minA = isH ? MIN_TILE_W : MIN_TILE_H;
    const minB = isH ? MIN_TILE_W : MIN_TILE_H;
    const minRatio = minA / usable;
    const maxRatio = (usable - minB) / usable;

    const start = isH ? rect.left : rect.top;
    const paneB = splitContainerEl.querySelector(':scope > .pane:last-child');

    function onMove(e) {
      const coord = isH ? e.clientX : e.clientY;
      let r = (coord - start - splitterPx / 2) / usable;
      r = Math.max(minRatio, Math.min(maxRatio, r));
      splitNode.ratio = r;
      paneAEl.style.flex = `${r} 0 0`;
      if (paneB) paneB.style.flex = `${1 - r} 0 0`;
    }
    function onUp() {
      splitterEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      scheduleSaveLayout();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ═══ Drop preview ════════════════════════════════════════════════════════════

function ensureDropPreview(canvasEl) {
  let preview = canvasEl.querySelector('.tile-drop-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'tile-drop-preview';
    canvasEl.appendChild(preview);
  }
  return preview;
}

function hideDropPreview(canvasEl) {
  canvasEl?.querySelector('.tile-drop-preview')?.remove();
}

function pickDropTarget(tab, clientX, clientY) {
  const canvas = tab.canvasEl;
  if (!canvas) return null;
  if (!tab.layoutTree) {
    const cr = canvas.getBoundingClientRect();
    return { tileEl: null, leafId: null, edge: 'root', rect: cr };
  }
  const elAtPoint = document.elementFromPoint(clientX, clientY);
  if (!elAtPoint) return null;
  const tileEl = elAtPoint.closest('.tile');
  if (!tileEl || !canvas.contains(tileEl)) return null;
  if (tileEl.closest('.tile-content')) return null;
  const leafId = tileEl.id.replace(/^tile-/, '');
  const rect = tileEl.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;

  if (relX >= 0.25 && relX <= 0.75 && relY >= 0.25 && relY <= 0.75) {
    return { tileEl, leafId, edge: 'center', rect };
  }
  const distLeft   = relX;
  const distRight  = 1 - relX;
  const distTop    = relY;
  const distBottom = 1 - relY;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  let edge;
  if (min === distLeft)        edge = 'left';
  else if (min === distRight)  edge = 'right';
  else if (min === distTop)    edge = 'top';
  else                         edge = 'bottom';
  return { tileEl, leafId, edge, rect };
}

function showDropPreview(tab, target) {
  const canvas = tab.canvasEl;
  const canvasRect = canvas.getBoundingClientRect();
  const preview = ensureDropPreview(canvas);
  preview.classList.toggle('swap', target.edge === 'center');

  const r = target.rect;
  let left   = r.left - canvasRect.left;
  let top    = r.top  - canvasRect.top;
  let width  = r.width;
  let height = r.height;

  if (target.edge === 'left')   width  = r.width / 2;
  if (target.edge === 'right')  { left += r.width / 2; width = r.width / 2; }
  if (target.edge === 'top')    height = r.height / 2;
  if (target.edge === 'bottom') { top  += r.height / 2; height = r.height / 2; }

  preview.style.left   = `${left}px`;
  preview.style.top    = `${top}px`;
  preview.style.width  = `${width}px`;
  preview.style.height = `${height}px`;
}

// ═══ Per-tab canvas DnD ══════════════════════════════════════════════════════

function initCanvasDnD(tab) {
  const canvas = tab.canvasEl;

  canvas.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('tile-name') && !e.dataTransfer.types.includes('plugin-name')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const target = pickDropTarget(tab, e.clientX, e.clientY);
    if (target) showDropPreview(tab, target);
    else hideDropPreview(canvas);
  });

  canvas.addEventListener('dragleave', e => {
    if (!canvas.contains(e.relatedTarget)) hideDropPreview(canvas);
  });

  canvas.addEventListener('drop', async e => {
    const tileName = e.dataTransfer.getData('tile-name');
    const pluginName = e.dataTransfer.getData('plugin-name');
    if (!tileName && !pluginName) return;
    e.preventDefault();
    const target = pickDropTarget(tab, e.clientX, e.clientY);
    hideDropPreview(canvas);
    if (!target) return;

    let rootNode = null;
    let focusId = null;
    const seedJobs = [];

    if (pluginName) {
      const plugin = state.plugins.find(p => p.name === pluginName);
      if (!plugin) return;
      if (plugin.layout) {
        rootNode = buildSubtreeFromLayout(plugin.layout, seedJobs);
        focusId = firstLeafId(rootNode);
      } else {
        const id = generateId();
        rootNode = { type: 'leaf', id, tileType: plugin.tileType, notifyState: null };
        focusId = id;
        if (plugin.initCmd) seedJobs.push({ id, initCmd: plugin.initCmd });
      }
    } else {
      const id = generateId();
      rootNode = { type: 'leaf', id, tileType: tileName, notifyState: null };
      focusId = id;
    }

    if (seedJobs.length) {
      try {
        await Promise.all(seedJobs.map(({ id, initCmd }) =>
          fetch(
            `/api/tile-content?path=${encodeURIComponent(state.workspacePath)}&id=${id}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: { initCmd } }),
            }
          )
        ));
      } catch (err) {
        console.error('[plugins] Failed to pre-seed initCmd:', err);
      }
    }

    if (target.edge === 'root') {
      tab.layoutTree = rootNode;
    } else if (target.edge === 'center') {
      insertSubtree(tab, target.leafId, 'left', rootNode);
    } else {
      insertSubtree(tab, target.leafId, target.edge, rootNode);
    }
    renderTree(tab);
    if (focusId) focusTile(focusId);
    scheduleSaveLayout();
  });
}

function initGlobalListeners() {
  document.addEventListener('mousedown', e => {
    if (e.target instanceof Element && e.target.closest('.tile')) return;
    blurAll();
  });

  document.getElementById('md-titlebar')?.addEventListener('mousedown', blurAll);

  window.addEventListener('blur',  () => document.body.classList.add('window-blurred'));
  window.addEventListener('focus', () => document.body.classList.remove('window-blurred'));
}

// ═══ Tile titlebar → move/swap ════════════════════════════════════════════════

let activeMoveDrag = null;

function initTileMoveDrag(titlebar, sourceId) {
  titlebar.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.tile-close')) return;
    e.preventDefault();
    activeMoveDrag = { sourceId, target: null };

    function onMove(ev) {
      const tab = findTabForLeaf(sourceId);
      if (!tab) return;
      const target = pickDropTarget(tab, ev.clientX, ev.clientY);
      if (target && target.leafId === sourceId) {
        hideDropPreview(tab.canvasEl);
        activeMoveDrag.target = null;
        return;
      }
      if (target) {
        showDropPreview(tab, target);
        activeMoveDrag.target = target;
      } else {
        hideDropPreview(tab.canvasEl);
        activeMoveDrag.target = null;
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const tab = findTabForLeaf(sourceId);
      if (tab) hideDropPreview(tab.canvasEl);
      const drag = activeMoveDrag;
      activeMoveDrag = null;
      if (!drag || !drag.target) return;
      applyMove(drag.sourceId, drag.target);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function applyMove(sourceId, target) {
  const tab = findTabForLeaf(sourceId);
  if (!tab) return;
  if (target.edge === 'root') return;
  if (target.edge === 'center') {
    swapLeaves(tab, sourceId, target.leafId);
  } else {
    const found = findLeafAndParent(tab.layoutTree, sourceId);
    if (!found) return;
    const sourceLeaf = found.leaf;
    removeLeaf(tab, sourceId);
    if (!tab.layoutTree) {
      tab.layoutTree = sourceLeaf;
    } else {
      insertTile(tab, target.leafId, target.edge, sourceLeaf);
    }
  }
  renderTree(tab);
  focusTile(sourceId);
  scheduleSaveLayout();
}

// ═══ Mount tile content ═══════════════════════════════════════════════════════

async function mountTileContent(tab, leafNode, contentEl) {
  const tileDef = state.tiles.find(t => t.name === leafNode.tileType);
  if (!tileDef) return;

  const htmlRes = await fetch(`/tiles/${leafNode.tileType}/tile.html`);
  if (!htmlRes.ok) return;
  contentEl.innerHTML = await htmlRes.text();

  if (!tileDef.hasJs) return;

  let mod;
  try {
    mod = await import(`/tiles/${leafNode.tileType}/tile.js`);
  } catch (e) {
    console.error(`[tiles] Failed to load tile.js for ${leafNode.tileType}:`, e);
    return;
  }
  if (typeof mod.mount !== 'function') return;

  const api = buildTileApi(tab, leafNode.id);
  try {
    const cleanup = await mod.mount(contentEl, api);
    const info = tab.leaves.get(leafNode.id);
    if (info) info.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (e) {
    console.error(`[tiles] mount() error for ${leafNode.tileType}:`, e);
  }
}

function buildTileApi(tab, leafId) {
  return {
    tileId: leafId,
    async getContent() {
      try {
        const res = await fetch(
          `/api/tile-content?path=${encodeURIComponent(state.workspacePath)}&id=${leafId}`
        );
        if (res.status === 404) return null;
        const data = await res.json();
        return data.content ?? null;
      } catch { return null; }
    },
    saveContent(data) {
      const info = tab.leaves.get(leafId);
      if (!info) return;
      clearTimeout(info._saveTimer);
      info._saveTimer = setTimeout(async () => {
        try {
          await fetch(
            `/api/tile-content?path=${encodeURIComponent(state.workspacePath)}&id=${leafId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: data }),
            }
          );
        } catch (e) { console.error('[tiles] saveContent error:', e); }
      }, 1000);
    },
  };
}

// ═══ Close tile ═══════════════════════════════════════════════════════════════

async function closeTile(id) {
  const tab = findTabForLeaf(id);
  if (!tab) {
    // Fall back to searching all tabs' layout trees
    const fallbackTab = state.tabs.find(t => findLeafAndParent(t.layoutTree, id));
    if (!fallbackTab) return;
    return closeTileInTab(fallbackTab, id);
  }
  return closeTileInTab(tab, id);
}

async function closeTileInTab(tab, id) {
  if (!findLeafAndParent(tab.layoutTree, id)) return;
  removeLeaf(tab, id);
  renderTree(tab);
  if (state.focusedId === id) state.focusedId = null;
  try {
    await fetch(
      `/api/tile-content?path=${encodeURIComponent(state.workspacePath)}&id=${id}`,
      { method: 'DELETE' }
    );
  } catch { /* ignore */ }
  scheduleSaveLayout();
}

// ═══ Layout persistence ═══════════════════════════════════════════════════════

function scheduleSaveLayout() {
  clearTimeout(state.saveLayoutTimer);
  state.saveLayoutTimer = setTimeout(saveLayout, 500);
}

function serializeNode(node) {
  if (!node) return null;
  if (node.type === 'leaf') {
    return { type: 'leaf', id: node.id, tileType: node.tileType, notifyState: node.notifyState ?? null };
  }
  return {
    type: 'split',
    dir: node.dir,
    ratio: node.ratio,
    a: serializeNode(node.a),
    b: serializeNode(node.b),
  };
}

async function saveLayout() {
  try {
    const data = {
      version: 2,
      activeTabIndex: state.activeTabIndex,
      tabs: state.tabs.map(t => ({
        id: t.id,
        label: t.label,
        color: t.color,
        layoutTree: serializeNode(t.layoutTree),
      })),
    };
    await fetch(
      `/api/layout?path=${encodeURIComponent(state.workspacePath)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
  } catch (e) { console.error('[tiles] saveLayout error:', e); }
}

function validateAndCleanTree(node, knownTypes) {
  if (!node) return null;
  if (node.type === 'leaf') {
    if (typeof node.id !== 'string' || typeof node.tileType !== 'string') return null;
    if (!knownTypes.has(node.tileType)) {
      console.warn(`[tiles] Layout references unknown tile type "${node.tileType}"; skipping`);
      return null;
    }
    return { type: 'leaf', id: node.id, tileType: node.tileType, notifyState: node.notifyState ?? null };
  }
  if (node.type === 'split') {
    const a = validateAndCleanTree(node.a, knownTypes);
    const b = validateAndCleanTree(node.b, knownTypes);
    if (a && b) {
      const dir = (node.dir === 'h' || node.dir === 'v') ? node.dir : 'h';
      const ratio = (typeof node.ratio === 'number' && node.ratio > 0 && node.ratio < 1) ? node.ratio : 0.5;
      return { type: 'split', dir, ratio, a, b };
    }
    return a || b || null;
  }
  return null;
}

async function loadLayout() {
  try {
    const res = await fetch(`/api/layout?path=${encodeURIComponent(state.workspacePath)}`);
    if (res.status === 404) {
      // Fresh workspace — default tab already created in init()
      renderTree(activeTab());
      return;
    }
    const data = await res.json();
    const knownTypes = new Set(state.tiles.map(t => t.name));

    if (data?.version === 2 && Array.isArray(data.tabs) && data.tabs.length > 0) {
      // Remove the default tab canvas created in init()
      state.tabs[0].canvasEl.remove();
      state.tabs = [];

      for (const tabData of data.tabs) {
        const canvasEl = createTabCanvas();
        const tab = {
          id: typeof tabData.id === 'string' ? tabData.id : generateId(),
          label: typeof tabData.label === 'string' ? tabData.label : 'Tab',
          color: TAB_COLORS.includes(tabData.color) ? tabData.color : TAB_COLORS[0],
          layoutTree: validateAndCleanTree(tabData.layoutTree ?? null, knownTypes),
          canvasEl,
          leaves: new Map(),
        };
        state.tabs.push(tab);
        initCanvasDnD(tab);
      }
      state.activeTabIndex = Math.min(data.activeTabIndex ?? 0, state.tabs.length - 1);

    } else if (data && 'tree' in data) {
      // v1 layout — wrap in default tab
      state.tabs[0].layoutTree = validateAndCleanTree(data.tree, knownTypes);

    } else {
      console.warn('[tiles] Layout file in unrecognized format; starting empty');
    }

    // Show active tab, render it
    for (const tab of state.tabs) tab.canvasEl.classList.add('hidden');
    const tab = state.tabs[state.activeTabIndex];
    tab.canvasEl.classList.remove('hidden');
    renderTree(tab);
    buildTabsList();

  } catch (e) { console.error('[tiles] loadLayout error:', e); }
}

// ═══ Close confirmation ═══════════════════════════════════════════════════════

function injectConfirmModalStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #md-confirm-overlay {
      position: fixed;
      inset: 0;
      z-index: 20000;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #md-confirm-box {
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 20px 24px;
      min-width: 260px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      color: #ddd;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    }
    #md-confirm-box p {
      margin: 0 0 6px;
      font-size: 14px;
      font-weight: 600;
      color: #eee;
    }
    #md-confirm-box span {
      font-size: 12px;
      color: #888;
    }
    #md-confirm-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
    #md-confirm-cancel {
      background: transparent;
      border: 1px solid #666;
      border-radius: 4px;
      color: #ccc;
      padding: 5px 12px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      cursor: pointer;
    }
    #md-confirm-cancel:hover { border-color: #999; color: #eee; }
    #md-confirm-ok {
      background: #c0392b;
      border: 1px solid #a93226;
      border-radius: 4px;
      color: #fff;
      padding: 5px 12px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      cursor: pointer;
    }
    #md-confirm-ok:hover { background: #a93226; }
  `;
  document.head.appendChild(style);
}

function confirmCloseTile(id) {
  const overlay = document.createElement('div');
  overlay.id = 'md-confirm-overlay';

  const box = document.createElement('div');
  box.id = 'md-confirm-box';
  box.innerHTML = `
    <p>Close tile?</p>
    <span>This cannot be undone.</span>
    <div id="md-confirm-buttons">
      <button id="md-confirm-cancel">Cancel</button>
      <button id="md-confirm-ok">Close tile</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const cancel = box.querySelector('#md-confirm-cancel');
  const ok = box.querySelector('#md-confirm-ok');

  function dismiss() { overlay.remove(); }

  cancel.focus();
  cancel.addEventListener('click', dismiss);
  ok.addEventListener('click', () => { dismiss(); closeTile(id); });
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
    else if (e.key === 'Enter') { dismiss(); closeTile(id); document.removeEventListener('keydown', onKey); }
  });
}

function confirmClearAll() {
  showConfirm(
    'Clear all tiles?',
    'All tiles on this tab will be closed and their saved content deleted. This cannot be undone.',
    'Clear all',
    clearAll
  );
}

async function clearAll() {
  const tab = activeTab();
  tab.layoutTree = null;
  state.focusedId = null;
  renderTree(tab);
  scheduleSaveLayout();
  try {
    await fetch(
      `/api/workspace-tiles?path=${encodeURIComponent(state.workspacePath)}`,
      { method: 'DELETE' }
    );
  } catch { /* ignore */ }
}

function confirmClearProject() {
  showConfirm(
    'Clear current project?',
    'All tabs and their tile content for this workspace will be permanently deleted.',
    'Clear project',
    clearProject
  );
}

async function clearProject() {
  // Unmount all leaves across all tabs
  for (const tab of state.tabs) {
    for (const info of tab.leaves.values()) {
      try { info.cleanup?.(); } catch {}
      clearTimeout(info._saveTimer);
    }
    tab.leaves.clear();
    tab.canvasEl.remove();
  }
  state.focusedId = null;

  // Reset to a single empty tab
  const canvasEl = createTabCanvas();
  canvasEl.classList.remove('hidden');
  state.tabs = [{ id: generateId(), label: 'Tab 1', color: TAB_COLORS[0], layoutTree: null, canvasEl, leaves: new Map() }];
  state.activeTabIndex = 0;
  initCanvasDnD(state.tabs[0]);
  buildTabsList();

  try {
    await fetch(
      `/api/project?path=${encodeURIComponent(state.workspacePath)}`,
      { method: 'DELETE' }
    );
  } catch { /* ignore */ }
  scheduleSaveLayout();
}

function confirmClearAllProjects() {
  showConfirm(
    'Clear all projects?',
    'All workspace layouts and tile content across every project will be permanently deleted.',
    'Clear all projects',
    clearAllProjects
  );
}

async function clearAllProjects() {
  await clearProject();
  clearTimeout(state.saveLayoutTimer);
  state.saveLayoutTimer = null;
  try {
    await fetch('/api/all-projects', { method: 'DELETE' });
  } catch { /* ignore */ }
}

function showConfirm(title, body, okLabel, onOk) {
  const overlay = document.createElement('div');
  overlay.id = 'md-confirm-overlay';
  const box = document.createElement('div');
  box.id = 'md-confirm-box';
  box.innerHTML = `
    <p>${escapeHtml(title)}</p>
    <span>${escapeHtml(body)}</span>
    <div id="md-confirm-buttons">
      <button id="md-confirm-cancel">Cancel</button>
      <button id="md-confirm-ok">${escapeHtml(okLabel)}</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function dismiss() { overlay.remove(); }
  box.querySelector('#md-confirm-cancel').focus();
  box.querySelector('#md-confirm-cancel').addEventListener('click', dismiss);
  box.querySelector('#md-confirm-ok').addEventListener('click', () => { dismiss(); onOk(); });
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
  });
}

// ═══ Context menu (Copy / Paste) ══════════════════════════════════════════════

function injectContextMenuStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #md-ctx-menu {
      position: fixed;
      z-index: 10000;
      min-width: 140px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.5);
      padding: 4px 0;
      font-family: ${FONT_STACK};
      font-size: 13px;
      color: #ddd;
      user-select: none;
    }
    #md-ctx-menu .md-ctx-item {
      padding: 6px 14px;
      cursor: default;
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    #md-ctx-menu .md-ctx-item:hover:not(.disabled) { background: #3a6ea5; color: #fff; }
    #md-ctx-menu .md-ctx-item.disabled { color: #666; cursor: default; }
    #md-ctx-menu .md-ctx-shortcut { color: #888; }
    #md-ctx-menu .md-ctx-item:hover:not(.disabled) .md-ctx-shortcut { color: #cfd6e0; }
    #md-ctx-menu .md-ctx-sep { height: 1px; background: #3a3a3a; margin: 4px 0; }
  `;
  document.head.appendChild(style);
}

function closeContextMenu() {
  document.getElementById('md-ctx-menu')?.remove();
}

function tileContentEl(tileEl) {
  return tileEl?.querySelector('.tile-content') ?? null;
}

function focusedEditable() {
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && !ae.disabled && !ae.readOnly) return ae;
  return null;
}

function getContextSelection(tileEl) {
  const content = tileContentEl(tileEl);
  if (content) {
    const ev = new CustomEvent('md-get-selection', {
      detail: { text: null, editable: false, onCopied: null },
    });
    content.dispatchEvent(ev);
    if (ev.detail.text != null || ev.detail.editable) return ev.detail;
  }
  const ae = focusedEditable();
  if (ae) {
    const s = ae.selectionStart, e = ae.selectionEnd;
    const text = (s != null && e != null && e > s) ? ae.value.slice(s, e) : null;
    return { text, editable: true, onCopied: null, _input: ae };
  }
  const winSel = window.getSelection?.().toString();
  return { text: winSel || null, editable: false, onCopied: null };
}

function applyContextPaste(tileEl, text) {
  if (!text) return;
  const content = tileContentEl(tileEl);
  if (content) {
    const ev = new CustomEvent('md-paste', { detail: { text }, cancelable: true });
    content.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
  }
  const ae = focusedEditable();
  if (ae) {
    const s = ae.selectionStart ?? ae.value.length;
    const e = ae.selectionEnd ?? ae.value.length;
    ae.setRangeText(text, s, e, 'end');
    ae.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function applyContextDelete(tileEl, sel) {
  const content = tileContentEl(tileEl);
  if (content) {
    const ev = new CustomEvent('md-delete', { cancelable: true });
    content.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
  }
  const ae = sel?._input ?? focusedEditable();
  if (ae) {
    const s = ae.selectionStart, e = ae.selectionEnd;
    if (s != null && e != null && e > s) {
      ae.setRangeText('', s, e, 'start');
      ae.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

function applyContextSelectAll(tileEl) {
  const content = tileContentEl(tileEl);
  if (content) {
    const ev = new CustomEvent('md-select-all', { cancelable: true });
    content.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
  }
  const ae = focusedEditable();
  if (ae) { ae.select(); return; }
  if (content) {
    const range = document.createRange();
    range.selectNodeContents(content);
    const winSel = window.getSelection();
    winSel.removeAllRanges();
    winSel.addRange(range);
  }
}

async function showContextMenu(x, y, tileEl) {
  closeContextMenu();
  const sel = getContextSelection(tileEl);
  let clipboardText = '';
  try { clipboardText = await navigator.clipboard.readText(); } catch { /* permission denied */ }

  const hasSel   = !!sel.text;
  const editable = !!sel.editable;
  const canCut   = hasSel && editable;
  const canPaste = !!clipboardText;
  const canDelete = hasSel && editable;

  const menu = document.createElement('div');
  menu.id = 'md-ctx-menu';
  menu.innerHTML = `
    <div class="md-ctx-item${canCut    ? '' : ' disabled'}" data-act="cut">
      <span>Cut</span><span class="md-ctx-shortcut">Ctrl+X</span>
    </div>
    <div class="md-ctx-item${hasSel   ? '' : ' disabled'}" data-act="copy">
      <span>Copy</span><span class="md-ctx-shortcut">Ctrl+C</span>
    </div>
    <div class="md-ctx-item${canPaste  ? '' : ' disabled'}" data-act="paste">
      <span>Paste</span><span class="md-ctx-shortcut">Ctrl+V</span>
    </div>
    <div class="md-ctx-item${canDelete ? '' : ' disabled'}" data-act="delete">
      <span>Delete</span><span class="md-ctx-shortcut">Del</span>
    </div>
    <div class="md-ctx-sep"></div>
    <div class="md-ctx-item" data-act="select-all">
      <span>Select All</span><span class="md-ctx-shortcut">Ctrl+A</span>
    </div>
  `;
  document.body.appendChild(menu);

  const r = menu.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = `${Math.min(x, vw - r.width - 4)}px`;
  menu.style.top  = `${Math.min(y, vh - r.height - 4)}px`;

  menu.addEventListener('mousedown', e => e.stopPropagation());
  menu.addEventListener('click', async e => {
    const item = e.target.closest('.md-ctx-item');
    if (!item || item.classList.contains('disabled')) return;
    const act = item.dataset.act;
    closeContextMenu();
    if (act === 'copy' && sel.text) {
      try { await navigator.clipboard.writeText(sel.text); } catch {}
      sel.onCopied?.();
    } else if (act === 'cut' && sel.text) {
      try { await navigator.clipboard.writeText(sel.text); } catch {}
      applyContextDelete(tileEl, sel);
    } else if (act === 'paste' && clipboardText) {
      applyContextPaste(tileEl, clipboardText);
    } else if (act === 'delete' && sel.text) {
      applyContextDelete(tileEl, sel);
    } else if (act === 'select-all') {
      applyContextSelectAll(tileEl);
    }
  });
}

function initContextMenu() {
  injectContextMenuStyles();
  document.addEventListener('contextmenu', e => {
    const tileEl = e.target instanceof Element ? e.target.closest('.tile') : null;
    if (!tileEl) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, tileEl);
  });
  document.addEventListener('mousedown', e => {
    if (!(e.target instanceof Element) || !e.target.closest('#md-ctx-menu')) closeContextMenu();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeContextMenu();
  });
  window.addEventListener('blur', closeContextMenu);
}

// ═══ Preferences modal ═══════════════════════════════════════════════════════

function openPreferencesModalWithState() {
  openPreferencesModal({
    onApply({ hiddenTiles }) {
      state.hiddenTiles = hiddenTiles;
      persistSidebarPrefs();
      const search = document.getElementById('sb-search');
      renderTileList(search ? search.value.trim().toLowerCase() : '');
    },
  });
}


// ═══ Entry point ══════════════════════════════════════════════════════════════

export async function init(opts) {
  state.workspacePath = opts.workspacePath ?? '';
  injectStyles();
  injectConfirmModalStyles();

  // Create default tab before loading anything
  const defaultCanvas = createTabCanvas();
  defaultCanvas.classList.remove('hidden');
  state.tabs = [{
    id: generateId(),
    label: 'Tab 1',
    color: TAB_COLORS[0],
    layoutTree: null,
    canvasEl: defaultCanvas,
    leaves: new Map(),
  }];
  initCanvasDnD(state.tabs[0]);

  const prefs = await loadPreferences();
  initSidebar(prefs);
  initTabsSidebar(prefs);

  await loadTileDefinitions();
  buildSidebar();
  buildTabsList();
  await loadLayout();
  initGlobalListeners();
  initContextMenu();
  window.addEventListener('md-open-preferences', openPreferencesModalWithState);
  window.addEventListener('md-clear-project', confirmClearProject);
  window.addEventListener('md-clear-all-projects', confirmClearAllProjects);
  window.addEventListener('md-reload-defs', async () => {
    try {
      const res = await fetch('/api/reload-defs', { method: 'POST' });
      const data = await res.json();
      console.log(`[reload] tiles: ${data.tiles}, plugins: ${data.plugins}`);
    } catch (e) { console.error('[reload]', e); }
    await loadTileDefinitions();
    buildSidebar();
  });
}
