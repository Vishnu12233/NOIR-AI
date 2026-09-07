// supabase/auth.js — validate/connect a Supabase Management access token.
// OAuth (partner flow) lives in oauth.js — preferred for multi-user SaaS.
import { integrations } from '../../db.js';
import { sbClient } from './client.js';
import { connGet, connSet, connPublic, connSecrets } from '../core.js';

export async function validateToken(token) {
  // Real validation: list projects; throws the provider's real error if rejected.
  const me = await sbClient(String(token).trim()).get('/v1/projects');
  return { ok: true, projects_seen: Array.isArray(me) ? me.length : -1 };
}
export async function connect(userId, { token }) {
  if (!token || String(token).trim().length < 20) throw new Error('Paste a Supabase personal access token (Supabase dashboard → Account → Access Tokens).');
  const t = String(token).trim();
  await validateToken(t);
  connSet(userId, 'supabase', { status: 'connected', secrets: { token: t }, meta: { scope: 'personal_access_token', verified_at: Date.now() } });
  return { connected: true };
}
export async function testConnection(userId) {
  const row = connGet(userId, 'supabase');
  if (!row || row.status !== 'connected') return { connected: false, reason: 'not_connected', hint: 'Connect Supabase first.' };
  try {
    const { token } = connSecrets(row);
    const orgs = await sbClient(token).get('/v1/organizations');
    connSet(userId, 'supabase', { status: 'connected', secrets: { token }, meta: { scope: 'personal_access_token', verified_at: Date.now(), orgs: (orgs || []).map((o) => o.slug || o.id).slice(0, 5) } });
    return { connected: true, authenticated: true, permissionsValid: true, providerReachable: true, organizations: (orgs || []).length };
  } catch (e) {
    const cfg = safeCfg(row);
    integrations.set(userId, 'supabase', 'error', cfg, String(e.message || e).slice(0, 400));
    return { connected: false, authenticated: false, providerReachable: !(e.status === 0), error: e.message, code: e.code };
  }
}
function safeCfg(row) { try { const c = JSON.parse(row.config || '{}'); const m = {}; for (const k of Object.keys(c)) if (!k.startsWith('enc_')) m[k] = c[k]; return m; } catch { return {}; } }
export function status(userId) { return connPublic(connGet(userId, 'supabase')); }
export function disconnect(userId) { integrations.remove(userId, 'supabase'); }
