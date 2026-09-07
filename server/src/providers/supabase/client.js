// supabase/client.js — HTTP client for the Supabase Management API.
import { httpJson, withRetry } from '../core.js';
export const BASE = 'https://api.supabase.com/v1';
export function sbClient(token) {
  const auth = { authorization: 'Bearer ' + token };
  return {
    get: (path, opts = {}) => withRetry(() => httpJson({ provider: 'supabase', base: BASE, path, headers: auth, timeoutMs: opts.timeoutMs || 30000 }), { provider: 'supabase' }),
    post: (path, body) => withRetry(() => httpJson({ provider: 'supabase', base: BASE, path, method: 'POST', headers: auth, body }), { provider: 'supabase' }),
    put: (path, body) => withRetry(() => httpJson({ provider: 'supabase', base: BASE, path, method: 'PUT', headers: auth, body }), { provider: 'supabase' }),
    patch: (path, body) => withRetry(() => httpJson({ provider: 'supabase', base: BASE, path, method: 'PATCH', headers: auth, body }), { provider: 'supabase' }),
    del: (path) => withRetry(() => httpJson({ provider: 'supabase', base: BASE, path, method: 'DELETE', headers: auth }), { provider: 'supabase' }),
  };
}
