// appwrite/auth.js — connect/validate an Appwrite endpoint + project + API key.
// Validation is real: it probes project-scoped endpoints and surfaces the actual
// provider error when the key/project is rejected or lacks read scopes.
import { integrations } from '../../db.js';
import { awClient } from './client.js';
import { connGet, connSet, connPublic, connSecrets } from '../core.js';

export async function validate({ endpoint, project, key }) {
  const aw = awClient({ endpoint, project, key });
  let out = null;
  const probes = [
    () => aw.get('/v1/projects/' + encodeURIComponent(project)).then((p) => ({ kind: 'project', project: p.name || p.$id || project })),
    () => aw.get('/v1/databases').then((d) => ({ kind: 'databases', total: d.total })),
    () => aw.get('/v1/storage/buckets').then((s) => ({ kind: 'storage', total: s.total })),
    () => aw.get('/v1/health').then(() => ({ kind: 'health' })),
  ];
  const errs = [];
  for (const probe of probes) {
    try { out = await probe(); if (out) break; } catch (e) { errs.push(e); }
  }
  if (!out) {
    const first = errs[0];
    const msg = first ? first.message : 'Appwrite rejected the credentials';
    if (/401|unauthoriz|invalid key|permission|403|scope/i.test(msg)) throw new Error('Appwrite rejected the API key for project "' + project + '": ' + msg.slice(0, 220) + ' — give the key the scopes you need (databases/storage/functions/sites read+write).');
    throw new Error(msg);
  }
  return { ...out, endpoint: aw.base, project };
}

export async function connect(userId, { endpoint, project, key, consoleKey = null }) {
  if (!String(key || '').trim()) throw new Error('Paste an Appwrite API key for the project.');
  const info = await validate({ endpoint, project, key });
  connSet(userId, 'appwrite', {
    status: 'connected',
    secrets: { key: String(key).trim(), console_key: consoleKey ? String(consoleKey).trim() : null },
    meta: { endpoint: info.endpoint, project, project_name: info.project, tier: 'project', verified_at: Date.now() },
  });
  return { connected: true, project, project_name: info.project, tier: 'project' };
}

export async function testConnection(userId) {
  const row = connGet(userId, 'appwrite');
  if (!row || row.status !== 'connected') return { connected: false, reason: 'not_connected', hint: 'Connect Appwrite first.' };
  try {
    const { key } = connSecrets(row);
    const cfg = safeCfg(row);
    const info = await validate({ endpoint: cfg.endpoint, project: cfg.project, key });
    connSet(userId, 'appwrite', { status: 'connected', secrets: { key }, meta: { ...cfg, verified_at: Date.now() } });
    return { connected: true, authenticated: true, permissionsValid: true, providerReachable: true, project: cfg.project };
  } catch (e) {
    integrations.set(userId, 'appwrite', 'error', safeCfg(row), String(e.message || e).slice(0, 400));
    return { connected: false, authenticated: false, providerReachable: !(e.status === 0), error: e.message, code: e.code };
  }
}
function safeCfg(row) { try { const c = JSON.parse(row.config || '{}'); const m = {}; for (const k of Object.keys(c)) if (!k.startsWith('enc_')) m[k] = c[k]; return m; } catch { return {}; } }
export function status(userId) { return connPublic(connGet(userId, 'appwrite')); }
export function disconnect(userId) { integrations.remove(userId, 'appwrite'); }
