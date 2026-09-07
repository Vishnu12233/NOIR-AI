// CommandBar — ⌘K palette. Every entry performs a real navigation/action.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/ui.jsx';

export function useCommandBar() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = (e) => { if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen((v) => !v); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  return { open, setOpen };
}

export function CommandBar({ items, open, onClose, placeholder }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || []).filter((it) => !needle || (it.label + ' ' + (it.hint || '')).toLowerCase().includes(needle));
  }, [items, q]);
  if (!open) return null;
  const exec = (it) => { onClose(); if (it.route) navigate(it.route); else if (it.action) it.action(); };
  return (
    <div className="modal-backdrop" style={{ alignItems: 'flex-start', paddingTop: '12vh', zIndex: 600 }} onClick={onClose}>
      <div className="card" style={{ width: 560, padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
          <span className="muted">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter' && filtered[sel]) exec(filtered[sel]);
              else if (e.key === 'Escape') onClose();
            }}
            placeholder={placeholder || 'Ask NOIR anything about this project…'}
            style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none' }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? <div className="muted small" style={{ padding: 14 }}>No matching actions.</div> : filtered.map((it, i) => (
            <button key={it.label + i} className={'file-node' + (i === sel ? ' active' : '')} style={{ padding: '8px 10px', display: 'block', width: '100%' }} onMouseEnter={() => setSel(i)} onClick={() => exec(it)}>
              <span className="row" style={{ gap: 10 }}>
                <span>{it.icon || '·'}</span>
                <span className="flex1" style={{ fontWeight: i === sel ? 650 : 500 }}>{it.label}</span>
                {it.hint ? <span className="tiny faint">{it.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
