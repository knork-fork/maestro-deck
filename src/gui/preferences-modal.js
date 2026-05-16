// Standalone preferences modal — no dependency on tiles-framework state.
// Usage: openPreferencesModal({ onApply })
// onApply({ hiddenTiles: Set<string> }) is called after the user applies changes.

const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, Ubuntu, sans-serif`;

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    #md-prefs-overlay {
      position: fixed;
      inset: 0;
      z-index: 20000;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #md-prefs-dialog {
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 6px;
      width: 560px;
      max-height: 480px;
      display: flex;
      flex-direction: column;
      font-family: ${FONT_STACK};
      font-size: 13px;
      color: #ddd;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    #md-prefs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 10px;
      border-bottom: 1px solid #333;
      flex-shrink: 0;
    }
    #md-prefs-header h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #eee;
    }
    #md-prefs-close {
      background: none;
      border: none;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
    }
    #md-prefs-close:hover { color: #eee; }
    #md-prefs-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    #md-prefs-nav {
      width: 130px;
      flex-shrink: 0;
      border-right: 1px solid #333;
      padding: 8px 0;
      overflow-y: auto;
    }
    .md-prefs-nav-item {
      padding: 7px 16px;
      cursor: default;
      color: #bbb;
      font-size: 13px;
      border-radius: 3px;
      margin: 0 4px;
    }
    .md-prefs-nav-item:hover { background: #2a2a2a; color: #eee; }
    .md-prefs-nav-item.active { background: #094771; color: #fff; }
    #md-prefs-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }
    .md-prefs-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #666;
      margin: 0 0 10px;
    }
    .md-prefs-tile-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 4px;
      border-radius: 4px;
      cursor: default;
    }
    .md-prefs-tile-row:hover { background: #252525; }
    .md-prefs-tile-row label {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      cursor: pointer;
    }
    .md-prefs-tile-row input[type="checkbox"] {
      width: 14px;
      height: 14px;
      accent-color: #4fc1ff;
      cursor: pointer;
      flex-shrink: 0;
    }
    .md-prefs-tile-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ccc;
      flex-shrink: 0;
    }
    .md-prefs-tile-icon svg { width: 18px; height: 18px; }
    .md-prefs-tile-info { flex: 1; min-width: 0; }
    .md-prefs-tile-label { font-size: 13px; color: #ddd; }
    .md-prefs-tile-desc { font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #md-prefs-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 16px;
      border-top: 1px solid #333;
      flex-shrink: 0;
    }
    #md-prefs-cancel {
      background: transparent;
      border: 1px solid #555;
      border-radius: 4px;
      color: #ccc;
      padding: 5px 14px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      cursor: pointer;
    }
    #md-prefs-cancel:hover { border-color: #888; color: #eee; }
    #md-prefs-apply {
      background: #0e639c;
      border: 1px solid #1177bb;
      border-radius: 4px;
      color: #fff;
      padding: 5px 14px;
      font-family: ${FONT_STACK};
      font-size: 13px;
      cursor: pointer;
    }
    #md-prefs-apply:hover { background: #1177bb; }
  `;
  document.head.appendChild(style);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function openPreferencesModal({ onApply } = {}) {
  if (document.getElementById('md-prefs-overlay')) return;
  injectStyles();

  let tiles = [], hiddenTiles = new Set();
  try {
    const [tilesRes, prefsRes] = await Promise.all([
      fetch('/api/tiles'),
      fetch('/api/preferences'),
    ]);
    if (tilesRes.ok) tiles = await tilesRes.json();
    if (prefsRes.ok) {
      const prefs = await prefsRes.json();
      hiddenTiles = new Set(prefs?.hiddenTiles ?? []);
    }
  } catch { /* show modal with whatever loaded */ }

  const overlay = document.createElement('div');
  overlay.id = 'md-prefs-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'md-prefs-dialog';

  const header = document.createElement('div');
  header.id = 'md-prefs-header';
  header.innerHTML = `<h2>Preferences</h2>`;
  const closeBtn = document.createElement('button');
  closeBtn.id = 'md-prefs-close';
  closeBtn.textContent = '✕';
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const body = document.createElement('div');
  body.id = 'md-prefs-body';

  const nav = document.createElement('div');
  nav.id = 'md-prefs-nav';
  const navTiles = document.createElement('div');
  navTiles.className = 'md-prefs-nav-item active';
  navTiles.textContent = 'Tiles';
  nav.appendChild(navTiles);
  body.appendChild(nav);

  const content = document.createElement('div');
  content.id = 'md-prefs-content';

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'md-prefs-section-title';
  sectionTitle.textContent = 'Show tiles in sidebar';
  content.appendChild(sectionTitle);

  const pendingHidden = new Set(hiddenTiles);

  for (const tile of tiles) {
    const row = document.createElement('div');
    row.className = 'md-prefs-tile-row';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !pendingHidden.has(tile.name);
    checkbox.dataset.tileName = tile.name;
    const iconEl = document.createElement('span');
    iconEl.className = 'md-prefs-tile-icon';
    iconEl.innerHTML = tile.icon;
    const infoEl = document.createElement('div');
    infoEl.className = 'md-prefs-tile-info';
    infoEl.innerHTML = `
      <div class="md-prefs-tile-label">${escapeHtml(tile.label)}</div>
      <div class="md-prefs-tile-desc">${escapeHtml(tile.description)}</div>
    `;
    label.appendChild(checkbox);
    label.appendChild(iconEl);
    label.appendChild(infoEl);
    row.appendChild(label);
    content.appendChild(row);
  }

  body.appendChild(content);
  dialog.appendChild(body);

  const footer = document.createElement('div');
  footer.id = 'md-prefs-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'md-prefs-cancel';
  cancelBtn.textContent = 'Cancel';
  const applyBtn = document.createElement('button');
  applyBtn.id = 'md-prefs-apply';
  applyBtn.textContent = 'Apply';
  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);
  dialog.appendChild(footer);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function dismiss() { overlay.remove(); }

  async function apply() {
    const newHidden = new Set();
    content.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (!cb.checked) newHidden.add(cb.dataset.tileName);
    });
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenTiles: [...newHidden] }),
      });
    } catch { /* ignore */ }
    onApply?.({ hiddenTiles: newHidden });
    dismiss();
  }

  closeBtn.addEventListener('click', dismiss);
  cancelBtn.addEventListener('click', dismiss);
  applyBtn.addEventListener('click', apply);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
    else if (e.key === 'Enter') { apply(); document.removeEventListener('keydown', onKey); }
  });
}
