# NOIR — Think. Build. Ship. Improve.

NOIR is a local AI engineering platform that turns plain-language ideas into real,
runnable software inside a sandboxed workspace — with honest AI (no simulated
work), visible generated code, real previews, real tests and real git history.

## What it does

- **Idea → app pipeline** — describe an idea; NOIR compiles a spec, scaffolds a
  zero-dependency Node.js app (API + static client + JSON file DB, optionally
  PostgreSQL via `DATABASE_URL`), then runs its real test suite.
- **Workspace per project** — full file browser with visible code tabs, terminal,
  activity/event log, checkpoints and a real git repository (branch, switch,
  commit, rollback, fork) per generated app.
- **Code-level natural-language patches** — ask for an *old → new* text change;
  NOIR plans verbatim, shows the real diff and applies only after your approval,
  with an automatic safety checkpoint and test re-run.
- **Multi-tenancy teams** — share projects with teammates via role-based access
  (owner / admin / developer / reviewer / viewer).
- **Database explorer** — live tables/rows plus a visual relationship diagram
  inferred from real `*_id` columns.
- **AI chat that streams** — real token streaming when a provider key is
  configured; otherwise built-in answers are explicitly labelled built-in and
  never pretend to be a model.
- **GitHub** — push generated projects to a real GitHub repository using your own
  token (stored encrypted at rest) or platform-level OAuth app credentials.
- **Deploy & quality** — local deploy with preflight, security/performance/a11y/SEO
  scans, API explorer, docs generation, audit log, usage tracking.

Honesty rule: NOIR never fakes external services. If a provider isn't configured
or a credential is missing, it says so instead of simulating success.

## Layout

```
server/   Node.js (Express + better-sqlite3) platform API + engine
client/   React (Vite) UI — builds into server/static
data/     local SQLite DB + per-project runtime sandboxes (gitignored)
```

Engine modules of note (`server/src/engine/`): `ai.js` (provider abstraction),
`patch.js` (verbatim NL diff/apply), `runner.js` (sandbox process runner),
`gitutil.js` (per-app git), `github.js` (GitHub connect/push), `scans.js`,
`tests.js`, `deploy.js`, `dbops.js`, `workspace.js`.

## Run it

```bash
# 1) API server (port 7860)
cd server
npm install
node index.js

# 2) UI — build into ../server/static (served by the API server)
cd client
npm install
npx vite build
# ...then open http://localhost:7860
```

For development: `npx vite` inside `client/` gives hot reload (the API proxy is
configured in `vite.config.js`).

## Configuration (environment variables)

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 7860) |
| `NOIR_DATA_DIR` | SQLite DB + runtime sandbox root (default `../data`) |
| `NOIR_SECRET` | Session/secret key — change in production |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY` | Optional AI providers for the assistant; chat falls back to labelled built-in answers when none are set |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional GitHub OAuth app (otherwise connect with a personal access token in the UI) |
| `DATABASE_URL` | Per-project: switch a generated app's storage to PostgreSQL |

## License

MIT — see `LICENSE`.
