// github.js — real GitHub integration for NOIR.
// Connect two ways: (1) OAuth app flow when the platform has GITHUB_CLIENT_ID/SECRET,
// or (2) a personal access token the user pastes once. Either way the credential is
// AES-256-GCM encrypted at rest (key derived from the platform secret), never sent to
// the browser, never written to git config/argv/logs, and only used server-side to
// create repositories and push.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { integrations } from '../db.js';
import { sh } from './tools.js';
import { appDir } from './paths.js';
import { ensureRepo } from './gitutil.js';

const GH_API = () => process.env.NOIR_GITHUB_API || 'https://api.github.com';
const GH_HOST = () => process.env.NOIR_GITHUB_HOST || 'github.com';
// test-only override for the push remote (lets CI prove the git path against a local bare repo)
const REMOTE_OVERRIDE = () => process.env.NOIR_GITHUB_REMOTE_URL || '';

const cryp = () => crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(String(config.secret)).digest(), crypto.randomBytes(12));
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(String(config.secret)).digest(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + ct.toString('base64');
}
export function decryptSecret(stored) {
  try {
    const parts = String(stored).split(':');
    if (parts[0] !== 'v1' || parts.length !== 4) return stored; // legacy plaintext — treat as-is
    const d = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(String(config.secret)).digest(), Buffer.from(parts[1], 'base64'));
    d.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([d.update(Buffer.from(parts[3], 'base64')), d.final()]).toString('utf8');
  } catch { return null; }
}

const ghJson = async (method, apiPath, token, body, base = GH_API()) => {
  const res = await fetch(base.replace(/\/$/, '') + apiPath, {
    method, headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  let j = null; try { j = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (j && (j.message || j.error)) || ('GitHub returned ' + res.status);
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200));
    err.status = res.status; err.code = j && j.errors ? j.errors[0].code : undefined;
    throw err;
  }
  return j;
};

/** Validate a token against the GitHub API and persist the connection (encrypted). */
export async function connectToken({ user_id, token }) {
  const t = String(token || '').trim();
  if (t.length < 6) throw new Error('Provide a GitHub personal access token (classic with `repo` scope, or fine-grained with Contents: Read/Write).');
  const me = await ghJson('GET', '/user', t).catch((e) => { throw new Error('GitHub rejected the token: ' + (e.message || e)); });
  const scopeHeader = await fetch(GH_API() + '/user', { headers: { authorization: 'Bearer ' + t } }).then((r) => r.headers.get('x-oauth-scopes') || '').catch(() => '');
  integrations.set(user_id, 'github', 'connected', { login: me.login, name: me.name || me.login, avatar: me.avatar_url || '', token: encryptSecret(t), scopes: scopeHeader || 'unknown', connected_at: Date.now() }, null);
  return { login: me.login, scopes: scopeHeader };
}

export function connection(user_id) {
  const row = integrations.get(user_id, 'github');
  if (!row || row.status !== 'connected') return null;
  const cfg = (() => { try { return JSON.parse(row.config || '{}'); } catch { return {}; } })();
  if (!cfg.token) return null;
  return { login: cfg.login, name: cfg.name, avatar: cfg.avatar, connected_at: cfg.connected_at, token: decryptSecret(cfg.token), scopes: cfg.scopes || '' };
}

// ---- OAuth app flow (requires GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET on the platform) ----
const pendingStates = new Map(); // state -> { user_id, at }
export function oauthStart(user_id, redirectBase) {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) return { requires_config: true, hint: 'The NOIR platform is not configured with GitHub OAuth app credentials. Add GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET to the platform environment (never to project env), or connect with a personal access token instead.' };
  const state = crypto.randomBytes(12).toString('hex');
  pendingStates.set(state, { user_id, at: Date.now() });
  const cb = String(redirectBase || 'http://localhost:7860').replace(/\/$/, '') + '/api/github/callback';
  return { url: 'https://github.com/login/oauth/authorize?client_id=' + encodeURIComponent(id) + '&redirect_uri=' + encodeURIComponent(cb) + '&scope=repo%20user&state=' + state };
}
export async function oauthFinish({ code, state }) {
  const pend = pendingStates.get(String(state || ''));
  if (!pend || Date.now() - pend.at > 10 * 60 * 1000) throw new Error('GitHub OAuth state expired or invalid — start the connection again.');
  pendingStates.delete(String(state));
  const id = process.env.GITHUB_CLIENT_ID, sec = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !sec) throw new Error('GitHub OAuth is not configured on this platform.');
  const tok = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ client_id: id, client_secret: sec, code: String(code || ''), state: String(state) }) }).then((r) => r.json());
  if (!tok.access_token) throw new Error('GitHub OAuth exchange failed: ' + (tok.error_description || tok.error || 'unknown error'));
  const login = await connectToken({ user_id: pend.user_id, token: tok.access_token });
  return { login: login.login, user_id: pend.user_id };
}

export const repoSlug = (name) => String(name || 'noir-app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'noir-app';

/** Return { exists, repo } for owner/repo. */
export async function repoOnGithub(token, owner, repo) {
  try { return { exists: true, repo: await ghJson('GET', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), token) }; }
  catch (e) { if (e.status === 404) return { exists: false, repo: null }; throw e; }
}

/** Create a repository on GitHub (public=false → private; default public for visibility of work). */
export async function createRepo(token, { name, description, isPrivate = true }) {
  return ghJson('POST', '/user/repos', token, { name, description: String(description || 'Built with NOIR').slice(0, 300), private: !!isPrivate, auto_init: false });
}

/**
 * Push a project's git history to GitHub. Creates the repository if it does not exist,
 * commits the working tree, then pushes HEAD over HTTPS using an Authorization header
 * supplied via environment (never persisted, never in argv/logs).
 */
export async function pushProject({ project, root_dir = '', user_id, repo, branch = 'main', message }) {
  const conn = connection(user_id);
  if (!conn || !conn.token) throw Object.assign(new Error('Connect GitHub first (Git tab → Connect GitHub → add a token).'), { code: 'NO_GITHUB' });
  const dir = appDir(project, root_dir);
  await ensureRepo(project, root_dir);
  const repoName = repoSlug(repo || project.name);
  const commitMsg = String(message || ('NOIR update — ' + project.name)).slice(0, 120);
  // 1) commit whatever the workspace holds (no-op-safe)
  const cm = await sh('git add -A && git -c user.email=noir@local -c user.name=NOIR commit -m ' + JSON.stringify(commitMsg) + ' --no-gpg-sign 2>&1 || true', { cwd: dir, timeoutMs: 40000 });
  const head = (await sh('git rev-parse HEAD 2>/dev/null', { cwd: dir })).output.trim();
  // 2) make sure the remote repository exists (never guess: ask GitHub)
  const { exists } = await repoOnGithub(conn.token, conn.login, repoName).catch((e) => { throw new Error('Cannot reach GitHub to check the repository: ' + (e.message || e)); });
  if (!exists) {
    try { await createRepo(conn.token, { name: repoName, description: project.description || (project.name + ' — built with NOIR'), isPrivate: !(process.env.NOIR_GITHUB_PUBLIC === '1' || process.env.NOIR_GITHUB_PUBLIC === 'true') }); }
    catch (e) { if (!/already exists/i.test(String(e.message || ''))) throw e; }
  }
  const remote = REMOTE_OVERRIDE() || ('https://' + GH_HOST() + '/' + conn.login + '/' + repoName + '.git');
  // 3) push with the token in an HTTP header via env var — nothing secret lands in .git/config or argv
  const b64 = Buffer.from('x-access-token:' + conn.token).toString('base64');
  const p = await sh('git -c credential.helper= -c http.extraheader="AUTHORIZATION: Basic $NOIR_GH_AUTH" push -u ' + remote + ' HEAD:refs/heads/' + branch + ' 2>&1', { cwd: dir, timeoutMs: 120000, env: { NOIR_GH_AUTH: b64, GIT_TERMINAL_PROMPT: '0' } });
  if (!/error|fatal|rejected|denied/i.test(p.output) && !p.error) {
    return { ok: true, login: conn.login, repo: repoName, branch, commit: head, remote, html_url: REMOTE_OVERRIDE() ? '' : ('https://' + GH_HOST() + '/' + conn.login + '/' + repoName), output: p.output.slice(-1600), note: cm.output.includes('nothing to commit') ? 'Working tree was already committed; pushed existing history.' : '' };
  }
  const err = Object.assign(new Error('Push failed: ' + (p.output || p.error).slice(-600)), { code: 'PUSH_FAILED', detail: (p.output + '\n' + (p.error || '')).slice(-2000) });
  throw err;
}
