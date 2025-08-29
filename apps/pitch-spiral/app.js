import { ensureAudio, ramp, makeMaster } from '../../lib/audioCore.js';

const TAU = Math.PI * 2;
const CENTS_TO_ANGLE = TAU / 1200;

const canvas = document.getElementById('spiral');
const ctx = canvas.getContext('2d');
const controls = document.getElementById('pitchList');
const playBtn = document.getElementById('play');
const addBtn = document.getElementById('add');
const f0Btn = document.getElementById('f0drone');
const volumeSlider = document.getElementById('volume');

let width, height, cx, cy, outerR, innerR;
const handleR = 8;
// longer fade times for smoother starts/stops
const FADE_MS = 300;
const NOTE_GAIN = 0.3;
const NOTE_GAIN_F0 = 0.2;

let tonicHz = 110;
let playing = false;
let f0DroneOn = false;

const master = makeMaster(0.5);
volumeSlider.addEventListener('input', e => {
  master.gain.value = parseInt(e.target.value, 10) / 100;
});

const pitches = [
  { id: 0, baseAngle: 0, detune: 0, fixed: true, muted:false, solo:false }
];
let nextId = 1;
let dragging = null;
let activePitch = null; // pitch being auditioned via click/drag
let currentOscs = [];   // oscillators for play button
let tonicOsc = null, tonicGain = null; // oscillator for tonic slider
let f0Osc = null, f0Gain = null; // oscillator for f0 drone
let lastDragged = null;

function angleFor(p) { return p.baseAngle + p.detune * CENTS_TO_ANGLE; }
function radiusFor(angle) { return innerR * Math.pow(2, angle / TAU); }
function colorFor(angle) {
  const hue = ((angle / TAU * 360) % 360 + 360) % 360;
  return `hsl(${hue},100%,50%)`;
}
function frequencyFor(p) {
  const ang = ((angleFor(p) % TAU) + TAU) % TAU;
  return tonicHz * Math.pow(2, ang / TAU);
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

  const sorted = [...pitches].sort((a,b) => angleFor(a) - angleFor(b));
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

function updatePitchControlColor(p) {
  const color = colorFor(angleFor(p));
  if (p._slider) p._slider.style.setProperty('accent-color', color);
  if (p._label) p._label.style.color = color;
}

function isPitchEnabled(p) {
  if (p.muted) return false;
  const soloActive = pitches.some(q => q.solo);
  if (soloActive && !p.solo) return false;
  return true;
}

function updateControls() {
  const sorted = [...pitches].sort((a,b) => angleFor(a) - angleFor(b));
  controls.innerHTML = '';
  sorted.forEach((p,i) => {
    const row = document.createElement('div');
    row.className = 'pitch-control';
    const mute = document.createElement('button');
    mute.textContent = 'M';
    mute.classList.toggle('active', p.muted);
    mute.addEventListener('click', () => {
      p.muted = !p.muted;
      if (p._osc) stopPitchSound(p);
      updateControls();
    });
    const solo = document.createElement('button');
    solo.textContent = 'S';
    solo.classList.toggle('active', p.solo);
    solo.addEventListener('click', () => {
      p.solo = !p.solo;
      if (p._osc) stopPitchSound(p);
      updateControls();
    });
    const label = document.createElement('span');
    label.innerHTML = `f<sub>${i}</sub>`;
    const slider = document.createElement('input');
    slider.type = 'range';
    p._label = label;
    p._slider = slider;
    updatePitchControlColor(p);
    if (p.fixed) {
      slider.min = 80;
      slider.max = 160;
      slider.value = tonicHz;
      const handleInput = e => {
        tonicHz = parseFloat(e.target.value);
        updateTonicSound();
      };
      slider.addEventListener('input', handleInput);
      const start = () => startTonicSound();
      const end = () => stopTonicSound();
      slider.addEventListener('pointerdown', start);
      slider.addEventListener('pointerup', end);
      slider.addEventListener('pointerleave', end);
    } else {
      slider.min = -50; slider.max = 50; slider.value = p.detune;
      let needsUpdate = false;
      const handleInput = e => {
        p.detune = parseInt(e.target.value,10);
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
        updatePitchControlColor(p);
        if (p._osc) updatePitchSound(p);
      };
      slider.addEventListener('input', handleInput);
      const start = () => { activePitch = p; startPitchSound(p); };
      const end = () => {
        if (activePitch===p) { stopPitchSound(p); activePitch=null; }
        if (needsUpdate) { updateControls(); needsUpdate = false; }
      };
      slider.addEventListener('pointerdown', start);
      slider.addEventListener('pointerup', end);
      slider.addEventListener('pointerleave', end);
    }
    const rm = document.createElement('button');
    rm.textContent = '🗑';
    rm.disabled = p.fixed;
    rm.addEventListener('click', () => removePitch(p.id));
    row.appendChild(mute);
    row.appendChild(solo);
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(rm);
    controls.appendChild(row);
  });
}

function removePitch(id) {
  const idx = pitches.findIndex(p => p.id === id);
  if (idx > 0) {
    pitches.splice(idx,1);
    updateControls();
    draw();
  }
}

function addPitch() {
  const sorted = [...pitches].sort((a,b) => angleFor(a) - angleFor(b));
  let maxGap=-1, startAngle=0, endAngle=0;
  for (let i=0;i<sorted.length;i++) {
    const a1 = angleFor(sorted[i]);
    const a2 = (i === sorted.length-1 ? angleFor(sorted[0])+TAU : angleFor(sorted[i+1]));
    const gap = a2 - a1;
    if (gap > maxGap) { maxGap = gap; startAngle=a1; endAngle=a2; }
  }
  let newAngle = (startAngle + endAngle) / 2;
  if (newAngle >= TAU) newAngle -= TAU;
  pitches.push({ id: nextId++, baseAngle: newAngle, detune:0, muted:false, solo:false });
  updateControls();
  draw();
}

function startTonicSound() {
  if (!isPitchEnabled(pitches[0])) return;
  const ctx = ensureAudio();
  tonicOsc = ctx.createOscillator();
  tonicGain = ctx.createGain();
  tonicOsc.type = 'triangle';
  tonicOsc.frequency.setValueAtTime(tonicHz, ctx.currentTime);
  tonicGain.gain.setValueAtTime(0, ctx.currentTime);
  ramp(tonicGain.gain, NOTE_GAIN_F0, ctx.currentTime, FADE_MS);
  tonicOsc.connect(tonicGain).connect(master);
  tonicOsc.start();
}

function updateTonicSound() {
  const ctx = ensureAudio();
  if (tonicOsc) {
    tonicOsc.frequency.setValueAtTime(tonicHz, ctx.currentTime);
  }
  if (f0Osc) {
    f0Osc.frequency.setValueAtTime(tonicHz, ctx.currentTime);
  }
}

function stopTonicSound() {
  if (!tonicOsc) return;
  const ctx = ensureAudio();
  ramp(tonicGain.gain, 0, ctx.currentTime, FADE_MS);
  tonicOsc.stop(ctx.currentTime + FADE_MS / 1000);
  tonicOsc = null;
  tonicGain = null;
}

function startPitchSound(p) {
  if (!isPitchEnabled(p)) return;
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequencyFor(p), ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  ramp(gain.gain, NOTE_GAIN, ctx.currentTime, FADE_MS);
  osc.connect(gain).connect(master);
  osc.start();
  p._osc = osc; p._gain = gain;
}
function updatePitchSound(p) {
  if (p._osc) p._osc.frequency.setValueAtTime(frequencyFor(p), ensureAudio().currentTime);
}
function stopPitchSound(p) {
  if (!p._osc) return;
  const ctx = ensureAudio();
  ramp(p._gain.gain, 0, ctx.currentTime, FADE_MS);
  p._osc.stop(ctx.currentTime + FADE_MS / 1000);
  p._osc = null; p._gain = null;
}

function updateDrone() {
  if (f0DroneOn) {
    const ctx = ensureAudio();
    if (!f0Osc) {
      f0Osc = ctx.createOscillator();
      f0Gain = ctx.createGain();
      f0Osc.type = 'triangle';
      f0Osc.frequency.setValueAtTime(tonicHz, ctx.currentTime);
      f0Gain.gain.setValueAtTime(0, ctx.currentTime);
      f0Osc.connect(f0Gain).connect(master);
      f0Osc.start();
    }
    ramp(f0Gain.gain, NOTE_GAIN_F0, ctx.currentTime, FADE_MS);
  } else if (f0Osc) {
    const ctx = ensureAudio();
    ramp(f0Gain.gain, 0, ctx.currentTime, FADE_MS);
    f0Osc.stop(ctx.currentTime + FADE_MS / 1000);
    f0Osc = null;
    f0Gain = null;
  }
}

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left - cx;
  const my = e.clientY - rect.top - cy;
  for (const p of pitches) {
    const ang = angleFor(p);
    const r = radiusFor(ang);
    const x = r * Math.cos(ang);
    const y = r * Math.sin(ang);
    const dist = Math.hypot(mx - x, my - y);
    if (dist < handleR + 3) {
      activePitch = p;
      startPitchSound(p);
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
        activePitch = p;
        startPitchSound(p);
        return;
      }
    }
  }
});

canvas.addEventListener('mousemove', e => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  let ang = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
  if (ang < 0) ang += TAU;
  if (ang >= TAU) ang -= TAU;
  dragging.baseAngle = ang;
  draw();
  updatePitchSound(dragging);
  updatePitchControlColor(dragging);
});

function finalizeDrag() {
  if (dragging) {
    const p = dragging;
    dragging = null;
    const ang = angleFor(p);
    for (const other of pitches) {
      if (other === p) continue;
      if (Math.abs(angleFor(other) - ang) < 0.01) {
        p.baseAngle = Math.max(0, angleFor(other) - 0.01);
      }
    }
    updateControls();
    draw();
  }
  if (activePitch) {
    stopPitchSound(activePitch);
    activePitch = null;
  }
}

canvas.addEventListener('mouseup', finalizeDrag);
canvas.addEventListener('mouseleave', finalizeDrag);

function stopPlayback() {
  currentOscs.forEach(({osc,gain}) => {
    const ctx = ensureAudio();
    ramp(gain.gain, 0, ctx.currentTime, FADE_MS);
    osc.stop(ctx.currentTime + FADE_MS / 1000);
  });
  currentOscs = [];
  playing = false;
  playBtn.textContent = '▶';
}

async function startSequential() {
  const ctx = ensureAudio();
  const dur = 500; // ms per note
  while (playing) {
    const sorted = [...pitches].sort((a,b)=>angleFor(a) - angleFor(b));
    const soloActive = pitches.some(p=>p.solo);
    for (const p of sorted) {
      if (!playing) break;
      if (p.muted || (soloActive && !p.solo)) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequencyFor(p), ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain).connect(master);
      osc.start();
      ramp(gain.gain, NOTE_GAIN, ctx.currentTime, FADE_MS);
      ramp(gain.gain, 0, ctx.currentTime + dur/1000 - FADE_MS/1000, FADE_MS);
      osc.stop(ctx.currentTime + dur/1000);
      const obj = {osc, gain};
      currentOscs.push(obj);
      await new Promise(r => setTimeout(r, dur));
      currentOscs = currentOscs.filter(o => o !== obj);
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
  f0DroneOn = !f0DroneOn;
  f0Btn.classList.toggle('active', f0DroneOn);
  f0Btn.innerHTML = `f<sub>0</sub> Drone ${f0DroneOn ? '🔊' : '🔇'}`;
  updateDrone();
});

addBtn.addEventListener('click', addPitch);

window.addEventListener('resize', resize);
resize();
updateControls();
draw();
updateDrone();

