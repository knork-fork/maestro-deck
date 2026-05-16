let drag = null; // { cardId, fromColId } — module-level, one drag at a time

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function findCard(board, cardId) {
  for (const col of board.columns) {
    const idx = col.cards.findIndex(c => c.id === cardId);
    if (idx !== -1) return { col, idx };
  }
  return null;
}

function render(boardEl, board, api) {
  boardEl.innerHTML = '';

  for (const col of board.columns) {
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.colId = col.id;

    // Header
    const header = document.createElement('div');
    header.className = 'kanban-col-header';

    const title = document.createElement('div');
    title.className = 'kanban-col-title';
    title.textContent = col.title;

    title.addEventListener('dblclick', () => {
      title.contentEditable = 'true';
      title.focus();
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    title.addEventListener('blur', () => {
      title.contentEditable = 'false';
      const newTitle = title.textContent.trim() || 'Column';
      col.title = newTitle;
      title.textContent = newTitle;
      api.saveContent(board);
    });
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
      if (e.key === 'Escape') { title.textContent = col.title; title.blur(); }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'kanban-col-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Remove column';
    delBtn.addEventListener('click', () => {
      board.columns = board.columns.filter(c => c.id !== col.id);
      render(boardEl, board, api);
      api.saveContent(board);
    });

    header.append(title, delBtn);

    // Cards container
    const cardsEl = document.createElement('div');
    cardsEl.className = 'kanban-cards';
    cardsEl.dataset.colId = col.id;

    for (const card of col.cards) {
      cardsEl.appendChild(buildCardEl(card, col, board, boardEl, api));
    }

    // Drop on empty space in column
    cardsEl.addEventListener('dragover', e => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cardsEl.classList.add('drag-over');
    });
    cardsEl.addEventListener('dragleave', e => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        cardsEl.classList.remove('drag-over');
      }
    });
    cardsEl.addEventListener('drop', e => {
      cardsEl.classList.remove('drag-over');
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      // Only handle if dropped directly on cards area (not on a card)
      if (e.target !== cardsEl) return;
      moveCard(board, drag.cardId, col.id, col.cards.length);
      drag = null;
      render(boardEl, board, api);
      api.saveContent(board);
    });

    // Add card button
    const addCard = document.createElement('button');
    addCard.className = 'kanban-add-card';
    addCard.textContent = '+ add card';
    addCard.addEventListener('click', () => {
      col.cards.push({ id: uid(), text: 'New card' });
      render(boardEl, board, api);
      api.saveContent(board);
    });

    colEl.append(header, cardsEl, addCard);
    boardEl.appendChild(colEl);
  }

  // Add column button
  const addCol = document.createElement('button');
  addCol.className = 'kanban-add-col';
  addCol.textContent = '+';
  addCol.title = 'Add column';
  addCol.addEventListener('click', () => {
    board.columns.push({ id: uid(), title: 'New Column', cards: [] });
    render(boardEl, board, api);
    api.saveContent(board);
  });
  boardEl.appendChild(addCol);
}

function buildCardEl(card, col, board, boardEl, api) {
  const el = document.createElement('div');
  el.className = 'kanban-card';
  el.textContent = card.text;
  el.draggable = true;
  el.dataset.cardId = card.id;

  el.addEventListener('dblclick', e => {
    e.stopPropagation();
    el.contentEditable = 'true';
    el.draggable = false;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  el.addEventListener('blur', () => {
    el.contentEditable = 'false';
    el.draggable = true;
    const newText = el.textContent.trim() || 'Card';
    card.text = newText;
    el.textContent = newText;
    api.saveContent(board);
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = card.text; el.blur(); }
  });

  el.addEventListener('dragstart', e => {
    if (el.contentEditable === 'true') { e.preventDefault(); return; }
    drag = { cardId: card.id, fromColId: col.id };
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Don't set any typed data — keeps drag contained to this tile
    e.dataTransfer.setData('text/plain', '');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    drag = null;
    // Clean up any leftover drag-over styles
    boardEl.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
  });

  el.addEventListener('dragover', e => {
    if (!drag || drag.cardId === card.id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });
  el.addEventListener('drop', e => {
    el.classList.remove('drag-over');
    if (!drag || drag.cardId === card.id) return;
    e.preventDefault();
    e.stopPropagation();
    const targetCol = board.columns.find(c => c.id === col.id);
    const targetIdx = targetCol.cards.findIndex(c => c.id === card.id);
    moveCard(board, drag.cardId, col.id, targetIdx);
    drag = null;
    render(boardEl, board, api);
    api.saveContent(board);
  });

  return el;
}

function moveCard(board, cardId, toColId, toIdx) {
  const src = findCard(board, cardId);
  if (!src) return;
  const [card] = src.col.cards.splice(src.idx, 1);
  const destCol = board.columns.find(c => c.id === toColId);
  if (!destCol) return;
  // Adjust index if moving within same column and source was before dest
  let insertAt = toIdx;
  if (src.col.id === toColId && src.idx < toIdx) insertAt--;
  insertAt = Math.max(0, Math.min(insertAt, destCol.cards.length));
  destCol.cards.splice(insertAt, 0, card);
}

export async function mount(container, api) {
  const boardEl = container.querySelector('.kanban-board');
  const saved = await api.getContent();
  const board = saved || { columns: [] };
  render(boardEl, board, api);
  return () => {};
}
