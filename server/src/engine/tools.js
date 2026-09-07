// tools.js — the real tool registry the agents operate with.
// Every execution records: tool, args, status, output, error, duration, timestamp.
// Nothing here pretends to do work — each tool performs its operation for real.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { absPath, appDir, listFiles } from './paths.js';

export const TOOL_DEFS = [
  { name: 'read_file', risk: 'low', args: 'rel_path', desc: 'Read a file from the project' },
  { name: 'create_file', risk: 'medium', args: 'rel_path, content', desc: 'Create a new file' },
  { name: 'update_file', risk: 'medium', args: 'rel_path, content', desc: 'Overwrite an existing file' },
  { name: 'delete_file', risk: 'high', args: 'rel_path', desc: 'Delete a file' },
  { name: 'rename_file', risk: 'medium', args: 'from, to', desc: 'Rename/move a file' },
  { name: 'search_files', risk: 'low', args: 'pattern', desc: 'List files whose name matches' },
  { name: 'search_code', risk: 'low', args: 'needle', desc: 'Grep the project for a string' },
  { name: 'create_directory', risk: 'medium', args: 'rel_path', desc: 'Create a folder' },
  { name: 'execute_command', risk: 'high', args: 'command', desc: 'Run a shell command inside the project (sandboxed)' },
  { name: 'install_package', risk: 'medium', args: 'package', desc: 'npm install a package into the project' },
  { name: 'run_project', risk: 'high', args: '—', desc: 'Start the project server (managed runner)' },
  { name: 'stop_project', risk: 'medium', args: '—', desc: 'Stop the project server' },
  { name: 'restart_project', risk: 'high', args: '—', desc: 'Restart the project server' },
  { name: 'inspect_logs', risk: 'low', args: 'tail_lines', desc: 'Tail the project runtime log' },
  { name: 'run_tests', risk: 'medium', args: '—', desc: 'Execute the project test suite' },
  { name: 'create_database', risk: 'medium', args: 'table?', desc: 'Provision the project database backend' },
  { name: 'inspect_database', risk: 'low', args: 'table', desc: 'Inspect rows/tables of the live database' },
  { name: 'execute_database_migration', risk: 'high', args: 'sql', desc: 'Run a SQL migration against the database' },
  { name: 'generate_preview', risk: 'medium', args: '—', desc: 'Refresh the live preview (rebuild if needed)' },
  { name: 'git_status', risk: 'low', args: '—', desc: 'git status of the project' },
  { name: 'git_diff', risk: 'low', args: 'path', desc: 'Uncommitted diff' },
  { name: 'git_commit', risk: 'high', args: 'message', desc: 'Create a checkpoint commit' },
  { name: 'git_branch', risk: 'medium', args: 'name?', desc: 'Show/create branch' },
  { name: 'git_log', risk: 'low', args: 'n', desc: 'Commit history' },
  { name: 'git_push', risk: 'high', args: 'remote', desc: 'Push to remote (requires GitHub integration)' },
  { name: 'deploy', risk: 'high', args: 'target', desc: 'Run the deployment pipeline (requires provider)' },
  { name: 'rollback', risk: 'high', args: 'ref', desc: 'Restore project to a checkpoint' },
];

export function toolDefs() { return TOOL_DEFS; }

function sh(cmd, { cwd, timeoutMs = 60000, env = {} } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let errOut = '';
    let timedOut = false;
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, ...env } });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; if (out.length > 300000) { out = out.slice(-300000); } });
    child.stderr.on('data', (d) => { errOut += d; if (errOut.length > 100000) errOut = errOut.slice(-100000); });
    child.on('close', (code, sig) => {
      clearTimeout(timer);
      resolve({ code: code ?? (sig ? -1 : null), output: out, error: errOut, timedOut });
    });
  });
}

const runTool = async ({ tool, args = {}, project, rootDir = '' }) => {
  const start = Date.now();
  const rec = { tool, args: sanitizeArgs(args), status: 'running', durationMs: 0, timestamp: new Date().toISOString() };
  const dir = appDir(project, rootDir);
  try {
    const rel = args.rel_path || args.path || args.from || null;
    const target = rel ? absPath(project, rootDir, rel) : null;
    switch (tool) {
      case 'read_file': {
        if (!fs.existsSync(target)) throw new Error('File not found: ' + rel);
        const content = fs.readFileSync(target, 'utf8');
        rec.output = { rel_path: rel, size: content.length, content };
        break;
      }
      case 'create_file':
      case 'update_file': {
        if (tool === 'create_file' && fs.existsSync(target)) throw new Error('Already exists: ' + rel);
        if (tool === 'update_file' && !fs.existsSync(target)) throw new Error('Not found: ' + rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, String(args.content ?? ''));
        rec.output = { rel_path: rel, bytes: String(args.content ?? '').length };
        break;
      }
      case 'delete_file': {
        if (!fs.existsSync(target)) throw new Error('Not found: ' + rel);
        fs.rmSync(target, { force: true });
        rec.output = { deleted: rel };
        break;
      }
      case 'rename_file': {
        const to = absPath(project, rootDir, args.to);
        if (!fs.existsSync(target)) throw new Error('Not found: ' + rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(target, to);
        rec.output = { from: rel, to: args.to };
        break;
      }
      case 'search_files': {
        const needle = String(args.pattern || '');
        const files = listFiles(project, rootDir).filter((f) => !needle || f.includes(needle));
        rec.output = { files };
        break;
      }
      case 'search_code': {
        const needle = String(args.needle || '');
        const hits = [];
        for (const f of listFiles(project, rootDir)) {
          try {
            const content = fs.readFileSync(absPath(project, rootDir, f), 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(needle)) { hits.push({ file: f, line: i + 1, snippet: lines[i].trim().slice(0, 160) }); if (hits.length > 500) break; }
            }
          } catch { /* skip */ }
          if (hits.length > 500) break;
        }
        rec.output = { needle, hits };
        break;
      }
      case 'create_directory': {
        fs.mkdirSync(target, { recursive: true });
        rec.output = { created: rel };
        break;
      }
      case 'execute_command': {
        const r = await sh(String(args.command || ''), { cwd: dir, timeoutMs: args.timeoutMs || 60000, env: args.env || {} });
        rec.output = { exit_code: r.code, output: r.output.slice(-120000), stderr: r.error.slice(-40000), timed_out: r.timedOut };
        if (r.timedOut || (r.code !== 0 && !args.allowFailure)) rec.error = 'Command failed (exit ' + r.code + ')' + (r.timedOut ? ' — timed out' : '');
        break;
      }
      case 'install_package': {
        const names = Array.isArray(args.package) ? args.package : [args.package].filter(Boolean);
        if (!names.length) throw new Error('No package specified');
        const r = await sh('npm install --no-audit --no-fund ' + names.map((n) => String(n).replace(/[;&|`]/g, '')).join(' '), { cwd: dir, timeoutMs: 240000 });
        rec.output = { exit_code: r.code, tail: r.output.slice(-3000) + r.error.slice(-3000) };
        if (r.code !== 0) rec.error = 'npm install failed';
        break;
      }
      case 'run_project':
      case 'restart_project':
      case 'stop_project':
      case 'generate_preview': {
        const { startProject, stopProject } = await import('./runner.js');
        if (tool === 'stop_project') { await stopProject(project); rec.output = { stopped: true }; break; }
        if (tool === 'run_project' || tool === 'restart_project') {
          if (tool === 'restart_project') await stopProject(project);
          const info = await startProject(project, rootDir);
          rec.output = info;
          break;
        }
        const { runnerStatus } = await import('./runner.js');
        rec.output = { preview: 'refreshed', status: runnerStatus(project.id) || null };
        break;
      }
      case 'inspect_logs': {
        const { readLogs } = await import('./runner.js');
        const tail = await readLogs(project, Number(args.tail_lines || 200));
        rec.output = { tail };
        break;
      }
      case 'run_tests': {
        const { runTestSuite } = await import('./tests.js');
        const res = await runTestSuite(project, rootDir);
        rec.output = res;
        if (!res.ok) rec.error = res.failures?.length + ' test(s) failed';
        break;
      }
      case 'create_database': {
        const { createDatabase } = await import('./dbops.js');
        rec.output = await createDatabase(project, rootDir, args);
        break;
      }
      case 'inspect_database': {
        const { inspectDatabase } = await import('./dbops.js');
        rec.output = await inspectDatabase(project, rootDir, args.table);
        if (rec.output.error) rec.error = rec.output.error;
        break;
      }
      case 'execute_database_migration': {
        const { runMigration } = await import('./dbops.js');
        rec.output = await runMigration(project, rootDir, args.sql);
        if (rec.output.error) rec.error = rec.output.error;
        break;
      }
      case 'git_status':
      case 'git_diff':
      case 'git_commit':
      case 'git_branch':
      case 'git_log':
      case 'git_push': {
        const { gitExec } = await import('./gitutil.js');
        const mapped = { git_status: 'status', git_diff: 'diff', git_commit: 'commit', git_branch: 'branch', git_log: 'log', git_push: 'push' };
        const res = await gitExec(project, rootDir, mapped[tool], args);
        rec.output = res.output;
        if (!res.ok) rec.error = res.output.error || 'git ' + mapped[tool] + ' failed';
        break;
      }
      case 'deploy': {
        const { deployProject } = await import('./deploy.js');
        rec.output = await deployProject(project, args.target || 'local', args);
        if (rec.output.state === 'failed') rec.error = rec.output.error || 'Deployment failed';
        break;
      }
      case 'rollback': {
        const { rollbackProject } = await import('./gitutil.js');
        rec.output = await rollbackProject(project, rootDir, args.ref);
        if (rec.output.error) rec.error = rec.output.error;
        break;
      }
      default:
        throw new Error('Unknown tool: ' + tool);
    }
    rec.status = 'completed';
  } catch (e) {
    rec.status = 'failed';
    rec.error = String(e.message || e);
  }
  rec.durationMs = Date.now() - start;
  return rec;
};

function sanitizeArgs(args) {
  const out = { ...(args || {}) };
  for (const k of ['content']) if (out[k] !== undefined) out[k] = out[k] ? '<' + String(out[k]).length + ' chars>' : '';
  for (const k of Object.keys(out)) if (String(out[k]).length > 240) out[k] = '<truncated>';
  return out;
}

export { runTool, sh };
