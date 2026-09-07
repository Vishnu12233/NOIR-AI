// engine/workspace.js — registry of what lives in the runtime sandbox
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME } from './paths.js';
import { projects } from '../db.js';

export function findProjectInWorkspace(userId) {
  fs.mkdirSync(RUNTIME, { recursive: true });
  const out = [];
  for (const p of (userId ? projects.all(userId) : projects.all(''))) {
    try {
      const dir = p.path || path.join(RUNTIME, String(p.id));
      const stats = fs.existsSync(dir) ? fs.statSync(dir) : null;
      out.push({ project_id: p.id, name: p.name, dir, exists: !!stats, files: stats ? countFiles(dir) : 0 });
    } catch { /* skip */ }
  }
    return out;
}
function countFiles(dir, n = { c: 0 }) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.noir') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) countFiles(p, n);
      else n.c++;
      if (n.c > 5000) break;
    }
  } catch { /* noop */ }
  return n.c;
}
