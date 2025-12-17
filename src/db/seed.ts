import 'dotenv/config';
import { db } from '../lib/db';
import { jobSources } from '../db/schema';

async function seed() {
  console.log('Seeding database...');

  // Seed job sources
  await db.insert(jobSources).values([
    {
      name: 'LinkedIn',
      baseUrl: 'https://www.linkedin.com/jobs',
      isActive: true,
    },
    {
      name: 'Indeed',
      baseUrl: 'https://www.indeed.com',
      isActive: true,
    },
    {
      name: 'Glassdoor',
      baseUrl: 'https://www.glassdoor.com',
      isActive: true,
    },
    {
      name: 'Remote.co',
      baseUrl: 'https://remote.co/remote-jobs',
      isActive: true,
    },
  ]).onConflictDoNothing();

  console.log('Seeding completed!');
}

seed()
  .then(() => {
    console.log('Database seeded successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exit(1);
  });
