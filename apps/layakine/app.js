import {
  initModeTabs,
  initMuteButtons,
  initSliders,
  updateValueLabels,
} from './uiControls.js';
import { createAudioEngine } from './audioEngine.js';
import { buildQuadrantConfigs } from './render/configBuilder.js';
import { getOffsetsFromQuadrant } from './render/draw2d.js';
import { drawQuadrant as renderQuadrant } from './render/quadrantRenderer.js';

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

const muteState = {
  laya: false,
  gati: false,
  jati: false,
  nadai: false,
};

let audioEngine = null;

const getElapsed = () => (audioEngine ? audioEngine.getElapsed() : 0);

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

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

function formatLayaValue(value) {
  return `${value} bpm`;
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

function drawMuteOverlay(quadrant) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(canvas, quadrant);
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
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(canvas, quadrant);
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

  const renderContext = { ctx, canvas };
  const drawNames = ['laya', 'gati', 'jati', 'nadai'];
  drawNames.forEach((name) => {
    const config = quadrantConfigs[name];
    const mode = quadrantModes[name] ?? '2d';
    const palette = {
      stroke: getStrokeColor(name),
      segment: getSegmentColor(name),
      first: getFirstSoundMarkerColor(name),
    };
    renderQuadrant(renderContext, {
      name,
      mode,
      config,
      elapsed,
      palette,
    });
  });

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
  requestAnimationFrame(render);
}

function togglePlay() {
  if (!audioEngine) {
    return;
  }
  if (audioEngine.isPlaying()) {
    audioEngine.stop();
  } else {
    audioEngine.start();
  }
  playToggle.textContent = audioEngine.isPlaying() ? '⏸' : '▶';
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

function handleMuteToggle(target, nextState) {
  if (audioEngine && target) {
    audioEngine.setMuteState(target, nextState);
  }
  updateQuadrantTabSizing(canvas.getBoundingClientRect());
}

function handleSliderInput(name) {
  if (!audioEngine) {
    return;
  }
  if (name === 'laya') {
    const tempoValue = Number(sliders.laya?.value ?? 120) || 120;
    audioEngine.setTempo(tempoValue);
  }
  audioEngine.setCounts({
    gati: Number(sliders.gati?.value ?? 1) || 1,
    jati: Number(sliders.jati?.value ?? 1) || 1,
    nadai: Number(sliders.nadai?.value ?? 1) || 1,
  });
}

({ quadrantTabs } = initModeTabs(document, quadrantModes, { onModeChange: handleModeChange }));
({ sliders, valueLabels } = initSliders(document, {
  formatters: { laya: formatLayaValue },
  onInput: handleSliderInput,
}));
({ buttons: muteButtons } = initMuteButtons(document, muteState, {
  onToggle: handleMuteToggle,
}));

const initialTempo = Number(sliders.laya?.value ?? 120) || 120;
const initialCounts = {
  gati: Number(sliders.gati?.value ?? 1) || 1,
  jati: Number(sliders.jati?.value ?? 1) || 1,
  nadai: Number(sliders.nadai?.value ?? 1) || 1,
};

audioEngine = createAudioEngine({
  initialTempo,
  initialCounts,
  initialMuteState: { ...muteState },
});

audioEngine.setTempo(initialTempo);
audioEngine.setCounts(initialCounts);

updateValueLabels(sliders, valueLabels, { laya: formatLayaValue });
requestAnimationFrame(render);
