// appwrite/client.js — HTTP client for an Appwrite endpoint.
// Auth: X-Appwrite-Project (project id) + X-Appwrite-Key (project API key) for
// project-scoped APIs. Console/org APIs additionally need a console key — the
// provider reports credential-tier honestly from real API responses.
import { httpJson, withRetry } from '../core.js';
export const CLOUD = 'https://cloud.appwrite.io/v1';
export function awClient({ endpoint = CLOUD, project, key }) {
  const base = String(endpoint || CLOUD).replace(/\/+$/, '');
  const headers = { 'x-appwrite-key': key };
  if (project) headers['x-appwrite-project'] = project;
  const call = (method, path, body, opts = {}) => withRetry(() => httpJson({
    provider: 'appwrite', base, path, method, headers,
    body, timeoutMs: opts.timeoutMs || 60000,
  }), { provider: 'appwrite' });
  return {
    base,
    get: (path, opts) => call('GET', path, undefined, opts),
    post: (path, body, opts) => call('POST', path, body, opts),
    put: (path, body, opts) => call('PUT', path, body, opts),
    patch: (path, body, opts) => call('PATCH', path, body, opts),
    del: (path, opts) => call('DELETE', path, undefined, opts),
  };
}
/** Send multipart/form-data (e.g. site deployment code archives). */
export async function awMultipart(aw, method, path, fields, fileField, fileName, buffer, mime) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null) fd.set(k, String(v));
  if (buffer) fd.set(fileField, new Blob([buffer], { type: mime || 'application/gzip' }), fileName || 'archive');
  return withRetry(() => httpJson({ provider: 'appwrite', base: aw.base, path, method, headers: { 'x-appwrite-project': aw.headers['x-appwrite-project'], 'x-appwrite-key': aw.headers['x-appwrite-key'] }, body: fd }), { provider: 'appwrite' });
}
