// Drives a headless Chrome/Edge over the DevTools protocol and checks the intro, navigation,
// the add-card flow, where the crew's location is kept, and the layout at desktop, tablet and phone sizes.
// Usage: node tools/check.mjs        (screenshots land in tools/shots)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tools', 'shots');
fs.mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The site is served the way the web app serves it, at /home/, with stand-ins for Supabase and the health assistant's API.
// Supabase is never reached: before any of the page's own scripts run, the page gets a stand-in
// `window.supabase.createClient` (supabaseStandIn below, installed in openTab) whose calls come to /__supabase/ here.
// Users, sessions and cards are kept in memory in `sb`, and each call reaches only the rows of the user its access
// token belongs to, as row level security does. `account.user` is who is signed in in this browser (the session the
// real client keeps in localStorage); `account.delay` holds back the answer to "who is signed in?", for the checks
// on what shows while the page does not know yet. `sb.failSaves` makes the next card saves fail.
// /api/nasa/radiation: NOAA's storm level, counting how often it was asked for, and with which token.
// Other /api calls get 404. The sign-in page belongs to the health app; a stand-in answers at its address, with the
// shared sign-in script (js/auth.js) loaded, so a check can sign up there as the real page does.
const account = { user: null, delay: 0 };
const radiation = { sScale: 0, asked: 0, auth: '' };
const site = path.resolve(root, '..');
const VENDOR = fs.readdirSync(path.join(root, 'vendor')).find(f => /^supabase-js-.+\.js$/.test(f));
const sb = { users: new Map(), tokens: new Map(), cards: new Map(), signUps: 0, failSaves: 0 };
const emailOf = id => (sb.users.get(id) || {}).email || id + '@crew.test';
function sessionFor(id) {
  const token = 'stub-token-' + id;
  sb.tokens.set(token, id);
  return { access_token: token, token_type: 'bearer', user: { id, email: emailOf(id) } };
}
const sbFail = (status, code, message) => ({ status, body: { error: { status, code, message } } });
function supabaseAnswer(op, input, token) {
  const me = sb.tokens.get(token) || null;
  if (op === 'session') return { body: { session: account.user ? sessionFor(account.user) : null } };
  if (op === 'signup' || op === 'signin') {
    const email = String(input.email || '').trim().toLowerCase(), password = String(input.password || '');
    let id = [...sb.users.keys()].find(k => sb.users.get(k).email === email);
    if (op === 'signup') {
      sb.signUps++;
      if (password.length < 8) return sbFail(422, 'weak_password', 'Password should be at least 8 characters.');
      if (id) return sbFail(422, 'user_already_exists', 'User already registered');
      id = crypto.randomUUID();
      sb.users.set(id, { email, password });
    } else if (!id || sb.users.get(id).password !== password) return sbFail(400, 'invalid_credentials', 'Invalid login credentials');
    account.user = id;
    return { body: { session: sessionFor(id) } };
  }
  if (op === 'signout') { account.user = null; return { body: {} }; }
  if (op === 'rpc') {
    if (input.fn !== 'delete_my_account' || !me) return sbFail(401, '42501', 'permission denied');
    sb.users.delete(me); sb.cards.delete(me);
    for (const [t, id] of sb.tokens) if (id === me) sb.tokens.delete(t);
    return { body: { data: null } };
  }
  if (op === 'rest' && input.table === 'cards') {
    const mine = me ? (sb.cards.get(me) || sb.cards.set(me, new Map()).get(me)) : new Map();
    const filters = input.filters || [];
    const hit = id => filters.every(([col, how, val]) => { const v = col === 'user_id' ? me : id; return how === 'eq' ? v === val : how === 'in' ? val.includes(v) : false; });
    if (input.action === 'select') return { body: { data: [...mine].filter(([id]) => hit(id)).map(([id, body]) => ({ id, body })) } };
    if (input.action === 'upsert') {
      if (sb.failSaves > 0) { sb.failSaves--; return sbFail(503, '503', 'Service Unavailable'); }
      const rows = input.rows || [];
      if (!me || rows.some(r => r.user_id !== undefined && r.user_id !== me)) return sbFail(403, '42501', 'new row violates row-level security policy for table "cards"');
      if (rows.some(r => typeof r.id !== 'string' || !r.id.length || r.id.length > 64 || !r.body || typeof r.body !== 'object' || Array.isArray(r.body))) return sbFail(400, '23514', 'new row violates check constraint');
      if (new Set([...mine.keys(), ...rows.map(r => r.id)]).size > 500) return sbFail(400, 'P0001', 'card limit reached');
      rows.forEach(r => mine.set(r.id, JSON.parse(JSON.stringify(r.body))));
      return { status: 201, body: { data: null } };
    }
    if (input.action === 'delete') {
      if (!filters.length) return sbFail(400, '21000', 'DELETE requires a WHERE clause');
      [...mine.keys()].filter(hit).forEach(id => mine.delete(id));
      return { body: { data: null } };
    }
  }
  return sbFail(404, 'not_found', 'not found');
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/__supabase/')) {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let input = {};
      try { input = JSON.parse(raw || '{}'); } catch (e) { /* no body */ }
      const op = pathname.slice('/__supabase/'.length), token = (/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1] || '';
      setTimeout(() => {
        const r = supabaseAnswer(op, input, token);
        res.writeHead(r.status || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(r.body));
      }, op === 'session' ? account.delay : 0);
    });
    return;
  }
  if (pathname.startsWith('/api/')) {
    let status = 404, body = { error: 'not_found' };
    if (pathname === '/api/nasa/radiation') { radiation.asked++; radiation.auth = req.headers.authorization || ''; status = 200; body = { data: { sScale: radiation.sScale, sText: 'none', flux10MeV: 0.4, observedAt: null, series: [] } }; }
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }
  // a stand-in for the health app's sign-in page, which this check does not serve: enough to see that a visitor was sent there
  if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(`<!doctype html><title>Sign in (stand-in)</title><p>Sign-in page stand-in.</p><script src="/home/vendor/${VENDOR}"></script><script src="/home/js/auth.js"></script>`); return; }
  const file = path.join(site, pathname);
  if (!file.startsWith(site)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/home/index.html`;

const exe = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
if (!exe) { console.error('No Chrome or Edge found; set CHROME_PATH.'); process.exit(2); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'still-check-'));
const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

function cleanup() {
  try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill('SIGKILL'); } catch {}
  for (let i = 0; i < 20; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},200)']); } }
}
process.on('exit', cleanup);

let port;
for (let i = 0; i < 100 && !port; i++) {
  try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { await sleep(100); }
}
if (!port) { console.error('Browser did not start'); process.exit(2); }
let ws, tab, nextId = 0;
const pending = new Map(), handlers = {};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const on = (method, f) => (handlers[method] = handlers[method] || []).push(f);

// The page's stand-in for supabase-js: the calls the site makes (js/auth.js), shaped like the real ones' answers,
// and answered by this server (supabaseAnswer above). Installed before the page's scripts; the vendored client
// loads after it and cannot replace it.
function supabaseStandIn() {
  const call = (op, input, token) => fetch('/__supabase/' + op, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(input || {})
  }).then(r => r.json());
  const authError = e => Object.assign(new Error(e.message), { name: 'AuthApiError', status: e.status, code: e.code });
  function createClient() {
    let session = null;
    const listeners = new Set();
    const tell = event => listeners.forEach(f => setTimeout(() => f(event, session), 0));
    const getSession = () => call('session').then(j => { session = j.session; return { data: { session }, error: null }; });
    const token = () => (session ? Promise.resolve(session.access_token) : getSession().then(r => r.data.session && r.data.session.access_token));
    const signIn = op => creds => call(op, creds).then(j => {
      if (j.error) return { data: { user: null, session: null }, error: authError(j.error) };
      session = j.session;
      tell('SIGNED_IN');
      return { data: { user: session.user, session }, error: null };
    });
    function from(table) {
      const q = { table, action: 'select', rows: null, filters: [] };
      const b = {
        select() { q.action = 'select'; return b; },
        upsert(rows) { q.action = 'upsert'; q.rows = [].concat(rows); return b; },
        delete() { q.action = 'delete'; return b; },
        eq(col, val) { q.filters.push([col, 'eq', val]); return b; },
        in(col, vals) { q.filters.push([col, 'in', vals]); return b; },
        then(ok, bad) {
          return token().then(t => call('rest', q, t))
            .then(j => (j.error ? { data: null, error: Object.assign(new Error(j.error.message), j.error) } : { data: j.data, error: null }))
            .then(ok, bad);
        }
      };
      return b;
    }
    return {
      auth: {
        getSession,
        signUp: signIn('signup'),
        signInWithPassword: signIn('signin'),
        signOut: () => call('signout').then(() => { session = null; tell('SIGNED_OUT'); return { error: null }; }),
        onAuthStateChange(f) { listeners.add(f); return { data: { subscription: { unsubscribe: () => listeners.delete(f) } } }; }
      },
      from,
      rpc: (fn, args) => token().then(t => call('rpc', { fn, args }, t)).then(j => (j.error ? { data: null, error: j.error } : { data: j.data, error: null }))
    };
  }
  const standIn = { createClient };
  Object.defineProperty(window, 'supabase', { configurable: false, enumerable: true, get: () => standIn, set: () => {} });
}

// Opens a tab and drives that one from here on, closing the one before it. A new tab in the same browser
// profile has the same localStorage and an empty sessionStorage: to the site, a new visit.
async function openTab() {
  const before = tab;
  tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  if (ws) ws.close();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method && handlers[m.method]) handlers[m.method].forEach(f => f(m.params));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${supabaseStandIn})();` });
  // keep the tab "visible" so the browser never throttles timers or pauses animation frames
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.bringToFront');
  if (before) await fetch(`http://127.0.0.1:${port}/json/close/${before.id}`).catch(() => {});
}

const errors = [];
on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' ')); });
await openTab();

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expr, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(50); }
  throw new Error('Timed out waiting for: ' + expr);
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}
async function load(url) {
  const loaded = new Promise(r => { const f = () => r(); on('Page.loadEventFired', f); });
  await send('Page.bringToFront');
  await send('Page.navigate', { url });
  await Promise.race([loaded, sleep(8000)]);
}
async function reload() {
  const loaded = new Promise(r => { const f = () => r(); on('Page.loadEventFired', f); });
  await send('Page.reload');
  await Promise.race([loaded, sleep(8000)]);
}
// a new visit: a fresh tab (see openTab), at the desktop size
async function newVisit() {
  await openTab();
  await viewport(1440, 900);
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function fullShot(name) {
  const h = await ev('Math.ceil(document.documentElement.scrollHeight)');
  const w = await ev('innerWidth');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function rect(sel) {
  return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
}
async function click(sel) {
  const r = await rect(sel);
  if (!r) throw new Error('No element: ' + sel);
  await clickAt(r.cx, r.cy);
}
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function type(text) { await send('Input.insertText', { text }); }
// a real key press, as a keyboard sends it: Tab moves the focus, Enter and Space press what holds it
const KEYS = { Tab: { code: 'Tab', vk: 9 }, Enter: { code: 'Enter', vk: 13, text: '\r' }, ' ': { code: 'Space', vk: 32, text: ' ' }, Escape: { code: 'Escape', vk: 27 }, ArrowDown: { code: 'ArrowDown', vk: 40 }, ArrowUp: { code: 'ArrowUp', vk: 38 } };
async function press(key) {
  const k = KEYS[key], base = { key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
  await send('Input.dispatchKeyEvent', Object.assign({ type: k.text ? 'keyDown' : 'rawKeyDown', text: k.text }, base));
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
}
const mouseAway = () => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
// Where the location may be: this visit's is in sessionStorage; localStorage holds one only per signed-in account.
const VISIT = `sessionStorage.getItem('guardian.env')`;
const SAVED_KEYS = `Object.keys(localStorage).filter(k => k.indexOf('guardian.env') === 0).sort().join()`;
const NOT_IN_STATE = `!('env' in JSON.parse(localStorage.getItem('still.v1') || '{}'))`;
const NOTHING_SAVED = `${NOT_IN_STATE} && ${SAVED_KEYS} === ''`;
// The dashboard greets by time of day, so it is known by its address and its greeting, not a fixed title.
const ON_DASH = `location.hash === '#/dashboard' && !!document.querySelector('.dash') && /^Good (morning|afternoon|evening)$/.test(document.querySelector('h1').textContent)`;
const PILL = name => `document.querySelector('#envPill').textContent.trim() === '${name}'`;
// Signed out, everything past the home page leads here (the health app's sign-in page).
const AT_SIGN_IN = `location.pathname === '/' && location.hash === '#/sign-in'`;
const reached = expr => waitFor(expr, 6000).then(() => true, () => false);
// waits for something on this side (the stand-in Supabase) to come true
const until = async (f, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await sleep(50); } return !!f(); };
// waits until the page knows who is signed in
const settle = async () => { await ev('Still.store.account.then(() => true)'); await sleep(150); };
const open = async url => { await load(url); await settle(); };
const DASH = pageUrl + '#/dashboard';
// the three small sky animations: one of each inside the backdrop, and whether they are showing
const SKY = shown => `(() => { const all = ['.sky-pass', '.sky-chute', '.sky-rocket'].map(c => [...document.querySelectorAll('#scenery ' + c)]); return all.every(l => l.length === 1 && (${shown} ? getComputedStyle(l[0]).display !== 'none' && getComputedStyle(l[0]).animationName !== 'none' : getComputedStyle(l[0]).display === 'none')); })()`;

try {
  /* ---------------- desktop: the intro, held so each stage can be looked at */
  // Windows "Animation effects" off makes the browser report reduced motion; test the full intro explicitly
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await viewport(1440, 900);
  await load(pageUrl + '?hold=1');
  await ev('localStorage.clear()');
  await load(pageUrl + '?hold=1');
  await sleep(900);
  await shot('01-loading');
  const m1 = await rect('.mark-flip');
  const cover = await ev(`(() => { const l = document.getElementById('loader'); const r = l.getBoundingClientRect(); return { op: getComputedStyle(l).opacity, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, cw: document.documentElement.clientWidth }; })()`);
  check('Loader says the assistant is getting ready', await ev(`document.querySelector('.loader__caption').textContent.trim() === 'Your assistant is getting ready'`));
  check('Loader covers the screen',cover.op === '1' && cover.w >= cover.iw && cover.h >= cover.ih, JSON.stringify(cover));
  check('Planet and ship sit in the exact centre', near(m1.cx, 720, 1.5) && near(m1.cy, 450, 1.5), `centre ${m1.cx.toFixed(1)}, ${m1.cy.toFixed(1)}`);
  const th1 = await ev('Still.mark.theta');
  await sleep(700);
  const th2 = await ev('Still.mark.theta');
  check('Ship keeps orbiting while loading', th2 - th1 > 0.6, `moved ${(th2 - th1).toFixed(2)} rad in 0.7 s`);
  await shot('02-loading-orbit');
  check('App is not interactive under the loader', await ev(`document.getElementById('main').inert && document.getElementById('topbar').inert`));
  const marsCard = await rect('.env-card[data-env=mars]');
  await clickAt(marsCard.cx, marsCard.cy);
  await sleep(150);
  check('A click during loading does nothing', await ev(`location.hash === '' && !${VISIT} && ${NOTHING_SAVED} && !document.querySelector('.modal') && !document.querySelector('.env-card.is-selected')`));

  await ev('Still.releaseIntro()');
  await sleep(380); await shot('03-reveal-start');
  await sleep(450); await shot('04-reveal-mid');
  await sleep(450); await shot('05-reveal-late');
  await waitFor('Still.introDone === true', 12000);
  await sleep(250);
  await shot('06-first-open');
  const t = await ev('Still.introTiming');
  const dur = t.done - t.ready;
  check('Reveal and logo move take 1.5 to 2 s', dur >= 1500 && dur <= 2100, `${Math.round(dur)} ms`);
  check('Ship orbits for at least 3 s first', t.ready - t.start >= 2950, `${Math.round(t.ready - t.start)} ms`);
  const fr = (t.frames || []).slice().sort((a, b) => a - b);
  if (fr.length) console.log(`      frames during transition: ${fr.length}, median ${fr[fr.length >> 1].toFixed(1)} ms, p95 ${fr[Math.floor(fr.length * 0.95)].toFixed(1)} ms (headless software rendering)`);
  const slot = await rect('#brandSlot'), m2 = await rect('.mark-flip');
  check('Mark lands exactly in the header slot', near(slot.x, m2.x, 0.5) && near(slot.y, m2.y, 0.5) && near(slot.w, m2.w, 0.5), `slot ${slot.x},${slot.y} mark ${m2.x.toFixed(1)},${m2.y.toFixed(1)}`);
  check('Same element moved (one mark in the page)', await ev(`document.querySelectorAll('.mark').length === 1`));
  check('Ship parked at the logo pose', await ev(`Math.abs(Still.mark.theta - 0.42) < 1e-6`));
  check('Loader removed, app interactive', await ev(`!document.getElementById('loader') && !document.getElementById('main').inert && !document.documentElement.classList.contains('intro-active')`));
  check('Logo uses day colours', await ev(`document.querySelector('.mark').classList.contains('is-day')`));
  check('Guardian brand: emblem, wordmark and title', await ev(`document.querySelector('.brand__name').textContent === 'GUARDIAN' && document.title.endsWith('· Guardian') && getComputedStyle(document.querySelector('.mark__emblem--navy')).opacity === '1'`));
  check('Ship has landed into the emblem', await ev(`getComputedStyle(document.querySelector('.mark__ship')).opacity === '0'`));

  /* ---------------- the location is asked first, before anything else is shown */
  check('First open asks where the crew is, before the home page', await ev(`location.hash === '' && document.querySelector('h1').textContent === 'Where is your crew?' && !document.querySelector('.dash, .home-env')`));
  check('Until then the header shows only the logo', await ev(`getComputedStyle(document.querySelector('.nav')).display === 'none' && getComputedStyle(document.querySelector('.land-nav')).display === 'none' && getComputedStyle(document.querySelector('.topbar__actions')).display === 'none'`));
  check('Four environments in order: ISS, Mars, Moon, Spacecraft', await ev(`[...document.querySelectorAll('.env-card')].map(c => c.dataset.env).join() === 'iss,mars,moon,spacecraft'`));
  check('Every photo loaded', await ev(`[...document.querySelectorAll('.env-card img')].every(i => i.complete && i.naturalWidth >= 1200)`));
  check('Each photo sits above its name and text', await ev(`[...document.querySelectorAll('.env-card')].every(c => c.querySelector('.env-card__media').getBoundingClientRect().bottom <= c.querySelector('.env-card__name').getBoundingClientRect().top)`));
  check('Photos share one rounded radius', await ev(`new Set([...document.querySelectorAll('.env-card__media')].map(m => getComputedStyle(m).borderRadius)).size === 1 && parseFloat(getComputedStyle(document.querySelector('.env-card__media')).borderRadius) >= 10`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 890 }); // off the cards, so no hover lift
  await sleep(400);
  const tops = await ev(`[...document.querySelectorAll('.env-card')].map(c => Math.round(c.getBoundingClientRect().top))`);
  const gaps = await ev(`(() => { const r = [...document.querySelectorAll('.env-card')].map(c => c.getBoundingClientRect()); return r.slice(1).map((x, i) => Math.round(x.left - r[i].right)); })()`);
  check('Cards evenly spaced in one row', new Set(tops).size === 1 && new Set(gaps).size === 1, `gaps ${gaps}`);
  check('Continue is disabled until a choice', await ev(`document.querySelector('.env__actions [type=submit]').disabled`));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  await sleep(150);
  check('Search shortcut is off until a choice', await ev(`!document.querySelector('.modal')`));
  await shot('06-picker');
  await ev(`location.hash = '#/'`);
  await sleep(200);
  check('On the way in to the home page the button just says Continue', await ev(`document.querySelector('.env__actions [type=submit]').textContent.trim() === 'Continue'`));
  await click('.env-card[data-env=mars]');
  await sleep(350);
  await sleep(250);
  const sel = await ev(`(() => { const s = [...document.querySelectorAll('.env-card.is-selected')]; return { n: s.length, env: s[0] && s[0].dataset.env, checked: !!(s[0] && s[0].querySelector('input').checked), halo: s[0] ? getComputedStyle(s[0]).boxShadow.split('rgba').length > 3 : false }; })()`);
  check('Whole card selects, with a glowing halo', sel.n === 1 && sel.env === 'mars' && sel.checked && sel.halo, JSON.stringify(sel));
  check('Cards show only the photo and the title', await ev(`[...document.querySelectorAll('.env-card__body')].every(b => b.children.length === 1 && b.firstElementChild.classList.contains('env-card__name'))`));
  check('Continue enabled after a choice', await ev(`!document.querySelector('.env__actions [type=submit]').disabled`));
  await shot('06b-picker-selected');
  await click('.env__actions [type=submit]');
  await sleep(900);
  check('Continue carries on to the home page that was opened', await ev(`(location.hash === '' || location.hash === '#/') && document.querySelector('h1').textContent.startsWith('Watching over the crew') && !document.querySelector('.dash, .env-card')`));
  check('Signed out: the choice is kept for this visit and nothing is saved', await ev(`${VISIT} === 'mars' && ${NOTHING_SAVED}`));
  check('Home header: logo, section links and Launch, no app nav', await ev(`getComputedStyle(document.querySelector('.topbar__glass')).opacity === '1' && getComputedStyle(document.querySelector('.nav')).display === 'none' && getComputedStyle(document.querySelector('.land-nav')).display === 'flex' && getComputedStyle(document.querySelector('#landLaunch')).opacity === '1'`));
  check('Home header links read Environments, The Challenge, How It Works', await ev(`[...document.querySelectorAll('.land-nav__link')].map(b => b.textContent.trim()).join() === 'Environments,The Challenge,How It Works'`));
  check('Signed out: the green button reads Sign in or sign up, and nothing says Add card', await ev(`document.querySelector('#landLaunch .lg').textContent === 'Sign in or sign up' && document.querySelector('#landLaunch').getAttribute('aria-label') === 'Sign in or sign up' && document.querySelector('#acct .acct__in .lg').textContent === 'Sign in or sign up' && document.querySelector('#acct .acct__in').getAttribute('href') === '/#/sign-in' && !document.querySelector('.acct__chip, .btn--add') && !/Add card/.test(document.querySelector('#topbar').textContent)`));
  check('Sky animations run on the home page', await ev(SKY(true)));
  check('Home tells the story: environments, the five hazards, how it works, a final call', await ev(`document.querySelectorAll('.home-env').length === 4 && document.querySelectorAll('.hazard').length === 5 && !!document.getElementById('how') && !!document.querySelector('.home-final [data-action=launch]')`));
  check('Home body text is at least 14px and the lead 16px+', await ev(`parseFloat(getComputedStyle(document.querySelector('.home-lead')).fontSize) >= 16 && [...document.querySelectorAll('.hazard__text, .home-env__line, .steps p')].every(p => parseFloat(getComputedStyle(p).fontSize) >= 14)`));
  await fullShot('05b-home-full');
  await click('.land-nav__link[data-target="how"]');
  await sleep(900);
  check('Section link scrolls to How it works', await ev(`Math.abs(document.getElementById('how').getBoundingClientRect().top - 100) < 40`));
  await sleep(1200);
  check('Home blocks ease in once scrolled to, and stay shown', await ev(`[...document.querySelectorAll('.home-how__text, .steps > li')].every(el => getComputedStyle(el).opacity === '1' && !el.classList.contains('rv')) && [...document.querySelectorAll('.home-kicker, .home-title, .home-lead, .home-ctas')].every(el => getComputedStyle(el).opacity === '1')`));
  await shot('05d-home-how');
  await ev(`document.querySelector('.home-final').scrollIntoView({ block: 'center' })`);
  await sleep(1400);
  await shot('05c-home-final');
  check('Closing panel draws its sky: stars and a galaxy', await ev(`(() => { const c = document.querySelector('.home-final__sky'); if (!c || !c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 388) if (d[i] > 24) lit++; return lit > 60; })()`));
  await ev('window.scrollTo(0, 0)');
  await sleep(200);
  await click('#landLaunch');
  check('Signed out: Launch goes to the sign-in page, not the dashboard', await reached(AT_SIGN_IN), await ev('location.href'));

  /* ---------------- signed in: signing in or up lands on the dashboard (the health app sends everyone there) */
  account.user = 'u0';
  await load(DASH);
  await waitFor('Still.introDone === true', 15000);
  await settle();
  await mouseAway();
  await sleep(1600); // the dashboard's blocks arrive one after another
  check('Signed in: the dashboard opens, and the location is not asked again', await ev(ON_DASH));
  check('Nav and actions appear after the choice', await ev(`getComputedStyle(document.querySelector('.nav')).display !== 'none' && getComputedStyle(document.querySelector('.nav')).opacity === '1'`));
  check('Header pill and greeting name the location', await ev(`${PILL('Mars')} && document.querySelector('.dash-where__name').textContent === 'Mars'`));

  /* ---------------- the top bar */
  check('Top bar: Dashboard, Hazards, Triage, Vitals, Cards, More (Citations, Settings)', await ev(`[...document.querySelectorAll('#nav > .nav__link, #nav > .nav__menu > summary')].map(a => a.textContent.replace(/\\d+$/, '').trim()).join() === 'Dashboard,Hazards,Triage,Vitals,Cards,More' && [...document.querySelectorAll('#nav .nav__item')].map(a => a.textContent.trim()).join() === 'Citations,Settings'`), await ev(`[...document.querySelectorAll('#nav > .nav__link, #nav > .nav__menu > summary')].map(a => a.textContent.trim()).join()`));
  check('No Collections, Card library, Sources, Privacy, Lab Baseline or Overlay link', await ev(`!/Collections|Card library|Sources|Privacy|Lab Baseline|Overlay/.test(document.querySelector('#nav').textContent) && document.querySelector('#nav [data-nav=cards]').getAttribute('href') === '#/cards'`));
  check('Signed in: the bar shows the account chip with the email, never Add card', await ev(`document.querySelector('#acct .acct__email').textContent === 'u0@crew.test' && document.querySelector('#acct .acct__initial').textContent === 'U' && !document.querySelector('#acct .acct__in, .btn--add') && !/Add card/.test(document.querySelector('#topbar').textContent)`));
  await click('#acct .acct__chip');
  await sleep(250);
  check('The account chip opens a menu: Your account and data, Sign out', await ev(`document.querySelector('.acct__menu').open && [...document.querySelectorAll('.acct__panel .nav__item')].map(a => a.textContent.trim() + '>' + (a.getAttribute('href') || a.dataset.acct)).join() === 'Your account and data>/#/privacy,Sign out>sign-out'`));
  await press('Escape');
  await sleep(150);
  check('Escape closes the account menu', await ev(`!document.querySelector('.acct__menu').open`));

  /* ---------------- the dashboard: a greeting, four things to do, where the crew is, and today */
  check('Dashboard greets by time of day, with the location and the date under it', await ev(`/^Good (morning|afternoon|evening)$/.test(document.querySelector('h1.dash-title').textContent) && /^The crew is on Mars·/.test(document.querySelector('.dash-sub').textContent) && !!document.querySelector('.dash-sub time[datetime]') && !!document.querySelector('.dash-head [data-action=customize]')`), await ev(`document.querySelector('.dash-sub').textContent`));
  check('Four action tiles, each leading where it says', await ev(`[...document.querySelectorAll('.dash-tile')].map(t => t.dataset.tile + '>' + (t.getAttribute('href') || t.dataset.action + ':' + t.dataset.id)).join() === 'log>use-template:crew-health,check>/#/assessment,binder>#/cards,hazards>/#/space'`));
  check('Each tile is one whole link or button, with a name and one plain line', await ev(`[...document.querySelectorAll('.dash-tile')].every(t => (t.tagName === 'A' || t.tagName === 'BUTTON') && t.tabIndex === 0 && !t.querySelector('a, button') && document.getElementById(t.getAttribute('aria-labelledby')).textContent.length > 3 && document.getElementById(t.getAttribute('aria-describedby')).textContent.length > 10 && !!t.querySelector('.chip-icon svg'))`));
  check('The old dashboard is gone: no metrics, chart, recent table, collections or summary', await ev(`!document.querySelector('.hero, .glance, .metric, .chart, .recent, .table, .col-list, .summary, .section-label')`));
  check('Vital signs are never shown on the dashboard', await ev(`!/heart rate|blood oxygen|breathing rate|bpm|SpO/i.test(document.querySelector('.dash').textContent)`));
  check('Dashboard blocks have arrived and stay shown', await ev(`[...document.querySelectorAll('.dash-head, .dash-h2, .dash-tile, .dash-where, .dash-strip')].every(el => getComputedStyle(el).opacity === '1' && !el.classList.contains('rv'))`));
  check('Dashboard has no sideways scroll', await ev(`document.documentElement.scrollWidth <= innerWidth`));
  check('Sky animations run on the dashboard too: one craft, one capsule, one rocket', await ev(`${SKY(true)} && !document.documentElement.classList.contains('is-landing')`));
  await reached(`/Space weather is quiet/.test(document.querySelector('#dashToday').textContent)`);
  check('The page fits one laptop screen: Today ends above the fold at 1440 x 900', await ev(`document.querySelector('.dash-strip').getBoundingClientRect().bottom + scrollY <= 900`), await ev(`Math.round(document.querySelector('.dash-strip').getBoundingClientRect().bottom + scrollY) + ' px'`));
  check('Today: a line of space weather from NOAA, asked for once, and no last entry yet', await ev(`/Space weather is quiet/.test(document.querySelector('#dashToday').textContent) && /NOAA/.test(document.querySelector('#dashToday').textContent) && !document.querySelector('.dash-strip__last') && !/Sign in/.test(document.querySelector('.dash-strip').textContent)`) && radiation.asked === 1, `asked ${radiation.asked} time(s)`);
  await ev(`document.activeElement && document.activeElement.blur()`);
  check('Today’s check: no vitals yet today, the ring open, no days in a row, and a button to log them now', await ev(`(() => { const p = document.querySelector('.dash-check'); if (!p) return false; const b = p.querySelector('.dash-check__go'); return p.querySelector('h2').textContent === 'Today’s check' && p.querySelector('.dash-check__state').textContent === 'No vitals logged yet today' && p.querySelector('.dash-check__streak').textContent === '0 days in a row' && !p.querySelector('.dash-ring.is-done') && p.querySelector('.dash-ring b').textContent === '0' && p.querySelector('.dash-ring').getAttribute('aria-hidden') === 'true' && !!b && b.dataset.action === 'use-template' && b.dataset.id === 'crew-health' && /Log vitals now/.test(b.textContent); })()`));
  check('Today’s check sits beside Where the crew is', await ev(`(() => { const w = document.querySelector('.dash-where').getBoundingClientRect(), c = document.querySelector('.dash-check').getBoundingClientRect(); return Math.abs(w.top - c.top) < 1 && c.left > w.right && c.right <= innerWidth; })()`));
  await fullShot('20-dashboard');

  // the pointer: the tile under it comes forward and lights up, the others step back
  const tile = await rect('.dash-tile[data-tile=check]');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tile.cx - 30, y: tile.cy - 20 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tile.cx, y: tile.cy });
  await sleep(650);
  check('The tile under the pointer comes forward with a light that follows it; the others step back', await ev(`(() => { const t = document.querySelector('.dash-tile[data-tile=check]'), o = document.querySelector('.dash-tile[data-tile=log]'); return t.style.getPropertyValue('--mx') !== '' && t.style.getPropertyValue('--rx') !== '' && getComputedStyle(t, '::after').opacity === '1' && getComputedStyle(t).transform !== 'none' && parseFloat(getComputedStyle(o).opacity) < 1; })()`));
  check('Each tile’s icon makes its own move: the heart beats on Check a crew member', await ev(`getComputedStyle(document.querySelector('.dash-tile[data-tile=check] .chip-icon .i')).animationName === 'dash-beat' && getComputedStyle(document.querySelector('.dash-tile[data-tile=log] .chip-icon path')).animationName === 'none'`));
  check('A press on a tile answers at once with a soft ring that takes no clicks', await ev(`(() => { const t = document.querySelector('.dash-tile[data-tile=log]'), r = t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 30, clientY: r.top + 30 })); const d = t.querySelector('.dash-press'); return !!d && getComputedStyle(d).pointerEvents === 'none' && getComputedStyle(d).animationName === 'dash-press'; })()`));
  check('Tile words stay above the light', await ev(`(() => { const t = document.querySelector('.dash-tile[data-tile=check]'); return getComputedStyle(t, '::after').zIndex === '0' && [...t.children].every(c => getComputedStyle(c).zIndex === '1'); })()`));
  await mouseAway();
  await sleep(500);

  // the keyboard: Tab reaches a tile, the focus shows, Enter uses it
  await ev(`document.querySelector('.dash-head [data-action=customize]').focus()`);
  await press('Tab');
  check('Keyboard: Tab reaches the first tile, with a visible focus ring', await ev(`document.activeElement.matches('.dash-tile[data-tile=log]:focus-visible') && getComputedStyle(document.activeElement).outlineStyle === 'solid' && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2`));
  await press('Enter');
  await reached(`!!document.querySelector('#cardForm')`);
  check('Log vitals opens the add-card form on the crew health template', await ev(`!!document.querySelector('#cardForm') && document.querySelector('#f-title').value === 'Crew health: ' && document.querySelector('#f-type').value === 'observation'`));
  await press('Escape');
  await sleep(300);

  // where the crew is: the switch changes the location in place, through the store
  check('Where the crew is: the photo, the name, one line and the four locations', await ev(`(() => { const p = document.querySelector('.dash-where'), img = p.querySelector('.dash-where__media img'); return img.complete && img.naturalWidth >= 1200 && img.alt.length > 10 && p.querySelector('.dash-where__line').textContent.length > 20 && [...p.querySelectorAll('.dash-seg__btn')].map(b => b.dataset.env + ':' + b.getAttribute('aria-pressed')).join() === 'iss:false,mars:true,moon:false,spacecraft:false'; })()`));
  await ev(`document.querySelector('.dash-where').scrollIntoView({ block: 'center' })`);
  await sleep(150);
  await click('.dash-seg__btn[data-env=moon]');
  await sleep(900);
  check('The location switch changes the location in place', await ev(`${ON_DASH} && ${VISIT} === 'moon' && ${PILL('Moon')} && document.querySelector('.dash-where__name').textContent === 'Moon' && document.querySelector('.dash-seg__btn[aria-pressed=true]').dataset.env === 'moon' && document.activeElement === document.querySelector('.dash-seg__btn[data-env=moon]') && /on the Moon/.test(document.querySelector('.dash-sub').textContent)`));
  check('Signed in: the switch saves the location for the account, not in the shared state', await ev(`localStorage.getItem('guardian.env.u0') === 'moon' && ${NOT_IN_STATE}`));
  await ev(`document.querySelector('.dash-seg__btn[data-env=mars]').focus()`);
  await press(' ');
  await sleep(900);
  check('The location switch works from the keyboard', await ev(`${VISIT} === 'mars' && document.querySelector('.dash-where__name').textContent === 'Mars' && !document.querySelector('.dash-where__ghost')`));

  /* ---------------- customize view: a live picture of the dashboard, and switches */
  await ev('window.scrollTo(0, 0)');
  await sleep(150);
  await click('.dash-head [data-action=customize]');
  await reached(`!!document.querySelector('.cz')`);
  await sleep(350);
  check('Customize view: one labelled switch per panel, all on', await ev(`(() => { const sw = [...document.querySelectorAll('.cz .sw')]; return sw.map(b => b.dataset.key).join() === 'actions,where,today,check' &&sw.every(b => b.tagName === 'BUTTON' && b.getAttribute('role') === 'switch' && b.getAttribute('aria-checked') === 'true' && document.getElementById(b.getAttribute('aria-labelledby')).textContent.length > 3 && document.getElementById(b.getAttribute('aria-describedby')).textContent.length > 10) && document.querySelectorAll('.cz-row .chip-icon svg').length === 4; })()`));
  check('Customize view: a live picture of the dashboard, with a block per panel', await ev(`[...document.querySelectorAll('.cz-screen .cz-block')].map(b => b.dataset.block).join() === 'actions,where,check,today' && !document.querySelector('.cz-block.is-off') && document.querySelector('.cz-screen').getAttribute('aria-hidden') === 'true'`));
  check('The thumb glides with an overshoot and the track colour cross-fades', await ev(`(() => { const b = document.querySelector('.cz .sw'), t = getComputedStyle(b.querySelector('.sw__thumb')), k = getComputedStyle(b, '::before'); return /transform/.test(t.transitionProperty) && /cubic-bezier\\(0\\.34, 1\\.56/.test(t.transitionTimingFunction) && /opacity/.test(k.transitionProperty) && k.opacity === '1'; })()`));
  const blockH = await ev(`document.querySelector('.cz-block[data-block=where]').getBoundingClientRect().height`);
  const screenH = await ev(`document.querySelector('.cz-screen').getBoundingClientRect().height`);
  await click('.cz .sw[data-key=where]');
  await sleep(750);
  check('Switching a panel off slides its block out of the picture and hides the panel', await ev(`(() => { const b = document.querySelector('.cz-block[data-block=where]'); return document.querySelector('.cz .sw[data-key=where]').getAttribute('aria-checked') === 'false' && b.classList.contains('is-off') && b.getBoundingClientRect().height < 2 && getComputedStyle(b).opacity === '0' && !document.querySelector('.dash-where') && !!document.querySelector('.dash-do') && !!document.querySelector('.dash-strip'); })()`) && blockH > 30, `block was ${Math.round(blockH)} px tall`);
  await ev(`document.querySelector('.cz .sw[data-key=today]').focus()`);
  await press(' ');
  await sleep(500);
  const offBySpace = await ev(`document.querySelector('.cz .sw[data-key=today]').getAttribute('aria-checked') === 'false' && !document.querySelector('.dash-strip')`);
  await press('Enter');
  await sleep(500);
  check('Switches work with Space and Enter', offBySpace && await ev(`document.querySelector('.cz .sw[data-key=today]').getAttribute('aria-checked') === 'true' && !!document.querySelector('.dash-strip')`));
  await click('.cz-row[data-key=actions] .cz-row__name');
  await sleep(500);
  check('A click anywhere on a row flips its switch', await ev(`document.querySelector('.cz .sw[data-key=actions]').getAttribute('aria-checked') === 'false' && !document.querySelector('.dash-do')`));
  await click('.cz .sw[data-key=check]');
  await sleep(500);
  check('The fourth switch hides Today’s check, and its block leaves the picture', await ev(`document.querySelector('.cz .sw[data-key=check]').getAttribute('aria-checked') === 'false' && !document.querySelector('.dash-check') && document.querySelector('.cz-block[data-block=check]').classList.contains('is-off') && !!document.querySelector('.dash-strip')`));
  await click('.cz .sw[data-key=today]');
  await sleep(500);
  check('Every panel hidden: the picture and the dashboard both say so, and the greeting stays', await ev(`document.querySelector('.cz').classList.contains('is-empty') && !!document.querySelector('.dash-none') && !!document.querySelector('h1.dash-title')`));
  await click('.cz .sw[data-key=actions]');
  await click('.cz .sw[data-key=where]');
  await sleep(800);
  check('The switches stay where they are while the picture changes', await ev(`document.querySelector('.cz-screen').getBoundingClientRect().height`) === screenH, `picture ${screenH} px`);
  check('Switching panels back on shows them again', await ev(`!!document.querySelector('.dash-do') && !!document.querySelector('.dash-where') && !document.querySelector('.dash-strip') && !document.querySelector('.dash-none') && document.querySelector('.cz-block[data-block=where]').getBoundingClientRect().height > 30`));
  await shot('21-customize'); // What do you want to do and Where the crew is on, Today off
  await click('.modal__foot [data-close]');
  await sleep(350);
  check('Done closes the dialog and the choice is saved', await ev(`!document.querySelector('.modal') && JSON.stringify(JSON.parse(localStorage.getItem('still.v1')).view) === '{"actions":true,"where":true,"today":false,"check":false}'`));
  await ev(`Still.store.update(s => { s.view.today = true; s.view.check = true; })`);

  /* ---------------- the choice lasts for the visit: another page load in the same tab keeps it */
  await load(pageUrl);
  await waitFor('Still.introDone === true', 12000);
  await sleep(300);
  check('Same tab: the home page knows the location, and its button opens the dashboard', await ev(`document.querySelector('.home-env.is-current').dataset.env === 'mars' && document.querySelector('#landLaunch').getAttribute('aria-label') === 'Open dashboard'`));
  await click('#landLaunch');
  await sleep(400);
  check('Same tab: straight to the dashboard, not asked again', await ev(`${ON_DASH} && ${PILL('Mars')}`));
  await shot('06d-reopened');

  /* ---------------- change it any time */
  await click('#envPill');
  await sleep(300);
  check('Pill opens the picker with the current choice marked', await ev(`location.hash === '#/environment' && document.querySelector('h1').textContent === 'Change environment' && document.querySelector('.env-card.is-selected').dataset.env === 'mars'`));
  await click('.env-card[data-env=moon]');
  await sleep(200);
  await shot('06e-change');
  await click('.env__actions [type=submit]');
  await sleep(600);
  check('Changed to the Moon: kept for the visit and saved for the account', await ev(`${VISIT} === 'moon' && localStorage.getItem('guardian.env.u0') === 'moon' && ${NOT_IN_STATE} && ${PILL('Moon')} && ${ON_DASH}`));
  await ev(`location.hash = '#/settings'`);
  await sleep(200);
  check('Settings shows the environment and a change button', await ev(`document.querySelector('.settings').textContent.includes('Moon') && !!document.querySelector('.settings a[href="#/environment"]')`));
  await ev(`location.hash = '#/environment'`);
  await sleep(200);
  await click('.env__actions a.btn');
  await sleep(250);
  check('Cancel keeps the choice', await ev(`location.hash === '#/dashboard' && ${VISIT} === 'moon'`));

  /* ---------------- the logo as a home link */
  await click('#brand');
  await sleep(300);
  const HOME = `document.querySelector('h1').textContent.startsWith('Watching over the crew')`;
  check('Logo goes to the home page, no replay', await ev(`location.hash === '#/' && !document.getElementById('loader') && ${HOME}`));
  await ev('window.scrollTo(0, 600)');
  await click('#brand');
  await sleep(900);
  check('Logo on the home page scrolls to the top', await ev(`location.hash === '#/' && window.scrollY === 0 && !document.getElementById('loader')`));
  await ev(`location.hash = '#/dashboard'`);
  await sleep(250);
  await click('[data-nav="cards"]');
  await sleep(200);
  check('Nav goes to My cards', await ev(`location.hash === '#/cards' && document.querySelector('h1').textContent === 'My cards'`));
  await sleep(1000); // let the nudge from the earlier logo click finish
  const before = await ev('Still.mark.theta');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: slot.cx, y: slot.cy });
  await sleep(300);
  const during = await ev('Still.mark.theta');
  check('Hover nudges the ship', Math.abs(during - before) > 0.1, `${(during - before).toFixed(2)} rad`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 600 });
  await sleep(900);
  check('Ship returns to its pose after hover', await ev(`Math.abs(Still.mark.theta - 0.42) < 1e-6`));
  await click('#brand');
  await sleep(250);
  check('Logo from another page goes home without the intro', await ev(`location.hash === '#/' && ${HOME} && !document.getElementById('loader')`));
  const slot2 = await rect('#brandSlot');
  check('Logo stays in the same place across pages', near(slot2.x, slot.x, 0.5) && near(slot2.y, slot.y, 0.5));
  await ev(`location.hash = '#/dashboard'`);
  await sleep(250);

  /* ---------------- add a card: from My cards, now that the bar has no Add card button */
  await ev(`location.hash = '#/cards'`);
  await sleep(250);
  check('My cards has an Add card button, and no collection filter', await ev(`!!document.querySelector('.page-head [data-action="add-card"]') && !document.querySelector('#colFilter')`));
  await click('.page-head [data-action="add-card"]');
  await waitFor(`!!document.querySelector('#cardForm')`);
  await click('.modal__foot .btn--primary');
  await sleep(100);
  check('Empty title is refused with a message', await ev(`document.querySelector('[data-field=title] .field__error').textContent.length > 0`));
  check('The card form has no collection field', await ev(`!document.querySelector('#f-collection, #f-newCollection') && !!document.querySelector('#f-type')`));
  await ev(`document.querySelector('#f-title').focus()`);
  await type('Heart rate drifts up after EVA');
  await click('.modal__foot .btn--primary');
  await sleep(350);
  check('Card saved and shown in My cards', await ev(`document.querySelectorAll('#cardGrid .card[data-id]').length === 1 && document.querySelector('#cardGrid').textContent.includes('Heart rate drifts up after EVA')`));
  check('Nav badge counts the card', await ev(`document.querySelector('[data-nav=cards] .badge').textContent === '1'`));
  check('New card is stamped with the environment', await ev(`Still.store.get().cards[0].env === 'moon'`));
  check('New card is saved to the account a moment later, not kept in this browser', await until(() => !!sb.cards.get('u0') && sb.cards.get('u0').size === 1) && await ev(`!('cards' in JSON.parse(localStorage.getItem('still.v1')))`));
  await ev(`location.hash = '#/dashboard'`);
  await mouseAway();
  await sleep(1500);
  check('Dashboard: Today links to the last entry, and counts nothing', await ev(`(() => { const b = document.querySelector('.dash-strip__last'); return !!b && b.textContent.includes('Heart rate drifts up after EVA') && b.dataset.action === 'open-card' && !document.querySelector('.metric, .recent, .glance'); })()`));
  await ev(`document.querySelector('.dash-strip').scrollIntoView({ block: 'center' })`);
  await sleep(150);
  await click('.dash-strip__last');
  await sleep(300);
  check('The last entry opens that card', await ev(`!!document.querySelector('.modal') && document.querySelector('.modal__title').textContent === 'Heart rate drifts up after EVA'`));
  await press('Escape');
  await sleep(2300);
  await shot('07-home-with-card');

  /* ---------------- today's check: logging vitals from the panel fills the ring and counts the day */
  check('Today’s check: a card that is not vitals does not count', await ev(`document.querySelector('.dash-check__state').textContent === 'No vitals logged yet today'`));
  await ev(`document.querySelector('.dash-check').scrollIntoView({ block: 'center' })`);
  await sleep(150);
  await click('.dash-check__go');
  await reached(`!!document.querySelector('#cardForm')`);
  await sleep(150);
  check('Log vitals now opens the crew health form, as the tile does', await ev(`document.querySelector('#f-title').value === 'Crew health: ' && document.querySelector('#f-type').value === 'observation'`));
  await type('resting pulse logged');
  await click('.modal__foot .btn--primary');
  await sleep(1500);
  check('Today’s check after logging: the ring has drawn itself, the line says so, 1 day in a row, no button', await ev(`(() => { const p = document.querySelector('.dash-check'), ring = p.querySelector('.dash-ring'), arc = getComputedStyle(ring.querySelector('.dash-ring__arc')); return ring.classList.contains('is-done') && parseFloat(arc.strokeDashoffset) === 0 && /stroke-dashoffset/.test(arc.transitionProperty) && p.querySelector('.dash-check__state').textContent === 'Vitals logged today' && p.querySelector('.dash-check__streak').textContent === '1 day in a row' && ring.querySelector('b').textContent === '1' && !p.querySelector('.dash-check__go'); })()`));
  check('The new card remembers its template, and Today’s check shows no reading', await ev(`Still.store.get().cards.some(c => c.template === 'crew-health' && c.title === 'Crew health: resting pulse logged') && !/pulse|Heart rate|bpm|\\d{2,}/i.test(document.querySelector('.dash-check').textContent)`));
  check('Today’s last entry slides in when it changes', await ev(`document.querySelector('.dash-strip__last').classList.contains('is-new') && /resting pulse logged/.test(document.querySelector('.dash-strip__last').textContent)`));
  await ev(`Still.store.update(s => { s.cards.push({ id: 'yday1', title: 'Crew health: sleep logged', notes: '', type: 'observation', env: 'moon', template: 'crew-health', createdAt: new Date().setHours(12, 0, 0, 0) - 86400000 }); })`);
  await sleep(1200);
  check('Days in a row: yesterday as well makes two, and the number counts up to it', await ev(`document.querySelector('.dash-check__streak').textContent === '2 days in a row' && document.querySelector('.dash-ring b').textContent === '2'`));

  /* ---------------- My cards: one sort menu in place of the type filters */
  await ev(`location.hash = '#/cards'`);
  await sleep(300);
  const TITLES = `[...document.querySelectorAll('#cardGrid .card .card__title')].map(h => h.textContent).join('|')`;
  check('My cards: no type filters, one sort menu reading Newest first, and search stays', await ev(`!document.querySelector('.chips, .chip, [data-action=filter-type]') && document.querySelector('#cardSort').textContent.trim() === 'Newest first' && document.querySelector('#cardSort').getAttribute('aria-haspopup') === 'listbox' && document.querySelector('#cardSort').getAttribute('aria-expanded') === 'false' && document.querySelector('#sortList').hidden && !!document.querySelector('#cardSearch')`));
  check('Sort: Newest first', await ev(TITLES) === 'Crew health: resting pulse logged|Heart rate drifts up after EVA|Crew health: sleep logged', await ev(TITLES));
  await ev(`document.querySelector('#cardSort').focus()`);
  await press('Enter');
  await sleep(200);
  check('Keyboard: Enter opens the menu on the current choice', await ev(`document.querySelector('#cardSort').getAttribute('aria-expanded') === 'true' && !document.querySelector('#sortList').hidden && document.activeElement.id === 'sortList' && document.querySelector('#sortList').getAttribute('aria-activedescendant') === 'sort-new'`));
  await press('ArrowDown');
  await press('Enter');
  await sleep(300);
  check('Sort: Oldest first, chosen with the arrow and Enter; the menu closes, the focus returns and the choice is kept', await ev(TITLES) === 'Crew health: sleep logged|Heart rate drifts up after EVA|Crew health: resting pulse logged' && await ev(`document.querySelector('#cardSort').textContent.trim() === 'Oldest first' && document.querySelector('#sortList').hidden && document.activeElement.id === 'cardSort' && JSON.parse(localStorage.getItem('still.v1')).sort === 'old'`), await ev(TITLES));
  await press('Enter');
  await sleep(150);
  await press('Escape');
  await sleep(150);
  check('Keyboard: Escape closes the menu without changing the order', await ev(`document.querySelector('#sortList').hidden && document.activeElement.id === 'cardSort' && Still.store.get().sort === 'old'`));
  await click('#cardSort');
  await sleep(250);
  await shot('22-cards');
  await click('.sort__opt[data-sort-id=az]');
  await sleep(300);
  check('Sort: A to Z, chosen with the mouse', await ev(TITLES) === 'Crew health: resting pulse logged|Crew health: sleep logged|Heart rate drifts up after EVA' && await ev(`document.querySelector('#cardSort').textContent.trim() === 'A to Z' && document.querySelector('#sortList').hidden`), await ev(TITLES));

  for (const [hash, h1] of [['#/cards', 'My cards'], ['#/library', 'Card library'], ['#/settings', 'Settings']]) {
    await ev(`location.hash = '${hash}'`);
    await sleep(250);
    check(`Route ${hash} renders`, await ev(`document.querySelector('h1').textContent === ${JSON.stringify(h1)}`));
    await shot('08-' + hash.slice(2));
  }
  check('Settings: Export stays, Import is gone, and a block leads to the account page', await ev(`!!document.querySelector('.settings [data-action=export]') && !document.querySelector('[data-action=import], #importFile') && !/Import/.test(document.querySelector('#main').textContent) && document.querySelector('#set-account').textContent === 'Your account and data' && document.querySelector('.settings a[data-go=account]').getAttribute('href') === '/#/privacy'`));
  check('Sky animations run on the other pages as well', await ev(SKY(true)));
  await ev(`location.hash = '#/collections'`);
  await sleep(250);
  check('No Collections route: the address is not found', await ev(`document.title.startsWith('Not found') && document.querySelector('h1').textContent !== 'Collections' && !document.querySelector('[data-action=create-collection]')`));
  await ev(`location.hash = '#/dashboard'`);
  await sleep(200);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  await sleep(200);
  check('Search lists the pages in the bar, without Collections, Card library or Sources', await ev(`(() => { const t = document.querySelector('.palette__list').textContent; return /Dashboard/.test(t) && /Hazards/.test(t) && /Settings/.test(t) && !/Collections|Card library|Sources|Privacy/.test(t) && document.querySelector('#paletteInput').placeholder === 'Search cards and pages'; })()`));
  await type('heart');
  await sleep(150);
  check('Search finds the card', await ev(`document.querySelector('.palette__list').textContent.includes('Heart rate drifts up after EVA')`));
  await shot('09-search');
  await ev(`document.querySelector('.modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(250);

  /* ---------------- other sizes */
  const sizes = [['wide', 2000, 1000, false], ['tablet', 820, 1180, true], ['phone', 390, 844, true], ['small', 320, 640, true]];
  for (const [name, w, h, mobile] of sizes) {
    await viewport(w, h, mobile);
    await load(pageUrl + '?hold=1');
    await sleep(800);
    const mc = await rect('.mark-flip');
    check(`${name}: loader mark centred`, near(mc.cx, w / 2, 1.5) && near(mc.cy, h / 2, 1.5), `${mc.cx.toFixed(1)}, ${mc.cy.toFixed(1)}`);
    if (name !== 'wide') await shot(`10-${name}-loading`);
    await ev('Still.releaseIntro()');
    await waitFor('Still.introDone === true', 12000);
    await sleep(300);
    await shot(`11-${name}`);
    const s = await rect('#brandSlot'), m = await rect('.mark-flip');
    check(`${name}: mark lands in the header slot`, near(s.x, m.x, 0.5) && near(s.y, m.y, 0.5));
    check(`${name}: no sideways scroll`, await ev(`innerWidth === ${w} && document.documentElement.scrollWidth <= ${w}`), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth + ' (screen ${w})'`));
    if (name === 'phone' || name === 'tablet') {
      // the picker at this size: stacked cards, photo above each, Continue always reachable
      await ev(`(() => { sessionStorage.removeItem('guardian.env'); localStorage.removeItem('guardian.env.u0'); const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = false; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
      await load(pageUrl + '#/dashboard');
      await sleep(400);
      const perRow = name === 'phone' ? 1 : 2;
      check(`${name}: picker shows ${perRow} card${perRow > 1 ? 's' : ''} per row`, await ev(`(() => { const r = [...document.querySelectorAll('.env-card')].map(c => Math.round(c.getBoundingClientRect().top)); return new Set(r).size === ${4 / perRow}; })()`));
      check(`${name}: picker has no sideways scroll`, await ev(`document.documentElement.scrollWidth <= innerWidth`));
      await shot(`12-${name}-picker`);
      await click('.env-card[data-env=iss]');
      await sleep(200);
      const btn = await rect('.env__actions [type=submit]');
      check(`${name}: Continue stays on screen`, btn.y + btn.h <= h && btn.y >= 0, `${Math.round(btn.y)}-${Math.round(btn.y + btn.h)} of ${h}`);
      await shot(`12-${name}-picker-selected`);
      await click('.env__actions [type=submit]');
      await sleep(700);
      check(`${name}: dashboard after choosing`, await ev(`${ON_DASH} && ${VISIT} === 'iss'`));
      await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = true; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
    }
    // the dashboard at this size
    await ev(`location.hash = '#/dashboard'`);
    await mouseAway();
    await sleep(1500);
    const tilesPerRow = { wide: 4, tablet: 2, phone: 1, small: 1 }[name];
    check(`${name}: dashboard has no sideways scroll, ${tilesPerRow} tile${tilesPerRow > 1 ? 's' : ''} per row`, await ev(`${ON_DASH} && document.documentElement.scrollWidth <= innerWidth && new Set([...document.querySelectorAll('.dash-tile')].map(t => Math.round(t.getBoundingClientRect().top))).size === ${4 / tilesPerRow} && [...document.querySelectorAll('.dash-tile, .dash-where, .dash-strip, .dash-seg__btn, .dash-strip__last')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; }) && [...document.querySelectorAll('.dash-seg__btn')].every(b => b.scrollWidth <= b.clientWidth)`), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
    if (name === 'phone' || name === 'small') check(`${name}: the account chip shrinks to one initial, and tiles are easy to tap`, await ev(`getComputedStyle(document.querySelector('.acct__email')).display === 'none' && document.querySelector('.acct__initial').getBoundingClientRect().width >= 24 && [...document.querySelectorAll('.dash-tile, .dash-seg__btn')].every(e => e.getBoundingClientRect().height >= 40)`));
    if (name === 'phone') { await sleep(1600); await fullShot('20-dashboard-phone'); } // once the picker's toast has gone
  }

  /* ---------------- reduced motion */
  await viewport(1440, 900);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = true; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
  await load(pageUrl);
  const a = await ev('Still.mark.theta');
  await sleep(300);
  const b = await ev('Still.mark.theta');
  check('Reduced motion: the sky animations are hidden', await ev(SKY(false)));
  check('Reduced motion: ship still orbits (requested)', b - a > 0.2, `${(b - a).toFixed(2)} rad`);
  await waitFor('Still.introDone === true', 12000);
  const rt = await ev('Still.introTiming');
  check('Reduced motion: quick cross-fade after the 3 s orbit', rt.done - rt.ready < 700 && rt.ready - rt.start >= 2950, `${Math.round(rt.ready - rt.start)} ms orbit, ${Math.round(rt.done - rt.ready)} ms fade`);
  check('Reduced motion: ship parked in the logo', await ev(`Math.abs(Still.mark.theta - 0.42) < 1e-6`));
  const rs = await rect('#brandSlot'), rm = await rect('.mark-flip');
  check('Reduced motion: logo in place', near(rs.x, rm.x, 0.5) && near(rs.y, rm.y, 0.5));
  await ev(`location.hash = '#/dashboard'`);
  await sleep(500);
  const lt = await rect('.dash-tile[data-tile=log]');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: lt.cx, y: lt.cy });
  await sleep(200);
  check('Reduced motion: the dashboard’s effects are off; the ring and its number simply show', await ev(`(() => { const arc = getComputedStyle(document.querySelector('.dash-ring__arc')); return getComputedStyle(document.querySelector('.dash-tile[data-tile=log] .chip-icon path')).animationName === 'none' && arc.transitionDuration === '0s' && parseFloat(arc.strokeDashoffset) === 0 && document.querySelector('.dash-ring b').textContent === '2' && getComputedStyle(document.querySelector('.dash-seg__thumb')).transitionDuration === '0s'; })()`));
  await mouseAway();
  await send('Emulation.setEmulatedMedia', { features: [] });

  /* ---------------- intro switched off */
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = false; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
  await load(pageUrl);
  await sleep(200);
  check('Intro off: no loader, logo in place', await ev(`!document.getElementById('loader') && Still.introDone === true`));

  /* ---------------- the dashboard after a reload: what Customize view chose, a storm, and older saved state */
  await open(DASH);
  await click('.dash-head [data-action=customize]');
  await reached(`!!document.querySelector('.cz')`);
  await click('.cz .sw[data-key=where]');
  await sleep(200);
  await click('.modal__foot [data-close]');
  radiation.sScale = 2;
  await reload();
  await settle();
  await sleep(300);
  check('Customize view survives a reload', await ev(`${ON_DASH} && !document.querySelector('.dash-where') && !!document.querySelector('.dash-do') && !!document.querySelector('.dash-strip') && Still.store.get().view.where === false`));
  await reached(`/level S2 of 5/.test(document.querySelector('#dashToday').textContent)`);
  check('Today names a solar radiation storm when NOAA reports one', await ev(`/Solar radiation storm near Earth, level S2 of 5/.test(document.querySelector('#dashToday').textContent)`));
  radiation.sScale = 0;
  // what an older version saved: other panels, a time range, collections (a card's collectionId is kept with the card)
  await ev(`Still.store.update(s => { s.cards.forEach(c => { c.collectionId = 'c1'; }); }), Still.store.flush().then(() => true)`);
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.view = { hero: false, glance: true, activity: true, collections: true, recent: false, today: false, bogus: 1 }; s.range = 30; s.collections = [{ id: 'c1', name: 'Crew vitals', createdAt: 1 }]; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
  await reload();
  await settle();
  await sleep(300);
  check('Older saved state loads cleanly: unknown panels dropped, missing ones on', await ev(`JSON.stringify(Still.store.get().view) === '{"actions":true,"where":true,"today":false,"check":true}' && !('range' in Still.store.get()) && ${ON_DASH} && !!document.querySelector('.dash-where') && !document.querySelector('.dash-strip')`));
  await ev(`location.hash = '#/cards'`);
  await sleep(250);
  check('Older saved collections are ignored without error', await ev(`document.querySelectorAll('#cardGrid .card[data-id]').length === 3 && !/Crew vitals/.test(document.querySelector('#main').textContent)`));
  await ev(`Still.store.update(s => { s.view.today = true; s.view.check = true; })`);
  check('The sort choice survives a reload', await ev(`document.querySelector('#cardSort').textContent.trim() === 'A to Z' && document.querySelector('#cardGrid .card__title').textContent === 'Crew health: resting pulse logged'`));
  await ev(`GuardianEnv.forget('u0')`); // the checks below start with no location saved for anyone

  /* ---------------- where the location is kept: this visit for everyone, saved only for a signed-in user */
  // The opening is off from here (above), so each page load is quick. `open` waits until the page knows who is signed in.
  // Signed out, only the home page can be opened, so those visits start there; signed in, they start at the dashboard.
  const ASKED = `document.querySelector('h1').textContent === 'Where is your crew?' && !${VISIT}`;
  const onDashboard = name => `${ON_DASH} && ${PILL(name)}`;
  const onHome = name => `document.querySelector('h1').textContent.startsWith('Watching over the crew') && ${PILL(name)}`;
  const choose = async env => { await click(`.env-card[data-env=${env}]`); await sleep(150); await click('.env__actions [type=submit]'); await sleep(400); };
  const oldState = env => `(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.env = '${env}'; localStorage.setItem('still.v1', JSON.stringify(s)); })()`;

  // signed out
  account.user = null;
  await newVisit();
  await open(pageUrl);
  check('Signed out, new visit: asked again', await ev(ASKED));
  check('Signed out, new visit: no location anywhere in localStorage', await ev(NOTHING_SAVED));
  check('Signed out: the picker says the choice is for this visit only', await ev(`/this visit only/.test((document.querySelector('#envNote') || {}).textContent || '') && !!document.querySelector('#envNote a[href="/#/sign-in"]')`));
  await shot('13-picker-signed-out');
  await choose('mars');
  await reload();
  await settle();
  check('Signed out, same tab: a reload keeps the location, not asked again', await ev(`${onHome('Mars')} && ${VISIT} === 'mars'`));
  check('Signed out, same tab: still nothing in localStorage', await ev(NOTHING_SAVED));

  // signed in
  account.user = 'u1';
  await newVisit();
  await open(DASH);
  check('Signed in, nothing saved yet: asked, without the visit-only note', await ev(`${ASKED} && !document.querySelector('#envNote')`));
  await choose('moon');
  check('Signed in: the choice is saved for that account, not in the shared state', await ev(`${onDashboard('Moon')} && localStorage.getItem('guardian.env.u1') === 'moon' && ${SAVED_KEYS} === 'guardian.env.u1' && ${NOT_IN_STATE}`));
  await newVisit();
  await open(DASH);
  check('Signed in, new visit: the location is restored without asking', await ev(`${onDashboard('Moon')} && ${VISIT} === 'moon'`));
  await ev(`location.hash = '#/environment'`);
  await sleep(250);
  await choose('spacecraft');
  check('Signed in: changing the location updates the saved one', await ev(`${onDashboard('Spacecraft')} && localStorage.getItem('guardian.env.u1') === 'spacecraft'`));

  // another account, and nobody, on the same browser
  account.user = 'u2';
  await newVisit();
  await open(DASH);
  check('Second account: asked, not handed the first account’s location', await ev(`${ASKED} && ${SAVED_KEYS} === 'guardian.env.u1' && localStorage.getItem('guardian.env.u1') === 'spacecraft'`));
  account.user = null;
  await newVisit();
  await open(pageUrl);
  check('Signed out, new visit: an account’s saved location is not used', await ev(`${ASKED} && !!document.querySelector('#envNote')`));

  // a location left in the shared state by the old rule
  await ev(oldState('mars'));
  await newVisit();
  await open(pageUrl);
  check('Old saved location, signed out: asked, and it is removed', await ev(`${ASKED} && ${NOT_IN_STATE} && ${SAVED_KEYS} === 'guardian.env.u1'`));
  await ev(oldState('iss'));
  account.user = 'u3';
  await newVisit();
  await open(DASH);
  check('Old saved location, signed in: moved to that account, not asked', await ev(`${onDashboard('ISS')} && localStorage.getItem('guardian.env.u3') === 'iss' && ${NOT_IN_STATE}`));

  // the page waits for the answer to who is signed in, but not for long
  account.user = 'u1';
  account.delay = 4000;
  await newVisit();
  await load(pageUrl);
  await sleep(500);
  const held = await ev(`document.documentElement.classList.contains('env-wait') && getComputedStyle(document.querySelector('.page')).visibility === 'hidden'`);
  await waitFor(`!document.documentElement.classList.contains('env-wait')`, 4000);
  const waited = await ev('performance.now()');
  check('No answer to who is signed in: the page is held, then asks after about 1.5 s', held && waited >= 1400 && waited <= 2600 && await ev(ASKED), `shown after ${Math.round(waited)} ms`);
  await waitFor(onHome('Spacecraft'), 6000).catch(() => {});
  check('A late answer still restores the signed-in user’s location', await ev(onHome('Spacecraft')));
  account.delay = 0;

  // what the health app calls when someone signs in, signs out or deletes their data (src/guardian.ts)
  account.user = null;
  await newVisit();
  await open(pageUrl);
  await choose('mars');
  await ev(`GuardianEnv.account('u4', true)`);
  check('Signing in during a visit saves the location already chosen', await ev(`localStorage.getItem('guardian.env.u4') === 'mars' && ${VISIT} === 'mars'`));
  await ev(`GuardianEnv.signOut()`);
  check('Signing out clears this visit’s location and keeps the account’s', await ev(`!${VISIT} && localStorage.getItem('guardian.env.u4') === 'mars'`));
  await ev(`GuardianEnv.forget('u4')`);
  check('Deleting an account or its data removes its saved location', await ev(`localStorage.getItem('guardian.env.u4') === null`));

  /* ---------------- the sign-in gate: signed out, only the home page and the picker can be seen */
  account.user = null;
  await newVisit();
  await open(pageUrl);
  check('Signed out: the picker comes first at the home address', await ev(ASKED));
  await choose('mars');
  check('Signed out: the picker and the home page still work', await ev(`${onHome('Mars')} && document.querySelectorAll('.home-env').length === 4 && document.querySelectorAll('.hazard').length === 5`));
  check('Signed out: the bar offers Sign in or sign up, never Add card or the account chip', await ev(`document.querySelector('#landLaunch .lg').textContent === 'Sign in or sign up' && document.querySelector('#acct .acct__in').getAttribute('href') === '/#/sign-in' && !document.querySelector('.acct__chip, .btn--add') && !/Add card/.test(document.querySelector('#topbar').textContent)`));
  const askedBefore = radiation.asked;
  await ev(`document.querySelector('.home-env[data-env=moon]').click()`);
  check('Signed out: a location card on the home page goes to the sign-in page, keeping the choice', await reached(AT_SIGN_IN) && await ev(`${VISIT} === 'moon'`));
  for (const hash of ['#/dashboard', '#/cards', '#/settings']) {
    account.delay = 1100; // hold the answer back, to see what shows while the page does not know who is here
    await load(pageUrl + hash);
    await sleep(300);
    const hidden = await ev(`location.hash === '${hash}' && document.documentElement.classList.contains('env-wait') && getComputedStyle(document.querySelector('.page')).visibility === 'hidden'`).catch(() => false);
    const sent = await reached(AT_SIGN_IN);
    account.delay = 0;
    check(`Signed out: ${hash} opened directly goes to the sign-in page without showing the page`, hidden && sent, `hidden ${hidden}, sent ${sent}`);
  }
  check('Signed out: space weather is never asked for', radiation.asked === askedBefore, `${radiation.asked - askedBefore} request(s)`);

  /* ---------------- signing out, from the account chip */
  account.user = 'u5';
  await newVisit();
  await open(DASH);
  await choose('iss');
  await sleep(300);
  check('Signed in, a new account: the picker, then the dashboard', await ev(onDashboard('ISS')));
  await click('#acct .acct__chip');
  await sleep(250);
  await click('[data-acct="sign-out"]');
  await reached(`location.pathname === '/home/index.html' && location.hash.length < 3 && !!window.Still && !!Still.store && document.readyState === 'complete'`);
  await settle();
  check('Signing out lands on the home page, signed out, with the visit’s location forgotten', account.user === null && await ev(`location.pathname === '/home/index.html' && location.hash.length < 3 && GuardianEnv.user() === null && !document.querySelector('.dash') && !${VISIT} && document.querySelector('#landLaunch .lg').textContent === 'Sign in or sign up' && localStorage.getItem('guardian.env.u5') === 'iss'`));

  /* ---------------- Supabase: signing up, cards kept with each account, old browser cards, deleting the account */
  // On the sign-in page (here its stand-in, with the same js/auth.js the health app's form calls), then the dashboard.
  account.user = null;
  await newVisit();
  await open(pageUrl);
  await choose('mars');
  await load(`http://127.0.0.1:${server.address().port}/#/sign-in`);
  await reached('!!window.GuardianAuth');
  const signUpsBefore = sb.signUps;
  const short = await ev(`GuardianAuth.signUp('ana@crew.test', 'seven77').then(() => 'sent', e => e.message)`);
  check('Sign-up: a password under 8 characters is refused before anything is sent', short === 'Use a password of at least 8 characters.' && sb.signUps === signUpsBefore, short);
  await ev(`GuardianAuth.signUp('ana@crew.test', 'a long password').then(() => true)`);
  const ana = account.user;
  await load(DASH); // where the sign-in page sends everyone (src/guardian.ts)
  await settle();
  check('Sign up, then the dashboard: signed in as the new account, its email on the chip', !!ana && await reached(`${onDashboard('Mars')} && GuardianEnv.user() === '${ana}' && document.querySelector('#acct .acct__email').textContent === 'ana@crew.test'`));
  check('Space weather is asked for with the signed-in person’s access token', await until(() => radiation.auth === `Bearer stub-token-${ana}`), radiation.auth);
  const dupe = await ev(`GuardianAuth.signUp('ana@crew.test', 'a long password').then(() => 'made', e => e.message)`);
  check('Sign-up with an email already registered says so in plain words', dupe === 'An account with this email already exists. Sign in instead.', dupe);

  await ev(`location.hash = '#/cards'`);
  await sleep(300);
  await ev(`Still.store.update(s => { s.cards.push({ id: 'ana-1', title: 'Ana: <b>bold</b> stays text', notes: '', type: 'observation', env: 'mars', createdAt: Date.now() }); })`);
  check('A card is saved to the account a moment after the change, not to this browser', await until(() => !!sb.cards.get(ana) && sb.cards.get(ana).has('ana-1')) && await ev(`!('cards' in JSON.parse(localStorage.getItem('still.v1')))`));
  await reload();
  await settle();
  check('Cards come back from the account after a reload, shown as text, never as HTML', await reached(`location.hash === '#/cards' && document.querySelectorAll('#cardGrid .card[data-id]').length === 1 && !document.querySelector('#cardGrid b') && document.querySelector('#cardGrid').textContent.includes('<b>bold</b>')`));
  sb.failSaves = 1;
  await ev(`Still.store.update(s => { s.cards.push({ id: 'ana-2', title: 'Second note', notes: '', type: 'observation', env: 'mars', createdAt: Date.now() }); })`);
  const failing = await reached(`document.querySelector('[data-save-note]').textContent === 'Could not save. Trying again.' && document.querySelectorAll('#cardGrid .card[data-id]').length === 2`);
  const recovered = await until(() => sb.cards.get(ana).has('ana-2')) && await reached(`document.querySelector('[data-save-note]').textContent === ''`);
  check('A failed save says so near the cards, keeps them on screen, and is tried again', failing && recovered, `failing ${failing}, recovered ${recovered}`);

  await ev(`GuardianAuth.signOut().then(() => GuardianAuth.signUp('ben@crew.test', 'another long one')).then(() => true)`);
  const ben = account.user;
  await reload();
  await settle();
  check('A second account on this browser sees none of the first one’s cards', !!ben && ben !== ana && sb.cards.get(ana).size === 2 && await ev(`location.hash === '#/cards' && Still.store.get().cards.length === 0 && !document.querySelector('#cardGrid .card[data-id]')`) && await ev(`GuardianAuth.cards.list().then(r => r.length === 0)`));

  // cards an older version kept in this browser, met by an account with none yet
  await ev(`GuardianAuth.signOut().then(() => GuardianAuth.signUp('cleo@crew.test', 'a third password')).then(() => true)`);
  const cleo = account.user;
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.cards = [{ id: 'old-1', title: 'Kept from before accounts', notes: '', type: 'observation', env: 'moon', createdAt: 1 }]; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
  await reload();
  await settle();
  const movedIn = await until(() => !!sb.cards.get(cleo) && sb.cards.get(cleo).has('old-1'));
  check('Old browser cards move into an empty account, then leave the browser', movedIn && await reached(`Still.store.get().cards.map(c => c.id).join() === 'old-1' && !('cards' in JSON.parse(localStorage.getItem('still.v1')))`));
  await reload();
  await settle();
  check('They move once: a reload neither copies them again nor loses them', await ev(`Still.store.get().cards.length === 1`) && sb.cards.get(cleo).size === 1);

  const deleted = await ev(`GuardianAuth.deleteAccount().then(() => true, e => e.message)`);
  check('Deleting the account removes it and its cards, and signs out', deleted === true && !sb.users.has(cleo) && !sb.cards.has(cleo) && account.user === null && await ev(`GuardianAuth.user().then(u => u === null)`), String(deleted));

  check('No script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Run finished', false, e.message);
  if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
  try { console.log('state:', JSON.stringify(await ev(`({ href: location.href, done: !!Still.introDone, timing: Still.introTiming && { start: Math.round(Still.introTiming.start), ready: Math.round(Still.introTiming.ready || 0) }, loader: !!document.getElementById('loader'), h1: document.querySelector('h1') && document.querySelector('h1').textContent })`))); } catch (err) { console.log('state unavailable:', err.message); }
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${shots}`);
ws.close();
process.exit(failed ? 1 : 0);
