// tracking.js : Tools > Tracking - tick todo.md items and add log.md entries (rules.md format).
import { h, icon, clear, card, snackbar } from '../ui.js';
import { get, post } from '../api.js';

export async function renderTracking(box) {
  const [todo, log] = await Promise.all([get('/api/tools/todo'), get('/api/tools/log', { limit: 5 })]);
  const redraw = () => renderTracking(box);
  const sectionSel = h('select', { 'aria-label': 'Section' }, todo.sections.map((s) => h('option', { value: s.title }, s.title)));
  const newItem = h('input', { type: 'text', placeholder: 'New task', 'aria-label': 'New task', class: 'grow' });
  const f = { title: h('input', { type: 'text', placeholder: 'Title, e.g. Deployed to Azure', 'aria-label': 'Entry title', style: { width: '100%' } }) };
  for (const k of ['what', 'why', 'impact']) f[k] = h('textarea', { rows: 2, 'aria-label': k, placeholder: { what: 'What was done', why: 'Why', impact: 'Impact on the system' }[k], class: 'plain-ta' });
  clear(box, h('div', { class: 'grid g2' },
    card('todo.md', `${todo.done} of ${todo.total} done - ticking writes straight to the file`, h('div', { class: 'grid' },
      h('div', { class: 'toolbar' }, sectionSel, newItem, h('button', { class: 'btn sm', onclick: async () => {
        const r = await post('/api/tools/todo/add', { section: sectionSel.value, text: newItem.value });
        snackbar(r.error || 'Task added'); if (!r.error) redraw();
      } }, icon('add'), 'Add')),
      h('div', { style: { maxHeight: '560px', overflow: 'auto' } }, todo.sections.map((s) => h('div', { style: { marginBottom: '10px' } },
        h('h4', {}, s.title, ' ', h('span', { class: 'small muted' }, `${s.items.filter((i) => i.done).length}/${s.items.length}`)),
        s.items.map((it) => h('label', { class: 'row small', style: { alignItems: 'flex-start', flexWrap: 'nowrap', paddingLeft: (it.indent * 20) + 'px', margin: '4px 0' } },
          h('input', { type: 'checkbox', checked: it.done, onchange: async (e) => {
            const r = await post('/api/tools/todo/set', { line: it.line, text: it.text, done: e.target.checked });
            if (r.error) { snackbar(r.error); redraw(); }
          } }), h('span', { style: { textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.7 : 1 } }, it.text)))))))),
    card('log.md', `${log.count} entries - new entries use the What / Why / Impact format from rules.md`, h('div', { class: 'grid' },
      f.title, f.what, f.why, f.impact,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => {
        const r = await post('/api/tools/log/add', { title: f.title.value, what: f.what.value, why: f.why.value, impact: f.impact.value });
        snackbar(r.error || 'Log entry added'); if (!r.error) redraw();
      } }, icon('post_add'), 'Add entry')),
      h('h4', {}, 'Latest entries'),
      log.entries.map((e) => h('details', { class: 'card outlined', style: { padding: '8px 12px' } }, h('summary', {}, e.title), h('p', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, e.body)))))));
}