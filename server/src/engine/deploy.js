// deploy.js — honest deployment orchestration.
// Local target: real — preflight (build/tests/env/db) then serve as "live".
// External providers (Vercel/Supabase/Appwrite/PostgreSQL infra) run the same
// preflight, then require real credentials: until configured they report
// REQUIRES_CONFIGURATION with exact next steps. NOIR never fabricates a deploy.
import fs from 'node:fs';
import path from 'node:path';
import { appDir } from './paths.js';
import { envVars, activity, audit, tasks, memory } from '../db.js';
import { runTestSuite } from './tests.js';
import { runTool } from './tools.js';
import { startProject, stopProject } from './runner.js';
import { securityScan } from './scans.js';

export const DEPLOY_TARGETS = [
  { id: 'local', label: 'Local environment (this sandbox)', real: true },
  { id: 'vercel', label: 'Vercel', real: false, requires: 'VERCEL_TOKEN' },
  { id: 'supabase', label: 'Supabase (hosted Postgres)', real: false, requires: 'DATABASE_URL (Supabase connection string)' },
  { id: 'appwrite', label: 'Appwrite', real: false, requires: 'APPWRITE_ENDPOINT + APPWRITE_API_KEY' },
  { id: 'pg', label: 'PostgreSQL infrastructure', real: false, requires: 'DATABASE_URL' },
];

export async function preflight(project, rootDir = '') {
  const checks = [];
  const dir = appDir(project, rootDir);
  const envRows = envVars.all(project.id);
  const envSet = new Set(envRows.map((e) => e.key));
  const used = new Set();
  const scanFile = (fp) => {
    try { for (const m of fs.readFileSync(fp, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]); } catch { /* noop */ }
  };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/^[^.]/i.test(e.name) && /\.(js|mjs)$/.test(e.name)) scanFile(fp);
    }
  };
  for (const f of ['server.js', 'lib', 'db', 'src']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.isFile() && /\.js$/.test(f)) scanFile(p);
  }
  const optional = new Set(['PORT', 'HOST', 'NODE_ENV']);
  for (const key of used) if (!optional.has(key) && !envSet.has(key)) checks.push({ name: 'Environment: ' + key, ok: false, detail: 'Set ' + key + ' in NOIR → Environment before deploying.' });
  // build check
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  checks.push({ name: 'Build & entrypoint', ok: fs.existsSync(path.join(dir, 'server.js')), detail: fs.existsSync(path.join(dir, 'server.js')) ? 'server.js present (' + pkg.name + ')' : 'server.js missing — run Build first.' });
  // tests
  const t = await runTestSuite(project, rootDir).catch((e) => ({ executed: false, reason: e.message }));
  checks.push({ name: 'Test suite', ok: t.ok === true, detail: t.executed ? t.passed + ' passed / ' + t.failed + ' failed' : 'No tests directory — ' + (t.reason || 'skipped') });
  // security quick gate
  const sec = await securityScan(project, rootDir);
  const crit = sec.issues.filter((i) => i.severity === 'critical').length;
  checks.push({ name: 'Security scan', ok: crit === 0, detail: crit + ' critical finding(s)' + (crit ? ' — review Security before shipping' : ' — clean') });
  // db
  const datUrl = envVars.getValue(project.id, 'DATABASE_URL');
  checks.push({ name: 'Database backend', ok: true, detail: datUrl ? 'PostgreSQL configured (verify connectivity in Database explorer)' : 'Built-in file backend' });
  return { ok: checks.every((c) => c.ok), checks };
}

export async function deployProject(project, target = 'local', args = {}) {
  audit.log({ user_id: args.user_id || 'system', project_id: project.id, action: 'deploy.start', tool: 'deploy', risk: 'high', result: 'start', detail: target });
  const pf = await preflight(project, project.root_dir || '');
  if (!pf.ok) {
    const failed = pf.checks.filter((c) => !c.ok).map((c) => c.name).join('; ');
    return { state: 'failed', target, error: 'Preflight failed: ' + failed, checks: pf.checks };
  }
  const tdef = DEPLOY_TARGETS.find((t) => t.id === target);
  if (!tdef) return { state: 'failed', error: 'Unknown target' };
  if (!tdef.real) {
    const envRows = envVars.all(project.id);
    const envMap = Object.fromEntries(envRows.map((e) => [e.key, e.value]));
    const need = tdef.requires.split(' + ').map((k) => k.split(' ')[0].replace(/[()]/g, '')).filter((k) => !envMap[k] && !process.env[k]);
    if (need.length) {
      return { state: 'requires_config', target, provider: tdef.label, error: tdef.label + ' is not configured. Set ' + tdef.requires + ' in NOIR → Environment, then retry. No code was changed and nothing was deployed.', checks: pf.checks };
    }
    return { state: 'requires_config', target, provider: tdef.label, error: 'Provider bridge for ' + tdef.label + ' is configured but NOIR currently only executes deploys to its local runtime. Remote shipping requires connecting the provider in Integrations.', checks: pf.checks };
  }
  // real local deploy
  await stopProject(project);
  try {
    const info = await startProject(project, project.root_dir || '');
    const url = info.url;
    const d = new Date().toISOString();
    memory.add(project.id, 'note', { kind: 'deployment', at: d, target, url, checks: pf.checks.map((c) => ({ name: c.name, ok: c.ok })) });
    audit.log({ user_id: args.user_id || 'system', project_id: project.id, action: 'deploy.live', risk: 'high', result: 'ok', detail: 'local live' });
    return { state: 'live', target, url, port: info.port, checks: pf.checks, deployed_at: d };
  } catch (e) {
    return { state: 'failed', target, error: String(e.message || e).slice(0, 600), checks: pf.checks };
  }
}

export async function deploymentStatus(project) {
  const m = memory.list(project.id).filter((x) => x.kind === 'note' && x.content && x.content.kind === 'deployment');
  const last = m[m.length - 1];
  const t = tasks.all(project.id).filter((x) => x.kind === 'deploy').slice(-1)[0];
  return {
    state: project.status === 'live' ? 'live' : project.status === 'running' ? 'running' : project.status === 'failed' ? 'failed' : 'idle',
    last: last ? { at: last.content.at, target: last.content.target, url: last.content.url } : null,
    port: project.port,
    deployed_url: project.deployed_url || null,
  };
}
