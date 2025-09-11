const TAU = Math.PI * 2;

export function drawCircle(ctx, circle, opts = {}) {
  const { selected = false, selectedLineIndex = null } = opts;

  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.r, 0, TAU);
  ctx.stroke();

  circle.lines.forEach((angle, i) => {
    const isSelected = i === selectedLineIndex;
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(circle.x, circle.y);
    ctx.lineTo(
      circle.x + circle.r * Math.sin(angle),
      circle.y - circle.r * Math.cos(angle)
    );
    ctx.stroke();
  });

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, 3, 0, TAU);
  ctx.fill();
}

export function drawPlayhead(ctx, circle, angle) {
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(circle.x, circle.y);
  ctx.lineTo(
    circle.x + circle.r * Math.sin(angle),
    circle.y - circle.r * Math.cos(angle)
  );
  ctx.stroke();
}
