// ES module: tiny Web Audio helpers
let ctx = null;
export function ensureAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  else if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const audioNow = () => (ctx ? ctx.currentTime : 0);

// 20 ms linear ramps by default
export function ramp(param, value, when = audioNow(), ms = 20) {
  param.cancelScheduledValues(when);
  param.linearRampToValueAtTime(value, when + ms / 1000);
}

export function makeMaster(initialGain = 0.6) {
  const c = ensureAudio();
  const g = c.createGain();
  g.gain.value = initialGain;
  g.connect(c.destination);
  return g;
}

export function playBeep(fHz, durationMs = 180, destination = ensureAudio().destination) {
  const c = ensureAudio();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(fHz, now);

  const attack = 0.006;
  const decay = Math.max(0, durationMs / 1000 - attack);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.9, now + attack);
  gain.gain.linearRampToValueAtTime(0.0, now + attack + decay);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(now);
  osc.stop(now + attack + decay + 0.02);
}

