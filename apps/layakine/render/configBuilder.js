export function buildQuadrantConfigs(layaPeriod, gatiCount, jatiCount, nadaiCountInput) {
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
