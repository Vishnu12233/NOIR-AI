import React, { useEffect, useState } from 'react';
import { Link, useAuth, useToast } from '../lib/ui.jsx';
import { api } from '../lib/api.js';
import { ArrowRight, ArrowUpRight, Menu, X, Check } from 'lucide-react';
import { Templates } from './App.jsx';

const EX = [
  { t: 'A CRM for a team of 5 — leads, pipeline board and email notes', kind: 'CRM' },
  { t: 'SaaS with Stripe billing, teams and an admin dashboard', kind: 'SaaS' },
  { t: 'Marketplace app where freelancers list services and get hired', kind: 'Marketplace' },
  { t: 'Health tracker with charts and daily habit streaks', kind: 'Productivity' },
];
const FEATURES = [
  ['📝', 'Describe an idea', 'Type a sentence about the app you want. NOIR distills real requirements, not keyword guesses.'],
  ['🗺️', 'It plans the build', 'A planner agent turns the spec into an ordered task graph — schema, API, pages, tests, docs.'],
  ['🤖', 'A team builds it', 'Frontend, backend, database, testing, security agents work the task list with a shared workspace.'],
  ['▶️', 'Run, test, preview', 'The app boots in an isolated sandbox with a live preview; tests are executed, not simulated.'],
  ['🔍', 'Scan & improve', 'Security, performance, accessibility, SEO and health scores — with fixes you can apply.'],
  ['🚀', 'Ship & keep improving', 'Connect GitHub, pre-flight deploy checks, then keep asking NOIR to change the app.'],
];
const TEMPLATE_BLURBS = [
  'SaaS', 'AI app', 'Dashboard', 'E-commerce', 'CRM', 'ERP', 'Finance', 'Healthcare', 'Education', 'Marketplace', 'Social', 'Dev tools', 'Blog', 'Portfolio', 'Landing',
];

export function Landing() {
  const { user } = useAuth();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [menu, setMenu] = useState(false);
  const [fq, setFq] = useState(-1);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api('/health').then((h) => setStats({ health: h, projects: 0 })).catch(() => { });
  }, []);
  const go = (text) => {
    if (!text.trim()) return toast('Tell NOIR what to build first', 'error');
    window.location.hash = '#/create?prompt=' + encodeURIComponent(text);
  };
  return (
    <div>
      {/* nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(10px)', background: 'color-mix(in srgb, var(--bg) 82%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div className="row-between" style={{ maxWidth: 1160, margin: '0 auto', padding: '0 22px', height: 58 }}>
          <Link to="/" className="brand" style={{ padding: 0 }}>
            <span className="brand-mark">N</span>
            <span><span className="brand-name">NOIR</span><br /><span className="brand-tag" style={{ fontSize: 8 }}>Think · Build · Ship · Improve</span></span>
          </Link>
          <div className="row" style={{ gap: 4 }}>
            <Link to="/app/projects" className="btn ghost sm" style={{ display: 'none' }}>Projects</Link>
            {user ? (
              <div className="row" style={{ gap: 8 }}>
                <Link to="/app" className="btn ghost sm"><ArrowRight size={13} /> Open workspace</Link>
                <Link to="/create" className="btn primary sm"><span className="status-dot ok" /> Start Building</Link>
              </div>
            ) : (
              <div className="row" style={{ gap: 8 }}>
                <Link to="/login" className="btn ghost sm">Sign in</Link>
                <Link to="/create" className="btn primary sm">Start Building</Link>
                <button className="icon-btn" style={{ display: 'none' }} onClick={() => setMenu((v) => !v)}>{menu ? <X size={17} /> : <Menu size={17} />}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* hero */}
      <section className="landing-hero hero-grad" style={{ paddingTop: 110 }}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="chip" style={{ color: 'var(--gold)', borderColor: 'color-mix(in srgb, var(--gold) 30%, var(--line))', padding: '5px 12px' }}>
            <span className="status-dot ok" /> NOIR v1 — your AI software engineering team
          </span>
        </div>
        <h1 className="landing-title">Ideas in. <span className="thin">Working</span><br />software out.</h1>
        <p className="landing-sub">
          Describe what you want to build. NOIR — an AI engineering team, not a chatbot — analyzes the idea, plans the architecture, generates the application, runs it, tests it, scans it, and hands you a live preview you can keep improving.
        </p>
        <div className="prompt-box">
          <div className="row" style={{ padding: 4 }}>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Try: “A CRM for a small team — leads, pipeline board, notes…”"
              onKeyDown={(e) => e.key === 'Enter' && go(prompt)}
            />
            <button className="btn gold" style={{ borderRadius: 10, padding: '11px 18px' }} onClick={() => go(prompt)}>Start Building <ArrowRight size={15} /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 8px 10px' }}>
            {EX.map((x) => (
              <button key={x.t} className="chip cursor-pointer" style={{ background: 'transparent', cursor: 'pointer' }} onClick={() => { setPrompt(x.t); go(x.t); }}>
                <span className="badge gold" style={{ padding: '0 6px', fontSize: 10 }}>{x.kind}</span> {x.t.length > 52 ? x.t.slice(0, 52) + '…' : x.t}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 20, gap: 10 }}>
          <button className="btn ghost" onClick={() => go('')}>Explore templates</button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 26, marginTop: 44, color: 'var(--muted)', fontSize: 12.5 }}>
          <span>✓ Real generated code</span><span>✓ Real tests & results</span><span>✓ Sandboxed runtime</span><span>✓ Your own data — your own infra</span>
        </div>
      </section>

      {/* pipeline strip */}
      <section style={{ borderBlock: '1px solid var(--line)', background: 'var(--bg-2)', padding: '26px 0' }}>
        <div className="row" style={{ maxWidth: 1000, margin: '0 auto', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, padding: '0 22px' }}>
          {[['💡', 'Idea'], ['🧩', 'Analysis'], ['🗺️', 'Plan'], ['🏗️', 'Build'], ['▶️', 'Run'], ['🧪', 'Test'], ['🩺', 'Scan'], ['👀', 'Preview'], ['🚀', 'Deploy'], ['♻️', 'Improve']].map(([ic, t], i) => (
            <div key={t} className="row" style={{ gap: 7, flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, minWidth: 70 }}>
              <span style={{ fontSize: 20 }}>{ic}</span>
              <span style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--muted)', letterSpacing: '.03em' }}>{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="landing-section">
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <span className="kicker">The workflow</span>
          <h2 style={{ fontSize: 30 }}>From a sentence to shipped software</h2>
          <p className="muted" style={{ maxWidth: 520, margin: '12px auto 0' }}>Every step below runs for real. When NOIR says tests passed, tests passed. When it says the app is live, it is live — in an isolated sandbox, on your infrastructure when you're ready.</p>
        </div>
        <div className="grid cols-3">
          {FEATURES.map(([ic, t, d]) => (
            <div key={t} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{ic}</div>
              <b style={{ fontSize: 14.5 }}>{t}</b>
              <p className="muted small" style={{ marginTop: 6, lineHeight: 1.6 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* honest demo strip */}
      <section className="landing-section" style={{ paddingTop: 20 }}>
        <div className="grid cols-2" style={{ gap: 18 }}>
          <div className="card" style={{ padding: 24, border: '1px solid color-mix(in srgb, var(--gold) 30%, var(--line))', background: 'color-mix(in srgb, var(--gold) 5%, var(--panel))' }}>
            <h3 style={{ fontSize: 18 }}>Watch a project appear</h3>
            <p className="muted small" style={{ marginTop: 8 }}>Sign in and NOIR will analyze a description into a specification, plan tasks, and build the app in front of you — file tree, tasks, terminal, tests and preview updating live. Try the guided flow with the demo account.</p>
            <div className="row" style={{ marginTop: 12 }}>
              {user ? <Link className="btn primary sm" to="/app">Open workspace</Link> : <Link className="btn primary sm" to="/signup">Start now</Link>}
              <Link to="/signup" className="btn ghost sm">Create account</Link>
            </div>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18 }}>One workspace, real results</h3>
            <p className="muted small" style={{ marginTop: 8 }}>Project health score, security scanner, performance and accessibility reports, generated docs, git checkpoints, GitHub push, deployment pre-flights — each backed by actual measurement of the code NOIR generated for you.</p>
            <div className="row" style={{ marginTop: 14, flexWrap: 'wrap', gap: 6 }}>
              {TEMPLATE_BLURBS.map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-section" style={{ paddingTop: 30 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <span className="kicker">Questions</span>
          <h2 style={{ fontSize: 28 }}>Straight answers</h2>
        </div>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Does NOIR fake any of its results?', 'No. Terminal output, test runs, scans, builds, deploy status and AI answers are real executions. Anything that needs a service you have not connected (GitHub, Vercel, payment keys…) shows Requires Configuration instead of pretending to work.'],
            ['Where does my generated app run?', 'In an isolated sandbox on this NOIR server with CPU, memory, disk, network and time limits — never on your machine and never able to reach the NOIR host itself.'],
            ['What if the build fails or tests break?', 'NOIR shows you the actual error with file and line, proposes a fix, and re-runs within a safe retry budget, always keeping your last working checkpoint. It will not loop forever.'],
            ['Do I need an API key to use NOIR?', 'No — NOIR ships with a built-in model capability, so it works fully without external keys. Bring OpenAI / Anthropic / Gemini / Groq / xAI keys to route through more powerful models; Auto/Fast/Balanced/Powerful modes included.'],
            ['Can I take the code with me?', 'Everything NOIR generates is normal source files on your own server: read them, edit them, connect GitHub and push, deploy to Vercel/Supabase/Appwrite/Postgres-style targets, or export at any time.'],
            ['What counts as an important action in this product?', 'Every button that changes state — builds, scans, tests, git operations, deploys, approvals, rollbacks — executes for real and is recorded in your activity feed and audit log.'],
          ].map(([q, a], i) => (
            <div key={q} className="faq-item">
              <div className="faq-q" onClick={() => setFq(fq === i ? -1 : i)}>{q}<span className="muted">{fq === i ? '−' : '+'}</span></div>
              {fq === i ? <div className="faq-a">{a}</div> : null}
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer style={{ borderTop: '1px solid var(--line)', padding: '26px 22px 40px' }}>
        <div className="row-between" style={{ maxWidth: 1160, margin: '0 auto', alignItems: 'flex-start' }}>
          <div>
            <div className="brand" style={{ padding: 0 }}><span className="brand-mark">N</span><span><span className="brand-name">NOIR</span></span></div>
            <div className="muted small" style={{ marginTop: 8, maxWidth: 300 }}>Think. Build. Ship. Improve.<br />An AI software engineering team for ideas that deserve to exist.</div>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <Link to="/app/projects" className="small muted">Workspace</Link>
            <Link to="/signup" className="small muted">Create account</Link>
            <Link to="/login" className="small muted">Sign in</Link>
          </div>
        </div>
        <div className="tiny faint" style={{ textAlign: 'center', marginTop: 26 }}>© {new Date().getFullYear()} NOIR — self-hosted AI software development platform</div>
      </footer>
    </div>
  );
}
