// app.js — NOIR-generated app shell: routing, sessions, layout, theme.
import { el, $, $$, api, esc, escAttr, toast, initials, ApiError } from './lib/u.js';
import * as P from './pages/index.js';

export const App = {
  meta: { tables: [], nav: [], name: 'App', auth: false, statuses: [], main: 'items', brand: 'NOIR' },
  user: null,
  route: { name: 'home', params: {} },
};

async function loadMeta() {
  App.meta = await api('/api/meta');
  try { document.title = App.meta.name; } catch { /* noop */ }
}

const htmlIcon = (i) => i || '•';
function renderNav() {
  const nav = App.meta.nav || [];
  const isActive = (p) => {
    if (p.route) return App.route.name === p.route;
    if (p.exact) return App.route.path === p.path;
    return App.route.path.startsWith(p.path);
  };
  return nav.map((n) => {
    const show = (!n.auth || App.user) && (!n.role || (App.user && App.user.role === n.role));
    if (!show) return '';
    const cls = 'nav-item' + (isActive(n) ? ' active' : '');
    return `<a class="${cls}" href="#${n.path}" data-nav data-path="${escAttr(n.path)}"><span class="nav-ico">${htmlIcon(n.icon)}</span><span class="nav-lab">${esc(n.label)}</span></a>`;
  }).join('');
}

function themeToggleHtml() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return `<button class="icon-btn" data-action="theme" title="Toggle light/dark theme">${dark ? '☀️' : '🌙'}</button>`;
}

function renderShell() {
  const u = App.user;
  const brand = App.meta.brand || 'NOIR';
  const authUi = App.meta.auth ? `
    ${u ? `<div class="user-chip"><span class="avatar">${initials(u.name || u.email)}</span><span class="user-name">${esc(u.name || u.email)}</span><span class="caret">▾</span>
      <div class="user-menu">
        <button data-action="settings">Settings</button>
        ${u.role === 'admin' ? `<button data-action="admin">Admin</button>` : ''}
        <button data-action="logout">Sign out</button>
      </div></div>` : `<a class="btn ghost sm" href="#/login">Sign in</a><a class="btn primary sm" href="#/signup">Get started</a>`}`
    : '';
  return el(`<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-dot"></span><span class="brand-name">${esc(brand)}</span></div>
      <nav class="nav">${renderNav()}</nav>
      <div class="sidebar-foot">${authUi}</div>
    </aside>
    <div class="topbar">
      <button class="icon-btn menu-btn" data-action="menu" title="Toggle navigation">☰</button>
      <div class="topbar-spacer"></div>
      ${themeToggleHtml()}
    </div>
    <main class="content" id="view"></main>
    <footer class="generated-by">Generated with NOIR · ${esc(App.meta.name)}</footer>
  </div>`);
}

export function rerender() {
  document.body.dataset.theme = App.theme || 'dark';
  const root = $('#root');
  const shell = renderShell();
  root.innerHTML = '';
  root.append(shell);
  const view = $('#view');
  view.innerHTML = '<div class="page-loading">Loading…</div>';
  wireShell(shell);
  const page = pages[App.route.name];
  if (!page) { view.innerHTML = `<div class="empty"><h3>404</h3><p>Page not found.</p><a class="btn primary" href="#/">Back home</a></div>`; return; }
  Promise.resolve(page(App.route.params, view)).then((node) => {
    if (node) { view.innerHTML = ''; view.append(node); }
  }).catch((e) => {
    view.innerHTML = `<div class="empty err"><h3>Something went wrong</h3><p>${esc(e.message || e)}</p><button class="btn primary" data-action="reload">Reload</button></div>`;
    $('[data-action=reload]', view).onclick = () => location.reload();
  });
}

function wireShell(shell) {
  const view = $('#view');
  const toggleThemeBtn = () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const btn = $('[data-action=theme]', shell);
    if (btn) btn.textContent = dark ? '☀️' : '🌙';
  };
  toggleThemeBtn();
  $$('[data-action=theme]', shell).forEach((b) => b.onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(App.meta.name + ':theme', next); } catch { /* noop */ }
    toggleThemeBtn();
  });
  $$('[data-action=menu]', shell).forEach((b) => b.onclick = () => document.body.classList.toggle('nav-collapsed'));
  const um = $('.user-menu', shell);
  const chip = $('.user-chip', shell);
  if (chip && um) {
    chip.onclick = (e) => { e.stopPropagation(); um.classList.toggle('open'); };
    document.addEventListener('click', (e) => { if (!chip.contains(e.target)) um.classList.remove('open'); });
    $$('button', um).forEach((b) => b.onclick = async () => {
      um.classList.remove('open');
      const a = b.dataset.action;
      if (a === 'logout') {
        try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* noop */ }
        App.user = null; location.hash = '#/login'; rerender();
        toast('Signed out');
      } else if (a === 'settings') location.hash = '#/settings';
      else if (a === 'admin') location.hash = '#/admin';
    });
  }
}

// ---------------- routing ----------------
const pages = { ...P };
const ROUTES = [];
export function route(name, pattern, opts = {}) {
  ROUTES.push({ name, pattern, opts });
}

async function applyRoute() {
  const hash = (location.hash || '#/').slice(1) || '/';
  const [pathPart] = hash.split('?');
  for (const r of ROUTES) {
    const m = pathPart.match(r.pattern);
    if (m) {
      if (App.meta.auth && !r.opts.public) {
        if (!App.user) {
          await authReady;
          if (!App.user) { location.hash = '#/login'; return; }
        }
      }
      if (r.opts.role && (!App.user || App.user.role !== r.opts.role)) { location.hash = '#/'; toast('Admin access required', 'error'); return; }
      const params = (m.slice(1) || []).map(decodeURIComponent);
      App.route = { name: r.name, path: pathPart, params };
      rerender();
      return;
    }
  }
  App.route = { name: 'home', path: '/' };
  rerender();
}

// ---------------- auth ----------------
let authReady = Promise.resolve();
export async function authInit() {
  if (!App.meta.auth) { App.user = null; authReady = Promise.resolve(); return; }
  authReady = (async () => {
    try { App.user = await api('/api/auth/me'); } catch { App.user = null; }
  })();
  await authReady;
}
export function setUser(u) { App.user = u; }

// ---------------- boot ----------------
export async function boot() {
  await loadMeta();
  const saved = (() => { try { return localStorage.getItem(App.meta.name + ':theme'); } catch { return null; } })();
  document.documentElement.setAttribute('data-theme', saved || App.meta.default_theme || 'dark');
  await authInit();
  window.addEventListener('hashchange', applyRoute);
  await applyRoute();
}

boot().catch((e) => {
  const root = $('#root');
  if (root) root.innerHTML = `<div class="empty err"><h3>Failed to start</h3><p>${esc(e.message || e)}</p></div>`;
});
