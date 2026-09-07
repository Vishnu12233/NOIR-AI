// supabase/database.js — real SQL execution + a migration engine with our own
// history tracking (the Management API "migrations" endpoint is partner-gated, so
// migrations run through the universal POST /database/query executor and every
// version is recorded in public.noir_migrations on the project).
export async function runSql(sb, ref, query) {
  return sb.post('/v1/projects/' + encodeURIComponent(ref) + '/database/query', { query: String(query).replace(/\s+$/, '') });
}
export async function ensureMigrationTable(sb, ref) {
  await runSql(sb, ref, `create table if not exists public.noir_migrations (version text primary key, name text, checksum text, applied_at timestamptz default now());`);
}
export async function appliedVersions(sb, ref) {
  try {
    const r = await runSql(sb, ref, 'select version, name, applied_at from public.noir_migrations order by version;');
    return (r || []).map((row) => ({ version: row.version, name: row.name, applied_at: row.applied_at }));
  } catch (e) { return []; } // table may not exist yet on a fresh project
}
export async function applyMigration(sb, ref, { version, name, statements, checksum }) {
  await ensureMigrationTable(sb, ref);
  const done = await appliedVersions(sb, ref);
  if (done.some((m) => m.version === version)) return { skipped: true, version, reason: 'already applied' };
  for (const sql of statements) {
    if (!String(sql || '').trim()) continue;
    await runSql(sb, ref, sql); // throws real provider error → migration fails loudly
  }
  await runSql(sb, ref, `insert into public.noir_migrations (version, name, checksum, applied_at) values ('${String(version).replace(/'/g, '')}', '${String(name || '').replace(/'/g, '')}', '${String(checksum || '').replace(/'/g, '')}', now());`);
  return { applied: true, version, statements: statements.length };
}
export async function verifySchema(sb, ref, expectedTables) {
  const r = await runSql(sb, ref, `select table_name from information_schema.tables where table_schema='public' order by table_name;`);
  const present = new Set((r || []).map((x) => x.table_name));
  return expectedTables.map((t) => ({ table: t, exists: present.has(t) }));
}
// ---- SQL generation from a NOIR compiled spec's tables (real DDL) ----
const SQL_TYPE = { text: 'text', email: 'text', number: 'numeric', date: 'date', boolean: 'boolean', multiline: 'text', id: 'text' };
export function sqlFromSpecTables(tables, { enableRls = false } = {}) {
  const out = [];
  for (const t of tables || []) {
    const cols = (t.fields || []).map((f) => {
      const key = String(f.key || f.name || '');
      const type = SQL_TYPE[f.type || 'text'] || 'text';
      return `  "${key}" ${type}${key === 'id' ? ' primary key' : ''}`;
    }).join(',\n');
    const q = `create table if not exists public."${t.table}" (\n${cols}\n);`;
    out.push(q);
    if (enableRls) out.push(`alter table public."${t.table}" enable row level security;`);
  }
  return out;
}
