// Record detail page
import { App } from '../app.js';
import { $, api, esc, escAttr, el, toast, fmtDate, loadingNode, errorBox, wireRetry, openFormModal, saveRow, deleteRow, metaTable, rowCols, cellHtml, guard } from './ui.js';

export function detail(params) {
  return guard(() => {
    const id = params[0];
    const root = el(`<div></div>`);
    root.append(loadingNode());
    const load = async () => {
      const main = App.meta.main || (App.meta.tables[0] && App.meta.tables[0].table) || 'items';
      try {
        const row = await api(`/api/${main}/${encodeURIComponent(id)}`);
        const meta = metaTable(main);
        const cols = (meta?.fields || []).filter((f) => !f.hidden && !f.private);
        const title = row.name || row.title || row.email || ('Record #' + row.id);
        const head = (row) => row.name || row.title || row.email || ('#' + row.id);
        const headVal = row.name || row.title || row.email || ('#' + row.id);
        root.innerHTML = '';
        root.innerHTML = `
          <div class="page-head"><div><h1>${esc(headVal)}</h1><div class="sub">${esc(meta?.label || main)} · created ${esc(fmtDate(row.created_at))}</div></div>
          <div class="page-actions">
            <button class="btn ghost sm" data-back>← Back</button>
            <button class="btn primary sm" data-edit>Edit</button>
            <button class="btn danger sm" data-del>Delete</button>
          </div></div>
          <div class="detail-grid">
            <div class="card">
              ${cols.map((f) => {
                if (f.key === 'id') return '';
                const v = row[f.key];
                let disp;
                if (v === undefined || v === null || v === '') disp = '<span class="muted">—</span>';
                else if (f.type === 'multiline' || (typeof v === 'string' && String(v).length > 140)) disp = `<div class="code" style="white-space:pre-wrap;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;margin:8px 0">${esc(v)}</div>`;
                else disp = cellHtml(main, row, f);
                return `<div class="kv"><span class="k">${esc(f.label || f.key)}</span><span class="v">${disp}</span></div>`;
              }).join('')}
            </div>
            <div class="detail-side">
              <div class="card"><h4 style="margin-top:0">Record</h4>
                <div class="kv"><span class="k">ID</span><span class="v mono">#${escAttr(row.id)}</span></div>
                <div class="kv"><span class="k">Table</span><span class="v">${esc(meta?.label || main)}</span></div>
                <div class="kv"><span class="k">Updated</span><span class="v">${esc(fmtDate(row.updated_at))}</span></div>
              </div>
              <button class="btn primary" data-edit2>Edit record</button>
            </div>
          </div>`;
        const back = $('[data-back]', root); if (back) back.onclick = () => history.back();
        const editFn = async () => { const payload = await openFormModal(main, row); if (!payload) return; try { await saveRow(main, payload, row.id); toast('Saved'); load(); } catch (e) { toast(e.message, 'error'); } };
        const delFn = async () => { if (await deleteRow(main, row)) { toast('Deleted'); location.hash = '#/table/' + main; } };
        $('[data-edit]', root).onclick = editFn;
        $('[data-edit2]', root).onclick = editFn;
        $('[data-del]', root).onclick = delFn;
      } catch (e) {
        root.innerHTML = '';
        const eb = errorBox(e);
        root.append(eb);
        wireRetry(eb, load);
      }
    };
    load();
    return root;
  });
}
