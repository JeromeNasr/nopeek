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
