/* Still — dependency-free frontend. All state stays in this browser. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'still-template-v1';
  const paths = {
    mountain: '<path d="M2 17 8.5 6 15 17M11.5 11 15.5 5 22 17M5.7 11l2.8-4 2.8 4M3 21h18"/>',
    overview: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18M11 10v11"/>',
    layers: '<path d="m3 8 9-5 9 5-9 5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    shapes: '<circle cx="7.5" cy="7.5" r="4"/><rect x="13" y="13" width="8" height="8" rx="1.7"/><path d="m15 3 6 7H11l4-7ZM6 14l4 7H2l4-7Z"/>',
    settings: '<path d="m9 4 1-2h4l1 2 2 1 2-.2 2 3.4-1.2 1.8v2l1.2 2-2 3.4-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3.4L4.2 12v-2L3 8.2l2-3.4 2 .2 2-1Z"/><circle cx="12" cy="11" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    sprout: '<path d="M12 21v-9M12 16C5 17 2 13 3 7c6-1 10 2 9 9ZM12 12c-1-6 3-10 9-9 1 6-3 10-9 9Z"/>',
    'arrow-up-right': '<path d="M6 18 18 6M7 6h11v11"/>',
    'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4m6-6-6 6 6 6"/>',
    'chevron-right': '<path d="m9 5 7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    sparkle: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    chart: '<path d="M4 4v16h16M8 14l4-4 3 2 5-7"/>',
    circle: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M8 13h8M8 17h5"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/>',
    pin: '<path d="m16 3 5 5-3 1-3 5 1 3-3-1-5 3-1 3-5-5 3-1 3-5-1-3 3 1 5-3 1-3Z" transform="translate(2 -1) scale(.85)"/><path d="m8 16-5 5"/>',
    trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    leaf: '<path d="M20 3C8 2 2 8 5 15s17 6 15-12ZM4 21 16 9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M9 10h12"/>',
    metric: '<path d="M5 20V10h3v10M11 20V4h3v16M17 20v-7h3v7"/>',
  };
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true" viewBox="0 0 24 24">${paths[name] || paths.note}</svg>`;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function hydrateIcons(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  const defaults = () => ({ version: 1, cards: [], collections: [], preferences: { name: 'My workspace', accent: 'sage', density: 'comfortable', landscape: true, hero: true, metrics: true, activity: true } });
  let storageWorks = true;
  function readState() {
    const fallback = defaults();
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!raw || raw.version !== 1) return fallback;
      const collections = Array.isArray(raw.collections) ? raw.collections.filter(c => c && typeof c.id === 'string' && typeof c.title === 'string').slice(0, 300).map(c => ({ id: c.id.slice(0, 100), title: c.title.slice(0, 60), description: String(c.description || '').slice(0, 240) })) : [];
      const cards = Array.isArray(raw.cards) ? raw.cards.filter(c => c && typeof c.id === 'string' && typeof c.title === 'string').slice(0, 1000).map(c => ({ id: c.id.slice(0, 100), title: c.title.slice(0, 60), description: String(c.description || '').slice(0, 240), type: ['note','metric','chart'].includes(c.type) ? c.type : 'note', collection: collections.some(group => group.id === c.collection) ? c.collection : '', pinned: c.pinned === true, created: Number.isFinite(c.created) ? c.created : Date.now() })) : [];
      const p = raw.preferences || {};
      const preferences = { ...fallback.preferences };
      if (typeof p.name === 'string' && p.name.trim()) preferences.name = p.name.trim().slice(0, 35);
      if (['sage','blue','lavender'].includes(p.accent)) preferences.accent = p.accent;
      if (['comfortable','compact'].includes(p.density)) preferences.density = p.density;
      for (const key of ['landscape','hero','metrics','activity']) if (typeof p[key] === 'boolean') preferences[key] = p[key];
      return { version: 1, cards, collections, preferences };
    } catch { storageWorks = false; return fallback; }
  }
  let state = readState();
  let workspaceTab = 'all';
  let componentTab = 'cards';
  let activityRange = '7';
  let editorMode = 'card';
  let editingCardId = null;
  let confirmCallback = null;
  let toastTimer;
  const pageDetails = {
    overview: { title: 'Dashboard', heading: 'Dashboard', description: 'Your project cards and collections in one place.', icon: 'overview', keywords: 'home overview' },
    workspace: { title: 'My cards', heading: 'My cards', description: 'Add, edit, and organize your project cards. Pin favorites to find them quickly.', icon: 'grid', keywords: 'workspace notes favorites' },
    collections: { title: 'Collections', heading: 'Collections', description: 'Group related cards in one place.', icon: 'layers' },
    components: { title: 'Card library', heading: 'Card library', description: 'Choose a note, metric, or chart card to get started.', icon: 'shapes', keywords: 'components templates' },
    settings: { title: 'Settings', heading: 'Settings', description: 'Personalize your workspace and appearance.', icon: 'settings' },
  };
  function route() {
    const [rawPage, query = ''] = location.hash.slice(1).split('?');
    return { page: Object.hasOwn(pageDetails, rawPage) ? rawPage : 'overview', params: new URLSearchParams(query) };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageWorks = true; }
    catch { storageWorks = false; }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast-text').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3800);
  }
  function savedToast(message) { toast(storageWorks ? message : `${message} Changes are temporary in this browser.`); }
  function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  function applyPreferences() {
    const p = state.preferences;
    document.body.dataset.accent = p.accent;
    document.body.dataset.density = p.density;
    document.body.dataset.landscape = String(p.landscape);
    const workspaceHeading = $('.page-heading .eyebrow');
    if (workspaceHeading) workspaceHeading.textContent = p.name;
    $('#card-count').textContent = state.cards.length;
  }
  function heading(page, button = '') {
    const p = pageDetails[page];
    return `<div class="page-heading"><div><p class="eyebrow">${esc(state.preferences.name)}</p><h1>${p.heading}</h1><p class="page-description">${p.description}</p></div>${button}</div>`;
  }
  const addCardButton = (label = 'Add card') => `<button class="button button-primary" data-action="add-card">${icon('plus')} ${label}</button>`;
  function emptyState({symbol = 'grid', title, description, action = 'add-card', label = 'Add card'}) {
    return `<div class="large-empty glass"><span class="empty-icon">${icon(symbol)}</span><h2>${title}</h2><p>${description}</p><button class="button button-primary" data-action="${action}">${icon('plus')} ${label}</button></div>`;
  }
  function metricCard(title, symbol, line = 0) {
    const lines = ['M0 17 Q10 12 20 15 T40 11 T60 13 T80 8','M0 16 Q10 16 20 11 T40 14 T60 9 T80 10','M0 17 Q10 18 20 13 T40 15 T60 10 T80 6'];
    return `<article class="metric-card glass"><div class="metric-top"><div class="metric-name"><span>${icon(symbol)}</span>${title}</div><span class="metric-arrow">${icon('arrow-up-right')}</span></div><div class="metric-value" aria-label="No value">—</div><div class="metric-bottom"><span class="no-data">No data yet</span><svg class="mini-line" viewBox="0 0 80 24" aria-hidden="true"><path d="${lines[line]}"/></svg></div></article>`;
  }
  function overview() {
    const p = state.preferences;
    return heading('overview', `<button class="button button-secondary" data-action="customize">${icon('sliders')} Customize view</button>`) +
      (p.hero ? `<section class="hero" aria-labelledby="hero-heading"><div class="eyebrow">${icon('sprout')} NASA Space Apps project</div><h2 id="hero-heading">${state.cards.length ? 'Your project, at a glance.' : 'Start with a card.'}</h2><p>${state.cards.length ? 'Pick up where you left off. Find your latest cards below, or add something new.' : 'Capture an idea or observation. Add a card, then find it in My cards.'}</p><div class="hero-actions">${addCardButton()}<button class="text-button" data-action="guide">Quick guide ${icon('arrow-right')}</button></div></section>` : '') +
      (p.metrics ? `<div class="section-topline"><h2>At a glance</h2><span>Metric placeholders</span></div><section class="metric-grid" aria-label="Blank metric cards">${metricCard('Primary metric','activity')}${metricCard('Secondary metric','circle',1)}${metricCard('Tertiary metric','metric',2)}</section>` : '') +
      `<div class="dashboard-grid">${p.activity ? `<section class="panel glass"><div class="panel-header"><div><div class="panel-title"><h2>Activity overview</h2></div><p class="panel-subtitle">A space for your charts and insights.</p></div><label class="sr-only" for="activity-range">Chart time range</label><select id="activity-range" class="compact-select"><option value="7" ${activityRange==='7'?'selected':''}>Last 7 days</option><option value="30" ${activityRange==='30'?'selected':''}>Last 30 days</option><option value="90" ${activityRange==='90'?'selected':''}>Last 90 days</option></select></div><div class="chart-placeholder" aria-label="Empty chart placeholder"><div class="chart-grid" aria-hidden="true"></div><div class="chart-empty"><span class="empty-icon">${icon('chart')}</span><h3>No activity to display</h3><p id="chart-range-description">Add your ${activityRange}-day chart content here.</p></div><div class="chart-labels" aria-hidden="true">${(activityRange === '7' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : activityRange === '30' ? ['Day 1','Day 5','Day 10','Day 15','Day 20','Day 25','Day 30'] : ['Day 1','Day 15','Day 30','Day 45','Day 60','Day 75','Day 90']).map(d => `<span>${d}</span>`).join('')}</div></div></section>` : `<section class="panel glass"><div class="panel-title"><h2>Dashboard layout</h2></div><div class="collection-empty"><span class="empty-icon">${icon('layout')}</span><h3>Choose your layout</h3><p>Choose the sections you want on your dashboard.</p><button class="text-button" data-action="customize">Customize view ${icon('arrow-right')}</button></div></section>`}
      <section class="panel collection-preview glass"><div class="panel-header"><div class="panel-title"><h2>Your collections</h2></div><a class="text-button" href="#collections" aria-label="View all collections">${icon('arrow-up-right')}</a></div>${state.collections.length ? `<div class="collection-list">${state.collections.slice(0,3).map(c => `<a href="#workspace?collection=${encodeURIComponent(c.id)}">${icon('folder')}<span>${esc(c.title)}</span>${icon('chevron-right')}</a>`).join('')}</div><button class="text-button" data-action="add-collection" style="margin-top:18px">${icon('plus')} New collection</button>` : `<div class="collection-empty"><span class="empty-icon">${icon('layers')}</span><h3>No collections yet</h3><p>Keep related cards together in a collection.</p><button class="text-button" data-action="add-collection">${icon('plus')} Create collection</button></div>`}</section></div>
      <section class="panel recent-panel glass"><div class="panel-header"><div class="panel-title"><h2>Recent items</h2></div><a class="text-button" href="#workspace">View all cards ${icon('arrow-right')}</a></div><div class="table-head" aria-hidden="true"><span>Name</span><span>Type</span><span>Collection</span><span></span></div>${state.cards.length ? state.cards.slice(0,4).map(c => `<div class="recent-row"><a href="#workspace?focus=${encodeURIComponent(c.id)}">${icon(c.type)}<span>${esc(c.title)}</span></a><span>${typeLabel(c.type)}</span><span>${esc(collectionTitle(c.collection) || '—')}</span><button class="icon-button" data-action="pin" data-id="${esc(c.id)}" aria-label="${c.pinned?'Unpin':'Pin'} ${esc(c.title)}" aria-pressed="${c.pinned}" title="${c.pinned ? 'Unpin card' : 'Pin card'}">${icon('pin')}</button></div>`).join('') : `<div class="recent-empty"><span class="empty-icon">${icon('note')}</span><div><h3>No cards yet</h3><p>Cards you add will appear here.</p></div></div>`}</section>`;
  }
  function typeLabel(type) { return ({note: 'Note', metric: 'Metric', chart: 'Chart'})[type] || 'Note'; }
  function collectionTitle(id) { return state.collections.find(c => c.id === id)?.title || ''; }
  function renderCard(c, focused) {
    return `<article class="workspace-card glass${focused === c.id ? ' highlight' : ''}" id="card-${esc(c.id)}"><div class="card-toolbar"><span class="type-icon">${icon(c.type)}</span><div><button class="icon-button" data-action="edit-card" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.title)}" title="Edit card">${icon('edit')}</button><button class="icon-button ${c.pinned?'is-pinned':''}" data-action="pin" data-id="${esc(c.id)}" aria-label="${c.pinned?'Unpin':'Pin'} ${esc(c.title)}" aria-pressed="${c.pinned}" title="${c.pinned ? 'Unpin card' : 'Pin card'}">${icon('pin')}</button><button class="icon-button" data-action="remove-card" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.title)}" title="Remove card">${icon('trash')}</button></div></div><h3>${esc(c.title)}</h3><p class="card-description">${esc(c.description || (c.type === 'note' ? 'Add your notes here.' : 'Add your content here.'))}</p>${c.type === 'metric' ? '<div class="card-placeholder-value" aria-label="No value">—</div><span class="no-data">No data yet</span>' : c.type === 'chart' ? '<div class="card-chart">Chart placeholder</div>' : ''}<div class="card-meta">${icon(c.collection?'folder':'note')}${esc(collectionTitle(c.collection) || typeLabel(c.type))}</div></article>`;
  }
  function workspace(params) {
    const collection = state.collections.find(c => c.id === params.get('collection'));
    let cards = state.cards.filter(c => !collection || c.collection === collection.id);
    if (workspaceTab === 'pinned') cards = cards.filter(c => c.pinned);
    const focused = params.get('focus');
    return heading('workspace', addCardButton()) + (collection ? `<div class="component-intro glass"><a class="text-button" href="#collections">${icon('arrow-left')} Collections</a><span>/</span><span>${esc(collection.title)}</span></div>` : '') +
      `<div class="toolbar"><div class="tabs" role="tablist" aria-label="My cards"><button role="tab" id="workspace-all" aria-controls="workspace-panel" aria-selected="${workspaceTab === 'all'}" tabindex="${workspaceTab === 'all'?0:-1}" data-workspace-tab="all">All cards <span>${state.cards.filter(c => !collection || c.collection === collection.id).length}</span></button><button role="tab" id="workspace-pinned" aria-controls="workspace-panel" aria-selected="${workspaceTab === 'pinned'}" tabindex="${workspaceTab === 'pinned'?0:-1}" data-workspace-tab="pinned">Pinned ${icon('pin')}</button></div><span class="item-count">${cards.length} ${cards.length===1?'card':'cards'} in this view</span></div><div role="tabpanel" id="workspace-panel" aria-labelledby="workspace-${workspaceTab}">${cards.length ? `<div class="workspace-grid">${cards.map(c => renderCard(c, focused)).join('')}<button class="add-card-tile" data-action="add-card">${icon('plus')} Add another card</button></div>` : emptyState({title:workspaceTab === 'pinned' ? 'No pinned cards' : collection ? 'This collection is empty' : 'No cards yet', description:workspaceTab === 'pinned' ? 'Pin a card from All cards to keep it in this view.' : 'Add a note, metric, or chart card to start your workspace.', symbol: workspaceTab === 'pinned' ? 'pin' : 'grid', action: workspaceTab==='pinned'?'show-all':'add-card', label:workspaceTab === 'pinned'?'View all cards':'Add card'})}</div>`;
  }
  function collections() {
    return heading('collections', `<button class="button button-primary" data-action="add-collection">${icon('plus')} New collection</button>`) + (state.collections.length ? `<div class="section-topline"><h2>All collections</h2><span>${state.collections.length} ${state.collections.length===1?'collection':'collections'}</span></div><div class="collection-grid">${state.collections.map(c => `<article class="collection-card glass"><span class="type-icon">${icon('folder')}</span><button class="icon-button collection-remove" data-action="remove-collection" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.title)} collection">${icon('trash')}</button><h3>${esc(c.title)}</h3><p>${esc(c.description || 'A collection of related cards.')}</p><a class="text-button" href="#workspace?collection=${encodeURIComponent(c.id)}">${state.cards.filter(card=>card.collection===c.id).length} cards ${icon('arrow-right')}</a></article>`).join('')}<button class="add-card-tile" data-action="add-collection">${icon('plus')} New collection</button></div>` : emptyState({symbol:'layers', title:'No collections yet', description:'Create a collection to organize related cards.', action:'add-collection', label:'Create collection'}));
  }
  function components() {
    let content;
    if (componentTab === 'cards') content = `<div class="component-grid"><section class="component-panel glass"><h2>Note card</h2><p>A reusable space for notes and text.</p><article class="workspace-card"><div class="card-toolbar"><span class="type-icon">${icon('note')}</span><span class="tag">Note</span></div><h3>Card title</h3><p class="card-description">Add a description or note to this card.</p><div class="card-meta">${icon('note')} Text content</div></article><div class="button-row"><button class="text-button" data-action="add-card" data-type="note">Add note ${icon('arrow-right')}</button></div></section><section class="component-panel glass"><h2>Metric card</h2><p>A placeholder for a value and its label.</p>${metricCard('Metric title','activity')}<div class="button-row"><button class="text-button" data-action="add-card" data-type="metric">Add metric ${icon('arrow-right')}</button></div></section><section class="component-panel glass"><h2>Chart card</h2><p>A reusable container for chart content.</p><article class="workspace-card"><div class="card-toolbar"><span class="type-icon">${icon('chart')}</span><span class="tag">Chart</span></div><h3>Chart title</h3><div class="card-chart">Chart placeholder</div></article><div class="button-row"><button class="text-button" data-action="add-card" data-type="chart">Add chart ${icon('arrow-right')}</button></div></section></div>`;
    else if (componentTab === 'controls') content = `<div class="component-grid two-column"><section class="component-panel glass"><h2>Buttons & actions</h2><p>Consistent actions with clear visual priority.</p><div class="button-row"><button class="button button-primary" data-action="demo-button">Primary action ${icon('arrow-right')}</button><button class="button button-secondary" data-action="demo-button">Secondary action</button><button class="button button-quiet" data-action="demo-button">Text action</button><button class="icon-button" data-action="demo-button" aria-label="Example icon action">${icon('plus')}</button></div><hr class="settings-divider"><span class="tag">${icon('check-circle')} Ready to begin</span><span class="tag">Blank state</span></section><section class="component-panel glass"><h2>Inputs & choices</h2><p>Labeled fields and controls for your forms.</p><label class="field">Example title<input placeholder="Type something…" maxlength="60"></label><label class="field">Example selection<select><option>Option one</option>Option two</option>Option three</option></select></label><label class="setting-row"><span><strong>Example switch</strong><small>Toggle this control to preview its states.</small></span><input type="checkbox" class="switch" role="switch" checked></label></section><section class="component-panel glass"><h2>Color palette</h2><p>Misty blue, navy, sage, and a lavender accent.</p><div class="palette-grid">${[['Mist','#e1e9f1'],['Navy','#233e59'],['Sage','#527e78'],['Cloud','#f4f8fa']].map(([name,hex])=>`<div><div class="palette-color" style="background:${hex}"></div><small>${name}</small><code>${hex}</code></div>`).join('')}</div></section><section class="component-panel glass"><h2>Typography</h2><p>Editorial display type with readable interface text.</p><div class="display-title" style="font-size:32px;line-height:1.3">A clear space<br>for your work.</div><p class="card-description" style="margin-top:16px">Use a consistent text hierarchy across your pages.</p></section></div>`;
    else content = `<div class="component-grid two-column"><section class="component-panel glass"><h2>Empty card state</h2><p>A clear starting point for an empty workspace.</p>${emptyState({symbol:'note',title:'No cards yet',description:'Add a card to start your workspace.',label:'Add card'})}</section><section class="component-panel glass"><h2>Empty collection state</h2><p>A starting point for a collection.</p>${emptyState({symbol:'layers',title:'This collection is empty',description:'Add cards to organize them here.',action:'add-collection',label:'Create collection'})}</section></div>`;
    return heading('components') + `<div class="component-intro glass">${icon('shapes')}<span>Preview a card below, then choose Add to make it yours.</span></div><div class="toolbar"><div class="tabs" role="tablist" aria-label="Component categories">${[['cards','Cards'],['controls','Controls & style'],['empty','Empty states']].map(([key,label])=>`<button role="tab" id="components-${key}" aria-controls="components-panel" aria-selected="${componentTab===key}" tabindex="${componentTab===key?0:-1}" data-component-tab="${key}">${label}</button>`).join('')}</div></div><div role="tabpanel" id="components-panel" aria-labelledby="components-${componentTab}">${content}</div>`;
  }
  function switchRow(key, title, description, checked = state.preferences[key]) {
    return `<label class="setting-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" class="switch" role="switch" data-preference="${key}" ${checked?'checked':''}></label>`;
  }
  function settings() {
    const p = state.preferences;
    return heading('settings') + `<div class="setting-layout"><div class="settings-stack"><section class="settings-panel glass"><h2>Your workspace</h2><p>Set the workspace name shown above each page.</p><form id="workspace-name-form"><label class="field">Workspace name<input id="workspace-name" name="name" value="${esc(p.name)}" required maxlength="35" autocomplete="off"></label><button class="button button-secondary" type="submit">Save name ${icon('check')}</button></form></section><section class="settings-panel glass"><h2>Look & feel</h2><p>Choose an accent and adjust your workspace layout.</p><span class="settings-label">Accent color</span><div class="swatch-options" role="group" aria-label="Accent color">${[['sage','Sage'],['blue','Blue'],['lavender','Lavender']].map(([key,label])=>`<button class="swatch-button" data-action="accent" data-value="${key}" aria-pressed="${p.accent===key}"><span class="swatch swatch-${key}"></span>${label}</button>`).join('')}</div>${switchRow('landscape','Mountain landscape','Show the mountain landscape, waves, and trees.')}${switchRow('density','Compact spacing','Reduce the spacing between cards.',p.density==='compact')}</section><section class="settings-panel glass"><h2>Workspace data</h2><p>Your cards and preferences are saved only in this browser${storageWorks?'.':', when browser storage is available.'} Export a copy to keep a layout snapshot.</p><button class="button button-secondary" data-action="export">${icon('download')} Export layout</button><hr class="settings-divider"><button class="text-button reset-button" data-action="reset">Reset this workspace</button></section></div><aside class="settings-panel about-panel glass" aria-label="About Still"><div class="about-mark">${icon('mountain')}</div><h2>still.</h2><p>A frontend dashboard template with flexible pages, reusable cards, and local workspace controls.</p><span class="tag">Version 1.0</span><span class="tag">Frontend template</span><hr class="settings-divider"><div class="info-note">${icon('leaf')}<p>Your cards and appearance preferences stay in this browser.</p></div><div class="button-row" style="margin-top:22px"><button class="text-button" data-action="guide">Open quick guide ${icon('arrow-right')}</button></div></aside></div>`;
  }
  function render() {
    const { page, params } = route();
    applyPreferences();
    document.title = `${pageDetails[page].title} · Still`;
    $$('[data-page]').forEach(link => { if (link.dataset.page === page) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
    if (matchMedia('(max-width:1190px)').matches) $('[data-page][aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    $('#main-content').innerHTML = ({ overview, workspace, collections, components, settings })[page](params);
    hydrateIcons($('#main-content'));
    if (params.has('focus')) requestAnimationFrame(() => document.getElementById(`card-${params.get('focus')}`)?.scrollIntoView({block:'center'}));
  }
  function showDialog(id) { const dialog = document.getElementById(id); if (!dialog.open) dialog.showModal(); }
  function updateCardTypeHelp() {
    $('#card-type-help').textContent = {
      note: 'Use a note for observations and project details.',
      metric: 'A blank number card you can customize later.',
      chart: 'A blank area for a chart you add later.',
    }[$('#item-type').value];
  }
  function openEditor(mode, type = 'note', card = null) {
    editorMode = mode;
    editingCardId = card?.id || null;
    const isCard = mode === 'card';
    $('#editor-form').reset();
    $('#item-title').setCustomValidity('');
    $('#editor-title').textContent = card ? 'Edit card' : isCard ? 'Add card' : 'Create collection';
    $('#item-title').placeholder = isCard ? 'Card title' : 'Collection title';
    $('#editor-description').textContent = isCard ? 'Choose a card type, give it a title, and add any details.' : 'Give your collection a name, then choose it when adding cards.';
    $('#editor-submit').innerHTML = `${card ? 'Save changes' : isCard ? 'Add card' : 'Create collection'} ${icon(card ? 'check' : 'plus')}`;
    $('#card-fields').hidden = !isCard;
    $('#card-type-fields').hidden = !isCard;
    $('#item-type').value = ['note','metric','chart'].includes(type) ? type : 'note';
    $('#item-collection').innerHTML = '<option value="">No collection</option>' + state.collections.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
    const activeCollection = route().params.get('collection');
    if (state.collections.some(c => c.id === activeCollection)) $('#item-collection').value = activeCollection;
    if (card) {
      $('#item-title').value = card.title;
      $('#item-description').value = card.description;
      $('#item-type').value = card.type;
      $('#item-collection').value = card.collection;
    }
    updateCardTypeHelp();
    showDialog('editor-dialog');
    $('#item-title').focus();
  }
  function askToConfirm(title, description, action, buttonLabel = 'Remove') {
    $('#confirm-title').textContent = title;
    $('#confirm-description').textContent = description;
    $('#confirm-action').textContent = buttonLabel;
    confirmCallback = action;
    showDialog('confirm-dialog');
  }
  function openSearch() { $('#search-input').value = ''; renderSearch(''); showDialog('search-dialog'); $('#search-input').focus(); }
  function renderSearch(query) {
    const all = Object.entries(pageDetails).map(([id,p]) => ({title:p.title, keywords:`${p.description} ${p.keywords || ''}`, kind:'Page', icon:p.icon, url:`#${id}`}))
      .concat(state.cards.map(c=>({title:c.title,keywords:c.description,kind:'Card',icon:c.type,url:`#workspace?focus=${encodeURIComponent(c.id)}`})))
      .concat(state.collections.map(c=>({title:c.title,keywords:c.description,kind:'Collection',icon:'folder',url:`#workspace?collection=${encodeURIComponent(c.id)}`})));
    const results = all.filter(x => `${x.title} ${x.keywords}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 20);
    $('#search-results').innerHTML = results.length ? results.map(x=>`<a class="search-result" href="${x.url}">${icon(x.icon)}<span>${esc(x.title)}</span><small>${x.kind}</small></a>`).join('') : '<p class="search-none">No results yet. Try another word.</p>';
  }
  const actions = {
    'add-card': button => openEditor('card', button.dataset.type),
    'edit-card': button => { const card = state.cards.find(c => c.id === button.dataset.id); if (card) openEditor('card', card.type, card); },
    'add-collection': () => openEditor('collection'),
    guide: () => showDialog('guide-dialog'),
    'guide-start': () => { $('#guide-dialog').close(); openEditor('card'); },
    search: openSearch,
    customize: () => { $('#visibility-options').innerHTML = switchRow('hero','Getting started','Show the welcome card and quick guide.') + switchRow('metrics','Metric cards','Show three metric placeholders.') + switchRow('activity','Activity overview','Show the chart placeholder.'); showDialog('customize-dialog'); },
    'show-all': () => { workspaceTab = 'all'; render(); },
    'demo-button': () => toast('Button preview activated.'),
    pin: button => { const card = state.cards.find(c=>c.id===button.dataset.id); if (!card) return; card.pinned=!card.pinned; save(); render(); savedToast(card.pinned?'Card pinned.':'Card unpinned.'); },
    'remove-card': button => { const card = state.cards.find(c=>c.id===button.dataset.id); if (!card) return; askToConfirm('Remove this card?', `“${card.title}” will be removed from this browser’s workspace.`, () => { state.cards=state.cards.filter(c=>c.id!==card.id); save(); render(); savedToast('Card removed.'); }); },
    'remove-collection': button => { const collection=state.collections.find(c=>c.id===button.dataset.id); if (!collection) return; askToConfirm('Remove this collection?', `“${collection.title}” will be removed. Its cards will stay in your workspace.`, () => { state.collections=state.collections.filter(c=>c.id!==collection.id); state.cards.forEach(c=>{if(c.collection===collection.id)c.collection='';}); save(); render(); savedToast('Collection removed. Cards kept in My cards.'); }); },
    accent: button => { state.preferences.accent=button.dataset.value; save(); render(); const replacement=$(`[data-action="accent"][data-value="${state.preferences.accent}"]`); replacement?.focus(); },
    export: () => { const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='still-workspace.json'; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('Your layout export is ready.'); },
    reset: () => askToConfirm('Reset this workspace?', 'This removes the cards, collections, and preferences in this template. Export your layout first if you’d like to keep a copy.', () => {state=defaults(); workspaceTab='all'; save(); render(); savedToast('Workspace reset.');}, 'Reset workspace'),
  };
  document.addEventListener('click', event => {
    if (event.target.closest('.skip-link')) { event.preventDefault(); $('#main-content').focus(); $('#main-content').scrollIntoView({block:'start'}); return; }
    const close = event.target.closest('[data-close]');
    if (close) { close.closest('dialog')?.close(); return; }
    const action = event.target.closest('[data-action]');
    if (action) actions[action.dataset.action]?.(action);
    const workspaceButton = event.target.closest('[data-workspace-tab]');
    if (workspaceButton) { workspaceTab=workspaceButton.dataset.workspaceTab; render(); $(`[data-workspace-tab="${workspaceTab}"]`)?.focus(); }
    const componentButton = event.target.closest('[data-component-tab]');
    if (componentButton) { componentTab=componentButton.dataset.componentTab; render(); $(`[data-component-tab="${componentTab}"]`)?.focus(); }
    if (event.target.closest('.search-result')) $('#search-dialog').close();
  });
  document.addEventListener('change', event => {
    const preference=event.target.dataset.preference;
    if (preference) {
      state.preferences[preference] = preference==='density' ? (event.target.checked?'compact':'comfortable') : event.target.checked;
      save(); applyPreferences();
      if (route().page==='overview') render();
    }
    if (event.target.id==='activity-range') { activityRange=event.target.value; render(); $('#activity-range')?.focus(); }
    if (event.target.id==='item-type') updateCardTypeHelp();
  });
  $('#editor-form').addEventListener('submit', event => {
    event.preventDefault();
    const title=$('#item-title').value.trim();
    if (!title) { $('#item-title').setCustomValidity('Enter a title.'); $('#item-title').reportValidity(); return; }
    const item={id:editingCardId || uid(),title,description:$('#item-description').value.trim()};
    if (editorMode==='card') {
      const details = {...item,type:$('#item-type').value,collection:$('#item-collection').value};
      if (editingCardId) {
        const card = state.cards.find(c => c.id === editingCardId);
        if (card) Object.assign(card, details);
      } else state.cards.unshift({...details,pinned:false,created:Date.now()});
      workspaceTab='all';
    } else state.collections.push(item);
    save(); $('#editor-dialog').close();
    const target = editorMode === 'card' ? `#workspace?focus=${encodeURIComponent(item.id)}` : '#collections';
    if (location.hash === target) { render(); $('#main-content').focus({preventScroll:true}); } else location.hash = target;
    savedToast(editorMode==='card' ? editingCardId ? 'Changes saved.' : 'Card added to My cards.' : 'Collection created.');
  });
  $('#item-title').addEventListener('input',()=>$('#item-title').setCustomValidity(''));
  document.addEventListener('submit', event => {
    if (event.target.id!=='workspace-name-form') return;
    event.preventDefault();
    const name=$('#workspace-name').value.trim();
    if (!name) { $('#workspace-name').setCustomValidity('Please enter a workspace name.'); $('#workspace-name').reportValidity(); return; }
    state.preferences.name=name; save(); applyPreferences(); savedToast('Workspace name saved.');
  });
  document.addEventListener('input',event=>{if(event.target.id==='workspace-name')event.target.setCustomValidity('');});
  $('#confirm-action').addEventListener('click',()=>{const callback=confirmCallback; confirmCallback=null; $('#confirm-dialog').close(); callback?.();});
  $('#confirm-dialog').addEventListener('close',()=>{confirmCallback=null;});
  $('#search-input').addEventListener('input',event=>renderSearch(event.target.value));
  $$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
  document.addEventListener('keydown', event => {
    const typing=event.target.matches('input,textarea,select,[contenteditable="true"]');
    if ((event.key==='/'&&!typing) || ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')) { if (!$('dialog[open]')) {event.preventDefault();openSearch();} }
    const tab = event.target.closest('[role="tab"]');
    if (tab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault(); const siblings=$$('[role="tab"]',tab.parentElement); const index=siblings.indexOf(tab); const next=event.key==='Home'?0:event.key==='End'?siblings.length-1:(index+(event.key==='ArrowRight'?1:-1)+siblings.length)%siblings.length; siblings[next].click();
    }
    if ($('#search-dialog').open) {
      const results=$$('.search-result');
      if (event.key==='ArrowDown'||event.key==='ArrowUp') {event.preventDefault();const index=results.indexOf(document.activeElement);const next=event.key==='ArrowDown'?(index+1)%results.length:(index<=0?results.length-1:index-1);results[next]?.focus();}
      if (event.key==='Enter'&&event.target===$('#search-input')&&results.length) {event.preventDefault();results[0].click();}
    }
  });
  window.addEventListener('hashchange',()=>{if(route().params.has('focus'))workspaceTab='all';render();window.scrollTo(0,0);$('#main-content').focus({preventScroll:true});});
  hydrateIcons(); render();
})();
