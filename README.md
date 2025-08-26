## Live Demo
👉 [Open the Log Spiral App](https://atrianglehead.github.io/log-spiral/)

# log-spiral
Spec: Logarithmic Spiral Visualizer + Marker Sonification (v0.1)

0) Purpose

A browser-based p5.js sketch that draws a logarithmic spiral and marks integer-multiple radii (1·x, 2·x, …). At each such radius, a sine beep can play with frequency `k·p`. UI is split into Visual, Audio, and a dedicated Play section. Drawing area is panel-aware (spiral never overlaps the control panel).

----------
1) Files & Dependencies
- `index.html` – includes p5.js and loads `styles.css` and `sketch.js`.
- `styles.css` – styles for the floating UI and controls (incl. nowrap row and enlarged play button).
- `sketch.js` – rendering, math, state, UI creation/handlers, and audio (Web Audio API).

Libraries

- p5.js ≥ 1.11.x via CDN.
- No p5.sound; audio uses native Web Audio API.
----------
2) Spiral Math & Markers

2.1 Spiral (logarithmic only)

- Base length `x` (px), angle `θ` in radians.
- Radius:
- r(θ)=x⋅2θ/(2π)r(\theta) = x \cdot 2^{\theta/(2\pi)}r(θ)=x⋅2θ/(2π)
- After `N` full rotations: `θ = 2πN`, `r_final = x·2^N`.

2.2 Integer-multiple markers

- For integers `k = 1,2,…,K_max`, marker radius `r_k = k·x`.
- Marker angle:
- θk=2π⋅log⁡2(k)\theta_k = 2\pi \cdot \log_2(k)θk=2π⋅log2(k)
- Labels show the integer only (`"1"`, `"2"`,…).
- `K_max = min(2^N, ⌊20000 / p⌋)` (20 kHz cap; see §4.3).
----------
3) Animation, Fit, and Finish

3.1 Stepping

- Per frame, `θ += dθ` (default 0.072 rad/frame; slider-controlled).
- The spiral path is a polyline through sampled tip positions.

3.2 Panel-aware fit (no overlap)

- Compute a safe drawable rectangle by reserving a top margin equal to `max(margin, panelBottom + gap)` inside the canvas.
- Margins: left/right/bottom = constant `margin` (default 32 px).
- Fit radius inside that rectangle:
- s=min⁡{1,  fitRadius/rfinal},fitRadius=min⁡(safeW,safeH)2−margins = \min\{1,\; \text{fitRadius}/r_{final}\},\quad \text{fitRadius}=\frac{\min(\text{safeW},\text{safeH})}{2}-\text{margin}s=min{1,fitRadius/rfinal},fitRadius=2min(safeW,safeH)−margin
- Translate origin to the center of the safe rectangle before drawing.

3.3 Completion

- Finish when:
    - `θ ≥ 2πN`, or
    - Next beep would exceed `20000 Hz` (i.e., `p·nextK > 20000`).
- On finish: set `paused = true` so the UI immediately shows ▶ Play.
----------
4) Audio (Web Audio API)

4.1 Triggering & k sequence

- Maintain `nextKToFire = 1`.
- When crossing any `θ_k` in a frame:
    - If `k % kFilter === 0` and `p·k ≤ 20000`, play a beep at `f = p·k`.
    - Increment `nextKToFire` and continue (loop handles fast speeds that skip over multiple markers).

4.2 Synthesis

- Create one OscillatorNode (`sine`) per beep → per-beep GainNode → persistent master GainNode → destination.
- Envelope: ~0.18 s total (attack ≈ 6 ms to 0.9; decay ≈ 140 ms to ~0).
- Master gain reflects Volume slider (0–100%).

4.3 20 kHz cutoff

- No beeps or markers beyond 20,000 Hz.
- If `p·nextK > 20000`, set `finished = true` (and `paused = true`).
----------
5) UI/UX

5.1 Structure (three groups, left→right)

- Visual group (controls drawing/markers).
- Audio group (sound parameters).
- Play group (dedicated Play/Pause button).
- All groups live in a single floating panel `.ui` positioned near canvas top-left; the spiral fits below it.

5.2 Visual controls

- N (rotations): numeric input + Apply button.
    - Integer `N ≥ 0`. Applying resets path and k progression.
- k-multiples filter:
    - If `maxK ≤ 500`: dropdown of `1..maxK`; else numeric input with `[1..maxK]`.
    - Filtering affects both visibility of markers and beeps.
- Markers reveal mode: dropdown:
    - `All`: show all eligible markers from the start (≤ final & ≤ 20 kHz).
    - `Progressive`: show a marker only after `θ ≥ θ_k`.
- Speed: slider (0–100) mapped logarithmically to `[0.002, 0.5]` rad/frame.
    - Display current value (`dθ`) as text.
    - Speed label + slider + value are in one row (`.nowrap`) and must not wrap.

5.3 Audio controls

- Base pitch p (Hz): slider 80–160, default 110.
    - Raising `p` mid-run may finish immediately if `p·nextK > 20000`.
- Volume: slider 0–100%, default 60%.

5.4 Play control (separate section)

- A dedicated Play/Pause button using symbols:
    - ▶ for Play, ⏸ for Pause.
- Button is 1.5× normal control size (via `.play-btn` styling).
- Behavior:
    - App starts paused; first click also unlocks audio context.
    - On finish, the button shows ▶ Play automatically.
    - If finished and Play is clicked → auto-reset (clear path/θ/k state) and start running immediately.
    - Spacebar mirrors button behavior (including auto-reset when finished).

5.5 Defaults

- Mode: Logarithmic (only mode).
- `x = 120 px`, `N = 5`.
- `kFilter = 1` (all integers).
- Markers: All.
- `dθ = 0.072 rad/frame`.
- `p = 110 Hz`, Volume `60%`.
- Start state: paused.

5.6 Keyboard shortcuts

- Space: Play/Pause (and restart if finished).
- `R`: Reset (paused=true).
- `+` / `-`: Increase/decrease speed (bounded).
- `{` / `}`: Decrease/Increase `x` by ~10% (clamped to [10, 600]).
- `M`: Toggle markers mode (progressive ↔ all).
----------
6) Rendering & Guides
- Background ~black (`#0b0b0b`).
- Path stroke ~light gray, tip OA line bluish, final OB line orange; matching filled tip/final dots.
- Axes within the safe area only; dashed circle at final radius; dashed “fit boundary” circle.
- Marker dots with small outward label offset, labels kept upright.
- Label density limiter: show at most ~80 labels (skip with a uniform stride when dense).
----------
7) CSS Requirements
- `.ui`: floating panel; row layout; wraps between groups if narrow.
- `.group`: dashed border, translucent background.
- `.title`: group title.
- `.nowrap`: keeps Speed: label + slider + value on one line (`flex-wrap: nowrap; white-space: nowrap`).
- `.slider`: fixed width (≈160 px), `flex: 0 0 auto`.
- `.playctrl`: container for the play button (same visual style as `.group`).
- `.play-btn`: larger button (≈`font-size: 20px`, extra padding) showing ▶/⏸.
----------
8) Resize Behavior
- UI panel is repositioned near the canvas’s top-left on window resize.
- Safe area recomputed each frame; spiral always fits below panel without reset.
- No redraw reset on resize; only the fit scale `s` adapts.
----------
9) Edge Cases & Policies
- `N = 0`: still draw origin, tip, and any eligible first markers.
- If `p` high enough that `⌊20000/p⌋ < 1`, there are no audio triggers; drawing still proceeds to `θ = 2πN`.
- When `kFilter` is changed mid-run: visuals and audio immediately respect the filter; no auto-reset.
- Audio context is created/resumed on first pointer/keyboard interaction or Play button press. If audio creation fails, visuals continue.
----------
10) Acceptance Criteria
1. Spiral correctness: `r(2πN) = x·2^N`; marker angles `θ_k = 2π log₂ k`.
2. Panel-aware layout: spiral never overlaps the UI, regardless of panel wrap.
3. Markers:
    - Integers-only labels; outward offset; upright text.
    - `All` vs `Progressive` modes behave as specified.
    - `kFilter` shows/plays only multiples of `k` (e.g., 5,10,15,…).
4. Audio:
    - With `p=110` Hz, last beep at `k=181` (~19910 Hz); no beep at 182; may stop early due to 20 kHz cap.
    - Multiple crossings in one frame still trigger each eligible beep exactly once.
5. Play behavior:
    - Starts paused; first Play unlocks audio.
    - On finish, button shows ▶ Play automatically.
    - If finished, clicking Play resets and starts immediately (no manual reset needed).
    - Spacebar mirrors Play/Pause (including restart-when-finished).
6. Speed control: log-scaled slider; HUD/label shows `dθ` live.
7. Defaults load as in §5.5.
----------
11) Implementation Notes (to recreate)
- Use p5 DOM helpers for UI (`createDiv`, `createSelect`, `createSlider`, `createButton`), and Web Audio for sound.
- Compute safe area via `getBoundingClientRect()` for canvas and UI; reserve top-only space.
- Keep a frame-time loop that:
    - Updates `θ`, appends tip to `path`.
    - Triggers any marker beeps crossed this frame.
    - Applies finish logic & flips the Play button state.
- Keep a compact label-density limiter to avoid clutter at large `N`.
