const TAU = Math.PI * 2;

import { playBeep, ensureAudio } from '../../lib/audioCore.js';

export class Player {
  constructor(onUpdate, playButton) {
    this.onUpdate = onUpdate;
    this.playButton = playButton;

    this.playTimer = null;
    this.playing = false;
    this.auditioning = false;
    this.playCircleIdx = 0;
    this.circles = [];
    this.currentCircle = null;
    this.segments = [];
    this.segmentIdx = 0;
    this.playheadAngle = 0;
    this.segmentStartTime = 0;
    this.segmentDuration = 0;
    this.segmentStartAngle = 0;
    this.segmentEndAngle = 0;
    this.raf = null;
  }

  start(circles) {
    this.stop();
    ensureAudio();
    if (!circles || circles.length === 0) return;
    this.playing = true;
    this.auditioning = false;
    this.playButton.textContent = '⏸';
    this.circles = circles;
    this.playCircleIdx = 0;
    this._startCircle(this.circles[this.playCircleIdx]);
  }

  startAudition(circle) {
    this.stop();
    ensureAudio();
    const angles = circle.lines.slice().sort((a, b) => a - b);
    if (angles.length === 0) return;
    this.playing = true;
    this.auditioning = true;
    this.playCircleIdx = 0;
    this.circles = [circle];
    this.currentCircle = circle;
    const startAngle = angles[0];
    this.segments = circle.generateSegments(startAngle);
    this.segmentIdx = 0;
    this._startSegment();
  }

  stopAudition() {
    if (this.auditioning) this.stop();
  }

  stop() {
    this.playing = false;
    this.auditioning = false;
    this.playButton.textContent = '▶';
    this.currentCircle = null;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.onUpdate();
  }

  isPlaying() {
    return this.playing;
  }

  _startCircle(circle) {
    this.currentCircle = circle;
    this.segments = circle.generateSegments();
    this.segmentIdx = 0;
    this._startSegment();
  }

  _startSegment() {
    if (!this.playing) return;
    if (this.segmentIdx >= this.segments.length) {
      if (this.auditioning) {
        this.segmentIdx = 0;
        playBeep(880);
        this._startSegment();
      } else {
        this.playCircleIdx++;
        if (this.playCircleIdx >= this.circles.length) {
          this.stop();
        } else {
          this.playTimer = null;
          this._startCircle(this.circles[this.playCircleIdx]);
        }
      }
      return;
    }
    const seg = this.segments[this.segmentIdx];
    this.segmentStartAngle = seg.from;
    this.segmentEndAngle = seg.to;
    this.segmentDuration = seg.duration;
    this.segmentStartTime = performance.now();
    this._animatePlayhead();
    this.playTimer = setTimeout(() => {
      if (seg.beep) playBeep(880);
      this.segmentIdx++;
      this._startSegment();
    }, this.segmentDuration);
  }

  _animatePlayhead() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const step = () => {
      if (!this.playing) return;
      const now = performance.now();
      const t = this.segmentDuration
        ? Math.min((now - this.segmentStartTime) / this.segmentDuration, 1)
        : 1;
      const delta = (this.segmentEndAngle - this.segmentStartAngle + TAU) % TAU;
      this.playheadAngle = this.segmentStartAngle + delta * t;
      this.onUpdate();
      if (t < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.raf = null;
      }
    };
    step();
  }
}
