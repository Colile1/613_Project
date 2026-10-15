// docs.js : browse every project file (docs, code, infrastructure, reference data) in one place.
import { h, clear, card, pageHead, code, icon } from '../ui.js';
import { get } from '../api.js';
import { markdown } from '../markdown.js';
import { pref, setPref } from '../prefs.js';

let refs = {}, current = 'architecture';
const GROUPS = [['Documentation', ['readme', 'rubric_review', 'velocity_decision', 'velocity_results', 'amount_results', 'architecture', 'schema_md', 'powerbi', 'cost', 'starter', 'todo', 'log']],
  ['Code and queries', ['producer', 'schema_py', 'asa_query', 'requirements', 'env_sample']],
  ['Infrastructure and data', ['eventhubs_bicep', 'cosmosdb_bicep', 'asa_bicep', 'deploy_ps1', 'card_metadata']]];

async function show(key) {
  current = key;
  setPref('docs.file', key);
  const f = await get('/api/file', { key });
  [...refs.list.querySelectorAll('button')].forEach((b) => b.classList.toggle('on', b.dataset.key === key));
  const progress = f.progress ? h('span', { class: 'chip on' }, `${f.progress.done} done \u00b7 ${f.progress.open} open`) : null;
  clear(refs.view, card(f.title, f.path, f.lang === 'markdown' ? h('div', { class: 'md', html: markdown(f.content) }) : code(f.content), progress));
}

export default {
  async mount(root, ctx) {
    const files = (await get('/api/files')).files;
    const byKey = Object.fromEntries(files.map((f) => [f.key, f]));
    refs = { list: h('div', { class: 'grid', style: { gap: '12px', alignContent: 'start' } }), view: h('div') };
    for (const [title, keys] of GROUPS) {
      refs.list.append(h('div', {}, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, title), h('div', { class: 'chips' },
        keys.map((k) => h('button', { class: 'chip', 'data-key': k, onclick: () => show(k) }, icon(byKey[k].lang === 'markdown' ? 'description' : 'code'), byKey[k].title)))));
    }
    root.append(pageHead('Reference', 'Project files', 'Read-only view of the documentation, code, infrastructure templates and reference data that make up the project.'),
      card(null, null, refs.list, null, 'tonal'), refs.view);
    await show(ctx.sub || pref('docs.file', current));
  },
};