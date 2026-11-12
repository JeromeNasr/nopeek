# Vendored Monkeytype code (GPL-3.0)

Source: https://github.com/monkeytypegame/monkeytype — commit `3c41bd38ecc942124780f10f504272cc42430890`.
Copyright (C) Monkeytype contributors. Licensed under the GNU General Public License v3.0 (see `/LICENSE`).

Copied **unmodified**, keeping their original paths so relative imports resolve:

| File | What it does |
|---|---|
| `frontend/src/ts/test/events/stats.ts` | every statistic, computed from the event log (chars, WPM/raw history, burst, accuracy, key spacing, duration) |
| `frontend/src/ts/test/events/helpers.ts` | event-log helpers |
| `frontend/src/ts/test/events/types.ts` | event-log types |
| `frontend/src/ts/utils/strings.ts`, `direction-regex.ts`, `numbers.ts` | `countChars`, `isSpace`, `calculateWpm` |
| `frontend/src/ts/input/helpers/input-type.ts` | input type names |
| `packages/util/src/numbers.ts` | `mean`, `stdDev`, `kogasa`, `roundTo2` |

Files marked "TouchType shim" (`config/store.ts`, `constants/keys.ts`, `utils/misc.ts`, `stubs/`) are small
stand-ins written for TouchType so the unmodified files compile outside the Monkeytype app.

TouchType's `src/engine/typingEngine.js` records Monkeytype-format events and applies Monkeytype's input rules
(ported from `input/handlers/*` and `input/helpers/validation.ts`, which cannot be used unmodified because they
are bound to Monkeytype's DOM, config and funbox system).
