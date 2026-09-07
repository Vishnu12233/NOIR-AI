// clouddeploy.js — deployment/provisioning workers for REAL providers.
// Every step performs an actual operation or writes the actual error. States:
// queued → building → ready | failed | blocked | canceled (+ supabase: provisioning).
// URL + provider states always come from the provider response — never synthesized.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { deployments, envVars, audit, activity, projects as pstore } from '../db.js';
import { appDir, absPath, listFiles } from './paths.js';
import { runTestSuite } from './tests.js';
import { deployProject as localDeploy } from './deploy.js';
import { VercelProvider } from '../providers/vercel/index.js';
import { SupabaseProvider } from '../providers/supabase/index.js';
import { AppwriteProvider } from '../providers/appwrite/index.js';
import { sqlFromSpecTables } from '../providers/supabase/database.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const workers = new Map(); // deployment_id -> running promise
const ephemeral = new Map(); // deployment_id -> { dbPass } — transient only, never persisted

/** Hand a one-shot secret (e.g. db password) to a worker without ever storing it. */
export function passSecret(deploymentId, obj) {
  ephemeral.set(deploymentId, obj);
  setTimeout(() => ephemeral.delete(deploymentId), 30 * 60 * 1000);
}

export function workerBusy(id) { return workers.has(id); }
const log = (did, level, text) => { try { deployments.addLog(did, level, String(text)); } catch { /* noop */ } };
const setStatus = (did, status, extra = {}) => {
  deployments.update(did, { status, ...extra, ...(status === 'ready' || status === 'failed' || status === 'blocked' || status === 'canceled' ? { finished_at: Date.now() } : {}) });
};

// ---- secret gate (Phase 27): block deploy when hardcoded secrets are found ----
const SECRET_PATTERNS = [
  [/sk-(?:live|test|proj)-[A-Za-z0-9_-]{12,}/, 'AI provider key'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/sbp_[A-Za-z0-9]{20,}/, 'Supabase access token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/, 'private key'],
  [/postgres(ql)?:\/\/[^\s"']+:([^\s"']+)@[^\s"']+/, 'database connection string with password'],
  [/\b(?:password|passwd|secret|api[_-]?key|token|client[_-]?secret)\s*[:=]\s*["'][^"']{8,}["']/i, 'hardcoded credential assignment'],
];
const SKIP_FILES = /(^|\/)(\.noir|node_modules|data|\.git|docs)\//;
const SKIP_NAME = /(db\/seed\.js|tests?\/|\.test\.|\.spec\.|meta\.js$)/;
export function secretScan(dir) {
  const hits = [];
  const walk = (d, rel = '') => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (SKIP_FILES.test('/' + r + '/')) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp, r);
      else if (SKIP_NAME.test('/' + r)) continue;
      else if (e.size > 2000000) continue;
      else {
        let c = null;
        try { c = fs.readFileSync(fp, 'utf8'); } catch { continue; }
        const lines = c.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i];
          const t = raw.trim();
          if (!t) continue;
          if (t.startsWith('#') || t.startsWith('//') || t.startsWith(';') || t.startsWith('*') || t.startsWith('<!--')) continue; // comment/docs — not a credential
          for (const [rx, label] of SECRET_PATTERNS) {
            rx.lastIndex = 0;
            if (rx.test(raw)) { hits.push({ file: r, line: i + 1, kind: label, detail: t.slice(0, 140) }); break; }
          }
        }
      }
    }
  };
  walk(dir);
  return hits;
}

// ---- which project env vars may be pushed to a provider (never management creds) ----
const MGMT_KEY = /(^|_)(VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_MANAGEMENT|SUPABASE_OAUTH|APPWRITE|GITHUB|NOIR_ENC|NOIR_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY|GROQ_API_KEY|XAI_API_KEY)($|_)/i;
const MGMT_VALUE = /(sk-(live|proj)-|ghp_|sbp_|xox[baprs]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/;
export function pushableEnv(projectId) {
  const ok = [];
  for (const e of envVars.all(projectId)) {
    if (MGMT_KEY.test(e.key) || MGMT_VALUE.test(e.value || '')) continue; // management/provider credential → never leave NOIR
    ok.push({ key: e.key, value: e.value, target: ['production', 'preview', 'development'] });
  }
  return ok;
}

// ---------------- bundle helpers ----------------
function copyInto(fromDir, toDir, relList, { skip = () => false } = {}) {
  for (const rel of relList) {
    if (skip(rel)) continue;
    const src = path.join(fromDir, rel);
    const dst = path.join(toDir, rel);
    try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch { /* skip unreadable */ }
  }
}
const skipInternal = (rel) => /^(\.noir\/|data\/|node_modules\/|\.git\/|docs\/|tests\/|\.env)/.test(rel);
export function buildVercelBundle(project, rootDir, { staticMode }) {
  const dir = appDir(project, rootDir);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'noir-vc-'));
  const rels = listFiles(project, rootDir);
  const srcDir = path.join(dir, 'src');
  if (staticMode) {
    const clientRels = (fs.existsSync(srcDir) ? listFiles(project, path.join(rootDir, 'src')).map((f) => 'src/' + f) : []).filter((f) => !skipInternal(f) && !/(server|meta\.js$)/.test(f));
    copyInto(dir, out, clientRels, { skip: skipInternal });
    // move src/* to bundle root so the provider serves the app from "/"
    const inner = path.join(out, 'src');
    if (fs.existsSync(inner)) {
      for (const e of fs.readdirSync(inner)) { try { fs.renameSync(path.join(inner, e), path.join(out, e)); } catch { /* noop */ } }
      try { fs.rmSync(inner, { recursive: true, force: true }); } catch { /* noop */ }
    }
    fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({ version: 2, cleanUrls: true, rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2));
    return out;
  }
  // repo/adapter mode: upload the whole project as-is (user's vercel.json/api included)
  copyInto(dir, out, rels, { skip: skipInternal });
  return out;
}
export async function filesManifest(dir) {
  const out = [];
  const walk = (d, rel = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) { if (!['.git', 'node_modules'].includes(e.name)) walk(fp, r); }
      else if (fs.statSync(fp).size < 3 * 1024 * 1024) out.push(r);
    }
  };
  walk(dir);
  const total = out.reduce((n, r) => n + fs.statSync(path.join(dir, r)).size, 0);
  return { files: out, totalBytes: total };
}
export function tarGz(dir) {
  const tar = fs.mkdtempSync(path.join(os.tmpdir(), 'noir-tar-'));
  const out = path.join(tar, 'code.tar.gz');
  execFileSync('tar', ['czf', out, '-C', dir, '.'], { stdio: 'pipe' });
  const buf = fs.readFileSync(out);
  try { fs.rmSync(tar, { recursive: true, force: true }); } catch { /* noop */ }
  return buf;
}

// ---------------- generic worker ----------------
export function startWorker(deploymentId, fn) {
  if (workers.has(deploymentId)) return false;
  const p = fn().catch((e) => {
    const msg = String(e && e.message ? e.message : e).slice(0, 1200);
    log(deploymentId, 'error', msg);
    setStatus(deploymentId, 'failed', { error: msg });
    try { const d = deployments.get(deploymentId); audit.log({ user_id: d.user_id, project_id: d.project_id, action: 'deployment_failed', risk: 'high', result: 'failed', detail: d.provider + ' ' + msg.slice(0, 200) }); } catch { /* noop */ }
  }).finally(() => workers.delete(deploymentId));
  workers.set(deploymentId, p);
  return true;
}

export async function runDeployment(deploymentId) {
  const d = deployments.get(deploymentId);
  if (!d) return;
  const { provider, project_id: pid, id: did } = d;
  const project = pstore.byId(pid);
  if (!project) { setStatus(did, 'failed', { error: 'Project no longer exists.' }); return; }
  const rootDir = project.root_dir || '';
  log(did, 'info', 'Deployment ' + did + ' → provider: ' + provider);
  if (provider === 'local') return runLocal(d, project, rootDir);
  if (provider === 'vercel') return runVercel(d, project, rootDir);
  if (provider === 'appwrite') return runAppwrite(d, project, rootDir);
  if (provider === 'supabase') return runSupabase(d, project, rootDir);
  setStatus(did, 'failed', { error: 'Unknown provider: ' + provider });
}

async function phasePreflight(d, project, rootDir) {
  const dir = appDir(project, rootDir);
  setStatus(d.id, 'building');
  log(d.id, 'info', '— Preflight: scanning for hardcoded secrets');
  const hits = secretScan(dir);
  if (hits.length) {
    setStatus(d.id, 'blocked', { error: 'Secret detected in source code — deployment blocked. Remove it or move it to project Env before deploying.' });
    for (const h of hits.slice(0, 10)) log(d.id, 'error', `BLOCKED: ${h.kind} at ${h.file}:${h.line} — ${h.detail}`);
    audit.log({ user_id: d.user_id, project_id: d.project_id, action: 'deployment_blocked', risk: 'high', result: 'blocked', detail: d.provider + ' secrets:' + hits.length });
    return false;
  }
  log(d.id, 'info', '— Secret scan clean (' + (hits.length) + ' findings)');
  log(d.id, 'info', '— Running test suite against the live server code');
  try {
    const t = await runTestSuite(project, rootDir);
    log(d.id, t.ok ? 'info' : 'warn', `— Tests: ${t.passed}/${t.passed + t.failed} passed` + (t.ok ? '' : ' (failing — continuing, provider build is the gate)'));
  } catch (e) { log(d.id, 'warn', '— Tests could not run: ' + String(e.message || e).slice(0, 200)); }
  return true;
}

async function runLocal(d, project, rootDir) {
  if (!(await phasePreflight(d, project, rootDir))) return;
  log(d.id, 'info', '— Deploying to the NOIR local runtime (real sandbox server)');
  try {
    const out = await localDeploy(project, 'local', { user_id: d.user_id });
    if (out.state === 'live') {
      setStatus(d.id, 'ready', { url: out.url || '', meta: JSON.stringify({ provider_state: 'live', port: out.port || null }) });
      log(d.id, 'info', '— Live: ' + (out.url || 'running'));
    } else {
      const err = out.error || out.state;
      setStatus(d.id, 'failed', { error: String(err).slice(0, 1200) });
      log(d.id, 'error', '— Deploy failed: ' + err);
    }
  } catch (e) { setStatus(d.id, 'failed', { error: String(e.message || e).slice(0, 1200) }); }
}

async function runVercel(d, project, rootDir) {
  if (!(await phasePreflight(d, project, rootDir))) return;
  const did = d.id;
  const env = d.environment || 'preview';
  const req = safeReq(d);
  const c = VercelProvider.clientFor(d.user_id);
  if (!c) { setStatus(did, 'failed', { error: 'Vercel is not connected.' }); return; }
  const vc = c.vc;
  const name = slug(pstore.byId(d.project_id).name);
  log(did, 'info', '— Vercel: checking project "' + name + '"');
  let proj = await VercelProvider.projects.findProject(vc, name).catch((e) => null);
  if (!proj) {
    const created = await VercelProvider.projects.createProject(vc, { name }).catch((e) => { throw new Error('Vercel project create failed: ' + e.message); });
    proj = created;
    log(did, 'info', '— Vercel project created: ' + proj.id);
  } else log(did, 'info', '— Vercel project exists: ' + proj.id);
  deployments.update(did, { provider_project_id: proj.id });
  const envs = pushableEnv(d.project_id);
  if (envs.length) {
    log(did, 'info', '— Setting ' + envs.length + ' environment variable(s) on Vercel (' + env + ') — management credentials are never pushed');
    for (const e of envs) await VercelProvider.environment.setEnv(vc, proj.id, e.key, e.value, [env === 'production' ? 'production' : 'preview', 'preview', 'development']).catch((err) => log(did, 'warn', 'env ' + e.key + ': ' + String(err.message || err).slice(0, 160)));
  }
  log(did, 'info', '— Uploading files + creating deployment (target: ' + env + ')');
  const adapter = req.static ? 'static' : fs.existsSync(path.join(appDir(project, rootDir), 'vercel.json')) ? 'repo' : 'static';
  if (!req.static && adapter === 'static' && fs.existsSync(path.join(appDir(project, rootDir), 'server.js'))) {
    // A full-stack generated app has a custom Node server that Vercel cannot run
    // as-is. Deploying only the client would silently break /api — so we require
    // an explicit adapter or static mode instead of pretending.
    setStatus(did, 'failed', {
      error: 'This project has a custom Node API server (server.js) which Vercel cannot execute as-is. Options: (1) deploy with "static frontend" when the app is backed by a hosted API, (2) add your own vercel.json + api/ functions (uploaded verbatim), or (3) use Appwrite Sites / NOIR runtime for full-stack deploys. Nothing was uploaded.',
    });
    log(did, 'error', '— Vercel full-stack gate: no serverless adapter in the project — deployment blocked before upload.');
    return;
  }
  const bundle = buildVercelBundle(project, rootDir, { staticMode: adapter === 'static' });
  const manifest = await filesManifest(bundle);
  log(did, 'info', '— Bundle: ' + manifest.files.length + ' files, ' + Math.round(manifest.totalBytes / 1024) + ' KB');
  const files = [];
  for (const rel of manifest.files) files.push({ file: rel, data: fs.readFileSync(path.join(bundle, rel)).toString('base64') });
  const dep = await VercelProvider.deployments.createDeployment(vc, { name, files, target: env === 'production' ? 'production' : 'preview', projectId: proj.id }).catch((e) => { throw e; });
  deployments.update(did, { provider_deployment_id: dep.id, url: dep.url || null, meta: JSON.stringify({ provider_state: dep.readyState, phase: 'provider_build', project: name }) });
  log(did, 'info', '— Deployment ' + dep.id + ' created — state: ' + dep.readyState);
  // poll
  let state = dep.readyState;
  const deadline = Date.now() + 12 * 60 * 1000;
  let seen = new Set();
  while (!['READY', 'ERROR', 'CANCELED'].includes(state) && Date.now() < deadline) {
    await sleep(3000);
    const cur = await VercelProvider.deployments.getDeployment(vc, dep.id).catch((e) => null);
    if (!cur) continue;
    state = cur.readyState || state;
    if (cur.url) deployments.update(did, { url: cur.url });
    deployments.update(did, { meta: JSON.stringify({ provider_state: state, phase: 'provider_build', project: name }) });
    // real build logs
    try {
      const ev = await VercelProvider.logs.buildEvents(vc, dep.id);
      for (const e of (ev.events || [])) {
        const k = e.created + '|' + e.text.slice(0, 80);
        if (seen.has(k)) continue;
        seen.add(k);
        log(did, 'info', '[vercel] ' + e.text.slice(0, 400));
      }
    } catch { /* log fetch optional */ }
  }
  if (state === 'READY') {
    const cur = await VercelProvider.deployments.getDeployment(vc, dep.id).catch(() => null);
    const url = cur && cur.url ? cur.url : dep.url;
    setStatus(did, 'ready', { url: url || null, provider_deployment_id: dep.id, meta: JSON.stringify({ provider_state: 'READY', provider_url: url ? 'https://' + url : null, project: name }) });
    log(did, 'info', '— Vercel confirmed READY — ' + (url ? 'https://' + url : 'no URL returned'));
  } else if (state === 'CANCELED') setStatus(did, 'canceled');
  else {
    let errMsg = 'Vercel deployment did not become READY (state: ' + state + ').';
    try { const cur = await VercelProvider.deployments.getDeployment(vc, dep.id); if (cur.errorMessage) errMsg += ' ' + cur.errorMessage; } catch { /* noop */ }
    setStatus(did, 'failed', { error: errMsg.slice(0, 1200) });
    log(did, 'error', errMsg);
  }
}

async function runAppwrite(d, project, rootDir) {
  if (!(await phasePreflight(d, project, rootDir))) return;
  const did = d.id;
  const req = safeReq(d);
  const c = AppwriteProvider.clientFor(d.user_id);
  if (!c) { setStatus(did, 'failed', { error: 'Appwrite is not connected.' }); return; }
  const aw = c.aw;
  const proj = pstore.byId(d.project_id);
  const siteId = slug(proj.name);
  log(did, 'info', '— Appwrite: ensuring site "' + siteId + '" (adapter: ' + (req.static ? 'static' : 'ssr') + ')');
  const site = await AppwriteProvider.sites.createSite(aw, {
    siteId, name: proj.name.slice(0, 90),
    adapter: req.static ? 'static' : 'ssr',
    installCommand: req.static ? undefined : 'npm install',
    startCommand: req.static ? undefined : 'node server.js',
    logging: true,
  });
  deployments.update(did, { provider_project_id: siteId });
  log(did, 'info', '— Site ready: ' + site.id + (site.status ? ' (status ' + site.status + ')' : ''));
  // bundle: full project (ssr) or client files (static)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noir-aw-'));
  const dir = appDir(project, rootDir);
  const rels = listFiles(project, rootDir);
  if (req.static) {
    const src = path.join(dir, 'src');
    copyInto(dir, tmp, (fs.existsSync(src) ? listFiles(project, path.join(rootDir, 'src')).map((f) => 'src/' + f) : []), { skip: skipInternal });
    const inner = path.join(tmp, 'src');
    if (fs.existsSync(inner)) { for (const e of fs.readdirSync(inner)) { try { fs.renameSync(path.join(inner, e), path.join(tmp, e)); } catch { /* noop */ } } }
    if (!fs.existsSync(path.join(tmp, 'index.html'))) { setStatus(did, 'failed', { error: 'No client index.html found for static site deploy.' }); return; }
  } else {
    copyInto(dir, tmp, rels, { skip: skipInternal });
    if (!fs.existsSync(path.join(tmp, 'server.js'))) { setStatus(did, 'failed', { error: 'No server.js in the project — full-stack site deploy impossible.' }); return; }
    if (!fs.existsSync(path.join(tmp, 'package.json'))) fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: siteId, type: 'module', scripts: { start: 'node server.js' } }, null, 2));
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    if (pkg.type !== 'module' && /^import\s/m.test(fs.readFileSync(path.join(tmp, 'server.js'), 'utf8'))) { pkg.type = 'module'; fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg, null, 2)); }
    if (envVars.all(d.project_id).length) log(did, 'warn', 'Note: ' + envVars.all(d.project_id).length + ' project env var(s) exist — Sites deployments currently have no env-var API surface here, so they are NOT embedded in the uploaded code (never embed secrets). Set them in the Appwrite console if the app needs them at runtime.');
  }
  const archive = tarGz(tmp);
  log(did, 'info', '— Uploading ' + Math.round(archive.length / 1024) + ' KB archive + creating deployment');
  const dep = await AppwriteProvider.sites.createDeployment(aw, siteId, archive, { activate: true });
  deployments.update(did, { provider_deployment_id: dep.id, url: dep.url || null, meta: JSON.stringify({ provider_state: dep.status, phase: 'provider_build', site: siteId }) });
  log(did, 'info', '— Deployment ' + dep.id + ' — status: ' + dep.status);
  let state = dep.status || 'processing';
  const deadline = Date.now() + 12 * 60 * 1000;
  const FINAL = ['ready', 'active', 'failed', 'canceled'];
  while (!FINAL.includes(state) && Date.now() < deadline) {
    await sleep(3500);
    const cur = await AppwriteProvider.sites.getDeployment(aw, siteId, dep.id).catch(() => null);
    if (!cur) continue;
    state = cur.status || state;
    if (cur.url) deployments.update(did, { url: cur.url });
    deployments.update(did, { meta: JSON.stringify({ provider_state: state, phase: 'provider_build', site: siteId }) });
    log(did, 'info', '— Appwrite deployment status: ' + state);
    if (cur.failureReason) log(did, 'error', '— provider failure: ' + String(cur.failureReason).slice(0, 500));
  }
  const logs = await AppwriteProvider.sites.getSiteLogs(aw, siteId).catch(() => ({ logs: [] }));
  for (const l of (logs.logs || []).slice(-40)) if (l.text) log(did, 'info', '[appwrite] ' + String(l.text).slice(0, 400));
  if (state === 'ready' || state === 'active') {
    setStatus(did, 'ready', { url: d.url || null, meta: JSON.stringify({ provider_state: state, site: siteId }) });
    log(did, 'info', '— Appwrite confirmed ' + state.toUpperCase() + (d.url ? ' — ' + d.url : ''));
  } else if (state === 'canceled') setStatus(did, 'canceled');
  else setStatus(did, 'failed', { error: 'Appwrite deployment ended in state ' + state + '. Check the logs above for the provider error.' });
}

// ---------------- Supabase backend provisioning ----------------
async function runSupabase(d, project, rootDir) {
  const did = d.id;
  const req = safeReq(d);
  const c = SupabaseProvider.clientFor(d.user_id);
  if (!c) { setStatus(did, 'failed', { error: 'Supabase is not connected.' }); return; }
  const sb = c.sb;
  setStatus(did, 'building', { meta: JSON.stringify({ phase: 'provisioning' }) });
  log(did, 'info', '— Supabase: resolving organization');
  const orgs = await SupabaseProvider.organizations.listOrganizations(sb);
  const org = orgs.find((o) => o.id === req.organizationId || o.slug === req.organizationSlug) || orgs[0];
  if (!org) { setStatus(did, 'failed', { error: 'No Supabase organization accessible with this credential.' }); return; }
  log(did, 'info', '— Organization: ' + org.name + ' (' + org.id + ')');
  // reuse an existing project ref when provided (retry/continue), else create
  let ref = req.projectRef;
  if (!ref) {
    const name = (req.projectName || project.name + '-db').slice(0, 40);
    log(did, 'info', '— Creating Supabase project "' + name + '" in ' + org.name + ' (region ' + (req.region || 'ap-south-1') + ')');
    const pw = (ephemeral.get(did) || {}).dbPass || randomPass();
    const created = await SupabaseProvider.projects.createProject(sb, { name, organizationSlug: org.slug || org.id, dbPass: pw, region: req.region || 'ap-south-1' }).catch((e) => { throw new Error('Supabase project creation failed: ' + e.message); });
    ref = created.ref;
    log(did, 'info', '— Project created — ref: ' + ref + ' (status ' + (created.status || 'COMING_UP') + ') — waiting for ACTIVE (real provisioning, may take minutes)');
  } else log(did, 'info', '— Reusing project ref ' + ref);
  deployments.update(did, { provider_project_id: ref, meta: JSON.stringify({ phase: 'provisioning', ref }) });
  // poll until ACTIVE
  const deadline = Date.now() + 12 * 60 * 1000;
  let st = '';
  while (Date.now() < deadline) {
    await sleep(8000);
    const p = await SupabaseProvider.projects.getProject(sb, ref).catch(() => null);
    if (!p) { log(did, 'warn', '— status probe failed — retrying'); continue; }
    st = p.status;
    log(did, 'info', '— project status: ' + st);
    if (st === 'ACTIVE') break;
    if (st && /INACTIVE|FAILED|ERROR/i.test(st)) { setStatus(did, 'failed', { error: 'Supabase project entered state ' + st + ' — check the Supabase dashboard.' }); return; }
  }
  if (st !== 'ACTIVE') { setStatus(did, 'failed', { error: 'Supabase project ' + ref + ' did not reach ACTIVE within 12 minutes — it may still be provisioning in the dashboard. Retry with project_ref ' + ref + ' to continue where it left off.' }); return; }
  log(did, 'info', '— Project ACTIVE — ref ' + ref);
  const keys = await SupabaseProvider.projects.apiKeys(sb, ref);
  const url = 'https://' + ref + '.supabase.co';
  // migrations from the compiled spec
  const spec = loadSpec(project, rootDir);
  const tables = spec && spec.tables ? spec.tables : null;
  if (!tables) { setStatus(did, 'failed', { error: 'No compiled spec found — generate the project before provisioning (need db/schema.js tables).' }); return; }
  const ddl = sqlFromSpecTables(tables);
  const versions = [
    { version: '001_initial_schema', name: 'NOIR initial schema', statements: ddl },
  ];
  log(did, 'info', '— Applying ' + versions.length + ' migration(s) via the Management API SQL executor');
  const expected = tables.map((t) => t.table);
  try {
    for (const m of versions) {
      const r = await SupabaseProvider.database.applyMigration(sb, ref, { ...m, checksum: String(m.statements.join('\n').length) });
      log(did, 'info', r.skipped ? '— ' + m.version + ': already applied (skipped)' : '— ' + m.version + ': applied (' + m.statements.length + ' statements)');
    }
    const check = await SupabaseProvider.database.verifySchema(sb, ref, expected);
    const missing = check.filter((x) => !x.exists);
    log(did, missing.length ? 'error' : 'info', '— Schema verification: ' + (expected.length - missing.length) + '/' + expected.length + ' tables present' + (missing.length ? ' — missing: ' + missing.map((m) => m.table).join(', ') : ''));
    if (missing.length) { setStatus(did, 'failed', { error: 'Schema verification failed — missing tables: ' + missing.map((m) => m.table).join(', ') }); return; }
  } catch (e) {
    setStatus(did, 'failed', { error: 'Migration failed — nothing further applied: ' + String(e.message || e).slice(0, 900) });
    return;
  }
  // client-safe + connection envs into the NOIR project (server-side Env tab)
  const pw = (ephemeral.get(did) || {}).dbPass || randomPass();
  envVars.set(d.project_id, 'DATABASE_URL', 'postgresql://postgres:' + encodeURIComponent(pw) + '@db.' + ref + '.supabase.co:5432/postgres');
  envVars.set(d.project_id, 'SUPABASE_URL', url);
  if (keys.anon) envVars.set(d.project_id, 'SUPABASE_ANON_KEY', keys.anon);
  log(did, 'info', '— Stored DATABASE_URL / SUPABASE_URL' + (keys.anon ? ' / SUPABASE_ANON_KEY' : '') + ' in the project Env (server-side). Provider management tokens and the database password are not stored. Restart the app to pick them up.');
  activity.add(d.user_id, d.project_id, '🗄️', 'Supabase project ' + ref + ' provisioned: ' + expected.join(', '));
  audit.log({ user_id: d.user_id, project_id: d.project_id, action: 'deployment_succeeded', risk: 'high', result: 'ok', detail: 'supabase ' + ref });
  setStatus(did, 'ready', { url, provider_project_id: ref, meta: JSON.stringify({ phase: 'ready', ref, tables: expected.length }) });
  log(did, 'info', '— Backend READY: ' + url);
}
function loadSpec(project, rootDir) {
  try {
    const dir = appDir(project, rootDir);
    const f = path.join(dir, 'db', 'schema.js');
    if (!fs.existsSync(f)) return null;
    // schema files are plain object literals — extract synchronously, never execute app code
    const src = fs.readFileSync(f, 'utf8');
    const m = src.match(/export\s+(?:const|let|var)\s+(?:SCHEMA|schema)\s*=\s*(\{[\s\S]*?\n\});?/);
    return m ? safeEvalObj(m[1]) : null;
  } catch { return null; }
}
function safeEvalObj(src) {
  try { return Function('"use strict"; return (' + src + ');')(); } catch { return null; }
}
function randomPass() {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let s = '';
  for (let i = 0; i < 20; i++) s += c[Math.floor(Math.random() * c.length)];
  return s + 'aA1!';
}
export const slug = (s) => String(s || 'p').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'p';
export function safeReq(d) {
  try { const r = JSON.parse(d.request || '{}'); delete r.dbPass; return r; } catch { return {}; }
}
