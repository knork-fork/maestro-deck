// ── Section 1: Constants ──────────────────────────────────────────────────────

const DEFAULT_COLS = 10;
const DEFAULT_ROWS = 30;
const COL_WIDTH = 80;
const ROW_HEIGHT = 22;
const HEADER_COL_W = 40;

// ── Section 2: Utilities ──────────────────────────────────────────────────────

function colName(n) {
  let name = '';
  let i = n + 1;
  while (i > 0) {
    i--;
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26);
  }
  return name;
}

function colIndex(name) {
  let idx = 0;
  for (let i = 0; i < name.length; i++) {
    idx = idx * 26 + (name.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseKey(key) {
  const m = key.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

function makeKey(col, row) {
  return colName(col) + (row + 1);
}

function expandRange(rangeStr) {
  const m = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return [];
  const c1 = colIndex(m[1]), r1 = parseInt(m[2], 10) - 1;
  const c2 = colIndex(m[3]), r2 = parseInt(m[4], 10) - 1;
  const keys = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      keys.push(makeKey(c, r));
    }
  }
  return keys;
}

function coerceNumber(val) {
  if (val === null || val === undefined || val === '') return NaN;
  return parseFloat(val);
}

function formatNumber(n) {
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}

// ── Section 3: Formula Engine ─────────────────────────────────────────────────

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) { i++; continue; }

    // RANGE before CELLREF
    let m = expr.slice(i).match(/^([A-Z]+\d+:[A-Z]+\d+)/);
    if (m) { tokens.push({ type: 'RANGE', value: m[1] }); i += m[1].length; continue; }

    // FUNC: letters immediately followed by (
    m = expr.slice(i).match(/^([A-Z]+)(?=\()/);
    if (m) { tokens.push({ type: 'FUNC', value: m[1] }); i += m[1].length; continue; }

    // CELLREF
    m = expr.slice(i).match(/^([A-Z]+\d+)/);
    if (m) { tokens.push({ type: 'CELLREF', value: m[1] }); i += m[1].length; continue; }

    // NUMBER
    m = expr.slice(i).match(/^(\d+(?:\.\d+)?)/);
    if (m) { tokens.push({ type: 'NUMBER', value: parseFloat(m[1]) }); i += m[1].length; continue; }

    if ('+-*/'.includes(expr[i])) { tokens.push({ type: 'OP', value: expr[i] }); i++; continue; }
    if (expr[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (expr[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (expr[i] === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }

    throw new Error('Unexpected: ' + expr[i]);
  }
  return tokens;
}

function parse(tokens, context) {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseTerm();
      const l = isNaN(left) ? 0 : left;
      const r = isNaN(right) ? 0 : right;
      left = op === '+' ? l + r : l - r;
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() && peek().type === 'OP' && (peek().value === '*' || peek().value === '/')) {
      const op = consume().value;
      const right = parseFactor();
      if (op === '/') {
        if (right === 0 || isNaN(right)) throw new Error('#DIV0');
        left = (isNaN(left) ? 0 : left) / right;
      } else {
        left = (isNaN(left) ? 0 : left) * (isNaN(right) ? 0 : right);
      }
    }
    return left;
  }

  function parseFactor() {
    const t = peek();
    if (!t) throw new Error('Unexpected end');

    if (t.type === 'NUMBER') { consume(); return t.value; }

    if (t.type === 'CELLREF') {
      consume();
      const val = context.get(t.value);
      const n = coerceNumber(val);
      return isNaN(n) ? 0 : n;
    }

    if (t.type === 'FUNC') {
      consume();
      if (!peek() || peek().type !== 'LPAREN') throw new Error('Expected (');
      consume();
      return parseCall(t.value);
    }

    if (t.type === 'LPAREN') {
      consume();
      const val = parseExpr();
      if (!peek() || peek().type !== 'RPAREN') throw new Error('Expected )');
      consume();
      return val;
    }

    if (t.type === 'OP' && t.value === '-') {
      consume();
      return -parseFactor();
    }

    if (t.type === 'OP' && t.value === '+') {
      consume();
      return parseFactor();
    }

    throw new Error('Unexpected token: ' + t.type);
  }

  function resolveRangeNums(rangeStr) {
    const nums = [];
    for (const key of expandRange(rangeStr)) {
      const v = coerceNumber(context.get(key));
      if (!isNaN(v)) nums.push(v);
    }
    return nums;
  }

  function resolveRangeAll(rangeStr) {
    const all = [];
    for (const key of expandRange(rangeStr)) {
      const v = context.get(key);
      if (v !== null && v !== undefined && v !== '') all.push(v);
    }
    return all;
  }

  function parseCall(funcName) {
    const argTokens = [];
    while (true) {
      if (!peek()) throw new Error('Unclosed call');
      if (peek().type === 'RPAREN') { consume(); break; }
      if (peek().type === 'COMMA') { consume(); continue; }
      if (peek().type === 'RANGE') {
        argTokens.push({ kind: 'range', value: consume().value });
      } else {
        argTokens.push({ kind: 'value', value: parseExpr() });
      }
    }

    const collectNums = () => {
      const nums = [];
      for (const a of argTokens) {
        if (a.kind === 'range') {
          nums.push(...resolveRangeNums(a.value));
        } else {
          const n = coerceNumber(a.value);
          if (!isNaN(n)) nums.push(n);
        }
      }
      return nums;
    };

    const collectAll = () => {
      const all = [];
      for (const a of argTokens) {
        if (a.kind === 'range') {
          all.push(...resolveRangeAll(a.value));
        } else if (a.value !== null && a.value !== undefined && a.value !== '') {
          all.push(a.value);
        }
      }
      return all;
    };

    if (funcName === 'SUM') return collectNums().reduce((a, b) => a + b, 0);
    if (funcName === 'COUNT') return collectAll().length;
    if (funcName === 'AVERAGE') {
      const nums = collectNums();
      if (nums.length === 0) throw new Error('#ERR');
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    if (funcName === 'MIN') {
      const nums = collectNums();
      return nums.length ? Math.min(...nums) : 0;
    }
    if (funcName === 'MAX') {
      const nums = collectNums();
      return nums.length ? Math.max(...nums) : 0;
    }

    throw new Error('Unknown function: ' + funcName);
  }

  return parseExpr();
}

function evalFormula(rawStr, context) {
  try {
    const expr = rawStr.slice(1).toUpperCase();
    const tokens = tokenize(expr);
    const result = parse(tokens, context);
    if (typeof result === 'number') return formatNumber(result);
    return String(result);
  } catch (e) {
    const msg = String(e.message || '');
    if (msg === '#DIV0') return '#DIV0';
    if (msg === '#CIRC') return '#CIRC';
    return '#ERR';
  }
}

function extractDeps(rawStr) {
  const deps = new Set();
  try {
    const tokens = tokenize(rawStr.slice(1).toUpperCase());
    for (const t of tokens) {
      if (t.type === 'CELLREF') deps.add(t.value);
      if (t.type === 'RANGE') {
        for (const k of expandRange(t.value)) deps.add(k);
      }
    }
  } catch { /* invalid formula, no deps */ }
  return deps;
}

function evaluateAll(cells) {
  const computed = {};

  // Literals first
  for (const [key, raw] of Object.entries(cells)) {
    if (!raw.startsWith('=')) computed[key] = raw;
  }

  const formulaKeys = Object.keys(cells).filter(k => cells[k].startsWith('='));
  if (!formulaKeys.length) return computed;

  // Build dependency graph
  const deps = new Map();
  for (const key of formulaKeys) deps.set(key, extractDeps(cells[key]));

  // Kahn's topological sort
  const inDegree = new Map();
  const dependents = new Map();
  for (const key of formulaKeys) { inDegree.set(key, 0); dependents.set(key, new Set()); }

  for (const [key, keyDeps] of deps) {
    for (const dep of keyDeps) {
      if (deps.has(dep)) {
        inDegree.set(key, inDegree.get(key) + 1);
        dependents.get(dep).add(key);
      }
    }
  }

  const queue = formulaKeys.filter(k => inDegree.get(k) === 0);
  const sorted = [];
  while (queue.length) {
    const key = queue.shift();
    sorted.push(key);
    for (const dep of dependents.get(key)) {
      const deg = inDegree.get(dep) - 1;
      inDegree.set(dep, deg);
      if (deg === 0) queue.push(dep);
    }
  }

  // Evaluate in order
  for (const key of sorted) {
    computed[key] = evalFormula(cells[key], { get: k => computed[k] ?? '' });
  }

  // Circular refs
  const sortedSet = new Set(sorted);
  for (const key of formulaKeys) {
    if (!sortedSet.has(key)) computed[key] = '#CIRC';
  }

  return computed;
}

// ── Section 4: DOM Builder ────────────────────────────────────────────────────

function buildTable(tableEl, rows, cols) {
  tableEl.innerHTML = '';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.style.cssText = `width:${HEADER_COL_W}px;min-width:${HEADER_COL_W}px;`;
  headerRow.appendChild(corner);

  for (let c = 0; c < cols; c++) {
    const th = document.createElement('th');
    th.textContent = colName(c);
    th.style.cssText = `width:${COL_WIDTH}px;min-width:${COL_WIDTH}px;`;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = r + 1;
    tr.appendChild(th);
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.dataset.key = makeKey(c, r);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);
}

function getCellEl(tableEl, key) {
  return tableEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
}

// ── Section 5: Render ─────────────────────────────────────────────────────────

function renderCells(tableEl, computed, cells) {
  for (const td of tableEl.querySelectorAll('td[data-key]')) {
    const key = td.dataset.key;
    const display = computed[key] ?? '';
    td.textContent = display;
    const isFormula = key in cells && cells[key].startsWith('=');
    const isError = display.startsWith('#');
    td.classList.toggle('sc-formula', isFormula && !isError);
    td.classList.toggle('sc-error', isError);
  }
}

function renderSelection(tableEl, selectedCell) {
  for (const td of tableEl.querySelectorAll('td.sc-selected')) td.classList.remove('sc-selected');
  if (selectedCell) getCellEl(tableEl, selectedCell)?.classList.add('sc-selected');
}

function renderFormulaBar(labelEl, inputEl, cells, selectedCell) {
  labelEl.textContent = selectedCell ?? '';
  inputEl.value = selectedCell ? (cells[selectedCell] ?? '') : '';
}

// ── Section 6: Edit Overlay ───────────────────────────────────────────────────

function getEditInput(anchorEl) {
  return anchorEl.querySelector('.sc-edit-input');
}

function hideEditOverlay(anchorEl) {
  getEditInput(anchorEl)?.remove();
}

function showEditOverlay(anchorEl, tdEl, rawValue, onDone) {
  hideEditOverlay(anchorEl);

  const scrollContainer = anchorEl.parentElement;
  const containerRect = scrollContainer.getBoundingClientRect();
  const tdRect = tdEl.getBoundingClientRect();

  const input = document.createElement('input');
  input.className = 'sc-edit-input';
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.value = rawValue;

  input.style.left = (tdRect.left - containerRect.left + scrollContainer.scrollLeft) + 'px';
  input.style.top = (tdRect.top - containerRect.top + scrollContainer.scrollTop) + 'px';
  input.style.width = tdRect.width + 'px';
  input.style.height = tdRect.height + 'px';

  anchorEl.appendChild(input);

  requestAnimationFrame(() => {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  });

  let settled = false;

  const done = (dir) => {
    if (settled) return;
    settled = true;
    onDone({ value: input.value, dir });
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      done(e.shiftKey ? 'up' : 'down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      done(e.shiftKey ? 'left' : 'right');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done('escape');
    } else if (e.key === 'ArrowUp' && input.value === rawValue && !rawValue.startsWith('=')) {
      done('up');
    } else if (e.key === 'ArrowDown' && input.value === rawValue && !rawValue.startsWith('=')) {
      done('down');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { if (!settled) done('none'); }, 0);
  });
}

function repositionOverlay(anchorEl, tdEl) {
  const input = getEditInput(anchorEl);
  if (!input || !tdEl) return;
  const scrollContainer = anchorEl.parentElement;
  const containerRect = scrollContainer.getBoundingClientRect();
  const tdRect = tdEl.getBoundingClientRect();
  input.style.left = (tdRect.left - containerRect.left + scrollContainer.scrollLeft) + 'px';
  input.style.top = (tdRect.top - containerRect.top + scrollContainer.scrollTop) + 'px';
  input.style.width = tdRect.width + 'px';
  input.style.height = tdRect.height + 'px';
}

// ── Section 7: Navigation ─────────────────────────────────────────────────────

function clampCell(col, row, cols, rows) {
  return {
    col: Math.max(0, Math.min(cols - 1, col)),
    row: Math.max(0, Math.min(rows - 1, row)),
  };
}

function moveSelection(state, dCol, dRow) {
  const cur = state.selectedCell ? parseKey(state.selectedCell) : { col: 0, row: 0 };
  const next = clampCell(cur.col + dCol, cur.row + dRow, state.cols, state.rows);
  state.selectedCell = makeKey(next.col, next.row);
}

function scrollCellIntoView(scrollContainer, tdEl) {
  if (!tdEl) return;
  const cr = scrollContainer.getBoundingClientRect();
  const tr = tdEl.getBoundingClientRect();
  const headerH = ROW_HEIGHT;
  const headerW = HEADER_COL_W;
  if (tr.left < cr.left + headerW) scrollContainer.scrollLeft -= (cr.left + headerW - tr.left);
  else if (tr.right > cr.right) scrollContainer.scrollLeft += (tr.right - cr.right);
  if (tr.top < cr.top + headerH) scrollContainer.scrollTop -= (cr.top + headerH - tr.top);
  else if (tr.bottom > cr.bottom) scrollContainer.scrollTop += (tr.bottom - cr.bottom);
}

// ── Section 8: mount ──────────────────────────────────────────────────────────

export async function mount(container, api) {
  const labelEl = container.querySelector('.sc-cell-label');
  const formulaInput = container.querySelector('.sc-formula-input');
  const gridContainer = container.querySelector('.sc-grid-container');
  const anchorEl = container.querySelector('.sc-overlay-anchor');
  const tableEl = container.querySelector('.sc-grid');

  const saved = await api.getContent();

  const state = {
    cells: (saved && saved.cells) ? saved.cells : {},
    computed: {},
    cols: (saved && saved.cols) ? saved.cols : DEFAULT_COLS,
    rows: (saved && saved.rows) ? saved.rows : DEFAULT_ROWS,
    selectedCell: 'A1',
    editingCell: null,
  };

  function save() {
    api.saveContent({ cells: state.cells, cols: state.cols, rows: state.rows });
  }

  function fullRender() {
    state.computed = evaluateAll(state.cells);
    renderCells(tableEl, state.computed, state.cells);
    renderSelection(tableEl, state.selectedCell);
    renderFormulaBar(labelEl, formulaInput, state.cells, state.selectedCell);
  }

  function selectCell(key) {
    state.selectedCell = key;
    renderSelection(tableEl, key);
    renderFormulaBar(labelEl, formulaInput, state.cells, key);
    const tdEl = getCellEl(tableEl, key);
    if (tdEl) scrollCellIntoView(gridContainer, tdEl);
  }

  function commitOverlay(value, dir, fromKey) {
    hideEditOverlay(anchorEl);
    state.editingCell = null;
    if (dir !== 'escape') {
      const trimmed = value.trim();
      if (trimmed === '') {
        delete state.cells[fromKey];
      } else {
        state.cells[fromKey] = value;
      }
      state.computed = evaluateAll(state.cells);
      renderCells(tableEl, state.computed, state.cells);
      save();
    }
    // Navigate
    if (dir === 'down') { moveSelection(state, 0, 1); selectCell(state.selectedCell); }
    else if (dir === 'up') { moveSelection(state, 0, -1); selectCell(state.selectedCell); }
    else if (dir === 'right') { moveSelection(state, 1, 0); selectCell(state.selectedCell); }
    else if (dir === 'left') { moveSelection(state, -1, 0); selectCell(state.selectedCell); }
    else {
      renderFormulaBar(labelEl, formulaInput, state.cells, state.selectedCell);
    }
    tableEl.focus();
  }

  // ── Point mode (click cells while typing a formula) ──

  let pointMode = null; // { anchor, current, refStart, refEnd }

  function isFormulaMode() {
    if (!state.editingCell) return false;
    const inp = getEditInput(anchorEl);
    return inp && inp.value.startsWith('=');
  }

  function clearPointHighlight() {
    for (const td of tableEl.querySelectorAll('td.sc-point')) td.classList.remove('sc-point');
  }

  function clearPoint() {
    clearPointHighlight();
    pointMode = null;
  }

  function highlightPoint(anchor, current) {
    clearPointHighlight();
    const a = parseKey(anchor), b = parseKey(current);
    if (!a || !b) return;
    const c1 = Math.min(a.col, b.col), r1 = Math.min(a.row, b.row);
    const c2 = Math.max(a.col, b.col), r2 = Math.max(a.row, b.row);
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        getCellEl(tableEl, makeKey(c, r))?.classList.add('sc-point');
  }

  function insertRef(key) {
    const inp = getEditInput(anchorEl);
    if (!inp) return;
    clearPoint();
    const s = inp.selectionStart, e2 = inp.selectionEnd;
    inp.value = inp.value.slice(0, s) + key + inp.value.slice(e2);
    const refEnd = s + key.length;
    inp.setSelectionRange(refEnd, refEnd);
    pointMode = { anchor: key, current: key, refStart: s, refEnd };
    highlightPoint(key, key);
  }

  function updateRef(anchor, current) {
    if (!pointMode) return;
    const inp = getEditInput(anchorEl);
    if (!inp) return;
    let ref;
    if (anchor === current) {
      ref = anchor;
    } else {
      const a = parseKey(anchor), b = parseKey(current);
      const c1 = Math.min(a.col, b.col), r1 = Math.min(a.row, b.row);
      const c2 = Math.max(a.col, b.col), r2 = Math.max(a.row, b.row);
      ref = makeKey(c1, r1) + ':' + makeKey(c2, r2);
    }
    const val = inp.value;
    inp.value = val.slice(0, pointMode.refStart) + ref + val.slice(pointMode.refEnd);
    const newEnd = pointMode.refStart + ref.length;
    inp.setSelectionRange(newEnd, newEnd);
    pointMode.refEnd = newEnd;
    pointMode.current = current;
    highlightPoint(anchor, current);
  }

  function startEdit(key) {
    const tdEl = getCellEl(tableEl, key);
    if (!tdEl) return;
    state.editingCell = key;
    const raw = state.cells[key] ?? '';
    showEditOverlay(anchorEl, tdEl, raw, ({ value, dir }) => {
      clearPoint();
      state.editingCell = null;
      commitOverlay(value, dir, key);
    });
    // Clear point mode whenever the user types manually in the overlay
    requestAnimationFrame(() => {
      getEditInput(anchorEl)?.addEventListener('input', () => clearPoint());
    });
  }

  // Build table
  buildTable(tableEl, state.rows, state.cols);
  tableEl.setAttribute('tabindex', '0');
  fullRender();

  // ── Table events ──

  tableEl.addEventListener('click', (e) => {
    const td = e.target.closest('td[data-key]');
    if (!td) return;
    if (state.editingCell) return;
    selectCell(td.dataset.key);
    tableEl.focus();
  });

  tableEl.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-key]');
    if (!td) return;
    if (state.editingCell) return;
    selectCell(td.dataset.key);
    startEdit(td.dataset.key);
  });

  // ── Point mode: mousedown on cells while typing a formula ──

  gridContainer.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td[data-key]');
    if (!td || !isFormulaMode()) return;

    e.preventDefault(); // keep focus on overlay input

    const key = td.dataset.key;
    if (e.shiftKey && pointMode) {
      updateRef(pointMode.anchor, key);
    } else {
      insertRef(key);
    }

    const onMove = (mv) => {
      if (!pointMode) return;
      const hoverTd = document.elementFromPoint(mv.clientX, mv.clientY)?.closest('td[data-key]');
      if (hoverTd && hoverTd.dataset.key !== pointMode.current) {
        updateRef(pointMode.anchor, hoverTd.dataset.key);
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const inp = getEditInput(anchorEl);
      if (inp) {
        inp.focus();
        if (pointMode) inp.setSelectionRange(pointMode.refEnd, pointMode.refEnd);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  tableEl.addEventListener('keydown', (e) => {
    if (state.editingCell) return;

    const key = state.selectedCell;
    if (!key) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(state, 0, -1);
      selectCell(state.selectedCell);
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (e.key === 'Enter') startEdit(key);
      else { moveSelection(state, 0, 1); selectCell(state.selectedCell); }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveSelection(state, -1, 0);
      selectCell(state.selectedCell);
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      moveSelection(state, e.shiftKey ? -1 : 1, 0);
      selectCell(state.selectedCell);
    } else if (e.key === 'F2') {
      e.preventDefault();
      startEdit(key);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      delete state.cells[key];
      state.computed = evaluateAll(state.cells);
      renderCells(tableEl, state.computed, state.cells);
      renderFormulaBar(labelEl, formulaInput, state.cells, key);
      save();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const typedChar = e.key;
      startEdit(key);
      // Override overlay value with the typed character (runs after showEditOverlay's RAF)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const inp = getEditInput(anchorEl);
        if (inp) { inp.value = typedChar; inp.selectionStart = inp.selectionEnd = 1; }
      }));
    }
  });

  // ── Formula bar events ──

  formulaInput.addEventListener('focus', () => {
    if (state.editingCell) hideEditOverlay(anchorEl);
  });

  formulaInput.addEventListener('input', () => {
    if (!state.selectedCell) return;
    const val = formulaInput.value;
    if (val.trim() === '') {
      delete state.cells[state.selectedCell];
    } else {
      state.cells[state.selectedCell] = val;
    }
    state.computed = evaluateAll(state.cells);
    renderCells(tableEl, state.computed, state.cells);
    save();
  });

  formulaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      moveSelection(state, 0, 1);
      selectCell(state.selectedCell);
      tableEl.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      renderFormulaBar(labelEl, formulaInput, state.cells, state.selectedCell);
      tableEl.focus();
    }
  });

  // ── ResizeObserver: reposition overlay on container resize ──

  const ro = new ResizeObserver(() => {
    if (state.editingCell) {
      const tdEl = getCellEl(tableEl, state.editingCell);
      if (tdEl) repositionOverlay(anchorEl, tdEl);
    }
  });
  ro.observe(gridContainer);

  return () => ro.disconnect();
}
