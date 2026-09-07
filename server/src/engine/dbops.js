// dbops.js — database introspection & operations for generated projects.
// File backend: reads the app's data/store.json + db/schema.js.
// PostgreSQL backend: connects live with the project's DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { appDir } from './paths.js';
import { envVars } from '../db.js';
import { sh } from './tools.js';

async function loadSchema(project, rootDir) {
  const dir = appDir(project, rootDir);
  const schemaFile = path.join(dir, 'db', 'schema.js');
  if (!fs.existsSync(schemaFile)) return { error: 'No schema file. Generate the project first.' };
  const url = pathToFileURL(schemaFile).href + '?t=' + Date.now();
  const mod = await import(url);
  return { schema: mod.SCHEMA };
}
import { pathToFileURL } from 'node:url';

function readJsonDb(project, rootDir) {
  const dir = appDir(project, rootDir);
  const file = path.join(dir, 'data', 'store.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { corrupt: true }; }
}

export async function databaseSummary(project, rootDir = '') {
  const { schema } = await loadSchema(project, rootDir);
  if (!schema) return { error: 'no schema' };
  const datUrl = envVars.getValue(project.id, 'DATABASE_URL');
  if (datUrl) {
    const live = await pgProbe(datUrl);
    return { backend: 'postgresql', configured: true, live: live.ok, error: live.error, tables: schema.map((t) => ({ table: t.table, label: t.label, fields: t.fields.length })) };
  }
  const json = readJsonDb(project, rootDir);
  const tables = schema.map((t) => {
    const rows = (json && !json.corrupt && json[t.table]) ? json[t.table].rows : [];
    return { table: t.table, label: t.label, fields: t.fields.length, rows: Array.isArray(rows) ? rows.length : 0, columns: t.fields.filter((f) => !f.private).map((f) => ({ key: f.key, label: f.label, type: f.type })) };
  });
  return { backend: 'file', configured: true, live: true, file: !!json && !json.corrupt, tables };
}

export async function createDatabase(project, rootDir = '', args = {}) {
  const { schema } = await loadSchema(project, rootDir);
  if (!schema) return { error: 'no schema' };
  const datUrl = envVars.getValue(project.id, 'DATABASE_URL');
  if (datUrl) {
    const live = await pgProbe(datUrl);
    if (!live.ok) return { error: 'PostgreSQL connection failed: ' + live.error };
    // real migration: apply schema.sql through a live connection
    const dir = appDir(project, rootDir);
    const sqlFile = path.join(dir, 'db', 'schema.sql');
    if (fs.existsSync(sqlFile)) {
      try {
        const pool = await pgClient(datUrl);
        const sql = fs.readFileSync(sqlFile, 'utf8');
        await pool.query(sql);
        await pool.end();
        return { backend: 'postgresql', applied: true };
      } catch (e) {
        return { backend: 'postgresql', applied: false, error: String(e.message || e).slice(0, 300) };
      }
    }
  }
  // file backend: data dir is created at first boot; ensure present
  const dir = appDir(project, rootDir);
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const file = path.join(dir, 'data', 'store.json');
  const exists = fs.existsSync(file);
  return { backend: 'file', created: exists ? 'already exists' : 'ready on next boot', path: file };
}

export async function inspectDatabase(project, rootDir = '', table = null) {
  const { schema } = await loadSchema(project, rootDir);
  if (!schema) return { error: 'no schema' };
  const datUrl = envVars.getValue(project.id, 'DATABASE_URL');
  if (datUrl) {
    return pgInspect(datUrl, schema, table);
  }
  const json = readJsonDb(project, rootDir);
  if (!json || json.corrupt) return { error: json && json.corrupt ? 'store.json corrupt' : 'Database not created yet — start the app first.' };
  const tables = (table ? schema.filter((t) => t.table === table) : schema);
  const out = tables.map((t) => {
    const data = json[t.table] || { rows: [] };
    return {
      table: t.table, label: t.label,
      count: Array.isArray(data.rows) ? data.rows.length : 0,
      columns: t.fields.filter((f) => !f.private).map((f) => ({ key: f.key, label: f.label, type: f.type })),
      rows: (Array.isArray(data.rows) ? data.rows : []).slice(0, 50),
    };
  });
  return { backend: 'file', tables: out };
}

async function pgClient(datUrl) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: datUrl, ssl: datUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined, max: 3 });
  return pool;
}
async function pgProbe(datUrl) {
  try {
    const pool = await pgClient(datUrl);
    const r = await pool.query('SELECT 1 AS ok');
    await pool.end();
    return { ok: r.rows[0].ok === 1 };
  } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 300) }; }
}
async function pgInspect(datUrl, schema, table) {
  try {
    const pool = await pgClient(datUrl);
    const names = schema.map((t) => t.table);
    const selected = table ? names.filter((n) => n === table) : names;
    const out = [];
    for (const n of selected) {
      try {
        const cnt = await pool.query('SELECT COUNT(*) c FROM "' + n + '"');
        const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1", [n]);
        const rows = await pool.query('SELECT * FROM "' + n + '" LIMIT 50');
        out.push({ table: n, count: Number(cnt.rows[0].c), columns: cols.rows.map((c) => c.column_name), rows: rows.rows });
      } catch (e) { out.push({ table: n, error: String(e.message || e).slice(0, 200) }); }
    }
    await pool.end();
    return { backend: 'postgresql', tables: out };
  } catch (e) { return { error: 'PostgreSQL connection failed: ' + String(e.message || e).slice(0, 300) }; }
}

export async function runMigration(project, rootDir = '', sql) {
  const datUrl = envVars.getValue(project.id, 'DATABASE_URL');
  if (!datUrl) {
    return { error: 'The built-in file backend has no SQL engine. Migrations are supported for PostgreSQL (set DATABASE_URL) or via schema regeneration.' };
  }
  if (!sql || !String(sql).trim()) return { error: 'Empty SQL' };
  try {
    const pool = await pgClient(datUrl);
    await pool.query(String(sql));
    await pool.end();
    return { applied: true };
  } catch (e) { return { error: String(e.message || e).slice(0, 400) }; }
}
