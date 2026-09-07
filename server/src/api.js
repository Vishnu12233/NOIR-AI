// api.js — NOIR platform HTTP API (mounted under /api on the Express server).
import express from 'express';
import Zip from 'adm-zip';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  db, users, sessions, projects, teams, memory, pfiles, envVars, tasks, checkpoints, audit,
  integrations, activity, runServers, usage, uuid, chats, deployments, oauth,
} from './db.js';
import { config, AI_MODEL_KEYS } from './config.js';
import { hashPassword, verifyPassword, randomToken, sha256, sign, unsign, mask, publicUser } from './crypto.js';
import { analyzeRequirement, enhanceWithAi } from './engine/analyze.js';
import { compileSpec } from './gen/spec.js';
import { generateProject, writeProjectTo, paletteTheme } from './gen/project.js';
import { projectDir, listFiles, absPath, isTextFile, appDir } from './engine/paths.js';
import {
  AGENTS, PIPELINE_STEPS, orchestrateBuild, cancelBuild, rerunStep, pipelineStatus,
  broadcast, eventLog, publicTask, publicAnalysis, subscribe,
} from './engine/orchestrate.js';
import { runTool, TOOL_DEFS, sh } from './engine/tools.js';
import { inspectAppApi } from './engine/inspect.js';
import { connectToken, connection, repoOnGithub, pushProject, repoSlug, oauthStart, oauthFinish } from './engine/github.js';
import { runTestSuite } from './engine/tests.js';
import { runnerStatus, startProject, stopProject, readLogs, watchdog, projectRuntimeInfo } from './engine/runner.js';
import { securityScan, performanceAnalyzer, a11yScan, seoScan, projectHealth } from './engine/scans.js';
import { databaseSummary, inspectDatabase, runMigration, createDatabase } from './engine/dbops.js';
import { gitExec, changedFiles, rollbackProject, currentRevision, checkpoint } from './engine/gitutil.js';
import { extractPairs, planReplacements, applyPlan, lineDiff } from './engine/patch.js';
import { deployProject, preflight, DEPLOY_TARGETS } from './engine/deploy.js';
import { connectProvider, testProvider, statusProvider, disconnectProvider, provider as providerFacade } from './providers/manager.js';
import { CAPABILITY_REGISTRY as CAPS } from './providers/capabilities.js';
import { runDeployment, startWorker, workerBusy, passSecret, safeReq } from './engine/clouddeploy.js';
import { SupabaseProvider } from './providers/supabase/index.js';
import { buildDocs } from './engine/docgen.js';
import { TEMPLATES, PALETTES } from './gen/defs.js';
import { aiComplete, aiStreamComplete, configuredProviders, PROVIDERS, MODES } from './engine/ai.js';
import { findProjectInWorkspace } from './engine/workspace.js';

export const app = express();
const API = express.Router();
app.disable('x-powered-by');
// JSON body parsing is scoped to /api — the preview proxy must stream raw
// bodies to generated apps untouched (app-wide parsing used to swallow POSTs).
app.use('/api', express.json({ limit: '8mb' }));

// ---------- helpers ----------
function publicProject(p) {
  return {
    ...p,
    running: !!(p.port && runnerStatus(p.id)),
  };
}
function projectForUser(pid, userId) {
  const r = projects.roleFor(pid, userId);
  return r && r.project ? { p: r.project, role: r.role } : null;
}
function getProject(req) {
  const acc = projectForUser(req.params.id, req.user.id);
  if (!acc) return null;
  req.projectRole = acc.role;
  return acc.p;
}
// ---- role matrix (multi-tenancy): the project owner is always 'owner' ----
const LEVELS = { viewer: 0, reviewer: 1, developer: 2, admin: 3, owner: 3 };
const ROLE_RULES = [
  // admin (owner/admin) — destructive / credential / external side-effect ops
  [3, 'delete', '/projects/:id'], [3, 'put', '/projects/:id/env'], [3, 'delete', '/projects/:id/env'], [3, 'delete', '/projects/:id/env/:key'],
  [3, 'post', '/projects/:id/deploy'], [3, 'post', '/projects/:id/deployments'], [3, 'post', '/projects/:id/deployments/resume'],
  [3, 'post', '/projects/:id/github/push'], [3, 'post', '/projects/:id/team'],
  [3, 'post', '/projects/:id/database/create'], [3, 'post', '/projects/:id/database/migrate'],
  [3, 'post', '/projects/:id/checkpoints/restore'],
  // developer — code/build/run operations
  [2, 'patch', '/projects/:id'], [2, 'put', '/projects/:id/files/content'], [2, 'post', '/projects/:id/files'],
  [2, 'post', '/projects/:id/files/delete'], [2, 'post', '/projects/:id/files/rename'],
  [2, 'post', '/projects/:id/terminal'], [2, 'post', '/projects/:id/run'], [2, 'post', '/projects/:id/stop'],
  [2, 'post', '/projects/:id/build'], [2, 'post', '/projects/:id/rerun'], [2, 'post', '/projects/:id/spec'], [2, 'post', '/projects/:id/change'],
  [2, 'post', '/projects/:id/patch/apply'], [2, 'post', '/projects/:id/git/commit'], [2, 'post', '/projects/:id/git/branch'], [2, 'post', '/projects/:id/git/switch'],
  [2, 'post', '/projects/:id/tests/fix'], [2, 'post', '/projects/:id/checkpoints'], [2, 'post', '/projects/:id/checkpoints/fork'], [2, 'post', '/projects/:id/duplicate'],
  [2, 'post', '/projects/:id/memory'],
  // reviewer — read-adjacent actions that execute safely in the sandbox
  [1, 'post', '/projects/:id/analyze'], [1, 'post', '/projects/:id/tests/run'], [1, 'post', '/projects/:id/docs'], [1, 'post', '/projects/:id/api/try'],
];
function roleRequired(method, routePath) {
  if (!routePath) return 0;
  for (const [lvl, m, p] of ROLE_RULES) if (m === method.toLowerCase() && p === routePath) return lvl;
  return 0; // reads (GET) and everything unlisted are view-level
}
function activeProject(req, res) {
  const p = getProject(req);
  if (!p) { res.status(404).json({ ok: false, error: 'Project not found' }); return null; }
  const need = roleRequired(req.method, req.route ? req.route.path : '');
  const role = req.projectRole || 'owner';
  if ((LEVELS[role] ?? 0) < need) {
    res.status(403).json({ ok: false, error: 'Your role (' + role + ') on this project does not allow that operation.', code: 'ROLE_FORBIDDEN', role, required: Object.keys(LEVELS).find((k) => LEVELS[k] === need) });
    return null;
  }
  return p;
}
const ROOT_DIR = (p) => p.root_dir || '';

// ---------- session auth middleware ----------
function auth(req, res, next) {
  const header = req.headers['x-noir-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const tok = header || (req.cookies ? req.cookies.noir_token : null) || parseCookie(req, 'noir_token');
  const s = tok ? sessions.get(sha256(tok)) : null;
  if (!s) return res.status(401).json({ ok: false, error: 'Authentication required.', code: 'UNAUTHENTICATED' });
  const u = users.byId(s.user_id);
  if (!u) return res.status(401).json({ ok: false, error: 'Account no longer exists.' });
  req.user = u;
  next();
}
function parseCookie(req, name) {
  const c = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='));
  return c ? c.slice(name.length + 1) : null;
}
function setSessionCookie(res, token) {
  res.cookie('noir_token', token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: config.sessionTtlMs, path: '/' });
}


const json = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, status, error, code) => res.status(status).json({ ok: false, error, code: code || 'ERROR' });

// =============== PUBLIC ===============
API.get('/health', (req, res) => json(res, { ok: true, service: 'noir', time: new Date().toISOString(), version: '1.0.0' }));

// ---------- auth ----------
API.post('/auth/signup', (req, res) => {
  const { email, name, password, experience, preferred_stack } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return fail(res, 400, 'Enter a valid email address.', 'BAD_EMAIL');
  if (!password || String(password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.', 'WEAK_PASSWORD');
  if (users.byEmail(email)) return fail(res, 409, 'An account with this email already exists. Sign in instead.', 'EMAIL_TAKEN');
  const id = uuid();
  users.create(id, { email, name: String(name || '').slice(0, 80) || email.split('@')[0], password_hash: hashPassword(password), experience, preferred_stack });
  const token = randomToken();
  sessions.create(id, sha256(token), config.sessionTtlMs);
  setSessionCookie(res, token);
  activity.add(id, null, '✨', 'Account created — welcome to NOIR.');
  usage.add(id, 'auth', null, 0, 'signup');
  audit.log({ user_id: id, action: 'auth.signup', result: 'ok', risk: 'low' });
  json(res, { user: publicUser(users.byId(id)), token }, 201);
});

API.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = users.byEmail(email || '');
  // constant-shape response for unknown users
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) {
    return fail(res, 401, 'Incorrect email or password.', 'BAD_CREDENTIALS');
  }
  const token = randomToken();
  sessions.create(u.id, sha256(token), config.sessionTtlMs);
  setSessionCookie(res, token);
  activity.add(u.id, null, '👋', 'Signed in.');
  usage.add(u.id, 'auth', null, 0, 'login');
  json(res, { user: publicUser(users.byId(u.id)), token });
});

API.post('/auth/logout', auth, (req, res) => {
  const t = parseCookie(req, 'noir_token');
  if (t) sessions.delete(sha256(t));
  res.clearCookie('noir_token');
  activity.add(req.user.id, null, '👋', 'Signed out.');
  json(res, { signed_out: true });
});

API.get('/auth/me', auth, (req, res) => json(res, { user: publicUser(users.byId(req.user.id)) }));
API.patch('/auth/me', auth, (req, res) => {
  const { name, experience, preferred_stack, theme } = req.body || {};
  const patch = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim().slice(0, 80);
  if (['beginner', 'intermediate', 'advanced'].includes(experience)) patch.experience = experience;
  if (typeof preferred_stack === 'string' && preferred_stack.length < 200) patch.preferred_stack = preferred_stack;
  if (['dark', 'light'].includes(theme)) patch.theme = theme;
  users.update(req.user.id, patch);
  json(res, { user: publicUser(users.byId(req.user.id)) });
});

API.post('/auth/password', auth, (req, res) => {
  const { current, next } = req.body || {};
  const u = users.byId(req.user.id);
  if (!verifyPassword(String(current || ''), u.password_hash)) return fail(res, 401, 'Current password is incorrect.', 'BAD_CURRENT');
  if (!next || String(next).length < 8) return fail(res, 400, 'New password must be at least 8 characters.');
  users.update(u.id, { password_hash: hashPassword(String(next)) });
  sessions.deleteAllForUser(u.id);
  audit.log({ user_id: u.id, action: 'auth.password_change', risk: 'low', result: 'ok' });
  json(res, { changed: true });
});

// forgot/reset password — real token flow (delivery link is shown in-app in sandbox mode)
API.post('/auth/forgot', (req, res) => {
  const u = users.byEmail((req.body || {}).email || '');
  if (!u) return json(res, { sent: true }); // never reveal account existence
  const t = sign({ uid: u.id, purpose: 'reset' }, 1000 * 60 * 30);
  users.update(u.id, { reset_token: sha256(t), reset_expires: Date.now() + 1000 * 60 * 30 });
  audit.log({ user_id: u.id, action: 'auth.reset_requested', risk: 'low', result: 'ok' });
  json(res, { sent: true, preview_link: '/#/reset-password?token=' + t });
});
API.post('/auth/reset', (req, res) => {
  const { token, password } = req.body || {};
  const data = unsign(String(token || ''));
  const u = data && data.purpose === 'reset' ? users.byId(data.uid) : null;
  if (!u || !u.reset_token || u.reset_token !== sha256(String(token)) || !u.reset_expires || u.reset_expires < Date.now()) {
    return fail(res, 400, 'This reset link is invalid or has expired. Request a new one.', 'BAD_TOKEN');
  }
  if (!password || String(password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
  users.update(u.id, { password_hash: hashPassword(String(password)), reset_token: null, reset_expires: null });
  sessions.deleteAllForUser(u.id);
  audit.log({ user_id: u.id, action: 'auth.reset_done', risk: 'low', result: 'ok' });
  json(res, { changed: true });
});
API.post('/auth/verify', (req, res) => {
  const { token } = req.body || {};
  const data = unsign(String(token || ''));
  const u = data && data.purpose === 'verify' ? users.byId(data.uid) : null;
  if (!u) return fail(res, 400, 'Invalid verification link.', 'BAD_TOKEN');
  users.update(u.id, { email_verified: 1, verify_token: null, verify_expires: null });
  json(res, { verified: true });
});
API.post('/auth/resend-verification', auth, (req, res) => {
  const u = users.byId(req.user.id);
  if (u.email_verified) return json(res, { already_verified: true });
  const t = sign({ uid: u.id, purpose: 'verify' }, 1000 * 60 * 60 * 24);
  users.update(u.id, { verify_token: sha256(t), verify_expires: Date.now() + 1000 * 60 * 60 * 24 });
  json(res, { sent: true, preview_link: '/#/verify-email?token=' + t });
});

// ---------- workspace (saved NOIR session files) ----------
API.get('/workspace', auth, (req, res) => json(res, { files: findProjectInWorkspace(req.user.id) }));

// =============== AUTH-GUARDED ===============
API.use('/projects', auth);
API.use('/assistant', auth);
API.use('/integrations', auth);
API.use('/activity', auth);
API.use('/usage', auth);
API.use('/settings', auth);
API.use('/audit', auth);
API.use('/teams', auth);
API.use('/deployments', auth);

// ---------- projects ----------
API.get('/projects', (req, res) => {
  json(res, { projects: projects.allFor(req.user.id).map((p) => publicProject(p)) });
});
API.get('/projects/stats', (req, res) => {
  const ps = projects.allFor(req.user.id);
  json(res, {
    total: ps.length,
    running: ps.filter((p) => p.port && runnerStatus(p.id)).length,
    building: ps.filter((p) => p.status === 'building').length,
    favorites: ps.filter((p) => p.favorite).length,
    archived: ps.filter((p) => p.archive).length,
  });
});
API.post('/projects', (req, res) => {
  const { name, description, source, template_key, analysis } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, 400, 'Project name is required.');
  const id = uuid();
  const dir = projectDir({ id, name });
  projects.create(id, req.user.id, {
    name: String(name).slice(0, 80), description: String(description || '').slice(0, 4000),
    source: source || 'manual', template_key: template_key || null, path: dir,
  });
  const p = projects.byId(id);
  audit.log({ user_id: req.user.id, project_id: id, action: 'project.create', risk: 'low', result: 'ok', detail: p.name });
  activity.add(req.user.id, id, '📁', 'Project "' + p.name + '" created.');
  json(res, { project: publicProject(p) }, 201);
});
API.get('/projects/:id', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const analysis = memory.byKind(p.id, 'analysis');
  const spec = memory.byKind(p.id, 'spec');
  const t = p.team_id ? teams.byId(p.team_id) : null;
  json(res, {
    project: { ...publicProject(p), my_role: req.projectRole || 'owner', team_name: t ? t.name : null }, 
    runtime: projectRuntimeInfo(p),
    analysis: analysis ? analysis.content : null,
    spec: spec ? stripSpec(spec.content) : null,
    tasks: tasks.all(p.id).map(publicTask),
    pipeline: pipelineStatus(p.id),
  });
});
API.patch('/projects/:id', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const allowed = ['name', 'description', 'favorite', 'archive'];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === 'name') { if (req.body[k].trim()) patch.name = String(req.body[k]).slice(0, 80); }
      else if (k === 'description') patch.description = String(req.body[k]).slice(0, 4000);
      else if (k === 'favorite' || k === 'archive') patch[k] = req.body[k] ? 1 : 0;
    }
  }
  projects.update(p.id, patch);
  if (patch.favorite !== undefined) activity.add(req.user.id, p.id, patch.favorite ? '⭐' : '☆', patch.favorite ? 'Favorited project.' : 'Removed favorite.');
  json(res, { project: publicProject(projects.byId(p.id)) });
});
API.delete('/projects/:id', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  await stopProject(p).catch(() => null);
  const dir = p.path || projectDir(p);
  try { fs.rmSync(path.join(dir, '..', p.id), { recursive: true, force: true }); } catch { /* noop */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  projects.delete(p.id);
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'project.delete', risk: 'high', result: 'ok' });
  activity.add(req.user.id, null, '🗑️', 'Project "' + p.name + '" deleted.');
  json(res, { deleted: true });
});
API.post('/projects/:id/duplicate', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const id = uuid();
  const copyName = (p.name + ' (copy)').slice(0, 80);
  projects.create(id, req.user.id, { name: copyName, description: p.description, tech_stack: p.tech_stack, source: p.source, template_key: p.template_key });
  const specEntry = memory.byKind(p.id, 'spec');
  if (specEntry) memory.add(id, 'spec', specEntry.content);
  const an = memory.byKind(p.id, 'analysis');
  if (an) memory.add(id, 'analysis', an.content);
  // copy the real filesystem so the duplicate is fully independent (manual edits included)
  const srcDir = p.path || projectDir(p);
  const newObj = { id, name: copyName, path: projectDir({ id, name: copyName }) };
  if (fs.existsSync(srcDir)) {
    try {
      copyProjectDir(srcDir, newObj.path, { withGit: false });
      projects.update(id, { path: newObj.path });
      for (const rel of listFiles(newObj, '')) pfiles.upsert(id, rel, 'user', 'file');
    } catch (e) { eventLog(req.user.id, id, '⚠️', 'Filesystem copy failed (project still usable — rebuild regenerates files): ' + String(e.message || e).slice(0, 140), 'error'); }
  }
  activity.add(req.user.id, id, '📄', 'Duplicated from "' + p.name + '" — independent workspace; environment variables are not copied.');
  audit.log({ user_id: req.user.id, project_id: id, action: 'project.duplicate', risk: 'low', result: 'ok', detail: 'from ' + p.id });
  json(res, { project: publicProject(projects.byId(id)) }, 201);
});

// ---------- pipeline ----------
API.post('/projects/:id/build', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { prompt, spec, mode } = req.body || {};
  let specOverride = null;
  if (spec && typeof spec === 'object') {
    // assemble spec from editable structure: { name, category, features[], auth, seed, entity? }
    const fs2 = (spec.features || []).map((f) => (typeof f === 'string' ? f : f.key));
    specOverride = compileSpec({
      name: spec.name || p.name, tagline: spec.tagline || null, category: spec.category || 'general',
      entityKey: spec.entity || null, features: fs2, withSeed: spec.seed !== false, light: spec.light,
    });
    memory.forget(p.id, 'spec'); memory.add(p.id, 'spec', specOverride);
    memory.add(p.id, 'note', { kind: 'spec_edited', at: new Date().toISOString(), by: req.user.email });
    p.description = spec.name ? spec.name : p.description;
  }
  const r = await orchestrateBuild({ project: p, user_id: req.user.id, prompt: prompt || null, specOverride, mode: mode || 'full' });
  if (r.error) return fail(res, 409, r.error, 'BUSY');
  json(res, { started: true });
});
API.post('/projects/:id/build/cancel', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  await cancelBuild(p, req.user.id);
  json(res, { cancelled: true });
});
API.post('/projects/:id/rerun', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const step = (req.body || {}).step;
  if (!PIPELINE_STEPS.includes(step)) return fail(res, 400, 'Unknown pipeline step.');
  const r = await rerunStep(p, req.user.id, step);
  json(res, r);
});

// ---------- analyze ----------
API.post('/projects/:id/analyze', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const prompt = (req.body || {}).prompt || p.description || '';
  const analysis = analyzeRequirement(prompt);
  const envMap = Object.fromEntries(envVars.all(p.id).map((e) => [e.key, e.value]));
  const enhanced = await enhanceWithAi(analysis, prompt, envMap);
  memory.forget(p.id, 'analysis'); memory.add(p.id, 'analysis', { prompt, ...enhanced, at: new Date().toISOString() });
  activity.add(req.user.id, p.id, '🧠', 'Requirements analyzed.');
  json(res, { analysis: publicAnalysis(enhanced) });
});
API.post('/projects/:id/spec', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const body = (req.body || {}).spec;
  if (!body || typeof body !== 'object') return fail(res, 400, 'spec object required');
  const fs2 = (body.features || []).map((f) => (typeof f === 'string' ? f : f.key));
  const compiled = compileSpec({
    name: body.name || p.name, tagline: body.tagline || '', category: body.category || 'general',
    entityKey: body.entity || null, features: fs2, withSeed: body.seed !== false, light: !!body.light,
  });
  memory.forget(p.id, 'spec'); memory.add(p.id, 'spec', compiled);
  projects.update(p.id, { name: compiled.name });
  json(res, { spec: stripSpec(compiled) });
});
function stripSpec(spec) {
  if (!spec || spec._stripped) return spec;
  return {
    ...spec, _stripped: true,
    seed: undefined,
    tables: (spec.tables || []).map((t) => ({
      table: t.table, label: t.label, client: t.client, guarded: !!t.guarded, main: !!t.main,
      fields: t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, unique: !!f.unique, options: f.options || undefined, private: !!f.private, hidden: !!f.hidden })),
    })),
    features: (spec.features || []).map((f) => (typeof f === 'string' ? f : f.key)),
    nav: spec.nav,
  };
}

// ---------- filesystem ----------
function fileMeta(p, rel) {
  const f = pfiles.list(p.id).includes(rel) ? 'generated' : 'user';
  const abs = absPath(p, ROOT_DIR(p), rel);
  let st = null; try { st = fs.statSync(abs); } catch { st = null; }
  return { rel_path: rel, kind: f, size: st ? st.size : 0, mtime: st ? st.mtimeMs : null };
}
function treeOf(p) {
  const files = listFiles(p, ROOT_DIR(p));
  const root = { name: '📦', type: 'dir', children: [] };
  for (const f of files) {
    const parts = f.split('/');
    let node = root;
    let acc = '';
    parts.forEach((part, i) => {
      acc = acc ? acc + '/' + part : part;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: acc, type: i === parts.length - 1 ? 'file' : 'dir', children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n) => {
    n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}
API.get('/projects/:id/files/tree', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  json(res, { tree: treeOf(p), count: pfiles.list(p.id).length });
});
API.get('/projects/:id/files/search', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const q = String(req.query.q || '');
  const files = listFiles(p, ROOT_DIR(p)).filter((f) => !q || f.toLowerCase().includes(q.toLowerCase()));
  json(res, { files: files.slice(0, 200) });
});
API.get('/projects/:id/files/content', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rel = String(req.query.path || '');
  try {
    const abs = absPath(p, ROOT_DIR(p), rel);
    const content = fs.readFileSync(abs, 'utf8');
    json(res, { path: rel, content, ...fileMeta(p, rel), code_search: null });
  } catch (e) { fail(res, 404, 'File not found: ' + rel); }
});
API.put('/projects/:id/files/content', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rel = String((req.body || {}).path || '');
  const content = String((req.body || {}).content ?? '');
  try {
    const abs = absPath(p, ROOT_DIR(p), rel);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    pfiles.upsert(p.id, rel, content, 'user');
    pfiles.touch ? projects.touch(p.id) : null;
    const rec = await runTool({ tool: 'update_file', args: { rel_path: rel, content }, project: p });
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'file.save', tool: 'update_file', risk: 'medium', result: 'ok', detail: rel });
    projects.touch(p.id);
    // stop the running app if a server file changed? restart is explicit; log hint
    json(res, { saved: true, path: rel, bytes: content.length, changed: before !== content });
  } catch (e) { fail(res, 400, String(e.message || e)); }
});
API.post('/projects/:id/files', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rel = String((req.body || {}).path || '').replace(/^\/+/, '');
  const isDir = !!((req.body || {}).directory);
  try {
    if (isDir) { fs.mkdirSync(absPath(p, ROOT_DIR(p), rel), { recursive: true }); }
    else {
      const content = String((req.body || {}).content ?? '');
      fs.mkdirSync(path.dirname(absPath(p, ROOT_DIR(p), rel)), { recursive: true });
      fs.writeFileSync(absPath(p, ROOT_DIR(p), rel), content);
      pfiles.upsert(p.id, rel, content, 'user');
    }
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'file.create', risk: 'medium', result: 'ok', detail: rel });
    activity.add(req.user.id, p.id, '📝', 'Created ' + rel);
    json(res, { created: rel });
  } catch (e) { fail(res, 400, String(e.message || e)); }
});
API.post('/projects/:id/files/delete', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rel = String((req.body || {}).path || '');
  try {
    const abs = absPath(p, ROOT_DIR(p), rel);
    fs.rmSync(abs, { recursive: true, force: true });
    pfiles.del(p.id, rel);
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'file.delete', tool: 'delete_file', risk: 'high', result: 'ok', detail: rel });
    activity.add(req.user.id, p.id, '🗑️', 'Deleted ' + rel);
    json(res, { deleted: rel });
  } catch (e) { fail(res, 400, String(e.message || e)); }
});
API.post('/projects/:id/files/rename', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { from, to } = req.body || {};
  try {
    fs.renameSync(absPath(p, ROOT_DIR(p), from), absPath(p, ROOT_DIR(p), to));
    pfiles.rename(p.id, from, to);
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'file.rename', risk: 'medium', result: 'ok', detail: from + ' → ' + to });
    json(res, { renamed: { from, to } });
  } catch (e) { fail(res, 400, String(e.message || e)); }
});
API.get('/projects/:id/code/search', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const needle = String(req.query.q || '');
  const hits = [];
  if (needle.length > 1) {
    for (const f of listFiles(p, ROOT_DIR(p)).filter(isTextFile)) {
      try {
        const lines = fs.readFileSync(absPath(p, ROOT_DIR(p), f), 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) {
          hits.push({ file: f, line: i + 1, snippet: lines[i].trim().slice(0, 140) });
          if (hits.length > 300) break;
        }
      } catch { /* noop */ }
      if (hits.length > 300) break;
    }
  }
  json(res, { q: needle, hits });
});

// ---------- tools ----------
API.get('/projects/:id/tools', (req, res) => json(res, { tools: TOOL_DEFS }));
API.post('/projects/:id/tools/run', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { tool, args } = req.body || {};
  const def = TOOL_DEFS.find((t) => t.name === tool);
  if (!def) return fail(res, 400, 'Unknown tool: ' + tool);
  const rec = await runTool({ tool, args: args || {}, project: p, rootDir: ROOT_DIR(p) });
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'tool.run', tool, risk: def.risk, result: rec.status === 'completed' ? 'ok' : 'failed', detail: JSON.stringify(rec.args).slice(0, 200) });
  usage.add(req.user.id, 'tool', p.id, 0, tool);
  if (tool === 'run_project') broadcast(p.id, { type: 'preview', status: 'starting' });
  json(res, rec);
});

// ---------- terminal (secure: executes in project dir only) ----------
API.post('/projects/:id/terminal', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const cmd = String((req.body || {}).command || '').trim();
  if (!cmd) return fail(res, 400, 'Empty command.');
  if (/^\s*(rm\s+-rf\s+\/|mkfs|dd\s|:\(\)|sudo\s|shutdown|reboot|killall)/.test(cmd)) return fail(res, 403, 'Command blocked by NOIR sandbox policy.');
  const rec = await runTool({ tool: 'execute_command', args: { command: cmd, timeoutMs: 60000, allowFailure: true }, project: p, rootDir: ROOT_DIR(p) });
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'terminal.run', tool: 'execute_command', risk: 'medium', result: rec.status, detail: cmd.slice(0, 150) });
  json(res, rec);
});

// ---------- runner ----------
API.post('/projects/:id/run', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  try {
    const info = await startProject(p, ROOT_DIR(p));
    activity.add(req.user.id, p.id, '▶️', 'App started (port ' + info.port + ').');
    json(res, { running: true, ...info });
  } catch (e) { fail(res, 500, String(e.message || e).slice(0, 1200), 'RUN_FAILED'); }
});
API.post('/projects/:id/stop', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  await stopProject(p);
  activity.add(req.user.id, p.id, '⏹️', 'App stopped.');
  json(res, { stopped: true });
});
API.get('/projects/:id/logs', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const tail = await readLogs(p, Number(req.query.lines || 300));
  const run = projectRuntimeInfo(p);
  json(res, { tail, running: run.running, port: run.port || null, pid: run.pid || null, since: run.since || null });
});

// ---------- tests ----------
API.post('/projects/:id/tests/run', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const result = await runTestSuite(p, ROOT_DIR(p));
  usage.add(req.user.id, 'test', p.id, 0, '');
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'tests.run', tool: 'run_tests', risk: 'medium', result: result.ok ? 'ok' : 'failed', detail: result.passed + '/' + result.failed });
  eventLog(req.user.id, p.id, '🧪', 'Test run executed: ' + result.passed + ' passed · ' + result.failed + ' failed.');
  json(res, result);
});
API.post('/projects/:id/tests/fix', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const r = await rerunStep(p, req.user.id, 'test');
  json(res, { reQueued: true });
});

// ---------- database ----------
API.get('/projects/:id/database', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const summary = await databaseSummary(p, ROOT_DIR(p));
  const inspect = await inspectDatabase(p, ROOT_DIR(p), req.query.table || null);
  json(res, { summary, inspect });
});
API.post('/projects/:id/database/create', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const r = await createDatabase(p, ROOT_DIR(p), (req.body || {}).args || {});
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'db.create', risk: 'medium', result: r.error ? 'failed' : 'ok', detail: r.backend || '' });
  json(res, r);
});
API.post('/projects/:id/database/migrate', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const sql = String((req.body || {}).sql || '');
  const r = await runMigration(p, ROOT_DIR(p), sql);
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'db.migrate', risk: 'high', result: r.error ? 'failed' : 'ok' });
  if (r.error) return fail(res, 400, r.error);
  json(res, r);
});

// ---------- env vars ----------
API.get('/projects/:id/env', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  json(res, { vars: envVars.all(p.id).map((e) => ({ key: e.key, masked: !!e.masked, value_hint: e.masked ? mask(e.value) : '', value: !e.masked ? e.value : '', created_at: e.created_at })) });
});
API.put('/projects/:id/env', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { key, value } = req.body || {};
  if (!key || !/^[A-Z][A-Z0-9_]*$/.test(String(key))) return fail(res, 400, 'Keys must look like DATABASE_URL (uppercase, underscores).');
  const rows = envVars.all(p.id);
  if (!value && !rows.find((r) => r.key === key)) return fail(res, 400, 'Provide a value.');
  if (rows.length >= config.limits.envVarsPerProject && !rows.find((r) => r.key === key)) return fail(res, 400, 'Environment limit (' + config.limits.envVarsPerProject + ') reached.');
  if (value !== undefined) envVars.set(p.id, String(key), String(value));
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'env.set', risk: 'high', result: 'ok', detail: key + ' (masked — values never logged)' });
  eventLog(req.user.id, p.id, '🔐', 'Environment variable ' + key + ' ' + (value ? 'set/updated' : 'removed') + '.');
  json(res, { saved: key });
});
API.delete('/projects/:id/env/:key', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  envVars.unset(p.id, req.params.key);
  json(res, { deleted: req.params.key });
});

// ---------- checkpoints / versions ----------
API.get('/projects/:id/checkpoints', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rev = await currentRevision(p, ROOT_DIR(p));
  json(res, { checkpoints: checkpoints.list(p.id), current_revision: rev });
});
API.post('/projects/:id/checkpoints', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const cid = 'CP-' + Date.now().toString(36);
  const label = String((req.body || {}).label || 'Manual checkpoint').slice(0, 120);
  try {
    const cp = await checkpoint(p, ROOT_DIR(p), { id: cid, label, message: 'Created by ' + req.user.email });
    checkpoints.create(cid, p.id, { label, message: 'Created by ' + req.user.email, agent: 'User', diff_summary: '', git_ref: cp.ref });
    eventLog(req.user.id, p.id, '📌', 'Checkpoint created (' + (cp.ref || cid) + ').');
    json(res, { created: cid, ref: cp.ref || null });
  } catch (e) { fail(res, 500, String(e.message || e)); }
});
API.post('/projects/:id/checkpoints/restore', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const cid = String((req.body || {}).id || '');
  const cp = checkpoints.byIdProject(cid, p.id);
  if (!cp) return fail(res, 404, 'Checkpoint not found.');
  // verify against git
  const rev = await currentRevision(p, ROOT_DIR(p));
  const ref = cp.git_ref && cp.git_ref !== rev ? cp.git_ref : 'HEAD';
  await stopProject(p).catch(() => null);
  const r = await rollbackProject(p, ROOT_DIR(p), ref).catch((e) => ({ error: e.message }));
  if (r.error) return fail(res, 500, r.error);
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'checkpoint.restore', risk: 'high', result: 'ok', detail: cid + ' @ ' + ref });
  eventLog(req.user.id, p.id, '⏪', 'Restored checkpoint ' + cp.label + '.');
  json(res, { restored: cid, ref, note: 'Restart the app to apply the restored code.' });
});

API.post('/projects/:id/checkpoints/fork', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const cid = String((req.body || {}).id || '');
  const cp = checkpoints.byIdProject(cid, p.id);
  if (!cp) return fail(res, 404, 'Checkpoint not found.');
  const srcDir = p.path || projectDir(p);
  if (!fs.existsSync(srcDir)) return fail(res, 409, 'No generated code exists to fork from.', 'NO_FILES');
  const id = uuid();
  const name = p.name + ' (fork @ ' + String(cp.git_ref || cid).slice(0, 7) + ')';
  projects.create(id, req.user.id, { name: name.slice(0, 80), description: p.description, tech_stack: p.tech_stack, source: p.source, template_key: p.template_key, status: 'idea' });
  const newObj = { id, name, path: projectDir({ id, name }) };
  try {
    copyProjectDir(srcDir, newObj.path, { withGit: true });
    const ref = cp.git_ref || 'HEAD';
    const r = await rollbackProject(newObj, '', ref).catch((e) => ({ error: e.message }));
    if (r && r.error) throw new Error(r.error);
    projects.update(id, { path: newObj.path });
    for (const rel of listFiles(newObj, '')) pfiles.upsert(id, rel, 'user', 'file');
    checkpoints.create('CP-' + Date.now().toString(36), id, { label: cp.label + ' (fork)', message: 'Forked from checkpoint ' + cp.id, agent: 'NOIR', diff_summary: '', git_ref: ref });
    const specEntry = memory.byKind(p.id, 'spec'); if (specEntry) memory.add(id, 'spec', specEntry.content);
    activity.add(req.user.id, id, '🍴', 'Forked from checkpoint ' + cp.label + ' of \"' + p.name + '\" (independent workspace).');
    audit.log({ user_id: req.user.id, project_id: id, action: 'checkpoint.fork', risk: 'medium', result: 'ok', detail: cid + ' @ ' + ref });
    eventLog(req.user.id, id, '🍴', 'Forked project at version ' + String(ref).slice(0, 7) + '.');
    json(res, { project: publicProject(projects.byId(id)) }, 201);
  } catch (e) {
    try { fs.rmSync(newObj.path, { recursive: true, force: true }); } catch { /* noop */ }
    fail(res, 500, 'Fork failed: ' + String(e.message || e).slice(0, 300));
  }
});

const gitOut = (o) => (typeof o === 'string' ? o : (o && (o.out || o.err || o.error)) || '');
function parseBranches(text) {
  const lines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const current = lines[0] && lines[0] !== '---' ? lines[0] : null;
  return { current, list: lines.slice(1).filter((l) => l !== '---') };
}

// ---------- git ----------
API.get('/projects/:id/git', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rev = await currentRevision(p, ROOT_DIR(p));
  const status = await gitExec(p, ROOT_DIR(p), 'status', {});
  const changes = await changedFiles(p, ROOT_DIR(p)).catch(() => []);
  let branches = { current: null, list: [] };
  try { branches = parseBranches(gitOut((await gitExec(p, ROOT_DIR(p), 'branch', {})).output)); } catch { /* repo may have no commits yet */ }
  json(res, { revision: rev, status: gitOut(status.output), changes, branches });
});
API.post('/projects/:id/git/branch', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const name = String((req.body || {}).name || '').trim().replace(/[^a-z0-9._\/-]/gi, '').slice(0, 60);
  if (!name) return fail(res, 400, 'Provide a branch name.');
  const r = await gitExec(p, ROOT_DIR(p), 'branch', { name });
  let current = null;
  try { current = parseBranches(gitOut((await gitExec(p, ROOT_DIR(p), 'branch', {})).output)).current; } catch { /* ignore */ }
  if (r.ok) { eventLog(req.user.id, p.id, '🌿', 'On branch ' + current + ' (created ' + name + ').'); audit.log({ user_id: req.user.id, project_id: p.id, action: 'git.branch', risk: 'medium', result: 'ok', detail: name }); }
  json(res, { ok: r.ok, current, error: r.ok ? null : gitOut(r.output) });
});
API.post('/projects/:id/git/switch', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const name = String((req.body || {}).name || '').trim().replace(/[^a-z0-9._\/-]/gi, '').slice(0, 60);
  if (!name) return fail(res, 400, 'Provide a branch name.');
  const r = await gitExec(p, ROOT_DIR(p), 'switch', { name });
  let current = null;
  try { current = parseBranches(gitOut((await gitExec(p, ROOT_DIR(p), 'branch', {})).output)).current; } catch { /* ignore */ }
  if (r.ok) eventLog(req.user.id, p.id, '🌿', 'Switched to branch ' + current + '.');
  json(res, { ok: r.ok, current, error: r.ok ? null : gitOut(r.output) });
});
API.post('/projects/:id/git/commit', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const msg = String((req.body || {}).message || 'NOIR update');
  const r = await gitExec(p, ROOT_DIR(p), 'commit', { message: msg });
  const rev = await currentRevision(p, ROOT_DIR(p));
  if (r.ok) eventLog(req.user.id, p.id, '📦', 'Git commit created (' + (rev || '') + ').');
  json(res, { ...r, revision: rev });
});

// ---------- deployments ----------
API.get('/projects/:id/deploy/status', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { deploymentStatus } = await import('./engine/deploy.js');
  const status = await deploymentStatus(p);
  json(res, { status, targets: DEPLOY_TARGETS });
});
API.post('/projects/:id/deploy', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const target = String((req.body || {}).target || 'local');
  projects.update(p.id, { status: 'deploying' });
  eventLog(req.user.id, p.id, '🚀', 'Deployment to "' + target + '" started.', 'running');
  try {
    const out = await deployProject(p, target, { user_id: req.user.id });
    if (out.state === 'live') projects.update(p.id, { status: 'live', deployed_url: out.url });
    else if (out.state === 'failed') projects.update(p.id, { status: 'failed' });
    else projects.update(p.id, { status: projects.byId(p.id).status === 'deploying' ? 'running' : projects.byId(p.id).status });
    eventLog(req.user.id, p.id, out.state === 'live' ? '✅' : '⚠️', out.state === 'live' ? 'Deployment is live.' : 'Deployment ' + out.state + (out.error ? ': ' + out.error.slice(0, 160) : ''), out.state === 'live' ? 'ok' : 'error');
    json(res, out);
  } catch (e) { fail(res, 500, String(e.message || e)); }
});

// ---------- assistant / chat ----------
// Streaming variant (SSE): real token deltas when an AI provider is configured;
// built-in answers arrive as a single event (nothing to stream — no fake typing).
API.post('/assistant/chat/stream', async (req, res) => {
  const { messages, project_id } = req.body || {};
  const envMap = getEnvMapFor(req.user.id);
  const accP = project_id ? projectForUser(project_id, req.user.id) : null;
  const project = accP ? accP.p : null;
  const msgList = Array.isArray(messages) ? messages.slice(-12) : [];
  const userMsg = (msgList[msgList.length - 1] || {}).content || '';
  const sendSse = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch { /* closed */ } };
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  // 1) built-in answers are final by nature — delivered as one honest event
  const builtin = await builtinAssistant(userMsg, project, req.user);
  if (builtin.answered) {
    try { chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'user', userMsg); chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'assistant', builtin.reply || ''); } catch { /* noop */ }
    sendSse({ type: 'delta', text: builtin.reply || '', provider: null, builtin: true, mode: builtin.mode, actions: builtin.actions || [], patch: builtin.patch || null });
    sendSse({ type: 'done' });
    res.end();
    return;
  }
  // 2) real model streaming when a provider is configured
  const provider = configuredProviders(envMap)[0];
  if (!provider) { sendSse({ type: 'error', message: 'No AI provider key is configured — add one in Settings → AI Providers to stream model responses.' }); sendSse({ type: 'done' }); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  let full = '';
  try {
    chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'user', userMsg);
    const r = await aiStreamComplete({ mode: 'auto', system: buildSystemPrompt(project, req.user), prompt: userMsg, envVars: envMap, maxTokens: 900, onDelta: (d) => { full += d; sendSse({ type: 'delta', text: d, provider: provider.id, builtin: false }); } });
    if (r.builtin && !r.content) throw new Error(r.error || 'Provider call failed.');
    if (!r.streamed) sendSse({ type: 'delta', text: r.content || '', provider: r.provider, builtin: false });
    full = r.content || full;
    if (full) chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'assistant', full);
    usage.add(req.user.id, 'ai_request', project_id || null, 0.002, r.provider || 'stream');
    audit.log({ user_id: req.user.id, project_id: project_id || null, action: 'assistant.chat.stream', risk: 'low', result: 'ok', detail: (r.provider || 'stream') });
  } catch (e) { sendSse({ type: 'error', message: String(e.message || e) }); }
  sendSse({ type: 'done' });
  res.end();
});

API.get('/assistant/history', (req, res) => {
  const pid = (req.query.project_id || '').trim();
  let projectId = null;
  if (pid) {
    const acc = projectForUser(pid, req.user.id);
    if (!acc) return fail(res, 404, 'Project not found');
    projectId = pid;
  }
  const scope = projectId ? 'project' : 'assistant';
  json(res, { messages: chats.history(req.user.id, projectId, scope, Number(req.query.limit || 60)) });
});
API.get('/projects/:id/chat', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  json(res, { messages: chats.history(req.user.id, p.id, 'project', Number(req.query.limit || 60)) });
});
API.get('/assistant/state', (req, res) => {
  const envMap = getEnvMapFor(req.user.id);
  json(res, {
    providers: configuredProviders(envMap),
    providersMeta: PROVIDERS.map((p) => ({ ...p, configured: !!envMap[p.key] })),
    modes: MODES,
    modelKeys: AI_MODEL_KEYS,
    mode: 'auto',
  });
});
API.post('/assistant/chat', async (req, res) => {
  const { messages, project_id } = req.body || {};
  const envMap = getEnvMapFor(req.user.id);
  const accP = project_id ? projectForUser(project_id, req.user.id) : null;
  const project = accP ? accP.p : null;
  const msgList = Array.isArray(messages) ? messages.slice(-12) : [];
  const userMsg = (msgList[msgList.length - 1] || {}).content || '';
  const builtin = await builtinAssistant(userMsg, project, req.user);
  if (builtin.answered) {
    usage.add(req.user.id, 'ai_request', project_id || null, 0, 'builtin:' + builtin.mode);
    try { chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'user', userMsg); chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'assistant', builtin.reply || ''); } catch { /* noop */ }
    return json(res, builtin);
  }
  const system = buildSystemPrompt(project, req.user);
  const r = await aiComplete({ mode: 'auto', system, prompt: userMsg, envVars: envMap, maxTokens: 900 });
  usage.add(req.user.id, 'ai_request', project_id || null, r.provider ? 0.002 : 0, r.provider || 'builtin');
  audit.log({ user_id: req.user.id, project_id: project_id || null, action: 'assistant.chat', risk: 'low', result: 'ok', detail: (r.provider || 'builtin') + ' · ' + userMsg.slice(0, 120) });
  try { chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'user', userMsg); chats.add(req.user.id, project_id, project_id ? 'project' : 'assistant', 'assistant', r.content || ''); } catch { /* noop */ }
  json(res, {
    reply: r.content || 'No provider key is configured, and this question needs live model access. Add an AI provider key (OPENAI_API_KEY etc.) in Settings → AI Providers — NOIR will route to it automatically.',
    provider: r.provider || null,
    builtin: r.builtin || false,
    project: project ? { id: project.id, name: project.name } : null,
    suggestions: suggestActions(userMsg, project),
  });
});

function getEnvMapFor(userId) {
  const map = {};
  const ints = integrations.all(userId);
  for (const i of ints) {
    const cfg = safeParseObj(i.config);
    for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'XAI_API_KEY', 'CUSTOM_AI_API_KEY', 'CUSTOM_AI_BASE']) {
      if (cfg[k]) map[k] = cfg[k];
    }
  }
  return map;
}
function safeParseObj(s) { try { return JSON.parse(s); } catch { return {}; } }

async function builtinAssistant(q, project, user) {
  const t = String(q || '').toLowerCase();
  const isBuildAsk = /\b(build|create|make|generate|start|scaffold|prototype)\b/.test(t) && /\b(app|application|site|website|web app|platform|tool|portal|system|store|shop|dashboard|crm|saas|blog|cms|bot|chatbot|game|mvp|starter|landing)\b/.test(t) && !/(another|second|new)\s+(one|version)/.test(t);
  if (!project) {
    if (isBuildAsk) {
      return {
        answered: true, builtin: true, mode: 'to_build', provider: null,
        reply: 'You asked NOIR to **build** — no project is open yet, so I will take you straight to the builder with your idea pre-filled.\n\nThere NOIR will: analyze the requirement → compile an editable spec (pages, features, database, API) → plan real agent tasks → generate, install, run, test, security-scan → show a live preview. No limits on how many apps you create or how often you rebuild.',
        actions: [{ label: 'Build with NOIR →', route: '/create?prompt=' + encodeURIComponent(String(q || '').slice(0, 400)) }],
      };
    }
    if (/template|starter|example/.test(t)) {
      return {
        answered: true, builtin: true, mode: 'templates', provider: null,
        reply: 'You are not inside a project yet. Two ways to start:\n\n1. **Create with NOIR** → describe your idea and review the spec before the team builds.\n2. Pick a **template** (SaaS, CRM, E-commerce, Blog, Education, Healthcare…) — NOIR generates a full spec you can edit before building.\n\nNOIR analyzes requirements, plans the architecture, builds, runs, tests and reports — no prompt-copying needed.',
        actions: [{ label: 'Open Templates', route: '/templates' }, { label: 'Create with NOIR', route: '/create' }],
      };
    }
    if (/\b(add|remove|fix|deploy|test|run|change|update|improve|search|payment|login|auth)\b/.test(t)) {
      return {
        answered: true, builtin: true, mode: 'nocontext', provider: null,
        reply: 'That request targets an **existing app**, but no project is selected. Pick a project in the dropdown above (or say which one), and NOIR will inspect it before changing anything — or describe a new idea and I will open the builder for it.',
        actions: [{ label: 'Open my projects', route: '/app/projects' }, { label: 'Build a new app', route: '/create' }],
      };
    }
    return { answered: false };
  }
  if (isBuildAsk && /(another|one more|a second|new (app|application|site|platform))/.test(t)) {
    return {
      answered: true, builtin: true, mode: 'to_build', provider: null,
      reply: 'You asked NOIR to build a **new** app while **' + project.name + '** is open — no problem, projects are unlimited and independent. Your idea goes to the builder pre-filled; this project stays untouched.',
      actions: [{ label: 'Build the new app →', route: '/create?prompt=' + encodeURIComponent(String(q || '').slice(0, 400)) }],
    };
  }
  const files = listFiles(project, ROOT_DIR(project));
  const spec = memory.byKind(project.id, 'spec');
  const run = projectRuntimeInfo(project);
  if (/^(hi|hello|hey)\b/.test(t)) return { answered: true, builtin: true, mode: 'hello', reply: 'Hi ' + (user.name || 'there') + ' — I am NOIR, your engineering teammate for **' + project.name + '**. I can explain the project, plan changes, run the pipeline, or dig into failures. What should we work on?', project: { id: project.id, name: project.name } };
  if (/(explain|describe|understand|what is|overview).*(project|this|app|code|architecture)/.test(t) || t.includes('project summary')) {
    const specC = spec ? spec.content : null;
    const health = memory.list(project.id).filter((m) => m.kind === 'note' && m.content && m.content.kind === 'health').slice(-1)[0];
    return {
      answered: true, builtin: true, mode: 'context', provider: null,
      reply: '**' + project.name + '** — status: ' + project.status + ' · ' + (run.running ? 'running on port ' + run.port : 'not running') + ' · ' + files.length + ' files' + (health ? ' · health ' + health.content.overall + '/100' : '') + '.\n\n' + (specC ? 'Spec: ' + specC.category_key + ' app, main table `' + specC.main + '`, ' + specC.tables.length + ' tables (' + specC.tables.map((x) => x.table).join(', ') + ') · auth ' + (specC.auth ? 'enabled' : 'off') + '. ' : '') + (specC && specC.features.length ? 'Features: ' + specC.features.join(', ') + '.' : '') + '\n\nSource of truth is the project spec + memory — open the workspace to explore files, DB, tests and health.',
      project: { id: project.id, name: project.name },
    };
  }
  if (/why is (login|auth|sign)/.test(t) || /login (failing|error|broken)/.test(t)) {
    const hits = [];
    for (const f of files) if (/server\.js$/.test(f)) {
      const c = fs.readFileSync(absPath(project, ROOT_DIR(project), f), 'utf8');
      const lines = c.split('\n');
      for (let i = 0; i < lines.length; i++) if (lines[i].includes('BAD_CREDENTIALS') || lines[i].includes('Incorrect email or password')) hits.push({ file: f, line: i + 1 });
    }
    return {
      answered: true, builtin: true, mode: 'debug', provider: null,
      reply: 'Login failures in generated apps come from four real causes:\n1. **Wrong credentials** — password hashes use scrypt + per-user salt (server/src crypto). Demo accounts: ava@noir.app / demo123.\n2. **Hashing mismatch** — only relevant after manual edits.\n3. **Session cookie** — the app sets an HttpOnly cookie; API tests must send it back.\n4. **Users table state** — check Database explorer: `users` must contain the row.\n' + (hits.length ? 'The check lives at ' + hits.map((h) => h.file + ':' + h.line).join(', ') + '.' : '') + '\nI can rerun the test suite to verify: run **Tests → Run** in the workspace.',
      project: { id: project.id, name: project.name },
      actions: [{ label: 'Run tests', route: '/project/' + project.id + '?tab=testing' }],
    };
  }
  // code-level patch intent: an explicit "old → new" text edit beats feature-level rules
  const patchPairs = extractPairs(q);
  if (project && patchPairs.length && /(change|replace|rename|set|update|fix|make|swap|edit)/.test(t)) {
    try {
      const plan = planReplacements(project, ROOT_DIR(project), patchPairs);
      const nFiles = plan.reduce((n, x) => n + x.files.length, 0);
      return {
        answered: true, builtin: true, mode: 'patch_preview', provider: null,
        reply: 'I found **' + nFiles + ' file(s)** containing text you asked to change. This is a code-level edit — nothing is applied until you approve. Review the diff below, then approve to apply (a safety checkpoint is created first, and tests re-run automatically for server-side files).',
        project: { id: project.id, name: project.name },
        patch: { prompt: q, plan },
      };
    } catch (e) {
      return { answered: true, builtin: true, mode: 'patch_miss', provider: null, reply: String(e.message || e).slice(0, 400), project: { id: project.id, name: project.name } };
    }
  }
  if (/(add|remove|implement|include|enable).*(search|payment|checkout|billing|chat|assistant|upload|chart|comment|notif|admin dashboard|role|login|auth|csv|export|dark mode)/.test(t) && project) {
    return {
      answered: true, builtin: true, mode: 'change', provider: null,
      reply: 'I can apply that as a spec-level change to **' + project.name + '** — NOIR updates the compiled spec, snapshots a safety checkpoint, then rebuilds and re-tests so nothing silently breaks.\n\nReview the change in the Build tab before it runs; manual files you added stay untouched, and the previous version stays restorable.',
      project: { id: project.id, name: project.name },
      actions: [{ label: 'Review & apply change', route: '/project/' + project.id + '?tab=build&change=' + encodeURIComponent(String(q || '').slice(0, 200)) }],
    };
  }
  if (/run tests|execute tests|test suite/.test(t)) {
    return {
      answered: true, builtin: true, mode: 'action', provider: null,
      reply: 'Go to the **Testing** tab in this project and press *Run tests* — NOIR executes `node --test` against the live server and reports real pass/fail counts with failure locations. I never report tests as passed unless they executed.',
      project: { id: project.id, name: project.name },
      actions: [{ label: 'Open Testing', route: '/project/' + project.id + '?tab=testing' }],
    };
  }
  if (/deploy|ship|go live/.test(t)) {
    return {
      answered: true, builtin: true, mode: 'action', provider: null,
      reply: 'Deployment runs a real preflight (entrypoint, tests, security scan, environment, database) and then deploys to the NOIR local runtime. External providers (Vercel, Supabase…) require real credentials — NOIR will never simulate them.\n\nOpen **Deploy** in this project to review the preflight checklist and start.',
      project: { id: project.id, name: project.name },
      actions: [{ label: 'Open Deploy', route: '/project/' + project.id + '?tab=deploy' }],
    };
  }
  if (/status|pipeline|progress/.test(t)) {
    const pl = pipelineStatus(project.id);
    const line = pl.steps.map((s) => s.label + ':' + s.status).join(' · ');
    return { answered: true, builtin: true, mode: 'status', provider: null, reply: 'Pipeline status — ' + line + '.\n\nOpen the workspace Tasks tab for agent details and tool logs.', project: { id: project.id, name: project.name } };
  }
  return { answered: false };
}

function buildSystemPrompt(project, user) {
  let ctx = '';
  if (project) {
    const spec = memory.byKind(project.id, 'spec');
    const files = listFiles(project, ROOT_DIR(project));
    const health = memory.byKind(project.id, 'note');
    ctx = [
      'You are working inside project "' + project.name + '" (status ' + project.status + ').',
      spec ? 'Spec: category ' + spec.content.category_key + '; tables: ' + spec.content.tables.map((t) => t.table).join(', ') + '; auth: ' + spec.content.auth + '; features: ' + (spec.content.features || []).join(', ') : 'No compiled spec yet.',
      'Files: ' + files.length + ' (frontend: vanilla ES modules in src/; API: zero-dependency Node server; storage: JSON file DB or Postgres via DATABASE_URL).',
      'Respond as a senior engineer: short, concrete, and reference files by path. If the user asks for a change, describe the exact files to touch and offer to run the build pipeline. You cannot lie about executed work — say what must run.',
    ].join('\n');
  }
  return 'You are NOIR, an AI software engineering teammate inside the NOIR platform. Tone: professional, direct, developer-first.\n' + ctx;
}

function suggestActions(q, project) {
  const t = String(q || '').toLowerCase();
  const out = [];
  if (/(add|make|create|build|implement|support)/.test(t)) out.push({ label: 'Open builder', route: project ? '/project/' + project.id + '?tab=build' : '/create' });
  if (/fix|error|bug|fail/.test(t)) out.push({ label: 'Open tasks', route: '/project/' + project.id + '?tab=tasks' });
  return out.slice(0, 2);
}

// ---------- templates ----------
API.get('/templates', auth, (req, res) => {
  json(res, { templates: TEMPLATES.map((t) => ({ ...t, specs: TEMPLATE_SPECS[t.key] || null })) });
});
import { TEMPLATE_SPECS } from './engine/templates.js';

// ---------- natural-language change planner ----------
const FEATURE_MATCH = [
  ['payments', /pay|stripe|checkout|billing|price|subscription/],
  ['ai_chat', /\b(chat|chatbot|assistant|ai bot|llm)\b|artificial intelligence/],
  ['search', /search|find|filter/],
  ['uploads', /upload|file attach|attach files/],
  ['charts', /chart|graph|analytics|dashboard metrics|visuali[sz]/],
  ['comments', /comment|discussion/],
  ['notifications', /notif|alert/],
  ['email', /contact form|mail form|send email|inquiry form/],
  ['roles', /admin dashboard|role|permission|access control/],
  ['export', /csv|export data|download data/],
  ['google_auth', /google (login|sign|auth)|oauth/],
  ['auth', /login|sign ?in|sign ?up|authentication|account/],
];
API.post('/projects/:id/change', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const prompt = String((req.body || {}).prompt || '').trim().toLowerCase();
  if (!prompt) return fail(res, 400, 'Describe the change (e.g. "add a payment system").');
  const entry = memory.byKind(p.id, 'spec');
  const cur = entry ? entry.content : null;
  if (!cur) return fail(res, 409, 'No compiled spec yet — run a build first so NOIR has a source of truth to change.', 'NO_SPEC');
  const had = new Set(cur.features || []);
  if (cur.auth) had.add('auth');
  const want = new Set();
  const adding = [], removing = [];
  const isRemove = /\b(remove|delete|drop)\b/.test(prompt);
  for (const [key, rx] of FEATURE_MATCH) {
    if (rx.test(prompt) && key !== 'auth') {
      if (isRemove) { if (had.has(key)) { want.add(key); removing.push(key); } }
      else want.add(key);
    }
  }
  if (/\b(add|enable|turn on|implement|include)\b.*\b(login|auth|account)/.test(prompt) || !isRemove && /login|sign ?in|sign ?up|authentication/.test(prompt)) want.add('auth');
  // auth-dependent features require auth
  for (const dep of ['google_auth', 'notifications', 'roles']) if (want.has(dep)) want.add('auth');
  const next = new Set([...had].filter((f) => !removing.includes(f)));
  for (const k of want) if (!had.has(k)) { next.add(k); adding.push(k); }
  if (adding.length === 0 && removing.length === 0) {
    return json(res, { changed: false, note: 'NOIR could not map "' + prompt + '" to a spec-level change. Options: edit the spec + rebuild, or describe it in more product terms (payment, search, comments…).', known: FEATURE_MATCH.map(([k]) => k) });
  }
  const compiled = compileSpec({
    name: cur.name || p.name, tagline: cur.tagline || '', category: cur.category_key || 'general',
    entityKey: cur.main || cur.tables.find((t) => t.main)?.table || null,
    features: [...next], withSeed: true,
  });
  memory.forget(p.id, 'spec'); memory.add(p.id, 'spec', compiled);
  memory.add(p.id, 'note', { kind: 'change_planned', at: new Date().toISOString(), prompt, added: adding, removed: removing, by: req.user.email });
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'change.plan', risk: 'medium', result: 'ok', detail: (adding.join(',') || '-') + ' / -' + (removing.join(',') || '') });
  eventLog(req.user.id, p.id, '🧩', 'Change planned: ' + (adding.length ? 'add ' + adding.join(', ') : '') + (removing.length ? ' remove ' + removing.join(', ') : '') + ' — rebuild to apply.');
  json(res, { changed: true, added: adding, removed: removing, features: [...next].filter((f) => f !== 'auth'), auth: next.has('auth'), note: 'Spec updated. Run the pipeline to apply — NOIR keeps your last checkpoint for rollback.' });
});

// ---------- memory ----------
API.get('/projects/:id/memory', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const mem = memory.list(p.id).map((m) => ({ id: m.id, kind: m.kind, at: new Date(m.created_at).toISOString(), content: stripMem(m) }));
  json(res, { memory: mem });
});
function stripMem(m) {
  if (m.kind === 'spec') return 'compiled-spec (see Project spec)';
  if (m.kind === 'analysis') return m.content;
  return m.content;
}
API.post('/projects/:id/memory', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { kind, content } = req.body || {};
  if (!kind) return fail(res, 400, 'kind required');
  memory.add(p.id, kind, content || {});
  json(res, { saved: true });
});

// ---------- quality ----------
API.get('/projects/:id/quality', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const [health, sec, perf, a11y, seo] = await Promise.all([
    projectHealth(p, ROOT_DIR(p)),
    securityScan(p, ROOT_DIR(p)),
    performanceAnalyzer(p, ROOT_DIR(p)),
    Promise.resolve(a11yScan(p, ROOT_DIR(p))),
    Promise.resolve(seoScan(p, ROOT_DIR(p))),
  ]);
  json(res, { health, security: sec, performance: perf, accessibility: a11y, seo });
});

// ---------- export / import (ZIP) ----------
function zipOfProject(p) {
  const root = p.path || projectDir(p);
  if (!fs.existsSync(root)) return null;
  const zip = new Zip();
  const files = listFiles(p, ROOT_DIR(p));
  const push = (rel, abs) => {
    const st = fs.statSync(abs);
    if (st.isFile()) zip.addLocalFile(abs, path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel), path.posix.basename(rel));
  };
  for (const rel of files) {
    const abs = absPath(p, ROOT_DIR(p), rel);
    if (/^\/?\.[^/]*$/.test(rel)) continue; // dotfiles at root (keep runtime clean)
    try { push(rel, abs); } catch { /* noop */ }
  }
  zip.addFile('noir-project.json', JSON.stringify({ platform: 'noir', version: 1, name: p.name, description: p.description || '', exported_at: new Date().toISOString(), files: files.filter((f) => !/^\/?\.[^/]*$/.test(f)) }, null, 2));
  return zip;
}
API.get('/projects/:id/export', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  try {
    const zip = zipOfProject(p);
    if (!zip) return fail(res, 404, 'No generated code exists yet — run a build first.');
    const buf = zip.toBuffer();
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'project.export', risk: 'medium', result: 'ok' });
    activity.add(req.user.id, p.id, '📦', 'Project exported as ZIP (' + Math.round(buf.length / 1024) + ' KB).');
    res.setHeader('content-type', 'application/zip');
    res.setHeader('content-disposition', 'attachment; filename="' + String(p.name || 'noir-project').replace(/[^a-z0-9-_]/gi, '_') + '.zip"');
    res.end(buf);
  } catch (e) { fail(res, 500, String(e.message || e)); }
});

API.post('/projects/import', async (req, res) => {
  const { name, description, zip_b64, source_url, git_url } = req.body || {};
  if (!zip_b64 && !git_url) return fail(res, 400, 'Attach a ZIP file (base64) or provide a git repository URL to import.');
  const id = uuid();
  const dir = projectDir({ id, name: String(name || 'Imported app').slice(0, 80) });
  try {
    fs.mkdirSync(dir, { recursive: true });
    let gitCloned = false;
    let url = null;
    if (zip_b64) {
      const zip = new Zip(Buffer.from(String(zip_b64), 'base64'));
      zip.extractAllTo(dir, true);
    } else {
      // git repository import: real git clone (public https/file; private GitHub repos
      // retry with the connected account's credential via env header — never argv/config)
      url = String(git_url || '').trim();
      if (!/^(https?|file):\/\//i.test(url) && !/^git@/.test(url)) { fs.rmSync(dir, { recursive: true, force: true }); return fail(res, 400, 'Unsupported repository URL. Use an https://, file:// or git@ URL.'); }
      const safeUrl = url.replace(/'/g, '');
      let clone = await sh('git clone --depth 1 ' + JSON.stringify(safeUrl) + ' "' + dir + '" 2>&1', { cwd: '/tmp', timeoutMs: 180000, env: { GIT_TERMINAL_PROMPT: '0' } });
      if (clone.code !== 0 && /github/i.test(url)) {
        const conn = connection(req.user.id);
        if (conn && conn.token) {
          const b64 = Buffer.from('x-access-token:' + conn.token).toString('base64');
          clone = await sh('git clone --depth 1 ' + JSON.stringify(safeUrl) + ' "' + dir + '" 2>&1', { cwd: '/tmp', timeoutMs: 180000, env: { NOIR_GH_AUTH: b64, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: 'AUTHORIZATION: Basic $NOIR_GH_AUTH' } });
        }
      }
      if (clone.code !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return fail(res, 422, 'git clone failed: ' + (clone.output || clone.error || 'unknown').slice(-500)); }
      gitCloned = true;
    }
    const files = listFiles({ id, name, path: dir }, '');
    if (!files.length) { fs.rmSync(dir, { recursive: true, force: true }); return fail(res, 400, 'The import contained no readable files.'); }
    projects.create(id, req.user.id, { name: String(name || 'Imported app').slice(0, 80), description: String(description || 'Imported project — continue developing with NOIR.').slice(0, 4000), source: 'import', path: dir, tech_stack: 'imported — analyze with NOIR to map framework', status: 'idea' });
    for (const f of files) pfiles.upsert(id, f, 'user', 'file');
    // try to make it a git repo for checkpoints/rollback (a cloned repo already has one)
    try {
      const { ensureRepo, checkpoint } = await import('./engine/gitutil.js');
      const srcName = (name || 'Imported app');
      const projectObj = { id, name: srcName, path: dir };
      if (!gitCloned) await ensureRepo(projectObj, '');
      const cid = 'CP-' + Date.now().toString(36);
      const cp = await checkpoint(projectObj, '', { id: cid, label: 'Import — ' + srcName, message: gitCloned ? 'Import snapshot of ' + url : 'Imported snapshot' });
      checkpoints.create(cid, id, { label: 'Import', message: 'Initial snapshot of the imported code', agent: 'Import', diff_summary: '', git_ref: cp.ref });
    } catch (e) { /* git optional */ }
    audit.log({ user_id: req.user.id, project_id: id, action: 'project.import', risk: 'high', result: 'ok', detail: files.length + ' files' + (git_url ? ' via git ' + String(git_url).slice(0, 80) : (source_url ? ' from ' + source_url : 'zip')) });
    activity.add(req.user.id, id, '📥', 'Project imported (' + files.length + ' files' + (gitCloned ? ', git history preserved' : '') + '). Chat with NOIR or run Analyze to map the codebase.');
    json(res, { project: publicProject(projects.byId(id)), files: files.length, git: gitCloned }, 201);
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
    fail(res, 400, 'Import failed: ' + String(e.message || e).slice(0, 300));
  }
});


// deep-copy a project's filesystem into a fresh independent workspace
function copyProjectDir(srcDir, dstDir, { withGit = false } = {}) {
  fs.mkdirSync(dstDir, { recursive: true });
  fs.cpSync(srcDir, dstDir, { recursive: true, errorOnExist: false, filter: (src) => {
    const rel = path.relative(srcDir, src);
    if (!rel) return true;
    const parts = rel.split(path.sep);
    if (parts[0] === '.git') return withGit;               // history only for forks
    if (parts.some((x) => x === 'node_modules' || x === '.noir')) return false; // env + runtime noise
    if (parts[0] === 'data' && parts[1] === 'uploads') return false;
    if (rel.endsWith('.pid') || rel.endsWith('.log')) return false;
    return true;
  } });
}

// ---------- import (ZIP or git URL) ----------

API.get('/projects/:id/tasks/graph', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rows = tasks.all(p.id);
  json(res, { tasks: rows.map(publicTask) });
});

API.get('/projects/:id/api', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  try {
    const spec = await inspectAppApi(p);
    json(res, spec);
  } catch (e) { fail(res, 500, String(e.message || e)); }
});
API.post('/projects/:id/api/try', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { method = 'GET', path: apiPath = '', body } = req.body || {};
  const port = p.port && runnerStatus(p.id) ? p.port : null;
  if (!port) return fail(res, 409, 'The app is not running. Start it (Run ▶) before trying endpoints.', 'NOT_RUNNING');
  const clean = '/' + String(apiPath).replace(/^\/+|\/+$/g, '').replace(/\s+/g, '');
  const start = Date.now();
  try {
    const up = await fetch('http://127.0.0.1:' + port + clean, { method: String(method).toUpperCase(), headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await up.text();
    let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = null; }
    const headers = {}; up.headers.forEach((v, k) => { headers[k] = v; });
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'api.try', risk: 'medium', result: up.status < 400 ? 'ok' : 'failed', detail: method + ' ' + clean + ' → ' + up.status });
    json(res, { status: up.status, ok: up.ok, latencyMs: Date.now() - start, body: parsed !== null ? parsed : text.slice(0, 4000), headers: Object.keys(headers).slice(0, 20).reduce((a, k) => { a[k] = headers[k]; return a; }, {}) });
  } catch (e) { fail(res, 502, 'Request failed: ' + String(e.message || e).slice(0, 400)); }
});

// ---------- per-project logs / activity ----------
API.get('/projects/:id/logs/activity', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  json(res, { activity: activity.forProject(p.id, Number(req.query.limit || 120)) });
});

// ---------- docs ----------
API.post('/projects/:id/docs', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const made = await buildDocs(p, ROOT_DIR(p));
  eventLog(req.user.id, p.id, '📚', 'Documentation regenerated (' + made.count + ' files).');
  json(res, made);
});

// ---------- integrations ----------
// REAL providers (vercel/supabase/appwrite/github) store encrypted per-user connections and are
// validated by calling the provider API. The old env-var-based pseudo-"connected" state is gone.
const INTEGRATION_DEFS = [
  { id: 'vercel', label: 'Vercel', kind: 'connect', desc: 'Deploy frontends (or your own Vercel adapter) — real uploads, states, logs and URLs.', needs: 'Vercel access token', connect: true },
  { id: 'supabase', label: 'Supabase', kind: 'connect', desc: 'Provision real Postgres projects, run migrations and fetch API keys.', needs: 'Supabase personal access token (or platform OAuth)', connect: true },
  { id: 'appwrite', label: 'Appwrite', kind: 'connect', desc: 'Appwrite Cloud: databases, storage, functions and Appwrite Sites deployments.', needs: 'Endpoint + project id + API key', connect: true },
  { id: 'github', label: 'GitHub', desc: 'Push generated projects to a real GitHub repository.', needs: 'Personal access token, or OAuth app credentials on the platform', env: null },
  { id: 'postgres', label: 'PostgreSQL', desc: 'Dedicated database infrastructure.', needs: 'DATABASE_URL', env: 'DATABASE_URL' },
  { id: 'ai', label: 'AI Providers', desc: 'OpenAI, Anthropic, Google, Groq, xAI or any OpenAI-compatible endpoint.', needs: 'Provider API key(s)', env: 'OPENAI_API_KEY' },
];
API.get('/integrations', (req, res) => {
  const rows = integrations.all(req.user.id);
  const envMap = getEnvMapFor(req.user.id);
  json(res, {
    integrations: INTEGRATION_DEFS.map((d) => {
      const row = rows.find((r) => r.provider === d.id);
      const cfg = safeParseObj(row && row.config);
      let status = row ? row.status : 'not_connected';
      if (d.id === 'vercel' || d.id === 'supabase' || d.id === 'appwrite' || d.id === 'github') {
        // real connection rows only — no env-var shortcuts
        status = row ? row.status : 'not_connected';
      } else if (d.env && envMap[d.env]) {
        status = row && row.status === 'error' ? 'error' : 'connected';
      } else if (d.env && !envMap[d.env] && (!row || row.status !== 'error')) {
        status = 'requires_configuration';
      }
      const keys = (d.id === 'vercel' || d.id === 'supabase' || d.id === 'appwrite' || d.id === 'github') && status === 'connected'
        ? Object.keys(cfg).filter((k) => !k.startsWith('enc_')).map((k) => ({ key: k === 'login' ? 'account' : k, masked: String(cfg[k]).slice(0, 60) }))
        : (d.env && envMap[d.env] ? [{ key: d.env, masked: mask(envMap[d.env]) }] : []);
      return { ...d, status, error: row && row.error, configured_keys: keys, updated_at: row && row.updated_at };
    }),
  });
});
API.post('/integrations/:id/disconnect', async (req, res) => {
  const ok = await disconnectProvider(req.user.id, req.params.id).catch(() => false);
  if (!ok && !['postgres', 'ai'].includes(req.params.id)) return fail(res, 404, 'unknown integration');
  if (!ok) { integrations.remove(req.user.id, req.params.id); return json(res, { disconnected: true }); }
  audit.log({ user_id: req.user.id, action: 'provider_disconnected', risk: 'medium', result: 'ok', detail: req.params.id });
  activity.add(req.user.id, null, '🔌', 'Disconnected ' + req.params.id + '.');
  json(res, { disconnected: true });
});

// ---------- real provider connect/test/detail (Vercel · Supabase · Appwrite) ----------
API.post('/integrations/vercel', async (req, res) => {
  try {
    const out = await connectProvider(req.user.id, 'vercel', { token: (req.body || {}).token, team_id: (req.body || {}).team_id });
    audit.log({ user_id: req.user.id, action: 'provider_connected', risk: 'high', result: 'ok', detail: 'vercel @' + out.login });
    activity.add(req.user.id, null, '▲', 'Vercel connected as @' + out.login + ' — token encrypted at rest, server-side only.');
    json(res, out);
  } catch (e) { fail(res, 401, String(e.message || e)); }
});
API.get('/integrations/vercel', async (req, res) => json(res, { connection: await statusProvider(req.user.id, 'vercel') }));
API.post('/integrations/vercel/test', async (req, res) => {
  const r = await testProvider(req.user.id, 'vercel');
  audit.log({ user_id: req.user.id, action: 'provider_test', risk: 'low', result: r.connected ? 'ok' : 'failed', detail: 'vercel ' + (r.error || 'ok') });
  json(res, r);
});
API.post('/integrations/supabase', async (req, res) => {
  try {
    const out = await connectProvider(req.user.id, 'supabase', { token: (req.body || {}).token });
    audit.log({ user_id: req.user.id, action: 'provider_connected', risk: 'high', result: 'ok', detail: 'supabase' });
    activity.add(req.user.id, null, '🟢', 'Supabase connected — token encrypted at rest, server-side only.');
    json(res, out);
  } catch (e) { fail(res, 401, String(e.message || e)); }
});
API.get('/integrations/supabase', async (req, res) => {
  const st = await statusProvider(req.user.id, 'supabase');
  let organizations = null;
  if (st && st.status === 'connected') {
    const c = SupabaseProvider.clientFor(req.user.id);
    if (c) organizations = await SupabaseProvider.organizations.listOrganizations(c.sb).catch(() => null);
  }
  json(res, { connection: st, organizations });
});
API.post('/integrations/supabase/test', async (req, res) => {
  const r = await testProvider(req.user.id, 'supabase');
  json(res, r);
});
API.post('/integrations/supabase/oauth/start', (req, res) => {
  const pub = process.env.NOIR_PUBLIC_URL || (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers.host || 'localhost:' + PORT);
  if (!SupabaseProvider.oauth.oauthAvailable()) return fail(res, 503, 'Supabase OAuth is not configured on this NOIR server (needs SUPABASE_OAUTH_CLIENT_ID/SECRET). Use a personal access token instead.', 'REQUIRES_CONFIG');
  json(res, { url: SupabaseProvider.oauth.authorizeUrl(req.user.id, pub) });
});
API.post('/integrations/appwrite', async (req, res) => {
  try {
    const out = await connectProvider(req.user.id, 'appwrite', {
      endpoint: (req.body || {}).endpoint, project: (req.body || {}).project, key: (req.body || {}).key,
    });
    audit.log({ user_id: req.user.id, action: 'provider_connected', risk: 'high', result: 'ok', detail: 'appwrite project ' + out.project });
    activity.add(req.user.id, null, '🅰️', 'Appwrite connected — project ' + out.project + ' (key encrypted at rest).');
    json(res, out);
  } catch (e) { fail(res, 401, String(e.message || e)); }
});
API.get('/integrations/appwrite', async (req, res) => json(res, { connection: await statusProvider(req.user.id, 'appwrite') }));
API.post('/integrations/appwrite/test', async (req, res) => {
  const r = await testProvider(req.user.id, 'appwrite');
  json(res, r);
});
// OAuth callback (public — state-validated)
API.get('/oauth/supabase/callback', async (req, res) => {
  try {
    const out = await SupabaseProvider.oauth.finish(String(req.query.code || ''), String(req.query.state || ''));
    audit.log({ user_id: out.user_id, action: 'provider_connected', risk: 'high', result: 'ok', detail: 'supabase oauth' });
    res.redirect('/#/app/integrations');
  } catch (e) { res.status(400).send('Supabase OAuth failed: ' + String(e.message || e)); }
});

// ---------- GitHub (real connect + push; credential encrypted at rest, server-side only) ----------
API.get('/integrations/github', (req, res) => {
  const conn = connection(req.user.id);
  json(res, { connected: !!conn, login: conn ? conn.login : null, name: conn ? conn.name : null, scopes: conn ? conn.scopes : null, connected_at: conn ? conn.connected_at : null });
});
API.post('/integrations/github/token', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return fail(res, 400, 'Paste a GitHub personal access token (classic: repo scope · fine-grained: Contents read/write).');
  try {
    const out = await connectToken({ user_id: req.user.id, token });
    audit.log({ user_id: req.user.id, action: 'github.connect', risk: 'high', result: 'ok', detail: '@' + out.login });
    activity.add(req.user.id, null, '🐙', 'GitHub connected as @' + out.login + ' — token encrypted at rest, never exposed to the browser.');
    json(res, { connected: true, login: out.login, scopes: out.scopes });
  } catch (e) { audit.log({ user_id: req.user.id, action: 'github.connect', risk: 'high', result: 'failed', detail: String(e.message || e).slice(0, 200) }); fail(res, 401, String(e.message || e)); }
});
API.post('/integrations/github/oauth', (req, res) => {
  const out = oauthStart(req.user.id, (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers.host || 'localhost:' + PORT));
  if (out.requires_config) return fail(res, 503, out.hint, 'REQUIRES_CONFIG');
  json(res, { url: out.url });
});
API.get('/github/callback', async (req, res) => {
  try {
    const out = await oauthFinish({ code: req.query.code, state: req.query.state });
    audit.log({ user_id: out.user_id, action: 'github.oauth', risk: 'high', result: 'ok', detail: '@' + out.login });
    res.redirect('/#/app/integrations?connected=github');
  } catch (e) {
    res.redirect('/#/app/integrations?error=' + encodeURIComponent(String(e.message || e).slice(0, 200)));
  }
});
API.get('/projects/:id/github', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const conn = connection(req.user.id);
  if (!conn) return json(res, { connected: false, login: null });
  const repoName = repoSlug((req.query.repo || '').trim() || p.name);
  let repo = null;
  try { repo = await repoOnGithub(conn.token, conn.login, repoName); } catch (e) { return json(res, { connected: true, login: conn.login, repo_name: repoName, error: 'Cannot reach GitHub: ' + String(e.message || e).slice(0, 200) }); }
  json(res, { connected: true, login: conn.login, scopes: conn.scopes, repo_name: repoName, exists: repo.exists, html_url: repo.exists ? repo.repo.html_url : null, private: repo.exists ? repo.repo.private : null });
});
API.post('/projects/:id/github/push', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const { repo, branch, message } = req.body || {};
  eventLog(req.user.id, p.id, '🐙', 'Pushing to GitHub (' + repoSlug(repo || p.name) + ')…');
  try {
    const out = await pushProject({ project: p, user_id: req.user.id, repo: repo || p.name, branch: branch || 'main', message: message || 'NOIR: ' + p.name + ' update' });
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'github.push', risk: 'high', result: 'ok', detail: out.repo + '@' + (out.commit || '').slice(0, 8) });
    activity.add(req.user.id, p.id, '🐙', 'Pushed to GitHub: ' + out.login + '/' + out.repo + ' (' + (out.commit || '').slice(0, 7) + ').');
    eventLog(req.user.id, p.id, '🐙', 'Pushed to GitHub: ' + out.login + '/' + out.repo + ' · ' + (out.commit || '').slice(0, 7), 'ok');
    json(res, out);
  } catch (e) {
    eventLog(req.user.id, p.id, '🐙', 'GitHub push failed: ' + String(e.message || e).slice(0, 160), 'error');
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'github.push', risk: 'high', result: 'failed', detail: String(e.message || e).slice(0, 200) });
    fail(res, e.code === 'NO_GITHUB' ? 409 : 502, String(e.message || e), e.code || 'PUSH_FAILED');
  }
});

// ---------- code-level NL patches (Phase 10) ----------
// preview: deterministic plan of verbatim old->new replacements with real diffs
API.post('/projects/:id/patch/preview', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const q = String((req.body || {}).prompt || '');
  if (!q.trim()) return fail(res, 400, 'Tell me what to change (old text → new text).');
  try {
    const pairs = extractPairs(q);
    if (!pairs.length) return fail(res, 422, 'Could not extract a clear "old → new" change from that request. Quote the exact old text and what it should become.', 'NO_PAIRS');
    const plan = planReplacements(p, ROOT_DIR(p), pairs);
    const nFiles = plan.reduce((n, x) => n + x.files.length, 0);
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'patch.preview', tool: 'patch_plan', risk: 'low', result: 'ok', detail: nFiles + ' file(s) for: ' + q.slice(0, 120) });
    json(res, { kind: 'plan', prompt: q, plan, files: nFiles, note: 'Nothing is applied yet — send the same request with approval:true to apply (a safety checkpoint is created first).' });
  } catch (e) { fail(res, 404, String(e.message || e), e.code || 'NOT_FOUND'); }
});
// apply: only with explicit approval:true; safety checkpoint before any write;
// server-side files get an automatic test re-run afterwards.
API.post('/projects/:id/patch/apply', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const q = String((req.body || {}).prompt || '');
  if (!q.trim()) return fail(res, 400, 'Tell me what to change.');
  if (!(req.body || {}).approval) return fail(res, 403, 'Approval required — this edits real files. Send approval:true to apply.', 'APPROVAL_REQUIRED');
  try {
    const pairs = extractPairs(q);
    if (!pairs.length) return fail(res, 422, 'Could not extract a clear "old → new" change from that request.', 'NO_PAIRS');
    const plan = planReplacements(p, ROOT_DIR(p), pairs);
    // safety checkpoint BEFORE writes
    const cid = 'CP-' + Date.now().toString(36);
    let ref = null;
    try { const cp = await checkpoint(p, ROOT_DIR(p), { id: cid, label: 'Auto — before code patch', message: 'Safety checkpoint before applying: ' + q.slice(0, 140) }); ref = cp.ref; } catch { /* gitless sandbox still proceeds */ }
    const applied = applyPlan(p, ROOT_DIR(p), plan, {
      writeFile: (rel, content) => {
        const abs = absPath(p, ROOT_DIR(p), rel);
        fs.writeFileSync(abs, content);
        pfiles.upsert(p.id, rel, content, 'user');
      },
    });
    if (ref) checkpoints.create(cid, p.id, { label: 'Auto — before code patch', message: 'Safety checkpoint before applying: ' + q.slice(0, 140), agent: 'AI Patch', diff_summary: applied.map((a) => a.file + ' (' + a.changes + ' line change)').join(', '), git_ref: ref });
    projects.touch(p.id);
    eventLog(req.user.id, p.id, '🔧', 'Applied code patch: ' + applied.map((a) => a.file).join(', ') + '.');
    audit.log({ user_id: req.user.id, project_id: p.id, action: 'patch.apply', tool: 'patch_apply', risk: 'high', result: 'ok', detail: applied.map((a) => a.file).join(', ') });
    memory.add(p.id, 'note', 'Code patch applied to ' + applied.map((a) => a.file).join(', ') + ' — from: ' + q.slice(0, 200), req.user.id);
    // auto re-test when the patch touched server-side code (files outside the browser src/)
    let tests = null;
    const touchedServer = applied.some((a) => !/^src\//.test(a.file) && /\.(js|mjs|cjs|ts)$/i.test(a.file));
    if (touchedServer) {
      try { tests = await runTestSuite(p, ROOT_DIR(p)); } catch (e) { tests = { ok: false, error: String(e.message || e) }; }
    }
    json(res, { applied, checkpoint: ref ? cid : null, tests });
  } catch (e) {
    const msg = String(e.message || '');
    const code = e.code || (msg.includes('Stale') ? 'STALE' : msg.includes('No file in the project contains') ? 'NOT_FOUND' : 'APPLY_FAILED');
    fail(res, code === 'STALE' ? 409 : (code === 'NOT_FOUND' ? 404 : 500), msg, code);
  }
});

// ---------- teams & organizations (Phase 43) ----------
const teamAccess = (req, res) => {
  const t = teams.byUserTeam(req.params.id, req.user.id);
  if (!t) return null;
  req.team = t;
  return t;
};
API.get('/teams', (req, res) => {
  const mine = teams.listForUser(req.user.id).map((t) => {
    const members = teams.members(t.id);
    const projCount = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE team_id = ?').get(t.id).n;
    return { ...t, projects: projCount, members: members.length };
  });
  json(res, { teams: mine });
});
API.post('/teams', (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 80);
  if (!name) return fail(res, 400, 'Give the team a name.');
  const id = uuid();
  teams.create(id, name, req.user.id);
  teams.addMember(id, req.user.id, 'owner', req.user.id);
  audit.log({ user_id: req.user.id, action: 'team.create', risk: 'medium', result: 'ok', detail: name });
  activity.add(req.user.id, null, '👥', 'Created team "' + name + '".');
  json(res, { team: teams.byUserTeam(id, req.user.id) }, 201);
});
API.get('/teams/:id', (req, res) => {
  const t = teamAccess(req, res);
  if (!t) return fail(res, 404, 'Team not found or you are not a member.');
  json(res, {
    team: { ...t, member_count: teams.members(t.id).length },
    members: teams.members(t.id),
    projects: db.prepare('SELECT id, name, description, status FROM projects WHERE team_id = ? ORDER BY updated_at DESC').all(t.id),
  });
});
API.post('/teams/:id/members', (req, res) => {
  const t = teamAccess(req, res);
  if (!t) return fail(res, 404, 'Team not found');
  if (!['owner', 'admin'].includes(t.my_role)) return fail(res, 403, 'Only team owners/admins can invite members.', 'ROLE_FORBIDDEN');
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const role = ['owner', 'admin', 'developer', 'reviewer', 'viewer'].includes((req.body || {}).role) ? req.body.role : 'developer';
  const target = users.byEmail(email);
  if (!target) return fail(res, 404, 'No NOIR account exists for ' + email + ' — invite them to sign up first.', 'NO_ACCOUNT');
  teams.addMember(t.id, target.id, role, req.user.id);
  audit.log({ user_id: req.user.id, team_id: t.id, action: 'team.invite', risk: 'medium', result: 'ok', detail: email + ' as ' + role });
  activity.add(req.user.id, null, '👥', 'Added ' + email + ' to "' + t.name + '" as ' + role + '.');
  json(res, { added: email, role, team_id: t.id });
});
API.patch('/teams/:id/members/:userId', (req, res) => {
  const t = teamAccess(req, res);
  if (!t) return fail(res, 404, 'Team not found');
  if (!['owner', 'admin'].includes(t.my_role)) return fail(res, 403, 'Only team owners/admins can change roles.', 'ROLE_FORBIDDEN');
  const role = String((req.body || {}).role || '');
  if (!['owner', 'admin', 'developer', 'reviewer', 'viewer'].includes(role)) return fail(res, 400, 'Unknown role: ' + role);
  const target = teams.members(t.id).find((m) => m.user_id === req.params.userId);
  if (!target) return fail(res, 404, 'Not a member.');
  if (target.user_id === t.created_by && role !== 'owner') return fail(res, 400, 'The team creator stays the owner.');
  teams.setRole(t.id, req.params.userId, role);
  audit.log({ user_id: req.user.id, team_id: t.id, action: 'team.role', risk: 'medium', result: 'ok', detail: target.email + ' → ' + role });
  json(res, { updated: target.email, role });
});
API.delete('/teams/:id/members/:userId', (req, res) => {
  const t = teamAccess(req, res);
  if (!t) return fail(res, 404, 'Team not found');
  const target = teams.members(t.id).find((m) => m.user_id === req.params.userId);
  if (!target) return fail(res, 404, 'Not a member.');
  const selfLeave = target.user_id === req.user.id;
  if (!selfLeave && !['owner', 'admin'].includes(t.my_role)) return fail(res, 403, 'Only team owners/admins can remove members.', 'ROLE_FORBIDDEN');
  if (target.user_id === t.created_by) return fail(res, 400, 'The team creator cannot be removed — delete the team instead.');
  teams.removeMember(t.id, req.params.userId);
  activity.add(req.user.id, null, '👥', selfLeave ? 'Left team "' + t.name + '".' : 'Removed ' + (target.email || 'member') + ' from "' + t.name + '".');
  json(res, { removed: target.email || target.user_id });
});
API.delete('/teams/:id', async (req, res) => {
  const t = teamAccess(req, res);
  if (!t) return fail(res, 404, 'Team not found');
  if (!['owner', 'admin'].includes(t.my_role)) return fail(res, 403, 'Only team owners/admins can delete the team.', 'ROLE_FORBIDDEN');
  db.prepare('UPDATE projects SET team_id = NULL WHERE team_id = ?').run(t.id); // projects return to their owners' private space
  teams.delete(t.id);
  audit.log({ user_id: req.user.id, team_id: t.id, action: 'team.delete', risk: 'high', result: 'ok', detail: t.name });
  json(res, { deleted: true });
});
// share / unshare a project with a team (owner/admin of the team and project)
API.post('/projects/:id/team', (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const role = req.projectRole || 'owner';
  if (!['owner', 'admin'].includes(role)) return fail(res, 403, 'Only the project owner (or team admin) can change sharing.', 'ROLE_FORBIDDEN');
  const tid = (req.body || {}).team_id || null;
  if (tid) {
    const t = teams.byUserTeam(tid, req.user.id);
    if (!t || !['owner', 'admin'].includes(t.my_role)) return fail(res, 403, 'You must be a team owner/admin to share into it.', 'ROLE_FORBIDDEN');
    projects.update(p.id, { team_id: tid });
    activity.add(req.user.id, p.id, '👥', 'Shared "' + p.name + '" with team "' + t.name + '".');
    eventLog(req.user.id, p.id, '👥', 'Project shared with team ' + t.name + '.');
  } else {
    projects.update(p.id, { team_id: null });
    activity.add(req.user.id, p.id, '🔒', 'Stopped sharing "' + p.name + '" — private again.');
    eventLog(req.user.id, p.id, '🔒', 'Project is private again.');
  }
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'project.share', risk: 'high', result: 'ok', detail: tid || 'private' });
  json(res, { project: publicProject(projects.byId(p.id)) });
});

// ---------- real deployments (provider worker, history, logs, retry/cancel) ----------
function deploymentFor(req, res) {
  const d = deployments.get(req.params.id || '');
  if (!d) { res.status(404).json({ ok: false, error: 'Deployment not found.' }); return null; }
  if (!projectForUser(d.project_id, req.user.id)) { res.status(404).json({ ok: false, error: 'Deployment not found.' }); return null; }
  return d;
}
function deployRowPublic(d) {
  let meta = {}; try { meta = JSON.parse(d.meta || '{}'); } catch { /* noop */ }
  return { ...d, request: undefined, meta };
}
API.post('/projects/:id/deployments', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const body = req.body || {};
  const provider = String(body.provider || '');
  const environment = ['production', 'preview', 'development'].includes(body.environment) ? body.environment : (provider === 'local' ? 'production' : 'preview');
  if (!['local', 'vercel', 'appwrite', 'supabase'].includes(provider)) return fail(res, 400, 'provider must be local | vercel | appwrite | supabase');
  const did = 'DPL-' + Date.now().toString(36).toUpperCase();
  const extra = {
    ...(body.organization_id ? { organizationId: body.organization_id } : {}),
    ...(body.project_ref ? { projectRef: body.project_ref } : {}),
    ...(body.project_name ? { projectName: body.project_name } : {}),
    ...(body.region ? { region: body.region } : {}),
    ...(body.static ? { static: true } : {}),
  };
  const dbPass = String(body.db_pass || '');
  if (dbPass) passSecret(did, { dbPass }); // transient only — never stored
  deployments.create({ id: did, user_id: req.user.id, project_id: p.id, provider, environment, request: extra });
  deployments.addLog(did, 'info', 'Deployment queued — provider: ' + provider + ' · env: ' + environment);
  activity.add(req.user.id, p.id, '🚀', 'Deployment to ' + provider + ' (' + environment + ') queued.');
  audit.log({ user_id: req.user.id, project_id: p.id, action: 'deployment_started', risk: 'high', result: 'ok', detail: provider + ' ' + environment });
  startWorker(did, () => runDeployment(did));
  json(res, { deployment: deployRowPublic(deployments.get(did)) }, 202);
});
// resume a worker that timed out mid-provisioning (e.g. Supabase still coming up)
API.post('/projects/:id/deployments/resume', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const row = deployments.byProject(p.id).find((d) => (d.status === 'building' || d.status === 'queued') && (!req.body || req.body.provider ? d.provider === (req.body || {}).provider : true));
  if (!row) return fail(res, 404, 'Nothing to resume for this project/provider.');
  if (!workerBusy(row.id)) startWorker(row.id, () => runDeployment(row.id));
  json(res, { resumed: row.id, deployment: deployRowPublic(deployments.get(row.id)) });
});
API.get('/projects/:id/deployments', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const rows = deployments.byProject(p.id);
  json(res, { deployments: rows.map((d) => ({ ...deployRowPublic(d), last_log_id: deployments.lastLogId(d.id) })) });
});
// real deploy plan — computed from actual project files + live connection rows
API.get('/projects/:id/deploy/plan', async (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  const names = pfiles.list(p.id);
  const has = (n) => names.includes(n);
  const srcIndex = has('src/index.html');
  const rootIndex = has('index.html');
  const serverJs = has('server.js');
  const vercelJson = has('vercel.json');
  const schemaSpec = has('db/schema.js');
  const kind = serverJs ? 'full-stack-node' : (schemaSpec ? 'db-backed-client' : ((srcIndex || rootIndex) ? 'static-client' : 'unknown'));
  const envKeys = envVars.all(p.id).map((e) => e.key);
  const conns = {};
  for (const pid of ['vercel', 'supabase', 'appwrite']) { try { conns[pid] = await statusProvider(req.user.id, pid); } catch { conns[pid] = { status: 'not_connected' }; } }
  const client = srcIndex || rootIndex;
  const stacks = [];
  stacks.push({
    id: 'local', label: 'NOIR local runtime', kind: 'local',
    usable: true, needs: [], needsLabel: null,
    note: 'Restarts your app inside this NOIR sandbox and serves it on the real preview proxy. Not a public host.',
  });
  if (client) {
    stacks.push({
      id: 'vercel', label: 'Vercel' + (serverJs && !vercelJson ? '' : ''), kind: serverJs && vercelJson ? 'repo (verbatim upload)' : 'static',
      usable: !serverJs || !!vercelJson, needs: ['vercel'], needsLabel: 'Vercel',
      environments: serverJs ? ['preview', 'production'] : ['preview', 'production'],
      note: serverJs && vercelJson ? 'Uploads the whole repo verbatim — your vercel.json and serverless functions are used as-is.'
        : serverJs ? 'Blocked before upload: Vercel cannot run this project\'s custom Node server (server.js) without a real vercel.json adapter. Use Appwrite Sites (SSR), NOIR runtime, or add a vercel.json.'
        : 'Deploys the real client files from src/ to Vercel. URL, build state and logs come back from api.vercel.com — nothing is simulated.',
    });
  }
  if (client || serverJs) {
    stacks.push({
      id: 'appwrite', label: 'Appwrite Sites', kind: serverJs ? 'ssr archive' : 'static',
      usable: true, needs: ['appwrite'], needsLabel: 'Appwrite',
      note: serverJs
        ? 'Packages the real project (server.js + package.json) and uploads it as an Appwrite Sites SSR deployment. Runtime env vars are set in the Appwrite console — NOIR never embeds secrets in uploads.'
        : 'Uploads the real client archive to Appwrite Sites (static). URL and build state come from the Appwrite API.',
    });
  }
  if (schemaSpec) {
    stacks.push({
      id: 'supabase', label: 'Supabase database', kind: 'provisioning',
      usable: true, needs: ['supabase'], needsLabel: 'Supabase',
      note: 'Provisions a real Supabase Postgres project (first accessible org, region auto), runs the migration built from db/schema.js via the Management API, verifies every expected table, then stores DATABASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY in this project\'s Env (server-side). The database password and your access token are never stored.',
    });
  }
  let recommended = [];
  if (kind === 'full-stack-node' && vercelJson) recommended = ['vercel'];
  else if (kind === 'full-stack-node') recommended = ['appwrite'];
  else if (kind === 'db-backed-client' || kind === 'static-client') {
    recommended = ['vercel'];
    if (schemaSpec) recommended.push('supabase');
    else if (!serverJs && client && !schemaSpec) recommended = ['vercel'];
  }
  recommended = recommended.filter((id) => stacks.some((s) => s.id === id));
  json(res, {
    plan: {
      project_kind: kind,
      app: { client: !!client, src_index: srcIndex, root_index: rootIndex, server_js: serverJs, vercel_json: vercelJson, schema_spec: schemaSpec },
      env_keys: envKeys,
      connections: conns,
      stacks,
      recommended,
      capabilities: { vercel: CAPS.vercel, appwrite: CAPS.appwrite, supabase: CAPS.supabase, local: CAPS.local },
    },
  });
});
API.get('/deployments/:id', (req, res) => {
  const d = deploymentFor(req, res);
  if (!d) return;
  json(res, { deployment: deployRowPublic(d), logs_after: deployments.lastLogId(d.id) });
});
API.get('/deployments/:id/logs', (req, res) => {
  const d = deploymentFor(req, res);
  if (!d) return;
  const after = Number(req.query.after || 0);
  json(res, { logs: deployments.logs(d.id, after, 400), next_after: deployments.lastLogId(d.id) });
});
API.post('/deployments/:id/cancel', async (req, res) => {
  const d = deploymentFor(req, res);
  if (!d) return;
  const acc = projectForUser(d.project_id, req.user.id);
  if (!['owner', 'admin'].includes(acc.role)) return fail(res, 403, 'Only the project owner/admin can cancel deployments.', 'ROLE_FORBIDDEN');
  if (['ready', 'failed', 'blocked', 'canceled'].includes(d.status)) return fail(res, 409, 'Deployment already finished (' + d.status + ').');
  if (d.provider === 'vercel' && d.provider_deployment_id) {
    try { const c = providerFacade('vercel').clientFor(d.user_id); if (c) await providerFacade('vercel').deployments.cancelDeployment(c.vc, d.provider_deployment_id); } catch (e) { /* real error surfaced below */ }
  }
  if (d.provider === 'appwrite' && d.provider_deployment_id && d.provider_project_id) {
    try { const c = providerFacade('appwrite').clientFor(d.user_id); if (c) await providerFacade('appwrite').sites.cancelDeployment(c.aw, d.provider_project_id, d.provider_deployment_id); } catch (e) { /* noop */ }
  }
  deployments.update(d.id, { status: 'canceled', finished_at: Date.now(), error: 'Canceled by ' + req.user.email });
  deployments.addLog(d.id, 'warn', 'Canceled by ' + req.user.email + '.');
  audit.log({ user_id: req.user.id, project_id: d.project_id, action: 'deployment_canceled', risk: 'medium', result: 'ok', detail: d.provider + ' ' + d.id });
  activity.add(req.user.id, d.project_id, '⏹️', 'Canceled ' + d.provider + ' deployment.');
  json(res, { canceled: d.id });
});
API.post('/deployments/:id/retry', async (req, res) => {
  const d = deploymentFor(req, res);
  if (!d) return;
  const acc = projectForUser(d.project_id, req.user.id);
  if (!['owner', 'admin'].includes(acc.role)) return fail(res, 403, 'Only the project owner/admin can retry deployments.', 'ROLE_FORBIDDEN');
  const prev = safeReq(d);
  if (d.provider === 'supabase' && !prev.projectRef && d.provider_project_id) prev.projectRef = d.provider_project_id;
  const did = 'DPL-' + Date.now().toString(36).toUpperCase();
  deployments.create({ id: did, user_id: d.user_id, project_id: d.project_id, provider: d.provider, environment: d.environment, request: prev });
  deployments.addLog(did, 'info', 'Retry of ' + d.id + ' (' + (d.error || '').slice(0, 200) + ')');
  startWorker(did, () => runDeployment(did));
  json(res, { deployment: deployRowPublic(deployments.get(did)) }, 202);
});

// ---------- activity / usage / audit ----------
API.get('/activity', (req, res) => json(res, { activity: activity.forUser(req.user.id, Number(req.query.limit || 60)) }));
API.get('/usage', (req, res) => {
  json(res, {
    totals: usage.totals(req.user.id),
    daily: usage.daily(req.user.id),
    projects: projects.all(req.user.id).length,
    provider: configuredProviders(getEnvMapFor(req.user.id)).map((p) => ({ id: p.id, model: p.model })),
  });
});
API.get('/audit', (req, res) => json(res, { audit: audit.list(Number(req.query.limit || 200)) }));

// ---------- settings ----------
API.get('/settings/security', (req, res) => {
  const u = users.byId(req.user.id);
  json(res, { email_verified: !!u.email_verified, sessions_active: sessions.cleanup ? 'ok' : 'ok', account_age_days: Math.floor((Date.now() - u.created_at) / 864e5) });
});
API.post('/settings/devices/logout-all', (req, res) => {
  sessions.deleteAllForUser(req.user.id);
  json(res, { done: true });
});
API.delete('/settings/account', (req, res) => {
  // full account deletion
  for (const p of projects.all(req.user.id)) {
    try { fs.rmSync(p.path || projectDir(p), { recursive: true, force: true }); } catch { /* noop */ }
  }
  users.update(req.user.id, { email: 'deleted-' + Date.now() + '@noir.local', password_hash: hashPassword(randomToken(24)) });
  sessions.deleteAllForUser(req.user.id);
  audit.log({ user_id: req.user.id, action: 'account.delete', risk: 'high', result: 'ok' });
  json(res, { deleted: true });
});

// ---------- sse ----------
API.get('/projects/:id/events', auth, (req, res) => {
  const p = activeProject(req, res);
  if (!p) return;
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: hello\ndata: {"ok":true}\n\n');
  const send = (payload) => {
    if (res.writableEnded) return;
    res.write('data: ' + JSON.stringify(payload) + '\n\n');
  };
  const unsub = subscribe(p.id, send);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch { /* noop */ } }, 20000);
  req.on('close', () => { clearInterval(hb); unsub(); });
});

app.use('/api', API);

// =============== PREVIEW PROXY ===============
export function previewProxy(server) {
  // map project id → port at request time from DB (port field)
  app.use('/preview/:projectId', async (req, res) => {
    const p = projects.byId(req.params.projectId);
    const row = p && (runServers.get(p.id));
    const port = row ? row.port : p && p.port;
    if (!port || !row || !runnerStatus(p.id)) {
      return res.status(503).send('<html><body style="font-family:system-ui;background:#0d1017;color:#dfe3ea;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h2 style="font-weight:600">Preview is not running</h2><p style="color:#8b93a7">This app is not live right now. Start it from the workspace (Run ▶).</p><p style="color:#8b93a7;font-size:12px">NOIR only shows <b>Live</b> when the process actually responds.</p></div></body></html>');
    }
    const target = { host: '127.0.0.1', port };
    const proxyReq = http.request({
      host: target.host, port: target.port,
      path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:' + port, 'x-noir-preview': p.id },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Preview unreachable'); });
    req.pipe(proxyReq);
  });
  // live preview health check
  app.get('/api/preview-status/:projectId', (req, res) => {
    const p = projects.byId(req.params.projectId);
    if (!p) return res.json({ ok: false });
    const st = runnerStatus(p.id);
    res.json({ ok: !!st, running: !!st, ...(st || {}) });
  });
  // open in new tab: served at /preview/<id>/ externally through NOIR origin
}

// expose for tests
export { getEnvMapFor };
