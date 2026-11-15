# still.

A calm workspace for a NASA Space Apps team: capture cards (ideas, observations, questions, datasets, tasks), group them into collections, and watch the dashboard fill in.

## Run it

Open `index.html` in Chrome, Edge or Firefox. No install and no build step. Cards are saved in the browser (localStorage); use **Settings → Export** to keep a copy.

## The opening

- While the app loads, a planet sits in the centre of a deep-blue screen with a ship orbiting it (it passes behind the planet and leaves a trail).
- The ship circles for at least 5 seconds (`ORBIT_MS` in `js/loader.js`).
- When the app is ready, the ship finishes its lap and lands, the blue opens from the centre into the misty dashboard, and the same planet-and-ship element shrinks and flies into the header, where it becomes the logo (about 1.7 s).
- The logo goes to the Dashboard from any page. On the Dashboard it scrolls to the top; it never replays the opening. Hovering it makes the ship slip along its orbit.
- With **reduced motion** turned on (in Windows: Settings → Accessibility → Visual effects → Animation effects **off**), the ship still circles for its 5 seconds, but instead of flying into the header the opening ends in a short cross-fade.
- **Settings → Opening animation** turns the opening off; **Replay opening** plays it again.

## Choosing an environment

- Straight after the opening, a first visit shows **Where is your crew?**: the International Space Station, Mars, the Moon and a Spacecraft in transit, each a card with a photo above its name, a short description and a few facts. The whole card is the button; the chosen card gets a teal ring and a check.
- Nothing else (dashboard, nav, search) is reachable until one is chosen. **Continue to dashboard** saves it in the browser.
- On the next visit the saved environment loads straight away and the picker is skipped.
- Change it any time from the environment pill in the header, the name in the welcome panel, or **Settings → Mission environment**. New cards are stamped with the environment they were made in.

Photos (public domain, via Wikimedia Commons): ISS after STS-132 undocking (NASA), *Getting to Know Mount Sharp*, PIA16099 (NASA/JPL-Caltech/MSSS), Buzz Aldrin on Apollo 11 (NASA), Orion with the Moon and Earth on Artemis I, art001e000673 (NASA). Stored in `assets/env/`.

## Files

| File | What it does |
|---|---|
| `js/mark.js` | The planet-and-ship mark: orbit maths, front/back layering, trail, landing curve, hover nudge |
| `js/loader.js` | The opening: hold until ready, radial reveal, flying the mark into the header, reduced-motion path |
| `js/scenery.js` | The misty mountains and pines, drawn as one SVG at start-up |
| `js/app.js` | Routes, dashboard, My cards, Collections, Card library, Settings, modals, search (Ctrl K) |
| `js/store.js` | Saved state |
| `css/app.css` | Everything visual |

## Test it

```
node tools/check.mjs
```

Starts a headless Chrome or Edge and runs 75 checks, including the environment picker (order, photos loaded and above each name, one radius, even spacing, gate, selection, saving, restoring on reopen, changing, cancel, phone and tablet layouts) and: the loader covers the screen with the mark in the exact centre; the ship orbits while loading; clicks do nothing until the app is ready; the reveal takes 1.5–2 s; the mark lands exactly in the header slot as the same element; logo navigation; the add-card flow; every route; search; desktop, wide, tablet, phone and 320 px widths with no sideways scroll; reduced motion; the opening switched off; and no script errors. Screenshots of each stage go to `tools/shots/`.
