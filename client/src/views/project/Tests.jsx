import React, { useState } from 'react';
import { useToast, Badge, Spinner, Empty } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function TestsTab() {
  const { id, data, refresh } = useProject();
  const toast = useToast();
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState(false);
  const lastTask = (data?.tasks || []).filter((t) => t.kind === 'test').slice(-1)[0];
  const run = async () => {
    setBusy(true); setRes(null);
    try { setRes(await api('/projects/' + id + '/tests/run', { body: {} })); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
    refresh(true);
  };
  const fix = async () => {
    setFixing(true);
    try {
      const r = await api('/projects/' + id + '/tests/fix', { body: {} });
      toast(r.reQueued ? 'Fix task queued — NOIR diagnoses and repairs, then re-runs within its retry cap' : 'Queued', 'ok');
    } catch (e) { toast(e.message, 'error'); }
    setFixing(false);
  };
  const r = res || (lastTask && lastTask.result && typeof lastTask.result === 'object' ? lastTask.result : null);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head row-between">
        <div><h1>Automated testing</h1><div className="sub">NOIR executes the project's real test suite with <code>node --test</code> — results below are from actual runs.</div></div>
        <button className="btn primary lg" onClick={run} disabled={busy}>{busy ? <Spinner /> : '▶ Run tests'}</button>
      </div>
      {r ? (
        <>
          <div className="grid cols-4" style={{ marginBottom: 14 }}>
            <StatN label="Passed" v={r.passed} tone="ok" />
            <StatN label="Failed" v={r.failed} tone={r.failed ? 'err' : 'muted'} />
            <StatN label="Skipped" v={r.skipped} tone="muted" />
            <StatN label="Duration" v={r.durationMs != null ? Math.round(r.durationMs) + 'ms' : '—'} tone="muted" />
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <Badge tone={r.ok ? 'ok' : 'err'}>{r.ok ? 'SUITE PASSED' : 'SUITE FAILED'}</Badge>
            {r.exitCode != null ? <span className="tiny faint">exit code {r.exitCode}{r.timedOut ? ' · timed out' : ''}</span> : null}
            {r.failures && r.failures.length > 0 && !fixing ? <button className="btn sm" onClick={fix}>🔧 Fix failed tests (NOIR debug agent)</button> : null}
            {fixing ? <Badge tone="gold">fix queued…</Badge> : null}
          </div>
          {r.failures && r.failures.length > 0 ? (
            <div className="card" style={{ marginBottom: 14, borderColor: 'color-mix(in srgb, var(--err) 35%, var(--line))' }}>
              <b style={{ fontSize: 13.5 }}>Failure details</b>
              {r.failures.map((f, i) => (
                <details key={i} style={{ marginTop: 8 }} open={i === 0}>
                  <summary style={{ cursor: 'pointer', fontSize: 13 }}><code>{f.name}</code>{f.location ? <span className="tiny faint"> · {f.location}</span> : null}</summary>
                  {f.error ? <div className="code-scroll" style={{ marginTop: 6 }}><pre className="code-block" style={{ color: 'var(--err)' }}>{f.error}</pre></div> : null}
                </details>
              ))}
            </div>
          ) : null}
          {r.rawTail ? (
            <>
              <div className="section-title">Raw output (tail)</div>
              <div className="code-scroll dark"><pre className="code-block">{r.rawTail}</pre></div>
            </>
          ) : null}
        </>
      ) : lastTask && lastTask.status === 'failed' ? (
        <div className="card" style={{ borderColor: 'var(--err)' }}>
          <b>Last test run failed during the pipeline.</b>
          <div className="small muted" style={{ marginTop: 6 }}>{String(lastTask.error || '').slice(0, 400)}</div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={run}>Run again now</button>
        </div>
      ) : (
        <Empty icon="🧪" title="No test run yet">Press Run tests — NOIR will execute <code>node --test tests/</code> in the project and show the parsed results here.</Empty>
      )}
    </div>
  );
}
function StatN({ label, v, tone }) {
  return <div className="card" style={{ textAlign: 'center', borderColor: tone === 'err' ? 'color-mix(in srgb, var(--err) 50%, var(--line))' : undefined }}>
    <div className="stat-num" style={{ color: tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : undefined }}>{v}</div>
    <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>{label}</div>
  </div>;
}
