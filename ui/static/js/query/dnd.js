// dnd.js : HTML5 drag-and-drop helpers shared by the schema panel and the builder.
const TYPE = 'text/plain';

export function makeDraggable(el, payload) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData(TYPE, 'qb:' + JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy'; });
  return el;
}

export function dropZone(el, onDrop) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('over'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('over');
    const text = e.dataTransfer.getData(TYPE);
    if (text.startsWith('qb:')) onDrop(JSON.parse(text.slice(3)));
  });
  return el;
}