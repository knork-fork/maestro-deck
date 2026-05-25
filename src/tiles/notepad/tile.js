let dragSourceTextarea = null;

export async function mount(container, api) {
  const ta = container.querySelector('textarea');

  const saved = await api.getContent();
  if (typeof saved === 'string') {
    ta.value = saved;
  }

  ta.addEventListener('input', () => {
    api.saveContent(ta.value);
  });

  // Keep padding-bottom equal to the visible height so content can always be
  // scrolled upward (VS Code-style "scroll beyond last line").
  const LINE_HEIGHT = 13 * 1.6;
  const updatePadding = () => {
    ta.style.paddingBottom = Math.max(0, ta.clientHeight - LINE_HEIGHT) + 'px';
  };
  const ro = new ResizeObserver(updatePadding);
  ro.observe(ta);
  updatePadding();

  // Drag source: tag outgoing drags so drop targets can identify them.
  ta.addEventListener('dragstart', e => {
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    if (!sel) { e.preventDefault(); return; }
    dragSourceTextarea = ta;
    e.dataTransfer.setData('application/x-maestro-text', '1');
    e.dataTransfer.effectAllowed = 'copy';

    const preview = sel.length > 60 ? sel.slice(0, 60) + '…' : sel;
    const ghost = document.createElement('div');
    ghost.textContent = preview;
    ghost.style.cssText = [
      'position:fixed', 'top:-1000px', 'left:-1000px',
      'background:#2c2c2c', 'color:#eeeeec',
      "font-family:'Cascadia Code','Fira Code','Ubuntu Mono','DejaVu Sans Mono',monospace",
      'font-size:13px', 'line-height:1.6',
      'padding:3px 8px', 'border-radius:4px',
      'border:1px solid rgba(255,255,255,0.18)',
      'max-width:320px', 'white-space:pre', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 16);
    setTimeout(() => ghost.remove(), 0);
  });
  ta.addEventListener('dragend', () => { dragSourceTextarea = null; });

  // Drop target: accept drags from other notepad tiles (not self).
  ta.addEventListener('dragenter', e => {
    if (dragSourceTextarea !== ta && e.dataTransfer.types.includes('application/x-maestro-text'))
      ta.classList.add('drag-over');
  });
  ta.addEventListener('dragleave', () => ta.classList.remove('drag-over'));
  ta.addEventListener('dragover', e => {
    if (dragSourceTextarea !== ta && e.dataTransfer.types.includes('application/x-maestro-text')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  ta.addEventListener('drop', e => {
    ta.classList.remove('drag-over');
    if (dragSourceTextarea === ta || !e.dataTransfer.types.includes('application/x-maestro-text')) return;
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    const sep = ta.value.length > 0 && !ta.value.endsWith('\n') ? '\n' : '';
    const end = ta.value.length;
    ta.setRangeText(sep + text, end, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
