import { h, render, useState } from '../../lib/mini-preact.js';
import { SpiralCanvas } from '../../components/SpiralCanvas.js';
import { ItemList } from '../../components/ItemList.js';

function TempoSpiralApp() {
  const [tempos, setTempos] = useState([{ id: 0, angle: 0 }]);
  const [nextId, setNextId] = useState(1);

  function addTempo(angle = 0) {
    setTempos([...tempos, { id: nextId, angle }]);
    setNextId(nextId + 1);
  }

  function changeTempo(id, angle) {
    setTempos(tempos.map(p => p.id === id ? { ...p, angle } : p));
  }

  return h('div', { class: 'h-full flex flex-col' },
    h(SpiralCanvas, { items: tempos, onAdd: addTempo }),
    h('div', { class: 'p-2 bg-neutral-800 flex-1 overflow-auto' },
      h(ItemList, { items: tempos, onChange: changeTempo, label: 'Tempo' }),
      h('button', { onClick: () => addTempo(0), class: 'mt-2 bg-neutral-700 rounded px-2 py-1' }, '+')
    )
  );
}

render(TempoSpiralApp, document.getElementById('app'));
