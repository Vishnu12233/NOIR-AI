// shared UI primitives + tiny hash router + auth store + toast bus
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';
import { X } from 'lucide-react';

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3400);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts">
        {items.map((t) => <div key={t.id} className={'toast ' + (t.kind === 'error' ? 'err' : t.kind === 'ok' ? 'ok' : '')}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- router ----------
const RouterCtx = createContext({ path: '/', nav: () => {} });
export function useRoute() { return useContext(RouterCtx); }
export function navigate(p) { window.location.hash = '#' + p; }
export function RouterProvider({ routes, fallback }) {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const value = useMemo(() => ({ path: hash.slice(1) || '/', nav: navigate }), [hash]);
  const { Component, props } = matchRoute(routes, value.path) || { Component: fallback, props: {} };
  return <RouterCtx.Provider value={value}><Component {...props} /></RouterCtx.Provider>;
}
function matchRoute(routes, path) {
  const [seg, qs] = path.split('?');
  for (const r of routes) {
    const m = seg.match(r.pattern);
    if (m) return { Component: r.Component, props: { params: (m.slice(1) || []).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) } };
  }
  return null;
}
export function Link({ to, children, className, onClick }) {
  return <a className={className} href={'#' + to} onClick={onClick}>{children}</a>;
}

// ---------- auth store ----------
const AuthCtx = createContext({ user: null, ready: false, refresh: async () => {} });
export const useAuth = () => useContext(AuthCtx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { const d = await api('/auth/me'); setUser(d.user); }
    catch { setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { body: { email, password } });
    setToken(d.token); setUser(d.user); return d.user;
  }, []);
  const signup = useCallback(async (body) => {
    const d = await api('/auth/signup', { body });
    setToken(d.token); setUser(d.user); return d.user;
  }, []);
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* noop */ }
    setToken(null); setUser(null);
    window.location.hash = '#/';
  }, []);
  const value = useMemo(() => ({ user, ready, refresh, login, signup, logout, setUser }), [user, ready, refresh, login, signup, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ---------- small components ----------
export function Modal({ children, onClose, wide }) {
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        {children}
      </div>
    </div>
  );
}
export function ModalHead({ title, onClose, sub }) {
  return <div className="modal-x"><div><h3>{title}</h3>{sub ? <div className="muted small">{sub}</div> : null}</div><button className="icon-btn" onClick={onClose}><X size={15} /></button></div>;
}
export function Spinner() { return <span className="spinner" />; }
export function Empty({ icon = '🗂️', title, children }) {
  return <div className="empty"><div className="big">{icon}</div><h3>{title}</h3><div className="muted small">{children}</div></div>;
}
export function Badge({ children, tone, dot }) {
  return <span className={'badge ' + (tone || '')}>{dot ? <span className={'status-dot ' + tone} /> : null}{children}</span>;
}
export function Stat({ label, num, sub }) {
  return <div className="stat-card"><div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', fontWeight: 650 }}>{label}</div><div className="stat-num">{num}</div>{sub ? <div className="tiny faint">{sub}</div> : null}</div>;
}
export function CodeBlock({ text }) {
  return <div className="code-scroll"><pre className="code-block">{text}</pre></div>;
}
export function StatusChip({ status }) {
  const tone = { running: 'ok', live: 'ok', completed: 'ok', done: 'ok', healthy: 'ok', building: 'gold', queued: 'muted', waiting: 'warn', failed: 'err', blocked: 'err', cancelled: 'muted', idea: 'muted', planning: 'gold', deploying: 'gold', paused: 'warn', requires_configuration: 'warn', stopped: 'muted', idle: 'muted' }[status] || 'muted';
  const dot = tone !== 'muted' ? tone : '';
  return <Badge tone={tone} dot={dot ? true : false}>{status}</Badge>;
}
export function Seg({ options, value, onChange }) {
  return <div className="row" style={{ gap: 4 }}>
    {options.map((o) => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return <button key={v} className={'btn sm ' + (value === v ? 'primary' : 'ghost')} onClick={() => onChange(v)}>{l}</button>;
    })}
  </div>;
}
export function Tabs({ tabs, active, onChange }) {
  return <div className="row" style={{ gap: 2, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 0 }}>
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)} className="icon-btn" style={{ borderRadius: '8px 8px 0 0', height: 34, padding: '0 12px', width: 'auto', fontSize: 13, fontWeight: active === t.id ? 650 : 500, color: active === t.id ? 'var(--text)' : 'var(--muted)', borderBottom: active === t.id ? '2px solid var(--gold)' : '2px solid transparent', background: 'transparent' }}>
        {t.label}
      </button>
    ))}
  </div>;
}
export function Field({ label, children, hint }) {
  return <div className="field"><label className="mb0">{label}</label>{children}{hint ? <div className="hint">{hint}</div> : null}</div>;
}
export function useAsync(fn, deps) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await fn()); } catch (e) { setErr(e); }
    setLoading(false);
  }, deps || []);
  useEffect(() => { run(); }, [run]);
  return { data, err, loading, reload: run };
}
