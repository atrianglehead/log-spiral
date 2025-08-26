import { TAU, log2, thetaForMultiple } from '../../lib/spiralMath.js';
import { getSafeArea, fitScale }       from '../../lib/panelFit.js';
import { ensureAudio, makeMaster, audioNow } from '../../lib/audioCore.js';

// ---------- Configuration ----------
const PARTIALS = 16;     // k = 1..16
const DEFAULT_F0 = 110;  // Hz
const DEFAULT_MASTER = 0.6;
const X_BASE = 120;      // px for k=1
const MARGIN = 32;

// Cosine/equal-power curve times (ms)
const RAMP_MS       = 60;   // general per-parameter smoothing
const SEQ_XFADE_MS  = 60;   // sequence crossfade
const MASTER_FADE_MS= 180;  // master fade on play/pause
const AUD_OPEN_MS   = 30;   // audition open
const AUD_TRACK_MS  = 30;   // audition while dragging
const AUD_CLOSE_MS  = 80;   // audition close

const DEFAULT_TEMPO = 4;    // steps/sec (sequence)

// ---------- State ----------
let f0 = DEFAULT_F0;
let gains = Array(PARTIALS).fill(0); gains[0] = 1;
let showCurve = true;
let mode = 'mix'; // 'mix' | 'seq'
let playing = false;
let tempo = DEFAULT_TEMPO;
let seqIndex = 0;
let seqNextTime = 0;
const auditioning = Array(PARTIALS).fill(false);

// p5 + UI
let ui, groupGlobal, groupGrid, playGroup;
let f0Slider, masterSlider, curveCheckbox, modeSelect, tempoSlider, tempoRow, playBtn;
let colSliders = [];
let colHzLabels = [];

// ---------- Audio graph ----------
let ctx = null;
let masterGain = null;
// per partial: osc -> mixGain -> routeGain -> master
// plus parallel monitor (audition) gain: osc -> monitorGain -> master
const oscs = [];
const mixGains = [];
const routeGains = [];
const monitorGains = [];

// ------------ Equal-power helpers (cosine curves) ------------
function applyCurve(param, from, to, ms, at = audioNow()) {
  const dur = Math.max(0.0005, ms / 1000);
  const N = 128;
  const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);                     // 0..1
    const y = 0.5 - 0.5 * Math.cos(Math.PI * t); // cosine ease-in-out
    curve[i] = from + (to - from) * y;
  }
  param.cancelScheduledValues(at);
  // Keep current value coherent
  if (typeof param.value === 'number') {
    // No-op; setValueCurveAtTime will take control
  }
  param.setValueCurveAtTime(curve, at, dur);
}

function setNow(param, v) {
  const t = audioNow();
  param.cancelScheduledValues(t);
  if (param.setValueAtTime) param.setValueAtTime(v, t);
}

// helper: read current master slider (0..1)
const masterSliderValue = () =>
  parseInt(masterSlider?.value() ?? Math.round(DEFAULT_MASTER * 100), 10) / 100;

// ---------- Setup ----------
window.setup = function () {
  createCanvas(900, 720);
  pixelDensity(2);
  strokeCap(ROUND);
  textFont('system-ui, -apple-system, Segoe UI, Roboto, sans-serif');

  buildUI();
  buildAudio();

  updateGridUI();
  updateRouteForMode();
  refreshPlayButton();

  // Ensure master really starts at 0 to avoid resume pops
  if (masterGain) setNow(masterGain.gain, 0);
};

window.draw = function () {
  background(11);

  const area = getSafeArea(document.querySelector('canvas'), ui.elt, { w: width, h: height, gap: 12, margin: MARGIN });
  const finalR_unscaled = X_BASE * PARTIALS;
  const s = fitScale(finalR_unscaled, area, MARGIN);

  push();
  translate(area.cx, area.cy);

  if (showCurve) drawSpiralCurve(s);

  // axes
  stroke(50); strokeWeight(1);
  line(-area.w/2, 0, area.w/2, 0); line(0, -area.h/2, 0, area.h/2);

  // partials
  drawPartials(s);

  pop();

  if (playing && mode === 'seq' && ctx) stepSequenceIfDue();
};

// ---------- UI ----------
function buildUI() {
  ui = createDiv().addClass('ui');
  window.addEventListener('resize', positionUI);

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
    const v = masterSliderValue();
    if (masterGain) applyCurve(masterGain.gain, masterGain.gain.value, v, RAMP_MS, audioNow());
    mVal.html(' ' + Math.round(v * 100) + '%');
  });

  groupGlobal.child(makeLabel('Spiral curve:'));
  curveCheckbox = createCheckbox('', showCurve);
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

  // Play group
  playGroup = createDiv().addClass('group');
  playBtn = createButton('▶'); playBtn.addClass('play-btn'); playBtn.attribute('title', 'Play/Pause');
  playGroup.child(playBtn);

  // Grid
  groupGrid = createDiv().addClass('group').style('width', '100%');
  const grid = createDiv().addClass('hgrid'); groupGrid.child(grid);
  for (let i = 0; i < PARTIALS; i++) {
    const k = i + 1;
    const col = createDiv().addClass('hcol');
    const label = createSpan('k=' + k);
    const v = createSlider(0, 100, Math.round(gains[i] * 100), 1); v.addClass('vslider');
    const hz = createSpan('').addClass('hz');
    col.child(label); col.child(v); col.child(hz);
    grid.child(col);
    colSliders[i] = v;
    colHzLabels[i] = hz;

    // audition-enabled slider with cosine ramps
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

  // Play handler with master fade
  playBtn.mousePressed(() => {
    ensureAudio();
    if (mode === 'seq') {
      if (!playing) smoothStartSequence(); else smoothPauseAll();
    } else {
      if (!playing) smoothStartMix(); else smoothPauseAll();
    }
  });

  ui.child(groupGlobal);
  ui.child(groupGrid);
  ui.child(playGroup);
  positionUI();

  // init readouts
  f0Slider.elt.dispatchEvent(new Event('input'));
  masterSlider.elt.dispatchEvent(new Event('input'));
  tempoSlider.elt.dispatchEvent(new Event('input'));

  // If tab returns to foreground, keep context alive with master at 0 until Play
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try { ensureAudio(); if (masterGain) setNow(masterGain.gain, playing ? masterSliderValue() : 0); } catch {}
    }
  });
}

function positionUI() {
  const cnv = document.querySelector('canvas'); const r = cnv.getBoundingClientRect(); const pad = 12;
  ui.position(r.left + window.scrollX + pad, r.top + window.scrollY + pad);
  ui.style('max-width', `${r.width - 2 * pad}px`);
}

const makeLabel = (txt) => { const s = createSpan(txt); s.style('color', '#aaa'); s.style('font-weight', 'bold'); return s; };

function updateGridUI() {
  for (let i = 0; i < PARTIALS; i++) {
    const k = i + 1;
    const f = Math.round(k * f0);
    colHzLabels[i].html(`${f} Hz`);
  }
}

function refreshPlayButton() {
  playBtn.html(playing ? '⏸' : '▶');
  playBtn.attribute('title', playing ? 'Pause' : 'Play');
}

// ---------- Audio construction ----------
function buildAudio() {
  ctx = ensureAudio();
  masterGain = makeMaster(0.0); // start at 0 to avoid any resume pop

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
    // frequency changes are already smooth in browsers; wrap anyway
    const from = oscs[i].frequency.value;
    const to = (i + 1) * f0;
    // emulate ramp with small steps: use setValueAtTime to 'to'
    oscs[i].frequency.setValueAtTime(to, t + RAMP_MS / 1000);
  }
  updateGridUI();
}

function updatePartialFromSlider(i) {
  ensureAudio();
  const v = parseInt(colSliders[i].value(), 10) / 100;
  gains[i] = v;
  const t = audioNow();
  applyCurve(mixGains[i].gain, mixGains[i].gain.value, v, RAMP_MS, t);
  if (auditioning[i]) applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_TRACK_MS, t);
}

function startAudition(i) {
  ensureAudio();
  auditioning[i] = true;
  const v = parseInt(colSliders[i].value(), 10) / 100;
  applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_OPEN_MS, audioNow());
}

function stopAudition(i) {
  if (!auditioning[i]) return;
  auditioning[i] = false;
  applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, 0, AUD_CLOSE_MS, audioNow());
}

function updateRouteForMode() {
  const t = audioNow();
  if (mode === 'mix') {
    for (let i = 0; i < PARTIALS; i++) applyCurve(routeGains[i].gain, routeGains[i].gain.value, playing ? 1 : 0, RAMP_MS, t);
  } else {
    for (let i = 0; i < PARTIALS; i++) {
      const target = (playing && i === seqIndex) ? 1 : 0;
      applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, RAMP_MS, t);
    }
  }
}

// ----- Smooth Play/Pause with cosine master fade -----
function smoothStartMix() {
  playing = true;
  refreshPlayButton();
  const t = audioNow();
  // Ensure master is zero before opening routers
  setNow(masterGain.gain, 0);
  for (let i = 0; i < PARTIALS; i++) applyCurve(routeGains[i].gain, routeGains[i].gain.value, 1, RAMP_MS, t);
  // Fade master up with equal-power curve
  applyCurve(masterGain.gain, 0, masterSliderValue(), MASTER_FADE_MS, t + 0.01);
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
  applyCurve(masterGain.gain, 0, masterSliderValue(), MASTER_FADE_MS, t + 0.01);
}

function smoothPauseAll() {
  const t = audioNow();
  // Fade master down first
  applyCurve(masterGain.gain, masterGain.gain.value, 0, MASTER_FADE_MS, t);
  // After fade completes, close routers and mark paused
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
    // finished sweep: fade master down, then stop
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

  // Equal-power crossfade prev -> next
  const t = Math.max(now, seqNextTime);
  applyCurve(routeGains[prev].gain, routeGains[prev].gain.value, 0, SEQ_XFADE_MS, t);
  applyCurve(routeGains[seqIndex].gain, routeGains[seqIndex].gain.value, 1, SEQ_XFADE_MS, t);

  seqNextTime = t + (1 / tempo);
}

// ---------- Drawing ----------
function drawSpiralCurve(s) {
  const thetaMax = TAU * log2(PARTIALS);
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
    const th = thetaForMultiple(k);
    const r = (k * X_BASE) * s;
    const px = r * Math.cos(th);
    const py = r * Math.sin(th);

    const g = gains[i];
    const alpha = g;
    const col = color(220, 210, 140, 255 * alpha);

    stroke(red(col), green(col), blue(col), alpha * 255); strokeWeight(2);
    line(0, 0, px, py);

    noStroke(); fill(red(col), green(col), blue(col), alpha * 255);
    circle(px, py, 8);

    fill(210, 210, 210, 220); textSize(12); textAlign(CENTER, CENTER);
    const off = 16;
    text(`${k}`, px + off * Math.cos(th), py + off * Math.sin(th));
  }
}
