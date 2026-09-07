# Database — Acme CRM

Backend: **file store (data/store.json)**
Schema source of truth: db/schema.js. Seeding happens on first boot only (db/seed.js). Destructive SQL is unavailable on the file backend; use PostgreSQL for SQL migrations.

## Tables
### users (User)
- id — id
- email — email
- name — text
- role — text
- verified — text

### leads (Lead)
- id — id
- name — text
- email — email
- company — text
- value — number
- status — text
