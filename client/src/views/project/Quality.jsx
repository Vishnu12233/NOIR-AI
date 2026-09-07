import React, { useEffect, useState } from 'react';
import { useToast, Badge, Spinner, Empty, Seg } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function QualityTab() {
  const { id } = useProject();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sev, setSev] = useState('all');
  const [group, setGroup] = useState('all');
  const load = async (silent) => {
    if (!silent) setBusy(true);
    try { setQ(await api('/projects/' + id + '/quality')); } catch (e) { toast(e.message, 'error'); }
    if (!silent) setBusy(false);
  };
  useEffect(() => { load(true); }, []);
  const CATS = [
    ['Security', 'Security'], ['Performance', 'Performance'], ['Accessibility', 'Accessibility'],
    ['SEO', 'SEO'], ['Testing', 'Testing'], ['Runtime & Deployment', 'Runtime & Deployment'],
  ];
  if (!q) return <div className="center-load" style={{ minHeight: 300 }}><Spinner /> Running scans…</div>;
  const groups = [
    ['Security', 'Security', q.security.issues || []],
    ['Performance', 'Performance', q.performance.findings || q.performance.issues || []],
    ['Accessibility', 'Accessibility', q.accessibility.issues || []],
    ['SEO', 'SEO', q.seo.issues || []],
  ];
  const all = groups.flatMap(([k, l, issues]) => issues.map((i) => ({ ...i, cat: l })));
  const filtered = all.filter((i) => (sev === 'all' || (i.severity || 'low') === sev) && (group === 'all' || i.cat === group));
  const h = q.health;
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head row-between">
        <div><h1>Project health</h1><div className="sub">Scans re-run against the live code on every visit — score is {h.overall}/100.</div></div>
        <button className="btn primary lg" onClick={() => load()} disabled={busy}>{busy ? <Spinner /> : '↻ Re-run scans'}</button>
      </div>
      <div className="card hero-grad" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 118, height: 118, flex: 'none' }}>
          <svg viewBox="0 0 120 120" width={118} height={118}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" strokeWidth="10" />
            <circle cx="60" cy="60" r="52" fill="none" stroke={h.overall >= 80 ? 'var(--ok)' : h.overall >= 60 ? 'var(--warn)' : 'var(--err)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - h.overall / 100)} transform="rotate(-90 60 60)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><span className="stat-num" style={{ fontSize: 30 }}>{h.overall}</span></div>
        </div>
        <div className="flex1">
          <div className="grid cols-3" style={{ gap: 8 }}>
            {CATS.map(([label, key]) => {
              const c = h.categories[key] || { score: '—', issues: 0 };
              const tone = c.score >= 80 ? 'ok' : c.score >= 60 ? 'warn' : 'err';
              return <div key={key} className="card tight"><div className="tiny faint">{label}</div><div className="row" style={{ alignItems: 'baseline' }}><b style={{ fontSize: 19, color: 'var(--' + tone + ')' }}>{c.score ?? '—'}</b><span className="tiny faint" style={{ marginLeft: 6 }}>{c.issues ?? ''} issue(s)</span></div></div>;
            })}
          </div>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Seg options={[{ value: 'all', label: 'All severities' }, { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} value={sev} onChange={setSev} />
        <Seg options={[{ value: 'all', label: 'All categories' }, ...groups.map(([k, l]) => ({ value: l, label: l }))]} value={group} onChange={setGroup} />
        <span className="flex1" />
        <button className="btn ghost sm" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(q, null, 2)], { type: 'application/json' })); a.download = 'noir-quality.json'; a.click(); }}>Export JSON</button>
      </div>
      {filtered.length === 0 ? <Empty icon="🛡️" title="No findings in this view">{group === 'all' && sev === 'all' ? 'Clean scan — real measurements, no findings.' : 'Nothing matches the current filter.'}</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Severity</th><th>Category</th><th>Location</th><th>Finding</th><th>Remediation</th></tr></thead>
            <tbody>
              {filtered.map((i, idx) => (
                <tr key={idx}>
                  <td><Badge tone={i.severity === 'critical' || i.severity === 'high' ? 'err' : i.severity === 'medium' ? 'warn' : 'muted'}>{i.severity || 'info'}</Badge></td>
                  <td className="tiny">{i.cat}</td>
                  <td className="mono tiny">{i.file}{i.line ? ':' + i.line : ''}</td>
                  <td className="small" style={{ maxWidth: 320 }}>{i.detail}</td>
                  <td className="tiny muted" style={{ maxWidth: 260 }}>{i.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
