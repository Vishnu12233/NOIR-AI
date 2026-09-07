// NOIR database layer — SQLite via better-sqlite3, WAL mode. Lazy statements:
// every accessor resolves the prepared statement on first call so the module can
// be imported before openDb() runs.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dbFile } from './config.js';

const stmts = new Map();
function stmt(sql) {
  if (!db) throw new Error('NOIR database is not open yet');
  let s = stmts.get(sql);
  if (!s) { s = db.prepare(sql); stmts.set(sql, s); }
  return s;
}

export let db = null;
export function openDb() {
  fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
  db = new Database(dbFile());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate();
  return db;
}
export function closeDb() { try { db && db.close(); } catch { /* noop */ } }

const MIGRATIONS = [`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT, verify_expires INTEGER, reset_token TEXT, reset_expires INTEGER,
  experience TEXT DEFAULT 'intermediate', preferred_stack TEXT DEFAULT 'react,node,postgres',
  theme TEXT DEFAULT 'dark', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions ( token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'idea',
  tech_stack TEXT DEFAULT '', source TEXT DEFAULT 'manual', template_key TEXT,
  favorite INTEGER NOT NULL DEFAULT 0, archive INTEGER NOT NULL DEFAULT 0, health_score INTEGER,
  path TEXT, root_dir TEXT, port INTEGER, built_at INTEGER, deployed_url TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS project_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL, content TEXT, kind TEXT DEFAULT 'file', mtime INTEGER, UNIQUE(project_id, rel_path)
);
CREATE TABLE IF NOT EXISTS env_vars (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL, value TEXT NOT NULL, masked INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, UNIQUE(project_id, key)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '', agent TEXT NOT NULL, deps TEXT NOT NULL DEFAULT '[]',
  priority TEXT DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'queued', kind TEXT DEFAULT 'build',
  result TEXT, error TEXT, attempt INTEGER NOT NULL DEFAULT 0, started_at INTEGER, completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL, message TEXT DEFAULT '', agent TEXT, approval TEXT DEFAULT 'auto',
  archive_path TEXT, diff_summary TEXT DEFAULT '', git_ref TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id TEXT NOT NULL, project_id TEXT,
  action TEXT NOT NULL, agent TEXT, tool TEXT, risk TEXT, result TEXT DEFAULT 'ok', detail TEXT DEFAULT '', version TEXT
);
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_connected', config TEXT DEFAULT '{}',
  error TEXT, updated_at INTEGER NOT NULL, UNIQUE(owner_id, provider)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id TEXT NOT NULL, project_id TEXT,
  icon TEXT DEFAULT '', text TEXT NOT NULL, status TEXT DEFAULT 'ok'
);
CREATE TABLE IF NOT EXISTS run_servers (
  project_id TEXT PRIMARY KEY, pid INTEGER, port INTEGER, cwd TEXT, started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, log_file TEXT
);
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id TEXT NOT NULL,
  kind TEXT NOT NULL, project_id TEXT, cost REAL DEFAULT 0, detail TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_memory_project ON project_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON project_files(project_id);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, scope TEXT NOT NULL DEFAULT 'assistant',
  role TEXT NOT NULL, content TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_ctx ON chats(user_id, project_id, scope, id);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'developer',
  added_by TEXT, joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE projects ADD COLUMN team_id TEXT;
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
  provider TEXT NOT NULL, environment TEXT DEFAULT 'production',
  status TEXT DEFAULT 'queued',
  provider_project_id TEXT, provider_deployment_id TEXT,
  url TEXT, branch TEXT, commit_sha TEXT, repo TEXT,
  request TEXT, error TEXT, meta TEXT,
  started_at INTEGER, finished_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deployment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, deployment_id TEXT NOT NULL, ts INTEGER NOT NULL, level TEXT, text TEXT
);
CREATE INDEX IF NOT EXISTS idx_deploy_project ON deployments(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_logs ON deployment_logs(deployment_id, id);
CREATE TABLE IF NOT EXISTS oauth_sessions (
  state TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
  redirect_uri TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
`];
function migrate() {
  // statement-level, idempotent: a re-run ALTER (duplicate column) or existing
  // object must never abort the rest of the migration list.
  for (const m of MIGRATIONS) {
    for (const raw of m.split(';')) {
      const st = raw.trim();
      if (!st) continue;
      try { db.exec(st); }
      catch (e) { if (!/duplicate column|already exists/i.test(String(e.message || ''))) console.error('[db migrate]', String(e.message || e).slice(0, 300)); }
    }
  }
}

export const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

const now = () => Date.now();

// ---------------- users ----------------
export const users = {
  byId: (id) => stmt('SELECT * FROM users WHERE id = ?').get(id),
  byEmail: (email) => stmt('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()),
  create: (id, { email, name, password_hash, experience, preferred_stack }) => {
    const t = now();
    stmt('INSERT INTO users (id,email,name,password_hash,experience,preferred_stack,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id, String(email).toLowerCase(), name, password_hash, experience || 'intermediate', preferred_stack || 'react,node,postgres', t, t);
  },
  update: (id, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    stmt(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k]), now(), id);
  },
};

export const sessions = {
  create: (userId, tokenHash, ttlMs) => { const t = now(); stmt('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(tokenHash, userId, t, t + ttlMs); },
  get: (tokenHash) => stmt('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now()),
  delete: (tokenHash) => stmt('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash),
  deleteAllForUser: (userId) => stmt('DELETE FROM sessions WHERE user_id = ?').run(userId),
  cleanup: () => stmt('DELETE FROM sessions WHERE expires_at < ?').run(now()),
};

// ---------------- projects ----------------
export const teams = {
  create: (id, name, createdBy) => stmt('INSERT INTO teams (id,name,created_by,created_at) VALUES (?,?,?,?)').run(id, name, createdBy, now()),
  byId: (id) => stmt('SELECT * FROM teams WHERE id = ?').get(id),
  listForUser: (userId) => stmt('SELECT t.*, m.role AS my_role, (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id = t.id) AS member_count FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.name').all(userId),
  members: (teamId) => stmt('SELECT tm.*, u.email, u.name FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? ORDER BY tm.joined_at').all(teamId),
  memberRole: (teamId, userId) => { if (!teamId || !userId) return null; const r = stmt('SELECT role FROM team_members WHERE team_id=? AND user_id=?').get(teamId, userId); return r ? r.role : null; },
  addMember: (teamId, userId, role, addedBy) => stmt('INSERT INTO team_members (team_id,user_id,role,added_by,joined_at) VALUES (?,?,?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role').run(teamId, userId, role || 'developer', addedBy || null, now()),
  setRole: (teamId, userId, role) => stmt('UPDATE team_members SET role=? WHERE team_id=? AND user_id=?').run(role, teamId, userId),
  removeMember: (teamId, userId) => stmt('DELETE FROM team_members WHERE team_id=? AND user_id=?').run(teamId, userId),
  delete: (teamId) => stmt('DELETE FROM teams WHERE id=?').run(teamId),
  byUserTeam: (teamId, userId) => stmt('SELECT t.*, m.role AS my_role FROM teams t JOIN team_members m ON m.team_id = t.id WHERE t.id=? AND m.user_id=?').get(teamId, userId),
};

export const projects = {
  all: (ownerId) => stmt('SELECT * FROM projects WHERE owner_id = ? ORDER BY favorite DESC, updated_at DESC').all(ownerId),
  // projects the user owns OR that belong to teams they are a member of (multi-tenancy)
  allFor: (userId) => stmt(`SELECT p.*, CASE WHEN p.owner_id = ? THEN 'owner' ELSE m.role END AS my_role,
      (SELECT u.name FROM users u WHERE u.id = p.owner_id) AS owner_name
      FROM projects p LEFT JOIN team_members m ON p.team_id = m.team_id AND m.user_id = ?
      WHERE p.owner_id = ? OR (p.team_id IS NOT NULL AND m.user_id IS NOT NULL)
      ORDER BY p.favorite DESC, p.updated_at DESC`).all(userId, userId, userId),
  byId: (id) => stmt('SELECT * FROM projects WHERE id = ?').get(id),
  byIdOwner: (id, ownerId) => stmt('SELECT * FROM projects WHERE id = ? AND owner_id = ?').get(id, ownerId),
  roleFor: (id, userId) => {
    const p = stmt('SELECT * FROM projects WHERE id = ?').get(id);
    if (!p) return null;
    if (p.owner_id === userId) return { project: p, role: 'owner' };
    const role = teams.memberRole(p.team_id, userId);
    if (role) return { project: p, role };
    return { project: null, role: null };
  },
  create: (id, ownerId, { name, description, tech_stack, source, template_key, path }) => {
    const t = now();
    stmt('INSERT INTO projects (id,owner_id,name,description,tech_stack,source,template_key,path,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, ownerId, name, description || '', tech_stack || '', source || 'manual', template_key || null, path || null, t, t);
  },
  update: (id, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    stmt(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k]), now(), id);
  },
  touch: (id) => stmt('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), id),
  delete: (id) => stmt('DELETE FROM projects WHERE id = ?').run(id),
};

// ---------------- chat history (persistent AI conversations, Phases 13/19) ----------------
export const chats = {
  add: (userId, projectId, scope, role, content) => stmt('INSERT INTO chats (user_id,project_id,scope,role,content,ts) VALUES (?,?,?,?,?,?)').run(userId, projectId || null, scope || (projectId ? 'project' : 'assistant'), role, String(content || '').slice(0, 60000), now()),
  history: (userId, projectId, scope, limit = 60) => {
    const rows = projectId
      ? stmt('SELECT * FROM chats WHERE user_id=? AND project_id=? AND scope=? ORDER BY id DESC LIMIT ?').all(userId, projectId, scope || 'project', limit)
      : stmt('SELECT * FROM chats WHERE user_id=? AND project_id IS NULL AND scope=? ORDER BY id DESC LIMIT ?').all(userId, scope || 'assistant', limit);
    return rows.reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, ts: r.ts }));
  },
};

// ---------------- memory ----------------
export const memory = {
  add: (projectId, kind, content) => stmt('INSERT INTO project_memory (project_id,kind,content,created_at) VALUES (?,?,?,?)').run(projectId, kind, JSON.stringify(content), now()).lastInsertRowid,
  list: (projectId) => stmt('SELECT * FROM project_memory WHERE project_id = ? ORDER BY id').all(projectId).map((r) => ({ ...r, content: safeParse(r.content) })),
  byKind: (projectId, kind) => { const r = stmt('SELECT * FROM project_memory WHERE project_id = ? AND kind = ? ORDER BY id DESC LIMIT 1').get(projectId, kind); return r && { ...r, content: safeParse(r.content) }; },
  forget: (projectId, kind) => stmt('DELETE FROM project_memory WHERE project_id = ? AND kind = ?').run(projectId, kind),
};
function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

// ---------------- files registry ----------------
export const pfiles = {
  upsert: (projectId, relPath, content, kind) => stmt(`INSERT INTO project_files (project_id,rel_path,content,kind,mtime) VALUES (?,?,?,?,?)
    ON CONFLICT(project_id,rel_path) DO UPDATE SET content=excluded.content, kind=excluded.kind, mtime=excluded.mtime`).run(projectId, relPath, content, kind || 'file', now()),
  del: (projectId, relPath) => stmt('DELETE FROM project_files WHERE project_id=? AND rel_path=?').run(projectId, relPath),
  rename: (projectId, from, to) => stmt('UPDATE project_files SET rel_path=? WHERE project_id=? AND rel_path=?').run(to, projectId, from),
  list: (projectId) => stmt('SELECT rel_path FROM project_files WHERE project_id=?').all(projectId).map((r) => r.rel_path),
};

// ---------------- env vars ----------------
export const envVars = {
  all: (projectId) => stmt('SELECT * FROM env_vars WHERE project_id=? ORDER BY key').all(projectId),
  getValue: (projectId, key) => { const r = stmt('SELECT value FROM env_vars WHERE project_id=? AND key=?').get(projectId, key); return r ? r.value : null; },
  set: (projectId, key, value) => stmt(`INSERT INTO env_vars (project_id,key,value,created_at) VALUES (?,?,?,?)
    ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value`).run(projectId, key, value, now()),
  unset: (projectId, key) => stmt('DELETE FROM env_vars WHERE project_id=? AND key=?').run(projectId, key),
};

// ---------------- tasks ----------------
export const tasks = {
  all: (projectId) => stmt('SELECT * FROM tasks WHERE project_id=? ORDER BY id').all(projectId),
  get: (projectId, id) => stmt('SELECT * FROM tasks WHERE project_id=? AND id=?').get(projectId, id),
  create: (projectId, { id, title, description, agent, deps, priority, kind, status }) => stmt('INSERT INTO tasks (id,project_id,title,description,agent,deps,priority,status,kind,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, projectId, title, description || '', agent || 'Planner', deps ? JSON.stringify(deps) : '[]', priority || 'medium', status || 'queued', kind || 'build', now()),
  setStatus: (projectId, id, status, { error, result, attempt } = {}) => {
    const t = tasks.get(projectId, id); if (!t) return;
    const p = { status };
    if (error !== undefined) p.error = error ? String(error).slice(0, 4000) : null;
    if (result !== undefined) p.result = typeof result === 'string' ? result : JSON.stringify(result).slice(0, 12000);
    if (attempt !== undefined) p.attempt = attempt;
    if (status === 'running') p.started_at = now();
    if (['completed', 'failed', 'cancelled', 'blocked'].includes(status)) p.completed_at = now();
    const keys = Object.keys(p);
    stmt(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE project_id=? AND id=?`).run(...keys.map((k) => p[k]), projectId, id);
  },
  openCount: (projectId) => stmt(`SELECT COUNT(*) c FROM tasks WHERE project_id=? AND status NOT IN ('completed','cancelled','blocked','failed')`).get(projectId).c,
  clear: (projectId) => stmt('DELETE FROM tasks WHERE project_id=?').run(projectId),
};

// ---------------- checkpoints ----------------
export const checkpoints = {
  create: (id, projectId, { label, message, agent, archive_path, diff_summary, git_ref }) => stmt('INSERT INTO checkpoints (id,project_id,label,message,agent,approval,archive_path,diff_summary,git_ref,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, projectId, label, message || '', agent || 'NOIR', 'auto', archive_path || null, diff_summary || '', git_ref || null, now()),
  list: (projectId) => stmt('SELECT * FROM checkpoints WHERE project_id=? ORDER BY created_at DESC').all(projectId),
  byId: (id) => stmt('SELECT * FROM checkpoints WHERE id=?').get(id),
  byIdProject: (id, projectId) => stmt('SELECT * FROM checkpoints WHERE id=? AND project_id=?').get(id, projectId),
  del: (id) => stmt('DELETE FROM checkpoints WHERE id=?').run(id),
};

// ---------------- audit ----------------
export const audit = {
  log: ({ user_id, project_id, action, agent, tool, risk, result, detail, version }) => stmt('INSERT INTO audit_log (ts,user_id,project_id,action,agent,tool,risk,result,detail,version) VALUES (?,?,?,?,?,?,?,?,?,?)').run(now(), user_id, project_id || null, action, agent || null, tool || null, risk || 'low', result || 'ok', (detail || '').slice(0, 2000), version || null),
  list: (limit = 100) => stmt('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit),
  count: () => stmt('SELECT COUNT(*) c FROM audit_log').get().c,
  trim: (keep = 3000) => stmt('DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT ?)').run(keep),
};

// ---------------- integrations ----------------
export const integrations = {
  get: (ownerId, provider) => stmt('SELECT * FROM integrations WHERE owner_id=? AND provider=?').get(ownerId, provider),
  all: (ownerId) => stmt('SELECT * FROM integrations WHERE owner_id=?').all(ownerId),
  set: (ownerId, provider, status, configObj, error) => stmt(`INSERT INTO integrations (id,owner_id,provider,status,config,error,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(owner_id,provider) DO UPDATE SET status=excluded.status, config=excluded.config, error=excluded.error, updated_at=excluded.updated_at`).run(uuid(), ownerId, provider, status, JSON.stringify(configObj || {}), error || null, now()),
  remove: (ownerId, provider) => stmt('DELETE FROM integrations WHERE owner_id=? AND provider=?').run(ownerId, provider),
};

// ---------------- activity ----------------
export const activity = {
  add: (userId, projectId, icon, text, status = 'ok') => stmt('INSERT INTO activity (ts,user_id,project_id,icon,text,status) VALUES (?,?,?,?,?,?)').run(now(), userId, projectId || null, icon || '', text, status),
  forUser: (userId, limit = 60) => stmt('SELECT * FROM activity WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit),
  forProject: (projectId, limit = 120) => stmt('SELECT * FROM activity WHERE project_id=? ORDER BY id DESC LIMIT ?').all(projectId, limit),
};

// ---------------- run servers ----------------
export const runServers = {
  get: (projectId) => stmt('SELECT * FROM run_servers WHERE project_id=?').get(projectId),
  all: () => stmt('SELECT * FROM run_servers').all(),
  set: (projectId, { pid, port, cwd, log_file }) => stmt(`INSERT INTO run_servers (project_id,pid,port,cwd,started_at,last_seen,log_file) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(project_id) DO UPDATE SET pid=excluded.pid, port=excluded.port, cwd=excluded.cwd, started_at=excluded.started_at, last_seen=excluded.last_seen, log_file=excluded.log_file`).run(projectId, pid, port, cwd, now(), now(), log_file),
  remove: (projectId) => stmt('DELETE FROM run_servers WHERE project_id=?').run(projectId),
};

// ---------------- usage ----------------
export const usage = {
  add: (userId, kind, projectId, cost, detail) => stmt('INSERT INTO usage_events (ts,user_id,kind,project_id,cost,detail) VALUES (?,?,?,?,?,?)').run(now(), userId, kind, projectId || null, cost || 0, detail || ''),
  totals: (userId, days = 30) => { const since = now() - days * 864e5; return stmt('SELECT kind, COUNT(*) n, COALESCE(SUM(cost),0) cost FROM usage_events WHERE user_id=? AND ts>? GROUP BY kind').all(userId, since); },
  daily: (userId, days = 14) => { const since = now() - days * 864e5; return stmt(`SELECT date(ts/1000,'unixepoch','localtime') day, COUNT(*) n FROM usage_events WHERE user_id=? AND ts>? GROUP BY day ORDER BY day`).all(userId, since); },
  counts: (userId) => stmt('SELECT COUNT(*) n FROM usage_events WHERE user_id=?').get(userId).n,
};

// ---------------- deployments (real provider deploys + local deploys, Phase 21+) ----------------
export const deployments = {
  create: ({ id, user_id, project_id, provider, environment, request }) => stmt('INSERT INTO deployments (id,user_id,project_id,provider,environment,status,request,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, user_id, project_id, provider, environment || 'production', 'queued', JSON.stringify(request || {}).slice(0, 4000), now()),
  get: (id) => stmt('SELECT * FROM deployments WHERE id=?').get(id),
  byProject: (projectId, limit = 60) => stmt('SELECT * FROM deployments WHERE project_id=? ORDER BY created_at DESC LIMIT ?').all(projectId, limit),
  update: (id, fields) => {
    const keys = Object.keys(fields); if (!keys.length) return;
    stmt(`UPDATE deployments SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id=?`).run(...keys.map((k) => fields[k]), id);
  },
  addLog: (deploymentId, level, text) => stmt('INSERT INTO deployment_logs (deployment_id,ts,level,text) VALUES (?,?,?,?)').run(deploymentId, now(), level || 'info', String(text).slice(0, 4000)),
  logs: (deploymentId, afterId = 0, limit = 500) => stmt('SELECT * FROM deployment_logs WHERE deployment_id=? AND id>? ORDER BY id LIMIT ?').all(deploymentId, afterId, limit),
  lastLogId: (deploymentId) => { const r = stmt('SELECT COALESCE(MAX(id),0) m FROM deployment_logs WHERE deployment_id=?').get(deploymentId); return r.m; },
};

// ---------------- oauth state (provider OAuth callbacks) ----------------
export const oauth = {
  create: (state, userId, provider, redirectUri) => stmt('INSERT INTO oauth_sessions (state,user_id,provider,redirect_uri,created_at,expires_at) VALUES (?,?,?,?,?,?)').run(state, userId, provider, redirectUri || null, now(), now() + 600000),
  consume: (state) => { const r = stmt('SELECT * FROM oauth_sessions WHERE state=? AND expires_at>?').get(state, now()); if (r) stmt('DELETE FROM oauth_sessions WHERE state=?').run(state); return r; },
};

export const sysstats = () => {
  const c = stmt('SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM projects) projects,(SELECT COUNT(*) FROM tasks) tasks,(SELECT COUNT(*) FROM audit_log) audits').get();
  return { ...c, open_tasks_ever: c.tasks };
};
