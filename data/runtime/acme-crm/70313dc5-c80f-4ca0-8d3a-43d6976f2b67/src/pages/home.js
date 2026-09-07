// Home / dashboard page
import { landingPage } from './landing.js';
import { App } from '../app.js';
import { $, $$, api, esc, el, toast, fmtDate, pageHead, loadingNode, errorBox, wireRetry, fetchTable, metaTable, visibleTables, cellHtml, statusBadge, rowCols, guard } from './ui.js';

export function home() {
  if (App.meta.landing) return landingPage();
  return guard(() => {
    const root = el(`<div></div>`);
    const hello = App.user ? `Welcome back, ${esc(App.user.name || App.user.email)}` : `Welcome to ${esc(App.meta.name)}`;
    root.append(pageHead(hello, App.meta.tagline || 'Overview of your workspace.'));
    root.append(loadingNode());
    const load = async () => {
      const box = $('.page-loading', root);
      try {
        const tables = visibleTables().slice(0, 6);
        const [counts, recent] = await Promise.all([
          Promise.all(tables.map(async (t) => ({ t, items: await fetchTable(t.table).catch(() => []) }))),
          fetchTable(App.meta.main || tables[0]?.table || 'items').catch(() => []),
        ]);
        if (box) box.remove();
        const kpis = counts.filter((c) => c.items.length).slice(0, 6);
        let kpiHtml = '';
        for (const c of kpis) kpiHtml += `<div class="card kpi"><div class="k">${esc(c.t.label)}</div><div class="v">${c.items.length}</div><div class="sub">records</div></div>`;
        if (!kpiHtml) kpiHtml = `<div class="card kpi"><div class="k">Getting started</div><div class="v">0</div><div class="sub">no data yet — create your first record</div></div>`;
        const recents = recent.slice(0, 6);
        const main = App.meta.main || tables[0]?.table || 'items';
        const mainCols = rowCols(main).slice(0, 5);
        const tableLabel = metaTable(main)?.label || 'Records';
        const head = (row) => row.name || row.title || row.email || ('#' + row.id);
        let rowsHtml = '';
        if (!recents.length) rowsHtml = '<tr><td colspan="6"><div class="empty" style="padding:18px">Nothing here yet. Use the pages in the sidebar to create records.</div></td></tr>';
        for (const r of recents) {
          const cols = mainCols.map((f) => `<td>${cellHtml(main, r, f)}</td>`).join('');
          rowsHtml += `<tr class="clickable" data-go="/item/${r.id}"><td><span class="linkish">${esc(head(r))}</span></td>${cols}<td class="muted">${esc(fmtDate(r.created_at))}</td></tr>`;
        }
        root.innerHTML = `
          <div class="grid cols-4" style="margin-bottom:16px">${kpiHtml}</div>
          <div class="card" style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h3 style="margin:0">Recent ${esc(tableLabel)}</h3>
              <a class="btn ghost sm" href="#/table/${esc(main)}">View all →</a>
            </div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th></th>${mainCols.map((f) => `<th>${esc(f.label || f.key)}</th>`).join('')}<th>Updated</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table></div>
          </div>
          <div class="footer-meta">Built by NOIR — ${esc(App.meta.stack || '')}</div>`;
        $$('[data-go]', root).forEach((a) => a.onclick = () => { location.hash = a.dataset.go; });
      } catch (e) {
        if (box) box.remove();
        const eb = errorBox(e);
        root.append(eb);
        wireRetry(eb, load);
      }
    };
    load();
    return root;
  });
}
