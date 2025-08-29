import { ensureAudio as ensureCoreAudio, makeMaster, playBeep as corePlayBeep } from '../../lib/audioCore.js';

export const MAX_AUDIBLE_FREQ = 20000;

export const audioState = {
  audioCtx: null,
  masterGain: null,
  baseP: 110,      // Hz (80..160)
  volumePct: 60,   // %
  nextKToFire: 1,  // next integer multiple to sonify
};

export function ensureAudio() {
  const ctx = ensureCoreAudio();
  audioState.audioCtx = ctx;
  if (!audioState.masterGain) {
    audioState.masterGain = makeMaster(audioState.volumePct / 100);
  } else {
    audioState.masterGain.gain.value = audioState.volumePct / 100;
  }
}

export function playBeep(fHz, durationMs) {
  if (!audioState.masterGain) ensureAudio();
  corePlayBeep(fHz, durationMs, audioState.masterGain);
}

export function resetAudioProgress() {
  audioState.nextKToFire = 1;
}
