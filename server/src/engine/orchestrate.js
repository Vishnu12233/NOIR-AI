// orchestrate.js — NOIR Orchestrator: plans, agents and the build pipeline.
// The orchestrator walks the task graph, dispatches each task to its agent,
// records tool executions, and applies real retry limits (never infinite loops).
import fs from 'node:fs';
import path from 'node:path';
import { projects, tasks, memory, audit, activity, usage, checkpoints, pfiles, envVars } from '../db.js';
import { analyzeRequirement, enhanceWithAi } from './analyze.js';
import { compileSpec } from '../gen/spec.js';
import { generateProject, writeProjectTo } from '../gen/project.js';
import { projectDir, absPath, ensureRuntime } from './paths.js';
import { runTool } from './tools.js';
import { runTestSuite } from './tests.js';
import { startProject, stopProject } from './runner.js';
import { securityScan, projectHealth } from './scans.js';
import { checkpoint } from './gitutil.js';
import { buildDocs } from './docgen.js';

export const AGENTS = [
  'NOIR Orchestrator', 'Planner Agent', 'Architect Agent', 'Database Agent', 'Backend Agent',
  'Frontend Agent', 'UI/UX Agent', 'QA Agent', 'Debugging Agent', 'Security Agent',
  'Performance Agent', 'Accessibility Agent', 'SEO Agent', 'Docs Agent', 'Deployment Agent',
];

export const PIPELINE_STEPS = ['analyze', 'plan', 'generate', 'install', 'run', 'test', 'fix', 'security', 'health', 'docs', 'preview'];
export const STEP_LABELS = {
  analyze: 'Analyze', plan: 'Plan', generate: 'Generate', install: 'Install', run: 'Build & Run',
  test: 'Test', fix: 'Debug', security: 'Security Scan', health: 'Health Check', docs: 'Documentation', preview: 'Preview',
};
const TASK_KIND_TO_STEP = {
  analyze: 'analyze', plan: 'plan', generate: 'generate', install: 'install', run: 'run',
  test: 'test', fix: 'fix', security: 'security', health: 'health', docs: 'docs',
};
export const listeners = new Map(); // projectId -> Set<send fn>

export function subscribe(projectId, send) {
  if (!listeners.has(projectId)) listeners.set(projectId, new Set());
  listeners.get(projectId).add(send);
  return () => listeners.get(projectId)?.delete(send);
}
export function broadcast(projectId, payload) {
  const set = listeners.get(projectId);
  if (set) for (const send of set) { try { send(payload); } catch { /* noop */ } }
}
export function eventLog(userId, projectId, icon, text, status = 'ok') {
  activity.add(userId, projectId, icon, text, status);
  broadcast(projectId, { type: 'activity', icon, text, status });
}

// ---------------- plan builders ----------------
export function buildPlan(spec, mode = 'full') {
  const plan = [];
  const push = (id, title, description, agent, kind, deps = [], priority = 'medium', payload = {}) => plan.push({ id, title, description, agent, kind, deps, priority, payload });
  if (mode === 'full' || mode === 'rebuild') {
    push('TASK-001', 'Analyze requirements', 'Turn your description into a structured specification.', 'Planner Agent', 'analyze', [], 'high');
    push('TASK-002', 'Create architecture', 'Choose the stack, define tables, API surface and pages.', 'Architect Agent', 'plan', ['TASK-001'], 'high');
    push('TASK-003', 'Generate application', 'Write frontend, backend, database schema and seed data.', 'Backend Agent', 'generate', ['TASK-002'], 'high');
    push('TASK-004', 'Initialize repository', 'Create git repo and first checkpoint.', 'Deployment Agent', 'repo', ['TASK-003'], 'medium');
    push('TASK-005', 'Install dependencies', 'Resolve external packages (none by default — zero-dep runtime).', 'Backend Agent', 'install', ['TASK-003'], 'medium');
    push('TASK-006', 'Run application', 'Boot the server in the sandbox and verify health.', 'Deployment Agent', 'run', ['TASK-005'], 'high');
    push('TASK-007', 'Run test suite', 'Execute the generated tests against the live server.', 'QA Agent', 'test', ['TASK-006'], 'high');
    push('TASK-008', 'Fix issues', 'Diagnose failures and repair when safe.', 'Debugging Agent', 'fix', ['TASK-007'], 'high');
    push('TASK-009', 'Security review', 'Scan for secrets, unsafe APIs and misconfigurations.', 'Security Agent', 'security', ['TASK-008'], 'high');
    push('TASK-010', 'Health & performance', 'Measure quality gates and record the health score.', 'Performance Agent', 'health', ['TASK-009'], 'medium');
    push('TASK-011', 'Write documentation', 'Generate README, API and architecture docs.', 'Docs Agent', 'docs', ['TASK-010'], 'low');
    push('TASK-012', 'Checkpoint', 'Commit the working build for rollback safety.', 'Deployment Agent', 'checkpoint', ['TASK-011'], 'medium');
  }
  return plan;
}

// ---------------- pipeline state ----------------
export function pipelineStatus(projectId) {
  const rows = tasks.all(projectId);
  const byKind = {};
  for (const r of rows) {
    const step = TASK_KIND_TO_STEP[r.kind];
    if (!step) continue;
    if (!byKind[step]) byKind[step] = { step, label: STEP_LABELS[step], status: 'skipped', taskIds: [], tasks: [] };
    byKind[step].taskIds.push(r.id);
    byKind[step].tasks.push({ id: r.id, title: r.title, agent: r.agent, status: r.status, error: r.error, attempt: r.attempt });
  }
  for (const s of PIPELINE_STEPS) {
    if (!byKind[s]) byKind[s] = { step: s, label: STEP_LABELS[s], status: 'queued', taskIds: [], tasks: [] };
  }
  // derive statuses
  for (const s of PIPELINE_STEPS) {
    const g = byKind[s];
    if (!g.taskIds.length) { g.status = g.step === 'preview' ? 'waiting' : 'skipped'; continue; }
    const statuses = g.tasks.map((t) => t.status);
    if (statuses.some((x) => x === 'running')) g.status = 'running';
    else if (statuses.some((x) => x === 'failed')) g.status = 'failed';
    else if (statuses.some((x) => x === 'blocked')) g.status = 'blocked';
    else if (statuses.every((x) => x === 'completed')) g.status = 'completed';
    else if (statuses.every((x) => x === 'queued')) g.status = 'queued';
    else g.status = 'queued';
  }
  // preview step reflects runner liveness
  const order = PIPELINE_STEPS.map((s) => byKind[s]);
  return { steps: order };
}

// ---------------- main build entry ----------------
export async function orchestrateBuild({ project, user_id, specOverride = null, mode = 'full', prompt = null }) {
  // pause / cancel guard
  const existing = tasks.openCount(project.id);
  if (existing > 0) {
    // allow starting from clean slate only when explicitly requested
    const cur = projects.byId(project.id);
    if (cur && cur.status !== 'failed') return { error: 'A build is already in progress for this project. Wait for it to finish, or cancel it first.' };
  }
  ensureRuntime();
  // Safety: snapshot the last working state before regeneration wipes/re-writes files.
  await preRebuildCheckpoint(project).catch(() => null);
  // step 1 — analysis. Task ids are namespaced per project (the PK is global).
  tasks.clear(project.id);
  const plan = buildPlan(specOverride ? {} : null, mode);
  const code = String(project.id).slice(0, 6).toUpperCase();
  const map = {};
  for (const t of plan) { map[t.id] = code + '-' + t.id; t.id = map[t.id]; t.deps = (t.deps || []).map((d) => map[d] || d); }
  const specForBuild = specOverride;
  for (const t of plan) {
    tasks.create(project.id, { ...t, status: 'queued', deps: t.deps });
  }
  projects.update(project.id, { status: 'building' });
  eventLog(user_id, project.id, '🏗️', 'Build pipeline started (' + mode + ')');
  usage.add(user_id, 'build', project.id, 0, mode);
  runLoop(project, user_id, { specOverride, prompt, plan }).catch((e) => {
    tasks.setStatus(project.id, 'TASK-001', 'failed', { error: e.message });
    broadcast(project.id, { type: 'build', status: 'failed', error: e.message });
  });
  return { started: true };
}

async function preRebuildCheckpoint(project) {
  const dir = projectDir(project);
  const had = fs.existsSync(path.join(dir, 'server.js')) || fs.existsSync(path.join(dir, 'package.json'));
  const everBuilt = tasks.all(project.id).some((t) => t.kind === 'generate' && t.status === 'completed');
  if (!had && !everBuilt) return null;
  try {
    const cid = 'CP-' + Date.now().toString(36);
    const cp = await checkpoint(project, project.root_dir || '', { id: cid, label: 'Auto — before rebuild', message: 'Automatic safety checkpoint before regeneration' });
    checkpoints.create(cid, project.id, { label: 'Pre-rebuild (auto)', message: 'Automatic safety checkpoint before regeneration', agent: 'NOIR Orchestrator', diff_summary: '', git_ref: cp.ref });
    eventLog('system', project.id, '📌', 'Safety checkpoint before rebuild (' + (cp.ref || cid) + ') — the previous working state stays restorable.');
    return cp;
  } catch { return null; }
}

async function runLoop(project, user_id, ctx) {
  const ROOT_DIR = project.root_dir || '';
  for (const taskRow of tasks.all(project.id)) {
    const st = tasks.get(project.id, taskRow.id);
    if (!st || st.status !== 'queued') continue;
    // dependencies
    const deps = JSON.parse(st.deps || '[]');
    const depOk = deps.every((d) => { const r = tasks.get(project.id, d); return r && (r.status === 'completed' || r.status === 'failed'); });
    if (!depOk) { tasks.setStatus(project.id, st.id, 'blocked', { error: 'dependency incomplete' }); continue; }
    if (st.status === 'queued' && st.attempt >= 2) { tasks.setStatus(project.id, st.id, 'failed', { error: 'Retry limit reached (2 attempts)' }); continue; }
    await runTask(project, user_id, st, ctx, ROOT_DIR);
    broadcast(project.id, { type: 'task', task: publicTask(tasks.get(project.id, st.id)) });
  }
  const opened = tasks.openCount(project.id);
  const failed = tasks.all(project.id).filter((t) => t.status === 'failed' || t.status === 'blocked');
  if (opened === 0) {
    if (failed.length === 0) {
      const health = await projectHealth(project, ROOT_DIR).catch(() => null);
      projects.update(project.id, { health_score: health ? health.overall : null, status: 'running' });
      if (health) memory.add(project.id, 'note', { kind: 'health', at: new Date().toISOString(), overall: health.overall, categories: health.categories });
      eventLog(user_id, project.id, '✅', 'Build complete — app is running, tests and quality gates executed.');
      broadcast(project.id, { type: 'build', status: 'done', health: health && health.overall });
    } else {
      projects.update(project.id, { status: 'failed' });
      eventLog(user_id, project.id, '⚠️', 'Build finished with ' + failed.length + ' failed task(s) — details in the task list.', 'error');
      broadcast(project.id, { type: 'build', status: 'failed' });
    }
  }
}

async function runTask(project, user_id, task, ctx, ROOT_DIR) {
  tasks.setStatus(project.id, task.id, 'running');
  eventLog(user_id, project.id, '⚙️', task.agent + ' — ' + task.title, 'running');
  broadcast(project.id, { type: 'task', task: publicTask(task) });
  try {
    let result = null;
    switch (task.kind) {
      case 'analyze': {
        const prompt = ctx.prompt || project.description || 'A web application';
        const analysis = analyzeRequirement(prompt);
        const envMap = Object.fromEntries(envVars.all(project.id).map((e) => [e.key, e.value]));
        const enhanced = await enhanceWithAi(analysis, prompt, envMap);
        // remember raw analysis + spec
        memory.forget(project.id, 'analysis');
        memory.add(project.id, 'analysis', { prompt, ...enhanced, at: new Date().toISOString() });
        if (!project.description) projects.update(project.id, { description: prompt });
        result = { analysis: publicAnalysis(enhanced), assumptions: enhanced.assumptions };
        break;
      }
      case 'plan': {
        const analysis = memory.byKind(project.id, 'analysis');
        const specRaw = (analysis && analysis.content && analysis.content.spec) || null;
        // Source of truth precedence: 1) explicit spec override from the caller,
        // 2) the compiled spec already stored in project memory (user-approved),
        // 3) a freshly compiled spec derived from the latest analysis.
        let spec = null;
        if (ctx.specOverride && ctx.specOverride._compiled) spec = ctx.specOverride;
        if (!spec) { const mem = memory.byKind(project.id, 'spec'); if (mem && mem.content && mem.content._compiled) spec = mem.content; }
        if (!spec && specRaw && specRaw._compiled) spec = specRaw;
        if (!spec) {
          const a = analysis ? analysis.content : analyzeRequirement(ctx.prompt || project.description || 'A web application');
          const fs2 = a.features || [];
          spec = compileSpec({ name: project.name || a.name, tagline: a.tagline || project.description || '', category: a.category, features: fs2, entityKey: a.entity || null, withSeed: true, light: false });
        }
        memory.forget(project.id, 'spec');
        memory.add(project.id, 'spec', spec);
        result = {
          name: spec.name, category: spec.category_key, tables: spec.tables.length, features: spec.features.length,
          main_table: spec.main, auth: spec.auth,
        };
        break;
      }
      case 'generate': {
        const specEntry = memory.byKind(project.id, 'spec');
        const spec = specEntry ? specEntry.content : compileSpec({ name: project.name, category: 'general', features: ['auth', 'search'] });
        const { files, appDirName } = generateProject({ ...spec, _compiled: true });
        const dir = projectDir(project);
        // preserve user-added files (created via the workspace) across regeneration
        const wanted = new Set(files.map((f) => f.path.replace(/\/$/, '')));
        const userKeep = [];
        if (fs.existsSync(dir)) {
          for (const rel of pfiles.list(project.id)) {
            if (wanted.has(rel)) continue;
            try { const abs = absPath(project, '', rel); if (fs.statSync(abs).isFile()) userKeep.push([rel, fs.readFileSync(abs, 'utf8')]); } catch { /* gone */ }
          }
        }
        const stats = writeProjectTo(dir, files);
        for (const [rel, content] of userKeep) {
          try { fs.mkdirSync(path.dirname(absPath(project, '', rel)), { recursive: true }); fs.writeFileSync(absPath(project, '', rel), content); pfiles.upsert(project.id, rel, content, 'user'); } catch { /* noop */ }
        }
        projects.update(project.id, { path: dir, tech_stack: 'Node.js + vanilla ES modules · file DB/PostgreSQL', root_dir: '' });
        // register files in project_files
        for (const f of files) pfiles.upsert(project.id, f.path, 'generated', f.path.endsWith('/') ? 'dir' : 'file');
        if (stats.written === 0) eventLog(user_id, project.id, '📦', 'Generation: all ' + stats.total + ' files up to date — nothing rewritten (spec unchanged).');
        else eventLog(user_id, project.id, '📦', 'Regenerated: ' + stats.written + ' of ' + stats.total + ' files changed (only differences written' + (userKeep.length ? '; ' + userKeep.length + ' user file(s) preserved' : '') + ').');
        result = { files: stats.total, written: stats.written, unchanged: stats.unchanged, changed_files: stats.changed.slice(0, 12), changed_total: stats.changed.length, preserved_user_files: userKeep.length, dir };
        break;
      }
      case 'install': {
        const dir = projectDir(project);
        const pkgFile = path.join(dir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (Object.keys(deps).length === 0) {
          result = { installed: [], note: 'No external dependencies — the generated runtime is zero-dependency.' };
        } else {
          const rec = await runTool({ tool: 'execute_command', args: { command: 'npm install --no-audit --no-fund 2>&1 | tail -5', timeoutMs: 240000, allowFailure: true }, project });
          result = { installed: Object.keys(deps), exit: rec.output && rec.output.exit_code, tail: rec.output && rec.output.output };
          if (rec.status === 'failed') throw new Error(rec.error);
        }
        break;
      }
      case 'run': {
        await stopProject(project);
        const info = await startProject(project, ROOT_DIR);
        projects.update(project.id, { port: info.port, status: 'running', built_at: Date.now() });
        result = info;
        break;
      }
      case 'test': {
        const res = await runTestSuite(project, ROOT_DIR);
        tasks.setStatus(project.id, task.id, res.ok ? 'completed' : 'failed', { result: JSON.stringify(res) });
        eventLog(user_id, project.id, res.ok ? '🧪' : '🧪', 'Tests: ' + res.passed + ' passed, ' + res.failed + ' failed' + (res.executed ? '' : ' (not executed)'), res.ok ? 'ok' : 'error');
        broadcast(project.id, { type: 'test', result: { passed: res.passed, failed: res.failed, skipped: res.skipped } });
        return;
      }
      case 'fix': {
        const testTask = tasks.all(project.id).filter((t) => t.kind === 'test').slice(-1)[0];
        const runTaskRow = tasks.all(project.id).filter((t) => t.kind === 'run').slice(-1)[0];
        const problems = [];
        if (testTask && testTask.status === 'failed' && testTask.result) {
          try { const r = JSON.parse(testTask.result); for (const f of (r.failures || [])) problems.push({ kind: 'test', ...f }); } catch { /* noop */ }
        }
        if (runTaskRow && runTaskRow.status === 'failed') problems.push({ kind: 'boot', error: runTaskRow.error });
        if (!problems.length) { result = { fixed: 0, note: 'No failures detected — nothing to fix.' }; break; }
        // safe repair: syntax errors → revert the offending file to its last checkpoint
        const fixed = [];
        for (const p of problems) {
          const m = String(p.location || '').match(/(.+?):(\d+)/);
          const file = m ? m[1] : null;
          if (file && p.kind === 'test') {
            // attempt 1: roll back user edit if file was edited after last checkpoint
            const chk = checkpoints.list(project.id)[0];
            const editTime = fileMtime(project, file);
            if (chk && editTime && editTime > chk.created_at) {
              const rec = await runTool({ tool: 'execute_command', args: { command: 'git checkout HEAD -- ' + shellSafe(file) + ' && git reset HEAD -- ' + shellSafe(file), allowFailure: true }, project });
              if (rec.output && rec.output.exit_code === 0) { fixed.push({ file, action: 'reverted to checkpoint (breaking edit removed)', issue: p.name }); continue; }
            }
            fixed.push({ file: file || '?', action: 'automatic fix not safe — see failure details', issue: p.name });
          } else {
            fixed.push({ file: file || '?', action: 'boot-level failure — logs attached; safe retry below', issue: String(p.error || '').slice(0, 200) });
          }
        }
        // safe retry: restart & rerun tests
        if (problems.some((p) => p.kind === 'boot')) {
          try { await stopProject(project); const info = await startProject(project, ROOT_DIR); fixed.push({ action: 'server restarted successfully on port ' + info.port }); } catch (e) { fixed.push({ action: 'restart failed: ' + String(e.message).slice(0, 300) }); }
        }
        result = { fixed, attempts: task.attempt + 1 };
        break;
      }
      case 'security': {
        const scan = await securityScan(project, ROOT_DIR);
        memory.add(project.id, 'note', { kind: 'security_scan', at: new Date().toISOString(), summary: scan.summary, issues: scan.issues.length });
        result = { summary: scan.summary, issues: scan.issues.slice(0, 40) };
        break;
      }
      case 'health': {
        const health = await projectHealth(project, ROOT_DIR);
        projects.update(project.id, { health_score: health.overall });
        memory.add(project.id, 'note', { kind: 'health', at: new Date().toISOString(), overall: health.overall });
        result = { overall: health.overall, categories: health.categories, critical: health.critical.length, high: health.high.length };
        break;
      }
      case 'docs': {
        const made = await buildDocs(project, ROOT_DIR);
        result = made;
        break;
      }
      case 'repo': {
        const rec = await runTool({ tool: 'git_status', project });
        const cid = 'CP-' + Date.now().toString(36);
        try {
          const cp = await checkpoint(project, ROOT_DIR, { id: cid, label: 'Scaffold — ' + project.name, message: 'Initial repository state' });
          checkpoints.create(cid, project.id, { label: 'Scaffold', message: 'Initial checkpoint', agent: 'Deployment Agent', diff_summary: '', git_ref: cp.ref });
          result = { repo: rec.status === 'completed' ? 'initialized' : 'failed', ref: cp.ref };
        } catch (e) {
          result = { repo: 'git unavailable: ' + String(e.message || e).slice(0, 200) };
        }
        break;
      }
      case 'checkpoint': {
        const cid = 'CP-' + Date.now().toString(36);
        const cp = await checkpoint(project, ROOT_DIR, { id: cid, label: 'Build complete — ' + project.name, message: 'Post-pipeline checkpoint' });
        checkpoints.create(cid, project.id, { label: 'Build complete', message: 'Automatic checkpoint after pipeline', agent: 'NOIR Orchestrator', diff_summary: '', git_ref: cp.ref });
        memory.add(project.id, 'note', { kind: 'checkpoint', id: cid, at: new Date().toISOString(), ref: cp.ref });
        result = cp;
        break;
      }
      default: {
        tasks.setStatus(project.id, task.id, 'completed');
        result = { note: 'task complete' };
        return;
      }
    }
    tasks.setStatus(project.id, task.id, 'completed', { result: result ? JSON.stringify(result) : '{}' });
    eventLog(user_id, project.id, '✅', task.agent + ' — ' + task.title + ' complete.', 'ok');
    audit.log({ user_id, project_id: project.id, action: 'task.' + task.kind, agent: task.agent, risk: 'medium', result: 'ok', detail: task.title });
  } catch (e) {
    const attempt = task.attempt + 1;
    tasks.setStatus(project.id, task.id, attempt >= 2 ? 'failed' : 'queued', { error: String(e.message || e).slice(0, 3000), attempt });
    eventLog(user_id, project.id, '❌', task.agent + ' — ' + task.title + ' failed: ' + String(e.message || e).slice(0, 160), 'error');
    audit.log({ user_id, project_id: project.id, action: 'task.' + task.kind, agent: task.agent, risk: 'medium', result: 'failed', detail: task.title + ' — ' + String(e.message || e).slice(0, 300) });
    if (attempt < 2) broadcast(project.id, { type: 'task', task: publicTask(tasks.get(project.id, task.id)) });
  }
}

function fileMtime(project, rel) {
  try { return fs.statSync(absPath(project, '', rel)).mtimeMs; } catch { return null; }
}
function shellSafe(s) { return String(s || '').replace(/[;&|`$>\n]/g, ''); }
export function publicTask(t) {
  if (!t) return null;
  return { id: t.id, title: t.title, description: t.description, agent: t.agent, status: t.status, priority: t.priority, kind: t.kind, error: t.error, attempt: t.attempt, deps: safeJsonArr(t.deps), result: safeJson(t.result), started_at: t.started_at, completed_at: t.completed_at };
}
function safeJson(s) { if (!s) return null; try { return JSON.parse(s); } catch { return String(s).slice(0, 2000); } }
function safeJsonArr(s) { if (!s) return []; try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } }
export function publicAnalysis(a) {
  return {
    name: a.name, tagline: a.tagline, category: a.category, categoryLabel: a.categoryLabel,
    users: a.users, features: a.features, assumptions: a.assumptions || [], questions: a.questions || [],
  };
}

// ---------------- modify / re-run helpers ----------------
export async function rerunStep(project, user_id, step) {
  // cancel outstanding, re-queue tasks belonging to step and everything after it
  const rows = tasks.all(project.id);
  const byKind = {};
  for (const r of rows) byKind[r.kind] = r;
  const order = PIPELINE_STEPS.indexOf(step);
  if (order < 0) return { error: 'unknown step' };
  const targetKinds = PIPELINE_STEPS.slice(order);
  let rerun = false;
  for (const r of rows) {
    if (targetKinds.includes(r.kind)) {
      if (r.kind === step) rerun = true;
      if (rerun) tasks.setStatus(project.id, r.id, 'queued', {});
    }
  }
  projects.update(project.id, { status: 'building' });
  // run remaining loop (queued only)
  const ROOT_DIR = project.root_dir || '';
  runLoop(project, user_id, { specOverride: null, prompt: null }).catch((e) => broadcast(project.id, { type: 'build', status: 'failed', error: e.message }));
  return { reQueued: true };
}

export async function cancelBuild(project, user_id) {
  for (const t of tasks.all(project.id)) {
    if (['queued', 'running'].includes(t.status)) tasks.setStatus(project.id, t.id, 'cancelled', {});
  }
  projects.update(project.id, { status: 'idea' });
  eventLog(user_id, project.id, '⏹️', 'Build cancelled by user.');
  return { cancelled: true };
}
