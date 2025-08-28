import { TAU, log2, thetaForMultiple } from '../../lib/spiralMath.js';
import { fitScale }       from '../../lib/panelFit.js';
import { ensureAudio, makeMaster, audioNow } from '../../lib/audioCore.js';

// ---------- Configuration ----------
const PARTIALS = 16;     // k = 1..16
const DEFAULT_F0 = 110;  // Hz
const DEFAULT_MASTER = 0.6;
const X_BASE = 120;      // px for k=1

// Headroom & normalization
const PARTIAL_MAX      = 0.85; // per-partial cap for UI=100%
const MASTER_MAX       = 0.90; // master cap for UI=100%
const NORM_EPS         = 1e-6; // avoid div-by-zero

// Cosine/equal-power curve times (ms)
const RAMP_MS        = 60;   // general per-parameter smoothing
const SEQ_XFADE_MS   = 60;   // sequence crossfade
const MASTER_FADE_MS = 180;  // master fade on play/pause
const AUD_OPEN_MS    = 40;   // audition open / mix->monitor
const AUD_TRACK_MS   = 30;   // audition while dragging
const AUD_CLOSE_MS   = 80;   // audition close / monitor->mix

const DEFAULT_TEMPO  = 4;    // steps/sec (sequence)

// Octave colors: all partials within an octave share a color.
// Colors cycle if the octave index exceeds the palette length.
const OCTAVE_COLORS = [
  [230, 120, 120],
  [120, 230, 120],
  [120, 120, 230],
  [230, 230, 120],
  [230, 120, 230],
  [120, 230, 230],
];

// Base line widths: odd-numbered partials use ODD_WEIGHT.
// Even-numbered partials are slightly wider than half their number.
const ODD_WEIGHT = 2;
const EVEN_DELTA = 0.5;

function octaveColor(k) {
  const idx = Math.floor(Math.log2(k)) % OCTAVE_COLORS.length;
  return OCTAVE_COLORS[idx];
}

function partialStrokeWeight(k) {
  let w = ODD_WEIGHT;
  while (k % 2 === 0) {
    w += EVEN_DELTA;
    k /= 2;
  }
  return w;
}

// ---------- State ----------
let f0 = DEFAULT_F0;
let gains = Array(PARTIALS).fill(0); gains[0] = 1 * PARTIAL_MAX;
let showCurve = true;
let mode = 'mix'; // 'mix' | 'seq'
let playing = false;
let tempo = DEFAULT_TEMPO;
let seqIndex = 0;
let seqNextTime = 0;
let viewMode = 'spiral'; // 'spiral' | 'components'

const auditioning = Array(PARTIALS).fill(false);
const replacing   = Array(PARTIALS).fill(false);

// p5 + UI
let ui, tabContainer, tabSpiral, tabComponents, groupGlobal, groupGrid, playGroup;
let f0Slider, masterSlider, curveCheckbox, modeSelect, tempoSlider, tempoRow, playBtn;
let colSliders = [];
let colHzLabels = [];

// ---------- Audio graph ----------
let ctx = null;
let masterGain = null;
let comp = null; // safety compressor
const oscs = [];
const mixGains = [];
const routeGains = [];
const monitorGains = [];

// ------------ Equal-power helpers ------------
function applyCurve(param, from, to, ms, at = audioNow()) {
  const dur = Math.max(0.0005, ms / 1000);
  const N = 128;
  const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = 0.5 - 0.5 * Math.cos(Math.PI * t);
    curve[i] = from + (to - from) * y;
  }
  param.cancelScheduledValues(at);
  param.setValueCurveAtTime(curve, at, dur);
}
function setNow(param, v) {
  const t = audioNow();
  param.cancelScheduledValues(t);
  if (param.setValueAtTime) param.setValueAtTime(v, t);
}

// ---------- Normalization & master helpers ----------
const uiToPartialGain = (ui01) => ui01 * PARTIAL_MAX;

const masterSlider01 = () =>
  Math.min(MASTER_MAX, (parseInt(masterSlider?.value() ?? Math.round(DEFAULT_MASTER * 100), 10) / 100));

// Hybrid RMS + peak-safe normalization
function computeAutoScale() {
  let sum = 0;
  let sumsq = 0;
  for (let i = 0; i < gains.length; i++) {
    const g = gains[i];
    sum   += g;
    sumsq += g * g;
  }
  const rms = Math.sqrt(sumsq);
  const S_rms  = rms <= NORM_EPS ? 1 : Math.min(1, PARTIAL_MAX / rms);
  const PEAK_GAMMA = 0.95; // a little true-peak headroom
  const S_peak = sum <= NORM_EPS ? 1 : Math.min(1, PEAK_GAMMA / sum);
  return Math.min(S_rms, S_peak);
}

function masterEffective() {
  return masterSlider01() * computeAutoScale();
}

function updateMasterAutoScale(ms = RAMP_MS) {
  if (!masterGain) return;
  const target = (playing || anyAuditioning()) ? masterEffective() : 0;
  applyCurve(masterGain.gain, masterGain.gain.value, target, ms, audioNow());
}

// ---------- Setup ----------
window.setup = function () {

  // Canvas occupies the top half of the viewport.
  createCanvas(windowWidth, windowHeight * 0.5);

  pixelDensity(2);
  strokeCap(ROUND);
  textFont('system-ui, -apple-system, Segoe UI, Roboto, sans-serif');

  buildUI();
  buildAudio();

  updateGridUI();
  updateRouteForMode();
  refreshPlayButton();

  if (masterGain) setNow(masterGain.gain, 0);
};

window.windowResized = function () {

  // Keep the canvas occupying the top half on resize.
  resizeCanvas(windowWidth, windowHeight * 0.5);

};

window.draw = function () {
  background(11);

  if (viewMode === 'spiral') {
    // Spiral bounds: square occupying 80% of the smaller canvas dimension.
    const boundSide = 0.8 * Math.min(width, height);
    const maxRadiusPixels = Math.max(0, boundSide / 2);

    // Center of the canvas
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);

    // Compute scale so the OUTERMOST radius (k = PARTIALS) fits within the bounds
    const finalUnscaledR  = X_BASE * PARTIALS; // outer radius before scaling
    const s = finalUnscaledR > 0 ? (maxRadiusPixels / finalUnscaledR) : 0;

    push();
    translate(cx, cy);

    if (s > 0 && showCurve) {
      // Spiral curve
      const thetaMax = TAU * Math.log2(PARTIALS);
      noFill(); stroke(70); strokeWeight(2);
      beginShape();
      for (let th = 0; th <= thetaMax; th += 0.02) {
        const r = X_BASE * Math.pow(2, th / TAU) * s;
        vertex(r * Math.cos(th), r * Math.sin(th));
      }
      endShape();
    }

    if (s > 0) {
      // Axes
      stroke(50); strokeWeight(1);
      line(-boundSide/2, 0, boundSide/2, 0);
      line(0, -boundSide/2, 0, boundSide/2);

      // Partials
      for (let i = 0; i < PARTIALS; i++) {
        const k = i + 1;
        const th = Math.log2(k) * TAU;
        const r  = (k * X_BASE) * s;
        const px = r * Math.cos(th);
        const py = r * Math.sin(th);

        const g = gains[i];
        const alpha = g / PARTIAL_MAX;
        const [rCol, gCol, bCol] = octaveColor(k);

        stroke(rCol, gCol, bCol, alpha * 255);
        strokeWeight(partialStrokeWeight(k));
        line(0, 0, px, py);

        noStroke();
        fill(rCol, gCol, bCol, alpha * 255);
        circle(px, py, 8);

        fill(210, 210, 210, 220); textSize(12); textAlign(CENTER, CENTER);
        const off = 16;
        text(`${k}`, px + off * Math.cos(th), py + off * Math.sin(th));
      }
    }

    pop();
  }

  else if (viewMode === 'components') {
    // Circle bounds on the left half
    const halfWidth = width / 2;
    const cx = Math.floor(halfWidth / 2);
    const cy = Math.floor(height / 2);
    const circleSide = 0.8 * Math.min(halfWidth, height);
    const circleR = circleSide / 2;

    // Scale so that the largest harmonic length matches the circle radius
    const finalUnscaledR = X_BASE * PARTIALS;
    const s = finalUnscaledR > 0 ? (circleR / finalUnscaledR) : 0;

    push();

    // ----- Left: angles as radial lines -----
    translate(cx, cy);
    noFill(); stroke(50); strokeWeight(2); circle(0, 0, circleR * 2);

    for (let i = 0; i < PARTIALS; i++) {
      const k = i + 1;
      const th = Math.log2(k) * TAU;

      const g = gains[i];
      const alpha = g / PARTIAL_MAX;
      const [rCol, gCol, bCol] = octaveColor(k);

      const px = circleR * Math.cos(th);
      const py = circleR * Math.sin(th);

      stroke(rCol, gCol, bCol, alpha * 255);
      strokeWeight(partialStrokeWeight(k));
      line(0, 0, px, py);

      noStroke();
      fill(rCol, gCol, bCol, alpha * 255);
      circle(px, py, 8);
    }

    pop();

    // ----- Right: lengths as vertical lines -----
    const baseY = cy + circleR;
    const colWidth = halfWidth / PARTIALS;

    for (let i = 0; i < PARTIALS; i++) {
      const k = i + 1;
      const len = (k * X_BASE) * s;
      const x = halfWidth + colWidth * (i + 0.5);
      const yTop = baseY - len;

      const g = gains[i];
      const alpha = g / PARTIAL_MAX;
      const [rCol, gCol, bCol] = octaveColor(k);

      stroke(rCol, gCol, bCol, alpha * 255);
      strokeWeight(partialStrokeWeight(k));
      line(x, baseY, x, yTop);

      noStroke();
      fill(rCol, gCol, bCol, alpha * 255);
      circle(x, yTop, 8);
    }
  }

  if (playing && mode === 'seq' && ctx) stepSequenceIfDue();
};

function refreshPlayButton() {
  if (!playBtn) return;
  playBtn.html(playing ? '❚❚' : '▶');
}

function updateGridUI() {
  for (let i = 0; i < PARTIALS; i++) {
    const hz = Math.round((i + 1) * f0);
    colHzLabels[i]?.html(' ' + hz + ' Hz');
  }
}

// ---------- UI ----------
function buildUI() {
  ui = createDiv().addClass('ui');

  // View tabs
  tabContainer = createDiv().addClass('view-tabs');
  tabSpiral = createSpan('Spiral View').addClass('view-tab').addClass('active');
  tabComponents = createSpan('Component View').addClass('view-tab');
  tabContainer.child(tabSpiral);
  tabContainer.child(tabComponents);
  tabSpiral.mousePressed(() => {
    viewMode = 'spiral';
    tabSpiral.addClass('active');
    tabComponents.removeClass('active');
  });
  tabComponents.mousePressed(() => {
    viewMode = 'components';
    tabComponents.addClass('active');
    tabSpiral.removeClass('active');
  });

  // Play group
  playGroup = createDiv().addClass('group');
  playBtn = createButton('▶'); playBtn.addClass('play-btn'); playBtn.attribute('title', 'Play/Pause');
  playGroup.child(playBtn);

  // Global
  groupGlobal = createDiv().addClass('group');
  groupGlobal.child(createSpan('Global').addClass('title'));

  groupGlobal.child(makeLabel('f₀ (Hz):'));
  f0Slider = createSlider(80, 160, f0, 1); f0Slider.addClass('slider');
  const f0Val = createSpan('').style('color', '#cfcfcf');
  groupGlobal.child(f0Slider); groupGlobal.child(f0Val);
  f0Slider.elt.addEventListener('input', () => {
    setF0(parseInt(f0Slider.value(), 10));
    f0Val.html(' ' + f0 + ' Hz');
    ensureAudio();
  });

  groupGlobal.child(makeLabel('Master:'));
  masterSlider = createSlider(0, 100, Math.round(DEFAULT_MASTER * 100), 1); masterSlider.addClass('slider');
  const mVal = createSpan('').style('color', '#cfcfcf');
  groupGlobal.child(masterSlider); groupGlobal.child(mVal);
  masterSlider.elt.addEventListener('input', () => {
    ensureAudio();
    updateMasterAutoScale(RAMP_MS);
    mVal.html(' ' + Math.round(masterSlider01() * 100) + '%');
  });

  groupGlobal.child(makeLabel('Spiral curve:'));
  curveCheckbox = createCheckbox();
  curveCheckbox.parent(groupGlobal);
  curveCheckbox.checked(showCurve);
  curveCheckbox.changed(() => { showCurve = curveCheckbox.checked(); });

  groupGlobal.child(makeLabel('Mode:'));
  modeSelect = createSelect();
  modeSelect.option('Together', 'mix');
  modeSelect.option('Sequence', 'seq');
  modeSelect.value(mode);
  groupGlobal.child(modeSelect);
  modeSelect.changed(() => {
    mode = modeSelect.value();
    updateRouteForMode();
    tempoRow.style('display', mode === 'seq' ? 'flex' : 'none');
    if (mode === 'seq') resetSequenceClock();
  });

  tempoRow = createDiv().addClass('nowrap');
  tempoRow.child(makeLabel('Tempo:'));
  tempoSlider = createSlider(1, 12, DEFAULT_TEMPO, 1); tempoSlider.addClass('slider');
  const tVal = createSpan('').style('color', '#cfcfcf');
  tempoRow.child(tempoSlider); tempoRow.child(tVal);
  tempoRow.style('display', mode === 'seq' ? 'flex' : 'none');
  groupGlobal.child(tempoRow);
  tempoSlider.elt.addEventListener('input', () => {
    tempo = parseInt(tempoSlider.value(), 10);
    tVal.html(' ' + tempo + ' steps/sec');
    if (mode === 'seq') resetSequenceClock();
  });

  // Grid
  groupGrid = createDiv().addClass('group').style('width', '100%');
  const grid = createDiv().addClass('hgrid'); groupGrid.child(grid);
  for (let i = 0; i < PARTIALS; i++) {
    const k = i + 1;
    const col = createDiv().addClass('hcol');
    const label = createSpan('k=' + k);
    const v = createSlider(0, 100, Math.round((gains[i] / PARTIAL_MAX) * 100), 1); v.addClass('vslider');
    const hz = createSpan('').addClass('hz');
    col.child(label); col.child(v); col.child(hz);
    grid.child(col);
    colSliders[i] = v;
    colHzLabels[i] = hz;

    // audition-enabled slider
    v.elt.addEventListener('pointerdown', (e) => {
      v.elt.setPointerCapture(e.pointerId);
      startAudition(i);
      updatePartialFromSlider(i);
    });
    v.elt.addEventListener('pointermove', () => updatePartialFromSlider(i));
    v.elt.addEventListener('input', () => updatePartialFromSlider(i));
    v.elt.addEventListener('pointerup', (e) => {
      try { v.elt.releasePointerCapture(e.pointerId); } catch (_) {}
      stopAudition(i);
    });
    v.elt.addEventListener('pointercancel', () => stopAudition(i));
    v.elt.addEventListener('lostpointercapture', () => stopAudition(i));
  }

  // Play handler
  playBtn.mousePressed(() => {
    ensureAudio();
    if (mode === 'seq') {
      if (!playing) smoothStartSequence(); else smoothPauseAll();
    } else {
      if (!playing) smoothStartMix(); else smoothPauseAll();
    }
  });

  // ORDER: Tabs, Play, Global, then Grid
  ui.child(tabContainer);
  ui.child(playGroup);
  ui.child(groupGlobal);
  ui.child(groupGrid);

  // init readouts
  f0Slider.elt.dispatchEvent(new Event('input'));
  masterSlider.elt.dispatchEvent(new Event('input'));
  tempoSlider.elt.dispatchEvent(new Event('input'));

  // Resume audio politely when tab returns
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try { ensureAudio(); setNow(masterGain.gain, (playing || anyAuditioning()) ? masterEffective() : 0); } catch {}
    }
  });
}

const makeLabel = (txt) => { const s = createSpan(txt); s.style('color', '#aaa'); s.style('font-weight', 'bold'); return s; };

// ---------- Audio construction ----------
function buildAudio() {
  ctx = ensureAudio();

  // Master -> Compressor -> destination (safety, set high to stay transparent)
  masterGain = makeMaster(0.0);
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -1.0;
  comp.knee.value = 10;
  try { comp.ratio.value = 4; } catch(_) {}
  comp.attack.value = 0.02;
  comp.release.value = 0.25;

  masterGain.connect(comp);
  comp.connect(ctx.destination);

  for (let i = 0; i < PARTIALS; i++) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const mixG = ctx.createGain();      mixG.gain.value = gains[i];
    const routeG = ctx.createGain();    routeG.gain.value = 0;
    const monG = ctx.createGain();      monG.gain.value = 0;

    osc.connect(mixG); mixG.connect(routeG); routeG.connect(masterGain);
    osc.connect(monG); monG.connect(masterGain);

    oscs[i] = osc; mixGains[i] = mixG; routeGains[i] = routeG; monitorGains[i] = monG;

    osc.frequency.value = (i + 1) * f0;
    osc.start();
  }
}

function setF0(newF0) {
  f0 = newF0;
  const t = audioNow();
  for (let i = 0; i < PARTIALS; i++) {
    const to = (i + 1) * f0;
    oscs[i].frequency.setValueAtTime(to, t + RAMP_MS / 1000);
  }
  updateGridUI();
}

// ---------- Audition & gains ----------
function anyAuditioning() {
  for (let i = 0; i < PARTIALS; i++) if (auditioning[i]) return true;
  return false;
}

function updatePartialFromSlider(i) {
  ensureAudio();
  const vUI = parseInt(colSliders[i].value(), 10) / 100;
  const v = uiToPartialGain(vUI);
  gains[i] = v;

  const t = audioNow();

  if (replacing[i]) {
    applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_TRACK_MS, t);
  } else {
    applyCurve(mixGains[i].gain, mixGains[i].gain.value, v, RAMP_MS, t);
    if (auditioning[i]) {
      applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_TRACK_MS, t);
    }
  }

  updateMasterAutoScale(RAMP_MS);
}

function startAudition(i) {
  ensureAudio();
  auditioning[i] = true;

  const vUI = parseInt(colSliders[i].value(), 10) / 100;
  const v = uiToPartialGain(vUI);
  const t = audioNow();

  if (playing && mode === 'mix') {
    applyCurve(mixGains[i].gain,    mixGains[i].gain.value,    0, AUD_OPEN_MS, t);
    applyCurve(monitorGains[i].gain,monitorGains[i].gain.value,v, AUD_OPEN_MS, t);
    replacing[i] = true;
    applyCurve(routeGains[i].gain,  routeGains[i].gain.value,  0, RAMP_MS, t);
  } else {
    if (!playing && masterGain) {
      applyCurve(masterGain.gain, masterGain.gain.value, masterEffective(), AUD_OPEN_MS, t);
    }
    applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_OPEN_MS, t);
  }
  updateMasterAutoScale(RAMP_MS);
}

function stopAudition(i) {
  if (!auditioning[i]) return;
  auditioning[i] = false;

  const t = audioNow();
  const v = gains[i];

  if (replacing[i]) {
    applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, 0, AUD_CLOSE_MS, t);
    applyCurve(mixGains[i].gain,     mixGains[i].gain.value,     v, AUD_CLOSE_MS, t);
    applyCurve(routeGains[i].gain,   routeGains[i].gain.value,   1, RAMP_MS, t);
    replacing[i] = false;
  } else {
    applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, 0, AUD_CLOSE_MS, t);
    if (!playing && !anyAuditioning()) {
      applyCurve(masterGain.gain, masterGain.gain.value, 0, AUD_CLOSE_MS, t);
    }
  }
  updateMasterAutoScale(RAMP_MS);
}

// ---------- Routing & transport ----------
function updateRouteForMode() {
  const t = audioNow();
  if (mode === 'mix') {
    for (let i = 0; i < PARTIALS; i++) {
      const target = playing ? (replacing[i] ? 0 : 1) : 0;
      applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, RAMP_MS, t);
    }
  } else {
    for (let i = 0; i < PARTIALS; i++) {
      const target = (playing && i === seqIndex) ? 1 : 0;
      applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, RAMP_MS, t);
    }
  }
  updateMasterAutoScale(RAMP_MS);
}

// ----- Smooth Play/Pause -----
function smoothStartMix() {
  playing = true;
  refreshPlayButton();
  const t = audioNow();
  setNow(masterGain.gain, 0);
  for (let i = 0; i < PARTIALS; i++) {
    const target = replacing[i] ? 0 : 1;
    applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, RAMP_MS, t);
  }
  for (let i = 0; i < PARTIALS; i++) {
    if (auditioning[i]) {
      const vUI = parseInt(colSliders[i].value(), 10) / 100;
      const v = uiToPartialGain(vUI);
      applyCurve(mixGains[i].gain,     mixGains[i].gain.value,     0, AUD_OPEN_MS, t);
      applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_OPEN_MS, t);
      applyCurve(routeGains[i].gain,   routeGains[i].gain.value,   0, RAMP_MS, t);
      replacing[i] = true;
    }
  }
  applyCurve(masterGain.gain, 0, masterEffective(), MASTER_FADE_MS, t + 0.01);
}

function smoothStartSequence() {
  playing = true;
  resetSequenceClock();
  refreshPlayButton();
  const t = audioNow();
  setNow(masterGain.gain, 0);
  for (let i = 0; i < PARTIALS; i++) {
    const target = (i === seqIndex) ? 1 : 0;
    applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, SEQ_XFADE_MS, t);
  }
  for (let i = 0; i < PARTIALS; i++) replacing[i] = false;
  applyCurve(masterGain.gain, 0, masterEffective(), MASTER_FADE_MS, t + 0.01);
}

function smoothPauseAll() {
  const t = audioNow();
  applyCurve(masterGain.gain, masterGain.gain.value, 0, MASTER_FADE_MS, t);
  setTimeout(() => {
    const t2 = audioNow();
    for (let i = 0; i < PARTIALS; i++) applyCurve(routeGains[i].gain, routeGains[i].gain.value, 0, RAMP_MS, t2);
    playing = false;
    refreshPlayButton();
  }, MASTER_FADE_MS + 12);
}

// Sequence engine
function resetSequenceClock() {
  seqIndex = 0;
  seqNextTime = audioNow() + (1 / tempo);
}

function stepSequenceIfDue() {
  const now = audioNow();
  if (now + 0.005 < seqNextTime) return;

  const prev = seqIndex;
  seqIndex++;

  if (seqIndex >= PARTIALS) {
    const t = audioNow();
    applyCurve(masterGain.gain, masterGain.gain.value, 0, MASTER_FADE_MS, t);
    setTimeout(() => {
      const t2 = audioNow();
      for (let i = 0; i < PARTIALS; i++) applyCurve(routeGains[i].gain, routeGains[i].gain.value, 0, RAMP_MS, t2);
      playing = false;
      refreshPlayButton();
    }, MASTER_FADE_MS + 12);
    return;
  }

  const t = Math.max(now, seqNextTime);
  applyCurve(routeGains[prev].gain, routeGains[prev].gain.value, 0, SEQ_XFADE_MS, t);
  applyCurve(routeGains[seqIndex].gain, routeGains[seqIndex].gain.value, 1, SEQ_XFADE_MS, t);

  seqNextTime = t + (1 / tempo);
}

// ---------- Drawing helpers ----------
function drawSpiralCurve(s) {
  const thetaMax = TAU * Math.log2(PARTIALS);
  noFill(); stroke(70); strokeWeight(2);
  beginShape();
  for (let th = 0; th <= thetaMax; th += 0.02) {
    const r = X_BASE * Math.pow(2, th / TAU) * s;
    vertex(r * Math.cos(th), r * Math.sin(th));
  }
  endShape();
}

function drawPartials(s) {
  for (let i = 0; i < PARTIALS; i++) {
    const k = i + 1;
    const th = (Math.log2(k)) * TAU;  // thetaForMultiple(k)
    const r = (k * X_BASE) * s;
    const px = r * Math.cos(th);
    const py = r * Math.sin(th);

    const g = gains[i];
    const alpha = g / PARTIAL_MAX;
    const [rCol, gCol, bCol] = octaveColor(k);

    stroke(rCol, gCol, bCol, alpha * 255);
    strokeWeight(partialStrokeWeight(k));
    line(0, 0, px, py);

    noStroke();
    fill(rCol, gCol, bCol, alpha * 255);
    circle(px, py, 8);

    fill(210, 210, 210, 220); textSize(12); textAlign(CENTER, CENTER);
    const off = 16;
    text(`${k}`, px + off * Math.cos(th), py + off * Math.sin(th));
  }
}
