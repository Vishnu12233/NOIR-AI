// providers/core.js — shared transport, error taxonomy, safe retries and
// encrypted connection storage for REAL provider integrations (Vercel, Supabase,
// Appwrite). No mocks, no simulations: every function either talks to a provider
// API or throws the provider's real error.
import { integrations } from '../db.js';
import { encryptSecret, decryptSecret } from '../engine/github.js';

export class ProviderError extends Error {
  constructor(message, { provider = 'provider', status = 0, code = 'PROVIDER_ERROR', retriable = false, retryAfter = null, raw = null, operation = '' } = {}) {
    super(message);
    this.provider = provider;
    this.status = status;      // http status (0 = network/timeout)
    this.code = code;
    this.retriable = retriable;
    this.retryAfter = retryAfter; // seconds, from provider Retry-After
    this.raw = raw;
    this.operation = operation;
  }
}

/** One real HTTP call to a provider. Throws ProviderError on non-2xx. */
export async function httpJson({ provider, base, path, method = 'GET', headers = {}, body, timeoutMs = 30000 }) {
  let res;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    res = await fetch(base.replace(/\/+$/, '') + path, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    throw new ProviderError('Network error reaching ' + provider + (e.name === 'AbortError' ? ' (timeout after ' + timeoutMs + 'ms)' : ': ' + String(e.cause?.message || e.message || e)), { provider, status: 0, code: 'NETWORK', retriable: true });
  } finally { clearTimeout(timer); }
  let text = '';
  try { text = await res.text(); } catch { /* noop */ }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* body not json */ }
  if (res.status >= 200 && res.status < 300) return json;
  const retryAfter = res.headers.get('retry-after');
  const retryAfterS = retryAfter ? Number(retryAfter) || null : null;
  const map = {
    401: ['UNAUTHORIZED', 'Authentication failed — the credential was rejected. Reconnect the provider.', false],
    403: ['FORBIDDEN', 'The connected credential is not allowed to do this. Check scopes/permissions on the provider.', false],
    404: ['NOT_FOUND', 'The provider resource does not exist.', false],
    409: ['CONFLICT', 'Conflict on the provider (resource already exists or state mismatch).', false],
    422: ['VALIDATION', 'The provider rejected the request payload.', false],
    429: ['RATE_LIMITED', 'Provider rate limit reached. Retry after the indicated time.', true],
  };
  const m = map[res.status] || (res.status >= 500 ? ['PROVIDER_ERROR', 'Provider returned HTTP ' + res.status + '.', true] : ['PROVIDER_ERROR', 'Provider returned HTTP ' + res.status + '.', false]);
  let msg = null;
  if (json) {
    if (typeof json.message === 'string') msg = json.message;
    else if (json.error && typeof json.error === 'object' && typeof json.error.message === 'string') msg = json.error.message;
    else if (json.error && typeof json.error === 'string') msg = json.error;
    else if (json.error_description) msg = json.error_description;
  }
  msg = msg || m[1];
  msg = String(msg).slice(0, 300);
  throw new ProviderError((provider + ': ' + msg).slice(0, 400), {
    provider, status: res.status, code: m[0], retriable: m[2], retryAfter: retryAfterS, raw: text.slice(0, 1000),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Safe retry: network/timeout/5xx/429 (respecting Retry-After). NEVER retries 4xx auth/permission/validation. */
export async function withRetry(fn, { provider, attempts = 3, label = 'request' } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!(e instanceof ProviderError) || !e.retriable || i === attempts - 1) throw e;
      const wait = Math.min(e.retryAfter || (500 * Math.pow(2, i)), 8000);
      await sleep(wait);
    }
  }
  throw last;
}

// ---- encrypted connection storage (per user + provider) ----
// Secret fields are stored AES-256-GCM encrypted (platform secret derived key).
// Public metadata (login, org…) is stored plain for list/detail views.
export function connGet(ownerId, provider) {
  return integrations.get(ownerId, provider);
}
export function connSecrets(row) {
  // returns decrypted secret map for a stored row
  const out = {};
  try { const cfg = JSON.parse(row.config || '{}'); for (const k of Object.keys(cfg)) if (k.startsWith('enc_')) out[k.slice(4)] = decryptSecret(cfg[k]); return out; }
  catch { return out; }
}
export function connSet(ownerId, provider, { status, secrets = {}, meta = {}, error = null }) {
  const cfg = { ...meta };
  for (const k of Object.keys(secrets)) if (secrets[k]) cfg['enc_' + k] = encryptSecret(String(secrets[k]));
  integrations.set(ownerId, provider, status || 'connected', cfg, error);
}
export function connPublic(row) {
  // sanitized view for API responses — never contains secrets
  if (!row) return null;
  const cfg = (() => { try { return JSON.parse(row.config || '{}'); } catch { return {}; } })();
  const meta = {};
  for (const k of Object.keys(cfg)) if (!k.startsWith('enc_')) meta[k] = cfg[k];
  return { provider: row.provider, status: row.status, error: row.error, updated_at: row.updated_at, ...meta };
}
