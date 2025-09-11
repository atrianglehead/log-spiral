import { ensureAudio } from '../../lib/audioCore.js';
import { drawCircle, drawPlayhead } from './renderer.js';
import { getCanvasPos } from './eventUtils.js';
import { Circle } from './Circle.js';
import { Player } from './Player.js';

const TAU = Math.PI * 2;

export class CircleScore {
  constructor(canvas, beatInput, playButton) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.beatInput = beatInput;

    this.canvas.style.touchAction = 'none';

    this.width = 0;
    this.height = 0;

    this.circles = [];
    this.selectedCircle = null;
    this.selectedLine = null; // {circle,index}
    this.draggingLine = null;
    this.player = new Player(() => this.draw(), playButton);
    this.radius = 40;
    this.spacing = this.radius * 2 + 8;

    this.lastTap = 0;
    this.lastTapX = 0;
    this.lastTapY = 0;

    // Bind event handlers
    this._boundResize = this.resize.bind(this);
    this._boundPointerDown = this.onPointerDown.bind(this);
    this._boundPointerMove = this.onPointerMove.bind(this);
    this._boundPointerUp = this.onPointerUp.bind(this);
    this._boundDoubleClick = this.onDoubleClick.bind(this);
    this._boundKeyDown = this.onKeyDown.bind(this);
    this._boundContextMenu = this.onContextMenu.bind(this);

    this.resize();

    this.createCircleAtNext();
  }

  bindEvents() {
    window.addEventListener('resize', this._boundResize);
    this.canvas.addEventListener('pointerdown', this._boundPointerDown);
    this.canvas.addEventListener('pointermove', this._boundPointerMove);
    window.addEventListener('pointerup', this._boundPointerUp);
    this.canvas.addEventListener('dblclick', this._boundDoubleClick);
    document.addEventListener('keydown', this._boundKeyDown);
    document.addEventListener('contextmenu', this._boundContextMenu);
  }

  unbindEvents() {
    window.removeEventListener('resize', this._boundResize);
    this.canvas.removeEventListener('pointerdown', this._boundPointerDown);
    this.canvas.removeEventListener('pointermove', this._boundPointerMove);
    window.removeEventListener('pointerup', this._boundPointerUp);
    this.canvas.removeEventListener('dblclick', this._boundDoubleClick);
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('contextmenu', this._boundContextMenu);
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
    const circle = new Circle(x, y, this.radius, lines);
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

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.circles.forEach((c, idx) => {
      const selected = c === this.selectedCircle;
      const selectedLineIndex =
        this.selectedLine && this.selectedLine.circle === c
          ? this.selectedLine.index
          : null;
      drawCircle(this.ctx, c, { selected, selectedLineIndex });
      if (this.player.isPlaying() && c === this.player.currentCircle) {
        drawPlayhead(this.ctx, c, this.player.playheadAngle);
      }
    });
  }

  deleteSelection() {
    if (this.selectedLine) {
      const { circle, index } = this.selectedLine;
      circle.removeLine(index);
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
      hitCircle.addLine();
      this.selectedCircle = hitCircle;
      this.selectedLine = null;
      this.draw();
      return;
    }
    this.createCircleAtNext();
  }

  onPointerDown(e) {
    ensureAudio();
    const { x, y } = getCanvasPos(this.canvas, e);
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
          this.player.startAudition(c);
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
    const { x, y } = getCanvasPos(this.canvas, e);
    this.handleDoubleTap(x, y);
  }

  onPointerMove(e) {
    if (!this.draggingLine) return;
    const { x, y } = getCanvasPos(this.canvas, e);
    const c = this.draggingLine.circle;
    const angle = (Math.atan2(x - c.x, -(y - c.y)) + TAU) % TAU;
    const newIdx = c.updateLine(this.draggingLine.index, angle);
    this.draggingLine.index = newIdx;
    this.draw();
  }

  onPointerUp() {
    this.draggingLine = null;
    this.player.stopAudition();
  }

  onKeyDown(e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelection();
    }
  }

  onContextMenu(e) {
    e.preventDefault();
  }

  startPlayback() {
    this.player.start(this.circles);
  }

  stopPlayback() {
    this.player.stop();
  }

  isPlaying() {
    return this.player.isPlaying();
  }
}

