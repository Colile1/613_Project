// cost.js : Azure page > Cost - estimator plus a saved session cost log that can be
// written into docs/cost_tracking.md.
import { h, icon, clear, card, callout, table, snackbar } from '../ui.js';
import { get, post } from '../api.js';

const RATES = [['Event Hubs (Standard, 1 TU)', 0.11], ['Stream Analytics (per SU)', 0.11], ['Cosmos DB (3 x 400 RU/s)', 0.10]];
const hourly = (su) => RATES.reduce((a, [, r], i) => a + r * (i === 1 ? su : 1), 0);

export async function renderCost(box) {
  const s = { hours: 10, su: 1 };
  const out = h('div'), log = h('div');
  const calc = () => {
    const rows = RATES.map(([name, rate], i) => [name, rate * (i === 1 ? s.su : 1) * s.hours]);
    const total = rows.reduce((a, r) => a + r[1], 0);
    clear(out, h('dl', { class: 'kv' }, rows.flatMap(([n, c]) => [h('dt', {}, n), h('dd', {}, '$' + c.toFixed(2))]),
      h('dt', {}, h('b', {}, 'Estimated total')), h('dd', {}, h('b', {}, '$' + total.toFixed(2) + ' of the $100 credit (' + total.toFixed(1) + '%)'))),
      total > 10 ? callout('warning', 'Above the ~$10 target. Stop the ASA job between sessions - it is the biggest cost lever.', 'warn') : callout('check_circle', 'Within the ~$10 project target.'));
  };
  const slider = (key, label, min, max) => { const b = h('b', {}, s[key]); return h('div', { class: 'field' }, h('label', {}, label, b),
    h('input', { type: 'range', min, max, value: s[key], oninput: (e) => { s[key] = +e.target.value; b.textContent = s[key]; calc(); } })); };
  const day = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), 'aria-label': 'Date' });
  const name = h('input', { type: 'text', placeholder: 'e.g. Demo run, 10-min test', 'aria-label': 'Session', style: { width: '200px' } });
  const hours = h('input', { type: 'number', min: 0, step: 0.25, value: 1, 'aria-label': 'Active hours', style: { width: '90px' } });
  const costIn = h('input', { type: 'number', min: 0, step: 0.01, placeholder: 'from estimate', 'aria-label': 'Cost in USD', style: { width: '120px' } });
  const drawLog = async () => {
    const d = await get('/api/azure/cost-log');
    const total = d.entries.length ? d.entries[d.entries.length - 1].running_total : 0;
    clear(log, table([{ key: 'day', label: 'Date' }, { key: 'session', label: 'Session' }, { key: 'hours', label: 'Hours', num: true },
      { key: 'cost_usd', label: 'Cost', num: true, fmt: (v) => '$' + v.toFixed(2) }, { key: 'running_total', label: 'Running total', num: true, fmt: (v) => '$' + v.toFixed(2) },
      { key: 'id', label: '', fmt: (id) => h('button', { class: 'icon-btn', title: 'Delete', onclick: async () => { await post('/api/azure/cost-log/delete', { id }); drawLog(); } }, icon('delete')) }],
      d.entries, { empty: 'No sessions logged yet.' }),
      h('p', { class: 'small muted' }, `Total so far: $${total.toFixed(2)} of $100 (${total.toFixed(1)}%).`));
  };
  const add = async () => {
    const cost = costIn.value !== '' ? +costIn.value : +(hourly(s.su) * +hours.value).toFixed(2);
    await post('/api/azure/cost-log/add', { day: day.value, session: name.value || 'Session', hours: +hours.value, cost_usd: cost });
    name.value = ''; costIn.value = '';
    snackbar('Logged $' + cost.toFixed(2));
    drawLog();
  };
  calc();
  clear(box, h('div', { class: 'grid g2' },
    card('Cost estimator', 'Hourly rates from docs/cost_tracking.md (USD)',
      h('div', { class: 'grid' }, slider('hours', 'Active hours with everything running', 1, 100), slider('su', 'Stream Analytics streaming units', 1, 6), out)),
    card('Before deleting resources, capture', null, h('ul', {}, ['Event Hubs metrics (incoming messages, throughput)', 'ASA metrics (input/output events, watermark delay, SU %)', 'Cosmos DB document counts for all 3 containers', 'Power BI screenshots of every page', 'Budget alerts at $20 / $50 / $80'].map((t) => h('li', {}, t))))),
    card('Session cost log', 'Saved in the app database; "Write to cost_tracking.md" updates the Session Log table in the docs',
      h('div', { class: 'grid' },
        h('div', { class: 'toolbar' }, day, name, h('label', { class: 'row small' }, 'Hours', hours), h('label', { class: 'row small' }, 'Cost $', costIn),
          h('button', { class: 'btn', onclick: add }, icon('add'), 'Log session'),
          h('button', { class: 'btn tonal', onclick: async () => { const r = await post('/api/azure/cost-log/write-doc'); snackbar(r.error || `Wrote ${r.rows} rows to docs/cost_tracking.md`); } }, icon('edit_document'), 'Write to cost_tracking.md')),
        log)));
  drawLog();
}