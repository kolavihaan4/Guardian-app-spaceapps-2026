/* The misty mountain backdrop: drawn once as an SVG, decoded, then shown as a fixed background. */
(function () {
  const S = (window.Still = window.Still || {});
  const W = 2400, H = 1400;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const f = n => Math.round(n * 10) / 10;

  // midpoint displacement along a line, for jagged ridges
  function displace(r, levels, amp, rough) {
    const N = 1 << levels, a = new Array(N + 1).fill(0);
    let step = N, d = amp;
    while (step > 1) {
      const h = step / 2;
      for (let i = h; i < N; i += step) a[i] = (a[i - h] + a[i + h]) / 2 + (r() * 2 - 1) * d;
      d *= rough; step = h;
    }
    return a;
  }
  function ridge(r, x0, x1, base, levels, amp, rough) {
    const off = displace(r, levels, amp, rough), N = off.length - 1;
    let d = 'M' + x0 + ' ' + H + ' ';
    for (let i = 0; i <= N; i++) {
      const x = x0 + (x1 - x0) * i / N;
      d += 'L' + f(x) + ' ' + f(base(x) + off[i]) + ' ';
    }
    return d + 'L' + x1 + ' ' + H + ' Z';
  }
  const bump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));

  // a pine: drooping tiers zig-zagging down both sides, a short trunk
  function pine(r, x, y, h) {
    const w = h * (0.27 + r() * 0.08), tiers = 9 + Math.floor(r() * 5);
    const R = [], L = [];
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers, ty = y - h + h * 0.9 * t;
      const reach = (w / 2) * Math.pow(t, 0.92);
      const hr = reach * (0.8 + r() * 0.4), hl = reach * (0.8 + r() * 0.4);
      const dr = h * 0.03 * (0.6 + r() * 0.7), dl = h * 0.03 * (0.6 + r() * 0.7);
      const ir = 0.32 + r() * 0.22, il = 0.32 + r() * 0.22;
      R.push([x + hr, ty + dr], [x + hr * ir, ty + dr * 0.15]);
      L.push([x - hl, ty + dl], [x - hl * il, ty + dl * 0.15]);
    }
    // no trunk and no flat base: the tree closes just under its lowest boughs and the mist hides the rest
    let d = 'M' + f(x) + ' ' + f(y - h);
    R.forEach(p => { d += 'L' + f(p[0]) + ' ' + f(p[1]); });
    d += 'L' + f(x) + ' ' + f(y - h * 0.02);
    for (let i = L.length - 1; i >= 0; i--) d += 'L' + f(L[i][0]) + ' ' + f(L[i][1]);
    return d + 'Z';
  }

  function forest(r, count, sides, baseY, baseJitter, hMin, hMax) {
    const trees = [];
    for (let i = 0; i < count; i++) {
      const side = sides[i % sides.length];
      const k = Math.pow(r(), 1.5); // denser toward the outer edge
      const x = side.edge + side.dir * side.span * k;
      const edgeness = 1 - k;
      const h = hMin + (hMax - hMin) * (0.35 + 0.65 * edgeness) * (0.75 + r() * 0.35);
      trees.push({ x, y: baseY + r() * baseJitter, h });
    }
    trees.sort((a, b) => a.h - b.h);
    return '<path d="' + trees.map(t => pine(r, t.x, t.y, t.h)).join('') + '"/>';
  }

  // an even run of pines across a span (for the horizon and the forest floor)
  function treeline(r, count, x0, x1, baseY, jitter, hMin, hMax) {
    const trees = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * (i + r() * 0.9) / count;
      trees.push({ x, y: baseY + r() * jitter, h: hMin + (hMax - hMin) * Math.pow(r(), 1.8) });
    }
    trees.sort((a, b) => a.y - b.y); // back rows first
    return '<path d="' + trees.map(t => pine(r, t.x, t.y, t.h)).join('') + '"/>';
  }

  function build() {
    const r = rng(20261114);
    const far = ridge(r, 1150, 2500, x => 770 - 470 * bump(x, 2190, 330) - 190 * bump(x, 1800, 190) - 150 * bump(x, 2440, 140), 7, 70, 0.55);
    const near = ridge(r, 1350, 2500, x => 880 - 300 * bump(x, 2060, 250) - 170 * bump(x, 1640, 210) - 90 * bump(x, 2380, 120), 7, 46, 0.52);
    const leftRidge = ridge(r, -100, 2500, x => 900 - 110 * bump(x, 140, 260) - 60 * bump(x, 520, 200) + 40 * bump(x, 1300, 500), 7, 26, 0.5);

    const farTrees = forest(r, 46, [{ edge: -40, dir: 1, span: 640 }, { edge: 2440, dir: -1, span: 640 }], 935, 90, 120, 270);
    const midTrees = forest(r, 26, [{ edge: -60, dir: 1, span: 430 }, { edge: 2460, dir: -1, span: 430 }], 1110, 110, 260, 470);
    const nearTrees = forest(r, 12, [{ edge: -90, dir: 1, span: 260 }, { edge: 2490, dir: -1, span: 260 }], 1390, 60, 520, 780);
    const horizon = treeline(r, 230, -40, 2440, 990, 26, 34, 140);
    const floorBack = treeline(r, 110, -60, 2460, 1210, 70, 90, 210);
    const floorFront = treeline(r, 70, -60, 2460, 1320, 110, 150, 320);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
<defs>
 <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7ebee"/><stop offset=".5" stop-color="#e0e6eb"/><stop offset="1" stop-color="#d6dfe6"/></linearGradient>
 <linearGradient id="peak" x1="0" y1="0" x2="0" y2="1"><stop offset=".15" stop-color="#b7cbe1"/><stop offset=".42" stop-color="#d2ddea"/><stop offset=".62" stop-color="#dbe2e8"/></linearGradient>
 <linearGradient id="peak2" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#9cb8d8"/><stop offset=".6" stop-color="#c8d5e5"/><stop offset=".75" stop-color="#dae2e7"/></linearGradient>
 <linearGradient id="lav" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#c1b2f0"/><stop offset=".55" stop-color="#d8cef6"/><stop offset=".75" stop-color="#dfe4ea"/></linearGradient>
 <linearGradient id="lav2" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#b7a5ee"/><stop offset=".68" stop-color="#d4dce5"/></linearGradient>
 <linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#afc2d5"/><stop offset=".78" stop-color="#d7dfe6"/></linearGradient>
 <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ebeff1" stop-opacity="0"/><stop offset=".5" stop-color="#ebeff1" stop-opacity=".66"/><stop offset="1" stop-color="#ebeff1" stop-opacity="0"/></linearGradient>
 <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8ecef" stop-opacity="0"/><stop offset="1" stop-color="#e8ecef" stop-opacity=".37"/></linearGradient>
 <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe5eb" stop-opacity="0"/><stop offset=".1" stop-color="#dfe5eb"/><stop offset=".55" stop-color="#d4dce5"/><stop offset="1" stop-color="#ccd7e0"/></linearGradient>
 <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86a6cb" stop-opacity="0"/><stop offset=".45" stop-color="#86a6cb" stop-opacity=".55"/><stop offset="1" stop-color="#5181b8" stop-opacity=".8"/></linearGradient>
 <radialGradient id="veil" cx="50%" cy="48%" r="50%"><stop offset="0" stop-color="#ebeef0" stop-opacity=".39"/><stop offset="1" stop-color="#ebeef0" stop-opacity="0"/></radialGradient>
 <linearGradient id="dRidge" gradientUnits="userSpaceOnUse" x1="0" y1="760" x2="0" y2="1000"><stop offset="0" stop-color="#92b0d3"/><stop offset="1" stop-color="#b9cbdf"/></linearGradient>
 <linearGradient id="dFar" gradientUnits="userSpaceOnUse" x1="0" y1="660" x2="0" y2="1025"><stop offset="0" stop-color="#6e96c4"/><stop offset="1" stop-color="#9cb6d4"/></linearGradient>
 <linearGradient id="dHor" gradientUnits="userSpaceOnUse" x1="0" y1="850" x2="0" y2="1020"><stop offset="0" stop-color="#86a6cb"/><stop offset="1" stop-color="#aac0d8"/></linearGradient>
 <linearGradient id="dMid" gradientUnits="userSpaceOnUse" x1="0" y1="650" x2="0" y2="1220"><stop offset="0" stop-color="#477cb8"/><stop offset="1" stop-color="#6993c3"/></linearGradient>
 <linearGradient id="dBack" gradientUnits="userSpaceOnUse" x1="0" y1="1000" x2="0" y2="1280"><stop offset="0" stop-color="#406fa5"/><stop offset="1" stop-color="#6389b4"/></linearGradient>
 <linearGradient id="dFront" gradientUnits="userSpaceOnUse" x1="0" y1="1020" x2="0" y2="1400"><stop offset="0" stop-color="#345e8d"/><stop offset="1" stop-color="#50749c"/></linearGradient>
 <linearGradient id="dNear" gradientUnits="userSpaceOnUse" x1="0" y1="560" x2="0" y2="1400"><stop offset="0" stop-color="#284a71"/><stop offset="1" stop-color="#335378"/></linearGradient>
 <filter id="b6" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6"/></filter>
 <filter id="b3" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter>
 <filter id="b1"><feGaussianBlur stdDeviation="1.2"/></filter>
 <filter id="b30" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<path d="${far}" fill="url(#peak)" filter="url(#b6)"/>
<path d="M-60 610 C 110 530 260 470 430 500 C 640 540 780 600 1020 612 C 1220 622 1360 640 1520 664 C 1800 700 2100 760 2460 800 L2460 ${H} L-60 ${H} Z" fill="url(#lav)" filter="url(#b3)"/>
<rect x="0" y="560" width="${W}" height="300" fill="url(#fog)" filter="url(#b30)"/>
<path d="${near}" fill="url(#peak2)" filter="url(#b3)"/>
<path d="M-60 712 C 150 650 330 618 530 660 C 770 708 990 726 1260 724 C 1500 722 1700 750 1950 790 C 2150 812 2300 822 2460 828 L2460 ${H} L-60 ${H} Z" fill="url(#lav2)" opacity=".93" filter="url(#b6)"/>
<path d="${leftRidge}" fill="url(#dRidge)" opacity=".62" filter="url(#b6)"/>
<g fill="url(#dFar)" opacity=".7" filter="url(#b3)">${farTrees}</g>
<path d="M-60 820 C 300 770 620 800 920 812 C 1240 824 1600 790 2460 800 L2460 ${H} L-60 ${H} Z" fill="url(#band)" opacity=".7" filter="url(#b6)"/>
<rect x="0" y="780" width="${W}" height="380" fill="url(#fog)" filter="url(#b30)"/>
<g fill="url(#dHor)" opacity=".6" filter="url(#b3)">${horizon}<rect x="-40" y="986" width="${W + 80}" height="34"/></g>
<rect x="-20" y="1010" width="${W + 40}" height="390" fill="url(#lake)" filter="url(#b3)"/>
<g fill="#8da4be" opacity=".15" filter="url(#b6)" transform="translate(0 1012) scale(1 -0.5) translate(0 -1012)">${horizon}</g>
<rect x="-40" y="1004" width="${W + 80}" height="14" fill="#ebeff1" opacity=".55" filter="url(#b6)"/>
<g fill="url(#dMid)" opacity=".84" filter="url(#b1)">${midTrees}</g>
<rect x="0" y="1050" width="${W}" height="240" fill="url(#fog)" opacity=".4" filter="url(#b30)"/>
<g fill="url(#dBack)" opacity=".66" filter="url(#b3)">${floorBack}</g>
<rect x="0" y="1130" width="${W}" height="220" fill="url(#fog)" opacity=".3" filter="url(#b30)"/>
<g fill="url(#dFront)" opacity=".76" filter="url(#b1)">${floorFront}</g>
<rect x="0" y="1180" width="${W}" height="220" fill="url(#ground)"/>
<g fill="url(#dNear)" opacity=".94">${nearTrees}</g>
<ellipse cx="1200" cy="700" rx="980" ry="560" fill="url(#veil)"/>
<rect x="0" y="1200" width="${W}" height="200" fill="url(#floor)"/>
</svg>`;
  }

  // Three small things move in the sky behind every page: a craft that crosses every half minute or
  // so, a capsule and a rocket. They are styled in css/sitenav.css, which the home site and the health
  // app both load, and hidden under reduced motion. Made once per backdrop, however often this runs.
  function sky(el) {
    if (!el || el.querySelector('.sky-pass')) return;
    const pass = document.createElement('span');
    pass.className = 'sky-pass';
    pass.setAttribute('aria-hidden', 'true');
    el.appendChild(pass);
    // and, less often, a capsule comes down under its parachutes and lands on the lake
    const chute = document.createElement('span');
    chute.className = 'sky-chute';
    chute.setAttribute('aria-hidden', 'true');
    chute.innerHTML = '<svg viewBox="0 0 40 52"><g fill="#fdfdfd" stroke="#d9805a" stroke-width="0.9" stroke-linejoin="round">'
      + '<path d="M1 15 A7 7 0 0 1 15 15 Z"/><path d="M25 15 A7 7 0 0 1 39 15 Z"/><path d="M12 11 A8 8 0 0 1 28 11 Z"/></g>'
      + '<path d="M1 15 L18 38 M15 15 L19 38 M12 11 L19 38 M28 11 L21 38 M25 15 L21 38 M39 15 L22 38" fill="none" stroke="#2c4a6e" stroke-width="0.45" opacity="0.75"/>'
      + '<path d="M16 38 L24 38 L27 46 Q20 49.5 13 46 Z" fill="#1f3550"/></svg>';
    el.appendChild(chute);
    // and every fifteen seconds a small Saturn V, the Apollo 11 rocket, lifts off from the far shore
    const rocket = document.createElement('span');
    rocket.className = 'sky-rocket';
    rocket.setAttribute('aria-hidden', 'true');
    rocket.innerHTML = '<svg viewBox="0 0 14 78"><g class="sky-rocket__flame"><path d="M3.6 56 Q7 80 10.4 56 Z" fill="#f59a3c"/><path d="M5.2 56 Q7 70 8.8 56 Z" fill="#ffe9a6"/></g>'
      + '<path d="M7 0 V6" stroke="#55657a" stroke-width="0.5"/><path d="M5.6 9.5 L7 5.4 L8.4 9.5 Z" fill="#dfe5ec" stroke="#3a4b60" stroke-width="0.25"/>'
      + '<g fill="#f8f9fb" stroke="#3a4b60" stroke-width="0.25"><rect x="5.3" y="9.5" width="3.4" height="8.5"/><path d="M5.3 18 L3.9 23 H10.1 L8.7 18 Z"/><rect x="3.9" y="23" width="6.2" height="13"/><rect x="3.3" y="36" width="7.4" height="19"/></g>'
      + '<g fill="#1c2836"><rect x="5.3" y="12.5" width="3.4" height="1.3"/><rect x="3.9" y="29.5" width="6.2" height="1.8"/><rect x="3.3" y="40" width="1.9" height="8.5"/><rect x="8.8" y="40" width="1.9" height="8.5"/>'
      + '<path d="M3.3 49.5 L1 56 H3.3 Z"/><path d="M10.7 49.5 L13 56 H10.7 Z"/><rect x="4.2" y="55" width="5.6" height="1.4"/></g></svg>';
    el.appendChild(rocket);
  }

  S.scenery = {
    sky,
    // resolves once the picture is decoded and on screen (or failed: the CSS gradient stays)
    render(el) {
      sky(el);
      return new Promise(resolve => {
        if (!el) return resolve();
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(build());
        const img = new Image();
        img.src = url;
        const show = () => { el.style.backgroundImage = 'url("' + url + '")'; el.classList.add('is-ready'); resolve(); };
        (img.decode ? img.decode() : Promise.resolve()).then(show, () => resolve());
      });
    }
  };
  // the backdrop is in the page before this script on both sites, so the sky does not wait for render()
  sky(document.getElementById('scenery'));
})();
