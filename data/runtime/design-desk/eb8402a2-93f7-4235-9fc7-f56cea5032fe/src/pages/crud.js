// Generic CRUD list page with search, add/edit modal, delete, CSV export
import { App } from '../app.js';
import { $, $$, api, esc, escAttr, el, toast, fmtDate, pageHead, loadingNode, errorBox, wireRetry, fetchTable, visibleTables, cellHtml, openFormModal, saveRow, deleteRow, statusBadge, rowCols, guard } from './ui.js';

export function crud(params) {
  return guard(() => {
    const requested = params[0] || null;
    const tables = visibleTables();
    const table = tables.some((t) => t.table === requested) ? requested : (tables[0]?.table || 'items');
    const meta = tables.find((t) => t.table === table);
    const root = el(`<div></div>`);

    const renderTabs = () => {
      const tabs = tables.length > 1 ? `<div class="toolbar">
        ${tables.map((t) => `<a class="btn sm ${t.table === table ? 'primary' : 'ghost'}" href="#/table/${escAttr(t.table)}">${esc(t.label)}</a>`).join('')}
      </div>` : '';
      return tabs;
    };

    const load = async () => {
      root.innerHTML = '';
      const head = pageHead(esc(meta?.label || 'Records'), 'Create, edit, search and export records.', `
        <a class="btn ghost sm" href="/api/${escAttr(table)}?fmt=csv" download="${escAttr(table)}.csv">⬇ CSV</a>
        <button class="btn primary sm" data-new>+ New ${esc(meta?.label || 'record')}</button>`);
      root.append(head);
      const wrap = el(`<div>
        ${renderTabs()}
        <div class="toolbar"><input type="search" class="searchbox" placeholder="Search ${esc(meta?.label || 'records')}…" aria-label="Search"></div>
        <div class="table-wrap"><table class="data"><thead></thead><tbody><tr><td><div class="page-loading">Loading…</div></td></tr></tbody></table></div>
      </div>`);
      root.append(wrap);
      const tbody = $('tbody', wrap);
      const cols = rowCols(table).slice(0, 8);
      const thead = $('thead', wrap);
      thead.innerHTML = `<tr><th></th>${cols.map((f) => `<th>${esc(f.label || f.key)}</th>`).join('')}<th>Updated</th><th></th></tr>`;

      const paint = async (q = '') => {
        try {
          const items = await fetchTable(table, q);
          if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="${cols.length + 3}"><div class="search-empty">${q ? 'No matches for "' + esc(q) + '".' : 'No ' + esc(meta?.label || 'records') + ' yet — create the first one.'}</div></td></tr>`;
            return;
          }
          let html = '';
          for (const r of items) {
            const headV = r.name || r.title || r.email || r.label || ('#' + r.id);
            const cells = cols.map((f) => {
              const v = r[f.key];
              const isStatus = f.options && f.options.length;
              const display = isStatus ? statusBadge(v) : cellHtml(table, r, f);
              if (v === undefined || v === null || v === '') return `<td class="muted">—</td>`;
              if (f.key === 'id' && !cols.some((x) => x.key !== 'id')) return `<td>${display}</td>`;
              return `<td>${display}</td>`;
            }).join('');
            html += `<tr data-id="${escAttr(r.id)}">
              <td class="linkish clickable" data-go="${escAttr(r.id)}">${esc(String(headV).slice(0, 60))}</td>
              ${cells}
              <td class="muted small">${esc(fmtDate(r.updated_at || r.created_at))}</td>
              <td><div class="row-actions">
                <button data-edit="${escAttr(r.id)}" title="Edit">✏️</button>
                <button data-del="${escAttr(r.id)}" title="Delete">🗑️</button>
              </div></td></tr>`;
          }
          tbody.innerHTML = html;
          const openItem = (id) => {
            if (table === App.meta.main) { location.hash = '#/item/' + id; return; }
            const row = items.find((x) => String(x.id) === String(id));
            if (row) editRow(row);
          };
          async function editRow(row) {
            const payload = await openFormModal(table, row);
            if (!payload) return;
            try { await saveRow(table, payload, row.id); toast('Saved'); paint(q); } catch (e) { toast(e.message, 'error'); }
          }
          $$('td[data-go]', tbody).forEach((td) => td.onclick = () => openItem(td.dataset.go));
          $$('[data-edit]', tbody).forEach((b) => b.onclick = async () => {
            const row = items.find((x) => String(x.id) === String(b.dataset.edit));
            if (row) editRow(row);
          });
          $$('[data-del]', tbody).forEach((b) => b.onclick = async () => {
            const row = items.find((x) => String(x.id) === String(b.dataset.del));
            if (!row) return;
            if (await deleteRow(table, row)) { toast('Deleted'); paint(q); }
          });
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="9">${esc(e.message || e)} — <a href="javascript:location.reload()">reload</a></td></tr>`;
          toast(e.message, 'error');
        }
      };

      const search = $('.searchbox', wrap);
      let deb;
      search.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => paint(search.value), 250); });
      $('[data-new]', head).onclick = async () => {
        const payload = await openFormModal(table);
        if (!payload) return;
        try { const created = await saveRow(table, payload); toast('Created'); paint(); if (created && App.meta.detail) location.hash = '#/item/' + created.id; } catch (e) { toast(e.message, 'error'); }
      };
      paint();
    };
    load();
    return root;
  });
}
