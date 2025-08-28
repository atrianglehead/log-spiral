import { PARTIALS, DEFAULT_F0, DEFAULT_MASTER, DEFAULT_TEMPO, PARTIAL_MAX, gains,
         setF0, setMasterUI, setMode, setTempo, updatePartialGain, startAudition,
         stopAudition, smoothStartMix, smoothStartSequence, smoothPauseAll,
         updateRouteForMode, updateMasterAutoScale, isPlaying, getMode, getF0 } from './audio.js';
import { octaveColor } from './drawing.js';

let viewMode = 'spiral';
export const getViewMode = () => viewMode;

let ui, tabContainer, tabSpiral, tabComponents, groupGlobal, groupGrid, playGroup;
let f0Slider, masterSlider, tempoSlider, tempoRow, playBtn;
export const colSliders = [];
const colHzLabels = [];

export function refreshPlayButton() {
  if (!playBtn) return;
  playBtn.html(isPlaying() ? '❚❚' : '▶');
}

export function updateGridUI() {
  const f0 = getF0();
  for (let i = 0; i < PARTIALS; i++) {
    const hz = Math.round((i + 1) * f0);
    colHzLabels[i]?.html(' ' + hz + ' Hz');
  }
}

const makeLabel = (txt) => { const s = createSpan(txt); s.style('color', '#aaa'); s.style('font-weight', 'bold'); return s; };

export function buildUI() {
  ui = createDiv().addClass('ui');

  // View tabs
  tabContainer = createDiv().addClass('view-tabs');
  tabSpiral = createSpan('Spiral View').addClass('view-tab').addClass('active');
  tabComponents = createSpan('Component View').addClass('view-tab');
  tabContainer.child(tabSpiral); tabContainer.child(tabComponents);
  tabSpiral.mousePressed(() => {
    viewMode = 'spiral';
    tabSpiral.addClass('active');
    tabComponents.removeClass('active');
  });
  tabComponents.mousePressed(() => {
    viewMode = 'components';
    tabComponents.addClass('active');
    tabSpiral.removeClass('active');
  });

  // Play group
  playGroup = createDiv().addClass('group');
  playBtn = createButton('▶'); playBtn.addClass('play-btn'); playBtn.attribute('title', 'Play/Pause');
  playGroup.child(playBtn);
  playBtn.mousePressed(() => {
    if (getMode() === 'seq') {
      if (!isPlaying()) smoothStartSequence(); else smoothPauseAll();
    } else {
      if (!isPlaying()) smoothStartMix(); else smoothPauseAll();
    }
    refreshPlayButton();
  });

  // Global settings
  groupGlobal = createDiv().addClass('group');

  const f0Row = createDiv().addClass('control-row');
  f0Row.child(makeLabel('f₀ (Hz):'));
  f0Slider = createSlider(80, 160, DEFAULT_F0, 1); f0Slider.addClass('slider');
  const f0Val = createSpan('').style('color', '#cfcfcf');
  f0Row.child(f0Slider); f0Row.child(f0Val);
  groupGlobal.child(f0Row);
  f0Slider.elt.addEventListener('input', () => {
    setF0(parseInt(f0Slider.value(), 10));
    f0Val.html(' ' + getF0() + ' Hz');
    updateGridUI();
  });

  const masterRow = createDiv().addClass('control-row');
  masterRow.child(makeLabel('Master:'));
  masterSlider = createSlider(0, 100, Math.round(DEFAULT_MASTER * 100), 1); masterSlider.addClass('slider');
  const mVal = createSpan('').style('color', '#cfcfcf');
  masterRow.child(masterSlider); masterRow.child(mVal);
  groupGlobal.child(masterRow);
  masterSlider.elt.addEventListener('input', () => {
    setMasterUI(parseInt(masterSlider.value(), 10) / 100);
    updateMasterAutoScale();
    mVal.html(' ' + Math.round(masterSlider.value()) + '%');
  });

  const modeRow = createDiv().addClass('mode-row');
  const togetherLabel = createSpan('Play Together');
  const modeToggle = createDiv().addClass('mode-toggle');
  const modeKnob = createDiv().addClass('mode-knob');
  modeToggle.child(modeKnob);
  const seqLabel = createSpan('Play Sequentially');
  modeRow.child(togetherLabel);
  modeRow.child(modeToggle);
  modeRow.child(seqLabel);
  groupGlobal.child(modeRow);

  const updateModeToggle = () => {
    const isSeq = getMode() === 'seq';
    if (isSeq) modeToggle.addClass('seq'); else modeToggle.removeClass('seq');
    tempoRow.style('display', isSeq ? 'flex' : 'none');
  };

  modeRow.mousePressed(() => {
    const next = getMode() === 'seq' ? 'mix' : 'seq';
    setMode(next);
    updateModeToggle();
  });

  tempoRow = createDiv().addClass('control-row');
  tempoRow.child(makeLabel('Tempo:'));
  tempoSlider = createSlider(1, 12, DEFAULT_TEMPO, 1); tempoSlider.addClass('slider');
  const tVal = createSpan('').style('color', '#cfcfcf');
  tempoRow.child(tempoSlider); tempoRow.child(tVal);
  groupGlobal.child(tempoRow);
  tempoSlider.elt.addEventListener('input', () => {
    const val = parseInt(tempoSlider.value(), 10);
    setTempo(val);
    tVal.html(' ' + val + ' steps/sec');
  });
  updateModeToggle();

  // Grid of partials
  groupGrid = createDiv().addClass('group').style('width', '100%');
  const grid = createDiv().addClass('hgrid'); groupGrid.child(grid);
  for (let i = 0; i < PARTIALS; i++) {
    const k = i + 1;
    const col = createDiv().addClass('hcol');
    const label = createSpan('' + k);
    const [rCol, gCol, bCol] = octaveColor(k);
    const v = createSlider(0, 100, Math.round((gains[i] / PARTIAL_MAX) * 100), 1); v.addClass('vslider');
    const color = `rgb(${rCol}, ${gCol}, ${bCol})`;
    v.elt.style.setProperty('--accent', color);
    v.elt.style.setProperty('accent-color', color);
    const hz = createSpan('').addClass('hz');
    col.child(label); col.child(v); col.child(hz);
    grid.child(col);
    colSliders[i] = v;
    colHzLabels[i] = hz;

    v.elt.addEventListener('pointerdown', (e) => {
      v.elt.setPointerCapture(e.pointerId);
      startAudition(i);
      updatePartialGain(i, parseInt(v.value(), 10) / 100);
    });
    v.elt.addEventListener('pointermove', () => updatePartialGain(i, parseInt(v.value(), 10) / 100));
    v.elt.addEventListener('input', () => updatePartialGain(i, parseInt(v.value(), 10) / 100));
    v.elt.addEventListener('pointerup', (e) => {
      try { v.elt.releasePointerCapture(e.pointerId); } catch (_) {}
      stopAudition(i);
    });
    v.elt.addEventListener('pointercancel', () => stopAudition(i));
    v.elt.addEventListener('lostpointercapture', () => stopAudition(i));
  }

  // ORDER: Tabs, Play, Global, then Grid
  ui.child(tabContainer);
  ui.child(playGroup);
  ui.child(groupGlobal);
  ui.child(groupGrid);

  // init readouts
  f0Slider.elt.dispatchEvent(new Event('input'));
  masterSlider.elt.dispatchEvent(new Event('input'));
  tempoSlider.elt.dispatchEvent(new Event('input'));

  // Resume audio politely when tab returns
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try { updateMasterAutoScale(); } catch (_) {}
    }
  });
}
