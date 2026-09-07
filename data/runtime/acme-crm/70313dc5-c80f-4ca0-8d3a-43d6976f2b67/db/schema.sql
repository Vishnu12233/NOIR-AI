-- NOIR generated PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" ("email" text UNIQUE,
  "name" text,
  "password_hash" text,
  "role" text,
  "verified" text,
  "created_at" text);

CREATE TABLE IF NOT EXISTS "leads" ("name" text NOT NULL,
  "email" text,
  "company" text,
  "value" numeric,
  "status" text,
  "created_at" text);
