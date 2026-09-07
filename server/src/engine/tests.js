// tests.js — executes the project's test suite for real (node --test) and parses TAP.
import fs from 'node:fs';
import path from 'node:path';
import { sh } from './tools.js';
import { appDir } from './paths.js';

export async function runTestSuite(project, rootDir = '') {
  const dir = appDir(project, rootDir);
  const testsDir = path.join(dir, 'tests');
  if (!fs.existsSync(testsDir)) {
    return { ok: false, executed: false, reason: 'No tests/ directory exists in this project.', passed: 0, failed: 0, skipped: 0, failures: [] };
  }
  const r = await sh('node --test tests/', { cwd: dir, timeoutMs: 180000 });
  const parsed = parseTap(r.output);
  const failures = [];
  if (parsed.failures) {
    for (const f of parsed.failures) {
      failures.push({
        name: f.name,
        location: f.location,
        error: f.error ? f.error.split('\n').slice(0, 18).join('\n') : null,
      });
    }
  }
  const res = {
    executed: true,
    ok: r.code === 0 && parsed.failed === 0,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    durationMs: parsed.durationMs,
    failures,
    rawTail: (r.output + r.error).slice(-6000),
    exitCode: r.code,
    timedOut: r.timedOut,
  };
  return res;
}

export function parseTap(output) {
  const res = { passed: 0, failed: 0, skipped: 0, durationMs: 0, failures: [] };
  const lines = String(output).split('\n');
  // '# tests 7 / # pass 5 / # fail 2' summary; failures as 'not ok N - name' blocks
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const mSum = line.match(/^# (tests|pass|fail|skipped|cancelled|todo)\s+(\d+)/);
    if (mSum) {
      const key = { tests: 'tests', pass: 'passed', fail: 'failed', skipped: 'skipped' }[mSum[1]];
      if (key && mSum[1] !== 'tests') res[key] = Number(mSum[2]);
      else if (key === 'tests') res.total = Number(mSum[2]);
      i++; continue;
    }
    const mDur = line.match(/^# duration_ms\s+([\d.]+)/);
    if (mDur) { res.durationMs = Number(mDur[1]); i++; continue; }
    const mNot = line.match(/^not ok \d+ - (.+)/);
    if (mNot) {
      const fail = { name: mNot[1].trim(), location: null, error: null };
      let j = i + 1;
      while (j < lines.length && !/^(ok|not ok|# )/.test(lines[j])) {
        const loc = lines[j].match(/location:\s*'(.+?)'/);
        if (loc) fail.location = loc[1];
        if (lines[j].includes("error: |-")) {
          const errLines = [];
          let k = j + 1;
          while (k < lines.length && lines[k] && !lines[k].trim().startsWith('  ...') && !/^(ok|not ok)/.test(lines[k]) && lines[k].startsWith('    ')) { errLines.push(lines[k].slice(4)); k++; }
          fail.error = errLines.join('\n').slice(0, 4000);
          j = k; continue;
        }
        j++;
      }
      res.failures.push(fail);
      i = j; continue;
    }
    i++;
  }
  return res;
}
