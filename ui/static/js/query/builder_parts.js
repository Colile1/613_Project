// builder_parts.js : small building blocks for the visual builder's zones.
import { h, icon } from '../ui.js';
import { dropZone } from './dnd.js';

// A titled drop zone; `extra` sits on the right of the title (menus, toggles).
export function zone(title, iconName, hint, items, onDrop, extra) {
  const z = dropZone(h('div', { class: 'zone', 'aria-label': title + ' drop zone' }, items.length ? items : h('span', { class: 'hint' }, hint)), onDrop);
  return h('div', {}, h('div', { class: 'zone-head' }, h('h4', {}, icon(iconName), title), h('div', { class: 'row' }, extra)), z);
}

// "+ something" menu; groups = [[groupLabel, [[value, text], ...]], ...].
export function addMenu(label, groups, onPick, disabled = false) {
  return h('select', { 'aria-label': label, disabled, onchange: (e) => { const v = e.target.value; e.target.value = ''; if (v) onPick(v); } },
    h('option', { value: '' }, '+ ' + label),
    groups.filter(([, opts]) => opts.length).map(([g, opts]) => h('optgroup', { label: g }, opts.map(([v, t]) => h('option', { value: v }, t)))));
}

export const removeBtn = (onClick) => h('button', { class: 'x', title: 'Remove', 'aria-label': 'Remove', onclick: onClick }, icon('close'));

// Text box that updates the layout without re-rendering (keeps focus while typing).
// Expression boxes (mono) grow with their text so long conditions stay readable.
export function field(value, placeholder, onInput, opts = {}) {
  const min = parseInt(opts.width || '120', 10);
  const fit = (el) => { if (opts.mono) el.style.width = `min(100%, max(${min}px, calc(${Math.max(el.value.length, 4) + 2}ch + 16px)))`; };
  const el = h('input', { type: 'text', value: value ?? '', placeholder, 'aria-label': opts.label || placeholder, spellcheck: 'false',
    class: opts.mono ? 'mono' : null, style: { width: opts.width || '120px' }, oninput: (e) => { fit(e.target); onInput(e.target.value); } });
  fit(el);
  return el;
}

// All / Any switch for a list of conditions.
export function matchToggle(value, onSet) {
  return h('div', { class: 'segmented small-seg', role: 'group', 'aria-label': 'Match' },
    h('button', { class: value !== 'any' ? 'on' : '', onclick: () => onSet('all'), title: 'Every condition must match (AND)' }, 'All (AND)'),
    h('button', { class: value === 'any' ? 'on' : '', onclick: () => onSet('any'), title: 'At least one condition must match (OR)' }, 'Any (OR)'));
}