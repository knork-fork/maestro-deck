// ── Shell tokenizer (for curl paste) ────────────────────────────────────────

function tokenize(str) {
  const tokens = [];
  let i = 0;
  // Normalize line-continuation backslash+newline
  str = str.replace(/\\\n/g, ' ');
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;
    let tok = '';
    while (i < str.length && !/\s/.test(str[i])) {
      const c = str[i];
      if (c === "'") {
        i++;
        while (i < str.length && str[i] !== "'") tok += str[i++];
        if (i < str.length) i++;
      } else if (c === '"') {
        i++;
        while (i < str.length && str[i] !== '"') {
          if (str[i] === '\\' && i + 1 < str.length) { i++; tok += str[i++]; }
          else tok += str[i++];
        }
        if (i < str.length) i++;
      } else if (c === '\\' && i + 1 < str.length) {
        i++; tok += str[i++];
      } else {
        tok += str[i++];
      }
    }
    tokens.push(tok);
  }
  return tokens;
}

function parseCurl(raw) {
  const tokens = tokenize(raw);
  if (!tokens.length || tokens[0].toLowerCase() !== 'curl') return null;

  let method = null;
  let url = null;
  const headers = [];
  let bodyMode = 'none';
  let rawBody = '';
  const formBody = [];

  const take = i => (i + 1 < tokens.length ? tokens[i + 1] : '');

  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === '-X' || t === '--request') {
      method = take(i).toUpperCase(); i += 2;
    } else if (t === '-H' || t === '--header') {
      const h = take(i); i += 2;
      const colon = h.indexOf(':');
      if (colon > 0) headers.push({ key: h.slice(0, colon).trim(), value: h.slice(colon + 1).trim(), enabled: true });
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') {
      rawBody = take(i); i += 2;
      bodyMode = 'raw';
      if (!method) method = 'POST';
    } else if (t === '-F' || t === '--form') {
      const pair = take(i); i += 2;
      const eq = pair.indexOf('=');
      if (eq > 0) formBody.push({ key: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), enabled: true });
      bodyMode = 'form-data';
      if (!method) method = 'POST';
    } else if (t === '--url') {
      url = take(i); i += 2;
    } else if (t === '-u' || t === '--user') {
      const cred = take(i); i += 2;
      headers.push({ key: 'Authorization', value: 'Basic ' + btoa(cred), enabled: true });
    } else if (t === '-b' || t === '--cookie') {
      headers.push({ key: 'Cookie', value: take(i), enabled: true }); i += 2;
    } else if (!t.startsWith('-') && !url) {
      url = t; i++;
    } else {
      // skip flag with possible value
      if (t.startsWith('-') && !t.startsWith('--') && t.length === 2) i += 2;
      else if (t.startsWith('--')) i += 2;
      else i++;
    }
  }

  if (!url) return null;
  return { url, method: method ?? 'GET', headers, bodyMode, rawBody, formBody };
}

// ── KV list helpers ──────────────────────────────────────────────────────────

function emptyRow() {
  return { key: '', value: '', enabled: true };
}

function ensureTrailingEmpty(rows) {
  const last = rows[rows.length - 1];
  if (!last || last.key !== '' || last.value !== '') rows.push(emptyRow());
}

function renderKvList(container, rows, onChange) {
  // Preserve focus position
  const focused = document.activeElement;
  let focusedRowIdx = -1, focusedField = null;
  container.querySelectorAll('.ac-kv-row').forEach((r, ri) => {
    if (r.contains(focused)) {
      focusedRowIdx = ri;
      focusedField = focused.classList.contains('ac-kv-key') ? 'key' : 'value';
    }
  });

  container.innerHTML = '';
  ensureTrailingEmpty(rows);

  rows.forEach((row, idx) => {
    const div = document.createElement('div');
    div.className = 'ac-kv-row';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'ac-kv-check';
    chk.checked = row.enabled;
    chk.addEventListener('change', () => { rows[idx].enabled = chk.checked; onChange(); });

    const key = document.createElement('input');
    key.type = 'text';
    key.className = 'ac-kv-key';
    key.placeholder = 'key';
    key.value = row.key;
    key.spellcheck = false;
    key.addEventListener('input', () => {
      rows[idx].key = key.value;
      if (idx === rows.length - 1 && (key.value || val.value)) {
        rows.push(emptyRow());
        renderKvList(container, rows, onChange);
        // restore focus to newly created next row's key? no — keep focus here
      }
      onChange();
    });

    const val = document.createElement('input');
    val.type = 'text';
    val.className = 'ac-kv-val';
    val.placeholder = 'value';
    val.value = row.value;
    val.spellcheck = false;
    val.addEventListener('input', () => {
      rows[idx].value = val.value;
      if (idx === rows.length - 1 && (key.value || val.value)) {
        rows.push(emptyRow());
        renderKvList(container, rows, onChange);
      }
      onChange();
    });

    const del = document.createElement('button');
    del.className = 'ac-kv-del';
    del.textContent = '×';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      rows.splice(idx, 1);
      renderKvList(container, rows, onChange);
      onChange();
    });

    div.appendChild(chk);
    div.appendChild(key);
    div.appendChild(val);
    div.appendChild(del);
    container.appendChild(div);

    if (focusedRowIdx === idx) {
      (focusedField === 'key' ? key : val).focus();
    }
  });
}

// ── mount ────────────────────────────────────────────────────────────────────

export async function mount(container, api) {
  // ── DOM refs ──
  const methodSel   = container.querySelector('.ac-method-select');
  const urlInput    = container.querySelector('.ac-url-input');
  const sendBtn     = container.querySelector('.ac-send-btn');
  const tabBtns     = container.querySelectorAll('.ac-tab-btn');
  const panelEls    = container.querySelectorAll('.ac-panel');
  const modeBtns    = container.querySelectorAll('.ac-body-mode-btn');
  const bodyContent = container.querySelector('.ac-body-content');
  const respHeader  = container.querySelector('.ac-response-header');
  const respBody    = container.querySelector('.ac-response-body');
  const statusBadge = container.querySelector('.ac-status-badge');
  const metaTime    = container.querySelector('.ac-meta-time');
  const metaSize    = container.querySelector('.ac-meta-size');
  const prettyCheck = container.querySelector('.ac-pretty-check');
  const kvContainers = {
    params:    container.querySelector('[data-kv="params"]'),
    headers:   container.querySelector('[data-kv="headers"]'),
  };

  // ── State ──
  const defaults = {
    method: 'GET', url: '',
    params:   [],
    headers:  [],
    bodyMode: 'none',
    formBody: [],
    rawBody:  '',
    activeTab: 'params',
    prettyJson: true,
  };
  let state = Object.assign({}, defaults);
  let lastResponse = null; // { body, prettyBody } — not persisted

  const saved = await api.getContent();
  if (saved && typeof saved === 'object' && 'method' in saved) {
    state = { ...defaults, ...saved };
  }

  // Ensure trailing-empty rows are populated
  ensureTrailingEmpty(state.params);
  ensureTrailingEmpty(state.headers);
  ensureTrailingEmpty(state.formBody);

  function save() {
    // Never save response — only request state
    api.saveContent({
      method:    state.method,
      url:       state.url,
      params:    state.params.filter(r => r.key || r.value),
      headers:   state.headers.filter(r => r.key || r.value),
      bodyMode:  state.bodyMode,
      formBody:  state.formBody.filter(r => r.key || r.value),
      rawBody:   state.rawBody,
      activeTab: state.activeTab,
      prettyJson: state.prettyJson,
    });
  }

  // ── Sync: URL ↔ params ──
  let syncing = false;

  function paramsToUrl() {
    if (syncing) return;
    syncing = true;
    try {
      const enabled = state.params.filter(r => r.enabled && r.key);
      const qs = new URLSearchParams(enabled.map(r => [r.key, r.value])).toString();
      try {
        const u = new URL(state.url);
        u.search = qs ? '?' + qs : '';
        urlInput.value = u.toString();
        state.url = urlInput.value;
      } catch {
        // URL not parseable — just append
        const base = state.url.split('?')[0];
        urlInput.value = qs ? `${base}?${qs}` : base;
        state.url = urlInput.value;
      }
    } finally {
      syncing = false;
    }
  }

  function urlToParams() {
    if (syncing) return;
    syncing = true;
    try {
      const u = new URL(state.url);
      state.params = [];
      u.searchParams.forEach((v, k) => state.params.push({ key: k, value: v, enabled: true }));
      ensureTrailingEmpty(state.params);
      renderKvList(kvContainers.params, state.params, () => { paramsToUrl(); save(); });
    } catch {
      // incomplete URL — skip
    } finally {
      syncing = false;
    }
  }

  // ── Render body panel ──
  let rawTextarea = null;

  function renderBodyContent() {
    bodyContent.innerHTML = '';
    rawTextarea = null;

    if (state.bodyMode === 'none') {
      const msg = document.createElement('div');
      msg.className = 'ac-body-none-msg';
      msg.textContent = 'No body';
      bodyContent.appendChild(msg);
    } else if (state.bodyMode === 'form-data') {
      const list = document.createElement('div');
      list.className = 'ac-kv-list';
      bodyContent.appendChild(list);
      renderKvList(list, state.formBody, () => { save(); });
    } else if (state.bodyMode === 'raw') {
      const hdr = document.createElement('div');
      hdr.className = 'ac-raw-header';
      const lbl = document.createElement('span');
      lbl.className = 'ac-raw-label';
      lbl.textContent = 'JSON';
      const prettyBtn = document.createElement('button');
      prettyBtn.className = 'ac-raw-pretty-btn';
      prettyBtn.textContent = 'Pretty';
      prettyBtn.addEventListener('click', () => {
        if (!rawTextarea) return;
        try {
          rawTextarea.value = JSON.stringify(JSON.parse(rawTextarea.value), null, 2);
          state.rawBody = rawTextarea.value;
          save();
        } catch { /* invalid JSON — no-op */ }
      });
      hdr.appendChild(lbl);
      hdr.appendChild(prettyBtn);

      rawTextarea = document.createElement('textarea');
      rawTextarea.className = 'ac-raw-textarea';
      rawTextarea.placeholder = '{"key": "value"}';
      rawTextarea.value = state.rawBody;
      rawTextarea.spellcheck = false;
      rawTextarea.addEventListener('input', () => { state.rawBody = rawTextarea.value; save(); });

      bodyContent.appendChild(hdr);
      bodyContent.appendChild(rawTextarea);
    }
  }

  // ── Render response ──
  function renderResponse() {
    if (!lastResponse) {
      respHeader.style.display = 'none';
      respBody.innerHTML = '<div class="ac-response-placeholder">Send a request to see the response</div>';
      return;
    }

    respHeader.style.display = 'flex';

    if (!lastResponse.ok) {
      statusBadge.textContent = 'Error';
      statusBadge.className = 'ac-status-badge serr';
      metaTime.textContent = `· ${lastResponse.durationMs} ms`;
      metaSize.textContent = '';
      respBody.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'ac-error-text';
      pre.textContent = lastResponse.error;
      respBody.appendChild(pre);
      return;
    }

    const s = lastResponse.status;
    const cls = s >= 500 ? 's5xx' : s >= 400 ? 's4xx' : s >= 300 ? 's3xx' : 's2xx';
    statusBadge.textContent = `${s} ${lastResponse.statusText}`;
    statusBadge.className = `ac-status-badge ${cls}`;
    metaTime.textContent = `· ${lastResponse.durationMs} ms`;
    const bytes = new TextEncoder().encode(lastResponse.body).length;
    metaSize.textContent = `· ${bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB'}`;

    let display = lastResponse.body;
    if (state.prettyJson) {
      try { display = JSON.stringify(JSON.parse(lastResponse.body), null, 2); } catch { /* not JSON */ }
    }
    respBody.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = display;
    respBody.appendChild(pre);
  }

  // ── Wire up method select ──
  methodSel.value = state.method;
  methodSel.className = `ac-method-select m-${state.method}`;
  methodSel.addEventListener('change', () => {
    state.method = methodSel.value;
    methodSel.className = `ac-method-select m-${state.method}`;
    save();
  });

  // ── Wire up URL input ──
  urlInput.value = state.url;
  urlInput.addEventListener('input', () => {
    const v = urlInput.value;
    // curl detection
    if (v.trimStart().toLowerCase().startsWith('curl ')) {
      const parsed = parseCurl(v.trim());
      if (parsed) {
        state.url      = parsed.url;
        state.method   = parsed.method;
        state.headers  = parsed.headers;
        state.bodyMode = parsed.bodyMode;
        state.rawBody  = parsed.rawBody;
        state.formBody = parsed.formBody.length ? parsed.formBody : [emptyRow()];
        ensureTrailingEmpty(state.headers);
        ensureTrailingEmpty(state.formBody);
        methodSel.value = state.method;
        methodSel.className = `ac-method-select m-${state.method}`;
        urlInput.value = state.url;
        renderKvList(kvContainers.headers, state.headers, () => { save(); });
        modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === state.bodyMode));
        renderBodyContent();
        // switch to body tab if there's a body
        if (state.bodyMode !== 'none') switchTab('body');
        else if (state.headers.some(h => h.key)) switchTab('headers');
        urlToParams();
        save();
        return;
      }
    }
    state.url = v;
    urlToParams();
    save();
  });

  // ── Wire up tabs ──
  function switchTab(name) {
    state.activeTab = name;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    panelEls.forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  }
  tabBtns.forEach(btn => btn.addEventListener('click', () => { switchTab(btn.dataset.tab); save(); }));
  switchTab(state.activeTab);

  // ── Wire up body mode buttons ──
  modeBtns.forEach(btn => btn.addEventListener('click', () => {
    state.bodyMode = btn.dataset.mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === state.bodyMode));
    renderBodyContent();
    save();
  }));

  // ── Wire up pretty JSON checkbox ──
  prettyCheck.checked = state.prettyJson;
  prettyCheck.addEventListener('change', () => { state.prettyJson = prettyCheck.checked; renderResponse(); save(); });

  // ── Initial renders ──
  renderKvList(kvContainers.params,  state.params,  () => { paramsToUrl(); save(); });
  renderKvList(kvContainers.headers, state.headers, () => { save(); });
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === state.bodyMode));
  renderBodyContent();
  renderResponse();

  // ── Send ──
  sendBtn.addEventListener('click', async () => {
    if (!state.url) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    const hdrs = {};
    state.headers.filter(r => r.enabled && r.key).forEach(r => { hdrs[r.key] = r.value; });

    let body = null;
    if (state.method !== 'GET' && state.method !== 'HEAD') {
      if (state.bodyMode === 'raw') {
        body = state.rawBody;
        if (!Object.keys(hdrs).some(k => k.toLowerCase() === 'content-type')) {
          hdrs['Content-Type'] = 'application/json';
        }
      } else if (state.bodyMode === 'form-data') {
        const params = new URLSearchParams();
        state.formBody.filter(r => r.enabled && r.key).forEach(r => params.append(r.key, r.value));
        body = params.toString();
        if (!Object.keys(hdrs).some(k => k.toLowerCase() === 'content-type')) {
          hdrs['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }
    }

    try {
      const res = await fetch('/api/http-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: state.method, url: state.url, headers: hdrs, body }),
      });
      lastResponse = await res.json();
    } catch (e) {
      lastResponse = { ok: false, error: e.message, durationMs: 0 };
    }

    renderResponse();
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  });
}
