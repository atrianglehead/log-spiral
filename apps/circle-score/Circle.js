const TAU = Math.PI * 2;

export class Circle {
  constructor(x, y, r, lines = []) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.lines = lines;
  }

  addLine() {
    if (this.lines.length === 0) {
      this.lines.push(0);
      return;
    }
    const angles = this.lines.slice().sort((a, b) => a - b);
    let maxGap = -1;
    let insert = 0;
    for (let i = 0; i < angles.length; i++) {
      const a1 = angles[i];
      const a2 = angles[(i + 1) % angles.length];
      const gap = (a2 - a1 + TAU) % TAU;
      if (gap > maxGap) {
        maxGap = gap;
        insert = (a1 + gap / 2) % TAU;
      }
    }
    this.lines.push(insert);
  }

  removeLine(index) {
    this.lines.splice(index, 1);
  }

  generateSegments(startAngle = 0) {
    const angles = this.lines.slice().sort((a, b) => a - b);
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
}

