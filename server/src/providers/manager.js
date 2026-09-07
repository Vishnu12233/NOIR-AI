// providers/manager.js — unified provider abstraction. The API/builder layers
// never contain provider-specific logic: they talk to a Provider through this
// interface + capability map.
import { VercelProvider } from './vercel/index.js';
import { SupabaseProvider } from './supabase/index.js';
import { AppwriteProvider } from './appwrite/index.js';
import { CAPABILITY_REGISTRY } from './capabilities.js';

export const PROVIDERS = {
  vercel: VercelProvider,
  supabase: SupabaseProvider,
  appwrite: AppwriteProvider,
};
export const provider = (id) => PROVIDERS[id] || null;
export const capabilitiesOf = (id) => CAPABILITY_REGISTRY[id] || {};
export const hasCapability = (id, cap) => {
  const c = capabilitiesOf(id)[cap];
  return c === true;
};

/** Connect entry used by the API: validates live, stores encrypted, returns sanitized meta. */
export async function connectProvider(userId, providerId, params) {
  const p = provider(providerId);
  if (!p) throw new Error('Unknown provider.');
  switch (providerId) {
    case 'vercel': return p.auth.connect(userId, { token: params.token, teamId: params.team_id || null });
    case 'supabase': return p.auth.connect(userId, { token: params.token });
    case 'appwrite': return p.auth.connect(userId, { endpoint: params.endpoint, project: params.project, key: params.key });
    default: throw new Error('Provider has no connect flow.');
  }
}
export async function testProvider(userId, providerId) {
  const p = provider(providerId);
  if (!p) throw new Error('Unknown provider.');
  if (!p.auth.testConnection) return { connected: false, error: 'No test implemented for this provider.' };
  return p.auth.testConnection(userId);
}
export async function statusProvider(userId, providerId) {
  const p = provider(providerId);
  const row = p && p.auth.status ? p.auth.status(userId) : null;
  return row || { provider: providerId, status: 'not_connected' };
}
export async function disconnectProvider(userId, providerId) {
  const p = provider(providerId);
  if (!p || !p.auth.disconnect) return false;
  p.auth.disconnect(userId);
  return true;
}
