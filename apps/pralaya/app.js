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

const canvas = document.getElementById('pralaya-canvas');
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

function updateQuadrantTabSizing(rect) {
  if (!rect) {
    return;
  }

  const quadrantWidth = rect.width / 2;
  const quadrantHeight = rect.height / 2;
  const tabWidth = quadrantWidth / 5;
  const tabHeight = quadrantHeight / 20;

  quadrantTabs.forEach((tabContainer) => {
    tabContainer.style.setProperty('--quadrant-tab-width', `${tabWidth}px`);
    tabContainer.style.setProperty('--quadrant-tab-height', `${tabHeight}px`);
    const buttons = tabContainer.querySelectorAll('.mode-tab');
    buttons.forEach((button) => {
      button.style.width = `${tabWidth/3}px`;
      button.style.height = `${tabHeight}px`;
    });
  });
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

function updatePlayToggle() {
  const isPlaying = Boolean(audioEngine && audioEngine.isPlaying());
  playToggle.dataset.state = isPlaying ? 'pause' : 'play';
  playToggle.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  playToggle.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
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
  updatePlayToggle();
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
updatePlayToggle();
requestAnimationFrame(render);
