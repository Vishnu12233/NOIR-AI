import React, { useEffect, useState } from 'react';
import { useToast, Badge, Spinner, Empty } from '../../lib/ui.jsx';
import { api, fmtAgo } from '../../lib/api.js';
import { useProject } from './ctx.jsx';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

export function EnvTab() {
  const { id, data } = useProject();
  const toast = useToast();
  const [vars, setVars] = useState(null);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState({});
  const load = async () => { try { setVars((await api('/projects/' + id + '/env')).vars); } catch (e) { toast(e.message, 'error'); } };
  useEffect(() => { load(); }, []);
  const used = (data?.project?.env_used) || [];
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head row-between">
        <div><h1>Environment variables</h1><div className="sub">Stored masked in the platform DB — values are never logged, exposed in git, or sent to AI providers. They are injected into the project runtime when it boots.</div></div>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add variable</button>
      </div>
      {!vars ? <div className="center-load"><Spinner /></div> : vars.length === 0 ? (
        <Empty icon="🔐" title="No variables yet">Add DATABASE_URL to flip the app to PostgreSQL, or AI provider keys (OPENAI_API_KEY, …) to enable live model features.</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Key</th><th>Value</th><th>Used by runtime</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {vars.map((v) => (
                <tr key={v.key}>
                  <td><b className="mono">{v.key}</b></td>
                  <td className="mono">
                    {v.masked ? (visible[v.key] ? <RevealV row={v} onDone={load} /> : <span className="muted">•••••••• <span className="tiny">(hidden — {v.value_hint})</span></span>) : v.value}
                  </td>
                  <td><Badge tone={used.includes(v.key) ? 'ok' : 'muted'}>{used.includes(v.key) ? 'active' : 'unused'}</Badge></td>
                  <td className="tiny faint">{fmtAgo(new Date(v.created_at).getTime())}</td>
                  <td className="text-right">
                    <button className="icon-btn" title={v.masked ? 'Reveal value' : 'Hide'} onClick={() => setVisible((o) => ({ ...o, [v.key]: !o[v.key] }))}>{v.masked && !visible[v.key] ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                    <button className="icon-btn danger" title="Delete" onClick={async () => { if (confirm('Delete ' + v.key + '?')) { await api('/projects/' + id + '/env/' + encodeURIComponent(v.key), { method: 'DELETE' }); load(); toast('Deleted ' + v.key, 'ok'); } }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,4,8,.6)', zIndex: 200, display: 'grid', placeItems: 'center' }} onClick={() => setAdding(false)}>
          <form className="card" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return toast('Key must be UPPER_SNAKE (e.g. DATABASE_URL)', 'error');
            try { await api('/projects/' + id + '/env', { method: 'PUT', body: { key, value } }); setAdding(false); setKey(''); setValue(''); load(); toast('Saved (masked from now on)', 'ok'); }
            catch (e2) { toast(e2.message, 'error'); }
          }}>
            <div className="row-between"><h3>New variable</h3><button type="button" className="icon-btn" onClick={() => setAdding(false)}>✕</button></div>
            <label>Key</label><input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="DATABASE_URL" required autoFocus />
            <label>Value</label><textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} required placeholder="postgres://… or sk-…" className="mono" />
            <div className="hint">Secrets are stored masked; the raw value only exists in memory while the runtime boots. Existing masked values can be replaced (send a new value) but never read back in full.</div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
function RevealV({ row, onDone }) {
  const { id } = useProject();
  const toast = useToast();
  // value cannot be decrypted server-side; replacing requires sending the value again.
  const [replace, setReplace] = useState('');
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="tiny faint">stored masked — re-send to replace</span>
      <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="new value (or leave empty)" className="mono" style={{ width: 220, padding: '2px 8px' }} />
      <button type="button" className="btn sm" onClick={async () => { if (!replace) return toast('Enter a value to replace the stored one', 'error'); await api('/projects/' + id + '/env', { method: 'PUT', body: { key: row.key, value: replace } }); setReplace(''); onDone(); toast('Replaced', 'ok'); }}>Replace</button>
    </span>
  );
}
