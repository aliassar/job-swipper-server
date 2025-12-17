import 'dotenv/config';
import { db } from './lib/db';
import { jobs, jobSources } from './db/schema';
import { eq } from 'drizzle-orm';

async function createFakeJobs() {
    console.log('Creating fake jobs...');

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    // Get a source ID (e.g., LinkedIn)
    let source = await db.query.jobSources.findFirst({
        where: eq(jobSources.name, 'LinkedIn')
    });

    if (!source) {
        console.log('LinkedIn source not found, using first available source...');
        source = await db.query.jobSources.findFirst();
    }

    if (!source) {
        console.error('No job sources found! Please run seed first.');
        process.exit(1);
    }

    const jobsData = [
        {
            company: 'TechCorp Inc.',
            position: 'Senior Frontend Engineer',
            location: 'San Francisco, CA (Remote)',
            salary: '$140k - $180k',
            salaryMin: 140000,
            salaryMax: 180000,
            skills: ['React', 'TypeScript', 'Next.js', 'TailwindCSS'],
            description: 'We are looking for a Senior Frontend Engineer to lead our core product team. You will be building modern web applications using Next.js and React.',
            requirements: '- 5+ years of experience with React\n- Deep understanding of web performance\n- Experience with state management',
            benefits: 'Full health coverage, 401k matching, Unlimited PTO',
            jobType: 'Full-time',
            experienceLevel: 'Senior',
            jobUrl: 'https://linkedin.com/jobs/view/fake-1',
            postedDate: new Date(),
            sourceId: source.id,
            externalId: 'fake-job-1'
        },
        {
            company: 'DataSystems Ltd.',
            position: 'Backend Developer',
            location: 'New York, NY',
            salary: '$130k - $160k',
            salaryMin: 130000,
            salaryMax: 160000,
            skills: ['Node.js', 'PostgreSQL', 'Redis', 'Docker'],
            description: 'Join our backend team to build scalable microservices. You will work with high-volume data processing and real-time systems.',
            requirements: '- Strong proficiency in Node.js and TypeScript\n- Experience with SQL and NoSQL databases\n- Knowledge of message queues',
            benefits: 'Competitive salary, Stock options, Gym reimbursment',
            jobType: 'Full-time',
            experienceLevel: 'Mid-Level',
            jobUrl: 'https://linkedin.com/jobs/view/fake-2',
            postedDate: new Date(),
            sourceId: source.id,
            externalId: 'fake-job-2'
        },
        {
            company: 'StartupAI',
            position: 'Full Stack Engineer',
            location: 'Remote',
            salary: '$120k - $150k',
            salaryMin: 120000,
            salaryMax: 150000,
            skills: ['React', 'Node.js', 'Python', 'AWS'],
            description: 'Fast-paced startup looking for a generalist who can handle both frontend and backend tasks. Creating the future of AI tools.',
            requirements: '- Experience with full stack development\n- Ability to move fast and break things\n- Passion for AI',
            benefits: 'Remote work, Flexible hours, Equity',
            jobType: 'Contract',
            experienceLevel: 'Mid-Level',
            jobUrl: 'https://linkedin.com/jobs/view/fake-3',
            postedDate: new Date(),
            sourceId: source.id,
            externalId: 'fake-job-3'
        },
        {
            company: 'CloudNative Solutions',
            position: 'DevOps Engineer',
            location: 'Austin, TX',
            salary: '$150k - $190k',
            salaryMin: 150000,
            salaryMax: 190000,
            skills: ['Kubernetes', 'Terraform', 'AWS', 'CI/CD'],
            description: 'Help us automate everything. We need a DevOps expert to manage our multi-cloud infrastructure.',
            requirements: '- Proven experience with Kubernetes\n- IaC using Terraform\n- Strong scripting skills (Bash/Python)',
            benefits: 'Top-tier equipment, Conference budget, Health insurance',
            jobType: 'Full-time',
            experienceLevel: 'Senior',
            jobUrl: 'https://linkedin.com/jobs/view/fake-4',
            postedDate: new Date(),
            sourceId: source.id,
            externalId: 'fake-job-4'
        },
        {
            company: 'Creative Agency',
            position: 'UI/UX Designer',
            location: 'Berlin, Germany',
            salary: '€60k - €80k',
            salaryMin: 65000,
            salaryMax: 87000,
            skills: ['Figma', 'Adobe XD', 'Prototyping', 'User Research'],
            description: 'Design beautiful interfaces for our clients. You will work closely with developers and product managers.',
            requirements: '- Strong portfolio of UI/UX projects\n- Proficiency in Figma\n- Excellent communication skills',
            benefits: 'Creative environment, Team retreats, Learning budget',
            jobType: 'Full-time',
            experienceLevel: 'Mid-Level',
            jobUrl: 'https://linkedin.com/jobs/view/fake-5',
            postedDate: new Date(),
            sourceId: source.id,
            externalId: 'fake-job-5'
        }
    ];

    try {
        const inserted = await db.insert(jobs).values(jobsData).returning();
        console.log(`Success! Created ${inserted.length} fake jobs.`);
    } catch (error) {
        console.error('Failed to insert jobs:', error);
    }

    process.exit(0);
}

createFakeJobs();
