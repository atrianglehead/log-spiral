import { ensureAudio, ramp, makeMaster } from '../../lib/audioCore.js';

const TAU = Math.PI * 2;
const CENTS_TO_ANGLE = TAU / 1200;

const canvas = document.getElementById('spiral');
// allow custom gesture handling on touch devices
canvas.style.touchAction = 'none';
// suppress long-press context menu (prevents system click sounds)
document.addEventListener('contextmenu', e => e.preventDefault());
const ctx = canvas.getContext('2d');
const controls = document.getElementById('pitchList');
const playBtn = document.getElementById('play');
const addBtn = document.getElementById('add');
const f0Btn = document.getElementById('f0drone');
const volumeSlider = document.getElementById('volume');

let width, height, cx, cy, outerR, innerR;
const handleR = 8;
// short fade for crisp, plucked sound
const FADE_MS = 20;
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
let lastTouchTap = 0;
let lastTouchX = 0;
let lastTouchY = 0;
const playhead = {
  active: false,
  startAngle: 0,
  endAngle: 0,
  startTime: 0,
  endTime: 0
};

function normalizeAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

function setPlayheadSegment(startAngle, endAngle, durationMs) {
  playhead.active = true;
  playhead.startAngle = startAngle;
  playhead.endAngle = endAngle;
  const now = performance.now();
  playhead.startTime = now;
  playhead.endTime = now + durationMs;
}

function currentPlayheadAngle() {
  if (!playhead.active) return null;
  const now = performance.now();
  const { startAngle, endAngle, startTime, endTime } = playhead;
  if (endTime <= startTime) {
    return endAngle;
  }
  const t = Math.min(1, Math.max(0, (now - startTime) / (endTime - startTime)));
  return startAngle + (endAngle - startAngle) * t;
}

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

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    mx: e.clientX - rect.left - cx,
    my: e.clientY - rect.top - cy
  };
}

function hitTestPitch(mx, my) {
  for (const p of pitches) {
    const ang = angleFor(p);
    const r = radiusFor(ang);
    const x = r * Math.cos(ang);
    const y = r * Math.sin(ang);
    const dist = Math.hypot(mx - x, my - y);
    if (dist < handleR + 3) {
      return { pitch: p, type: 'handle' };
    }
    const t = (mx * x + my * y) / (r * r);
    if (t > 0 && t < 1) {
      const lx = x * t;
      const ly = y * t;
      const lineDist = Math.hypot(mx - lx, my - ly);
      if (lineDist < handleR) {
        return { pitch: p, type: 'line' };
      }
    }
  }
  return null;
}

function addPitchAtAngle(angle) {
  if (!Number.isFinite(angle)) return;
  if (angle < 0) angle += TAU;
  pitches.push({ id: nextId++, baseAngle: angle, detune: 0, muted: false, solo: false });
  updateControls();
  draw();
}

function handleDoubleAction(mx, my) {
  const hit = hitTestPitch(mx, my);
  if (hit && !hit.pitch.fixed) {
    removePitch(hit.pitch.id);
    return true;
  }
  if (!hit) {
    const ang = Math.atan2(my, mx);
    const dist = Math.hypot(mx, my);
    if (dist > handleR * 0.5) {
      addPitchAtAngle(ang);
      return true;
    }
  }
  return false;
}

function handleTouchDoubleTap(e, mx, my) {
  if (e.pointerType !== 'touch') return false;
  const now = performance.now();
  if (now - lastTouchTap < 300 && Math.hypot(mx - lastTouchX, my - lastTouchY) < handleR * 2) {
    lastTouchTap = 0;
    return handleDoubleAction(mx, my);
  }
  lastTouchTap = now;
  lastTouchX = mx;
  lastTouchY = my;
  return false;
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
    const color = colorFor(ang);
    const alpha = p.muted ? 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, handleR, 0, TAU);
    ctx.fill();
    ctx.restore();
  });

  if (playing && playhead.active) {
    const ang = currentPlayheadAngle();
    if (Number.isFinite(ang)) {
      const displayAng = normalizeAngle(ang);
      const tipR = outerR - 12;
      const baseR = outerR + 6;
      const tipX = tipR * Math.cos(displayAng);
      const tipY = tipR * Math.sin(displayAng);
      const baseX = baseR * Math.cos(displayAng);
      const baseY = baseR * Math.sin(displayAng);
      const perp = displayAng + Math.PI / 2;
      const halfWidth = 8;
      const offsetX = Math.cos(perp) * halfWidth;
      const offsetY = Math.sin(perp) * halfWidth;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX + offsetX, baseY + offsetY);
      ctx.lineTo(baseX - offsetX, baseY - offsetY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
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
        updatePitchControlColor(p);
        if (p._osc) updatePitchSound(p);
      };
      slider.addEventListener('input', handleInput);
      const start = () => { activePitch = p; startPitchSound(p); };
      const end = () => {
        if (activePitch === p) { stopPitchSound(p); activePitch = null; }
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
      rm.addEventListener('click', () => removePitch(p.id));
      row.appendChild(rm);
    }
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
  if (playing) return;
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

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const { mx, my } = getCanvasCoords(e);
  if (handleTouchDoubleTap(e, mx, my)) return;
  const hit = hitTestPitch(mx, my);
  if (hit) {
    const p = hit.pitch;
    activePitch = p;
    startPitchSound(p);
    if (!p.fixed && hit.type === 'handle') {
      dragging = p;
      p.baseAngle = angleFor(p);
      p.detune = 0;
      lastDragged = p;
      updateControls();
    }
    return;
  }
  // ensure we continue receiving events while dragging
  if (e.pointerId !== undefined) {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
});

canvas.addEventListener('dblclick', e => {
  e.preventDefault();
  const { mx, my } = getCanvasCoords(e);
  handleDoubleAction(mx, my);
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
  updatePitchSound(dragging);
  updatePitchControlColor(dragging);
});

function finalizeDrag(e) {
  if (e) e.preventDefault();
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
  if (e && e.pointerId !== undefined) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
}

canvas.addEventListener('pointerup', finalizeDrag);
canvas.addEventListener('pointerleave', finalizeDrag);
canvas.addEventListener('pointercancel', finalizeDrag);
canvas.addEventListener('lostpointercapture', finalizeDrag);

function stopPlayback() {
  currentOscs.forEach(({osc,gain}) => {
    const ctx = ensureAudio();
    ramp(gain.gain, 0, ctx.currentTime, FADE_MS);
    osc.stop(ctx.currentTime + FADE_MS / 1000);
  });
  currentOscs = [];
  playing = false;
  playBtn.textContent = '▶';
  playhead.active = false;
}

async function startSequential() {
  const ctx = ensureAudio();
  const dur = 500; // ms per note
  while (playing) {
    const sorted = [...pitches].sort((a,b)=>angleFor(a) - angleFor(b));
    const soloActive = pitches.some(p=>p.solo);
    const playable = sorted.filter(p => !p.muted && (!soloActive || p.solo));
    if (playable.length === 0) {
      playhead.active = false;
      await new Promise(r => setTimeout(r, dur));
      continue;
    }
    for (let i = 0; i < playable.length; i++) {
      if (!playing) break;
      const p = playable[i];
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
      const startAngle = normalizeAngle(angleFor(p));
      const nextPitch = playable[(i + 1) % playable.length];
      let endAngle = normalizeAngle(angleFor(nextPitch));
      if (i === playable.length - 1) {
        endAngle += TAU;
      } else if (endAngle <= startAngle) {
        endAngle += TAU;
      }
      setPlayheadSegment(startAngle, endAngle, dur);
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

function animationLoop() {
  draw();
  requestAnimationFrame(animationLoop);
}

animationLoop();

