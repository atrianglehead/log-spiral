import { drawQuadrantShape } from './draw2d.js';
import {
  drawGatiQuadrant3d,
  drawJatiQuadrant3d,
  drawNadaiQuadrant3d,
} from './draw3d.js';

export function drawQuadrant(renderContext, options) {
  const { ctx, canvas } = renderContext;
  const { name, mode, config, elapsed, palette } = options;
  if (!ctx || !canvas || !config) {
    return;
  }

  const { orientation, cycleDuration, view1d, view2d, gatiCount } = config;
  const fallbackMarkers = view2d?.soundMarkers || { mode: 'first' };

  const shapePalette = {
    stroke: palette?.stroke,
    segment: palette?.segment,
    first: palette?.first,
  };

  if (mode === '1d') {
    const view = view1d || null;
    if (view) {
      const shapeConfig = {
        ...view,
        orientation,
        soundMarkers: view.soundMarkers || fallbackMarkers,
      };
      if (!(shapeConfig.segmentDuration > 0) && cycleDuration > 0) {
        shapeConfig.segmentDuration = cycleDuration;
      }
      drawQuadrantShape({ ctx, canvas }, shapePalette, shapeConfig, elapsed);
    } else if (cycleDuration > 0) {
      drawQuadrantShape(
        { ctx, canvas },
        shapePalette,
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

  if (mode === '2d' || typeof mode === 'undefined') {
    if (view2d) {
      drawQuadrantShape({ ctx, canvas }, shapePalette, { ...view2d, orientation }, elapsed);
    }
    return;
  }

  if (mode === '3d') {
    if (name === 'gati') {
      drawGatiQuadrant3d({
        ctx,
        canvas,
        orientation,
        view2d,
        cycleDuration,
        palette: shapePalette,
        elapsed,
      });
    } else if (name === 'jati') {
      drawJatiQuadrant3d({
        ctx,
        canvas,
        orientation,
        view2d,
        cycleDuration,
        gatiCount,
        palette: shapePalette,
        elapsed,
      });
    } else if (name === 'nadai') {
      drawNadaiQuadrant3d({
        ctx,
        canvas,
        orientation,
        view2d,
        cycleDuration,
        gatiCount,
        palette: shapePalette,
        elapsed,
      });
    }
  }
}
