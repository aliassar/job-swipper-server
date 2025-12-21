import 'dotenv/config';
import { db } from './lib/db';
import { applications } from './db/schema';

async function clearApplications() {
    console.log('Clearing all applications...');

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const result = await db.delete(applications);
    console.log('Success! Deleted all applications.');
    process.exit(0);
}

clearApplications().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
