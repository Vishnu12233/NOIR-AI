// supabase/oauth.js — partner OAuth (platform-level client id/secret).
// Active ONLY when SUPABASE_OAUTH_CLIENT_ID + SECRET are configured on the NOIR
// server; otherwise connect with a personal access token (also supported).
// Callbacks: NOIR_PUBLIC_URL/api/oauth/supabase/callback
import crypto from 'node:crypto';
import { oauth } from '../../db.js';
import { connSet } from '../core.js';
import { httpJson, withRetry } from '../core.js';

const AUTHZ = 'https://api.supabase.com/v1/oauth/authorize';
const TOKEN = 'https://api.supabase.com/v1/oauth/token';

export function oauthAvailable() {
  return !!(process.env.SUPABASE_OAUTH_CLIENT_ID && process.env.SUPABASE_OAUTH_CLIENT_SECRET);
}
export function authorizeUrl(userId, publicUrl) {
  if (!oauthAvailable()) return null;
  const state = crypto.randomBytes(24).toString('hex');
  oauth.create(state, userId, 'supabase', publicUrl + '/api/oauth/supabase/callback');
  const u = new URL(AUTHZ);
  u.searchParams.set('client_id', process.env.SUPABASE_OAUTH_CLIENT_ID);
  u.searchParams.set('redirect_uri', publicUrl + '/api/oauth/supabase/callback');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'organizations projects database');
  u.searchParams.set('state', state);
  return u.toString();
}
export async function finish(code, state) {
  const sess = oauth.consume(state); // CSRF guard: state must exist and be consumed once
  if (!sess) throw new Error('OAuth state mismatch or expired — start the connection again.');
  const body = new URLSearchParams({
    client_id: process.env.SUPABASE_OAUTH_CLIENT_ID,
    client_secret: process.env.SUPABASE_OAUTH_CLIENT_SECRET,
    code,
    redirect_uri: sess.redirect_uri || '',
    grant_type: 'authorization_code',
  });
  const tok = await withRetry(() => httpJson({
    provider: 'supabase', base: 'https://api.supabase.com', path: '/v1/oauth/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }), { provider: 'supabase' });
  if (!tok.access_token) throw new Error('Supabase OAuth returned no access token.');
  connSet(sess.user_id, 'supabase', {
    status: 'connected',
    secrets: { token: tok.access_token, refresh_token: tok.refresh_token || null },
    meta: { scope: 'oauth', expires_in: tok.expires_in || null, verified_at: Date.now(), oauth: true },
  });
  return { user_id: sess.user_id, connected: true };
}
export async function refreshIfNeeded(userId) { /* refresh implemented on 401 inside client callers when refresh_token present */ return null; }
