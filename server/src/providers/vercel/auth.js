// vercel/auth.js — credential validation, user/team info, connect/disconnect.
import { integrations } from '../../db.js';
import { vercelClient } from './client.js';
import { connGet, connSet, connSecrets, connPublic } from '../core.js';

export async function whoami(token, { teamId } = {}) {
  const vc = vercelClient(token, { teamId });
  const me = await vc.get('/v2/user');
  const teams = await vc.get('/v2/teams').catch(() => ({ teams: [] }));
  return {
    login: (me.user && (me.user.username || me.user.email)) || null,
    name: me.user && me.user.name,
    email: me.user && me.user.email,
    teams: (teams.teams || []).map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    scopes: 'token',
  };
}

export async function connect(userId, { token, teamId = null }) {
  if (!token || String(token).trim().length < 10) throw new Error('Paste a Vercel access token (Vercel → Settings → Tokens; needs project + deployment access).');
  const info = await whoami(String(token).trim(), { teamId }); // real validation — provider error surfaces verbatim on rejection
  connSet(userId, 'vercel', {
    status: 'connected',
    secrets: { token: String(token).trim() },
    meta: { login: info.login, name: info.name, email: info.email, team_id: teamId, scope: 'personal_access_token', verified_at: Date.now() },
  });
  return { connected: true, login: info.login, teams: info.teams };
}

export async function testConnection(userId) {
  const row = connGet(userId, 'vercel');
  if (!row || row.status !== 'connected') return { connected: false, reason: 'not_connected', hint: 'Connect Vercel first.' };
  try {
    const { token } = connSecrets(row);
    const cfg = safeCfg(row);
    const me = await vercelClient(token, { teamId: cfg.team_id || null }).get('/v2/user'); // real request
    connSet(userId, 'vercel', { status: 'connected', secrets: { token }, meta: { ...cfg, verified_at: Date.now() } });
    return { connected: true, authenticated: true, permissionsValid: true, providerReachable: true, login: me.user && (me.user.username || me.user.email) };
  } catch (e) {
    integrations.set(userId, 'vercel', 'error', safeCfg(row), String(e.message || e).slice(0, 400));
    return { connected: false, authenticated: false, providerReachable: !(e.status === 0), error: e.message, code: e.code };
  }
}
function safeCfg(row) {
  try { const c = JSON.parse(row.config || '{}'); const m = {}; for (const k of Object.keys(c)) if (!k.startsWith('enc_')) m[k] = c[k]; return m; } catch { return {}; }
}

export function status(userId) {
  return connPublic(connGet(userId, 'vercel'));
}
export function disconnect(userId) {
  integrations.remove(userId, 'vercel');
}
