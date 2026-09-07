// shared UI pieces for pages
import { App } from '../app.js';
import { $, $$, api, esc, escAttr, el, toast, fmtDate, initials, fieldType, confirmDialog } from '../lib/u.js';

export function metaTable(name) { return App.meta.tables.find((t) => t.table === name); }

export function visibleTables() {
  return (App.meta.tables || []).filter((t) => t.client !== false && !t.hidden);
}

export function rowCols(table) {
  const meta = metaTable(table);
  if (!meta) return [];
  return (meta.fields || []).filter((f) => !f.hidden && !f.private && !f.noAuto);
}

export function cellHtml(table, row, f) {
  const v = row[f.key];
  if (v === undefined || v === null || v === '') return '<span class="muted">—</span>';
  if (f.type === 'number' && f.money) return esc('$' + Number(v).toLocaleString());
  if (f.type === 'boolean') return `<span class="badge ${v ? 'ok' : ''}">${v ? 'Yes' : 'No'}</span>`;
  if (f.key === 'created_at' || f.key.endsWith('_at') || f.type === 'datetime') return esc(fmtDate(v));
  if (f.key === 'email') return `<a href="mailto:${escAttr(v)}">${esc(v)}</a>`;
  if (typeof v === 'object') return esc(JSON.stringify(v));
  return esc(String(v));
}

export function pageHead(title, subtitle, actionsHtml = '') {
  return el(`<div class="page-head"><div><h1>${title}</h1>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}</div><div class="page-actions">${actionsHtml}</div></div>`);
}

export function loadingNode() { return el('<div class="page-loading">Loading…</div>'); }

export async function fetchTable(table, q = '') {
  const url = q ? `/api/${table}?q=${encodeURIComponent(q)}` : `/api/${table}`;
  const data = await api(url);
  return data.items || [];
}

export function buildFormFields(table, row = {}) {
  const meta = metaTable(table);
  if (!meta) return '';
  const out = [];
  for (const f of (meta.fields || [])) {
    if (f.hidden || f.noAuto || f.private) continue;
    const v = row[f.key];
    const val = v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (f.options && f.options.length) {
      const opts = f.options.map((o) => {
        const ov = typeof o === 'object' ? o.value : o;
        const ol = typeof o === 'object' ? o.label : o;
        return `<option value="${escAttr(ov)}" ${String(ov) === val ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('');
      out.push(`<label>${esc(f.label || f.key)}${f.required ? ' *' : ''}</label><select name="${escAttr(f.key)}" ${f.required ? 'required' : ''}>${opts}</select>`);
    } else if (fieldType(f) === 'textarea') {
      out.push(`<label>${esc(f.label || f.key)}</label><textarea name="${escAttr(f.key)}">${esc(val)}</textarea>`);
    } else {
      const type = fieldType(f);
      const step = f.type === 'number' ? (f.money ? '0.01' : '1') : undefined;
      out.push(`<label>${esc(f.label || f.key)}${f.required ? ' *' : ''}</label><input type="${type}" name="${escAttr(f.key)}" value="${escAttr(val)}" ${step ? `step="${step}"` : ''} ${f.required ? 'required' : ''}>`);
    }
  }
  return out.join('');
}

export function openFormModal(table, row = null, { title } = {}) {
  const meta = metaTable(table);
  const name = meta?.label || table;
  return new Promise((resolve) => {
    const overlay = el(`<div class="modal-overlay"><div class="modal">
      <h3>${esc(title || (row ? 'Edit ' + name : 'New ' + name))}</h3>
      <form data-f>${buildFormFields(table, row || {})}
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-a="cancel">Cancel</button>
          <button type="submit" class="btn primary">${row ? 'Save changes' : 'Create'}</button>
        </div>
      </form></div></div>`);
    const close = (val) => { overlay.remove(); resolve(val); };
    $('[data-a=cancel]', overlay).onclick = () => close(null);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    $('form', overlay).onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {};
      const numErr = [];
      for (const [k, v] of fd.entries()) {
        const f = (meta.fields || []).find((x) => x.key === k);
        if (f && f.type === 'number') { payload[k] = v === '' ? '' : Number(v); if (Number.isNaN(payload[k])) numErr.push(k); }
        else if (f && f.type === 'boolean') payload[k] = v === 'on' || v === 'true';
        else payload[k] = v;
      }
      if (numErr.length) { toast('Invalid number in: ' + numErr.join(', '), 'error'); return; }
      close(payload);
    };
    document.body.append(overlay);
    const first = $('input,select,textarea', overlay);
    if (first) first.focus();
  });
}

export function saveRow(table, payload, id = null) {
  return id ? api(`/api/${table}/${id}`, { method: 'PATCH', body: payload }) : api(`/api/${table}`, { method: 'POST', body: payload });
}

export async function deleteRow(table, row) {
  const okc = await confirmDialog('Delete "' + (row.name || row.title || 'this ' + table) + '"?', 'This permanently removes the record. This action cannot be undone.', 'Delete', true);
  if (!okc) return false;
  await api(`/api/${table}/${row.id}`, { method: 'DELETE' });
  return true;
}

export function statusBadge(v) {
  const map = { done: 'ok', completed: 'ok', active: 'ok', paid: 'ok', live: 'ok', open: 'accent', pending: 'warn', in_progress: 'accent', todo: '', failed: 'err', cancelled: 'err', closed: '', draft: '' };
  const cls = map[String(v).toLowerCase()] || '';
  return `<span class="badge ${cls}">${esc(v || '')}</span>`;
}

export function errorBox(e) {
  const msg = (e && e.message) ? e.message : String(e);
  return el(`<div class="empty err"><h3>Request failed</h3><p>${esc(msg)}</p><button class="btn ghost" data-r>Retry</button></div>`);
}

export function wireRetry(node, fn) {
  $$('[data-r]', node).forEach((b) => b.onclick = fn);
}

export async function guard(main) {
  if (App.meta.auth && !App.user) { location.hash = '#/login'; return null; }
  return main();
}

export { $, $$, api, esc, escAttr, el, toast, fmtDate, initials, fieldType, confirmDialog, App };
