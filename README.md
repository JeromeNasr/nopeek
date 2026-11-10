# TouchType

A touch-typing trainer: structured lessons, personalised drills built from your own mistakes and rhythm,
a Monkeytype-style test, and optional **on-device** eye tracking that measures how often you look at the keyboard.

## Run

```bash
npm install          # also copies the MediaPipe WASM into public/ (scripts/prepare-assets.mjs)
cp .env.example .env # optional: Supabase credentials; without them the app runs local-only
npm run dev
npm test             # 103+ unit/simulation tests
npm run test:db      # applies the migration to a throwaway PostgreSQL and checks it (needs postgres binaries)
npm run lint && npm run build
```

## Database
Apply `supabase/migrations/20261108000000_nopeek_v2.sql` (additive, idempotent, non-destructive). The app works before
it is applied (falls back to legacy columns) but new analytics need it. See `docs/REPORT.md`.

## Docs
* `docs/REPORT.md` – audit, root causes, architecture, measurements, limitations, what needs physical-webcam validation
* `docs/EYE_TRACKING.md` – pipeline, classifier, calibration, privacy
* `NOTICE.md` – licensing (Monkeytype/GPL-3.0 analysis) and third-party notices
