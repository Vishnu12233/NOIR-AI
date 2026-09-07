# Database — Design Desk

Backend: **file store (data/store.json)**
Schema source of truth: db/schema.js. Seeding happens on first boot only (db/seed.js). Destructive SQL is unavailable on the file backend; use PostgreSQL for SQL migrations.

## Tables
### users (User)
- id — id
- email — email
- name — text
- role — text
- verified — text

### customers (Customer)
- id — id
- name — text
- email — email
- company — text
- plan — text
- status — text
- mrr — number

### plans (Plan)
- id — id
- name — text
- price — number
- interval — text
- highlights — text

### subscriptions (Subscription)
- id — id
- user_id — text
- plan — text
- status — text
- renews_at — date

### invoices (Invoice)
- id — id
- number — text
- user_id — text
- total — number
- status — text

### comments (Comment)
- id — id
- post_id — text
- author — text
- body — multiline
