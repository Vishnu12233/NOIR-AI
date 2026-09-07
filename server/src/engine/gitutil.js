// gitutil.js — real git operations inside each generated project repository.
// Git push/pull to GitHub stays disabled until a GitHub integration is connected
// (OAuth tokens are never stored; see integrations).
import fs from 'node:fs';
import path from 'node:path';
import { sh } from './tools.js';
import { appDir } from './paths.js';

export async function ensureRepo(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndata/store.json\ndata/uploads/\n.noir/\n*.log\n.env\n');
    await sh('git init -b main 2>&1; git config user.email "noir@local"; git config user.name "NOIR"; git add -A; git -c user.email=noir@local -c user.name=NOIR commit -m "chore: initial project scaffold" --no-gpg-sign 2>&1', { cwd: dir, timeoutMs: 30000 });
  }
  return dir;
}

export async function gitExec(project, rootDir = '', op, args = {}) {
  const dir = appDir(project, rootDir);
  await ensureRepo(project, rootDir);
  let cmd = null;
  switch (op) {
    case 'status': cmd = 'git status --short --branch'; break;
    case 'diff': cmd = 'git diff --stat; echo ---; git diff -- ' + safeShell(String(args.path || '')); break;
    case 'commit': {
      const msg = String(args.message || 'NOIR checkpoint').slice(0, 200).replace(/["\\$`]/g, '');
      cmd = 'git add -A && git -c user.email=noir@local -c user.name=NOIR commit -m ' + JSON.stringify(msg) + ' --no-gpg-sign';
      break;
    }
    case 'branch': cmd = args.name ? ('git checkout -b ' + safeShell(String(args.name)) + ' 2>&1 || git checkout ' + safeShell(String(args.name))) : 'git branch --show-current; echo ---; git branch --format="%(refname:short)"'; break;
    case 'switch': cmd = 'git checkout ' + safeShell(String(args.name || '')) + ' 2>&1'; break;
    case 'log': cmd = 'git log --oneline -n ' + Math.min(Number(args.n || 30), 100); break;
    case 'push': return { ok: false, output: { error: 'GitHub is not connected. No remote is configured for this repository — push requires connecting GitHub in NOIR → Integrations (OAuth is never stored server-side).' } };
    default: return { ok: false, output: { error: 'unknown git op' } };
  }
  const r = await sh(cmd, { cwd: dir, timeoutMs: 40000 });
  const noop = r.code !== 0 && /nothing to commit|no changes added|up to date/i.test(r.output + r.error);
  if (noop) return { ok: true, note: 'Nothing to commit — the working tree is already clean.', output: { code: r.code, out: r.output.slice(-8000), err: r.error.slice(-2000) } };
  return { ok: r.code === 0, output: { code: r.code, out: r.output.slice(-8000), err: r.error.slice(-2000) } };
}

function safeShell(s) { return String(s || '').replace(/[;&|`$>\n]/g, '').slice(0, 200); }

export async function currentRevision(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  const r = await sh('git rev-parse --short HEAD', { cwd: dir });
  return r.code === 0 ? r.output.trim() : null;
}

/** Restore project to a checkpoint / previous state (destructive — caller confirms). */
export async function rollbackProject(project, rootDir = '', ref) {
  const dir = appDir(project, rootDir);
  const r = await sh('git stash -u 2>/dev/null; git checkout -- . 2>/dev/null; git reset --hard ' + safeShell(String(ref || 'HEAD')), { cwd: dir, timeoutMs: 40000 });
  if (r.code !== 0) return { error: 'Rollback failed: ' + (r.error || r.output).slice(0, 500) };
  const rev = await currentRevision(project, rootDir);
  return { ok: true, ref: String(ref), now_at: rev, output: (r.output + r.error).slice(-2000) };
}

/** Archive a checkpoint: commit current state; snapshot to .noir/checkpoints/<id> */
export async function checkpoint(project, rootDir, { id, label, message }) {
  const dir = appDir(project, rootDir);
  await ensureRepo(project, rootDir);
  // snapshot archive regardless; git commit may legitimately be a no-op when nothing changed
  const r = await sh('git add -A && git -c user.email=noir@local -c user.name=NOIR commit -m ' + JSON.stringify(String(label || 'checkpoint')) + ' --no-gpg-sign 2>&1; git rev-parse --short HEAD', { cwd: dir, timeoutMs: 40000 });
  const rev = r.output.trim().split('\n').pop();
  const snap = path.join(dir, '.noir', 'checkpoints', String(id));
  await sh('git archive --format=tar HEAD | (mkdir -p ' + JSON.stringify(snap) + ' && tar -xf - -C ' + JSON.stringify(snap) + ')', { cwd: dir, timeoutMs: 60000 });
  return { ref: rev, snapshot: snap, committed: true, output: (r.output + r.error).slice(-1200) };
}

/** list changed files with line counts (for diffs) */
export async function changedFiles(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  await ensureRepo(project, rootDir);
  const r = await sh('git status --porcelain; echo ===; git diff --numstat', { cwd: dir });
  const out = [];
  if (r.code === 0) {
    const [porcelain, numstat] = r.output.split('===');
    const nums = {};
    for (const line of String(numstat).split('\n')) {
      const m = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (m) nums[m[3]] = { added: m[1] === '-' ? 0 : Number(m[1]), removed: m[2] === '-' ? 0 : Number(m[2]) };
    }
    for (const line of String(porcelain).split('\n')) {
      const m = line.match(/^(..)\s+(.+)$/);
      if (m) {
        const [staged, unstaged] = m[1].split('');
        out.push({ file: m[2], state: statusLabel(staged, unstaged), ...(nums[m[2]] || { added: 0, removed: 0 }) });
      }
    }
  }
  return out;
}
function statusLabel(a, b) {
  if (a === '?' && b === '?') return 'untracked';
  if (a === 'D' || b === 'D') return 'deleted';
  if (a === 'A' || b === 'A') return 'added';
  if (a === 'R') return 'renamed';
  if (a || b) return 'modified';
  return 'clean';
}
