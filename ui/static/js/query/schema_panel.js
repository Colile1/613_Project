// schema_panel.js : tables, views and columns of the warehouse. Every item can be
// dragged into the visual builder; clicking adds it (builder) or inserts its name (SQL).
import { h, icon, clear, num } from '../ui.js';
import { makeDraggable } from './dnd.js';
import { pref, setPref } from '../prefs.js';

export function renderSchema(box, schema, handlers) {
  const open = new Set(pref('query.open', ['transactions']));
  let filter = '';
  const list = h('div', { class: 'grid', style: { gap: '2px' } });
  const draw = () => clear(list, schema.tables.map((t) => {
    const cols = t.columns.filter((c) => !filter || c.name.includes(filter) || t.name.includes(filter));
    if (filter && !cols.length) return null;
    const expanded = open.has(t.name) || !!filter;
    const head = makeDraggable(h('button', { class: 'schema-head', title: t.description + ' \u00b7 ' + t.location + ' \u00b7 drag into the builder, or click to expand',
      onclick: () => { expanded ? open.delete(t.name) : open.add(t.name); setPref('query.open', [...open]); draw(); } },
      icon(expanded ? 'expand_more' : 'chevron_right'), icon(t.kind === 'saved view' ? 'bookmark' : t.kind === 'view' ? 'layers' : 'table_chart'), h('span', { class: 'name' }, t.name),
      h('span', { class: 'meta' }, num(t.rows))), { kind: 'table', table: t.name });
    const use = h('button', { class: 'icon-btn', title: 'Use ' + t.name, style: { width: '28px', height: '28px' }, onclick: () => handlers.onTable(t.name) }, icon('add'));
    const del = t.kind === 'saved view' && handlers.onDeleteView ? h('button', { class: 'icon-btn', title: 'Delete view ' + t.name, style: { width: '28px', height: '28px' }, onclick: () => handlers.onDeleteView(t.name) }, icon('delete')) : null;
    return h('div', { class: 'schema-table' }, h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '0' } }, head, use, del),
      expanded ? h('div', { class: 'schema-cols' }, cols.map((c) => makeDraggable(
        h('button', { class: 'schema-col', title: `${t.name}.${c.name} (${c.type}) \u00b7 drag into a zone, or click to add`, onclick: () => handlers.onColumn(t.name, c.name, c.type) },
          c.name, h('span', { class: 'type-badge' }, c.type === 'BOOLEAN' ? 'BOOL' : c.type === 'INTEGER' ? 'INT' : c.type)),
        { kind: 'column', table: t.name, field: c.name, type: c.type }))) : null);
  }));
  clear(box,
    h('div', { class: 'row between', style: { marginBottom: '8px' } }, h('h3', {}, 'Warehouse schema'), h('span', { class: 'small muted' }, num(schema.tables.length) + ' tables')),
    h('input', { type: 'search', placeholder: 'Find a table or column', 'aria-label': 'Find a table or column', style: { width: '100%', marginBottom: '8px' },
      oninput: (e) => { filter = e.target.value.trim().toLowerCase(); draw(); } }),
    list,
    h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Views aggregates and fraud_alerts match the Cosmos DB containers (and the Power BI tables). Bookmarked entries are your saved views.'));
  draw();
}