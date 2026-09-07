// patch.js — deterministic code-level patch planning for natural-language requests.
// The engine never fabricates edits: it only proposes replacements whose "old" text
// exists verbatim in the project's real files, shows actual diffs, and applies them
// only after explicit approval. Retry-safe and stale-checked.
import fs from 'node:fs';
import path from 'node:path';
import { appDir, listFiles, absPath } from './paths.js';

// Minimal line diff (LCS) → readable -/+ hunk view for previews.
export function lineDiff(oldText, newText) {
  const a = String(oldText || '').split('\n');
  const b = String(newText || '').split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0, ctx = 0, hunkLines = 0;
  const flush = () => { if (hunkLines > 80) out.push('… (diff truncated)'); };
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(' ' + a[i]); i++; j++; ctx++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('-' + a[i]); i++; ctx = 0; hunkLines++; }
    else { out.push('+' + b[j]); j++; ctx = 0; hunkLines++; }
    if (ctx > 4) { flush(); ctx = 0; }
  }
  while (i < n) { out.push('-' + a[i++]); hunkLines++; }
  while (j < m) { out.push('+' + b[j++]); hunkLines++; }
  flush();
  return out;
}

function occurrencesOf(content, needle) {
  const lines = String(content).split('\n');
  const hits = [];
  let current = '';
  for (let ln = 0; ln < lines.length; ln++) {
    current = current ? current + '\n' + lines[ln] : lines[ln];
    const pos = current.indexOf(needle);
    if (pos >= 0 && pos <= lines[ln].length) hits.push(ln + 1); // first line containing the match start
    current = '';
    // simple approach: search per-line for multi-line needles conservatively
  }
  if (needle.includes('\n')) {
    // multi-line: scan window of joined lines
    const joined = lines.map((l, idx) => ({ idx: idx + 1, l })).reduce((acc, x) => acc + x.l + '\n', '');
    const flat = lines.join('\n');
    let from = 0;
    let k = 0;
    while ((from = flat.indexOf(needle, from)) >= 0 && k < 20) {
      const lineNo = flat.slice(0, from).split('\n').length;
      hits.push(lineNo);
      from += needle.length;
      k++;
    }
    void joined;
  } else {
    let from = 0; let k = 0;
    const flat = lines.join('\n');
    while ((from = flat.indexOf(needle, from)) >= 0 && k < 30) {
      const lineNo = flat.slice(0, from).split('\n').length;
      hits.push(lineNo);
      from += needle.length;
      k++;
    }
  }
  return [...new Set(hits)].slice(0, 3);
}

const IGNORE = (rel) => /^(\.git|\.noir\/|data\/|docs\/)/.test(rel) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|sqlite)$/i.test(rel);

/** Extract deterministic old→new replacement pairs from a natural-language request. */
export function extractPairs(prompt) {
  const p = String(prompt || '');
  const pairs = [];
  // 1) explicit quoted:  "old text" -> "new text"  (arrows/“to”/“with”)
  const qRe = /["“”']([^"“”']{2,200})["“”']\s*(?:->|→|=>|to|into|with|by)\s*["“”']([^"“”']{2,200})["“”']/gi;
  let m;
  while ((m = qRe.exec(p)) && pairs.length < 3) {
    const oldS = m[1].trim(), newS = m[2].trim();
    if (oldS && newS && oldS !== newS) pairs.push({ old: oldS, new: newS, quoted: true });
  }
  // 2) unquoted phrase rename: "rename <A> to <B>" / "change <A> to <B>" (A single- or multi-word literal that exists in files)
  const re2 = /\b(?:rename|change|replace|set|update)\s+(?:the\s+)?([a-z0-9][\w .\-':/]{2,80}?)\s+(?:to|into|with)\s+([\w .\-':/&]{2,80})/gi;
  while ((m = re2.exec(p)) && pairs.length < 6) {
    const oldS = m[1].trim(), newS = m[2].trim();
    if (oldS && newS && oldS !== newS && !/^(to|into|with|the|a|an)$/i.test(oldS)) pairs.push({ old: oldS, new: newS, quoted: false });
  }
  // dedupe by old text
  const seen = new Set();
  return pairs.filter((x) => { if (seen.has(x.old.toLowerCase())) return false; seen.add(x.old.toLowerCase()); return true; });
}

/**
 * Plan replacements across the project. Returns candidates (real matches only) with
 * per-file diff previews. Throws when nothing is found.
 */
export function planReplacements(project, rootDir, pairs) {
  const dir = appDir(project, rootDir);
  const results = [];
  for (const pair of pairs) {
    const perFile = [];
    const files = listFiles(project, rootDir).filter((f) => !IGNORE(f));
    for (const rel of files) {
      const abs = absPath(project, rootDir, rel);
      let content = null;
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      if (!content.includes(pair.old)) continue;
      const lines = content.split('\n');
      const occurrences = occurrencesOf(content, pair.old).map((ln) => ({ line: ln, preview: lines[ln - 1] ? lines[ln - 1].trim().slice(0, 160) : '' }));
      const newContent = content.split(pair.old).join(pair.new);
      perFile.push({
        file: rel,
        occurrences,
        old: pair.old, next: pair.new,
        diff: lineDiff(content, newContent).slice(0, 90),
        lines_changed: Math.abs(lines.length - newContent.split('\n').length) || 1,
      });
    }
    results.push({ old: pair.old, next: pair.new, quoted: !!pair.quoted, files: perFile });
  }
  const found = results.filter((r) => r.files.length);
  if (!found.length) {
    const wanted = pairs.map((x) => x.old).slice(0, 3);
    throw new Error('No file in the project contains ' + wanted.map((w) => JSON.stringify(w)).join(' or ') + ' — nothing to change. (Patch tool only edits text that exists verbatim.)');
  }
  return found;
}

/** Apply an approved plan (all replacements, all files). Returns what changed. */
export function applyPlan(project, rootDir, plan, { writeFile }) {
  const dir = appDir(project, rootDir);
  const applied = [];
  for (const entry of plan) {
    const replacement = entry.next === undefined ? entry.new : entry.next; // accept {old,next} and {old,new}
    if (typeof replacement !== 'string' || replacement === '') throw Object.assign(new Error('Patch plan is missing replacement text.'), { code: 'APPLY_FAILED' });
    for (const f of entry.files) {
      const abs = absPath(project, rootDir, f.file);
      const content = fs.readFileSync(abs, 'utf8');
      if (!content.includes(entry.old)) {
        const err = new Error('Stale plan: ' + JSON.stringify(entry.old.slice(0, 40)) + ' is no longer present in ' + f.file + ' — re-preview before applying.');
        err.code = 'STALE';
        throw err;
      }
      const next = content.split(entry.old).join(replacement);
      writeFile(f.file, next);
      applied.push({ file: f.file, changes: content.length !== next.length ? (next.split('\n').length - content.split('\n').length) : 0 });
    }
  }
  return applied;
}
