// Tile canvas framework — i3-style BSP tiling layout.

const SIDEBAR_DEFAULT_WIDTH = 280;
const MIN_TILE_W = 150;
const MIN_TILE_H = 100;
const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, Ubuntu, sans-serif`;

const state = {
  workspacePath: '',
  tiles: [],                          // tile definitions from /api/tiles
  layoutTree: null,                   // Node | null
  leaves: new Map(),                  // id → { el, contentEl, cleanup, _saveTimer, tileType, notifyState }
  focusedId: null,
  saveLayoutTimer: null,
  sidebarOpen: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  activeTab: 'tiles',
};

// ═══ Styles ═════════════════════════════════════════════════════════════════

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Canvas ── */
    #tile-canvas {
      position: absolute;
      inset: 0;
      display: flex;
      overflow: hidden;
      padding: 6px;
      font-family: ${FONT_STACK};
    }

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
    /* Focus/notify indicator — painted on top of content via overlay */
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
    #tile-drop-preview {
      position: absolute;
      pointer-events: none;
      border: 2px dashed #4fc1ff;
      background: rgba(79,193,255,0.08);
      border-radius: 3px;
      z-index: 1000;
      box-sizing: border-box;
    }
    #tile-drop-preview.swap {
      border-style: solid;
      background: rgba(79,193,255,0.14);
    }

    /* ── Sidebar ── */
    #sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: #000;
      font-family: ${FONT_STACK};
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

// ═══ Sidebar (toggle, divider, prefs) ═══════════════════════════════════════

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

function persistSidebarPrefs() {
  savePreferences({
    sidebar: { open: state.sidebarOpen, width: state.sidebarWidth, activeTab: state.activeTab },
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

async function initSidebar() {
  const prefs = await loadPreferences();
  if (prefs?.sidebar != null) {
    state.sidebarOpen  = prefs.sidebar.open ?? true;
    state.sidebarWidth = prefs.sidebar.width ?? SIDEBAR_DEFAULT_WIDTH;
    state.activeTab    = prefs.sidebar.activeTab ?? 'tiles';
  }
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

// ═══ Sidebar tile list ══════════════════════════════════════════════════════

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div id="sb-tabs">
      <button class="sb-tab${state.activeTab === 'tiles' ? ' active' : ''}" data-tab="tiles">Tiles</button>
      <button class="sb-tab${state.activeTab === 'skills' ? ' active' : ''}" data-tab="skills">(TBA)</button>
    </div>
    <div id="sb-search-wrap">
      <input id="sb-search" type="search" placeholder="Search tiles…" autocomplete="off" spellcheck="false">
    </div>
    <div id="sb-panel-tiles" class="sb-panel${state.activeTab === 'tiles' ? '' : ' hidden'}">
      <div class="sb-section-label" id="sb-label-app">Tiles</div>
      <div id="sb-app-tiles"></div>
      <div class="sb-section-label" id="sb-label-imported">Plugins</div>
      <div id="sb-imported-tiles"></div>
    </div>
    <div id="sb-panel-skills" class="sb-panel${state.activeTab === 'skills' ? '' : ' hidden'}"></div>
  `;

  sidebar.querySelectorAll('.sb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sidebar.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      state.activeTab = tabName;
      document.getElementById('sb-panel-tiles')?.classList.toggle('hidden', tabName !== 'tiles');
      document.getElementById('sb-panel-skills')?.classList.toggle('hidden', tabName !== 'skills');
      persistSidebarPrefs();
    });
  });

  document.getElementById('sb-search')?.addEventListener('input', e => {
    renderTileList(e.target.value.trim().toLowerCase());
  });

  renderTileList('');
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

function buildTileListItem(tile) {
  const el = document.createElement('div');
  el.className = 'sb-tile-item';
  el.draggable = true;
  el.dataset.tileName = tile.name;

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

// ═══ Tile definitions ═══════════════════════════════════════════════════════

async function loadTileDefinitions() {
  try {
    const res = await fetch('/api/tiles');
    state.tiles = await res.json();
  } catch (e) {
    console.error('[tiles] Failed to load tile definitions:', e);
    state.tiles = [];
  }
}

// ═══ Tree operations ════════════════════════════════════════════════════════

function findLeafAndParent(node, id, parent = null, side = null) {
  if (!node) return null;
  if (node.type === 'leaf') {
    return node.id === id ? { leaf: node, parent, side } : null;
  }
  return findLeafAndParent(node.a, id, node, 'a') || findLeafAndParent(node.b, id, node, 'b');
}

function replaceNode(parent, side, newNode) {
  if (parent == null) {
    state.layoutTree = newNode;
  } else {
    parent[side] = newNode;
  }
}

function insertTile(targetId, edge, newLeaf) {
  if (!state.layoutTree) {
    state.layoutTree = newLeaf;
    return;
  }
  const found = findLeafAndParent(state.layoutTree, targetId);
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
  replaceNode(parent, side, splitNode);
}

function removeLeaf(id) {
  const found = findLeafAndParent(state.layoutTree, id);
  if (!found) return;
  const { parent, side } = found;
  if (parent == null) {
    state.layoutTree = null;
    return;
  }
  // Sibling takes parent's place
  const sibling = side === 'a' ? parent.b : parent.a;
  const grand = findParentOf(state.layoutTree, parent);
  if (grand == null || grand.parent == null) {
    // parent was root (either no grandparent at all, or grandparent search returned the root itself)
    state.layoutTree = sibling;
  } else {
    grand.parent[grand.side] = sibling;
  }
}

function findParentOf(node, target, parent = null, side = null) {
  if (!node || node.type === 'leaf') return null;
  if (node === target) return { parent, side };
  return findParentOf(node.a, target, node, 'a') || findParentOf(node.b, target, node, 'b');
}

function swapLeaves(idA, idB) {
  if (idA === idB) return;
  const fa = findLeafAndParent(state.layoutTree, idA);
  const fb = findLeafAndParent(state.layoutTree, idB);
  if (!fa || !fb) return;
  // Swap by reattaching the leaf nodes at each other's positions
  replaceNode(fa.parent, fa.side, fb.leaf);
  replaceNode(fb.parent, fb.side, fa.leaf);
}

// ═══ Render (diff-by-id to preserve tile DOM) ═══════════════════════════════

function renderTree() {
  const canvas = document.getElementById('tile-canvas');
  if (!canvas) return;

  // Track which leaf ids appear in the new tree so we can clean up dropped ones
  const newLeafIds = new Set();
  if (state.layoutTree) collectLeafIds(state.layoutTree, newLeafIds);

  // Detach existing tile elements from their current parents so we can re-mount them
  for (const [id, info] of state.leaves) {
    if (newLeafIds.has(id) && info.el && info.el.parentNode) {
      info.el.parentNode.removeChild(info.el);
    }
  }

  // Clear canvas (preview lives inside canvas - re-create as needed later)
  canvas.innerHTML = '';

  // Build fresh DOM, reusing cached tile elements
  if (state.layoutTree) {
    canvas.appendChild(renderNode(state.layoutTree));
  }

  // Drop leaves that are no longer in the tree (run cleanup, free entry)
  for (const id of [...state.leaves.keys()]) {
    if (!newLeafIds.has(id)) {
      const info = state.leaves.get(id);
      if (typeof info.cleanup === 'function') {
        try { info.cleanup(); } catch (e) { console.error('[tiles] cleanup error:', e); }
      }
      clearTimeout(info._saveTimer);
      state.leaves.delete(id);
    }
  }

  // Re-apply focus class (the .tile element may have been re-rendered fresh if newly mounted)
  if (state.focusedId && state.leaves.has(state.focusedId)) {
    state.leaves.get(state.focusedId).el?.classList.add('focused');
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

function renderNode(node) {
  if (node.type === 'leaf') return renderLeaf(node);

  const splitEl = document.createElement('div');
  splitEl.className = 'split';
  splitEl.dataset.dir = node.dir;

  const paneA = document.createElement('div');
  paneA.className = 'pane';
  paneA.style.flex = `${node.ratio} 0 0`;
  paneA.appendChild(renderNode(node.a));

  const splitter = document.createElement('div');
  splitter.className = 'splitter';
  initSplitterDrag(splitter, node, paneA, splitEl);

  const paneB = document.createElement('div');
  paneB.className = 'pane';
  paneB.style.flex = `${1 - node.ratio} 0 0`;
  paneB.appendChild(renderNode(node.b));

  splitEl.appendChild(paneA);
  splitEl.appendChild(splitter);
  splitEl.appendChild(paneB);
  return splitEl;
}

function renderLeaf(leafNode) {
  const cached = state.leaves.get(leafNode.id);
  if (cached?.el) {
    // Sync class state for notify
    cached.el.classList.toggle('notify',       leafNode.notifyState === 'notify');
    cached.el.classList.toggle('stale-notify', leafNode.notifyState === 'stale-notify');
    cached.notifyState = leafNode.notifyState;
    return cached.el;
  }
  // Fresh mount
  const el = buildTileElement(leafNode);
  const contentEl = el.querySelector('.tile-content');
  state.leaves.set(leafNode.id, {
    el,
    contentEl,
    cleanup: null,
    _saveTimer: null,
    tileType: leafNode.tileType,
    notifyState: leafNode.notifyState,
  });
  mountTileContent(leafNode, contentEl).catch(e => console.error('[tiles] mount error:', e));
  return el;
}

// ═══ Tile element ═══════════════════════════════════════════════════════════

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

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tile-close';
  closeBtn.title = 'Close';
  closeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  titlebar.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'tile-content';

  el.appendChild(titlebar);
  el.appendChild(content);

  el.addEventListener('mousedown', () => focusTile(leafNode.id));

  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeTile(leafNode.id);
  });

  initTileMoveDrag(titlebar, leafNode.id);

  return el;
}

// ═══ Focus ══════════════════════════════════════════════════════════════════

function focusTile(id) {
  if (state.focusedId === id) return;
  if (state.focusedId) {
    state.leaves.get(state.focusedId)?.el?.classList.remove('focused');
  }
  state.focusedId = id;
  state.leaves.get(id)?.el?.classList.add('focused');
}

function blurAll() {
  if (state.focusedId) {
    state.leaves.get(state.focusedId)?.el?.classList.remove('focused');
    state.focusedId = null;
  }
}

// ═══ Splitter drag ══════════════════════════════════════════════════════════

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

// ═══ Drop preview ═══════════════════════════════════════════════════════════

function ensureDropPreview() {
  const canvas = document.getElementById('tile-canvas');
  let preview = document.getElementById('tile-drop-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'tile-drop-preview';
    canvas.appendChild(preview);
  }
  return preview;
}

function hideDropPreview() {
  document.getElementById('tile-drop-preview')?.remove();
}

// Returns { tileEl, leafId, edge, rect } for the leaf under the cursor, or null.
function pickDropTarget(clientX, clientY) {
  const canvas = document.getElementById('tile-canvas');
  if (!canvas) return null;
  // Empty canvas: special target
  if (!state.layoutTree) {
    const cr = canvas.getBoundingClientRect();
    return { tileEl: null, leafId: null, edge: 'root', rect: cr };
  }
  const elAtPoint = document.elementFromPoint(clientX, clientY);
  if (!elAtPoint) return null;
  const tileEl = elAtPoint.closest('.tile');
  if (!tileEl || !canvas.contains(tileEl)) return null;
  const leafId = tileEl.id.replace(/^tile-/, '');
  const rect = tileEl.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;

  // Center zone: inner 50% × 50%
  if (relX >= 0.25 && relX <= 0.75 && relY >= 0.25 && relY <= 0.75) {
    return { tileEl, leafId, edge: 'center', rect };
  }
  // Outer edges: pick the nearest edge by distance to that edge
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

function showDropPreview(target) {
  const canvas = document.getElementById('tile-canvas');
  const canvasRect = canvas.getBoundingClientRect();
  const preview = ensureDropPreview();
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
  // center / root: full target rect

  preview.style.left   = `${left}px`;
  preview.style.top    = `${top}px`;
  preview.style.width  = `${width}px`;
  preview.style.height = `${height}px`;
}

// ═══ Sidebar → canvas DnD (HTML5) ═══════════════════════════════════════════

function initCanvasSidebarDnD() {
  const canvas = document.getElementById('tile-canvas');
  if (!canvas) return;

  canvas.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('tile-name')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const target = pickDropTarget(e.clientX, e.clientY);
    if (target) showDropPreview(target);
    else hideDropPreview();
  });

  canvas.addEventListener('dragleave', e => {
    if (!canvas.contains(e.relatedTarget)) hideDropPreview();
  });

  canvas.addEventListener('drop', e => {
    const tileName = e.dataTransfer.getData('tile-name');
    if (!tileName) return;
    e.preventDefault();
    const target = pickDropTarget(e.clientX, e.clientY);
    hideDropPreview();
    if (!target) return;

    const newLeaf = {
      type: 'leaf',
      id: generateId(),
      tileType: tileName,
      notifyState: null,
    };

    if (target.edge === 'root') {
      state.layoutTree = newLeaf;
    } else if (target.edge === 'center') {
      // Center drop = replace target with new leaf (and target leaf is closed)
      // But we never want to lose a tile by accident — fall back to a left-split.
      insertTile(target.leafId, 'left', newLeaf);
    } else {
      insertTile(target.leafId, target.edge, newLeaf);
    }
    renderTree();
    focusTile(newLeaf.id);
    scheduleSaveLayout();
  });

  // Global blur: clicking anywhere outside a tile drops focus
  document.addEventListener('mousedown', e => {
    if (e.target instanceof Element && e.target.closest('.tile')) return;
    blurAll();
  });

  // Window-drag titlebar regions don't reliably bubble mousedown to document
  // (because of -webkit-app-region: drag), so listen explicitly.
  document.getElementById('md-titlebar')?.addEventListener('mousedown', blurAll);

  // Alt-tab or focusing another window: hide focus visual but keep state,
  // so it restores when the window regains focus.
  window.addEventListener('blur',  () => document.body.classList.add('window-blurred'));
  window.addEventListener('focus', () => document.body.classList.remove('window-blurred'));
}

// ═══ Tile titlebar → move/swap (custom mouse drag) ══════════════════════════

let activeMoveDrag = null;

function initTileMoveDrag(titlebar, sourceId) {
  titlebar.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    // Ignore clicks on the close button (it has its own stopPropagation)
    if (e.target.closest('.tile-close')) return;
    e.preventDefault();
    activeMoveDrag = { sourceId, target: null };

    function onMove(ev) {
      const target = pickDropTarget(ev.clientX, ev.clientY);
      // Don't allow dropping onto self (no-op)
      if (target && target.leafId === sourceId) {
        hideDropPreview();
        activeMoveDrag.target = null;
        return;
      }
      if (target) {
        showDropPreview(target);
        activeMoveDrag.target = target;
      } else {
        hideDropPreview();
        activeMoveDrag.target = null;
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      hideDropPreview();
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
  if (target.edge === 'root') return;  // can't happen mid-drag of existing tile
  if (target.edge === 'center') {
    swapLeaves(sourceId, target.leafId);
  } else {
    // Move: detach source, then insert at target+edge
    const found = findLeafAndParent(state.layoutTree, sourceId);
    if (!found) return;
    const sourceLeaf = found.leaf;
    removeLeaf(sourceId);
    // After removal, target leaf may now be at a different tree position but its id is unchanged.
    // Re-find the target leaf and insert.
    if (!state.layoutTree) {
      state.layoutTree = sourceLeaf;
    } else {
      insertTile(target.leafId, target.edge, sourceLeaf);
    }
  }
  renderTree();
  focusTile(sourceId);
  scheduleSaveLayout();
}

// ═══ Mount tile content ═════════════════════════════════════════════════════

async function mountTileContent(leafNode, contentEl) {
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

  const api = buildTileApi(leafNode.id);
  try {
    const cleanup = await mod.mount(contentEl, api);
    const info = state.leaves.get(leafNode.id);
    if (info) info.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (e) {
    console.error(`[tiles] mount() error for ${leafNode.tileType}:`, e);
  }
}

function buildTileApi(leafId) {
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
      const info = state.leaves.get(leafId);
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

// ═══ Close tile ═════════════════════════════════════════════════════════════

async function closeTile(id) {
  if (!findLeafAndParent(state.layoutTree, id)) return;
  removeLeaf(id);
  renderTree();   // cleanup runs inside renderTree for removed leaves
  if (state.focusedId === id) state.focusedId = null;
  try {
    await fetch(
      `/api/tile-content?path=${encodeURIComponent(state.workspacePath)}&id=${id}`,
      { method: 'DELETE' }
    );
  } catch { /* ignore */ }
  scheduleSaveLayout();
}

// ═══ Layout persistence ═════════════════════════════════════════════════════

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
    await fetch(
      `/api/layout?path=${encodeURIComponent(state.workspacePath)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tree: serializeNode(state.layoutTree) }),
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
    return a || b || null;  // one side missing → promote the surviving side
  }
  return null;
}

async function loadLayout() {
  try {
    const res = await fetch(`/api/layout?path=${encodeURIComponent(state.workspacePath)}`);
    if (res.status === 404) return;
    const data = await res.json();
    if (!data || !('tree' in data)) {
      console.warn('[tiles] Layout file in unrecognized format; starting empty');
      return;
    }
    const knownTypes = new Set(state.tiles.map(t => t.name));
    state.layoutTree = validateAndCleanTree(data.tree, knownTypes);
    renderTree();
  } catch (e) { console.error('[tiles] loadLayout error:', e); }
}

// ═══ Entry point ════════════════════════════════════════════════════════════

export async function init(opts) {
  state.workspacePath = opts.workspacePath ?? '';
  injectStyles();
  await initSidebar();
  await loadTileDefinitions();
  buildSidebar();
  await loadLayout();
  initCanvasSidebarDnD();
}
