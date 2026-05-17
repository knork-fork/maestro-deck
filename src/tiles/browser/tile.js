export async function mount(container, api) {
  const webview  = container.querySelector('.browser-tile-webview');
  const urlbar   = container.querySelector('.browser-tile-urlbar');
  const btnBack   = container.querySelector('.browser-btn-back');
  const btnFwd    = container.querySelector('.browser-btn-fwd');
  const btnReload = container.querySelector('.browser-btn-reload');

  const saved = await api.getContent();
  const initialUrl = saved?.url || null;

  function normalizeUrl(input) {
    const s = input.trim();
    if (!s) return null;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s)) return s;
    if (!s.includes(' ')) {
      const host = s.split('/')[0].split(':')[0];
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
        || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')
        || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      const scheme = isLocal ? 'http://' : 'https://';
      if (s.includes('.') || isLocal) return scheme + s;
    }
    return 'https://www.google.com/search?q=' + encodeURIComponent(s);
  }

  function updateNav() {
    btnBack.disabled = !webview.canGoBack();
    btnFwd.disabled  = !webview.canGoForward();
  }

  function onNavigated(url) {
    if (url && url !== 'about:blank') {
      urlbar.value = url;
      api.saveContent({ url });
    }
    updateNav();
  }

  const onDidNavigate       = (e) => onNavigated(e.url);
  const onDidNavigateInPage = (e) => { if (e.isMainFrame) onNavigated(e.url); };
  const onDomReady          = () => updateNav();

  webview.addEventListener('did-navigate',         onDidNavigate);
  webview.addEventListener('did-navigate-in-page', onDidNavigateInPage);
  webview.addEventListener('dom-ready',            onDomReady);

  webview.addEventListener('context-menu', (e) => {
    const tileEl = container.closest('.tile');
    if (!tileEl) return;
    tileEl.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: e.params.x, clientY: e.params.y,
    }));
  });

  webview.addEventListener('new-window', (e) => {
    e.preventDefault();
    if (e.url && e.url !== 'about:blank') webview.loadURL(e.url);
  });

  btnBack.addEventListener('click',   () => webview.goBack());
  btnFwd.addEventListener('click',    () => webview.goForward());
  btnReload.addEventListener('click', () => webview.reload());

  urlbar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = normalizeUrl(urlbar.value);
      if (url) webview.loadURL(url);
      webview.focus();
    }
  });

  urlbar.addEventListener('focus', () => urlbar.select());

  if (initialUrl) {
    webview.addEventListener('dom-ready', () => {}, { once: true });
    webview.src = initialUrl;
    urlbar.value = initialUrl;
  }

  return () => {
    webview.removeEventListener('did-navigate',         onDidNavigate);
    webview.removeEventListener('did-navigate-in-page', onDidNavigateInPage);
    webview.removeEventListener('dom-ready',            onDomReady);
  };
}
