import React, { useEffect, useMemo, useState } from 'react';
import { useRoute, Link, useToast, Badge, StatusChip, Spinner } from '../lib/ui.jsx';
import { fmtAgo, fmtDate, apiDownload, api } from '../lib/api.js';
import { ProjectProvider, useProject, taskTone } from './project/ctx.jsx';
import { CommandBar, useCommandBar } from './CommandBar.jsx';
import { Download, Command, Users, Check, X } from 'lucide-react';
import { Overview } from './project/Overview.jsx';
import { FilesTab } from './project/Files.jsx';
import { TasksTab } from './project/Tasks.jsx';
import { PreviewTab } from './project/Preview.jsx';
import { TerminalTab } from './project/Terminal.jsx';
import { TestsTab } from './project/Tests.jsx';
import { QualityTab } from './project/Quality.jsx';
import { DatabaseTab } from './project/Database.jsx';
import { EnvTab } from './project/Env.jsx';
import { GitTab } from './project/Git.jsx';
import { DeployTab } from './project/Deploy.jsx';
import { DocsTab } from './project/Docs.jsx';
import { ChatTab } from './project/Chat.jsx';
import { BuildTab } from './project/Build.jsx';
import { ApiTab } from './project/Api.jsx';
import { LogsTab } from './project/Logs.jsx';

const TABS = [
  ['overview', 'Overview', '🏠'],
  ['build', 'Build', '🏗️'],
  ['workspace', 'Code', '📁'],
  ['tasks', 'Tasks', '🧩'],
  ['preview', 'Preview', '👀'],
  ['chat', 'Chat', '💬'],
  ['terminal', 'Terminal', '⌨️'],
  ['tests', 'Testing', '🧪'],
  ['quality', 'Quality', '🩺'],
  ['database', 'Database', '🗄️'],
  ['api', 'API', '🔌'],
  ['logs', 'Logs', '🧾'],
  ['deploy', 'Deploy', '🚀'],
  ['git', 'Git', '📦'],
  ['env', 'Env', '🔐'],
  ['docs', 'Docs', '📚'],
];

export function ProjectView({ id, query }) {
  const route = useRoute();
  const [tab, setTab] = useState(query.tab || 'overview');
  return (
    <ProjectProvider id={id}>
      <Shell tab={tab} setTab={setTab} />
    </ProjectProvider>
  );
}


// ---- Share with a team (Phase 43): owner/admin sets project.team_id ----
function ShareMenu({ p, refresh, toast }) {
  const [teams, setTeams] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = ['owner', 'admin'].includes(p.my_role);
  useEffect(() => {
    if (!open || !mine) return;
    api('/teams').then((d) => setTeams(d.teams || [])).catch(() => setTeams([]));
  }, [open, mine]);
  if (!mine && !p.team_name) return null;
  const setShare = async (teamId) => {
    setBusy(true);
    try { await api('/projects/' + p.id + '/team', { method: 'POST', body: { team_id: teamId } }); refresh(); toast(teamId ? 'Project shared with the team.' : 'Project is private again.', 'ok'); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button className={'btn sm ' + (p.team_name ? 'ghost' : 'ghost')} title={p.team_name ? 'Shared with ' + p.team_name : 'Share with a team'}
        onClick={() => (mine ? setOpen((v) => !v) : null)} style={p.team_name ? { color: 'var(--ok)' } : undefined}>
        <Users size={13} /> {p.team_name || (mine ? 'Share' : 'Team')}
      </button>
      {open && mine ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41, width: 320, padding: 10 }}>
            <div className="row-between" style={{ padding: '2px 6px 8px' }}>
              <b style={{ fontSize: 13 }}>Share with a team</b>
              <button className="icon-btn" onClick={() => setOpen(false)}><X size={13} /></button>
            </div>
            <div className="tiny faint" style={{ padding: '0 6px 8px' }}>Team members get access by role (developer can edit & run, reviewer can review & run tests, viewer read-only). Only one team per project; the owner stays owner.</div>
            {!teams ? <div className="tiny muted" style={{ padding: 8 }}>Loading teams…</div> : !teams.length ? (
              <div className="tiny muted" style={{ padding: 8 }}>No teams yet — create one from the Teams page first.</div>
            ) : teams.map((t) => (
              <div key={t.id} className="row" style={{ gap: 8, padding: '6px 4px', opacity: ['owner', 'admin'].includes(t.my_role) ? 1 : 0.55 }}>
                <Users size={14} style={{ color: 'var(--gold)', flex: 'none' }} />
                <span className="flex1" style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 12.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</b>
                  <span className="tiny faint">{t.members} members · you are {t.my_role}</span>
                </span>
                {['owner', 'admin'].includes(t.my_role) ? (
                  <button className={'btn sm ' + (p.team_id === t.id ? 'primary' : 'ghost')} disabled={busy}
                    onClick={() => setShare(p.team_id === t.id ? null : t.id)}>
                    {p.team_id === t.id ? <><Check size={12} /> Shared</> : 'Share'}
                  </button>
                ) : <span className="tiny faint">no manage rights</span>}
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 8, textAlign: 'center' }}>
              <Link to="/app/teams" className="tiny" style={{ color: 'var(--gold)' }}>Manage teams →</Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Shell({ tab, setTab }) {
  const { data, loading, previewAlive, refresh, runApp, stopApp } = useProject();
  const toast = useToast();
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandBar();
  const [sideNav, setSideNav] = useState(false);
  const p = data?.project;
  if (loading && !data) return <div className="center-load" style={{ minHeight: '70vh' }}><Spinner /> Loading project…</div>;
  if (!p) return <div className="page"><div className="empty"><div className="big">🔍</div><h3>Project not found</h3><Link to="/app/projects">Back to projects</Link></div></div>;
  const navTab = (id) => () => setTab(id);
  const exportZip = async () => { try { await apiDownload('/projects/' + p.id + '/export', (p.name || 'noir-project').replace(/[^a-z0-9-_]/gi, '_') + '.zip'); toast('Exporting ZIP of the full source', 'ok'); } catch (e) { toast(e.message, 'error'); } };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="topbar" style={{ position: 'sticky', top: 0 }}>
        <button className="btn ghost sm" onClick={() => history.back()}><span>←</span><span className="hide-sm">Projects</span></button>
        <Link to={'/project/' + p.id} style={{ color: 'inherit', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{p.favorite ? '⭐ ' : ''}{p.name}</span>
        </Link>
        <StatusChip status={p.status} />
        {p.health_score != null && <Badge tone="gold">health {p.health_score}</Badge>}
        <span className="flex1" />
        {previewAlive && <Badge tone="ok" dot><span className="status-dot ok" /> Live</Badge>}
        <ShareMenu p={p} refresh={refresh} toast={toast} />
        <button className="btn sm ghost" title="Export ZIP" onClick={exportZip}><Download size={13} /></button>
        <button className="btn ghost sm" onClick={() => setCmdOpen(true)}><Command size={13} /> ⌘K</button>
        <span className="tiny faint mono hide-sm">{p.tech_stack || ''}</span>
      </div>
      <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} placeholder={'Ask NOIR anything about ' + p.name + '…'}
        items={[
          { icon: '▶️', label: 'Run the app', action: () => runApp().catch((e) => toast(e.message, 'error')), hint: previewAlive ? 'already live' : '' },
          { icon: '⏹️', label: 'Stop the app', action: () => stopApp().catch((e) => toast(e.message, 'error')), hint: previewAlive ? 'running' : 'not running' },
          { icon: '🧪', label: 'Run tests', route: '/project/' + p.id + '?tab=tests' },
          { icon: '🩺', label: 'Re-run security & quality scans', route: '/project/' + p.id + '?tab=quality' },
          { icon: '📌', label: 'Create checkpoint', route: '/project/' + p.id + '?tab=git' },
          { icon: '🚀', label: 'Deploy (local)', route: '/project/' + p.id + '?tab=deploy' },
          { icon: '💬', label: 'Chat with NOIR about this project', route: '/project/' + p.id + '?tab=chat' },
          { icon: '📦', label: 'Export project as ZIP', action: exportZip, hint: 'download' },
          { icon: '🤖', label: 'Ask NOIR anything…', route: '/app/assistant' },
          ...TABS.map(([key, label, icon]) => ({ icon, label, action: navTab(key), hint: 'tab' })),
        ]}
      />
      <div className="row" style={{ borderBottom: '1px solid var(--line)', overflowX: 'auto', padding: '0 8px', flexWrap: 'nowrap', background: 'var(--bg-2)' }}>
        {TABS.map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)} className="icon-btn" style={{ borderRadius: 0, height: 40, padding: '0 12px', width: 'auto', fontSize: 12.8, fontWeight: tab === key ? 700 : 500, color: tab === key ? 'var(--text)' : 'var(--muted)', borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent', background: 'transparent', flex: 'none' }}>
            <span style={{ marginRight: 5, fontSize: 13 }}>{icon}</span>{label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg)' }}>
        <TabBody tab={tab} />
      </div>
    </div>
  );
}

function TabBody({ tab }) {
  const { data } = useProject();
  switch (tab) {
    case 'build': return <BuildTab key="b" />;
    case 'workspace': return <FilesTab key="f" />;
    case 'tasks': return <TasksTab key="t" />;
    case 'preview': return <PreviewTab key="p" />;
    case 'terminal': return <TerminalTab key="tm" />;
    case 'tests': return <TestsTab key="ts" />;
    case 'quality': return <QualityTab key="q" />;
    case 'database': return <DatabaseTab key="d" />;
    case 'api': return <ApiTab key="api" />;
    case 'logs': return <LogsTab key="logs" />;
    case 'env': return <EnvTab key="e" />;
    case 'git': return <GitTab key="g" />;
    case 'deploy': return <DeployTab key="dp" />;
    case 'docs': return <DocsTab key="dc" />;
    case 'chat': return <ChatTab key="c" />;
    case 'overview':
    default: return <Overview key="o" data={data} />;
  }
}
