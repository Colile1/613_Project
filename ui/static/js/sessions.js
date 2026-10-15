// sessions.js : the saved-sessions dialog (switch, create, rename, delete, export, backup).
import { h, icon, num, dialog, snackbar, download, table, promptDialog, confirmDialog } from './ui.js';
import { get, post } from './api.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-ZA', { hour12: false }) : '-');
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

export async function openSessions(onChange) {
  const d = await get('/api/sessions');
  const name = h('input', { type: 'text', placeholder: 'New session name, e.g. Demo for marker', class: 'grow', 'aria-label': 'New session name' });
  const act = async (path, body, msg) => { await post(path, body); snackbar(msg); dlg.remove(); onChange(); };
  const rows = d.sessions.map((s) => ({ ...s, active: s.id === d.active }));
  const cols = [
    { key: 'name', label: 'Session', fmt: (v, r) => h('span', { class: 'row' }, r.active ? icon('radio_button_checked') : icon('radio_button_unchecked'), v) },
    { key: 'events', label: 'Events', num: true, fmt: num },
    { key: 'updated_at', label: 'Last saved', fmt: when },
    { key: 'id', label: '', fmt: (id, r) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      r.active ? null : h('button', { class: 'btn sm tonal', onclick: () => act('/api/sessions/switch', { id }, 'Opened ' + r.name) }, 'Open'),
      h('button', { class: 'icon-btn', title: 'Rename', onclick: async () => { const n = await promptDialog('Rename session', 'Name', r.name); if (n) act('/api/sessions/rename', { id, name: n }, 'Renamed'); } }, icon('edit')),
      h('button', { class: 'icon-btn', title: 'Export as JSON', onclick: async () => download(r.name.replace(/\W+/g, '_') + '.json', await get('/api/sessions/export', { id })) }, icon('download')),
      h('button', { class: 'icon-btn', title: 'Delete', onclick: async () => { if (await confirmDialog('Delete session?', 'Delete "' + r.name + '" and its ' + num(r.events) + ' events? This cannot be undone.')) act('/api/sessions/delete', { id }, 'Deleted ' + r.name); } }, icon('delete'))) },
  ];
  const st = d.storage;
  const dlg = dialog('Saved sessions', h('div', { class: 'grid' },
    h('p', { class: 'muted small' }, 'Every event, setting and page you open is saved as it happens, so closing the app or the browser never loses work. Open a session to continue exactly where it stopped.'),
    table(cols, rows, { height: '300px' }),
    h('div', { class: 'toolbar' }, name, h('button', { class: 'btn', onclick: () => act('/api/sessions/new', { name: name.value || 'Session ' + (rows.length + 1) }, 'New session started') }, icon('add'), 'New session')),
    h('dl', { class: 'kv' }, h('dt', {}, 'Database'), h('dd', {}, st.engine), h('dt', {}, 'File'), h('dd', {}, st.path),
      h('dt', {}, 'Size'), h('dd', {}, mb(st.size_bytes)), h('dt', {}, 'Stored events'), h('dd', {}, num(st.tables.events)),
      h('dt', {}, 'Last write'), h('dd', {}, when(st.saved_at)))),
    [h('button', { class: 'btn tonal', onclick: async () => { const r = await post('/api/sessions/backup'); snackbar('Backup written to ' + r.path); } }, icon('backup'), 'Back up database')]);
}