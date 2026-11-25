# TouchType

A touch-typing trainer: structured lessons, personalised drills built from your own mistakes and rhythm,
a typing test whose statistics are computed by Monkeytype's own code, and optional **on-device** eye tracking that measures how often you look at the keyboard.

## Run

```bash
npm install          # also copies the MediaPipe WASM into public/ (scripts/prepare-assets.mjs)
# optional: accounts/cloud sync use Supabase credentials in .env.development (see .env.example)
npm run dev
npm test             # 137 unit/simulation tests
npm run test:db      # applies the migration to a throwaway PostgreSQL and checks it (needs postgres binaries)
npm run lint && npm run build
```

## Publishing
See `docs/DEPLOY.md`: a public build is local-only (no accounts, no analytics) with strict security headers.
Vercel, Netlify and Cloudflare Pages are configured (`vercel.json`, `public/_headers`, `public/_redirects`).

## Database
Apply `supabase/migrations/20261108000000_nopeek_v2.sql` (additive, idempotent, non-destructive). The app works before
it is applied (falls back to legacy columns) but new analytics need it. See `docs/REPORT.md`.

## Docs
* `docs/REPORT.md` – audit, root causes, architecture, measurements, limitations, what needs physical-webcam validation
* `docs/EYE_TRACKING.md` – pipeline, classifier, calibration, privacy
* `docs/DEPLOY.md` – publishing safely, optional settings, turning accounts on
* `NOTICE.md` – licence (GPL-3.0) and third-party notices, including the Monkeytype code in `src/vendor/monkeytype/`

## Licence
GPL-3.0-only. TouchType includes code from [Monkeytype](https://github.com/monkeytypegame/monkeytype) (GPL-3.0); see `NOTICE.md`.
