# Setup guide — Design Desk

## Prerequisites
- Node.js 20+
- (optional) a PostgreSQL instance to replace the built-in file store

## Run locally
```bash
npm start          # listens on PORT (default 3210)
```
Then open http://localhost:3210. Sample data is preloaded on first boot (file backend).

## Test
```bash
npm test           # node --test tests/ — API round-trips + auth flow
```

## Environment
Configure secrets/keys through NOIR → Environment (values are masked and never committed):
- DATABASE_URL
- STRIPE_SECRET_KEY
