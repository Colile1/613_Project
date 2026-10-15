// tools.js : Tools page - everything that used to need a terminal or a text editor:
// studies, reference data, diagram and screenshots, todo/log tracking, backups and import.
import { h, clear, card, pageHead, tabs } from '../ui.js';
import { get } from '../api.js';
import { pref, setPref } from '../prefs.js';
import { runConsole } from '../runner_view.js';
import { renderStudies } from '../tools/studies.js';
import { renderReference } from '../tools/reference.js';
import { renderMedia } from '../tools/media.js';
import { renderTracking } from '../tools/tracking.js';
import { renderBackups } from '../tools/backups.js';

const TABS = [{ key: 'studies', label: 'Studies', icon: 'science' }, { key: 'reference', label: 'Reference data', icon: 'badge' },
  { key: 'media', label: 'Diagram & screenshots', icon: 'photo_camera' }, { key: 'tracking', label: 'Todo & log', icon: 'checklist' },
  { key: 'backups', label: 'Backups & import', icon: 'backup' }];
let refs = {}, tab = 'studies', ctxRef = null, showStudy = null;

async function render() {
  const info = await get('/api/tools');
  clear(refs.tabs, tabs(TABS, tab, (k) => { tab = k; setPref('tools.tab', k); render(); }));
  const box = h('div', { class: 'grid' });
  clear(refs.body, box);
  if (tab === 'studies') showStudy = await renderStudies(box, info);
  else if (tab === 'reference') renderReference(box, info);
  else if (tab === 'media') renderMedia(box, info);
  else if (tab === 'tracking') await renderTracking(box);
  else renderBackups(box, info, render, ctxRef.refreshStatus);
}

// When a task finishes, refresh what it changed.
function finished(label) {
  if (!label) return;
  if (label.startsWith('study:') && tab === 'studies' && showStudy) render().then(() => showStudy(label.slice(6)));
  else if (tab === 'media' || tab === 'reference') render();
}

export default {
  async mount(root, ctx) {
    ctxRef = ctx;
    tab = ctx.sub || pref('tools.tab', 'studies');
    refs = { tabs: h('div'), body: h('div', { style: { marginTop: '16px' } }) };
    root.append(pageHead('Tools', 'Project tools',
      'Run the decision studies, regenerate reference data, rebuild the architecture figure, capture screenshots, keep todo.md and log.md up to date, and manage backups - all without a terminal.'),
      h('div', {}, refs.tabs, refs.body), card('Task output', 'Live output of studies, generators and captures', runConsole({ history: true, onFinish: finished })));
    await render();
  },
};