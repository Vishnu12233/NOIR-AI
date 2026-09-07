// vercel/index.js — Vercel provider facade (used by the provider manager).
import { connGet, connSecrets } from '../core.js';
import * as auth from './auth.js';
import * as projects from './projects.js';
import * as environment from './environment.js';
import * as deployments from './deployments.js';
import * as logs from './logs.js';
import * as domains from './domains.js';
import { vercelClient } from './client.js';

export const CAPABILITIES = ['deployment', 'preview', 'production', 'environment_variables', 'domains', 'logs', 'status', 'cancel'];

export function clientFor(userId) {
  const row = connGet(userId, 'vercel');
  if (!row || row.status !== 'connected') return null;
  const { token } = connSecrets(row);
  const cfg = safeMeta(row);
  return { vc: vercelClient(token, { teamId: cfg.team_id || null }), login: cfg.login, teamId: cfg.team_id || null, account: cfg.login };
}
export function isConnected(userId) {
  const row = connGet(userId, 'vercel');
  return !!(row && row.status === 'connected');
}
function safeMeta(row) {
  try { const c = JSON.parse(row.config || '{}'); const m = {}; for (const k of Object.keys(c)) if (!k.startsWith('enc_')) m[k] = c[k]; return m; } catch { return {}; }
}

export const VercelProvider = {
  id: 'vercel',
  label: 'Vercel',
  capabilities: CAPABILITIES,
  auth, projects, environment, deployments, logs, domains, clientFor, isConnected,
};
export default VercelProvider;
