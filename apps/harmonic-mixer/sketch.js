import { TAU } from '../../lib/spiralMath.js';
import { PARTIALS, X_BASE, gains, PARTIAL_MAX, buildAudio, updateRouteForMode, stepSequenceIfDue, isPlaying, getMode } from './audio.js';
import { buildUI, refreshPlayButton, updateGridUI, getShowCurve, getViewMode } from './ui.js';
import { drawSpiralCurve, drawPartials, drawLabelBox, octaveColor, partialStrokeWeight, terminalCircleSize } from './drawing.js';

// ---------- Setup ----------
window.setup = function () {
  // Canvas occupies the top half of the viewport.
  createCanvas(windowWidth, windowHeight * 0.5);

  pixelDensity(2);
  strokeCap(ROUND);
  textFont('system-ui, -apple-system, Segoe UI, Roboto, sans-serif');

  buildUI();
  buildAudio();

  updateGridUI();
  updateRouteForMode();
  refreshPlayButton();
};

window.windowResized = function () {
  // Keep the canvas occupying the top half on resize.
  resizeCanvas(windowWidth, windowHeight * 0.5);
};

window.draw = function () {
  background(11);

  const viewMode = getViewMode();
  const showCurve = getShowCurve();

  if (viewMode === 'spiral') {
    // Spiral bounds: square occupying 80% of the smaller canvas dimension.
    const boundSide = 0.8 * Math.min(width, height);
    const maxRadiusPixels = Math.max(0, boundSide / 2);

    // Center of the canvas
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);

    // Compute scale so the OUTERMOST radius (k = PARTIALS) fits within the bounds
    const finalUnscaledR  = X_BASE * PARTIALS; // outer radius before scaling
    const s = finalUnscaledR > 0 ? (maxRadiusPixels / finalUnscaledR) : 0;

    push();
    translate(cx, cy);

    if (s > 0 && showCurve) {
      drawSpiralCurve(s);
    }

    if (s > 0) {
      // Axes
      stroke(50); strokeWeight(1);
      line(-boundSide/2, 0, boundSide/2, 0);
      line(0, -boundSide/2, 0, boundSide/2);

      // Partials
      drawPartials(s);
    }

    pop();
  }

  else if (viewMode === 'components') {
    // Circle bounds on the left half
    const halfWidth = width / 2;
    const cx = Math.floor(halfWidth / 2);
    const cy = Math.floor(height / 2);
    const circleSide = 0.8 * Math.min(halfWidth, height);
    const circleR = circleSide / 2;

    // Scale so that the largest harmonic length matches the circle radius
    const finalUnscaledR = X_BASE * PARTIALS;
    const s = finalUnscaledR > 0 ? (circleR / finalUnscaledR) : 0;

    push();

    // ----- Left: angles as radial lines -----
    translate(cx, cy);
    noFill(); stroke(50); strokeWeight(2); circle(0, 0, circleR * 2);

    for (let i = PARTIALS - 1; i >= 0; i--) {
      const k = i + 1;
      const th = Math.log2(k) * TAU;

      const g = gains[i];
      const alpha = g / PARTIAL_MAX;
      const [rCol, gCol, bCol] = octaveColor(k);

      const px = circleR * Math.cos(th);
      const py = circleR * Math.sin(th);

      stroke(rCol, gCol, bCol, alpha * 255);
      strokeWeight(partialStrokeWeight(k));
      line(0, 0, px, py);

      noStroke();
      fill(rCol, gCol, bCol, alpha * 255);
      circle(px, py, terminalCircleSize(k));
    }

    pop();
    drawLabelBox(cx, cy + circleR + 24, 'Angle');

    // ----- Right: lengths as vertical lines -----
    const baseY = cy + circleR;
    const colWidth = halfWidth / PARTIALS;

    // Base line for lengths
    stroke(50); strokeWeight(1); line(halfWidth, baseY, width, baseY);

    for (let i = PARTIALS - 1; i >= 0; i--) {
      const k = i + 1;
      const len = (k * X_BASE) * s;
      const x = halfWidth + colWidth * (i + 0.5);
      const yTop = baseY - len;

      const g = gains[i];
      const alpha = g / PARTIAL_MAX;
      const [rCol, gCol, bCol] = octaveColor(k);

      stroke(rCol, gCol, bCol, alpha * 255);
      strokeWeight(partialStrokeWeight(k));
      line(x, baseY, x, yTop);

      noStroke();
      fill(rCol, gCol, bCol, alpha * 255);
      circle(x, yTop, terminalCircleSize(k));
    }

    drawLabelBox(halfWidth + halfWidth / 2, baseY + 24, 'Length');
  }

  if (isPlaying() && getMode() === 'seq') {
    stepSequenceIfDue();
    refreshPlayButton();
  }
};
