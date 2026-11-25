# Publishing TouchType

TouchType is a static site: HTML, JavaScript, the face model and its WebAssembly. Any static host works, as long as it
serves HTTPS, because browsers only allow the camera on HTTPS.

## What a public deployment does by default
* **No accounts, no database, no analytics.** Sessions, settings and eye calibration stay in each visitor's browser.
  Production builds do not read `.env.development`, so a deployed site is local-only unless you deliberately turn
  accounts on (below). The sign-in page then says so, and the account icon is hidden.
* **Camera video never leaves the visitor's device.** The face model and WebAssembly are served by your own site; the
  production build makes zero requests to other sites (checked with a browser test).
* **Security headers** (`vercel.json`, and `public/_headers` for Netlify/Cloudflare; a unit test keeps them identical):
  a Content Security Policy that only allows code and data from your own site (plus Supabase if accounts are on),
  camera allowed only on your own pages, no embedding in other sites, no MIME sniffing.
* **Redeploys are safe for open tabs.** A tab still running an older version reloads once to pick up the new one.

Your host still keeps ordinary access logs (for example IP addresses), like any website.

## Vercel (recommended, free)
1. Put the code on `main`. On GitHub, open a pull request from `claude/peaceful-mccarthy-c1a9r8` to `main` and merge it,
   or locally:
   ```bash
   git checkout main
   git merge claude/peaceful-mccarthy-c1a9r8
   git push
   ```
2. Go to vercel.com and sign up with GitHub. Choose **Add New → Project** and import the `nopeek` repository.
3. Vercel detects Vite (`vercel.json` also sets the build command `npm run build` and output `dist`). Optionally add the
   environment variables below, then **Deploy**.
4. Share the production address, `https://<project-name>.vercel.app`. Every push to `main` redeploys it.
   Deployments of other branches are previews, which Vercel protects with a login by default, so strangers can't open them.
5. Optional: **Settings → Domains** to use your own domain.

## Netlify or Cloudflare Pages
Import the repository, set the build command to `npm run build` and the output directory to `dist`.
`public/_headers` and `public/_redirects` provide the same headers and page routing.

## Optional environment variables
Set these in the host's project settings and redeploy; they are built into the site.

| Variable | Effect |
|---|---|
| `VITE_FEEDBACK_URL` | Adds a "Send feedback" link to the footer, e.g. a Google Form or Tally form (https only). |
| `VITE_SOURCE_URL` | Adds a "source" link to the footer, e.g. your GitHub repository (https only). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Turns accounts and cloud sync on. Follow the checklist below first. |

## Licence
TouchType includes Monkeytype code under GPL-3.0. Publishing the site gives visitors the compiled program, so you must
offer them the source code: keep the GitHub repository public and set `VITE_SOURCE_URL` to it.

## Before turning accounts on
1. Resume the Supabase project (it was paused when last checked).
2. Apply `supabase/migrations/20261108000000_nopeek_v2.sql`.
3. Run Supabase's Security Advisor. Every table in `public` must have row-level security with own-row policies;
   otherwise strangers could read each other's data.
4. Configure custom SMTP for sign-up emails. Supabase's built-in email is meant for testing and, per its documentation,
   only delivers to your own team's addresses, so strangers would never receive their confirmation email.
5. In Auth → URL Configuration, set the Site URL (and redirect URLs) to your deployed address.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the host and redeploy.

## Asking strangers to test
* Eye tracking needs a laptop or desktop with a webcam. Chrome and Edge are tested; Firefox and Safari are not.
* Ask testers to calibrate (Settings → Eye tracking), run the 10-second check, and include the result and the
  "copy diagnostics" output (numbers only, no images) in their feedback.
