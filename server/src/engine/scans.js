// scans.js — deterministic quality gates that inspect the real project:
// security scanner, performance analyzer, accessibility & SEO checks, project health.
import fs from 'node:fs';
import path from 'node:path';
import { appDir, listFiles, absPath } from './paths.js';
import { envVars } from '../db.js';
import { sh } from './tools.js';
import { tasks } from '../db.js';

// ---------------- security ----------------
const SECRET_RX = /(sk-(?:live|test|proj)-[A-Za-z0-9_\-]{12,}|ghp_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_\-]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9\-]{10,}|eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,})/g;
const CRED_RX = /(password|passwd|secret|api[_-]?key|token|client[_-]?secret)\s*[:=]\s*["'][^"']{6,}["']/gi;
const DANGEROUS = [
  { rx: /\beval\s*\(/g, severity: 'critical', cat: 'Unsafe APIs', fix: 'Remove eval() — it executes arbitrary strings. Use JSON.parse or safe dispatchers.' },
  { rx: /new\s+Function\s*\(/g, severity: 'critical', cat: 'Unsafe APIs', fix: 'new Function is eval in disguise — restructure the code.' },
  { rx: /child_process/g, severity: 'high', cat: 'Unsafe APIs', fix: 'Generated apps do not need child processes in server code paths handling requests.' },
  { rx: /https?:\/\/[^"' ]+\.(example|test|invalid|localhost)[^"' ]*/g, severity: 'low', cat: 'Placeholders', fix: 'Replace placeholder URLs with real endpoints.' },
  { rx: /allowOrigin|Access-Control-Allow-Origin\s*[:\=]\s*["']\*["']/g, severity: 'medium', cat: 'CORS', fix: 'Wildcard CORS lets any site call the API. Restrict to your app origin.' },
];
const UNSAFE_SQL_RX = /\b(INSERT INTO|UPDATE|DELETE FROM|DROP TABLE|ALTER TABLE)\b[^;]{0,140}["'`]\s*\+/gi;

export async function securityScan(project, rootDir = '') {
  const issues = [];
  const skipNoir = (f) => !f.startsWith('.noir/') && !f.includes('/.noir/');
  const files = listFiles(project, rootDir).filter((f) => skipNoir(f) && !f.startsWith('tests/') && f !== 'db/seed.js');
  for (const f of files) {
    if (!/(\.js|\.mjs|\.css|\.html|\.json)$/.test(f)) continue;
    let content;
    try { content = fs.readFileSync(absPath(project, rootDir, f), 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    const walk = (rx, severity, cat, fix, limit = 8) => {
      let n = 0;
      for (let i = 0; i < lines.length && n < limit; i++) {
        rx.lastIndex = 0;
        if (rx.test(lines[i])) {
          n++;
          issues.push({ severity, category: cat, file: f, line: i + 1, detail: lines[i].trim().slice(0, 160), fix });
        }
      }
    };
    // skip obvious demo/test/hash lines
    const clean = lines.filter((l) => !/demo123|example\.com|placeholder/i.test(l)).join('\n');
    const secs = clean.match(SECRET_RX);
    if (secs) issues.push({ severity: 'critical', category: 'Hardcoded secrets', file: f, line: firstLineOf(lines, secs[0]) || 1, detail: 'Possible live credential found (' + secs[0].slice(0, 8) + '…)', fix: 'Move it to NOIR → Environment; the value is masked there and never enters source control.' });
    walk(CRED_RX, 'high', 'Hardcoded credentials', 'Looks like a credential literal in code. Keep secrets in environment variables only.', 6);
    for (const d of DANGEROUS) walk(d.rx, d.severity, d.cat, d.fix);
    if (/server\.js$/.test(f)) walk(UNSAFE_SQL_RX, 'high', 'Injection risk', 'Concatenating request data into SQL enables injection. Use parameterized queries.', 5);
    if (/\bexec\s*\(\s*[^)]*req|child\.exec/.test(clean)) walk(/\bexec\s*\(/g, 'critical', 'Command injection', 'Never pass request data to exec().', 4);
  }
  // auth endpoints exposure check on server.js
  const serverFile = path.join(appDir(project, rootDir), 'server.js');
  if (fs.existsSync(serverFile)) {
    const srv = fs.readFileSync(serverFile, 'utf8');
    if (!/requireAuth|currentUser/.test(srv)) issues.push({ severity: 'high', category: 'Weak authentication', file: 'server.js', line: 0, detail: 'No auth guard usage detected', fix: 'Sign-in should gate protected endpoints.' });
  }
  // env usage vs configured
  const envRows = envVars.all(project.id);
  const envSet = new Set(envRows.map((e) => e.key));
  const used = new Set();
  for (const f of files) {
    try {
      const c = fs.readFileSync(absPath(project, rootDir, f), 'utf8');
      for (const m of c.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
    } catch { /* noop */ }
  }
  const OPTIONAL_KEYS = ['DATABASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'XAI_API_KEY', 'CUSTOM_AI_API_KEY', 'CUSTOM_AI_BASE', 'NOIR_AI_API_KEY', 'NOIR_AI_BASE', 'NOIR_AI_MODEL', 'STRIPE_SECRET_KEY', 'MAILGUN_API_KEY', 'RESEND_API_KEY', 'VERCEL_TOKEN', 'APPWRITE_ENDPOINT', 'APPWRITE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const INTERNAL_KEYS = ['PORT', 'HOST', 'NODE_ENV', 'NOIR_RUNNER'];
  for (const key of used) {
    if (envSet.has(key) || process.env[key] || INTERNAL_KEYS.includes(key)) continue;
    const optional = OPTIONAL_KEYS.includes(key);
    issues.push({
      severity: optional ? 'low' : 'medium',
      category: optional ? 'Configuration (optional)' : 'Configuration',
      file: 'env', line: 0,
      detail: 'Code reads ' + key + (optional ? ' — the feature degrades with a clear "requires configuration" notice until it is set' : ' but it is not configured'),
      fix: optional ? ('Optional: add ' + key + ' under Environment when you want this capability live.') : ('Add ' + key + ' under Environment (values are masked and never logged).'),
    });
  }
  // dependency audit (only when a lockfile exists)
  const dir = appDir(project, rootDir);
  if (fs.existsSync(path.join(dir, 'package-lock.json')) || fs.existsSync(path.join(dir, 'yarn.lock'))) {
    const r = await sh('npm audit --json 2>/dev/null', { cwd: dir, timeoutMs: 90000 });
    if (r.code === 0) {
      try {
        const j = JSON.parse(r.output);
        const meta = j.metadata && j.metadata.vulnerabilities;
        if (meta && (meta.high || meta.critical)) {
          for (const [name, vuln] of Object.entries(j.vulnerabilities || {})) {
            if (vuln.severity === 'critical' || vuln.severity === 'high') {
              issues.push({ severity: vuln.severity === 'critical' ? 'critical' : 'high', category: 'Dependency vulnerabilities', file: name, line: 0, detail: vuln.isDirect ? 'Direct dependency' : 'Transitive dependency', fix: 'Run npm audit and upgrade to a fixed version.' });
            }
          }
        }
      } catch { /* parse failed — skip */ }
    }
  }
  return { issues, summary: summarize(issues) };
}

function firstLineOf(lines, needle) {
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle.slice(0, 24))) return i + 1;
  return 1;
}
function summarize(issues) {
  const s = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) s[i.severity] = (s[i.severity] || 0) + 1;
  return s;
}

// ---------------- performance ----------------
export async function performanceAnalyzer(project, rootDir = '') {
  const findings = [];
  const dir = appDir(project, rootDir);
  const files = listFiles(project, rootDir);
  const sizes = files.map((f) => {
    try { return { file: f, bytes: fs.statSync(absPath(project, rootDir, f)).size }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.bytes - a.bytes);
  const top = sizes.slice(0, 6);
  for (const t of top) {
    if (t.bytes > 200 * 1024 && /\.(js|css)$/.test(t.file)) findings.push({ severity: 'medium', category: 'Bundle size', file: t.file, detail: (t.bytes / 1024).toFixed(0) + ' KB — largest asset in the app', fix: 'Split the module or lazy-load this asset.' });
  }
  const srcDir = path.join(dir, 'src');
  const srcFiles = (fs.existsSync(srcDir) ? listFiles(project, rootDir).filter((f) => f.startsWith('src/')) : []);
  const totalJs = srcFiles.filter((f) => f.endsWith('.js')).reduce((s, f) => { try { return s + fs.statSync(absPath(project, rootDir, f)).size; } catch { return s; } }, 0);
  findings.push({ severity: totalJs > 300000 ? 'medium' : 'low', category: 'Rendering', file: 'src/*', detail: 'Total first-load JS: ' + (totalJs / 1024).toFixed(0) + ' KB', fix: totalJs > 300000 ? 'Consider code splitting pages into modules loaded on demand.' : 'Within healthy range — no action needed.' });
  // db query patterns (N+1 heuristic on generated server)
  const server = path.join(dir, 'server.js');
  if (fs.existsSync(server)) {
    const c = fs.readFileSync(server, 'utf8');
    const listInsideLoop = (c.match(/for\s*\([^)]*\)[\s\S]{0,200}?DB\.list|\.map\([^)]*=>[\s\S]{0,200}?DB\.list/g) || []).length;
    if (listInsideLoop) findings.push({ severity: 'high', category: 'Database queries', file: 'server.js', detail: listInsideLoop + ' list-query inside iteration (N+1 pattern)', fix: 'Fetch once and join in memory, or batch with a single query.' });
    const hasIndexes = /CREATE INDEX/.test(fs.readFileSync(path.join(dir, 'db', 'schema.sql'), 'utf8'));
    if (!hasIndexes) findings.push({ severity: 'low', category: 'Missing indexes', file: 'db/schema.sql', detail: 'No indexes declared', fix: 'Add indexes on foreign keys and search columns once row counts grow.' });
  }
  return { findings, score: perfScore(findings) };
}
function perfScore(f) { const w = { critical: 22, high: 12, medium: 5, low: 1 }; let s = 100; for (const x of f) s -= w[x.severity] || 2; return Math.max(30, s); }

// ---------------- accessibility ----------------
export function a11yScan(project, rootDir = '') {
  const issues = [];
  const htmlFiles = listFiles(project, rootDir).filter((f) => f.endsWith('.html'));
  const files = listFiles(project, rootDir).filter((f) => /\.(js|mjs)$/.test(f) && !f.includes('tests/'));
  const domFiles = [...htmlFiles, ...files];
  let imgs = 0, buttons = 0, inputs = 0, labelled = 0, altTotal = 0;
  for (const f of domFiles) {
    let c;
    try { c = fs.readFileSync(absPath(project, rootDir, f), 'utf8'); } catch { continue; }
    const lines = c.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/<img\b/.test(l)) {
        imgs++;
        if (!/\balt\s*=/.test(l)) issues.push({ severity: 'high', category: 'Alt text', file: f, line: i + 1, detail: 'Image without alt attribute', fix: 'Add descriptive alt text or alt="" for decorative images.' });
        else altTotal++;
      }
      if (/<button\b/.test(l) && !/>\s*[^<>\s]/.test(l) && !/\b(aria-label|title)\s*=/.test(l)) {
        buttons++;
        issues.push({ severity: 'medium', category: 'Button names', file: f, line: i + 1, detail: 'Button with no visible text / aria-label', fix: 'Give the button an accessible name (text, aria-label or title).' });
      }
      if (/<input\b|<select\b|<textarea\b/.test(l)) {
        inputs++;
        const name = l.match(/\bname\s*=\s*["']([^"']+)/);
        if (/\b(aria-label|aria-labelledby)\s*=/.test(l) || (name && /\bplaceholder\s*=/.test(l))) labelled++;
      }
    }
  }
  const langOk = htmlFiles.some((f) => { const c = fs.readFileSync(absPath(project, rootDir, f), 'utf8'); return /<html[^>]*\blang\s*=/.test(c); });
  if (!langOk && htmlFiles.length) issues.push({ severity: 'medium', category: 'Language', file: 'index.html', line: 1, detail: '<html> has no lang attribute', fix: 'Set lang="en" (or the app language) so screen readers pronounce correctly.' });
  if (inputs && inputs !== labelled && inputs - labelled > 0) issues.push({ severity: 'low', category: 'Forms', file: 'src/*', line: 0, detail: inputs - labelled + ' form control(s) rely on placeholder alone for identification', fix: 'Add explicit <label> elements for each control.' });
  return {
    issues,
    metrics: { images_total: imgs, images_with_alt: altTotal, inputs, labelled, focus_traps: 0, contrast_issues: 'not automatically measurable' },
    score: Math.max(40, 100 - issues.reduce((s, i) => s + (i.severity === 'high' ? 10 : 4), 0)),
  };
}

// ---------------- SEO ----------------
export function seoScan(project, rootDir = '') {
  const issues = [];
  const dir = appDir(project, rootDir);
  const indexFile = path.join(dir, 'src', 'index.html');
  let c = '';
  try { c = fs.readFileSync(indexFile, 'utf8'); } catch { return { issues: [{ severity: 'high', category: 'Structure', file: 'src/index.html', line: 0, detail: 'index.html not found', fix: 'Generate the project first.' }], score: 0 }; }
  const checks = [
    [/<title>[^<]{3,}/, 'Page title', 'low', 'index.html', 'Add a descriptive <title>.'],
    [/<meta\s+name="description"/, 'Meta description', 'low', 'index.html', 'Add a meta description (~150 chars).'],
    [/<meta\s+property="og:/, 'Open Graph tags', 'medium', 'index.html', 'Add og:title / og:description / og:type so shares render rich cards.'],
    [/rel="canonical"/, 'Canonical URL', 'low', 'index.html', 'Add a canonical link to avoid duplicate-content signals.'],
    [/<h1\b/, 'Heading hierarchy', 'low', 'index.html', 'Every page should expose exactly one <h1>.'],
    [/<meta\s+name="viewport"/, 'Viewport', 'high', 'index.html', 'Add the responsive viewport meta.'],
  ];
  for (const [rx, label, sev, file, hint] of checks) {
    if (!rx.test(c)) issues.push({ severity: sev, category: label, file, line: 0, detail: 'Missing: ' + label, fix: hint });
  }
  const h1s = (c.match(/<h1\b/g) || []).length;
  if (h1s > 1) issues.push({ severity: 'medium', category: 'Heading hierarchy', file: 'src/index.html', line: 0, detail: h1s + ' <h1> tags', fix: 'Keep one <h1> per page.' });
  const missing = [];
  if (!fs.existsSync(path.join(dir, 'public', 'robots.txt'))) missing.push('public/robots.txt');
  if (!fs.existsSync(path.join(dir, 'public', 'sitemap.xml'))) missing.push('public/sitemap.xml');
  for (const f of missing) issues.push({ severity: 'medium', category: 'Crawlability', file: f, line: 0, detail: 'Missing ' + f, fix: 'Add robots.txt with allow rules and a sitemap.xml listing public routes.' });
  return { issues, score: Math.max(30, 100 - issues.reduce((s, i) => s + (i.severity === 'high' ? 14 : i.severity === 'medium' ? 6 : 2), 0)) };
}

// ---------------- project health ----------------
export async function projectHealth(project, rootDir = '') {
  const [sec, perf, a11y, seo] = await Promise.all([securityScan(project, rootDir), performanceAnalyzer(project, rootDir), Promise.resolve(a11yScan(project, rootDir)), Promise.resolve(seoScan(project, rootDir))]);
  const testTasks = tasks.all(project.id).filter((t) => t.kind === 'test').slice(-3);
  const lastTest = testTasks.reverse().find((t) => t.status === 'completed' || t.status === 'failed');
  let testScore = null;
  if (lastTest && lastTest.result) {
    try {
      const r = JSON.parse(lastTest.result);
      testScore = r.executed ? Math.round((r.passed / Math.max(1, r.passed + r.failed)) * 100) : null;
    } catch { /* noop */ }
  }
  const proj = project.health_score;
  const sev = (arr, sevKey) => arr.filter((i) => i.severity === sevKey);
  const sevScore = (issues) => Math.max(20, 100 - (sev(issues, 'critical').length * 30 + sev(issues, 'high').length * 10 + sev(issues, 'medium').length * 4 + sev(issues, 'low').length));
  const security = sevScore(sec.issues);
  const categories = {
    Security: { score: security, issues: sec.issues.length, note: 'Static scan of source + env usage' },
    Performance: { score: perf.score, issues: perf.findings.length, note: 'Bundle sizes + query patterns' },
    Accessibility: { score: a11y.score, issues: a11y.issues.length, note: 'DOM audit of images/forms/labels' },
    SEO: { score: seo.score, issues: seo.issues.length, note: 'Metadata + crawlability' },
    Testing: { score: testScore === null ? 0 : testScore, issues: testScore === null ? 1 : 0, note: testScore === null ? 'No executed test suite yet' : 'Last executed suite' },
    'Runtime & Deployment': { score: proj || (project.status === 'live' || project.status === 'running' ? 90 : 40), issues: 0, note: project.status },
  };
  const total = Math.round(Object.values(categories).reduce((s, c) => s + c.score, 0) / Object.keys(categories).length);
  return {
    overall: total,
    generated_at: new Date().toISOString(),
    categories,
    critical: [...sev(sec.issues, 'critical')].slice(0, 10),
    high: [...sev(sec.issues, 'high'), ...sev(perf.findings, 'high')].slice(0, 12),
    medium: [...sev(sec.issues, 'medium'), ...sev(perf.findings, 'medium'), ...a11y.issues.filter((i) => i.severity !== 'high')].slice(0, 15),
    suggestions: [...sev(sec.issues, 'low'), ...sev(perf.findings, 'low'), ...seo.issues].slice(0, 15).map((i) => ({ file: i.file, detail: i.detail, fix: i.fix })),
    raw: { security: sec, performance: perf, a11y, seo, lastTest },
  };
}
