// project.js — writes a complete, runnable application from a compiled spec.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSpec } from './spec.js';
import { buildSchemaJs, buildSeedJs, buildMetaConst, buildServerJs } from './server.js';
import { makeUtilsJs, makeStoreJs, makePgLibJs, makeSchemaSql } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(here, 'client');

// ---------------- color utilities ----------------
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function mix(hex, hex2, t) { const a = hexToRgb(hex); const b = hexToRgb(hex2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function shade(hex, t) { return t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t); }
function lum(hex) { const [r, g, b] = hexToRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const onAccent = (hex) => (lum(hex) > 0.45 ? '#0d0f14' : '#ffffff');

const LIGHT_NEUT = { bg: '#f5f7fb', bg2: '#e9edf4', card: '#ffffff', card2: '#f3f6fa', border: '#d9e0ea', text: '#111827', muted: '#5f6b7a' };
const DARK_NEUT = { bg: '#0b0d12', bg2: '#11141c', card: '#161a24', card2: '#1c2130', border: '#262d3d', text: '#e8eaf0', muted: '#98a0b3' };

function paletteFrom(keyOrObj) {
  if (typeof keyOrObj === 'object' && keyOrObj) return keyOrObj;
  const P = {
    obsidian: { bg: '#0b0a08', bg2: '#14120e', card: '#1a1712', card2: '#211d16', border: '#332d22', accent: '#c9a86a', accent2: '#e6d3a3', text: '#ece9e0', muted: '#9a9284', light: false },
    graphite: { bg: '#0a0d14', bg2: '#10141d', card: '#151a26', card2: '#1b2231', border: '#2a3347', accent: '#5b8cff', accent2: '#9cc0ff', text: '#e7ecf5', muted: '#93a0b8', light: false },
    ermine: { bg: '#0a0e0b', bg2: '#0f1511', card: '#151c16', card2: '#1b241d', border: '#2b3a2f', accent: '#5fc98a', accent2: '#9ee2ba', text: '#e9f0ea', muted: '#93a89b', light: false },
    umber: { bg: '#0e0b09', bg2: '#16110c', card: '#1d1610', card2: '#261d15', border: '#3b2e22', accent: '#e08a5a', accent2: '#f2c4a4', text: '#f0e9e1', muted: '#a8947f', light: false },
    violet: { bg: '#0b0a12', bg2: '#121020', card: '#181531', card2: '#201b42', border: '#322b5c', accent: '#a78bfa', accent2: '#cdbcfc', text: '#efecf9', muted: '#9d94bd', light: false },
    cyan: { bg: '#071013', bg2: '#0c1a1f', card: '#10242b', card2: '#16303a', border: '#24424e', accent: '#4fd6e8', accent2: '#9fe8f2', text: '#e6f2f4', muted: '#8db6c0', light: false },
    crimson: { bg: '#100a0d', bg2: '#181016', card: '#20151d', card2: '#2a1b25', border: '#42293a', accent: '#e4587f', accent2: '#f5a9c0', text: '#f3eaee', muted: '#ad8b9c', light: false },
    azure: { bg: '#f6f8fb', bg2: '#e9edf4', card: '#ffffff', card2: '#f3f6fa', border: '#d9e0ea', accent: '#2563eb', accent2: '#4f83f5', text: '#101828', muted: '#5f6b7a', light: true },
  };
  return P[keyOrObj] || P.graphite;
}

export function paletteTheme(keyOrObj) {
  const p = paletteFrom(keyOrObj);
  const dark = p.light
    ? { ...DARK_NEUT, bg: '#0a0d14', bg2: '#0e1220', card: '#131a2e', card2: '#192246', border: '#2b3a5e', accent: shade(p.accent, 0.25), accent2: shade(p.accent, 0.5), onAccent: '#ffffff', text: '#e8ecf5', muted: '#8f9cb5' }
    : { bg: p.bg, bg2: p.bg2, card: p.card, card2: p.card2, border: p.border, accent: p.accent, accent2: p.accent2, onAccent: onAccent(p.accent), text: p.text, muted: p.muted };
  const light = p.light
    ? { ...LIGHT_NEUT, accent: p.accent, accent2: p.accent2, onAccent: onAccent(p.accent), text: p.text }
    : { ...LIGHT_NEUT, accent: shade(p.accent, p.accent && lum(p.accent) > 0.5 ? 0.25 : -0.15), accent2: shade(p.accent, 0.45), onAccent: '#ffffff', text: LIGHT_NEUT.text };
  return { dark, light };
}

// ---------------- token replacement ----------------
function fillTemplate(content, tokens) {
  let out = content;
  for (const [k, v] of Object.entries(tokens)) out = out.split(k).join(String(v));
  return out;
}

function collectClientFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectClientFiles(p, out);
    else out.push({ rel: path.relative(CLIENT_DIR, p).split(path.sep).join('/'), abs: p });
  }
  return out;
}

function projectNameFromSpec(spec) {
  const n = String(spec.name || 'noir-app').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return n || 'noir-app';
}

/** Write the app to disk. Returns summary { files, dir }. */
export function generateProject(specIn, { theme = 'graphite', writeTests = true } = {}) {
  const spec = specIn._compiled ? specIn : compileSpec({ ...specIn });
  const p = paletteTheme(theme);
  const tableDefs = spec.tables.map((t) => ({ table: t.table, label: t.label, fields: t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, unique: f.unique, private: !!f.private, hidden: !!f.hidden, noAuto: !!f.noAuto, options: f.options || undefined })), search: t.search || [], fk: t.fk || [] }));
  const seedTables = tableDefs.map((t) => ({ table: t.table, fields: t.fields }));
  const metaJs = buildMetaConst({ ...spec, tables: spec.tables, auth: spec.auth });
  const hasAuth = !!spec.auth;
  const feats = spec.features || [];
  const serverJs = buildServerJs({ ...spec }, hasAuth, feats);
  const schemaJs = buildSchemaJs({ tables: tableDefs });
  const seedJs = buildSeedJs({ seed: spec.seed }, tableDefs);
  const sql = makeSchemaSql(tableDefs);
  const appDirName = projectNameFromSpec(spec);
  const files = [
    { path: '.gitignore', content: 'node_modules\ndata/store.json\ndata/uploads/\n.noir/\n*.log\n' },
    { path: 'package.json', content: pkgJson(spec) },
    { path: 'server.js', content: serverJs },
    { path: 'db/schema.js', content: schemaJs },
    { path: 'db/schema.sql', content: sql },
    { path: 'db/seed.js', content: seedJs },
    { path: 'meta.js', content: metaJs },
    { path: 'lib/utils.js', content: makeUtilsJs() },
    { path: 'lib/store.js', content: makeStoreJs() },
    { path: 'lib/pg.js', content: makePgLibJs() },
  ];

  // palette tokens
  const tok = {
    __TITLE__: spec.name, __DESCRIPTION__: spec.tagline || (spec.name + ' — built with NOIR'),
    __ACCENT__: p.dark.accent, __ONACCENT__: p.dark.onAccent, __THEME__: spec.default_theme === 'light' ? 'light' : 'dark',
    __BG__: p.dark.bg, __BG2__: p.dark.bg2, __CARD__: p.dark.card, __CARD2__: p.dark.card2, __BORDER__: p.dark.border,
    __ACCENT_L__: p.light.accent, __ACCENT2_L__: p.light.accent2, __ONACCENT_L__: p.light.onAccent, __TEXT_L__: p.light.text,
    __TEXT__: p.dark.text, __MUTED__: p.dark.muted,
  };
  for (const f of collectClientFiles(CLIENT_DIR)) {
    files.push({ path: 'src/' + f.rel, content: fillTemplate(fs.readFileSync(f.abs, 'utf8'), tok) });
  }
  if (writeTests) files.push({ path: 'tests/api.test.mjs', content: makeApiTest(spec, hasAuth) });
  files.push({ path: 'README.md', content: makeReadme(spec) });
  files.push({ path: '.env.example', content: makeEnvExample(spec) });
  return { appDirName, files, spec };
}

function pkgJson(spec) {
  return JSON.stringify({
    name: projectNameFromSpec(spec), version: '1.0.0', private: true,
    description: spec.name + ' — generated with NOIR',
    type: 'module',
    engines: { node: '>=20' },
    scripts: { start: 'node server.js', dev: 'node --watch server.js', test: 'node --test tests/' },
    generatedBy: { tool: 'NOIR', version: '1.0', mode: spec.category_key || 'general' },
  }, null, 2);
}

export function makeApiTest(spec, hasAuth) {
  const main = spec.main || 'items';
  const L = [];
  L.push(`// API tests — generated by NOIR and executed with Node's built-in test runner.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3999 + Math.floor(Math.random() * 200);
const BASE = 'http://127.0.0.1:' + PORT;
let child = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('server did not start');
});
after(() => { if (child) child.kill('SIGTERM'); });

async function j(res) { const body = await res.json(); return body; }

test('health endpoint responds', async () => {
  const res = await fetch(BASE + '/api/health');
  assert.equal(res.status, 200);
  const b = await j(res); assert.equal(b.data.status, 'ok');
});

test('meta exposes the app specification', async () => {
  const b = await j(await fetch(BASE + '/api/meta'));
  assert.equal(b.ok, true);
  assert.ok(b.data.name);
  assert.ok(Array.isArray(b.data.tables));
});

test('main table round-trip: create / read / search / update / delete', async () => {
  const table = ${JSON.stringify(main)};
  const meta = await j(await fetch(BASE + '/api/meta'));
  const tdef = meta.data.tables.find((t) => t.table === table);
  const editField = (tdef && tdef.fields.find((f) => !f.noAuto && !f.private && !f.hidden && f.key !== 'email')) || { key: 'title', label: 'Title' };
  const suffix = Date.now();
  const payload = { [editField.key]: 'Test record ' + suffix, email: 't' + suffix + '@test.dev' };
  const create = await j(await fetch(BASE + '/api/' + table, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
  assert.equal(create.ok, true, JSON.stringify(create));
  const id = create.data.id;
  const one = await j(await fetch(BASE + '/api/' + table + '/' + id));
  assert.equal(one.ok, true);
  const list = await j(await fetch(BASE + '/api/' + table + '?q=' + suffix));
  assert.ok(list.data.items.some((r) => String(r.id) === String(id)), 'search should find created row');
  const upd = await j(await fetch(BASE + '/api/' + table + '/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [editField.key]: 'Updated ' + suffix }) }));
  assert.equal(upd.ok, true);
  const del = await j(await fetch(BASE + '/api/' + table + '/' + id, { method: 'DELETE' }));
  assert.equal(del.ok, true);
  const afterRes = await fetch(BASE + '/api/' + table + '/' + id);
  const after = await j(afterRes);
  assert.equal(after.ok, false);
  assert.equal(afterRes.status, 404);
});

test('csv export endpoint returns text/csv', async () => {
  const res = await fetch(BASE + '/api/' + ${JSON.stringify(main)} + '?fmt=csv');
  assert.equal(res.ok, true);
  const text = await res.text();
  assert.ok(text.startsWith('"'), 'csv header expected');
});

test('validation: bad JSON body is rejected cleanly', async () => {
  const res = await fetch(BASE + '/api/${main}', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not-json{{' });
  assert.equal(res.status, 400);
});

test('unknown routes return 404 for files with extensions', async () => {
  const res = await fetch(BASE + '/missing.css');
  assert.equal(res.status, 404);
});
`);
  if (hasAuth) {
    L.push(`
test('auth: signup, session, password change, login round-trip', async () => {
  const email = 'u' + Date.now() + '@test.dev';
  const res1 = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name: 'Tester', password: 'secret12' }) });
  const s1 = await j(res1);
  assert.equal(s1.ok, true, JSON.stringify(s1));
  const cookie = (res1.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie, 'session cookie must be issued');
  const me = await j(await fetch(BASE + '/api/auth/me', { headers: { cookie } }));
  assert.equal(me.ok, true);
  assert.equal(me.data.email, email);
  assert.equal(me.data.password_hash, undefined, 'password hashes never leave the server');
  const bad = await j(await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nope-nope' }) }));
  assert.equal(bad.ok, false);
  const pc = await j(await fetch(BASE + '/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ current: 'secret12', next: 'newsecret3' }) }));
  assert.equal(pc.ok, true);
  const good = await j(await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'newsecret3' }) }));
  assert.equal(good.ok, true, 'login with new password must work');
});
`);
  }
  return L.join('\n');
}

function makeReadme(spec) {
  const L = [];
  L.push(`# ${spec.name}

> ${spec.tagline || spec.name} — a working application generated end-to-end by **NOIR** (Think. Build. Ship. Improve.)

## Stack
- **Frontend:** vanilla ES modules (no build step), handcrafted design system, responsive shell with light/dark themes
- **API:** zero-dependency Node.js HTTP server with a REST API per table
- **Database:** built-in JSON file store with atomic writes — switch to **PostgreSQL** by setting \`DATABASE_URL\` (schema in \`db/schema.sql\`)
- **Runtime:** Node.js >= 20 (ESM, built-in \`fetch\` / \`node:test\`)

## Quick start
\`\`\`bash
npm start          # http://localhost:3210
npm test           # runs the generated API test suite
\`\`\`

Set \`PORT\` to override the port. When \`DATABASE_URL\` is present, PostgreSQL is used automatically.

## What is in this project
| Path | Purpose |
| --- | --- |
| \`server.js\` | HTTP server: REST API, auth, static files, SPA fallback |
| \`db/schema.js\` | Data model (source of truth for the file backend) |
| \`db/schema.sql\` | PostgreSQL schema (used when \`DATABASE_URL\` is set) |
| \`db/seed.js\` | Sample data (file backend only, never overwrites user data) |
| \`lib/\` | Storage engines (file + PostgreSQL adapters), helpers |
| \`src/\` | The frontend: pages, components, styles, shell |
| \`tests/api.test.mjs\` | Endpoint tests executed by \`npm test\` |
| \`meta.js\` | The specification the app was generated from |

## API
Every table gets REST endpoints automatically: \`GET /api/<table>\` (list + \`?q=\` search + \`?fmt=csv\` export), \`GET/PATCH/DELETE /api/<table>/<id>\`, \`POST /api/<table>\`.
`);
  if (spec.auth) {
    L.push(`
## Accounts
Authentication is on: signup, login, sessions (HttpOnly cookie) and password change are implemented in \`server.js\`.
`);
  }
  if (Object.keys(spec.seed || {}).length) {
    L.push(`
## Demo data
Sample data is seeded only on first run of the file backend. To start empty, delete \`data/store.json\` and restart.
`);
  }
  L.push(`
---
Generated by NOIR — an AI software engineering team. Manage this project's spec, environment and deployment from the NOIR workspace.
`);
  return L.join('\n');
}

function makeEnvExample(spec) {
  const feats = (spec.features || []).map((f) => (typeof f === 'string' ? f : f.key));
  const L = ['# Copy to .env / configure in NOIR → Environment (never commit real secrets)'];
  L.push('# DATABASE_URL=postgres://user:pass@host:5432/db');
  if (feats.includes('ai_chat')) L.push('# OPENAI_API_KEY=sk-...   (or ANTHROPIC_API_KEY / GOOGLE_API_KEY — enables the assistant chat)');
  if (feats.includes('payments')) L.push('# STRIPE_SECRET_KEY=sk_live_...   (enables real checkout sessions)');
  L.push('PORT=3210');
  return L.join('\n') + '\n';
}

// Diff-aware write: only files whose content actually changed (or that don't exist yet)
// are touched. Returns real per-run statistics so the UI can report what regeneration did.
export function writeProjectTo(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  const stats = { total: files.length, written: 0, unchanged: 0, changed: [] };
  for (const f of files) {
    const p = path.join(dir, f.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let same = false;
    try { same = fs.readFileSync(p, 'utf8') === f.content; } catch { same = false; }
    if (!same) { fs.writeFileSync(p, f.content); stats.written += 1; stats.changed.push(f.path); }
    else stats.unchanged += 1;
  }
  return stats;
}

export { compileSpec };
