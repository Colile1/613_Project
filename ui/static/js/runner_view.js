// runner_view.js : live output of background tasks (producer, pip, az, deploy, studies,
// screenshots). One task runs at a time; output and history are saved in the database.
import { h, clear, table, time, snackbar, chip } from './ui.js';
import { get, post } from './api.js';

// Starts a task through `path`; shows the result in a snackbar.
export async function startTask(path, body = {}, okMessage = 'Started') {
  const r = await post(path, body);
  snackbar(r.error ? r.error : r.ok === false ? 'Another task is already running - wait or stop it first.' : okMessage);
  return r;
}

// A console that polls the runner while it is on screen. opts.history adds the run table;
// opts.onFinish(label) is called once when a task finishes.
export function runConsole(opts = {}) {
  const head = h('div', { class: 'row between' });
  const pre = h('pre', { class: 'console', 'aria-live': 'polite' }, 'Output of tasks started on this page appears here.');
  const hist = h('div');
  const el = h('div', { class: 'grid' }, head, pre, opts.history ? h('div', {}, h('h4', {}, 'Run history (saved)'), hist) : null);
  let wasRunning = null, timer = null;
  const poll = async () => {
    if (!document.body.contains(el)) { clearInterval(timer); return; }
    const d = (await get('/api/azure')).runner;
    clear(head, h('div', { class: 'chips' }, d.label ? chip(d.label, d.running ? 'good' : '', d.running ? 'sync' : 'task_alt') : null,
      chip(d.running ? 'running' : 'idle', d.running ? 'good' : '')),
      d.running ? h('button', { class: 'btn outlined sm', onclick: () => startTask('/api/azure/stop', {}, 'Stopping...') }, 'Stop task') : null);
    pre.textContent = d.lines.length ? d.lines.join('\n') : 'Output of tasks started on this page appears here.';
    pre.scrollTop = pre.scrollHeight;
    if (opts.history) {
      clear(hist, table([{ key: 'id', label: '#', num: true }, { key: 'label', label: 'Task' }, { key: 'command', label: 'Command' },
        { key: 'started_at', label: 'Started', fmt: time }, { key: 'ended_at', label: 'Ended', fmt: (v) => (v ? time(v) : 'running') },
        { key: 'exit_code', label: 'Result', fmt: (v, r) => (!r.ended_at ? 'running' : v === 0 ? 'ok' : v === -1 ? 'interrupted (app closed)' : 'exit ' + v) }],
        d.history, { empty: 'No tasks yet.', height: '260px' }));
    }
    if (wasRunning && !d.running && opts.onFinish) opts.onFinish(d.label, d.lines);
    wasRunning = d.running;
  };
  setTimeout(() => { poll(); timer = setInterval(poll, 1200); }, 0);
  return el;
}