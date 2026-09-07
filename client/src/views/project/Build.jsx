import React, { useEffect, useMemo, useState } from 'react';
import { useRoute, useToast, Badge, Spinner, Modal, ModalHead } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';
import { PipelineView } from '../Builder.jsx';

const CATS = [
  ['general', 'Web app'], ['crm', 'CRM'], ['saas', 'SaaS'], ['ecommerce', 'Ecommerce'], ['blog', 'Blog'],
  ['dashboard', 'Dashboard'], ['ai_app', 'AI app'], ['chatbot', 'Chatbot'], ['marketplace', 'Marketplace'],
  ['social', 'Social / forum'], ['forum', 'Forum'], ['education', 'Education'], ['healthcare', 'Healthcare'],
  ['finance', 'Finance'], ['erp', 'ERP'], ['booking', 'Booking'], ['portfolio', 'Portfolio'], ['landing', 'Landing'],
  ['devtools', 'Developer tools'], ['news', 'News'], ['analytics', 'Analytics'],
];
const FEATS = [
  ['auth', 'Accounts'], ['google_auth', 'Google sign-in'], ['payments', 'Payments'], ['ai_chat', 'AI chat'],
  ['search', 'Search'], ['uploads', 'Uploads'], ['charts', 'Charts'], ['comments', 'Comments'],
  ['notifications', 'Notifications'], ['email', 'Mail forms'], ['roles', 'Roles'], ['export', 'CSV export'],
];
const ENT = ['leads', 'customers', 'products', 'posts', 'items', 'projects', 'documents', 'employees', 'orders', 'invoices', 'articles', 'threads', 'courses', 'patients', 'appointments', 'events', 'features', 'tasks', 'records', 'subscribers', 'messages', 'plans', 'categories', 'bookings', 'budgets', 'transactions', 'enrollments', 'lessons', 'deals', 'contacts', 'cases', 'tickets', 'inventory', 'suppliers', 'departments', 'projects_portfolio', 'clients', 'reviews', 'listings'];

export function BuildTab() {
  const { id, data, refresh } = useProject();
  const route = useRoute();
  const toast = useToast();
  const pendingChange = route.query.change || '';
  const [changeReq, setChangeReq] = useState(pendingChange ? decodeURIComponent(pendingChange) : '');
  const [changePlan, setChangePlan] = useState(null);
  const [changeBusy, setChangeBusy] = useState(false);
  const [mode, setMode] = useState('spec'); // spec | pipeline | tasks
  const spec = data?.spec;
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [category, setCategory] = useState('');
  const [entity, setEntity] = useState('');
  const [features, setFeatures] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmBuild, setConfirmBuild] = useState(false);
  const [lastHealth, setLastHealth] = useState(null);
  useEffect(() => {
    if (spec) { setName(spec.name); setTagline(spec.tagline || ''); setCategory(spec.category || ''); setEntity((spec.tables || []).find((t) => t.main)?.table || ''); setFeatures(spec.features || []); }
  }, [spec && spec._stripped ? 'x' : 'y']);
  useEffect(() => {
    api('/projects/' + id + '/quality').then((q) => setLastHealth(q.health)).catch(() => { });
  }, []);
  const saveSpec = async (silent) => {
    const body = { name, tagline, category, entity: entity || null, features, seed: true };
    try { await api('/projects/' + id + '/spec', { body: { spec: body } }); if (!silent) toast('Spec saved — this is now the source of truth', 'ok'); refresh(true); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
  };
  const build = async (full) => {
    setBusy(true);
    try {
      if (!(await saveSpec(true))) return;
      await api('/projects/' + id + '/build', { body: { spec: { name, tagline, category, entity, features }, mode: full ? 'full' : 'full' } });
      toast('Pipeline started — watch tasks update live', 'ok');
      setConfirmBuild(false);
      refresh(true);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const cancel = async () => { try { await api('/projects/' + id + '/build/cancel', { body: {} }); toast('Cancelling…', 'ok'); } catch (e) { toast(e.message, 'error'); } };
  const steps = data?.pipeline?.steps || [];
  const running = steps.some((s) => s.status === 'running');
  const allDone = steps.length && steps.every((s) => ['completed', 'failed', 'skipped', 'blocked', 'waiting'].includes(s.status));
  const entityOptions = useMemo(() => {
    const set = new Set(ENT);
    (spec?.tables || []).forEach((t) => set.add(t.table));
    return [...set];
  }, [spec]);
  if (!data) return null;
  return (
    <div className="page" style={{ maxWidth: 1050 }}>
      <div className="page-head row-between">
        <div><h1>Build pipeline</h1><div className="sub">Editing the spec below updates the source of truth; rebuilding regenerates affected files, runs the app, executes tests, scans and documents it — in order, for real.</div></div>
        <div className="row">
          {running ? <button className="btn ghost" onClick={cancel}>Cancel build</button> : null}
          <button className="btn primary lg" onClick={() => setConfirmBuild(true)} disabled={busy || running}>{busy ? <Spinner /> : (running ? 'Building…' : '▶ Run pipeline (build)')}</button>
        </div>
      </div>
      {running && <div className="row" style={{ marginBottom: 14 }}><Spinner /><span className="small muted">Pipeline executing — each step updates live below.</span></div>}
      {changeReq && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'color-mix(in srgb, var(--gold) 45%, var(--line))', background: 'color-mix(in srgb, var(--gold) 6%, var(--panel))' }}>
          <div className="row-between">
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 17 }}>🧩</span>
              <div><b style={{ fontSize: 14 }}>Natural-language change</b>
                <div className="small muted">“{changeReq}”</div></div>
            </div>
            <button className="btn sm" onClick={() => { setChangeReq(''); setChangePlan(null); }}>✕ clear</button>
          </div>
          {changePlan ? (
            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ lineHeight: 1.7 }}>
                {changePlan.changed ? (
                  <>NOIR mapped this request to a spec change: {changePlan.added.length ? <b style={{ color: 'var(--ok)' }}>add {changePlan.added.join(', ')}</b> : null} {changePlan.removed.length ? <b style={{ color: 'var(--err)' }}>remove {changePlan.removed.join(', ')}</b> : null}.</>
                ) : <span style={{ color: 'var(--warn)' }}>{changePlan.note}</span>}
              </div>
              {changePlan.changed ? (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn primary" disabled={running || building} onClick={async () => { setChangeBusy(true); try { await api('/projects/' + id + '/build', { body: { mode: 'full' } }); toast('Pipeline running with the change applied — safety checkpoint taken first', 'ok'); setChangeReq(''); setChangePlan(null); refresh(true); } catch (e) { toast(e.message, 'error'); } setChangeBusy(false); }}>
                    {changeBusy ? <Spinner /> : '✓ Apply & rebuild'}
                  </button>
                  <span className="tiny faint" style={{ alignSelf: 'center' }}>NOIR snapshots a checkpoint before rebuilding; manual files you added are preserved.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" disabled={changeBusy} onClick={async () => {
                setChangeBusy(true);
                try { const plan = await api('/projects/' + id + '/change', { body: { prompt: changeReq } }); setChangePlan(plan); if (!plan.changed) toast(plan.note, 'error'); }
                catch (e) { toast(e.message, 'error'); }
                setChangeBusy(false);
              }}>{changeBusy ? <Spinner /> : 'Review this change'}</button>
              <span className="tiny faint" style={{ alignSelf: 'center' }}>NOIR maps the request to spec features (payments, search, comments, auth…). Unknown requests keep the spec untouched — no blind rewrites.</span>
            </div>
          )}
        </div>
      )}

      {/* spec editor */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row-between"><h3 style={{ fontSize: 15 }}>Specification <span className="badge gold">source of truth</span></h3><button className="btn sm ghost" onClick={() => saveSpec(false)}>Save spec</button></div>
        <div className="grid cols-2">
          <div><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label>Category</label><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div style={{ gridColumn: '1 / -1' }}><label>Tagline</label><input value={tagline} onChange={(e) => setTagline(e.target.value)} /></div>
          <div><label>Main entity (data you manage)</label><select value={entity} onChange={(e) => setEntity(e.target.value)}>{entityOptions.map((e) => <option key={e} value={e}>{e}</option>)}</select></div>
          <div><label>Tables in current spec</label><div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{(spec?.tables || []).map((t) => <span key={t.table} className="chip">{t.table}{t.main ? ' ★' : ''}</span>)}</div></div>
        </div>
        <label style={{ marginTop: 10 }}>Features</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FEATS.map(([k, l]) => {
            const on = features.includes(k);
            return <button key={k} type="button" className={'chip cursor-pointer' + (on ? ' gold' : '')} style={{ padding: '4px 10px' }} onClick={() => setFeatures(on ? features.filter((f) => f !== k) : [...features, k])}>{on ? '✓ ' : ''}{l}</button>;
          })}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>Changing the spec and rebuilding regenerates the affected layers — NOIR preserves your manual file edits where they don't conflict (checkpoint before rebuild for safety).</div>
      </div>

      {/* pipeline status */}
      <div className="section-title">Pipeline status</div>
      {steps.length ? <PipelineView pipeline={{ steps }} /> : <div className="card muted small">No pipeline run yet — press Run pipeline above.</div>}
      <div className="section-title">Last pipeline steps (re-run individually)</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {steps.filter((s) => s.taskIds && s.taskIds.length).map((s) => (
          <button key={s.step} className={'chip cursor-pointer'} style={{ padding: '5px 10px' }} disabled={running} onClick={async () => { try { const r = await api('/projects/' + id + '/rerun', { body: { step: s.step } }); toast('Re-queued ' + s.label + (r && r.queued ? ' — ' + r.queued.length + ' task(s)' : ''), 'ok'); } catch (e) { toast(e.message, 'error'); } }}>
            ↻ {s.label} <Badge tone={s.status === 'completed' ? 'ok' : s.status === 'failed' ? 'err' : 'muted'}>{s.status}</Badge>
          </button>
        ))}
      </div>
      {lastHealth ? <div className="tiny faint" style={{ marginTop: 8 }}>health after last run: <b>{lastHealth.overall}</b>/100</div> : null}

      {confirmBuild && (
        <Modal onClose={() => setConfirmBuild(false)}>
          <ModalHead title="Run the full pipeline?" onClose={() => setConfirmBuild(false)} sub="Analyze → Plan → Generate → Run → Test → Security → Health → Docs → Checkpoint" />
          <div className="small muted" style={{ lineHeight: 1.8 }}>
            · Spec is saved first (source of truth).<br />
            · A checkpoint is created before regeneration when a build exists, so the previous working state is always restorable.<br />
            · All steps execute in the sandbox with real output.
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setConfirmBuild(false)}>Cancel</button>
            <button className="btn primary" onClick={() => build(true)}>Start pipeline</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
