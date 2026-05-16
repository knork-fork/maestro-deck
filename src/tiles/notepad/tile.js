export async function mount(container, api) {
  const ta = container.querySelector('textarea');

  const saved = await api.getContent();
  if (typeof saved === 'string') {
    ta.value = saved;
  }

  ta.addEventListener('input', () => {
    api.saveContent(ta.value);
  });

  // Drag source: tag outgoing drags so drop targets can identify them.
  ta.addEventListener('dragstart', e => {
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    if (!sel) { e.preventDefault(); return; }
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

  // Drop target: accept drags from other notepad tiles.
  ta.addEventListener('dragenter', e => {
    if (e.dataTransfer.types.includes('application/x-maestro-text'))
      ta.classList.add('drag-over');
  });
  ta.addEventListener('dragleave', () => ta.classList.remove('drag-over'));
  ta.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('application/x-maestro-text')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  ta.addEventListener('drop', e => {
    ta.classList.remove('drag-over');
    if (!e.dataTransfer.types.includes('application/x-maestro-text')) return;
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
