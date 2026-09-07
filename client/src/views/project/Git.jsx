import React, { useEffect, useState } from 'react';
import { useToast, Badge, Modal, ModalHead, Spinner } from '../../lib/ui.jsx';
import { api, fmtAgo } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function GitTab() {
  const { id } = useProject();
  const toast = useToast();
  const [git, setGit] = useState(null);
  const [cps, setCps] = useState(null);
  const [msg, setMsg] = useState('Update from NOIR workspace');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState(null);
  const [commitBusy, setCommitBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [forkBusy, setForkBusy] = useState(false);
  const createBranch = async () => {
    const name = newBranch.trim();
    if (!name) return;
    setBranchBusy(true);
    try { const r = await api('/projects/' + id + '/git/branch', { body: { name } }); toast('On branch ' + r.current, 'ok'); setNewBranch(''); load(); } catch (e) { toast(e.message, 'error'); }
    setBranchBusy(false);
  };
  const forkAt = async (c) => {
    setForkBusy(true);
    try {
      const r = await api('/projects/' + id + '/checkpoints/fork', { body: { id: c.id } });
      toast('Forked — opening the new independent project', 'ok');
      window.location.hash = '#/project/' + r.project.id;
    } catch (e) { toast(e.message, 'error'); }
    setForkBusy(false);
  };
  const load = async () => {
    try {
      const [g, c] = await Promise.all([api('/projects/' + id + '/git'), api('/projects/' + id + '/checkpoints')]);
      setGit(g); setCps(c);
    } catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head row-between">
        <div><h1>Version control & checkpoints</h1><div className="sub">A real git repository lives inside the project. Checkpoints are git refs + archives — restore rewinds the working tree (last working state is preserved as a checkpoint).</div></div>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Current revision</div>
          <div className="mono" style={{ marginTop: 6, fontSize: 15 }}>{git ? git.revision || 'no commits yet' : <Spinner />}</div>
          {cps && <div className="tiny faint" style={{ marginTop: 6 }}>{cps.checkpoints.length} checkpoint(s) · repo: local git (git status below)</div>}
        </div>
        <div className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>GitHub</div>
          <GitHubPane projectId={id} gitRev={git && git.revision} />
        </div>
      </div>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Commit changes</h3>
          <div className="row" style={{ marginTop: 8 }}><input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Commit message" /><button className="btn primary" disabled={commitBusy || !git || (git.changes || []).length === 0} onClick={async () => { setCommitBusy(true); try { const r = await api('/projects/' + id + '/git/commit', { body: { message: msg } }); toast(r.ok ? 'Committed ' + (r.revision || '') : 'Commit failed: ' + (r.error || ''), r.ok ? 'ok' : 'error'); load(); } catch (e) { toast(e.message, 'error'); } setCommitBusy(false); }}>{commitBusy ? <Spinner /> : 'Commit'}</button></div>
          <div className="tiny faint" style={{ marginTop: 6 }}>{git && (git.changes || []).length ? (git.changes || []).map((c) => c.path || c).join(', ') : 'working tree clean'}</div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Create checkpoint</h3>
          <div className="small muted" style={{ marginTop: 6 }}>Checkpoints snapshot the whole project (git commit + archive) — safe point to restore if a later change goes wrong.</div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => { setBusy(true); try { const r = await api('/projects/' + id + '/checkpoints', { body: { label: 'Manual checkpoint — ' + new Date().toLocaleString() } }); toast('Checkpoint ' + r.created + ' created', 'ok'); load(); } catch (e) { toast(e.message, 'error'); } setBusy(false); }}>📌 Checkpoint now</button>
        </div>
      </div>
      <div className="section-title">Branches</div>
      <div className="card" style={{ marginBottom: 16 }}>
        {!git || !git.branches ? <div className="small muted"><Spinner /> reading branches…</div> : (
          <>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Badge tone="gold">● {git.branches.current || 'main'}</Badge>
              {(git.branches.list || []).map((b) => (
                <button key={b} disabled={branchBusy || b === git.branches.current} title={b === git.branches.current ? 'current branch' : 'Switch to ' + b}
                  className="chip cursor-pointer" style={{ padding: '4px 10px', opacity: b === git.branches.current ? 1 : undefined }}
                  onClick={async () => {
                    if (b === git.branches.current) return;
                    setBranchBusy(true);
                    try { const r = await api('/projects/' + id + '/git/switch', { body: { name: b } }); toast('On branch ' + r.current, 'ok'); load(); } catch (e) { toast(e.message, 'error'); }
                    setBranchBusy(false);
                  }}>{b === git.branches.current ? '✓ ' : ''}{b}</button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="new branch name (e.g. feature/analytics)" style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && newBranch.trim() && createBranch()} />
              <button className="btn sm primary" disabled={branchBusy || !newBranch.trim()} onClick={createBranch}>{branchBusy ? <Spinner /> : 'Create & switch'}</button>
            </div>
            <div className="tiny faint" style={{ marginTop: 6 }}>Branches are real git branches in the project repository — commit, test and push on a branch without touching main. Switching branches rewinds the working tree (checkpoint first if you need to keep uncommitted work).</div>
          </>
        )}
      </div>
      <div className="section-title">Checkpoints / version history</div>
      {cps === null ? <div className="center-load"><Spinner /></div> : cps.checkpoints.length === 0 ? <div className="card muted small">No checkpoints yet — the pipeline records one automatically after each successful build.</div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Label</th><th>Agent</th><th>Git ref</th><th>When</th><th /></tr></thead>
            <tbody>
              {cps.checkpoints.map((c) => (
                <tr key={c.id}>
                  <td className="mono tiny">{c.id}</td>
                  <td style={{ fontWeight: 600 }}>{c.label}</td>
                  <td className="tiny">{c.agent || '—'}</td>
                  <td className="mono tiny">{c.git_ref || '—'}</td>
                  <td className="tiny faint">{fmtAgo(new Date(c.created_at).getTime())}</td>
                  <td className="text-right">
                    <button className="btn sm ghost" disabled={forkBusy} onClick={() => forkAt(c)} title="Create an independent copy of this project at this version">🍴 Fork</button>
                    <button className="btn sm ghost" onClick={() => setRestore(c)}>⏪ Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="section-title">git status</div>
      <div className="code-scroll dark"><pre className="code-block">{git ? (typeof git.status === 'string' ? git.status : (git.status && (git.status.out || git.status.err)) || 'clean') : 'loading…'}</pre></div>
      {restore && (
        <Modal onClose={() => setRestore(null)}>
          <ModalHead title="Restore checkpoint" onClose={() => setRestore(null)} sub={restore.id + ' @ ' + (restore.git_ref || 'HEAD')} />
          <p className="small">This resets the project working tree to the checkpoint state. The current state is <b>not</b> deleted — create a checkpoint first if you want to keep it, then restart the app to apply restored code.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setRestore(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => {
              setBusy(true);
              try { const r = await api('/projects/' + id + '/checkpoints/restore', { body: { id: restore.id } }); toast('Restored: ' + (r.note || ''), 'ok'); setRestore(null); load(); }
              catch (e) { toast(e.message, 'error'); }
              setBusy(false);
            }}>Restore this checkpoint</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GitHubPane({ projectId, gitRev }) {
  const toast = useToast();
  const [gh, setGh] = useState(null); // GET /projects/:id/github
  const [loading, setLoading] = useState(true);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');
  const load = () => api('/projects/' + projectId + '/github').then(setGh).catch(() => { }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (gh && gh.connected && !repo) setRepo(gh.repo_name || ''); }, [gh]);
  if (loading) return <div className="small muted" style={{ marginTop: 8 }}><Spinner /> checking…</div>;
  if (!gh || !gh.connected) {
    return (
      <div style={{ marginTop: 8 }}>
        <div className="small muted">Push this project to a real GitHub repository. Connect with a personal access token (classic: <b>repo</b> scope · fine-grained: Contents read/write) — it is encrypted at rest server-side and never shown again.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm primary" onClick={() => setTokenOpen(true)}>Connect GitHub</button>
          <button className="btn sm ghost" onClick={async () => { try { const d = await api('/integrations/github/oauth', { body: {} }); if (d.url) window.open(d.url, '_blank'); else toast('OAuth not configured on this platform — use a personal access token.', 'error'); } catch (e) { toast(e.message || 'OAuth not configured here — use a token.', 'error'); } }}>OAuth app</button>
        </div>
        {tokenOpen ? (
          <form onSubmit={async (e) => {
            e.preventDefault(); setBusy(true);
            try { const d = await api('/integrations/github/token', { body: { token } }); toast('Connected as @' + d.login, 'ok'); setToken(''); setTokenOpen(false); load(); }
            catch (ex) { toast(ex.message, 'error'); }
            setBusy(false);
          }} style={{ marginTop: 10 }}>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_… or ghp_…" autoFocus />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn sm ghost" onClick={() => setTokenOpen(false)}>Cancel</button>
              <button className="btn sm primary" disabled={busy || token.length < 6}>{busy ? <Spinner /> : 'Connect'}</button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div className="small"><b>@{gh.login}</b> {gh.scopes ? <span className="tiny faint">· scopes: {String(gh.scopes).slice(0, 60)}</span> : null}</div>
      {gh.error ? <div className="tiny" style={{ color: 'var(--warn)', marginTop: 6 }}>{gh.error}</div> : (
        <div className="tiny" style={{ marginTop: 6 }}>
          {gh.exists ? <>Repo exists: <a href={gh.html_url} target="_blank" rel="noreferrer" className="gold">{gh.login}/{gh.repo_name}</a>{gh.private ? ' · private' : ' · public'}</> : <>No repository <b>{gh.login}/{gh.repo_name}</b> yet — push will create it (private unless the platform opts into public repos).</>}
        </div>
      )}
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="repo-name" style={{ flex: 1 }} />
        <button className="btn sm primary" disabled={busy || !repo.trim()} onClick={async () => {
          setBusy(true); setOut('');
          try {
            const r = await api('/projects/' + projectId + '/github/push', { body: { repo: repo.trim(), message: 'NOIR update — commit ' + (gitRev || '').slice(0, 7) } });
            setOut((r.note ? r.note + '\n' : '') + r.output);
            toast('Pushed to ' + r.login + '/' + r.repo, 'ok'); load();
          } catch (e) { setOut(String(e.detail || e.message || e)); toast(e.message, 'error'); }
          setBusy(false);
        }}>{busy ? <Spinner /> : 'Push to GitHub'}</button>
      </div>
      {out ? <div className="code-scroll dark" style={{ marginTop: 8, maxHeight: 130 }}><pre className="code-block">{out}</pre></div> : null}
      <div className="tiny faint" style={{ marginTop: 8 }}>The token stays server-side (encrypted). NOIR commits the working tree first, creates the repository if needed, then pushes over HTTPS.</div>
    </div>
  );
}
