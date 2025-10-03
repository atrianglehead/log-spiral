function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function getOffsetsFromQuadrant(canvas, quadrant) {
  const { width, height } = canvas;
  const halfW = width / 2;
  const halfH = height / 2;
  const isLeft = quadrant.includes('left');
  const isTop = quadrant.includes('top');
  const offsetX = isLeft ? 0 : halfW;
  const offsetY = isTop ? 0 : halfH;
  return { offsetX, offsetY, width: halfW, height: halfH };
}

export function getQuadrantMetrics(canvas, quadrant) {
  const offsets = getOffsetsFromQuadrant(canvas, quadrant);
  const { offsetX, offsetY, width, height } = offsets;
  const baseCenterX = offsetX + width / 2;
  const baseCenterY = offsetY + height / 2;
  return {
    ...offsets,
    center: { x: baseCenterX, y: baseCenterY },
    verticalShift: 0,
  };
}

function drawLine(ctx, pointA, pointB) {
  ctx.beginPath();
  ctx.moveTo(pointA.x, pointA.y);
  ctx.lineTo(pointB.x, pointB.y);
  ctx.stroke();
}

function drawPolygon(ctx, points) {
  if (!points.length) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCircle(ctx, canvas, point, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(6, canvas.width * 0.006), 0, Math.PI * 2);
  ctx.fill();
}

function drawEventMarker(ctx, canvas, point, strokeColor, fillColor, radius, options = {}) {
  const { highlight = false } = options;
  const markerRadius = highlight ? radius * 1.2 : radius;
  if (highlight) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, markerRadius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.325)';
    ctx.lineWidth = Math.max(1.5, markerRadius * 0.4);
    ctx.beginPath();
    ctx.arc(point.x, point.y, markerRadius * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1.5, markerRadius * 0.45);
  ctx.beginPath();
  ctx.arc(point.x, point.y, markerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (highlight) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, markerRadius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function getLinePoints(canvas, quadrant, margin = 0.18) {
  const { offsetX, width, center } = getQuadrantMetrics(canvas, quadrant);
  const paddingX = width * margin;
  const x1 = offsetX + paddingX;
  const x2 = offsetX + width - paddingX;
  return [
    { x: x1, y: center.y },
    { x: x2, y: center.y },
  ];
}

function getPolygonPoints(canvas, quadrant, sides, options = {}) {
  const { offsetX, offsetY, width, height, center } = getQuadrantMetrics(canvas, quadrant);
  const radius = Math.min(width, height) * 0.32;
  const points = [];
  const { rotationOffset = 0, alignToDiagonal = false } = options;
  let rotation = -Math.PI / 2;
  if (alignToDiagonal) {
    const isLeft = quadrant.includes('left');
    const isTop = quadrant.includes('top');
    const dirX = isLeft ? -1 : 1;
    const dirY = isTop ? -1 : 1;
    rotation = Math.atan2(dirY, dirX);
  }
  rotation += rotationOffset;
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return { center, points };
}

function getCircleGeometry(canvas, quadrant) {
  const { width, height, center } = getQuadrantMetrics(canvas, quadrant);
  const radius = Math.min(width, height) * 0.32;
  const top = { x: center.x, y: center.y - radius };
  return { center, radius, top };
}

export function getLineSoundPoints(start, end, config, soundMarkers) {
  if (soundMarkers?.mode === 'count') {
    const count = Math.max(1, Math.floor(soundMarkers.count));
    if (count === 1) {
      return [start];
    }
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      points.push(lerpPoint(start, end, t));
    }
    return points;
  }
  if (soundMarkers?.mode === 'first') {
    return [start];
  }
  const points = [start];
  if (config.bounce || (config.segmentCount && config.segmentCount > 1)) {
    points.push(end);
  }
  return points;
}

export function getPolygonSoundPoints(points, soundMarkers) {
  if (soundMarkers?.mode === 'first') {
    return [points[0]];
  }
  if (soundMarkers?.mode === 'count') {
    const count = Math.max(1, Math.min(points.length, Math.floor(soundMarkers.count)));
    return points.slice(0, count);
  }
  return points;
}

function renderEventMarkers(ctx, canvas, eventPoints, options) {
  const { strokeColor, color, firstEventColor, eventRadius, highlightFirstEvent } = options;
  eventPoints.forEach((pt, index) => {
    const isFirst = index === 0;
    const fillColor = highlightFirstEvent && isFirst ? firstEventColor : color;
    drawEventMarker(ctx, canvas, pt, strokeColor, fillColor, eventRadius, {
      highlight: !!highlightFirstEvent && isFirst,
    });
  });
}

function renderLineShape(ctx, canvas, config, elapsed, shared) {
  const [start, end] = getLinePoints(canvas, config.orientation);
  drawLine(ctx, start, end);

  const eventPoints = getLineSoundPoints(start, end, config, config.soundMarkers);
  renderEventMarkers(ctx, canvas, eventPoints, {
    ...shared,
    highlightFirstEvent: config.highlightFirstEvent,
  });

  let point;
  if (config.bounce) {
    const segmentDuration = config.segmentDuration;
    const segmentCount = 2;
    const cycleDuration = segmentDuration * segmentCount;
    const local = elapsed % cycleDuration;
    const index = Math.floor(local / segmentDuration);
    const t = (local - index * segmentDuration) / segmentDuration;
    if (index % 2 === 0) {
      point = lerpPoint(start, end, t);
    } else {
      point = lerpPoint(end, start, t);
    }
  } else if (config.segmentCount && config.segmentCount > 1 && config.segmentDuration > 0) {
    const segmentDuration = config.segmentDuration;
    const cycleDuration = segmentDuration * config.segmentCount;
    const local = elapsed % cycleDuration;
    const index = Math.floor(local / segmentDuration);
    const t = (local - index * segmentDuration) / segmentDuration;
    point = lerpPoint(start, end, t);
  } else {
    const local =
      config.segmentDuration > 0
        ? (elapsed % config.segmentDuration) / config.segmentDuration
        : 0;
    point = lerpPoint(start, end, local);
  }
  drawCircle(ctx, canvas, point, shared.color);
}

function renderPolygonShape(ctx, canvas, config, elapsed, shared) {
  const { points } = getPolygonPoints(canvas, config.orientation, config.sides);
  drawPolygon(ctx, points);

  const eventPoints = getPolygonSoundPoints(points, config.soundMarkers);
  renderEventMarkers(ctx, canvas, eventPoints, {
    ...shared,
    highlightFirstEvent: config.highlightFirstEvent,
  });

  const segmentDuration = config.segmentDuration;
  const cycleDuration = segmentDuration * config.segmentCount;
  const local = elapsed % cycleDuration;
  const index = Math.floor(local / segmentDuration);
  const t = (local - index * segmentDuration) / segmentDuration;
  const current = points[index % points.length];
  const next = points[(index + 1) % points.length];
  const point = lerpPoint(current, next, t);
  drawCircle(ctx, canvas, point, shared.color);
}

function renderCircleShape(ctx, canvas, config, elapsed, shared) {
  const { center, radius, top } = getCircleGeometry(canvas, config.orientation);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  renderEventMarkers(ctx, canvas, [top], {
    ...shared,
    highlightFirstEvent: config.highlightFirstEvent,
  });

  const segmentDuration = config.segmentDuration || 0;
  let progress = 0;
  if (segmentDuration > 0) {
    const local = elapsed % segmentDuration;
    progress = local / segmentDuration;
  } else if (config.cycleDuration && config.cycleDuration > 0) {
    const local = elapsed % config.cycleDuration;
    progress = local / config.cycleDuration;
  }

  const angle = -Math.PI / 2 + 2 * Math.PI * progress;
  const point = {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
  drawCircle(ctx, canvas, point, shared.color);
}

export function drawQuadrantShape(renderContext, palette, config, elapsed) {
  const { ctx, canvas } = renderContext;
  if (!ctx || !canvas || !config) {
    return;
  }

  const strokeColor = palette?.stroke ?? '#404040';
  const segmentColor = palette?.segment ?? '#f4f4f4';
  const firstEventColor = palette?.first ?? segmentColor;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;
  const shared = {
    strokeColor,
    color: segmentColor,
    firstEventColor,
    eventRadius: ctx.lineWidth * 2,
  };

  if (config.shape === 'line') {
    renderLineShape(ctx, canvas, config, elapsed, shared);
  } else if (config.shape === 'polygon') {
    renderPolygonShape(ctx, canvas, config, elapsed, shared);
  } else if (config.shape === 'circle') {
    renderCircleShape(ctx, canvas, config, elapsed, shared);
  }
}
