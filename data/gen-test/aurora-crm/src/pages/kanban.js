// Kanban board for the main table (uses its status-like field)
import { App } from '../app.js';
import { $, $$, api, esc, escAttr, el, toast, pageHead, loadingNode, errorBox, wireRetry, fetchTable, openFormModal, saveRow, deleteRow, metaTable, guard, confirmDialog } from './ui.js';

export function kanban() {
  return guard(() => {
    const main = App.meta.main || 'items';
    const meta = metaTable(main);
    const statusField = (meta?.fields || []).find((f) => f.key === 'status' || f.key === 'state') || (meta?.fields || [])[0];
    const statuses = (statusField?.options || [{ value: 'todo', label: 'To do' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }]).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
    const root = el(`<div></div>`);
    const title = (r) => r.name || r.title || r.email || ('#' + r.id);

    const load = async () => {
      try {
        const items = await fetchTable(main);
        root.innerHTML = '';
        root.append(pageHead('Board', meta?.label || 'Records'));
        const board = el(`<div class="kanban">${statuses.map(() => '<div class="kan-col"></div>').join('')}</div>`);
        root.append(board);
        const cols = $$('.kan-col', board);
        statuses.forEach((s, i) => {
          const colItems = items.filter((r) => String(r[statusField.key] || '') === String(s.value));
          cols[i].innerHTML = `<h3>${esc(s.label)} <span class="badge">${colItems.length}</span></h3>
            <div class="kan-cards">${colItems.map((r) => `
              <div class="kan-card" draggable="true" data-id="${escAttr(r.id)}">
                <h4>${esc(title(r))}</h4>
                <div class="muted small">${esc(fmtShort(r.created_at))}</div>
              </div>`).join('') || '<p class="muted small" style="padding:6px">Empty</p>'}</div>`;
          cols[i].querySelector('.kan-cards').dataset.status = s.value;
        });
        board.addEventListener('dragover', (e) => { const c = e.target.closest('.kan-col'); if (c) { e.preventDefault(); } });
        board.addEventListener('drop', async (e) => {
          const col = e.target.closest('.kan-col');
          const card = document.querySelector('.kan-card.dragging');
          if (!col || !card) return;
          const id = card.dataset.id;
          const status = col.querySelector('.kan-cards').dataset.status;
          try { await saveRow(main, { [statusField.key]: status }, id); toast('Moved → ' + status); load(); }
          catch (err) { toast(err.message, 'error'); }
        });
        $$('.kan-card', board).forEach((c) => c.addEventListener('dragstart', () => c.classList.add('dragging')));
        $$('.kan-card', board).forEach((c) => c.addEventListener('dragend', () => c.classList.remove('dragging')));
        board.querySelector('.kan-col .kan-cards') || null;
      } catch (e) {
        root.innerHTML = '';
        const eb = errorBox(e); root.append(eb); wireRetry(eb, load);
      }
    };
    load();
    return root;
  });
}

function fmtShort(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; }
}
