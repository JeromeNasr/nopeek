---
name: testing-nopeek
description: How to run and end-to-end test the NoPeek typing-test app (Vite + React 19 + Tailwind + Supabase) locally in a browser.
---

# Testing NoPeek locally

## Run the app
- `npm install` in the repo root. If Vite/rolldown fails with a missing native binding, install the
  platform optional dep explicitly, e.g. `npm i @rolldown/binding-linux-x64-gnu --no-save`.
- `npm run dev` → http://localhost:5173. Node 20.18 prints a "Vite requires 20.19+" warning but the
  dev server still works; upgrade Node if you hit odd build failures.
- `.env` in the repo provides `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. There are no test user
  credentials, so anything behind Supabase auth (Login, Dashboard, saving a finished session) cannot
  be exercised — say so explicitly rather than skipping silently.

## Reaching the typing test
- Route `/type` (`src/App.jsx`). There is **no** auth or webcam gate: `index.html` does not load the
  webgazer script, so `window.webgazer` is undefined and both `WebcamPreview` (App.jsx) and
  `useEyeTracking` (src/hooks/useEyeTracking.js) return early. Navigate straight to
  http://localhost:5173/type — no login, no camera permission prompt needed.
- Consequence: eye-tracking / peek-count features are inert locally and cannot be tested without
  adding a webgazer script + real webcam.

## /calibrate is a landmine — visit it LAST
- `src/pages/Calibration.jsx` injects the WebGazer CDN script itself. On a box with no camera it logs
  `No stream` and shows "WebGazer failed to load."; the 9 calibration dots are then never rendered, so
  anything about dot layout/placement is untestable there.
- Navigating **away** from `/calibrate` may blank the entire app (whole React tree unmounts, white or
  black screen) because the effect cleanup calls `window.webgazer.end()`, which can throw when WebGazer
  never started. Recover with a browser reload. Plan routes so `/calibrate` is the last page you visit,
  or reload after leaving it. This was observed on `main` too — check `main` before blaming a PR.

## Attributing a bug to the PR vs. main
- Cheap and worth doing: `git worktree add /tmp/nopeek-main main`, symlink the existing `node_modules`
  and copy `.env` into it, then `npx vite --port 5175` there. You can then reproduce the same UI flow
  side by side and state definitively whether a defect is a regression.

## Typing test behaviour worth knowing (src/pages/TypingTest.jsx)
- Keystrokes are captured by an `onKeyDown` handler on a `tabIndex=0` div — **click inside the text
  panel first**, then type. There is no `<input>`.
- The test starts on the first keystroke; a 60s timer runs and `finished` swaps the page to a results
  screen. Category buttons are `disabled` while `started` is true, so any test of "switching category
  resets input" must happen **before** typing.
- Practice text comes from `generatePracticeTokens(categoryId, count=150)` in `src/data/wordLists.js`
  and is **random on every render/reload**. To prove a specific word is in a list via the UI, use
  Chrome's Ctrl+F (it works even though each char is its own `<span>`) and reload a few times —
  a given word has roughly a 50% chance of being absent from any single 150-token sample. Validate
  the find bar works first by searching for a word you can see.
- Use the **Numbers** category when testing correct/incorrect coloring: digit tokens are unambiguous,
  and deliberately mistyping one digit gives a predictable accuracy (e.g. 9/10 → 90%).
- Backspace decrements both total and correct keystroke counters, so accuracy returns to 100% after
  correcting a typo — expect that, don't call it a bug.

## Theme / responsive testing (ThemeProvider + navbar)
- Theme lives in `src/context/ThemeProvider.jsx`: it toggles the `dark` class on `<html>` and writes
  localStorage key `nopeek-theme` (`light` / `dark`). `index.html` has a synchronous `<head>` script
  applying the same class pre-React. Objective check in one console call:
  `JSON.stringify({stored: localStorage.getItem('nopeek-theme'), htmlClass: document.documentElement.className, bodyBg: getComputedStyle(document.body).backgroundColor})`
  — dark should give `dark` / `rgb(9, 9, 11)`.
- A single-frame "white flash" on reload cannot be ruled out with screenshots; report it as
  inconclusive rather than passed unless you capture frames.
- The toggle button is addressable by `aria-label` ("Switch to light mode" when dark, "Switch to dark
  mode" when light); the mobile menu button by `aria-label="Toggle navigation menu"` with `aria-expanded`.
- **Getting a phone-sized viewport:** Chrome (incl. Chrome for Testing) refuses to go below ~500 physical
  px wide, and F12/DevTools device mode may not open in this environment. Workaround that works well:
  shrink the window with `wmctrl -r :ACTIVE: -e 0,20,0,300,1150` (lands at the ~532px minimum) and then
  press `ctrl+equal` twice for 125% zoom — `window.innerWidth` becomes 400 CSS px, which is a real CSS
  viewport change so all `md:` breakpoints behave like a 390px phone. Note `ctrl+plus` does nothing;
  use `ctrl+equal`, and `ctrl+0` to reset.
- Overflow check per page: `document.documentElement.scrollWidth <= window.innerWidth`.

## Gotchas
- Pressing F5 does **not** reload the page while focus is inside the typing div (the key handler
  calls `preventDefault`). Click the browser reload button instead, otherwise your subsequent
  keystrokes silently start a test.
- Same reason: open Ctrl+F only after the page has focus outside the typing panel.

## Devin Secrets Needed
- None for the typing test itself. A Supabase test account (email/password) would be required to
  verify session saving, the Dashboard charts/recent-sessions table (its `overflow-x-auto` horizontal
  scroll), and the navbar streak chip — all of those render only for a signed-in user.
