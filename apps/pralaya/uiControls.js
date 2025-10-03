const defaultFormatter = (value) => value;

function normalizeRoot(root) {
  if (root && typeof root.querySelector === 'function') {
    return root;
  }
  return typeof document !== 'undefined' ? document : null;
}

export function updateValueLabels(sliders, valueLabels, formatters = {}) {
  if (!sliders || !valueLabels) {
    return;
  }
  Object.entries(sliders).forEach(([name, input]) => {
    const label = valueLabels[name];
    if (!label || !input) {
      return;
    }
    const formatter = formatters[name] || defaultFormatter;
    label.textContent = formatter(input.value);
  });
}

function formatMuteTargetLabel(target = '') {
  if (!target) {
    return '';
  }
  return target.charAt(0).toUpperCase() + target.slice(1);
}

function applyMuteButtonState(button, isMuted) {
  const target = button.dataset.target;
  button.classList.toggle('active', isMuted);
  button.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
  const friendlyTarget = formatMuteTargetLabel(target);
  if (friendlyTarget) {
    const action = isMuted ? 'Unmute' : 'Mute';
    button.setAttribute('aria-label', `${action} ${friendlyTarget}`);
  }
  const label = button.querySelector('.mute-label');
  if (label) {
    label.textContent = isMuted ? 'Muted' : 'Mute';
  } else {
    button.textContent = isMuted ? 'Muted' : 'Mute';
  }
}

export function initMuteButtons(root, muteState, { onToggle } = {}) {
  const scope = normalizeRoot(root);
  const buttons = scope ? Array.from(scope.querySelectorAll('.mute')) : [];

  buttons.forEach((button) => {
    const target = button.dataset.target;
    if (!target || !(target in muteState)) {
      return;
    }
    applyMuteButtonState(button, Boolean(muteState[target]));
    button.addEventListener('click', () => {
      const clickedTarget = button.dataset.target;
      if (!clickedTarget || !(clickedTarget in muteState)) {
        return;
      }
      const nextState = !muteState[clickedTarget];
      muteState[clickedTarget] = nextState;
      applyMuteButtonState(button, nextState);
      if (typeof onToggle === 'function') {
        onToggle(clickedTarget, nextState, button);
      }
    });
  });

  return { buttons, updateButtonState: applyMuteButtonState };
}

function applyModeButtonState(buttons, quadrant, mode) {
  buttons.forEach((button) => {
    if (button.dataset.quadrant === quadrant) {
      button.classList.toggle('active', button.dataset.mode === mode);
    }
  });
}

export function initModeTabs(root, initialModes = {}, { onModeChange } = {}) {
  const scope = normalizeRoot(root);
  const modeButtons = scope ? Array.from(scope.querySelectorAll('.mode-tab')) : [];
  const quadrantTabs = scope ? Array.from(scope.querySelectorAll('.quadrant-tabs')) : [];

  const setQuadrantMode = (quadrant, mode, { notify = true } = {}) => {
    if (!quadrant) {
      return;
    }
    applyModeButtonState(modeButtons, quadrant, mode);
    if (notify && typeof onModeChange === 'function') {
      onModeChange(quadrant, mode);
    }
  };

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const { quadrant, mode } = button.dataset;
      if (quadrant && mode) {
        setQuadrantMode(quadrant, mode);
      }
    });
  });

  Object.entries(initialModes).forEach(([quadrant, mode]) => {
    setQuadrantMode(quadrant, mode, { notify: false });
  });

  return { modeButtons, quadrantTabs, setQuadrantMode };
}

export function initSliders(root, { formatters = {}, onInput } = {}) {
  const scope = normalizeRoot(root);
  const sliders = scope
    ? {
        laya: scope.getElementById('laya'),
        gati: scope.getElementById('gati'),
        jati: scope.getElementById('jati'),
        nadai: scope.getElementById('nadai'),
      }
    : {};
  const valueLabels = scope
    ? {
        laya: scope.querySelector('[data-for="laya"]'),
        gati: scope.querySelector('[data-for="gati"]'),
        jati: scope.querySelector('[data-for="jati"]'),
        nadai: scope.querySelector('[data-for="nadai"]'),
      }
    : {};

  Object.entries(sliders).forEach(([name, input]) => {
    if (!input) {
      return;
    }
    input.addEventListener('input', () => {
      updateValueLabels(sliders, valueLabels, formatters);
      if (typeof onInput === 'function') {
        onInput(name, input.value, input);
      }
    });
  });

  updateValueLabels(sliders, valueLabels, formatters);

  return { sliders, valueLabels };
}
