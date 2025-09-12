import { ensureAudio, makeMaster, playBeep, audioNow } from '../../lib/audioCore.js';

const TAU = Math.PI * 2;
const CENTS_TO_ANGLE = TAU / 1200;

const canvas = document.getElementById('spiral');
// allow custom gesture handling on touch devices
canvas.style.touchAction = 'none';
// suppress long-press context menu (prevents system click sounds)
document.addEventListener('contextmenu', e => e.preventDefault());
const ctx = canvas.getContext('2d');
const controls = document.getElementById('tempoList');
const playBtn = document.getElementById('play');
const addBtn = document.getElementById('add');
const f0Btn = document.getElementById('f0metro');
const beatsSlider = document.getElementById('beats');
const volumeSlider = document.getElementById('volume');

let width, height, cx, cy, outerR, innerR;
const handleR = 8;

let tonicBpm = 30;
let beatsPerTempo = 4;
let playing = false;
let f0MetronomeOn = false;

const master = makeMaster(0.5);
volumeSlider.addEventListener('input', e => {
  master.gain.value = parseInt(e.target.value, 10) / 100;
});
beatsSlider.addEventListener('input', e => {
  beatsPerTempo = parseInt(e.target.value, 10);
});

const tempos = [
  { id: 0, baseAngle: 0, detune: 0, fixed: true, muted:false, solo:false }
];
let nextId = 1;
let dragging = null;
let activeTempo = null; // tempo being auditioned via click/drag
let lastDragged = null;
let f0Timer = null;

function angleFor(p) { return p.baseAngle + p.detune * CENTS_TO_ANGLE; }
function radiusFor(angle) { return innerR * Math.pow(2, angle / TAU); }
function colorFor(angle) {
  const hue = ((angle / TAU * 360) % 360 + 360) % 360;
  return `hsl(${hue},100%,50%)`;
}
function tempoFor(p) {
  const ang = ((angleFor(p) % TAU) + TAU) % TAU;
  return tonicBpm * Math.pow(2, ang / TAU);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight * 0.75;
  width = canvas.width;
  height = canvas.height;
  cx = width / 2;
  cy = height / 2;
  outerR = Math.min(width, height) / 2 - 20;
  innerR = outerR / 2;
  draw();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, TAU);
  ctx.stroke();

  ctx.beginPath();
  for (let a = 0; a <= TAU + 0.01; a += 0.01) {
    const r = radiusFor(a);
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#777';
  ctx.setLineDash([5,5]);
  ctx.stroke();
  ctx.setLineDash([]);

  const sorted = [...tempos].sort((a,b) => angleFor(a) - angleFor(b));
  if (lastDragged) {
    const idx = sorted.indexOf(lastDragged);
    if (idx !== -1) {
      sorted.splice(idx,1);
      sorted.push(lastDragged);
    }
  }

  sorted.forEach(p => {
    const ang = angleFor(p);
    const r = radiusFor(ang);
    const x = r * Math.cos(ang);
    const y = r * Math.sin(ang);
    ctx.strokeStyle = colorFor(ang);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(x, y, handleR, 0, TAU);
    ctx.fill();
  });
  ctx.restore();
}

function updateTempoControlColor(p) {
  const color = colorFor(angleFor(p));
  if (p._slider) p._slider.style.setProperty('accent-color', color);
  if (p._label) p._label.style.color = color;
}

function isTempoEnabled(p) {
  if (p.muted) return false;
  const soloActive = tempos.some(q => q.solo);
  if (soloActive && !p.solo) return false;
  return true;
}

function updateControls() {
  const sorted = [...tempos].sort((a,b) => angleFor(a) - angleFor(b));
  controls.innerHTML = '';
  sorted.forEach((p,i) => {
    const row = document.createElement('div');
    row.className = 'tempo-control';
    const mute = document.createElement('button');
    mute.textContent = 'M';
    mute.classList.toggle('active', p.muted);
    mute.addEventListener('click', () => {
      p.muted = !p.muted;
      if (p._timer) stopTempoSound(p);
      updateControls();
    });
    const solo = document.createElement('button');
    solo.textContent = 'S';
    solo.classList.toggle('active', p.solo);
    solo.addEventListener('click', () => {
      p.solo = !p.solo;
      if (p._timer) stopTempoSound(p);
      updateControls();
    });
    const label = document.createElement('span');
    label.innerHTML = `f<sub>${i}</sub>`;
    const slider = document.createElement('input');
    slider.type = 'range';
    p._label = label;
    p._slider = slider;
    updateTempoControlColor(p);
    if (p.fixed) {
      slider.min = 20;
      slider.max = 40;
      slider.value = tonicBpm;
      const handleInput = e => {
        tonicBpm = parseFloat(e.target.value);
        if (activeTempo === p && p._timer) {
          stopTempoSound(p); startTempoSound(p);
        }
        updateMetronome();
      };
      slider.addEventListener('input', handleInput);
      const start = () => { activeTempo = p; startTempoSound(p); };
      const end = () => { if (activeTempo === p) { stopTempoSound(p); activeTempo = null; } };
      slider.addEventListener('pointerdown', start);
      slider.addEventListener('pointerup', end);
      slider.addEventListener('pointerleave', end);
      slider.addEventListener('contextmenu', e => e.preventDefault());
    } else {
      slider.min = -25; slider.max = 25; slider.step = 0.5; slider.value = p.detune;
      let needsUpdate = false;
      const handleInput = e => {
        p.detune = parseFloat(e.target.value);
        // snap across tonic when fine tuning
        let ang = angleFor(p);
        if (ang < 0) {
          p.baseAngle += TAU;
          ang += TAU;
          needsUpdate = true;
        } else if (ang >= TAU) {
          p.baseAngle -= TAU;
          ang -= TAU;
          needsUpdate = true;
        }
        draw();
        updateTempoControlColor(p);
        if (p._timer) { stopTempoSound(p); startTempoSound(p); }
      };
      slider.addEventListener('input', handleInput);
      const start = () => { activeTempo = p; startTempoSound(p); };
      const end = () => {
        if (activeTempo === p) { stopTempoSound(p); activeTempo = null; }
        if (needsUpdate) { updateControls(); needsUpdate = false; }
      };
      slider.addEventListener('pointerdown', start);
      slider.addEventListener('pointerup', end);
      slider.addEventListener('pointerleave', end);
      slider.addEventListener('contextmenu', e => e.preventDefault());
    }
    row.appendChild(mute);
    row.appendChild(solo);
    row.appendChild(label);
    row.appendChild(slider);
    if (!p.fixed) {
      const rm = document.createElement('button');
      rm.textContent = '🗑';
      rm.addEventListener('click', () => removeTempo(p.id));
      row.appendChild(rm);
    }
    controls.appendChild(row);
  });
}

function removeTempo(id) {
  const idx = tempos.findIndex(p => p.id === id);
  if (idx > 0) {
    tempos.splice(idx,1);
    updateControls();
    draw();
  }
}

function addTempo() {
  const sorted = [...tempos].sort((a,b) => angleFor(a) - angleFor(b));
  let maxGap=-1, startAngle=0, endAngle=0;
  for (let i=0;i<sorted.length;i++) {
    const a1 = angleFor(sorted[i]);
    const a2 = (i === sorted.length-1 ? angleFor(sorted[0])+TAU : angleFor(sorted[i+1]));
    const gap = a2 - a1;
    if (gap > maxGap) { maxGap = gap; startAngle=a1; endAngle=a2; }
  }
  let newAngle = (startAngle + endAngle) / 2;
  if (newAngle >= TAU) newAngle -= TAU;
  tempos.push({ id: nextId++, baseAngle: newAngle, detune:0, muted:false, solo:false });
  updateControls();
  draw();
}

function nextF0BeatTime(at = audioNow()) {
  const period = 60 / tonicBpm;
  return Math.ceil(at / period) * period;
}

function startTempoSound(p) {
  if (!isTempoEnabled(p)) return;
  const bpm = tempoFor(p);
  const period = 60 / bpm;
  const start = nextF0BeatTime();
  const delay = Math.max(0, start - audioNow());
  const timer = {};
  timer.timeout = setTimeout(() => {
    playBeep(1000, 60, master);
    timer.interval = setInterval(() => playBeep(1000, 60, master), period * 1000);
  }, delay * 1000);
  p._timer = timer;
}

function stopTempoSound(p) {
  if (!p._timer) return;
  clearTimeout(p._timer.timeout);
  if (p._timer.interval) clearInterval(p._timer.interval);
  p._timer = null;
}

function updateMetronome() {
  if (f0MetronomeOn) {
    startF0Metronome();
  } else {
    stopF0Metronome();
  }
}

function startF0Metronome() {
  stopF0Metronome();
  const period = 60 / tonicBpm;
  const start = nextF0BeatTime();
  const delay = Math.max(0, start - audioNow());
  f0Timer = {};
  f0Timer.timeout = setTimeout(() => {
    playBeep(800, 60, master);
    f0Timer.interval = setInterval(() => playBeep(800, 60, master), period * 1000);
  }, delay * 1000);
}

function stopF0Metronome() {
  if (!f0Timer) return;
  clearTimeout(f0Timer.timeout);
  if (f0Timer.interval) clearInterval(f0Timer.interval);
  f0Timer = null;
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left - cx;
  const my = e.clientY - rect.top - cy;
  for (const p of tempos) {
    const ang = angleFor(p);
    const r = radiusFor(ang);
    const x = r * Math.cos(ang);
    const y = r * Math.sin(ang);
    const dist = Math.hypot(mx - x, my - y);
    if (dist < handleR + 3) {
      activeTempo = p;
      startTempoSound(p);
      if (!p.fixed) {
        dragging = p;
        p.baseAngle = ang;
        p.detune = 0;
        lastDragged = p;
        updateControls();
      }
      return;
    }
    const t = (mx*x + my*y) / (r*r);
    if (t > 0 && t < 1) {
      const lx = x * t;
      const ly = y * t;
      const lineDist = Math.hypot(mx - lx, my - ly);
      if (lineDist < handleR) {
        activeTempo = p;
        startTempoSound(p);
        return;
      }
    }
  }
  // ensure we continue receiving events while dragging
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});

canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  let ang = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
  if (ang < 0) ang += TAU;
  if (ang >= TAU) ang -= TAU;
  dragging.baseAngle = ang;
  draw();
  if (dragging._timer) { stopTempoSound(dragging); startTempoSound(dragging); }
  updateTempoControlColor(dragging);
});

function finalizeDrag(e) {
  if (e) e.preventDefault();
  if (dragging) {
    const p = dragging;
    dragging = null;
    const ang = angleFor(p);
    for (const other of tempos) {
      if (other === p) continue;
      if (Math.abs(angleFor(other) - ang) < 0.01) {
        p.baseAngle = Math.max(0, angleFor(other) - 0.01);
      }
    }
    updateControls();
    draw();
  }
  if (activeTempo) {
    stopTempoSound(activeTempo);
    activeTempo = null;
  }
  if (e && e.pointerId !== undefined) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
}

canvas.addEventListener('pointerup', finalizeDrag);
canvas.addEventListener('pointerleave', finalizeDrag);
canvas.addEventListener('pointercancel', finalizeDrag);
canvas.addEventListener('lostpointercapture', finalizeDrag);

function stopPlayback() {
  playing = false;
  playBtn.textContent = '▶';
}

async function playTempoSequence(p) {
  const bpm = tempoFor(p);
  const period = 60 / bpm;
  const start = nextF0BeatTime();
  await new Promise(r => setTimeout(r, Math.max(0, start - audioNow()) * 1000));
  for (let i = 0; i < beatsPerTempo && playing; i++) {
    playBeep(1000, 60, master);
    await new Promise(r => setTimeout(r, period * 1000));
  }
}

async function startSequential() {
  ensureAudio();
  while (playing) {
    const sorted = [...tempos].sort((a,b)=>angleFor(a) - angleFor(b));
    const soloActive = tempos.some(p=>p.solo);
    for (const p of sorted) {
      if (!playing) break;
      if (p.muted || (soloActive && !p.solo)) continue;
      await playTempoSequence(p);
      if (!playing) break;
    }
  }
  stopPlayback();
}

playBtn.addEventListener('click', () => {
  if (playing) {
    stopPlayback();
  } else {
    playing = true;
    playBtn.textContent = '■';
    startSequential();
  }
});

f0Btn.addEventListener('click', () => {
  f0MetronomeOn = !f0MetronomeOn;
  f0Btn.classList.toggle('active', f0MetronomeOn);
  f0Btn.innerHTML = `f<sub>0</sub> Metronome ${f0MetronomeOn ? '🔊' : '🔇'}`;
  updateMetronome();
});

addBtn.addEventListener('click', addTempo);

window.addEventListener('resize', resize);
resize();
updateControls();
draw();
updateMetronome();

