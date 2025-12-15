import { db } from '../lib/db';
import { jobs } from '../db/schema';
import { parseSalaryRange } from '../lib/utils';
import { isNotNull, and, or, isNull, eq } from 'drizzle-orm';
import { logger } from '../middleware/logger';

/**
 * Service for normalizing salary data in the jobs table
 */
export const salaryNormalizationService = {
  /**
   * Normalize all jobs that have a salary string but missing salaryMin/salaryMax
   * This populates the salaryMin and salaryMax fields for efficient filtering
   */
  async normalizeAllSalaries(): Promise<{
    processed: number;
    updated: number;
    failed: number;
  }> {
    let processed = 0;
    let updated = 0;
    let failed = 0;

    try {
      // Get all jobs that have a salary but missing normalized fields
      const jobsToNormalize = await db
        .select({
          id: jobs.id,
          salary: jobs.salary,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
        })
        .from(jobs)
        .where(
          and(
            isNotNull(jobs.salary),
            or(
              isNull(jobs.salaryMin),
              isNull(jobs.salaryMax)
            )
          )
        );

      logger.info(
        { count: jobsToNormalize.length },
        'Starting salary normalization'
      );

      // Process each job
      for (const job of jobsToNormalize) {
        processed++;

        try {
          // Parse the salary range
          const { min, max } = parseSalaryRange(job.salary);

          // Only update if we successfully parsed values
          if (min !== null || max !== null) {
            await db
              .update(jobs)
              .set({
                salaryMin: min,
                salaryMax: max,
                updatedAt: new Date(),
              })
              .where(eq(jobs.id, job.id));

            updated++;
          }
        } catch (error) {
          failed++;
          logger.error(
            { error, jobId: job.id, salary: job.salary },
            'Failed to normalize salary for job'
          );
        }
      }

      logger.info(
        { processed, updated, failed },
        'Salary normalization completed'
      );

      return { processed, updated, failed };
    } catch (error) {
      logger.error({ error }, 'Salary normalization failed');
      throw error;
    }
  },

  /**
   * Normalize salary for a specific job
   */
  async normalizeSalaryForJob(jobId: string): Promise<boolean> {
    try {
      const job = await db
        .select({
          id: jobs.id,
          salary: jobs.salary,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

      if (job.length === 0) {
        return false;
      }

      const { min, max } = parseSalaryRange(job[0].salary);

      await db
        .update(jobs)
        .set({
          salaryMin: min,
          salaryMax: max,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      return true;
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to normalize salary for job');
      throw error;
    }
  },
};
