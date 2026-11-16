/* App state. Preferences (the workspace name, the dashboard's panels, the sort, the opening) are kept
   in this browser's localStorage, `still.v1`. Cards are kept with the signed-in person's account in
   Supabase (js/auth.js): loaded once sign-in is known, and saved back a moment after each change.
   The crew's location (`env`) is held here while the page is open but never written to localStorage;
   where it is kept, and for whom, is decided in env.js. */
(function () {
  const S = (window.Still = window.Still || {});
  const Env = window.GuardianEnv;
  const Auth = window.GuardianAuth;
  const KEY = 'still.v1';
  // the dashboard's panels (Customize view); the greeting is always shown
  const PANELS = ['actions', 'where', 'today', 'check'];
  // the order of the cards on My cards: newest first, oldest first, A to Z
  const SORTS = ['new', 'old', 'az'];
  const SAVE_AFTER = 400;                                // ms after the last change
  const RETRY = [1000, 2000, 4000, 8000, 15000, 30000];   // a failed save or load is tried again after these
  const defaults = () => ({
    workspace: 'My workspace',
    cards: [],
    view: { actions: true, where: true, today: true, check: true },
    intro: true,
    sort: 'new',
    env: Env.get()       // 'iss' | 'mars' | 'moon' | 'spacecraft' once chosen; null shows the picker
  });

  // Cards an older version kept in this browser. They are never shown from here: the first time
  // someone signs in to an account that has no cards yet, they move into it, once (loadCards), and
  // leave this browser as soon as the account has them.
  let oldCards = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = normalise(JSON.parse(raw));
        oldCards = s.cards;
        s.cards = [];
        return s;
      }
    } catch (e) { /* blocked or corrupt: start fresh */ }
    return defaults();
  }

  const validCards = list => (Array.isArray(list) ? list.filter(c => c && typeof c === 'object' && c.id && c.title) : []);

  function normalise(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    // only today's panels are kept: a panel is on unless it was switched off, and what an older
    // version saved (hero, glance, activity, collections, recent, range) is dropped
    const saved = (s && s.view) || {};
    out.view = PANELS.reduce((v, k) => { v[k] = saved[k] !== false; return v; }, {});
    delete out.range;
    out.cards = validCards(out.cards);
    // collections are gone: what an older version saved (`collections`, a card's `collectionId`) is left alone and not read
    if (typeof out.workspace !== 'string' || !out.workspace.trim()) out.workspace = d.workspace;
    out.intro = out.intro !== false;
    if (SORTS.indexOf(out.sort) < 0) out.sort = d.sort;
    out.env = Env.get();   // never from the saved state, whatever an old copy of it holds
    return out;
  }

  let state = load();
  const subs = new Set();

  function save() {
    const kept = Object.assign({}, state);
    delete kept.env;
    delete kept.cards;                            // they live with the account
    if (oldCards.length) kept.cards = oldCards;   // still waiting to move into an account
    try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch (e) { /* storage full or blocked */ }
  }
  function emit() { subs.forEach(f => f(state)); }

  /* ---- cards, kept with the account */
  let owner = null;          // whose cards are on screen (a user id), once they have loaded
  let synced = new Map();    // card id -> its body as last saved or loaded (JSON)
  let moving = null;         // ids of old browser cards on their way into the account
  let timer = 0, tries = 0, loadTimer = 0, loadTries = 0, running = null, again = false;
  let syncState = '';        // '' all saved | 'error' a save failed | 'limit' the account is full | 'load' loading failed
  const syncSubs = new Set();
  function setSync(v) { if (v === syncState) return; syncState = v; syncSubs.forEach(f => f(v)); }
  const bodyOf = c => { const b = Object.assign({}, c); delete b.id; return b; };
  const wait = n => RETRY[Math.min(n, RETRY.length - 1)];

  // Sends what changed since the last save: new and changed cards are saved, removed ones deleted.
  // A failure keeps every card on screen and tries again, waiting longer each time.
  function flush() {
    clearTimeout(timer);
    if (!owner) return Promise.resolve();
    if (running) { again = true; return running; }
    const now = new Map(state.cards.map(c => [c.id, JSON.stringify(bodyOf(c))]));
    const put = [], gone = [];
    now.forEach((json, id) => { if (synced.get(id) !== json) put.push({ id: id, json: json }); });
    synced.forEach((json, id) => { if (!now.has(id)) gone.push(id); });
    if (!put.length && !gone.length) { tries = 0; setSync(''); return Promise.resolve(); }
    const who = owner;
    running = Auth.cards.save(put.map(r => ({ id: r.id, body: JSON.parse(r.json) })))
      .then(() => Auth.cards.remove(gone))
      .then(() => {
        if (owner !== who) return;
        put.forEach(r => synced.set(r.id, r.json));
        gone.forEach(id => synced.delete(id));
        tries = 0;
        setSync('');
        if (moving && moving.every(id => synced.has(id))) { moving = null; oldCards = []; save(); }
      }, err => {
        if (owner !== who) return;
        setSync(/card limit/i.test(String((err && err.message) || '')) ? 'limit' : 'error');
        clearTimeout(timer);
        timer = setTimeout(flush, wait(tries++));
      })
      .then(() => { running = null; if (again) { again = false; flush(); } });
    return running;
  }

  // The signed-in person's cards. Cards made on this page before they arrived are kept and saved
  // too. Never rejects: a failure says so and is tried again until it works.
  function loadCards(id) {
    return Auth.cards.list().then(rows => {
      if (Env.user() !== id) return;   // signed out meanwhile
      const mine = validCards(rows.map(r => Object.assign({}, r && r.body, { id: r && r.id })));
      const ids = new Set(mine.map(c => c.id));
      let extra = state.cards.filter(c => !ids.has(c.id));
      if (!mine.length && oldCards.length) {
        const old = oldCards.filter(c => !extra.some(x => x.id === c.id));
        moving = old.map(c => c.id);
        extra = extra.concat(old);
      }
      synced = new Map(mine.map(c => [c.id, JSON.stringify(bodyOf(c))]));
      state.cards = mine.concat(extra);
      owner = id;
      loadTries = 0;
      setSync('');
      if (extra.length) flush();
    }, () => new Promise(resolve => {
      setSync('load');
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => resolve(loadCards(id)), wait(loadTries++));
    }));
  }

  S.store = {
    get: () => state,
    update(fn) {
      const was = state.env;
      fn(state);
      if (!Env.ids.includes(state.env)) state.env = was;
      if (state.env !== was) Env.choose(state.env);
      save(); emit();
      if (owner) { clearTimeout(timer); timer = setTimeout(flush, SAVE_AFTER); }
    },
    reset() { state = defaults(); save(); emit(); if (owner) flush(); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    /** Saves card changes now instead of a moment later. Resolves when the attempt is over. */
    flush,
    /** '' when every card is saved, else 'error', 'limit' or 'load'. */
    sync: () => syncState,
    onSync(f) { syncSubs.add(f); return () => syncSubs.delete(f); }
  };

  // unsaved changes go before the session ends, or the page is left
  Auth.beforeSignOut(flush);
  Auth.onChange((user, event) => { if (event === 'SIGNED_OUT') { owner = null; clearTimeout(timer); clearTimeout(loadTimer); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // A saved location and the cards come back only for a signed-in user, so the page has to learn who
  // is here before it shows the picker. `account` settles when that is known, or after 1.5 s without
  // an answer, which counts as signed out; a late answer is still applied when it arrives. The cards
  // are waited for briefly, so the page is drawn once with them; if they are slow it is drawn again.
  const answered = Env.whoAmI().then(id => {
    const env = Env.account(id);
    const restored = !!env && env !== state.env;
    if (restored) state.env = env;
    if (!id) { if (restored) emit(); return; }
    let shown = false;
    const loaded = loadCards(id).then(() => { if (shown) emit(); });
    return Promise.race([loaded, new Promise(r => setTimeout(r, 1200))]).then(() => { shown = true; emit(); });
  });
  S.store.account = Promise.race([answered, new Promise(r => setTimeout(r, 1500))]);
})();
