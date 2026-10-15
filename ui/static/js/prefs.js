// prefs.js : UI state saved in the server database (page, tabs, filters, theme).
// Every browser tab reads the same values, and they survive app restarts.
import { get, post } from './api.js';

let data = {}, rev = -1, pending = {}, timer = null;

export async function loadPrefs() {
  const r = await get('/api/prefs');
  data = r.prefs || {};
  rev = r.rev;
  return data;
}

export const pref = (key, fallback) => (key in data ? data[key] : fallback);

export function setPref(key, value) {
  data[key] = value;
  pending[key] = value;
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

async function flush() {
  const body = pending;
  pending = {};
  timer = null;
  const r = await post('/api/prefs', body);
  rev = r.rev;
}

// True when another tab saved preferences since we last loaded or wrote them.
export const prefsChangedElsewhere = (serverRev) => serverRev !== rev && timer === null;