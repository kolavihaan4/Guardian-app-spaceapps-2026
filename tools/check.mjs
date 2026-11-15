// Drives a headless Chrome/Edge over the DevTools protocol and checks the intro, navigation,
// the add-card flow and the layout at desktop, tablet and phone sizes.
// Usage: node tools/check.mjs        (screenshots land in tools/shots)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tools', 'shots');
fs.mkdirSync(shots, { recursive: true });
const pageUrl = pathToFileURL(path.join(root, 'index.html')).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 0;
const pending = new Map(), handlers = {};
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method && handlers[m.method]) handlers[m.method].forEach(f => f(m.params));
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const on = (method, f) => (handlers[method] = handlers[method] || []).push(f);

const errors = [];
on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' ')); });
await send('Page.enable');
await send('Runtime.enable');
// keep the tab "visible" so the browser never throttles timers or pauses animation frames
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.bringToFront');

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

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

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
  const marsCard = await rect('.home-env[data-env=mars]');
  await clickAt(marsCard.cx, marsCard.cy);
  await sleep(150);
  check('A click during loading does nothing', await ev(`location.hash === '' && !JSON.parse(localStorage.getItem('still.v1') || '{}').env && !document.querySelector('.modal')`));

  await ev('Still.releaseIntro()');
  await sleep(380); await shot('03-reveal-start');
  await sleep(450); await shot('04-reveal-mid');
  await sleep(450); await shot('05-reveal-late');
  await waitFor('Still.introDone === true', 12000);
  await sleep(250);
  await shot('06-home');
  const t = await ev('Still.introTiming');
  const dur = t.done - t.ready;
  check('Reveal and logo move take 1.5 to 2 s', dur >= 1500 && dur <= 2100, `${Math.round(dur)} ms`);
  check('Ship orbits for at least 5 s first', t.ready - t.start >= 4950, `${Math.round(t.ready - t.start)} ms`);
  const fr = (t.frames || []).slice().sort((a, b) => a - b);
  if (fr.length) console.log(`      frames during transition: ${fr.length}, median ${fr[fr.length >> 1].toFixed(1)} ms, p95 ${fr[Math.floor(fr.length * 0.95)].toFixed(1)} ms (headless software rendering)`);
  const slot = await rect('#brandSlot'), m2 = await rect('.mark-flip');
  check('Mark lands exactly in the header slot', near(slot.x, m2.x, 0.5) && near(slot.y, m2.y, 0.5) && near(slot.w, m2.w, 0.5), `slot ${slot.x},${slot.y} mark ${m2.x.toFixed(1)},${m2.y.toFixed(1)}`);
  check('Same element moved (one mark in the page)', await ev(`document.querySelectorAll('.mark').length === 1`));
  check('Ship parked at the logo pose', await ev(`Math.abs(Still.mark.theta - 0.42) < 1e-6`));
  check('Loader removed, app interactive', await ev(`!document.getElementById('loader') && !document.getElementById('main').inert && !document.documentElement.classList.contains('intro-active')`));
  check('Home header: logo, section links and Launch, no app nav', await ev(`getComputedStyle(document.querySelector('.topbar__glass')).opacity === '1' && getComputedStyle(document.querySelector('.nav')).display === 'none' && getComputedStyle(document.querySelector('.land-nav')).display === 'flex' && getComputedStyle(document.querySelector('#landLaunch')).opacity === '1'`));
  check('Logo uses day colours', await ev(`document.querySelector('.mark').classList.contains('is-day')`));
  check('Guardian brand: emblem, wordmark and title', await ev(`document.querySelector('.brand__name').textContent === 'GUARDIAN' && document.title.endsWith('· Guardian') && getComputedStyle(document.querySelector('.mark__emblem--navy')).opacity === '1'`));
  check('Ship has landed into the emblem', await ev(`getComputedStyle(document.querySelector('.mark__ship')).opacity === '0'`));

  /* ---------------- the public home page comes straight after the loader */
  check('Home page shown after the loader', await ev(`location.hash === '' && document.querySelector('h1').textContent.startsWith('Watching over the crew') && !document.querySelector('.hero, .glance, .env-card')`));
  check('Home tells the story: environments, the five hazards, how it works, a final call', await ev(`document.querySelectorAll('.home-env').length === 4 && document.querySelectorAll('.hazard').length === 5 && !!document.getElementById('how') && !!document.querySelector('.home-final [data-action=launch]')`));
  check('Home body text is at least 14px and the lead 16px+', await ev(`parseFloat(getComputedStyle(document.querySelector('.home-lead')).fontSize) >= 16 && [...document.querySelectorAll('.hazard__text, .home-env__line, .steps p')].every(p => parseFloat(getComputedStyle(p).fontSize) >= 14)`));
  await fullShot('05b-home-full');
  await click('.land-nav__link[data-target="how"]');
  await sleep(900);
  check('Section link scrolls to How it works', await ev(`Math.abs(document.getElementById('how').getBoundingClientRect().top - 100) < 40`));
  await ev('window.scrollTo(0, 0)');
  await sleep(200);
  await click('#landLaunch');
  await sleep(300);

  /* ---------------- environment picker before the dashboard */
  check('Launch shows the picker, not the dashboard',await ev(`document.querySelector('h1').textContent === 'Where is your crew?' && !document.querySelector('.hero, .glance, .recent')`));
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
  await ev(`location.hash = '#/cards'`);
  await sleep(200);
  check('Other addresses still show the picker', await ev(`document.querySelector('h1').textContent === 'Where is your crew?'`));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  await sleep(150);
  check('Search shortcut is off until a choice', await ev(`!document.querySelector('.modal')`));
  await shot('06-picker');
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
  check('Continue opens the dashboard', await ev(`location.hash === '#/dashboard' &&document.querySelector('h1').textContent === 'Dashboard' && !!document.querySelector('.hero')`));
  check('Choice saved', await ev(`JSON.parse(localStorage.getItem('still.v1')).env === 'mars'`));
  check('Nav and actions appear after the choice', await ev(`getComputedStyle(document.querySelector('.nav')).display !== 'none' && getComputedStyle(document.querySelector('.nav')).opacity === '1'`));
  check('Header pill and hero name the environment', await ev(`document.querySelector('#envPill').textContent.trim() === 'Mars' && document.querySelector('.hero__eyebrow').textContent.includes('Mars')`));
  await shot('06c-home-mars');

  /* ---------------- the choice is restored on reopen */
  await load(pageUrl);
  await waitFor('Still.introDone === true', 12000);
  await sleep(300);
  check('Reopen: home knows the saved environment', await ev(`document.querySelector('.home-env.is-current').dataset.env === 'mars' && document.querySelector('#landLaunch').getAttribute('aria-label') === 'Open dashboard'`));
  await click('#landLaunch');
  await sleep(400);
  check('Reopen: straight to the dashboard, no picker', await ev(`document.querySelector('h1').textContent === 'Dashboard' && document.querySelector('#envPill').textContent.trim() === 'Mars'`));
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
  check('Changed to the Moon and saved', await ev(`JSON.parse(localStorage.getItem('still.v1')).env === 'moon' && document.querySelector('#envPill').textContent.trim() === 'Moon' && document.querySelector('h1').textContent === 'Dashboard'`));
  await ev(`location.hash = '#/settings'`);
  await sleep(200);
  check('Settings shows the environment and a change button', await ev(`document.querySelector('.settings').textContent.includes('Moon') && !!document.querySelector('.settings a[href="#/environment"]')`));
  await ev(`location.hash = '#/environment'`);
  await sleep(200);
  await click('.env__actions a.btn');
  await sleep(250);
  check('Cancel keeps the choice', await ev(`location.hash === '#/dashboard' && JSON.parse(localStorage.getItem('still.v1')).env === 'moon'`));

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

  /* ---------------- add a card */
  await click('.topbar .btn--add');
  await waitFor(`!!document.querySelector('#cardForm')`);
  await click('.modal__foot .btn--primary');
  await sleep(100);
  check('Empty title is refused with a message', await ev(`document.querySelector('[data-field=title] .field__error').textContent.length > 0`));
  await ev(`document.querySelector('#f-title').focus()`);
  await type('Heart rate drifts up after EVA');
  await ev(`(() => { const s = document.querySelector('#f-collection'); s.value = '__new'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await ev(`document.querySelector('#f-newCollection').focus()`);
  await type('Crew vitals');
  await click('.modal__foot .btn--primary');
  await sleep(350);
  check('Card saved and shown in Recent items', await ev(`document.querySelectorAll('.recent tbody tr[data-id]').length === 1 && document.querySelector('.recent').textContent.includes('Heart rate drifts up after EVA')`));
  check('Metrics and collections update', await ev(`document.querySelector('.metric__value').textContent.trim() === '1' && document.querySelector('.col-list') !== null`));
  check('Nav badge counts the card', await ev(`document.querySelector('[data-nav=cards] .badge').textContent === '1'`));
  check('New card is stamped with the environment', await ev(`JSON.parse(localStorage.getItem('still.v1')).cards[0].env === 'moon'`));
  await sleep(2600);
  await shot('07-home-with-card');

  for (const [hash, h1] of [['#/cards', 'My cards'], ['#/collections', 'Collections'], ['#/library', 'Card library'], ['#/settings', 'Settings']]) {
    await ev(`location.hash = '${hash}'`);
    await sleep(250);
    check(`Route ${hash} renders`, await ev(`document.querySelector('h1').textContent === ${JSON.stringify(h1)}`));
    await shot('08-' + hash.slice(2));
  }
  await ev(`location.hash = '#/dashboard'`);
  await sleep(200);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  await sleep(200);
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
      await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.env = null; s.intro = false; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
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
      check(`${name}: dashboard after choosing`, await ev(`document.querySelector('h1').textContent === 'Dashboard' && JSON.parse(localStorage.getItem('still.v1')).env === 'iss'`));
      await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = true; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
    }
  }

  /* ---------------- reduced motion */
  await viewport(1440, 900);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = true; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
  await load(pageUrl);
  const a = await ev('Still.mark.theta');
  await sleep(300);
  const b = await ev('Still.mark.theta');
  check('Reduced motion: ship still orbits (requested)', b - a > 0.2, `${(b - a).toFixed(2)} rad`);
  await waitFor('Still.introDone === true', 12000);
  const rt = await ev('Still.introTiming');
  check('Reduced motion: quick cross-fade after the 5 s orbit', rt.done - rt.ready < 700 && rt.ready - rt.start >= 4950, `${Math.round(rt.ready - rt.start)} ms orbit, ${Math.round(rt.done - rt.ready)} ms fade`);
  check('Reduced motion: ship parked in the logo', await ev(`Math.abs(Still.mark.theta - 0.42) < 1e-6`));
  const rs = await rect('#brandSlot'), rm = await rect('.mark-flip');
  check('Reduced motion: logo in place', near(rs.x, rm.x, 0.5) && near(rs.y, rm.y, 0.5));
  await send('Emulation.setEmulatedMedia', { features: [] });

  /* ---------------- intro switched off */
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('still.v1')); s.intro = false; localStorage.setItem('still.v1', JSON.stringify(s)); })()`);
  await load(pageUrl);
  await sleep(200);
  check('Intro off: no loader, logo in place', await ev(`!document.getElementById('loader') && Still.introDone === true`));

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
