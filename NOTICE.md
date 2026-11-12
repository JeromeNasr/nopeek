# Licence and third-party notices

**TouchType is free software licensed under the GNU General Public License v3.0** (see `LICENSE`).
It is GPL-3.0 because it includes source code from Monkeytype, which is GPL-3.0. In practice:
anyone may use, study, change and share TouchType; if you distribute it (including a modified
version, or hosting a build whose source you changed), you must make the complete corresponding
source available under GPL-3.0 and keep these notices. Keeping the repository public satisfies this.

## Monkeytype (GPL-3.0) — code included

Source: https://github.com/monkeytypegame/monkeytype, commit `3c41bd38ecc942124780f10f504272cc42430890`.
Copyright (C) Monkeytype contributors.

* **Used unmodified** (in `src/vendor/monkeytype/`, original paths preserved): the event-log statistics
  (`test/events/stats.ts`, `helpers.ts`, `types.ts`), `utils/strings.ts`, `utils/numbers.ts`,
  `utils/direction-regex.ts`, `input/helpers/input-type.ts`, `packages/util/src/numbers.ts`.
  Every typing statistic TouchType shows (WPM, raw, accuracy, character counts, consistency,
  per-second history, key spacing, test duration) is computed by this code.
* **Ported** (rewritten in `src/engine/typingEngine.js`, following the originals): the input rules from
  `input/handlers/{before-insert-text,insert-text,before-delete,delete}.ts` and
  `input/helpers/{validation,fail-or-finish}.ts`, with Monkeytype's default settings.
* **Not included**: Monkeytype's UI, themes, word lists, funboxes, account system or branding. Those parts are
  bound to Monkeytype's own app (Solid components, global config, DOM) and are TouchType's own work here.
* Small files marked "TouchType shim" let the unmodified files compile outside Monkeytype.

TouchType is not affiliated with or endorsed by Monkeytype.

## Other components
| Component | Licence | Use |
|---|---|---|
| @mediapipe/tasks-vision (+ WASM) and `face_landmarker.task` model | Apache-2.0 | Face landmarks, run locally in a worker |
| google-10000-english word frequency list (`src/data/english.js`) | MIT | Word pool for exercises |
| Geist, JetBrains Mono (via Fontsource) | SIL OFL 1.1 | Typefaces, self-hosted |
| React, React Router, Recharts, Supabase JS, Tailwind CSS | MIT | App framework |

Practice texts in `src/data/corpus.js` were written for TouchType. Apache-2.0, MIT and OFL are compatible with GPL-3.0.
