# Flux

**A browser instrument for generative, audio-reactive art.** Pick a visual mode, feed it a
song or your mic, shape it with a synth-style control panel, and walk away with a poster,
an SVG or a video clip that anyone can recreate exactly from its link.

**Live:** _add your Vercel URL here_ · **Demo:** _add a GIF / video here (record one with
"Record clip" in the studio)_

Next.js (App Router) · TypeScript strict · p5.js (instance mode) · Web Audio API ·
Tweakpane · Zustand · zod · Web Workers · Vitest

---

## What it does

| Route                       |                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/`                         | A slowly evolving flow field behind a one-line intro. Static still with reduced motion. No p5 in this bundle. |
| `/studio`                   | The instrument: canvas + rack of modules (Mode, Input, Params, Export, Quality).                              |
| `/studio?mode=…&seed=…&p=…` | The same, restored from the link.                                                                             |
| `/gallery`                  | 11 curated seeds with thumbnails rendered in a Web Worker.                                                    |

### Five modes

| Key | Mode           | Algorithm                                                                                     | Audio mapping                                                       |
| --- | -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Flow field     | Perlin noise → grid of vectors (bilinearly interpolated); ~4k particles leave fading trails   | Bass → particle speed · treble → noise scale                        |
| 2   | Circle packing | Random points grow until they touch; spatial-grid collision checks; generated in a Web Worker | Beat onsets plant circles that grow until they touch                |
| 3   | Terrain        | 2-octave noise height map → contour lines via single-pass marching squares                    | 32-band spectrum raises ridges, low → high frequencies left → right |
| 4   | Orbits         | Particles on harmonic Lissajous curves `x = A·sin(a·t + δ)`, `y = B·sin(b·t)`                 | Mids twist the a : b ratio · volume lengthens trails                |
| 5   | Recursive tree | `branch(len, angle)` recursion; per-branch jitter from a stateless hash of the node index     | Volume opens the branch angle · bass grows extra (fractional) depth |

### Keyboard

`Space` play/pause · `R` randomise · `S` save PNG · `1–5` mode · `H` hide UI · `?` shortcuts · `Esc` close / show UI.
Single keys, no modifiers, ignored while typing in a field. Every action also has a visible button.

---

## How seeds work

Every random decision goes through one seeded PRNG ([`lib/random.ts`](lib/random.ts),
mulberry32) and seeded Perlin noise built from the same seed. Same seed → same numbers →
same picture.

The URL stores only what you can't derive:

```
/studio?mode=terrain&seed=2024&p=palette:blueprint,levels:24,noiseScale:3.2
```

- `mode` and `seed`, plus **only the params that differ from the mode's defaults**, so links stay short.
- Decoded through the mode's zod schema, where every field has `.catch(default)`. A
  hand-edited `density=banana` or a removed param falls back to the default instead of
  crashing. Round-trip tested for every mode.
- Written with `history.replaceState`, debounced 300 ms, so dragging a slider doesn't flood the back button.
- **Randomise** picks a new seed (the one place real entropy is used), then draws new
  params from an RNG seeded _by that seed_, so even a randomised result is reproducible.
  Locked params are kept.

Posters and SVGs are re-rendered from the seed with fixed 1/60 s steps and no audio, so the
same link always exports the same image. The live view also reacts to audio, so it drifts
from that baseline while music plays.

---

## Performance

### FPS per mode per quality tier

Measured on the production build with headless Chrome, so the numbers are reproducible.
`draw` is the JS time inside `sketch.draw()` per frame. **Caveat:** headless Chrome
rasterises in software, so FPS here is pessimistic for pixel-heavy work; draw-ms carries
over better to real devices. Headless runs at 120 Hz, so 120 fps is the cap.

| Mode / tier                | Desktop 1280×800         | Phone emulation (390×844 @3×, 4× CPU throttle) |
| -------------------------- | ------------------------ | ---------------------------------------------- |
| Flow · high                | 120 fps · 1.1 ms         | 33 fps · 11.6 ms                               |
| Flow · medium              | 120 fps · 0.8 ms         | 79 fps · 7.9 ms                                |
| Flow · low                 | 120 fps · 0.6 ms         | **119 fps · 4.5 ms**                           |
| Packing · high / med / low | 120 fps · <0.1 ms        | 120 fps · 0.1 ms                               |
| Terrain · high             | 115 fps · 1.8 ms         | 111 fps · 6.0 ms                               |
| Terrain · medium           | 119 fps · 0.9 ms         | 119 fps · 3.1 ms                               |
| Terrain · low              | 119 fps · 0.6 ms         | **119 fps · 2.2 ms**                           |
| Orbits · high / med / low  | 118–120 fps · 0.1–0.3 ms | 120 fps · 1.0–1.6 ms                           |
| Tree · high                | 120 fps · 0.7 ms         | 110 fps · 8.6 ms                               |
| Tree · medium              | 120 fps · 0.7 ms         | 117 fps · 6.5 ms                               |
| Tree · low                 | 120 fps · 0.8 ms         | **115 fps · 6.3 ms**                           |

Targets: 60 fps on a laptop at default quality ✔ · ≥30 fps on a phone at the
low tier ✔ (every mode ≥115 fps in emulation). Phones start on the low tier
(`guessTier`), and the FPS monitor steps down a tier if FPS stays under 45 for 3 s.

**Still to do:** measure on real hardware (see "Testing on your phone" below) and replace
or extend this table.

### Numbers worth knowing

| What                                                  | Before                                                                  | After                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Circle packing, main thread vs worker (2,143 circles) | canvas frozen **~92 ms** (5–6 dropped frames)                           | worst frame gap **~9 ms** (no drops); same ~90 ms of work, off-thread                    |
| Spatial grid vs naive O(n²) scan, identical output    | 1.0 s / 2.8 s / 26.7 s                                                  | **77 ms / 61 ms / 142 ms** (13× / 46× / 188×, max radius 70 / 30 / 15 px)                |
| 3000 px flow-field poster                             | main-thread p5 buffer: live canvas froze up to **10.4 s**, 15.7 s total | worker + `OffscreenCanvas`: **0** frame gaps > 100 ms, live canvas at 120 fps, 6 s total |
| Terrain, desktop high tier                            | one marching-squares pass per level: **24 fps**                         | single pass into `Path2D` per level: **115 fps**                                         |

Reproduce the packing benchmark: open `/studio?bench=1`, then run `await __fluxBench(4000)` in the console.

### Lighthouse (production build, Lighthouse 12, mobile preset)

| Page       | Performance | Accessibility | Best practices | SEO |
| ---------- | ----------- | ------------- | -------------- | --- |
| `/`        | 88          | 100           | 100            | 100 |
| `/studio`  | 65          | 100           | 100            | 100 |
| `/gallery` | 66          | 100           | 100            | 100 |

`/studio` performance is mostly p5 2.x (~1 MB) booting under Lighthouse's simulated slow 4G
and 4× CPU throttle. It's loaded with a dynamic `import()` so it never touches `/`.
Trimming p5 to its core modules is the obvious next step.

### Bundle split (verified)

The landing page loads **no p5 and no Tweakpane** code. That was checked by fetching every
script `/` loads and searching for p5 and Tweakpane markers; `/studio` loads two chunks of
each. The landing art uses the same flow-field sketch on a plain `<canvas>`.

---

## Architecture in one picture

```
AudioContext ─► AnalyserNode ─► features.ts (bands, beat, smoothing)
                                          │
Zustand (params, seed) ──► ref snapshot ──┼──► sketch.draw(surface, ctx, audio)
                                          │
                       (React does NOT re-render per frame)
```

- Sketches implement one interface ([`sketches/types.ts`](sketches/types.ts)), a strategy
  pattern. They draw on a `Surface` (a 2D context + size) and never touch React or the DOM.
- p5 runs in **instance mode** inside [`P5Canvas.tsx`](components/studio/P5Canvas.tsx),
  created in an effect and removed with `p.remove()` on cleanup. A `cancelled` flag
  guards the async import against React StrictMode's double-mount.
- Workers: [`packing.worker.ts`](workers/packing.worker.ts) (circle packing) and
  [`render.worker.ts`](workers/render.worker.ts) (posters, SVGs, thumbnails).

### Key decisions

| Decision | Why |
|---|---|
| p5 in instance mode, inside a React effect | Isolated per mount, destroyed cleanly on cleanup |
| Sketch reads params from a ref, not props | No React re-render per frame |
| Sketches draw on a plain 2D context (`Surface`), p5 owns the loop | Batched paths are much cheaper than per-call drawing; the same code runs on the live canvas, in a worker, in thumbnails and on the landing page |
| Posters render in a worker on an `OffscreenCanvas` | A main-thread render froze the live canvas for up to 10 s; off-thread it drops no frames |
| Single-pass marching squares | Each cell only tests the levels it spans: terrain 24 → 115 fps |
| Randomise is seeded by the new seed | Even random results are shareable links |

### Project structure

```
app/          routes: landing, studio, gallery (+ metadata, icon, robots, sitemap)
components/   React UI: studio shell, p5 wrapper, control rack, gallery, landing art
sketches/     the five modes, behind one Sketch interface (no React, no DOM)
lib/          seeded random, audio engine + features, URL state, quality tiers, export, spatial grid
stores/       Zustand store
workers/      circle packing + off-screen rendering
```

---

## Accessibility & photosensitivity

- The canvas is `role="img"` with a label of mode + seed. Every control is a real, labelled input, Tweakpane's included.
- Visible focus rings everywhere; mobile touch targets ≥ 44 px.
- `prefers-reduced-motion`: modes run at 40% speed, no beat effects, meters update twice a
  second, the landing shows a static still.
- **No more than 3 flashes per second:** beats have a 350 ms cooldown, so at most 2.86 per
  second (unit-tested with a spike every 3rd frame). No mode flashes the whole screen; beats
  thicken lines, plant circles or add depth.
- The mic is requested only after an explainer and an explicit "Allow mic". Mic audio is never recorded or sent anywhere.

## Privacy & security

- Everything runs in the browser. There's no backend, no accounts, no analytics and no
  third-party scripts. Audio files and mic input never leave your device.
- Strict security headers on every route: a Content-Security-Policy that allows only
  same-origin and `blob:` resources, `frame-ancestors 'none'`, `nosniff`, a strict referrer
  policy, HSTS, and a Permissions-Policy that allows only the microphone, on this origin only.
- All URL input is validated with zod before use; invalid values fall back to defaults.

## Known limitations

- **Trail residue:** with long trails, 8-bit canvas blending can't fully fade old strokes,
  leaving a faint charcoal haze on dark palettes (a classic translucent-veil artefact). A
  stronger veil every 20th frame reduces it. Removing it fully would need float accumulation.
- Gallery thumbnails are rendered at 800×500; the studio uses your window size, so the
  framing of a preset differs slightly (same seed and settings).
- Clip recording uses WebM (VP9/VP8 + Opus); Safari falls back to MP4 where supported.

---

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3002
pnpm test           # Vitest: RNG, URL round-trip, FFT bands, beat detector, spatial grid, contours, tiers, filenames
pnpm lint && pnpm typecheck && pnpm build
```

### Testing on your phone

```bash
pnpm build && pnpm start -H 0.0.0.0     # or: pnpm dev -H 0.0.0.0
ipconfig                                # Windows: note the IPv4 address of your Wi-Fi adapter
```

On a phone on the same Wi-Fi, open `http://<that-ip>:3002/studio`. The Quality module shows
live `fps · draw ms`. Pick a tier by hand (or add `?tier=low` to the URL) and note the
numbers per mode. **Mic and clip recording need HTTPS on phones**, so test those on the
Vercel deploy.

### Demo track

The Demo button plays `public/audio/demo.mp3`, which is **not included**. Drop any CC0
(public-domain) MP3 there. Until then the button explains that the file is missing.

---

## Engineering highlights

1. **Seeded randomness → reproducible art from a URL.** mulberry32 + seeded Perlin; URL =
   mode + seed + non-default params; zod `.catch()` makes bad links harmless; even
   Randomise is seeded.
2. **FFT basics.** `fftSize 2048` → 1024 bins of `sampleRate / fftSize` ≈ 23 Hz. Bass
   20–250 Hz = bins 1–11, mid = 11–85, treble = 85–683. Averaged, gain-matched, smoothed
   with fast attack / slow release. Beat = bass > 1.4 × its 1 s rolling average, plus a
   350 ms cooldown.
3. **Why circle packing moved to a Web Worker.** The same ~90 ms job froze the canvas for
   5–6 frames on the main thread and caused 0 dropped frames in the worker. The result
   comes back as one transferable `Float32Array`. The same idea later fixed posters (10 s
   freeze → 0).
4. **Spatial hashing.** Cells one max-diameter wide, so a query scans 9 cells instead of
   every circle: 13–188× faster with identical output, and the gap grows with n
   (O(n) vs O(n²)).
5. **Imperative libraries in React without leaks.** p5 and Tweakpane are created in
   effects with a `cancelled` guard for async imports and disposed on cleanup. Frame-speed
   data flows through refs and `subscribe`, never props. Verified: navigating away and
   back keeps exactly one p5 canvas.

## Credits

- Demo track: _add title, artist, link and licence (CC0) once you've chosen one._
- Typeface: [Familjen Grotesk](https://fonts.google.com/specimen/Familjen+Grotesk) (SIL OFL).
- Inspiration: Tyler Hobbs' writing on flow fields, The Nature of Code, The Coding Train.
