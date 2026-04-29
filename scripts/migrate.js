/**
 * Database migration — creates all required Supabase tables for Tree Monkey Tree Care.
 * Paste each SQL block into the Supabase Dashboard SQL Editor and run.
 */

const migrations = [
  {
    name: 'enquiries',
    sql: `
CREATE TABLE IF NOT EXISTS enquiries (
  id              BIGSERIAL PRIMARY KEY,
  customer_name   TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  postcode        TEXT NOT NULL,
  work_required   TEXT NOT NULL,
  tree_species    TEXT,
  tree_height     TEXT,
  access_details  TEXT,
  tpo_risk        BOOLEAN DEFAULT FALSE,
  is_emergency    BOOLEAN DEFAULT FALSE,
  photo_analysis  TEXT,
  preferred_date  DATE,
  status          TEXT DEFAULT 'pending',
  source          TEXT DEFAULT 'web',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status   ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_postcode ON enquiries(postcode);
CREATE INDEX IF NOT EXISTS idx_enquiries_created  ON enquiries(created_at DESC);
    `.trim(),
  },
  {
    name: 'chat_sessions',
    sql: `
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          TEXT PRIMARY KEY,
  messages    TEXT DEFAULT '[]',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
    `.trim(),
  },
  {
    name: 'reviews',
    sql: `
CREATE TABLE IF NOT EXISTS reviews (
  id           BIGSERIAL PRIMARY KEY,
  external_id  TEXT UNIQUE NOT NULL,
  source       TEXT NOT NULL,
  author       TEXT,
  rating       INTEGER,
  body         TEXT,
  sentiment    TEXT,
  draft_reply  TEXT,
  status       TEXT DEFAULT 'pending_approval',
  published_at TIMESTAMPTZ,
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
    `.trim(),
  },
];

console.log('Tree Monkey Tree Care — Supabase SQL\n');
console.log('Paste each block into: Supabase Dashboard > SQL Editor > New Query\n');
console.log('='.repeat(60));

migrations.forEach(m => {
  console.log(`\n-- ${m.name.toUpperCase()}\n`);
  console.log(m.sql);
  console.log();
});

console.log('='.repeat(60));
console.log('\nDone. Run each block in order: enquiries, chat_sessions, reviews.\n');
