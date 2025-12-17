import { db } from '../lib/db';
import { jobs, userJobStatus, actionHistory, userSettings, applications, blockedCompanies, reportedJobs, workflowRuns } from '../db/schema';
import { eq, and, desc, sql, like, or, SQL, not, inArray } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { logger } from '../middleware/logger';
import { timerService } from './timer.service';
import { jobFilterClient } from '../lib/microservice-client';
import type { JobFilterRequest, JobFilterResponse, FilterType } from '../lib/microservices';
import type { JobWithStatus } from '../types';
import PDFDocument from 'pdfkit';
import { escapeLikePattern } from '../lib/utils';

// Type guard for database errors
function isDatabaseError(error: unknown): error is { code?: string; constraint?: string } {
  return typeof error === 'object' && error !== null && ('code' in error || 'constraint' in error);
}

export const jobService = {
  /**
   * Get pending jobs for a user with optional filters
   * @param userId - The user's UUID
   * @param search - Optional search term for company/position
   * @param limit - Maximum number of jobs to return (default: 10)
   * @param location - Optional location filter
   * @param salaryMin - Optional minimum salary filter
   * @param salaryMax - Optional maximum salary filter
   * @returns Promise containing jobs array and total count
   * @throws {ValidationError} If salary range is invalid
   */
  async getPendingJobs(
    userId: string,
    search?: string,
    limit: number = 10,
    location?: string,
    salaryMin?: number,
    salaryMax?: number
  ): Promise<{ jobs: JobWithStatus[]; total: number }> {
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

    // Build all conditions as an array
    const conditions: SQL<unknown>[] = [
      sql`(${userJobStatus.status} IS NULL OR ${userJobStatus.status} = 'pending')`
    ];

    // Exclude blocked companies
    if (blockedCompanyNames.length > 0) {
      conditions.push(not(inArray(jobs.company, blockedCompanyNames)));
    }

    // Add search if provided
    if (search) {
      const escapedSearch = escapeLikePattern(search);
      const searchCondition = or(
        like(jobs.company, `%${escapedSearch}%`),
        like(jobs.position, `%${escapedSearch}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Add location filter
    if (location) {
      const escapedLocation = escapeLikePattern(location);
      conditions.push(like(jobs.location, `%${escapedLocation}%`));
    }

    // Add salary filter using numeric fields for better performance
    // Filter jobs where salary range overlaps with user's desired range
    if (salaryMin !== undefined) {
      // Job's maximum salary should be at least the user's minimum requirement
      conditions.push(sql`${jobs.salaryMax} >= ${salaryMin}`);
    }
    if (salaryMax !== undefined) {
      // Job's minimum salary should be within the user's maximum budget
      conditions.push(sql`${jobs.salaryMin} <= ${salaryMax}`);
    }

    // Apply all conditions at once
    const query = baseQuery.where(and(...conditions));

    const results = await query.orderBy(desc(jobs.createdAt)).limit(limit);

    // Get total count of remaining jobs with the same filters
    // Build count conditions (same as the main query)
    const countConditions: SQL<unknown>[] = [
      sql`(${userJobStatus.status} IS NULL OR ${userJobStatus.status} = 'pending')`
    ];

    if (blockedCompanyNames.length > 0) {
      countConditions.push(not(inArray(jobs.company, blockedCompanyNames)));
    }

    if (search) {
      const escapedSearch = escapeLikePattern(search);
      const searchCondition = or(
        like(jobs.company, `%${escapedSearch}%`),
        like(jobs.position, `%${escapedSearch}%`)
      );
      if (searchCondition) {
        countConditions.push(searchCondition);
      }
    }

    if (location) {
      const escapedLocation = escapeLikePattern(location);
      countConditions.push(like(jobs.location, `%${escapedLocation}%`));
    }

    if (salaryMin !== undefined) {
      countConditions.push(sql`${jobs.salaryMax} >= ${salaryMin}`);
    }
    if (salaryMax !== undefined) {
      countConditions.push(sql`${jobs.salaryMin} <= ${salaryMax}`);
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .leftJoin(userJobStatus, and(eq(userJobStatus.jobId, jobs.id), eq(userJobStatus.userId, userId)))
      .where(and(...countConditions));
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
    actionType: 'accepted' | 'rejected' | 'skipped' | 'saved' | 'unsaved' | 'rollback' | 'report' | 'unreport',
    tx?: any // Transaction context when called within a transaction
  ) {
    const dbContext = tx || db;
    const job = await this.getJobWithStatus(userId, jobId);

    // Update or insert user job status
    const existing = await dbContext.select().from(userJobStatus).where(
      and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId))
    ).limit(1);

    const now = new Date();
    
    if (existing.length > 0) {
      await dbContext
        .update(userJobStatus)
        .set({
          status,
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId)));
    } else {
      await dbContext.insert(userJobStatus).values({
        userId,
        jobId,
        status,
        decidedAt: now,
      });
    }

    // Record action history
    await dbContext.insert(actionHistory).values({
      userId,
      jobId,
      actionType: actionType,
      previousStatus: job.status,
      newStatus: status,
      metadata: {},
    });

    // Return updated job data without refetching
    // Construct the updated job object from what we know
    return {
      ...job,
      status,
      decidedAt: now,
    };
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
      const escapedSearch = escapeLikePattern(search);
      whereConditions = and(
        whereConditions,
        or(
          like(jobs.company, `%${escapedSearch}%`),
          like(jobs.position, `%${escapedSearch}%`)
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
      const escapedSearch = escapeLikePattern(search);
      countWhereConditions = and(
        countWhereConditions,
        sql`EXISTS (
          SELECT 1 FROM ${jobs} 
          WHERE ${jobs.id} = ${userJobStatus.jobId} 
          AND (${like(jobs.company, `%${escapedSearch}%`)} OR ${like(jobs.position, `%${escapedSearch}%`)})
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
      const escapedSearch = escapeLikePattern(search);
      whereConditions = and(
        whereConditions,
        or(
          like(jobs.company, `%${escapedSearch}%`),
          like(jobs.position, `%${escapedSearch}%`)
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
      const escapedSearch = escapeLikePattern(search);
      countWhereConditions = and(
        countWhereConditions,
        sql`EXISTS (
          SELECT 1 FROM ${jobs} 
          WHERE ${jobs.id} = ${userJobStatus.jobId} 
          AND (${like(jobs.company, `%${escapedSearch}%`)} OR ${like(jobs.position, `%${escapedSearch}%`)})
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

  /**
   * Accept a job and create an application
   * @param userId - The user's UUID
   * @param jobId - The job's UUID
   * @param _requestId - Optional request ID for tracing
   * @param metadata - Optional metadata including automaticApply flag
   * @returns Promise containing job, application, and workflow run (if auto-apply enabled)
   * @throws {NotFoundError} If job doesn't exist
   */
  async acceptJob(userId: string, jobId: string, _requestId?: string, metadata?: { automaticApply?: boolean }) {
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
        } catch (error: unknown) {
          // Check if it's a unique constraint violation (duplicate application)
          if (isDatabaseError(error) && (error.code === '23505' || error.constraint === 'applications_user_id_job_id_unique')) {
            logger.warn({ userId, jobId }, 'Application already exists for this user and job (race condition prevented)');
            // Fetch the existing application that was created by the concurrent request
            const [existingApp] = await tx
              .select()
              .from(applications)
              .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
              .limit(1);
            application = existingApp;
          } else {
            logger.error({ error, userId, jobId }, 'Failed to create application during job acceptance');
            return { job, application: null, workflow: null };
          }
        }
      }

      // Determine if auto-apply should be triggered
      // If metadata.automaticApply is explicitly set, use that value
      // Otherwise, fall back to user's autoApplyEnabled setting
      const shouldAutoApply = metadata?.automaticApply !== undefined
        ? metadata.automaticApply
        : userPrefs.autoApplyEnabled;

      // Create workflow run with idempotency key
      let workflowRun = null;
      if (shouldAutoApply) {
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

        // Schedule 1-minute delay timer with validation
        const failureTimestamp = new Date();
        try {
          const timerId = await timerService.scheduleAutoApplyDelay(userId, application.id);
          if (!timerId || timerId === '') {
            logger.error({ userId, applicationId: application.id }, 'Failed to create auto-apply delay timer');
            // Update workflow status to indicate scheduling failure
            await tx
              .update(workflowRuns)
              .set({
                status: 'failed',
                currentStep: 'timer_scheduling_failed',
                updatedAt: failureTimestamp,
              })
              .where(eq(workflowRuns.id, workflowRun.id));
          } else {
            logger.info({ 
              userId, 
              jobId, 
              applicationId: application.id, 
              workflowRunId: workflow.id,
              timerId 
            }, 'Auto-apply workflow scheduled with 1-minute delay');
          }
        } catch (timerError) {
          logger.error({ error: timerError, userId, applicationId: application.id }, 'Exception while scheduling auto-apply timer');
          // Don't fail the job acceptance, but log the issue
        }
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

      // Delete the application record
      await tx
        .delete(applications)
        .where(eq(applications.id, app.id));

      logger.info({ userId, jobId, applicationId: app.id }, 'Application deleted during rollback');

      // Update job status back to pending (using transaction)
      const job = await this.updateJobStatus(userId, jobId, 'pending', 'rollback', tx);

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
  async blockCompany(userId: string, companyName: string, reason?: string, tx?: any) { // Transaction context when called within a transaction
    const dbContext = tx || db;
    const [blocked] = await dbContext
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
        await this.blockCompany(userId, job.company, 'Reported via dont_recommend_company', tx);
      }

      // Notify filtering microservice based on reason
      try {
        const filterType: FilterType = 
          reason === 'fake' ? 'fake' : 
          reason === 'dont_recommend_company' ? 'company_block' : 
          'not_interested';

        const filterRequest: JobFilterRequest = {
          jobId,
          userId,
          filterType,
          companyName: job.company,
          jobDetails: {
            position: job.position,
            description: job.description || undefined,
            requirements: job.requirements || undefined,
            location: job.location || undefined,
          },
        };

        if (process.env.JOB_FILTER_SERVICE_URL) {
          await jobFilterClient.request<JobFilterResponse>('/filter/add', {
            method: 'POST',
            body: filterRequest,
          });
          logger.info({ userId, jobId, filterType }, 'Notified job filtering microservice');
        }
      } catch (error) {
        logger.error({ error, userId, jobId, reason }, 'Failed to notify job filtering microservice');
        // Don't fail the report operation if microservice call fails
      }

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

      // Notify filtering microservice to remove filters
      try {
        if (process.env.JOB_FILTER_SERVICE_URL) {
          const job = await this.getJobWithStatus(userId, jobId);
          
          const filterType: FilterType = 
            report.reason === 'fake' ? 'fake' : 
            report.reason === 'dont_recommend_company' ? 'company_block' : 
            'not_interested';

          const filterRequest: JobFilterRequest = {
            jobId,
            userId,
            filterType,
            companyName: job.company,
            jobDetails: {
              position: job.position,
              description: job.description || undefined,
              requirements: job.requirements || undefined,
              location: job.location || undefined,
            },
          };

          await jobFilterClient.request<JobFilterResponse>('/filter/remove', {
            method: 'POST',
            body: filterRequest,
          });
          logger.info({ userId, jobId, filterType }, 'Notified job filtering microservice to remove filter');
        }
      } catch (error) {
        logger.error({ error, userId, jobId }, 'Failed to notify job filtering microservice');
        // Don't fail the unreport operation if microservice call fails
      }

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

  /**
   * Export saved jobs to CSV
   */
  async exportSavedJobsToCSV(savedJobs: any[]): Promise<string> {
    const headers = ['Company', 'Position', 'Location', 'Salary', 'Skills', 'Job Type', 'Status'];
    
    const escapeCSVCell = (cell: any): string => {
      let value = String(cell ?? '');
      // Escape double quotes
      value = value.replace(/"/g, '""');
      // Replace newlines with spaces
      value = value.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
      return `"${value}"`;
    };
    
    const rows = savedJobs.map((job) => [
      job.company ?? '',
      job.position ?? '',
      job.location ?? '',
      job.salary ?? '',
      Array.isArray(job.skills) ? job.skills.join(', ') : (job.skills ?? ''),
      job.jobType ?? '',
      job.status ?? '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSVCell).join(',')),
    ].join('\n');

    return csvContent;
  },

  /**
   * Export saved jobs to PDF
   */
  async exportSavedJobsToPDF(savedJobs: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        const buffers: Buffer[] = [];

        // Collect PDF data
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Title
        doc.fontSize(20).font('Helvetica-Bold').text('Saved Jobs Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        if (savedJobs.length === 0) {
          doc.fontSize(12).font('Helvetica').text('No saved jobs found.', { align: 'center' });
        } else {
          // Iterate through saved jobs
          savedJobs.forEach((job, index) => {
            if (index > 0) {
              doc.moveDown();
              doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
              doc.moveDown();
            }

            // Job details
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
            doc.text(`${index + 1}. ${job.company} - ${job.position}`, { continued: false });
            doc.moveDown(0.5);

            doc.fontSize(10).font('Helvetica').fillColor('#666666');

            // Location
            if (job.location) {
              doc.text(`Location: ${job.location}`);
            }

            // Salary
            if (job.salary) {
              doc.text(`Salary: ${job.salary}`);
            }

            // Skills
            if (job.skills) {
              doc.text(`Skills: ${job.skills}`);
            }

            // Job Type
            if (job.jobType) {
              doc.text(`Job Type: ${job.jobType}`);
            }

            // Status
            doc.fillColor('#000000').font('Helvetica-Bold').text(`Status: `, { continued: true });
            doc.font('Helvetica').fillColor('#666666').text(job.status || 'pending');
          });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  },
};
