import {
  createAxisRotationContext,
  rotatePointAroundAxisOnPlane,
} from './jati3dGeometry.js';

const canvas = document.getElementById('layakine-canvas');
const ctx = canvas.getContext('2d');
const playToggle = document.getElementById('play-toggle');
const sliders = {
  laya: document.getElementById('laya'),
  gati: document.getElementById('gati'),
  jati: document.getElementById('jati'),
  nadai: document.getElementById('nadai'),
};
const valueLabels = {
  laya: document.querySelector('[data-for="laya"]'),
  gati: document.querySelector('[data-for="gati"]'),
  jati: document.querySelector('[data-for="jati"]'),
  nadai: document.querySelector('[data-for="nadai"]'),
};
const muteButtons = Array.from(document.querySelectorAll('.mute'));
const modeButtons = Array.from(document.querySelectorAll('.mode-tab'));

const quadrantModes = {
  laya: '1d',
  gati: '2d',
  jati: '3d',
  nadai: '2d',
};

function setQuadrantMode(quadrant, mode) {
  if (!(quadrant in quadrantModes)) {
    return;
  }
  quadrantModes[quadrant] = mode;
  modeButtons.forEach((button) => {
    if (button.dataset.quadrant === quadrant) {
      button.classList.toggle('active', button.dataset.mode === mode);
    }
  });
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const { quadrant, mode } = button.dataset;
    if (quadrant && mode) {
      setQuadrantMode(quadrant, mode);
    }
  });
});

Object.keys(quadrantModes).forEach((name) => {
  setQuadrantMode(name, quadrantModes[name]);
});

let audioCtx = null;
let masterGain = null;
let isPlaying = false;
let startTime = 0;
let pausedElapsed = 0;

const nadaiValues = (() => {
  const values = [];
  for (let d = 13; d >= 2; d -= 1) {
    values.push(1 / d);
  }
  values.push(1);
  for (let n = 2; n <= 13; n += 1) {
    values.push(n);
  }
  return values;
})();

const nadaiLabels = (() => {
  const labels = [];
  for (let d = 13; d >= 2; d -= 1) {
    labels.push(`1/${d}`);
  }
  labels.push('1');
  for (let n = 2; n <= 13; n += 1) {
    labels.push(String(n));
  }
  return labels;
})();

const muteState = {
  laya: false,
  gati: false,
  jati: false,
  nadai: false,
};

const voices = {
  laya: {
    wave: 'sine',
    frequency: 220,
    nextIndex: 0,
    segmentDuration: 1,
    cycleSegments: 1,
    playEverySegment: true,
  },
  gati: {
    wave: 'triangle',
    frequency: 320,
    nextIndex: 0,
    segmentDuration: 1,
    cycleSegments: 1,
    playEverySegment: true,
  },
  jati: {
    wave: 'square',
    frequency: 420,
    nextIndex: 0,
    segmentDuration: 1,
    cycleSegments: 1,
    playEverySegment: false,
  },
  nadai: {
    wave: 'sawtooth',
    frequency: 540,
    nextIndex: 0,
    segmentDuration: 1,
    cycleSegments: 1,
    playEverySegment: false,
  },
};

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getElapsed() {
  if (!isPlaying) {
    return pausedElapsed;
  }
  const ctx = ensureAudio();
  return ctx.currentTime - startTime;
}

function formatLayaValue(value) {
  return `${value} bpm`;
}

function updateValueLabels() {
  valueLabels.laya.textContent = formatLayaValue(sliders.laya.value);
  valueLabels.gati.textContent = sliders.gati.value;
  valueLabels.jati.textContent = sliders.jati.value;
  const nadaiIndex = Number(sliders.nadai.value);
  const display = nadaiLabels[nadaiIndex];
  valueLabels.nadai.textContent = display;
}

function playClick(kind, time) {
  if (!audioCtx) {
    return;
  }
  if (muteState[kind]) {
    return;
  }
  const voice = voices[kind];
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = voice.wave;
  osc.frequency.setValueAtTime(voice.frequency, time);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.3, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  osc.connect(gain).connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.2);
}

function recalcVoice(name, segmentDuration, options = {}) {
  const { cycleSegments = 1, playEverySegment = true } = options;
  const voice = voices[name];
  voice.segmentDuration = segmentDuration;
  voice.cycleSegments = Math.max(1, cycleSegments);
  voice.playEverySegment = playEverySegment;
  if (!audioCtx) {
    voice.nextIndex = 0;
    voice.nextTime = 0;
    return;
  }
  const now = audioCtx.currentTime;
  const elapsed = getElapsed();
  if (segmentDuration <= 0) {
    voice.nextIndex = 0;
    voice.nextTime = now + 1;
    return;
  }
  const baseStart = startTime;
  let nextIndex = Math.floor(elapsed / segmentDuration);
  let nextTime = baseStart + nextIndex * segmentDuration;
  if (elapsed === 0) {
    nextIndex = 0;
    nextTime = baseStart;
  }
  while (nextTime < now) {
    nextIndex += 1;
    nextTime = baseStart + nextIndex * segmentDuration;
  }
  voice.nextIndex = nextIndex;
  voice.nextTime = nextTime;
}

function resetSchedulers() {
  const layaPeriod = 60 / Number(sliders.laya.value);
  const gatiCount = Number(sliders.gati.value);
  const jatiCount = Number(sliders.jati.value);
  const nadaiValue = nadaiValues[Number(sliders.nadai.value)];

  recalcVoice('laya', layaPeriod, { cycleSegments: 1, playEverySegment: true });

  const gatiSegmentCount = gatiCount === 1 ? 1 : gatiCount;
  const gatiSegmentDuration = layaPeriod / gatiSegmentCount;
  recalcVoice('gati', gatiSegmentDuration, {
    cycleSegments: gatiSegmentCount,
    playEverySegment: true,
  });

  const gatiSideDuration = layaPeriod / Math.max(1, gatiCount);
  const jatiSegments = jatiCount === 1 ? 1 : jatiCount;
  recalcVoice('jati', gatiSideDuration, {
    cycleSegments: jatiSegments,
    playEverySegment: jatiSegments <= 1,
  });

  const nadaiSegmentDuration = gatiSideDuration * (1 / nadaiValue);
  const nadaiSubdivisions = jatiSegments;
  recalcVoice('nadai', nadaiSegmentDuration, {
    cycleSegments: nadaiSubdivisions,
    playEverySegment: nadaiSubdivisions <= 1,
  });
}

function scheduleAudio() {
  if (!isPlaying || !audioCtx) {
    return;
  }
  const lookAhead = 0.2;
  const now = audioCtx.currentTime;
  Object.keys(voices).forEach((name) => {
    const voice = voices[name];
    if (typeof voice.nextTime !== 'number') {
      voice.nextTime = startTime;
    }
    while (voice.segmentDuration > 0 && voice.nextTime <= now + lookAhead) {
      const cycleSegments = voice.cycleSegments || 1;
      if (
        voice.playEverySegment ||
        cycleSegments <= 1 ||
        voice.nextIndex % cycleSegments === 0
      ) {
        playClick(name, voice.nextTime);
      }
      voice.nextIndex += 1;
      voice.nextTime = startTime + voice.nextIndex * voice.segmentDuration;
    }
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawLine(pointA, pointB) {
  ctx.beginPath();
  ctx.moveTo(pointA.x, pointA.y);
  ctx.lineTo(pointB.x, pointB.y);
  ctx.stroke();
}

function drawPolygon(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}

function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function getOffsetsFromQuadrant(quadrant) {
  const { width, height } = canvas;
  const halfW = width / 2;
  const halfH = height / 2;
  const isLeft = quadrant.includes('left');
  const isTop = quadrant.includes('top');
  const offsetX = isLeft ? 0 : halfW;
  const offsetY = isTop ? 0 : halfH;
  return { offsetX, offsetY, width: halfW, height: halfH };
}

function getLinePoints(quadrant, margin = 0.18) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  const paddingX = width * margin;
  const y = offsetY + height / 2;
  const x1 = offsetX + paddingX;
  const x2 = offsetX + width - paddingX;
  return [{ x: x1, y }, { x: x2, y }];
}

function getPolygonPoints(quadrant, sides, options = {}) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  const radius = Math.min(width, height) * 0.32;
  const center = { x: offsetX + width / 2, y: offsetY + height / 2 };
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

function getCircleGeometry(quadrant) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  const radius = Math.min(width, height) * 0.32;
  const center = { x: offsetX + width / 2, y: offsetY + height / 2 };
  const top = { x: center.x, y: center.y - radius };
  return { center, radius, top };
}

function drawCircle(point, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(6, canvas.width * 0.006), 0, Math.PI * 2);
  ctx.fill();
}

function drawEventMarker(point, strokeColor, fillColor, radius) {
  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1, radius * 0.5);
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function getLineSoundPoints(start, end, config, soundMarkers) {
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

function getPolygonSoundPoints(points, soundMarkers) {
  if (soundMarkers?.mode === 'first') {
    return [points[0]];
  }
  if (soundMarkers?.mode === 'count') {
    const count = Math.max(1, Math.min(points.length, Math.floor(soundMarkers.count)));
    return points.slice(0, count);
  }
  return points;
}

function getSegmentColor(name) {
  switch (name) {
    case 'laya':
      return '#f4a261';
    case 'gati':
      return '#2a9d8f';
    case 'jati':
      return '#e76f51';
    case 'nadai':
      return '#9c6ade';
    default:
      return '#f4f4f4';
  }
}

function getStrokeColor(name) {
  switch (name) {
    case 'laya':
      return '#3a3a3a';
    case 'gati':
      return '#264653';
    case 'jati':
      return '#5d2a2c';
    case 'nadai':
      return '#3c2f57';
    default:
      return '#404040';
  }
}

function drawQuadrantShape(name, config, elapsed) {
  ctx.strokeStyle = getStrokeColor(name);
  ctx.lineWidth = 3;
  const strokeColor = ctx.strokeStyle;
  const color = getSegmentColor(name);
  const eventRadius = ctx.lineWidth * 2;
  if (config.shape === 'line') {
    const [start, end] = getLinePoints(config.orientation);
    drawLine(start, end);

    const eventPoints = getLineSoundPoints(start, end, config, config.soundMarkers);
    eventPoints.forEach((pt) => {
      drawEventMarker(pt, strokeColor, color, eventRadius);
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
    drawCircle(point, color);
  } else if (config.shape === 'polygon') {
    const { points } = getPolygonPoints(config.orientation, config.sides);
    drawPolygon(points);
    const eventPoints = getPolygonSoundPoints(points, config.soundMarkers);
    eventPoints.forEach((pt) => {
      drawEventMarker(pt, strokeColor, color, eventRadius);
    });
    const segmentDuration = config.segmentDuration;
    const cycleDuration = segmentDuration * config.segmentCount;
    const local = elapsed % cycleDuration;
    const index = Math.floor(local / segmentDuration);
    const t = (local - index * segmentDuration) / segmentDuration;
    const current = points[index % points.length];
    const next = points[(index + 1) % points.length];
    const point = lerpPoint(current, next, t);
    drawCircle(point, color);
  } else if (config.shape === 'circle') {
    const { center, radius, top } = getCircleGeometry(config.orientation);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    drawEventMarker(top, strokeColor, color, eventRadius);

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
    drawCircle(point, color);
  }
}

function projectPointToIsometric(point, baseCenter, origin, scale, height = 0) {
  const dx = (point.x - baseCenter.x) * scale;
  const dy = (point.y - baseCenter.y) * scale;
  const x = origin.x + dx - dy;
  const y = origin.y + (dx + dy) * 0.5 - height;
  return { x, y };
}

function drawGatiQuadrant3d(config, elapsed) {
  const { orientation, view2d, cycleDuration } = config;
  if (!view2d) {
    return;
  }

  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(orientation);
  const baseCenter = { x: offsetX + width / 2, y: offsetY + height / 2 };
  const isoOrigin = { x: offsetX + width * 0.54, y: offsetY + height * 0.72 };
  const scale = 0.82;
  const strokeColor = getStrokeColor('gati');
  const segmentColor = getSegmentColor('gati');
  const baseRadius = Math.min(width, height) * 0.32;
  const baseMarkerRadius = Math.max(3, canvas.width * 0.0045);
  const surfaceHeight = Math.max(2, baseMarkerRadius * 0.6);
  const markerHeight = surfaceHeight;
  const eventHeight = surfaceHeight;

  const project = (point, heightOffset = 0) =>
    projectPointToIsometric(point, baseCenter, isoOrigin, scale, heightOffset);

  const baseCorners = [
    { x: baseCenter.x - baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y + baseRadius },
    { x: baseCenter.x - baseRadius, y: baseCenter.y + baseRadius },
  ];
  const isoCorners = baseCorners.map((corner) => project(corner, 0));
  const stationaryMarkerEnabled =
    view2d?.soundMarkers?.mode === 'count' && view2d.soundMarkers.count <= 2;
  const farTopIndex = isoCorners.reduce(
    (best, corner, index) => (corner.y < isoCorners[best].y ? index : best),
    0,
  );
  const farRightIndex = isoCorners.reduce(
    (best, corner, index) => (corner.x > isoCorners[best].x ? index : best),
    0,
  );
  const farTopCorner = baseCorners[farTopIndex];
  const farRightCorner = baseCorners[farRightIndex];
  const topEdgeMidpoint = lerpPoint(farTopCorner, farRightCorner, 0.5);
  const radialMargin = 0.16;
  const directionToTop = {
    x: topEdgeMidpoint.x - baseCenter.x,
    y: topEdgeMidpoint.y - baseCenter.y,
  };
  const directionLength = Math.hypot(directionToTop.x, directionToTop.y) || 1;
  const directionUnit = {
    x: directionToTop.x / directionLength,
    y: directionToTop.y / directionLength,
  };
  const shapeRadius = directionLength * (1 - radialMargin);
  const firstMarkerBasePoint = {
    x: baseCenter.x + directionUnit.x * shapeRadius,
    y: baseCenter.y + directionUnit.y * shapeRadius,
  };
  const oppositeAxisPoint = {
    x: baseCenter.x - directionUnit.x * shapeRadius,
    y: baseCenter.y - directionUnit.y * shapeRadius,
  };
  const orientationAngle = Math.atan2(
    firstMarkerBasePoint.y - baseCenter.y,
    firstMarkerBasePoint.x - baseCenter.x,
  );
  const stationaryBasePoint = stationaryMarkerEnabled ? firstMarkerBasePoint : null;

  const drawMarker = (point, options = {}) => {
    const {
      height: heightOffset = markerHeight,
      radius = baseMarkerRadius,
      color = segmentColor,
      stroke = strokeColor,
      baseOpacity = 0.2,
    } = options;
    const top = project(point, heightOffset);
    ctx.save();
    if (baseOpacity > 0) {
      ctx.globalAlpha = baseOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(top.x, top.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(top.x, top.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, radius * 0.45);
    ctx.stroke();
    ctx.restore();
  };

  const drawBasePlane = () => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(isoCorners[0].x, isoCorners[0].y);
    for (let i = 1; i < isoCorners.length; i += 1) {
      ctx.lineTo(isoCorners[i].x, isoCorners[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(20, 44, 44, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(isoCorners[0].x, isoCorners[0].y);
    ctx.lineTo(isoCorners[2].x, isoCorners[2].y);
    ctx.moveTo(isoCorners[1].x, isoCorners[1].y);
    ctx.lineTo(isoCorners[3].x, isoCorners[3].y);
    ctx.stroke();
    ctx.restore();
  };

  drawBasePlane();

  const segmentDuration = view2d.segmentDuration || 0;
  const segmentCount = view2d.segmentCount || 1;
  const fallbackCycle = segmentDuration * Math.max(1, segmentCount);
  const shapeCycle = cycleDuration > 0 ? cycleDuration : fallbackCycle;

  const drawLineShape = () => {
    const start = firstMarkerBasePoint;
    const end = oppositeAxisPoint;
    const isoStart = project(start, eventHeight);
    const isoEnd = project(end, eventHeight);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(isoStart.x, isoStart.y);
    ctx.lineTo(isoEnd.x, isoEnd.y);
    ctx.stroke();
    ctx.restore();

    const eventPoints = getLineSoundPoints(start, end, view2d, view2d.soundMarkers);
    if (stationaryBasePoint) {
      if (eventPoints.length > 0) {
        eventPoints[0] = stationaryBasePoint;
      } else {
        eventPoints.push(stationaryBasePoint);
      }
    }
    eventPoints.forEach((pt) => {
      drawMarker(pt, { height: eventHeight });
    });

    if (!(segmentDuration > 0)) {
      const staticPoint = stationaryBasePoint || start;
      drawMarker(staticPoint, {
        height: eventHeight,
        radius: baseMarkerRadius * 1.2,
        baseOpacity: 0.28,
      });
      return;
    }

    let progressPoint = start;
    if (view2d.bounce) {
      const cycleDuration = segmentDuration * 2;
      if (cycleDuration > 0) {
        const local = elapsed % cycleDuration;
        const index = Math.floor(local / segmentDuration);
        const t = (local - index * segmentDuration) / segmentDuration;
        progressPoint = index % 2 === 0 ? lerpPoint(start, end, t) : lerpPoint(end, start, t);
      }
    } else if (view2d.segmentCount && view2d.segmentCount > 1) {
      const cycle = segmentDuration * view2d.segmentCount;
      if (cycle > 0) {
        const local = elapsed % cycle;
        const index = Math.floor(local / segmentDuration);
        const t = (local - index * segmentDuration) / segmentDuration;
        progressPoint = lerpPoint(start, end, t);
      }
    } else {
      const local = (elapsed % segmentDuration) / segmentDuration;
      progressPoint = lerpPoint(start, end, local);
    }

    drawMarker(progressPoint, {
      height: eventHeight,
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  const drawPolygonShape = () => {
    const sides = Math.max(3, Math.floor(view2d.sides) || 3);
    const points = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = orientationAngle + (i * 2 * Math.PI) / sides;
      points.push({
        x: baseCenter.x + shapeRadius * Math.cos(angle),
        y: baseCenter.y + shapeRadius * Math.sin(angle),
      });
    }
    const isoPoints = points.map((pt) => project(pt, eventHeight));

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
    for (let i = 1; i < isoPoints.length; i += 1) {
      ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const eventPoints = getPolygonSoundPoints(points, view2d.soundMarkers);
    eventPoints.forEach((pt) => {
      drawMarker(pt, { height: eventHeight });
    });

    if (!(segmentDuration > 0)) {
      drawMarker(points[0], {
        height: eventHeight,
        radius: baseMarkerRadius * 1.2,
        baseOpacity: 0.28,
      });
      return;
    }

    const cycle = segmentDuration * Math.max(1, view2d.segmentCount || points.length);
    let progressPoint = points[0];
    if (cycle > 0) {
      const local = elapsed % cycle;
      const index = Math.floor(local / segmentDuration);
      const t = (local - index * segmentDuration) / segmentDuration;
      const current = points[index % points.length];
      const next = points[(index + 1) % points.length];
      progressPoint = lerpPoint(current, next, t);
    }

    drawMarker(progressPoint, {
      height: eventHeight,
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  const drawCircleShape = () => {
    const center = baseCenter;
    const radius = shapeRadius;
    const orientedStart = firstMarkerBasePoint;
    const samples = 64;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const point = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
      const isoPoint = project(point, eventHeight);
      if (i === 0) {
        ctx.moveTo(isoPoint.x, isoPoint.y);
      } else {
        ctx.lineTo(isoPoint.x, isoPoint.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    drawMarker(orientedStart, { height: eventHeight });

    let progress = 0;
    if (segmentDuration > 0) {
      const local = elapsed % segmentDuration;
      progress = local / segmentDuration;
    } else if (shapeCycle > 0) {
      const local = elapsed % shapeCycle;
      progress = local / shapeCycle;
    }
    const angle = orientationAngle + 2 * Math.PI * progress;
    const progressPoint = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };

    drawMarker(progressPoint, {
      height: eventHeight,
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  if (view2d.shape === 'line') {
    drawLineShape();
  } else if (view2d.shape === 'polygon') {
    drawPolygonShape();
  } else if (view2d.shape === 'circle') {
    drawCircleShape();
  }
}

function drawJatiQuadrant3d(config, elapsed) {
  const { orientation, view2d, cycleDuration, gatiCount = 1 } = config;
  if (!view2d) {
    return;
  }

  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(orientation);
  const baseCenter = { x: offsetX + width / 2, y: offsetY + height / 2 };
  const isoOrigin = { x: offsetX + width * 0.46, y: offsetY + height * 0.72 };
  const scale = 0.82;
  const strokeColor = getStrokeColor('jati');
  const segmentColor = getSegmentColor('jati');
  const baseRadius = Math.min(width, height) * 0.32;
  const baseMarkerRadius = Math.max(3, canvas.width * 0.0045);
  const surfaceHeight = Math.max(2, baseMarkerRadius * 0.6);
  const eventHeight = surfaceHeight;

  const project = (point, heightOffset = 0) =>
    projectPointToIsometric(point, baseCenter, isoOrigin, scale, heightOffset);

  const baseCorners = [
    { x: baseCenter.x - baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y + baseRadius },
    { x: baseCenter.x - baseRadius, y: baseCenter.y + baseRadius },
  ];
  const isoCorners = baseCorners.map((corner) => project(corner, 0));
  const farTopIndex = isoCorners.reduce(
    (best, corner, index) => (corner.y < isoCorners[best].y ? index : best),
    0,
  );
  const farRightIndex = isoCorners.reduce(
    (best, corner, index) => (corner.x > isoCorners[best].x ? index : best),
    0,
  );
  const farTopCorner = baseCorners[farTopIndex];
  const farRightCorner = baseCorners[farRightIndex];
  const topEdgeMidpoint = lerpPoint(farTopCorner, farRightCorner, 0.5);
  const radialMargin = 0.16;
  const directionToTop = {
    x: topEdgeMidpoint.x - baseCenter.x,
    y: topEdgeMidpoint.y - baseCenter.y,
  };
  const directionLength = Math.hypot(directionToTop.x, directionToTop.y) || 1;
  const directionUnit = {
    x: directionToTop.x / directionLength,
    y: directionToTop.y / directionLength,
  };
  const baseShapeRadius = directionLength * (1 - radialMargin);
  const baseOrientationAngle = Math.atan2(directionUnit.y, directionUnit.x);
  const stationarySoundCircle = baseCenter;

  const drawMarker = (point, options = {}) => {
    const {
      height: heightOffset = eventHeight,
      radius = baseMarkerRadius,
      color = segmentColor,
      stroke = strokeColor,
      baseOpacity = 0.2,
    } = options;
    const top = project(point, heightOffset);
    ctx.save();
    if (baseOpacity > 0) {
      ctx.globalAlpha = baseOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(top.x, top.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(top.x, top.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, radius * 0.45);
    ctx.stroke();
    ctx.restore();
  };

  const drawBasePlane = () => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(isoCorners[0].x, isoCorners[0].y);
    for (let i = 1; i < isoCorners.length; i += 1) {
      ctx.lineTo(isoCorners[i].x, isoCorners[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(54, 20, 20, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(isoCorners[0].x, isoCorners[0].y);
    ctx.lineTo(isoCorners[2].x, isoCorners[2].y);
    ctx.moveTo(isoCorners[1].x, isoCorners[1].y);
    ctx.lineTo(isoCorners[3].x, isoCorners[3].y);
    ctx.stroke();
    ctx.restore();
  };

  drawBasePlane();

  const copyCount = Math.max(1, Math.floor(gatiCount) || 1);
  const axisRotationStep =
    gatiCount > 0 ? (Math.PI * 2) / Math.max(1, gatiCount) : 0;
  const radiusScale =
    copyCount === 1 ? 1 : Math.max(0.32, 1 / (1 + (copyCount - 1) * 0.55));
  const shapeRadius = baseShapeRadius * radiusScale;

  const segmentDuration = view2d.segmentDuration || 0;
  const segmentCount = view2d.segmentCount || 1;
  const fallbackCycle = segmentDuration * Math.max(1, segmentCount);
  const singleCycle = cycleDuration > 0 ? cycleDuration : fallbackCycle;
  const copyCycle = singleCycle;
  const totalCycle = copyCycle > 0 ? copyCycle * copyCount : 0;

  let activeCopyIndex = 0;
  let copyElapsed = 0;
  if (copyCycle > 0 && totalCycle > 0) {
    const totalProgress = elapsed % totalCycle;
    activeCopyIndex = Math.min(copyCount - 1, Math.floor(totalProgress / copyCycle));
    copyElapsed = totalProgress - activeCopyIndex * copyCycle;
  }

  const angleStep = copyCount > 1 ? (Math.PI * 2) / copyCount : 0;
  const isCenterPoint = (point) =>
    Math.hypot(point.x - baseCenter.x, point.y - baseCenter.y) < 0.5;

  let centerMarkerDrawn = false;
  const ensureCenterMarker = () => {
    if (!centerMarkerDrawn) {
      drawMarker(baseCenter, {
        height: eventHeight,
        radius: baseMarkerRadius * (copyCount > 1 ? 1.45 : 1.2),
        baseOpacity: 0.38,
      });
      centerMarkerDrawn = true;
    }
  };

  const rotatePointForCopy = (point, rotationContext, rotationAngle) => {
    if (
      !rotationContext ||
      !rotationContext.axisUnit ||
      !Number.isFinite(rotationAngle) ||
      Math.abs(rotationAngle) < 1e-12
    ) {
      return { x: point.x, y: point.y, height: 0 };
    }
    return rotatePointAroundAxisOnPlane(point, rotationContext, rotationAngle);
  };

  const projectRotatedPoint = (
    point,
    rotationContext,
    rotationAngle,
    baseHeight = eventHeight,
  ) => {
    const rotated = rotatePointForCopy(point, rotationContext, rotationAngle);
    return project({ x: rotated.x, y: rotated.y }, baseHeight + rotated.height);
  };

  const drawRotatedMarker = (
    point,
    rotationContext,
    rotationAngle,
    options = {},
  ) => {
    const rotated = rotatePointForCopy(point, rotationContext, rotationAngle);
    const baseHeight = options.height ?? eventHeight;
    drawMarker(
      { x: rotated.x, y: rotated.y },
      {
        ...options,
        height: baseHeight + rotated.height,
      },
    );
  };

  const processEventPoint = (point, rotationContext, rotationAngle) => {
    if (isCenterPoint(point)) {
      ensureCenterMarker();
    } else {
      drawRotatedMarker(point, rotationContext, rotationAngle);
    }
  };

  const drawLineCopy = (rotation, copyIndex) => {
    const direction = { x: Math.cos(rotation), y: Math.sin(rotation) };
    const start = baseCenter;
    const length = shapeRadius * 2;
    const end = {
      x: start.x - direction.x * length,
      y: start.y - direction.y * length,
    };
    const rotationAngle3d = axisRotationStep * copyIndex;
    const copyCenter = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
    const rotationContext = createAxisRotationContext(
      stationarySoundCircle,
      copyCenter,
    );
    const isoStart = projectRotatedPoint(start, rotationContext, rotationAngle3d);
    const isoEnd = projectRotatedPoint(end, rotationContext, rotationAngle3d);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(isoStart.x, isoStart.y);
    ctx.lineTo(isoEnd.x, isoEnd.y);
    ctx.stroke();
    ctx.restore();

    const eventPoints = getLineSoundPoints(start, end, view2d, view2d.soundMarkers);
    if (eventPoints.length === 0) {
      ensureCenterMarker();
    }
    eventPoints.forEach((point) =>
      processEventPoint(point, rotationContext, rotationAngle3d),
    );

    if (!(segmentDuration > 0) || !(copyCycle > 0)) {
      return;
    }

    if (copyIndex !== activeCopyIndex) {
      return;
    }

    let progressPoint = start;
    if (view2d.bounce) {
      const cycleDuration = segmentDuration * 2;
      if (cycleDuration > 0) {
        const local = copyElapsed % cycleDuration;
        const index = Math.floor(local / segmentDuration);
        const t = (local - index * segmentDuration) / segmentDuration;
        progressPoint = index % 2 === 0 ? lerpPoint(start, end, t) : lerpPoint(end, start, t);
      }
    } else if (view2d.segmentCount && view2d.segmentCount > 1) {
      const cycle = segmentDuration * view2d.segmentCount;
      if (cycle > 0) {
        const local = copyElapsed % cycle;
        const index = Math.floor(local / segmentDuration);
        const t = (local - index * segmentDuration) / segmentDuration;
        progressPoint = lerpPoint(start, end, t);
      }
    } else if (segmentDuration > 0) {
      const local = copyElapsed % segmentDuration;
      const t = segmentDuration > 0 ? local / segmentDuration : 0;
      progressPoint = lerpPoint(start, end, t);
    }

    drawRotatedMarker(progressPoint, rotationContext, rotationAngle3d, {
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  const drawPolygonCopy = (rotation, copyIndex) => {
    const sides = Math.max(3, Math.floor(view2d.sides) || 3);
    const direction = { x: Math.cos(rotation), y: Math.sin(rotation) };
    const center = {
      x: baseCenter.x - direction.x * shapeRadius,
      y: baseCenter.y - direction.y * shapeRadius,
    };
    const points = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i * 2 * Math.PI) / sides;
      points.push({
        x: center.x + shapeRadius * Math.cos(angle),
        y: center.y + shapeRadius * Math.sin(angle),
      });
    }
    const rotationAngle3d = axisRotationStep * copyIndex;
    const rotationContext = createAxisRotationContext(
      stationarySoundCircle,
      center,
    );
    const isoPoints = points.map((pt) =>
      projectRotatedPoint(pt, rotationContext, rotationAngle3d),
    );

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
    for (let i = 1; i < isoPoints.length; i += 1) {
      ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const eventPoints = getPolygonSoundPoints(points, view2d.soundMarkers);
    if (eventPoints.length === 0) {
      ensureCenterMarker();
    }
    eventPoints.forEach((point) =>
      processEventPoint(point, rotationContext, rotationAngle3d),
    );

    if (!(segmentDuration > 0) || !(copyCycle > 0) || copyIndex !== activeCopyIndex) {
      return;
    }

    const cycle = segmentDuration * Math.max(1, view2d.segmentCount || points.length);
    if (!(cycle > 0)) {
      return;
    }

    const local = copyElapsed % cycle;
    const index = Math.floor(local / segmentDuration);
    const t = (local - index * segmentDuration) / segmentDuration;
    const current = points[index % points.length];
    const next = points[(index + 1) % points.length];
    const progressPoint = lerpPoint(current, next, t);

    drawRotatedMarker(progressPoint, rotationContext, rotationAngle3d, {
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  const drawCircleCopy = (rotation, copyIndex) => {
    const direction = { x: Math.cos(rotation), y: Math.sin(rotation) };
    const center = {
      x: baseCenter.x - direction.x * shapeRadius,
      y: baseCenter.y - direction.y * shapeRadius,
    };
    const radius = shapeRadius;
    const samples = 64;
    const rotationAngle3d = axisRotationStep * copyIndex;
    const rotationContext = createAxisRotationContext(
      stationarySoundCircle,
      center,
    );

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const angle = rotation + (i / samples) * Math.PI * 2;
      const point = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
      const isoPoint = projectRotatedPoint(
        point,
        rotationContext,
        rotationAngle3d,
      );
      if (i === 0) {
        ctx.moveTo(isoPoint.x, isoPoint.y);
      } else {
        ctx.lineTo(isoPoint.x, isoPoint.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    ensureCenterMarker();

    if (!(segmentDuration > 0) || !(copyCycle > 0) || copyIndex !== activeCopyIndex) {
      return;
    }

    const cycle = segmentDuration > 0 ? segmentDuration : copyCycle;
    if (!(cycle > 0)) {
      return;
    }

    const local = copyElapsed % cycle;
    const progress = cycle > 0 ? local / cycle : 0;
    const angle = rotation + 2 * Math.PI * progress;
    const progressPoint = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };

    drawRotatedMarker(progressPoint, rotationContext, rotationAngle3d, {
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const rotation = baseOrientationAngle + angleStep * copyIndex;
    if (view2d.shape === 'line') {
      drawLineCopy(rotation, copyIndex);
    } else if (view2d.shape === 'polygon') {
      drawPolygonCopy(rotation, copyIndex);
    } else if (view2d.shape === 'circle') {
      drawCircleCopy(rotation, copyIndex);
    }
  }

  if (!centerMarkerDrawn) {
    ensureCenterMarker();
  }
}

function drawNadaiQuadrant3d(config, elapsed) {
  const { orientation, view2d, cycleDuration } = config;
  if (!view2d) {
    return;
  }

  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(orientation);
  const baseCenter = { x: offsetX + width / 2, y: offsetY + height / 2 };
  const isoOrigin = { x: offsetX + width * 0.46, y: offsetY + height * 0.72 };
  const scale = 0.82;
  const strokeColor = getStrokeColor('nadai');
  const segmentColor = getSegmentColor('nadai');
  const baseRadius = Math.min(width, height) * 0.32;
  const baseMarkerRadius = Math.max(3, canvas.width * 0.0045);
  const surfaceHeight = Math.max(2, baseMarkerRadius * 0.6);
  const markerHeight = surfaceHeight;
  const eventHeight = surfaceHeight;

  const project = (point, heightOffset = 0) =>
    projectPointToIsometric(point, baseCenter, isoOrigin, scale, heightOffset);

  const baseCorners = [
    { x: baseCenter.x - baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y + baseRadius },
    { x: baseCenter.x - baseRadius, y: baseCenter.y + baseRadius },
  ];
  const isoCorners = baseCorners.map((corner) => project(corner, 0));
  const stationaryMarkerEnabled =
    view2d?.soundMarkers?.mode === 'count' && view2d.soundMarkers.count <= 2;
  const farTopIndex = isoCorners.reduce(
    (best, corner, index) => (corner.y < isoCorners[best].y ? index : best),
    0,
  );
  const farRightIndex = isoCorners.reduce(
    (best, corner, index) => (corner.x > isoCorners[best].x ? index : best),
    0,
  );
  const farLeftIndex = isoCorners.reduce(
    (best, corner, index) => (corner.x < isoCorners[best].x ? index : best),
    0,
  );
  const farTopCorner = baseCorners[farTopIndex];
  const farRightCorner = baseCorners[farRightIndex];
  const topEdgeMidpoint = lerpPoint(farTopCorner, farRightCorner, 0.5);
  const radialMargin = 0.16;
  const directionToTop = {
    x: topEdgeMidpoint.x - baseCenter.x,
    y: topEdgeMidpoint.y - baseCenter.y,
  };
  const directionLength = Math.hypot(directionToTop.x, directionToTop.y) || 1;
  const directionUnit = {
    x: directionToTop.x / directionLength,
    y: directionToTop.y / directionLength,
  };
  const shapeRadius = directionLength * (1 - radialMargin);
  const firstMarkerBasePoint = {
    x: baseCenter.x + directionUnit.x * shapeRadius,
    y: baseCenter.y + directionUnit.y * shapeRadius,
  };
  const oppositeAxisPoint = {
    x: baseCenter.x - directionUnit.x * shapeRadius,
    y: baseCenter.y - directionUnit.y * shapeRadius,
  };
  const orientationAngle = Math.atan2(
    firstMarkerBasePoint.y - baseCenter.y,
    firstMarkerBasePoint.x - baseCenter.x,
  );
  const stationaryBasePoint = stationaryMarkerEnabled ? firstMarkerBasePoint : null;

  const drawMarker = (point, options = {}) => {
    const {
      height: heightOffset = markerHeight,
      radius = baseMarkerRadius,
      color = segmentColor,
      stroke = strokeColor,
      baseOpacity = 0.2,
    } = options;
    const top = project(point, heightOffset);
    ctx.save();
    if (baseOpacity > 0) {
      ctx.globalAlpha = baseOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(top.x, top.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(top.x, top.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, radius * 0.45);
    ctx.stroke();
    ctx.restore();
  };

  const drawBasePlane = () => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(isoCorners[0].x, isoCorners[0].y);
    for (let i = 1; i < isoCorners.length; i += 1) {
      ctx.lineTo(isoCorners[i].x, isoCorners[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(44, 28, 70, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(isoCorners[0].x, isoCorners[0].y);
    ctx.lineTo(isoCorners[2].x, isoCorners[2].y);
    ctx.moveTo(isoCorners[1].x, isoCorners[1].y);
    ctx.lineTo(isoCorners[3].x, isoCorners[3].y);
    ctx.stroke();
    ctx.restore();
  };

  drawBasePlane();

  const segmentDuration = view2d.segmentDuration || 0;
  const segmentCount = view2d.segmentCount || 1;
  const fallbackCycle = segmentDuration * Math.max(1, segmentCount);
  const shapeCycle = cycleDuration > 0 ? cycleDuration : fallbackCycle;

  const drawLineShape = () => {
    const start = firstMarkerBasePoint;
    const end = oppositeAxisPoint;
    const isoStart = project(start, eventHeight);
    const isoEnd = project(end, eventHeight);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(isoStart.x, isoStart.y);
    ctx.lineTo(isoEnd.x, isoEnd.y);
    ctx.stroke();
    ctx.restore();

    const eventPoints = getLineSoundPoints(start, end, view2d, view2d.soundMarkers);
    if (stationaryBasePoint) {
      if (eventPoints.length > 0) {
        eventPoints[0] = stationaryBasePoint;
      } else {
        eventPoints.push(stationaryBasePoint);
      }
    }
    eventPoints.forEach((pt) => {
      drawMarker(pt, { height: eventHeight });
    });

    if (!(segmentDuration > 0)) {
      const staticPoint = stationaryBasePoint || start;
      drawMarker(staticPoint, {
        height: eventHeight,
        radius: baseMarkerRadius * 1.2,
        baseOpacity: 0.28,
      });
      return;
    }

    let progressPoint = start;
    if (view2d.bounce) {
      const cycleDuration = segmentDuration * 2;
      if (cycleDuration > 0) {
        const local = elapsed % cycleDuration;
        const index = Math.floor(local / segmentDuration);
        const t = (local - index * segmentDuration) / segmentDuration;
        progressPoint = index % 2 === 0 ? lerpPoint(start, end, t) : lerpPoint(end, start, t);
      }
    } else if (view2d.segmentCount && view2d.segmentCount > 1) {
      const cycle = segmentDuration * view2d.segmentCount;
      if (cycle > 0) {
        const local = elapsed % cycle;
        const index = Math.floor(local / segmentDuration);
        const t = (local - index * segmentDuration) / segmentDuration;
        progressPoint = lerpPoint(start, end, t);
      }
    } else {
      const local = (elapsed % segmentDuration) / segmentDuration;
      progressPoint = lerpPoint(start, end, local);
    }

    drawMarker(progressPoint, {
      height: eventHeight,
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  const drawPolygonShape = () => {
    const sides = Math.max(3, Math.floor(view2d.sides) || 3);
    const points = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = orientationAngle + (i * 2 * Math.PI) / sides;
      points.push({
        x: baseCenter.x + shapeRadius * Math.cos(angle),
        y: baseCenter.y + shapeRadius * Math.sin(angle),
      });
    }
    const isoPoints = points.map((pt) => project(pt, eventHeight));

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
    for (let i = 1; i < isoPoints.length; i += 1) {
      ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const eventPoints = getPolygonSoundPoints(points, view2d.soundMarkers);
    eventPoints.forEach((pt) => {
      drawMarker(pt, { height: eventHeight });
    });

    if (!(segmentDuration > 0)) {
      drawMarker(points[0], {
        height: eventHeight,
        radius: baseMarkerRadius * 1.2,
        baseOpacity: 0.28,
      });
      return;
    }

    const cycle = segmentDuration * Math.max(1, view2d.segmentCount || points.length);
    let progressPoint = points[0];
    if (cycle > 0) {
      const local = elapsed % cycle;
      const index = Math.floor(local / segmentDuration);
      const t = (local - index * segmentDuration) / segmentDuration;
      const current = points[index % points.length];
      const next = points[(index + 1) % points.length];
      progressPoint = lerpPoint(current, next, t);
    }

    drawMarker(progressPoint, {
      height: eventHeight,
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  const drawCircleShape = () => {
    const center = baseCenter;
    const radius = shapeRadius;
    const orientedStart = firstMarkerBasePoint;
    const samples = 64;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const point = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
      const isoPoint = project(point, eventHeight);
      if (i === 0) {
        ctx.moveTo(isoPoint.x, isoPoint.y);
      } else {
        ctx.lineTo(isoPoint.x, isoPoint.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    drawMarker(orientedStart, { height: eventHeight });

    let progress = 0;
    if (segmentDuration > 0) {
      const local = elapsed % segmentDuration;
      progress = local / segmentDuration;
    } else if (shapeCycle > 0) {
      const local = elapsed % shapeCycle;
      progress = local / shapeCycle;
    }
    const angle = orientationAngle + 2 * Math.PI * progress;
    const progressPoint = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };

    drawMarker(progressPoint, {
      height: eventHeight,
      radius: baseMarkerRadius * 1.25,
      baseOpacity: 0.32,
    });
  };

  if (view2d.shape === 'line') {
    drawLineShape();
  } else if (view2d.shape === 'polygon') {
    drawPolygonShape();
  } else if (view2d.shape === 'circle') {
    drawCircleShape();
  }
}

function drawMuteOverlay(quadrant) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(offsetX, offsetY, width, height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, width, height);
  ctx.restore();
}

function drawQuadrantLabel(name, quadrant) {
  const label = name.toUpperCase();
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  const isLeft = quadrant.includes('left');
  const letterCount = Math.max(1, label.length);
  const labelAreaHeight = height / 3;
  const labelAreaTop = offsetY + (height - labelAreaHeight) / 2;
  const labelAreaBottom = labelAreaTop + labelAreaHeight;
  const spacing =
    letterCount === 1
      ? 0
      : (labelAreaHeight === 0 ? 0 : labelAreaHeight / (letterCount - 1));

  ctx.save();
  ctx.fillStyle = getSegmentColor(name);

  const maxLetterHeight = labelAreaHeight / letterCount;
  const baseFontSize = Math.min(width * 0.035, height * 0.045);
  const fontSize = Math.min(baseFontSize, maxLetterHeight * 0.8 || baseFontSize);
  ctx.font = `600 ${fontSize}px "Futura", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = isLeft ? 'left' : 'right';
  ctx.textBaseline = 'middle';

  const horizontalPadding = isLeft ? width * 0.06 : width * 0.08;
  const textX = isLeft
    ? offsetX + horizontalPadding
    : offsetX + width - horizontalPadding;

  for (let i = 0; i < letterCount; i += 1) {
    const y = letterCount === 1
      ? (labelAreaTop + labelAreaBottom) / 2
      : labelAreaTop + spacing * i;
    ctx.fillText(label[i], textX, y);
  }

  ctx.restore();
}

function buildQuadrantConfigs(layaPeriod, gatiCount, jatiCount, nadaiValue) {
  const safeLayaPeriod = Number.isFinite(layaPeriod) ? layaPeriod : 0;

  const layaView =
    safeLayaPeriod > 0
      ? {
          shape: 'circle',
          segmentDuration: safeLayaPeriod,
          soundMarkers: { mode: 'first' },
        }
      : null;

  const gatiShape = (() => {
    if (gatiCount === 1) {
      return { shape: 'circle', segmentCount: 1, segmentDuration: safeLayaPeriod };
    }
    if (gatiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: safeLayaPeriod / 2 };
    }
    return {
      shape: 'polygon',
      sides: gatiCount,
      segmentCount: gatiCount,
      segmentDuration: safeLayaPeriod / Math.max(1, gatiCount),
    };
  })();

  const jatiShape = (() => {
    const baseDuration = safeLayaPeriod / Math.max(1, gatiCount);
    if (jatiCount === 1) {
      return { shape: 'circle', segmentCount: 1, segmentDuration: baseDuration };
    }
    if (jatiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: baseDuration };
    }
    return {
      shape: 'polygon',
      sides: jatiCount,
      segmentCount: jatiCount,
      segmentDuration: baseDuration,
    };
  })();

  const nadaiShape = (() => {
    const baseDuration = (safeLayaPeriod / Math.max(1, gatiCount)) * (1 / nadaiValue);
    if (jatiCount === 1) {
      return { shape: 'circle', segmentCount: 1, segmentDuration: baseDuration };
    }
    if (jatiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: baseDuration };
    }
    return {
      shape: 'polygon',
      sides: jatiCount,
      segmentCount: jatiCount,
      segmentDuration: baseDuration,
    };
  })();

  const gatiCycle = (gatiShape.segmentDuration || 0) * (gatiShape.segmentCount || 1);
  const jatiCycle = (jatiShape.segmentDuration || 0) * (jatiShape.segmentCount || 1);
  const nadaiCycle = (nadaiShape.segmentDuration || 0) * (nadaiShape.segmentCount || 1);

  const gatiView1d = (() => {
    if (!safeLayaPeriod) {
      return null;
    }
    if (gatiCount === 1) {
      return {
        shape: 'circle',
        segmentDuration: safeLayaPeriod,
        segmentCount: 1,
        soundMarkers: { mode: 'first' },
      };
    }
    const segmentDuration = safeLayaPeriod / Math.max(1, gatiCount);
    return {
      shape: 'circle',
      segmentDuration,
      segmentCount: gatiCount === 2 ? 2 : gatiCount,
      soundMarkers: { mode: 'first' },
    };
  })();

  const jatiView1d = (() => {
    if (!safeLayaPeriod) {
      return null;
    }
    const segmentDuration = jatiCycle || jatiShape.segmentDuration || safeLayaPeriod;
    return {
      shape: 'circle',
      segmentDuration,
      segmentCount: 1,
      soundMarkers: { mode: 'first' },
    };
  })();

  const nadaiView1d = (() => {
    if (!safeLayaPeriod) {
      return null;
    }
    const segmentDuration = nadaiCycle || nadaiShape.segmentDuration || safeLayaPeriod;
    return {
      shape: 'circle',
      segmentDuration,
      segmentCount: 1,
      soundMarkers: { mode: 'first' },
    };
  })();

  return {
    laya: {
      orientation: 'bottom-left',
      cycleDuration: safeLayaPeriod,
      view1d: layaView,
      view2d: null,
    },
    gati: {
      orientation: 'top-left',
      cycleDuration: gatiCycle,
      view1d: gatiView1d,
      view2d: {
        ...gatiShape,
        soundMarkers: { mode: 'count', count: gatiCount },
      },
    },
    jati: {
      orientation: 'top-right',
      cycleDuration: jatiCycle,
      view1d: jatiView1d,
      view2d: {
        ...jatiShape,
        soundMarkers: { mode: 'first' },
      },
      gatiCount,
    },
    nadai: {
      orientation: 'bottom-right',
      cycleDuration: nadaiCycle,
      view1d: nadaiView1d,
      view2d: {
        ...nadaiShape,
        soundMarkers: { mode: 'first' },
      },
    },
  };
}

function drawQuadrant(name, config, elapsed) {
  if (!config) {
    return;
  }
  const mode = quadrantModes[name] || '2d';
  const { orientation, cycleDuration, view1d, view2d } = config;

  if (mode === '1d') {
    const view = view1d || null;
    const fallbackMarkers = view2d?.soundMarkers || { mode: 'first' };
    if (view) {
      const shapeConfig = {
        ...view,
        orientation,
        soundMarkers: view.soundMarkers || fallbackMarkers,
      };
      if (!(shapeConfig.segmentDuration > 0) && cycleDuration > 0) {
        shapeConfig.segmentDuration = cycleDuration;
      }
      drawQuadrantShape(name, shapeConfig, elapsed);
    } else if (cycleDuration > 0) {
      drawQuadrantShape(
        name,
        {
          shape: 'circle',
          orientation,
          segmentDuration: cycleDuration,
          soundMarkers: fallbackMarkers,
        },
        elapsed,
      );
    }
    return;
  }

  if (mode === '2d' || typeof quadrantModes[name] === 'undefined') {
    if (view2d) {
      drawQuadrantShape(name, { ...view2d, orientation }, elapsed);
    }
    return;
  }

  if (mode === '3d') {
    if (name === 'gati') {
      drawGatiQuadrant3d({ orientation, view2d, cycleDuration }, elapsed);
    } else if (name === 'jati') {
      drawJatiQuadrant3d({ orientation, view2d, cycleDuration, gatiCount: config.gatiCount }, elapsed);
    } else if (name === 'nadai') {
      drawNadaiQuadrant3d({ orientation, view2d, cycleDuration }, elapsed);
    }
  }
}

function render() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  const elapsed = getElapsed();
  const layaPeriod = 60 / Number(sliders.laya.value);
  const gatiCount = Number(sliders.gati.value);
  const jatiCount = Number(sliders.jati.value);
  const nadaiValue = nadaiValues[Number(sliders.nadai.value)];

  const quadrantConfigs = buildQuadrantConfigs(layaPeriod, gatiCount, jatiCount, nadaiValue);

  drawQuadrant('laya', quadrantConfigs.laya, elapsed);
  drawQuadrant('gati', quadrantConfigs.gati, elapsed);
  drawQuadrant('jati', quadrantConfigs.jati, elapsed);
  drawQuadrant('nadai', quadrantConfigs.nadai, elapsed);

  drawQuadrantLabel('laya', 'bottom-left');
  drawQuadrantLabel('gati', 'top-left');
  drawQuadrantLabel('jati', 'top-right');
  drawQuadrantLabel('nadai', 'bottom-right');

  if (muteState.laya) {
    drawMuteOverlay('bottom-left');
  }
  if (muteState.gati) {
    drawMuteOverlay('top-left');
  }
  if (muteState.jati) {
    drawMuteOverlay('top-right');
  }
  if (muteState.nadai) {
    drawMuteOverlay('bottom-right');
  }

  scheduleAudio();
  requestAnimationFrame(render);
}

function togglePlay() {
  if (!audioCtx) {
    ensureAudio();
  }
  if (!audioCtx) {
    return;
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (isPlaying) {
    pausedElapsed = getElapsed();
    isPlaying = false;
    playToggle.textContent = '▶';
  } else {
    startTime = audioCtx.currentTime - pausedElapsed;
    isPlaying = true;
    playToggle.textContent = '⏸';
  }
  resetSchedulers();
}

playToggle.addEventListener('click', () => {
  togglePlay();
});

Object.entries(sliders).forEach(([name, input]) => {
  input.addEventListener('input', () => {
    if (name === 'nadai') {
      const display = nadaiLabels[Number(input.value)];
      valueLabels.nadai.textContent = display;
    } else if (name === 'laya') {
      valueLabels.laya.textContent = formatLayaValue(input.value);
    } else {
      valueLabels[name].textContent = input.value;
    }
    if (name === 'laya') {
      pausedElapsed = getElapsed();
      if (isPlaying) {
        startTime = audioCtx.currentTime - pausedElapsed;
      }
    }
    resetSchedulers();
  });
});

muteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.target;
    muteState[target] = !muteState[target];
    button.classList.toggle('active', muteState[target]);
    button.setAttribute('aria-pressed', muteState[target] ? 'true' : 'false');
    button.textContent = muteState[target] ? 'Muted' : 'Mute';
  });
});

updateValueLabels();
resetSchedulers();
requestAnimationFrame(render);
