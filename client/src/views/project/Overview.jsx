import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Link, useToast, Badge, StatusChip, Empty, Spinner } from '../../lib/ui.jsx';
import { fmtAgo } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function Overview({ data }) {
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      {data ? <OverviewInner data={data} /> : <div className="center-load"><Spinner /> Loading…</div>}
    </div>
  );
}

function OverviewInner({ data }) {
  const p = data.project;
  const { runApp, stopApp, events, previewAlive, id } = useProject();
  const toast = useToast();
  const [activity, setActivity] = useState([]);
  useEffect(() => { api('/activity?limit=10').then((d) => setActivity(d.activity)).catch(() => { }); }, []);
  const revents = events.filter((e) => e.type === 'activity').slice(-8).reverse();
  const spec = data.spec;
  return (
    <>
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', fontWeight: 650 }}>Status</div>
          <div className="row" style={{ marginTop: 8 }}>
            <StatusChip status={p.status} />
            {p.port && p.status === 'running' ? <span className="small muted mono">port {p.port}</span> : null}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary sm" onClick={() => runApp().catch((e) => toast(e.message, 'error'))} disabled={previewAlive}>▶ Run app</button>
            {previewAlive ? <button className="btn sm" onClick={() => stopApp().catch((e) => toast(e.message, 'error'))}>⏹ Stop</button> : null}
          </div>
        </div>
        <div className="card">
          <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', fontWeight: 650 }}>Health score</div>
          <div className="row" style={{ marginTop: 6, alignItems: 'baseline' }}>
            <span className="stat-num">{p.health_score ?? '—'}</span>
            <span className="small muted">/100</span>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Link to={'/project/' + id + '?tab=quality'} className="btn ghost sm">full quality report</Link>
          </div>
        </div>
        <div className="card">
          <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', fontWeight: 650 }}>Project</div>
          <div style={{ fontWeight: 650, fontSize: 15, marginTop: 8 }}>{p.name}</div>
          <div className="small muted" style={{ marginTop: 4, maxHeight: 52, overflow: 'hidden' }}>{p.description || '—'}</div>
          <div className="tiny faint" style={{ marginTop: 6 }}>created {fmtAgo(p.created_at)} · source {p.source}</div>
        </div>
      </div>
      <div className="grid cols-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="row-between"><h3 style={{ fontSize: 15 }}>Spec (source of truth)</h3><Link to={'/project/' + id + '?tab=build'} className="small gold">Edit & rebuild →</Link></div>
          {spec ? (
            <div className="small" style={{ marginTop: 8, lineHeight: 1.8 }}>
              <div><b>{spec.name}</b> — <span className="muted">{spec.category_label || spec.category}</span>{spec.tagline ? <span className="muted"> · {spec.tagline}</span> : null}</div>
              {spec.assumptions && spec.assumptions.length ? <div className="tiny faint" style={{ marginTop: 6 }}>{spec.assumptions.slice(0, 6).map((a) => <div key={a}>· {a}</div>)}</div> : null}
              <div style={{ marginTop: 8 }}>
                {spec.features && spec.features.map((f) => <span key={f} className="chip" style={{ margin: '0 4px 4px 0' }}>{f}</span>)}
              </div>
              <div className="tiny faint" style={{ marginTop: 8 }}>tables: {spec.tables && spec.tables.map((t) => t.table).join(', ')} · auth {spec.auth ? 'on' : 'off'}</div>
            </div>
          ) : <div className="muted small" style={{ marginTop: 8 }}>No compiled spec yet — run a build or open the Build tab.</div>}
        </div>
        <div className="card">
          <div className="row-between"><h3 style={{ fontSize: 15 }}>Live activity</h3><Link to={'/project/' + id + '?tab=chat'} className="small gold">chat & events →</Link></div>
          <div style={{ marginTop: 8 }}>
            {revents.length ? revents.map((a, i) => (
              <div key={a.id || i} className="row" style={{ padding: '3px 0', gap: 8 }}><span>{a.icon}</span><span className="flex1 small">{a.text}</span><span className="tiny faint">{fmtAgo(a.ts)}</span></div>
            )) : (activity || []).slice(0, 6).map((a) => (
              <div key={a.id} className="row" style={{ padding: '3px 0', gap: 8 }}><span>{a.icon}</span><span className="flex1 small">{a.text}</span><span className="tiny faint">{fmtAgo(a.ts)}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
