// Feed (cards + likes + comments) and post view
import { App } from '../app.js';
import { $, $$, api, esc, escAttr, el, toast, fmtDate, initials, pageHead, loadingNode, errorBox, wireRetry, fetchTable, metaTable, saveRow, guard } from './ui.js';

const mainT = () => App.meta.main || 'posts';
const hasTable = (name) => App.meta.tables.some((t) => t.table === name);
const authorName = (row) => row.author || row.user_name || row.name || 'Member';

function rowCard(r, { withComments = false } = {}) {
  const body = r.body || r.content || r.text || r.description || '';
  const likes = Number(r.likes || r.like_count || 0);
  const comments = Number(r.comments || r.comment_count || 0);
  return el(`<div class="card feed-item" data-id="${escAttr(r.id)}">
    <div class="feed-head">
      <span class="avatar lg">${esc(initials(authorName(r)))}</span>
      <div><strong>${esc(authorName(r))}</strong><div class="muted small">${esc(fmtDate(r.created_at))}</div></div>
    </div>
    <h3 style="margin-bottom:6px">${esc(r.title || '')}</h3>
    <div class="feed-body">${esc(body)}</div>
    <div class="feed-actions">
      <button data-like>${r.liked ? '❤️' : '🤍'} <span data-like-c>${likes}</span></button>
      ${withComments ? `<button data-comment-toggle>💬 <span>${comments}</span></button>` : `<a href="#/post/${escAttr(r.id)}">💬 ${comments} · open →</a>`}
    </div>
    ${withComments ? `<div class="comments-box" hidden>
      <div class="comment" style="margin-left:0"></div>
      ${App.user ? `<div class="toolbar"><input class="searchbox" placeholder="Write a comment…"><button class="btn primary sm" data-send>Send</button></div>` : '<p class="muted small">Sign in to comment.</p>'}
    </div>` : ''}
  </div>`);
}

async function wireCard(card, q) {
  const r = { id: card.dataset.id };
  $('[data-like]', card).onclick = async () => {
    if (!App.user) { toast('Sign in to like', 'error'); location.hash = '#/login'; return; }
    try {
      const row = await api('/api/' + mainT() + '/' + r.id);
      const liked = !row.liked;
      const patch = { likes: Number(row.likes || 0) + (liked ? 1 : -1), liked: liked ? 'yes' : '' };
      await saveRow(mainT(), patch, r.id);
      const lc = $('[data-like-c]', card);
      if (lc) lc.textContent = Math.max(0, Number(patch.likes));
      $('[data-like]', card).textContent = liked ? '❤️ ' + patch.likes : '🤍 ' + patch.likes;
    } catch (e) { toast(e.message, 'error'); }
  };
  const box = $('.comments-box', card);
  if (box) {
    $('[data-comment-toggle]', card).onclick = async () => {
      box.hidden = !box.hidden;
      if (!box.hidden && !box.dataset.loaded) {
        box.dataset.loaded = '1';
        const rows = await fetchTable('comments').catch(() => []);
        const mine = rows.filter((c) => String(c.post_id) === String(r.id)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const cbox = $('.comment', box);
        cbox.innerHTML = mine.length ? mine.map((c) => `<div style="padding:2px 0"><strong>${esc(c.author || c.name || 'Member')}</strong> <span class="muted small">${esc(fmtDate(c.created_at))}</span><div>${esc(c.body || c.content)}</div></div>`).join('') : '<p class="muted small">No comments yet.</p>';
        const send = $('[data-send]', box);
        if (send) {
          send.onclick = async () => {
            const inp = $('input', box);
            if (!inp.value.trim()) return;
            try {
              await api('/api/comments', { body: { post_id: String(r.id), body: inp.value.trim(), author: App.user.name || App.user.email } });
              toast('Comment posted');
              inp.value = '';
              box.dataset.loaded = ''; box.hidden = true;
              const b = $('[data-comment-toggle]', card); if (b) b.innerHTML = '💬';
              location.hash = '#/feed';
            } catch (e) { toast(e.message, 'error'); }
          };
        }
      }
    };
  }
}

export function feed() {
  return guard(() => {
    const root = el(`<div></div>`);
    root.append(pageHead('Feed', hasTable('posts') ? 'Latest from the community' : ''));
    root.append(loadingNode());
    const load = async () => {
      try {
        const items = await fetchTable(mainT());
        $('.page-loading', root)?.remove();
        if (!items.length) { root.append(el('<div class="empty"><h3>Nothing posted yet</h3><p>Be the first to share something.</p></div>')); return; }
        const box = el(`<div class="grid"></div>`);
        for (const r of items) {
          const card = rowCard(r, { withComments: hasTable('comments') });
          box.append(card);
          await wireCard(card);
        }
        root.append(box);
      } catch (e) { const eb = errorBox(e); root.append(eb); wireRetry(eb, load); }
    };
    load();
    return root;
  });
}

export function post(params) {
  const id = params[0];
  const root = el(`<div></div>`);
  root.append(loadingNode());
  const load = async () => {
    try {
      const r = await api(`/api/${mainT()}/${encodeURIComponent(id)}`);
      root.innerHTML = '';
      const card = rowCard(r, { withComments: hasTable('comments') });
      root.append(el('<div style="max-width:720px;margin:0 auto"></div>'));
      const w = root.firstChild;
      w.append(el('<a class="muted small" href="#/feed">← Feed</a>'));
      w.append(card);
      await wireCard(card);
      const box = $('.comments-box', card);
      if (box) { box.hidden = false; $('[data-comment-toggle]', card)?.click(); }
    } catch (e) { const eb = errorBox(e); root.append(eb); wireRetry(eb, load); }
  };
  load();
  return root;
}
