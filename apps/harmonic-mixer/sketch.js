import { TAU, log2, thetaForMultiple } from '../../lib/spiralMath.js';
import { getSafeArea, fitScale }       from '../../lib/panelFit.js';
import { ensureAudio, makeMaster, ramp, audioNow } from '../../lib/audioCore.js';

// ---------- Configuration ----------
const PARTIALS = 16;     // fundamental + 15 overtones (k = 1..16)
const DEFAULT_F0 = 110;  // Hz
const DEFAULT_MASTER = 0.6;
const X_BASE = 120;      // px base radius for k=1
const MARGIN = 32;

// Smoothed timings
const RAMP_MS = 35;         // general gain/freq ramps
const SEQ_XFADE_MS = 35;    // sequence crossfade
const MASTER_FADE_MS = 80;  // master fade on play/pause
const AUD_OPEN_MS = 15;     // audition open
const AUD_TRACK_MS = 15;    // audition while dragging
const AUD_CLOSE_MS = 40;    // audition close

const DEFAULT_TEMPO = 4; // steps/sec (sequence mode)

// ---------- State ----------
let f0 = DEFAULT_F0;
let gains = Array(PARTIALS).fill(0); gains[0] = 1;      // g1=1, others 0
let showCurve = true;
let mode = 'mix'; // 'mix' or 'seq'
let playing = false;
let tempo = DEFAULT_TEMPO;
let seqIndex = 0;        // 0..PARTIALS-1 for sequence mode
let seqNextTime = 0;     // AudioContext time for next step
let wasPlayingBeforeAudition = false;
const auditioning = Array(PARTIALS).fill(false);

// p5 + UI
let ui, groupGlobal, groupGrid, playGroup;
let f0Slider, masterSlider, curveCheckbox, modeSelect, tempoSlider, tempoRow, playBtn;
let colSliders = []; // 16 vertical sliders
let colHzLabels = []; // 16 freq readouts

// ---------- Audio graph ----------
let ctx = null;
let masterGain = null;
// per partial: oscillator -> mixGain -> routeGain -> master
// plus parallel monitor gain for slider audition: osc -> monGain -> master
const oscs = [];
const mixGains = [];
const routeGains = [];
const monitorGains = [];

// helper: read current master slider (0..1)
const masterSliderValue = () => parseInt(masterSlider?.value() ?? Math.round(DEFAULT_MASTER*100), 10) / 100;

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

  // points + lines
  drawPartials(s);

  pop();

  if (playing && mode === 'seq' && ctx) stepSequenceIfDue();
};

// ---------- UI ----------
function buildUI() {
  ui = createDiv().addClass('ui');
  window.addEventListener('resize', positionUI);

  // Global group
  groupGlobal = createDiv().addClass('group');
  groupGlobal.child(createSpan('Global').addClass('title'));

  // f0
  groupGlobal.child(makeLabel('f₀ (Hz):'));
  f0Slider = createSlider(80, 160, f0, 1); f0Slider.addClass('slider');
  const f0Val = createSpan('').style('color', '#cfcfcf');
  groupGlobal.child(f0Slider); groupGlobal.child(f0Val);

  f0Slider.elt.addEventListener('input', () => {
    setF0(parseInt(f0Slider.value(), 10));
    f0Val.html(' ' + f0 + ' Hz');
    ensureAudio();
  });

  // master
  groupGlobal.child(makeLabel('Master:'));
  masterSlider = createSlider(0, 100, Math.round(DEFAULT_MASTER * 100), 1); masterSlider.addClass('slider');
  const mVal = createSpan('').style('color', '#cfcfcf');
  groupGlobal.child(masterSlider); groupGlobal.child(mVal);
  masterSlider.elt.addEventListener('input', () => {
    ensureAudio();
    const v = masterSliderValue();
    if (masterGain) ramp(masterGain.gain, v, audioNow(), RAMP_MS);
    mVal.html(' ' + Math.round(v * 100) + '%');
  });

  // curve toggle
  groupGlobal.child(makeLabel('Spiral curve:'));
  curveCheckbox = createCheckbox('', showCurve);
  curveCheckbox.changed(() => { showCurve = curveCheckbox.checked(); });

  // mode
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

  // tempo
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

  // Grid: 16 columns
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

    // audition-enabled slider (smooth)
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

  // Play handler (smooth)
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
  masterGain = makeMaster(DEFAULT_MASTER);

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
    ramp(oscs[i].frequency, (i + 1) * f0, t, RAMP_MS);
  }
  updateGridUI();
}

function updatePartialFromSlider(i) {
  ensureAudio();
  const v = parseInt(colSliders[i].value(), 10) / 100;
  gains[i] = v;
  const t = audioNow();
  ramp(mixGains[i].gain, v, t, RAMP_MS);
  if (auditioning[i]) ramp(monitorGains[i].gain, v, t, AUD_TRACK_MS);
}

function startAudition(i) {
  ensureAudio();
  wasPlayingBeforeAudition = playing;
  auditioning[i] = true;
  const v = parseInt(colSliders[i].value(), 10) / 100;
  ramp(monitorGains[i].gain, v, audioNow(), AUD_OPEN_MS);
}

function stopAudition(i) {
  if (!auditioning[i]) return;
  auditioning[i] = false;
  ramp(monitorGains[i].gain, 0, audioNow(), AUD_CLOSE_MS);
}

function updateRouteForMode() {
  const t = audioNow();
  if (mode === 'mix') {
    for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, playing ? 1 : 0, t, RAMP_MS);
  } else {
    for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, (playing && i === seqIndex) ? 1 : 0, t, RAMP_MS);
  }
}

// ----- Smooth Play/Pause -----
function smoothStartMix() {
  playing = true;
  refreshPlayButton();
  // open routers first at low master, then fade master up
  const target = masterSliderValue();
  ramp(masterGain.gain, 0, audioNow(), 5);
  for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, 1, audioNow(), RAMP_MS);
  ramp(masterGain.gain, target, audioNow(), MASTER_FADE_MS);
}

function smoothStartSequence() {
  playing = true;
  resetSequenceClock();
  refreshPlayButton();
  const t = audioNow();
  ramp(masterGain.gain, 0, t, 5);
  for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, (i === seqIndex) ? 1 : 0, t, SEQ_XFADE_MS);
  ramp(masterGain.gain, masterSliderValue(), t, MASTER_FADE_MS);
}

function smoothPauseAll() {
  const t = audioNow();
  // fade master down first, then close routers and mark paused
  ramp(masterGain.gain, 0, t, MASTER_FADE_MS);
  setTimeout(() => {
    for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, 0, audioNow(), RAMP_MS);
    playing = false;
    refreshPlayButton();
  }, MASTER_FADE_MS + 10);
}

// Sequence engine
function startSequence() { /* no-op: replaced by smoothStartSequence */ }
function startMix() { /* no-op: replaced by smoothStartMix */ }

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
    // finished sweep: fade master down then stop
    const t = audioNow();
    ramp(masterGain.gain, 0, t, MASTER_FADE_MS);
    setTimeout(() => {
      for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, 0, audioNow(), RAMP_MS);
      playing = false;
      refreshPlayButton();
    }, MASTER_FADE_MS + 10);
    return;
  }

  // crossfade prev -> next while master stays up
  const t = Math.max(now, seqNextTime);
  ramp(routeGains[prev].gain, 0, t, SEQ_XFADE_MS);
  ramp(routeGains[seqIndex].gain, 1, t, SEQ_XFADE_MS);

  seqNextTime = t + (1 / tempo);
}

function pauseAll() { /* no-op: replaced by smoothPauseAll */ }

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
