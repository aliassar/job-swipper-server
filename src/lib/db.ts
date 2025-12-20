import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../db/schema';
import ws from 'ws';

// Enable WebSocket support for transactions in Node.js environment
neonConfig.webSocketConstructor = ws;

// Create a connection pool for transaction support
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const db = drizzle(pool, { schema });
