import { ensureAudio, makeMaster, audioNow } from '../../lib/audioCore.js';

export const PARTIALS = 16;     // k = 1..16
export const DEFAULT_F0 = 110;  // Hz
export const DEFAULT_MASTER = 0.6;
export const X_BASE = 120;      // px for k=1

// Headroom & normalization
export const PARTIAL_MAX = 0.85; // per-partial cap for UI=100%
export const MASTER_MAX  = 0.90; // master cap for UI=100%
const NORM_EPS = 1e-6;          // avoid div-by-zero

// Cosine/equal-power curve times (ms)
const RAMP_MS        = 60;   // general per-parameter smoothing
const SEQ_XFADE_MS   = 60;   // sequence crossfade
const MASTER_FADE_MS = 180;  // master fade on play/pause
const AUD_OPEN_MS    = 40;   // audition open / mix->monitor
const AUD_TRACK_MS   = 30;   // audition while dragging
const AUD_CLOSE_MS   = 80;   // audition close / monitor->mix

export const DEFAULT_TEMPO = 4;    // steps/sec (sequence)

// ---------- State ----------
let f0 = DEFAULT_F0;
export let gains = Array(PARTIALS).fill(0); gains[0] = 1 * PARTIAL_MAX;
let masterUI = DEFAULT_MASTER;
let mode = 'mix'; // 'mix' | 'seq'
let playing = false;
let tempo = DEFAULT_TEMPO;
let seqIndex = 0;
let seqNextTime = 0;

const auditioning = Array(PARTIALS).fill(false);
const replacing   = Array(PARTIALS).fill(false);
const uiValues    = Array(PARTIALS).fill(0); uiValues[0] = 1;

// Audio graph
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
  return masterUI * computeAutoScale();
}

export function updateMasterAutoScale(ms = RAMP_MS) {
  if (!masterGain) return;
  const target = (playing || anyAuditioning()) ? masterEffective() : 0;
  applyCurve(masterGain.gain, masterGain.gain.value, target, ms, audioNow());
}

// ---------- Audio construction ----------
export function buildAudio() {
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

export function setF0(newF0) {
  f0 = newF0;
  const t = audioNow();
  for (let i = 0; i < PARTIALS; i++) {
    const to = (i + 1) * f0;
    oscs[i].frequency.setValueAtTime(to, t + RAMP_MS / 1000);
  }
}

export const getF0 = () => f0;

export function setMasterUI(v01) {
  masterUI = Math.min(MASTER_MAX, v01);
  updateMasterAutoScale(RAMP_MS);
}

export function setMode(m) {
  mode = m;
  updateRouteForMode();
}
export const getMode = () => mode;

export function setTempo(t) {
  tempo = t;
  if (mode === 'seq') resetSequenceClock();
}

export const isPlaying = () => playing;

export function updatePartialGain(i, v01) {
  ensureAudio();
  uiValues[i] = v01;
  const v = uiToPartialGain(v01);
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

export function startAudition(i) {
  ensureAudio();
  auditioning[i] = true;

  const v = uiToPartialGain(uiValues[i]);
  const t = audioNow();

  if (playing && mode === 'mix') {
    applyCurve(mixGains[i].gain,    mixGains[i].gain.value,    0, AUD_OPEN_MS, t);
    applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_OPEN_MS, t);
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

export function stopAudition(i) {
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

export function anyAuditioning() {
  for (let i = 0; i < PARTIALS; i++) if (auditioning[i]) return true;
  return false;
}

export function updateRouteForMode() {
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
export function smoothStartMix() {
  ensureAudio();
  playing = true;
  const t = audioNow();
  setNow(masterGain.gain, 0);
  for (let i = 0; i < PARTIALS; i++) {
    const target = replacing[i] ? 0 : 1;
    applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, RAMP_MS, t);
  }
  for (let i = 0; i < PARTIALS; i++) {
    if (auditioning[i]) {
      const v = uiToPartialGain(uiValues[i]);
      applyCurve(mixGains[i].gain,     mixGains[i].gain.value,     0, AUD_OPEN_MS, t);
      applyCurve(monitorGains[i].gain, monitorGains[i].gain.value, v, AUD_OPEN_MS, t);
      applyCurve(routeGains[i].gain,   routeGains[i].gain.value,   0, RAMP_MS, t);
      replacing[i] = true;
    }
  }
  applyCurve(masterGain.gain, 0, masterEffective(), MASTER_FADE_MS, t + 0.01);
}

export function smoothStartSequence() {
  ensureAudio();
  playing = true;
  resetSequenceClock();
  const t = audioNow();
  setNow(masterGain.gain, 0);
  for (let i = 0; i < PARTIALS; i++) {
    const target = (i === seqIndex) ? 1 : 0;
    applyCurve(routeGains[i].gain, routeGains[i].gain.value, target, SEQ_XFADE_MS, t);
  }
  for (let i = 0; i < PARTIALS; i++) replacing[i] = false;
  applyCurve(masterGain.gain, 0, masterEffective(), MASTER_FADE_MS, t + 0.01);
}

export function smoothPauseAll() {
  ensureAudio();
  playing = false;
  const t = audioNow();
  applyCurve(masterGain.gain, masterGain.gain.value, 0, MASTER_FADE_MS, t);
  setTimeout(() => {
    const t2 = audioNow();
    for (let i = 0; i < PARTIALS; i++) {
      applyCurve(routeGains[i].gain, routeGains[i].gain.value, 0, RAMP_MS, t2);
    }
  }, MASTER_FADE_MS + 12);
}

// Sequence engine
function resetSequenceClock() {
  seqIndex = 0;
  seqNextTime = audioNow() + (1 / tempo);
}

export function stepSequenceIfDue() {
  const now = audioNow();
  if (now + 0.005 < seqNextTime) return;

  const prev = seqIndex;
  seqIndex++;

  if (seqIndex >= PARTIALS) {
    const t = audioNow();
    playing = false;
    applyCurve(masterGain.gain, masterGain.gain.value, 0, MASTER_FADE_MS, t);
    setTimeout(() => {
      const t2 = audioNow();
      for (let i = 0; i < PARTIALS; i++) {
        applyCurve(routeGains[i].gain, routeGains[i].gain.value, 0, RAMP_MS, t2);
      }
    }, MASTER_FADE_MS + 12);
    return;
  }

  const t = Math.max(now, seqNextTime);
  applyCurve(routeGains[prev].gain, routeGains[prev].gain.value, 0, SEQ_XFADE_MS, t);
  applyCurve(routeGains[seqIndex].gain, routeGains[seqIndex].gain.value, 1, SEQ_XFADE_MS, t);

  seqNextTime = t + (1 / tempo);
}
