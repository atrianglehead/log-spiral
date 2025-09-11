import { CircleScore } from './CircleScore.js';

const canvas = document.getElementById('score');
const beatInput = document.getElementById('beatCount');
const playButton = document.getElementById('play');
const deleteButton = document.getElementById('delete');

const score = new CircleScore(canvas, beatInput, playButton);
score.bindEvents();

playButton.addEventListener('click', () => {
  if (score.isPlaying()) {
    score.stopPlayback();
  } else {
    score.startPlayback();
  }
});

deleteButton.addEventListener('click', () => score.deleteSelection());
