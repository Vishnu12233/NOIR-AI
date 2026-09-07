// NOIR client API layer
const TOKEN_KEY = 'noir_token';

export function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ } }

export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

export async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  const tok = getToken();
  if (tok) headers['x-noir-token'] = tok;
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let json = null;
  try { json = await res.json(); } catch { /* noop */ }
  if (!res.ok || !json || json.ok === false) {
    const err = new ApiError((json && json.error) || ('Request failed (' + res.status + ')'), json && json.code, res.status);
    if (res.status === 401) setToken(null);
    throw err;
  }
  return json.data;
}

export const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
export const fmtAgo = (ts) => {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};
export const prettyBytes = (b) => { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; };

export function sseConnect(projectId, handlers) {
  const es = new EventSource('/api/projects/' + projectId + '/events');
  es.onmessage = (e) => { try { const d = JSON.parse(e.data); handlers.onEvent && handlers.onEvent(d); } catch { /* noop */ } };
  es.onopen = () => handlers.onOpen && handlers.onOpen();
  es.onerror = () => handlers.onError && handlers.onError();
  return () => es.close();
}

// download a binary (ZIP export) with auth header
export async function apiDownload(path, filename) {
  const tok = getToken();
  const res = await fetch('/api' + path, { headers: tok ? { 'x-noir-token': tok } : {}, credentials: 'same-origin' });
  if (!res.ok) { let e = 'Download failed (' + res.status + ')'; try { const j = await res.json(); if (j.error) e = j.error; } catch { /* noop */ } throw new ApiError(e, 'DOWNLOAD', res.status); }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'noir-download.bin';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
export function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
