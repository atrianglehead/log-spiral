export function h(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() };
}

let rootComponent = null;
let rootContainer = null;
let hooks = [];
let effects = [];
let hookIndex = 0;

function createDom(node) {
  if (typeof node === 'string' || typeof node === 'number') {
    return document.createTextNode(node);
  }
  if (typeof node.type === 'function') {
    return createDom(node.type({ ...(node.props || {}), children: node.children }));
  }
  const dom = document.createElement(node.type);
  for (const [k, v] of Object.entries(node.props || {})) {
    if (k.startsWith('on') && typeof v === 'function') {
      dom.addEventListener(k.substring(2).toLowerCase(), v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(dom.style, v);
    } else if (k === 'ref' && v) {
       if (typeof v === 'function') v(dom); else v.current = dom;
    } else if (v !== false && v != null) {
      dom.setAttribute(k, v);
    }
  }
  node.children.forEach(c => dom.appendChild(createDom(c)));
  return dom;
}

function commit(vnode) {
  hookIndex = 0;
  effects = [];
  const dom = createDom(vnode);
  rootContainer.innerHTML = '';
  rootContainer.appendChild(dom);
  effects.forEach(f => f());
}

export function render(component, container) {
  rootComponent = component;
  rootContainer = container;
  commit(rootComponent());
}

export function useState(initial) {
  const i = hookIndex++;
  hooks[i] = hooks[i] ?? initial;
  const setState = v => {
    hooks[i] = typeof v === 'function' ? v(hooks[i]) : v;
    commit(rootComponent());
  };
  return [hooks[i], setState];
}

export function useEffect(effect, deps) {
  const i = hookIndex++;
  const prev = hooks[i];
  let changed = true;
  if (prev && deps) {
    changed = deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
    if (changed && prev.cleanup) prev.cleanup();
  }
  hooks[i] = { deps, effect };
  if (changed) {
    effects.push(() => {
      const cleanup = effect();
      if (cleanup) hooks[i].cleanup = cleanup;
    });
  }
}
