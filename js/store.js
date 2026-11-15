/* App state, kept in this browser's localStorage. */
(function () {
  const S = (window.Still = window.Still || {});
  const KEY = 'still.v1';
  const defaults = () => ({
    workspace: 'My workspace',
    cards: [],
    collections: [],
    view: { hero: true, glance: true, activity: true, collections: true, recent: true },
    range: 7,
    intro: true,
    env: null            // 'iss' | 'mars' | 'moon' | 'spacecraft' once chosen; null shows the picker
  });
  const ENV_IDS = ['iss', 'mars', 'moon', 'spacecraft'];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalise(JSON.parse(raw));
    } catch (e) { /* blocked or corrupt: start fresh */ }
    return defaults();
  }

  function normalise(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.view = Object.assign(defaults().view, (s && s.view) || {});
    out.cards = Array.isArray(out.cards) ? out.cards.filter(c => c && c.id && c.title) : [];
    out.collections = Array.isArray(out.collections) ? out.collections.filter(c => c && c.id && c.name) : [];
    if (![7, 14, 30].includes(out.range)) out.range = 7;
    if (typeof out.workspace !== 'string' || !out.workspace.trim()) out.workspace = d.workspace;
    out.intro = out.intro !== false;
    if (!ENV_IDS.includes(out.env)) out.env = null;
    return out;
  }

  let state = load();
  const subs = new Set();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }
  function emit() { subs.forEach(f => f(state)); }

  S.store = {
    get: () => state,
    update(fn) { fn(state); save(); emit(); },
    replace(next) { state = normalise(next); save(); emit(); },
    reset() { state = defaults(); save(); emit(); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); }
  };
})();
