import { playBeep, ensureAudio } from '../../lib/audioCore.js';

const TAU = Math.PI * 2;

const canvas = document.getElementById('score');
canvas.style.touchAction = 'none';
document.addEventListener('contextmenu', e => e.preventDefault());
const ctx = canvas.getContext('2d');
const beatInput = document.getElementById('beatCount');

let width, height;
function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = width;
  canvas.height = height;
  draw();
}
window.addEventListener('resize', resize);
resize();

const circles = [];
let selectedCircle = null;
let selectedLine = null; // {circle,index}
let draggingLine = null;
let auditionTimer = null;
const radius = 40;

function createCircle(x, y) {
  const beats = parseInt(beatInput.value, 10);
  const lines = [];
  if (beats > 0) {
    const step = TAU / beats;
    for (let i = 0; i < beats; i++) lines.push(i * step);
  }
  const circle = { x, y, r: radius, lines };
  circles.push(circle);
  selectedCircle = circle;
  selectedLine = null;
  draw();
}

function addLine(circle) {
  if (circle.lines.length === 0) {
    circle.lines.push(0);
    return;
  }
  const angles = circle.lines.slice().sort((a, b) => a - b);
  let maxGap = -1;
  let insert = 0;
  for (let i = 0; i < angles.length; i++) {
    const a1 = angles[i];
    const a2 = angles[(i + 1) % angles.length];
    const gap = (a2 - a1 + TAU) % TAU;
    if (gap > maxGap) {
      maxGap = gap;
      insert = (a1 + gap / 2) % TAU;
    }
  }
  circle.lines.push(insert);
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  circles.forEach(c => {
    ctx.lineWidth = c === selectedCircle ? 4 : 2;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, TAU);
    ctx.stroke();
    c.lines.forEach((angle, idx) => {
      const sel = selectedLine && selectedLine.circle === c && selectedLine.index === idx;
      ctx.lineWidth = sel ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(
        c.x + c.r * Math.sin(angle),
        c.y - c.r * Math.cos(angle)
      );
      ctx.stroke();
    });
    // center dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, TAU);
    ctx.fill();
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (selectedLine) {
      const { circle, index } = selectedLine;
      circle.lines.splice(index, 1);
      selectedLine = null;
    } else if (selectedCircle) {
      const idx = circles.indexOf(selectedCircle);
      if (idx >= 0) circles.splice(idx, 1);
      selectedCircle = null;
    }
    draw();
  }
});

canvas.addEventListener('click', e => {
  if (e.detail !== 2) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  let hitCircle = null;
  for (const c of circles) {
    if (Math.hypot(c.x - x, c.y - y) <= c.r) {
      hitCircle = c;
      break;
    }
  }
  if (hitCircle) {
    addLine(hitCircle);
    selectedCircle = hitCircle;
    selectedLine = null;
    draw();
    return;
  }
  // check no overlap
  for (const c of circles) {
    if (Math.hypot(c.x - x, c.y - y) < c.r * 2 + 8) return;
  }
  createCircle(x, y);
});

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  for (const c of circles) {
    const dx = x - c.x;
    const dy = y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= c.r) {
      selectedCircle = c;
      selectedLine = null;
      // audition if near center
      if (dist < 10) {
        startAudition(c);
        return;
      }
      const ang = (Math.atan2(dx, -dy) + TAU) % TAU;
      for (let i = 0; i < c.lines.length; i++) {
        const diff = Math.abs(((c.lines[i] - ang + TAU + TAU / 2) % TAU) - TAU / 2);
        if (diff < 0.1) {
          selectedLine = { circle: c, index: i };
          draggingLine = selectedLine;
          break;
        }
      }
      draw();
      return;
    }
  }
  selectedCircle = null;
  selectedLine = null;
  draw();
});

canvas.addEventListener('mousemove', e => {
  if (!draggingLine) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const c = draggingLine.circle;
  const angle = (Math.atan2(x - c.x, -(y - c.y)) + TAU) % TAU;
  c.lines[draggingLine.index] = angle;
  draw();
});

window.addEventListener('mouseup', () => {
  draggingLine = null;
  stopAudition();
});

function startAudition(circle) {
  ensureAudio();
  const angles = circle.lines.slice().sort((a, b) => a - b);
  if (angles.length === 0) return;
  let idx = 0;
  function tick() {
    playBeep(880);
    const next = (idx + 1) % angles.length;
    const gap = (angles[next] - angles[idx] + TAU) % TAU;
    idx = next;
    auditionTimer = setTimeout(tick, gap / TAU * 1000);
  }
  tick();
}

function stopAudition() {
  if (auditionTimer) {
    clearTimeout(auditionTimer);
    auditionTimer = null;
  }
}
