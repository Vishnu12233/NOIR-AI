// Create with NOIR — analyze a requirement, review/edit the spec, build.
import React, { useEffect, useMemo, useState } from 'react';
import { useRoute, Link, useAuth, Modal, ModalHead, Empty, Spinner, Badge, useToast } from '../lib/ui.jsx';
import { api } from '../lib/api.js';

const CATS = [
  { key: 'general', label: 'Web app', icon: '🌐' },
  { key: 'crm', label: 'CRM', icon: '🤝' },
  { key: 'saas', label: 'SaaS', icon: '📊' },
  { key: 'ecommerce', label: 'Ecommerce', icon: '🛍️' },
  { key: 'blog', label: 'Blog / news', icon: '📝' },
  { key: 'dashboard', label: 'Dashboard', icon: '📈' },
  { key: 'ai_app', label: 'AI app', icon: '🤖' },
  { key: 'marketplace', label: 'Marketplace', icon: '🏪' },
  { key: 'social', label: 'Social / forum', icon: '👥' },
  { key: 'education', label: 'Education', icon: '🎓' },
  { key: 'healthcare', label: 'Healthcare', icon: '🩺' },
  { key: 'finance', label: 'Finance', icon: '💰' },
  { key: 'erp', label: 'ERP', icon: '🏭' },
  { key: 'booking', label: 'Booking', icon: '📅' },
  { key: 'portfolio', label: 'Portfolio', icon: '✨' },
  { key: 'landing', label: 'Landing page', icon: '🚀' },
];
const FEATS = [
  { key: 'auth', label: 'Accounts (email + password)', icon: '🔐', help: 'Signup, login, sessions, password hashing' },
  { key: 'google_auth', label: 'Google sign-in', icon: '🅶', help: 'Requires OAuth client credentials at runtime' },
  { key: 'payments', label: 'Payments / checkout', icon: '💳', help: 'Checkout flow; real charges need a payment provider key' },
  { key: 'ai_chat', label: 'AI assistant chat', icon: '✨', help: 'Chat UI; model calls need an AI provider key' },
  { key: 'search', label: 'Search & filters', icon: '🔎' },
  { key: 'uploads', label: 'File uploads', icon: '📎', help: 'Stored on the app sandbox disk' },
  { key: 'charts', label: 'Charts & analytics', icon: '📉' },
  { key: 'comments', label: 'Comments', icon: '💬' },
  { key: 'notifications', label: 'Notifications', icon: '🔔', help: 'Requires accounts' },
  { key: 'email', label: 'Contact / mail forms', icon: '✉️' },
  { key: 'roles', label: 'Roles & permissions', icon: '🛡️', help: 'Admin area — requires accounts' },
  { key: 'export', label: 'CSV export', icon: '⬇️' },
];
const ENTITIES = [
  ['leads', 'Leads'], ['customers', 'Customers'], ['products', 'Products'], ['posts', 'Posts'], ['items', 'Items'], ['projects', 'Projects'], ['documents', 'Documents'], ['employees', 'Employees'], ['orders', 'Orders'], ['invoices', 'Invoices'], ['articles', 'Articles'], ['threads', 'Threads'], ['courses', 'Courses'], ['patients', 'Patients'], ['appointments', 'Appointments'], ['events', 'Events'], ['features', 'Features'], ['tasks', 'Tasks'], ['records', 'Records'], ['subscribers', 'Subscribers'],
];
const TPL = {
  saas: { icon: '📊', name: 'SaaS' }, 'ai-app': { icon: '🤖', name: 'AI Application' }, dashboard: { icon: '📈', name: 'Dashboard' },
  ecommerce: { icon: '🛍️', name: 'Ecommerce' }, crm: { icon: '🤝', name: 'CRM' }, erp: { icon: '🏭', name: 'ERP' },
  portfolio: { icon: '✨', name: 'Portfolio' }, blog: { icon: '📝', name: 'Blog' }, education: { icon: '🎓', name: 'Education' },
  healthcare: { icon: '🩺', name: 'Healthcare' }, finance: { icon: '💰', name: 'Finance' }, marketplace: { icon: '🏪', name: 'Marketplace' },
  social: { icon: '👥', name: 'Social Network' }, 'developer-tools': { icon: '🧰', name: 'Developer Tools' }, landing: { icon: '🚀', name: 'Landing Page' },
};
const STEP = ['Describe', 'Review spec', 'Build'];

export function Builder() {
  const route = useRoute();
  const toast = useToast();
  const { user } = useAuth();
  const seedPrompt = route.query.prompt || '';
  const [template, setTemplate] = useState(route.query.template || '');
  // Template prefill from the URL (?template=… or ?prompt=…): seed the prompt + name so
  // "Analyze" works in one click — no copy-paste, no crash on an undefined template key.
  useEffect(() => {
    if (seedPrompt) { setName(titleFromPrompt(seedPrompt)); return; }
    if (route.query.template) {
      api('/templates').then((d) => {
        const t = d.templates.find((x) => x.key === route.query.template);
        if (t) {
          setPrompt(t.prompt || 'Build a complete ' + t.name + ' application (' + (t.tag || '') + ') with working features, seed data and a polished UI.');
          setName(t.name + ' starter');
        }
      }).catch(() => {});
    }
  }, []);
  const [stepIdx, setStepIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [project, setProject] = useState(null);      // created project
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState(seedPrompt);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [spec, setSpec] = useState(null);            // editable structure
  const [templates, setTemplates] = useState([]);
  const [building, setBuilding] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [pipeline, setPipeline] = useState(null);

  useEffect(() => {
    if (!user) { window.location.hash = '#/signup'; return; }
    api('/templates').then((d) => setTemplates(d.templates)).catch(() => { });
  }, [user]);

  // step 0: create project + analyze
  const startAnalyze = async (ev) => {
    ev && ev.preventDefault();
    if (!prompt.trim()) return toast('Describe what you want to build first.', 'error');
    setAnalyzing(true);
    try {
      if (!project) {
        const d = await api('/projects', { body: { name: template && !seedPrompt ? tplName(template) + (name && name !== tplName(template) ? ' ' + name : '') : name || titleFromPrompt(prompt), description: prompt, source: 'builder', template_key: template || null } });
        setProject(d.project); setName(d.project.name);
      }
      const a = await api('/projects/' + project.id + '/analyze', { body: { prompt } });
      setAnalysis(a.analysis);
      // prefill spec editable from analysis
      setSpec({
        name: project.name,
        tagline: prompt.slice(0, 140),
        category: a.analysis.category,
        entity: a.analysis.entity || '',
        features: a.analysis.features || [],
        seed: true, light: false, template_key: template || null,
      });
      setStepIdx(1);
    } catch (e) { toast(e.message, 'error'); }
    setAnalyzing(false);
  };

  const useTemplate = (t) => {
    if (confirm('Build a "' + t.name + '" starter? NOIR will analyze it and you can review the spec before generating.')) {
      setPrompt(t.prompt || t.name + ' — build a complete starter ' + t.name + ' application with working features and sample data.');
      setName(tplName(t.key));
      setTemplate(t.key);
    }
  };
  const tplName = (k) => (TPL[k] ? TPL[k].name + ' starter' : 'NOIR app');
  const titleFromPrompt = (p) => {
    const m = String(p).match(/(?:a|an|the)?\s*([A-Z][a-z]{2,20})/);
    return m ? m[1] + ' App' : 'My NOIR app';
  };

  // step 1: save spec (server compiles to source of truth)
  const saveSpec = async () => {
    if (!spec.name || !spec.name.trim()) return toast('Give the project a name.', 'error');
    try {
      const d = await api('/projects/' + project.id + '/spec', { body: { spec } });
      toast('Spec saved — it is now the source of truth for this project', 'ok');
      return d.spec;
    } catch (e) { toast(e.message, 'error'); }
    return null;
  };

  // step 2: run pipeline
  const runBuild = async () => {
    setBuilding(true);
    try {
      await saveSpec();
      await api('/projects/' + project.id + '/build', { body: { spec, mode: 'full' } });
      setStepIdx(2);
      pollTasks();
    } catch (e) { toast(e.message, 'error'); setBuilding(false); }
  };
  const pollTasks = async () => {
    try {
      const d = await api('/projects/' + project.id);
      setTasks(d.tasks); setPipeline(d.pipeline);
    } catch { /* noop */ }
  };
  useEffect(() => {
    if (!project || !building) return;
    const t = setInterval(pollTasks, 1800);
    return () => clearInterval(t);
  }, [project, building]);
  useEffect(() => {
    if (!project || stepIdx < 2) return;
    const t = setInterval(pollTasks, 2500);
    pollTasks();
    return () => clearInterval(t);
  }, [project, stepIdx]);
  const doneAll = tasks.length && tasks.every((t) => ['completed', 'failed', 'blocked', 'cancelled'].includes(t.status));
  const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked');

  if (!user) return null;
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <h1>Create with NOIR</h1>
        <div className="sub">Describe an idea — NOIR plans, builds, runs and tests it. You review every step.</div>
      </div>
      <div className="row" style={{ marginBottom: 20, gap: 0 }}>
        {STEP.map((s, i) => (
          <div key={s} className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className={'badge ' + (i <= stepIdx ? 'gold' : '')} style={{ borderRadius: 99, width: 22, height: 22, justifyContent: 'center', padding: 0 }}>{i < stepIdx ? '✓' : i + 1}</span>
            <span style={{ fontSize: 13, fontWeight: i === stepIdx ? 700 : 500, color: i <= stepIdx ? 'var(--text)' : 'var(--faint)' }}>{s}</span>
            {i < 2 ? <span style={{ color: 'var(--faint)', margin: '0 12px' }}>—</span> : null}
          </div>
        ))}
      </div>

      {stepIdx === 0 && (
        <>
          <div className="card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 16 }}>What should we build?</h3>
            <form onSubmit={startAnalyze} style={{ marginTop: 8 }}>
              <textarea
                autoFocus
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={'Example: "A small CRM for our sales team — track leads, move them through a pipeline board, attach notes, and search. Accounts with email login."'}
                style={{ fontSize: 14.5 }}
              />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary lg" disabled={analyzing}>{analyzing ? <Spinner /> : 'Analyze requirements'}</button>
                <span className="hint mb0" style={{ alignSelf: 'center' }}>NOIR extracts users, features, pages, schema and assumptions.</span>
              </div>
            </form>
          </div>
          <div className="section-title">Or start from a template — still fully reviewable</div>
          <div className="grid cols-3">
            {templates.map((t) => (
              <div key={t.key} className="card card-hover cursor-pointer" style={{ cursor: 'pointer' }} onClick={() => useTemplate(t)}>
                <div className="row-between"><span style={{ fontSize: 19 }}>{(TPL[t.key] || {}).icon}</span><Badge tone="muted">{t.tag}</Badge></div>
                <b style={{ fontSize: 13.5 }}>{t.name}</b>
                <div className="small muted" style={{ marginTop: 4 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {stepIdx === 1 && spec && (
        <>
          <SpecEditor
            project={project}
            spec={spec} setSpec={setSpec}
            analysis={analysis}
            onBack={() => setStepIdx(0)}
            onBuild={async () => { await runBuild(); }}
            building={building}
          />
        </>
      )}

      {stepIdx === 2 && project && (
        <BuildRun project={project} setStepIdx={setStepIdx} tasks={tasks} pipeline={pipeline} building={building} setBuilding={setBuilding} />
      )}
    </div>
  );
}

function SpecEditor({ project, spec, setSpec, analysis, onBack, onBuild, building }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const patch = (p) => setSpec({ ...spec, ...p });
  const toggleFeat = (k) => {
    const has = spec.features.includes(k);
    const list = has ? spec.features.filter((f) => f !== k) : [...spec.features, k];
    if (k === 'auth' && !has) { for (const dep of ['google_auth', 'notifications', 'roles']) if (list.includes(dep)) list.splice(list.indexOf(dep), 1); }
    patch({ features: list });
  };
  return (
    <>
      <div className="card" style={{ padding: 20 }}>
        <div className="row-between"><h3 style={{ fontSize: 16 }}>Analyzed requirements</h3><Link to={'/project/' + project.id} className="small">open project page</Link></div>
        {analysis ? <div className="small muted" style={{ marginTop: 6 }}>{analysis.assumptions && analysis.assumptions.map((a) => '· ' + a).join(' ')}</div> : null}
        <label>Project name</label>
        <input value={spec.name} onChange={(e) => patch({ name: e.target.value })} style={{ fontWeight: 650 }} />
        <label>Tagline (what it does)</label>
        <input value={spec.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div>
            <label>Kind of application</label>
            <select value={spec.category} onChange={(e) => patch({ category: e.target.value, entity: ENTITIES[0][0] })}>
              {CATS.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label>Main entity (the thing users manage)</label>
            <select value={spec.entity} onChange={(e) => patch({ entity: e.target.value })}>
              {ENTITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <label style={{ marginTop: 16 }}>Features <span className="faint">(review carefully — each becomes real code)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FEATS.map((f) => {
            const on = spec.features.includes(f.key);
            const locked = !spec.features.includes('auth') && ['google_auth', 'notifications', 'roles'].includes(f.key);
            return (
              <button type="button" key={f.key} className={'chip cursor-pointer' + (on ? ' gold' : '')} title={f.help} onClick={() => !locked && toggleFeat(f.key)} style={{ borderColor: on ? 'color-mix(in srgb, var(--gold) 60%, var(--line))' : undefined, background: on ? 'color-mix(in srgb, var(--gold) 10%, transparent)' : undefined, color: on ? 'var(--gold)' : 'var(--muted)', padding: '5px 11px' }}>
                {on ? '✓ ' : ''}{f.icon} {f.label}{locked ? ' 🔒' : ''}
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn ghost" onClick={onBack}>← Back to description</button>
          <div className="flex1" />
          <button className="btn primary lg" disabled={building || saving} onClick={async () => { setSaving(true); await onBuild(); setSaving(false); }}>{building ? <Spinner /> : 'Build this project →'}</button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>The build runs the full pipeline: analyze → plan → generate code → run → test → fix → security scan → health → docs → checkpoint. You will see every step execute.</div>
      </div>
    </>
  );
}

function BuildRun({ project, tasks, pipeline, building, setBuilding }) {
  const toast = useToast();
  const [live, setLive] = useState(tasks);
  useEffect(() => setLive(tasks), [tasks]);
  const done = live.length && live.every((t) => ['completed', 'failed', 'blocked', 'cancelled'].includes(t.status));
  const failed = live.filter((t) => t.status === 'failed' || t.status === 'blocked');
  const cancel = async () => { try { await api('/projects/' + project.id + '/build/cancel', { body: {} }); toast('Cancelling…'); setBuilding(false); } catch (e) { toast(e.message, 'error'); } };
  const rerunFailed = async () => { setBuilding(true); toast('Re-running failed task', 'ok'); try { const f = failed[0]; await api('/projects/' + project.id + '/rerun', { body: { step: stepOf(f) } }); } catch (e) { toast(e.message, 'error'); } };
  const stepOf = (t) => ({ analyze: 'analyze', plan: 'plan', generate: 'generate', install: 'install', run: 'run', test: 'test', fix: 'fix', security: 'security', health: 'health', docs: 'docs' }[t.kind]);
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="row">
          <h3 style={{ fontSize: 17 }}>{project.name}</h3>
          <Badge tone="gold">building</Badge>
        </div>
        <div className="row">
          {!done && <button className="btn ghost sm" onClick={cancel}>Cancel build</button>}
          {done && !failed.length && <Link to={'/project/' + project.id + '?tab=preview'} className="btn gold sm">Open workspace →</Link>}
          {done && failed.length > 0 && <button className="btn sm" onClick={rerunFailed}>Re-run failed step</button>}
        </div>
      </div>
      {pipeline && <PipelineView pipeline={pipeline} />}
      <div className="card" style={{ marginTop: 10, padding: 8 }}>
        {live.map((t) => (
          <div key={t.id} className="row" style={{ padding: '5px 6px', gap: 10, alignItems: 'flex-start' }}>
            <TaskIco status={t.status} />
            <div className="flex1">
              <div className="row-between"><b style={{ fontSize: 13 }}>{t.id} · {t.title}</b><span className="tiny faint">{t.agent}</span></div>
              {t.error ? <div className="tiny" style={{ color: 'var(--err)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{String(t.error).slice(0, 400)}</div> : null}
              {t.result && !t.error ? <details style={{ marginTop: 2 }}><summary className="tiny faint">result</summary><pre className="small" style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{String(t.result).slice(0, 700)}</pre></details> : null}
            </div>
          </div>
        ))}
      </div>
      {done && (
        <div className="card" style={{ marginTop: 14, borderColor: failed.length ? 'color-mix(in srgb, var(--err) 40%, var(--line))' : 'color-mix(in srgb, var(--ok) 40%, var(--line))' }}>
          {!failed.length ? (
            <>
              <b>✅ Pipeline finished — the app is running with tests green.</b>
              <div className="muted small" style={{ marginTop: 6 }}>Every file is real and editable: explore the file tree, run commands in the terminal, change code and rebuild, inspect the database, and run scans from the project workspace.</div>
            </>
          ) : (
            <>
              <b style={{ color: 'var(--err)' }}>⚠ The pipeline stopped with {failed.length} failed task(s).</b>
              <div className="muted small" style={{ marginTop: 6 }}>Open the project workspace — NOIR surfaces the real error with file/line info, and you can retry the failed step after fixing.</div>
            </>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <Link to={'/project/' + project.id} className="btn primary">Open project workspace</Link>
          </div>
        </div>
      )}
    </div>
  );
}
function TaskIco({ status }) {
  return <span style={{ fontSize: 14 }}>{status === 'completed' ? '✅' : status === 'running' ? <span className="spinner" style={{ width: 12, height: 12, marginTop: 3 }} /> : status === 'failed' || status === 'blocked' ? '❌' : status === 'cancelled' ? '⏹️' : '⏳'}</span>;
}
export function PipelineView({ pipeline }) {
  const ICON = { analyze: '🧠', plan: '🗺️', generate: '📦', install: '📥', run: '▶️', test: '🧪', fix: '🔧', security: '🛡️', health: '💚', docs: '📚', preview: '👀' };
  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {pipeline.steps.map((s) => (
          <div key={s.step} className="row" style={{ gap: 6, padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 8, background: s.status === 'completed' ? 'color-mix(in srgb, var(--ok) 8%, transparent)' : s.status === 'running' ? 'color-mix(in srgb, var(--gold) 12%, transparent)' : 'var(--panel)' }}>
            <span>{ICON[s.step]}</span>
            <span style={{ fontSize: 12, fontWeight: 650 }}>{s.label}</span>
            <Badge tone={s.status === 'completed' ? 'ok' : s.status === 'running' ? 'gold' : s.status === 'failed' ? 'err' : s.status === 'blocked' ? 'err' : 'muted'}>{s.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
