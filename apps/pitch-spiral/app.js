const canvas = document.getElementById('spiral');
const ctx = canvas.getContext('2d');
const controls = document.getElementById('pitchList');
const playBtn = document.getElementById('play');
const addBtn = document.getElementById('add');

let width, height, cx, cy, outerR, innerR;
const handleR = 8;

const pitches = [
  {id:0, angle:0, detune:0, fixed:true}
];
let nextId = 1;
let dragging = null;

function resize(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight * 0.75;
  width = canvas.width;
  height = canvas.height;
  cx = width/2;
  cy = height/2;
  outerR = Math.min(width, height)/2 - 20;
  innerR = outerR/2;
  draw();
}

function radiusFor(angle){
  return innerR * Math.pow(2, angle/(2*Math.PI));
}

function colorFor(angle){
  const hue = angle/(2*Math.PI)*360;
  return `hsl(${hue},100%,50%)`;
}

function draw(){
  ctx.clearRect(0,0,width,height);
  ctx.save();
  ctx.translate(cx,cy);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0,0,outerR,0,Math.PI*2);
  ctx.stroke();

  ctx.beginPath();
  for(let a=0;a<=Math.PI*2+0.01;a+=0.01){
    const r = radiusFor(a);
    const x = r*Math.cos(a);
    const y = r*Math.sin(a);
    if(a===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.strokeStyle = '#777';
  ctx.stroke();

  pitches.forEach(p=>{
    const r = radiusFor(p.angle);
    const x = r*Math.cos(p.angle);
    const y = r*Math.sin(p.angle);
    ctx.strokeStyle = colorFor(p.angle);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(x,y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(x,y,handleR,0,Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

function updateControls(){
  const sorted = [...pitches].sort((a,b)=>a.angle-b.angle);
  controls.innerHTML = '';
  sorted.forEach(p=>{
    const row = document.createElement('div');
    row.className = 'pitch-control';
    const slider = document.createElement('input');
    slider.type='range';
    slider.min=-100; slider.max=100; slider.value=p.detune;
    slider.addEventListener('input',e=>{p.detune=parseInt(e.target.value,10);});
    const rm = document.createElement('button');
    rm.textContent='-';
    rm.disabled = p.fixed;
    rm.addEventListener('click',()=>removePitch(p.id));
    row.appendChild(slider);
    row.appendChild(rm);
    controls.appendChild(row);
  });
}

function removePitch(id){
  const idx = pitches.findIndex(p=>p.id===id);
  if(idx>0){
    pitches.splice(idx,1);
    updateControls();
    draw();
  }
}

function addPitch(){
  const sorted = [...pitches].sort((a,b)=>a.angle-b.angle);
  let maxGap=-1, startAngle=0, endAngle=0;
  for(let i=0;i<sorted.length;i++){
    const a1 = sorted[i].angle;
    const a2 = (i===sorted.length-1? sorted[0].angle+Math.PI*2 : sorted[i+1].angle);
    const gap = a2 - a1;
    if(gap>maxGap){maxGap=gap;startAngle=a1;endAngle=a2;}
  }
  let newAngle = (startAngle+endAngle)/2;
  if(newAngle>=Math.PI*2) newAngle-=Math.PI*2;
  pitches.push({id:nextId++, angle:newAngle, detune:0});
  updateControls();
  draw();
}

function playAll(){
  const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  const duration = 1;
  pitches.forEach(p=>{
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const freq = 440 * Math.pow(2, p.angle/(2*Math.PI)) * Math.pow(2, p.detune/1200);
    osc.frequency.value = freq;
    osc.connect(gain).connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+duration);
    osc.start();
    osc.stop(audioCtx.currentTime+duration);
  });
}

canvas.addEventListener('mousedown',e=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left - cx;
  const my = e.clientY - rect.top - cy;
  for(const p of pitches){
    const r = radiusFor(p.angle);
    const x = r*Math.cos(p.angle);
    const y = r*Math.sin(p.angle);
    const dist = Math.hypot(mx - x, my - y);
    if(dist < handleR+3 && !p.fixed){
      dragging = p;
      break;
    }
  }
});

canvas.addEventListener('mousemove',e=>{
  if(!dragging) return;
  const rect = canvas.getBoundingClientRect();
  let ang = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
  if(ang<0) ang += Math.PI*2;
  ang = Math.min(Math.PI*2, Math.max(0, ang));
  dragging.angle = ang;
  draw();
});

function finalizeDrag(){
  if(!dragging) return;
  const p = dragging;
  dragging = null;
  for(const other of pitches){
    if(other===p) continue;
    if(Math.abs(other.angle - p.angle) < 0.01){
      p.angle = Math.max(0, other.angle - 0.01);
    }
  }
  updateControls();
  draw();
}

canvas.addEventListener('mouseup', finalizeDrag);
canvas.addEventListener('mouseleave', finalizeDrag);

addBtn.addEventListener('click', addPitch);
playBtn.addEventListener('click', playAll);

window.addEventListener('resize', resize);
resize();
updateControls();

