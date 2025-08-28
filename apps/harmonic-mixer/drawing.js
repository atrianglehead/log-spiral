import { TAU } from '../../lib/spiralMath.js';
import { PARTIALS, X_BASE, PARTIAL_MAX, gains } from './audio.js';

// Octave colors: all partials within an octave share a color.
// Colors cycle if the octave index exceeds the palette length.
// Pick vibrant, high-contrast hues so overlapping partials remain distinct.
const OCTAVE_COLORS = [
  [255, 80, 80],   // red
  [80, 255, 80],   // green
  [80, 80, 255],   // blue
  [255, 200, 80],  // yellow/orange
  [200, 80, 255],  // purple
  [80, 255, 255],  // cyan,
];

// Base line widths: odd-numbered partials use ODD_WEIGHT.
// Every factor of two increases width by EVEN_DELTA for better visibility.
const ODD_WEIGHT = 2;
const EVEN_DELTA = 1;

export function octaveColor(k) {
  const idx = Math.floor(Math.log2(k)) % OCTAVE_COLORS.length;
  return OCTAVE_COLORS[idx];
}

export function partialStrokeWeight(k) {
  let w = ODD_WEIGHT;
  while (k % 2 === 0) {
    w += EVEN_DELTA;
    k /= 2;
  }
  return w;
}

export function terminalCircleSize(k) {
  return (k & (k - 1)) === 0 ? 8 : 6;
}

export function drawLabelBox(x, y, label) {
  push();
  const PAD = 6;
  const TS = 12;
  textSize(TS);
  const w = textWidth(label) + PAD * 2;
  const h = TS + PAD * 2;
  rectMode(CENTER);
  noStroke();
  fill(20, 20, 25, 220);
  rect(x, y, w, h, 6);
  fill(220);
  textAlign(CENTER, CENTER);
  text(label, x, y);
  pop();
}

export function drawPartialLabel(px, py, label, k) {
  push();
  const TS = 12;
  textSize(TS);

  // Offset label away from the radial line to avoid overlaps
  const circleR = terminalCircleSize(k) / 2;
  const isPowerOfTwo = (k & (k - 1)) === 0;
  const radialOffset = isPowerOfTwo ? 0 : circleR + 4;
  const tangentialOffset = TS / 2 + 4;

  // Determine radial and tangential directions for the partial
  const angle = Math.atan2(py, px);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tx = -uy;
  const ty = ux;

  const x = px + ux * radialOffset + tx * tangentialOffset;
  const y = py + uy * radialOffset + ty * tangentialOffset;

  noStroke();
  fill(210, 210, 210, 220);
  textAlign(CENTER, CENTER);
  text(label, x, y);
  pop();
}

export function drawSpiralCurve(s) {
  const thetaMax = TAU * Math.log2(PARTIALS);
  noFill(); stroke(70); strokeWeight(2);
  beginShape();
  for (let th = 0; th <= thetaMax; th += 0.02) {
    const r = X_BASE * Math.pow(2, th / TAU) * s;
    vertex(r * Math.cos(th), r * Math.sin(th));
  }
  endShape();
}

export function drawPartials(s) {
  for (let i = PARTIALS - 1; i >= 0; i--) {
    const k = i + 1;
    const th = (Math.log2(k)) * TAU;
    const r = (k * X_BASE) * s;
    const px = r * Math.cos(th);
    const py = r * Math.sin(th);

    const g = gains[i];
    const alpha = g / PARTIAL_MAX;
    const [rCol, gCol, bCol] = octaveColor(k);

    stroke(rCol, gCol, bCol, alpha * 255);
    strokeWeight(partialStrokeWeight(k));
    line(0, 0, px, py);

    noStroke();
    fill(rCol, gCol, bCol, alpha * 255);
    circle(px, py, terminalCircleSize(k));
    if (g > 0) {
      drawPartialLabel(px, py, `${k}`, k);
    }
  }
}
