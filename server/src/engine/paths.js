// Path helpers for generated projects (sandboxed under the runtime dir)
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

export const RUNTIME = config.sandbox.cwd;
export function projectDir(project) {
  return project.path || path.join(RUNTIME, safeSlug(project.name || project.id), project.id);
}
export function appDir(project, rootDir) {
  const dir = projectDir(project);
  return rootDir ? path.join(dir, rootDir) : dir;
}
export function safeSlug(s) {
  return String(s || 'p').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'p';
}
export function ensureRuntime() { fs.mkdirSync(RUNTIME, { recursive: true }); }
export function walkDir(dir, base = '', out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data') continue;
    const rel = base ? base + '/' + e.name : e.name;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, rel, out);
    else out.push(rel);
  }
  return out;
}
export const isTextFile = (rel) => !/[.](png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|gz|sqlite|db|jar)$/i.test(rel) && !rel.includes('/data/');
export function listFiles(project, rootDir) {
  const dir = appDir(project, rootDir);
  if (!fs.existsSync(dir)) return [];
  return walkDir(dir).filter((f) => isTextFile(f));
}
export function absPath(project, rootDir, rel) {
  const base = appDir(project, rootDir);
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(base)) throw new Error('Path escapes project root');
  return p;
}
