// JSON-file storage engine with WAL-style atomic writes. NOIR default backend
// (PostgreSQL is used automatically when DATABASE_URL is provided at runtime).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uid, nowIso } from '../lib/utils.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = path.join(dir, 'store.json');
fs.mkdirSync(dir, { recursive: true });

export const TABLES = {};

export function defineTables(schema) {
  for (const t of schema) TABLES[t.table] = { ...t, rows: [], nextId: 1 };
}

export function load() {
  if (!fs.existsSync(file)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [name, t] of Object.entries(TABLES)) {
      if (saved[name]) { t.rows = saved[name].rows || []; t.nextId = saved[name].nextId || 1; }
    }
  } catch (e) { console.error('store load failed', e); }
}
export function save() {
  const out = {}; for (const [n, t] of Object.entries(TABLES)) out[n] = { rows: t.rows, nextId: t.nextId };
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, file);
}
load();

const autoFields = (t) => t.fields.filter((f) => !f.noAuto);
const col = (row, f) => { const v = row[f.key]; if (v === undefined || v === null) return ''; return v; };

export const store = {
  list(t, opts = {}) {
    let rows = TABLES[t] ? [...TABLES[t].rows] : [];
    if (opts.sort) rows.sort((a, b) => String(col(a, { key: opts.sort })).localeCompare(String(col(b, { key: opts.sort }))));
    if (opts.order === 'desc') rows.reverse();
    if (opts.search && opts.searchKeys) {
      const q = opts.search.toLowerCase();
      rows = rows.filter((r) => opts.searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    return rows;
  },
  get(t, id) { return TABLES[t] ? TABLES[t].rows.find((r) => String(r.id) === String(id)) || null : null; },
  where(t, fn) { return TABLES[t] ? TABLES[t].rows.filter(fn) : []; },
  insert(t, data) {
    const tbl = TABLES[t]; if (!tbl) throw new Error('no table ' + t);
    for (const f of tbl.fields) {
      if (f.unique && data[f.key] != null && tbl.rows.some((r) => String(r[f.key]) === String(data[f.key])))
        throw new Error(f.label || f.key + ' already exists');
    }
    const row = { id: tbl.nextId++ };
    for (const f of autoFields(tbl)) row[f.key] = data[f.key] ?? '';
    row.created_at = data.created_at || nowIso();
    tbl.rows.push(row); save();
    return { ...row };
  },
  update(t, id, patch) {
    const tbl = TABLES[t]; const row = tbl && tbl.rows.find((r) => String(r.id) === String(id));
    if (!row) return null;
    Object.assign(row, patch); row.updated_at = nowIso(); save();
    return { ...row };
  },
  remove(t, id) {
    const tbl = TABLES[t]; if (!tbl) return false;
    const i = tbl.rows.findIndex((r) => String(r.id) === String(id));
    if (i < 0) return false; tbl.rows.splice(i, 1); save(); return true;
  },
  seed(spec) {
    if (!spec || !spec.length) return;
    for (const s of spec) {
      const tbl = TABLES[s.table]; if (!tbl) continue;
      if (s.table === 'users') {
        // demo accounts are upserted by email so credentials always match the current hashing
        for (const data of s.rows) {
          const ex = tbl.rows.find((r) => String(r.email || '').toLowerCase() === String(data.email || '').toLowerCase());
          if (ex) { for (const f of autoFields(tbl)) if (data[f.key] !== undefined) ex[f.key] = data[f.key]; }
          else { try { store.insert(s.table, data); } catch (e) { console.error('seed users', e.message); } }
        }
        save();
        continue;
      }
      if (tbl.rows.length > 0) continue;
      for (const data of s.rows) { try { store.insert(s.table, data); } catch (e) { console.error('seed ' + s.table, e.message); } }
    }
  },
};
