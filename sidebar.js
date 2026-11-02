/*
 * KOBE Bojonegoro | Shared Sidebar v2.0
 * The only source of truth for navigation items, sidebar CSS and interactions.
 * Install ONCE in every HTML page: <script src="sidebar.js" defer></script>
 * For a page inside a subfolder: <script src="../sidebar.js" defer></script>
 * Add/remove/rename menu items only in MENU below.
 */
(function () {
  'use strict';
  if (window.KobeSidebar && window.KobeSidebar.version === '2.0') return;

  // SINGLE MENU MASTER. All linked HTML pages share these same items.
  const MENU = [
    { title: 'Overview', items: [
      { name: 'Dashboard Utama', url: 'index.html', icon: 'home' },
      { name: 'Jargon KMS', url: 'index.html#dor-jargon', icon: 'spark' },
      { name: 'Komitmen & Kebijakan KOBE', url: 'index.html#dor-opening', icon: 'book' }
    ] },
    { title: 'Performance', items: [
      { name: 'OEE', url: 'oee.html', icon: 'gauge' },
      { name: 'Tonase', url: 'tonase.html', icon: 'chart' },
      { name: 'Waste', url: 'waste.html', icon: 'chart' },
      { name: 'Cost Material / Ton', url: 'cost-material.html', icon: 'chart' },
      { name: 'Energy (Listrik & Gas)', url: 'energy.html', icon: 'bolt' },
      { name: 'Variance', url: 'input-variance.html', icon: 'chart' }
    ] },
    { title: 'Safety', items: [
      { name: 'HSE Monitoring', url: 'hse.html', icon: 'shield' }
    ] },
    { title: 'Data & Improvement', items: [
      { name: 'Shift Hand Over (SQCDP)', url: 'sho.html', icon: 'activity' },
      { name: 'Improvement Monitoring', url: 'improvement-monitoring.html', icon: 'spark' },
      { name: 'Monitoring Gramasi', url: 'gramasi-monitoring.html', icon: 'chart' },
      { name: 'Analisa Packaging Reject', url: 'packaging-reject-monitoring.html', icon: 'chart' },
      { name: 'Form Input Packaging Reject', url: 'packaging-reject-input.html', icon: 'form' },
      { name: 'Smart Way', url: 'smartway.html', icon: 'activity' },
      { name: 'Baopack', url: 'baopack.html', icon: 'activity' },
      { name: 'ChingFong', url: 'chingfong.html', icon: 'activity' },
      { name: 'Extruder', url: 'import-extruder.html', icon: 'activity' }
    ] }
  ];

  // Existing KOBE logo is embedded here, so there is no second logo file.
  const LOGO = 'data:image/webp;base64,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';
  const ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    spark: '<path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z"/>',
    book: '<path d="M4 4.5h6a3 3 0 0 1 3 3V21a3 3 0 0 0-3-3H4zM20 4.5h-4a3 3 0 0 0-3 3V21a3 3 0 0 1 3-3h4z"/>',
    gauge: '<path d="M5.2 17.8a9 9 0 1 1 13.6 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1"/>',
    chart: '<rect x="4" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="8" width="3" height="12" rx="1"/><rect x="17" y="4" width="3" height="16" rx="1"/>',
    bolt: '<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>',
    shield: '<path d="M12 2 4 5v6c0 5.6 3.1 9.6 8 11 4.9-1.4 8-5.4 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    form: '<path d="M7 3h10l3 3v15H4V3z"/><path d="M8 10h8M8 14h8M8 18h5"/>',
    activity: '<path d="M3 12h5l3-7 4 14 3-7h3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M5 5 19 19M19 5 5 19"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>'
  };
  const svg = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.activity}</svg>`;
  const CSS = `
    #sidebar.kobe-sidebar-v2, #sidebar.kobe-sidebar-v2 * { box-sizing: border-box !important; }
    #sidebar.kobe-sidebar-v2 {
      all: initial; position: fixed !important; inset: 0 auto 0 0 !important;
      box-sizing: border-box !important; z-index: 2147483000 !important;
      width: 284px !important; max-width: min(284px, 91vw) !important;
      background: linear-gradient(165deg,#102a4d 0%,#0d223e 52%,#0b172b 100%) !important;
      color: #eaf0fb !important; font-family: Inter,system-ui,-apple-system,'Segoe UI',sans-serif !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
      visibility: hidden !important; pointer-events: none !important;
      transform: translate3d(-102%,0,0) !important;
      transition: transform .25s ease, visibility .25s ease !important;
      box-shadow: 24px 0 55px rgba(6,18,40,.26) !important;
    }
    #sidebar.kobe-sidebar-v2.kobe-sidebar-open {
      visibility: visible !important; pointer-events: auto !important;
      transform: translate3d(0,0,0) !important;
    }
    #sidebar.kobe-sidebar-v2 .kb-head { display:flex; align-items:center; gap:10px; padding:22px 16px 19px; border-bottom:1px solid rgba(255,255,255,.10); flex-shrink:0; }
    #sidebar.kobe-sidebar-v2 .kb-logo { width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:13px;background:#fff;box-shadow:0 6px 16px rgba(0,0,0,.15); }
    #sidebar.kobe-sidebar-v2 .kb-logo img { max-width:31px;max-height:31px;object-fit:contain;display:block; }
    #sidebar.kobe-sidebar-v2 .kb-brand { min-width:0;display:flex;flex-direction:column;gap:3px; }
    #sidebar.kobe-sidebar-v2 .kb-brand strong { color:#fff;font-size:12px;letter-spacing:.07em;font-weight:850;white-space:nowrap; }
    #sidebar.kobe-sidebar-v2 .kb-brand small { color:#9db0ca;font-size:10px;font-weight:600;white-space:nowrap; }
    #sidebar.kobe-sidebar-v2 .kb-close { width:33px;height:33px;display:grid;place-items:center;margin-left:auto;padding:7px;flex:0 0 33px;cursor:pointer;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.07);color:#e5efff; }
    #sidebar.kobe-sidebar-v2 .kb-close:hover { background:rgba(255,255,255,.16); }
    #sidebar.kobe-sidebar-v2 .kb-close svg, button.kobe-sidebar-trigger svg { width:20px;height:20px;display:block; }
    #sidebar.kobe-sidebar-v2 .kb-search-wrap { margin:16px 14px 10px;position:relative;flex-shrink:0; }
    #sidebar.kobe-sidebar-v2 .kb-search-icon { position:absolute;left:11px;top:50%;transform:translateY(-50%);display:flex;color:#8fa9ca;pointer-events:none; }
    #sidebar.kobe-sidebar-v2 .kb-search-icon svg { width:16px;height:16px; }
    #sidebar.kobe-sidebar-v2 .kb-search { all:unset; box-sizing:border-box !important;width:100%;height:39px;padding:0 12px 0 35px;border:1px solid rgba(198,215,238,.15);border-radius:11px;background:rgba(255,255,255,.07);color:#fff;font:500 11px Inter,system-ui,sans-serif;outline:none; }
    #sidebar.kobe-sidebar-v2 .kb-search::placeholder { color:#8fa8c5; }
    #sidebar.kobe-sidebar-v2 .kb-search:focus { border-color:#77acff;box-shadow:0 0 0 3px rgba(77,136,251,.15); }
    #sidebar.kobe-sidebar-v2 .kb-nav { flex:1;min-height:0;display:block;overflow:auto;padding:2px 11px 10px;scrollbar-width:thin;scrollbar-color:#416080 transparent; }
    #sidebar.kobe-sidebar-v2 .kb-section { display:block;margin:3px 0 14px; }
    #sidebar.kobe-sidebar-v2 .kb-section[hidden], #sidebar.kobe-sidebar-v2 .kb-link[hidden] { display:none !important; }
    #sidebar.kobe-sidebar-v2 .kb-section-title { display:block;margin:0 0 6px;padding:9px 12px 4px;color:#8fa6c4;font-size:9px;font-weight:850;letter-spacing:.11em;text-transform:uppercase; }
    #sidebar.kobe-sidebar-v2 .kb-link { box-sizing:border-box !important;display:flex;align-items:center;gap:11px;min-height:39px;padding:9px 11px;margin:2px 0;border:1px solid transparent;border-radius:11px;color:#c7d5e9;text-decoration:none;font-size:11.5px;font-weight:650;line-height:1.35;transition: background .15s ease,color .15s ease,border-color .15s ease;white-space:normal; }
    #sidebar.kobe-sidebar-v2 .kb-link svg { width:16px;height:16px;flex:0 0 16px;opacity:.85; }
    #sidebar.kobe-sidebar-v2 .kb-link span { flex:1;min-width:0; }
    #sidebar.kobe-sidebar-v2 .kb-link:hover { color:#fff;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.08); }
    #sidebar.kobe-sidebar-v2 .kb-link.kb-active { color:#fff;background:linear-gradient(100deg,rgba(54,118,227,.34),rgba(113,85,218,.21));border-color:rgba(115,172,255,.22);box-shadow:inset 3px 0 0 #67a4ff; }
    #sidebar.kobe-sidebar-v2 .kb-link.kb-active svg { color:#8fbaff;opacity:1; }
    #sidebar.kobe-sidebar-v2 .kb-footer { flex-shrink:0;display:flex;align-items:center;gap:9px;margin:0 14px;padding:14px 4px 17px;border-top:1px solid rgba(255,255,255,.09);color:#91a9c7;font-size:10px;font-weight:650; }
    #sidebar.kobe-sidebar-v2 .kb-dot { width:7px;height:7px;border-radius:99px;flex:0 0 7px;background:#34ce92;box-shadow:0 0 0 4px rgba(52,206,146,.11); }
    #kobe-sidebar-backdrop { position:fixed;inset:0;z-index:2147482999;background:rgba(8,20,40,.57);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px); }
    #kobe-sidebar-backdrop[hidden] { display:none!important; }
    body.kobe-sidebar-locked { overflow:hidden!important; }
    button.kobe-sidebar-trigger { box-sizing:border-box !important;display:inline-grid !important;place-items:center !important;width:40px !important;height:40px !important;flex:0 0 40px !important;padding:0 !important;margin:0 !important;border:1px solid #dbe6f4 !important;border-radius:12px !important;background:#fff !important;color:#32506e !important;box-shadow:0 5px 15px rgba(23,57,100,.06) !important;cursor:pointer !important;line-height:1 !important;font-size:17px !important;vertical-align:middle !important;transition:background .18s ease,box-shadow .18s ease !important; }
    button.kobe-sidebar-trigger:hover { background:#eaf3ff!important;box-shadow:0 7px 16px rgba(22,92,170,.13)!important; }
    button.kobe-sidebar-trigger.kb-floating { position:fixed !important;top:16px !important;left:16px !important;z-index:2147482900 !important; }
    #sidebar.kobe-sidebar-v2 a:focus-visible, #sidebar.kobe-sidebar-v2 button:focus-visible, button.kobe-sidebar-trigger:focus-visible { outline:2px solid #83baff;outline-offset:3px; }
    @media(max-width:640px){
      #sidebar.kobe-sidebar-v2 { width:264px!important;max-width:91vw!important; }
      #sidebar.kobe-sidebar-v2 .kb-head { padding:18px 13px 15px; }
      #sidebar.kobe-sidebar-v2 .kb-nav { padding:2px 9px 8px; }
      button.kobe-sidebar-trigger { width:37px!important;height:37px!important;flex-basis:37px!important; }
    }
    @media(prefers-reduced-motion:reduce){ #sidebar.kobe-sidebar-v2 { transition:none!important; } }
  `;

  // Resolve links from sidebar.js location, not from the opened HTML page.
  const scriptUrl = document.currentScript && document.currentScript.src;
  const BASE = new URL('.', scriptUrl || document.baseURI);
  const fullUrl = path => new URL(path, BASE).href;
  const normalizedPath = pathname => pathname.toLowerCase().replace(/\/$/, '/index.html');
  const current = () => new URL(location.href);
  let sidebar = null;
  let backdrop = null;
  let closeButton = null;
  let searchInput = null;
  let opener = null;
  let triggers = [];

  function isActive(linkUrl) {
    const target = new URL(linkUrl, BASE);
    const here = current();
    if (normalizedPath(target.pathname) !== normalizedPath(here.pathname)) return false;
    if (target.hash) return target.hash === here.hash;
    return !here.hash || !['#dor-jargon', '#dor-opening'].includes(here.hash);
  }
  function updateActive() {
    if (!sidebar) return;
    sidebar.querySelectorAll('.kb-link').forEach(a => {
      const active = isActive(a.dataset.route);
      a.classList.toggle('kb-active',active);
      if (active) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });
  }
  function revealHash() {
    const id = decodeURIComponent(location.hash.replace(/^#/,''));
    if (!['dor-jargon','dor-opening'].includes(id)) return;
    const target = document.getElementById(id);
    if (target && target.tagName === 'DETAILS') target.open = true;
  }
  function setButtons(opened) {
    triggers.forEach(button => button.setAttribute('aria-expanded', String(opened)));
  }
  function open() {
    if (!sidebar || sidebar.classList.contains('kobe-sidebar-open')) return;
    opener = document.activeElement;
    sidebar.inert = false;
    sidebar.setAttribute('aria-hidden','false');
    sidebar.classList.add('kobe-sidebar-open');
    backdrop.hidden = false;
    document.body.classList.add('kobe-sidebar-locked');
    setButtons(true);
    closeButton.focus({preventScroll:true});
  }
  function close(restoreFocus = true) {
    if (!sidebar || !sidebar.classList.contains('kobe-sidebar-open')) return;
    sidebar.classList.remove('kobe-sidebar-open');
    sidebar.setAttribute('aria-hidden','true');
    sidebar.inert = true;
    backdrop.hidden = true;
    document.body.classList.remove('kobe-sidebar-locked');
    setButtons(false);
    if (searchInput) searchInput.value = '';
    filterItems('');
    if (restoreFocus && opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus({preventScroll:true});
    }
  }
  function toggle() { sidebar && sidebar.classList.contains('kobe-sidebar-open') ? close() : open(); }
  function filterItems(term) {
    if (!sidebar) return;
    const query = (term || '').toLocaleLowerCase('id-ID').trim();
    sidebar.querySelectorAll('.kb-section').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.kb-link').forEach(link => {
        const show = link.textContent.toLocaleLowerCase('id-ID').includes(query);
        link.hidden = !show;
        if (show) visible++;
      });
      section.hidden = visible === 0;
    });
  }
  function buildIcon(name) {
    const wrapper = document.createElement('span');
    wrapper.innerHTML = svg(name);
    return wrapper.firstElementChild;
  }
  function buildElement(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content != null) el.textContent = content;
    return el;
  }
  function bindTrigger(button) {
    if (!button || triggers.includes(button)) return;
    button.removeAttribute('onclick');
    button.onclick = null;
    button.classList.remove('menu-btn');
    button.classList.add('kobe-sidebar-trigger');
    button.type = 'button';
    button.replaceChildren(buildIcon('menu'));
    button.setAttribute('aria-label','Buka menu navigasi');
    button.setAttribute('aria-controls','sidebar');
    button.setAttribute('aria-expanded','false');
    button.addEventListener('click', toggle);
    triggers.push(button);
  }
  function ensureTrigger() {
    const asButton = element => {
      if (element.tagName === 'BUTTON') return element;
      const replacement = document.createElement('button');
      element.replaceWith(replacement);
      return replacement;
    };
    const existing = [...document.querySelectorAll('[data-kobe-sidebar-toggle]')];
    if (existing.length) { existing.map(asButton).forEach(bindTrigger); return; }
    const oldButton = document.querySelector('.topbar .menu-btn, header .menu-btn');
    if (oldButton) { bindTrigger(asButton(oldButton)); return; }
    const header = document.querySelector('[data-kobe-sidebar-slot], .topbar, header.topbar, header');
    const button = document.createElement('button');
    if (header) header.insertBefore(button, header.firstChild);
    else { document.body.insertBefore(button, document.body.firstChild); button.classList.add('kb-floating'); }
    bindTrigger(button);
  }
  function initialize() {
    if (!document.body || sidebar) return;
    // Remove legacy hardcoded sidebar: the new sidebar is always owned by this file.
    const oldSidebar = document.getElementById('sidebar');
    if (oldSidebar && !oldSidebar.classList.contains('kobe-sidebar-v2')) oldSidebar.remove();
    const oldBackdrop = document.getElementById('kobe-sidebar-backdrop');
    if (oldBackdrop) oldBackdrop.remove();
    const css = document.createElement('style');
    css.id = 'kobe-sidebar-shared-css';
    css.textContent = CSS;
    document.head.append(css);

    sidebar = buildElement('aside','kobe-sidebar-v2');
    sidebar.id = 'sidebar';
    sidebar.setAttribute('aria-label','Navigasi KOBE Bojonegoro');
    sidebar.setAttribute('aria-hidden','true');
    sidebar.inert = true;

    const head = buildElement('div','kb-head');
    const logo = buildElement('div','kb-logo');
    const image = document.createElement('img'); image.alt = 'KOBE'; image.src = LOGO;
    logo.append(image);
    const brand = buildElement('div','kb-brand');
    brand.append(buildElement('strong','', 'KOBE BOJONEGORO'), buildElement('small','','Manufacturing Dashboard'));
    closeButton = buildElement('button','kb-close'); closeButton.type = 'button';
    closeButton.setAttribute('aria-label','Tutup menu navigasi');
    closeButton.append(buildIcon('close')); closeButton.addEventListener('click', () => close());
    head.append(logo,brand,closeButton);

    const search = buildElement('div','kb-search-wrap');
    const searchIcon = buildElement('span','kb-search-icon'); searchIcon.append(buildIcon('search'));
    searchInput = buildElement('input','kb-search');
    searchInput.type = 'search'; searchInput.placeholder = 'Cari halaman...';
    searchInput.setAttribute('aria-label','Cari halaman dalam navigasi');
    searchInput.addEventListener('input', () => filterItems(searchInput.value));
    search.append(searchIcon,searchInput);

    const nav = buildElement('nav','kb-nav');
    nav.setAttribute('aria-label','Menu dashboard');
    for (const group of MENU) {
      const section = buildElement('section','kb-section');
      section.append(buildElement('h3','kb-section-title',group.title));
      for (const item of group.items) {
        const link = buildElement('a','kb-link');
        link.href = fullUrl(item.url);
        link.dataset.route = item.url;
        link.append(buildIcon(item.icon),buildElement('span','',item.name));
        link.addEventListener('click', () => {
          const target = new URL(item.url, BASE);
          if (normalizedPath(target.pathname) === normalizedPath(location.pathname) && target.hash) {
            const dest = document.getElementById(decodeURIComponent(target.hash.slice(1)));
            if (dest && dest.tagName === 'DETAILS') dest.open = true;
          }
          close(false);
        });
        section.append(link);
      }
      nav.append(section);
    }
    const footer = buildElement('div','kb-footer');
    footer.append(buildElement('span','kb-dot'),buildElement('span','', 'KOBE Manufacturing System'));
    sidebar.append(head,search,nav,footer);

    backdrop = document.createElement('div');
    backdrop.id = 'kobe-sidebar-backdrop'; backdrop.hidden = true;
    backdrop.addEventListener('click', () => close());
    document.body.append(backdrop,sidebar);
    ensureTrigger();
    document.addEventListener('keydown', event => {
      if (!sidebar || !sidebar.classList.contains('kobe-sidebar-open')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const candidates = [...sidebar.querySelectorAll('button,input:not([disabled]),a[href]:not([hidden])')]
        .filter(el => !el.closest('[hidden]'));
      if (!candidates.length) return;
      const first = candidates[0], last = candidates[candidates.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('hashchange', () => { revealHash(); updateActive(); });
    updateActive(); revealHash();
  }

  window.KobeSidebar = { version:'2.0', open, close, toggle, updateActive };
  window.toggleMenu = toggle; // Backward-compatible with older inline onclick handlers.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
