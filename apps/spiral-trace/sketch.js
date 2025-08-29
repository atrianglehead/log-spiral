// High-level sketch that coordinates modules
import { TAU, thetaForMultiple, radiusAt } from '../../lib/spiralMath.js';
import { fitScale } from '../../lib/panelFit.js';
import { state, getFinalAndMax, setX, resetSketch, restartAndPlay, MIN_SPEED, MAX_SPEED, margin } from './state.js';
import { ensureAudio, playBeep, audioState, MAX_AUDIBLE_FREQ } from './audio.js';
import { ui, buildUI, refreshPlayPauseLabel, refreshVisualUI, refreshFilterUI, refreshRevealUI, refreshSpeedUI, refreshPitchUI, refreshVolumeUI, syncSpeedSlider } from './ui.js';
import { getArea, drawGuide, computeMarkers, drawMarkers } from './drawing.js';

window.setup = function () {
  createCanvas(800, 800);
  pixelDensity(2);
  strokeCap(ROUND);
  textFont('system-ui, -apple-system, Segoe UI, Roboto, sans-serif');

  buildUI();
  refreshPlayPauseLabel();
  refreshVisualUI();
  refreshFilterUI();
  refreshRevealUI();
  refreshSpeedUI();
  refreshPitchUI();
  refreshVolumeUI();
};

window.draw = function () {
  background(11);

  const { finalR_unscaled, maxTheta, turns, finalMultipleK } = getFinalAndMax();

  const area = getArea(ui);
  const fitRadius = Math.min(area.w, area.h) / 2 - margin;
  const s = fitScale(finalR_unscaled, area, margin);

  push();
  translate(area.cx, area.cy);

  drawGuide(s, finalR_unscaled, turns, fitRadius, area);

  const r_unscaled = radiusAt(state.x, state.theta);
  const r = r_unscaled * s;
  const A = p5.Vector.fromAngle(state.theta, r);
  const B = p5.Vector.fromAngle(0, finalR_unscaled * s);

  if (!state.paused && !state.finished) {
    state.path.push(A.copy());
    const prevTheta = state.theta;
    state.theta += state.dTheta;

    while (true) {
      const k = audioState.nextKToFire;
      if (audioState.baseP * k > MAX_AUDIBLE_FREQ) {
        state.finished = true;
        state.paused = true;
        refreshPlayPauseLabel();
        break;
      }

      const theta_k = thetaForMultiple(k);
      if (theta_k > maxTheta + 1e-9) break;

      if (prevTheta < theta_k + 1e-12 && state.theta >= theta_k - 1e-12) {
        if (k % state.kFilter === 0) {
          ensureAudio();
          if (audioState.audioCtx) playBeep(audioState.baseP * k);
        }
        audioState.nextKToFire++;
        continue;
      }
      break;
    }

    if (!state.finished && state.theta >= maxTheta) {
      state.theta = maxTheta;
      state.finished = true;
      state.paused = true;
      refreshPlayPauseLabel();
      state.path.push(B.copy());
    }
  }

  noFill();
  stroke(180); strokeWeight(2);
  beginShape(); for (const p of state.path) vertex(p.x, p.y); endShape();

  stroke(120, 200, 255); strokeWeight(3); line(0, 0, A.x, A.y);
  stroke(255, 160, 120); strokeWeight(3); line(0, 0, B.x, B.y);

  const allMarkers = computeMarkers(finalMultipleK, maxTheta);
  const multiples = allMarkers.filter(m => (m.k % state.kFilter) === 0 && audioState.baseP * m.k <= MAX_AUDIBLE_FREQ);
  const visible = (state.revealMode === 'progressive')
    ? multiples.filter(m => m.theta <= state.theta + 1e-9)
    : multiples;
  drawMarkers(visible, s);

  noStroke(); fill(120, 200, 255); circle(A.x, A.y, 8);
  fill(255, 160, 120); circle(B.x, B.y, 10);

  pop();

  resetMatrix();
  fill(230); textSize(13);
  const status = state.finished ? 'complete' : (state.paused ? 'paused' : 'running');
  const rDraw = (r_unscaled * s).toFixed(1);
  const finalDraw = (finalR_unscaled * s).toFixed(1);
  const kMaxDueToAudio = Math.floor(MAX_AUDIBLE_FREQ / audioState.baseP);
  const maxFreqShown = Math.min(MAX_AUDIBLE_FREQ, audioState.baseP * (kMaxDueToAudio || 1));
  text(
    `N=${state.rotations_N}  x=${state.x}px  r=${rDraw}px  final=${finalDraw}px  s=${s.toFixed(3)}  k=${state.kFilter}  ` +
    `reveal=${state.revealMode}  speed=${state.dTheta.toFixed(3)}  p=${audioState.baseP}Hz  vol=${audioState.volumePct}%  stop≤${maxFreqShown}Hz  status=${status}`,
    12, height - 28
  );
};

window.keyPressed = function () {
  ensureAudio();
  if (key === ' ') {
    if (state.finished) {
      restartAndPlay();
    } else {
      state.paused = !state.paused;
    }
    refreshPlayPauseLabel();
  }
  if (key === 'R' || key === 'r') { resetSketch(); refreshPlayPauseLabel(); }
  if (key === '+' || key === '=') { state.dTheta = Math.min(state.dTheta * 1.25, MAX_SPEED); syncSpeedSlider(); }
  if (key === '-' || key === '_') { state.dTheta = Math.max(state.dTheta / 1.25, MIN_SPEED); syncSpeedSlider(); }
  if (key === '{') setX(Math.max(10, Math.floor(state.x * 0.9)));
  if (key === '}') setX(Math.min(600, Math.ceil(state.x * 1.1)));
  if (key === 'M' || key === 'm') { state.revealMode = (state.revealMode === 'progressive') ? 'all' : 'progressive'; refreshRevealUI(); }
};
