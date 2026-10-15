// azure.js : Azure page - Run (producer.py), Settings (.env, packages), Deploy (sign in,
// deploy, start/stop, delete) and Cost (estimate + session log). Every action has a
// button; the shared console below shows live output and the saved run history.
import { h, icon, clear, card, pageHead, status, callout, snackbar, tabs } from '../ui.js';
import { get } from '../api.js';
import { pref, setPref } from '../prefs.js';
import { runConsole, startTask } from '../runner_view.js';
import { renderSettings } from '../azure/settings.js';
import { renderDeploy } from '../azure/deploy.js';
import { renderCost } from '../azure/cost.js';

const COMMANDS = [
  ['Deploy everything', '.\\infra\\deploy.ps1'], ['Start / stop the ASA job', '.\\infra\\deploy.ps1 -Start\n.\\infra\\deploy.ps1 -Stop'],
  ['Get the simulator connection string', 'az eventhubs namespace authorization-rule keys list --resource-group rg-itri613-fraud --namespace-name itri613colile-ehns --name SimulatorSend --query primaryConnectionString --output tsv'],
  ['Delete everything', '.\\infra\\deploy.ps1 -Delete'],
];
let refs = {}, tab = 'run';

function checks(env) {
  return card('Environment checks', 'Nothing secret is shown - only whether each piece is present', h('div', { class: 'grid' },
    h('div', { class: 'chips' },
      status(env.env_file, 'simulator/.env present'),
      status(env.eventhub_configured, env.eventhub_configured ? 'Connection string set (' + env.eventhub_namespace + ')' : 'Connection string missing'),
      status(env.sdk_eventhub, 'azure-eventhub installed'), status(env.sdk_dotenv, 'python-dotenv installed'),
      status(env.sdk_cosmos, 'azure-cosmos installed (optional)'), status(env.cosmos_configured, 'Cosmos endpoint / key set (optional)'),
      status(env.az_cli, 'Azure CLI on PATH')),
    !(env.sdk_eventhub && env.sdk_dotenv) || !env.eventhub_configured
      ? callout('settings', ['Missing pieces can be fixed on the ', h('a', { href: '#/azure/settings' }, 'Settings'), ' tab: install packages, paste or fetch the connection string.'], 'warn') : null));
}

function producer(env) {
  const num = (value, min, max, step, label, width) => h('input', { type: 'number', min, max, step, value, style: { width }, 'aria-label': label });
  const duration = num(60, 5, 3600, 5, 'Duration in seconds', '100px');
  const rate = num(10, 1, 200, 1, 'Baseline events per second', '80px');
  const malformed = num(0.01, 0, 0.5, 0.01, 'Malformed probability', '80px');
  const burst = h('input', { type: 'checkbox', id: 'burst' });
  const ready = env.eventhub_configured && env.sdk_eventhub && env.sdk_dotenv;
  return card('Send real events to Azure Event Hubs', 'Runs simulator/producer.py with these options',
    h('div', { class: 'grid' },
      h('div', { class: 'toolbar' },
        h('label', { class: 'row small' }, 'Duration (s)', duration), h('label', { class: 'row small' }, 'Rate (events/s)', rate),
        h('label', { class: 'row small' }, 'Malformed share', malformed), h('label', { class: 'row small', for: 'burst' }, burst, 'Burst now'),
        h('button', { class: 'btn', disabled: !ready, title: ready ? '' : 'Finish the Settings tab first',
          onclick: () => startTask('/api/azure/producer', { duration: +duration.value, rate: +rate.value, burst: burst.checked, malformed: +malformed.value }, 'Producer started') }, icon('send'), 'Start producer'),
        h('button', { class: 'btn outlined', onclick: () => startTask('/api/azure/stop', {}, 'Stopped') }, icon('stop'), 'Stop')),
      callout('payments', 'Start the Stream Analytics job (Deploy tab) before sending, and stop it straight after. Event Hubs and Cosmos DB bill per hour while they exist.')));
}

function commands() {
  return card('Terminal equivalents', 'What the buttons run, if you prefer a terminal', h('div', { class: 'grid' }, COMMANDS.map(([t, c]) =>
    h('div', {}, h('div', { class: 'row between' }, h('b', { class: 'small' }, t),
      h('button', { class: 'btn text sm', onclick: () => { navigator.clipboard.writeText(c); snackbar('Command copied'); } }, icon('content_copy'), 'Copy')),
      h('pre', { class: 'code' }, c)))));
}

async function render() {
  clear(refs.tabs, tabs([{ key: 'run', label: 'Run', icon: 'send' }, { key: 'settings', label: 'Settings', icon: 'settings' },
    { key: 'deploy', label: 'Deploy', icon: 'rocket_launch' }, { key: 'cost', label: 'Cost', icon: 'payments' }], tab, (k) => { tab = k; setPref('azure.tab', k); render(); }));
  const box = h('div', { class: 'grid' });
  clear(refs.body, box);
  if (tab === 'run') { const d = await get('/api/azure'); box.append(checks(d.env), producer(d.env)); }
  else if (tab === 'settings') await renderSettings(box, render);
  else if (tab === 'deploy') await renderDeploy(box, commands);
  else await renderCost(box);
}

export default {
  async mount(root, ctx) {
    tab = ctx.sub || pref('azure.tab', 'run');
    refs = { tabs: h('div'), body: h('div', { style: { marginTop: '16px' } }) };
    root.append(pageHead('Cloud', 'Azure deployment and control',
      'Everything in Steps 1-5 runs locally. This page connects the same project to the real Azure resources - every step has a button, so no terminal is needed.'),
      h('div', {}, refs.tabs, refs.body), card('Task output', 'Live output of the producer, installs, sign-in and deployments', runConsole({ history: true })));
    await render();
  },
};