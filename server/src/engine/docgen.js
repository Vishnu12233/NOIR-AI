// docgen.js — documentation that mirrors the real project state (schema, API, deploy).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appDir } from './paths.js';
import { projects } from '../db.js';
import { databaseSummary } from './dbops.js';
import { deploymentStatus } from './deploy.js';

export async function buildDocs(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  const docsDir = path.join(dir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const p = projects.byId(project.id) || project;
  const db = await databaseSummary(project, rootDir).catch((e) => ({ error: e.message }));
  const dep = await deploymentStatus(p).catch(() => null);
  const written = [];
  const w = (name, content) => { const p = path.join(docsDir, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); written.push('docs/' + name); };
  const metaJs = path.join(dir, 'meta.js');
  let meta = { name: p.name || 'App' };
  try {
    const url = pathToFileURL(metaJs).href + '?t=' + Date.now();
    const mod = await import(url);
    meta = mod.META || meta;
  } catch { /* keep default */ }
  const tables = (db.tables || []).map((t) => '| ' + t.table + ' | ' + (t.label || '') + ' | ' + (t.rows !== undefined ? t.rows : t.fields || '—') + ' |').join('\n');
  w('architecture.md', `# Architecture — ${meta.name}

Generated on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.

## System overview
- **Frontend**: static ES modules served by the app's HTTP server (\`src/\`). No build step, no framework lock-in.
- **API**: REST endpoints generated per table in \`server.js\` (\`GET/POST/PATCH/DELETE /api/<table>\`, \`?q=\` search, \`?fmt=csv\` export).
- **Database backend**: ${db.backend === 'postgresql' ? 'PostgreSQL (DATABASE_URL) — schema in db/schema.sql, applied at boot.' : 'Built-in JSON file store with atomic writes (data/store.json). PostgreSQL activates automatically when DATABASE_URL is set.'}
- **Auth**: ${meta.auth ? 'email + password with scrypt-grade hashing, HttpOnly session cookies, role field (user/admin)' : 'not enabled in this spec'}.

## Data model (${tables.split('\n').length} table(s))
| table | label | rows/fields |
| --- | --- | --- |
${tables}

## Client routes
${(meta.nav || []).map((n) => '- `' + (n.path || '/') + '` — ' + n.label).join('\n')}

## Runtime
Node.js >= 20, zero external runtime dependencies. Entry: \`node server.js\` (PORT env).
`);
  const tables2 = (db.tables || []).map((t) => t.table).join(', ') || '—';
  w('api.md', `# API reference — ${meta.name}

Base URL: \`http://<host>:<port>\` · Content-Type: application/json · Responses: \`{ ok: boolean, data?: any, error?: string, code?: string }\`

## Generic endpoints
\`\`\`
GET    /api/health              liveness + backend name
GET    /api/meta                the app's own specification (name, tables, nav, features)
GET    /api/summary             row count per table
GET    /api/<table>             list rows (?q= search, ?sort=&order=, ?fmt=csv)
GET    /api/<table>/<id>        single row
POST   /api/<table>             create row (validates uniqueness/required)
PATCH  /api/<table>/<id>        update row
DELETE /api/<table>/<id>        delete row
\`\`\`
${meta.auth ? `## Authentication
\`\`\`
POST   /api/auth/signup      { email, name, password }  → sets session cookie
POST   /api/auth/login       { email, password }
POST   /api/auth/logout
GET    /api/auth/me          → current user (or 401)
PATCH  /api/auth/me          { name }  → update profile
POST   /api/auth/password    { current, next } → change password
\`\`\`
Protected endpoints require the \`noir_session\` HttpOnly cookie or \`x-auth-token\` header. Admin-only tables return 403 for non-admins. Password hashes never appear in responses.
` : ''}
## Tables
${db.backend === 'postgresql' ? 'Queries run against PostgreSQL — see Database explorer for live schema.' : (db.tables || []).map((t) => `### ${t.table}${t.columns && t.columns.length ? '\n' + t.columns.map((c) => '- `' + c.key + '` (' + c.type + ')').join('\n') : ''}${t.rows ? '\n' + t.rows.length + ' sample row(s)' : ''}`).join('\n\n') || '—'}

## Feature endpoints
${(meta.features || []).map((f) => '- `' + f + '` — see server.js').join('\n') || '— (none configured)'}
`);
  w('database.md', `# Database — ${meta.name}

Backend: **${db.backend === 'postgresql' ? 'PostgreSQL' : 'file store (data/store.json)'}**
${db.backend === 'postgresql' ? 'Connection: configured via DATABASE_URL. Schema applied at boot from db/schema.sql.' : 'Schema source of truth: db/schema.js. Seeding happens on first boot only (db/seed.js). Destructive SQL is unavailable on the file backend; use PostgreSQL for SQL migrations.'}

## Tables
${(db.tables || []).map((t) => `### ${t.table} (${t.label || ''})
${t.columns ? t.columns.map((c) => '- ' + c.key + ' — ' + c.type).join('\n') : '—'}`).join('\n\n') || '—'}
`);
  w('guides/setup.md', `# Setup guide — ${meta.name}

## Prerequisites
- Node.js 20+
- (optional) a PostgreSQL instance to replace the built-in file store

## Run locally
\`\`\`bash
npm start          # listens on PORT (default 3210)
\`\`\`
Then open http://localhost:3210. Sample data is preloaded on first boot (file backend).

## Test
\`\`\`bash
npm test           # node --test tests/ — API round-trips + auth flow
\`\`\`

## Environment
Configure secrets/keys through NOIR → Environment (values are masked and never committed):
${(['DATABASE_URL', ...(meta.features || []).map((f) => f === 'ai_chat' ? 'OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY' : f === 'payments' ? 'STRIPE_SECRET_KEY' : null)].filter(Boolean).map((k) => '- ' + k)).join('\n') || '- none required'}
`);
  w('guides/deployment.md', `# Deployment guide — ${meta.name}

## Local sandbox deployment
Run **Deploy** in the NOIR workspace: NOIR runs a preflight (entrypoint, tests, security scan, environment, database), then serves the app and marks it Live. Real execution only — statuses reflect the actual pipeline.

## Current deployment state
- Status: ${dep ? dep.state : 'idle'}
- ${dep && dep.last ? 'Last: ' + dep.last.target + ' at ' + dep.last.at + ' — ' + (dep.last.url || 'local URL') : 'No deployment recorded yet.'}

## External hosting (Vercel / Supabase / Appwrite)
Connect the provider in NOIR → Integrations and add the required tokens under Environment (VERCEL_TOKEN, DATABASE_URL, APPWRITE_API_KEY…). NOIR requires real credentials before any remote operation — it never simulates one.

## Rollback
Every pipeline and major change creates a git checkpoint. Use Checkpoints → Restore to return to any recorded state (destructive action requires confirmation).
`);
  // keep .env.example in sync-ish with meta
  const envExample = path.join(dir, '.env.example');
  if (fs.existsSync(envExample) && !meta.auth) { /* exists already */ }
  return { written, count: written.length };
}
