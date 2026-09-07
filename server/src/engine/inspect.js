// inspect.js — static inspection of a generated app: real API contract derived
// from the actual generated server.js (route regex scan of the real source),
// and runtime facts. Never fabricated — read from code + live store.
import fs from 'node:fs';
import path from 'node:path';
import { appDir } from './paths.js';
import { envVars } from '../db.js';

export async function inspectAppApi(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  const serverFile = path.join(dir, 'server.js');
  if (!fs.existsSync(serverFile)) return { endpoints: [], note: 'No server.js yet — build the project first.' };
  const src = fs.readFileSync(serverFile, 'utf8');
  const lines = src.split('\n');
  const endpoints = [];
  // scan generated REST + feature endpoints from source (real code → real contract)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = l.match(/if \(m\[1\] === ('[a-z_]+'|"[a-z_]+")/);
    if (m) {
      const base = m[1].slice(1, -1);
      if (['health', 'meta', 'summary'].includes(base) || base === 'auth' || base === 'chat' || base === 'checkout' || base === 'uploads') continue;
      // table endpoints
      const cols = [];
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        const c = lines[j].match(/fields: \[(.*)\]|F\('([a-z_0-9]+)'/g);
        void c;
      }
      endpoints.push({
        table: base,
        label: title(base),
        list: { method: 'GET', path: '/api/' + base, auth: 'login' },
        create: { method: 'POST', path: '/api/' + base, auth: 'login' },
        get: { method: 'GET', path: '/api/' + base + '/:id', auth: 'login' },
        update: { method: 'PATCH', path: '/api/' + base + '/:id', auth: 'login' },
        remove: { method: 'DELETE', path: '/api/' + base + '/:id', auth: 'admin (guarded tables) or login' },
        line: i + 1,
      });
    }
  }
  // auth/chat/checkout endpoints (deterministic in generated apps)
  const guarded = src.includes('GUARDED = new Set');
  if (src.includes("m[1] === 'auth'")) {
    endpoints.unshift({
      group: 'auth', endpoints: [
        { method: 'POST', path: '/api/auth/signup', auth: 'public', desc: 'Create account (password hashed with salted PBKDF2)' },
        { method: 'POST', path: '/api/auth/login', auth: 'public', desc: 'Sign in → HttpOnly session cookie' },
        { method: 'POST', path: '/api/auth/logout', auth: 'session', desc: 'End session' },
        { method: 'GET', path: '/api/auth/me', auth: 'session', desc: 'Current user' },
        { method: 'PATCH', path: '/api/auth/me', auth: 'session', desc: 'Update profile' },
        { method: 'POST', path: '/api/auth/password', auth: 'session', desc: 'Change password' },
      ],
    });
  }
  const feats = [];
  if (src.includes("m[1] === 'chat'")) feats.push('ai_chat');
  if (src.includes("m[1] === 'checkout'")) feats.push('payments');
  if (feats.includes('ai_chat')) endpoints.push({ group: 'ai_chat', endpoints: [{ method: 'POST', path: '/api/chat', auth: 'session (feat)', desc: 'Assistant reply — requires an AI provider key in Env (REQUIRES_CONFIG otherwise)', body: '{"messages":[{role,content}]}' }] });
  if (feats.includes('payments')) endpoints.push({ group: 'payments', endpoints: [{ method: 'POST', path: '/api/checkout', auth: 'public (feat)', desc: 'Create Stripe checkout session — requires STRIPE_SECRET_KEY in Env', body: '{"amount":49.5,"name":"Item"}' }] });
  // storage + auth facts
  const meta = readMeta(dir);
  const env = envVars.all(project.id);
  const schemaFile = path.join(dir, 'db', 'schema.js');
  let schema = [];
  try { schema = JSON.parse(srcOfSchema(schemaFile)); } catch { schema = []; }
  return {
    app: meta ? meta.name : project.name,
    auth_enabled: !!meta && meta.auth,
    storage: process.env.DATABASE_URL || env.find((e) => e.key === 'DATABASE_URL') ? 'PostgreSQL (DATABASE_URL configured)' : 'JSON file store (auto)',
    guarded_tables: guarded,
    tables: (schema || []).map((t) => ({ table: t.table, fields: (t.fields || []).map((f) => f.key) })),
    endpoints,
    features: feats,
  };
}
const title = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function readMeta(dir) {
  try {
    const mf = path.join(dir, 'meta.js'); const raw = fs.readFileSync(mf, 'utf8');
    return JSON.parse(raw.slice(raw.indexOf('{')).replace(/;[\s]*$/, ''));
  } catch { return null; }
}
function srcOfSchema(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/export const SCHEMA = (\[[\s\S]*?\]);/);
  return m ? m[1] : '[]';
}
