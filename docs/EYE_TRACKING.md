# Eye tracking design

**Pipeline** (`src/eye/`): camera (`tracker.js`, 640×480, ≤20 fps, adaptive back-off, visibility pause) → MediaPipe Face
Landmarker (478 points incl. irises + facial transform matrix) → `landmarks.js` features: head pitch/yaw/roll (from the
matrix), iris offset vertically/horizontally in eye-widths measured in an eye-aligned (roll-invariant) frame, iris position
between lids, eye openness, face size, margin → `classifier.js` → `tally.js`.

**Calibration** (`calibration.js`, UI in `components/EyeSetup.jsx`): position check (distance, centring, light, tilt) →
5-point screen sweep (corners included, so reading the bottom of the screen is "screen") → typing while watching the
screen (natural head motion) → two "look at keyboard" captures. Robust medians/MAD per feature; each feature is weighted
by its signal-to-noise; the screen→keyboard axis direction is *learned*, not assumed. Quality (good/fair/poor/insufficient)
comes from the empirical separation d′ and in-sample misclassification of the calibration frames. Poor/insufficient
calibrations are **not used to score**.

**Classification**: score t (0 = screen, 1 = keyboard). Away = head turned / eyes sideways / looking up. A "peek" needs t above
threshold *and agreement between strong signals* (head dipping while the eyes stay on screen → `uncertain`, not a peek),
for ≥ 450 ms (balanced; 300/750 ms strict/relaxed), with hysteresis. Shorter looks are *glances*. Blinks are ignored; long
eye closure is `uncertain`. No face > 600 ms → `unavailable`; re-acquisition needs 3 good frames. Slow posture drift is
followed (bounded) and a large shift prompts recalibration.

**Accounting**: time is bucketed screen / keyboard / away / uncertain / unavailable. Score only when ≥ 70 % of the run was
measured. `disabled`, `uncalibrated`, `unavailable`, `partial` sessions carry **no** discipline figure and are never
counted as good discipline.

**Privacy**: model + WASM served from this origin (verified: zero third-party requests); frames never leave the tab, are
never stored; only calibration numbers (local) and per-session summary counts are saved. Camera stops when leaving the page.

**Why not a Web Worker**: MediaPipe's loader uses `importScripts`, which does not work in module workers under Vite; the
per-frame cost is dominated by the delegate. Inference runs on the main thread, throttled, with GPU→CPU fallback.
