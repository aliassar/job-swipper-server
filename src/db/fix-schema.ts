import 'dotenv/config';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

// Enable WebSocket for Node.js
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

async function addMissingColumns() {
    console.log('Adding missing columns to user_settings...');

    try {
        // Add missing columns (IF NOT EXISTS for safety)
        await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "auto_generate_resume" boolean DEFAULT false NOT NULL`);
        console.log('✓ Added auto_generate_resume');

        await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "auto_generate_cover_letter" boolean DEFAULT false NOT NULL`);
        console.log('✓ Added auto_generate_cover_letter');

        await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "auto_generate_email" boolean DEFAULT false NOT NULL`);
        console.log('✓ Added auto_generate_email');

        await db.execute(sql`ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_filtering_enabled" boolean DEFAULT false NOT NULL`);
        console.log('✓ Added ai_filtering_enabled');

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

addMissingColumns();
