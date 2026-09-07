import React, { useEffect, useState } from 'react';
import { useToast, Badge, Spinner, Empty } from '../../lib/ui.jsx';
import { api } from '../../lib/api.js';
import { useProject } from './ctx.jsx';

export function DocsTab() {
  const { id } = useProject();
  const toast = useToast();
  const [tree, setTree] = useState(null);
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const d = await api('/projects/' + id + '/files/tree'); setTree(d.tree); } catch (e) { toast(e.message, 'error'); } };
  useEffect(() => { load(); }, []);
  const regen = async () => {
    setBusy(true);
    try { const r = await api('/projects/' + id + '/docs', { body: {} }); toast('Regenerated ' + r.count + ' documentation file(s) from the live spec + DB', 'ok'); await load(); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const mdFiles = [];
  const walk = (n) => { n.children.forEach((c) => { if (c.type === 'dir') walk(c); else if (c.name.endsWith('.md')) mdFiles.push(c); }); };
  if (tree) walk(tree);
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head row-between">
        <div><h1>Documentation</h1><div className="sub">Generated from the compiled spec and the live database — README, architecture, API reference, database, setup & deployment guides. Re-generate any time; docs update, never fabricate.</div></div>
        <button className="btn primary" onClick={regen} disabled={busy}>{busy ? <Spinner /> : '↻ Regenerate docs'}</button>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 8 }}>
          {mdFiles.length === 0 ? <Empty icon="📚" title="No docs yet">Run a build or press Regenerate.</Empty> : mdFiles.map((f) => (
            <button key={f.path} className="file-node" onClick={() => setDoc(f.path)} style={{ display: 'block' }}><span className="file-ico">📄</span><span className="mono">{f.path}</span></button>
          ))}
        </div>
        <div>
          {doc ? <DocView path={doc} /> : <div className="card muted small">Select a document to read it — content is read from the actual generated files in the project.</div>}
        </div>
      </div>
    </div>
  );
}
function DocView({ path }) {
  const { id } = useProject();
  const [content, setContent] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api('/projects/' + id + '/files/content?path=' + encodeURIComponent(path)).then((d) => setContent(d.content)).catch((e) => setErr(e.message));
  }, [path]);
  if (err) return <div className="card"><div className="small" style={{ color: 'var(--err)' }}>{err}</div></div>;
  if (content == null) return <div className="center-load"><Spinner /></div>;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="pane-head" style={{ borderBottom: '1px solid var(--line)' }}><code className="mono">{path}</code></div>
      <div className="code-scroll" style={{ border: 'none', borderRadius: 0 }}><pre className="code-block">{content}</pre></div>
    </div>
  );
}
