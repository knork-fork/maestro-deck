import { mount as terminalMount } from '/tiles/terminal/tile.js';

const RENEW_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10.5 3A5 5 0 1 0 11 6"/>
  <polyline points="8.5 1.5 11 3.5 9 6"/>
</svg>`;

function resumeCmdFor(ticketId) {
  return `claude "/maestro:next ${ticketId}"; exit\n`;
}

export async function mount(container, api) {
  const workspacePath = new URLSearchParams(location.search).get('path') || '';
  const saved = await api.getContent();

  // Local cache of the full maestro content object — avoids race conditions
  // where async api.getContent() fetches stale server state mid-save.
  let maestroState = saved ?? {};

  function saveMaestroState(patch) {
    maestroState = { ...maestroState, ...patch };
    api.saveContent(maestroState);
  }

  let terminalCleanup = null;
  let currentState = null;
  let terminalHtmlCache = null;

  // ── Titlebar injection ────────────────────────────────────────────────────
  const tileEl = container.closest('.tile');
  const titlebarExtra = tileEl?.querySelector('.tile-titlebar-extra') ?? null;

  let renewBtn = null;
  let titleLabel = null;

  if (titlebarExtra) {
    renewBtn = document.createElement('button');
    renewBtn.className = 'maestro-renew-btn';
    renewBtn.title = 'Continue ticket in new session';
    renewBtn.innerHTML = `${RENEW_SVG}<span>renew session</span>`;
    renewBtn.style.display = 'none';
    renewBtn.addEventListener('click', e => { e.stopPropagation(); renewSession(); });

    titleLabel = document.createElement('span');
    titleLabel.className = 'maestro-title-label';

    titlebarExtra.appendChild(renewBtn);
    titlebarExtra.appendChild(titleLabel);
  }

  function updateTitlebar(ticketId, ticketSummary) {
    if (titleLabel) titleLabel.textContent = ticketId ? (ticketSummary || ticketId) : '';
    if (renewBtn) renewBtn.style.display = ticketId ? '' : 'none';
  }

  // ── Context menu hook ─────────────────────────────────────────────────────
  container.addEventListener('md-get-ctx-items', e => {
    if (currentState === 'active') {
      e.detail.items.push({ label: 'Renew session', action: renewSession });
    }
  });

  // ── View switching ────────────────────────────────────────────────────────
  function showView(name) {
    for (const v of container.querySelectorAll('.maestro-view')) {
      v.style.display = v.dataset.view === name ? '' : 'none';
    }
    currentState = name;
  }

  // ── Init view ─────────────────────────────────────────────────────────────
  container.querySelector('.maestro-btn-new').addEventListener('click', startNewTicket);
  container.querySelector('.maestro-btn-resume-list').addEventListener('click', loadResumeList);

  // ── Resume list view ──────────────────────────────────────────────────────
  let searchAbort = null;

  async function loadResumeList() {
    showView('resume-list');
    const listEl = container.querySelector('.maestro-resume-list');
    listEl.innerHTML = `<div class="maestro-resume-empty">Loading…</div>`;

    let tickets = [];
    try {
      const r = await fetch(`/api/maestro/resume-list?path=${encodeURIComponent(workspacePath)}`);
      if (!r.ok) throw new Error('Failed');
      ({ tickets } = await r.json());
    } catch {
      listEl.innerHTML = `<div class="maestro-resume-empty">Could not load tickets.</div>`;
      return;
    }

    if (tickets.length === 0) {
      listEl.innerHTML = `<div class="maestro-resume-empty">No open tickets found.</div>`;
      return;
    }

    const searchInput = container.querySelector('.maestro-search-input');
    searchInput.value = '';

    function renderList(filter) {
      listEl.innerHTML = '';
      const q = filter.toLowerCase();
      const filtered = filter
        ? tickets.filter(t => t.id.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q))
        : tickets;
      const visible = filter ? filtered : filtered.slice(0, 10);
      if (visible.length === 0) {
        listEl.innerHTML = `<div class="maestro-resume-empty">No matches.</div>`;
        return;
      }
      for (const ticket of visible) {
        const item = document.createElement('div');
        item.className = 'maestro-resume-item';
        item.innerHTML = `
          <div class="maestro-resume-item-summary">${escapeHtml(ticket.summary || ticket.id)}</div>
          ${ticket.summary ? `<div class="maestro-resume-item-id">${escapeHtml(ticket.id)}</div>` : ''}
        `;
        item.addEventListener('click', () => selectResumeTicket(ticket));
        listEl.appendChild(item);
      }
    }

    renderList('');

    searchAbort?.abort();
    searchAbort = new AbortController();
    searchInput.addEventListener('input', () => renderList(searchInput.value.trim()),
      { signal: searchAbort.signal });
  }

  function selectResumeTicket(ticket) {
    const resumeCmd = resumeCmdFor(ticket.id);
    saveMaestroState({ ticketId: ticket.id, ticketSummary: ticket.summary, resumeCmd, terminal: null });
    startTerminalForTicket(ticket.id, resumeCmd, ticket.summary);
  }

  container.querySelector('.maestro-resume-back').addEventListener('click', () => showView('init'));

  // ── Continue view ─────────────────────────────────────────────────────────
  function showContinueView(ticketId, ticketSummary) {
    container.querySelector('.maestro-continue-id').textContent = ticketSummary || ticketId;
    showView('continue');
  }

  container.querySelector('.maestro-btn-yes').addEventListener('click', () => {
    const { ticketId, resumeCmd, ticketSummary } = maestroState;
    if (ticketId) startTerminalForTicket(ticketId, resumeCmd, ticketSummary);
  });

  container.querySelector('.maestro-btn-no').addEventListener('click', () => {
    maestroState = {};
    api.saveContent(null);
    updateTitlebar(null, null);
    showView('init');
  });

  // ── Terminal composition ──────────────────────────────────────────────────
  async function getTerminalHtml() {
    if (terminalHtmlCache) return terminalHtmlCache;
    const r = await fetch('/tiles/terminal/tile.html');
    terminalHtmlCache = await r.text();
    return terminalHtmlCache;
  }

  // The terminal API proxy stores terminal state under the 'terminal' key
  // of maestroState, without fetching from the server (avoids race conditions).
  function makeTerminalApi(initCmd) {
    return {
      tileId: api.tileId,
      async getContent() {
        return { ...(maestroState.terminal ?? {}), initCmd: initCmd ?? null };
      },
      saveContent(termData) {
        saveMaestroState({ terminal: termData });
      },
    };
  }

  async function startTerminalForTicket(ticketId, resumeCmd, ticketSummary) {
    if (terminalCleanup) { try { terminalCleanup(); } catch {} terminalCleanup = null; }

    const activeEl = container.querySelector('[data-view="active"]');
    activeEl.innerHTML = await getTerminalHtml();
    showView('active');
    updateTitlebar(ticketId, ticketSummary);

    terminalCleanup = await terminalMount(activeEl, makeTerminalApi(resumeCmd), {
      onExit: () => {
        const { ticketId: id, ticketSummary: summary } = maestroState;
        if (id) showContinueView(id, summary);
        else showView('init');
      },
    });
  }

  async function startNewTicket() {
    if (terminalCleanup) { try { terminalCleanup(); } catch {} terminalCleanup = null; }

    const activeEl = container.querySelector('[data-view="active"]');
    activeEl.innerHTML = await getTerminalHtml();
    showView('active');

    let ticketCaptured = false;
    terminalCleanup = await terminalMount(activeEl, makeTerminalApi('maestro launch\n'), {
      onPtyData: chunk => {
        if (ticketCaptured) return;
        const m = /MAESTRO_TICKET=(\S+)/.exec(chunk);
        if (!m) return;
        ticketCaptured = true;
        const ticketId = m[1];
        const resumeCmd = resumeCmdFor(ticketId);
        saveMaestroState({ ticketId, ticketSummary: '', resumeCmd, terminal: null });
        startTerminalForTicket(ticketId, resumeCmd, '');
      },
      onExit: () => {
        if (ticketCaptured) return;
        showView('init');
      },
    });
  }

  async function renewSession() {
    const { ticketId, resumeCmd, ticketSummary } = maestroState;
    if (!ticketId) return;
    saveMaestroState({ terminal: null });
    startTerminalForTicket(ticketId, resumeCmd, ticketSummary);
  }

  // ── Initial state ─────────────────────────────────────────────────────────
  if (maestroState.ticketId) {
    updateTitlebar(maestroState.ticketId, maestroState.ticketSummary);
    showContinueView(maestroState.ticketId, maestroState.ticketSummary);
  } else {
    showView('init');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  return () => {
    searchAbort?.abort();
    if (terminalCleanup) { try { terminalCleanup(); } catch {} }
    if (titlebarExtra) titlebarExtra.innerHTML = '';
  };
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
