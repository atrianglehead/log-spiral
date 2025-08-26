// ES module sketch that reuses shared helpers
import { TAU, thetaForMultiple, radiusAt } from '../../lib/spiralMath.js';
import { getSafeArea, fitScale } from '../../lib/panelFit.js';

// -------------------- Config & Defaults --------------------
let x = 120;                  // base length (px) for fundamental radius
let rotations_N = 5;          // integer number of full rotations
let theta = 0;                // current angle
let dTheta = 0.072;           // default speed (rad/frame)
let path = [];                // sampled tip positions
let paused = true;            // start paused
let finished = false;

const margin = 32;
const MARKER_CAP = 20000;
const FILTER_LIST_MAX = 500;

// Markers / visibility
let kFilter = 1;              // show/beep multiples of k
let revealMode = 'all';       // 'all' | 'progressive'

// Audio (Web Audio API)
let audioCtx = null;
let masterGain = null;
let baseP = 110;              // Hz (80..160)
let volumePct = 60;           // %
let nextKToFire = 1;          // next integer multiple to sonify

// Speed slider mapping (log scale)
const MIN_SPEED = 0.002;
const MAX_SPEED = 0.5;
function sliderToSpeed(val01) { return MIN_SPEED * Math.pow(MAX_SPEED / MIN_SPEED, val01); }
function speedToSlider(dt) { return (Math.log(dt) - Math.log(MIN_SPEED)) / (Math.log(MAX_SPEED) - Math.log(MIN_SPEED)); }

// -------------------- Audio helpers --------------------
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volumePct / 100;
    masterGain.connect(audioCtx.destination);
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playBeep(fHz, tNow = null) {
  if (!audioCtx) return;
  const now = tNow ?? audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(fHz, now);

  // Percussive envelope, duration 0.18s (1.5× from earlier 0.12s)
  const dur = 0.18;
  const a = 0.006, d = 0.14;
  const peak = 0.9, sustain = 0.0;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + a);
  gain.gain.linearRampToValueAtTime(sustain, now + a + d);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + dur + 0.02);
}

// -------------------- Panel-aware drawing area --------------------
function getArea() {
  const canvasEl = document.querySelector('canvas');
  return getSafeArea(canvasEl, ui.elt, { w: width, h: height, gap: 12, margin });
}

// -------------------- UI elements --------------------
let ui;
let groupVisual, groupAudio, groupPlay;
let playPauseBtn;
let inputN, btnApplyN;
let filterSelect, filterInput;
let revealSelect;
let speedLabelSpan, speedSlider, speedValueSpan;
let pSlider, pValueSpan;
let volSlider, volValueSpan;

// -------------------- p5 entry points --------------------
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

  // Fit below panel
  const area = getArea();
  const fitRadius = Math.min(area.w, area.h) / 2 - margin;
  const s = fitScale(finalR_unscaled, area, margin);

  // Move origin to safe center
  push();
  translate(area.cx, area.cy);

  drawGuide(s, finalR_unscaled, turns, fitRadius, area);

  // tip position
  const r_unscaled = radiusAt(x, theta);
  const r = r_unscaled * s;
  const A = p5.Vector.fromAngle(theta, r);
  const B = p5.Vector.fromAngle(0, finalR_unscaled * s);

  // animate
  if (!paused && !finished) {
    path.push(A.copy());
    const prevTheta = theta;
    theta += dTheta;

    // AUDIO trigger loop — handle multiple crossings per frame
    while (true) {
      const k = nextKToFire;
      if (baseP * k > 20000) {
        finished = true;
        paused = true;              // auto-show Play
        refreshPlayPauseLabel();
        break;
      }

      const theta_k = thetaForMultiple(k);
      if (theta_k > maxTheta + 1e-9) break;

      if (prevTheta < theta_k + 1e-12 && theta >= theta_k - 1e-12) {
        if (k % kFilter === 0) {
          ensureAudio();
          if (audioCtx) playBeep(baseP * k);
        }
        nextKToFire++;
        continue;
      }
      break;
    }

    if (!finished && theta >= maxTheta) {
      theta = maxTheta;
      finished = true;
      paused = true;                // auto-show Play
      refreshPlayPauseLabel();
      path.push(B.copy());
    }
  }

  // draw path & rays
  noFill();
  stroke(180); strokeWeight(2);
  beginShape(); for (const p of path) vertex(p.x, p.y); endShape();

  stroke(120, 200, 255); strokeWeight(3); line(0, 0, A.x, A.y); // OA
  stroke(255, 160, 120); strokeWeight(3); line(0, 0, B.x, B.y); // OB

  // markers
  const allMarkers = computeMarkers(finalMultipleK, maxTheta);
  const multiples = allMarkers.filter(m => (m.k % kFilter) === 0 && baseP * m.k <= 20000);
  const visible = (revealMode === 'progressive')
    ? multiples.filter(m => m.theta <= theta + 1e-9)
    : multiples;
  drawMarkers(visible, s);

  // tip + final
  noStroke(); fill(120, 200, 255); circle(A.x, A.y, 8);
  fill(255, 160, 120); circle(B.x, B.y, 10);

  pop();

  // HUD
  resetMatrix();
  fill(230); textSize(13);
  const status = finished ? 'complete' : (paused ? 'paused' : 'running');
  const rDraw = (r_unscaled * s).toFixed(1);
  const finalDraw = (finalR_unscaled * s).toFixed(1);
  const kMaxDueToAudio = Math.floor(20000 / baseP);
  const maxFreqShown = Math.min(20000, baseP * (kMaxDueToAudio || 1));
  text(
    `N=${rotations_N}  x=${x}px  r=${rDraw}px  final=${finalDraw}px  s=${s.toFixed(3)}  k=${kFilter}  ` +
    `reveal=${revealMode}  speed=${dTheta.toFixed(3)}  p=${baseP}Hz  vol=${volumePct}%  stop≤${maxFreqShown}Hz  status=${status}`,
    12, height - 28
  );
};

// -------------------- Drawing helpers --------------------
function drawGuide(s, finalR_unscaled, turns, fitRadius, area) {
  // axes within safe area
  stroke(60); strokeWeight(1);
  line(-area.w / 2, 0, area.w / 2, 0);
  line(0, -area.h / 2, 0, area.h / 2);

  // final radius circle
  push();
  noFill(); drawingContext.setLineDash([6, 6]); stroke(70);
  const finalR = finalR_unscaled * s;
  circle(0, 0, 2 * finalR);
  pop();

  // tick rays per rotation
  push();
  stroke(70); drawingContext.setLineDash([3, 6]);
  const outerR = Math.min(finalR, fitRadius);
  for (let k = 0; k <= turns; k++) {
    const ang = k * TAU;
    const v = p5.Vector.fromAngle(ang, outerR);
    line(0, 0, v.x, v.y);
  }
  pop();

  // fit boundary
  push();
  noFill(); drawingContext.setLineDash([2, 8]); stroke(45);
  circle(0, 0, 2 * fitRadius);
  pop();

  // origin
  noStroke(); fill(200); circle(0, 0, 5);
}

// markers up to final length & ≤ 20 kHz
function computeMarkers(finalMultipleK, maxTheta) {
  const K = Math.min(finalMultipleK, MARKER_CAP);
  const arr = [];
  for (let k = 1; k <= K; k++) {
    if (baseP * k > 20000) break;
    const th = thetaForMultiple(k);
    if (th > maxTheta + 1e-9) break;
    arr.push({ k, theta: th });
  }
  return arr;
}

function drawMarkers(markers, s) {
  push(); textSize(12); textAlign(CENTER, CENTER);
  const showEvery = markers.length <= 80 ? 1 : Math.ceil(markers.length / 80);
  for (let i = 0; i < markers.length; i++) {
    const { k, theta } = markers[i];
    const p = p5.Vector.fromAngle(theta, k * x * s);
    noStroke(); fill(250, 210, 120); circle(p.x, p.y, 6);
    if (i % showEvery === 0) {
      fill(210);
      const off = p5.Vector.fromAngle(theta, 16);
      text(`${k}`, p.x + off.x, p.y + off.y); // upright numerals
    }
  }
  pop();
}

// -------------------- Keyboard --------------------
window.keyPressed = function () {
  ensureAudio();
  if (key === ' ') {
    if (finished) {
      restartAndPlay();
    } else {
      paused = !paused;
      refreshPlayPauseLabel();
    }
  }
  if (key === 'R' || key === 'r') resetSketch();
  if (key === '+' || key === '=') { dTheta = Math.min(dTheta * 1.25, MAX_SPEED); syncSpeedSlider(); }
  if (key === '-' || key === '_') { dTheta = Math.max(dTheta / 1.25, MIN_SPEED); syncSpeedSlider(); }
  if (key === '{') setX(Math.max(10, Math.floor(x * 0.9)));
  if (key === '}') setX(Math.min(600, Math.ceil(x * 1.1)));
  if (key === 'M' || key === 'm') { revealMode = (revealMode === 'progressive') ? 'all' : 'progressive'; revealSelect.value(revealMode); }
};

// -------------------- UI --------------------
function buildUI() {
  ui = createDiv();
  ui.addClass('ui');

  const label = (txt) => { const s = createSpan(txt); s.style('color', '#aaa'); s.style('font-weight', 'bold'); s.style('margin-right', '4px'); return s; };

  // VISUAL group
  groupVisual = createDiv(); groupVisual.addClass('group');
  const visTitle = createSpan('Visual'); visTitle.addClass('title'); groupVisual.child(visTitle);

  groupVisual.child(label('N:'));
  inputN = createInput(String(rotations_N), 'number'); inputN.style('width', '72px'); groupVisual.child(inputN);
  btnApplyN = createButton('Apply'); groupVisual.child(btnApplyN);

  groupVisual.child(label('k-multiples:'));
  filterSelect = createSelect(); groupVisual.child(filterSelect);
  filterInput = createInput(String(kFilter), 'number'); filterInput.style('width', '64px'); groupVisual.child(filterInput);

  groupVisual.child(label('Markers:'));
  revealSelect = createSelect();
  revealSelect.option('Progressive', 'progressive');
  revealSelect.option('All', 'all');
  revealSelect.value(revealMode);
  groupVisual.child(revealSelect);

  // Speed row (one line)
  const speedRow = createDiv(); speedRow.addClass('nowrap'); groupVisual.child(speedRow);
  speedLabelSpan = createSpan('Speed:'); speedRow.child(speedLabelSpan);
  speedSlider = createSlider(0, 100, 0, 1); speedSlider.addClass('slider'); speedRow.child(speedSlider);
  speedValueSpan = createSpan(''); speedValueSpan.style('color', '#cfcfcf'); speedRow.child(speedValueSpan);

  ui.child(groupVisual);

  // AUDIO group
  groupAudio = createDiv(); groupAudio.addClass('group');
  const audTitle = createSpan('Audio'); audTitle.addClass('title'); groupAudio.child(audTitle);

  groupAudio.child(label('p (Hz):'));
  pSlider = createSlider(80, 160, baseP, 1); pSlider.addClass('slider'); groupAudio.child(pSlider);
  pValueSpan = createSpan(''); pValueSpan.style('color', '#cfcfcf'); groupAudio.child(pValueSpan);

  groupAudio.child(label('Vol:'));
  volSlider = createSlider(0, 100, volumePct, 1); volSlider.addClass('slider'); groupAudio.child(volSlider);
  volValueSpan = createSpan(''); volValueSpan.style('color', '#cfcfcf'); groupAudio.child(volValueSpan);

  ui.child(groupAudio);

  // PLAY group (separate)
  groupPlay = createDiv(); groupPlay.addClass('group playctrl');
  playPauseBtn = createButton('▶'); playPauseBtn.addClass('play-btn'); playPauseBtn.attribute('title', 'Play/Pause');
  groupPlay.child(playPauseBtn);
  ui.child(groupPlay);

  // Position & events
  positionUI();
  window.addEventListener('resize', positionUI);

  playPauseBtn.mousePressed(() => {
    ensureAudio();            // unlock audio on first click
    if (finished) {
      restartAndPlay();       // auto-reset & start if finished
    } else {
      paused = !paused;
      refreshPlayPauseLabel();
    }
  });

  inputN.elt.addEventListener('keydown', e => { if (e.key === 'Enter') applyN(); });
  btnApplyN.mousePressed(applyN);

  filterSelect.changed(() => { const v = parseInt(filterSelect.value(), 10); if (Number.isFinite(v)) kFilter = v; });
  filterInput.elt.addEventListener('input', () => {
    const { finalMultipleK } = getFinalAndMax(); const maxK = Math.max(1, Math.floor(finalMultipleK / 2));
    const v = parseInt(filterInput.value(), 10);
    if (Number.isFinite(v) && v >= 1 && v <= maxK) kFilter = v;
  });

  revealSelect.changed(() => { revealMode = revealSelect.value(); });

  speedSlider.elt.addEventListener('input', () => {
    const t = speedSlider.value() / 100;
    dTheta = sliderToSpeed(t);
    updateSpeedLabel();
  });

  window.addEventListener('pointerdown', ensureAudio);

  pSlider.elt.addEventListener('input', () => {
    ensureAudio();
    baseP = parseInt(pSlider.value(), 10);
    updatePitchLabel();
    if (baseP * nextKToFire > 20000) { finished = true; paused = true; refreshPlayPauseLabel(); }
  });

  volSlider.elt.addEventListener('input', () => {
    ensureAudio();
    volumePct = parseInt(volSlider.value(), 10);
    if (masterGain) masterGain.gain.value = volumePct / 100;
    updateVolumeLabel();
  });

  // Initialize UI readouts
  refreshSpeedUI();
  refreshPitchUI();
  refreshVolumeUI();
}

function positionUI() {
  const cnv = document.querySelector('canvas'); const r = cnv.getBoundingClientRect(); const pad = 12;
  ui.position(r.left + window.scrollX + pad, r.top + window.scrollY + pad);
  ui.style('max-width', `${r.width - 2 * pad}px`);
}

// -------------------- UI helpers --------------------
function applyN() {
  const v = parseFloat(inputN.value());
  if (!Number.isFinite(v)) { inputN.value(String(rotations_N)); return; }
  setRotations(v);
  refreshFilterUI();
  resetAudioProgress();
}

function refreshPlayPauseLabel() {
  if (!playPauseBtn) return;
  playPauseBtn.html(paused ? '▶' : '⏸');
  playPauseBtn.attribute('title', paused ? 'Play' : 'Pause');
}

function refreshVisualUI() { inputN.value(String(rotations_N)); }

function refreshFilterUI() {
  const { finalMultipleK } = getFinalAndMax();
  const maxK = Math.max(1, Math.floor(finalMultipleK / 2));
  if (kFilter > maxK) kFilter = maxK;

  const useSelect = maxK <= FILTER_LIST_MAX;
  if (useSelect) {
    filterSelect.show(); filterInput.hide();
    filterSelect.elt.innerHTML = '';
    for (let k = 1; k <= maxK; k++) filterSelect.option(String(k), String(k));
    filterSelect.value(String(kFilter));
  } else {
    filterSelect.hide(); filterInput.show();
    filterInput.attribute('min', '1');
    filterInput.attribute('max', String(maxK));
    filterInput.value(String(kFilter));
  }
}

function refreshRevealUI() { revealSelect.value(revealMode); }

function refreshSpeedUI() { const t = speedToSlider(dTheta); speedSlider.value(Math.round(t * 100)); updateSpeedLabel(); }
function syncSpeedSlider() { const t = speedToSlider(dTheta); speedSlider.value(Math.round(t * 100)); updateSpeedLabel(); }
function updateSpeedLabel() { speedValueSpan.html(` ${dTheta.toFixed(3)} rad/frame`); }

function refreshPitchUI() { pSlider.value(baseP); updatePitchLabel(); }
function updatePitchLabel() { pValueSpan.html(` ${baseP} Hz`); }
function refreshVolumeUI() { volSlider.value(volumePct); updateVolumeLabel(); }
function updateVolumeLabel() { volValueSpan.html(` ${volumePct}%`); }

// -------------------- State helpers --------------------
function resetAudioProgress() { nextKToFire = 1; }

function setRotations(N) { rotations_N = Math.max(0, Math.floor(N)); inputN.value(String(rotations_N)); resetPathOnly(); }
function setX(nx) { x = nx; resetPathOnly(); resetAudioProgress(); }
function resetSketch() { theta = 0; path = []; paused = true; finished = false; resetAudioProgress(); refreshPlayPauseLabel(); }
function resetPathOnly() { theta = 0; path = []; finished = false; nextKToFire = 1; }

function restartAndPlay() {
  resetPathOnly();
  paused = false;
  refreshPlayPauseLabel();
}

function getFinalAndMax() {
  const N = Math.max(0, Math.floor(rotations_N));
  const maxTheta = TAU * N;
  const finalR_unscaled = radiusAt(x, maxTheta); // x * 2^N
  const turns = N;
  const finalMultipleK = Math.pow(2, N); // 1..2^N (markers/beeps may stop earlier due to 20kHz)
  return { finalR_unscaled, maxTheta, turns, finalMultipleK };
}
