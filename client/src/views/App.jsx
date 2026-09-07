// NOIR application shell + core pages: Dashboard, Projects, Templates, Assistant,
// Activity, Integrations, Usage, Settings, Audit.
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth, useRoute, Link, navigate, Modal, ModalHead, Empty, Badge, Stat, Spinner, useToast, useAsync, StatusChip, Field, Seg } from '../lib/ui.jsx';
import { api, fmtDate, fmtAgo, fileToB64 } from '../lib/api.js';
import {
  LayoutDashboard, FolderKanban, LayoutTemplate, Sparkles, Activity as ActIcon, Plug,
  Gauge, Settings as SetIcon, Shield, LogOut, Menu, Plus, Star, Copy, Archive, Pencil, Trash2, ExternalLink, Search, Send, Bot, Play, ChevronDown, Search as SearchIcon, Users as UsersIcon,
} from 'lucide-react';
import { TeamsView } from './Teams.jsx';
export { TeamsView };
import { CommandBar, useCommandBar } from './CommandBar.jsx';

// ================= SHELL =================
export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandBar();
  const p = route.path;
  const items = [
    { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/app/projects', label: 'Projects', icon: FolderKanban },
    { path: '/app/templates', label: 'Templates', icon: LayoutTemplate },
    { path: '/app/assistant', label: 'AI Assistant', icon: Sparkles },
    { path: '/app/activity', label: 'Activity', icon: ActIcon },
    { path: '/app/teams', label: 'Teams', icon: UsersIcon },
    { path: '/app/integrations', label: 'Integrations', icon: Plug },
    { path: '/app/usage', label: 'Usage', icon: Gauge },
    { path: '/app/settings', label: 'Settings', icon: SetIcon },
    { path: '/app/audit', label: 'Audit log', icon: Shield },
  ];
  const isActive = (path) => (path === '/app' ? p === '/app' || p === '/app/' : p.startsWith(path));
  return (
    <div className="app-frame">
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark">N</span>
          <span>
            <span className="brand-name">NOIR</span><br />
            <span className="brand-tag">Think · Build · Ship</span>
          </span>
        </Link>
        <nav className="nav">
          <div className="nav-group-label">Workspace</div>
          {items.map((it) => {
            const I = it.icon;
            return (
              <Link key={it.path} to={it.path} className={'nav-item' + (isActive(it.path) ? ' active' : '')} onClick={() => setMenuOpen(false)}>
                <I size={16} /> {it.label}
              </Link>
            );
          })}
          <div className="nav-group-label">New</div>
          <button className="nav-item" style={{ color: 'var(--gold)' }} onClick={() => { setMenuOpen(false); navigate('/create'); }}>
            <Plus size={16} /> Create with NOIR
          </button>
        </nav>
        <div className="side-foot">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <span className="avatar">{initials(user?.name || user?.email)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{user?.name}</div>
                <div className="tiny faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{user?.email}</div>
              </div>
            </div>
            <button className="icon-btn" title="Sign out" onClick={logout}><LogOut size={14} /></button>
          </div>
        </div>
      </aside>
      <div className="side-main">
        <div className="topbar">
          <button className="icon-btn" style={{ display: 'inline-flex' }} onClick={() => setMenuOpen((v) => !v)}><Menu size={17} /></button>
          <button className="btn ghost sm" onClick={() => setCmdOpen(true)}><SearchIcon size={13} /> <span className="hide-sm">Ask NOIR…</span> <span className="kbd">⌘K</span></button>
          <div className="flex1" />
          <Badge tone="gold" dot><span className="status-dot ok" /> platform online</Badge>
        </div>
        <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)}
          placeholder="Jump anywhere or ask NOIR…"
          items={[
            ...items.map((it) => ({ icon: '·', label: it.label, route: it.path, hint: 'page' })),
            { icon: '✨', label: 'Create with NOIR', route: '/create', hint: 'new project' },
            { icon: '🛡️', label: 'Audit log', route: '/app/audit', hint: 'page' },
            { icon: '🚪', label: 'Sign out', action: logout, hint: 'session' },
          ]}
        />
        <div className="scroll-body">{children}</div>
      </div>
    </div>
  );
}
function initials(n) {
  return String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ================= DASHBOARD =================
export function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [err, setErr] = useState(null);
  const load = async () => {
    try {
      const [pd, sd, rd] = await Promise.all([api('/projects'), api('/projects/stats'), api('/activity?limit=8')]);
      setProjects(pd.projects); setStats(sd); setRecent(rd.activity);
    } catch (e) { setErr(e); }
  };
  useEffect(() => { load(); }, []);
  if (err) return <div className="page"><Empty icon="⚠️" title="Failed to load dashboard">{err.message}</Empty></div>;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const favs = (projects || []).filter((p) => p.favorite && !p.archive);
  const recents = (projects || []).filter((p) => !p.archive).slice(0, 4);
  return (
    <div className="page">
      <div className="page-head row-between">
        <div><h1>{greet}, {user?.name?.split(' ')[0] || 'builder'}.</h1><div className="sub">Welcome back to NOIR — your AI engineering team is ready.</div></div>
        <button className="btn primary lg" onClick={() => navigate('/create')}><Plus size={16} /> Create with NOIR</button>
      </div>
      {stats && (
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <Stat label="Projects" num={stats.total} sub={stats.running + ' running now'} />
          <Stat label="Live previews" num={stats.running} sub={stats.building ? stats.building + ' building' : 'all idle'} />
          <Stat label="Favorites" num={stats.favorites} />
          <Stat label="Archived" num={stats.archived} />
        </div>
      )}
      {!projects ? <div className="center-load"><Spinner /> Loading workspace…</div> : (
        <>
          {!projects.length ? <WelcomeCard /> : null}
          {favs.length ? (
            <>
              <div className="section-title">⭐ Favorites</div>
              <div className="grid cols-3" style={{ marginBottom: 8 }}>
                {favs.map((p) => <ProjectCard key={p.id} p={p} onChanged={load} />)}
              </div>
            </>
          ) : null}
          <div className="section-title">Recently modified</div>
          {recents.length ? (
            <div className="grid cols-3" style={{ marginBottom: 8 }}>
              {recents.map((p) => <ProjectCard key={p.id} p={p} onChanged={load} />)}
            </div>
          ) : <div className="card muted small">Projects you create will appear here.</div>}
          {recent.length ? (
            <>
              <div className="section-title">Activity</div>
              <div className="card">
                {recent.slice(0, 5).map((a) => (
                  <div key={a.id} className="row" style={{ padding: '5px 0', gap: 10 }}>
                    <span style={{ fontSize: 15 }}>{a.icon}</span>
                    <span className="flex1" style={{ fontSize: 13 }}>{a.text}</span>
                    <span className="tiny faint">{fmtAgo(a.ts)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
function WelcomeCard() {
  // Onboarding (Phase 39): welcome → what to build → optional preferences → builder.
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [idea, setIdea] = useState('');
  const [exp, setExp] = useState(user?.experience || 'intermediate');
  const [stack, setStack] = useState(user?.preferred_stack || 'react,node,postgres');
  const [theme, setTheme] = useState(user?.theme || 'dark');
  const [busy, setBusy] = useState(false);
  const step = (n, t) => (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <span className="badge gold">{n}</span><span className="small">{t}</span>
    </div>
  );
  const go = async (to) => {
    setBusy(true);
    try {
      const d = await api('/auth/me', { method: 'PATCH', body: { experience: exp, preferred_stack: stack, theme } });
      document.documentElement.setAttribute('data-theme', d.user.theme);
      refresh && refresh();
    } catch { /* preferences are optional — never block the build */ }
    setBusy(false);
    navigate(to);
  };
  return (
    <div className="card hero-grad" style={{ padding: 26, marginBottom: 16 }}>
      <h2 style={{ fontSize: 19 }}>Welcome to NOIR — describe an idea, ship working software</h2>
      <p className="muted" style={{ maxWidth: 620, marginTop: 4 }}>NOIR runs like an engineering team: analyze → plan → build → run → test → secure → live preview — then keeps improving the app with you, forever. There are no artificial limits on projects, builds or edits.</p>
      <div className="row" style={{ gap: 22, margin: '14px 0 4px', flexWrap: 'wrap' }}>
        {step(1, 'What do you want to build?')}{step(2, 'Optional preferences (below)')}{step(3, 'Review spec → NOIR builds')}
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 300px', marginTop: 12 }}>
        <div>
          <label>Your idea</label>
          <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. A student management system with authentication, attendance, marks and an admin dashboard…" style={{ resize: 'vertical' }} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn gold lg" disabled={busy} onClick={() => { if (!idea.trim()) return toast('Describe the idea first — even one sentence is enough.', 'error'); go('/create?prompt=' + encodeURIComponent(idea.trim())); }}>{busy ? <Spinner /> : 'Build with NOIR →'}</button>
            <button className="btn ghost" onClick={() => navigate('/app/templates')}>Explore templates</button>
            <span className="flex1" />
            <button className="btn ghost sm" onClick={() => navigate('/create')}>Skip to builder</button>
          </div>
        </div>
        <div className="card tight" style={{ padding: 14 }}>
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Preferences (optional)</div>
          <label style={{ marginTop: 10 }}>Experience</label>
          <select value={exp} onChange={(e) => setExp(e.target.value)}>
            <option value="beginner">Beginner — guide me</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <label>Preferred stack</label>
          <input value={stack} onChange={(e) => setStack(e.target.value)} />
          <label>Theme</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select>
          <div className="tiny faint" style={{ marginTop: 8 }}>Saved to your profile — NOIR uses them when planning your stack.</div>
        </div>
      </div>
    </div>
  );
}

// ================= PROJECT CARD =================
export function ProjectCard({ p, onChanged, compact }) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.name);
  const status = p.running ? 'running' : p.status;
  const doAction = async (fn, okMsg) => { try { await fn(); toast(okMsg, 'ok'); onChanged && onChanged(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row-between">
        <Link to={'/project/' + p.id} style={{ color: 'inherit' }} className="flex1" >
          <div style={{ fontWeight: 650, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.favorite ? '⭐ ' : ''}{p.name}</div>
        </Link>
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={() => setMenu((v) => !v)}><ChevronDown size={15} /></button>
          {menu ? (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 1 }} onClick={() => setMenu(false)} />
              <div className="card tight" style={{ position: 'absolute', right: 0, top: 30, zIndex: 2, minWidth: 170, padding: 6, boxShadow: 'var(--shadow)' }}>
                {[
                  [Pencil, 'Rename', () => setRenaming(true)],
                  [Copy, 'Duplicate', () => doAction(() => api('/projects/' + p.id + '/duplicate', { body: {} }), 'Duplicated')],
                  [Star, p.favorite ? 'Unfavorite' : 'Favorite', () => doAction(() => api('/projects/' + p.id, { method: 'PATCH', body: { favorite: p.favorite ? 0 : 1 } }), 'Updated')],
                  [Archive, p.archive ? 'Unarchive' : 'Archive', () => doAction(() => api('/projects/' + p.id, { method: 'PATCH', body: { archive: p.archive ? 0 : 1 } }), 'Updated')],
                  [ExternalLink, 'Open workspace', () => navigate('/project/' + p.id)],
                  [Trash2, 'Delete', () => doAction(async () => { if (confirm('Delete "' + p.name + '" permanently? The generated code and database are removed.')) await api('/projects/' + p.id, { method: 'DELETE' }); }, 'Deleted')],
                ].map(([I, label, fn], i) => (
                  <button key={label} className={'file-node' + (label === 'Delete' ? ' danger' : '')} onClick={() => { setMenu(false); fn(); }}>
                    <I size={13} style={{ color: label === 'Delete' ? 'var(--err)' : undefined }} /> <span className="flex1">{label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <Link to={'/project/' + p.id} style={{ color: 'inherit' }}>
        <div className="small muted" style={{ minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description || 'No description yet — open the workspace to plan this project.'}</div>
      </Link>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <StatusChip status={status} />
        {p.tech_stack ? <Badge>{p.tech_stack.split('·')[0].trim()}</Badge> : <Badge>unplanned</Badge>}
        {p.health_score != null ? <Badge tone="gold">health {p.health_score}</Badge> : null}
      </div>
      <div className="row-between tiny faint">
        <span>{p.source === 'template' ? 'Template' : p.source === 'assistant' ? 'Assistant' : 'Manual'}</span>
        <span title={fmtDate(p.updated_at)}>Modified {fmtAgo(p.updated_at)}</span>
      </div>
      {renaming ? (
        <Modal onClose={() => setRenaming(false)}>
          <ModalHead title="Rename project" onClose={() => setRenaming(false)} />
          <form onSubmit={async (e) => { e.preventDefault(); await doAction(() => api('/projects/' + p.id, { method: 'PATCH', body: { name } }), 'Renamed'); setRenaming(false); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="btn ghost" onClick={() => setRenaming(false)}>Cancel</button>
              <button className="btn primary" type="submit">Save</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

// ================= PROJECTS PAGE =================
export function Projects() {
  const { data, loading, reload } = useAsync(() => api('/projects').then((d) => d.projects), []);
  const [q, setQ] = useState('');
  const [impOpen, setImpOpen] = useState(false);
  const filtered = (data || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="page-head row-between">
        <div><h1>Projects</h1><div className="sub">{data ? data.length : '…'} project(s) in your workspace.</div></div>
        <div className="row">
          <div style={{ position: 'relative', width: 230 }}><Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--faint)' }} /><input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} /></div>
          <button className="btn ghost" onClick={() => setImpOpen(true)}><span title="Import">📥 Import</span></button>
          <button className="btn primary" onClick={() => navigate('/create')}><Plus size={15} /> Create</button>
        </div>
      </div>
      {impOpen && <ImportModal onClose={() => setImpOpen(false)} onDone={(id) => { setImpOpen(false); navigate('/project/' + id); }} />}
      {loading ? <div className="center-load"><Spinner /></div> :
        filtered.length ? <div className="grid cols-3">{filtered.map((p) => <ProjectCard key={p.id} p={p} onChanged={reload} />)}</div>
          : <Empty icon="📁" title={q ? 'No matches' : 'No projects yet'}><Link to="/create">Create your first project with NOIR →</Link></Empty>}
    </div>
  );
}

// ================= TEMPLATES =================
export function Templates() {
  const { data, loading } = useAsync(() => api('/templates'), []);
  const ICONS = { saas: '📊', 'ai-app': '🤖', dashboard: '📈', ecommerce: '🛍️', portfolio: '✨', blog: '📝', crm: '🤝', erp: '🏭', education: '🎓', healthcare: '🩺', finance: '💰', marketplace: '🏪', social: '👥', 'developer-tools': '🧰', landing: '🚀' };
  return (
    <div className="page">
      <div className="page-head"><h1>Templates</h1><div className="sub">Each template generates a complete, runnable project with its own database, API and preview — you can edit the spec before NOIR builds it.</div></div>
      {loading ? <div className="center-load"><Spinner /></div> :
        <div className="grid cols-3">
          {data?.templates.map((t) => (
            <button key={t.key} className="card card-hover" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/create?template=' + t.key)}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{ICONS[t.key] || '📦'}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name} <span className="badge" style={{ marginLeft: 6 }}>{t.tag}</span></div>
              <div className="small muted" style={{ marginTop: 6, minHeight: 38 }}>{t.desc}</div>
              <div className="tiny gold" style={{ marginTop: 8 }}>Use template →</div>
            </button>
          ))}
        </div>}
    </div>
  );
}

// ================= IMPORT =================
function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [gitUrl, setGitUrl] = useState('');
  const [src, setSrc] = useState('zip'); // zip | git
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let d;
      if (src === 'zip') {
        if (!file) { toast('Choose a ZIP file first', 'error'); setBusy(false); return; }
        const zip_b64 = await fileToB64(file);
        d = await api('/projects/import', { body: { name: name || file.name.replace(/\.zip$/i, ''), zip_b64 } });
      } else {
        if (!/^(https?:|file:|git@)/.test(gitUrl.trim())) { toast('Provide an https:// or git@ repository URL', 'error'); setBusy(false); return; }
        const slug = String(gitUrl).split('/').pop().replace(/\.git$/i, '').replace(/[^a-z0-9-_]/gi, '') || 'imported-repo';
        d = await api('/projects/import', { body: { name: name || slug, git_url: gitUrl.trim() } });
      }
      toast('Imported ' + d.files + ' files — ' + (d.git ? 'git history preserved' : 'initialized git') + ' + safety checkpoint', 'ok');
      onDone(d.project.id);
    } catch (ex) { toast(ex.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose}>
      <ModalHead title="Import an application" onClose={onClose} sub="Bring in an existing codebase — NOIR snapshots it, keeps full git history when available, and you can continue development with the team." />
      <form onSubmit={submit}>
        <label>Project name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My imported app" />
        <div className="row" style={{ gap: 6, margin: '10px 0' }}>
          <button type="button" className={'btn sm ' + (src === 'zip' ? 'primary' : 'ghost')} onClick={() => setSrc('zip')}>ZIP file</button>
          <button type="button" className={'btn sm ' + (src === 'git' ? 'primary' : 'ghost')} onClick={() => setSrc('git')}>Git repository</button>
          {src === 'git' ? <span className="tiny faint" style={{ alignSelf: 'center' }}>public repos clone directly · private GitHub repos use your connected account's credential (never stored in the clone)</span> : null}
        </div>
        {src === 'zip' ? (
          <>
            <label>ZIP file</label>
            <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files[0])} />
            <div className="hint">Decoded server-side, files stay inside the project sandbox, and an initial git snapshot is committed for rollback.</div>
          </>
        ) : (
          <>
            <label>Repository URL</label>
            <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="mono" />
            <div className="hint">NOIR clones the repository into an isolated workspace (history preserved), then snapshots a checkpoint so every later change is versioned and restorable.</div>
          </>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? <Spinner /> : 'Import & snapshot'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ================= AI ASSISTANT (global) =================
export function Assistant() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const load = async () => {
    const [s, ps] = await Promise.all([api('/assistant/state'), api('/projects')]);
    setState(s); setProjects(ps.projects);
  };
  useEffect(() => { load().catch(() => { }); }, []);
  const loadHistory = (pid) => api('/assistant/history' + (pid ? '?project_id=' + pid : '')).then((d) => setMessages((d.messages || []).map((m) => ({ role: m.role, content: m.content, ts: m.ts })))).catch(() => setMessages([]));
  useEffect(() => { if (state) loadHistory(projectId); }, [projectId, state === null]);
  const send = async (text) => {
    if (!text.trim() || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const d = await api('/assistant/chat', { body: { messages: [...messages, { role: 'user', content: text }], project_id: projectId || null } });
      setMessages((m) => [...m, { role: 'assistant', content: d.reply, meta: d, actions: d.suggestions }]);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const chips = ['Explain this project', 'Add a search feature', 'Why is login failing?', 'Run tests', 'Deploy this', 'Plan: subscription billing'];
  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>AI Assistant</h1>
        <div className="sub">
          {state && state.providers.length ? <>Routing to <b>{state.providers[0].label}</b> ({state.providers[0].model}).</>
            : <>No AI provider key configured — NOIR answers from built-in project context. <Link to="/app/settings#ai">Configure a provider</Link> for full model access.</>}
        </div>
      </div>
      {projects.length ? (
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: 240 }}>
            <option value="">— No project context (general help) —</option>
            {projects.filter((p) => !p.archive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn sm ghost" title="Reload conversation history for this context" onClick={() => loadHistory(projectId)}>↻ history</button>
        </div>
      ) : null}
      <div className="card" style={{ padding: '8px 16px', minHeight: 420, maxHeight: '56vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!messages.length ? (
          <div className="empty" style={{ margin: 'auto' }}>
            <div className="big">🤖</div>
            <h3>What are we building?</h3>
            <div className="muted">Ask about a project, request a feature change, or ask NOIR to run the team.</div>
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
              {chips.map((c) => <button key={c} className="btn sm ghost" onClick={() => send(c)}>{c}</button>)}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={'chat-line ' + m.role}>
            <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{m.role === 'user' ? initials(user?.name) : 'N'}</span>
            <div>
              <div className="chat-msg">{m.content}</div>
              {m.actions && m.actions.length ? <div className="row" style={{ marginTop: 6 }}>{m.actions.map((a) => <button key={a.label} className="btn sm ghost" onClick={() => navigate(a.route)}>{a.label}</button>)}</div> : null}
              {m.meta && m.meta.builtin ? <div className="tiny faint" style={{ marginTop: 4 }}>answered from built-in project context (no provider key)</div> : null}
            </div>
          </div>
        ))}
        {busy ? <div className="chat-line assistant"><span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>N</span><div className="chat-msg muted"><Spinner /> thinking…</div></div> : null}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <input placeholder="Message NOIR…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)} />
        <button className="btn primary" onClick={() => send(input)} disabled={busy}><Send size={14} /></button>
      </div>
    </div>
  );
}

// ================= ACTIVITY =================
export function Activity() {
  const { data, reload } = useAsync(() => api('/activity?limit=80'), []);
  const projectName = useMemo(() => new Map(), []);
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Activity</h1><div className="sub">Real events recorded by NOIR — builds, tests, deploys, fixes.</div></div>
      <div className="card">
        {!data ? <div className="center-load"><Spinner /></div> :
          data.activity.length ? data.activity.map((a) => (
            <div key={a.id} className="row" style={{ padding: '7px 2px', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, marginTop: 1 }}>{a.icon}</span>
              <div className="flex1">
                <div style={{ fontSize: 13.4 }}>{a.text}</div>
                <div className="tiny faint">{fmtDate(a.ts)} {a.project_id ? '· project ' + a.project_id.slice(0, 8) : ''}</div>
              </div>
              {a.project_id ? <Link to={'/project/' + a.project_id} className="btn ghost sm">Open</Link> : null}
            </div>
          )) : <Empty icon="🔕" title="Nothing yet">Your actions and NOIR's work will show up here.</Empty>}
      </div>
    </div>
  );
}

// ================= INTEGRATIONS =================
const CONNECT_IDS = ['vercel', 'supabase', 'appwrite'];
export function Integrations() {
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/integrations'), []);
  const [openFor, setOpenFor] = useState(null); // def id of the connect modal
  const tone = { connected: 'ok', not_connected: 'muted', error: 'err', requires_configuration: 'warn' };
  const def = data && data.integrations.find((i) => i.id === openFor);
  const doTest = async (i) => {
    try {
      const r = await api('/integrations/' + i.id + '/test', { body: {} });
      toast(r.connected ? ('Connected — real provider call OK' + (r.login ? ' (' + r.login + ')' : '')) : ('Not connected: ' + (r.reason || r.error || '') + (r.hint ? ' — ' + r.hint : '')), r.connected ? 'ok' : 'error');
    } catch (e) { toast(e.message, 'error'); }
  };
  const doDisconnect = async (i) => {
    try { await api('/integrations/' + i.id + '/disconnect', { body: {} }); toast(i.label + ' disconnected (credential removed from this NOIR server)', 'ok'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <div className="page-head"><h1>Integrations</h1><div className="sub">NOIR never simulates a connection or a deployment. Every badge below reflects a real credential stored on this server (AES-256-GCM encrypted) and every test performs a real provider call. Provider credentials never reach the browser or generated code.</div></div>
      {!data ? <div className="center-load"><Spinner /></div> : (
        <div className="grid cols-2">
          {data.integrations.map((i) => {
            const connectable = CONNECT_IDS.includes(i.id);
            const connected = i.status === 'connected';
            const acc = (i.configured_keys || []).find((k) => k.key === 'account' || k.key === 'login' || k.key === 'project');
            return (
              <div key={i.id} className="card">
                <div className="row-between">
                  <div className="row"><span style={{ fontSize: 18 }}>{i.id === 'github' ? '🐙' : i.id === 'vercel' ? '▲' : i.id === 'supabase' ? '⚡' : i.id === 'appwrite' ? '🅰️' : i.id === 'ai' ? '🧠' : '🐘'}</span><div><b>{i.label}</b><div className="tiny faint">{i.desc}</div></div></div>
                  <Badge tone={tone[i.status]}>{i.status.replace(/_/g, ' ')}</Badge>
                </div>
                {i.error ? <div className="tiny" style={{ color: 'var(--err)', marginTop: 8 }}>{i.error}</div> : null}
                {connected && acc ? <div className="tiny faint" style={{ marginTop: 8 }}>Account: {acc.masked}{i.updated_at ? ' · connected ' + fmtAgo(i.updated_at) : ''}</div> : null}
                {!connectable && i.status !== 'connected' ? <div className="hint" style={{ marginTop: 8 }}>{i.id === 'github' ? 'OAuth tokens are never stored server-side; push/pull a project from its workspace when you need GitHub.' : 'Set ' + (i.needs || 'the required keys') + ' in Settings → Environment to activate — status is read from the real configuration.'}</div> : null}
                <div className="row" style={{ marginTop: 12, gap: 6, flexWrap: 'wrap' }}>
                  {connectable ? <button className="btn sm primary" onClick={() => setOpenFor(i.id)}>{connected ? 'Manage / reconnect' : 'Connect'}</button> : null}
                  {connectable && connected ? <button className="btn sm ghost" onClick={() => doTest(i)}>Test (real call)</button> : null}
                  {connectable && connected ? <button className="btn sm ghost" onClick={() => doDisconnect(i)}>Disconnect</button> : null}
                  {!connectable && i.status === 'connected' ? <Badge tone="ok">active</Badge> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {def ? <ConnectModal def={def} onClose={() => setOpenFor(null)} onDone={async (msg) => { toast(msg, 'ok'); setOpenFor(null); reload(); }} /> : null}
    </div>
  );
}
function ConnectModal({ def, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(def.id === 'supabase' ? 'oauth' : 'token');
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [endpoint, setEndpoint] = useState('https://cloud.appwrite.io/v1');
  const [project, setProject] = useState('');
  const [key, setKey] = useState('');
  const sub = {
    vercel: 'Paste a Vercel access token — validated with a real /v2/user call before anything is stored.',
    supabase: 'Personal access token, or sign in with Supabase OAuth when the NOIR server has it configured.',
    appwrite: 'Endpoint + project id + API key of an Appwrite project you can access.',
  }[def.id];
  const errMsg = (e) => String(e && e.message || e);
  const vercelConnect = async () => {
    setBusy(true);
    try {
      const r = await api('/integrations/vercel', { body: { token: token.trim(), ...(teamId.trim() ? { team_id: teamId.trim() } : {}) } });
      onDone('Vercel connected as @' + (r.login || 'account') + ' — token encrypted at rest on the server only.');
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const supabaseToken = async () => {
    setBusy(true);
    try {
      const r = await api('/integrations/supabase', { body: { token: token.trim() } });
      onDone('Supabase connected' + (r.login ? ' as ' + r.login : '') + ' — token encrypted at rest on the server only.');
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const supabaseOAuth = async () => {
    setBusy(true);
    try {
      const r = await api('/integrations/supabase/oauth/start', { body: {} });
      window.location.href = r.url; // real Supabase authorize page; callback returns to Integrations
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  const appwriteConnect = async () => {
    setBusy(true);
    try {
      const r = await api('/integrations/appwrite', { body: { endpoint: endpoint.trim(), project: project.trim(), key: key.trim() } });
      onDone('Appwrite connected — project ' + (r.project || project.trim()) + ' (key encrypted at rest).');
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} wide>
      <ModalHead title={'Connect ' + def.label} onClose={onClose} sub={sub} />
      <div style={{ padding: '4px 2px', display: 'grid', gap: 12 }}>
        {def.id === 'supabase' ? (
          <>
            <Seg options={[{ value: 'oauth', label: 'OAuth (recommended)' }, { value: 'token', label: 'Access token' }]} value={tab} onChange={setTab} />
            {tab === 'oauth' ? (
              <div>
                <button className="btn primary" style={{ width: '100%' }} disabled={busy} onClick={supabaseOAuth}>{busy ? <Spinner /> : 'Sign in with Supabase'}</button>
                <div className="hint">Redirects to supabase.com for authorization. If this NOIR server has no OAuth client configured, you will see the server\'s real message — use an access token instead.</div>
              </div>
            ) : (
              <Field label="Supabase personal access token" hint="Create one at supabase.com/dashboard → Account → Access tokens (sbp_…). It is sent once, validated live, then stored only as AES-256-GCM ciphertext server-side.">
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="sbp_…" autoFocus />
              </Field>
            )}
          </>
        ) : def.id === 'vercel' ? (
          <>
            <Field label="Vercel access token" hint="vercel.com → Settings → Tokens. Needs read/create access to projects and deployments. Sent once, validated with a real call, then stored only as AES-256-GCM ciphertext server-side.">
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste token" autoFocus />
            </Field>
            <Field label="Team id (optional)" hint="Only needed when the token belongs to a team scope — otherwise your personal scope is used.">
              <input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="team_…" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Appwrite endpoint" hint="Appwrite Cloud: https://cloud.appwrite.io/v1 · self-hosted: your own /v1">
              <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="mono" placeholder="https://cloud.appwrite.io/v1" />
            </Field>
            <Field label="Project id">
              <input value={project} onChange={(e) => setProject(e.target.value)} className="mono" placeholder="your-appwrite-project-id" />
            </Field>
            <Field label="API key" hint="Appwrite console → project → API keys. Needs database, storage, functions and sites scopes. Stored only as AES-256-GCM ciphertext server-side; never sent back to this form.">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className="mono" placeholder="standard_…" autoFocus />
            </Field>
          </>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10, gap: 6 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || (def.id !== 'supabase' ? !(def.id === 'vercel' ? token.trim() : project.trim() && key.trim()) : tab === 'token' ? !token.trim() : false)} onClick={def.id === 'vercel' ? vercelConnect : def.id === 'supabase' ? (tab === 'token' ? supabaseToken : supabaseOAuth) : appwriteConnect}>{busy ? <Spinner /> : 'Connect'}</button>
      </div>
    </Modal>
  );
}
// ================= USAGE =================
export function Usage() {
  const { data } = useAsync(() => api('/usage'), []);
  const totals = data ? data.totals.reduce((m, x) => { m[x.kind] = x; return m; }, {}) : {};
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Usage</h1><div className="sub">Measured usage of your workspace over the last 30 days.</div></div>
      {!data ? <div className="center-load"><Spinner /></div> : (
        <>
          <div className="grid cols-3">
            <Stat label="AI requests" num={totalOf(totals.ai_request)} sub="provider + built-in calls" />
            <Stat label="Builds" num={totalOf(totals.build)} />
            <Stat label="Test runs" num={totalOf(totals.test)} />
            <Stat label="Tool executions" num={totalOf(totals.tool)} />
            <Stat label="Projects" num={data.projects} />
            <Stat label="AI providers" num={data.provider.length} sub={data.provider.map((p) => p.id + '@' + p.model).join(', ') || 'none configured'} />
          </div>
          <div className="section-title">Activity last 14 days</div>
          <div className="card">
            {data.daily && data.daily.length ? <MiniBars daily={data.daily} /> : <div className="muted small">No usage yet.</div>}
          </div>
          <div className="hint" style={{ marginTop: 14 }}>NOIR reports real usage. Limits depend on the deployment you run — nothing is claimed to be unlimited.</div>
        </>
      )}
    </div>
  );
}
function totalOf(t) { return t ? t.n : 0; }
function MiniBars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.n));
  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 90 }}>
        {daily.map((d) => <div key={d.day} style={{ flex: 1, textAlign: 'center' }}><div className="progress-track" style={{ height: 70, transform: 'rotate(180deg)', background: 'transparent' }}><div className="progress-fill" style={{ height: Math.max(4, (d.n / max) * 100) + '%', background: 'var(--gold)', opacity: .85 }} /></div></div>)}
      </div>
      <div className="tiny faint" style={{ display: 'flex', gap: 6 }}>{daily.map((d) => <span key={d.day} style={{ flex: 1, textAlign: 'center' }}>{d.day.slice(5)}</span>)}</div>
    </div>
  );
}

// ================= SETTINGS =================
export function Settings() {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [exp, setExp] = useState(user?.experience || 'intermediate');
  const [theme, setTheme] = useState(user?.theme || 'dark');
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [next2, setNext2] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiState, setAiState] = useState(null);
  const saveProfile = async (e) => {
    e.preventDefault();
    try { const d = await api('/auth/me', { method: 'PATCH', body: { name, experience: exp, theme } }); document.documentElement.setAttribute('data-theme', d.user.theme); await refresh(); toast('Profile saved', 'ok'); }
    catch (e2) { toast(e2.message, 'error'); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (next !== next2) return toast('New passwords do not match', 'error');
    try { await api('/auth/password', { method: 'POST', body: { current: cur, next } }); toast('Password changed — signed out on other devices', 'ok'); setCur(''); setNext(''); setNext2(''); }
    catch (e2) { toast(e2.message, 'error'); }
  };
  const sendVerify = async () => { try { const d = await api('/auth/resend-verification', { body: {} }); toast('Check your inbox. Sandbox mode: ' + d.preview_link, 'ok'); } catch (e) { toast(e.message, 'error'); } };
  useEffect(() => { setTheme(user?.theme || 'dark'); }, [user]);
  useEffect(() => { api('/assistant/state').then(setAiState).catch(() => { }); }, []);
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Settings</h1><div className="sub">Account, security and AI providers.</div></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Profile</h3>
        <form onSubmit={saveProfile}>
          <label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Email</label><input value={user?.email} disabled /> <div className="hint">{user?.email_verified ? '✅ Email verified' : 'Email not verified yet.'} {!user?.email_verified ? <button type="button" className="btn sm ghost" style={{ marginLeft: 8 }} onClick={sendVerify}>Send verification link</button> : null}</div>
          <label>Experience level</label>
          <select value={exp} onChange={(e) => setExp(e.target.value)}>
            <option value="beginner">Beginner — guide me</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <label>Theme preference</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select>
          <div style={{ marginTop: 14 }}><button className="btn primary">Save profile</button></div>
        </form>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }}>Password</h3>
        <form onSubmit={changePw} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}><label>Current password</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
          <div><label>New password</label><input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} /></div>
          <div><label>Repeat new password</label><input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} required /></div>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn ghost">Change password</button></div>
        </form>
      </div>
      <div className="card" style={{ marginBottom: 14 }} id="ai">
        <h3 style={{ fontSize: 15 }}>AI providers</h3>
        <div className="muted small" style={{ marginTop: 6 }}>
          NOIR supports OpenAI, Anthropic, Google Gemini, Groq, xAI and any OpenAI-compatible endpoint. Provider keys are stored encrypted-side (masked) in this NOIR installation and are only sent to the provider when a request is routed to it. Currently {aiState && aiState.providers.length ? 'routing to ' + aiState.providers.map((p) => p.label).join(', ') : 'no provider configured — built-in mode active'}.
        </div>
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          {aiState?.providersMeta.filter((p) => p.id !== 'custom').map((p) => (
            <div key={p.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px' }}>
              <b style={{ fontSize: 13 }}>{p.label}</b>
              <Badge tone={p.configured ? 'ok' : 'muted'}>{p.configured ? 'configured' : 'not set'}</Badge>
            </div>
          ))}
        </div>
        <p className="hint">Configure keys in the project's Environment panel (per project) or via NOIR platform env (OPENAI_API_KEY, ANTHROPIC_API_KEY, …).</p>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15 }}>Session & account</h3>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn ghost sm" onClick={async () => { await api('/settings/devices/logout-all', { body: {} }); logout(); }}>Sign out all devices</button>
          <button className="btn danger sm" onClick={async () => { if (confirm('Permanently delete your account and all projects? This cannot be undone.')) { try { await api('/settings/account', { method: 'DELETE' }); logout(); } catch (e) { toast(e.message, 'error'); } } }}>Delete account</button>
        </div>
      </div>
    </div>
  );
}

// ================= AUDIT =================
export function AuditView() {
  const { data } = useAsync(() => api('/audit?limit=250'), []);
  return (
    <div className="page">
      <div className="page-head"><h1>Audit log</h1><div className="sub">Every notable action with agent, tool, risk and result. Secrets are never logged.</div></div>
      {!data ? <div className="center-load"><Spinner /></div> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Agent</th><th>Tool</th><th>Risk</th><th>Result</th><th>Detail</th></tr></thead>
          <tbody>
            {data.audit.map((a) => (
              <tr key={a.id}>
                <td className="tiny faint">{fmtDate(a.ts)}</td>
                <td className="tiny mono">{String(a.user_id).slice(0, 8)}</td>
                <td><code>{a.action}</code></td>
                <td className="tiny">{a.agent || '—'}</td>
                <td className="tiny mono">{a.tool || '—'}</td>
                <td><Badge tone={a.risk === 'high' ? 'warn' : a.risk === 'medium' ? 'info' : 'muted'}>{a.risk || 'low'}</Badge></td>
                <td><Badge tone={a.result === 'ok' ? 'ok' : 'err'}>{a.result}</Badge></td>
                <td className="tiny faint" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
