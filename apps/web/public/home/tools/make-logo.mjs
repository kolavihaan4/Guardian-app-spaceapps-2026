// Turns assets/brand/guardian-logo-source.png (white logo on navy) into transparent marks:
//   assets/brand/guardian-mark-white.png, guardian-mark-navy.png (cropped emblem), assets/favicon.png
// Uses a headless Chrome/Edge canvas, so nothing extra needs installing.
// Needs the site served at http://127.0.0.1:8080 (python -m http.server 8080).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exe = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-logo-'));
const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => {
  try { spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
});

let port;
for (let i = 0; i < 100 && !port; i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { await sleep(100); } }
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8080/assets/brand/guardian-logo-source.png' });
await sleep(1500);

const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const img = new Image(); img.src = location.href; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, W, H).data;
  // the background colour, from the corners
  const bgL = [0, W - 1, (H - 1) * W, H * W - 1].map(i => 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]).reduce((a, b) => a + b) / 4;
  const alpha = new Float32Array(W * H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) {
    const L = 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2];
    const a = Math.min(1, Math.max(0, (L - bgL - 12) / (240 - bgL - 12)));
    alpha[i] = a;
    if (a > 0.25) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  function tinted(rgb) {
    const o = document.createElement('canvas'); o.width = cw; o.height = ch;
    const og = o.getContext('2d'); const d = og.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const a = alpha[(y + y0) * W + (x + x0)], j = (y * cw + x) * 4;
      d.data[j] = rgb[0]; d.data[j + 1] = rgb[1]; d.data[j + 2] = rgb[2]; d.data[j + 3] = Math.round(a * 255);
    }
    og.putImageData(d, 0, 0); return o;
  }
  const white = tinted([255, 255, 255]), navy = tinted([28, 49, 70]);
  // favicon: the white emblem on a navy disc
  const f = document.createElement('canvas'); f.width = f.height = 128; const fg = f.getContext('2d');
  fg.fillStyle = '#14273b'; fg.beginPath(); fg.arc(64, 64, 64, 0, Math.PI * 2); fg.fill();
  const s = 104 / Math.max(cw, ch); fg.drawImage(white, 64 - cw * s / 2, 64 - ch * s / 2, cw * s, ch * s);
  // the ring: its top and bottom white pixels in the centre column of the crop
  const col = Math.round(cw / 2); let top = -1, bottom = -1;
  for (let y = 0; y < ch; y++) if (alpha[(y + y0) * W + (col + x0)] > 0.5) { if (top < 0) top = y; bottom = y; }
  return { W, H, bgL, crop: [x0, y0, cw, ch], ringTop: top, ringBottom: bottom,
    white: white.toDataURL('image/png'), navy: navy.toDataURL('image/png'), favicon: f.toDataURL('image/png') };
})()` });
const v = r.result.result.value;
const save = (name, url) => fs.writeFileSync(path.join(root, name), Buffer.from(url.split(',')[1], 'base64'));
save('assets/brand/guardian-mark-white.png', v.white);
save('assets/brand/guardian-mark-navy.png', v.navy);
save('assets/favicon.png', v.favicon);
console.log(JSON.stringify({ source: [v.W, v.H], bg: Math.round(v.bgL), crop: v.crop, ringTop: v.ringTop, ringBottom: v.ringBottom }));
ws.close();
process.exit(0);
