import { TAU, radiusAt } from '../../lib/spiralMath.js';
import { resetAudioProgress } from './audio.js';

export const state = {
  x: 120,                  // base length (px) for fundamental radius
  rotations_N: 5,          // integer number of full rotations
  theta: 0,                // current angle
  dTheta: 0.072,           // default speed (rad/frame)
  path: [],                // sampled tip positions
  paused: true,            // start paused
  finished: false,
  kFilter: 1,              // show/beep multiples of k
  revealMode: 'all',       // 'all' | 'progressive'
};

export const margin = 32;
export const MARKER_CAP = 20000;
export const FILTER_LIST_MAX = 500;

export const MIN_SPEED = 0.002;
export const MAX_SPEED = 0.5;
export function sliderToSpeed(val01) {
  return MIN_SPEED * Math.pow(MAX_SPEED / MIN_SPEED, val01);
}
export function speedToSlider(dt) {
  return (Math.log(dt) - Math.log(MIN_SPEED)) / (Math.log(MAX_SPEED) - Math.log(MIN_SPEED));
}

export function setRotations(N) {
  state.rotations_N = Math.max(0, Math.floor(N));
  resetPathOnly();
}

export function setX(nx) {
  state.x = nx;
  resetPathOnly();
  resetAudioProgress();
}

export function resetSketch() {
  state.theta = 0;
  state.path = [];
  state.paused = true;
  state.finished = false;
  resetAudioProgress();
}

export function resetPathOnly() {
  state.theta = 0;
  state.path = [];
  state.finished = false;
  resetAudioProgress();
}

export function restartAndPlay() {
  resetPathOnly();
  state.paused = false;
}

export function getFinalAndMax() {
  const N = Math.max(0, Math.floor(state.rotations_N));
  const maxTheta = TAU * N;
  const finalR_unscaled = radiusAt(state.x, maxTheta); // x * 2^N
  const turns = N;
  const finalMultipleK = Math.pow(2, N); // 1..2^N (markers/beeps may stop earlier due to 20kHz)
  return { finalR_unscaled, maxTheta, turns, finalMultipleK };
}
