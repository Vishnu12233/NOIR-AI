# Deployment guide — Design Desk

## Local sandbox deployment
Run **Deploy** in the NOIR workspace: NOIR runs a preflight (entrypoint, tests, security scan, environment, database), then serves the app and marks it Live. Real execution only — statuses reflect the actual pipeline.

## Current deployment state
- Status: running
- No deployment recorded yet.

## External hosting (Vercel / Supabase / Appwrite)
Connect the provider in NOIR → Integrations and add the required tokens under Environment (VERCEL_TOKEN, DATABASE_URL, APPWRITE_API_KEY…). NOIR requires real credentials before any remote operation — it never simulates one.

## Rollback
Every pipeline and major change creates a git checkpoint. Use Checkpoints → Restore to return to any recorded state (destructive action requires confirmation).
