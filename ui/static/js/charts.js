// charts.js : dependency-free SVG charts (line with crosshair, horizontal bars).
// Colours come from CSS tokens (--s1..--s3) so light/dark both work.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

let tipEl;
function tip(html, x, y) {
  if (!tipEl) { tipEl = h('div', { class: 'viz-tip' }); document.body.append(tipEl); }
  if (html === null) { tipEl.style.display = 'none'; return; }
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  const w = tipEl.offsetWidth;
  tipEl.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px';
  tipEl.style.top = (y + 14) + 'px';
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const shortTime = (t) => (t && t.length > 15 ? new Date(t).toLocaleTimeString('en-ZA', { hour12: false, hour: '2-digit', minute: '2-digit', second: t.endsWith(':00Z') ? undefined : '2-digit' }) : String(t));

function responsive(draw, height) {
  const box = h('div', { class: 'viz-box', style: { height: height + 'px' } });
  let last = 0;
  new ResizeObserver(() => {
    const w = box.clientWidth;
    if (w && w !== last) { last = w; box.replaceChildren(draw(w)); }
  }).observe(box);
  return box;
}

function legend(series) {
  if (series.length < 2) return null;
  return h('div', { class: 'legend' }, series.map((sr) =>
    h('span', {}, h('i', { style: { background: `var(${sr.color})` } }), sr.name)));
}

export function lineChart({ series, height = 240, fmtY = (v) => v.toLocaleString('en-ZA'), empty = 'No data yet' }) {
  const keys = [...new Set(series.flatMap((sr) => sr.points.map((p) => p.t)))].sort((a, b) => (typeof a === 'number' ? a - b : a < b ? -1 : a > b ? 1 : 0));
  if (!keys.length) return h('div', { class: 'empty' }, empty);
  const lookup = series.map((sr) => Object.fromEntries(sr.points.map((p) => [p.t, p.v])));
  const max = niceMax(Math.max(...lookup.flatMap((m) => Object.values(m))));
  const draw = (W) => {
    const m = { l: 52, r: 12, t: 10, b: 26 }, iw = W - m.l - m.r, ih = height - m.t - m.b;
    const x = (i) => m.l + (keys.length === 1 ? iw / 2 : (i / (keys.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / max) * ih;
    const svg = s('svg', { width: W, height, role: 'img', 'aria-label': series.map((x) => x.name).join(', ') });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i ? 'grid' : 'axis' }));
      svg.append(s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, fmtY(v)));
    }
    const step = Math.max(1, Math.ceil(keys.length / Math.max(2, Math.floor(iw / 90))));
    keys.forEach((k, i) => { if (i % step === 0) svg.append(s('text', { x: x(i), y: height - 6, 'text-anchor': 'middle', class: 'tick' }, shortTime(k))); });
    series.forEach((sr, si) => {
      const pts = keys.map((k, i) => [x(i), y(lookup[si][k] ?? 0)]);
      svg.append(s('path', { d: 'M' + pts.map((p) => p.join(',')).join('L'), fill: 'none', stroke: `var(${sr.color})`, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    });
    const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'cross', style: 'display:none' });
    const dots = series.map((sr) => s('circle', { r: 4, fill: `var(${sr.color})`, stroke: 'var(--surface-1)', 'stroke-width': 2, style: 'display:none' }));
    svg.append(cross, ...dots);
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(keys.length - 1, Math.round(((e.clientX - r.left - m.l) / iw) * (keys.length - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
      dots.forEach((d, si) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(lookup[si][keys[i]] ?? 0)); d.style.display = ''; });
      tip(`<b>${esc(shortTime(keys[i]))}</b>` + series.map((sr, si) =>
        `<div><i style="background:var(${sr.color})"></i>${esc(sr.name)}: <b>${esc(fmtY(lookup[si][keys[i]] ?? 0))}</b></div>`).join(''), e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { cross.style.display = 'none'; dots.forEach((d) => (d.style.display = 'none')); tip(null); });
    svg.append(hit);
    return svg;
  };
  return h('div', { class: 'viz' }, legend(series), responsive(draw, height));
}

export function barChart({ items, color = '--s1', fmt = (v) => v.toLocaleString('en-ZA'), empty = 'No data yet', onClick }) {
  if (!items.length) return h('div', { class: 'empty' }, empty);
  const height = items.length * 34 + 8;
  const max = Math.max(...items.map((d) => d.v)) || 1;
  const draw = (W) => {
    const labelW = Math.min(170, W * 0.32), valueW = 96, iw = Math.max(20, W - labelW - valueW);
    const svg = s('svg', { width: W, height, role: 'img' });
    items.forEach((d, i) => {
      const y = 4 + i * 34, w = Math.max(2, (d.v / max) * iw);
      const g = s('g', { class: onClick ? 'bar click' : 'bar' });
      g.append(s('text', { x: labelW - 10, y: y + 18, 'text-anchor': 'end', class: 'label' }, d.k));
      g.append(s('rect', { x: labelW, y: y + 5, width: w, height: 20, rx: 4, fill: `var(${d.color || color})` }));
      g.append(s('text', { x: labelW + w + 8, y: y + 19, class: 'value' }, fmt(d.v)));
      g.append(s('rect', { x: 0, y, width: W, height: 32, fill: 'transparent' }));
      g.addEventListener('mousemove', (e) => tip(`<b>${esc(d.k)}</b><div>${esc(fmt(d.v))}</div>`, e.clientX, e.clientY));
      g.addEventListener('mouseleave', () => tip(null));
      if (onClick) g.addEventListener('click', () => onClick(d));
      svg.append(g);
    });
    return svg;
  };
  return h('div', { class: 'viz' }, responsive(draw, height));
}