import 'dotenv/config';
import { db } from './lib/db';
import { users } from './db/schema';
import bcrypt from 'bcryptjs';

async function createUser() {
    console.log('Creating test user...');

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const email = 'test@example.com';
    const password = 'password123';
    const passwordHash = await bcrypt.hash(password, 10);

    console.log(`Attempting to insert user: ${email}`);

    try {
        const [newUser] = await db
            .insert(users)
            .values({
                email,
                passwordHash,
                emailVerified: true, // Auto-verify for testing
                oauthProvider: 'email',
            })
            .returning();

        console.log('Success! Test user created.');
        console.log('Email:', email);
        console.log('Password:', password);
        console.log('ID:', newUser.id);
    } catch (error) {
        console.error('Insert failed!');
        console.error(error);
    }
    process.exit(0);
}

createUser();
