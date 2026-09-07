import React, { useEffect, useState } from 'react';
import { useToast, Badge, Modal, ModalHead, Spinner, Empty } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function DatabaseTab() {
  const { id } = useProject();
  const toast = useToast();
  const [db, setDb] = useState(null);
  const [table, setTable] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [view, setView] = useState('tables'); // tables | diagram
  const load = async (silent) => {
    if (!silent) setBusy(true);
    try { setDb(await api('/projects/' + id + '/database' + (table ? '?table=' + encodeURIComponent(table) : ''))); }
    catch (e) { toast(e.message, 'error'); }
    if (!silent) setBusy(false);
  };
  useEffect(() => { load(true); }, [table]);
  const s = db?.summary;
  const tables = s?.tables || [];
  const livePg = s?.backend === 'postgresql';
  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head row-between">
        <div><h1>Database</h1><div className="sub">Live view of the generated database — rows read from the actual store ({s ? s.backend : '…'} backend).</div></div>
        <div className="row">
          <div className="seg" style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <button className={'btn sm ' + (view === 'tables' ? 'primary' : 'ghost')} style={{ borderRadius: 0 }} onClick={() => setView('tables')}>Tables</button>
            <button className={'btn sm ' + (view === 'diagram' ? 'primary' : 'ghost')} style={{ borderRadius: 0 }} onClick={() => setView('diagram')}>Diagram</button>
          </div>
          <button className="btn ghost" onClick={() => setCreateOpen(true)}>＋ Create database</button>
          <button className="btn ghost" onClick={() => setMigrateOpen(true)}>Run migration</button>
          <button className="btn primary" onClick={() => load()}>{busy ? <Spinner /> : '↻ Refresh'}</button>
        </div>
      </div>
      {!db ? <div className="center-load"><Spinner /> Reading schema…</div> : (
        <>
          {livePg && (
            <div style={{ marginBottom: 12 }}>
              <Badge tone={s.live ? 'ok' : 'err'}>{s.live ? 'PostgreSQL connected — live' : 'PostgreSQL unreachable'}</Badge>
              {s.error ? <span className="small" style={{ color: 'var(--err)', marginLeft: 8 }}>{s.error}</span> : null}
            </div>
          )}
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div className="card"><div className="tiny faint">Backend</div><b>{s.backend || '—'}</b>{!livePg ? <div className="tiny faint">local JSON store in the sandbox · switch by setting DATABASE_URL in Env</div> : null}</div>
            <div className="card"><div className="tiny faint">Tables</div><b>{tables.length}</b></div>
            <div className="card"><div className="tiny faint">Total rows</div><b>{tables.reduce((m, t) => m + (t.rows || t.count || 0), 0)}</b></div>
          </div>
          {tables.length ? (
            <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <button className={'btn sm ' + (!table ? 'primary' : 'ghost')} onClick={() => setTable('')}>all tables</button>
              {tables.map((t) => <button key={t.table} className={'btn sm ' + (table === t.table ? 'primary' : 'ghost')} onClick={() => setTable(t.table)}>{t.label || t.table} <span className="faint">({t.rows ?? t.count ?? '?'})</span></button>)}
            </div>
          ) : null}
          {view === 'diagram' && tables.length ? <Diagram tables={tables} /> : <InspectView inspect={db.inspect} />}
        </>
      )}
      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); load(); }} />}
      {migrateOpen && <MigrateModal onClose={() => setMigrateOpen(false)} onDone={() => { setMigrateOpen(false); load(); }} />}
    </div>
  );
}

function InspectView({ inspect }) {
  if (!inspect) return null;
  if (inspect.error) return <div className="card"><div className="small" style={{ color: 'var(--warn)' }}>{inspect.error}</div></div>;
  const tables = inspect.tables || [];
  if (!tables.length) return <Empty icon="🗄️" title="No tables to show">Start the app once so the store file is created, then refresh.</Empty>;
  return (
    <div className="col" style={{ gap: 14 }}>
      {tables.map((t) => {
        const rows = t.rows || [];
        const cols = t.columns ? t.columns.map((c) => (typeof c === 'string' ? c : c.key)) : (rows[0] ? Object.keys(rows[0]) : []);
        return (
          <div key={t.table} className="card" style={{ padding: 10 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <b className="mono">{t.table}</b>
              <span className="tiny faint">· {t.label || ''}</span>
              <Badge>{t.count} rows</Badge>
              <span className="flex1" />
              {!t.error && <span className="tiny faint">showing {rows.length} of {t.count}</span>}
            </div>
            {t.error ? <div className="small" style={{ color: 'var(--err)' }}>{t.error}</div> : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={Math.max(1, cols.length)} className="muted small">no rows</td></tr> : rows.map((r, i) => (
                      <tr key={i}>{cols.map((c) => <td key={c} className="mono tiny">{String(r[c] ?? '').slice(0, 90)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreateModal({ onClose, onDone }) {
  const { id } = useProject();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose}>
      <ModalHead title="Create the project database" onClose={onClose} sub="Tables + seed data are created from the generated schema." />
      <div className="small muted" style={{ lineHeight: 1.7 }}>
        · If <code>DATABASE_URL</code> is set in <b>Env</b>, NOIR applies <code>db/schema.sql</code> through a real PostgreSQL connection.<br />
        · Otherwise NOIR prepares the local JSON store — the app creates <code>data/store.json</code> on boot and seeds sample data.<br />
        · The operation is recorded in the audit log. Nothing is simulated.
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const r = await api('/projects/' + id + '/database/create', { body: { args: {} } }); toast(r.error ? r.error : 'Database ready: ' + r.backend + (r.applied ? ' (migration applied)' : ''), r.error ? 'error' : 'ok'); onDone(); }
          catch (e) { toast(e.message, 'error'); }
          setBusy(false);
        }}>{busy ? <Spinner /> : 'Create'}</button>
      </div>
    </Modal>
  );
}
function MigrateModal({ onClose, onDone }) {
  const { id } = useProject();
  const toast = useToast();
  const [sql, setSql] = useState('-- e.g. ALTER TABLE leads ADD COLUMN source TEXT;');
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} wide>
      <ModalHead title="Run a migration" onClose={onClose} sub="High-risk — executes SQL for real. Recorded in the audit log." />
      <div className="badge warn" style={{ display: 'flex' }}>Wrong SQL can lose data. Create a checkpoint first (Git tab) to be able to roll back.</div>
      <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={5} style={{ marginTop: 10 }} className="mono" spellCheck={false} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn danger" disabled={busy} onClick={async () => {
          if (!confirm('Execute this SQL against the project database?')) return;
          setBusy(true);
          try { const r = await api('/projects/' + id + '/database/migrate', { body: { sql } }); toast(r.message || 'Migration executed', 'ok'); onDone(); }
          catch (e) { toast(e.message, 'error'); }
          setBusy(false);
        }}>{busy ? <Spinner /> : 'Execute migration'}</button>
      </div>
    </Modal>
  );
}

// ---- visual relationship diagram (Phase 17) ----
// Relations are inferred from "<table>_id" column naming in the real schema —
// the generated file model stores references by convention. Honest about that.
const TYPE_ICON = { id: '🔑', email: '✉️', text: '🅃', multiline: '☰', number: '#', date: '📅', boolean: '☑' };
export function Diagram({ tables }) {
  const byName = Object.fromEntries(tables.map((t) => [t.table, t]));
  // Resolve a "<ref>_id" column to a real table, tolerating plural names
  // ("user_id" → table "users", "category_id" → "categories", …).
  const resolveTable = (stem) => {
    if (byName[stem]) return stem;
    const cands = [stem + 's', stem.replace(/y$/, 'ies'), stem + 'es', stem.replace(/s$/, ''), stem.replace(/ies$/, 'y'), stem.replace(/es$/, '')];
    for (const c of cands) if (byName[c]) return c;
    return null;
  };
  const edges = [];
  for (const t of tables) {
    for (const c of t.columns || []) {
      const m = /^(.+)_id$/.exec(c.key || '');
      if (!m) continue;
      const to = resolveTable(m[1]);
      if (!to || to === t.table) continue;
      if (!edges.some((e) => e.from === t.table && e.to === to)) edges.push({ from: t.table, to, via: c.key });
    }
  }
  const refsOf = (name) => edges.filter((e) => e.from === name).map((e) => e.to);
  const memo = {};
  const depthOf = (name, seen = {}) => {
    if (memo[name] != null) return memo[name];
    if (seen[name]) return 0;
    seen[name] = 1;
    const refs = refsOf(name);
    memo[name] = refs.length ? 1 + Math.max(0, ...refs.map((r) => depthOf(r, { ...seen }))) : 0;
    return memo[name];
  };
  const cols = [];
  for (const t of tables) { const d = depthOf(t.table); if (!cols[d]) cols[d] = []; cols[d].push(t.table); }
  const W = 236, GX = 110, GY = 16, PAD = 24;
  const cardH = (t) => 48 + (t.columns || []).length * 21;
  const pos = {}; // name -> {x,y,h}
  for (let d = 0; d < cols.length; d++) {
    let y = PAD;
    for (const name of cols[d]) { pos[name] = { x: PAD + d * (W + GX), y, h: cardH(byName[name]) }; y += cardH(byName[name]) + GY; }
  }
  const totalW = PAD * 2 + cols.length * W + (cols.length - 1) * GX;
  const totalH = PAD * 2 + Math.max(0, ...Object.values(pos).map((p) => p.y + p.h - PAD)) + PAD;
  const [hover, setHover] = React.useState(null);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <b style={{ fontSize: 13.5 }}>Relationship diagram</b>
        <div className="tiny faint" style={{ marginTop: 2 }}>Inferred from <span className="mono">*_id</span> column naming in the real schema (the generated model stores references by convention (singular/plural names are matched — declare SQL foreign keys for full PostgreSQL constraints). Hover a table to highlight its relations. Arrow = “references”.</div>
      </div>
      <div style={{ position: 'relative', overflow: 'auto' }}>
        <svg width={totalW} height={totalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            if (!a || !b) return null;
            const x1 = a.x, y1 = a.y + a.h / 2;
            const x2 = b.x + W, y2 = b.y + b.h / 2;
            const lit = hover === e.from || hover === e.to;
            const color = lit ? 'var(--gold)' : 'var(--faint)';
            return (
              <g key={i} opacity={lit ? 1 : 0.85}>
                <path d={'M ' + x1 + ' ' + y1 + ' C ' + (x1 - 46) + ' ' + y1 + ', ' + (x2 + 46) + ' ' + y2 + ', ' + x2 + ' ' + y2} fill="none" stroke={color} strokeWidth={lit ? 2 : 1.2} strokeDasharray={lit ? '' : '3 3'} markerEnd={'url(#arr' + (lit ? 'l' : '') + ')'}>
                  <title>{e.from}.{e.via} → {e.to}.id</title>
                </path>
                <circle cx={x1} cy={y1} r={2.4} fill={color} />
              </g>
            );
          })}
          <defs>
            <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="var(--faint)" /></marker>
            <marker id="arrl" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="var(--gold)" /></marker>
          </defs>
        </svg>
        {Object.entries(pos).map(([name, p]) => {
          const t = byName[name];
          return (
            <div key={name}
              onMouseEnter={() => setHover(name)} onMouseLeave={() => setHover(null)}
              style={{ position: 'absolute', left: p.x, top: p.y, width: W, borderRadius: 10, border: hover === name ? '1px solid var(--gold)' : '1px solid var(--line)', background: 'var(--card)', boxShadow: '0 4px 14px rgba(0,0,0,.25)', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', background: 'color-mix(in srgb, var(--accent-soft, var(--bg-2)) 30%, var(--card))', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 12.5 }}>
                {t.label || name} <span className="tiny faint mono">· {t.table}</span> <span className="tiny faint" style={{ float: 'right' }}>{t.rows ?? t.count ?? 0} rows</span>
              </div>
              <div style={{ padding: '4px 0' }}>
                {(t.columns || []).map((c) => (
                  <div key={c.key} className="row" style={{ padding: '1px 10px', gap: 7 }} title={c.label}>
                    <span style={{ fontSize: 11 }}>{TYPE_ICON[c.type] || '·'}</span>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: /_id$/.test(c.key) ? 700 : 400, color: /_id$/.test(c.key) ? 'var(--gold)' : undefined }}>{c.key}</span>
                    {/_id$/.test(c.key) ? (() => { const tgt = resolveTable(c.key.replace(/_id$/, '')); return tgt ? <span className="tiny faint" style={{ marginLeft: 'auto' }}>→ {tgt}</span> : <span className="tiny faint" style={{ marginLeft: 'auto' }}>{c.type}</span>; })() : <span className="tiny faint" style={{ marginLeft: 'auto' }}>{c.type}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
