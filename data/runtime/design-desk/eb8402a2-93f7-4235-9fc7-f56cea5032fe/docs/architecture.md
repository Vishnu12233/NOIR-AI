# Architecture — Design Desk

Generated on 2026-09-06 15:06 UTC.

## System overview
- **Frontend**: static ES modules served by the app's HTTP server (`src/`). No build step, no framework lock-in.
- **API**: REST endpoints generated per table in `server.js` (`GET/POST/PATCH/DELETE /api/<table>`, `?q=` search, `?fmt=csv` export).
- **Database backend**: Built-in JSON file store with atomic writes (data/store.json). PostgreSQL activates automatically when DATABASE_URL is set.
- **Auth**: email + password with scrypt-grade hashing, HttpOnly session cookies, role field (user/admin).

## Data model (6 table(s))
| table | label | rows/fields |
| --- | --- | --- |
| users | User | 3 |
| customers | Customer | 5 |
| plans | Plan | 3 |
| subscriptions | Subscription | 1 |
| invoices | Invoice | 2 |
| comments | Comment | 2 |

## Client routes
- `/` — Overview
- `/table/customers` — Customers
- `/settings` — Settings
- `/admin` — Admin

## Runtime
Node.js >= 20, zero external runtime dependencies. Entry: `node server.js` (PORT env).
