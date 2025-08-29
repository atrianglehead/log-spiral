import { ensureAudio, ramp } from '../../lib/audioCore.js';

const TAU = Math.PI * 2;
const CENTS_TO_ANGLE = TAU / 1200;

const canvas = document.getElementById('spiral');
const ctx = canvas.getContext('2d');
const controls = document.getElementById('pitchList');
const playBtn = document.getElementById('play');
const addBtn = document.getElementById('add');
const modeToggle = document.getElementById('modeToggle');

let width, height, cx, cy, outerR, innerR;
const handleR = 8;

let tonicHz = 110;
let playMode = 'seq'; // 'mix' | 'seq'
let playing = false;

const pitches = [
  { id: 0, baseAngle: 0, detune: 0, fixed: true }
];
let nextId = 1;
let dragging = null;
let activePitch = null; // pitch being auditioned via click/drag
let currentOscs = [];   // oscillators for play button

function angleFor(p) { return p.baseAngle + p.detune * CENTS_TO_ANGLE; }
function radiusFor(angle) { return innerR * Math.pow(2, angle / TAU); }
function colorFor(angle) {
  const hue = angle / TAU * 360;
  return `hsl(${hue},100%,50%)`;
}
function frequencyFor(p) { return tonicHz * Math.pow(2, angleFor(p) / TAU); }

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

  pitches.forEach(p => {
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

function updateControls() {
  const sorted = [...pitches].sort((a,b) => angleFor(a) - angleFor(b));
  controls.innerHTML = '';
  sorted.forEach((p,i) => {
    const row = document.createElement('div');
    row.className = 'pitch-control';
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
      slider.addEventListener('input', e => {
        tonicHz = parseFloat(e.target.value);
      });
    } else {
      slider.min = -50; slider.max = 50; slider.value = p.detune;
      slider.addEventListener('input', e => {
        p.detune = parseInt(e.target.value,10);
        if (activePitch === p) updatePitchSound(p);
        draw();
        updatePitchControlColor(p);
      });
    }
    const rm = document.createElement('button');
    rm.textContent = '-';
    rm.disabled = p.fixed;
    rm.addEventListener('click', () => removePitch(p.id));
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
  pitches.push({ id: nextId++, baseAngle: newAngle, detune:0 });
  updateControls();
  draw();
}

function startPitchSound(p) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequencyFor(p), ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  ramp(gain.gain, 0.3, ctx.currentTime, 80);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  p._osc = osc; p._gain = gain;
}
function updatePitchSound(p) {
  if (p._osc) p._osc.frequency.setValueAtTime(frequencyFor(p), ensureAudio().currentTime);
}
function stopPitchSound(p) {
  if (!p._osc) return;
  const ctx = ensureAudio();
  ramp(p._gain.gain, 0, ctx.currentTime, 80);
  p._osc.stop(ctx.currentTime + 0.08);
  p._osc = null; p._gain = null;
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
  ang = Math.min(TAU, Math.max(0, ang));
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
    ramp(gain.gain, 0, ctx.currentTime, 80);
    osc.stop(ctx.currentTime + 0.08);
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
    for (const p of sorted) {
      if (!playing) break;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(frequencyFor(p), ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      ramp(gain.gain,0.3,ctx.currentTime,80);
      ramp(gain.gain,0,ctx.currentTime + dur/1000 - 0.08,80);
      osc.stop(ctx.currentTime + dur/1000);
      currentOscs=[{osc,gain}];
      await new Promise(r=>setTimeout(r,dur));
      currentOscs=[];
      if (!playing) break;
    }
  }
  stopPlayback();
}

function startTogether() {
  const ctx = ensureAudio();
  const sorted = [...pitches].sort((a,b)=>angleFor(a) - angleFor(b));
  const dur = 1000;
  sorted.forEach(p=>{
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(frequencyFor(p), ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    ramp(gain.gain,0.3,ctx.currentTime,80);
    ramp(gain.gain,0,ctx.currentTime + dur/1000 - 0.08,80);
    osc.stop(ctx.currentTime + dur/1000);
    currentOscs.push({osc,gain});
  });
  setTimeout(()=>{ if(playing) stopPlayback(); }, dur);
}

playBtn.addEventListener('click', () => {
  if (playing) {
    stopPlayback();
  } else {
    playing = true;
    playBtn.textContent = '■';
    if (playMode === 'seq') startSequential(); else startTogether();
  }
});

modeToggle.addEventListener('click', () => {
  playMode = playMode === 'mix' ? 'seq' : 'mix';
  modeToggle.classList.toggle('mix', playMode === 'mix');
});

addBtn.addEventListener('click', addPitch);

window.addEventListener('resize', resize);
resize();
updateControls();
draw();
modeToggle.classList.toggle('mix', playMode === 'mix');
