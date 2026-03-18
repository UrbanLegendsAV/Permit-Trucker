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
    // Inbound emails table (orchestrator)
    await client.query(`
      CREATE TABLE IF NOT EXISTS inbound_emails (
        id SERIAL PRIMARY KEY,
        message_id TEXT UNIQUE,
        "from" TEXT,
        "to" TEXT,
        subject TEXT,
        body_text TEXT,
        body_html TEXT,
        intent TEXT,
        truck_slug TEXT,
        handled_by TEXT,
        handled_at TIMESTAMP,
        reply_sent BOOLEAN DEFAULT false,
        reply_sent_at TIMESTAMP,
        raw_payload TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Agent logs table (orchestrator audit trail)
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_logs (
        id SERIAL PRIMARY KEY,
        agent_name TEXT NOT NULL,
        action TEXT NOT NULL,
        input TEXT,
        output TEXT,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        duration_ms INTEGER,
        related_email_id INTEGER REFERENCES inbound_emails(id),
        related_truck_slug TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Opt-out flag on food_trucks
    await client.query(`
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT false;
    `);
    // Claim tracking on food_trucks
    await client.query(`
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
    `);
    // Location, social, and menu fields on food_trucks
    await client.query(`
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS menu_items JSONB;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS home_lat TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS home_lng TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS tiktok_handle TEXT;
      ALTER TABLE food_trucks ADD COLUMN IF NOT EXISTS facebook_handle TEXT;
    `);
    console.log('[DB] Migrations applied successfully');

    // Grant owner role to admin emails from environment
    // Set ADMIN_EMAILS=email1@example.com,email2@example.com in Replit Secrets
    const adminEmails = process.env.ADMIN_EMAILS?.split(',')
      .map((e: string) => e.trim())
      .filter(Boolean) ?? [];
    if (adminEmails.length > 0) {
      for (const email of adminEmails) {
        await client.query(
          `UPDATE users SET role = 'owner' WHERE email = $1 AND role != 'owner'`,
          [email]
        );
      }
      console.log(`[Admin] Granted owner role to: ${adminEmails.join(', ')}`);
    }

    // Fix known bad data for Brazilian BBQ Boys
    await client.query(`
      UPDATE food_trucks SET
        email = 'brazilianbbqboys@gmail.com',
        catering_contact_email = 'brazilianbbqboys@gmail.com',
        description = 'Authentic Brazilian churrasco on wheels. Picanha, linguiça, and slow-roasted meats with our signature sauces. Family-run, live-fire, serving CT.',
        towns = ARRAY['Danbury','Ridgefield','Hartford','West Hartford','New Haven','Fairfield County']
      WHERE slug = 'brazilian-bbq-boys'
        AND (
          email IS NULL
          OR catering_contact_email = 'catering@brazilianbbqboys.com'
          OR description LIKE '%chimichurri%'
        )
    `);

    // Link Brazilian BBQ Boys to the admin user account
    await client.query(`
      UPDATE food_trucks
      SET
        claimed_by_user_id = (
          SELECT id FROM users
          WHERE email = ANY(ARRAY[
            'brazilianbbqboys@gmail.com',
            'imperialamazon1@gmail.com',
            '23luis.leite@gmail.com'
          ])
          ORDER BY created_at ASC
          LIMIT 1
        ),
        claimed_at = NOW(),
        status = 'claimed'
      WHERE slug = 'brazilian-bbq-boys'
        AND claimed_by_user_id IS NULL
    `);
  } catch (err) {
    console.error('[DB] Migration error:', err);
  } finally {
    client.release();
  }
}
