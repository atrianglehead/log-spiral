import { h, useEffect } from '../lib/mini-preact.js';

export function SpiralCanvas({ items, onAdd }) {
  const ref = { current: null };

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.arc(0,0,Math.min(canvas.width,canvas.height)/2-10,0,Math.PI*2);
    ctx.stroke();
    items.forEach(p => {
      const ang = p.angle * Math.PI/180;
      const r = Math.min(canvas.width,canvas.height)/2 - 10;
      const x = r*Math.cos(ang); const y = r*Math.sin(ang);
      ctx.strokeStyle = '#0ff';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(x,y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fillStyle='#0ff'; ctx.fill();
    });
    ctx.restore();
  }, [items]);

  function handleClick(e) {
    if (!onAdd) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width/2;
    const y = e.clientY - rect.top - rect.height/2;
    const ang = Math.atan2(y,x) * 180/Math.PI;
    onAdd(Math.round(ang));
  }

  return h('canvas', { width:300, height:300, style:{background:'black'}, ref, onClick:handleClick });
}
