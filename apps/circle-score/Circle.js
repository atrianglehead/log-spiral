const TAU = Math.PI * 2;

export class Circle {
  constructor(x, y, r, lines = []) {
    this.x = x;
    this.y = y;
    this.r = r;
    // Lines are kept sorted in ascending order. Maintaining this invariant is
    // required for methods like `generateSegments` which assume sorted input.
    this.lines = lines.slice().sort((a, b) => a - b);
  }

  addLine() {
    if (this.lines.length === 0) {
      this.lines.push(0);
      return;
    }
    // `this.lines` is already sorted, so we can operate on it directly.
    let maxGap = -1;
    let insert = 0;
    for (let i = 0; i < this.lines.length; i++) {
      const a1 = this.lines[i];
      const a2 = this.lines[(i + 1) % this.lines.length];
      const gap = (a2 - a1 + TAU) % TAU;
      if (gap > maxGap) {
        maxGap = gap;
        insert = (a1 + gap / 2) % TAU;
      }
    }
    // Insert the new line while preserving sorted order.
    const idx = this.lines.findIndex(a => a > insert);
    if (idx === -1) this.lines.push(insert);
    else this.lines.splice(idx, 0, insert);
    this._assertSorted();
  }

  removeLine(index) {
    this.lines.splice(index, 1);
    // `splice` preserves sorted order but assert to be safe in development.
    this._assertSorted();
  }

  generateSegments(startAngle = 0) {
    this._assertSorted();
    const angles = this.lines;
    const segments = [];
    let current = startAngle;
    if (angles.length === 0) {
      segments.push({
        from: current,
        to: startAngle + TAU,
        duration: 1000,
        beep: false,
      });
      return segments;
    }
    let idx = angles.findIndex(a => a >= startAngle);
    if (idx === -1) idx = 0;
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[(idx + i) % angles.length];
      const gap = (angle - current + TAU) % TAU;
      segments.push({
        from: current,
        to: angle,
        duration: (gap / TAU) * 1000,
        beep: true,
      });
      current = angle;
    }
    const finalGap = (startAngle + TAU - current + TAU) % TAU;
    segments.push({
      from: current,
      to: startAngle + TAU,
      duration: (finalGap / TAU) * 1000,
      beep: false,
    });
    return segments;
  }

  // Development-time assertion to ensure `this.lines` remains sorted.
  _assertSorted() {
    console.assert(
      this.lines.every((v, i, a) => i === 0 || a[i - 1] <= v),
      'Circle lines must remain sorted in ascending order for correctness.'
    );
  }
}

