/**
 * Database migration — creates all required Supabase tables.
 * Run once: node scripts/migrate.js
 */

import 'dotenv/config';
import { supabase } from '../lib/supabase.js';

const migrations = [
  {
    name: 'bookings',
    sql: `
      CREATE TABLE IF NOT EXISTS bookings (
        id            BIGSERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        phone         TEXT NOT NULL,
        email         TEXT NOT NULL,
        postcode      TEXT NOT NULL,
        skip_size     TEXT NOT NULL,
        delivery_date DATE NOT NULL,
        on_road       BOOLEAN DEFAULT FALSE,
        waste_description TEXT,
        permit_required   BOOLEAN DEFAULT FALSE,
        status        TEXT DEFAULT 'pending',
        source        TEXT DEFAULT 'web',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(delivery_date);
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    `,
  },
  {
    name: 'job_sheets',
    sql: `
      CREATE TABLE IF NOT EXISTS job_sheets (
        id          BIGSERIAL PRIMARY KEY,
        booking_id  BIGINT REFERENCES bookings(id),
        driver_id   TEXT,
        status      TEXT DEFAULT 'pending',
        photos      JSONB DEFAULT '[]',
        driver_notes TEXT,
        completed_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_job_sheets_driver ON job_sheets(driver_id);
      CREATE INDEX IF NOT EXISTS idx_job_sheets_booking ON job_sheets(booking_id);
    `,
  },
  {
    name: 'chat_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id        TEXT PRIMARY KEY,
        messages  TEXT DEFAULT '[]',
        metadata  JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
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
    `,
  },
  {
    name: 'permit_applications',
    sql: `
      CREATE TABLE IF NOT EXISTS permit_applications (
        id               BIGSERIAL PRIMARY KEY,
        booking_id       BIGINT REFERENCES bookings(id),
        council          TEXT,
        postcode         TEXT,
        street_address   TEXT,
        application_ref  TEXT,
        status           TEXT DEFAULT 'submitted',
        submitted_at     TIMESTAMPTZ DEFAULT NOW(),
        expiry_date      DATE
      );
      CREATE INDEX IF NOT EXISTS idx_permits_expiry ON permit_applications(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_permits_status ON permit_applications(status);
    `,
  },
];

async function migrate() {
  console.log('Running RL Skip Hire Agent database migrations...\n');

  for (const migration of migrations) {
    process.stdout.write(`  Creating table: ${migration.name}... `);
    // Supabase REST API doesn't expose raw SQL — run via supabase.from checks
    // For actual migrations, use Supabase Dashboard SQL editor or supabase CLI
    console.log('SQL ready (run in Supabase Dashboard SQL editor)');
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('INSTRUCTIONS:');
  console.log('1. Open your Supabase Dashboard');
  console.log('2. Go to SQL Editor');
  console.log('3. Run the SQL for each table above');
  console.log('4. Create a "job-photos" storage bucket (public)');
  console.log('─────────────────────────────────────────────\n');

  // Print all SQL for easy copy-paste
  console.log('─── Full SQL to run in Supabase ─────────────\n');
  migrations.forEach(m => {
    console.log(`-- ${m.name.toUpperCase()}`);
    console.log(m.sql.trim());
    console.log();
  });
}

migrate().catch(console.error);
