/* The opening: orbit while loading, then reveal the app and fly the mark into the header. */
(function () {
  const S = (window.Still = window.Still || {});
  const html = document.documentElement;
  const ORBIT_MS = 5000; // how long the ship circles the planet before the reveal

  S.intro = {
    start(mark) {
      const loader = document.getElementById('loader');
      const topbar = document.getElementById('topbar');
      const main = document.getElementById('main');
      const slot = document.getElementById('brandSlot');
      const caption = loader && loader.querySelector('.loader__caption');
      const tint = loader && loader.querySelector('.loader__tint');
      const flip = mark.el;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const timing = (S.introTiming = { start: performance.now(), frames: [] });

      function done() {
        if (loader && loader.isConnected) loader.remove();
        html.classList.remove('intro-active', 'intro-chrome', 'intro-revealing');
        main.inert = false;
        topbar.inert = false;
        flip.getAnimations().forEach(a => a.cancel());
        flip.style.transform = '';
        flip.style.opacity = '';
        topbar.querySelectorAll('[style*="--d"]').forEach(el => el.style.removeProperty('--d'));
        mark.still(true);
        timing.done = performance.now();
        S.introDone = true;
        document.dispatchEvent(new CustomEvent('still:intro-done'));
      }

      // Intro turned off in Settings: the logo is simply there.
      if (!loader || html.classList.contains('no-intro')) {
        mark.park(); mark.setBoost(1); mark.day(true);
        done();
        return { finish: () => Promise.resolve() };
      }

      loader.classList.add('is-live');   // cancels the CSS failsafe
      main.inert = true;
      topbar.inert = true;
      sprinkleStars(loader);

      let geo = null, placing = true;
      function place() {
        if (!placing) return;
        flip.style.transform = '';
        const r = slot.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        // the mark is 1.5:1 (the emblem plus its orbit); size is its width on the loader
        const size = Math.max(240, Math.min(440, vw * 0.88, vh * 0.48 * 1.5));
        const s = size / r.width;
        const height = size * r.height / r.width;
        const dx = vw / 2 - (r.left + r.width / 2);
        const dy = vh / 2 - (r.top + r.height / 2);
        geo = { dx, dy, s };
        flip.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
        if (caption) caption.style.top = `calc(50% + ${Math.round(height / 2 + 34)}px)`;
      }
      place();
      window.addEventListener('resize', place);
      // web fonts arriving can reflow the header and move the slot: keep the mark centred until the reveal
      const ro = 'ResizeObserver' in window ? new ResizeObserver(() => place()) : null;
      if (ro) { ro.observe(topbar); ro.observe(slot.parentElement); }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place());
      flip.classList.add('is-entering');
      // the orbit always plays (requested); reduced motion only swaps the big fly-in for a fade
      mark.cruise();

      async function finish(ready) {
        const hold = new URLSearchParams(location.search).has('hold');
        const minShow = wait(ORBIT_MS);       // the ship orbits for at least 5 s
        const capped = Promise.race([Promise.resolve(ready).catch(() => {}), wait(6000)]);
        await Promise.all([minShow, capped, hold ? new Promise(r => { S.releaseIntro = r; }) : null]);
        timing.ready = performance.now();
        place();
        placing = false;
        window.removeEventListener('resize', place);
        if (ro) ro.disconnect();
        if (reduce) await quiet(); else await cinematic();
        done();
      }

      // ~1.7 s: the ship finishes its lap and lands while the blue is absorbed and the mark flies home
      async function cinematic() {
        const T = 1700;
        const { dx, dy, s } = geo;
        sampleFrames(T + 200);
        html.classList.add('intro-revealing');
        const landed = mark.settle(T);
        loader.classList.add('is-revealing');
        const anims = [
          loader.animate([{ '--hole': '-18vmax' }, { '--hole': '96vmax' }], { duration: 1500, delay: 140, easing: 'cubic-bezier(.55,0,.3,1)', fill: 'both' }),
          tint.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.55 }, { opacity: 0.6 }], { duration: 1500, easing: 'ease-in-out', fill: 'both' }),
          loader.animate([{ opacity: 1 }, { opacity: 1, offset: 0.62 }, { opacity: 0 }], { duration: T, fill: 'both' }),
          flip.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(${s})`, easing: 'cubic-bezier(.62,0,.22,1)' },
            { transform: 'translate(0px, 0px) scale(0.93)', offset: 0.86, easing: 'cubic-bezier(.3,0,.3,1)' },
            { transform: 'translate(0px, 0px) scale(1)' }
          ], { duration: 1480, delay: 220, fill: 'both' })
        ];
        flip.style.transform = '';
        if (caption) anims.push(caption.animate([{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, 8px)' }], { duration: 360, easing: 'ease-in', fill: 'both' }));
        setTimeout(() => mark.day(true), 520);
        setTimeout(() => html.classList.remove('intro-chrome'), 1000);
        await Promise.all([landed, ...anims.map(a => a.finished.catch(() => {}))]);
      }

      // reduced motion: no travel, only a cross-fade
      async function quiet() {
        await flip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished;
        flip.getAnimations().forEach(a => a.cancel());
        mark.park();
        flip.style.opacity = '0';
        flip.style.transform = '';
        mark.setBoost(1); mark.day(true);
        html.classList.add('intro-revealing');
        html.classList.remove('intro-chrome');
        const a = loader.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
        const b = flip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
        await Promise.all([a.finished, b.finished]);
      }

      function sampleFrames(ms) {
        const end = performance.now() + ms;
        let prev = 0;
        const step = now => {
          if (prev) timing.frames.push(now - prev);
          prev = now;
          if (now < end) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }

      return { finish };
    }
  };

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function sprinkleStars(loader) {
    const el = loader.querySelector('.loader__stars');
    if (!el) return;
    const w = Math.max(window.innerWidth, 400), h = Math.max(window.innerHeight, 400);
    const out = [];
    for (let i = 0; i < 80; i++) {
      const x = Math.round(Math.random() * w), y = Math.round(Math.random() * h);
      const a = (0.18 + Math.random() * 0.5).toFixed(2);
      const spread = Math.random() < 0.12 ? 1 : 0;
      out.push(`${x}px ${y}px 0 ${spread}px rgba(214,232,248,${a})`);
    }
    el.style.boxShadow = out.join(',');
  }
})();
