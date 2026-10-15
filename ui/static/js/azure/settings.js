// settings.js : Azure page > Settings - edit simulator/.env without opening the file,
// fetch the connection string with the Azure CLI, and install the Python packages.
import { h, icon, clear, card, callout, chip, snackbar } from '../ui.js';
import { get, post } from '../api.js';
import { startTask } from '../runner_view.js';
import { pref } from '../prefs.js';

export async function renderSettings(box, refresh) {
  const d = await get('/api/azure/settings');
  const inputs = {};
  const rows = d.settings.map((s) => {
    inputs[s.key] = h('input', { type: s.secret ? 'password' : 'text', placeholder: s.set ? 'leave blank to keep the current value' : 'not set', autocomplete: 'off',
      'aria-label': s.key, style: { width: '100%' } });
    return h('div', { class: 'field' },
      h('label', {}, h('span', {}, h('b', {}, s.key), ' \u00b7 ', s.help), s.set ? chip(s.secret ? 'set ' + s.hint : s.hint, 'good', 'check_circle') : chip('not set', 'warn', 'error')),
      inputs[s.key]);
  });
  const save = async () => {
    const body = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
    const r = await post('/api/azure/settings', body);
    snackbar(r.saved && r.saved.length ? 'Saved ' + r.saved.join(', ') : 'Nothing to save - type a new value first');
    refresh();
  };
  const fetchConn = async () => {
    snackbar('Asking Azure for the SimulatorSend connection string...');
    const r = await post('/api/azure/fetch-connection', pref('azure.names', {}));
    snackbar(r.error ? r.error : 'Saved the connection string for ' + r.namespace);
    refresh();
  };
  clear(box,
    card('Connection settings', 'Written to simulator/.env (git-ignored). Secret values are never shown again - only whether they are set.', h('div', { class: 'grid' },
      ...rows,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: save }, icon('save'), 'Save settings'),
        h('button', { class: 'btn tonal', onclick: fetchConn, disabled: !d.az, title: d.az ? 'Runs az eventhubs ... keys list for SimulatorSend' : 'Install the Azure CLI first' }, icon('cloud_download'), 'Fetch connection string from Azure')),
      d.az ? null : callout('info', 'Azure CLI not found. Install it (https://aka.ms/installazurecli) to fetch keys, sign in and deploy from this app.'))),
    card('Python packages', 'Installed into the Python that runs this app', h('div', { class: 'row' },
      h('button', { class: 'btn tonal', onclick: () => startTask('/api/azure/install', {}, 'Installing simulator requirements...') }, icon('download'), 'Simulator requirements (azure-eventhub, python-dotenv)'),
      h('button', { class: 'btn tonal', onclick: () => startTask('/api/azure/install-package', { package: 'azure-cosmos' }, 'Installing azure-cosmos...') }, icon('download'), 'azure-cosmos (live Warehouse view)'))));
}