/* The Guardian mark: the emblem with a ship orbiting it. One element: it orbits in the loader,
   then the ship lands and the emblem becomes the header logo. */
(function () {
  const S = (window.Still = window.Still || {});
  const TAU = Math.PI * 2;
  // viewBox 0 0 144 96; the emblem's ring is centred on (CX, CY)
  const CX = 72, CY = 48, RX = 58, RY = 17, TILT = (-16 * Math.PI) / 180;
  const PARK = 0.42;            // where the ship lands: front right
  const PERIOD = 4.2;           // seconds per orbit while loading
  const OMEGA = TAU / PERIOD;
  const SEGS = 9;
  const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
  // emblem image placement (crop 420 x 367 px, ring centre at 210,183 px, radius 177 px)
  const EW = 100, EH = 100 * 367 / 420, EX = CX - 50, EY = CY - 183 * (100 / 420);

  function pos(th) {
    const ex = RX * Math.cos(th), ey = RY * Math.sin(th);
    return [CX + ex * cosT - ey * sinT, CY + ex * sinT + ey * cosT];
  }
  function heading(th) {
    const dx = -RX * Math.sin(th), dy = RY * Math.cos(th);
    return Math.atan2(dx * sinT + dy * cosT, dx * cosT - dy * sinT) * 180 / Math.PI;
  }
  function arc(a, b, n) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const p = pos(a + (b - a) * i / n);
      d += (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
    }
    return d;
  }
  const front = th => Math.sin(th) > 0;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const TEMPLATE = `
<svg class="mark" viewBox="0 0 144 96" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="mk-flame" cx="50%" cy="50%" r="50%">
      <stop class="mark__flame-stop" offset="0" stop-opacity=".95"/><stop class="mark__flame-stop" offset="1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path class="mark__orbit" d="${arc(Math.PI, TAU, 48)}"/>
  <g class="mark__trail" data-side="back"></g>
  <g class="mark__layer" data-side="back"></g>
  <image class="mark__emblem mark__emblem--white" href="assets/brand/guardian-mark-white.png" x="${EX.toFixed(2)}" y="${EY.toFixed(2)}" width="${EW}" height="${EH.toFixed(2)}"/>
  <image class="mark__emblem mark__emblem--navy" href="assets/brand/guardian-mark-navy.png" x="${EX.toFixed(2)}" y="${EY.toFixed(2)}" width="${EW}" height="${EH.toFixed(2)}"/>
  <path class="mark__orbit" d="${arc(0, Math.PI, 48)}"/>
  <g class="mark__trail" data-side="front"></g>
  <g class="mark__layer" data-side="front"></g>
</svg>`;

  // a capsule with a solar-panel wing, like the ship in the emblem; points along +x
  const SHIP = `<g class="mark__ship">
    <circle class="mark__flame" cx="-10" cy="0" r="3.8" fill="url(#mk-flame)"/>
    <rect class="mark__panel" x="-2.6" y="-12" width="3.6" height="24" rx=".6"/>
    <path class="mark__nozzle" d="M-6 -2.2L-8.8 -3.1V3.1L-6 2.2Z"/>
    <path class="mark__hull" d="M9.5 0C8 -2.6 5 -3.7 2 -3.7H-6V3.7H2C5 3.7 8 2.6 9.5 0Z"/>
    <rect class="mark__band" x="-1.4" y="-3.7" width="1.6" height="7.4"/>
  </g>`;

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  S.createMark = function () {
    const wrap = document.createElement('span');
    wrap.className = 'mark-flip';
    wrap.innerHTML = TEMPLATE;
    const svg = wrap.querySelector('svg');
    const layers = { back: svg.querySelector('.mark__layer[data-side=back]'), front: svg.querySelector('.mark__layer[data-side=front]') };
    const trails = { back: svg.querySelector('.mark__trail[data-side=back]'), front: svg.querySelector('.mark__trail[data-side=front]') };
    layers.front.innerHTML = SHIP;
    const ship = layers.front.firstElementChild;
    const segs = { back: [], front: [] };
    ['back', 'front'].forEach(side => {
      for (let k = 0; k < SEGS; k++) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        trails[side].appendChild(p);
        segs[side].push(p);
      }
    });

    let theta = PARK - 1.9;
    let mode = 'rest';          // rest | cruise | settle
    let settle = null, lap = null;
    let fade = 0;               // 0: ship and trail fully shown, 1: landed (hidden in the emblem)
    let raf = 0, last = 0, speed = 0, side = 'front';

    function draw() {
      const p = pos(theta);
      const depth = Math.sin(theta);
      const s = (0.88 + 0.12 * depth) * 0.8;
      const want = front(theta) ? 'front' : 'back';
      if (want !== side) { layers[want].appendChild(ship); side = want; }
      ship.setAttribute('transform', `translate(${p[0].toFixed(2)} ${p[1].toFixed(2)}) rotate(${heading(theta).toFixed(1)}) scale(${s.toFixed(3)})`);
      const shown = 1 - fade;
      ship.style.opacity = (want === 'back' ? 0.8 : 1) * shown;

      const len = 0.95 + 0.22 * Math.max(0, speed - OMEGA);
      for (let k = 0; k < SEGS; k++) {
        const a = theta - len * (k + 1) / SEGS - 0.14, b = theta - len * k / SEGS - 0.14;
        const onFront = front((a + b) / 2);
        const live = onFront ? segs.front[k] : segs.back[k];
        const dead = onFront ? segs.back[k] : segs.front[k];
        live.setAttribute('d', arc(a, b, 3));
        live.setAttribute('stroke-width', (1.6 * (1 - 0.55 * k / SEGS)).toFixed(2));
        live.setAttribute('stroke-opacity', (0.8 * Math.pow(1 - k / SEGS, 1.5) * (onFront ? 1 : 0.65) * shown).toFixed(3));
        dead.setAttribute('d', '');
      }
    }

    const hermite = (p, m0, d) => (p * p * p - 2 * p * p + p) * m0 + (-2 * p * p * p + 3 * p * p) * d;
    const hermiteD = (p, m0, d) => (3 * p * p - 4 * p + 1) * m0 + (-6 * p * p + 6 * p) * d;

    function tick(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (settle) {
        const p = Math.min(1, (now - settle.t0) / settle.T);
        theta = settle.th0 + hermite(p, settle.m0, settle.d);
        speed = hermiteD(p, settle.m0, settle.d) / (settle.T / 1000);
        fade = settle.f0 + (1 - settle.f0) * smooth(0.6, 1, p);
        if (p >= 1) {
          theta = PARK; speed = 0; fade = 1;
          const done = settle.resolve; settle = null; mode = 'rest'; done();
        }
      } else if (mode === 'cruise') {
        theta += OMEGA * dt; speed = OMEGA;
      } else if (lap) {
        // hover: the ship swings out of the emblem, flies one quick lap and lands again
        const p = Math.min(1, (now - lap.t0) / lap.T);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        theta = PARK + TAU * e;
        speed = 0;
        fade = 1 - Math.sin(Math.PI * p);
        if (p >= 1) { theta = PARK; fade = 1; lap = null; svg.classList.remove('is-lapping'); }
      }
      draw();
      if (mode === 'cruise' || settle || lap) raf = requestAnimationFrame(tick);
      else { raf = 0; last = 0; }
    }
    function run() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }

    draw();

    return {
      el: wrap,
      svg,
      cruise() { mode = 'cruise'; run(); },
      // jump straight to the landed pose
      park() { mode = 'rest'; settle = null; lap = null; theta = PARK; speed = 0; draw(); },
      // 0 shows the ship, 1 has it landed in the emblem
      setBoost(b) { fade = b; draw(); },
      // finish the current orbit and land at PARK in exactly T ms, velocity continuous
      settle(T) {
        return new Promise(resolve => {
          const m0 = (mode === 'cruise' ? OMEGA : 0) * (T / 1000);
          let target = PARK + TAU * Math.ceil((theta - PARK) / TAU);
          while (target - theta < m0 / 3 + 0.25) target += TAU;
          settle = { t0: performance.now(), T, th0: theta, d: target - theta, m0, f0: fade, resolve };
          mode = 'settle';
          run();
        });
      },
      nudge() {
        if (mode !== 'rest' || settle || lap || reduceQuery.matches) return;
        lap = { t0: performance.now(), T: 900 };
        svg.classList.add('is-lapping');
        run();
      },
      day(on) { svg.classList.toggle('is-day', !!on); },
      still(on) { svg.classList.toggle('is-still', !!on); },
      get theta() { return theta; }
    };
  };
})();
