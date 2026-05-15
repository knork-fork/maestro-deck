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
  .md-dd-sep {
    height: 1px;
    background: #3c3c3c;
    margin: 4px 0;
  }
  #md-titlebar-controls {
    margin-left: auto;
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
`;
document.head.appendChild(style);

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'Open Folder…' },
      { label: 'Open Recent' },
      { sep: true },
      { label: 'Preferences' },
      { sep: true },
      { label: 'Close Folder' },
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
          item.textContent = entry.label;
          if (entry.action) {
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
