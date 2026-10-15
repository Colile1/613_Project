// joins.js : chooses how to join a newly added table to the tables already in the query.
// 1. a declared relationship (Data model) between the new table and one in the query;
// 2. otherwise a shared key column (transaction_id, card_id, merchant_id, ...);
// 3. otherwise an empty condition the user fills in.
import { sources } from './sqlgen.js';

const KEYS = ['transaction_id', 'card_id', 'merchant_id', 'merchant_category', 'sequence_number', 'partition_id'];

export const columnsOf = (schema, table) => Object.fromEntries(((schema.tables.find((t) => t.name === table) || {}).columns || []).map((c) => [c.name, c.type]));

// A name not yet used by any source in the query (needed when a table is joined twice).
export function uniqueAlias(table, srcs) {
  let n = 2;
  while (srcs.some((s) => s.name === `${table}_${n}`)) n++;
  return `${table}_${n}`;
}

export function suggestJoin(schema, state, table) {
  const srcs = sources(state);
  const alias = srcs.some((s) => s.name === table) ? uniqueAlias(table, srcs) : '';
  const me = alias || table;
  for (const r of schema.relationships) {
    const [ft, fc] = r.from.split('.'), [tt, tc] = r.to.split('.');
    for (const s of srcs) {
      if (ft === table && tt === s.table) return { alias, on: `${s.name}.${tc} = ${me}.${fc}`, why: r.label };
      if (tt === table && ft === s.table) return { alias, on: `${s.name}.${fc} = ${me}.${tc}`, why: r.label };
    }
  }
  const mine = columnsOf(schema, table);
  for (const k of KEYS) {
    for (const s of srcs) {
      if (mine[k] && columnsOf(schema, s.table)[k]) return { alias, on: `${s.name}.${k} = ${me}.${k}`, why: `shared column ${k}` };
    }
  }
  return { alias, on: '', why: '' };
}