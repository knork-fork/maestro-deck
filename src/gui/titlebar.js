const isMainArea = window.location.pathname === '/main';
const folderPath = isMainArea
  ? new URLSearchParams(window.location.search).get('path')
  : null;

async function doOpenFolder() {
  try {
    const res = await fetch('/api/open-folder', { method: 'POST' });
    if (res.status === 204) return;
    const { path } = await res.json();
    if (path) window.electronAPI.openMain(path);
  } catch (e) { console.error('doOpenFolder', e); }
}

async function doOpenRecent() {
  try {
    const res = await fetch('/api/workspaces');
    if (!res.ok) return;
    const ws = await res.json();
    if (ws.length) window.electronAPI.openMain(ws[0].path);
  } catch (e) { console.error('doOpenRecent', e); }
}

function doCloseFolder() {
  window.electronAPI.closeFolder();
}

function doOpenPreferences() {
  window.dispatchEvent(new CustomEvent('md-open-preferences'));
}

const style = document.createElement('style');
style.textContent = `
  #md-titlebar {
    height: 32px;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    -webkit-app-region: drag;
    user-select: none;
    border-bottom: 1px solid #333;
    position: relative;
    z-index: 9999;
  }
  #md-titlebar-icon {
    display: flex;
    align-items: center;
    padding: 0 6px 0 12px;
  }
  #md-titlebar-icon img {
    width: 16px;
    height: 16px;
  }
  #md-menubar {
    display: flex;
    align-items: stretch;
    height: 100%;
    -webkit-app-region: no-drag;
  }
  .md-menu-root {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 12px;
    color: #ccc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    cursor: default;
    border-radius: 3px;
  }
  .md-menu-root:hover,
  .md-menu-root.open { background: #3c3c3c; color: #fff; }
  .md-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 1px);
    left: 0;
    min-width: 210px;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 3px;
    padding: 4px 0;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
    z-index: 99999;
    -webkit-app-region: no-drag;
  }
  .md-menu-root.open .md-dropdown { display: block; }
  .md-dd-item {
    display: flex;
    align-items: center;
    padding: 5px 22px;
    font-size: 12px;
    color: #ccc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    cursor: default;
    white-space: nowrap;
  }
  .md-dd-item:hover { background: #094771; color: #fff; }
  .md-dd-item.disabled { color: #555; cursor: default; }
  .md-dd-item.disabled:hover { background: none; color: #555; }
  .md-dd-sep {
    height: 1px;
    background: #3c3c3c;
    margin: 4px 0;
  }
  #md-titlebar-path {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: 12px;
    color: #888;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 12px;
  }
  #md-titlebar-controls {
    display: flex;
    -webkit-app-region: no-drag;
  }
  .md-titlebar-btn {
    width: 46px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: #ccc;
    font-size: 16px;
    transition: background 0.1s;
  }
  .md-titlebar-btn:hover { background: #3c3c3c; }
  .md-titlebar-btn.md-close:hover { background: #c42b1c; color: #fff; }
  #md-tabs-sidebar-toggle,
  #md-sidebar-toggle {
    width: 38px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: #888;
    -webkit-app-region: no-drag;
    transition: background 0.1s, color 0.1s;
  }
  #md-tabs-sidebar-toggle:hover,
  #md-sidebar-toggle:hover { background: #3c3c3c; color: #fff; }
  #md-tabs-sidebar-toggle.active,
  #md-sidebar-toggle.active { color: #ccc; }
`;
document.head.appendChild(style);

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'Open Folder…', action: doOpenFolder },
      { label: 'Open Recent',  action: doOpenRecent },
      { sep: true },
      { label: 'Preferences', action: doOpenPreferences },
      { sep: true },
      { label: 'Close Folder', action: isMainArea ? doCloseFolder : null, disabled: !isMainArea },
      { sep: true },
      { label: 'Exit', action: () => window.electronAPI.close() },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo' },
      { label: 'Redo' },
    ],
  },
  {
    label: 'View',
    items: [],
  },
  {
    label: 'Help',
    items: [
      { label: 'Show Release Notes' },
      { label: 'Download Update' },
      { sep: true },
      { label: 'About' },
    ],
  },
];

function buildMenubar() {
  const menubar = document.createElement('div');
  menubar.id = 'md-menubar';

  let open = null;

  function closeAll() {
    if (open) { open.classList.remove('open'); open = null; }
  }

  document.addEventListener('click', closeAll);

  for (const menu of MENUS) {
    const root = document.createElement('div');
    root.className = 'md-menu-root';
    root.textContent = menu.label;

    if (menu.items.length) {
      const dropdown = document.createElement('div');
      dropdown.className = 'md-dropdown';

      for (const entry of menu.items) {
        if (entry.sep) {
          const sep = document.createElement('div');
          sep.className = 'md-dd-sep';
          dropdown.appendChild(sep);
        } else {
          const item = document.createElement('div');
          item.className = 'md-dd-item';
          if (entry.disabled) item.classList.add('disabled');
          item.textContent = entry.label;
          if (entry.action && !entry.disabled) {
            item.addEventListener('click', e => { e.stopPropagation(); closeAll(); entry.action(); });
          }
          dropdown.appendChild(item);
        }
      }

      root.appendChild(dropdown);

      root.addEventListener('click', e => {
        e.stopPropagation();
        if (open === root) { closeAll(); return; }
        closeAll();
        root.classList.add('open');
        open = root;
      });
    }

    menubar.appendChild(root);
  }

  return menubar;
}

const bar = document.createElement('div');
bar.id = 'md-titlebar';

const icon = document.createElement('div');
icon.id = 'md-titlebar-icon';
icon.innerHTML = `<img src="/icon.png" alt="">`;
bar.appendChild(icon);

bar.appendChild(buildMenubar());

const pathEl = document.createElement('div');
pathEl.id = 'md-titlebar-path';
if (folderPath) {
  pathEl.textContent = folderPath;
  pathEl.title = folderPath;
}
bar.appendChild(pathEl);

if (isMainArea) {
  const tabsToggleBtn = document.createElement('button');
  tabsToggleBtn.id = 'md-tabs-sidebar-toggle';
  tabsToggleBtn.title = 'Toggle Tabs';
  tabsToggleBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.75" y="0.75" width="13.5" height="13.5" rx="1.25" stroke="currentColor" stroke-width="1.2"/>
      <line x1="4.5" y1="0.75" x2="4.5" y2="14.25" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  `;
  tabsToggleBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('md-toggle-tabs-sidebar'));
  });
  window.addEventListener('md-tabs-sidebar-state', e => {
    tabsToggleBtn.classList.toggle('active', !!e.detail?.open);
  });
  bar.appendChild(tabsToggleBtn);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'md-sidebar-toggle';
  toggleBtn.title = 'Toggle Sidebar';
  toggleBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.75" y="0.75" width="13.5" height="13.5" rx="1.25" stroke="currentColor" stroke-width="1.2"/>
      <line x1="10.5" y1="0.75" x2="10.5" y2="14.25" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  `;
  toggleBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('md-toggle-sidebar'));
  });
  window.addEventListener('md-sidebar-state', e => {
    toggleBtn.classList.toggle('active', !!e.detail?.open);
  });
  bar.appendChild(toggleBtn);
}

const controls = document.createElement('div');
controls.id = 'md-titlebar-controls';
controls.innerHTML = `
  <button class="md-titlebar-btn" title="Minimize">&#x2212;</button>
  <button class="md-titlebar-btn" title="Maximize">&#x25A1;</button>
  <button class="md-titlebar-btn md-close" title="Close">&#x2715;</button>
`;
bar.appendChild(controls);

const [minBtn, maxBtn, closeBtn] = controls.querySelectorAll('.md-titlebar-btn');
minBtn.addEventListener('click', () => window.electronAPI.minimize());
maxBtn.addEventListener('click', () => window.electronAPI.maximize());
closeBtn.addEventListener('click', () => window.electronAPI.close());

document.body.insertBefore(bar, document.body.firstChild);
