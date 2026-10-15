// reference.js : Tools > Reference data - regenerate card_metadata.json with any card count.
import { h, icon, clear, card, callout, num, snackbar, confirmDialog } from '../ui.js';
import { post } from '../api.js';
import { startTask } from '../runner_view.js';

export function renderReference(box, info) {
  const count = h('input', { type: 'number', min: 50, max: 50000, step: 50, value: info.cards, style: { width: '120px' }, 'aria-label': 'Number of cards' });
  const regen = async () => {
    if (!(await confirmDialog('Regenerate the card reference data?', `Writes reference_data/card_metadata.json with ${num(+count.value)} cards. The original 50 cards are kept; the rest are generated the same way every time (seeded). This changes the velocity rule's behaviour - see docs/decisions/velocity_rule.md.`, 'Regenerate'))) return;
    startTask('/api/tools/cards', { count: +count.value }, 'Generating cards - press "Use new cards" when it finishes');
  };
  clear(box, card('Card reference data', `Currently ${num(info.cards)} cards in reference_data/card_metadata.json (the simulator draws its card ids from this file)`,
    h('div', { class: 'grid' },
      h('div', { class: 'toolbar' }, h('label', { class: 'row small' }, 'Cards', count),
        h('button', { class: 'btn', onclick: regen }, icon('autorenew'), 'Regenerate'),
        h('button', { class: 'btn tonal', onclick: async () => { const r = await post('/api/tools/reload-cards'); snackbar(`Now using ${num(r.cards)} cards`); } }, icon('sync'), 'Use new cards')),
      callout('info', ['After regenerating: "Use new cards" reloads the file into this app (new events use the new pool; start a new session for a clean comparison). For Azure, upload it on Azure \u203a Deploy and restart the Stream Analytics job.']))));
}