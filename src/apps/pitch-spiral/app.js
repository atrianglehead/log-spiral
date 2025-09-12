import { h, render, useState } from '../../lib/mini-preact.js';
import { SpiralCanvas } from '../../components/SpiralCanvas.js';
import { ItemList } from '../../components/ItemList.js';

function PitchSpiralApp() {
  const [pitches, setPitches] = useState([{ id: 0, angle: 0 }]);
  const [nextId, setNextId] = useState(1);

  function addPitch(angle = 0) {
    setPitches([...pitches, { id: nextId, angle }]);
    setNextId(nextId + 1);
  }

  function changePitch(id, angle) {
    setPitches(pitches.map(p => p.id === id ? { ...p, angle } : p));
  }

  return h('div', { class: 'h-full flex flex-col' },
    h(SpiralCanvas, { items: pitches, onAdd: addPitch }),
    h('div', { class: 'p-2 bg-neutral-800 flex-1 overflow-auto' },
      h(ItemList, { items: pitches, onChange: changePitch, label: 'Pitch' }),
      h('button', { onClick: () => addPitch(0), class: 'mt-2 bg-neutral-700 rounded px-2 py-1' }, '+')
    )
  );
}

render(PitchSpiralApp, document.getElementById('app'));
