export const audioState = {
  audioCtx: null,
  masterGain: null,
  baseP: 110,      // Hz (80..160)
  volumePct: 60,   // %
  nextKToFire: 1,  // next integer multiple to sonify
};

export function ensureAudio() {
  const a = audioState;
  if (!a.audioCtx) {
    a.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    a.masterGain = a.audioCtx.createGain();
    a.masterGain.gain.value = a.volumePct / 100;
    a.masterGain.connect(a.audioCtx.destination);
  } else if (a.audioCtx.state === 'suspended') {
    a.audioCtx.resume();
  }
}

export function playBeep(fHz, tNow = null) {
  const { audioCtx, masterGain } = audioState;
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

export function resetAudioProgress() {
  audioState.nextKToFire = 1;
}
