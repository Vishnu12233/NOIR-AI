import React, { useEffect, useRef, useState } from 'react';
import { useToast, Badge, Spinner, Empty, Seg, navigate } from '../../lib/ui.jsx';
import { api, fmtDate } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

const TERMINAL = ['ready', 'failed', 'blocked', 'canceled'];
const CONN = ['vercel', 'supabase', 'appwrite'];
const STONE = { ready: 'ok', queued: 'muted', building: 'gold', blocked: 'err', failed: 'err', canceled: 'muted' };

export function DeployTab() {
  const { id } = useProject();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [planErr, setPlanErr] = useState(null);
  const [hist, setHist] = useState(null);
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState('static');
  const [env, setEnv] = useState('preview');
  const [queueing, setQueueing] = useState(false);
  const [run, setRun] = useState(null);
  const [logs, setLogs] = useState([]);
  const after = useRef(0);
  const timer = useRef(null);

  const loadAll = async () => {
    try { setPlan(await api('/projects/' + id + '/deploy/plan')); } catch (e) { setPlanErr(e.message); }
    try { setHist((await api('/projects/' + id + '/deployments')).deployments); } catch { /* silent */ }
  };
  useEffect(() => { loadAll(); }, [id]);
  useEffect(() => {
    if (plan && !sel && plan.plan.recommended.length) { const r = plan.plan.recommended[0]; setSel(r); if (r === 'vercel') setMode(plan.plan.app.vercel_json ? 'repo' : 'static'); }
  }, [plan]);
  useEffect(() => { if (sel !== 'vercel' && mode === 'repo' && plan && plan.plan.app.server_js && !plan.plan.app.vercel_json) setMode('static'); }, [sel]);

  // watcher for the currently viewed run
  useEffect(() => {
    if (!run) return;
    const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    const poll = async () => {
      let row;
      try { row = (await api('/deployments/' + run.id)).deployment; } catch (e) { toast(e.message, 'error'); stop(); return; }
      setRun(row);
      try {
        const lg = await api('/deployments/' + run.id + '/logs?after=' + after.current);
        if (lg.logs && lg.logs.length) { setLogs((s) => [...s, ...lg.logs]); after.current = lg.next_after; }
      } catch { /* log poll best-effort */ }
      if (TERMINAL.includes(row.status)) { stop(); loadAll(); }
    };
    after.current = 0;
    setLogs([]);
    poll();
    timer.current = setInterval(poll, 1600);
    return stop;
  }, [run && run.id]);

  const start = async (st) => {
    if (st.needs.length && (!plan.plan.connections[st.needs[0]] || plan.plan.connections[st.needs[0]].status !== 'connected')) { toast('Connect ' + st.needsLabel + ' first — NOIR never deploys without a live connection.', 'error'); return; }
    setQueueing(true);
    try {
      const body = { provider: st.id, environment: st.id === 'vercel' ? env : 'production' };
      if (st.id === 'appwrite') body.static = !plan.plan.app.server_js;
      if (st.id === 'vercel' && mode === 'static') body.static = true;
      const out = await api('/projects/' + id + '/deployments', { body });
      setRun(out.deployment); after.current = 0; setLogs([]);
      toast('Deployment queued — real ' + st.label + ' operation', 'ok');
      loadAll();
    } catch (e) { toast(e.message, 'error'); }
    setQueueing(false);
  };

  const retryRun = async (d) => {
    try { const out = await api('/deployments/' + d.id + '/retry', { body: {} }); setRun(out.deployment); after.current = 0; setLogs([]); toast('Retry queued', 'ok'); loadAll(); } catch (e) { toast(e.message, 'error'); }
  };
  const cancelRun = async () => {
    try { await api('/deployments/' + run.id + '/cancel', { body: {} }); toast('Cancel request sent to ' + run.provider, 'ok'); } catch (e) { toast(e.message, 'error'); }
  };
  const watch = (d) => { setRun(d); after.current = 0; setLogs([]); };

  const planD = plan && plan.plan;
  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-head">
        <h1>Deployment</h1>
        <div className="sub">Every deploy runs the hardcoded-secret gate and the real test suite first, then performs an actual provider operation. Success is only ever a provider-returned READY / ACTIVE — URLs, states and logs come from the provider, never synthesized by NOIR.</div>
      </div>
      {planErr ? <div className="badge err" style={{ display: 'flex', marginBottom: 12 }}>{planErr}</div> : null}
      {!plan ? <div className="center-load"><Spinner /></div> : (
        <>
          <div className="grid cols-4" style={{ marginBottom: 14 }}>
            <div className="card"><div className="tiny faint">Project kind</div><div className="small" style={{ marginTop: 4 }}>{planD.project_kind.replace(/-/g, ' ')}</div><div className="tiny faint" style={{ marginTop: 2 }}>{planD.app.server_js ? 'server.js backend' : planD.app.schema_spec ? 'db/schema.js spec' : 'client only'}{planD.app.vercel_json ? ' · vercel.json adapter' : ''}</div></div>
            {CONN.map((c) => { const on = planD.connections[c] && planD.connections[c].status === 'connected'; return <div key={c} className="card"><div className="tiny faint">{c}</div><div className="row" style={{ marginTop: 4 }}><Badge tone={on ? 'ok' : 'muted'} dot>{on ? 'connected' : 'not connected'}</Badge></div></div>; })}
          </div>
          <div className="section-title">Targets</div>
          <div className="grid cols-2">
            {planD.stacks.map((st) => {
              const needsConn = st.needs.length ? planD.connections[st.needs[0]] : null;
              const ready = st.usable && (!st.needs.length || (needsConn && needsConn.status === 'connected'));
              const isVer = st.id === 'vercel';
              const showMode = isVer && st.usable && planD.app.server_js && !!planD.app.vercel_json;
              return (
                <div key={st.id} className="card" style={sel === st.id ? { borderColor: 'var(--gold)' } : {}}>
                  <div className="row-between">
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}><b>{st.label}</b><Badge tone="muted">{st.kind}</Badge></div>
                    {planD.recommended.includes(st.id) ? <Badge tone="gold">recommended</Badge> : null}
                  </div>
                  <div className="small muted" style={{ marginTop: 6, lineHeight: 1.45 }}>{st.note}</div>
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    {st.needs.length
                      ? (needsConn && needsConn.status === 'connected' ? <Badge tone="ok">account connected</Badge> : <Badge tone="warn">needs {st.needsLabel}</Badge>)
                      : <span className="tiny faint">no external account needed</span>}
                    {!st.usable ? <Badge tone="err">gate: not possible for this project</Badge> : null}
                  </div>
                  {isVer && st.usable && !planD.app.vercel_json && planD.app.server_js ? (
                    <div className="badge warn" style={{ display: 'flex', marginTop: 8 }}>static mode only — Vercel cannot run server.js without a real vercel.json adapter; only the client files are uploaded.</div>
                  ) : null}
                  {showMode ? (
                    <div className="row" style={{ marginTop: 8 }}>
                      <Seg options={[{ value: 'repo', label: 'repo (verbatim)' }, { value: 'static', label: 'static client' }]} value={mode} onChange={setMode} />
                    </div>
                  ) : null}
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
                    {isVer && st.usable ? (
                      <label className="tiny faint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>target
                        <select style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }} value={env} onChange={(e) => setEnv(e.target.value)}>
                          <option value="preview">preview</option><option value="production">production</option>
                        </select>
                      </label>
                    ) : <span />}
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm ghost" onClick={() => { setSel(st.id); if (st.needs.length && !ready) navigate('/app/integrations'); }} disabled={!ready && queueing}>
                        {st.needs.length && !ready ? 'Connect ' + st.needsLabel : 'Details'}
                      </button>
                      <button className="btn sm primary" disabled={!ready || queueing} onClick={() => { setSel(st.id); if (isVer && !planD.app.server_js) setMode('static'); if (isVer && planD.app.vercel_json && mode !== 'static') setMode('repo'); start(st); }}>{queueing && sel === st.id ? <Spinner /> : st.id === 'vercel' && mode === 'static' ? 'Deploy static client' : st.id === 'vercel' && mode === 'repo' ? 'Deploy repo' : 'Deploy'}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {run ? <RunPanel run={run} logs={logs} onClose={() => setRun(null)} onCancel={cancelRun} onRetry={retryRun} /> : null}

      <div className="section-title" style={{ marginTop: 18 }}>Deployment history</div>
      {hist === null ? <div className="center-load"><Spinner /></div> : hist.length === 0 ? (
        <Empty icon="🚀" title="No deployments yet">Nothing has been deployed for this project. Pick a target above — every run is a real operation against the provider or the NOIR runtime.</Empty>
      ) : (
        <div className="card" style={{ padding: '4px 0' }}>
          {hist.slice().reverse().map((d) => (
            <div key={d.id} className="row-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', gap: 8, alignItems: 'center' }}>
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <span className="mono small faint">{d.id.slice(-10)}</span>
                <Badge tone="muted">{d.provider}</Badge>
                <span className="tiny faint">{d.environment}</span>
                <Badge tone={STONE[d.status] || 'muted'} dot>{d.status}</Badge>
              </div>
              <div className="flex1" style={{ minWidth: 0, textAlign: 'right' }}>
                {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="ok-text small" style={{ wordBreak: 'break-all' }}>{d.url}</a>
                  : d.error ? <span className="tiny err" style={{ wordBreak: 'break-all' }}>{d.error.slice(0, 80)}</span>
                    : <span className="tiny faint">{fmtDate(d.created_at)}</span>}
              </div>
              <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                <button className="btn sm ghost" onClick={() => watch(d)}>Logs</button>
                {(d.status === 'failed' || d.status === 'blocked') ? <button className="btn sm ghost" onClick={() => retryRun(d)}>Retry</button> : null}
                {!TERMINAL.includes(d.status) ? <button className="btn sm ghost" onClick={async () => { try { await api('/deployments/' + d.id + '/cancel', { body: {} }); toast('Cancel request sent'); loadAll(); } catch (e) { toast(e.message, 'error'); } }}>Cancel</button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunPanel({ run, logs, onClose, onCancel, onRetry }) {
  const active = !TERMINAL.includes(run.status);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs.length, run.status]);
  return (
    <div className="card" style={{ marginTop: 16, borderColor: active ? 'var(--gold)' : 'var(--line)' }}>
      <div className="row-between" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <b>{run.provider}</b>
          <Badge tone="muted">{run.environment}</Badge>
          <Badge tone={STONE[run.status] || 'muted'} dot>{run.status}</Badge>
          {active ? <Spinner /> : null}
          {run.url ? <a className="ok-text small" href={run.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{run.url}</a> : null}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {active ? <button className="btn sm ghost" onClick={onCancel}>Cancel</button> : null}
          {(run.status === 'failed' || run.status === 'blocked') ? <button className="btn sm primary" onClick={() => onRetry(run)}>Retry</button> : null}
          <button className="btn sm ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      {run.error ? <div className="badge err" style={{ display: 'flex', marginTop: 10, whiteSpace: 'pre-wrap' }}>{run.error}</div> : null}
      <div className="tiny faint" style={{ marginTop: 8 }}>{run.id} · queued {fmtDate(run.created_at)}{run.finished_at ? ' · finished ' + fmtDate(run.finished_at) : ''}</div>
      <div className="code-scroll" style={{ marginTop: 8, maxHeight: 340 }}>
        <pre className="code-block" ref={ref} style={{ fontSize: 12, lineHeight: 1.5 }}>
          {logs.length === 0 && !active ? '(no persisted log lines for this run — status and error above are from the provider)' : logs.map((l, i) => <span key={i} className={l.level === 'error' ? 'err' : l.level === 'warn' ? 'gold' : ''}>{l.text}{'\n'}</span>)}
          {active ? <span className="faint">— live stream —</span> : null}
        </pre>
      </div>
    </div>
  );
}
