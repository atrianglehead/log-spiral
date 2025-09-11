import { playBeep, ensureAudio } from '../../lib/audioCore.js';

const TAU = Math.PI * 2;

export class CircleScore {
  constructor(canvas, beatInput, playButton) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.beatInput = beatInput;
    this.playButton = playButton;

    this.canvas.style.touchAction = 'none';
    document.addEventListener('contextmenu', e => e.preventDefault());

    this.width = 0;
    this.height = 0;

    this.circles = [];
    this.selectedCircle = null;
    this.selectedLine = null; // {circle,index}
    this.draggingLine = null;
    this.playTimer = null;
    this.playing = false;
    this.auditioning = false;
    this.playCircleIdx = 0;
    this.segments = [];
    this.segmentIdx = 0;
    this.playheadAngle = 0;
    this.segmentStartTime = 0;
    this.segmentDuration = 0;
    this.segmentStartAngle = 0;
    this.segmentEndAngle = 0;
    this.raf = null;
    this.radius = 40;
    this.spacing = this.radius * 2 + 8;

    this.lastTap = 0;
    this.lastTapX = 0;
    this.lastTapY = 0;

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();

    this.createCircleAtNext();
  }

  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.draw();
  }

  createCircle(x, y) {
    const beats = parseInt(this.beatInput.value, 10);
    const lines = [];
    if (beats > 0) {
      const step = TAU / beats;
      for (let i = 0; i < beats; i++) lines.push(i * step);
    }
    const circle = { x, y, r: this.radius, lines };
    this.circles.push(circle);
    this.selectedCircle = circle;
    this.selectedLine = null;
    this.draw();
  }

  createCircleAtNext() {
    const x = this.circles.length
      ? this.circles[this.circles.length - 1].x + this.spacing
      : this.radius + 8;
    const y = this.height / 2;
    this.createCircle(x, y);
  }

  addLine(circle) {
    if (circle.lines.length === 0) {
      circle.lines.push(0);
      return;
    }
    const angles = circle.lines.slice().sort((a, b) => a - b);
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
    circle.lines.push(insert);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.circles.forEach((c, idx) => {
      this.ctx.lineWidth = c === this.selectedCircle ? 4 : 2;
      this.ctx.strokeStyle = '#000';
      this.ctx.beginPath();
      this.ctx.arc(c.x, c.y, c.r, 0, TAU);
      this.ctx.stroke();
      c.lines.forEach((angle, i) => {
        const sel =
          this.selectedLine &&
          this.selectedLine.circle === c &&
          this.selectedLine.index === i;
        this.ctx.lineWidth = sel ? 4 : 2;
        this.ctx.beginPath();
        this.ctx.moveTo(c.x, c.y);
        this.ctx.lineTo(
          c.x + c.r * Math.sin(angle),
          c.y - c.r * Math.cos(angle)
        );
        this.ctx.stroke();
      });
      if (this.playing && idx === this.playCircleIdx) {
        this.ctx.strokeStyle = '#f00';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(c.x, c.y);
        this.ctx.lineTo(
          c.x + c.r * Math.sin(this.playheadAngle),
          c.y - c.r * Math.cos(this.playheadAngle)
        );
        this.ctx.stroke();
      }
      // center dot
      this.ctx.fillStyle = '#000';
      this.ctx.beginPath();
      this.ctx.arc(c.x, c.y, 3, 0, TAU);
      this.ctx.fill();
    });
  }

  deleteSelection() {
    if (this.selectedLine) {
      const { circle, index } = this.selectedLine;
      circle.lines.splice(index, 1);
      this.selectedLine = null;
    } else if (this.selectedCircle) {
      const idx = this.circles.indexOf(this.selectedCircle);
      if (idx >= 0) this.circles.splice(idx, 1);
      this.selectedCircle = null;
    }
    this.draw();
  }

  handleDoubleTap(x, y) {
    let hitCircle = null;
    for (const c of this.circles) {
      if (Math.hypot(c.x - x, c.y - y) <= c.r) {
        hitCircle = c;
        break;
      }
    }
    if (hitCircle) {
      this.addLine(hitCircle);
      this.selectedCircle = hitCircle;
      this.selectedLine = null;
      this.draw();
      return;
    }
    this.createCircleAtNext();
  }

  onPointerDown(e) {
    ensureAudio();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.pointerType === 'touch') {
      e.preventDefault();
      const now = performance.now();
      if (
        now - this.lastTap < 300 &&
        Math.hypot(x - this.lastTapX, y - this.lastTapY) < 20
      ) {
        this.handleDoubleTap(x, y);
        this.lastTap = 0;
        return;
      }
      this.lastTap = now;
      this.lastTapX = x;
      this.lastTapY = y;
    }
    for (const c of this.circles) {
      const dx = x - c.x;
      const dy = y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= c.r) {
        if (dist < 10) {
          this.selectedCircle = c;
          this.selectedLine = null;
          this.startAudition(c);
          this.draw();
          return;
        }
        const ang = (Math.atan2(dx, -dy) + TAU) % TAU;
        for (let i = 0; i < c.lines.length; i++) {
          const diff = Math.abs(
            ((c.lines[i] - ang + TAU + TAU / 2) % TAU) - TAU / 2
          );
          if (diff < 0.1) {
            this.selectedLine = { circle: c, index: i };
            this.selectedCircle = null;
            this.draggingLine = this.selectedLine;
            this.draw();
            return;
          }
        }
        this.selectedCircle = c;
        this.selectedLine = null;
        this.draw();
        return;
      }
    }
    this.selectedCircle = null;
    this.selectedLine = null;
    this.draw();
  }

  onDoubleClick(e) {
    ensureAudio();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleDoubleTap(x, y);
  }

  onPointerMove(e) {
    if (!this.draggingLine) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = this.draggingLine.circle;
    const angle = (Math.atan2(x - c.x, -(y - c.y)) + TAU) % TAU;
    c.lines[this.draggingLine.index] = angle;
    this.draw();
  }

  onPointerUp() {
    this.draggingLine = null;
    this.stopAudition();
  }

  onKeyDown(e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelection();
    }
  }

  startAudition(circle) {
    this.stopAudition();
    this.stopPlayback();
    ensureAudio();
    const angles = circle.lines.slice().sort((a, b) => a - b);
    if (angles.length === 0) return;
    this.auditioning = true;
    this.playing = true;
    this.playCircleIdx = this.circles.indexOf(circle);
    const startAngle = angles[0];
    let current = startAngle;
    this.segments = [];
    for (let i = 1; i < angles.length; i++) {
      const angle = angles[i];
      const gap = (angle - current + TAU) % TAU;
      this.segments.push({
        from: current,
        to: angle,
        duration: (gap / TAU) * 1000,
        beep: true,
      });
      current = angle;
    }
    const finalGap = (startAngle + TAU - current + TAU) % TAU;
    this.segments.push({
      from: current,
      to: startAngle + TAU,
      duration: (finalGap / TAU) * 1000,
      beep: false,
    });
    this.segmentIdx = 0;
    playBeep(880);
    this.startSegment();
  }

  stopAudition() {
    if (this.auditioning) {
      this.auditioning = false;
      this.stopPlayback();
    }
  }

  startPlayback() {
    this.stopAudition();
    ensureAudio();
    if (this.circles.length === 0) return;
    this.playing = true;
    this.playButton.textContent = '⏸';
    this.playCircleIdx = 0;
    this.startCircle(this.circles[this.playCircleIdx]);
  }

  buildSegments(circle) {
    const angles = circle.lines.slice().sort((a, b) => a - b);
    const segs = [];
    let current = 0;
    for (const angle of angles) {
      const gap = (angle - current + TAU) % TAU;
      segs.push({
        from: current,
        to: angle,
        duration: (gap / TAU) * 1000,
        beep: true,
      });
      current = angle;
    }
    const finalGap = (TAU - current + TAU) % TAU;
    segs.push({
      from: current,
      to: TAU,
      duration: (finalGap / TAU) * 1000,
      beep: false,
    });
    return segs;
  }

  startCircle(circle) {
    this.segments = this.buildSegments(circle);
    this.segmentIdx = 0;
    this.startSegment();
  }

  startSegment() {
    if (!this.playing) return;
    if (this.segmentIdx >= this.segments.length) {
      if (this.auditioning) {
        this.segmentIdx = 0;
        playBeep(880);
        this.startSegment();
      } else {
        this.playCircleIdx++;
        if (this.playCircleIdx >= this.circles.length) {
          this.stopPlayback();
        } else {
          this.playTimer = null;
          this.startCircle(this.circles[this.playCircleIdx]);
        }
      }
      return;
    }
    const seg = this.segments[this.segmentIdx];
    this.segmentStartAngle = seg.from;
    this.segmentEndAngle = seg.to;
    this.segmentDuration = seg.duration;
    this.segmentStartTime = performance.now();
    this.animatePlayhead();
    this.playTimer = setTimeout(() => {
      if (seg.beep) playBeep(880);
      this.segmentIdx++;
      this.startSegment();
    }, this.segmentDuration);
  }

  animatePlayhead() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const step = () => {
      if (!this.playing) return;
      const now = performance.now();
      const t = this.segmentDuration
        ? Math.min((now - this.segmentStartTime) / this.segmentDuration, 1)
        : 1;
      const delta = (this.segmentEndAngle - this.segmentStartAngle + TAU) % TAU;
      this.playheadAngle = this.segmentStartAngle + delta * t;
      this.draw();
      if (t < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.raf = null;
      }
    };
    step();
  }

  stopPlayback() {
    this.playing = false;
    this.playButton.textContent = '▶';
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.draw();
  }

  isPlaying() {
    return this.playing;
  }
}

