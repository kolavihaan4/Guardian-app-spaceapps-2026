/* The one navigation bar. The home site (the dashboard and the cards) and the crew health app (triage,
   vitals, hazards) are two programs on one origin; both draw their header from this file, so the
   bar is the same wherever you are. */
(function () {
  const S = (window.Still = window.Still || {});
  const isHome = location.pathname.indexOf('/home/') === 0;
  const HOME = '/home/index.html';

  // icons the home site's set does not have
  const EXTRA = {
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    out: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4M19 12H9"/>',
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
    app('space', 'Hazards', 'radiation', 'Space Radiation & Hazards'),
    app('assessment', 'Triage', 'heart', 'Crew Triage & Body Map'),
    app('dashboard', 'Vitals', 'pulse', 'Vitals over time, the lab baseline and NASA data'),
    home('cards', 'Cards', 'cards', { badge: true }),
    { menu: 'more', label: 'More', icon: 'more', items: [
      app('citations', 'Citations', 'book', 'Citations & Licenses'),
      home('settings', 'Settings', 'settings')
    ] }
  ];
  // Pages without a link of their own light the link of the section they belong to: Vitals is three
  // pages with a row of tabs between them, and the account page is reached from Settings.
  const PART_OF = { 'app:baseline': 'app:dashboard', 'app:correlation': 'app:dashboard', 'app:privacy': 'settings' };
  const pages = ITEMS.reduce((all, n) => all.concat(n.items || [n]), []);

  const ENVS = { iss: 'ISS', mars: 'Mars', moon: 'Moon', spacecraft: 'Spacecraft' };
  function saved() {
    try { return JSON.parse(localStorage.getItem('still.v1') || '{}') || {}; } catch (e) { return {}; }
  }
  // How many cards the signed-in person has. Cards live with the account, not in localStorage: on the
  // home site the store holds them (js/store.js); the health app asks the account once (js/auth.js).
  let counted = null;
  function cardCount() {
    if (window.Still && window.Still.store) return window.Still.store.get().cards.length;
    if (counted === null && window.GuardianAuth) {
      counted = 0;
      window.GuardianAuth.user().then(u => (u ? window.GuardianAuth.cards.list() : [])).then(rows => {
        counted = rows.length;
        document.querySelectorAll('#nav [data-nav-badge]').forEach(b => { b.textContent = counted; });
      }, () => {});
    }
    return counted || 0;
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
       <span class="acct" id="acct" style="--d:560ms">${accountHtml()}</span>`;
  }

  // The account button at the end of the bar. Signed out it is a green "Sign in or sign up" link to
  // the sign-in page; signed in it is a chip with the person's email and a small menu. (Adding a card
  // is on the dashboard's "Log vitals" tile and on the My cards page.)
  const SIGN_IN = '/#/sign-in', ACCOUNT = '/#/privacy';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let who;   // undefined until it is known; then null (nobody) or { email }
  function accountHtml() {
    if (who === undefined) return '';
    if (!who) return `<a class="acct__in" href="${SIGN_IN}" aria-label="Sign in or sign up"><span class="lg">Sign in or sign up</span><span class="sm" aria-hidden="true">Sign in</span></a>`;
    const email = esc(who.email || 'Your account');
    return `<details class="acct__menu">
        <summary class="acct__chip" aria-label="Account: ${email}"><span class="acct__initial" aria-hidden="true">${esc((who.email || '?').trim().charAt(0).toUpperCase())}</span><span class="acct__email">${email}</span>${icon('chevron')}</summary>
        <div class="acct__panel">
          <a class="nav__item" href="${ACCOUNT}">${icon('lock')}<span>Your account and data</span></a>
          <button class="nav__item" type="button" data-acct="sign-out">${icon('out')}<span>Sign out</span></button>
        </div>
      </details>`;
  }
  /** Says who is signed in (`{ email }`), or that nobody is (null), and redraws the account button. */
  function account(user) {
    who = user ? { email: user.email ? String(user.email) : '' } : null;
    const slot = document.getElementById('acct');
    if (slot) slot.innerHTML = accountHtml();
  }
  // signing out ends on the home page, with this visit's location forgotten (js/env.js)
  function signOut() {
    const auth = window.GuardianAuth;
    Promise.resolve(auth ? auth.signOut() : null)
      .catch(() => {})
      .then(() => { if (window.GuardianEnv) window.GuardianEnv.signOut(); location.href = HOME; });
  }
  const closeAccount = except => document.querySelectorAll('.acct__menu[open]').forEach(m => { if (m !== except) m.open = false; });
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    closeAccount(e.target.closest('.acct__menu'));
    if (e.target.closest('[data-acct="sign-out"]')) signOut();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAccount(null); });

  /** Marks the page that is open (`id` as in `pages`), and refreshes the card count and environment. */
  function mark(id) {
    id = PART_OF[id] || id;
    const s = saved();
    document.querySelectorAll('#nav [data-nav]').forEach(a => {
      if (a.dataset.nav === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('#nav .nav__menu').forEach(m => {
      const on = !!m.querySelector('[aria-current="page"]');
      m.querySelector('summary').classList.toggle('is-current', on);
      m.open = narrow.matches;
    });
    document.querySelectorAll('#nav [data-nav-badge]').forEach(b => { b.textContent = cardCount(); });
    const pill = document.getElementById('envPill');
    const env = window.GuardianEnv ? window.GuardianEnv.get() : null;   // the location for this visit: js/env.js
    if (pill && ENVS[env] && !isHome) {   // the home site fills its own pill
      pill.innerHTML = `<img src="/home/assets/env/${env}.jpg" alt="" width="26" height="26"><span>${ENVS[env]}</span>`;
      pill.setAttribute('aria-label', `Environment: ${ENVS[env]}. Change environment`);
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
      if (act.dataset.action === 'guide' && window.GuardianTour) { window.GuardianTour.start(); return; }
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

  window.GuardianNav = { pages, navHtml, actionsHtml, mark, takeRequest, account };
})();

/* Hover in the top bar: one highlight glides from title to title as the pointer moves along it. */
(function () {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const LINKS = '.nav__link, .land-nav__link';
  let pill = null, shown = false, hideTimer = 0;
  document.documentElement.classList.add('has-glide');
  function place(link) {
    const bar = link.closest('.topbar');
    if (!bar) return;
    if (!pill || pill.parentNode !== bar) {
      pill = document.createElement('span');
      pill.className = 'nav-glide';
      pill.setAttribute('aria-hidden', 'true');
      bar.appendChild(pill);
      shown = false;
    }
    const b = bar.getBoundingClientRect(), r = link.getBoundingClientRect();
    if (!shown) pill.style.transition = 'opacity 0.22s ease';   // appear where the pointer is, then glide from there
    pill.style.width = r.width + 'px';
    pill.style.height = r.height + 'px';
    pill.style.transform = 'translate(' + (r.left - b.left) + 'px,' + (r.top - b.top) + 'px)';
    if (!shown) { void pill.offsetWidth; pill.style.transition = ''; }
    pill.classList.add('is-on');
    shown = true;
  }
  document.addEventListener('pointerover', function (e) {
    if (!fine.matches || !e.target.closest) return;
    const link = e.target.closest(LINKS);
    if (!link || !link.closest('.topbar')) return;
    clearTimeout(hideTimer);
    place(link);
  });
  document.addEventListener('pointerout', function (e) {
    if (!pill || !e.target.closest || !e.target.closest(LINKS)) return;
    const to = e.relatedTarget;
    if (to && to.closest && to.closest(LINKS)) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { pill.classList.remove('is-on'); shown = false; }, 140);   // long enough to cross the gap between two titles
  });
})();
