// main.js : app shell - navigation rail, router, simulation controls, polling.
// State lives in the server's SQLite database: the open session, the last page,
// tabs, filters and theme are restored on every start and shared by all tabs.
import { h, icon, clear, num, time, snackbar, dialog } from './ui.js';
import { get, post } from './api.js';
import { loadPrefs, pref, setPref, prefsChangedElsewhere } from './prefs.js';
import { openSessions } from './sessions.js';
import overview from './views/overview.js';
import extract from './views/extract.js';
import ingest from './views/ingest.js';
import transform from './views/transform.js';
import warehouse from './views/warehouse.js';
import query from './views/query.js';
import analytics from './views/analytics.js';
import azure from './views/azure.js';
import tools from './views/tools.js';
import docs from './views/docs.js';
import guide from './views/guide.js';
import about from './views/about.js';

const NAV = [
  { key: 'overview', label: 'Overview', icon: 'dashboard', view: overview },
  { key: 'extract', label: 'Extract', icon: 'input', step: 1, view: extract },
  { key: 'ingest', label: 'Ingest', icon: 'move_to_inbox', step: 2, view: ingest },
  { key: 'transform', label: 'Transform', icon: 'transform', step: 3, view: transform },
  { key: 'warehouse', label: 'Warehouse', icon: 'database', step: 4, view: warehouse },
  { key: 'query', label: 'Query', icon: 'manage_search', view: query },
  { key: 'analytics', label: 'Analytics', icon: 'monitoring', step: 5, view: analytics },
  'divider',
  { key: 'azure', label: 'Azure', icon: 'cloud', view: azure },
  { key: 'tools', label: 'Tools', icon: 'build', view: tools },
  { key: 'docs', label: 'Project files', icon: 'folder_open', view: docs },
  { key: 'guide', label: 'User guide', icon: 'menu_book', view: guide },
  { key: 'about', label: 'About', icon: 'info', view: about },
];

const state = { status: null, route: null, sub: null, current: null, lastSeen: null, busy: false, sessionId: null };
const main = document.getElementById('main');

export function go(route, sub) { location.hash = '#/' + route + (sub ? '/' + sub : ''); }
const ctx = () => ({ status: state.status, sub: state.sub, go, refreshStatus: pollStatus });

function renderRail() {
  clear(document.getElementById('rail'), NAV.map((n) => n === 'divider' ? h('div', { class: 'divider' }) :
    h('a', { href: '#/' + n.key, class: n.key === state.route ? 'active' : '', 'aria-current': n.key === state.route ? 'page' : null },
      h('span', { class: 'pill' }, icon(n.icon), n.step ? h('span', { class: 'step' }, n.step) : null), n.label)));
}

async function route() {
  if (!location.hash) { location.replace('#/' + pref('route', 'overview')); return; }
  const [r, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const item = NAV.find((n) => n.key === r) || NAV[0];
  if (item.key !== state.route) main.scrollTop = 0;
  state.route = item.key;
  state.sub = sub || null;
  setPref('route', item.key + (sub ? '/' + sub : ''));
  renderRail();
  state.current = item.view;
  const page = h('div', { class: 'page' });
  clear(main, page);
  await item.view.mount(page, ctx());
  state.lastSeen = signature();
}

const signature = () => state.status ? state.status.sim.session_id + '|' + state.status.sim.events + '|' + state.status.watermark : '';

function renderSimControls() {
  const s = state.status?.sim;
  if (!s) return;
  const speed = h('select', { 'aria-label': 'Simulation speed', title: 'Simulated seconds per real second',
    onchange: (e) => post('/api/sim/speed', { speed: +e.target.value }).then(pollStatus) },
    [1, 5, 10, 30, 60].map((v) => h('option', { value: v, selected: v === s.speed }, v + 'x')));
  const saved = state.status.storage.saved_at;
  clear(document.getElementById('sim-controls'),
    h('button', { class: 'chip on', title: 'Saved sessions (last saved ' + time(saved) + ')', onclick: () => openSessions(() => pollStatus(true)) },
      icon('save'), s.session_name),
    h('span', { class: 'chip ' + (s.running ? 'good' : ''), title: 'Simulated clock' },
      h('span', { class: 'pulse' + (s.running ? ' on' : '') }), num(s.events) + ' events', ' \u00b7 ', time(s.sim_clock), s.burst ? ' \u00b7 burst' : ''),
    h('button', { class: 'icon-btn filled', title: s.running ? 'Pause stream' : 'Start live stream', 'aria-label': s.running ? 'Pause' : 'Play',
      onclick: () => post(s.running ? '/api/sim/stop' : '/api/sim/start', { speed: +speed.value }).then(pollStatus) }, icon(s.running ? 'pause' : 'play_arrow')),
    speed,
    h('button', { class: 'icon-btn', title: 'Generate 1 simulated minute instantly', onclick: () => post('/api/sim/advance', { seconds: 60 }).then(() => { snackbar('Added 1 simulated minute of traffic'); pollStatus(true); }) }, icon('fast_forward')),
    h('button', { class: 'icon-btn', title: 'Trigger a burst (5x rate for 30 s)', onclick: () => post('/api/sim/burst').then(() => snackbar('Burst triggered')) }, icon('bolt')),
    h('button', { class: 'icon-btn', title: 'Clear this session\u2019s events', onclick: confirmReset }, icon('restart_alt')));
}

function confirmReset() {
  const d = dialog('Clear this session?', h('p', {}, 'This deletes every event of "' + state.status.sim.session_name + '" from the database and restarts its clock. Settings and other sessions are kept. Azure is not touched. Tip: start a new session instead to keep this one.'),
    [h('button', { class: 'btn danger', onclick: async () => { await post('/api/sim/reset'); d.remove(); snackbar('Session cleared'); pollStatus(true); } }, 'Clear events')]);
}

function welcomeBack(s) {
  if (s.was_running) {
    const d = dialog('Welcome back', h('p', {}, `Session "${s.session_name}" was restored with ${num(s.events)} events. The live stream was running when the app closed. Continue it?`),
      [h('button', { class: 'btn', onclick: async () => { await post('/api/sim/start', { speed: s.speed }); d.remove(); pollStatus(true); } }, icon('play_arrow'), 'Resume stream')]);
  } else if (s.restored_events) {
    snackbar(`Welcome back - "${s.session_name}" restored with ${num(s.events)} events`);
  }
}

async function pollStatus(force = false) {
  try { state.status = await get('/api/status'); } catch { return; }
  const s = state.status.sim;
  renderSimControls();
  if (prefsChangedElsewhere(state.status.prefs_rev)) { await loadPrefs(); applyTheme(); }
  if (state.sessionId !== null && s.session_id !== state.sessionId) {
    state.sessionId = s.session_id;
    snackbar('Now working in "' + s.session_name + '"');
    return route();
  }
  state.sessionId = s.session_id;
  const sig = signature();
  if ((force === true || sig !== state.lastSeen) && state.current?.update && !state.busy) {
    state.busy = true;
    state.lastSeen = sig;
    try { await state.current.update(ctx()); } finally { state.busy = false; }
  }
}

function applyTheme() {
  const t = pref('theme', null);
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}

function initTheme() {
  applyTheme();
  document.getElementById('theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    setPref('theme', dark ? 'light' : 'dark');
    applyTheme();
  });
}

await loadPrefs();
initTheme();
window.addEventListener('hashchange', route);
await pollStatus();
welcomeBack(state.status.sim);
await route();
setInterval(pollStatus, 1500);