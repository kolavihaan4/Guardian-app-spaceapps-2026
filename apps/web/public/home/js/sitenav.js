/* The one navigation bar. The home site (cards, collections) and the crew health app (triage,
   vitals, hazards) are two programs on one origin; both draw their header from this file, so the
   bar is the same wherever you are. */
(function () {
  const S = (window.Still = window.Still || {});
  const isHome = location.pathname.indexOf('/home/') === 0;
  const HOME = '/home/index.html';

  // icons the home site's set does not have
  const EXTRA = {
    flask: '<path d="M9 3.5h6M10 3.5v6l-5 8.6a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9.5v-6M7.6 15h8.8"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>'
  };
  const base = S.icon;
  const icon = (S.icon = (name, cls) => EXTRA[name]
    ? '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + EXTRA[name] + '</svg>'
    : base(name, cls));

  // `site` says which program owns the page; `key` is that program's own route name
  const home = (key, label, ic, extra) => Object.assign({ site: 'home', key, id: key, label, icon: ic, href: (isHome ? '' : HOME) + '#/' + key }, extra);
  const app = (key, label, ic, title) => ({ site: 'app', key, id: 'app:' + key, label, icon: ic, title, href: (isHome ? '/' : '') + '#/' + key });

  const ITEMS = [
    home('dashboard', 'Dashboard', 'dashboard'),
    app('assessment', 'Triage', 'heart', 'Crew Triage & Body Map'),
    app('dashboard', 'Vitals', 'pulse', 'Dynamic Vitals Charts'),
    app('space', 'Hazards', 'radiation', 'Space Radiation & Hazards'),
    app('baseline', 'Lab Baseline', 'flask', 'NASA Lab Baseline'),
    app('correlation', 'Overlay', 'chartLine', 'Hazard Overlay'),
    { menu: 'cards', label: 'Cards', icon: 'cards', badge: true, items: [
      home('cards', 'My cards', 'cards', { badge: true }),
      home('collections', 'Collections', 'layers'),
      home('library', 'Card library', 'library')
    ] },
    { menu: 'more', label: 'More', icon: 'more', items: [
      app('citations', 'Citations', 'book', 'Citations & Licenses'),
      app('connections', 'Sources', 'link', 'Telemetry Sources'),
      app('privacy', 'Privacy & account', 'lock', 'Settings & Privacy'),
      home('settings', 'Settings', 'settings')
    ] }
  ];
  const pages = ITEMS.reduce((all, n) => all.concat(n.items || [n]), []);

  const ENVS = { iss: 'ISS', mars: 'Mars', moon: 'Moon', spacecraft: 'Spacecraft' };
  function saved() {
    try { return JSON.parse(localStorage.getItem('still.v1') || '{}') || {}; } catch (e) { return {}; }
  }

  const badge = '<span class="badge" data-nav-badge>0</span>';
  function linkHtml(n, d, cls) {
    return `<a class="${cls}" href="${n.href}" data-nav="${n.id}"${n.title ? ` title="${n.title.replace(/&/g, '&amp;')}"` : ''} style="--d:${d}ms">${icon(n.icon)}<span>${n.label}</span>${n.badge ? badge : ''}</a>`;
  }
  function navHtml() {
    return ITEMS.map((n, i) => {
      const d = 120 + i * 40;
      if (!n.items) return linkHtml(n, d, 'nav__link');
      return `<details class="nav__menu" data-menu="${n.menu}">
        <summary class="nav__link" style="--d:${d}ms">${icon(n.icon)}<span>${n.label}</span>${n.badge ? badge : ''}${icon('chevron')}</summary>
        <div class="nav__panel">${n.items.map(m => linkHtml(m, 0, 'nav__item')).join('')}</div>
      </details>`;
    }).join('');
  }
  function actionsHtml() {
    return `<a class="env-pill" id="envPill" href="${isHome ? '' : HOME}#/environment" title="Change environment" style="--d:440ms"></a>
       <button class="icon-btn" data-action="search" aria-label="Search (Ctrl+K)" title="Search  Ctrl K" style="--d:480ms">${icon('search')}</button>
       <button class="icon-btn icon-btn--help" data-action="guide" aria-label="Quick guide" title="Quick guide" style="--d:520ms">${icon('help')}</button>
       <button class="btn btn--primary btn--add" data-action="add-card" style="--d:560ms">${icon('plus')}<span>Add card</span></button>`;
  }

  /** Marks the page that is open (`id` as in `pages`), and refreshes the card count and environment. */
  function mark(id) {
    const s = saved();
    document.querySelectorAll('#nav [data-nav]').forEach(a => {
      if (a.dataset.nav === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('#nav .nav__menu').forEach(m => {
      const on = !!m.querySelector('[aria-current="page"]');
      m.querySelector('summary').classList.toggle('is-current', on);
      m.open = narrow.matches;
    });
    document.querySelectorAll('#nav [data-nav-badge]').forEach(b => { b.textContent = (s.cards || []).length; });
    const pill = document.getElementById('envPill');
    if (pill && ENVS[s.env] && !isHome) {   // the home site fills its own pill
      pill.innerHTML = `<img src="/home/assets/env/${s.env}.jpg" alt="" width="26" height="26"><span>${ENVS[s.env]}</span>`;
      pill.setAttribute('aria-label', `Environment: ${ENVS[s.env]}. Change environment`);
    }
  }

  // where the bar scrolls sideways a dropdown would be clipped, so there the menus stay open and sit in line
  const narrow = window.matchMedia('(max-width: 1100px)');
  narrow.addEventListener('change', () => document.querySelectorAll('#nav .nav__menu').forEach(m => { m.open = narrow.matches; }));
  const closeMenus = except => narrow.matches || document.querySelectorAll('#nav .nav__menu[open]').forEach(m => { if (m !== except) m.open = false; });
  document.addEventListener('click', e => {
    const menu = e.target.closest && e.target.closest('.nav__menu');
    closeMenus(e.target.closest && e.target.closest('summary') ? menu : null);
    // search, the guide and the card form belong to the home site: from the health app, go there and open them
    const act = !isHome && e.target.closest && e.target.closest('#actions [data-action]');
    if (act) {
      try { sessionStorage.setItem('guardian.do', act.dataset.action); } catch (err) { /* storage blocked */ }
      location.href = HOME + '#/dashboard';
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(null); });

  /** The action the health app asked for on its way here, once. */
  function takeRequest() {
    try {
      const a = sessionStorage.getItem('guardian.do');
      sessionStorage.removeItem('guardian.do');
      return a;
    } catch (e) { return null; }
  }

  window.GuardianNav = { pages, navHtml, actionsHtml, mark, takeRequest };
})();
