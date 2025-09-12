import { h, render, useEffect } from '../../lib/mini-preact.js';
import { CircleScore } from './CircleScore.js';

function CircleScoreApp() {
  const canvasRef = { current: null };
  const beatRef = { current: null };
  const playRef = { current: null };
  const deleteRef = { current: null };

  useEffect(() => {
    const score = new CircleScore(canvasRef.current, beatRef.current, playRef.current);
    score.bindEvents();
    playRef.current.addEventListener('click', () => {
      if (score.isPlaying()) score.stopPlayback();
      else score.startPlayback();
    });
    deleteRef.current.addEventListener('click', () => score.deleteSelection());
  }, []);

  return h('div', { class: 'h-full flex flex-col' },
    h('canvas', { ref: canvasRef, class: 'flex-1 block bg-neutral-200' }),
    h('div', { class: 'bg-neutral-800 p-2 flex items-center gap-2' },
      h('button', { ref: playRef, class: 'bg-neutral-700 rounded px-2 py-1' }, '▶'),
      h('label', { class: 'flex items-center gap-1' }, 'Beats:',
        h('input', { ref: beatRef, class: 'w-10 text-neutral-800', type: 'number', min: '0', max: '9', value: '4' })),
      h('button', { ref: deleteRef, class: 'bg-neutral-700 rounded px-2 py-1' }, 'Delete')
    )
  );
}

render(CircleScoreApp, document.getElementById('app'));
