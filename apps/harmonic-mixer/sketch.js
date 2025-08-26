import { TAU, log2, thetaForMultiple } from '../../lib/spiralMath.js';
import { getSafeArea, fitScale }       from '../../lib/panelFit.js';
import { ensureAudio, makeMaster, ramp, audioNow } from '../../lib/audioCore.js';

// ---------- Configuration ----------
const PARTIALS = 16;     // fundamental + 15 overtones (k = 1..16)
const DEFAULT_F0 = 110;  // Hz
const DEFAULT_MASTER = 0.6;
const X_BASE = 120;      // px base radius for k=1
const MARGIN = 32;

const RAMP_MS = 20;      // gain/freq ramps to avoid clicks
const SEQ_XFADE_MS = 20; // sequence crossfade between steps
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

// ---------- Setup ----------
window.setup = function () {
  createCanvas(900, 720);
  pixelDensity(2);
  strokeCap(ROUND);
  textFont('system-ui, -apple-system, Segoe UI, Roboto, sans-serif');

  buildUI();
  buildAudio();

  updateGlobalUI();
  updateGridUI();
  updateRouteForMode();   // ensure routers match default 'mix'
  refreshPlayButton();
};

window.draw = function () {
  background(11);

  const area = getSafeArea(document.querySelector('canvas'), ui.elt, { w: width, h: height, gap: 12, margin: MARGIN });
  const finalR_unscaled = X_BASE * PARTIALS; // since r_k = k*x, k max = 16
  const s = fitScale(finalR_unscaled, area, MARGIN);

  push();
  translate(area.cx, area.cy);

  // Optional spiral curve (from θ=0..θ_16)
  if (showCurve) drawSpiralCurve(s);

  // Radial axes (faint)
  stroke(50); strokeWeight(1);
  line(-area.w/2, 0, area.w/2, 0); line(0, -area.h/2, 0, area.h/2);

  // Draw points + radial lines for k=1..16, opacity follows gain
  drawPartials(s);

  pop();

  // Sequence scheduling
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
    const v = parseInt(masterSlider.value(), 10) / 100;
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

  // tempo (only for sequence)
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

  // Play group (separate)
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

    // --- Slider audition: play while held (even if paused or in other mode) ---
    v.elt.addEventListener('pointerdown', () => startAudition(i));
    v.elt.addEventListener('pointermove', () => updatePartialFromSlider(i));
    v.elt.addEventListener('input',       () => updatePartialFromSlider(i)); // for keyboard/mousewheel
    v.elt.addEventListener('pointerup',   () => stopAudition(i));
    v.elt.addEventListener('pointercancel', () => stopAudition(i));
    v.elt.addEventListener('lostpointercapture', () => stopAudition(i));
  }

  // Play handler
  playBtn.mousePressed(() => {
    ensureAudio();
    if (mode === 'seq') {
      if (!playing) startSequence();
      else pauseAll();
    } else {
      // mix mode
      if (!playing) startMix();
      else pauseAll();
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

function updateGlobalUI() {
  // just ensures initial text values are set
}

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
    const mixG = ctx.createGain();      mixG.gain.value = gains[i];     // slider gain
    const routeG = ctx.createGain();    routeG.gain.value = 0;          // router (0/1)
    const monG = ctx.createGain();      monG.gain.value = 0;            // audition path

    osc.connect(mixG); mixG.connect(routeG); routeG.connect(masterGain);
    osc.connect(monG); monG.connect(masterGain);

    oscs[i] = osc; mixGains[i] = mixG; routeGains[i] = routeG; monitorGains[i] = monG;

    // initial frequency
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
  ramp(mixGains[i].gain, v, audioNow(), RAMP_MS);
}

function startAudition(i) {
  ensureAudio();
  wasPlayingBeforeAudition = playing;
  // open monitor gain for this partial; keep following slider value
  const v = parseInt(colSliders[i].value(), 10) / 100;
  ramp(monitorGains[i].gain, v, audioNow(), 5);
  // while held, pointermove/input keeps calling updatePartialFromSlider (mix gain), and we mirror to monitor too:
  colSliders[i].addClass('auditioning');
  colSliders[i].setAttribute('data-aud', '1');
}

function stopAudition(i) {
  // close monitor gain quickly
  ramp(monitorGains[i].gain, 0, audioNow(), 30);
  colSliders[i].removeClass('auditioning');
  colSliders[i].removeAttribute('data-aud');
  if (!wasPlayingBeforeAudition && mode === 'mix' && !playing) {
    // remained paused overall; nothing else to do
  }
}

function updateRouteForMode() {
  const t = audioNow();
  if (mode === 'mix') {
    // routers follow play/pause (1 when playing, else 0)
    for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, playing ? 1 : 0, t, RAMP_MS);
  } else {
    // sequence: only current index open when playing; else all 0
    for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, (playing && i === seqIndex) ? 1 : 0, t, RAMP_MS);
  }
}

function startMix() {
  playing = true;
  updateRouteForMode();
  refreshPlayButton();
}

function startSequence() {
  playing = true;
  resetSequenceClock();
  // open current step, close others
  const t = audioNow();
  for (let i = 0; i < PARTIALS; i++) {
    const target = (i === seqIndex) ? 1 : 0;
    ramp(routeGains[i].gain, target, t, SEQ_XFADE_MS);
  }
  refreshPlayButton();
}

function resetSequenceClock() {
  seqIndex = 0;
  seqNextTime = audioNow() + (1 / tempo);
}

function stepSequenceIfDue() {
  const now = audioNow();
  if (now + 0.005 < seqNextTime) return; // small lookahead window

  // advance to next partial (if any)
  const prev = seqIndex;
  seqIndex++;

  if (seqIndex >= PARTIALS) {
    // finished the sweep
    playing = false;
    // close routers
    const t = audioNow();
    for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, 0, t, SEQ_XFADE_MS);
    refreshPlayButton();
    return;
  }

  // crossfade prev -> next
  const t = Math.max(now, seqNextTime);
  ramp(routeGains[prev].gain, 0, t, SEQ_XFADE_MS);
  ramp(routeGains[seqIndex].gain, 1, t, SEQ_XFADE_MS);

  seqNextTime = t + (1 / tempo);
}

function pauseAll() {
  playing = false;
  const t = audioNow();
  for (let i = 0; i < PARTIALS; i++) ramp(routeGains[i].gain, 0, t, RAMP_MS);
  refreshPlayButton();
}

// ---------- Drawing ----------
function drawSpiralCurve(s) {
  // draw from θ=0 to θ corresponding to k=16 → θ_16 = 2π log2 16 = 8π (4 turns)
  const thetaMax = TAU * log2(PARTIALS);
  noFill(); stroke(70); strokeWeight(2);
  beginShape();
  for (let th = 0; th <= thetaMax; th += 0.02) {
    const r = X_BASE * Math.pow(2, th / TAU) * s;
    const x = r * Math.cos(th);
    const y = r * Math.sin(th);
    vertex(x, y);
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

    const g = gains[i]; // 0..1
    const alpha = Math.min(1, Math.max(0.08, g)); // small floor so 0% is still faintly visible? if you want invisible, remove max(0.08,...)
    const col = color(220, 210, 140, 255 * alpha);

    // radial line
    stroke(red(col), green(col), blue(col), alpha * 255); strokeWeight(2);
    line(0, 0, px, py);

    // point
    noStroke(); fill(red(col), green(col), blue(col), alpha * 255);
    circle(px, py, 8);

    // label
    fill(210, 210, 210, 220); textSize(12); textAlign(CENTER, CENTER);
    const off = 16;
    text(`${k}`, px + off * Math.cos(th), py + off * Math.sin(th));
  }
}

