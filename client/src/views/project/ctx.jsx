// ProjectWorkspace — shared state provider for one project (data + SSE + runner helpers).
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/ui.jsx';

const Ctx = createContext(null);
export const useProject = () => useContext(Ctx);

export function ProjectProvider({ id, children }) {
  const [data, setData] = useState(null);      // GET /projects/:id payload
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);    // recent SSE events ring
  const [previewAlive, setPreviewAlive] = useState(false);
  const [checking, setChecking] = useState(false);
  const toast = useToast();
  const timers = useRef({});
  const version = useRef(0);

  const refresh = useCallback(async (silent) => {
    const v = ++version.current;
    try {
      const d = await api('/projects/' + id);
      if (v === version.current) { setData(d); setLoading(false); }
      return d;
    } catch (e) {
      if (!silent) toast(e.message, 'error');
      setLoading(false);
      return null;
    }
  }, [id]);

  // SSE
  useEffect(() => {
    let closed = false;
    const es = new EventSource('/api/projects/' + id + '/events');
    const push = (ev) => setEvents((s) => [...s.slice(-60), { id: Math.random().toString(36).slice(2), ts: Date.now(), ...ev }]);
    es.onmessage = (e) => { try { push(JSON.parse(e.data)); } catch { /* noop */ } };
    es.onerror = () => { if (!closed) { refresh(true); } };
    return () => { closed = true; es.close(); };
  }, [id]);

  // any event → silent refresh (throttled)
  useEffect(() => {
    if (!events.length) return;
    const last = events[events.length - 1];
    if (last.type === 'build' && (last.status === 'done' || last.status === 'failed')) refresh(true);
    if (last.type === 'preview') { setPreviewAlive(last.status === 'running'); return; }
    if (last.type === 'activity') return; // chat feed only
    clearTimeout(timers.current.sse);
    timers.current.sse = setTimeout(() => refresh(true), 350);
  }, [events]);

  // preview liveness polling
  const checkPreview = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch('/api/preview-status/' + id).then((x) => x.json()).catch(() => ({ ok: false }));
      setPreviewAlive(!!r.ok && !!r.running);
    } finally { setChecking(false); }
  }, [id]);
  useEffect(() => {
    checkPreview();
    const t = setInterval(checkPreview, 4000);
    return () => clearInterval(t);
  }, [checkPreview]);

  const runApp = useCallback(async () => {
    const info = await api('/projects/' + id + '/run', { body: {} });
    toast('App starting on port ' + info.port + '…', 'ok');
    refresh(true);
    // wait for it to answer before showing Live
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const st = await fetch('/api/preview-status/' + id).then((x) => x.json()).catch(() => ({ ok: false }));
      if (st.ok && st.running) { setPreviewAlive(true); refresh(true); break; }
    }
    return info;
  }, [id]);
  const stopApp = useCallback(async () => {
    await api('/projects/' + id + '/stop', { body: {} });
    setPreviewAlive(false);
    toast('App stopped', 'ok');
    refresh(true);
  }, [id]);

  return (
    <Ctx.Provider value={{ data, loading, refresh, events, previewAlive, checkPreview, checking, runApp, stopApp, id }}>
      {children}
    </Ctx.Provider>
  );
}

export const fmt = (ms) => ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
export const taskTone = (s) => ({ completed: 'ok', running: 'gold', queued: 'muted', waiting: 'warn', blocked: 'err', failed: 'err', cancelled: 'muted' }[s] || 'muted');
export const pipeTone = (s) => ({ completed: 'ok', running: 'gold', queued: 'muted', waiting: 'muted', blocked: 'err', failed: 'err', skipped: 'muted' }[s] || 'muted');
