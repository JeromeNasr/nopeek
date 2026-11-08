# Third-party notices

## Monkeytype (GPL-3.0) – inspiration only, no code included

NoPeek's typing engine (`src/engine/`) was **written independently** for this project. It reproduces the
*behaviour* and published *formulas* that make Monkeytype pleasant to use, but contains **no Monkeytype source code**.

What was studied (https://github.com/monkeytypegame/monkeytype, GPL-3.0): the stat definitions in
`frontend/src/ts/test/test-logic.ts`, `.../test/events/stats.ts` and `packages/util/src/numbers.ts`, and the input
handlers in `frontend/src/ts/input/handlers/`.

Why no code was copied: the engine there is built on global `Config`, funbox, layout-emulator and notification state
and cannot be lifted out as a module; and copying GPL-3.0 code would make NoPeek a derivative work that must itself be
distributed under GPL-3.0 with source. Re-implementing documented behaviour avoids that. Behaviours/definitions
reproduced (facts and mathematics, not expression):

* WPM = correct-word characters ÷ 5 per minute (standard); raw WPM counts every typed character.
* Accuracy = correct keystrokes ÷ all keystrokes (corrected mistakes still count).
* Consistency = `100·(1 − tanh(cov + cov³/3 + cov⁵/5))` of per-second burst speed (`consistencyFromCov`).
* Timer starts on first keystroke; space commits a word; you may step back only into a wrong word; 20 extra characters max.

NoPeek is not affiliated with Monkeytype. **If you later want to copy actual Monkeytype code**, NoPeek (and anything
distributed with it) must be licensed GPL-3.0, keep copyright notices, state changes, and offer corresponding source.

## Other components
| Component | Licence | Use |
|---|---|---|
| @mediapipe/tasks-vision 0.10.x (+ WASM) | Apache-2.0 | Face landmarks, run locally, served from this origin |
| MediaPipe `face_landmarker.task` model (`public/models/`) | Apache-2.0 | Bundled so no third-party host is contacted |
| google-10000-english word frequency list (`src/data/english.js`) | MIT list of word frequencies | Top ~3000 words for exercises |
| React, React Router, Recharts, Supabase JS, Tailwind | MIT | App framework |
Practice texts in `src/data/corpus.js` were written for NoPeek.
