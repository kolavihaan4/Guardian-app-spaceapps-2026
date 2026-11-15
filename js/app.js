/* still. — routes, views, modals. */
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

  const NAV = [
    { key: 'dashboard', href: '#/', label: 'Dashboard', icon: 'dashboard' },
    { key: 'cards', href: '#/cards', label: 'My cards', icon: 'cards', badge: true },
    { key: 'collections', href: '#/collections', label: 'Collections', icon: 'layers' },
    { key: 'library', href: '#/library', label: 'Card library', icon: 'library' },
    { key: 'settings', href: '#/settings', label: 'Settings', icon: 'settings' }
  ];

  /* ---------------------------------------------------------------- dates */
  const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function lastDays(n) {
    const out = [], today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); out.push(d); }
    return out;
  }
  function perDay(cards, days) {
    const m = new Map(days.map(d => [dayKey(d), 0]));
    cards.forEach(c => { const k = dayKey(c.createdAt); if (m.has(k)) m.set(k, m.get(k) + 1); });
    return days.map(d => m.get(dayKey(d)));
  }
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
  const findCol = id => store.get().collections.find(c => c.id === id);
  const colName = id => { const c = id && findCol(id); return c ? c.name : ''; };
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

  function spark(series) {
    const w = 64, h = 20;
    if (!series || series.length < 2 || series.every(v => v === series[0] && v === 0)) {
      const vals = [8, 10, 8.5, 11, 9.5, 12, 11, 14];
      const d = vals.map((v, i) => (i ? 'L' : 'M') + (i * w / (vals.length - 1)).toFixed(1) + ' ' + (h - v).toFixed(1)).join('');
      return `<svg class="spark spark--empty" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/></svg>`;
    }
    const max = Math.max(...series), min = Math.min(...series), span = max - min || 1;
    const pts = series.map((v, i) => [i * w / (series.length - 1), h - 3 - (v - min) / span * (h - 6)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const end = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="1.8"/></svg>`;
  }

  /* ---------------------------------------------------------------- dashboard */
  function viewDashboard(s) {
    const v = s.view;
    const both = v.activity && v.collections;
    const any = v.hero || v.glance || v.activity || v.collections || v.recent;
    return pageHead({
      eyebrow: s.workspace, title: 'Dashboard', sub: 'Your project cards and collections in one place.',
      action: `<button class="btn btn--ghost" data-action="customize">${icon('sliders')}Customize view</button>`
    }) +
      (v.hero ? hero(s) : '') +
      (v.glance ? glance(s) : '') +
      (v.activity || v.collections ? `<div class="split${both ? '' : ' split--one'}">${v.activity ? activity(s) : ''}${v.collections ? collectionsPanel(s) : ''}</div>` : '') +
      (v.recent ? recent(s) : '') +
      (any ? '' : `<section class="panel">${emptyBlock('sliders', 'Every panel is hidden', 'Turn panels back on in Customize view.', `<button class="btn btn--ghost" data-action="customize">${icon('sliders')}Customize view</button>`)}</section>`);
  }

  function hero(s) {
    const n = s.cards.length, c = s.collections.length;
    const title = n ? 'Keep the thread going.' : 'Start with a card.';
    const text = n
      ? `You have ${plural(n, 'card')}${c ? ' across ' + plural(c, 'collection') : ''}. Add the next one while it is fresh.`
      : 'Capture an idea or observation. Add a card, then find it in My cards.';
    const env = envOf(s.env);
    return `<section class="panel hero" aria-labelledby="hero-title">
      <p class="hero__eyebrow">${icon('satellite')}NASA Space Apps project${env ? `<span class="sep">·</span><a class="hero__env" href="#/environment" title="Change environment">${env.name}</a>` : ''}</p>
      <h2 class="hero__title" id="hero-title">${title}</h2>
      <p class="hero__text">${text}</p>
      <div class="hero__actions">
        ${addBtn()}
        ${n ? `<a class="btn btn--link" href="#/cards">Open My cards${icon('arrowRight')}</a>` : `<button class="btn btn--link" data-action="guide">Quick guide${icon('arrowRight')}</button>`}
      </div>
    </section>`;
  }

  function metric(o) {
    return `<article class="panel metric${o.tint ? ' metric--tint' : ''}">
      <div class="metric__head">${chipIcon(o.icon)}<h3 class="metric__label">${o.label}</h3>
        <a class="metric__go" href="${o.href}" aria-label="${o.go}">${icon('arrowUpRight')}</a></div>
      <p class="metric__value">${o.value == null ? '<span class="metric__dash" aria-label="No data"></span>' : o.value}</p>
      <div class="metric__foot"><span class="metric__note"><span class="dot${o.value == null ? '' : ' dot--live'}"></span>${o.note}</span>${spark(o.series)}</div>
    </article>`;
  }

  function glance(s) {
    const days = lastDays(7), daily = perDay(s.cards, days);
    const week = daily.reduce((a, b) => a + b, 0), total = s.cards.length;
    let run = total - week;
    const cumulative = daily.map(v => (run += v));
    const has = total > 0;
    const sizes = s.collections.map(c => s.cards.filter(x => x.collectionId === c.id).length);
    const filed = sizes.reduce((a, b) => a + b, 0);
    return `<div class="section-label"><h2>At a glance</h2><span>${has ? 'Last 7 days' : 'Fills in as you add cards'}</span></div>
    <div class="glance">
      ${metric({ icon: 'pulse', label: 'Total cards', value: has ? total : null, note: has ? `${week} added this week` : 'No data yet', href: '#/cards', go: 'Open My cards', series: has ? cumulative : null })}
      ${metric({ icon: 'clock', label: 'Added this week', value: has ? week : null, note: has ? (daily[6] ? `${daily[6]} today` : 'None today yet') : 'No data yet', href: '#/cards', go: 'Open My cards', series: has ? daily : null })}
      ${metric({ icon: 'bars', label: 'Collections', value: s.collections.length ? s.collections.length : null, note: s.collections.length ? `${plural(filed, 'card')} filed` : 'No data yet', href: '#/collections', go: 'Open Collections', series: sizes.length > 1 ? sizes : null, tint: true })}
    </div>`;
  }

  function activity(s) {
    const n = s.range, days = lastDays(n), counts = perDay(s.cards, days);
    const total = counts.reduce((a, b) => a + b, 0), max = Math.max(1, ...counts);
    const every = n <= 7 ? 1 : n <= 14 ? 2 : 5;
    const label = (d, i) => (i % every === 0 || (n > 7 && i === n - 1 && (n - 1) % every > every / 2))
      ? (n <= 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : fmtDate(d)) : '';
    const bars = counts.map((c, i) => `<div class="bar" style="--v:${(c / max).toFixed(3)}" title="${fmtDate(days[i])}: ${plural(c, 'card')}">${c ? `<span>${c}</span>` : ''}</div>`).join('');
    const labels = days.map((d, i) => `<span>${label(d, i)}</span>`).join('');
    return `<section class="panel activity" aria-labelledby="activity-title">
      <div class="panel__head">
        <div><h2 class="panel__title" id="activity-title">Activity overview</h2><p class="panel__sub">Cards added per day.</p></div>
        <label class="sr-only" for="rangeSelect">Time range</label>
        <select class="select" id="rangeSelect" data-change="range">
          ${[7, 14, 30].map(r => `<option value="${r}"${r === n ? ' selected' : ''}>Last ${r} days</option>`).join('')}
        </select>
      </div>
      <div class="chart${total ? '' : ' chart--empty'}" style="--n:${n}">
        <div class="chart__grid" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="chart__bars" aria-hidden="${total ? 'false' : 'true'}">${bars}</div>
        ${total ? '' : `<div class="chart__empty">${chipIcon('chartLine')}<p class="empty__title">No activity to display</p><p class="empty__text">Add a card and it shows up here.</p></div>`}
      </div>
      <div class="chart__labels" style="--n:${n}">${labels}</div>
    </section>`;
  }

  function collectionsPanel(s) {
    const cols = newest(s.collections).slice(0, 4);
    const body = cols.length
      ? `<ul class="col-list">${cols.map(c => {
          const n = s.cards.filter(x => x.collectionId === c.id).length;
          return `<li><a href="#/collections/${c.id}">${chipIcon('folder')}<span class="col-list__name">${esc(c.name)}</span><span class="col-list__count">${n}</span></a></li>`;
        }).join('')}</ul>
        <button class="btn btn--link btn--small" data-action="create-collection">${icon('plus')}Create collection</button>`
      : emptyBlock('layers', 'No collections yet', 'Keep related cards together in a collection.', `<button class="btn btn--link btn--small" data-action="create-collection">${icon('plus')}Create collection</button>`);
    return `<section class="panel collections-panel" aria-labelledby="cols-title">
      <div class="panel__head"><h2 class="panel__title" id="cols-title">Your collections</h2>
        <a class="icon-btn icon-btn--small" href="#/collections" aria-label="Open Collections">${icon('arrowUpRight')}</a></div>
      ${body}
    </section>`;
  }

  function recent(s) {
    const rows = newest(s.cards).slice(0, 6);
    const body = rows.length
      ? rows.map(c => `<tr data-action="open-card" data-id="${c.id}">
          <td><button class="row-link" data-action="open-card" data-id="${c.id}">${esc(c.title)}</button><span class="row-meta">${ago(c.createdAt)}</span></td>
          <td>${typeTag(c.type)}</td>
          <td class="col-collection">${esc(colName(c.collectionId)) || '<span class="muted">—</span>'}</td>
        </tr>`).join('')
      : `<tr class="table__empty"><td colspan="3"><div class="empty-inline">${chipIcon('file')}<div><p class="empty__title">No cards yet</p><p class="empty__text">Cards you add will appear here.</p></div></div></td></tr>`;
    return `<section class="panel recent" aria-labelledby="recent-title">
      <div class="panel__head"><h2 class="panel__title" id="recent-title">Recent items</h2>
        <a class="btn btn--link btn--small" href="#/cards">View all cards${icon('arrowRight')}</a></div>
      <table class="table">
        <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col" class="col-collection">Collection</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
  }

  /* ---------------------------------------------------------------- my cards */
  const filters = { q: '', type: 'all', col: 'all' };

  function viewCards(s) {
    return pageHead({ eyebrow: s.workspace, title: 'My cards', sub: 'Every card you have captured, newest first.', action: addBtn() }) +
      `<div class="toolbar panel">
        <label class="search-field">${icon('search')}<span class="sr-only">Search cards</span>
          <input type="search" id="cardSearch" placeholder="Search cards" value="${esc(filters.q)}" data-input="q" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filter by type">
          ${[{ id: 'all', label: 'All' }].concat(TYPES).map(t => `<button class="chip" data-action="filter-type" data-type="${t.id}" aria-pressed="${filters.type === t.id}">${t.label}</button>`).join('')}
        </div>
        <label class="sr-only" for="colFilter">Filter by collection</label>
        <select class="select" id="colFilter" data-change="col">
          <option value="all">All collections</option>
          <option value="none"${filters.col === 'none' ? ' selected' : ''}>No collection</option>
          ${s.collections.map(c => `<option value="${c.id}"${filters.col === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div id="cardGrid" class="card-grid">${cardGrid(s)}</div>`;
  }

  function filtered(s, list) {
    const q = filters.q.trim().toLowerCase();
    return newest(list || s.cards).filter(c =>
      (filters.type === 'all' || c.type === filters.type) &&
      (filters.col === 'all' || (filters.col === 'none' ? !c.collectionId : c.collectionId === filters.col)) &&
      (!q || (c.title + ' ' + (c.notes || '')).toLowerCase().includes(q)));
  }

  function cardGrid(s) {
    if (!s.cards.length) return `<div class="panel grid-empty">${emptyBlock('cards', 'No cards yet', 'Capture an idea, an observation or a question. It lands here.', addBtn())}</div>`;
    const list = filtered(s);
    if (!list.length) return `<div class="panel grid-empty">${emptyBlock('search', 'No cards match', 'Try another word or clear the filters.', `<button class="btn btn--ghost" data-action="clear-filters">Clear filters</button>`)}</div>`;
    return list.map(cardTile).join('');
  }

  function cardTile(c) {
    const col = colName(c.collectionId);
    return `<article class="panel card" data-action="open-card" data-id="${c.id}" role="button" tabindex="0" aria-label="Open card: ${esc(c.title)}">
      ${typeTag(c.type)}
      <h3 class="card__title">${esc(c.title)}</h3>
      ${c.notes ? `<p class="card__notes">${esc(c.notes)}</p>` : ''}
      <p class="card__meta">${col ? `${icon('folder')}<span>${esc(col)}</span><span class="sep">·</span>` : ''}<span>${ago(c.createdAt)}</span></p>
    </article>`;
  }

  function refreshGrid() {
    const g = $('#cardGrid');
    if (g) g.innerHTML = cardGrid(store.get());
    document.querySelectorAll('[data-action="filter-type"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === filters.type)));
  }

  /* ---------------------------------------------------------------- collections */
  function viewCollections(s) {
    const cols = newest(s.collections);
    const grid = cols.length
      ? `<div class="col-grid">${cols.map(c => {
          const n = s.cards.filter(x => x.collectionId === c.id).length;
          return `<a class="panel col-tile" href="#/collections/${c.id}">
            ${chipIcon('layers')}
            <h3 class="col-tile__name">${esc(c.name)}</h3>
            <p class="col-tile__text">${c.description ? esc(c.description) : '<span class="muted">No description</span>'}</p>
            <p class="col-tile__meta">${plural(n, 'card')}<span class="sep">·</span>Created ${fmtDate(c.createdAt)}</p>
          </a>`;
        }).join('')}</div>`
      : `<div class="panel grid-empty">${emptyBlock('layers', 'No collections yet', 'Group cards by theme, sensor or question so they are easy to find.', `<button class="btn btn--primary" data-action="create-collection">${icon('plus')}Create collection</button>`)}</div>`;
    return pageHead({ eyebrow: s.workspace, title: 'Collections', sub: 'Related cards, kept together.', action: `<button class="btn btn--primary" data-action="create-collection">${icon('plus')}New collection</button>` }) + grid;
  }

  function viewCollection(s, id) {
    const c = findCol(id);
    if (!c) return notFound();
    const cards = newest(s.cards.filter(x => x.collectionId === id));
    return pageHead({
      back: { href: '#/collections', label: 'All collections' }, title: esc(c.name),
      sub: (c.description ? esc(c.description) + ' · ' : '') + plural(cards.length, 'card'),
      action: `<button class="btn btn--ghost" data-action="delete-collection" data-id="${c.id}">${icon('trash')}Delete</button>${addBtn(` data-collection="${c.id}"`)}`
    }) + `<div class="card-grid">${cards.length ? cards.map(cardTile).join('') : `<div class="panel grid-empty">${emptyBlock('cards', 'This collection is empty', 'Add a card here, or move one in from My cards.', addBtn(` data-collection="${c.id}"`))}</div>`}</div>`;
  }

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
        <p class="settings__note">Cards stay in this browser. Export them to keep a copy or move them to another computer.</p>
        <div class="setting">
          <div><h3>Export</h3><p>${plural(s.cards.length, 'card')} and ${plural(s.collections.length, 'collection')} as a JSON file.</p></div>
          <button class="btn btn--ghost" data-action="export">${icon('download')}Export</button>
        </div>
        <div class="setting">
          <div><h3>Import</h3><p>Replace everything here with an exported file.</p></div>
          <button class="btn btn--ghost" data-action="import">${icon('upload')}Import</button>
        </div>
        <div class="setting">
          <div><h3>Clear all data</h3><p>Delete every card and collection in this browser.</p></div>
          <button class="btn btn--danger" data-action="clear-data">${icon('trash')}Clear data</button>
        </div>
      </section>`;
  }

  /* ---------------------------------------------------------------- environment */
  function viewEnvironment(s, first) {
    const current = s.env;
    return `<section class="env" aria-labelledby="page-title">
      <header class="env__head">
        <p class="eyebrow">${first ? 'Mission setup' : esc(s.workspace)}</p>
        <h1 class="env__title" id="page-title">${first ? 'Where is your crew?' : 'Change environment'}</h1>
      </header>
      <form class="env__form" data-form="env" data-first="${first}">
        <fieldset class="env__grid">
          <legend class="sr-only">Environment</legend>
          ${ENVS.map(e => `<label class="env-card${e.id === current ? ' is-selected' : ''}" data-env="${e.id}">
            <input class="sr-only" type="radio" name="env" value="${e.id}"${e.id === current ? ' checked' : ''}>
            <span class="env-card__media"><img src="${e.img}" alt="${esc(e.alt)}" width="${e.w}" height="${e.h}" decoding="async"></span>
            <span class="env-card__body">
              <span class="env-card__top"><span class="env-card__name">${e.name}</span><span class="env-card__check" aria-hidden="true">${icon('check')}</span></span>
              <span class="env-card__text">${e.text}</span>
              <span class="env-card__facts">${e.facts.map(f => `<span>${f}</span>`).join('')}</span>
            </span>
          </label>`).join('')}
        </fieldset>
        <div class="env__actions">
          ${first ? '' : `<a class="btn btn--ghost btn--lg" href="#/">Cancel</a>`}
          <button class="btn btn--primary btn--lg" type="submit"${current ? '' : ' disabled'}>${first ? 'Continue to dashboard' : 'Save environment'}${icon('arrowRight')}</button>
        </div>
        <p class="env__credit">Photos: NASA, NASA/JPL-Caltech/MSSS. Public domain.</p>
      </form>
    </section>`;
  }

  function notFound() {
    return pageHead({ eyebrow: 'still.', title: 'Page not found', sub: 'That page is not here.' }) +
      `<section class="panel">${emptyBlock('search', 'Nothing at this address', 'Go back to the dashboard to keep working.', `<a class="btn btn--primary" href="#/">Back to Dashboard</a>`)}</section>`;
  }

  /* ---------------------------------------------------------------- router */
  let currentKey = '';
  function resolve(s) {
    const path = (location.hash.replace(/^#/, '') || '/').replace(/\/+$/, '') || '/';
    let m;
    // no environment yet: every address shows the picker, never the dashboard
    if (!s.env) return { key: 'environment', title: 'Choose your environment', html: viewEnvironment(s, true) };
    if (path === '/environment') return { key: 'environment', title: 'Change environment', html: viewEnvironment(s, false) };
    if (path === '/') return { key: 'dashboard', title: 'Dashboard', html: viewDashboard(s) };
    if (path === '/cards') return { key: 'cards', title: 'My cards', html: viewCards(s) };
    if (path === '/collections') return { key: 'collections', title: 'Collections', html: viewCollections(s) };
    if ((m = path.match(/^\/collections\/([\w-]+)$/))) {
      const c = findCol(m[1]);
      return { key: 'collections', title: c ? c.name : 'Not found', html: viewCollection(s, m[1]) };
    }
    if (path === '/library') return { key: 'library', title: 'Card library', html: viewLibrary(s) };
    if (path === '/settings') return { key: 'settings', title: 'Settings', html: viewSettings(s) };
    return { key: '', title: 'Not found', html: notFound() };
  }

  function render() {
    const s = store.get();
    const r = resolve(s);
    const active = document.activeElement;
    const keepSearch = active && active.id === 'cardSearch';
    main.innerHTML = r.html;
    currentKey = r.key;
    document.title = r.title + ' · still.';
    document.documentElement.classList.toggle('env-gate', !s.env);
    const env = envOf(s.env), pill = $('#envPill');
    if (pill && env) {
      pill.innerHTML = `<img src="${env.img}" alt="" width="26" height="26"><span>${env.short}</span>`;
      pill.setAttribute('aria-label', `Environment: ${env.name}. Change environment`);
      if (r.key === 'environment') pill.setAttribute('aria-current', 'page'); else pill.removeAttribute('aria-current');
    }
    NAV.forEach(n => {
      const a = topbar.querySelector(`[data-nav="${n.key}"]`);
      if (!a) return;
      if (n.key === r.key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      const b = a.querySelector('.badge');
      if (b) b.textContent = s.cards.length;
    });
    if (keepSearch) { const i = $('#cardSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }

  function buildTopbar() {
    $('#nav').innerHTML = NAV.map((n, i) => `<a class="nav__link" href="${n.href}" data-nav="${n.key}" style="--d:${120 + i * 45}ms">${icon(n.icon)}<span>${n.label}</span>${n.badge ? '<span class="badge">0</span>' : ''}</a>`).join('');
    $('#actions').innerHTML =
      `<a class="env-pill" id="envPill" href="#/environment" title="Change environment" style="--d:320ms"></a>
       <button class="icon-btn" data-action="search" aria-label="Search (Ctrl+K)" title="Search  Ctrl K" style="--d:360ms">${icon('search')}</button>
       <button class="icon-btn icon-btn--help" data-action="guide" aria-label="Quick guide" title="Quick guide" style="--d:400ms">${icon('help')}</button>
       <button class="btn btn--primary btn--add" data-action="add-card" style="--d:440ms">${icon('plus')}<span>Add card</span></button>`;
    $('.brand__word').style.setProperty('--d', '60ms');
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
      ? `<textarea class="input" id="${id}" name="${o.name}" rows="${o.rows || 5}" placeholder="${esc(o.placeholder || '')}">${esc(o.value || '')}</textarea>`
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

  function cardForm(o) {
    o = o || {};
    const s = store.get();
    const c = o.card || {};
    const colId = c.collectionId || o.collectionId || '';
    const colOptions = `<option value="">No collection</option>` +
      s.collections.map(x => `<option value="${x.id}"${x.id === colId ? ' selected' : ''}>${esc(x.name)}</option>`).join('') +
      `<option value="__new">New collection…</option>`;
    const type = c.type || o.type || 'idea';
    openModal({
      title: o.card ? 'Edit card' : 'Add card',
      body: `<form id="cardForm" novalidate>
        ${field({ name: 'title', label: 'Title', value: c.title || o.title || '', placeholder: 'What did you notice or think of?', required: true })}
        ${field({ name: 'notes', label: 'Notes', type: 'textarea', value: c.notes || o.notes || '', placeholder: 'Details, links, numbers', optional: true })}
        <div class="field-row">
          ${field({ name: 'type', label: 'Type', type: 'select', options: TYPES.map(t => `<option value="${t.id}"${t.id === type ? ' selected' : ''}>${t.label}</option>`).join('') })}
          ${field({ name: 'collection', label: 'Collection', type: 'select', options: colOptions })}
        </div>
        ${field({ name: 'newCollection', label: 'New collection name', placeholder: 'e.g. Sleep data', hidden: true, max: 60 })}
      </form>`,
      footer: `<button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit" form="cardForm">${o.card ? 'Save changes' : `${icon('plus')}Add card`}</button>`,
      mount(panel, close) {
        const form = panel.querySelector('form');
        const sel = form.elements.collection, newField = form.querySelector('[data-field="newCollection"]');
        sel.addEventListener('change', () => {
          const on = sel.value === '__new';
          newField.classList.toggle('is-hidden', !on);
          if (on) form.elements.newCollection.focus();
        });
        const titleInput = form.elements.title;
        if (!o.card && o.title) requestAnimationFrame(() => { titleInput.focus(); titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length); });
        form.addEventListener('submit', e => {
          e.preventDefault();
          const title = titleInput.value.trim();
          let ok = true;
          setError(form, 'title', title ? '' : 'Give the card a title.');
          if (!title) ok = false;
          let collectionId = sel.value;
          const newName = form.elements.newCollection.value.trim();
          if (collectionId === '__new') {
            setError(form, 'newCollection', newName ? '' : 'Name the new collection.');
            if (!newName) ok = false;
          }
          if (!ok) { form.querySelector('[aria-invalid="true"]').focus(); return; }
          store.update(st => {
            if (collectionId === '__new') {
              const col = { id: uid(), name: newName, description: '', createdAt: Date.now() };
              st.collections.push(col);
              collectionId = col.id;
            }
            const data = { title, notes: form.elements.notes.value.trim(), type: form.elements.type.value, collectionId: collectionId || '' };
            if (o.card) Object.assign(st.cards.find(x => x.id === o.card.id), data);
            else st.cards.push(Object.assign({ id: uid(), createdAt: Date.now(), env: st.env || '' }, data));
          });
          close();
          toast(o.card ? 'Card saved' : 'Card added');
        });
      }
    });
  }

  function collectionForm() {
    openModal({
      title: 'New collection',
      body: `<form id="colForm" novalidate>
        ${field({ name: 'name', label: 'Name', placeholder: 'e.g. Sleep and recovery', required: true, max: 60 })}
        ${field({ name: 'description', label: 'Description', placeholder: 'What belongs here', optional: true, max: 140 })}
      </form>`,
      footer: `<button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit" form="colForm">${icon('plus')}Create collection</button>`,
      mount(panel, close) {
        const form = panel.querySelector('form');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const name = form.elements.name.value.trim();
          setError(form, 'name', name ? '' : 'Name the collection.');
          if (!name) { form.elements.name.focus(); return; }
          const col = { id: uid(), name, description: form.elements.description.value.trim(), createdAt: Date.now() };
          store.update(st => { st.collections.push(col); });
          close();
          toast('Collection created');
        });
      }
    });
  }

  function openCard(id) {
    const c = findCard(id);
    if (!c) return;
    const col = colName(c.collectionId);
    openModal({
      title: esc(c.title),
      size: 'card',
      body: `<p class="card-view__meta">${typeTag(c.type)}${envOf(c.env) ? `<span class="tag">${icon('satellite')}${envOf(c.env).short}</span>` : ''}${col ?`<a class="tag tag--link" href="#/collections/${c.collectionId}" data-close>${icon('folder')}${esc(col)}</a>` : ''}<span class="muted">Added ${fmtDate(c.createdAt)}</span></p>
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
    openModal({
      title: 'Quick guide',
      body: `<ol class="guide">
        <li><span class="guide__n">1</span><div><h3>Add a card</h3><p>One idea, observation, question or dataset per card. Templates in the Card library give you a head start.</p></div></li>
        <li><span class="guide__n">2</span><div><h3>Group cards into collections</h3><p>Keep cards about the same sensor, question or part of the build together.</p></div></li>
        <li><span class="guide__n">3</span><div><h3>Watch the dashboard</h3><p>Totals, this week's pace and recent items update as you work. Press <kbd>Ctrl</kbd> <kbd>K</kbd> to search.</p></div></li>
      </ol>`,
      footer: `<button class="btn btn--ghost" type="button" data-close>Close</button><button class="btn btn--primary" data-action="add-card">${icon('plus')}Add your first card</button>`
    });
  }

  function openCustomize() {
    const labels = { hero: 'Welcome panel', glance: 'At a glance', activity: 'Activity overview', collections: 'Your collections', recent: 'Recent items' };
    const v = store.get().view;
    openModal({
      title: 'Customize view', size: 'small',
      body: `<p class="settings__note">Choose the panels on your dashboard.</p><ul class="toggle-list">${Object.keys(labels).map(k => `<li><span id="tl-${k}">${labels[k]}</span>
        <label class="switch"><input type="checkbox" data-change="view" data-key="${k}"${v[k] ? ' checked' : ''} aria-labelledby="tl-${k}"><span class="switch__track" aria-hidden="true"></span></label></li>`).join('')}</ul>`,
      footer: `<button class="btn btn--primary" type="button" data-close>Done</button>`
    });
  }

  function openSearch() {
    openModal({
      title: 'Search', size: 'palette', hideTitle: true,
      body: `<div class="palette">
        <label class="search-field search-field--lg">${icon('search')}<span class="sr-only">Search cards, collections and pages</span>
          <input type="search" id="paletteInput" placeholder="Search cards, collections and pages" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="paletteResults"></label>
        <ul class="palette__list" id="paletteResults" role="listbox" aria-label="Results"></ul>
        <p class="palette__hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
      </div>`,
      mount(panel, close) {
        const input = panel.querySelector('#paletteInput'), list = panel.querySelector('#paletteResults');
        let items = [], active = 0;
        function results(q) {
          const s = store.get(); q = q.trim().toLowerCase();
          const hit = t => !q || t.toLowerCase().includes(q);
          const pages = NAV.filter(n => hit(n.label)).map(n => ({ kind: 'Page', label: n.label, icon: n.icon, go: () => { location.hash = n.href; } }));
          const cols = s.collections.filter(c => hit(c.name + ' ' + (c.description || ''))).map(c => ({ kind: 'Collection', label: c.name, icon: 'layers', go: () => { location.hash = '#/collections/' + c.id; } }));
          const cards = newest(s.cards).filter(c => hit(c.title + ' ' + (c.notes || ''))).map(c => ({ kind: typeOf(c.type).label, label: c.title, icon: typeOf(c.type).icon, go: () => openCard(c.id) }));
          return (q ? cards.concat(cols, pages) : pages.concat(cards.slice(0, 5))).slice(0, 12);
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
    const blob = new Blob([JSON.stringify({ app: 'still.', version: 1, exportedAt: new Date().toISOString(), workspace: s.workspace, cards: s.cards, collections: s.collections }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'still-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Export downloaded');
  }
  $('#importFile').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(text => {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.cards) || !Array.isArray(data.collections)) throw new Error('shape');
      confirmBox({
        title: 'Replace your data?', confirm: 'Replace',
        text: `This replaces everything here with ${plural(data.cards.length, 'card')} and ${plural(data.collections.length, 'collection')} from <strong>${esc(file.name)}</strong>.`,
        onConfirm() {
          const s = store.get();
          store.replace(Object.assign({}, s, { cards: data.cards, collections: data.collections, workspace: data.workspace || s.workspace }));
          toast('Data imported');
        }
      });
    }).catch(() => toast('That file is not a still. export'));
  });

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('[inert]')) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'add-card': e.preventDefault(); cardForm({ collectionId: el.dataset.collection }); break;
      case 'guide': openGuide(); break;
      case 'customize': openCustomize(); break;
      case 'search': openSearch(); break;
      case 'create-collection': collectionForm(); break;
      case 'open-card': openCard(id); break;
      case 'edit-card': cardForm({ card: findCard(id) }); break;
      case 'delete-card': {
        const c = findCard(id); if (!c) break;
        confirmBox({ title: 'Delete this card?', confirm: 'Delete card', text: `“${esc(c.title)}” will be deleted. This cannot be undone.`, onConfirm() { store.update(s => { s.cards = s.cards.filter(x => x.id !== id); }); toast('Card deleted'); } });
        break;
      }
      case 'delete-collection': {
        const c = findCol(id); if (!c) break;
        const n = store.get().cards.filter(x => x.collectionId === id).length;
        confirmBox({
          title: 'Delete this collection?', confirm: 'Delete collection',
          text: `“${esc(c.name)}” will be deleted.${n ? ` Its ${plural(n, 'card')} stay in My cards.` : ''}`,
          onConfirm() {
            store.update(s => { s.collections = s.collections.filter(x => x.id !== id); s.cards.forEach(x => { if (x.collectionId === id) x.collectionId = ''; }); });
            location.hash = '#/collections';
            toast('Collection deleted');
          }
        });
        break;
      }
      case 'filter-type': filters.type = el.dataset.type; refreshGrid(); break;
      case 'clear-filters': filters.q = ''; filters.type = 'all'; filters.col = 'all'; render(); break;
      case 'use-template': {
        const t = TEMPLATES.find(x => x.id === id);
        if (t) cardForm({ type: t.type, title: t.title, notes: t.notes });
        break;
      }
      case 'export': exportData(); break;
      case 'import': $('#importFile').click(); break;
      case 'clear-data':
        confirmBox({ title: 'Clear all data?', confirm: 'Clear everything', text: 'Every card and collection in this browser will be deleted. Export first if you want a copy.', onConfirm() { store.update(s => { s.cards = []; s.collections = []; }); toast('All data cleared'); } });
        break;
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
    if (!S.introDone || modal || gated()) return;
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
      case 'range': store.update(s => { s.range = +el.value; }); break;
      case 'col': filters.col = el.value; refreshGrid(); break;
      case 'intro': store.update(s => { s.intro = el.checked; }); toast(el.checked ? 'Opening animation on' : 'Opening animation off'); break;
      case 'view': store.update(s => { s.view[el.dataset.key] = el.checked; }); break;
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
      const changed = store.get().env !== env.id;
      store.update(s => { s.env = env.id; });   // lifts the gate and re-renders
      if (first) {
        topbar.classList.add('chrome-in');
        setTimeout(() => topbar.classList.remove('chrome-in'), 900);
      }
      if (location.hash && location.hash !== '#/' && location.hash !== '#') location.hash = '#/';
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
    if (gated()) { window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); return; }
    if (currentKey === 'dashboard' && (location.hash === '' || location.hash === '#/' || location.hash === '#')) {
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
    render();
    const intro = S.intro.start(mark);
    const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => { window.addEventListener('load', r, { once: true }); setTimeout(r, 4000); });
    // the picker's photos (or the chosen one, for the header pill) are decoded before the reveal
    const wanted = gated() ? ENVS : [envOf(store.get().env)];
    const photos = Promise.all(wanted.map(e => { const img = new Image(); img.src = e.img; return img.decode ? img.decode().catch(() => {}) : Promise.resolve(); }));
    const ready = Promise.all([S.scenery.render($('#scenery')), fonts, loaded, photos]);
    intro.finish(ready);
  }
  boot();
})();
