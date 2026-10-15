// studies.js : Tools > Studies - run the velocity and amount-rule studies and read results.
import { h, icon, clear, card, callout } from '../ui.js';
import { get } from '../api.js';
import { markdown } from '../markdown.js';
import { startTask } from '../runner_view.js';

const ABOUT = {
  velocity: ['Velocity rule study', 'Measures noise and card-testing detection for each candidate velocity configuration over three seeds (about 30 s).', 'docs/decisions/velocity_rule.md'],
  amount: ['Amount rule study', 'Compares the card, rolling-category and pre-aggregated category baselines for query 5 over three seeds (about 30 s).', 'docs/decisions/velocity_rule.md section 6'],
};

export async function renderStudies(box, info) {
  const result = h('div');
  const show = async (key) => {
    const f = await get('/api/file', { key: info.studies[key].file_key });
    clear(result, card(ABOUT[key][0] + ' - latest results', info.studies[key].results, h('div', { class: 'md', html: markdown(f.content) })));
  };
  clear(box, h('div', { class: 'grid g2' }, Object.entries(ABOUT).map(([key, [title, text, record]]) => card(title, text,
    h('div', { class: 'grid' }, h('p', { class: 'small muted' }, 'Decision record: ' + record),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => startTask('/api/tools/study', { name: key }, title + ' started - output below') }, icon('science'), 'Run study'),
        info.studies[key].exists ? h('button', { class: 'btn tonal', onclick: () => show(key) }, icon('description'), 'Show results') : null))))),
    callout('info', 'Results are written to docs/decisions/*_results.md, so they also appear under Project files. Re-run after changing the simulator or the queries.'),
    result);
  return show;
}