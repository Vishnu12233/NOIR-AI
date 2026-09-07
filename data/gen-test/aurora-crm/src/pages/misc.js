// Auth, account settings, admin console, portfolio pages
import { App, setUser, rerender } from '../app.js';
import { $, $$, api, esc, escAttr, el, toast, fmtDate, initials, pageHead, loadingNode, errorBox, wireRetry, fetchTable, metaTable, visibleTables, cellHtml, statusBadge, guard } from './ui.js';

function authLayout(title, sub) {
  const root = el(`<div class="auth-wrap"><div class="auth-card">
    <div class="auth-logo"><span class="brand-dot"></span>${esc(App.meta.name)}</div>
    <div class="auth-sub">${sub}</div><h2 style="margin-top:14px">${title}</h2>
    <form data-f></form></div>
    <div class="footer-meta">Powered by NOIR</div></div>`);
  return root;
}

export function loginPage() {
  const root = authLayout('Sign in', 'Welcome back.');
  const form = $('form', root);
  form.innerHTML = `
    <label>Email</label><input type="email" name="email" autocomplete="email" required>
    <label>Password</label><input type="password" name="password" autocomplete="current-password" required>
    <button class="btn primary lg" style="width:100%;margin-top:18px">Sign in</button>
    <p class="muted small" style="margin-top:14px">New to ${esc(App.meta.name)}? <a href="#/signup">Create an account</a></p>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = $('button', form); btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const u = await api('/api/auth/login', { body: { email: fd.get('email'), password: fd.get('password') } });
      setUser(u); toast('Welcome back, ' + (u.name || u.email));
      location.hash = '#/';
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Sign in'; }
  };
  return root;
}

export function signupPage() {
  const root = authLayout('Create your account', 'Start using ' + App.meta.name + ' in seconds.');
  const form = $('form', root);
  form.innerHTML = `
    <label>Name</label><input name="name" required autocomplete="name">
    <label>Email</label><input type="email" name="email" required autocomplete="email">
    <label>Password</label><input type="password" name="password" required minlength="6" autocomplete="new-password">
    <p class="hint">At least 6 characters.</p>
    <button class="btn primary lg" style="width:100%;margin-top:14px">Create account</button>
    <p class="muted small" style="margin-top:14px">Already have an account? <a href="#/login">Sign in</a></p>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = $('button', form); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const u = await api('/api/auth/signup', { body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password') } });
      setUser(u); toast('Account created — welcome!');
      location.hash = '#/';
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Create account'; }
  };
  return root;
}

export function settingsPage() {
  return guard(() => {
    const root = el(`<div style="max-width:560px"></div>`);
    root.append(pageHead('Account settings', 'Manage your profile.'));
    const u = App.user;
    const card = el(`<div class="card">
      <form data-profile>
        <h3>Profile</h3>
        <label>Name</label><input name="name" value="${escAttr(u.name || '')}" required>
        <label>Email</label><input name="email" type="email" value="${escAttr(u.email || '')}" disabled>
        <p class="hint">Email changes require account support.</p>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary">Save profile</button></div>
      </form>
      <hr class="divider">
      <form data-pass>
        <h3>Change password</h3>
        <div class="form-row">
          <div><label>Current password</label><input type="password" name="current" required></div>
          <div><label>New password</label><input type="password" name="next" required minlength="6"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn ghost">Update password</button></div>
      </form>
      <hr class="divider">
      <h3>Session</h3>
      <p class="muted small">Signed in as <strong>${esc(u.email)}</strong> ${u.role === 'admin' ? '· admin' : ''}</p>
      <button class="btn danger" data-logout>Sign out everywhere</button>
    </div>`);
    root.append(card);
    $('form[data-profile]', card).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { const nu = await api('/api/auth/me', { method: 'PATCH', body: { name: fd.get('name') } }); setUser(nu); toast('Profile saved'); }
      catch (err) { toast(err.message, 'error'); }
    };
    $('form[data-pass]', card).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await api('/api/auth/password', { method: 'POST', body: { current: fd.get('current'), next: fd.get('next') } }); toast('Password updated'); e.target.reset(); }
      catch (err) { toast(err.message, 'error'); }
    };
    $('[data-logout]', card).onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* noop */ } setUser(null); location.hash = '#/login'; rerender(); };
    return root;
  });
}

export function adminPage() {
  return guard(() => {
    const root = el(`<div></div>`);
    root.append(pageHead('Admin console', 'Platform overview and user management.'));
    root.append(loadingNode());
    const load = async () => {
      try {
        const tables = visibleTables();
        const counts = {};
        for (const t of tables) counts[t.table] = (await fetchTable(t.table).catch(() => [])).length;
        const users = await api('/api/users').catch(() => []);
        const userRows = (users.items || users || []);
        $('.page-loading', root)?.remove();
        const kpis = Object.entries(counts).map(([t, n]) => `<div class="card kpi"><div class="k">${esc(t)}</div><div class="v">${n}</div></div>`).join('');
        const rows = userRows.map((u) => `<tr>
          <td>${esc(u.name || '')}</td><td>${esc(u.email)}</td>
          <td><span class="badge ${u.role === 'admin' ? 'accent' : ''}">${esc(u.role || 'user')}</span></td>
          <td>${esc(fmtDate(u.created_at))}</td>
          <td><div class="row-actions">
            ${u.role !== 'admin' ? `<button data-promote="${escAttr(u.id)}" title="Make admin">⬆️ Admin</button><button data-demote="${escAttr(u.id)}" title="Remove admin">⬇️</button>` : `<button data-demote="${escAttr(u.id)}">⬇️</button>`}
          </div></td></tr>`).join('');
        root.innerHTML += `<div class="grid cols-4" style="margin-bottom:16px">${kpis}</div>
          <div class="card"><h3 style="margin-top:0">Users</h3>
            <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5"><div class="empty">No users</div></td></tr>'}</tbody></table></div></div>`;
        $$('[data-promote]', root).forEach((b) => b.onclick = async () => { try { await api('/api/users/' + b.dataset.promote, { method: 'PATCH', body: { role: 'admin' } }); toast('Promoted'); load(); } catch (e) { toast(e.message, 'error'); } });
        $$('[data-demote]', root).forEach((b) => b.onclick = async () => { try { await api('/api/users/' + b.dataset.demote, { method: 'PATCH', body: { role: 'user' } }); toast('Demoted'); load(); } catch (e) { toast(e.message, 'error'); } });
      } catch (e) { const eb = errorBox(e); root.append(eb); wireRetry(eb, load); }
    };
    load();
    return root;
  });
}

export function portfolioPage() {
  const root = el(`<div></div>`);
  const hasContact = App.meta.tables.some((t) => t.table === 'messages');
  root.innerHTML = '';
  root.append(el(`<div class="port-hero">
    <div class="muted small" style="text-transform:uppercase;letter-spacing:.2em">Portfolio</div>
    <h1>${esc(App.meta.name)}</h1>
    <div class="port-tag muted">${esc(App.meta.tagline || 'What I build.')}</div>
  </div><div class="grid cols-3" data-projects></div>${hasContact ? `
  <div class="card" style="max-width:560px;margin:26px auto" id="contact">
    <h3>Get in touch</h3>
    <form data-contact>
      <label>Name</label><input name="name" required>
      <label>Email</label><input type="email" name="email" required>
      <label>Message</label><textarea name="body" required></textarea>
      <button class="btn primary" style="margin-top:14px">Send message</button>
      <p class="hint">Messages are stored with the app. Email delivery requires a configured provider in NOIR.</p>
    </form></div>` : ''}`));
  const grid = $('[data-projects]', root);
  const load = async () => {
    try {
      const rows = await fetchTable('projects');
      if (!rows.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Projects will appear here.</div>'; return; }
      grid.innerHTML = rows.map((p, i) => {
        const hue = (i * 47) % 360;
        return `<a class="card port-tile" href="#/item/${escAttr(p.id)}">
          <div style="height:110px;border-radius:10px;margin-bottom:12px;background:linear-gradient(135deg,hsl(${hue},55%,38%),hsl(${hue + 40},55%,26%));display:flex;align-items:center;justify-content:center;font-size:34px">${esc(p.emoji || '🖥️')}</div>
          <h3 style="margin:0 0 4px">${esc(p.name || p.title)}</h3>
          <div class="muted small">${esc((p.description || '').slice(0, 110))}</div></a>`;
      }).join('');
    } catch (e) { grid.innerHTML = '<div class="empty err">' + esc(e.message || e) + '</div>'; }
  };
  const form = $('[data-contact]', root);
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try { await api('/api/contact', { body: { name: fd.get('name'), email: fd.get('email'), body: fd.get('body') } }); toast('Message sent'); form.reset(); }
    catch (err) { toast(err.message, 'error'); }
  };
  load();
  return root;
}
