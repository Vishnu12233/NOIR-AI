// runner.js — sandboxed app runner for generated projects.
// Each project runs as its own OS process in its own directory, bound to
// 127.0.0.1 on a dedicated port, with captured logs. NOIR (the platform) runs in
// the same OS container, so process/CPU/memory limits come from the container;
// secrets are never passed to previews unless the user adds them as env vars.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { appDir, ensureRuntime } from './paths.js';
import { runServers, projects as db } from '../db.js';

const PORT_BASE = 3450;
const PORT_MAX = 3800;
const taken = new Set();
let nextPort = PORT_BASE;
// Serialize starts: concurrent startProject calls (e.g. pipeline run + manual Run)
// must never hand out the same port or double-spawn one project.
let gate = Promise.resolve();
function gateRun(fn) {
  const run = gate.then(fn);
  gate = run.catch(() => {});
  return run;
}

function allocPort() {
  for (let i = 0; i < 200; i++) {
    const p = nextPort++;
    if (nextPort > PORT_MAX) nextPort = PORT_BASE;
    if (!taken.has(p)) return p;
  }
  throw new Error('No free ports');
}
// probe that a port is actually free before spawning (no silent EADDRINUSE)
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(true));
    s.setTimeout(1200, () => { s.destroy(); resolve(true); });
  });
}

import { envVars as envDb } from '../db.js';

export async function startProject(project, rootDir = '') {
  return gateRun(() => innerStart(project, rootDir));
}
async function innerStart(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  if (!fs.existsSync(path.join(dir, 'server.js')) && !fs.existsSync(path.join(dir, 'package.json'))) {
    throw new Error('No runnable entrypoint found (server.js). Build the project first.');
  }
  const existing = runServers.get(project.id);
  if (existing && isAlive(existing.pid)) {
    return { already_running: true, port: existing.port, pid: existing.pid };
  }
  ensureRuntime();
  let port = allocPort();
  while (!(await portFree(port))) { taken.add(port); port = allocPort(); }
  taken.add(port);
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const logFile = path.join(dir, '.noir', 'run.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, 'a');
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', NOIR_RUNNER: '1' };
  // project env vars (stored masked in DB, unmasked only here at spawn time)
  for (const ev of envDb.all(project.id)) env[ev.key] = ev.value;
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env, stdio: ['ignore', out, out], detached: true });
  child.unref();
  runServers.set(project.id, { pid: child.pid, port, cwd: dir, log_file: logFile });
  // wait for health
  const health = await waitHealth(port, 15000);
  if (!health.ok) runServers.delete(project.id);
  db.update(project.id, { port, status: 'running', built_at: Date.now(), root_dir: rootDir || '' });
  if (!health.ok) {
    db.update(project.id, { status: 'failed' });
    const tail = await readLogFile(logFile, 60);
    throw new Error('App did not become healthy. ' + (health.err || '') + '\n' + tail);
  }
  return { port, pid: child.pid, log_file: logFile, healthy: true, url: '/preview/' + project.id + '/' };
}

async function waitHealth(port, ms) {
  const end = Date.now() + ms;
  let lastErr = null;
  while (Date.now() < end) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch('http://127.0.0.1:' + port + '/api/health', { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return { ok: true };
      lastErr = 'HTTP ' + res.status;
    } catch (e) { lastErr = String(e.message || e).slice(0, 120); }
    await sleep(400);
  }
  return { ok: false, err: lastErr };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function stopProject(project) {
  const row = runServers.get(project.id);
  if (row) {
    try { process.kill(-row.pid, 'SIGTERM'); } catch { /* already gone */ }
    try { process.kill(row.pid, 'SIGTERM'); } catch { /* already gone */ }
    taken.delete(row.port);
    runServers.remove(project.id);
  }
  const cur = db.byId(project.id);
  if (cur && cur.status !== 'failed') db.update(project.id, { status: 'idea' });
}

export function runnerStatus(projectId) {
  const row = runServers.get(projectId);
  if (!row) return null;
  return { ...row, alive: isAlive(row.pid) };
}

export async function readLogs(project, lines = 200) {
  const row = runServers.get(project.id);
  const file = row && row.log_file ? row.log_file : path.join(appDir(project, project.root_dir || ''), '.noir', 'run.log');
  return readLogFile(file, lines);
}
async function readLogFile(file, lines) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content.split('\n').slice(-lines).join('\n');
  } catch { return '(no log yet)'; }
}

export function projectRuntimeInfo(project) {
  const row = runServers.get(project.id);
  return row && isAlive(row.pid) ? { running: true, port: row.port, pid: row.pid, log_file: row.log_file, since: row.started_at } : { running: false };
}

/** Watchdog: clear dead runner entries. */
export function watchdog() {
  for (const row of runServers.all()) {
    if (!isAlive(row.pid)) {
      taken.delete(row.port);
      runServers.remove(row.project_id);
      const p = db.byId(row.project_id);
      if (p && p.status === 'running') db.update(row.project_id, { status: 'failed' });
    }
  }
}

// Sweep orphaned generated-app processes (e.g. from a previous server boot) so
// they never keep ports or CPU after a restart. Real process management — never guessed.
export async function sweepOrphans() {
  const myPid = process.pid;
  let killed = 0;
  try {
    const dirs = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
    const targets = [];
    for (const d of dirs) {
      const pid = Number(d);
      if (pid === myPid) continue;
      try {
        const cwd = fs.readlinkSync('/proc/' + d + '/cwd');
        if (cwd.includes('/data/runtime/')) targets.push(pid);
      } catch { /* gone */ }
    }
    for (const pid of targets) {
      try { process.kill(pid, 'SIGTERM'); killed++; } catch { /* noop */ }
    }
    if (targets.length) await new Promise((r) => setTimeout(r, 900));
    for (const pid of targets) {
      try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  } catch { /* noop */ }
  return { killed };
}
