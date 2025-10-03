const DEFAULT_MUTE_STATE = {
  laya: false,
  gati: false,
  jati: false,
  nadai: false,
};

const DEFAULT_COUNTS = {
  gati: 1,
  jati: 1,
  nadai: 1,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createAudioEngine({
  initialTempo = 120,
  initialCounts = {},
  initialMuteState = {},
  gain = 0.6,
} = {}) {
  let audioCtx = null;
  let masterGain = null;
  let isPlaying = false;
  let startTime = 0;
  let pausedElapsed = 0;
  let schedulerId = null;

  let tempoBpm = Math.max(1, toNumber(initialTempo, 120));
  let counts = {
    ...DEFAULT_COUNTS,
    ...Object.fromEntries(
      Object.entries(initialCounts).map(([key, value]) => [key, Math.max(1, toNumber(value, 1))]),
    ),
  };

  const muteState = { ...DEFAULT_MUTE_STATE, ...initialMuteState };

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
    if (!audioCtx && typeof AudioContext !== 'undefined') {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = gain;
      masterGain.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  function getElapsed() {
    if (!isPlaying) {
      return pausedElapsed;
    }
    const ctx = ensureAudio();
    if (!ctx) {
      return 0;
    }
    return ctx.currentTime - startTime;
  }

  function playClick(kind, time) {
    if (!audioCtx || muteState[kind]) {
      return;
    }
    const voice = voices[kind];
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.frequency, time);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.3, time + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    osc.connect(gainNode).connect(masterGain);
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
    if (!(segmentDuration > 0)) {
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

  function stopScheduler() {
    if (schedulerId !== null) {
      clearInterval(schedulerId);
      schedulerId = null;
    }
  }

  function startScheduler() {
    if (schedulerId === null) {
      schedulerId = setInterval(scheduleAudio, 25);
    }
  }

  function updateVoices() {
    const layaPeriod = 60 / Math.max(1, tempoBpm);
    const gatiCount = Math.max(1, toNumber(counts.gati, 1));
    const jatiCount = Math.max(1, toNumber(counts.jati, 1));
    const nadaiCount = Math.max(1, toNumber(counts.nadai, 1));

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

  function start() {
    const ctx = ensureAudio();
    if (!ctx) {
      return;
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    if (!isPlaying) {
      startTime = ctx.currentTime - pausedElapsed;
      isPlaying = true;
    }
    startScheduler();
    updateVoices();
    scheduleAudio();
  }

  function stop() {
    if (!audioCtx) {
      isPlaying = false;
      pausedElapsed = 0;
      stopScheduler();
      return;
    }
    pausedElapsed = getElapsed();
    isPlaying = false;
    stopScheduler();
  }

  function setTempo(nextTempo) {
    const numericTempo = Math.max(1, toNumber(nextTempo, tempoBpm));
    tempoBpm = numericTempo;
    const elapsed = getElapsed();
    pausedElapsed = elapsed;
    if (isPlaying && audioCtx) {
      startTime = audioCtx.currentTime - pausedElapsed;
    }
    updateVoices();
  }

  function setCounts(nextCounts = {}) {
    counts = {
      ...counts,
      ...Object.fromEntries(
        Object.entries(nextCounts).map(([key, value]) => [key, Math.max(1, toNumber(value, counts[key] ?? 1))]),
      ),
    };
    updateVoices();
  }

  function setMuteState(name, value) {
    if (!(name in muteState)) {
      return;
    }
    muteState[name] = Boolean(value);
  }

  function isPlayingState() {
    return isPlaying;
  }

  updateVoices();

  return {
    start,
    stop,
    setTempo,
    setCounts,
    setMuteState,
    getElapsed,
    isPlaying: isPlayingState,
  };
}
