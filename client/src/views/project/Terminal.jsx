import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

// Terminal — real commands inside the project sandbox + live app logs.
export function TerminalTab() {
  const { id, data, refresh } = useProject();
  const toast = useToast();
  const [mode, setMode] = useState('terminal'); // terminal | applog
  const [lines, setLines] = useState([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [appLog, setAppLog] = useState('');
  const scrollRef = useRef(null);

  const push = (seg) => setLines((l) => [...l, seg].slice(-400));
  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [lines, appLog]);

  const run = async (text) => {
    const c = (text ?? cmd).trim();
    if (!c || busy) return;
    setCmd('');
    push({ type: 'in', text: '$ ' + c });
    setBusy(true);
    try {
      const rec = await api('/projects/' + id + '/terminal', { body: { command: c } });
      const out = (rec.output && (rec.output.output ?? rec.output.tail)) || '';
      if (out) push({ type: rec.status === 'failed' ? 'err' : 'out', text: out.slice(-6000) });
      if (rec.error) push({ type: 'err', text: '⚠ ' + rec.error });
      push({ type: 'meta', text: '— exit ' + (rec.output ? rec.output.exit_code : '?') + ' · ' + Math.round(rec.durationMs) + 'ms · ' + new Date(rec.timestamp).toLocaleTimeString() });
    } catch (e) { push({ type: 'err', text: '⚠ ' + e.message }); }
    setBusy(false);
    refresh(true);
  };

  const loadLog = async () => {
    try { const d = await api('/projects/' + id + '/logs?lines=400'); setAppLog(d.tail || '(empty log)'); } catch (e) { setAppLog('⚠ ' + e.message); }
  };
  useEffect(() => { if (mode === 'applog') { loadLog(); const t = setInterval(loadLog, 2500); return () => clearInterval(t); } }, [mode]);

  return (
    <div style={{ height: 'calc(100vh - 133px)', minHeight: 420, display: 'flex', flexDirection: 'column', background: '#0a0a0f' }}>
      <div className="preview-bar" style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ gap: 4 }}>
          <button className={'btn sm ' + (mode === 'terminal' ? 'primary' : 'ghost')} onClick={() => setMode('terminal')}>⌨ Sandbox terminal</button>
          <button className={'btn sm ' + (mode === 'applog' ? 'primary' : 'ghost')} onClick={() => setMode('applog')}>🪵 App logs (live)</button>
        </div>
        <span className="flex1" />
        <span className="tiny faint mono">commands execute in the project directory (sandboxed, timeout 60s)</span>
      </div>
      {mode === 'terminal' ? (
        <>
          <div className="term" ref={scrollRef} style={{ flex: 1, minHeight: 0 }} onClick={() => document.getElementById('noir-term-in').focus()}>
            {!lines.length ? <div style={{ color: '#5d626e' }}>NOIR sandbox terminal — try: <span style={{ color: '#9cc0ff' }}>ls · node --version · npm test</span> (rm -rf / and friends are blocked)</div> : null}
            {lines.map((l, i) => (
              <div key={i} className={l.type === 'err' ? 't-err' : l.type === 'in' ? 't-in' : l.type === 'meta' ? '' : ''} style={{ color: l.type === 'meta' ? '#5d626e' : undefined, whiteSpace: 'pre-wrap' }}>{l.text}</div>
            ))}
            {busy ? <div style={{ color: '#5d626e' }}>… running</div> : null}
          </div>
          <form className="term-input-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <span className="prompt">$</span>
            <input id="noir-term-in" className="term-input flex1" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="type a command…" autoComplete="off" autoFocus />
          </form>
        </>
      ) : (
        <div className="term" style={{ flex: 1, minHeight: 0 }} ref={scrollRef}>{appLog || 'No log output yet.'}</div>
      )}
    </div>
  );
}
