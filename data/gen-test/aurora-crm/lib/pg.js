// PostgreSQL adapter — used automatically when DATABASE_URL is configured.
// Imports the pg driver lazily so the file-database default needs zero installs.
let Pool = null;
let pool = null;
export const TABLES = {};
export function defineTables(schema) { for (const t of schema) TABLES[t.table] = t; }

export function hasPg() { return !!process.env.DATABASE_URL; }

export async function connect() {
  if (!process.env.DATABASE_URL) return false;
  const pg = await import('pg');
  Pool = pg.default.Pool;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined, max: 5 });
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  return true;
}

const fieldsOf = (t) => (TABLES[t] ? TABLES[t].fields : []);
const sqlVal = (v) => (v === undefined || v === '' ? 'null' : JSON.stringify(v));

export const store = {
  async list(t) {
    const r = await pool.query('SELECT * FROM "' + t + '"');
    const def = TABLES[t] || { fields: [] };
    return r.rows.map((row) => {
      for (const f of def.fields) if (f.type === 'json' && row[f.key] != null) row[f.key] = JSON.parse(row[f.key]);
      return row;
    });
  },
  async get(t, id) {
    const r = await pool.query('SELECT * FROM "' + t + '" WHERE id = $1', [id]);
    return r.rows[0] || null;
  },
  async insert(t, data) {
    const flds = fieldsOf(t).filter((f) => !f.noAuto);
    const keys = flds.map((f) => f.key);
    const vals = keys.map((k) => sqlVal(data[k]));
    const r = await pool.query('INSERT INTO "' + t + '" (' + keys.map((k) => '"' + k + '"').join(',') + ') VALUES (' + vals.join(',') + ') RETURNING *');
    return r.rows[0];
  },
  async update(t, id, patch) {
    const keys = Object.keys(patch);
    const set = keys.map((k, i) => '"' + k + '" = $' + (i + 1)).join(',');
    const r = await pool.query('UPDATE "' + t + '" SET ' + set + ' WHERE id = $1 RETURNING *', [id, ...keys.map((k) => sqlVal(patch[k]))]);
    return r.rows[0] || null;
  },
  async remove(t, id) { await pool.query('DELETE FROM "' + t + '" WHERE id = $1', [id]); },
  async seed() {
    // PostgreSQL projects start empty — seeding is a file-backend convenience.
    return 0;
  },
};
