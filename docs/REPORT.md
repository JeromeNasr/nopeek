# TouchType v2 – engineering report

## 1. Audit findings (original app, commit 97c063b)
* ~1,470 lines: React + Vite + Supabase + WebGazer (loaded from `webgazer.cs.brown.edu` at runtime). **No tests, no schema/migrations in the repo**, no CLAUDE.md.
* `.env` with Supabase URL/anon key is tracked (anon keys are public by design, but `.env.example` is now provided).
* Single 835 kB JS bundle (recharts eager). Camera/eye code coupled to routes; WebGazer restarted per page.
* Typing: accuracy decremented counters on Backspace (wrong); WPM from whole-word match only; fixed 60 s; no custom text, punctuation, numbers; re-render of every character per keystroke; 50 ms `setInterval` per render.
* Eye discipline defaulted to **100 %** when no tracking existed, and was saved as if measured.

## 2. Root causes of the eye-tracking problems
1. **Wrong signal**: WebGazer regresses a *screen* coordinate. "Looking at the keyboard" is *off* the screen; the app compared `y > 60 % of window height`, which also fires for the lower screen/footer text and saturates unpredictably for off-screen gaze.
2. **No personal baseline** for "keyboard"; calibration only taught screen points, and was discarded (`webgazer.end()`) on navigation.
3. **No head-pose or temporal reasoning**: one frame over threshold for 400 ms = peek; no blink handling, hysteresis, confidence, or loss handling.
4. **Unavailable ≠ good** was violated (100 % default).
5. Third-party CDN load; privacy claim not verifiable.

## 3. Eye-tracking improvements (see `docs/EYE_TRACKING.md`)
MediaPipe Face Landmarker (iris + head pose) served locally; personal 2-class calibration with measured quality and refusal when unreliable; multi-signal classification with 5 outcomes (screen / keyboard / away / brief glance / uncertain-unavailable); hysteresis, dwell, blink/loss/reacquisition handling, bounded posture drift; explicit measured-vs-unavailable accounting; camera lifecycle (stops on leave, tab hidden, device lost); GPU→CPU fallback.

## 4. Monkeytype integration & licensing
Source studied; **no code copied** (GPL-3.0 would force TouchType to be GPL-3.0; engine is not separable). Clean-room engine reproduces the behaviours/formulas. Details and what to do if you ever copy code: `NOTICE.md`. I am not a lawyer; if you want to ship Monkeytype code, adopt GPL-3.0 deliberately.

## 5. New typing & training features
Engine (`src/engine`): time (15/30/60/120) / word (10–100) / custom text; punctuation, numbers, quotes, code; per-char feedback, extra chars, word-delete, step-back only into wrong words, WPM/raw/accuracy/consistency/rhythm, per-second history, deterministic seeded text; input via hidden textarea (IME, virtual keyboards, dead keys), timestamps from `event.timeStamp`; direct-DOM smooth caret + 3-line scroll, memoised words.
Curriculum (27 lessons, 6 stages) defined on *physical keys* so it works on 6 layouts; passing requires measured accuracy/speed/consistency/rhythm/correction targets; test-out allowed for locked lessons. Deterministic generators for lessons and for targeted drills (keys, bigrams, finger, accuracy, speed, rhythm, numbers, punctuation, capitals, eyes-up).

## 6. Keyboard personalisation
User-selected layout (QWERTY US/UK, Dvorak, Colemak, AZERTY, QWERTZ), ANSI/ISO, form factor (60/65/75/TKL/full/laptop), per-key finger overrides. Inference where honest: `navigator.keyboard.getLayoutMap()` (Chromium) and observed (code,key) pairs suggest the OS layout; ISO inferred only if an ISO-only key is pressed. **Not possible**: identifying keyboard model/size or which finger pressed a key – stated in the UI.

## 7. Analytics & recommendations
Dashboard answers the four questions with evidence per statement; measured vs partial/unavailable/disabled/uncalibrated/legacy separated; legacy rows' 100 % excluded. Weakness detection uses Wilson bounds, minimum samples and the user's own baselines (keys, slow keys, adjacent-key slips, finger-owned-key groups, slow/error-prone bigrams, character classes, shift, corrections, rhythm/burstiness); improvement trends; ranked recommendations; goals evaluated against real sessions.

## 8. Performance (measured here; headless Chromium, no real GPU)
| | Before | After |
|---|---|---|
| Entry JS | 835 kB (242 kB gz) | 461 kB (135 kB gz); recharts 366 kB, MediaPipe 154 kB, pages lazy |
| Third-party runtime fetch | WebGazer CDN | none (verified: 0 external requests) |
| Face inference | n/a | GPU delegate here was software-emulated: **1060 ms/frame, 0.5 fps** → auto-fallback to CPU: **15 ms/frame, ~13 fps** (no-face frames; faces cost more) |
| JS heap in setup | – | ~26–35 MB |
Per keystroke: 1–2 word components re-render; caret/scroll via DOM transform. I did **not** measure the old app's per-keystroke cost, so no speed-up claim is made for typing.

## 9. Tests (all pass: `npm test` → 103; `npm run lint`; `npm run build`)
Engine (28), keyboard/curriculum/generators/analysis/recommender/goals/dashboard (~45), eye geometry/calibration/classifier/tally (33). Includes simulated typists with known weaknesses and 25 simulated users × scenarios (screen, bottom-of-screen, nodding, away, up, blinks, tracking loss, darkness, drift, sensitivity). Latest simulation: 21/25 simulated setups accepted by calibration (4 refused as too weak), 0.000 false peeks/min, 98.6 % recall on 1-s peeks. **These are simulations of my own feature model; they validate logic, not real webcams.** Browser smoke test (Playwright/Chromium): real keystrokes → results → saved record, 0 console errors; fake-camera test: model/WASM load, guidance, camera release. `npm run test:db`: migration on real PostgreSQL 16.

## 10. Database changes
`supabase/migrations/20261108000000_nopeek_v2.sql`: additive nullable columns on `sessions` (client_id, mode, lesson_id, practice_kind, passed, layout, tracking_status, result, tracking, analysis), `eye_discipline` made nullable, unique `(user_id, client_id)`, index, new `user_profiles`, own-row RLS policies. Idempotent; tested: rows preserved, RLS isolation, duplicate rejection. **You must apply it** (Supabase SQL editor / CLI). Before that the app still saves locally and falls back to legacy columns (untracked sessions then stay local because legacy `eye_discipline` was NOT NULL – I could not inspect your real schema, so this is a best-guess; check it). Calibration never leaves the device.

## 11. Remaining limitations
* No real-webcam validation (none available). Thresholds are principled defaults, not tuned on people.
* Glasses glare, very low light, extreme camera angles, and faces with unusual eyelid geometry may be refused or uncertain by design.
* Looking *down at the screen's bottom edge* vs keyboard relies on calibration including screen corners; users with a camera below the screen may get poor separation.
* Main-thread inference (no worker, see EYE_TRACKING.md). Local session storage capped at 250 sessions.
* Layout/finger overrides: ISO Enter drawn simplified; no non-Latin layouts; IME composition is basic.
* Cloud sync of anonymous local sessions is opt-in ("Add to my account"). Not tested against your live Supabase project (no access).
* Browser matrix: only Chromium tested.

## 12. Needs physical webcam validation
Peek recall/false-peek rates on real people; calibration quality thresholds (d′ 3/2/1.4); dwell defaults (300/450/750 ms); head-nod vs peek disagreement rule; drift adaptation rate; behaviour with glasses/lighting/different cameras; CPU cost with a face present on low-end laptops; detection of GPU-slow fallback on real machines; Firefox/Safari.

## 13. Second pass (TouchType)
Renamed to **TouchType** (local data migrates from the old storage prefix). New design system (self-hosted Geist + JetBrains Mono, accent themes, staggered/entrance animations, count-up results, skeleton loading, reduced-motion support), sticky nav with hover prefetch, focus mode, pace ghost, key sounds + metronome (Web Audio, synthesised), smart keyboard hints, caret styles, text size, daily plan, peek-trigger analysis. Tracking v3: see `docs/EYE_TRACKING.md`.
Tests: 117. Simulation after v3 (25 simulated setups): 21 accepted, 0.026 false peeks/min, 100 % recall of 1-s peeks — still a simulation, not webcam validation. The Supabase project was paused when checked, so the schema and migration remain unverified against production.

## 14. Third pass: Monkeytype engine, smoothness, redesign, tracking v4
**Licence**: now GPL-3.0-only (Monkeytype code included, see `NOTICE.md`).
**Typing**: statistics by Monkeytype's unmodified `events/stats.ts`; input rules ported; rendering is imperative (no UI-framework work per keystroke).
**Measured (headless Chromium, 4x CPU throttle, ~280 keys at 35 ms)**

| | Before | After |
|---|---|---|
| keystroke handler, mean / p95 | 3.03 / 4.4 ms | 0.97 / 1.8 ms |
| with camera tracking: key to 2nd frame, p95 / max | 111 / 548 ms | 37 / 55 ms |
| with camera tracking: long tasks during the run | 24 | 0 |
| tracking rate (CPU) | 13 fps, main thread | 20 fps, worker |
| entry JS | 472 kB (139 gz) | 335 kB (113 gz) |

Key-to-frame latency without the camera is unchanged (about 24 ms, bound by the display refresh in this environment).
**Design**: flat, single accent, three themes (ink, midnight, paper); the home page is the typing test.
**Tests**: 127. Simulation: 21/25 setups accepted, 0.026 false peeks/min, 100 % recall of 1-s peeks; plus a two-style (head-tilt and eyes-only) user where both styles are detected. Still simulation, not webcam validation.

## 15. Fix pass: calibration, lesson result bug, identity
* **Calibration screens were positioned relative to the page, not the window.** The page-entry animation used a CSS transform, which makes `position: fixed` descendants relative to the (long) page. Dots sat at 8-92 % of a ~2600 px page, so the user had to scroll to see them. The wizard is now portalled to `<body>` and verified: overlay height equals the viewport height on a 2608 px page; first dot inside the viewport.
* **Calibration could not start for many users**: "too far" and "too dark" were hard errors disabling the button. Only "no face" blocks now; distance/lighting are advice and the quality check decides.
* **Worker uses the CPU model only.** The GPU path in a worker was untested on real GPUs and could fail silently, which would look like "no face detected". Worker failures now surface as an error.
* **Verified on a real face** (MediaPipe's test portrait as a looping fake webcam, two-state video): landmarks and blendshape features are sane (about 15-20 fps, 17-30 ms/frame on CPU); the wizard completes to "Tracking is ready"; the live label followed the camera with **0.40 s** onset delay (the 400 ms confirm dwell) and **0.15 s** exit delay. A static photo has no sensor noise, so its separation figure is not a real-world number, and it cannot show real eye movement.
* **Bug: finishing a lesson discarded the result screen** (saving progress changed the exercise seed, regenerating the text). Seed is now fixed per visit.
* **Identity**: Paper / Dusk / Moss themes (system light/dark on first run), serif typing text, pill navigation, one-row length selector with options folded away. Feature test (`22` checks across every page and mode) passes with zero console errors.

## 16. Fourth pass: tracking v5, guided calibration, UI clean-up
**Root cause of inaccurate tracking**: at a normal sitting distance (face 10–15 % of a 640 px frame) a hard confidence
gate marked every frame "uncertain", so the tracker never reported "keyboard" although calibration said "Good".
Reproduced with a real face at natural distance and fixed. Details and the new decision model (eyelid signal,
likelihood ratios, hidden Markov filter, percentile posture adaptation): `docs/EYE_TRACKING.md`.

**Calibration**: tones tell you when to look down and back up, rounds advance by themselves, a step indicator shows
where you are, and a 10-second self-check measures detection on the live tracker. A failed recalibration keeps the
working one; v4 calibrations are refit automatically.

**Measured (real-face fake webcam, natural distance)**: look down detected in 0.33–0.36 s, look back in 0.23–0.27 s,
0 false alarms, self-check passed. Not a real-world accuracy figure (see `docs/EYE_TRACKING.md`).

**Typing with tracking running** (headless Chromium, 4× CPU throttle, 310 keys at 35 ms, calibrated tracking switching
between screen and keyboard): handler 1.34 ms mean / 2.5 ms p95; key to second frame 25.8 ms mean / 37 ms p95 / 49 ms max;
0 long tasks. The typing view no longer re-renders on tracker updates; only two small status components subscribe.

**UI**: Settings reorganised into Eye tracking / Typing / Keyboard / Privacy with a section menu; the keyboard editor is
three controls with the map, finger overrides and key tester folded away; typing font option (serif, sans, mono);
sign-in page uses the shared design; the header eye dot only shows while tracking is on; the Type page links to eye
setup; lesson keyboards show only the main block with visible keys; Progress cards no longer stretch into empty boxes;
no sideways scrolling at 390 px on any page (checked automatically).

**Tests**: 134 unit tests; 31 browser feature checks (every page and mode, zero console errors); real-face calibration
+ self-check run; lint and build clean.

## 17. Publishing
A deployed build is **local-only by default**: the Supabase settings moved from `.env` to `.env.development`, which
production builds never read, so no account server is contacted and no data leaves the browser unless accounts are
deliberately configured on the host. Without accounts the sign-in page explains this and the account icon is hidden.
Security headers and page routing are configured for Vercel (`vercel.json`) and Netlify/Cloudflare Pages
(`public/_headers`, `public/_redirects`); a unit test keeps the two in sync.
**Verified on the production build served with those exact headers**: typing test, every page, calibration start with
camera, worker, WebAssembly and face model working; zero Content Security Policy violations (one was found and fixed:
small fonts embedded in the stylesheet), zero requests to other sites, zero console errors; 31 feature checks pass.
A tab left open during a redeploy reloads once and shows the new version (tested by rebuilding under an open tab).
Steps, optional settings (feedback and source links) and the checklist for turning accounts on: `docs/DEPLOY.md`.
