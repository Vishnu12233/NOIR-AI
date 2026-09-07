// vercel/client.js — HTTP client bound to the Vercel REST API.
// Base: https://api.vercel.com — Bearer auth — real calls only.
import { httpJson, withRetry, ProviderError } from '../core.js';
export const BASE = 'https://api.vercel.com';

export function vercelClient(token, { teamId } = {}) {
  const auth = { authorization: 'Bearer ' + token };
  const q = (extra = '') => (teamId ? '?' + (extra ? extra + '&' : '') + 'teamId=' + encodeURIComponent(teamId) : (extra ? '?' + extra : ''));
  return {
    get: (path, opts = {}) => withRetry(() => httpJson({ provider: 'vercel', base: BASE, path: path + q(opts.query), headers: auth, timeoutMs: opts.timeoutMs }), { provider: 'vercel' }),
    post: (path, body) => withRetry(() => httpJson({ provider: 'vercel', base: BASE, path, method: 'POST', headers: auth, body }), { provider: 'vercel' }),
    patch: (path, body) => withRetry(() => httpJson({ provider: 'vercel', base: BASE, path, method: 'PATCH', headers: auth, body }), { provider: 'vercel' }),
    del: (path) => withRetry(() => httpJson({ provider: 'vercel', base: BASE, path, method: 'DELETE', headers: auth }), { provider: 'vercel' }),
  };
}

export { ProviderError };
