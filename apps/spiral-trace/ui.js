import { state, setRotations, restartAndPlay, getFinalAndMax, sliderToSpeed, speedToSlider, FILTER_LIST_MAX } from './state.js';
import { ensureAudio, audioState, resetAudioProgress } from './audio.js';

export let ui;
export let groupVisual, groupAudio, groupPlay;
export let playPauseBtn;
export let inputN, btnApplyN;
export let filterSelect, filterInput;
export let revealSelect;
export let speedLabelSpan, speedSlider, speedValueSpan;
export let pSlider, pValueSpan;
export let volSlider, volValueSpan;

export function buildUI() {
  ui = createDiv();
  ui.addClass('ui');

  const label = (txt) => { const s = createSpan(txt); s.style('color', '#aaa'); s.style('font-weight', 'bold'); s.style('margin-right', '4px'); return s; };

  // VISUAL group
  groupVisual = createDiv(); groupVisual.addClass('group');
  const visTitle = createSpan('Visual'); visTitle.addClass('title'); groupVisual.child(visTitle);

  groupVisual.child(label('N:'));
  inputN = createInput(String(state.rotations_N), 'number'); inputN.style('width', '72px'); groupVisual.child(inputN);
  btnApplyN = createButton('Apply'); groupVisual.child(btnApplyN);

  groupVisual.child(label('k-multiples:'));
  filterSelect = createSelect(); groupVisual.child(filterSelect);
  filterInput = createInput(String(state.kFilter), 'number'); filterInput.style('width', '64px'); groupVisual.child(filterInput);

  groupVisual.child(label('Markers:'));
  revealSelect = createSelect();
  revealSelect.option('Progressive', 'progressive');
  revealSelect.option('All', 'all');
  revealSelect.value(state.revealMode);
  groupVisual.child(revealSelect);

  // Speed row (one line)
  const speedRow = createDiv(); speedRow.addClass('nowrap'); groupVisual.child(speedRow);
  speedLabelSpan = createSpan('Speed:'); speedRow.child(speedLabelSpan);
  speedSlider = createSlider(0, 100, 0, 1); speedSlider.addClass('slider'); speedRow.child(speedSlider);
  speedValueSpan = createSpan(''); speedValueSpan.style('color', '#cfcfcf'); speedRow.child(speedValueSpan);

  ui.child(groupVisual);

  // AUDIO group
  groupAudio = createDiv(); groupAudio.addClass('group');
  const audTitle = createSpan('Audio'); audTitle.addClass('title'); groupAudio.child(audTitle);

  groupAudio.child(label('p (Hz):'));
  pSlider = createSlider(80, 160, audioState.baseP, 1); pSlider.addClass('slider'); groupAudio.child(pSlider);
  pValueSpan = createSpan(''); pValueSpan.style('color', '#cfcfcf'); groupAudio.child(pValueSpan);

  groupAudio.child(label('Vol:'));
  volSlider = createSlider(0, 100, audioState.volumePct, 1); volSlider.addClass('slider'); groupAudio.child(volSlider);
  volValueSpan = createSpan(''); volValueSpan.style('color', '#cfcfcf'); groupAudio.child(volValueSpan);

  ui.child(groupAudio);

  // PLAY group (separate)
  groupPlay = createDiv(); groupPlay.addClass('group playctrl');
  playPauseBtn = createButton('▶'); playPauseBtn.addClass('play-btn'); playPauseBtn.attribute('title', 'Play/Pause');
  groupPlay.child(playPauseBtn);
  ui.child(groupPlay);

  // Position & events
  positionUI();
  window.addEventListener('resize', positionUI);

  playPauseBtn.mousePressed(() => {
    ensureAudio();            // unlock audio on first click
    if (state.finished) {
      restartAndPlay();       // auto-reset & start if finished
    } else {
      state.paused = !state.paused;
    }
    refreshPlayPauseLabel();
  });

  inputN.elt.addEventListener('keydown', e => { if (e.key === 'Enter') applyN(); });
  btnApplyN.mousePressed(applyN);

  filterSelect.changed(() => { const v = parseInt(filterSelect.value(), 10); if (Number.isFinite(v)) state.kFilter = v; });
  filterInput.elt.addEventListener('input', () => {
    const { finalMultipleK } = getFinalAndMax(); const maxK = Math.max(1, Math.floor(finalMultipleK / 2));
    const v = parseInt(filterInput.value(), 10);
    if (Number.isFinite(v) && v >= 1 && v <= maxK) state.kFilter = v;
  });

  revealSelect.changed(() => { state.revealMode = revealSelect.value(); });

  speedSlider.elt.addEventListener('input', () => {
    const t = speedSlider.value() / 100;
    state.dTheta = sliderToSpeed(t);
    updateSpeedLabel();
  });

  window.addEventListener('pointerdown', ensureAudio);

  pSlider.elt.addEventListener('input', () => {
    ensureAudio();
    audioState.baseP = parseInt(pSlider.value(), 10);
    updatePitchLabel();
    if (audioState.baseP * audioState.nextKToFire > 20000) { state.finished = true; state.paused = true; refreshPlayPauseLabel(); }
  });

  volSlider.elt.addEventListener('input', () => {
    ensureAudio();
    audioState.volumePct = parseInt(volSlider.value(), 10);
    if (audioState.masterGain) audioState.masterGain.gain.value = audioState.volumePct / 100;
    updateVolumeLabel();
  });

  // Initialize UI readouts
  refreshSpeedUI();
  refreshPitchUI();
  refreshVolumeUI();
}

function positionUI() {
  const cnv = document.querySelector('canvas'); const r = cnv.getBoundingClientRect(); const pad = 12;
  ui.position(r.left + window.scrollX + pad, r.top + window.scrollY + pad);
  ui.style('max-width', `${r.width - 2 * pad}px`);
}

function applyN() {
  const v = parseFloat(inputN.value());
  if (!Number.isFinite(v)) { inputN.value(String(state.rotations_N)); return; }
  setRotations(v);
  refreshFilterUI();
  resetAudioProgress();
}

export function refreshPlayPauseLabel() {
  if (!playPauseBtn) return;
  playPauseBtn.html(state.paused ? '▶' : '⏸');
  playPauseBtn.attribute('title', state.paused ? 'Play' : 'Pause');
}

export function refreshVisualUI() { inputN.value(String(state.rotations_N)); }

export function refreshFilterUI() {
  const { finalMultipleK } = getFinalAndMax();
  const maxK = Math.max(1, Math.floor(finalMultipleK / 2));
  if (state.kFilter > maxK) state.kFilter = maxK;

  const useSelect = maxK <= FILTER_LIST_MAX;
  if (useSelect) {
    filterSelect.show(); filterInput.hide();
    filterSelect.elt.innerHTML = '';
    for (let k = 1; k <= maxK; k++) filterSelect.option(String(k), String(k));
    filterSelect.value(String(state.kFilter));
  } else {
    filterSelect.hide(); filterInput.show();
    filterInput.attribute('min', '1');
    filterInput.attribute('max', String(maxK));
    filterInput.value(String(state.kFilter));
  }
}

export function refreshRevealUI() { revealSelect.value(state.revealMode); }

export function refreshSpeedUI() { const t = speedToSlider(state.dTheta); speedSlider.value(Math.round(t * 100)); updateSpeedLabel(); }
export function syncSpeedSlider() { const t = speedToSlider(state.dTheta); speedSlider.value(Math.round(t * 100)); updateSpeedLabel(); }
function updateSpeedLabel() { speedValueSpan.html(` ${state.dTheta.toFixed(3)} rad/frame`); }

export function refreshPitchUI() { pSlider.value(audioState.baseP); updatePitchLabel(); }
function updatePitchLabel() { pValueSpan.html(` ${audioState.baseP} Hz`); }
export function refreshVolumeUI() { volSlider.value(audioState.volumePct); updateVolumeLabel(); }
function updateVolumeLabel() { volValueSpan.html(` ${audioState.volumePct}%`); }
