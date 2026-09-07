# API reference — Acme CRM

Base URL: `http://<host>:<port>` · Content-Type: application/json · Responses: `{ ok: boolean, data?: any, error?: string, code?: string }`

## Generic endpoints
```
GET    /api/health              liveness + backend name
GET    /api/meta                the app's own specification (name, tables, nav, features)
GET    /api/summary             row count per table
GET    /api/<table>             list rows (?q= search, ?sort=&order=, ?fmt=csv)
GET    /api/<table>/<id>        single row
POST   /api/<table>             create row (validates uniqueness/required)
PATCH  /api/<table>/<id>        update row
DELETE /api/<table>/<id>        delete row
```
## Authentication
```
POST   /api/auth/signup      { email, name, password }  → sets session cookie
POST   /api/auth/login       { email, password }
POST   /api/auth/logout
GET    /api/auth/me          → current user (or 401)
PATCH  /api/auth/me          { name }  → update profile
POST   /api/auth/password    { current, next } → change password
```
Protected endpoints require the `noir_session` HttpOnly cookie or `x-auth-token` header. Admin-only tables return 403 for non-admins. Password hashes never appear in responses.

## Tables
### users
- `id` (id)
- `email` (email)
- `name` (text)
- `role` (text)
- `verified` (text)
undefined sample row(s)

### leads
- `id` (id)
- `name` (text)
- `email` (email)
- `company` (text)
- `value` (number)
- `status` (text)
undefined sample row(s)

## Feature endpoints
- `search` — see server.js
