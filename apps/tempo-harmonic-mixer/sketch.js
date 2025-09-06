import { radiusAt, thetaForMultiple } from '../../lib/spiralMath.js';
import { PARTIALS, X_BASE, gains, PARTIAL_MAX, buildAudio, scheduleBeats } from './audio.js';
import { buildUI, refreshPlayButton, updateGridUI, getViewMode } from './ui.js';
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
  refreshPlayButton();
};

window.windowResized = function () {
  // Keep the canvas occupying the top half on resize.
  resizeCanvas(windowWidth, windowHeight * 0.5);
};

window.draw = function () {
  background(11);

  const viewMode = getViewMode();
  if (viewMode === 'spiral') {
    // Spiral bounds: square occupying 80% of the smaller canvas dimension.
    const boundSide = 0.8 * Math.min(width, height);
    const maxRadiusPixels = Math.max(0, boundSide / 2);

    // Center of the canvas
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);

    // Compute scale so the OUTERMOST radius (k = PARTIALS) fits within the bounds
    const finalUnscaledR  = radiusAt(X_BASE, thetaForMultiple(PARTIALS)); // outer radius before scaling
    const s = finalUnscaledR > 0 ? (maxRadiusPixels / finalUnscaledR) : 0;

    push();
    translate(cx, cy);

    if (s > 0) {
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
    const finalUnscaledR = radiusAt(X_BASE, thetaForMultiple(PARTIALS));
    const s = finalUnscaledR > 0 ? (circleR / finalUnscaledR) : 0;

    push();

    // ----- Left: angles as radial lines -----
    translate(cx, cy);
    const angleLabelGroups = new Map();
    noFill(); stroke(50); strokeWeight(2); circle(0, 0, circleR * 2);

    for (let i = PARTIALS - 1; i >= 0; i--) {
      const k = i + 1;
      const th = thetaForMultiple(k);

      const g = gains[i];
      const alpha = g / PARTIAL_MAX;
      const [rCol, gCol, bCol] = octaveColor(k);

      const px = circleR * Math.cos(th);
      const py = circleR * Math.sin(th);
      const head = terminalCircleSize(k);
      const lineX = px - Math.cos(th) * head;
      const lineY = py - Math.sin(th) * head;

      stroke(rCol, gCol, bCol, alpha * 255);
      strokeWeight(partialStrokeWeight(k));
      line(0, 0, lineX, lineY);

      noStroke();
      fill(rCol, gCol, bCol, alpha * 255);
      push();
      translate(px, py);
      rotate(th);
      triangle(0, 0, -head, head * 0.6, -head, -head * 0.6);
      pop();

      if (g > 0) {
        let odd = k;
        while (odd % 2 === 0) odd /= 2;
        const thNorm = Math.atan2(py, px);
        if (angleLabelGroups.has(odd)) {
          angleLabelGroups.get(odd).ks.push(k);
        } else {
          angleLabelGroups.set(odd, { th: thNorm, px, py, ks: [k] });
        }
      }
    }

    angleLabelGroups.forEach(({ th, px, py, ks }) => {
      const sorted = ks.slice().sort((a, b) => a - b);

      // ----- Build label, inserting a line break when there are many items -----
      let label;
      let lines;
      if (sorted.length === 1) {
        label = `${sorted[0]}`;
        lines = [label];
      } else {
        const items = sorted.map(String);
        if (items.length > 2) {
          const mid = Math.ceil(items.length / 2);
          lines = [
            `[${items.slice(0, mid).join(', ')}`,
            ` ${items.slice(mid).join(', ')}]`,
          ];
          label = lines.join('\n');
        } else {
          label = `[${items.join(', ')}]`;
          lines = [label];
        }
      }

      const offset = terminalCircleSize(Math.max(...ks)) / 2 + 8;
      let x = px + Math.cos(th) * offset;
      let y = py + Math.sin(th) * offset;
      push();
      noStroke();
      fill(210, 210, 210, 220);
      textSize(12);

      // Compute bounding box of multi-line label
      const lineHeight = textAscent() + textDescent();
      const w = Math.max(...lines.map(l => textWidth(l)));
      const h = lineHeight * lines.length;

      if (sorted.length > 1) {
        const ensureOutsideCircle = () => {
          const corners = [
            [x - w / 2, y - h / 2],
            [x + w / 2, y - h / 2],
            [x - w / 2, y + h / 2],
            [x + w / 2, y + h / 2],
          ];
          const minCornerDist = Math.min(...corners.map(([cx, cy]) => Math.hypot(cx, cy)));
          const minDist = circleR + 4;
          if (minCornerDist < minDist) {
            const extra = minDist - minCornerDist;
            x += Math.cos(th) * extra;
            y += Math.sin(th) * extra;
          }
        };

        ensureOutsideCircle();

        // Avoid colliding with the "Angle" label beneath the circle
        const bottomBound = circleR - h / 2 - 8;
        if (y > bottomBound) y = bottomBound;

        // Keep list labels within the left half of the canvas
        const rightBound = halfWidth / 2 - w / 2 - 8;
        if (x > rightBound) x = rightBound;

        // Re-check after applying bounds
        ensureOutsideCircle();
      }

      textAlign(CENTER, CENTER);
      text(label, x, y);
      pop();
    });

    pop();
    drawLabelBox(cx, cy + circleR + 24, 'Angle');

    // ----- Right: lengths as vertical lines -----
    const baseY = cy + circleR;
    const colWidth = halfWidth / PARTIALS;

    // Base line for lengths
    stroke(50); strokeWeight(3); line(halfWidth, baseY, width, baseY);

    for (let i = PARTIALS - 1; i >= 0; i--) {
      const k = i + 1;
      const len = radiusAt(X_BASE, thetaForMultiple(k)) * s;
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

      if (g > 0) {
        const offset = terminalCircleSize(k) / 2 + 4;
        push();
        noStroke();
        fill(210, 210, 210, 220);
        textSize(12);
        textAlign(CENTER, BOTTOM);
        text(`${k}`, x, yTop - offset);
        pop();
      }
    }

    drawLabelBox(halfWidth + halfWidth / 2, baseY + 24, 'Length');
  }

  scheduleBeats();
  refreshPlayButton();
};
