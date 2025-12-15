import { db } from '../lib/db';
import { jobs, userJobStatus, actionHistory, userSettings, applications, blockedCompanies, reportedJobs, workflowRuns } from '../db/schema';
import { eq, and, desc, sql, like, or, SQL, not, inArray } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { logger } from '../middleware/logger';
import { timerService } from './timer.service';
import { workflowService } from './workflow.service';

export const jobService = {
  async getPendingJobs(
    userId: string,
    search?: string,
    limit: number = 10,
    location?: string,
    salaryMin?: number,
    salaryMax?: number
  ) {
    // Get blocked companies
    const blocked = await db
      .select({ companyName: blockedCompanies.companyName })
      .from(blockedCompanies)
      .where(eq(blockedCompanies.userId, userId));

    const blockedCompanyNames = blocked.map((b) => b.companyName);

    const baseQuery = db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
        skills: jobs.skills,
        description: jobs.description,
        requirements: jobs.requirements,
        benefits: jobs.benefits,
        jobType: jobs.jobType,
        experienceLevel: jobs.experienceLevel,
        jobUrl: jobs.jobUrl,
        postedDate: jobs.postedDate,
        status: userJobStatus.status,
        saved: userJobStatus.saved,
        viewedAt: userJobStatus.viewedAt,
        decidedAt: userJobStatus.decidedAt,
      })
      .from(jobs)
      .leftJoin(userJobStatus, and(eq(userJobStatus.jobId, jobs.id), eq(userJobStatus.userId, userId)))
      .$dynamic();

    let query = baseQuery.where(sql`(${userJobStatus.status} IS NULL OR ${userJobStatus.status} = 'pending')`);

    // Exclude blocked companies
    if (blockedCompanyNames.length > 0) {
      query = query.where(not(inArray(jobs.company, blockedCompanyNames)));
    }

    // Add search if provided
    if (search) {
      query = query.where(
        or(
          like(jobs.company, `%${search}%`),
          like(jobs.position, `%${search}%`)
        )
      );
    }

    // Add location filter
    if (location) {
      query = query.where(like(jobs.location, `%${location}%`));
    }

    // Add salary filter (basic implementation - would need parsing in production)
    // TODO: For production, normalize salary data during insertion or add a separate numeric salary field
    // Current implementation using REGEXP_REPLACE prevents index usage and will be slow on large datasets
    if (salaryMin || salaryMax) {
      // This is a simplified filter - in production you'd want to parse salary strings
      if (salaryMin) {
        query = query.where(sql`CAST(REGEXP_REPLACE(${jobs.salary}, '[^0-9]', '', 'g') AS INTEGER) >= ${salaryMin}`);
      }
      if (salaryMax) {
        query = query.where(sql`CAST(REGEXP_REPLACE(${jobs.salary}, '[^0-9]', '', 'g') AS INTEGER) <= ${salaryMax}`);
      }
    }

    const results = await query.orderBy(desc(jobs.createdAt)).limit(limit);

    // Get total count of remaining jobs
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .leftJoin(userJobStatus, and(eq(userJobStatus.jobId, jobs.id), eq(userJobStatus.userId, userId)))
      .where(sql`(${userJobStatus.status} IS NULL OR ${userJobStatus.status} = 'pending')`);

    const totalResult = await countQuery;
    const total = Number(totalResult[0]?.count || 0);

    return {
      jobs: results,
      total,
    };
  },

  async getJobWithStatus(userId: string, jobId: string) {
    const result = await db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
        skills: jobs.skills,
        description: jobs.description,
        requirements: jobs.requirements,
        benefits: jobs.benefits,
        jobType: jobs.jobType,
        experienceLevel: jobs.experienceLevel,
        jobUrl: jobs.jobUrl,
        postedDate: jobs.postedDate,
        status: userJobStatus.status,
        saved: userJobStatus.saved,
      })
      .from(jobs)
      .leftJoin(userJobStatus, and(eq(userJobStatus.jobId, jobs.id), eq(userJobStatus.userId, userId)))
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Job');
    }

    return result[0];
  },

  async updateJobStatus(
    userId: string,
    jobId: string,
    status: 'pending' | 'accepted' | 'rejected' | 'skipped',
    actionType: 'accepted' | 'rejected' | 'skipped' | 'saved' | 'unsaved' | 'rollback' | 'report' | 'unreport'
  ) {
    const job = await this.getJobWithStatus(userId, jobId);

    // Update or insert user job status
    const existing = await db.select().from(userJobStatus).where(
      and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId))
    ).limit(1);

    if (existing.length > 0) {
      await db
        .update(userJobStatus)
        .set({
          status,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId)));
    } else {
      await db.insert(userJobStatus).values({
        userId,
        jobId,
        status,
        decidedAt: new Date(),
      });
    }

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId,
      actionType: actionType,
      previousStatus: job.status,
      newStatus: status,
      metadata: {},
    });

    return await this.getJobWithStatus(userId, jobId);
  },

  async toggleSave(userId: string, jobId: string) {
    const job = await this.getJobWithStatus(userId, jobId);
    const newSavedState = !job.saved;

    const existing = await db.select().from(userJobStatus).where(
      and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId))
    ).limit(1);

    if (existing.length > 0) {
      await db
        .update(userJobStatus)
        .set({
          saved: newSavedState,
          updatedAt: new Date(),
        })
        .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId)));
    } else {
      await db.insert(userJobStatus).values({
        userId,
        jobId,
        saved: newSavedState,
      });
    }

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId,
      actionType: newSavedState ? 'saved' : 'unsaved',
      metadata: {},
    });

    return await this.getJobWithStatus(userId, jobId);
  },

  async unsave(userId: string, jobId: string) {
    // Verify job exists
    await this.getJobWithStatus(userId, jobId);

    const existing = await db.select().from(userJobStatus).where(
      and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId))
    ).limit(1);

    if (existing.length > 0) {
      await db
        .update(userJobStatus)
        .set({
          saved: false,
          updatedAt: new Date(),
        })
        .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId)));
    }

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId,
      actionType: 'unsaved',
      metadata: {},
    });

    return await this.getJobWithStatus(userId, jobId);
  },

  async getSavedJobs(userId: string, page: number = 1, limit: number = 20, search?: string) {
    const offset = (page - 1) * limit;

    let whereConditions: SQL<unknown> | undefined = and(eq(userJobStatus.userId, userId), eq(userJobStatus.saved, true));
    
    if (search) {
      whereConditions = and(
        whereConditions,
        or(
          like(jobs.company, `%${search}%`),
          like(jobs.position, `%${search}%`)
        )
      );
    }

    const items = await db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
        skills: jobs.skills,
        jobType: jobs.jobType,
        status: userJobStatus.status,
        saved: userJobStatus.saved,
      })
      .from(jobs)
      .innerJoin(userJobStatus, eq(userJobStatus.jobId, jobs.id))
      .where(whereConditions)
      .orderBy(desc(userJobStatus.updatedAt))
      .limit(limit)
      .offset(offset);

    let countWhereConditions: SQL<unknown> | undefined = and(eq(userJobStatus.userId, userId), eq(userJobStatus.saved, true));
    
    if (search) {
      countWhereConditions = and(
        countWhereConditions,
        sql`EXISTS (
          SELECT 1 FROM ${jobs} 
          WHERE ${jobs.id} = ${userJobStatus.jobId} 
          AND (${like(jobs.company, `%${search}%`)} OR ${like(jobs.position, `%${search}%`)})
        )`
      );
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userJobStatus)
      .where(countWhereConditions);

    const total = Number(totalResult[0]?.count || 0);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getSkippedJobs(userId: string, page: number = 1, limit: number = 20, search?: string) {
    const offset = (page - 1) * limit;

    let whereConditions: SQL<unknown> | undefined = and(eq(userJobStatus.userId, userId), eq(userJobStatus.status, 'skipped'));
    
    if (search) {
      whereConditions = and(
        whereConditions,
        or(
          like(jobs.company, `%${search}%`),
          like(jobs.position, `%${search}%`)
        )
      );
    }

    const items = await db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        status: userJobStatus.status,
      })
      .from(jobs)
      .innerJoin(userJobStatus, eq(userJobStatus.jobId, jobs.id))
      .where(whereConditions)
      .orderBy(desc(userJobStatus.decidedAt))
      .limit(limit)
      .offset(offset);

    let countWhereConditions: SQL<unknown> | undefined = and(eq(userJobStatus.userId, userId), eq(userJobStatus.status, 'skipped'));
    
    if (search) {
      countWhereConditions = and(
        countWhereConditions,
        sql`EXISTS (
          SELECT 1 FROM ${jobs} 
          WHERE ${jobs.id} = ${userJobStatus.jobId} 
          AND (${like(jobs.company, `%${search}%`)} OR ${like(jobs.position, `%${search}%`)})
        )`
      );
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userJobStatus)
      .where(countWhereConditions);

    const total = Number(totalResult[0]?.count || 0);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async acceptJob(userId: string, jobId: string, requestId?: string) {
    // Use a transaction for atomicity
    return await db.transaction(async (tx) => {
      // Update job status to accepted
      const job = await this.updateJobStatus(userId, jobId, 'accepted', 'accepted');

      // Get user settings to check auto-generation preferences
      const settings = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      if (settings.length === 0) {
        return { job, application: null, workflow: null };
      }

      const userPrefs = settings[0];

      // Create application record or get existing one
      let application;
      
      // Check if application already exists
      const existingApplications = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
        .limit(1);
      
      if (existingApplications.length > 0) {
        application = existingApplications[0];
      } else {
        try {
          const [newApp] = await tx
            .insert(applications)
            .values({
              userId,
              jobId,
              stage: 'Syncing',
              lastUpdated: new Date(),
            })
            .returning();
          application = newApp;
        } catch (error) {
          logger.error({ error, userId, jobId }, 'Failed to create application during job acceptance');
          return { job, application: null, workflow: null };
        }
      }

      // Create workflow run with idempotency key
      let workflowRun = null;
      if (userPrefs.autoApplyEnabled) {
        const idempotencyKey = `workflow-${userId}-${application.id}-${Date.now()}`;
        
        const [workflow] = await tx
          .insert(workflowRuns)
          .values({
            userId,
            applicationId: application.id,
            idempotencyKey,
            status: 'pending',
            currentStep: 'initialized',
            metadata: { jobId },
          })
          .returning();
        
        workflowRun = workflow;

        // Schedule 1-minute delay timer (NOT immediate execution)
        await timerService.scheduleAutoApplyDelay(userId, application.id);
        
        logger.info({ userId, jobId, applicationId: application.id, workflowRunId: workflow.id }, 'Auto-apply workflow scheduled with 1-minute delay');
      }

      return {
        job,
        application,
        workflow: workflowRun,
      };
    });
  },

  /**
   * Rollback job acceptance
   */
  async rollbackJob(userId: string, jobId: string) {
    return await db.transaction(async (tx) => {
      // Get application for the job
      const application = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
        .limit(1);

      if (application.length === 0) {
        throw new NotFoundError('Application');
      }

      const app = application[0];

      // Cancel any pending workflow and timers
      const workflow = await tx
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.applicationId, app.id))
        .orderBy(desc(workflowRuns.createdAt))
        .limit(1);

      if (workflow.length > 0 && workflow[0].status !== 'completed' && workflow[0].status !== 'cancelled') {
        await tx
          .update(workflowRuns)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, workflow[0].id));
      }

      // Cancel all pending timers for this application
      await timerService.cancelTimersByTarget(app.id);

      // If documents were generated, schedule 1-day deletion timer
      if (app.generatedResumeId || app.generatedCoverLetterId) {
        await timerService.scheduleDocDeletionTimer(
          userId,
          app.generatedResumeId || '',
          app.generatedCoverLetterId || undefined
        );
      }

      // Update job status back to pending
      const job = await this.updateJobStatus(userId, jobId, 'pending', 'rollback');

      logger.info({ userId, jobId, applicationId: app.id }, 'Job rolled back');

      return {
        job,
        application: app,
      };
    });
  },

  /**
   * Block a company
   */
  async blockCompany(userId: string, companyName: string, reason?: string) {
    const [blocked] = await db
      .insert(blockedCompanies)
      .values({
        userId,
        companyName,
        reason,
      })
      .returning();

    logger.info({ userId, companyName, reason }, 'Company blocked');
    return blocked;
  },

  /**
   * Unblock a company
   */
  async unblockCompany(userId: string, companyName: string) {
    await db
      .delete(blockedCompanies)
      .where(and(eq(blockedCompanies.userId, userId), eq(blockedCompanies.companyName, companyName)));

    logger.info({ userId, companyName }, 'Company unblocked');
  },

  /**
   * Get blocked companies
   */
  async getBlockedCompanies(userId: string) {
    const blocked = await db
      .select()
      .from(blockedCompanies)
      .where(eq(blockedCompanies.userId, userId))
      .orderBy(desc(blockedCompanies.createdAt));

    return blocked;
  },

  /**
   * Report a job
   */
  async reportJob(
    userId: string,
    jobId: string,
    reason: 'fake' | 'not_interested' | 'dont_recommend_company',
    details?: string
  ) {
    return await db.transaction(async (tx) => {
      // Get job details
      const job = await this.getJobWithStatus(userId, jobId);

      // Insert report
      const [report] = await tx
        .insert(reportedJobs)
        .values({
          userId,
          jobId,
          reason,
          details,
        })
        .returning();

      // If reason is 'dont_recommend_company', auto-block the company
      if (reason === 'dont_recommend_company') {
        await this.blockCompany(userId, job.company, 'Reported via dont_recommend_company');
      }

      // TODO: Notify filtering microservice based on settings
      logger.info({ userId, jobId, reason }, 'Job reported');

      // Record action history
      await tx.insert(actionHistory).values({
        userId,
        jobId,
        actionType: 'report',
        metadata: { reason, details },
      });

      return report;
    });
  },

  /**
   * Unreport a job
   */
  async unreportJob(userId: string, jobId: string) {
    return await db.transaction(async (tx) => {
      // Get the report
      const reports = await tx
        .select()
        .from(reportedJobs)
        .where(and(eq(reportedJobs.userId, userId), eq(reportedJobs.jobId, jobId)))
        .limit(1);

      if (reports.length === 0) {
        throw new NotFoundError('Report');
      }

      const report = reports[0];

      // If it was a company block report, unblock the company
      if (report.reason === 'dont_recommend_company') {
        const job = await this.getJobWithStatus(userId, jobId);
        await this.unblockCompany(userId, job.company);
      }

      // Delete the report
      await tx
        .delete(reportedJobs)
        .where(eq(reportedJobs.id, report.id));

      // TODO: Notify filtering microservice to remove filters
      logger.info({ userId, jobId }, 'Job unreported');

      // Record action history
      await tx.insert(actionHistory).values({
        userId,
        jobId,
        actionType: 'unreport',
        metadata: {},
      });
    });
  },
};
