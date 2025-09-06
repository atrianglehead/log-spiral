import { ensureAudio, makeMaster, audioNow } from '../../lib/audioCore.js';

export const PARTIALS = 16;     // k = 1..16
export const DEFAULT_F0 = 30;   // bpm
export const DEFAULT_MASTER = 0.6;
export const X_BASE = 120;      // px for k=1

// Headroom & normalization
export const PARTIAL_MAX = 0.85; // per-partial cap for UI=100%
export const MASTER_MAX  = 0.90; // master cap for UI=100%
const NORM_EPS = 1e-6;          // avoid div-by-zero

const RAMP_MS        = 60;
const MASTER_FADE_MS = 180;

export const DEFAULT_BEATS = 4;

// ---------- State ----------
let f0 = DEFAULT_F0;
export let gains = Array(PARTIALS).fill(0);
gains[0] = 1 * PARTIAL_MAX;
gains[1] = 0.5 * PARTIAL_MAX;
gains[2] = 0.25 * PARTIAL_MAX;
let masterUI = DEFAULT_MASTER;
let mode = 'mix'; // 'mix' | 'seq'
let playing = false;
let beatsPerTempo = DEFAULT_BEATS;
let seqIndex = 0;

const periods   = Array(PARTIALS).fill(0);
const nextTimes = Array(PARTIALS).fill(0);
const beatCounts = Array(PARTIALS).fill(0);
const auditioning = Array(PARTIALS).fill(false);
const auditionTimes = Array(PARTIALS).fill(0);

// Audio graph
let ctx = null;
let masterGain = null;
let comp = null; // safety compressor
let clickBuffer = null;

// ------------ Helpers ------------
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

function createClickBuffer() {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * 0.03, sr); // 30ms click
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    data[i] = Math.exp(-t * 40) * Math.sin(2 * Math.PI * 1000 * t);
  }
  return buf;
}

function scheduleClick(time, gain) {
  const src = ctx.createBufferSource();
  src.buffer = clickBuffer;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(masterGain);
  src.start(time);
  src.stop(time + 0.03);
}

function recomputePeriods() {
  for (let i = 0; i < PARTIALS; i++) {
    periods[i] = 60 / (f0 * (i + 1));
  }
}

// ---------- Audio construction ----------
export function buildAudio() {
  ctx = ensureAudio();

  masterGain = makeMaster(0.0);
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -1.0;
  comp.knee.value = 10;
  try { comp.ratio.value = 4; } catch(_) {}
  comp.attack.value = 0.02;
  comp.release.value = 0.25;

  masterGain.connect(comp);
  comp.connect(ctx.destination);

  clickBuffer = createClickBuffer();
  recomputePeriods();
}

export function setF0(newF0) {
  f0 = newF0;
  recomputePeriods();
}

export const getF0 = () => f0;

export function setMasterUI(v01) {
  masterUI = Math.min(MASTER_MAX, v01);
  updateMasterAutoScale(RAMP_MS);
}

export function setMode(m) {
  mode = m;
}
export const getMode = () => mode;

export function setBeatsPerTempo(n) {
  beatsPerTempo = n;
}

export const isPlaying = () => playing;

export function updatePartialGain(i, v01) {
  ensureAudio();
  gains[i] = uiToPartialGain(v01);
  updateMasterAutoScale(RAMP_MS);
}

export function startAudition(i) {
  ensureAudio();
  auditioning[i] = true;
  auditionTimes[i] = audioNow() + 0.05;
  updateMasterAutoScale(RAMP_MS);
}

export function stopAudition(i) {
  auditioning[i] = false;
  updateMasterAutoScale(RAMP_MS);
}

export function anyAuditioning() {
  for (let i = 0; i < PARTIALS; i++) if (auditioning[i]) return true;
  return false;
}

// ----- Smooth Play/Pause -----
export function smoothStartMix() {
  ensureAudio();
  playing = true;
  const t = audioNow();
  setNow(masterGain.gain, 0);
  const start = t + 0.1;
  for (let i = 0; i < PARTIALS; i++) {
    nextTimes[i] = start;
  }
  applyCurve(masterGain.gain, 0, masterEffective(), MASTER_FADE_MS, t + 0.01);
}

export function smoothStartSequence() {
  ensureAudio();
  playing = true;
  seqIndex = 0;
  beatCounts.fill(0);
  const t = audioNow();
  setNow(masterGain.gain, 0);
  const start = t + 0.1;
  for (let i = 0; i < PARTIALS; i++) {
    nextTimes[i] = start;
  }
  applyCurve(masterGain.gain, 0, masterEffective(), MASTER_FADE_MS, t + 0.01);
}

export function smoothPauseAll() {
  ensureAudio();
  playing = false;
  const t = audioNow();
  applyCurve(masterGain.gain, masterGain.gain.value, 0, MASTER_FADE_MS, t);
}

// Beat scheduler
export function scheduleBeats() {
  if (!ctx) return;
  const now = audioNow();
  const horizon = now + 0.1;

  // Playing modes
  if (playing) {
    if (mode === 'mix') {
      for (let i = 0; i < PARTIALS; i++) {
        while (nextTimes[i] <= horizon) {
          if (gains[i] > 0) scheduleClick(nextTimes[i], gains[i]);
          nextTimes[i] += periods[i];
        }
      }
    } else {
      while (seqIndex < PARTIALS) {
        while (nextTimes[seqIndex] <= horizon) {
          if (gains[seqIndex] > 0) scheduleClick(nextTimes[seqIndex], gains[seqIndex]);
          nextTimes[seqIndex] += periods[seqIndex];
          beatCounts[seqIndex]++;
          if (beatCounts[seqIndex] >= beatsPerTempo) {
            seqIndex++;
            if (seqIndex >= PARTIALS) {
              smoothPauseAll();
              return;
            }
            nextTimes[seqIndex] = nextTimes[seqIndex - 1];
            beatCounts[seqIndex] = 0;
          }
        }
        break;
      }
    }
  }

  // Auditioning
  for (let i = 0; i < PARTIALS; i++) {
    if (!auditioning[i]) continue;
    while (auditionTimes[i] <= horizon) {
      if (gains[i] > 0) scheduleClick(auditionTimes[i], gains[i]);
      auditionTimes[i] += periods[i];
    }
  }
}
