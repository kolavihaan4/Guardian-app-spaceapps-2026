/* The planet-and-ship mark. One element: it orbits in the loader and becomes the header logo. */
(function () {
  const S = (window.Still = window.Still || {});
  const TAU = Math.PI * 2;
  const C = 60, RX = 49, RY = 16.5, TILT = (-16 * Math.PI) / 180;
  const PARK = 0.42;            // where the ship rests in the logo: front right
  const PERIOD = 4.2;           // seconds per orbit while loading
  const OMEGA = TAU / PERIOD;
  const SEGS = 9;               // trail segments per side
  const cosT = Math.cos(TILT), sinT = Math.sin(TILT);

  function pos(th) {
    const ex = RX * Math.cos(th), ey = RY * Math.sin(th);
    return [C + ex * cosT - ey * sinT, C + ex * sinT + ey * cosT];
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

  const TEMPLATE = `
<svg class="mark" viewBox="4 20 112 80" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="mk-planet" cx="36%" cy="30%" r="78%">
      <stop offset="0" stop-color="#eef5f9"/><stop offset=".32" stop-color="#abc4d4"/>
      <stop offset=".7" stop-color="#557791"/><stop offset="1" stop-color="#203d56"/>
    </radialGradient>
    <radialGradient id="mk-halo" cx="50%" cy="50%" r="50%">
      <stop offset=".66" stop-color="#cfe6f4" stop-opacity="0"/><stop offset=".74" stop-color="#cfe6f4" stop-opacity=".5"/>
      <stop offset="1" stop-color="#cfe6f4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mk-shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset=".42" stop-color="#081624" stop-opacity="0"/><stop offset="1" stop-color="#081624" stop-opacity=".55"/>
    </linearGradient>
    <radialGradient id="mk-flame" cx="50%" cy="50%" r="50%">
      <stop class="mark__flame-stop" offset="0" stop-opacity=".95"/><stop class="mark__flame-stop" offset="1" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="mk-clip"><circle cx="60" cy="60" r="24"/></clipPath>
  </defs>
  <circle class="mark__halo" cx="60" cy="60" r="36" fill="url(#mk-halo)"/>
  <path class="mark__orbit" d="${arc(Math.PI, TAU, 40)}"/>
  <g class="mark__trail" data-side="back"></g>
  <g class="mark__layer" data-side="back"></g>
  <g class="mark__planet">
    <circle cx="60" cy="60" r="24" fill="url(#mk-planet)"/>
    <g clip-path="url(#mk-clip)"><g class="mark__bands">
      <ellipse cx="54" cy="52" rx="34" ry="3.2" fill="#fff" opacity=".13"/>
      <ellipse cx="66" cy="63" rx="30" ry="2.4" fill="#fff" opacity=".1"/>
      <ellipse cx="58" cy="72" rx="32" ry="2.8" fill="#0d2236" opacity=".12"/>
    </g></g>
    <circle cx="60" cy="60" r="24" fill="url(#mk-shade)"/>
    <circle cx="60" cy="60" r="23.7" fill="none" stroke="#e6f3fb" stroke-opacity=".35" stroke-width=".6"/>
  </g>
  <path class="mark__orbit" d="${arc(0, Math.PI, 40)}"/>
  <g class="mark__trail" data-side="front"></g>
  <g class="mark__layer" data-side="front"></g>
</svg>`;

  const SHIP = `<g class="mark__ship">
    <circle class="mark__flame" cx="-7.6" cy="0" r="3.4" fill="url(#mk-flame)"/>
    <path class="mark__hull" d="M9 0C5 -3.2 -2 -4.3 -6.2 -4.7L-4.3 0L-6.2 4.7C-2 4.3 5 3.2 9 0Z"/>
    <path class="mark__cockpit" d="M5.4 0C4 -1.25 1.8 -1.55 .6 -1.35V1.35C1.8 1.55 4 1.25 5.4 0Z"/>
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
    let settle = null, nudge = null;
    let boost = 0;              // 0 in the loader, 1 as the logo: bigger ship, heavier lines
    let raf = 0, last = 0, speed = 0, side = 'front';

    function draw() {
      const p = pos(theta);
      const depth = Math.sin(theta);
      const s = (0.88 + 0.12 * depth) * (1 + 0.6 * boost);
      const want = front(theta) ? 'front' : 'back';
      if (want !== side) { layers[want].appendChild(ship); side = want; }
      ship.setAttribute('transform', `translate(${p[0].toFixed(2)} ${p[1].toFixed(2)}) rotate(${heading(theta).toFixed(1)}) scale(${s.toFixed(3)})`);
      ship.style.opacity = want === 'back' ? 0.82 : 1;

      const len = 0.95 + 0.22 * Math.max(0, speed - OMEGA);
      const baseW = 1.5 * (1 + 0.9 * boost);
      for (let k = 0; k < SEGS; k++) {
        const a = theta - len * (k + 1) / SEGS - 0.12, b = theta - len * k / SEGS - 0.12;
        const mid = (a + b) / 2;
        const onFront = front(mid);
        const d = arc(a, b, 3);
        const fade = Math.pow(1 - k / SEGS, 1.5);
        const live = onFront ? segs.front[k] : segs.back[k];
        const dead = onFront ? segs.back[k] : segs.front[k];
        live.setAttribute('d', d);
        live.setAttribute('stroke-width', (baseW * (1 - 0.55 * k / SEGS)).toFixed(2));
        live.setAttribute('stroke-opacity', (0.8 * fade * (onFront ? 1 : 0.7)).toFixed(3));
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
        boost = settle.b0 + (1 - settle.b0) * (p * p * (3 - 2 * p));
        if (p >= 1) {
          theta = PARK; speed = 0; boost = 1;
          const done = settle.resolve; settle = null; mode = 'rest'; done();
        }
      } else if (mode === 'cruise') {
        theta += OMEGA * dt; speed = OMEGA;
      } else if (nudge) {
        const p = Math.min(1, (now - nudge.t0) / nudge.T);
        theta = nudge.base + nudge.amp * Math.sin(Math.PI * p) * (1 - 0.15 * p);
        speed = 0;
        if (p >= 1) { theta = nudge.base; nudge = null; }
      }
      draw();
      if (mode === 'cruise' || settle || nudge) raf = requestAnimationFrame(tick);
      else { raf = 0; last = 0; }
    }
    function run() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }

    draw();

    return {
      el: wrap,
      svg,
      cruise() { mode = 'cruise'; run(); },
      // jump straight to the logo pose
      park() { mode = 'rest'; settle = null; nudge = null; theta = PARK; speed = 0; draw(); },
      setBoost(b) { boost = b; draw(); },
      // finish the current orbit and land on PARK in exactly T ms, velocity continuous
      settle(T) {
        return new Promise(resolve => {
          const m0 = (mode === 'cruise' ? OMEGA : 0) * (T / 1000);
          let target = PARK + TAU * Math.ceil((theta - PARK) / TAU);
          while (target - theta < m0 / 3 + 0.25) target += TAU;
          settle = { t0: performance.now(), T, th0: theta, d: target - theta, m0, b0: boost, resolve };
          mode = 'settle';
          run();
        });
      },
      // a small hover answer: the ship slips forward along its orbit and back
      nudge() {
        if (mode !== 'rest' || settle || nudge || reduceQuery.matches) return;
        nudge = { t0: performance.now(), base: PARK, amp: 0.6, T: 950 };
        run();
      },
      day(on) { svg.classList.toggle('is-day', !!on); },
      still(on) { svg.classList.toggle('is-still', !!on); },
      get theta() { return theta; }
    };
  };
})();
