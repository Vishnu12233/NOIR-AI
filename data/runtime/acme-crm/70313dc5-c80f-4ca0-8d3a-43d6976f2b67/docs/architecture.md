# Architecture — Acme CRM

Generated on 2026-09-06 14:21 UTC.

## System overview
- **Frontend**: static ES modules served by the app's HTTP server (`src/`). No build step, no framework lock-in.
- **API**: REST endpoints generated per table in `server.js` (`GET/POST/PATCH/DELETE /api/<table>`, `?q=` search, `?fmt=csv` export).
- **Database backend**: Built-in JSON file store with atomic writes (data/store.json). PostgreSQL activates automatically when DATABASE_URL is set.
- **Auth**: email + password with scrypt-grade hashing, HttpOnly session cookies, role field (user/admin).

## Data model (2 table(s))
| table | label | rows/fields |
| --- | --- | --- |
| users | User | 3 |
| leads | Lead | 5 |

## Client routes
- `/` — Overview
- `/board` — Board
- `/table/leads` — Leads
- `/settings` — Settings
- `/admin` — Admin

## Runtime
Node.js >= 20, zero external runtime dependencies. Entry: `node server.js` (PORT env).
