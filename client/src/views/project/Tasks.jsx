import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast, Badge, Spinner } from '../../lib/ui.jsx';
import { useProject } from './ctx.jsx';

export function TasksTab() {
  const { data, events } = useProject();
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState('board');
  const tasks = data?.tasks || [];
  useEffect(() => {
    const ev = events[events.length - 1];
    if (ev && ev.type === 'task' && ev.task) setSel(ev.task.id);
  }, [events]);
  const byStatus = (s) => tasks.filter((t) => t.status === s);
  const groups = [
    ['running', 'Running now'], ['queued', 'Queued'], ['waiting approval', 'Waiting approval'],
    ['completed', 'Completed'], ['failed', 'Failed'], ['blocked', 'Blocked'], ['cancelled', 'Cancelled'],
  ];
  if (!tasks.length) return <div className="center-load" style={{ minHeight: 300 }}><Spinner /> No tasks recorded yet — start a build.</div>;
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head row-between"><div><h1>Agent tasks</h1><div className="sub">{tasks.length} tasks · orchestrated by the NOIR task graph. Statuses are real — each entry records its agent, result, dependencies and errors.</div></div>
        <div className="row" style={{ gap: 4 }}>
          <button className={'btn sm ' + (mode === 'board' ? 'primary' : 'ghost')} onClick={() => setMode('board')}>By status</button>
          <button className={'btn sm ' + (mode === 'graph' ? 'primary' : 'ghost')} onClick={() => setMode('graph')}>Dependency graph</button>
        </div></div>
      {mode === 'graph' ? <GraphView tasks={tasks} onSelect={setSel} /> : <div className="grid cols-2">
        {groups.map(([st, label]) => {
          const list = byStatus(st);
          if (!list.length) return null;
          return (
            <div key={st} className="card" style={{ padding: 8 }}>
              <div className="pane-head" style={{ border: 'none', padding: '4px 8px' }}><span>{label}</span><Badge tone={st === 'failed' ? 'err' : st === 'running' ? 'gold' : st === 'completed' ? 'ok' : 'muted'}>{list.length}</Badge></div>
              {list.map((t) => (
                <button key={t.id} className="file-node" style={{ padding: '6px 8px', display: 'block' }} onClick={() => setSel(t.id)}>
                  <span className="row" style={{ gap: 8 }}>
                    <b className="mono tiny" style={{ color: 'var(--gold)' }}>{t.id}</b>
                    <span className="flex1" style={{ fontSize: 13 }}>{t.title}</span>
                    {t.attempt ? <span className="tiny faint">try {t.attempt}</span> : null}
                  </span>
                  <span className="tiny muted">agent: {t.agent} · priority {t.priority} · kind {t.kind}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>}
      <TaskDetail task={tasks.find((t) => t.id === sel)} onClose={() => setSel(null)} />
    </div>
  );
}

function GraphView({ tasks, onSelect }) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const childrenOf = (id) => tasks.filter((t) => (t.deps || []).includes(id));
  const roots = tasks.filter((t) => !(t.deps || []).length);
  const depthOf = (id, seen = {}) => {
    if (seen[id]) return 0;
    const deps = byId[id] ? byId[id].deps || [] : [];
    if (!deps.length) return 0;
    seen[id] = 1;
    return 1 + Math.max(0, ...deps.map((d) => (byId[d] ? depthOf(d, seen) : 0)));
  };
  const cols = [];
  for (const t of tasks) { const d = depthOf(t.id); if (!cols[d]) cols[d] = []; cols[d].push(t); }
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14, minWidth: 700 }}>
        {cols.map((col, d) => (
          <div key={d} style={{ flex: 1, minWidth: 150 }}>
            <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.1em', padding: '4px 2px' }}>Stage {d}{d === 0 ? ' (start)' : ''}</div>
            {col.map((t) => (
              <button key={t.id} className="file-node" style={{ display: 'block', width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '8px', marginBottom: 6, background: 'var(--panel)' }} onClick={() => onSelect(t.id)}>
                <span className="row" style={{ gap: 6 }}>
                  <span className="status-dot" style={{ background: 'var(--' + ({ completed: 'ok', running: 'gold', failed: 'err', blocked: 'err' }[t.status] || 'faint') + ')' }} />
                  <b className="mono tiny">{t.id}</b>
                  <span className="flex1 tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{t.title}</span>
                </span>
                {(t.deps || []).length ? <div className="tiny faint" style={{ marginTop: 3, textAlign: 'left' }}>← {t.deps.join(' · ')}</div> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
function TaskDetail({ task, onClose }) {
  if (!task) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,4,8,.6)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 20 }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 720, width: '100%', maxHeight: '82vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <div><b className="mono">{task.id}</b> · {task.title}</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>{task.description}</div>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <Badge tone={task.status === 'failed' ? 'err' : task.status === 'running' ? 'gold' : task.status === 'completed' ? 'ok' : 'muted'}>{task.status}</Badge>
          <Badge>agent: {task.agent}</Badge>
          <Badge>priority: {task.priority}</Badge>
          <Badge>attempt: {task.attempt || 1}</Badge>
        </div>
        {task.started_at ? <div className="tiny faint" style={{ marginTop: 8 }}>started {new Date(task.started_at).toLocaleString()} · completed {task.completed_at ? new Date(task.completed_at).toLocaleString() : '—'}</div> : null}
        {task.error ? <><div className="section-title">Error</div><div className="code-scroll" style={{ borderColor: 'color-mix(in srgb, var(--err) 40%, var(--line))' }}><pre className="code-block" style={{ color: 'var(--err)' }}>{String(task.error).slice(0, 2000)}</pre></div></> : null}
        {task.result ? (
          <>
            <div className="section-title">Result payload</div>
            <div className="code-scroll dark"><pre className="code-block">{typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2)}</pre></div>
          </>
        ) : null}
      </div>
    </div>
  );
}
