import {
  createAxisRotationContext,
  rotatePointAroundAxisOnPlane,
} from './jati3dGeometry.js';
import {
  initModeTabs,
  initMuteButtons,
  initSliders,
  updateValueLabels,
} from './uiControls.js';

const canvas = document.getElementById('layakine-canvas');
const ctx = canvas.getContext('2d');
const playToggle = document.getElementById('play-toggle');
let quadrantTabs = [];
let sliders = {};
let valueLabels = {};
let muteButtons = [];

const quadrantModes = {
  laya: '1d',
  gati: '2d',
  jati: '3d',
  nadai: '3d',
};

let audioCtx = null;
let masterGain = null;
let isPlaying = false;
let startTime = 0;
let pausedElapsed = 0;

const muteState = {
  laya: false,
  gati: false,
  jati: false,
  nadai: false,
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

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

function lightenColor(hex, amount = 0.25) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return hex;
  }
  const mix = (component) => {
    const value = Math.round(component + (255 - component) * amount);
    return Math.max(0, Math.min(255, value));
  };
  const toHex = (component) => component.toString(16).padStart(2, '0');
  const lightened = `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
  return lightened;
}

const defaultVoicePalette = {
  base: '#f4f4f4',
  stroke: '#404040',
  highlight: '#f4f4f4',
};

const voicePalette = {
  laya: {
    base: '#f4a261',
    stroke: '#3a3a3a',
    highlight: '#f4a261',
  },
  gati: {
    base: '#2a9d8f',
    stroke: '#264653',
    highlight: lightenColor('#2a9d8f', 0.4),
  },
  jati: {
    base: '#e76f51',
    stroke: '#5d2a2c',
    highlight: '#e76f51',
  },
  nadai: {
    base: '#9c6ade',
    stroke: '#3c2f57',
    highlight: lightenColor('#9c6ade', 0.38),
  },
};

function getVoicePaletteEntry(name) {
  return voicePalette[name] ?? defaultVoicePalette;
}

function getSegmentColor(name) {
  const { base } = getVoicePaletteEntry(name);
  return base ?? defaultVoicePalette.base;
}

function getFirstSoundMarkerColor(name) {
  const { highlight, base } = getVoicePaletteEntry(name);
  return highlight ?? base ?? defaultVoicePalette.highlight;
}

function getStrokeColor(name) {
  const { stroke } = getVoicePaletteEntry(name);
  return stroke ?? defaultVoicePalette.stroke;
}

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
  const nadaiCount = Number(sliders.nadai.value);

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

  const jatiCycleDuration = gatiSideDuration * jatiSegments;
  const nadaiSegments = Math.max(1, nadaiCount);
  const nadaiSegmentDuration =
    nadaiSegments > 0 && jatiCycleDuration > 0 ? jatiCycleDuration / nadaiSegments : 0;
  recalcVoice('nadai', nadaiSegmentDuration, {
    cycleSegments: nadaiSegments,
    playEverySegment: true,
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

const QUADRANT_ALIGNMENT = {
  gati: { horizontal: 'left', vertical: 'top' },
  jati: { horizontal: 'right', vertical: 'top' },
  laya: { horizontal: 'left', vertical: 'top' },
  nadai: { horizontal: 'right', vertical: 'top' },
};

function computeQuadrantBounds(rect) {
  if (!rect) {
    return null;
  }

  const { width, height, left: canvasLeft, top: canvasTop, right: canvasRight, bottom: canvasBottom } = rect;
  const quadrantWidth = width / 2;
  const quadrantHeight = height / 2;

  const desiredMarginX = clamp(quadrantWidth * 0.08, 12, 40);
  const desiredMarginY = clamp(quadrantHeight * 0.08, 12, 40);
  const availableMarginX = Math.max(0, quadrantWidth / 2 - 6);
  const availableMarginY = Math.max(0, quadrantHeight / 2 - 6);
  const minimumMarginX = availableMarginX > 0 ? clamp(quadrantWidth * 0.02, 6, 14) : 0;
  const minimumMarginY = availableMarginY > 0 ? clamp(quadrantHeight * 0.02, 6, 14) : 0;
  const safeMarginX = availableMarginX > 0 ? clamp(desiredMarginX, minimumMarginX, availableMarginX) : 0;
  const safeMarginY = availableMarginY > 0 ? clamp(desiredMarginY, minimumMarginY, availableMarginY) : 0;

  const canvasCenterX = canvasLeft + quadrantWidth;
  const canvasCenterY = canvasTop + quadrantHeight;

  const quadrantBounds = {
    gati: {
      left: canvasLeft + safeMarginX,
      right: canvasCenterX - safeMarginX,
      top: canvasTop + safeMarginY,
      bottom: canvasCenterY - safeMarginY,
    },
    jati: {
      left: canvasCenterX + safeMarginX,
      right: canvasRight - safeMarginX,
      top: canvasTop + safeMarginY,
      bottom: canvasCenterY - safeMarginY,
    },
    laya: {
      left: canvasLeft + safeMarginX,
      right: canvasCenterX - safeMarginX,
      top: canvasCenterY + safeMarginY,
      bottom: canvasBottom - safeMarginY,
    },
    nadai: {
      left: canvasCenterX + safeMarginX,
      right: canvasRight - safeMarginX,
      top: canvasCenterY + safeMarginY,
      bottom: canvasBottom - safeMarginY,
    },
  };

  const fallbackBounds = {
    left: canvasLeft + safeMarginX,
    right: canvasRight - safeMarginX,
    top: canvasTop + safeMarginY,
    bottom: canvasBottom - safeMarginY,
  };

  return {
    canvasLeft,
    canvasTop,
    canvasRight,
    canvasBottom,
    quadrantWidth,
    quadrantHeight,
    quadrantBounds,
    fallbackBounds,
  };
}

function measureTabMetrics(entry, bounds, options = {}) {
  const { targetHeight = null, maxWidth: maxWidthOverride = null, maxScale = 1.5 } = options;

  const availableWidth = Math.max(0, bounds.right - bounds.left);
  const constrainedWidth =
    maxWidthOverride !== null && maxWidthOverride !== undefined
      ? Math.max(0, Math.min(availableWidth, maxWidthOverride))
      : availableWidth;
  const availableHeight = Math.max(0, bounds.bottom - bounds.top);

  if (!entry || !entry.naturalWidth || !entry.naturalHeight) {
    return {
      scale: 1,
      width: entry?.naturalWidth ?? constrainedWidth,
      height: entry?.naturalHeight ?? availableHeight,
      maxWidth: constrainedWidth,
      maxHeight: availableHeight,
    };
  }

  const widthScale =
    entry.naturalWidth > 0
      ? constrainedWidth > 0
        ? constrainedWidth / entry.naturalWidth
        : 0
      : 1;
  const heightScale =
    entry.naturalHeight > 0
      ? availableHeight > 0
        ? availableHeight / entry.naturalHeight
        : 0
      : 1;

  let scale = Math.min(widthScale, heightScale, maxScale);

  if (targetHeight && entry.naturalHeight > 0) {
    const matchScale = targetHeight / entry.naturalHeight;
    if (Number.isFinite(matchScale) && matchScale > 0) {
      scale = Math.min(scale, matchScale, maxScale);
    }
  }

  if (!Number.isFinite(scale) || scale <= 0) {
    const fallbackScale = Math.max(widthScale, heightScale, 0);
    scale = Number.isFinite(fallbackScale) ? Math.min(fallbackScale, maxScale) : 0;
  }

  if (!Number.isFinite(scale) || scale < 0) {
    scale = 0;
  }

  return {
    scale,
    width: entry.naturalWidth * scale,
    height: entry.naturalHeight * scale,
    maxWidth: constrainedWidth,
    maxHeight: availableHeight,
  };
}

function computeTabScaleCompression(rect = null) {
  const viewportHeight =
    typeof window !== 'undefined' && typeof window.innerHeight === 'number'
      ? window.innerHeight
      : rect?.height ?? 0;

  if (!(viewportHeight > 0)) {
    return 1;
  }

  const normalizedHeight = Math.min(viewportHeight, 500) / 500;
  const exponent = 4.5;
  const compression = normalizedHeight ** exponent;
  const minCompression = 0.1;

  return clamp(compression, minCompression, 1);
}

function applyTabScaleCompression(metrics, compression) {
  if (!metrics || !(compression > 0)) {
    return metrics;
  }

  return {
    ...metrics,
    scale: metrics.scale * compression,
    width: metrics.width * compression,
    height: metrics.height * compression,
  };
}

function resetQuadrantTabStyles(tabs) {
  return tabs.map((tab) => {
    tab.style.setProperty('--quadrant-tab-scale', '1');
    tab.style.setProperty('--quadrant-tab-translate-x', '0px');
    tab.style.setProperty('--quadrant-tab-translate-y', '0px');
    tab.style.left = '';
    tab.style.right = '';
    tab.style.top = '';
    tab.style.bottom = '';

    const { width: naturalWidth, height: naturalHeight } = tab.getBoundingClientRect();
    return { tab, naturalWidth, naturalHeight };
  });
}

function applyQuadrantTabPositions(tabs, metricsByTab, geometry, alignmentByQuadrant = QUADRANT_ALIGNMENT) {
  const { quadrantBounds, fallbackBounds, canvasLeft, canvasTop, canvasRight } = geometry;

  tabs.forEach((tab) => {
    const quadrant = tab.dataset.quadrant;
    const bounds = quadrantBounds[quadrant] || fallbackBounds;
    const metrics =
      metricsByTab.get(tab) ||
      {
        scale: 1,
        width: 0,
        height: 0,
        maxWidth: Math.max(0, bounds.right - bounds.left),
        maxHeight: Math.max(0, bounds.bottom - bounds.top),
      };
    const alignment = alignmentByQuadrant[quadrant] || alignmentByQuadrant.gati;

    const availableWidth = Number.isFinite(metrics.maxWidth)
      ? metrics.maxWidth
      : Math.max(0, bounds.right - bounds.left);
    const availableHeight = Number.isFinite(metrics.maxHeight)
      ? metrics.maxHeight
      : Math.max(0, bounds.bottom - bounds.top);

    const width = Math.min(metrics.width, availableWidth);
    const height = Math.min(metrics.height, availableHeight);

    let targetLeft = alignment.horizontal === 'right' ? bounds.right - width : bounds.left;
    let targetTop = alignment.vertical === 'bottom' ? bounds.bottom - height : bounds.top;

    targetLeft = clamp(targetLeft, bounds.left, bounds.right - width);
    targetTop = clamp(targetTop, bounds.top, bounds.bottom - height);

    const relativeLeft = targetLeft - canvasLeft;
    const relativeTop = targetTop - canvasTop;
    const relativeRight = canvasRight - (targetLeft + width);

    const maxWidthValue = availableWidth > 0 ? `${availableWidth}px` : 'none';
    const maxHeightValue = availableHeight > 0 ? `${availableHeight}px` : 'none';
    tab.style.setProperty('--quadrant-tab-max-width', maxWidthValue);
    tab.style.setProperty('--quadrant-tab-max-height', maxHeightValue);
    tab.style.setProperty('--quadrant-tab-scale', `${metrics.scale}`);
    tab.style.setProperty('--quadrant-tab-translate-x', '0px');
    tab.style.setProperty('--quadrant-tab-translate-y', '0px');
    tab.style.top = `${relativeTop}px`;
    tab.style.bottom = 'auto';
    if (alignment.horizontal === 'right') {
      tab.style.right = `${relativeRight}px`;
      tab.style.left = 'auto';
      tab.style.transformOrigin = 'top right';
    } else {
      tab.style.left = `${relativeLeft}px`;
      tab.style.right = 'auto';
      tab.style.transformOrigin = 'top left';
    }
  });
}

function updateQuadrantTabSizing(rect) {
  if (!rect) {
    return;
  }

  const geometry = computeQuadrantBounds(rect);
  if (!geometry) {
    return;
  }

  const viewportCompression = computeTabScaleCompression(rect);
  const maxTabWidthRatio = 0.85;
  const resetMeasurements = resetQuadrantTabStyles(quadrantTabs);

  const metricsByTab = new Map();
  const gatiEntry = resetMeasurements.find(({ tab }) => tab.dataset.quadrant === 'gati');
  let gatiTargetHeightRaw = null;

  if (gatiEntry) {
    const gatiBounds = geometry.quadrantBounds.gati || geometry.fallbackBounds;
    const gatiMaxWidth = Math.min(
      Math.max(0, gatiBounds.right - gatiBounds.left),
      Math.max(0, geometry.quadrantWidth * maxTabWidthRatio),
    );
    const gatiRawMetrics = measureTabMetrics(gatiEntry, gatiBounds, {
      maxWidth: gatiMaxWidth,
    });
    const gatiMetrics = applyTabScaleCompression(gatiRawMetrics, viewportCompression);
    metricsByTab.set(gatiEntry.tab, gatiMetrics);
    gatiTargetHeightRaw = gatiRawMetrics.height;
  }

  resetMeasurements.forEach((entry) => {
    if (metricsByTab.has(entry.tab)) {
      return;
    }
    const bounds = geometry.quadrantBounds[entry.tab.dataset.quadrant] || geometry.fallbackBounds;
    const maxWidth = Math.min(
      Math.max(0, bounds.right - bounds.left),
      Math.max(0, geometry.quadrantWidth * maxTabWidthRatio),
    );
    const rawMetrics = measureTabMetrics(entry, bounds, {
      targetHeight: gatiTargetHeightRaw,
      maxWidth,
    });
    const metrics = applyTabScaleCompression(rawMetrics, viewportCompression);
    metricsByTab.set(entry.tab, metrics);
  });

  applyQuadrantTabPositions(quadrantTabs, metricsByTab, geometry);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  updateQuadrantTabSizing(rect);
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

const QUADRANT_VERTICAL_SHIFT_RATIO = 0.12;
const QUADRANT_CENTER_MIN_RATIO = 0.35;
const QUADRANT_CENTER_MAX_RATIO = 0.88;

function getQuadrantMetrics(quadrant) {
  const offsets = getOffsetsFromQuadrant(quadrant);
  const { offsetX, offsetY, width, height } = offsets;
  const baseCenterX = offsetX + width / 2;
  const baseCenterY = offsetY + height / 2;
  if (!(width > 0) || !(height > 0)) {
    return {
      ...offsets,
      center: { x: baseCenterX, y: baseCenterY },
      verticalShift: 0,
    };
  }
  const desiredCenterY = baseCenterY + height * QUADRANT_VERTICAL_SHIFT_RATIO;
  const minCenterY = offsetY + height * QUADRANT_CENTER_MIN_RATIO;
  const maxCenterY = offsetY + height * QUADRANT_CENTER_MAX_RATIO;
  const centerY = clamp(desiredCenterY, minCenterY, maxCenterY);
  return {
    ...offsets,
    center: { x: baseCenterX, y: centerY },
    verticalShift: centerY - baseCenterY,
  };
}

function getLinePoints(quadrant, margin = 0.18) {
  const { offsetX, width, center } = getQuadrantMetrics(quadrant);
  const paddingX = width * margin;
  const x1 = offsetX + paddingX;
  const x2 = offsetX + width - paddingX;
  return [
    { x: x1, y: center.y },
    { x: x2, y: center.y },
  ];
}

function getPolygonPoints(quadrant, sides, options = {}) {
  const { offsetX, offsetY, width, height, center } = getQuadrantMetrics(quadrant);
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

function getCircleGeometry(quadrant) {
  const { width, height, center } = getQuadrantMetrics(quadrant);
  const radius = Math.min(width, height) * 0.32;
  const top = { x: center.x, y: center.y - radius };
  return { center, radius, top };
}

function drawCircle(point, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(6, canvas.width * 0.006), 0, Math.PI * 2);
  ctx.fill();
}

function drawEventMarker(point, strokeColor, fillColor, radius, options = {}) {
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

function renderEventMarkers(eventPoints, options) {
  const { strokeColor, color, firstEventColor, eventRadius, highlightFirstEvent } = options;
  eventPoints.forEach((pt, index) => {
    const isFirst = index === 0;
    const fillColor = highlightFirstEvent && isFirst ? firstEventColor : color;
    drawEventMarker(pt, strokeColor, fillColor, eventRadius, {
      highlight: !!highlightFirstEvent && isFirst,
    });
  });
}

function renderLineShape(config, elapsed, shared) {
  const [start, end] = getLinePoints(config.orientation);
  drawLine(start, end);

  const eventPoints = getLineSoundPoints(start, end, config, config.soundMarkers);
  renderEventMarkers(eventPoints, {
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
  drawCircle(point, shared.color);
}

function renderPolygonShape(config, elapsed, shared) {
  const { points } = getPolygonPoints(config.orientation, config.sides);
  drawPolygon(points);

  const eventPoints = getPolygonSoundPoints(points, config.soundMarkers);
  renderEventMarkers(eventPoints, {
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
  drawCircle(point, shared.color);
}

function renderCircleShape(config, elapsed, shared) {
  const { center, radius, top } = getCircleGeometry(config.orientation);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  renderEventMarkers([top], {
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
  drawCircle(point, shared.color);
}

function drawQuadrantShape(name, config, elapsed) {
  ctx.strokeStyle = getStrokeColor(name);
  ctx.lineWidth = 3;
  const shared = {
    strokeColor: ctx.strokeStyle,
    color: getSegmentColor(name),
    firstEventColor: getFirstSoundMarkerColor(name),
    eventRadius: ctx.lineWidth * 2,
  };

  if (config.shape === 'line') {
    renderLineShape(config, elapsed, shared);
  } else if (config.shape === 'polygon') {
    renderPolygonShape(config, elapsed, shared);
  } else if (config.shape === 'circle') {
    renderCircleShape(config, elapsed, shared);
  }
}

function projectPointToIsometric(point, baseCenter, origin, scale, height = 0) {
  const dx = (point.x - baseCenter.x) * scale;
  const dy = (point.y - baseCenter.y) * scale;
  const x = origin.x + dx - dy;
  const y = origin.y + (dx + dy) * 0.5 - height;
  return { x, y };
}

function projectPointIso3d(point, origin, scale, verticalScale = 1) {
  const scaledX = point.x * scale;
  const scaledZ = point.z * scale;
  const scaledY = point.y * verticalScale;
  return {
    x: origin.x + scaledX - scaledZ,
    y: origin.y + (scaledX + scaledZ) * 0.5 - scaledY,
  };
}

function buildJatiCrossSection(view2d, radius) {
  if (!view2d) {
    return { points: [], minY: 0, maxY: 0 };
  }

  const normalizePoints = (points) => {
    if (!points.length) {
      return { points: [], minY: 0, maxY: 0 };
    }
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    points.forEach((point) => {
      if (point.y < minY) {
        minY = point.y;
      }
      if (point.y > maxY) {
        maxY = point.y;
      }
    });
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return { points, minY: 0, maxY: 0 };
    }
    const midY = (minY + maxY) / 2;
    const normalized = points.map((point) => ({ x: point.x, y: point.y - midY }));
    return { points: normalized, minY: minY - midY, maxY: maxY - midY };
  };

  if (view2d.shape === 'circle') {
    const segments = 32;
    const points = [];
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    }
    return normalizePoints(points);
  }

  if (view2d.shape === 'line') {
    const halfLength = radius;
    const thickness = Math.max(radius * 0.28, 6);
    return normalizePoints([
      { x: -halfLength, y: -thickness },
      { x: halfLength, y: -thickness },
      { x: halfLength, y: thickness },
      { x: -halfLength, y: thickness },
    ]);
  }

  if (view2d.shape === 'polygon') {
    const sides = Math.max(3, view2d.sides || 3);
    const points = [];
    const rotation = -Math.PI / 2;
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i * 2 * Math.PI) / sides;
      points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    }
    return normalizePoints(points);
  }

  return { points: [], minY: 0, maxY: 0 };
}

function drawGatiQuadrant3d(config, elapsed) {
  const { orientation, view2d, cycleDuration } = config;
  if (!view2d) {
    return;
  }

  const { offsetX, offsetY, width, height, center } =
    getQuadrantMetrics(orientation);
  const baseCenter = center;
  const isoOrigin = {
    x: offsetX + width * 0.54,
    y: clamp(baseCenter.y + height * 0.22, offsetY, offsetY + height),
  };
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

function drawJatiQuadrant3dBeta(config, elapsed) {
  const { orientation, view2d, cycleDuration, gatiCount: rawGatiCount = 1 } = config;
  if (!view2d) {
    return;
  }

  const { offsetX, offsetY, width, height, center, verticalShift } =
    getQuadrantMetrics(orientation);
  const origin = {
    x: offsetX + width * 0.54,
    y: clamp(offsetY + height * 0.68 + verticalShift, offsetY, offsetY + height),
  };
  const baseRadius = Math.min(width, height) * 0.22;
  const shapeRadius = baseRadius * 0.55;
  const crossSectionData = buildJatiCrossSection(view2d, shapeRadius);
  const shapePoints = crossSectionData.points;
  if (shapePoints.length < 2) {
    return;
  }

  const strokeColor = getStrokeColor('jati');
  const segmentColor = getSegmentColor('jati');
  const scale = 1;
  const verticalScale = 0.9;
  const baseLift = crossSectionData.maxY;
  const isLineShape = view2d.shape === 'line';
  const isCircleShape = view2d.shape === 'circle';
  const minLocalX = shapePoints.reduce(
    (minX, point) => (point.x < minX ? point.x : minX),
    Number.POSITIVE_INFINITY,
  );
  const maxLocalX = shapePoints.reduce(
    (maxX, point) => (point.x > maxX ? point.x : maxX),
    Number.NEGATIVE_INFINITY,
  );
  const gatiCount = Math.max(1, Math.floor(rawGatiCount) || 1);
  const copyCount = gatiCount;
  const showFullScene = true;

  const segmentDuration = view2d.segmentDuration || 0;
  const cycleSegments = view2d.segmentCount || 1;
  const fallbackCycle = segmentDuration * Math.max(1, cycleSegments);
  const copyCycle = cycleDuration > 0 ? cycleDuration : fallbackCycle;
  const totalCycle = copyCycle > 0 ? copyCycle * copyCount : 0;

  let activeCopyIndex = 0;
  let copyElapsed = 0;
  if (copyCycle > 0 && totalCycle > 0) {
    const wrapped = ((elapsed % totalCycle) + totalCycle) % totalCycle;
    activeCopyIndex = Math.floor(wrapped / copyCycle) % copyCount;
    copyElapsed = wrapped - activeCopyIndex * copyCycle;
  }

  const baseAngle = -Math.PI / 2;
  const angleStep = copyCount > 0 ? (Math.PI * 2) / copyCount : 0;

  const innerPointIndex = shapePoints.reduce(
    (bestIndex, point, index) => (point.x < shapePoints[bestIndex].x ? index : bestIndex),
    0,
  );
  const epsilon = 1e-6;
  const innerPointLocalX = shapePoints[innerPointIndex]?.x ?? 0;
  const innerPointCandidates = shapePoints
    .map((pt, index) => ({ pt, index }))
    .filter(({ pt }) => Math.abs(pt.x - innerPointLocalX) < epsilon);

  const primaryInnerCandidate = (() => {
    if (!innerPointCandidates.length) {
      return null;
    }
    const directMatch = innerPointCandidates.find(({ index }) => index === innerPointIndex);
    if (directMatch) {
      return directMatch;
    }
    return innerPointCandidates.reduce((best, candidate) =>
      candidate.pt.y > best.pt.y ? candidate : best,
    innerPointCandidates[0]);
  })();

  const referenceInnerPoint = primaryInnerCandidate?.pt ?? shapePoints[innerPointIndex] ?? {
    x: innerPointLocalX,
    y: 0,
  };
  const referenceInnerIndex = primaryInnerCandidate?.index ?? innerPointIndex;

  const soundCircleRadius = baseRadius + innerPointLocalX;
  const soundWorldPoint = {
    x: soundCircleRadius * Math.cos(baseAngle),
    y: baseLift - referenceInnerPoint.y,
    z: soundCircleRadius * Math.sin(baseAngle),
  };
  let soundIsoPoint = projectPointIso3d(soundWorldPoint, origin, scale, verticalScale);

  const baseMarkerRadius = Math.max(4, canvas.width * 0.0046);

  const drawMarker = (point, options = {}) => {
    const {
      color = segmentColor,
      stroke = strokeColor,
      baseOpacity = 0.25,
      radius = baseMarkerRadius,
    } = options;
    ctx.save();
    if (baseOpacity > 0) {
      ctx.globalAlpha = baseOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, radius * 0.35);
    ctx.stroke();
    ctx.restore();
  };

  const copyInfos = Array.from({ length: copyCount }, (_, index) => {
    const angle = baseAngle + angleStep * index;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const basePoint = { x: cos * baseRadius, y: 0, z: sin * baseRadius };
    const isoBase = projectPointIso3d(basePoint, origin, scale, verticalScale);

    const points = shapePoints.map((pt, pointIndex) => {
      const radialDistance = baseRadius + pt.x;
      const worldPoint = {
        x: radialDistance * cos,
        y: baseLift - pt.y,
        z: radialDistance * sin,
      };
      const isoPoint = projectPointIso3d(worldPoint, origin, scale, verticalScale);
      return {
        pointIndex,
        local: pt,
        world: worldPoint,
        iso: isoPoint,
      };
    });

    const innerPointIsos = points.filter((pt) => Math.abs(pt.local.x - innerPointLocalX) < epsilon);
    let referenceIso = null;
    const directReference = points.find((pt) => pt.pointIndex === referenceInnerIndex);
    if (directReference) {
      referenceIso = directReference.iso;
    } else if (innerPointIsos.length > 0) {
      const sum = innerPointIsos.reduce(
        (acc, pt) => ({ x: acc.x + pt.iso.x, y: acc.y + pt.iso.y }),
        { x: 0, y: 0 },
      );
      referenceIso = { x: sum.x / innerPointIsos.length, y: sum.y / innerPointIsos.length };
    } else if (points[innerPointIndex]) {
      referenceIso = points[innerPointIndex].iso;
    }

    const offset = referenceIso
      ? {
          x: soundIsoPoint.x - referenceIso.x,
          y: soundIsoPoint.y - referenceIso.y,
        }
      : { x: 0, y: 0 };

    const translatedPoints = points.map((pt) => ({
      ...pt,
      iso: { x: pt.iso.x + offset.x, y: pt.iso.y + offset.y },
    }));
    const translatedIsoBase = { x: isoBase.x + offset.x, y: isoBase.y + offset.y };

    const pointCount = translatedPoints.length;
    const pathIsoPoints = [];
    for (let i = 0; i <= pointCount; i += 1) {
      const point = translatedPoints[(innerPointIndex + i) % pointCount];
      pathIsoPoints.push(point.iso);
    }

    const pathSegmentLengths = [];
    let pathTotalLength = 0;
    for (let i = 0; i < pathIsoPoints.length - 1; i += 1) {
      const from = pathIsoPoints[i];
      const to = pathIsoPoints[i + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      pathSegmentLengths.push(length);
      pathTotalLength += length;
    }

    const radialTarget = translatedPoints.reduce((best, pt) => {
      const bestDist = Math.hypot(best.iso.x - soundIsoPoint.x, best.iso.y - soundIsoPoint.y);
      const dist = Math.hypot(pt.iso.x - soundIsoPoint.x, pt.iso.y - soundIsoPoint.y);
      return dist > bestDist ? pt : best;
    }, translatedPoints[0]);

    let lineSegment = null;
    if (isLineShape && Number.isFinite(minLocalX) && Number.isFinite(maxLocalX)) {
      const epsilon = 1e-6;
      const startCandidates = translatedPoints.filter(
        (pt) => Math.abs(pt.local.x - minLocalX) < epsilon,
      );
      const endCandidates = translatedPoints.filter(
        (pt) => Math.abs(pt.local.x - maxLocalX) < epsilon,
      );
      const averageIso = (candidates) => {
        if (!candidates.length) {
          return null;
        }
        const sum = candidates.reduce(
          (acc, pt) => ({ x: acc.x + pt.iso.x, y: acc.y + pt.iso.y }),
          { x: 0, y: 0 },
        );
        return { x: sum.x / candidates.length, y: sum.y / candidates.length };
      };
      const isoStart = averageIso(startCandidates);
      const isoEnd = averageIso(endCandidates);
      if (isoStart && isoEnd) {
        const lineLength = Math.hypot(isoEnd.x - isoStart.x, isoEnd.y - isoStart.y);
        lineSegment = { start: isoStart, end: isoEnd, length: lineLength };
      }
    }

    if (lineSegment) {
      return {
        index,
        angle,
        cos,
        sin,
        depth: basePoint.z,
        facing: cos >= 0,
        isoBase: translatedIsoBase,
        points: translatedPoints,
        pathIsoPoints: [lineSegment.start, lineSegment.end],
        pathSegmentLengths: [lineSegment.length],
        pathTotalLength: lineSegment.length,
        radialIso: lineSegment.end || translatedIsoBase,
        lineSegment,
      };
    }

    return {
      index,
      angle,
      cos,
      sin,
      depth: basePoint.z,
      facing: cos >= 0,
      isoBase: translatedIsoBase,
      points: translatedPoints,
      pathIsoPoints,
      pathSegmentLengths,
      pathTotalLength,
      radialIso: radialTarget?.iso || translatedIsoBase,
      lineSegment: null,
    };
  });

  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const includePointInBounds = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    if (point.x < bounds.minX) bounds.minX = point.x;
    if (point.y < bounds.minY) bounds.minY = point.y;
    if (point.x > bounds.maxX) bounds.maxX = point.x;
    if (point.y > bounds.maxY) bounds.maxY = point.y;
  };

  includePointInBounds(soundIsoPoint);
  copyInfos.forEach((info) => {
    includePointInBounds(info.isoBase);
    includePointInBounds(info.radialIso);
    info.pathIsoPoints.forEach(includePointInBounds);
    info.points.forEach((pt) => includePointInBounds(pt.iso));
    if (info.lineSegment) {
      includePointInBounds(info.lineSegment.start);
      includePointInBounds(info.lineSegment.end);
    }
  });

  if (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  ) {
    const currentCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const targetCenter = center;
    const shift = {
      x: targetCenter.x - currentCenter.x,
      y: targetCenter.y - currentCenter.y,
    };

    if (Math.abs(shift.x) > 1e-6 || Math.abs(shift.y) > 1e-6) {
      const translatePoint = (point) =>
        point
          ? {
              x: point.x + shift.x,
              y: point.y + shift.y,
            }
          : point;

      soundIsoPoint = translatePoint(soundIsoPoint);
      copyInfos.forEach((info) => {
        info.isoBase = translatePoint(info.isoBase);
        info.radialIso = translatePoint(info.radialIso);
        info.pathIsoPoints = info.pathIsoPoints.map(translatePoint);
        info.points = info.points.map((pt) => ({
          ...pt,
          iso: translatePoint(pt.iso),
        }));
        if (info.lineSegment) {
          info.lineSegment = {
            ...info.lineSegment,
            start: translatePoint(info.lineSegment.start),
            end: translatePoint(info.lineSegment.end),
          };
        }
      });
    }
  }

  const drawInfos = [...copyInfos].sort((a, b) => a.depth - b.depth);

  const drawShape = (info, options = {}) => {
    const { activeCopyIndex: activeIndex } = options;
    const isoPoints = info.points.map((pt) => pt.iso);
    if (!isoPoints.length) {
      return;
    }
    const isActive = info.index === activeIndex;
    const frontShade = info.facing ? 0.26 : 0.14;
    const baseAlpha = showFullScene ? frontShade : frontShade + 0.12;
    const strokeAlpha = isActive ? 0.9 : info.facing ? 0.65 : 0.4;
    const highlightFirstCopy = info.index === 0;
    const highlightStrokeStyle = 'rgba(255, 255, 255, 0.23)';
    const highlightLineWidth = Math.max(0.7, canvas.width * 0.001);
    if (isLineShape && info.lineSegment) {
      ctx.save();
      ctx.strokeStyle = `rgba(93, 42, 44, ${strokeAlpha})`;
      ctx.lineWidth = Math.max(1.8, canvas.width * (isActive ? 0.0028 : 0.002));
      ctx.beginPath();
      ctx.moveTo(info.lineSegment.start.x, info.lineSegment.start.y);
      ctx.lineTo(info.lineSegment.end.x, info.lineSegment.end.y);
      ctx.stroke();
      if (highlightFirstCopy) {
        ctx.strokeStyle = highlightStrokeStyle;
        ctx.lineWidth = highlightLineWidth;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (isCircleShape) {
      ctx.save();
      ctx.strokeStyle = `rgba(93, 42, 44, ${strokeAlpha})`;
      ctx.lineWidth = Math.max(1.8, canvas.width * (isActive ? 0.0026 : 0.0019));
      ctx.beginPath();
      ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
      for (let i = 1; i < isoPoints.length; i += 1) {
        ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      if (highlightFirstCopy) {
        ctx.strokeStyle = highlightStrokeStyle;
        ctx.lineWidth = highlightLineWidth;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
    for (let i = 1; i < isoPoints.length; i += 1) {
      ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(231, 111, 81, ${Math.min(0.85, baseAlpha + (isActive ? 0.18 : 0))})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(93, 42, 44, ${strokeAlpha})`;
    ctx.lineWidth = Math.max(1.6, canvas.width * (isActive ? 0.0024 : 0.0016));
    ctx.stroke();
    if (highlightFirstCopy) {
      ctx.strokeStyle = highlightStrokeStyle;
      ctx.lineWidth = highlightLineWidth;
      ctx.stroke();
    }
    ctx.restore();
  };

  let movingIsoPoint = null;
  if (copyCycle > 0 && copyInfos[activeCopyIndex]) {
    const info = copyInfos[activeCopyIndex];
    const totalLength = info.pathTotalLength;
    const segmentDuration = view2d.segmentDuration || 0;
    if (view2d.bounce && info.lineSegment && segmentDuration > 0) {
      const bounceCycle = segmentDuration * 2;
      const local = bounceCycle > 0 ? copyElapsed % bounceCycle : 0;
      const phase = bounceCycle > 0 ? Math.floor(local / segmentDuration) : 0;
      const t = segmentDuration > 0 ? (local - phase * segmentDuration) / segmentDuration : 0;
      const fromPoint = phase % 2 === 0 ? info.lineSegment.start : info.lineSegment.end;
      const toPoint = phase % 2 === 0 ? info.lineSegment.end : info.lineSegment.start;
      movingIsoPoint = {
        x: fromPoint.x + (toPoint.x - fromPoint.x) * t,
        y: fromPoint.y + (toPoint.y - fromPoint.y) * t,
      };
    } else if (totalLength > 0) {
      const progress = copyElapsed / copyCycle;
      let distance = Math.max(0, Math.min(1, progress)) * totalLength;
      for (let i = 0; i < info.pathSegmentLengths.length; i += 1) {
        const length = info.pathSegmentLengths[i];
        const from = info.pathIsoPoints[i];
        const to = info.pathIsoPoints[i + 1];
        if (!(length > 0)) {
          continue;
        }
        if (distance <= length) {
          const tSegment = distance / length;
          movingIsoPoint = {
            x: from.x + (to.x - from.x) * tSegment,
            y: from.y + (to.y - from.y) * tSegment,
          };
          break;
        }
        distance -= length;
      }
      if (!movingIsoPoint) {
        const last = info.pathIsoPoints[info.pathIsoPoints.length - 1];
        movingIsoPoint = last || info.pathIsoPoints[0];
      }
    }
  }

  if (!movingIsoPoint && copyInfos[0]) {
    movingIsoPoint = copyInfos[0].pathIsoPoints[0];
  }

  drawInfos.forEach((info) => {
    const shouldDraw = showFullScene || info.index === activeCopyIndex;
    if (!shouldDraw) {
      return;
    }
    drawShape(info, { activeCopyIndex });
  });

  if (movingIsoPoint) {
    drawMarker(movingIsoPoint, {
      radius: baseMarkerRadius * 1.1,
      baseOpacity: 0.32,
    });
  }

  drawMarker(soundIsoPoint, {
    color: 'rgba(255, 255, 255, 0.85)',
    stroke: 'rgba(255, 255, 255, 0.9)',
    baseOpacity: 0.18,
    radius: baseMarkerRadius * 0.75,
  });
}

function drawNadaiQuadrant3d(config, elapsed) {
  const { orientation, view2d, cycleDuration, gatiCount: rawGatiCount = 1 } = config;
  if (!view2d) {
    return;
  }

  const { offsetX, offsetY, width, height, center, verticalShift } =
    getQuadrantMetrics(orientation);
  const origin = {
    x: offsetX + width * 0.54,
    y: clamp(offsetY + height * 0.68 + verticalShift, offsetY, offsetY + height),
  };
  const baseRadius = Math.min(width, height) * 0.22;
  const shapeRadius = baseRadius * 0.55;
  const crossSectionData = buildJatiCrossSection(view2d, shapeRadius);
  const shapePoints = crossSectionData.points;
  if (shapePoints.length < 2) {
    return;
  }

  const strokeColor = getStrokeColor('nadai');
  const segmentColor = getSegmentColor('nadai');
  const scale = 1;
  const verticalScale = 0.9;
  const baseLift = crossSectionData.maxY;
  const isLineShape = view2d.shape === 'line';
  const isCircleShape = view2d.shape === 'circle';
  const minLocalX = shapePoints.reduce(
    (minX, point) => (point.x < minX ? point.x : minX),
    Number.POSITIVE_INFINITY,
  );
  const maxLocalX = shapePoints.reduce(
    (maxX, point) => (point.x > maxX ? point.x : maxX),
    Number.NEGATIVE_INFINITY,
  );
  const gatiCount = Math.max(1, Math.floor(rawGatiCount) || 1);
  const copyCount = gatiCount;
  const showFullScene = true;

  const segmentDuration = view2d.segmentDuration || 0;
  const cycleSegments = view2d.segmentCount || 1;
  const fallbackCycle = segmentDuration * Math.max(1, cycleSegments);
  const copyCycle = fallbackCycle > 0 ? fallbackCycle : cycleDuration > 0 ? cycleDuration : 0;
  const totalCycle = copyCycle > 0 ? copyCycle * copyCount : 0;

  let activeCopyIndex = 0;
  let copyElapsed = 0;
  if (copyCycle > 0 && totalCycle > 0) {
    const wrapped = ((elapsed % totalCycle) + totalCycle) % totalCycle;
    activeCopyIndex = Math.floor(wrapped / copyCycle) % copyCount;
    copyElapsed = wrapped - activeCopyIndex * copyCycle;
  }

  const baseAngle = -Math.PI / 2;
  const angleStep = copyCount > 0 ? (Math.PI * 2) / copyCount : 0;

  const innerPointIndex = shapePoints.reduce(
    (bestIndex, point, index) => (point.x < shapePoints[bestIndex].x ? index : bestIndex),
    0,
  );
  const epsilon = 1e-6;
  const innerPointLocalX = shapePoints[innerPointIndex]?.x ?? 0;
  const innerPointCandidates = shapePoints
    .map((pt, index) => ({ pt, index }))
    .filter(({ pt }) => Math.abs(pt.x - innerPointLocalX) < epsilon);

  const primaryInnerCandidate = (() => {
    if (!innerPointCandidates.length) {
      return null;
    }
    const directMatch = innerPointCandidates.find(({ index }) => index === innerPointIndex);
    if (directMatch) {
      return directMatch;
    }
    return innerPointCandidates.reduce((best, candidate) =>
      candidate.pt.y > best.pt.y ? candidate : best,
    innerPointCandidates[0]);
  })();

  const referenceInnerPoint = primaryInnerCandidate?.pt ?? shapePoints[innerPointIndex] ?? {
    x: innerPointLocalX,
    y: 0,
  };
  const referenceInnerIndex = primaryInnerCandidate?.index ?? innerPointIndex;

  const soundCircleRadius = baseRadius + innerPointLocalX;
  const soundWorldPoint = {
    x: soundCircleRadius * Math.cos(baseAngle),
    y: baseLift - referenceInnerPoint.y,
    z: soundCircleRadius * Math.sin(baseAngle),
  };
  let soundIsoPoint = projectPointIso3d(soundWorldPoint, origin, scale, verticalScale);

  const baseMarkerRadius = Math.max(4, canvas.width * 0.0046);

  const drawMarker = (point, options = {}) => {
    const {
      color = segmentColor,
      stroke = strokeColor,
      baseOpacity = 0.25,
      radius = baseMarkerRadius,
    } = options;
    ctx.save();
    if (baseOpacity > 0) {
      ctx.globalAlpha = baseOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, radius * 0.35);
    ctx.stroke();
    ctx.restore();
  };

  const copyInfos = Array.from({ length: copyCount }, (_, index) => {
    const angle = baseAngle + angleStep * index;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const basePoint = { x: cos * baseRadius, y: 0, z: sin * baseRadius };
    const isoBase = projectPointIso3d(basePoint, origin, scale, verticalScale);

    const points = shapePoints.map((pt, pointIndex) => {
      const radialDistance = baseRadius + pt.x;
      const worldPoint = {
        x: radialDistance * cos,
        y: baseLift - pt.y,
        z: radialDistance * sin,
      };
      const isoPoint = projectPointIso3d(worldPoint, origin, scale, verticalScale);
      return {
        pointIndex,
        local: pt,
        world: worldPoint,
        iso: isoPoint,
      };
    });

    const innerPointIsos = points.filter((pt) => Math.abs(pt.local.x - innerPointLocalX) < epsilon);
    let referenceIso = null;
    const directReference = points.find((pt) => pt.pointIndex === referenceInnerIndex);
    if (directReference) {
      referenceIso = directReference.iso;
    } else if (innerPointIsos.length > 0) {
      const sum = innerPointIsos.reduce(
        (acc, pt) => ({ x: acc.x + pt.iso.x, y: acc.y + pt.iso.y }),
        { x: 0, y: 0 },
      );
      referenceIso = { x: sum.x / innerPointIsos.length, y: sum.y / innerPointIsos.length };
    } else if (points[innerPointIndex]) {
      referenceIso = points[innerPointIndex].iso;
    }

    const offset = referenceIso
      ? {
          x: soundIsoPoint.x - referenceIso.x,
          y: soundIsoPoint.y - referenceIso.y,
        }
      : { x: 0, y: 0 };

    const translatedPoints = points.map((pt) => ({
      ...pt,
      iso: { x: pt.iso.x + offset.x, y: pt.iso.y + offset.y },
    }));
    const translatedIsoBase = { x: isoBase.x + offset.x, y: isoBase.y + offset.y };

    const pointCount = translatedPoints.length;
    const pathIsoPoints = [];
    for (let i = 0; i <= pointCount; i += 1) {
      const point = translatedPoints[(innerPointIndex + i) % pointCount];
      pathIsoPoints.push(point.iso);
    }

    const pathSegmentLengths = [];
    let pathTotalLength = 0;
    for (let i = 0; i < pathIsoPoints.length - 1; i += 1) {
      const from = pathIsoPoints[i];
      const to = pathIsoPoints[i + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      pathSegmentLengths.push(length);
      pathTotalLength += length;
    }

    const radialTarget = translatedPoints.reduce((best, pt) => {
      const bestDist = Math.hypot(best.iso.x - soundIsoPoint.x, best.iso.y - soundIsoPoint.y);
      const dist = Math.hypot(pt.iso.x - soundIsoPoint.x, pt.iso.y - soundIsoPoint.y);
      return dist > bestDist ? pt : best;
    }, translatedPoints[0]);

    let lineSegment = null;
    if (isLineShape && Number.isFinite(minLocalX) && Number.isFinite(maxLocalX)) {
      const epsilon = 1e-6;
      const startCandidates = translatedPoints.filter(
        (pt) => Math.abs(pt.local.x - minLocalX) < epsilon,
      );
      const endCandidates = translatedPoints.filter(
        (pt) => Math.abs(pt.local.x - maxLocalX) < epsilon,
      );
      const averageIso = (candidates) => {
        if (!candidates.length) {
          return null;
        }
        const sum = candidates.reduce(
          (acc, pt) => ({ x: acc.x + pt.iso.x, y: acc.y + pt.iso.y }),
          { x: 0, y: 0 },
        );
        return { x: sum.x / candidates.length, y: sum.y / candidates.length };
      };
      const isoStart = averageIso(startCandidates);
      const isoEnd = averageIso(endCandidates);
      if (isoStart && isoEnd) {
        const lineLength = Math.hypot(isoEnd.x - isoStart.x, isoEnd.y - isoStart.y);
        lineSegment = { start: isoStart, end: isoEnd, length: lineLength };
      }
    }

    if (lineSegment) {
      return {
        index,
        angle,
        cos,
        sin,
        depth: basePoint.z,
        facing: cos >= 0,
        isoBase: translatedIsoBase,
        points: translatedPoints,
        pathIsoPoints: [lineSegment.start, lineSegment.end],
        pathSegmentLengths: [lineSegment.length],
        pathTotalLength: lineSegment.length,
        radialIso: lineSegment.end || translatedIsoBase,
        lineSegment,
      };
    }

    return {
      index,
      angle,
      cos,
      sin,
      depth: basePoint.z,
      facing: cos >= 0,
      isoBase: translatedIsoBase,
      points: translatedPoints,
      pathIsoPoints,
      pathSegmentLengths,
      pathTotalLength,
      radialIso: radialTarget?.iso || translatedIsoBase,
      lineSegment: null,
    };
  });

  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const includePointInBounds = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    if (point.x < bounds.minX) bounds.minX = point.x;
    if (point.y < bounds.minY) bounds.minY = point.y;
    if (point.x > bounds.maxX) bounds.maxX = point.x;
    if (point.y > bounds.maxY) bounds.maxY = point.y;
  };

  includePointInBounds(soundIsoPoint);
  copyInfos.forEach((info) => {
    includePointInBounds(info.isoBase);
    includePointInBounds(info.radialIso);
    info.pathIsoPoints.forEach(includePointInBounds);
    info.points.forEach((pt) => includePointInBounds(pt.iso));
    if (info.lineSegment) {
      includePointInBounds(info.lineSegment.start);
      includePointInBounds(info.lineSegment.end);
    }
  });

  if (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  ) {
    const currentCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const targetCenter = center;
    const shift = {
      x: targetCenter.x - currentCenter.x,
      y: targetCenter.y - currentCenter.y,
    };

    if (Math.abs(shift.x) > 1e-6 || Math.abs(shift.y) > 1e-6) {
      const translatePoint = (point) =>
        point
          ? {
              x: point.x + shift.x,
              y: point.y + shift.y,
            }
          : point;

      soundIsoPoint = translatePoint(soundIsoPoint);
      copyInfos.forEach((info) => {
        info.isoBase = translatePoint(info.isoBase);
        info.radialIso = translatePoint(info.radialIso);
        info.pathIsoPoints = info.pathIsoPoints.map(translatePoint);
        info.points = info.points.map((pt) => ({
          ...pt,
          iso: translatePoint(pt.iso),
        }));
        if (info.lineSegment) {
          info.lineSegment = {
            ...info.lineSegment,
            start: translatePoint(info.lineSegment.start),
            end: translatePoint(info.lineSegment.end),
          };
        }
      });
    }
  }

  const drawInfos = [...copyInfos].sort((a, b) => a.depth - b.depth);

  const drawShape = (info, options = {}) => {
    const { activeCopyIndex: activeIndex } = options;
    const isoPoints = info.points.map((pt) => pt.iso);
    if (!isoPoints.length) {
      return;
    }
    const isActive = info.index === activeIndex;
    const frontShade = info.facing ? 0.26 : 0.14;
    const baseAlpha = showFullScene ? frontShade : frontShade + 0.12;
    const strokeAlpha = isActive ? 0.9 : info.facing ? 0.65 : 0.4;
    const highlightFirstCopy = info.index === 0;
    const highlightStrokeStyle = 'rgba(255, 255, 255, 0.23)';
    const highlightLineWidth = Math.max(0.7, canvas.width * 0.001);
    if (isLineShape && info.lineSegment) {
      ctx.save();
      ctx.strokeStyle = `rgba(60, 47, 87, ${strokeAlpha})`;
      ctx.lineWidth = Math.max(1.8, canvas.width * (isActive ? 0.0028 : 0.002));
      ctx.beginPath();
      ctx.moveTo(info.lineSegment.start.x, info.lineSegment.start.y);
      ctx.lineTo(info.lineSegment.end.x, info.lineSegment.end.y);
      ctx.stroke();
      if (highlightFirstCopy) {
        ctx.strokeStyle = highlightStrokeStyle;
        ctx.lineWidth = highlightLineWidth;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (isCircleShape) {
      ctx.save();
      ctx.strokeStyle = `rgba(60, 47, 87, ${strokeAlpha})`;
      ctx.lineWidth = Math.max(1.8, canvas.width * (isActive ? 0.0026 : 0.0019));
      ctx.beginPath();
      ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
      for (let i = 1; i < isoPoints.length; i += 1) {
        ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      if (highlightFirstCopy) {
        ctx.strokeStyle = highlightStrokeStyle;
        ctx.lineWidth = highlightLineWidth;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(isoPoints[0].x, isoPoints[0].y);
    for (let i = 1; i < isoPoints.length; i += 1) {
      ctx.lineTo(isoPoints[i].x, isoPoints[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(156, 106, 222, ${Math.min(0.85, baseAlpha + (isActive ? 0.18 : 0))})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(60, 47, 87, ${strokeAlpha})`;
    ctx.lineWidth = Math.max(1.6, canvas.width * (isActive ? 0.0024 : 0.0016));
    ctx.stroke();
    if (highlightFirstCopy) {
      ctx.strokeStyle = highlightStrokeStyle;
      ctx.lineWidth = highlightLineWidth;
      ctx.stroke();
    }
    ctx.restore();
  };

  let movingIsoPoint = null;
  if (copyCycle > 0 && copyInfos[activeCopyIndex]) {
    const info = copyInfos[activeCopyIndex];
    const totalLength = info.pathTotalLength;
    const segmentDuration = view2d.segmentDuration || 0;
    if (view2d.bounce && info.lineSegment && segmentDuration > 0) {
      const bounceCycle = segmentDuration * 2;
      const local = bounceCycle > 0 ? copyElapsed % bounceCycle : 0;
      const phase = bounceCycle > 0 ? Math.floor(local / segmentDuration) : 0;
      const t = segmentDuration > 0 ? (local - phase * segmentDuration) / segmentDuration : 0;
      const fromPoint = phase % 2 === 0 ? info.lineSegment.start : info.lineSegment.end;
      const toPoint = phase % 2 === 0 ? info.lineSegment.end : info.lineSegment.start;
      movingIsoPoint = {
        x: fromPoint.x + (toPoint.x - fromPoint.x) * t,
        y: fromPoint.y + (toPoint.y - fromPoint.y) * t,
      };
    } else if (totalLength > 0) {
      const progress = copyElapsed / copyCycle;
      let distance = Math.max(0, Math.min(1, progress)) * totalLength;
      for (let i = 0; i < info.pathSegmentLengths.length; i += 1) {
        const length = info.pathSegmentLengths[i];
        const from = info.pathIsoPoints[i];
        const to = info.pathIsoPoints[i + 1];
        if (!(length > 0)) {
          continue;
        }
        if (distance <= length) {
          const tSegment = distance / length;
          movingIsoPoint = {
            x: from.x + (to.x - from.x) * tSegment,
            y: from.y + (to.y - from.y) * tSegment,
          };
          break;
        }
        distance -= length;
      }
      if (!movingIsoPoint) {
        const last = info.pathIsoPoints[info.pathIsoPoints.length - 1];
        movingIsoPoint = last || info.pathIsoPoints[0];
      }
    }
  }

  if (!movingIsoPoint && copyInfos[0]) {
    movingIsoPoint = copyInfos[0].pathIsoPoints[0];
  }

  drawInfos.forEach((info) => {
    const shouldDraw = showFullScene || info.index === activeCopyIndex;
    if (!shouldDraw) {
      return;
    }
    drawShape(info, { activeCopyIndex });
  });

  if (movingIsoPoint) {
    drawMarker(movingIsoPoint, {
      radius: baseMarkerRadius * 1.1,
      baseOpacity: 0.32,
    });
  }

  drawMarker(soundIsoPoint, {
    color: 'rgba(255, 255, 255, 0.85)',
    stroke: 'rgba(255, 255, 255, 0.9)',
    baseOpacity: 0.18,
    radius: baseMarkerRadius * 0.75,
  });
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

function buildQuadrantConfigs(layaPeriod, gatiCount, jatiCount, nadaiCountInput) {
  const safeLayaPeriod = Number.isFinite(layaPeriod) ? layaPeriod : 0;
  const safeGatiCount = Math.max(1, gatiCount);
  const safeNadaiCount = Math.max(1, Math.floor(nadaiCountInput || 0));

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

  const baseJatiDuration = safeLayaPeriod / safeGatiCount;
  const jatiShape = (() => {
    if (jatiCount === 1) {
      return { shape: 'circle', segmentCount: 1, segmentDuration: baseJatiDuration };
    }
    if (jatiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: baseJatiDuration };
    }
    return {
      shape: 'polygon',
      sides: jatiCount,
      segmentCount: jatiCount,
      segmentDuration: baseJatiDuration,
    };
  })();

  const jatiCycle = (jatiShape.segmentDuration || 0) * (jatiShape.segmentCount || 1);
  const nadaiShape = (() => {
    const baseDuration =
      safeNadaiCount > 0 && jatiCycle > 0 ? jatiCycle / safeNadaiCount : jatiCycle;
    if (safeNadaiCount === 1) {
      return { shape: 'circle', segmentCount: 1, segmentDuration: jatiCycle };
    }
    if (safeNadaiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: baseDuration };
    }
    return {
      shape: 'polygon',
      sides: safeNadaiCount,
      segmentCount: safeNadaiCount,
      segmentDuration: baseDuration,
    };
  })();

  const gatiCycle = (gatiShape.segmentDuration || 0) * (gatiShape.segmentCount || 1);
  const nadaiCycle = jatiCycle;

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
        highlightFirstEvent: true,
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
        soundMarkers: { mode: 'count', count: safeNadaiCount },
        highlightFirstEvent: true,
      },
      gatiCount: safeGatiCount,
    },
  };
}

function drawQuadrant(name, config, elapsed) {
  if (!config) {
    return;
  }
  const mode = quadrantModes[name] || '2d';
  const { orientation, cycleDuration, view1d, view2d, gatiCount } = config;

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
      drawJatiQuadrant3dBeta({
        orientation,
        view2d,
        cycleDuration,
        gatiCount,
      }, elapsed);
    } else if (name === 'nadai') {
      drawNadaiQuadrant3d({
        orientation,
        view2d,
        cycleDuration,
        gatiCount,
      }, elapsed);
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
  const nadaiCount = Number(sliders.nadai.value);

  const quadrantConfigs = buildQuadrantConfigs(layaPeriod, gatiCount, jatiCount, nadaiCount);

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

function handleModeChange(quadrant, mode) {
  if (!(quadrant in quadrantModes)) {
    return;
  }
  quadrantModes[quadrant] = mode;
}

function handleMuteToggle() {
  updateQuadrantTabSizing(canvas.getBoundingClientRect());
}

function handleSliderInput(name) {
  if (name === 'laya') {
    pausedElapsed = getElapsed();
    if (isPlaying && audioCtx) {
      startTime = audioCtx.currentTime - pausedElapsed;
    }
  }
  resetSchedulers();
}

({ quadrantTabs } = initModeTabs(document, quadrantModes, { onModeChange: handleModeChange }));
({ sliders, valueLabels } = initSliders(document, {
  formatters: { laya: formatLayaValue },
  onInput: handleSliderInput,
}));
({ buttons: muteButtons } = initMuteButtons(document, muteState, {
  onToggle: handleMuteToggle,
}));

updateValueLabels(sliders, valueLabels, { laya: formatLayaValue });
resetSchedulers();
requestAnimationFrame(render);
