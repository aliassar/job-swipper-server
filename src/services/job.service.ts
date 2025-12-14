import { db } from '../lib/db';
import { jobs, userJobStatus, actionHistory, userSettings, applications } from '../db/schema';
import { eq, and, desc, sql, like, or, SQL } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { generationService } from './generation.service';
import { applicationService } from './application.service';
import { resumeService } from './resume.service';
import { logger } from '../middleware/logger';

export const jobService = {
  async getPendingJobs(userId: string, search?: string, limit: number = 10) {
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

    // Add search if provided
    if (search) {
      query = query.where(
        or(
          like(jobs.company, `%${search}%`),
          like(jobs.position, `%${search}%`)
        )
      );
    }

    return await query.orderBy(desc(jobs.createdAt)).limit(limit);
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
    // Update job status to accepted
    const job = await this.updateJobStatus(userId, jobId, 'accepted', 'accepted');

    // Get user settings to check auto-generation preferences
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (settings.length === 0) {
      return job; // No settings, return early
    }

    const userPrefs = settings[0];

    // Create application record
    let application;
    try {
      application = await applicationService.createApplication(userId, jobId);
    } catch (error) {
      // Application might already exist, continue
      logger.error({ error, userId, jobId }, 'Error creating application during job acceptance');
    }

    // Auto-generate resume if enabled
    if (userPrefs.autoGenerateResume && application) {
      try {
        const referenceResume = await resumeService.getReferenceResume(userId);
        if (referenceResume) {
          const generatedResume = await generationService.generateResume(
            userId,
            jobId,
            referenceResume.id,
            requestId
          );

          // Update application with generated resume
          await db
            .update(applications)
            .set({ generatedResumeId: generatedResume.id })
            .where(eq(applications.id, application.id));
        }
      } catch (error) {
        logger.error({ error, userId, jobId }, 'Error auto-generating resume');
      }
    }

    // Auto-generate cover letter if enabled
    if (userPrefs.autoGenerateCoverLetter && application) {
      try {
        const generatedCoverLetter = await generationService.generateCoverLetter(
          userId,
          jobId,
          requestId
        );

        // Update application with generated cover letter
        await db
          .update(applications)
          .set({ generatedCoverLetterId: generatedCoverLetter.id })
          .where(eq(applications.id, application.id));
      } catch (error) {
        logger.error({ error, userId, jobId }, 'Error auto-generating cover letter');
      }
    }

    // TODO: Auto-generate email if enabled
    // if (userPrefs.autoGenerateEmail) { ... }

    return job;
  },
};
