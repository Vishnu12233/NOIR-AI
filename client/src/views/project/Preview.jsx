import React, { useEffect, useState } from 'react';
import { useToast, Badge, Spinner } from '../../lib/ui.jsx';
import { useProject } from './ctx.jsx';

export function PreviewTab() {
  const { id, previewAlive, runApp, stopApp, checking } = useProject();
  const toast = useToast();
  const [frameKey, setFrameKey] = useState(Date.now());
  const [device, setDevice] = useState('desktop'); // desktop | tablet | mobile
  const [busy, setBusy] = useState(false);
  const width = { desktop: '100%', tablet: 768, mobile: 390 }[device];
  useEffect(() => {
    if (previewAlive) { const t = setTimeout(() => setFrameKey(Date.now()), 600); return () => clearTimeout(t); }
  }, [previewAlive]);
  return (
    <div style={{ height: 'calc(100vh - 133px)', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
      <div className="preview-bar">
        <button className="btn sm primary" disabled={busy || previewAlive} onClick={async () => { setBusy(true); try { await runApp(); } catch (e) { toast(e.message, 'error'); } setBusy(false); }}>
          {busy ? <Spinner /> : '▶ Run'}
        </button>
        {previewAlive && <button className="btn sm" onClick={() => stopApp().catch((e) => toast(e.message, 'error'))}>⏹ Stop</button>}
        <span className="chip" style={{ marginLeft: 4 }}>
          <span className={'status-dot ' + (previewAlive ? 'ok' : 'muted')} />
          {checking ? 'checking…' : previewAlive ? 'Live — app responds' : 'Offline'}
        </span>
        {previewAlive && <Badge tone="ok">port proxy active</Badge>}
        <span className="flex1" />
        <div className="row" style={{ gap: 3 }}>
          {[['desktop', '🖥'], ['tablet', '📱'], ['mobile', '📲']].map(([k, ic]) => (
            <button key={k} className={'btn sm ' + (device === k ? 'primary' : 'ghost')} onClick={() => setDevice(k)} title={k}>{ic}</button>
          ))}
        </div>
        <a className="btn sm ghost" href={'/preview/' + id + '/#/'} target="_blank" rel="noreferrer" onClick={() => { if (!previewAlive) { toast('Start the app first — a dead preview link would be a lie.', 'error'); event.preventDefault(); } }}>Open in tab ↗</a>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 14, background: 'var(--bg-2)', display: 'flex', justifyContent: 'center' }}>
        {previewAlive ? (
          <div style={{ width: width, height: '100%', background: '#fff', borderRadius: device === 'desktop' ? 0 : 12, overflow: 'hidden', boxShadow: device === 'desktop' ? 'none' : 'var(--shadow)', border: device === 'desktop' ? 'none' : '10px solid #22222a' }}>
            <iframe key={frameKey} className="preview-frame" src={'/preview/' + id + '/'} title="Generated app preview" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" />
          </div>
        ) : (
          <div className="empty" style={{ alignSelf: 'center' }}>
            <div className="big">🖥️</div>
            <h3>The app is not running</h3>
            <p className="muted" style={{ maxWidth: 420, margin: '10px auto 0' }}>Press <b>Run</b> to boot the generated server in the NOIR sandbox. The Live badge only appears when the health endpoint actually responds — NOIR never fakes a running preview.</p>
          </div>
        )}
      </div>
    </div>
  );
}
