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
  #md-titlebar-left {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
  }
  #md-titlebar-left img {
    width: 16px;
    height: 16px;
  }
  #md-titlebar-left span {
    font-size: 12px;
    color: #999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
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

const bar = document.createElement('div');
bar.id = 'md-titlebar';
bar.innerHTML = `
  <div id="md-titlebar-left">
    <img src="/icon.png" alt="">
    <span>MaestroDeck</span>
  </div>
  <div id="md-titlebar-controls">
    <button class="md-titlebar-btn" title="Minimize">&#x2212;</button>
    <button class="md-titlebar-btn" title="Maximize">&#x25A1;</button>
    <button class="md-titlebar-btn md-close" title="Close">&#x2715;</button>
  </div>
`;

const [minBtn, maxBtn, closeBtn] = bar.querySelectorAll('.md-titlebar-btn');
minBtn.addEventListener('click', () => window.electronAPI.minimize());
maxBtn.addEventListener('click', () => window.electronAPI.maximize());
closeBtn.addEventListener('click', () => window.electronAPI.close());

document.body.insertBefore(bar, document.body.firstChild);
