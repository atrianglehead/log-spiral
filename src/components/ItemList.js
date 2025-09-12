import { h } from '../lib/mini-preact.js';

export function ItemList({ items, onChange, label }) {
  return h('div', {},
    ...items.map((p,i) =>
      h('div', { key:p.id, class:'flex items-center gap-2 mb-1' },
        h('span', {}, (label||'Item')+' '+i),
        h('input', {
          type:'range', min:'-180', max:'180', value:p.angle,
          onInput:e=>onChange(p.id, parseInt(e.target.value,10))
        }),
        h('span', {}, p.angle + '°')
      )
    )
  );
}
