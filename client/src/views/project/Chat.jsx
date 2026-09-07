import React, { useEffect, useRef, useState } from 'react';
import { useAuth, useToast, Badge, Spinner } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { chatStream } from '../../lib/stream.js';
import { useProject } from './ctx.jsx';

export function ChatTab() {
  const { id, data, events } = useProject();
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null);
  const [showEv, setShowEv] = useState(true);
  const [streamText, setStreamText] = useState('');
  const endRef = useRef(null);
  const providers = state?.providers || [];
  useEffect(() => { api('/assistant/state').then(setState).catch(() => { }); }, []);
  useEffect(() => {
    // persistent conversation history (server-side) — resumes after reloads/navigation
    api('/projects/' + id + '/chat').then((d) => { if (d.messages && d.messages.length) setMessages(d.messages.map((m) => ({ role: m.role, content: m.content, ts: m.ts }))); }).catch(() => { });
  }, [id]);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, events.length]);
  const evs = events.filter((e) => e.type === 'activity' || e.type === 'build' || e.type === 'test').slice(-30).reverse();
  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: t }]);
    setBusy(true);
    setStreamText('');
    const body = { messages: [...messages, { role: 'user', content: t }], project_id: id };
    const pushReply = (d, patch) => setMessages((m) => [...m, { role: 'assistant', content: d.reply, provider: d.provider, builtin: d.builtin, actions: d.actions || d.suggestions || [], patch: patch || null }]);
    try {
      if (providers.length) {
        // real token streaming when a provider is configured
        try {
          const r = await chatStream(body, { onDelta: (txt) => setStreamText(txt) });
          pushReply({ reply: r.reply, provider: r.provider, builtin: r.builtin, actions: r.actions }, r.patch);
        } catch (ef) {
          if (!ef.fallback) throw ef;
          const d = await api('/assistant/chat', { body });
          pushReply({ reply: d.reply, provider: d.provider, builtin: d.builtin, actions: d.suggestions }, d.patch);
        }
      } else {
        const d = await api('/assistant/chat', { body });
        pushReply({ reply: d.reply, provider: d.provider, builtin: d.builtin, actions: d.suggestions }, d.patch);
      }
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
    setStreamText('');
  };
  const chips = ['Explain this project', 'Why is login failing?', 'Add a search feature', 'Run tests', 'Deploy this project', 'What is the pipeline status?'];
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 133px)', minHeight: 420 }}>
      <div className="ws-col" style={{ flex: 1, minWidth: 0 }}>
        <div className="pane-head">
          <span>NOIR assistant — project context: {data?.project?.name}</span>
          {messages.some((m) => m.ts) ? <span className="tiny faint" style={{ marginLeft: 8 }}>history persisted</span> : null}
          <Badge tone={providers.length ? 'ok' : 'muted'}>{providers.length ? providers[0].label + ' · ' + providers[0].model : 'built-in mode (no key)'}</Badge>
        </div>
        <div className="pane-body" style={{ padding: '6px 14px' }}>
          {!messages.length ? (
            <div className="empty" style={{ margin: '30px 0' }}>
              <div className="big">🤖</div>
              <p className="muted" style={{ maxWidth: 460, margin: '0 auto' }}>Ask anything about this project — NOIR reads the real spec, files, task list and health data to answer. Feature changes you approve are applied to affected files only.</p>
              <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                {chips.map((c) => <button key={c} className="btn sm ghost" onClick={() => send(c)}>{c}</button>)}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={'chat-line ' + m.role}>
                <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{m.role === 'user' ? initials(user?.name || user?.email) : 'N'}</span>
                <div className="flex1">
                  <div className="chat-msg">{m.content}</div>
                  <div className="row" style={{ marginTop: 4 }}>
                    {m.builtin ? <span className="tiny faint">answered from project context (no external model call)</span> : m.provider ? <span className="tiny faint">{m.provider}</span> : null}
                    {m.actions && m.actions.length ? <span className="flex1" /> : null}
                    {m.actions && m.actions.map((a) => <button key={a.label} className="btn sm ghost" onClick={() => { window.location.hash = '#' + (a.route || '/project/' + id); }}>{a.label}</button>)}
                  </div>
                  {m.patch ? <PatchCard patch={m.patch} /> : null}
                </div>
              </div>
            ))
          )}
          {busy ? (
            <div className="chat-line assistant">
              <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>N</span>
              {streamText ? <div className="chat-msg" style={{ whiteSpace: 'pre-wrap' }}>{streamText}<span className="stream-caret" /></div> : <div className="chat-msg muted"><Spinner /> thinking…</div>}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
        <div className="row" style={{ padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={'Message NOIR about ' + (data?.project?.name || 'this project') + '…'} />
          <button className="btn primary" onClick={() => send()} disabled={busy}>Send</button>
        </div>
      </div>
      <div className="ws-col" style={{ width: 300, flex: 'none', borderLeft: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div className="pane-head"><span>Live events</span><button className="icon-btn" title="Toggle" onClick={() => setShowEv((v) => !v)}>{showEv ? '–' : '+'}</button></div>
        {showEv && (
          <div className="pane-body" style={{ padding: '4px 10px 10px' }}>
            {evs.length === 0 ? <div className="muted small" style={{ padding: 12 }}>Agent actions, builds and test runs appear here as they happen.</div> : evs.map((e, i) => (
              <div key={e.id || i} className="row" style={{ padding: '6px 0', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{e.icon}</span>
                <div className="flex1"><div className="small" style={{ color: e.status === 'error' ? 'var(--err)' : e.status === 'running' ? 'var(--gold)' : undefined, lineHeight: 1.45 }}>{e.text}</div>
                  <div className="tiny faint">{new Date(e.ts).toLocaleTimeString()}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ---- code-level patch preview + approval card (Phases 10/42) ----
function PatchCard({ patch }) {
  const toast = useToast();
  const { id } = useProject();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [state, setState] = useState('pending'); // pending | applied | error | stale
  const [result, setResult] = useState(null);
  const plan = (patch && patch.plan) || [];
  const nFiles = plan.reduce((n, x) => n + (x.files || []).length, 0);
  if (!patch) return null;
  const approve = async () => {
    setBusy(true);
    try {
      const r = await api('/projects/' + id + '/patch/apply', { body: { prompt: patch.prompt, approval: true } });
      setState('applied'); setResult(r);
      toast('Patch applied to ' + r.applied.length + ' file(s)' + (r.tests && r.tests.ok ? ' — tests still pass' : r.tests && r.tests.failed ? ' — tests FAILED (checkpoint saved prior state)' : ''), r.tests && !r.tests.ok ? 'error' : 'ok');
    } catch (e) { setState(e.code === 'STALE' ? 'stale' : 'error'); setResult({ error: e.message }); toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <div className="card tight" style={{ marginTop: 10, borderColor: 'color-mix(in srgb, var(--gold) 40%, var(--line))', maxWidth: 720 }}>
      <div className="row-between">
        <span style={{ fontWeight: 700, fontSize: 13 }}>🩹 Code change — {nFiles} file(s), awaiting approval</span>
        {state === 'applied' ? <Badge tone="ok">applied</Badge> : state === 'error' || state === 'stale' ? <Badge tone="err">{state}</Badge> : <Badge tone="warn">not applied</Badge>}
      </div>
      {state === 'pending' || state === 'stale' ? (
        <>
          <div className="small muted" style={{ marginTop: 6 }}>NOIR found the exact text you want to change in real files. Nothing is written until you approve — a safety checkpoint is created first, and tests re-run automatically for server-side files.</div>
          {plan.map((entry, ei) => (entry.files || []).map((f, fi) => {
            const key = ei + '-' + fi;
            const isOpen = !!open[key];
            return (
              <div key={key} style={{ marginTop: 8 }}>
                <button className="file-node" style={{ width: '100%' }} onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="flex1 mono small">{f.file}</span>
                    <span className="tiny faint">line {f.occurrences.map((o) => o.line).join(', ')}</span>
                    <span>{isOpen ? '–' : '+'}</span>
                  </span>
                </button>
                <div className="tiny faint" style={{ padding: '2px 4px' }}>replace {JSON.stringify(entry.old.slice(0, 60))}{entry.old.length > 60 ? '…' : ''} → {JSON.stringify(entry.next.slice(0, 60))}{entry.next.length > 60 ? '…' : ''}</div>
                {isOpen ? <pre className="code-scroll dark" style={{ maxHeight: 220, overflow: 'auto', margin: '6px 0 2px', fontSize: 11.5, lineHeight: 1.5 }}>{f.diff.map((l, i) => <div key={i} style={{ color: l[0] === '-' ? 'var(--err)' : l[0] === '+' ? 'var(--ok)' : 'var(--faint)' }}>{l}</div>)}</pre> : null}
              </div>
            );
          }))}
          {state === 'stale' ? <div className="tiny" style={{ color: 'var(--err)', marginTop: 6 }}>Plan is stale (files changed since preview). Ask again to re-preview.</div> : null}
          <div className="row" style={{ marginTop: 10, gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" disabled={busy} onClick={() => setState('closed')}>Discard</button>
            <button className="btn primary sm" disabled={busy} onClick={approve}>{busy ? <Spinner /> : '✓ Approve & apply'}</button>
          </div>
        </>
      ) : state === 'applied' && result ? (
        <div className="small" style={{ marginTop: 8 }}>
          <div className="ok-text">Applied to: {result.applied.map((a) => <span key={a.file} className="mono tiny">{a.file}</span>).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ' · ', el], [])}</div>
          {result.checkpoint ? <div className="tiny faint">checkpoint {result.checkpoint} — previous state restorable from the Git tab</div> : null}
          {result.tests ? <div className="tiny" style={{ marginTop: 4 }}>{result.tests.note || (result.tests.passed + ' passed / ' + result.tests.failed + ' failed')}</div> : null}
        </div>
      ) : state === 'closed' ? null : (
        <div className="tiny" style={{ color: 'var(--err)', marginTop: 8 }}>{result && result.error} — nothing was changed.</div>
      )}
    </div>
  );
}
function initials(n) {
  return String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
