// deploy.js : Azure page > Deploy - sign in, deploy, start/stop the Stream Analytics job,
// upload the card reference data and delete everything, each with a confirmation.
import { h, icon, clear, card, callout, snackbar, confirmDialog, dialog } from '../ui.js';
import { get } from '../api.js';
import { pref, setPref } from '../prefs.js';
import { startTask } from '../runner_view.js';

const FIELDS = [['resource_group', 'Resource group'], ['location', 'Region'], ['namespace', 'Event Hubs namespace'], ['cosmos', 'Cosmos DB account'], ['storage', 'Storage account'], ['job', 'Stream Analytics job']];

export async function renderDeploy(box, commands) {
  const d = await get('/api/azure/settings');
  const names = { ...d.defaults, ...pref('azure.names', {}) };
  const inputs = FIELDS.map(([k, label]) => h('div', { class: 'field' }, h('label', {}, label),
    h('input', { type: 'text', value: names[k], 'aria-label': label, oninput: (e) => { names[k] = e.target.value.trim(); setPref('azure.names', names); } })));
  const go = async (action, title, text, button = 'Continue', danger = false) => {
    if (title && !(await confirmDialog(title, text, button))) return;
    startTask('/api/azure/deploy', { action, ...names }, 'Started ' + action + ' - follow the output below');
  };
  const deleteAll = () => {
    const input = h('input', { type: 'text', placeholder: names.resource_group, 'aria-label': 'Type the resource group name', style: { width: '100%' } });
    const dlg = dialog('Delete every Azure resource?', h('div', {},
      h('p', {}, 'This deletes the resource group ' + names.resource_group + ' and everything in it (Event Hubs, Cosmos DB with its documents, storage, the Stream Analytics job). It cannot be undone.'),
      h('p', { class: 'muted' }, 'Capture your metrics and Power BI screenshots first. Type the resource group name to confirm:'), input),
      [h('button', { class: 'btn danger', onclick: () => { if (input.value.trim() !== names.resource_group) return snackbar('The name does not match.'); dlg.remove(); go('delete'); } }, icon('delete_forever'), 'Delete everything')]);
  };
  const disabled = !d.az;
  clear(box,
    disabled ? callout('warning', ['Azure CLI not found on this computer. Install it from https://aka.ms/installazurecli, restart the app, then use these buttons. Until then the commands at the bottom can be copied into a terminal.'], 'warn') : null,
    card('Names', 'Used by every button below (saved for next time)', h('div', { class: 'grid g3' }, inputs)),
    card('Actions', 'Each runs in the background; output appears below and is kept in the run history', h('div', { class: 'grid' },
      h('div', { class: 'row' },
        h('button', { class: 'btn tonal', disabled, onclick: () => startTask('/api/azure/login', {}, 'A browser window opens for the Azure sign-in') }, icon('login'), '1. Sign in (az login)'),
        h('button', { class: 'btn', disabled, onclick: () => go('deploy', 'Deploy to Azure?', 'Creates the resource group, Event Hubs, Cosmos DB, storage (with the card reference data) and the Stream Analytics job. These resources cost money while they exist (about $0.32 per active hour).', 'Deploy') }, icon('rocket_launch'), '2. Deploy everything'),
        h('button', { class: 'btn tonal', disabled, onclick: () => go('start', 'Start the Stream Analytics job?', 'Billing for the job starts now (about $0.11 per streaming unit per hour). Stop it when you are done.', 'Start job') }, icon('play_arrow'), '3. Start ASA job'),
        h('button', { class: 'btn tonal', disabled, onclick: () => go('stop') }, icon('stop'), 'Stop ASA job')),
      h('div', { class: 'row' },
        h('button', { class: 'btn outlined', disabled, onclick: () => go('upload-cards', 'Upload card_metadata.json?', 'Replaces the reference data blob. Restart the Stream Analytics job afterwards so it reads the new file.', 'Upload') }, icon('upload'), 'Upload card reference data'),
        h('button', { class: 'btn danger', disabled, onclick: deleteAll }, icon('delete_forever'), 'Delete all resources')))),
    commands());
}