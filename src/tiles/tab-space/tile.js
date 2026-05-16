const MIN_W = 100;
const MIN_H = 80;

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// ── Tree operations ──────────────────────────────────────────────────────────

function findLeafAndParent(node, id, parent = null, side = null) {
  if (!node) return null;
  if (node.type === 'leaf') return node.id === id ? { leaf: node, parent, side } : null;
  return findLeafAndParent(node.a, id, node, 'a') || findLeafAndParent(node.b, id, node, 'b');
}

function findParentOf(node, target, parent = null, side = null) {
  if (!node || node.type === 'leaf') return null;
  if (node === target) return { parent, side };
  return findParentOf(node.a, target, node, 'a') || findParentOf(node.b, target, node, 'b');
}

function replaceIn(tree, parent, side, newNode, setRoot) {
  if (parent == null) setRoot(newNode);
  else parent[side] = newNode;
}

function insertLeaf(tab, targetId, edge, newLeaf, setRoot) {
  if (!tab.layoutTree) { setRoot(newLeaf); return; }
  const found = findLeafAndParent(tab.layoutTree, targetId);
  if (!found) return;
  const { leaf, parent, side } = found;
  const dir = (edge === 'top' || edge === 'bottom') ? 'v' : 'h';
  const newOnA = (edge === 'top' || edge === 'left');
  const splitNode = { type: 'split', dir, ratio: 0.5, a: newOnA ? newLeaf : leaf, b: newOnA ? leaf : newLeaf };
  replaceIn(tab.layoutTree, parent, side, splitNode, setRoot);
}

function removeLeaf(tab, id, setRoot) {
  const found = findLeafAndParent(tab.layoutTree, id);
  if (!found) return;
  const { parent, side } = found;
  if (parent == null) { setRoot(null); return; }
  const sibling = side === 'a' ? parent.b : parent.a;
  const grand = findParentOf(tab.layoutTree, parent);
  if (grand == null || grand.parent == null) setRoot(sibling);
  else grand.parent[grand.side] = sibling;
}

function swapLeaves(tab, idA, idB, setRoot) {
  if (idA === idB) return;
  const fa = findLeafAndParent(tab.layoutTree, idA);
  const fb = findLeafAndParent(tab.layoutTree, idB);
  if (!fa || !fb) return;
  replaceIn(tab.layoutTree, fa.parent, fa.side, fb.leaf, setRoot);
  replaceIn(tab.layoutTree, fb.parent, fb.side, fa.leaf, setRoot);
}

function collectLeafIds(node, set) {
  if (!node) return;
  if (node.type === 'leaf') { set.add(node.id); return; }
  collectLeafIds(node.a, set);
  collectLeafIds(node.b, set);
}

function serializeTree(node) {
  if (!node) return null;
  if (node.type === 'leaf') return { type: 'leaf', id: node.id, tileType: node.tileType };
  return { type: 'split', dir: node.dir, ratio: node.ratio, a: serializeTree(node.a), b: serializeTree(node.b) };
}

function validateTree(node, knownTypes) {
  if (!node) return null;
  if (node.type === 'leaf') {
    if (typeof node.id !== 'string' || !knownTypes.has(node.tileType)) return null;
    return { type: 'leaf', id: node.id, tileType: node.tileType };
  }
  if (node.type === 'split') {
    const a = validateTree(node.a, knownTypes);
    const b = validateTree(node.b, knownTypes);
    if (a && b) {
      return {
        type: 'split',
        dir: node.dir === 'v' ? 'v' : 'h',
        ratio: (typeof node.ratio === 'number' && node.ratio > 0 && node.ratio < 1) ? node.ratio : 0.5,
        a, b,
      };
    }
    return a || b || null;
  }
  return null;
}

// ── Drop target picking ──────────────────────────────────────────────────────

function pickDropTarget(canvasEl, clientX, clientY) {
  if (!canvasEl) return null;

  const activeTab = canvasEl._tsTab;
  if (!activeTab.layoutTree) {
    return { tileEl: null, leafId: null, edge: 'root', rect: canvasEl.getBoundingClientRect() };
  }

  const elAtPoint = document.elementFromPoint(clientX, clientY);
  if (!elAtPoint) return null;
  const tileEl = elAtPoint.closest('.tile');
  if (!tileEl || !canvasEl.contains(tileEl)) return null;
  // Reject tiles that belong to a nested tab-space canvas inside this one
  if (tileEl.closest('.ts-canvas') !== canvasEl) return null;

  const leafId = tileEl.id.replace(/^ts-tile-/, '');
  const rect = tileEl.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;

  if (relX >= 0.25 && relX <= 0.75 && relY >= 0.25 && relY <= 0.75) {
    return { tileEl, leafId, edge: 'center', rect };
  }
  const dL = relX, dR = 1 - relX, dT = relY, dB = 1 - relY;
  const min = Math.min(dL, dR, dT, dB);
  const edge = min === dL ? 'left' : min === dR ? 'right' : min === dT ? 'top' : 'bottom';
  return { tileEl, leafId, edge, rect };
}

// ── Drop preview ─────────────────────────────────────────────────────────────

function ensureDropPreview(canvasEl) {
  let preview = canvasEl.querySelector('.ts-drop-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'ts-drop-preview';
    canvasEl.appendChild(preview);
  }
  return preview;
}

function hideDropPreview(canvasEl) {
  canvasEl.querySelector('.ts-drop-preview')?.remove();
}

function showDropPreview(canvasEl, target) {
  const canvasRect = canvasEl.getBoundingClientRect();
  const preview = ensureDropPreview(canvasEl);
  preview.classList.toggle('swap', target.edge === 'center');

  const r = target.rect;
  let left = r.left - canvasRect.left;
  let top  = r.top  - canvasRect.top;
  let w    = r.width;
  let h    = r.height;

  if (target.edge === 'left')   w = r.width  / 2;
  if (target.edge === 'right')  { left += r.width  / 2; w = r.width  / 2; }
  if (target.edge === 'top')    h = r.height / 2;
  if (target.edge === 'bottom') { top  += r.height / 2; h = r.height / 2; }

  Object.assign(preview.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
}

export async function mount(container, api) {
  const workspacePath = new URLSearchParams(location.search).get('path') || '';

  let tileDefs = [];
  try {
    const res = await fetch('/api/tiles');
    tileDefs = await res.json();
  } catch { /* empty list — drops won't resolve tile html */ }

  const knownTypes = new Set(tileDefs.map(t => t.name));

  const tabbar     = container.querySelector('.ts-tabbar');
  const canvasArea = container.querySelector('.ts-canvas-area');

  // Per-instance engine state
  const engine = {
    tabs: [],
    leaves: new Map(),     // leafId → { el, contentEl, cleanup, _saveTimer }
    activeTabIndex: 0,
    focusedLeafId: null,
  };

  const canvasEls = new Map(); // tabId → HTMLElement

  // ── Save timer ─────────────────────────────────────────────────────────────

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api.saveContent({
        activeTabIndex: engine.activeTabIndex,
        tabs: engine.tabs.map(t => ({ id: t.id, label: t.label, layoutTree: serializeTree(t.layoutTree) })),
      });
    }, 500);
  }

  // ── Focus ──────────────────────────────────────────────────────────────────

  function focusInnerTile(id) {
    if (engine.focusedLeafId === id) return;
    const prev = engine.leaves.get(engine.focusedLeafId);
    prev?.el?.classList.remove('focused');
    engine.focusedLeafId = id;
    engine.leaves.get(id)?.el?.classList.add('focused');
  }

  // ── Tree mutation helpers (keep layoutTree ref in sync) ───────────────────

  function setTabTree(tab, node) {
    tab.layoutTree = node;
  }

  // ── Inner tile API ─────────────────────────────────────────────────────────

  function buildInnerTileApi(leafId) {
    return {
      tileId: leafId,
      async getContent() {
        try {
          const res = await fetch(`/api/tile-content?path=${encodeURIComponent(workspacePath)}&id=${leafId}`);
          if (res.status === 404) return null;
          const data = await res.json();
          return data.content ?? null;
        } catch { return null; }
      },
      saveContent(data) {
        const info = engine.leaves.get(leafId);
        if (!info) return;
        clearTimeout(info._saveTimer);
        info._saveTimer = setTimeout(async () => {
          try {
            await fetch(
              `/api/tile-content?path=${encodeURIComponent(workspacePath)}&id=${leafId}`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: data }) }
            );
          } catch {}
        }, 1000);
      },
    };
  }

  // ── Mount inner tile content ───────────────────────────────────────────────

  async function mountInnerTileContent(leafNode, contentEl) {
    const def = tileDefs.find(t => t.name === leafNode.tileType);
    if (!def) return;

    const htmlRes = await fetch(`/tiles/${leafNode.tileType}/tile.html`);
    if (!htmlRes.ok) return;
    contentEl.innerHTML = await htmlRes.text();

    if (!def.hasJs) return;

    let mod;
    try { mod = await import(`/tiles/${leafNode.tileType}/tile.js`); }
    catch (e) { console.error('[tab-space] Failed to load tile.js:', e); return; }
    if (typeof mod.mount !== 'function') return;

    try {
      const cleanup = await mod.mount(contentEl, buildInnerTileApi(leafNode.id));
      const info = engine.leaves.get(leafNode.id);
      if (info) info.cleanup = typeof cleanup === 'function' ? cleanup : null;
    } catch (e) {
      console.error('[tab-space] inner mount() error:', e);
    }
  }

  // ── Inner tile element ─────────────────────────────────────────────────────

  function buildInnerTileElement(leafNode, tab, canvasEl) {
    const def = tileDefs.find(t => t.name === leafNode.tileType);

    const el = document.createElement('div');
    el.className = 'tile';
    el.id = `ts-tile-${leafNode.id}`;
    el.title = def?.label ?? leafNode.tileType;

    const titlebar = document.createElement('div');
    titlebar.className = 'tile-titlebar';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tile-close';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

    titlebar.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'tile-content';

    el.appendChild(titlebar);
    el.appendChild(content);

    el.addEventListener('mousedown', () => focusInnerTile(leafNode.id));

    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      closeInnerTile(leafNode.id, tab, canvasEl);
    });

    initInnerTileMoveDrag(titlebar, leafNode.id, tab, canvasEl);

    return el;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function allLiveLeafIds() {
    const ids = new Set();
    for (const t of engine.tabs) if (t.layoutTree) collectLeafIds(t.layoutTree, ids);
    return ids;
  }

  function renderTabTree(tab, canvasEl) {
    const tabLeafIds = new Set();
    if (tab.layoutTree) collectLeafIds(tab.layoutTree, tabLeafIds);

    // Detach only this tab's tile elements so the canvas can be rebuilt
    for (const [id, info] of engine.leaves) {
      if (tabLeafIds.has(id) && info.el?.parentNode) info.el.parentNode.removeChild(info.el);
    }

    canvasEl.querySelector('.ts-drop-preview')?.remove();
    canvasEl.innerHTML = '';

    if (tab.layoutTree) canvasEl.appendChild(renderNode(tab.layoutTree, tab, canvasEl));

    // Only clean up leaves absent from every tab's tree
    const liveIds = allLiveLeafIds();
    for (const id of [...engine.leaves.keys()]) {
      if (!liveIds.has(id)) {
        const info = engine.leaves.get(id);
        try { info.cleanup?.(); } catch {}
        clearTimeout(info._saveTimer);
        engine.leaves.delete(id);
        fetch(`/api/tile-content?path=${encodeURIComponent(workspacePath)}&id=${id}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    if (engine.focusedLeafId && engine.leaves.has(engine.focusedLeafId)) {
      engine.leaves.get(engine.focusedLeafId).el?.classList.add('focused');
    }
  }

  function renderNode(node, tab, canvasEl) {
    if (node.type === 'leaf') return renderLeaf(node, tab, canvasEl);

    const splitEl = document.createElement('div');
    splitEl.className = 'split';
    splitEl.dataset.dir = node.dir;

    const paneA = document.createElement('div');
    paneA.className = 'pane';
    paneA.style.flex = `${node.ratio} 0 0`;
    paneA.appendChild(renderNode(node.a, tab, canvasEl));

    const splitter = document.createElement('div');
    splitter.className = 'splitter';
    initInnerSplitterDrag(splitter, node, paneA, splitEl);

    const paneB = document.createElement('div');
    paneB.className = 'pane';
    paneB.style.flex = `${1 - node.ratio} 0 0`;
    paneB.appendChild(renderNode(node.b, tab, canvasEl));

    splitEl.appendChild(paneA);
    splitEl.appendChild(splitter);
    splitEl.appendChild(paneB);
    return splitEl;
  }

  function renderLeaf(leafNode, tab, canvasEl) {
    const cached = engine.leaves.get(leafNode.id);
    if (cached?.el) return cached.el;

    const el = buildInnerTileElement(leafNode, tab, canvasEl);
    const contentEl = el.querySelector('.tile-content');
    engine.leaves.set(leafNode.id, { el, contentEl, cleanup: null, _saveTimer: null });
    mountInnerTileContent(leafNode, contentEl).catch(e => console.error('[tab-space] mount error:', e));
    return el;
  }

  // ── Close inner tile ───────────────────────────────────────────────────────

  function closeInnerTile(id, tab, canvasEl) {
    if (!findLeafAndParent(tab.layoutTree, id)) return;
    removeLeaf(tab, id, n => setTabTree(tab, n));
    renderTabTree(tab, canvasEl);
    if (engine.focusedLeafId === id) engine.focusedLeafId = null;
    scheduleSave();
  }

  // ── Splitter drag ──────────────────────────────────────────────────────────

  function initInnerSplitterDrag(splitterEl, splitNode, paneAEl, splitContainerEl) {
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

      const minRatio = (isH ? MIN_W : MIN_H) / usable;
      const maxRatio = (usable - (isH ? MIN_W : MIN_H)) / usable;
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
        scheduleSave();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Tile move drag ─────────────────────────────────────────────────────────

  function initInnerTileMoveDrag(titlebar, sourceId, tab, canvasEl) {
    titlebar.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.tile-close')) return;
      e.preventDefault();
      e.stopPropagation();

      let currentTarget = null;

      function onMove(ev) {
        const target = pickDropTarget(canvasEl, ev.clientX, ev.clientY);
        if (!target || target.leafId === sourceId) {
          hideDropPreview(canvasEl);
          currentTarget = null;
          return;
        }
        showDropPreview(canvasEl, target);
        currentTarget = target;
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        hideDropPreview(canvasEl);
        if (!currentTarget) return;

        if (currentTarget.edge === 'center') {
          swapLeaves(tab, sourceId, currentTarget.leafId, n => setTabTree(tab, n));
        } else {
          const found = findLeafAndParent(tab.layoutTree, sourceId);
          if (!found) return;
          const sourceLeaf = found.leaf;
          removeLeaf(tab, sourceId, n => setTabTree(tab, n));
          if (!tab.layoutTree) {
            tab.layoutTree = sourceLeaf;
          } else {
            insertLeaf(tab, currentTarget.leafId, currentTarget.edge, sourceLeaf, n => setTabTree(tab, n));
          }
        }
        renderTabTree(tab, canvasEl);
        focusInnerTile(sourceId);
        scheduleSave();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Sidebar DnD into inner canvas ─────────────────────────────────────────

  function initInnerDnD(canvasEl, tab) {
    canvasEl.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('tile-name')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      const target = pickDropTarget(canvasEl, e.clientX, e.clientY);
      if (target) showDropPreview(canvasEl, target);
      else hideDropPreview(canvasEl);
    });

    canvasEl.addEventListener('dragleave', e => {
      if (!canvasEl.contains(e.relatedTarget)) hideDropPreview(canvasEl);
    });

    canvasEl.addEventListener('drop', e => {
      const tileName = e.dataTransfer.getData('tile-name');
      if (!tileName) return;
      e.preventDefault();
      e.stopPropagation();
      const target = pickDropTarget(canvasEl, e.clientX, e.clientY);
      hideDropPreview(canvasEl);
      if (!target) return;

      const newLeaf = { type: 'leaf', id: genId(), tileType: tileName };

      if (target.edge === 'root') {
        tab.layoutTree = newLeaf;
      } else if (target.edge === 'center') {
        insertLeaf(tab, target.leafId, 'left', newLeaf, n => setTabTree(tab, n));
      } else {
        insertLeaf(tab, target.leafId, target.edge, newLeaf, n => setTabTree(tab, n));
      }
      renderTabTree(tab, canvasEl);
      focusInnerTile(newLeaf.id);
      scheduleSave();
    });
  }

  // ── Canvas element management ──────────────────────────────────────────────

  function ensureCanvasEl(tab) {
    if (canvasEls.has(tab.id)) return canvasEls.get(tab.id);
    const el = document.createElement('div');
    el.className = 'ts-canvas hidden';
    el.dataset.tabId = tab.id;
    el._tsTab = tab; // back-reference used by pickDropTarget
    canvasArea.appendChild(el);
    initInnerDnD(el, tab);
    canvasEls.set(tab.id, el);
    return el;
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────

  function renderTabBar() {
    tabbar.innerHTML = '';

    engine.tabs.forEach((tab, i) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'ts-tab' + (i === engine.activeTabIndex ? ' active' : '');

      const labelEl = document.createElement('span');
      labelEl.className = 'ts-tab-label';
      labelEl.textContent = tab.label;
      tabBtn.appendChild(labelEl);

      if (engine.tabs.length > 1) {
        const closeEl = document.createElement('button');
        closeEl.className = 'ts-tab-close';
        closeEl.title = 'Close tab';
        closeEl.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        closeEl.addEventListener('click', e => { e.stopPropagation(); closeTab(i); });
        tabBtn.appendChild(closeEl);
      }

      tabBtn.addEventListener('click', () => switchToTab(i));
      tabbar.appendChild(tabBtn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'ts-add-btn';
    addBtn.title = 'New tab';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', addTab);
    tabbar.appendChild(addBtn);
  }

  // ── Tab management ─────────────────────────────────────────────────────────

  function switchToTab(index) {
    for (const el of canvasEls.values()) el.classList.add('hidden');
    engine.activeTabIndex = index;
    const tab = engine.tabs[index];
    const canvasEl = ensureCanvasEl(tab);
    canvasEl.classList.remove('hidden');
    // Only do the initial render; subsequent switches just show the existing DOM
    if (!canvasEl._initialized) {
      canvasEl._initialized = true;
      renderTabTree(tab, canvasEl);
    }
    renderTabBar();
    scheduleSave();
  }

  function addTab() {
    const label = `Tab ${engine.tabs.length + 1}`;
    const tab = { id: genId(), label, layoutTree: null };
    engine.tabs.push(tab);
    ensureCanvasEl(tab);
    switchToTab(engine.tabs.length - 1);
  }

  function closeTab(index) {
    const tab = engine.tabs[index];

    // Clean up all leaves in this tab
    const leafIds = new Set();
    if (tab.layoutTree) collectLeafIds(tab.layoutTree, leafIds);
    for (const id of leafIds) {
      const info = engine.leaves.get(id);
      if (info) {
        try { info.cleanup?.(); } catch {}
        clearTimeout(info._saveTimer);
        engine.leaves.delete(id);
      }
      fetch(`/api/tile-content?path=${encodeURIComponent(workspacePath)}&id=${id}`, { method: 'DELETE' }).catch(() => {});
    }

    const canvasEl = canvasEls.get(tab.id);
    if (canvasEl) { canvasEl.remove(); canvasEls.delete(tab.id); }

    engine.tabs.splice(index, 1);

    if (engine.tabs.length === 0) {
      // Always keep at least one tab
      const newTab = { id: genId(), label: 'Tab 1', layoutTree: null };
      engine.tabs.push(newTab);
      ensureCanvasEl(newTab);
      engine.activeTabIndex = 0;
      switchToTab(0);
      return;
    }

    engine.activeTabIndex = Math.min(engine.activeTabIndex, engine.tabs.length - 1);
    switchToTab(engine.activeTabIndex);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  const saved = await api.getContent();

  if (saved?.tabs?.length > 0) {
    engine.tabs = saved.tabs.map(t => ({
      id: typeof t.id === 'string' ? t.id : genId(),
      label: typeof t.label === 'string' ? t.label : 'Tab',
      layoutTree: validateTree(t.layoutTree, knownTypes),
    }));
    engine.activeTabIndex = Math.min(saved.activeTabIndex ?? 0, engine.tabs.length - 1);
  } else {
    engine.tabs = [{ id: genId(), label: 'Tab 1', layoutTree: null }];
    engine.activeTabIndex = 0;
  }

  // Create canvas elements for all tabs, then show the active one
  for (const tab of engine.tabs) ensureCanvasEl(tab);
  const activeTab = engine.tabs[engine.activeTabIndex];
  const activeCanvas = canvasEls.get(activeTab.id);
  activeCanvas.classList.remove('hidden');
  activeCanvas._initialized = true;
  renderTabTree(activeTab, activeCanvas);
  renderTabBar();

  // ── Cleanup ────────────────────────────────────────────────────────────────

  return () => {
    clearTimeout(saveTimer);
    for (const info of engine.leaves.values()) {
      try { info.cleanup?.(); } catch {}
      clearTimeout(info._saveTimer);
    }
    engine.leaves.clear();
    for (const el of canvasEls.values()) el.remove();
    canvasEls.clear();
  };
}
