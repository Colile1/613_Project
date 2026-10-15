// media.js : Tools > Diagram & screenshots - rebuild the architecture figure and capture
// every page of the app with a headless browser (Chrome or Edge).
import { h, icon, clear, card, callout } from '../ui.js';
import { startTask } from '../runner_view.js';

export function renderMedia(box, info) {
  const img = h('img', { src: '/diagram/architecture.svg?' + Date.now(), alt: 'Architecture diagram', style: { width: '100%', background: '#fff', borderRadius: '12px', border: '1px solid var(--outline-variant)' } });
  clear(box,
    info.browser ? null : callout('warning', 'No Chrome or Edge found - the PNG render and screenshots need one of them.', 'warn'),
    h('div', { class: 'grid g2' },
      card('Architecture diagram', 'docs/diagrams/architecture.svg and .png (Figure 1 of the report)', h('div', { class: 'grid' }, img,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => startTask('/api/tools/diagram', {}, 'Rebuilding the diagram...') }, icon('account_tree'), 'Rebuild SVG + PNG'),
          h('button', { class: 'btn text', onclick: () => { img.src = '/diagram/architecture.svg?' + Date.now(); } }, icon('refresh'), 'Refresh preview')))),
      card('Screenshots for the report', 'Captures all 17 pages into fraud-613/screenshots/ui_auto_*.png', h('div', { class: 'grid' },
        h('p', { class: 'small muted' }, 'Uses the open session\u2019s data. Generate some traffic first so every page has content. Takes about a minute.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', disabled: !info.browser, onclick: () => startTask('/api/tools/screenshots', { theme: 'light' }, 'Capturing light-theme screenshots...') }, icon('photo_camera'), 'Capture (light)'),
          h('button', { class: 'btn tonal', disabled: !info.browser, onclick: () => startTask('/api/tools/screenshots', { theme: 'dark' }, 'Capturing dark-theme screenshots...') }, icon('dark_mode'), 'Capture (dark)'))))));
}