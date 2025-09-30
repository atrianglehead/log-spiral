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

function getPolygonPoints(quadrant, sides) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  const radius = Math.min(width, height) * 0.32;
  const center = { x: offsetX + width / 2, y: offsetY + height / 2 };
  const points = [];
  const rotation = -Math.PI / 2;
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return { center, points };
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
  const eventRadius = ctx.lineWidth;
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
    } else {
      const local = (elapsed % config.segmentDuration) / config.segmentDuration;
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
  }
}

function drawMuteOverlay(quadrant) {
  const { offsetX, offsetY, width, height } = getOffsetsFromQuadrant(quadrant);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
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

  const layaConfig = {
    shape: 'line',
    orientation: 'bottom-left',
    segmentDuration: layaPeriod,
    bounce: false,
    soundMarkers: { mode: 'first' },
  };

  const gatiShape = (() => {
    if (gatiCount === 1) {
      return { shape: 'line', bounce: false, segmentCount: 1, segmentDuration: layaPeriod };
    }
    if (gatiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: layaPeriod / 2 };
    }
    return {
      shape: 'polygon',
      sides: gatiCount,
      segmentCount: gatiCount,
      segmentDuration: layaPeriod / gatiCount,
    };
  })();

  const jatiShape = (() => {
    if (jatiCount === 1) {
      return { shape: 'line', bounce: false, segmentCount: 1, segmentDuration: layaPeriod / Math.max(1, gatiCount) };
    }
    if (jatiCount === 2) {
      return { shape: 'line', bounce: true, segmentCount: 2, segmentDuration: layaPeriod / Math.max(1, gatiCount) };
    }
    return {
      shape: 'polygon',
      sides: jatiCount,
      segmentCount: jatiCount,
      segmentDuration: layaPeriod / Math.max(1, gatiCount),
    };
  })();

  const nadaiShape = (() => {
    const baseDuration = (layaPeriod / Math.max(1, gatiCount)) * (1 / nadaiValue);
    if (jatiCount === 1) {
      return { shape: 'line', bounce: false, segmentCount: 1, segmentDuration: baseDuration };
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

  drawQuadrantShape('laya', { ...layaConfig }, elapsed);
  drawQuadrantShape(
    'gati',
    {
      ...gatiShape,
      orientation: 'top-left',
      soundMarkers: { mode: 'count', count: gatiCount },
    },
    elapsed,
  );
  drawQuadrantShape(
    'jati',
    {
      ...jatiShape,
      orientation: 'top-right',
      soundMarkers: { mode: 'first' },
    },
    elapsed,
  );
  drawQuadrantShape(
    'nadai',
    {
      ...nadaiShape,
      orientation: 'bottom-right',
      soundMarkers: { mode: 'first' },
    },
    elapsed,
  );

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
