const SCROLLBACK_CAP = 256 * 1024;

let vendorLoading;
function loadVendor() {
  if (vendorLoading) return vendorLoading;
  vendorLoading = Promise.all([
    loadScript('/tiles/terminal/vendor/xterm.js'),
    loadScript('/tiles/terminal/vendor/xterm-addon-fit.js'),
  ]);
  return vendorLoading;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-md-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.dataset.mdSrc = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// GNOME Terminal "Dark" palette shipped by Ubuntu 22.04+/24.04, with a true
// black background per user preference.
const UBUNTU_THEME = {
  background:    '#000000',
  foreground:    '#d0cfcc',
  cursor:        '#d0cfcc',
  cursorAccent:  '#000000',
  selectionBackground: 'rgba(255,255,255,0.22)',
  black:         '#171421',
  red:           '#c01c28',
  green:         '#26a269',
  yellow:        '#a2734c',
  blue:          '#12488b',
  magenta:       '#a347ba',
  cyan:          '#2aa1b3',
  white:         '#d0cfcc',
  brightBlack:   '#5e5c64',
  brightRed:     '#f66151',
  brightGreen:   '#33d17a',
  brightYellow:  '#e9ad0c',
  brightBlue:    '#2a7bde',
  brightMagenta: '#c061cb',
  brightCyan:    '#33c7de',
  brightWhite:   '#ffffff',
};

export async function mount(container, api) {
  await loadVendor();

  const wrap   = container.querySelector('.terminal-wrap');
  const host   = container.querySelector('.xterm-host');
  const status = container.querySelector('.term-status');

  const saved = await api.getContent();
  const savedScrollback = (saved && typeof saved.scrollback === 'string') ? saved.scrollback : '';
  const savedCwd = (saved && typeof saved.cwd === 'string') ? saved.cwd : null;
  const initCmd = (saved && typeof saved.initCmd === 'string') ? saved.initCmd : null;

  const term = new window.Terminal({
    fontFamily: "'Ubuntu Mono', 'Cascadia Mono', 'DejaVu Sans Mono', 'Menlo', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.15,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 5000,
    allowProposedApi: true,
    theme: UBUNTU_THEME,
  });
  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(host);

  // Replay saved scrollback (as inert text) before starting the live session.
  if (savedScrollback) {
    term.write(savedScrollback);
    term.write('\r\n\x1b[2m── session restored ──\x1b[0m\r\n');
  }

  // Best-effort initial fit.
  const safeFit = () => {
    try { fitAddon.fit(); } catch { /* ignore — host may be detached momentarily */ }
  };
  requestAnimationFrame(safeFit);

  // Local scrollback ring kept by the renderer (source of truth for persistence).
  let scrollback = savedScrollback;
  let lastCwd = savedCwd;

  function appendScrollback(chunk) {
    scrollback += chunk;
    if (scrollback.length > SCROLLBACK_CAP) {
      scrollback = scrollback.slice(scrollback.length - SCROLLBACK_CAP);
    }
    persist();
  }

  function persist() {
    api.saveContent({ scrollback, cwd: lastCwd });
  }

  // ── WebSocket bridge ─────────────────────────────────────────────────────
  const workspacePath = new URLSearchParams(location.search).get('path') || '';
  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/terminal?id=${encodeURIComponent(api.tileId)}&path=${encodeURIComponent(workspacePath)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  let connected = false;
  let disposed = false;

  function showStatus(text, sticky = false) {
    status.textContent = text;
    status.classList.add('visible');
    if (!sticky) setTimeout(() => status.classList.remove('visible'), 1500);
  }

  ws.addEventListener('open', () => {
    connected = true;
    const cols = term.cols, rows = term.rows;
    ws.send(JSON.stringify({
      type: 'spawn',
      cwd: savedCwd || workspacePath || null,
      cols, rows,
    }));
    if (initCmd) {
      setTimeout(() => {
        if (connected) {
          ws.send(JSON.stringify({ type: 'input', data: initCmd }));
          persist();
        }
      }, 500);
    }
  });

  ws.addEventListener('message', ev => {
    let msg;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data)); }
    catch { return; }
    if (msg.type === 'data') {
      term.write(msg.data);
      appendScrollback(msg.data);
    } else if (msg.type === 'cwd') {
      if (typeof msg.cwd === 'string' && msg.cwd && msg.cwd !== lastCwd) {
        lastCwd = msg.cwd;
        persist();
      }
    } else if (msg.type === 'exit') {
      term.write(`\r\n\x1b[2m── shell exited (code ${msg.code ?? '?'}) ──\x1b[0m\r\n`);
      connected = false;
    } else if (msg.type === 'error') {
      term.write(`\r\n\x1b[31m${msg.message || 'terminal error'}\x1b[0m\r\n`);
    }
  });

  ws.addEventListener('close', () => {
    connected = false;
    if (!disposed) showStatus('disconnected', true);
  });
  ws.addEventListener('error', () => {
    if (!disposed) showStatus('connection error', true);
  });

  // ── Input → server ───────────────────────────────────────────────────────
  term.onData(data => {
    if (connected) ws.send(JSON.stringify({ type: 'input', data }));
  });
  term.onBinary(data => {
    if (connected) ws.send(JSON.stringify({ type: 'input', data }));
  });

  // ── Resize ───────────────────────────────────────────────────────────────
  const resizeObs = new ResizeObserver(() => {
    safeFit();
    if (connected) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  });
  resizeObs.observe(wrap);

  // Drop target: accept text drags from notepad tiles.
  let dragCount = 0;
  wrap.addEventListener('dragenter', e => {
    if (e.dataTransfer.types.includes('application/x-maestro-text')) {
      if (++dragCount === 1) wrap.classList.add('drag-over');
    }
  });
  wrap.addEventListener('dragleave', () => {
    if (--dragCount <= 0) { dragCount = 0; wrap.classList.remove('drag-over'); }
  });
  wrap.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('application/x-maestro-text')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  wrap.addEventListener('drop', e => {
    dragCount = 0;
    wrap.classList.remove('drag-over');
    if (!e.dataTransfer.types.includes('application/x-maestro-text')) return;
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text && connected) ws.send(JSON.stringify({ type: 'input', data: text }));
    term.focus();
  });

  // Focus xterm when user clicks anywhere inside the wrapper.
  wrap.addEventListener('mousedown', e => {
    if (e.target.closest('.xterm-helper-textarea')) return;
    setTimeout(() => term.focus(), 0);
  });

  // Integrate with the framework's context menu. The framework dispatches
  // these custom events on `.tile-content` when the user right-clicks; the
  // terminal overrides the defaults so Copy uses xterm's own selection and
  // Paste writes directly into the PTY.
  container.addEventListener('md-get-selection', e => {
    // Terminal output is never editable, so Cut/Delete stay disabled even
    // when text is selected.
    e.detail.editable = false;
    const sel = term.getSelection();
    if (sel) {
      e.detail.text = sel;
      e.detail.onCopied = () => term.clearSelection();
    }
  });
  container.addEventListener('md-paste', e => {
    const text = e.detail?.text;
    if (text && connected) ws.send(JSON.stringify({ type: 'input', data: text }));
    e.preventDefault();
    term.focus();
  });
  container.addEventListener('md-select-all', e => {
    term.selectAll();
    e.preventDefault();
  });

  // The tile framework toggles `.focused` on the .tile element when the tile
  // is dropped/clicked. Mirror that into xterm's hidden textarea so the user
  // can start typing immediately after drop without an extra click.
  const tileEl = container.closest('.tile');
  let focusObs = null;
  if (tileEl) {
    focusObs = new MutationObserver(() => {
      if (tileEl.classList.contains('focused')) term.focus();
    });
    focusObs.observe(tileEl, { attributes: true, attributeFilter: ['class'] });
    if (tileEl.classList.contains('focused')) {
      requestAnimationFrame(() => term.focus());
    }
  }

  return () => {
    disposed = true;
    try { focusObs?.disconnect(); } catch {}
    try { resizeObs.disconnect(); } catch {}
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dispose' }));
      ws.close();
    } catch {}
    try { term.dispose(); } catch {}
  };
}
