// ES module: keep drawings out from under the UI panel
export function getSafeArea(canvasEl, uiEl, { gap = 12, margin = 32, w, h }) {
  const cnv = canvasEl.getBoundingClientRect();
  const ui  = uiEl.getBoundingClientRect();
  const uiBottomInCanvas = Math.max(0, ui.bottom - cnv.top);

  const topMargin = Math.min(h, Math.max(margin, uiBottomInCanvas + gap));
  const left = margin, right = margin, bottom = margin;

  const dw = Math.max(1, w - left - right);
  const dh = Math.max(1, h - topMargin - bottom);

  return { x: left, y: topMargin, w: dw, h: dh, cx: left + dw/2, cy: topMargin + dh/2 };
}

export function fitScale(finalR, area, margin = 32) {
  const fitR = Math.min(area.w, area.h) / 2 - margin;
  return finalR > 0 ? Math.min(1, fitR / finalR) : 1;
}

