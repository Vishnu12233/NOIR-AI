-- NOIR generated PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text UNIQUE,
  "name" text,
  "password_hash" text,
  "role" text,
  "verified" text,
  "created_at" text);

CREATE TABLE IF NOT EXISTS "customers" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text,
  "company" text,
  "plan" text,
  "status" text,
  "mrr" numeric,
  "created_at" text);

CREATE TABLE IF NOT EXISTS "plans" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "price" numeric,
  "interval" text,
  "highlights" text,
  "created_at" text);

CREATE TABLE IF NOT EXISTS "subscriptions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text,
  "plan" text,
  "status" text,
  "renews_at" text,
  "created_at" text);

CREATE TABLE IF NOT EXISTS "invoices" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "number" text,
  "user_id" text,
  "total" numeric,
  "status" text,
  "created_at" text);

CREATE TABLE IF NOT EXISTS "comments" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" text,
  "author" text,
  "body" text NOT NULL,
  "created_at" text);
