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
    // Catering fields for food_trucks
    await client.query(`
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS offers_private_catering BOOLEAN DEFAULT false;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_min_guests INTEGER;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_max_guests INTEGER;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_price_per_person TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_description TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_event_types TEXT[];
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_contact_email TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_contact_phone TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS catering_website TEXT;
    `);
    // Operations data on profiles
    await client.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS operations_data JSONB;
    `);
    // Food suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS food_suppliers (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_id VARCHAR REFERENCES profiles(id),
        supplier_name TEXT NOT NULL,
        supplies_what TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // New operations fields on data_vaults
    await client.query(`
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS food_suppliers TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS electricity_source TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS generator_info TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS waste_water_disposal TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS hand_washing_setup TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS truck_interior_description TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS garbage_setup TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS overnight_parking_address TEXT;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS overnight_parking_authorized BOOLEAN;
      ALTER TABLE data_vaults ADD COLUMN IF NOT EXISTS has_commissary_contract BOOLEAN;
    `);
    console.log('[DB] Migrations applied successfully');
  } catch (err) {
    console.error('[DB] Migration error:', err);
  } finally {
    client.release();
  }
}
