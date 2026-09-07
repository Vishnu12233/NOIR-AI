// u.js — tiny DOM/API toolkit shared by every NOIR-generated app
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function escAttr(s) { return esc(s).replace(/`/g, '&#96;'); }

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok || !json) throw new ApiError(json ? json.error : `HTTP ${res.status}`, json ? json.code : null, res.status);
  return json.data;
}
export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function initials(name) {
  return String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function toast(msg, kind = 'info') {
  let box = $('#toasts');
  if (!box) { box = el('<div id="toasts" aria-live="polite"></div>'); document.body.append(box); }
  const t = el(`<div class="toast toast-${kind}">${esc(msg)}</div>`);
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 6000 : 3200);
}

export function confirmDialog(title, message, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const overlay = el(`<div class="modal-overlay"><div class="modal">
      <h3>${esc(title)}</h3>
      <p class="muted">${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn ghost" data-a="cancel">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${esc(okLabel)}</button>
      </div></div></div>`);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const close = (val) => { overlay.remove(); resolve(val); };
    $('[data-a=cancel]', overlay).onclick = () => close(false);
    $('[data-a=ok]', overlay).onclick = () => close(true);
    document.body.append(overlay);
    $('button:not([data-a=cancel])', overlay)?.focus();
  });
}

export function fieldType(f) {
  if (f.type === 'number') return 'number';
  if (f.type === 'date') return 'date';
  if (f.type === 'datetime') return 'datetime-local';
  if (f.type === 'multiline') return 'textarea';
  if (f.type === 'password') return 'password';
  if (f.options && f.options.length) return 'select';
  if (f.key === 'email') return 'email';
  return 'text';
}
