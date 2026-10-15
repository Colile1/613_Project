// backups.js : Tools > Backups & import - back up, restore any backup, import a session export.
import { h, icon, clear, card, callout, table, num, snackbar, confirmDialog } from '../ui.js';
import { post } from '../api.js';

export function renderBackups(box, info, refresh, refreshStatus) {
  const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Session export file' });
  const importIt = async () => {
    if (!file.files.length) return snackbar('Choose an exported session (.json) first.');
    let data;
    try { data = JSON.parse(await file.files[0].text()); } catch { return snackbar('That file is not valid JSON.'); }
    const r = await post('/api/tools/import', data);
    snackbar(r.error || `Imported "${r.name}" with ${num(r.events)} events and switched to it`);
    if (!r.error) refreshStatus(true);
  };
  const restore = async (name) => {
    if (!(await confirmDialog('Restore this backup?', `Replaces every session, saved query, view and setting with the contents of ${name}. The current database is backed up first, so this can be undone.`, 'Restore'))) return;
    const r = await post('/api/tools/restore', { name });
    snackbar(r.error || 'Restored. The previous state was saved as ' + (r.safety_backup || '').split(/[\\/]/).pop());
    refresh(); refreshStatus(true);
  };
  clear(box, h('div', { class: 'grid g2' },
    card('Backups', 'ui/data/backups/ - consistent copies of the whole database', h('div', { class: 'grid' },
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const r = await post('/api/sessions/backup'); snackbar('Backup written: ' + r.path.split(/[\\/]/).pop()); refresh(); } }, icon('backup'), 'Back up now')),
      table([{ key: 'name', label: 'File' }, { key: 'modified', label: 'Saved' }, { key: 'size_bytes', label: 'Size', num: true, fmt: (b) => (b / 1048576).toFixed(1) + ' MB' },
        { key: 'name', label: '', fmt: (n) => h('button', { class: 'btn tonal sm', onclick: () => restore(n) }, icon('settings_backup_restore'), 'Restore') }],
        info.backups, { empty: 'No backups yet.', height: '360px' }))),
    card('Import a session', 'A file exported from the Sessions dialog (top bar \u203a session chip \u203a download icon)', h('div', { class: 'grid' },
      file, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: importIt }, icon('upload_file'), 'Import and open')),
      callout('info', 'The import becomes a new session named "... (imported)"; nothing existing is changed.')))));
}