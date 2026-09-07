// Logs tab — real runtime log tail + runtime status + project activity. Nothing fabricated.
import React, { useEffect, useRef, useState } from 'react';
import { useToast, Badge, Spinner } from '../../lib/ui.jsx';
import { api, fmtAgo } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function LogsTab() {
  const { id, data } = useProject();
  const toast = useToast();
  const [logs, setLogs] = useState(null);
  const [activity, setActivity] = useState([]);
  const [err, setErr] = useState(null);
  const [live, setLive] = useState(true);
  const running = !!(data && data.project && (data.project.running || (logs && logs.running)));
  const preRef = useRef(null);
  const load = async (silent) => {
    try {
      const [l, a] = await Promise.all([api('/projects/' + id + '/logs?lines=400'), api('/projects/' + id + '/logs/activity?limit=40')]);
      setLogs(l); setActivity(a.activity || []);
      if (!silent) setErr(null);
    } catch (e) { if (!silent) { setErr(e); toast(e.message, 'error'); } }
  };
  useEffect(() => { load(); const iv = setInterval(() => { if (live || running) load(true); }, 3000); return () => clearInterval(iv); }, [id, live]);
  useEffect(() => { if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight; }, [logs && logs.tail]);
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head row-between">
        <div><h1>Logs & activity</h1><div className="sub">Real output from the running app, its runtime and NOIR's own events — polled live while the app runs.</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className={'btn sm ' + (live ? 'primary' : 'ghost')} onClick={() => setLive((v) => !v)}>{live ? '● Live' : 'Paused'}</button>
          <button className="btn sm ghost" onClick={() => load(false)}>Refresh</button>
          <button className="btn sm ghost" onClick={() => { if (logs && logs.tail) { navigator.clipboard && navigator.clipboard.writeText(logs.tail); toast('Log tail copied to clipboard', 'ok'); } }}>Copy</button>
        </div>
      </div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Runtime</div>
          <div className="row" style={{ marginTop: 6, alignItems: 'center', gap: 8 }}>
            {running ? <><span className="status-dot ok" /><b style={{ color: 'var(--ok)' }}>Running</b></> : <><span className="status-dot" /><span>Stopped</span></>}
            {logs && logs.port ? <Badge tone="gold">port {logs.port}</Badge> : null}
          </div>
          <div className="tiny faint" style={{ marginTop: 6 }}>{logs ? (logs.pid ? 'pid ' + logs.pid + (logs.since ? ' · since ' + fmtAgo(logs.since) : '') : 'not running — start it from the Preview tab or ⌘K') : <Spinner />}</div>
        </div>
        <div className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Log source</div>
          <div className="small" style={{ marginTop: 6 }}>App stdout/stderr is streamed to <span className="mono tiny">.noir/run.log</span> inside the project sandbox. This pane shows its real tail.</div>
        </div>
        <div className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Activity feed</div>
          <div className="small" style={{ marginTop: 6 }}>{activity.length} recent events — builds, tests, deploys, git operations and fixes recorded by NOIR.</div>
        </div>
      </div>
      {err ? <div className="card" style={{ borderColor: 'var(--err)' }}><div className="small" style={{ color: 'var(--err)' }}>Failed to load logs: {err.message}</div></div> : null}
      <div className="section-title">Runtime log (tail {logs ? '' : ''})</div>
      <div className="code-scroll dark" style={{ maxHeight: 420, marginBottom: 16 }}><pre ref={preRef} className="code-block" style={{ fontSize: 12, lineHeight: 1.55 }}>{logs ? (logs.tail || '(log file is empty — start the app to produce output)') : 'loading…'}</pre></div>
      <div className="section-title">Recent project activity</div>
      <div className="card">
        {activity.length === 0 ? <div className="muted small">No recorded events yet.</div> : activity.map((a) => (
          <div key={a.id} className="row" style={{ padding: '6px 0', gap: 10, borderBottom: '1px solid var(--line-soft, rgba(255,255,255,.05))' }}>
            <span style={{ fontSize: 15 }}>{a.icon || '·'}</span>
            <span className="flex1" style={{ fontSize: 13 }}>{a.text}</span>
            {a.status === 'error' ? <Badge tone="err">error</Badge> : null}
            <span className="tiny faint">{fmtAgo(a.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
