// NOIR Teams & organizations (Phase 43): create teams, invite registered users by
// email with explicit roles, and see which projects each team shares.
import React, { useEffect, useState } from 'react';
import { Users, Plus, UserPlus, LogOut, Trash2, Shield, ExternalLink } from 'lucide-react';
import { Link, navigate, useToast, Spinner, Empty, Badge, useAuth } from '../lib/ui.jsx';
import { api, fmtAgo } from '../lib/api.js';

const ROLES = ['owner', 'admin', 'developer', 'reviewer', 'viewer'];
const ROLE_HINT = {
  owner: 'full control, invites admins',
  admin: 'manage members & projects',
  developer: 'build: edit, run, test, commit',
  reviewer: 'review: read, preview, run tests',
  viewer: 'read-only access',
};

export function TeamsView() {
  const toast = useToast();
  const [teams, setTeams] = useState(null);
  const [err, setErr] = useState(null);
  const [name, setName] = useState('');
  const [open, setOpen] = useState({});
  const load = async () => {
    try { setTeams((await api('/teams')).teams); }
    catch (e) { setErr(e); }
  };
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const d = await api('/teams', { method: 'POST', body: { name: name.trim() } });
      setName('');
      setOpen((o) => ({ ...o, [d.team.id]: true }));
      toast('Team created — invite your teammates by email.');
      load();
    } catch (ex) { toast(ex.message, 'err'); }
  };
  const act = async (fn, okMsg) => {
    try { await fn(); if (okMsg) toast(okMsg); load(); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  if (err) return <div className="page"><Empty icon="⚠️" title="Failed to load teams">{err.message}</Empty></div>;
  return (
    <div className="page">
      <div className="page-head row-between">
        <div><h1>Teams</h1><div className="sub">Share projects with teammates — each member gets an explicit role. Invites go to existing NOIR accounts by email.</div></div>
      </div>

      <form className="card row" style={{ gap: 10, padding: 14, marginBottom: 18 }} onSubmit={create}>
        <Users size={18} style={{ color: 'var(--gold)', flex: 'none' }} />
        <input className="flex1" placeholder="New team name — e.g. “Studio Crew”" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary sm" type="submit"><Plus size={14} /> Create team</button>
      </form>

      {!teams ? <div className="center-load"><Spinner /> Loading teams…</div> : !teams.length ? (
        <Empty icon="👥" title="No teams yet">Create your first team above, then invite teammates by their registered email.</Empty>
      ) : (
        <div className="grid" style={{ gap: 14, maxWidth: 860 }}>
          {teams.map((t) => {
            const canManage = ['owner', 'admin'].includes(t.my_role);
            const expanded = !!open[t.id];
            return (
              <div key={t.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <button className="row" style={{ width: '100%', padding: '13px 16px', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', gap: 12 }}
                  onClick={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}>
                  <span className="row" style={{ width: 34, height: 34, borderRadius: 9, background: 'color-mix(in srgb, var(--gold) 16%, transparent)', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <Users size={16} style={{ color: 'var(--gold)' }} />
                  </span>
                  <span className="flex1" style={{ minWidth: 0 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <b style={{ fontSize: 14.5 }}>{t.name}</b>
                      <Badge tone={canManage ? 'gold' : 'info'}>{t.my_role}</Badge>
                      {t.my_role === 'owner' ? <span className="tiny faint">(you created it)</span> : null}
                    </span>
                    <span className="tiny faint">{t.members} member{t.members === 1 ? '' : 's'} · {t.projects} shared project{t.projects === 1 ? '' : 's'}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
                </button>
                {expanded ? <TeamBody t={t} canManage={canManage} load={load} act={act} toast={toast} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamBody({ t, canManage, load, act, toast }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');
  const [members, setMembers] = useState(null);
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    api('/teams/' + t.id).then((d) => { setMembers(d.members); setProjects(d.projects); }).catch((e) => toast(e.message, 'err'));
  }, [t.id]);
  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    await act(() => api('/teams/' + t.id + '/members', { method: 'POST', body: { email: email.trim(), role } }), 'Invited ' + email.trim() + ' as ' + role + '.');
    setEmail('');
    const d = await api('/teams/' + t.id).catch(() => null);
    if (d) setMembers(d.members);
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: 14 }}>
      {canManage ? (
        <form className="row" style={{ gap: 8, marginBottom: 14 }} onSubmit={invite}>
          <div className="flex1"><input style={{ width: '100%' }} placeholder="teammate@email.com (must already have a NOIR account)" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ maxWidth: 150 }}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn sm primary" type="submit"><UserPlus size={13} /> Invite</button>
        </form>
      ) : <div className="tiny faint" style={{ marginBottom: 10 }}>Only team owners/admins can manage membership — request a role change from your team admin.</div>}

      <div className="section-title" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Members</div>
      {!members ? <div className="center-load"><Spinner /></div> : members.map((m) => (
        <div key={m.user_id} className="row" style={{ gap: 10, padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: 'color-mix(in srgb, var(--info) 16%, transparent)', color: 'var(--info)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flex: 'none' }}>{String(m.name || m.email || '?')[0].toUpperCase()}</span>
          <span className="flex1" style={{ minWidth: 0 }}>
            <span className="row" style={{ gap: 6 }}><b style={{ fontSize: 13 }}>{m.name || '—'}</b> {m.user_id === t.created_by ? <Badge tone="gold">owner</Badge> : null}</span>
            <span className="tiny faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</span>
          </span>
          {canManage && m.user_id !== t.created_by ? (
            <>
              <select value={m.role} style={{ maxWidth: 120 }} onChange={(e) => act(async () => {
                await api('/teams/' + t.id + '/members/' + m.user_id, { method: 'PATCH', body: { role: e.target.value } });
                setMembers((prev) => prev.map((x) => x.user_id === m.user_id ? { ...x, role: e.target.value } : x));
              }, 'Role updated')}>
                {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="icon-btn danger" title="Remove from team" onClick={() => { if (confirm('Remove ' + m.email + ' from ' + t.name + '? They lose access to its projects.')) act(async () => { await api('/teams/' + t.id + '/members/' + m.user_id, { method: 'DELETE' }); setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id)); }, 'Removed.'); }}>
                <Trash2 size={14} />
              </button>
            </>
          ) : <Badge tone="info">{m.role}</Badge>}
        </div>
      ))}

      <div className="section-title" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 14 }}>Shared projects</div>
      {!projects ? <div className="center-load"><Spinner /></div> : !projects.length ? (
        <div className="tiny faint" style={{ padding: '6px 0' }}>Nothing shared yet — open a project you own and use its <b>Share</b> button to put it in this team.</div>
      ) : projects.map((pr) => (
        <div key={pr.id} className="row" style={{ gap: 10, padding: '7px 0' }}>
          <span className="flex1" style={{ fontSize: 13 }}>{pr.name}</span>
          <Link className="btn ghost sm" to={'/project/' + pr.id}><ExternalLink size={12} /> Open</Link>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        {t.my_role === 'owner' ? (
          <button className="btn sm ghost danger" onClick={() => { if (confirm('Delete team “' + t.name + '”? Shared projects go back to private (owned by their creators).')) act(async () => { await api('/teams/' + t.id, { method: 'DELETE' }); }, 'Team deleted.'); }}>
            <Trash2 size={13} /> Delete team
          </button>
        ) : (
          <button className="btn sm ghost" onClick={() => { if (confirm('Leave “' + t.name + '”? You lose access to its shared projects.')) act(async () => { await api('/teams/' + t.id + '/members/' + user.id, { method: 'DELETE' }); }, 'You left the team.'); }}>
            <LogOut size={13} /> Leave team
          </button>
        )}
        <button className="btn sm ghost" onClick={() => navigate('/app/teams')}><Shield size={13} /> Roles: owner · admin · developer · reviewer · viewer</button>
      </div>
    </div>
  );
}
