# Eye tracking design (v5)

**Pipeline** (`src/eye/`): camera (`tracker.js`, 640×480, up to 24 fps, adaptive back-off, pauses when the tab is hidden)
→ MediaPipe Face Landmarker in a **Web Worker** (`worker.js`, CPU, frames transferred as `ImageBitmap`; 478 landmarks,
blendshapes and the facial transformation matrix) → `landmarks.js` features → `classifier.js` (decision) → `tally.js`
(per-session accounting). Model and WASM are served from this origin; frames never leave the tab and are never stored.

## Signals
Seven per-frame signals, all relative to the user's own calibration:

| signal | what it measures |
|---|---|
| `pitch` | head tilt, from the transformation matrix |
| `gazeV` | iris height in eye-widths, in an eye-aligned (roll-invariant) frame |
| `gazeLid` | iris position between the lids |
| `lidTop` | upper-eyelid height relative to the eye corners (new in v5: the upper lid follows the eyes down) |
| `openness` | eye opening |
| `lookDown` | MediaPipe's `eyeLookDown − eyeLookUp` blendshapes |
| `blink` | blink blendshape |

## Decision model
1. **Projection.** Regularised LDA turns the signals into one score *t* (0 = screen, 1 = keyboard). Each distinct way of
   peeking captured during calibration (head tilt, eyes only) is its own prototype; *t* is the best match.
2. **Evidence.** Robust Student-t densities of *t* for screen and keyboard, fitted on the calibration and deliberately
   widened, give a per-frame log-likelihood ratio, clamped to ±3 and scaled by frame confidence.
3. **Filter.** A two-state continuous-time hidden Markov filter accumulates that evidence into P(keyboard)
   (switching rates 0.25/s to keyboard, 1/s back). One odd frame cannot flip the state; consistent evidence does quickly.
4. **Decisions.** Keyboard when P ≥ 0.9 for 280 ms (balanced; 150 ms / 600 ms strict / relaxed); back to screen when
   P ≤ 0.35 for 150 ms. Shorter looks are logged as *glances*. A peek is back-dated to when its evidence began.
5. **Special cases.** Closed eyes are no evidence either way unless closure lasts over 600 ms (eyelids drop when looking
   down, so long closure counts weakly as keyboard). Head dipped with eyes rolled up = `uncertain`, not a peek.
   Head turned / eyes sideways / looking up = `away`. No face for 600 ms = `unavailable`; 3 good frames to re-acquire.
6. **Posture.** The screen baseline follows slow drift: the 15th percentile of the last 20 s of scores nudges an offset
   (bounded). "I moved – re-centre" resets it from 1.5 s of screen-looking.

## The bug behind "tracking isn't accurate"
Frame confidence used a hard gate: a face narrower than 15 % of the frame got confidence 0.3, which made every frame
`uncertain`. At a normal sitting distance with a laptop camera the face is about 10–15 % of the frame, so tracking never
left "uncertain/unavailable" while calibration (which did not apply that gate) reported "Good". Confidence factors are now
soft (small face, face at the edge, darkness, eyes disagreeing, strong roll), and only a missing face blocks.
Reproduced and verified with a real face at natural distance (below).

## Calibration (`calibration.js`, UI in `components/EyeSetup.jsx`)
Position check → six dots at the real screen edges (2 s each) → two keyboard looks driven by **tones** (falling = look
down, rising = look back up; you cannot read the screen while looking at the keys) → result → **10-second check**:
look at the screen, at the falling tone look at the keys, at the rising tone look back. The check runs on the live
tracker and reports detection delay, return delay and false alarms, with a fix for each failure.
Quality: separation d′ plus screen/keyboard misread rates from the LLR sign, using the worse of in-sample and
cross-validated (each capture held out). Good and fair are used; poor and insufficient are refused.
A failed recalibration **keeps the previous working calibration**. Calibration numbers stored by v4 are refit into v5
automatically, so updating does not force a recalibration. "Teach" (2 s of labelled data) refits only if the result
stays usable.

## Accounting
Time is bucketed screen / keyboard / away / uncertain / unavailable. A run is scored only when at least 70 % was measured.
Disabled, uncalibrated, unavailable and partial sessions carry **no** discipline figure and never count as good.

## Evidence (what was measured, and what was not)
* **Real face, real pipeline** (MediaPipe's test portrait as a looping fake webcam; "looking down" is a vertical squash
  of the photo, so separation is far larger than real eye movement and is *not* a real-world accuracy figure):
  natural distance (face 14 % of frame): calibration good; a 3-s look down detected after 0.33–0.36 s (including the
  280 ms confirm time), back to screen after 0.23–0.27 s, 0 false alarms over 3 cycles; the 10-second check passed.
  Close-up: 0.45–0.48 s and 0.25–0.28 s. Before the fix, the natural-distance video never left "uncertain".
* **Simulation** (`tests/eye.test.js`, 52 tests): 25 simulated users, 20 usable, 0.000 false peeks/min, 100 % recall of
  1-s peeks; blinks, slow blinks, deep looks, far faces, dim light, posture shifts, heavy peekers, recentring.
  Simulations of my own feature model validate logic, not webcams.
* **Camera resolution**: 1280×720 vs 640×480 with simulated sensor noise gave the same landmark jitter at the same cost,
  so 640×480 is kept (and existing calibrations stay valid).
* **Not validated**: real people and webcams, glasses glare, very low light, cameras below the screen, Firefox/Safari.
  The 10-second check exists so each user can validate their own setup.

## History
* v3: blendshape signal, regularised LDA, cross-validated quality, One-Euro smoothing, re-centre, peek→key attribution.
* v4: Web Worker, one prototype per peeking style, corrected nodding rule, personal thresholds, teach, diagnostics.
* v5: eyelid signal, likelihood-ratio evidence + HMM filter, soft confidence (the bug above), duration-based blink
  handling, percentile posture adaptation, tone-guided calibration, 10-second self-check, safe recalibration.
