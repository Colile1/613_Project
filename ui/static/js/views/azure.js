// azure.js : run the real pipeline on Azure - environment checks, producer.py runner,
// deployment commands and a cost estimator based on docs/cost_tracking.md.
import { h, icon, clear, card, pageHead, status, callout, snackbar, tabs, table, time } from '../ui.js';
import { get, post } from '../api.js';
import { pref, setPref } from '../prefs.js';

const DEPLOY = [
  ['One command: deploy everything (resource group, Event Hubs, Cosmos DB, storage, Stream Analytics job)', 'az login\n.\\infra\\deploy.ps1\n.\\infra\\deploy.ps1 -Start    # start the ASA job (billing starts)\n.\\infra\\deploy.ps1 -Stop     # stop it between sessions'],
  ['Sign in and create the resource group', 'az login\naz group create --name rg-itri613-fraud --location southafricanorth'],
  ['Deploy Event Hubs (namespace, hub, consumer group, SAS policies)', 'az deployment group create --resource-group rg-itri613-fraud --template-file infra/eventhubs.bicep --parameters namespaceName=itri613colile-ehns eventHubName=transactions'],
  ['Deploy Cosmos DB (database + 3 containers)', 'az deployment group create --resource-group rg-itri613-fraud --template-file infra/cosmosdb.bicep --parameters accountName=itri613colile-cosmos databaseName=fraud_pipeline'],
  ['Create Blob Storage and upload the reference data', 'az storage account create --name itri613colilestore --resource-group rg-itri613-fraud --sku Standard_LRS\naz storage container create --name reference-data --account-name itri613colilestore --auth-mode login\naz storage blob upload --account-name itri613colilestore --container-name reference-data --name card_metadata.json --file reference_data/card_metadata.json --auth-mode login'],
  ['Get the simulator connection string (paste into simulator/.env)', 'az eventhubs namespace authorization-rule keys list --resource-group rg-itri613-fraud --namespace-name itri613colile-ehns --name SimulatorSend --query primaryConnectionString --output tsv'],
  ['Deploy the Stream Analytics job (inputs, outputs, 2 min / 30 s ordering, query from asa/query.sql)', 'az deployment group create --resource-group rg-itri613-fraud --template-file infra/streamanalytics.bicep --parameters eventHubNamespace=itri613colile-ehns storageAccountName=itri613colilestore cosmosAccountName=itri613colile-cosmos\naz stream-analytics job start --resource-group rg-itri613-fraud --name fraud-pipeline-asa --output-start-mode JobStartTime'],
  ['Delete everything after the final demo', 'az group delete --name rg-itri613-fraud'],
];
const RATES = [['Event Hubs (Standard, 1 TU)', 0.11], ['Stream Analytics (per SU)', 0.11], ['Cosmos DB (3 x 400 RU/s)', 0.10]];
let refs = {}, tab = 'run', timer = null;

function checks(env) {
  return card('Environment checks', 'Nothing secret is shown - only whether each piece is present', h('div', { class: 'grid' },
    h('div', { class: 'chips' },
      status(env.env_file, 'simulator/.env present'),
      status(env.eventhub_configured, env.eventhub_configured ? 'Connection string set (' + env.eventhub_namespace + ')' : 'Connection string missing'),
      status(env.sdk_eventhub, 'azure-eventhub installed'), status(env.sdk_dotenv, 'python-dotenv installed'),
      status(env.sdk_cosmos, 'azure-cosmos installed (optional)'), status(env.cosmos_configured, 'COSMOS_ENDPOINT / COSMOS_KEY set (optional)'),
      status(env.az_cli, 'Azure CLI on PATH')),
    !(env.sdk_eventhub && env.sdk_dotenv) ? callout('download', 'The producer needs the packages in simulator/requirements.txt. Use "Install requirements" below (runs pip in the simulator folder).', 'warn') : null,
    !env.cosmos_configured ? callout('info', 'To browse the real containers in the Warehouse tab, run pip install azure-cosmos and add COSMOS_ENDPOINT and COSMOS_KEY to simulator/.env.') : null));
}

function runner(env) {
  const duration = h('input', { type: 'number', min: 5, max: 3600, value: 60, style: { width: '110px' }, 'aria-label': 'Duration in seconds' });
  const burst = h('input', { type: 'checkbox', id: 'burst' });
  const malformed = h('input', { type: 'number', min: 0, max: 0.5, step: 0.01, value: 0.01, style: { width: '90px' }, 'aria-label': 'Malformed probability' });
  const act = async (path, body, msg) => { const r = await post(path, body); snackbar(r.ok ? msg : r.error || 'Nothing to stop'); poll(); };
  return card('Send real events to Azure Event Hubs', 'Runs simulator/producer.py exactly as the starter guide does',
    h('div', { class: 'grid' },
      h('div', { class: 'toolbar' },
        h('label', { class: 'row small' }, 'Duration (s)', duration),
        h('label', { class: 'row small', for: 'burst' }, burst, '--burst'),
        h('label', { class: 'row small' }, '--malformed', malformed),
        h('button', { class: 'btn', disabled: !env.eventhub_configured || !env.sdk_eventhub, onclick: () => act('/api/azure/producer', { duration: +duration.value, burst: burst.checked, malformed: +malformed.value }, 'Producer started') }, icon('send'), 'Start producer'),
        h('button', { class: 'btn outlined', onclick: () => act('/api/azure/stop', {}, 'Stopped') }, icon('stop'), 'Stop'),
        h('button', { class: 'btn tonal', onclick: () => act('/api/azure/install', {}, 'Installing requirements...') }, icon('download'), 'Install requirements')),
      refs.console = h('pre', { class: 'console', 'aria-live': 'polite' }, 'Output appears here.'),
      h('h4', {}, 'Run history (saved)'), refs.history = h('div'),
      callout('payments', 'Remember the costs: start the Stream Analytics job before sending, and stop it straight after. Event Hubs and Cosmos DB bill per hour while they exist.')));
}

async function poll() {
  if (!refs.console || !document.body.contains(refs.console)) { clearInterval(timer); timer = null; return; }
  const d = await get('/api/azure');
  const lines = d.runner.lines;
  refs.console.textContent = lines.length ? lines.join('\n') : 'Output appears here.';
  refs.console.scrollTop = refs.console.scrollHeight;
  clear(refs.history, table([{ key: 'id', label: '#', num: true }, { key: 'label', label: 'Run' }, { key: 'command', label: 'Command' },
    { key: 'started_at', label: 'Started', fmt: time }, { key: 'ended_at', label: 'Ended', fmt: (v) => (v ? time(v) : 'running') },
    { key: 'exit_code', label: 'Result', fmt: (v, r) => (!r.ended_at ? 'running' : v === 0 ? 'ok' : v === -1 ? 'interrupted (app closed)' : 'exit ' + v) }],
    d.runner.history, { empty: 'No runs yet. Runs and their output are saved in the database.' }));
}

function deploy() {
  return h('div', { class: 'grid' }, DEPLOY.map(([title, cmd], i) => card((i + 1) + '. ' + title, null, h('pre', { class: 'code' }, cmd),
    h('button', { class: 'btn text', onclick: () => { navigator.clipboard.writeText(cmd); snackbar('Command copied'); } }, icon('content_copy'), 'Copy'))));
}

function cost() {
  const s = { hours: 10, su: 1 };
  const out = h('div');
  const calc = () => {
    const rows = RATES.map(([name, rate], i) => [name, rate * (i === 1 ? s.su : 1) * s.hours]);
    const total = rows.reduce((a, r) => a + r[1], 0);
    clear(out, h('dl', { class: 'kv' }, rows.flatMap(([n, c]) => [h('dt', {}, n), h('dd', {}, '$' + c.toFixed(2))]),
      h('dt', {}, h('b', {}, 'Estimated total')), h('dd', {}, h('b', {}, '$' + total.toFixed(2) + ' of the $100 credit (' + (total).toFixed(1) + '%)'))),
      total > 10 ? callout('warning', 'Above the ~$10 target. Pause the ASA job between sessions - it is the biggest cost lever.', 'warn') : callout('check_circle', 'Within the ~$10 project target.'));
  };
  const slider = (key, label, min, max) => { const b = h('b', {}, s[key]); return h('div', { class: 'field' }, h('label', {}, label, b),
    h('input', { type: 'range', min, max, value: s[key], oninput: (e) => { s[key] = +e.target.value; b.textContent = s[key]; calc(); } })); };
  calc();
  return h('div', { class: 'grid g2' }, card('Cost estimator', 'Hourly rates from docs/cost_tracking.md (USD)',
    h('div', { class: 'grid' }, slider('hours', 'Active hours with everything running', 1, 100), slider('su', 'Stream Analytics streaming units', 1, 6), out)),
    card('Before deleting resources, capture', null, h('ul', {}, ['Event Hubs metrics (incoming messages, throughput)', 'ASA metrics (input/output events, watermark delay)', 'Cosmos DB document counts for all 3 containers', 'Power BI screenshots of every page', 'Budget alerts at $20 / $50 / $80'].map((t) => h('li', {}, t)))));
}

async function render() {
  const d = await get('/api/azure');
  clear(refs.tabs, tabs([{ key: 'run', label: 'Run on Azure', icon: 'send' }, { key: 'deploy', label: 'Deploy', icon: 'rocket_launch' }, { key: 'cost', label: 'Cost', icon: 'payments' }], tab, (k) => { tab = k; setPref('azure.tab', k); render(); }));
  clear(refs.body, tab === 'run' ? h('div', { class: 'grid' }, checks(d.env), runner(d.env)) : tab === 'deploy' ? deploy() : cost());
  if (tab === 'run') { poll(); if (!timer) timer = setInterval(poll, 1500); }
}

export default {
  async mount(root, ctx) {
    tab = ctx.sub || pref('azure.tab', 'run');
    refs = { tabs: h('div'), body: h('div', { style: { marginTop: '16px' } }) };
    root.append(pageHead('Cloud', 'Azure deployment and control',
      'Everything in Steps 1-5 runs locally. This page connects the same project to the real Azure resources in rg-itri613-fraud.'), h('div', {}, refs.tabs, refs.body));
    await render();
  },
};