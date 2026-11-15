/* Guardian — routes, views, modals. */
(function () {
  'use strict';
  const S = window.Still;
  const store = S.store;
  const icon = S.icon;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const main = $('#main'), topbar = $('#topbar'), modalRoot = $('#modalRoot');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

  const TYPES = [
    { id: 'idea', label: 'Idea', icon: 'bulb' },
    { id: 'observation', label: 'Observation', icon: 'eye' },
    { id: 'question', label: 'Question', icon: 'help' },
    { id: 'data', label: 'Data source', icon: 'database' },
    { id: 'task', label: 'Task', icon: 'task' }
  ];
  const typeOf = id => TYPES.find(t => t.id === id) || TYPES[0];

  const TEMPLATES = [
    { id: 'crew-health', name: 'Crew health observation', type: 'observation', icon: 'heart', text: 'Log one reading that changed and what might explain it.', title: 'Crew health: ', notes: 'Crew member:\nReading (heart rate, sleep, SpO2, mood):\nWhat changed:\nPossible cause:' },
    { id: 'data-source', name: 'Mission data source', type: 'data', icon: 'database', text: 'Keep a dataset, where it lives and what it measures.', title: 'Dataset: ', notes: 'Dataset:\nLink:\nWhat it measures:\nUseful for:' },
    { id: 'hypothesis', name: 'Hypothesis', type: 'idea', icon: 'bulb', text: 'Say what you think is true and how you would check it.', title: 'We think ', notes: 'We think that:\nBecause:\nWe will know when:' },
    { id: 'mentor-q', name: 'Question for mentors', type: 'question', icon: 'help', text: 'Save a question for the next mentor check-in.', title: 'Ask: ', notes: 'Question:\nWhy it matters:\nWho to ask:' },
    { id: 'build-task', name: 'Build task', type: 'task', icon: 'task', text: 'One piece of work with an owner and a finish line.', title: 'Build: ', notes: 'Owner:\nDone when:\nDue:' },
    { id: 'pitch', name: 'Pitch moment', type: 'idea', icon: 'megaphone', text: 'A line, a number or a story for the final pitch.', title: 'Pitch: ', notes: 'The moment:\nWhy judges will care:' }
  ];

  // Photos: NASA / NASA-JPL-Caltech-MSSS via Wikimedia Commons, public domain (see README)
  const ENVS = [
    { id: 'iss', name: 'International Space Station', short: 'ISS', img: 'assets/env/iss.jpg', w: 1280, h: 816,
      alt: 'The International Space Station above Earth, its solar arrays spread wide',
      text: 'Low Earth orbit, 400 km up. Weightless days, a sunrise every 90 minutes and Earth outside the window.',
      facts: ['Microgravity', '~400 km orbit', '90-min day'] },
    { id: 'mars', name: 'Mars', short: 'Mars', img: 'assets/env/mars.jpg', w: 1280, h: 641,
      alt: 'The layered slopes of Mount Sharp in Gale Crater, photographed by the Curiosity rover',
      text: 'Six to nine months from Earth. Thin air, red dust and a long wait for every answer from home.',
      facts: ['0.38 g', '24 h 39 min sol', '3–22 min signal delay'] },
    { id: 'moon', name: 'Moon', short: 'Moon', img: 'assets/env/moon.jpg', w: 1280, h: 1288,
      alt: 'Buzz Aldrin standing on the lunar surface during Apollo 11',
      text: 'Three days from Earth. Fine grey dust, low gravity and nights that last two weeks.',
      facts: ['0.17 g', '29.5-day day', '1.3 s signal delay'] },
    { id: 'spacecraft', name: 'Spacecraft', short: 'Spacecraft', img: 'assets/env/spacecraft.jpg', w: 1280, h: 960,
      alt: 'The Orion spacecraft in deep space with the Moon and Earth behind it, photographed on Artemis I',
      text: 'Deep space between worlds. A cabin the size of a small van, days in transit and no gravity.',
      facts: ['Microgravity', '~9 m³ cabin', 'Deep-space radiation'] }
  ];
  const envOf = id => ENVS.find(e => e.id === id) || null;
  const gated = () => !store.get().env;
  // Signed out, a visitor sees the home page and the location picker on the way in to it, and nothing
  // else: every other address, and everything that leads further in, goes to the sign-in page. Signing
  // in or signing up lands on the dashboard (the health app sends them there: src/guardian.ts).
  const signedIn = () => !!window.GuardianEnv.user();
  const toSignIn = () => { location.assign(APP.signIn); };

  // the crew health app (triage, vitals, hazards) shares this origin; its pages sit in the same nav
  const APP = { triage: '/#/assessment', vitals: '/#/dashboard', hazards: '/#/space', account: '/#/privacy', signIn: '/#/sign-in' };
  // the navigation bar is shared with the health app: js/sitenav.js
  const NAV = window.GuardianNav.pages;

  /* ---------------------------------------------------------------- dates */
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'Yesterday' : d < 7 ? d + ' days ago' : fmtDate(t);
  }

  /* ---------------------------------------------------------------- lookups */
  const findCard = id => store.get().cards.find(c => c.id === id);
  const newest = list => list.slice().sort((a, b) => b.createdAt - a.createdAt);

  /* ---------------------------------------------------------------- shared bits */
  function pageHead(o) {
    return `<header class="page-head">
      <div class="page-head__text">
        ${o.back ? `<a class="back" href="${o.back.href}">${icon('arrowLeft')}${esc(o.back.label)}</a>` : `<p class="eyebrow">${esc(o.eyebrow)}</p>`}
        <h1 id="page-title">${o.title}</h1>
        ${o.sub ? `<p class="sub">${o.sub}</p>` : ''}
      </div>
      ${o.action ? `<div class="page-head__action">${o.action}</div>` : ''}
    </header>`;
  }
  const addBtn = (extra) => `<button class="btn btn--primary" data-action="add-card"${extra || ''}>${icon('plus')}Add card</button>`;
  const chipIcon = (name, cls) => `<span class="chip-icon${cls ? ' ' + cls : ''}">${icon(name)}</span>`;
  const typeTag = t => { const ty = typeOf(t); return `<span class="tag">${icon(ty.icon)}${ty.label}</span>`; };
  function emptyBlock(name, title, text, action) {
    return `<div class="empty">${chipIcon(name, 'chip-icon--round')}<p class="empty__title">${title}</p><p class="empty__text">${text}</p>${action || ''}</div>`;
  }

  /* ---------------------------------------------------------------- dashboard */
  // The dashboard has one job: get the person to what they came to do in one click. What the cards
  // hold is on the Cards pages, and vital signs are private to each crew member, so neither is
  // repeated here. A greeting (always shown), then four panels that Customize view can hide.
  const PANELS = [
    { key: 'actions', icon: 'task', name: 'What do you want to do?', text: 'Four big buttons for the things you do most.' },
    { key: 'where', icon: 'satellite', name: 'Where the crew is', text: 'The crew’s location, and a switch to change it.' },
    { key: 'today', icon: 'clock', name: 'Today', text: 'Space weather and your last entry, in one line.' },
    { key: 'check', icon: 'check', name: 'Today’s check', text: 'Whether vitals are logged today, and how many days in a row.' }
  ];
  // "Log vitals" opens the add-card form on the crew health template, when the library has one
  const vitalsTemplate = TEMPLATES.find(t => t.id === 'crew-health') || TEMPLATES.find(t => /vital|health/i.test(t.id + ' ' + t.name));
  const ACTIONS = [
    { key: 'log', icon: 'pulse', name: 'Log vitals', text: 'Write down a reading while it is fresh.', go: 'Start a card',
      action: vitalsTemplate ? 'use-template' : 'add-card', id: vitalsTemplate ? vitalsTemplate.id : '' },
    { key: 'check', icon: 'heart', name: 'Check a crew member', text: 'Compare their readings with safe ranges and get a plan.', go: 'Open Triage', href: APP.triage },
    { key: 'binder', icon: 'cards', name: 'Open the binder', text: 'Every card you have saved, in one place.', go: 'Open My cards', href: '#/cards' },
    { key: 'hazards', icon: 'radiation', name: 'See the hazards', text: 'What space does to the body, and today’s space weather.', go: 'Open Hazards', href: APP.hazards }
  ];
  const CREW_IS = { iss: 'aboard the International Space Station', mars: 'on Mars', moon: 'on the Moon', spacecraft: 'aboard the spacecraft' };
  function greeting(now) {
    const h = now.getHours();
    return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening';
  }

  // "Today's check": have vitals been logged today, and for how many days in a row. A card counts
  // when it was started from the crew health template (the one the Log vitals tile opens): new cards
  // carry the template's id, and cards made before that are known by the template's type and the
  // start of its title. Only that such a card exists, and the day it was made, is read; never what
  // it says, because vitals are private.
  const isVitals = c => !!vitalsTemplate && (c.template ? c.template === vitalsTemplate.id
    : c.type === vitalsTemplate.type && String(c.title).indexOf(vitalsTemplate.title.trim()) === 0);
  const dayKey = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  function vitalsCheck(cards, now) {
    const days = new Set(cards.filter(isVitals).map(c => dayKey(new Date(c.createdAt))));
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const today = days.has(dayKey(d));
    // the run of days ends today once today is logged; until then it ends yesterday, and today can still join it
    if (!today) d.setDate(d.getDate() - 1);
    let streak = 0;
    while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { today, streak };
  }

  function viewDashboard(s) {
    const v = s.view, env = envOf(s.env), now = new Date();
    // where the crew is and today's check share a row; either one alone takes all of it
    const where = v.where && env ? whereCrewIs(env) : '', check = v.check ? todaysCheck() : '';
    const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const customize = `<button class="btn btn--ghost" data-action="customize">${icon('sliders')}Customize view</button>`;
    return `<div class="dash">
      <header class="dash-head">
        <div class="dash-head__text">
          <p class="dash-kicker">${icon('dashboard')}Dashboard</p>
          <h1 class="dash-title" id="page-title">${greeting(now)}</h1>
          <p class="dash-sub">The crew is ${env ? CREW_IS[env.id] : 'on the way'}<span class="sep" aria-hidden="true">·</span><time datetime="${iso}">${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</time></p>
        </div>
        <div class="dash-head__action">${customize}</div>
      </header>
      ${v.actions ? actionTiles() : ''}
      ${where || check ? `<div class="dash-row${where && check ? ' dash-row--two' : ''}">${where}${check}</div>` : ''}
      ${v.today ? `<section class="panel dash-strip" aria-labelledby="dash-today-title" data-panel="today">
        <h2 class="dash-strip__label" id="dash-today-title">Today</h2>
        <div class="dash-strip__body" id="dashToday"></div>
      </section>` : ''}
      ${PANELS.some(p => v[p.key]) ? '' : `<section class="panel dash-none" data-panel="none">${emptyBlock('sliders', 'Every panel is hidden', 'Turn panels back on in Customize view.', customize)}</section>`}
    </div>`;
  }

  // "What do you want to do?": four tiles, each one whole link or button
  function actionTiles() {
    const tile = a => {
      const attrs = `class="dash-tile" data-tile="${a.key}" aria-labelledby="tile-${a.key}" aria-describedby="tile-${a.key}-text"`;
      const inner = `<span class="dash-tile__top">${chipIcon(a.icon)}<span class="dash-tile__arrow" aria-hidden="true">${icon('arrowUpRight')}</span></span>
          <span class="dash-tile__name" id="tile-${a.key}">${a.name}</span>
          <span class="dash-tile__text" id="tile-${a.key}-text">${a.text}</span>
          <span class="dash-tile__go" aria-hidden="true">${a.go}${icon('arrowRight')}</span>`;
      return `<li>${a.href
        ? `<a ${attrs} href="${a.href}">${inner}</a>`
        : `<button type="button" ${attrs} data-action="${a.action}"${a.id ? ` data-id="${a.id}"` : ''}>${inner}</button>`}</li>`;
    };
    return `<section class="dash-do" aria-labelledby="dash-do-title" data-panel="actions">
      <h2 class="dash-h2" id="dash-do-title">What do you want to do?</h2>
      <ul class="dash-tiles">${ACTIONS.map(tile).join('')}</ul>
    </section>`;
  }

  // "Where the crew is": the photo, the name, one line, and the four locations as a switch
  function whereCrewIs(env) {
    const i = ENVS.indexOf(env);
    return `<section class="panel dash-where" aria-labelledby="dash-where-title" data-panel="where" data-env="${env.id}">
      <div class="dash-where__media"><img src="${env.img}" alt="${esc(env.alt)}" width="${env.w}" height="${env.h}" decoding="async"></div>
      <div class="dash-where__body">
        <h2 class="dash-label" id="dash-where-title">Where the crew is</h2>
        <p class="dash-where__name">${env.name}</p>
        <p class="dash-where__line">${HOME_LINES[env.id]}</p>
        <div class="dash-where__switch">
          <p class="dash-where__hint" id="dash-seg-label">Somewhere else? Change it here.</p>
          <div class="dash-seg" role="group" aria-labelledby="dash-seg-label" style="--i:${i};--cx:${i % 2};--cy:${i > 1 ? 1 : 0}">
            <span class="dash-seg__thumb" aria-hidden="true"></span>
            ${ENVS.map(e => `<button type="button" class="dash-seg__btn" data-action="set-env" data-env="${e.id}" aria-pressed="${e.id === env.id}">${e.short}</button>`).join('')}
          </div>
        </div>
      </div>
    </section>`;
  }

  // The location changes in place. The store decides whether it is saved (js/env.js: only for a
  // signed-in user); the page is drawn again, so the thumb glides and the photo cross-fades from
  // where they were, and the keyboard focus stays on the button that was pressed.
  function setEnvHere(id) {
    const env = envOf(id), was = store.get().env;
    if (!env || env.id === was) return;
    const from = ENVS.findIndex(e => e.id === was);
    const oldImg = main.querySelector('.dash-where__media img');
    const ghost = oldImg && !reduceMotion.matches ? oldImg.cloneNode(false) : null;
    if (ghost) ghost.style.objectPosition = getComputedStyle(oldImg).objectPosition;
    store.update(s => { s.env = env.id; });
    const btn = main.querySelector(`.dash-seg__btn[data-env="${env.id}"]`);
    if (btn) btn.focus({ preventScroll: true });
    toast(`Location set to ${env.name}`);
    if (reduceMotion.matches) return;
    const seg = main.querySelector('.dash-seg'), media = main.querySelector('.dash-where__media');
    if (seg && from >= 0) {
      const to = ENVS.indexOf(env);
      const put = n => { seg.style.setProperty('--i', n); seg.style.setProperty('--cx', n % 2); seg.style.setProperty('--cy', n > 1 ? 1 : 0); };
      seg.classList.add('is-jump'); put(from);
      void seg.offsetWidth;
      seg.classList.remove('is-jump'); put(to);
    }
    if (media && ghost) {
      ghost.className = 'dash-where__ghost';
      ghost.alt = '';
      ghost.setAttribute('aria-hidden', 'true');
      media.appendChild(ghost);
      media.classList.add('is-swap');
      setTimeout(() => { ghost.remove(); media.classList.remove('is-swap'); }, 700);
    }
    main.querySelectorAll('.dash-where__name, .dash-where__line').forEach(el => el.classList.add('is-fresh'));
  }

  /* ------------------------------------------------------------ dashboard: today's check */
  // A ring that fills once vitals are logged today, one line of plain words, the run of days, and a
  // button to log them now when they have not been (the same action as the Log vitals tile). The
  // ring is a picture of the words beside it, so it is hidden from screen readers.
  function todaysCheck() {
    return `<section class="panel dash-check" aria-labelledby="dash-check-title" data-panel="check">
      <h2 class="dash-label" id="dash-check-title">Today’s check</h2>
      <div class="dash-check__body" id="dashCheck" aria-live="polite"></div>
    </section>`;
  }
  function checkHtml(s) {
    const c = vitalsCheck(s.cards, new Date()), log = ACTIONS[0];
    return `<div class="dash-ring${c.today ? ' is-done' : ''}" data-n="${c.streak}" aria-hidden="true">
        <svg viewBox="0 0 100 100" focusable="false"><circle class="dash-ring__track" cx="50" cy="50" r="42"/><circle class="dash-ring__arc" cx="50" cy="50" r="42" transform="rotate(-90 50 50)"/></svg>
        <span class="dash-ring__n"><b>${c.streak}</b><small>${c.streak === 1 ? 'day' : 'days'}</small></span>
      </div>
      <div class="dash-check__text">
        <p class="dash-check__state">${c.today ? 'Vitals logged today' : 'No vitals logged yet today'}</p>
        <p class="dash-check__streak">${plural(c.streak, 'day')} in a row</p>
      </div>
      ${c.today ? '' : `<button type="button" class="btn btn--primary dash-check__go" data-action="${log.action}"${log.id ? ` data-id="${log.id}"` : ''}>${icon('pulse')}Log vitals now</button>`}`;
  }
  // Fills the panel without drawing the page again. The ring draws itself and its number counts up
  // when the panel arrives, and again when the day's vitals are logged; both play once, never behind
  // the opening, and under reduced motion the finished ring and number simply show.
  function fillCheck() {
    const el = document.getElementById('dashCheck');
    if (!el) return;
    const html = checkHtml(store.get());
    if (el.__html === html) return;
    const old = el.querySelector('.dash-ring');
    const from = old ? Number(old.dataset.n) || 0 : 0, wasDone = !!old && old.classList.contains('is-done');
    el.innerHTML = html; el.__html = html;
    if (reduceMotion.matches) return;
    const ring = el.querySelector('.dash-ring'), num = ring.querySelector('b'), to = Number(ring.dataset.n) || 0;
    const draw = ring.classList.contains('is-done') && !wasDone;
    if (draw) ring.classList.remove('is-done');
    if (to !== from) num.textContent = from;
    if (old) el.querySelector('.dash-check__text').classList.add('is-fresh');
    const play = () => {
      if (draw) {
        void getComputedStyle(ring.querySelector('.dash-ring__arc')).strokeDashoffset;   // start from the empty ring
        ring.classList.add('is-done', 'is-fresh');
      }
      countTo(num, from, to);
    };
    // on arrival, wait for the panel itself to come in
    const go = () => setTimeout(play, old ? 0 : 600);
    if (S.introDone) go(); else document.addEventListener('still:intro-done', go, { once: true });
  }
  function countTo(el, from, to) {
    if (from === to) return;
    const t0 = performance.now(), ms = Math.min(900, 320 + Math.abs(to - from) * 90);
    const step = now => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------ dashboard: today */
  // Space weather near Earth, read from the health assistant's API on this same origin, and asked
  // for only once someone is signed in. Vital signs are never shown here: they are private.
  const weather = { state: 'idle', data: null };
  let whoKnown = false;   // whether we know who is signed in (store.account settles after 1.5 s at most)
  function loadWeather() {
    if (weather.state !== 'idle') return;
    weather.state = 'loading';
    GuardianAuth.headers()
      .then(h => fetch('/api/nasa/radiation', { headers: Object.assign({ accept: 'application/json' }, h), credentials: 'same-origin' }))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then(j => { weather.data = j && j.data ? j.data : null; weather.state = weather.data ? 'ready' : 'error'; })
      .catch(() => { weather.state = 'error'; })
      .then(fillToday);
  }
  function todayHtml(s) {
    const note = (name, html, live) => `<p class="dash-strip__text"${live ? ' role="status"' : ''}>${chipIcon(name)}<span>${html}</span></p>`;
    // the dashboard is only reached signed in, so this shows for a moment at most
    if (!signedIn()) return note('clock', 'Getting today ready…', true);
    if (weather.state === 'idle') loadWeather();
    const w = weather.data;
    const line = weather.state === 'error' ? note('radiation', 'Space weather is not available right now.')
      : !w ? note('radiation', 'Checking today’s space weather…', true)
        : w.sScale > 0 ? note('radiation', `<strong>Solar radiation storm near Earth, level S${Number(w.sScale)} of 5.</strong> From NOAA.`)
          : w.sScale === 0 ? note('radiation', '<strong>Space weather is quiet.</strong> No radiation storm near Earth right now, says NOAA.')
            : note('radiation', 'NOAA has not published a storm level right now.');
    const last = newest(s.cards)[0];
    return line + (last ? `<button type="button" class="dash-strip__last" data-action="open-card" data-id="${last.id}">
        <b>Last entry</b><span class="dash-strip__title">${esc(last.title)}</span><small>${ago(last.createdAt)}</small>${icon('arrowRight')}</button>` : '');
  }
  // fills the strip without drawing the page again, so the arrival is never cut short
  function fillToday() {
    const el = document.getElementById('dashToday');
    if (!el) return;
    const html = todayHtml(store.get());
    if (el.__html === html) return;
    const first = el.__html === undefined, line = el.querySelector('.dash-strip__text'), last = el.querySelector('.dash-strip__last');
    const lineWas = line ? line.textContent : '', lastWas = last ? last.dataset.id : '';
    el.innerHTML = html; el.__html = html;
    if (first || reduceMotion.matches) return;
    // the icon answers a change in its line with a small pop, and a new last entry slides in: once each
    const lineNow = el.querySelector('.dash-strip__text'), lastNow = el.querySelector('.dash-strip__last');
    if (lineNow && lineNow.textContent !== lineWas) lineNow.classList.add('is-changed');
    if (lastNow && lastNow.dataset.id !== lastWas) lastNow.classList.add('is-new');
  }
  // Once we know who is here: a signed-out visitor anywhere but the home page goes to the sign-in page.
  // The page is not drawn again for this (that would cut the home page's arrival short); a signed-in
  // user's answer already redraws it through the store.
  store.account.then(() => {
    whoKnown = true;
    if (!signedIn() && currentPath() !== '/') { toSignIn(); return; }
    launchLabel();
    accountButton();
    fillToday();
    fillCheck();
  });

  // the dashboard arrives the way the home page does: the greeting, then each block in turn
  function revealDash() {
    if (reduceMotion.matches) return;
    const blocks = [...main.querySelectorAll('.dash-head, .dash-h2, .dash-tile, .dash-where, .dash-check, .dash-strip')];
    blocks.forEach(el => el.classList.add('rv'));
    const start = () => requestAnimationFrame(() => requestAnimationFrame(() => blocks.forEach((el, i) => {
      const delay = Math.min(i, 8) * 70;
      el.style.setProperty('--rv-d', delay + 'ms');
      el.classList.add('is-in');
      setTimeout(() => { el.classList.remove('rv', 'is-in'); el.style.removeProperty('--rv-d'); }, delay + 750);
    })));
    if (S.introDone) start(); else document.addEventListener('still:intro-done', start, { once: true });
  }

  /* ---------------------------------------------------------------- my cards */
  const filters = { q: '' };
  // The order of the cards: one menu, newest first unless another is chosen. The choice is a
  // preference, remembered in this browser (js/store.js).
  const SORTS = [
    { id: 'new', label: 'Newest first' },
    { id: 'old', label: 'Oldest first' },
    { id: 'az', label: 'A to Z' }
  ];
  const sortOf = id => SORTS.find(o => o.id === id) || SORTS[0];
  const SORT_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5v14M3.5 15.5 7 19l3.5-3.5M17 19V5M13.5 8.5 17 5l3.5 3.5"/></svg>';
  const byTitle = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  function sorted(list, how) {
    const out = newest(list);
    if (how === 'old') out.reverse();
    else if (how === 'az') out.sort((a, b) => byTitle.compare(a.title, b.title));   // the same title twice: the newer one first
    return out;
  }

  // Cards are saved to the account a moment after each change (js/store.js). If that fails they stay
  // on screen and the save is tried again; this line says so, near the cards, until it works.
  const SYNC_TEXT = {
    error: 'Could not save. Trying again.',
    limit: 'Could not save: an account holds up to 500 cards. Delete some and it will try again.',
    load: 'Could not load your cards. Trying again.'
  };
  const saveNote = () => `<p class="save-note" data-save-note role="status" aria-live="polite">${esc(SYNC_TEXT[store.sync()] || '')}</p>`;
  store.onSync(st => document.querySelectorAll('[data-save-note]').forEach(el => { el.textContent = SYNC_TEXT[st] || ''; }));

  function viewCards(s) {
    const cur = sortOf(s.sort);
    return pageHead({ eyebrow: s.workspace, title: 'My cards', sub: 'Every card you have captured.', action: addBtn() }) + saveNote() +
      `<div class="toolbar panel">
        <label class="search-field">${icon('search')}<span class="sr-only">Search cards</span>
          <input type="search" id="cardSearch" placeholder="Search cards" value="${esc(filters.q)}" data-input="q" autocomplete="off"></label>
        <div class="sort" data-sort>
          <span class="sort__label" id="sortLabel">Sort</span>
          <span class="sort__box">
            <button type="button" class="sort__btn" id="cardSort" aria-haspopup="listbox" aria-expanded="false" aria-controls="sortList" aria-labelledby="sortLabel cardSortValue">${SORT_ICON}<span id="cardSortValue">${cur.label}</span>${icon('chevron')}</button>
            <ul class="sort__list" id="sortList" role="listbox" aria-labelledby="sortLabel" tabindex="-1" hidden>
              ${SORTS.map(o => `<li class="sort__opt" role="option" id="sort-${o.id}" data-sort-id="${o.id}" aria-selected="${o.id === cur.id}">${icon('check')}<span>${o.label}</span></li>`).join('')}
            </ul>
          </span>
        </div>
      </div>
      <div id="cardGrid" class="card-grid">${cardGrid(s)}</div>`;
  }

  function filtered(s, list) {
    const q = filters.q.trim().toLowerCase();
    return sorted(list || s.cards, sortOf(s.sort).id).filter(c => !q || (c.title + ' ' + (c.notes || '')).toLowerCase().includes(q));
  }

  function cardGrid(s) {
    if (!s.cards.length) return `<div class="panel grid-empty">${emptyBlock('cards', 'No cards yet', 'Capture an idea, an observation or a question. It lands here.', addBtn())}</div>`;
    const list = filtered(s);
    if (!list.length) return `<div class="panel grid-empty">${emptyBlock('search', 'No cards match', 'Try another word, or clear the search.', `<button class="btn btn--ghost" data-action="clear-filters">Clear search</button>`)}</div>`;
    return list.map(cardTile).join('');
  }

  function cardTile(c) {
    return `<article class="panel card" data-action="open-card" data-id="${c.id}" role="button" tabindex="0" aria-label="Open card: ${esc(c.title)}">
      ${typeTag(c.type)}
      <h3 class="card__title">${esc(c.title)}</h3>
      ${c.notes ? `<p class="card__notes">${esc(c.notes)}</p>` : ''}
      <p class="card__meta"><span>${ago(c.createdAt)}</span></p>
    </article>`;
  }

  function refreshGrid() {
    const g = $('#cardGrid');
    if (g) g.innerHTML = cardGrid(store.get());
  }

  // The sort menu is a button that opens a short list. Enter, Space or an arrow key opens it; the
  // arrows, Home, End or a first letter move through it; Enter or Space chooses; Escape closes it
  // and so does Tab, which then moves on as usual. A click outside closes it too.
  function sortActive(list, opt) {
    list.querySelectorAll('.sort__opt').forEach(o => o.classList.toggle('is-active', o === opt));
    list.setAttribute('aria-activedescendant', opt.id);
  }
  function openSort() {
    const btn = $('#cardSort'), list = $('#sortList');
    if (!btn || !list || !list.hidden) return;
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    sortActive(list, list.querySelector('[aria-selected="true"]') || list.firstElementChild);
    list.focus({ preventScroll: true });
  }
  function closeSort(refocus) {
    const btn = $('#cardSort'), list = $('#sortList');
    if (!btn || !list || list.hidden) return;
    list.hidden = true;
    list.removeAttribute('aria-activedescendant');
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus({ preventScroll: true });
  }
  function chooseSort(id) {
    const to = sortOf(id).id;
    closeSort(true);
    if (to === store.get().sort) return;
    store.update(s => { s.sort = to; });   // saved, and the page is drawn again in the new order
    const btn = $('#cardSort');
    if (btn) btn.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest || !$('#sortList')) return;
    const opt = e.target.closest('.sort__opt');
    if (opt) chooseSort(opt.dataset.sortId);
    else if (e.target.closest('#cardSort')) { if ($('#sortList').hidden) openSort(); else closeSort(true); }
    else if (!e.target.closest('[data-sort]')) closeSort(false);
  });
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t.id === 'cardSort' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openSort(); return; }
    if (t.id !== 'sortList') return;
    const opts = [...t.querySelectorAll('.sort__opt')], i = Math.max(0, opts.findIndex(o => o.classList.contains('is-active')));
    let to = -1;
    if (e.key === 'ArrowDown') to = Math.min(opts.length - 1, i + 1);
    else if (e.key === 'ArrowUp') to = Math.max(0, i - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = opts.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseSort(opts[i].dataset.sortId); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSort(true); }
    // Tab: the focus goes back to the button, and from there the key moves it on (Shift+Tab stays on the button)
    else if (e.key === 'Tab') { closeSort(true); if (e.shiftKey) e.preventDefault(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) to = opts.findIndex(o => o.textContent.trim().toLowerCase().indexOf(e.key.toLowerCase()) === 0);
    if (to >= 0) { e.preventDefault(); sortActive(t, opts[to]); }
  });
  document.addEventListener('focusout', e => {
    const next = e.relatedTarget;
    if (e.target.id === 'sortList' && next && !(next.closest && next.closest('[data-sort]'))) closeSort(false);
  });

  /* ---------------------------------------------------------------- library */
  function viewLibrary(s) {
    return pageHead({ eyebrow: s.workspace, title: 'Card library', sub: 'Start a card from a template made for a Space Apps team.' }) +
      `<div class="lib-grid">${TEMPLATES.map(t => `<article class="panel lib-tile">
        <div class="lib-tile__head">${chipIcon(t.icon)}${typeTag(t.type)}</div>
        <h3 class="lib-tile__name">${t.name}</h3>
        <p class="lib-tile__text">${t.text}</p>
        <button class="btn btn--ghost btn--small" data-action="use-template" data-id="${t.id}">${icon('plus')}Use template</button>
      </article>`).join('')}</div>`;
  }

  /* ---------------------------------------------------------------- settings */
  function viewSettings(s) {
    return pageHead({ eyebrow: s.workspace, title: 'Settings', sub: 'Your workspace, the opening and your data.' }) +
      `<section class="panel settings" aria-labelledby="set-ws">
        <h2 class="settings__group" id="set-ws">Workspace</h2>
        <div class="setting">
          <div><h3>Mission environment</h3><p>${envOf(s.env) ? envOf(s.env).name : 'Not chosen yet'}. The dashboard is set up for it.</p></div>
          <a class="btn btn--ghost" href="#/environment">${icon('satellite')}Change environment</a>
        </div>
        <div class="setting">
          <div><h3>Workspace name</h3><p>Shown above every page title.</p></div>
          <form class="inline-form" data-form="workspace">
            <label class="sr-only" for="wsName">Workspace name</label>
            <input class="input" id="wsName" name="workspace" maxlength="40" value="${esc(s.workspace)}" required>
            <button class="btn btn--ghost" type="submit">Save</button>
          </form>
        </div>
        <div class="setting">
          <div><h3>Opening animation</h3><p>Play the orbit when the app opens.</p></div>
          <label class="switch"><input type="checkbox" data-change="intro"${s.intro ? ' checked' : ''}><span class="switch__track" aria-hidden="true"></span><span class="sr-only">Play the opening animation</span></label>
        </div>
        <div class="setting">
          <div><h3>Watch it again</h3><p>Reload the app and play the opening now.</p></div>
          <button class="btn btn--ghost" data-action="replay">${icon('replay')}Replay opening</button>
        </div>
      </section>
      <section class="panel settings" aria-labelledby="set-data">
        <h2 class="settings__group" id="set-data">Data</h2>
        <p class="settings__note">Cards are saved to your account. Export them to keep a copy of your own.</p>
        <div class="setting">
          <div><h3>Export</h3><p>${plural(s.cards.length, 'card')} as a JSON file.</p></div>
          <button class="btn btn--ghost" data-action="export">${icon('download')}Export</button>
        </div>
        <div class="setting">
          <div><h3>Clear all data</h3><p>Delete every card in your account.</p></div>
          <button class="btn btn--danger" data-action="clear-data">${icon('trash')}Clear data</button>
        </div>
      </section>
      <section class="panel settings" aria-labelledby="set-account">
        <h2 class="settings__group" id="set-account">Your account and data</h2>
        <p class="settings__note">Your sign-in, and the health data kept with it, have a page of their own.</p>
        <div class="setting">
          <div><h3>Account and health data</h3><p>Download your data, delete it, or delete the account.</p></div>
          <a class="btn btn--ghost" href="${APP.account}" data-go="account">${icon('lock')}Open your account and data</a>
        </div>
      </section>`;
  }

  /* ---------------------------------------------------------------- environment */
  function viewEnvironment(s, first, toHome) {
    const current = s.env;
    return `<section class="env" aria-labelledby="page-title">
      <header class="env__head">
        <p class="eyebrow">${first ? 'Mission setup' : esc(s.workspace)}</p>
        <h1 class="env__title" id="page-title">${first ? 'Where is your crew?' : 'Change environment'}</h1>
        ${window.GuardianEnv.user() ? '' : `<p class="sub" id="envNote">Your choice is kept for this visit only. <a href="${APP.signIn}">Sign in</a> and Guardian will remember it.</p>`}
      </header>
      <form class="env__form" data-form="env" data-first="${first}">
        <fieldset class="env__grid">
          <legend class="sr-only">Environment</legend>
          ${ENVS.map(e => `<label class="env-card${e.id === current ? ' is-selected' : ''}" data-env="${e.id}">
            <input class="sr-only" type="radio" name="env" value="${e.id}"${e.id === current ? ' checked' : ''}>
            <span class="env-card__media"><img src="${e.img}" alt="${esc(e.alt)}" width="${e.w}" height="${e.h}" decoding="async"></span>
            <span class="env-card__body"><span class="env-card__name">${e.name}</span></span>
          </label>`).join('')}
        </fieldset>
        <div class="env__actions">
          ${first ? '' : `<a class="btn btn--ghost btn--lg" href="#/dashboard">Cancel</a>`}
          <button class="btn btn--primary btn--lg" type="submit"${current ? '' : ' disabled'}>${first ? (toHome ? 'Continue' : 'Continue to dashboard') : 'Save environment'}${icon('arrowRight')}</button>
        </div>      </form>
    </section>`;
  }

  function notFound() {
    return pageHead({ eyebrow: 'Guardian', title: 'Page not found', sub: 'That page is not here.' }) +
      `<section class="panel">${emptyBlock('search', 'Nothing at this address', 'Go back to the dashboard to keep working.', `<a class="btn btn--primary" href="#/dashboard">Back to Dashboard</a>`)}</section>`;
  }

  /* ---------------------------------------------------------------- home page motion */
  // Everything here is short and plays once. The title's words rise into place and the opening lines
  // follow; each block eases in as it scrolls into view; a line draws through the three steps as far
  // as you have read; a hairline in the top bar shows how far down the page you are. Elements drop
  // the helper classes once they have arrived, so their own hover styles are untouched.
  let homeWatch = null, homeScroll = null;
  function leaveHome() {
    if (homeWatch) { homeWatch.disconnect(); homeWatch = null; }
    if (homeScroll) { window.removeEventListener('scroll', homeScroll); window.removeEventListener('resize', homeScroll); homeScroll = null; }
    const old = topbar.querySelector('.scroll-line');
    if (old) old.remove();
  }
  function revealHome() {
    leaveHome();
    if (reduceMotion.matches || !('IntersectionObserver' in window)) return;   // shown as it is
    const arrive = (el, delay) => {
      el.style.setProperty('--rv-d', delay + 'ms');
      el.classList.add('is-in', 'is-live');
      setTimeout(() => { el.classList.remove('rv', 'is-in'); el.style.removeProperty('--rv-d'); }, delay + 750);
    };
    // the title, word by word, each rising out of its own mask
    const title = main.querySelector('.home-title');
    if (title) {
      const words = title.textContent.split(' ');
      title.textContent = '';
      words.forEach((w, i) => {
        const mask = document.createElement('span'), word = document.createElement('span');
        mask.className = 'w';
        word.textContent = w;
        word.style.setProperty('--wd', 80 + i * 60 + 'ms');
        mask.appendChild(word);
        title.appendChild(mask);
        if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
      });
      title.classList.add('words');
    }
    const lead = [...main.querySelectorAll('.home-hero .home-kicker, .home-hero .home-lead, .home-hero .home-ctas')];
    const blocks = [...main.querySelectorAll('.home-head, .home-env, .hazard, .home-how__text, .steps > li, .home-preview, .home-final, .home-foot')];
    lead.concat(blocks).forEach(el => el.classList.add('rv'));
    const start = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (title) title.classList.add('is-in');
      lead.forEach((el, i) => arrive(el, i === 0 ? 0 : 380 + i * 110));   // the small heading first, the rest once the title is under way
    }));
    if (S.introDone) start(); else document.addEventListener('still:intro-done', start, { once: true });
    homeWatch = new IntersectionObserver(entries => {
      // things that come into view together (a row of cards) follow one another by 70 ms
      entries.filter(e => e.isIntersecting).forEach((e, i) => { homeWatch.unobserve(e.target); arrive(e.target, Math.min(i, 5) * 70); });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    blocks.forEach(el => homeWatch.observe(el));

    // the bars of the example chart grow one after another
    main.querySelectorAll('.home-preview__bars i').forEach((bar, i) => bar.style.setProperty('--i', i));
    main.querySelectorAll('.vitals-card__grid > div').forEach((cell, i) => cell.style.setProperty('--i', i));

    // a line through the three steps, drawn as far as you have read; each number lights as it is reached
    const steps = main.querySelector('.steps');
    if (steps) {
      steps.classList.add('steps--live');
      const rail = document.createElement('span');
      rail.className = 'steps__rail';
      rail.setAttribute('aria-hidden', 'true');
      steps.appendChild(rail);
    }
    // how far down the page: a hairline along the bottom of the top bar
    const line = document.createElement('span');
    line.className = 'scroll-line';
    line.setAttribute('aria-hidden', 'true');
    topbar.appendChild(line);

    let queued = false;
    const measure = () => {
      queued = false;
      const far = document.documentElement.scrollHeight - innerHeight;
      line.style.setProperty('--p', far > 0 ? Math.min(1, scrollY / far).toFixed(4) : '0');
      const st = main.querySelector('.steps--live');
      const rail = st && st.querySelector('.steps__rail');
      const nums = st ? [...st.querySelectorAll('.steps__n')] : [];
      if (!rail || nums.length < 2) return;
      const first = nums[0].getBoundingClientRect(), last = nums[nums.length - 1].getBoundingClientRect(), box = st.getBoundingClientRect();
      const top = first.top + first.height / 2, len = last.top + last.height / 2 - top;
      if (len <= 0) return;
      rail.style.top = (top - box.top) + 'px';
      rail.style.height = len + 'px';
      rail.style.left = (first.left + first.width / 2 - box.left - 1) + 'px';
      const p = Math.max(0, Math.min(1, (innerHeight * 0.62 - top) / len));
      rail.style.setProperty('--p', p.toFixed(4));
      nums.forEach(n => { const c = n.getBoundingClientRect(); n.classList.toggle('is-lit', (c.top + c.height / 2 - top) / len <= p + 0.001); });
    };
    homeScroll = () => { if (!queued) { queued = true; requestAnimationFrame(measure); } };
    window.addEventListener('scroll', homeScroll, { passive: true });
    window.addEventListener('resize', homeScroll);
    measure();
  }
  // a soft light that follows the pointer across the cards
  main.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.home-env, .hazard, .dash-tile');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    // and the cards lean a few degrees toward it
    card.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5) * 5).toFixed(2) + 'deg');
    card.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 6).toFixed(2) + 'deg');
  }, { passive: true });
  // a press on the dashboard answers at once: a soft ring spreads from where the tile or the
  // Log vitals button was pressed. It takes no clicks, and is gone in half a second.
  main.addEventListener('pointerdown', e => {
    const t = e.target.closest && e.target.closest('.dash-tile, .dash-check__go');
    if (!t || reduceMotion.matches) return;
    const r = t.getBoundingClientRect(), dot = document.createElement('span');
    dot.className = 'dash-press';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.left = (e.clientX - r.left) + 'px';
    dot.style.top = (e.clientY - r.top) + 'px';
    t.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  }, { passive: true });

  /* ---------------------------------------------------------------- the closing panel's sky */
  // Drawn in code, like the backdrop: stars in three depths, a few soft clouds of colour and a spiral
  // galaxy built from several thousand points around a warm core. The galaxy turns very slowly and
  // some stars twinkle. Under the pointer the layers shift by different amounts, the galaxy turns
  // faster and shooting stars cross. It runs only while the panel is on screen and stays still under
  // reduced motion.
  let sky = null;
  function skyStop() { if (sky) { sky.stop(); sky = null; } }
  function skyStart() {
    skyStop();
    const panel = main.querySelector('.home-final');
    if (!panel) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'home-final__sky';
    canvas.setAttribute('aria-hidden', 'true');
    panel.insertBefore(canvas, panel.firstChild);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = reduceMotion.matches, TAU = Math.PI * 2, PAD = 24;
    let seed = 20261115;
    const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 1.2;   // roughly bell-shaped
    let W = 0, H = 0, dpr = 1, layers = [], twinklers = [], galaxy = null, G = null;
    const sprite = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      const x = c.getContext('2d'); x.scale(dpr, dpr); draw(x);
      return c;
    };
    const blob = (x, cx, cy, r, colour) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, colour); g.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    };

    function build() {
      const box = panel.getBoundingClientRect();
      W = Math.max(1, Math.round(box.width)); H = Math.max(1, Math.round(box.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      seed = 20261115;
      const count = Math.round(W * H / 620);
      layers = [0.35, 0.65, 1].map((depth, li) => ({ depth, img: sprite(W + PAD * 2, H + PAD * 2, x => {
        if (li === 0) {   // clouds of colour, far behind everything
          x.globalCompositeOperation = 'lighter';
          blob(x, W * 0.18, H * 0.8, H * 0.9, 'rgba(112,84,214,0.17)');
          blob(x, W * 0.6, H * 0.15, H * 0.8, 'rgba(52,112,214,0.15)');
          blob(x, W * 0.95, H * 0.9, H * 0.7, 'rgba(186,84,168,0.11)');
        }
        for (let i = 0; i < count / 3; i++) {
          const big = rnd() < 0.05, size = (big ? 1.1 + rnd() * 0.9 : 0.35 + rnd() * 0.75) * (0.7 + depth * 0.5);
          const tint = rnd(), col = tint < 0.12 ? '255,226,190' : tint < 0.3 ? '190,212,255' : '236,243,255';
          const px = rnd() * (W + PAD * 2), py = rnd() * (H + PAD * 2), a = 0.35 + rnd() * 0.6;
          x.fillStyle = 'rgba(' + col + ',' + a.toFixed(2) + ')';
          x.beginPath(); x.arc(px, py, size, 0, TAU); x.fill();
          if (big) blob(x, px, py, size * 5, 'rgba(' + col + ',0.32)');
        }
      }) }));
      twinklers = Array.from({ length: Math.min(70, Math.round(count / 9)) }, () => ({ x: rnd() * W, y: rnd() * H, r: 0.7 + rnd() * 1.1, speed: 0.6 + rnd() * 1.6, phase: rnd() * TAU }));
      // the galaxy sits to one side, so the words stay over open sky
      const wide = W > 760, R = Math.min(H * 1.06, W * 0.38);
      G = { x: W * 0.79, y: H * (wide ? 0.47 : 0.2), R, tilt: -0.42, squash: 0.44 };
      galaxy = sprite(R * 2.2, R * 2.2, x => {
        x.translate(R * 1.1, R * 1.1);
        x.globalCompositeOperation = 'lighter';
        const halo = x.createRadialGradient(0, 0, 0, 0, 0, R);
        halo.addColorStop(0, 'rgba(255,236,208,0.5)'); halo.addColorStop(0.12, 'rgba(255,214,170,0.24)');
        halo.addColorStop(0.4, 'rgba(120,150,230,0.08)'); halo.addColorStop(1, 'rgba(90,120,220,0)');
        x.fillStyle = halo; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
        const points = Math.round(5200 * Math.min(1, R / 300)) + 1800;
        for (let i = 0; i < points; i++) {
          const t = Math.pow(rnd(), 0.62), faint = rnd() < 0.3;   // more points toward the middle; a second, fainter pair of arms
          const ang = (i % 2) * Math.PI + (faint ? Math.PI / 2 : 0) + t * 7.4 + gauss() * (0.16 + t * 0.2);
          const rad = t * R * 0.96 + gauss() * R * (0.02 + t * 0.05);
          const core = Math.max(0, 1 - t * 2.4), pink = t > 0.25 && rnd() < 0.035;
          const col = pink ? '255,150,190'
            : core > 0 ? '255,' + Math.round(232 - 26 * (1 - core)) + ',' + Math.round(200 - 30 * (1 - core))
            : Math.round(165 + rnd() * 50) + ',' + Math.round(195 + rnd() * 40) + ',255';
          const a = (faint ? 0.1 : 0.2) + rnd() * (faint ? 0.18 : 0.42) * (1 - t * 0.45);
          const s = pink ? 1.3 : 0.45 + rnd() * 0.9;
          x.fillStyle = 'rgba(' + col + ',' + a.toFixed(2) + ')';
          x.fillRect(Math.cos(ang) * rad - s / 2, Math.sin(ang) * rad - s / 2, s, s);
        }
        const bulge = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
        bulge.addColorStop(0, 'rgba(255,248,232,0.95)'); bulge.addColorStop(0.35, 'rgba(255,226,186,0.5)'); bulge.addColorStop(1, 'rgba(255,210,160,0)');
        x.fillStyle = bulge; x.beginPath(); x.arc(0, 0, R * 0.2, 0, TAU); x.fill();
      });
    }

    let raf = 0, visible = false, hover = 0, hoverTo = 0, spin = 0, last = 0, mx = 0, my = 0, tx = 0, ty = 0, streak = null;
    const shoot = () => { streak = { x: W * (0.1 + rnd() * 0.45), y: -8 + rnd() * H * 0.2, vx: 480 + rnd() * 160, vy: 170 + rnd() * 90, life: 0 }; };
    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      layers.forEach(l => ctx.drawImage(l.img, -PAD - mx * 10 * l.depth, -PAD - my * 8 * l.depth, W + PAD * 2, H + PAD * 2));
      twinklers.forEach(s => {
        const a = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.fillStyle = 'rgba(240,246,255,' + (a * 0.9).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(s.x - mx * 9, s.y - my * 7, s.r, 0, TAU); ctx.fill();
      });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.translate(G.x - mx * 18, G.y - my * 14);
      ctx.rotate(G.tilt); ctx.scale(1, G.squash); ctx.rotate(spin);
      const d = G.R * 2.2;
      ctx.drawImage(galaxy, -d / 2, -d / 2, d, d);
      ctx.globalAlpha = 0.45 + hover * 0.35;   // a second pass, so it glows
      ctx.drawImage(galaxy, -d / 2, -d / 2, d, d);
      ctx.restore();
      if (streak) {
        const k = streak.life / 0.95, hx = streak.x + streak.vx * streak.life, hy = streak.y + streak.vy * streak.life;
        const n = Math.hypot(streak.vx, streak.vy), ux = streak.vx / n, uy = streak.vy / n, len = 130;
        const tail = ctx.createLinearGradient(hx, hy, hx - ux * len, hy - uy * len);
        tail.addColorStop(0, 'rgba(255,255,255,' + (0.95 * Math.sin(Math.PI * k)).toFixed(2) + ')'); tail.addColorStop(1, 'rgba(180,210,255,0)');
        ctx.strokeStyle = tail; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ux * len, hy - uy * len); ctx.stroke();
      }
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      hover += (hoverTo - hover) * Math.min(1, dt * 4);
      mx += (tx - mx) * Math.min(1, dt * 5); my += (ty - my) * Math.min(1, dt * 5);
      spin += dt * (0.012 + hover * 0.07);
      if (streak) { streak.life += dt; if (streak.life > 0.95) streak = null; }
      else if (hover > 0.5 && rnd() < dt * 0.18) shoot();
      draw(now / 1000);
      if (visible) raf = requestAnimationFrame(frame);
    }
    const run = () => { if (!raf && visible && !still) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const onEnter = () => { hoverTo = 1; if (!streak) shoot(); };
    const onLeave = () => { hoverTo = 0; tx = 0; ty = 0; };
    const onMove = e => { const b = panel.getBoundingClientRect(); tx = (e.clientX - b.left) / b.width - 0.5; ty = (e.clientY - b.top) / b.height - 0.5; };
    let sized = 0;
    const resize = 'ResizeObserver' in window ? new ResizeObserver(() => { cancelAnimationFrame(sized); sized = requestAnimationFrame(() => { build(); draw(performance.now() / 1000); }); }) : null;
    const watch = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; run(); }) : null;

    build();
    draw(0);
    if (resize) resize.observe(panel);
    if (!still) {
      if (watch) watch.observe(panel); else { visible = true; run(); }
      panel.addEventListener('pointerenter', onEnter);
      panel.addEventListener('pointerleave', onLeave);
      panel.addEventListener('pointermove', onMove, { passive: true });
    }
    sky = { stop() {
      visible = false;
      cancelAnimationFrame(raf); cancelAnimationFrame(sized);
      if (resize) resize.disconnect();
      if (watch) watch.disconnect();
      panel.removeEventListener('pointerenter', onEnter);
      panel.removeEventListener('pointerleave', onLeave);
      panel.removeEventListener('pointermove', onMove);
      canvas.remove();
    } };
  }

  /* ---------------------------------------------------------------- router */
  let currentKey = '', dashHtml = '';
  const currentPath = () => (location.hash.replace(/^#/, '') || '/').replace(/\/+$/, '') || '/';
  function resolve(s) {
    const path = currentPath();
    // no location yet this visit: every address asks first, the home page included
    if (!s.env) return { key: 'environment', title: 'Choose your environment', html: viewEnvironment(s, true, path === '/') };
    if (path === '/') return { key: 'home', title: 'Watching over the crew', html: viewHome(s) };
    if (path === '/environment') return { key: 'environment', title: 'Change environment', html: viewEnvironment(s, false) };
    if (path === '/dashboard') return { key: 'dashboard', title: 'Dashboard', html: viewDashboard(s) };
    if (path === '/cards') return { key: 'cards', title: 'My cards', html: viewCards(s) };
    if (path === '/library') return { key: 'library', title: 'Card library', html: viewLibrary(s) };
    if (path === '/settings') return { key: 'settings', title: 'Settings', html: viewSettings(s) };
    return { key: '', title: 'Not found', html: notFound() };
  }

  // The account button at the end of the bar (js/sitenav.js) shows the email, which the location rule
  // (js/env.js) does not keep. It comes from the Supabase session (js/auth.js), asked for once someone
  // is known to be signed in.
  let emailAsked = false;
  function accountButton() {
    if (!signedIn()) { if (whoKnown) window.GuardianNav.account(null); return; }
    if (emailAsked) return;
    emailAsked = true;
    const show = user => window.GuardianNav.account(user || { email: '' });
    GuardianAuth.user().then(show, () => show(null));
  }

  // the home page's green button: the way in to the dashboard, or to the sign-in page for a visitor
  function launchLabel() {
    const launch = $('#landLaunch'), inside = signedIn();
    if (!launch) return;
    launch.querySelector('.lg').textContent = inside ? 'Open dashboard' : 'Sign in or sign up';
    launch.querySelector('.sm').textContent = inside ? 'Open' : 'Sign in';
    launch.setAttribute('aria-label', inside ? 'Open dashboard' : 'Sign in or sign up');
  }

  function render() {
    const s = store.get();
    // signed out, only the home page and the picker on the way in to it can be seen
    if (whoKnown && !signedIn() && currentPath() !== '/') { toSignIn(); return; }
    const r = resolve(s);
    const active = document.activeElement;
    const keepSearch = active && active.id === 'cardSearch';
    const cameFrom = currentKey;
    // a dashboard that has not changed is left as it is, so its arrival is never cut short
    const same = r.key === 'dashboard' && cameFrom === 'dashboard' && r.html === dashHtml && !!main.querySelector('.dash');
    if (!same) main.innerHTML = r.html;
    dashHtml = r.key === 'dashboard' ? r.html : '';
    currentKey = r.key;
    document.title = r.title + ' · Guardian';
    document.documentElement.classList.toggle('is-landing', r.key === 'home');
    document.documentElement.classList.toggle('env-gate', !s.env);
    launchLabel();
    const env = envOf(s.env), pill = $('#envPill');
    if (pill && env) {
      pill.innerHTML = `<img src="${env.img}" alt="" width="26" height="26"><span>${env.short}</span>`;
      pill.setAttribute('aria-label', `Environment: ${env.name}. Change environment`);
      if (r.key === 'environment') pill.setAttribute('aria-current', 'page'); else pill.removeAttribute('aria-current');
    }
    window.GuardianNav.mark(r.key);
    accountButton();
    if (r.key === 'home' && cameFrom !== 'home') revealHome(); else if (r.key !== 'home') leaveHome();
    if (r.key === 'home') skyStart(); else skyStop();
    if (r.key === 'dashboard') { fillToday(); fillCheck(); if (cameFrom !== 'dashboard') revealDash(); }
    if (keepSearch) { const i = $('#cardSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }

  function buildTopbar() {
    $('#nav').innerHTML = window.GuardianNav.navHtml();
    $('#actions').innerHTML = window.GuardianNav.actionsHtml();
    $('.brand__word').style.setProperty('--d', '60ms');
    // the home page's own header: section links and the way in
    const land = document.createElement('div');
    land.className = 'land-nav';
    land.id = 'landNav';
    land.innerHTML =
      `<nav class="land-nav__links" aria-label="Home page">
         <button class="land-nav__link" data-action="scroll-to" data-target="environments" style="--d:160ms">Environments</button>
         <button class="land-nav__link" data-action="scroll-to" data-target="challenge" style="--d:205ms">The Challenge</button>
         <button class="land-nav__link" data-action="scroll-to" data-target="how" style="--d:250ms">How It Works</button>
       </nav>
       <button class="btn btn--primary land-nav__cta" id="landLaunch" data-action="launch" style="--d:300ms"><span class="lg">Sign in or sign up</span><span class="sm" aria-hidden="true">Sign in</span>${icon('arrowRight')}</button>`;
    topbar.appendChild(land);
  }

  /* ---------------------------------------------------------------- home page */
  const HAZARDS = [
    { icon: 'radiation', name: 'Radiation', text: 'Beyond Earth’s magnetic field, crews absorb more radiation, raising long-term risks to the body and brain.' },
    { icon: 'isolation', name: 'Isolation and confinement', text: 'Small crews in tight quarters for months. Sleep, mood and teamwork all need watching.' },
    { icon: 'signal', name: 'Distance from Earth', text: 'From Mars, a message takes up to 22 minutes each way. The crew has to catch problems themselves.' },
    { icon: 'gravity', name: 'Gravity fields', text: 'Weightlessness thins bone and weakens muscle; moving between gravity fields upsets balance and the heart.' },
    { icon: 'air', name: 'Hostile, closed environments', text: 'The air, water, noise, temperature and microbes inside the craft all shape the crew’s health.' }
  ];
  const HOME_LINES = {
    iss: 'Microgravity, 16 sunrises a day and a crew that lives where it works.',
    mars: 'About a third of Earth’s gravity and up to 22 minutes from an answer.',
    moon: 'One-sixth gravity, sharp dust and nights that last two weeks.',
    spacecraft: 'Days in a cabin the size of a van, on the way to somewhere else.'
  };

  function viewHome(s) {
    const env = envOf(s.env);
    return `<div class="home">
      <section class="home-hero" aria-labelledby="page-title">
        <p class="home-kicker">${icon('satellite')}NASA Space Apps Challenge 2026</p>
        <h1 class="home-title" id="page-title">Watching over the crew, wherever they&nbsp;are.</h1>
        <p class="home-lead">Guardian is a health assistant for astronauts, wherever the mission takes them: aboard a spacecraft, on the Moon, or even on Mars. It watches over every crew member and helps them stay healthy, stay safe and make it home.</p>
        <div class="home-ctas">
          <button class="btn btn--primary btn--lg" data-action="launch">${env ? `Open the ${env.short} dashboard` : 'Launch assistant'}${icon('arrowRight')}</button>
          <button class="btn btn--ghost btn--lg" data-action="scroll-to" data-target="how">How it works</button>
        </div>
      </section>

      <section class="home-envs" id="environments" aria-labelledby="envs-title">
        <div class="home-head">
          <p class="home-kicker">Four environments</p>
          <h2 class="home-h2" id="envs-title">One assistant, set up for where the crew is.</h2>
        </div>
        <ul class="home-envs__list">
          ${ENVS.map(e => `<li><button class="home-env${e.id === s.env ? ' is-current' : ''}" data-action="launch-env" data-env="${e.id}">
            <span class="home-env__media"><img src="${e.img}" alt="${esc(e.alt)}" width="${e.w}" height="${e.h}" loading="lazy" decoding="async"></span>
            <span class="home-env__name">${e.name}${e.id === s.env ? '<span class="home-env__badge">Your environment</span>' : ''}</span>
            <span class="home-env__line">${HOME_LINES[e.id]}</span>
            <span class="home-env__go">Open ${e.short}${icon('arrowRight')}</span>
          </button></li>`).join('')}
        </ul>
      </section>

      <section class="home-section" id="challenge" aria-labelledby="challenge-title">
        <div class="home-head">
          <p class="home-kicker">The challenge</p>
          <h2 class="home-h2" id="challenge-title">Space is hard on the body.</h2>
          <p class="home-sub">NASA plans every mission around five hazards of human spaceflight. Each one shows up differently on the station, the Moon, Mars and in transit.</p>
        </div>
        <ol class="hazards">
          ${HAZARDS.map((h, i) => `<li class="hazard">
            <span class="hazard__top">${chipIcon(h.icon)}<span class="hazard__n">0${i + 1}</span></span>
            <h3 class="hazard__name">${h.name}</h3>
            <p class="hazard__text">${h.text}</p>
          </li>`).join('')}
        </ol>
      </section>

      <section class="home-section home-how" id="how" aria-labelledby="how-title">
        <div class="home-how__text">
          <p class="home-kicker">How it works</p>
          <h2 class="home-h2" id="how-title">Notice it, log it, look at it together.</h2>
          <ol class="steps">
            <li><span class="steps__n">1</span><div><h3>Pick the environment</h3><p>The station, the Moon, Mars or a spacecraft in transit. Guardian sets itself up for it.</p></div></li>
            <li><span class="steps__n">2</span><div><h3>Log what you notice</h3><p>Heart rate after a spacewalk, a bad night’s sleep, a dataset to check. Crew health templates make it quick.</p></div></li>
            <li><span class="steps__n">3</span><div><h3>Review it together</h3><p>The dashboard gets you to the next job in one click, the binder keeps every card, and search finds anything.</p></div></li>
          </ol>
          <button class="btn btn--primary btn--lg" data-action="launch">${env ? 'Open dashboard' : 'Start with an environment'}${icon('arrowRight')}</button>
        </div>
        <div class="home-preview" aria-label="Example of a card in Guardian">
          <p class="home-preview__label">Example card</p>
          <article class="panel vitals-card home-preview__card">
            <span class="vitals-card__rings" aria-hidden="true"></span>
            <header class="vitals-card__head">
              <div><p class="vitals-card__who">Mission specialist<span class="sep">·</span><time>${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time></p><h3 class="card__title">Morning vitals check</h3></div>
              <span class="vitals-card__tab">Vitals</span>
            </header>
            <dl class="vitals-card__grid">
              <div><dt>Heart rate</dt><dd>64 <small>bpm</small></dd></div>
              <div><dt>Blood pressure</dt><dd>118/76 <small>mmHg</small></dd></div>
              <div><dt>Standing pressure</dt><dd>114/78 <small>mmHg</small></dd></div>
              <div><dt>Blood sugar</dt><dd>92 <small>mg/dL</small></dd></div>
              <div><dt>Temperature</dt><dd>36.8 <small>°C</small></dd></div>
              <div><dt>Blood oxygen</dt><dd>98 <small>%</small></dd></div>
              <div><dt>Breathing</dt><dd>14 <small>per min</small></dd></div>
              <div><dt>Sleep</dt><dd>7.2 <small>hours</small></dd></div>
              <div><dt>Mood</dt><dd>Rested</dd></div>
            </dl>
            <p class="card__meta">${icon('folder')}<span>Kept in the crew binder</span><span class="sep">·</span><span>Mars</span></p>
          </article>
          <div class="panel home-preview__mini">
            ${chipIcon('pulse')}<div><p class="home-preview__k">This week</p><p class="home-preview__v">Cards by day</p></div>
            <span class="home-preview__bars" aria-hidden="true"><i style="--h:.35"></i><i style="--h:.6"></i><i style="--h:.25"></i><i style="--h:.8"></i><i style="--h:.5"></i><i style="--h:.95"></i><i style="--h:.45"></i></span>
          </div>
        </div>
      </section>

      <section class="home-final" aria-labelledby="final-title">
        <h2 class="home-final__title" id="final-title">Your assistant is ready.</h2>
        <p class="home-final__text">${env ? `Set up for ${env.name}.` : 'Choose an environment and start logging.'}</p>
        <button class="btn btn--light btn--lg" data-action="launch">${env ? 'Open dashboard' : 'Launch assistant'}${icon('arrowRight')}</button>
      </section>

      <footer class="home-foot">
        <span><strong>Guardian</strong> · Built for the NASA Space Apps Challenge 2026</span>
        <span>A prototype.</span>
      </footer>
    </div>`;
  }

  /* ---------------------------------------------------------------- toast */
  let toastTimer = 0;
  function toast(text) {
    const t = $('#toast');
    t.innerHTML = `${icon('check')}<span>${esc(text)}</span>`;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  /* ---------------------------------------------------------------- modals */
  let modal = null;
  function openModal(o) {
    if (modal) modal.close(true);
    const prev = document.activeElement;
    const id = 'm-' + uid();
    const wrap = document.createElement('div');
    wrap.className = 'modal' + (o.size ? ' modal--' + o.size : '');
    wrap.innerHTML = `<div class="modal__backdrop" data-close></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="${id}">
        <header class="modal__head"><h2 class="modal__title${o.hideTitle ? ' sr-only' : ''}" id="${id}">${o.title}</h2>
          ${o.hideTitle ? '' : `<button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>`}</header>
        <div class="modal__body">${o.body}</div>
        ${o.footer ? `<footer class="modal__foot">${o.footer}</footer>` : ''}
      </div>`;
    modalRoot.appendChild(wrap);
    main.inert = true; topbar.inert = true;
    document.documentElement.classList.add('modal-open');
    const panel = wrap.querySelector('.modal__panel');
    const focusables = () => Array.from(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
    let closed = false;
    function close(instant) {
      if (closed) return;
      closed = true;
      if (modal && modal.el === panel) modal = null;
      if (!modal) { main.inert = false; topbar.inert = false; document.documentElement.classList.remove('modal-open'); }
      if (instant || reduceMotion.matches) wrap.remove();
      else { wrap.classList.add('is-closing'); setTimeout(() => wrap.remove(), 170); }
      if (o.onClose) o.onClose();
      if (!instant && prev && document.contains(prev) && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    }
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    });
    wrap.addEventListener('click', e => {
      const c = e.target.closest('[data-close]');
      if (!c) return;
      const isLink = c.matches('a[href]');
      if (!isLink) e.preventDefault(); // a link that closes still navigates
      close(isLink);
    });
    requestAnimationFrame(() => {
      const f = panel.querySelector('[autofocus]') || panel.querySelector('input:not([type=checkbox]),textarea') || focusables()[0];
      if (f) f.focus();
    });
    modal = { el: panel, close };
    if (o.mount) o.mount(panel, close);
    return modal;
  }

  function field(o) {
    const id = 'f-' + o.name;
    const ctl = o.type === 'textarea'
      ? `<textarea class="input" id="${id}" name="${o.name}" rows="${o.rows || 5}" maxlength="${o.max || 4000}" placeholder="${esc(o.placeholder || '')}">${esc(o.value || '')}</textarea>`
      : o.type === 'select'
        ? `<select class="input select" id="${id}" name="${o.name}">${o.options}</select>`
        : `<input class="input" id="${id}" name="${o.name}" value="${esc(o.value || '')}" placeholder="${esc(o.placeholder || '')}" maxlength="${o.max || 120}"${o.required ? ' required aria-required="true"' : ''} autocomplete="off">`;
    return `<div class="field${o.hidden ? ' is-hidden' : ''}" data-field="${o.name}"><label for="${id}">${o.label}${o.optional ? ' <span class="muted">(optional)</span>' : ''}</label>${ctl}<p class="field__error" id="${id}-err" aria-live="polite"></p></div>`;
  }
  function setError(form, name, msg) {
    const f = form.querySelector(`[data-field="${name}"]`); if (!f) return;
    const input = f.querySelector('input,textarea,select');
    f.querySelector('.field__error').textContent = msg || '';
    if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', input.id + '-err'); }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
  }


  const CARD_VITALS = [
    { key: 'bloodPressure', label: 'Blood pressure', unit: 'mm/Hg', hint: '120/80', equipment: 'SunTech Tango upper-arm cuff',
      steps: ['Choose a cuff that fits and place it on bare upper-arm skin.', 'Use the manufacturer’s artery marker and cuff-placement guide. Keep the arm relaxed.', 'Follow the device instructions and record both numbers: systolic / diastolic.'],
      note: 'The Tango M2 manual is a later model reference, not the original ISS flight checklist.', source: 'https://suntechmed.com/support/document-library/send/96-archive-tango-m2-instructions-manuals/1201-tango-m2-user-manual-english-rev-b' },
    { key: 'heartRate', label: 'Heart rate', unit: 'Beats Per Minute', hint: '72', equipment: 'Fingertip pulse oximeter',
      steps: ['Use a clean finger; remove dark nail polish if it blocks the light.', 'Clip the sensor onto the fingertip and keep the hand still.', 'Wait for the reading to settle. Record the pulse rate, not the oxygen percentage.'], source: 'https://medlineplus.gov/lab-tests/pulse-oximetry/' },
    { key: 'temperature', label: 'Temperature', unit: 'Celsius', hint: '36.6', equipment: 'CSA Bio-Monitor smart shirt',
      steps: ['Put on the fitted shirt and headband with the shirt sensors touching skin.', 'View the skin-temperature measurement in the tablet application.', 'Record the value in Celsius and note that it is skin temperature.'],
      note: 'Skin temperature is different from core or oral body temperature.', source: 'https://www.csa-asc.gc.ca/eng/sciences/bio-monitor.asp' },
    { key: 'sleep', label: 'Sleep', unit: 'Minutes', hint: '480', equipment: 'Sleep log / recorded sleep session',
      steps: ['Check your recorded sleep session or note when you fell asleep and woke.', 'Subtract time spent awake and convert hours to minutes (8 hours = 480 minutes).', 'Enter the total minutes slept.'],
      note: 'The supplied guide does not specify a sleep-measurement procedure. This field is a personal sleep log.' },
    { key: 'mood', label: 'Mood', unit: '', hint: 'How are you feeling?', equipment: 'Personal check-in',
      steps: ['Pause and think about how you feel right now.', 'Describe it in your own words, such as calm, tired or stressed.', 'Record your description; no measuring device is needed.'],
      note: 'Mood is self-reported; the supplied equipment guide does not provide a mood instrument.' },
    { key: 'respirationRate', label: 'Respiration rate', unit: 'Respirations per Minute', hint: '16', equipment: 'CSA Bio-Monitor smart shirt',
      steps: ['Wear the fitted shirt with its sensors touching skin.', 'Use the tablet application to view breathing rate during the session.', 'Record the breathing-rate value in respirations per minute.'], source: 'https://www.csa-asc.gc.ca/eng/sciences/bio-monitor.asp' },
    { key: 'oxygenSaturation', label: 'Oxygen saturation', unit: 'percentage', hint: '98', equipment: 'Fingertip pulse oximeter',
      steps: ['Use a clean finger and remove dark nail polish if needed.', 'Clip the sensor onto the fingertip and keep the hand still.', 'Wait for a stable reading and record the SpO₂ percentage, not the pulse rate.'], source: 'https://medlineplus.gov/lab-tests/pulse-oximetry/' },
  ];

  function cardForm(o) {
    o = o || {};
    const c = o.card || {}, values = c.vitals || {};
    openModal({
      title: o.card ? 'Edit card' : 'Add card', size: 'vitals',
      body: `<form id="cardForm" novalidate>
        <p class="vital-intro">A moment to check in. Add the readings you have; leave the others blank.</p>
        ${field({ name: 'title', label: 'Title', value: c.title || o.title || '', placeholder: 'What do you want it to be called', required: true })}
        <div class="vital-fields">${CARD_VITALS.map(v => `<div class="vital-field">
          <div class="vital-label"><label for="v-${v.key}">${v.label}</label><button type="button" class="vital-info" data-help="${v.key}" aria-label="How to record ${v.label.toLowerCase()}" aria-expanded="false" aria-controls="help-${v.key}">i</button></div>
          <div class="vital-input"><input id="v-${v.key}" name="${v.key}" ${v.key !== 'bloodPressure' && v.key !== 'mood' ? 'type="number" step="any" min="0"' : 'type="text"'} maxlength="120" placeholder="${v.hint}" value="${esc(values[v.key] == null ? '' : String(values[v.key].value))}" aria-describedby="unit-${v.key}"><span id="unit-${v.key}" class="vital-unit">${v.unit}</span></div>
          <div class="vital-help" id="help-${v.key}" hidden><strong>${v.equipment}</strong><ol>${v.steps.map(t => `<li>${t}</li>`).join('')}</ol>${v.note ? `<p>${v.note}</p>` : ''}${v.source ? `<a href="${v.source}" target="_blank" rel="noreferrer">Read the source ↗</a>` : ''}</div>
        </div>`).join('')}</div>
        ${(c.legacyNotes || (c.notes && !c.vitals)) ? `<details class="vital-legacy"><summary>Previous notes</summary><p>${esc(c.legacyNotes || c.notes)}</p></details>` : ''}
        <p class="vital-footnote">Educational reference. Follow approved equipment and crew instructions. <a href="/#/citations">Sources & citations</a></p>
        <p class="field__error" id="vital-error" role="alert"></p>
      </form>`,
      footer: `<span class="vital-save-note">Saved with your account</span><button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit" form="cardForm">Done</button>`,
      mount(panel, close) {
        const form = panel.querySelector('form'), titleInput = form.elements.title;
        panel.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => {
          const help = panel.querySelector('#help-' + button.dataset.help);
          help.hidden = !help.hidden; button.setAttribute('aria-expanded', String(!help.hidden));
        }));
        let pendingId = c.id || uid();
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const error = panel.querySelector('#vital-error');
          setError(form, 'title', titleInput.value.trim() ? '' : 'Give the card a title.');
          if (!titleInput.value.trim()) { titleInput.focus(); return; }
          const vitals = {};
          for (const v of CARD_VITALS) {
            const input = form.elements[v.key], raw = input.value.trim();
            if (input.validity.badInput || (raw && v.key !== 'bloodPressure' && v.key !== 'mood' && (!Number.isFinite(Number(raw)) || Number(raw) < 0))) {
              error.textContent = 'Enter a valid, non-negative number for ' + v.label.toLowerCase() + '.'; input.focus(); return;
            }
            if (!raw) continue;
            if (v.key === 'bloodPressure' && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(raw)) {
              error.textContent = 'Enter blood pressure as two numbers, such as 120/80.'; input.focus(); return;
            }
            vitals[v.key] = { value: v.key === 'mood' || v.key === 'bloodPressure' ? raw : Number(raw), unit: v.unit };
          }
          if (!window.GuardianEnv.user()) { error.textContent = 'Sign in to save this card to your account.'; return; }
          const button = panel.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Saving…'; error.textContent = '';
          try {
            const notes = CARD_VITALS.filter(v => vitals[v.key]).map(v => v.label + ': ' + vitals[v.key].value + (v.unit ? ' ' + v.unit : '')).join('\n');
            const data = Object.assign({}, c, { id: pendingId, title: titleInput.value.trim(), legacyNotes: c.legacyNotes || (!c.vitals ? c.notes || '' : ''), vitals, notes: notes || c.notes || '', type: c.type || 'observation', template: 'crew-health', createdAt: c.createdAt || Date.now(), env: c.env || store.get().env || '' });
            const body = Object.assign({}, data); delete body.id;
            await window.GuardianAuth.cards.save([{ id: data.id, body }]);
            store.update(st => { const old = st.cards.find(x => x.id === data.id); if (old) Object.assign(old, data); else st.cards.push(data); });
            close(); toast('Card saved to your account');
          } catch (err) { error.textContent = 'Could not save your card. Your entries are still here; try Done again.'; }
          finally { button.disabled = false; button.textContent = 'Done'; }
        });
      }
    });
  }

  function openCard(id) {
    const c = findCard(id);
    if (!c) return;
    openModal({
      title: esc(c.title),
      size: 'card',
      body: `<p class="card-view__meta">${typeTag(c.type)}${envOf(c.env) ? `<span class="tag">${icon('satellite')}${envOf(c.env).short}</span>` : ''}<span class="muted">Added ${fmtDate(c.createdAt)}</span></p>
        <div class="card-view__notes">${c.notes ? esc(c.notes) : '<span class="muted">No notes yet.</span>'}</div>`,
      footer: `<button class="btn btn--danger-ghost" data-action="delete-card" data-id="${c.id}">${icon('trash')}Delete</button><span class="spacer"></span>
        <button class="btn btn--ghost" type="button" data-close>Close</button><button class="btn btn--primary" data-action="edit-card" data-id="${c.id}">${icon('edit')}Edit</button>`
    });
  }

  function confirmBox(o) {
    openModal({
      title: o.title, size: 'small',
      body: `<p class="confirm__text">${o.text}</p>`,
      footer: `<button class="btn btn--ghost" type="button" data-close autofocus>Cancel</button><button class="btn btn--danger" type="button" data-confirm>${o.confirm}</button>`,
      mount(panel, close) { panel.querySelector('[data-confirm]').addEventListener('click', () => { close(); o.onConfirm(); }); }
    });
  }

  function openGuide() {
    if (window.GuardianTour) { window.GuardianTour.start(); return; }
    openModal({
      title: 'Quick guide',
      body: `<ol class="guide">
        <li><span class="guide__n">1</span><div><h3>Add a card</h3><p>One idea, observation, question or dataset per card.</p></div></li>
        <li><span class="guide__n">2</span><div><h3>Start from the dashboard</h3><p>One click to log vitals, check a crew member, open the binder or see the hazards. Press <kbd>Ctrl</kbd> <kbd>K</kbd> to search.</p></div></li>
      </ol>`,
      footer: `<button class="btn btn--ghost" type="button" data-close>Close</button><button class="btn btn--primary" data-action="add-card">${icon('plus')}Add your first card</button>`
    });
  }

  // Customize view: a small live picture of the dashboard, and one switch per panel. Flipping a
  // switch saves at once and the matching block in the picture slides in or out, so the result is
  // seen before Done is pressed. The switches are buttons with role="switch": Space and Enter both work.
  function openCustomize() {
    const s = store.get(), env = envOf(s.env);
    const block = (key, inner) => `<div class="cz-block${s.view[key] ? '' : ' is-off'}" data-block="${key}"><div class="cz-clip"><div class="cz-in">${inner}</div></div></div>`;
    const row = p => `<li class="cz-row${s.view[p.key] ? '' : ' is-off'}" data-key="${p.key}">
        ${chipIcon(p.icon)}
        <span class="cz-row__text"><span class="cz-row__name" id="cz-name-${p.key}">${p.name}</span><span class="cz-row__line" id="cz-line-${p.key}">${p.text}</span></span>
        <button type="button" class="sw" role="switch" aria-checked="${!!s.view[p.key]}" aria-labelledby="cz-name-${p.key}" aria-describedby="cz-line-${p.key}" data-key="${p.key}"><span class="sw__thumb" aria-hidden="true"></span></button>
      </li>`;
    openModal({
      title: 'Customize view', size: 'customize',
      body: `<div class="cz${PANELS.some(p => s.view[p.key]) ? '' : ' is-empty'}">
        <p class="cz__intro">Choose what shows on your dashboard. The picture changes as you choose.</p>
        <div class="cz-screen" aria-hidden="true">
          <div class="cz-greet"><span class="cz-lines"><i class="cz-bar cz-bar--title"></i><i class="cz-bar cz-bar--sub"></i></span><i class="cz-pill"></i></div>
          ${block('actions', '<div class="cz-tiles"><i></i><i></i><i></i><i></i></div>')}
          <div class="cz-pair">
            ${block('where', `<div class="cz-where"><i class="cz-photo"${env ? ` style="background-image:url('${env.img}')"` : ''}></i><span class="cz-lines"><i class="cz-bar cz-bar--name"></i><i class="cz-bar cz-bar--line"></i><span class="cz-seg">${ENVS.map(e => `<i${e.id === s.env ? ' class="is-on"' : ''}></i>`).join('')}</span></span></div>`)}
            ${block('check', '<div class="cz-check"><i class="cz-ring"></i><span class="cz-lines"><i class="cz-bar cz-bar--name"></i><i class="cz-bar cz-bar--line"></i></span></div>')}
          </div>
          ${block('today', '<div class="cz-today"><i class="cz-dot"></i><i class="cz-bar cz-bar--line"></i><i class="cz-bar cz-bar--short"></i></div>')}
          <div class="cz-none"><i class="cz-bar cz-bar--line"></i></div>
        </div>
        <ul class="cz-rows">${PANELS.map(row).join('')}</ul>
        <p class="cz__note">The greeting always shows.</p>
      </div>`,
      footer: `<button class="btn btn--primary" type="button" data-close>Done</button>`,
      mount(panel) {
        const root = panel.querySelector('.cz');
        // the picture keeps the height it has with every block showing, so the switches below it never move under the pointer
        const screen = root.querySelector('.cz-screen'), hidden = [...root.querySelectorAll('.cz-block.is-off')];
        root.classList.add('is-measuring');
        hidden.forEach(b => b.classList.remove('is-off'));
        screen.style.minHeight = screen.offsetHeight + 'px';
        hidden.forEach(b => b.classList.add('is-off'));
        void screen.offsetHeight;
        root.classList.remove('is-measuring');
        // a click anywhere on a row flips its switch; the switch itself takes Space and Enter
        root.addEventListener('click', e => {
          const rowEl = e.target.closest('.cz-row');
          if (!rowEl) return;
          const key = rowEl.dataset.key, on = !store.get().view[key];
          store.update(st => { st.view[key] = on; });
          rowEl.classList.toggle('is-off', !on);
          rowEl.querySelector('.sw').setAttribute('aria-checked', String(on));
          root.querySelector(`.cz-block[data-block="${key}"]`).classList.toggle('is-off', !on);
          root.classList.toggle('is-empty', !PANELS.some(p => store.get().view[p.key]));
        });
        // the row under the pointer, or holding the focus, lights its block in the picture
        const hot = e => { const rowEl = e.target.closest && e.target.closest('.cz-row'); if (rowEl) root.dataset.hot = rowEl.dataset.key; else delete root.dataset.hot; };
        root.addEventListener('pointerover', hot);
        root.addEventListener('pointerleave', () => { delete root.dataset.hot; });
        root.addEventListener('focusin', hot);
        root.addEventListener('focusout', () => { delete root.dataset.hot; });
      }
    });
  }

  function openSearch() {
    openModal({
      title: 'Search', size: 'palette', hideTitle: true,
      body: `<div class="palette">
        <label class="search-field search-field--lg">${icon('search')}<span class="sr-only">Search cards and pages</span>
          <input type="search" id="paletteInput" placeholder="Search cards and pages" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="paletteResults"></label>
        <ul class="palette__list" id="paletteResults" role="listbox" aria-label="Results"></ul>
        <p class="palette__hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
      </div>`,
      mount(panel, close) {
        const input = panel.querySelector('#paletteInput'), list = panel.querySelector('#paletteResults');
        let items = [], active = 0;
        function results(q) {
          const s = store.get(); q = q.trim().toLowerCase();
          const hit = t => !q || t.toLowerCase().includes(q);
          const pages = NAV.filter(n => hit(n.label)).map(n => ({ kind: 'Page', label: n.label, icon: n.icon, go: () => { if (n.href[0] === '#') location.hash = n.href; else location.href = n.href; } }));
          const cards = newest(s.cards).filter(c => hit(c.title + ' ' + (c.notes || ''))).map(c => ({ kind: typeOf(c.type).label, label: c.title, icon: typeOf(c.type).icon, go: () => openCard(c.id) }));
          return (q ? cards.concat(pages) : pages.concat(cards.slice(0, 5))).slice(0, 12);
        }
        function paint() {
          items = results(input.value);
          active = Math.min(active, Math.max(0, items.length - 1));
          list.innerHTML = items.length
            ? items.map((it, i) => `<li role="option" id="pr-${i}" aria-selected="${i === active}" data-i="${i}">${chipIcon(it.icon)}<span class="palette__label">${esc(it.label)}</span><span class="palette__kind">${it.kind}</span></li>`).join('')
            : `<li class="palette__none">Nothing found for “${esc(input.value.trim())}”.</li>`;
          input.setAttribute('aria-activedescendant', items.length ? 'pr-' + active : '');
        }
        function choose(i) { const it = items[i]; if (!it) return; close(true); it.go(); }
        input.addEventListener('input', () => { active = 0; paint(); });
        input.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
        });
        list.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) choose(+li.dataset.i); });
        paint();
      }
    });
  }

  /* ---------------------------------------------------------------- data */
  function exportData() {
    const s = store.get();
    const blob = new Blob([JSON.stringify({ app: 'Guardian', version: 1, exportedAt: new Date().toISOString(), workspace: s.workspace, cards: s.cards }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'guardian-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Export downloaded');
  }
  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('[inert]')) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'add-card': e.preventDefault(); cardForm({}); break;
      case 'guide': openGuide(); break;
      case 'customize': openCustomize(); break;
      case 'search': openSearch(); break;
      case 'open-card': openCard(id); break;
      case 'edit-card': cardForm({ card: findCard(id) }); break;
      case 'delete-card': {
        const c = findCard(id); if (!c) break;
        confirmBox({ title: 'Delete this card?', confirm: 'Delete card', text: `“${esc(c.title)}” will be deleted. This cannot be undone.`, onConfirm() { store.update(s => { s.cards = s.cards.filter(x => x.id !== id); }); toast('Card deleted'); } });
        break;
      }
      case 'clear-filters': filters.q = ''; render(); break;
      case 'use-template': {
        const t = TEMPLATES.find(x => x.id === id);
        if (t) cardForm({ type: t.type, title: t.title, notes: t.notes, template: t.id });
        break;
      }
      case 'export': exportData(); break;
      case 'clear-data':
        confirmBox({ title: 'Clear all data?', confirm: 'Clear everything', text: 'Every card in your account will be deleted. Export first if you want a copy.', onConfirm() { store.update(s => { s.cards = []; delete s.collections; }); toast('All data cleared'); } });
        break;
      case 'launch':
        // signed out: the sign-in page, which leads on to the dashboard. No environment yet: the dashboard address shows the picker first
        if (signedIn()) location.hash = '#/dashboard'; else toSignIn();
        break;
      case 'launch-env': {
        const env = envOf(el.dataset.env);
        if (!env) break;
        const changed = store.get().env !== env.id;
        store.update(s => { s.env = env.id; });
        if (!signedIn()) { toSignIn(); break; }   // the choice is kept for this visit, and saved once they sign in
        location.hash = '#/dashboard';
        toast(changed ? `${env.name} selected` : `Opening ${env.name}`);
        break;
      }
      case 'set-env': setEnvHere(el.dataset.env); break;
      case 'scroll-to': {
        const t = document.getElementById(el.dataset.target);
        if (t) t.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        break;
      }
      case 'replay':
        try { sessionStorage.setItem('still.forceIntro', '1'); } catch (err) { /* ignore */ }
        location.reload();
        break;
    }
  });

  document.addEventListener('keydown', e => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('[role="button"][data-action]')) { e.preventDefault(); el.click(); return; }
    const typing = el.closest && el.closest('input,textarea,select,[contenteditable]');
    if (!S.introDone || modal || gated() || currentKey === 'home') return;
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
  });

  document.addEventListener('change', e => {
    if (e.target.name === 'env' && e.target.closest('[data-form="env"]')) {
      const form = e.target.form;
      form.querySelectorAll('.env-card').forEach(c => c.classList.toggle('is-selected', c.dataset.env === e.target.value));
      form.querySelector('[type=submit]').disabled = false;
      return;
    }
    const el = e.target.closest('[data-change]');
    if (!el) return;
    switch (el.dataset.change) {
      case 'intro': store.update(s => { s.intro = el.checked; }); toast(el.checked ? 'Opening animation on' : 'Opening animation off'); break;
    }
  });

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.input === 'q') { filters.q = el.value; refreshGrid(); }
  });

  document.addEventListener('submit', e => {
    const envForm = e.target.closest('[data-form="env"]');
    if (envForm) {
      e.preventDefault();
      const env = envOf(envForm.elements.env.value);
      if (!env) return;
      const first = gated();
      const onHome = currentPath() === '/';
      const changed = store.get().env !== env.id;
      store.update(s => { s.env = env.id; });   // lifts the gate and re-renders
      if (first) {
        topbar.classList.add('chrome-in');
        setTimeout(() => topbar.classList.remove('chrome-in'), 900);
      }
      // asked on the way in to the home page: carry on to the home page, not the dashboard
      if (first && onHome) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
      else if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
      else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
      main.classList.remove('page-enter'); void main.offsetWidth; main.classList.add('page-enter');
      toast(first ? `${env.name} selected` : changed ? `Environment set to ${env.name}` : `Still on ${env.name}`);
      return;
    }
    const form = e.target.closest('[data-form="workspace"]');
    if (!form) return;
    e.preventDefault();
    const v = form.elements.workspace.value.trim();
    if (!v) { form.elements.workspace.focus(); return; }
    store.update(s => { s.workspace = v; });
    toast('Workspace name saved');
  });

  window.addEventListener('hashchange', () => {
    if (modal) modal.close(true);
    render();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  });

  store.subscribe(() => render());

  /* ---------------------------------------------------------------- the logo */
  const brand = $('#brand');
  brand.addEventListener('click', e => {
    e.preventDefault();
    if (!S.introDone) return;
    // the logo always leads to the public home page; on it, back to the top (never the opening again)
    if (currentKey === 'home') {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    } else {
      location.hash = '#/';
    }
  });
  brand.addEventListener('mouseenter', () => S.mark && S.introDone && S.mark.nudge());
  brand.addEventListener('focus', () => S.mark && S.introDone && S.mark.nudge());

  /* ---------------------------------------------------------------- boot */
  function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    buildTopbar();
    const mark = (S.mark = S.createMark());
    $('#brandSlot').appendChild(mark.el);
    // A saved location comes back only for a signed-in user (js/env.js). When this visit has no
    // location yet, the page stays hidden until we know who is here, so the picker never flashes
    // ahead of a restored dashboard. store.account gives up after 1.5 s.
    // At any address but the home page it also stays hidden until we know whether anyone is signed in:
    // a signed-out visitor is sent to the sign-in page (see render) without the page ever showing.
    const waiting = gated() || currentPath() !== '/';
    const who = waiting ? store.account : Promise.resolve();
    if (waiting) document.documentElement.classList.add('env-wait');
    who.then(() => { if (signedIn() || currentPath() === '/') document.documentElement.classList.remove('env-wait'); });
    render();
    // the crew health app skips its own opening once this one has played in the session
    document.addEventListener('still:intro-done', () => { try { sessionStorage.setItem('guardian.introSeen', '1'); } catch (e) { /* storage blocked */ } }, { once: true });
    const intro = S.intro.start(mark);
    const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))]) : Promise.resolve();
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => { window.addEventListener('load', r, { once: true }); setTimeout(r, 1500); });
    // the picker's photos (or the chosen one, for the header pill) are decoded before the reveal
    const wanted = (gated() ? ENVS : [envOf(store.get().env)]).map(e => e.img)
      .concat(['assets/brand/guardian-mark-white.png', 'assets/brand/guardian-mark-navy.png']);
    const photos = Promise.all(wanted.map(src => { const img = new Image(); img.src = src; return img.decode ? img.decode().catch(() => {}) : Promise.resolve(); }));
    const ready = Promise.all([S.scenery.render($('#scenery')), fonts, loaded, photos, who]);
    intro.finish(ready);
    // the health app's header has the same search, guide and add-card buttons; they are carried out here
    const asked = window.GuardianNav.takeRequest();
    if (asked) who.then(() => {
      if (gated()) return;
      const run = () => { if (asked === 'search') openSearch(); else if (asked === 'guide') openGuide(); else if (asked === 'add-card') cardForm({}); };
      if (S.introDone) run(); else document.addEventListener('still:intro-done', run, { once: true });
    });
  }
  boot();
})();
