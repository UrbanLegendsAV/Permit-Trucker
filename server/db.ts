import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS cuisine_type TEXT;
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS county TEXT;
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT;
      ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS food_trucks (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        cuisine TEXT,
        towns TEXT[],
        website TEXT,
        email TEXT,
        phone TEXT,
        instagram_handle TEXT,
        description TEXT,
        status TEXT DEFAULT 'unclaimed',
        image_url TEXT,
        source TEXT,
        outreach_sent BOOLEAN DEFAULT false,
        outreach_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('[DB] Migrations applied successfully');
  } catch (err) {
    console.error('[DB] Migration error:', err);
  } finally {
    client.release();
  }
}
