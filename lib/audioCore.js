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

