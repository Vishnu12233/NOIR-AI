// Code tab — file tree + editor + search; the virtual filesystem of the project.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast, Modal, ModalHead, Empty, Badge, Spinner } from '../../lib/ui.jsx';
import { useProject } from './ctx.jsx';
import { FilePlus, FolderPlus, Search, Save, Trash2, Pencil, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';

const ICON = (n) => {
  if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.jsx')) return '📜';
  if (n.endsWith('.css')) return '🎨';
  if (n.endsWith('.html')) return '🌐';
  if (n.endsWith('.json')) return '🧾';
  if (n.endsWith('.sql')) return '🗄️';
  if (n.endsWith('.md')) return '📄';
  if (/\.(png|jpe?g|gif|svg|webp)$/.test(n)) return '🖼️';
  if (n.endsWith('.log')) return '🪵';
  if (n.endsWith('.sh')) return '⚙️';
  return '·';
};

export function FilesTab() {
  const { id } = useProject();
  const toast = useToast();
  const [tree, setTree] = useState(null);
  const [open, setOpen] = useState({});      // expanded dirs path->bool
  const [current, setCurrent] = useState(null); // {path, content, saved}
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showDel, setShowDel] = useState(null);
  const [renPath, setRenPath] = useState(null);
  const [showImage, setShowImage] = useState(null);
  const editorRef = useRef(null);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try { const d = await api('/projects/' + id + '/files/tree'); setTree(d.tree); } catch (e) { toast(e.message, 'error'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const openFile = async (path) => {
    try {
      const d = await api('/projects/' + id + '/files/content?path=' + encodeURIComponent(path));
      setCurrent(d); setDirty(false);
      setOpen((o) => ({ ...o, [path]: true }));
    } catch (e) { toast(e.message, 'error'); }
  };
  const save = async () => {
    if (!current) return;
    try {
      await api('/projects/' + id + '/files/content', { method: 'PUT', body: { path: current.path, content: editorRef.current ? editorRef.current.value : current.content } });
      setDirty(false);
      toast('Saved ' + current.path, 'ok');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };
  const doSearch = async (ev) => {
    ev && ev.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try { const d = await api('/projects/' + id + '/code/search?q=' + encodeURIComponent(q)); setHits(d.hits); } catch (e) { toast(e.message, 'error'); }
    setSearching(false);
  };
  const toggleDir = (path) => setOpen((o) => ({ ...o, [path]: !o[path] }));
  const renderNode = (n, depth) => {
    const key = n.path || n.name;
    const pad = { paddingLeft: 8 + depth * 12 };
    if (n.type === 'dir') {
      const isOpen = n.path ? open[n.path] !== false : true;
      return (
        <div key={key}>
          <button className="file-node" style={{ ...pad, fontWeight: 650 }} onClick={() => toggleDir(n.path)}>
            <span className="file-ico">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>📁 <span>{n.name}</span>
          </button>
          {isOpen && n.children && n.children.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }
    const isBin = /\.(png|jpe?g|gif|webp|ico)$/.test(n.name);
    return (
      <button key={key} className={'file-node' + (current && current.path === n.path ? ' active' : '')} style={pad} onClick={() => (isBin ? setShowImage(n.path) : openFile(n.path))}>
        <span className="file-ico">{ICON(n.name)}</span><span className="mono">{n.name}</span>
      </button>
    );
  };
  const files = useMemo(() => {
    if (!current) return [];
    return current.path ? [current.path] : [];
  }, [current]);
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 133px)', minHeight: 420 }}>
      {/* left: tree */}
      <div className="ws-col ws-left" style={{ width: 280 }}>
        <div className="pane-head">
          <span>Files</span>
          <div className="row" style={{ gap: 2 }}>
            <button className="icon-btn" title="New file" onClick={() => setShowNew('file')}><FilePlus size={13} /></button>
            <button className="icon-btn" title="New folder" onClick={() => setShowNew('dir')}><FolderPlus size={13} /></button>
            <button className="icon-btn" title="Refresh" onClick={load}><RefreshCw size={13} /></button>
          </div>
        </div>
        <div className="pane-body" style={{ padding: 6 }}>
          {!tree ? <div className="center-load"><Spinner /></div> : tree.children.map((c) => renderNode(c, 0))}
        </div>
      </div>
      {/* center: editor / search */}
      <div className="ws-col" style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--line)' }}>
        <div className="pane-head" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <form onSubmit={doSearch} className="row" style={{ gap: 4 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search code…" style={{ width: 190, padding: '3px 8px', fontSize: 12, borderRadius: 6 }} />
            <button className="btn sm ghost" style={{ padding: '3px 8px' }}><Search size={12} /></button>
          </form>
          {hits.length ? <span className="tiny faint">{hits.length} hit(s)</span> : null}
          {current && <Badge tone={dirty ? 'warn' : 'muted'}>{dirty ? 'unsaved' : current.kind || 'generated'}</Badge>}
          <span className="flex1" />
          {current && (
            <>
              <button className="btn sm" onClick={() => openFile(current.path)} title="Reload from disk">Reload</button>
              <button className="btn sm primary" onClick={save} disabled={!dirty}>Save</button>
              <button className="btn sm ghost" onClick={() => setRenPath(current.path)} title="Rename"><Pencil size={12} /></button>
              <button className="btn sm ghost" onClick={() => setShowDel(current.path)}><Trash2 size={12} /></button>
            </>
          )}
        </div>
        <div className="pane-body" style={{ overflow: 'hidden' }}>
          {searching ? <div className="center-load"><Spinner /> Searching…</div> :
            hits.length ? (
              <div className="pane-body" style={{ padding: 6 }}>
                {hits.map((h, i) => (
                  <button key={i} className="file-node" style={{ padding: '5px 8px', display: 'block', width: '100%', textAlign: 'left' }} onClick={() => openFile(h.file)}>
                    <span className="mono tiny" style={{ color: 'var(--gold)' }}>{h.file}:{h.line}</span>
                    <div className="mono small" style={{ color: 'var(--muted)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{h.snippet}</div>
                  </button>
                ))}
              </div>
            ) : !current ? (
              <Empty icon="📁" title="Select a file">Browse the tree to open files. Everything NOIR generated is editable — changes are real and applied to the running project.</Empty>
            ) : (
              <div className="pane-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="pane-head" style={{ height: 'auto', border: 'none', padding: '8px 14px 0' }}>
                  <code style={{ fontSize: 12 }}>{current.path}</code><span className="flex1" />
                  <span className="tiny faint mono">{current.size} B</span>
                </div>
                <textarea
                  ref={editorRef}
                  defaultValue={current.content}
                  onChange={(e) => { setDirty(e.target.value !== current.content); }}
                  spellCheck={false}
                  className="mono"
                  style={{ flex: 1, border: 'none', borderRadius: 0, background: 'var(--bg)', padding: '10px 14px', fontSize: 12.6, lineHeight: 1.6, whiteSpace: 'pre', overflow: 'auto', width: '100%', boxShadow: 'none' }}
                />
              </div>
            )}
        </div>
      </div>
      {showNew && (
        <NewFileModal kind={showNew} onClose={() => setShowNew(false)} onDone={async (path) => { await load(); openFile(path); setShowNew(false); }} />
      )}
      {showDel && (
        <Modal onClose={() => setShowDel(null)}>
          <ModalHead title="Delete file?" onClose={() => setShowDel(null)} sub={showDel} />
          <p className="small muted">This permanently removes the file from the project. For critical operations NOIR asks for explicit confirmation — this is one of them.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setShowDel(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => {
              try { await api('/projects/' + id + '/files/delete', { body: { path: showDel } }); toast('Deleted ' + showDel, 'ok'); setShowDel(null); if (current && current.path === showDel) setCurrent(null); load(); }
              catch (e) { toast(e.message, 'error'); }
            }}>Delete permanently</button>
          </div>
        </Modal>
      )}
      {renPath && (
        <RenameModal path={renPath} onClose={() => setRenPath(null)} onDone={async (to) => { await api('/projects/' + id + '/files/rename', { body: { from: renPath, to } }); load(); if (current) { setCurrent(null); openFile(to); } setRenPath(null); toast('Renamed', 'ok'); }} />
      )}
      {showImage && (
        <Modal onClose={() => setShowImage(null)} wide>
          <ModalHead title={showImage} onClose={() => setShowImage(null)} />
          <img src={'/api/projects/' + id + '/files/raw?path=' + encodeURIComponent(showImage)} alt={showImage} style={{ maxHeight: '70vh', margin: '0 auto', display: 'block' }} />
        </Modal>
      )}
    </div>
  );
}

function NewFileModal({ kind, onClose, onDone }) {
  const { id } = useProject();
  const [path, setPath] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose}>
      <ModalHead title={kind === 'dir' ? 'New folder' : 'New file'} onClose={onClose} sub={'Relative to project root (' + id + ')'} />
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try {
          if (kind === 'dir') { await api('/projects/' + id + '/files', { body: { path, directory: true } }); onClose(); }
          else { await api('/projects/' + id + '/files', { body: { path, content } }); onDone(path); }
        } catch (e2) { alert(e2.message); setBusy(false); }
      }}>
        <label>Path</label>
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder={kind === 'dir' ? 'src/utils' : 'src/util.js'} autoFocus required />
        {kind === 'file' ? <><label>Initial content <span className="faint">(optional)</span></label><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} /></> : null}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? <Spinner /> : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
function RenameModal({ path, onClose, onDone }) {
  const [to, setTo] = useState(path);
  return (
    <Modal onClose={onClose}>
      <ModalHead title="Rename / move" onClose={onClose} sub={path} />
      <form onSubmit={(e) => { e.preventDefault(); onDone(to); }}>
        <label>New path</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary">Rename</button>
        </div>
      </form>
    </Modal>
  );
}
