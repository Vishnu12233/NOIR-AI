// API tab — the real API contract of the generated app (parsed from its actual source)
// plus a live request console. Results are genuine responses from the running app.
import React, { useEffect, useMemo, useState } from 'react';
import { useToast, Badge, Spinner } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

const METHOD_TONE = { GET: 'ok', POST: 'gold', PATCH: '', DELETE: 'err' };

export function ApiTab() {
  const { id, previewAlive } = useProject();
  const toast = useToast();
  const [spec, setSpec] = useState(null);
  const [open, setOpen] = useState(null); // key of expanded group
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/meta');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  useEffect(() => { api('/projects/' + id + '/api').then(setSpec).catch((e) => toast(e.message, 'error')); }, [id]);
  const groups = useMemo(() => {
    if (!spec) return [];
    const out = [];
    const auth = (spec.endpoints || []).filter((e) => e.group === 'auth');
    const feats = (spec.endpoints || []).filter((e) => e.group && e.group !== 'auth');
    const tables = (spec.endpoints || []).filter((e) => e.table);
    if (auth.length) out.push({ key: 'auth', title: 'Authentication', entries: auth.flatMap((g) => g.endpoints || []) });
    if (tables.length) out.push({ key: 'tables', title: 'Data tables — REST per table', entries: tables.flatMap((t) => [
      { method: t.list.method, path: t.list.path, auth: t.list.auth, table: t.label },
      { method: t.create.method, path: t.create.path, auth: t.create.auth, table: t.label },
      { method: t.get.method, path: t.get.path.replace(':id', '{id}'), auth: t.get.auth, table: t.label },
      { method: t.update.method, path: t.update.path.replace(':id', '{id}'), auth: t.update.auth, table: t.label },
      { method: t.remove.method, path: t.remove.path.replace(':id', '{id}'), auth: t.remove.auth, table: t.label },
    ]) });
    for (const g of feats) out.push({ key: g.group, title: g.group === 'ai_chat' ? 'AI chat feature' : 'Payments feature', entries: g.endpoints || [] });
    return out;
  }, [spec]);
  const openGroup = (k) => { const g = groups.find((x) => x.key === k); if (!g) return null; return g; };
  const tryIt = (m, p) => { setMethod(m); setPath(p); setRes(null); };
  const send = async () => {
    if (!previewAlive) return toast('The app is not running — start it (Preview tab or ⌘K) before trying endpoints.', 'error');
    setBusy(true); setRes(null);
    try {
      let parsedBody;
      if (body.trim()) { try { parsedBody = JSON.parse(body); } catch { return toast('Request body is not valid JSON', 'error'); } }
      const d = await api('/projects/' + id + '/api/try', { body: { method, path, body: parsedBody } });
      setRes(d);
    } catch (e) { setRes({ status: 0, ok: false, error: e.message, latencyMs: 0 }); }
    setBusy(false);
  };
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head"><h1>API explorer</h1>
        <div className="sub">Contract parsed from the app's real <span className="mono tiny">server.js</span> · requests go to the running app (<span className={previewAlive ? 'gold' : ''}>{previewAlive ? 'live' : 'not running'}</span>) · results are genuine.</div></div>
      {!spec ? <div className="center-load"><Spinner /> Reading contract…</div> : (
        <>
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div className="card"><div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>App</div><div style={{ fontWeight: 700, marginTop: 4 }}>{spec.app}</div><div className="tiny faint">{spec.tables.length} table(s) · {spec.endpoints.reduce((n, e) => n + (e.endpoints ? e.endpoints.length : 1), 0)} endpoint definitions</div></div>
            <div className="card"><div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Storage</div><div className="small" style={{ marginTop: 4 }}>{spec.storage}</div><div className="tiny faint" style={{ marginTop: 4 }}>file store auto-migrates to PostgreSQL when DATABASE_URL is configured</div></div>
            <div className="card"><div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.09em' }}>Security</div><div className="small" style={{ marginTop: 4 }}>auth: <b>{spec.auth_enabled ? 'enabled' : 'off'}</b>{spec.auth_enabled ? ' · PBKDF2 (salted) passwords · HttpOnly session cookies · guarded admin tables' : ''}</div></div>
          </div>
          {groups.map((g) => {
            const isOpen = open === g.key;
            return (
              <div key={g.key} className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                <button className="file-node" style={{ width: '100%', padding: '10px 14px', borderRadius: 0 }} onClick={() => setOpen(isOpen ? null : g.key)}>
                  <span className="row" style={{ gap: 8 }}><span className="flex1" style={{ fontWeight: 700 }}>{g.title}</span><span className="tiny faint">{g.entries.length} endpoint(s)</span><span style={{ transform: isOpen ? 'rotate(90deg)' : '' }}>›</span></span>
                </button>
                {isOpen ? <div style={{ borderTop: '1px solid var(--line)' }}>
                  {g.entries.map((e, i) => (
                    <div key={i} className="row" style={{ padding: '8px 14px', gap: 10, borderBottom: '1px solid var(--line-soft, rgba(255,255,255,.05))' }}>
                      <Badge tone={METHOD_TONE[e.method] || 'muted'} style={{ minWidth: 52, textAlign: 'center' }}>{e.method}</Badge>
                      <code className="flex1" style={{ fontSize: 12.4 }}>{e.path}</code>
                      {e.table ? <span className="tiny faint hide-sm">{e.table}</span> : null}
                      <span className="tiny faint">{e.auth || ''}</span>
                      <button className="btn sm ghost" onClick={() => { tryIt(e.method, e.path); if (e.method !== 'GET') { const p = e.path; if (p.endsWith('/auth/login')) setBody('{\n  "email": "ava@noir.app",\n  "password": "demo123"\n}'); else if (p.endsWith('/auth/signup')) setBody('{\n  "email": "you@example.com",\n  "name": "You",\n  "password": "secret12"\n}'); else setBody('{}'); } setOpen(null); }}>Try</button>
                    </div>
                  ))}
                </div> : null}
              </div>
            );
          })}
          {spec.note ? <div className="card muted small">{spec.note}</div> : null}
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15 }}>Request console <Badge tone={previewAlive ? 'ok' : 'muted'} dot>{previewAlive ? 'app running' : 'app stopped'}</Badge></h3>
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: 110 }}>
                {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
              </select>
              <input value={path} onChange={(e) => setPath(e.target.value)} className="mono flex1" placeholder="/api/…" />
              <button className="btn primary" disabled={busy || !previewAlive} onClick={send}>{busy ? <Spinner /> : 'Send'}</button>
            </div>
            <label style={{ marginTop: 10 }}>Body (JSON — optional)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mono" placeholder={'{\n  "key": "value"\n}'} />
            <div className="tiny faint" style={{ marginTop: 6 }}>{method === 'GET' ? 'GET requests carry no body.' : 'Body is sent as application/json through the NOIR proxy to the running app.'} Endpoints that require auth will answer 401 here until a session exists in the Preview (same cookies apply in your browser; the console itself runs server-side and forwards no stored credentials).</div>
            {res ? (
              <div style={{ marginTop: 12 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <Badge tone={res.status >= 200 && res.status < 300 ? 'ok' : res.status === 0 ? 'err' : 'warn'} style={{ fontSize: 13 }}>{res.status || 'ERR'}</Badge>
                  <span className="tiny faint">{res.ok !== undefined ? (res.ok ? 'ok' : 'failed') : ''}</span>
                  <span className="tiny faint">{res.latencyMs != null ? res.latencyMs + ' ms' : ''}</span>
                  {res.headers && <span className="tiny faint">{Object.keys(res.headers).length} headers</span>}
                  {res.error ? <span className="small" style={{ color: 'var(--err)' }}>{res.error}</span> : null}
                </div>
                <div className="code-scroll dark" style={{ maxHeight: 280 }}><pre className="code-block">{res.body !== undefined ? (typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2)) : res.error ? res.error : '(no body)'}</pre></div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}