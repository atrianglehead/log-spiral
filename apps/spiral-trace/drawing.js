import { getSafeArea } from '../../lib/panelFit.js';
import { TAU, thetaForMultiple } from '../../lib/spiralMath.js';
import { state, margin, MARKER_CAP } from './state.js';
import { audioState } from './audio.js';

export function getArea(ui) {
  const canvasEl = document.querySelector('canvas');
  return getSafeArea(canvasEl, ui.elt, { w: width, h: height, gap: 12, margin });
}

export function drawGuide(s, finalR_unscaled, turns, fitRadius, area) {
  // axes within safe area
  stroke(60); strokeWeight(1);
  line(-area.w / 2, 0, area.w / 2, 0);
  line(0, -area.h / 2, 0, area.h / 2);

  // final radius circle
  push();
  noFill(); drawingContext.setLineDash([6, 6]); stroke(70);
  const finalR = finalR_unscaled * s;
  circle(0, 0, 2 * finalR);
  pop();

  // tick rays per rotation
  push();
  stroke(70); drawingContext.setLineDash([3, 6]);
  const outerR = Math.min(finalR, fitRadius);
  for (let k = 0; k <= turns; k++) {
    const ang = k * TAU;
    const v = p5.Vector.fromAngle(ang, outerR);
    line(0, 0, v.x, v.y);
  }
  pop();

  // fit boundary
  push();
  noFill(); drawingContext.setLineDash([2, 8]); stroke(45);
  circle(0, 0, 2 * fitRadius);
  pop();

  // origin
  noStroke(); fill(200); circle(0, 0, 5);
}

export function computeMarkers(finalMultipleK, maxTheta) {
  const K = Math.min(finalMultipleK, MARKER_CAP);
  const arr = [];
  for (let k = 1; k <= K; k++) {
    if (audioState.baseP * k > 20000) break;
    const th = thetaForMultiple(k);
    if (th > maxTheta + 1e-9) break;
    arr.push({ k, theta: th });
  }
  return arr;
}

export function drawMarkers(markers, s) {
  push(); textSize(12); textAlign(CENTER, CENTER);
  const showEvery = markers.length <= 80 ? 1 : Math.ceil(markers.length / 80);
  for (let i = 0; i < markers.length; i++) {
    const { k, theta } = markers[i];
    const p = p5.Vector.fromAngle(theta, k * state.x * s);
    noStroke(); fill(250, 210, 120); circle(p.x, p.y, 6);
    if (i % showEvery === 0) {
      fill(210);
      const off = p5.Vector.fromAngle(theta, 16);
      text(`${k}`, p.x + off.x, p.y + off.y); // upright numerals
    }
  }
  pop();
}
