import { CircleScore } from './CircleScore.js';

const canvas = document.getElementById('score');
canvas.style.touchAction = 'none';
document.addEventListener('contextmenu', e => e.preventDefault());
const beatInput = document.getElementById('beatCount');
const playButton = document.getElementById('play');
const deleteButton = document.getElementById('delete');

const score = new CircleScore(canvas, beatInput, playButton);

playButton.addEventListener('click', () => {
  if (score.isPlaying()) {
    score.stopPlayback();
  } else {
    score.startPlayback();
  }
});

deleteButton.addEventListener('click', () => score.deleteSelection());

canvas.addEventListener('pointerdown', e => score.onPointerDown(e));
canvas.addEventListener('pointermove', e => score.onPointerMove(e));
window.addEventListener('pointerup', () => score.onPointerUp());
canvas.addEventListener('dblclick', e => score.onDoubleClick(e));
document.addEventListener('keydown', e => score.onKeyDown(e));
