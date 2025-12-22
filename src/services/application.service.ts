import { db } from '../lib/db';
import { applications, jobs, actionHistory, generatedResumes, generatedCoverLetters, resumeFiles, workflowRuns } from '../db/schema';
import { eq, and, desc, sql, or, SQL, gte, lte, between } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { logger } from '../middleware/logger';
import { storage } from '../lib/storage';
import { timerService } from './timer.service';
import PDFDocument from 'pdfkit';
import { prepareCaseInsensitiveSearch } from '../lib/utils';

export const applicationService = {
  async getApplications(userId: string, page: number = 1, limit: number = 20, search?: string) {
    const offset = (page - 1) * limit;

    let whereConditions: SQL<unknown> | undefined = eq(applications.userId, userId);

    if (search) {
      const lowerSearch = prepareCaseInsensitiveSearch(search);
      whereConditions = and(
        whereConditions,
        or(
          sql`LOWER(${jobs.company}) LIKE ${`%${lowerSearch}%`}`,
          sql`LOWER(${jobs.position}) LIKE ${`%${lowerSearch}%`}`
        )
      );
    }

    const items = await db
      .select({
        id: applications.id,
        stage: applications.stage,
        notes: applications.notes,
        appliedAt: applications.appliedAt,
        createdAt: applications.createdAt,
        lastUpdated: applications.lastUpdated,
        updatedAt: applications.updatedAt,
        jobId: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(whereConditions)
      .orderBy(desc(applications.lastUpdated))
      .limit(limit)
      .offset(offset);

    let countWhereConditions: SQL<unknown> | undefined = eq(applications.userId, userId);

    if (search) {
      const lowerSearch = prepareCaseInsensitiveSearch(search);
      countWhereConditions = and(
        countWhereConditions,
        sql`EXISTS (
          SELECT 1 FROM ${jobs} 
          WHERE ${jobs.id} = ${applications.jobId} 
          AND (LOWER(${jobs.company}) LIKE ${`%${lowerSearch}%`} OR LOWER(${jobs.position}) LIKE ${`%${lowerSearch}%`})
        )`
      );
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(applications)
      .where(countWhereConditions);

    const total = Number(totalResult[0]?.count || 0);

    return {
      items: items.map((item) => ({
        id: item.id,
        stage: item.stage,
        notes: item.notes,
        appliedAt: item.appliedAt,
        createdAt: item.createdAt,
        lastUpdated: item.lastUpdated,
        updatedAt: item.updatedAt,
        job: {
          id: item.jobId,
          company: item.company,
          position: item.position,
          location: item.location,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getApplicationById(userId: string, applicationId: string) {
    const result = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Application');
    }

    return result[0];
  },

  async updateApplicationStage(
    userId: string,
    applicationId: string,
    stage: 'Syncing' | 'CV Check' | 'Message Check' | 'Being Applied' | 'Applied' | 'Interview 1' | 'Next Interviews' | 'Offer' | 'Rejected' | 'Accepted' | 'Withdrawn' | 'Failed'
  ) {
    const application = await this.getApplicationById(userId, applicationId);

    await db
      .update(applications)
      .set({
        stage: stage,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId: application.jobId,
      actionType: 'stage_updated',
      metadata: {
        applicationId,
        previousStage: application.stage,
        newStage: stage,
      },
    });

    return await this.getApplicationById(userId, applicationId);
  },

  async createApplication(
    userId: string,
    jobId: string,
    resumeFileId?: string
  ) {
    const result = await db
      .insert(applications)
      .values({
        userId,
        jobId,
        resumeFileId,
        stage: 'Syncing',
        lastUpdated: new Date(),
      })
      .returning();

    return result[0];
  },

  /**
   * Get application details with job and documents
   */
  async getApplicationDetails(userId: string, applicationId: string) {
    const application = await this.getApplicationById(userId, applicationId);

    // Get job details
    const job = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, application.jobId))
      .limit(1);

    // Get generated resume if exists
    let generatedResume = null;
    if (application.generatedResumeId) {
      const resume = await db
        .select()
        .from(generatedResumes)
        .where(eq(generatedResumes.id, application.generatedResumeId))
        .limit(1);
      generatedResume = resume.length > 0 ? resume[0] : null;
    }

    // Get generated cover letter if exists
    let generatedCoverLetter = null;
    if (application.generatedCoverLetterId) {
      const coverLetter = await db
        .select()
        .from(generatedCoverLetters)
        .where(eq(generatedCoverLetters.id, application.generatedCoverLetterId))
        .limit(1);
      generatedCoverLetter = coverLetter.length > 0 ? coverLetter[0] : null;
    }

    // Get workflow run if exists
    const workflow = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.applicationId, applicationId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);

    return {
      ...application,
      job: job.length > 0 ? job[0] : null,
      generatedResume,
      generatedCoverLetter,
      workflow: workflow.length > 0 ? workflow[0] : null,
    };
  },

  /**
   * Get application by job ID
   */
  async getApplicationByJobId(userId: string, jobId: string) {
    const result = await db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Application');
    }

    return result[0];
  },

  /**
   * Update application notes
   */
  async updateApplicationNotes(userId: string, applicationId: string, notes: string) {
    await this.getApplicationById(userId, applicationId);

    await db
      .update(applications)
      .set({
        notes,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    return await this.getApplicationById(userId, applicationId);
  },

  /**
   * Confirm CV verification
   */
  async confirmCvVerification(userId: string, applicationId: string) {
    const application = await this.getApplicationById(userId, applicationId);

    if (application.stage !== 'CV Check') {
      throw new Error('Application is not in CV Check stage');
    }

    // Cancel any pending CV verification timers
    await timerService.cancelTimersByTarget(applicationId, 'cv_verification');

    // Move to next stage
    await this.updateApplicationStage(userId, applicationId, 'Message Check');

    logger.info({ userId, applicationId }, 'CV verified by user');

    return await this.getApplicationById(userId, applicationId);
  },

  /**
   * Reject CV and reupload
   */
  async rejectCvAndReupload(userId: string, applicationId: string, newResumeFile: any) {
    const application = await this.getApplicationById(userId, applicationId);

    if (application.stage !== 'CV Check') {
      throw new Error('Application is not in CV Check stage');
    }

    // Cancel any pending CV verification timers
    await timerService.cancelTimersByTarget(applicationId, 'cv_verification');

    // Upload new resume
    const key = storage.generateKey(userId, 'resume', newResumeFile.filename);
    const fileUrl = await storage.uploadFile(key, newResumeFile.buffer, newResumeFile.mimetype);

    // Create new resume file record
    const [resumeFile] = await db
      .insert(resumeFiles)
      .values({
        userId,
        filename: newResumeFile.filename,
        fileUrl,
        isPrimary: false,
        isReference: false,
      })
      .returning();

    // Update application
    await db
      .update(applications)
      .set({
        resumeFileId: resumeFile.id,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    logger.info({ userId, applicationId }, 'CV rejected and reuploaded');

    // Schedule new CV verification timer
    await timerService.scheduleCvVerificationTimer(userId, applicationId);

    return await this.getApplicationById(userId, applicationId);
  },

  /**
   * Confirm message verification
   */
  async confirmMessageVerification(userId: string, applicationId: string) {
    const application = await this.getApplicationById(userId, applicationId);

    if (application.stage !== 'Message Check') {
      throw new Error('Application is not in Message Check stage');
    }

    // Cancel any pending message verification timers
    await timerService.cancelTimersByTarget(applicationId, 'message_verification');

    // Move to next stage - Being Applied
    await this.updateApplicationStage(userId, applicationId, 'Being Applied');

    logger.info({ userId, applicationId }, 'Message verified by user, moving to Being Applied stage');

    return await this.getApplicationById(userId, applicationId);
  },

  /**
   * Update and confirm message
   */
  async updateAndConfirmMessage(userId: string, applicationId: string, editedMessage: string) {
    const application = await this.getApplicationById(userId, applicationId);

    if (application.stage !== 'Message Check') {
      throw new Error('Application is not in Message Check stage');
    }

    // Cancel any pending message verification timers
    await timerService.cancelTimersByTarget(applicationId, 'message_verification');

    // Update message
    await db
      .update(applications)
      .set({
        generatedMessage: editedMessage,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    // Move to next stage - Being Applied
    await this.updateApplicationStage(userId, applicationId, 'Being Applied');

    logger.info({ userId, applicationId }, 'Message updated and verified by user, moving to Being Applied stage');

    return await this.getApplicationById(userId, applicationId);
  },

  /**
   * Handle application rollback
   */
  async handleApplicationRollback(userId: string, applicationId: string) {
    const application = await this.getApplicationById(userId, applicationId);

    // Cancel any pending workflow
    const workflow = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.applicationId, applicationId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);

    if (workflow.length > 0 && workflow[0].status !== 'completed' && workflow[0].status !== 'cancelled') {
      await db
        .update(workflowRuns)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, workflow[0].id));
    }

    // Cancel all pending timers for this application
    await timerService.cancelTimersByTarget(applicationId);

    // If documents were generated, schedule deletion timer
    if (application.generatedResumeId || application.generatedCoverLetterId) {
      await timerService.scheduleDocDeletionTimer(
        userId,
        application.generatedResumeId || '',
        application.generatedCoverLetterId || undefined
      );
    }

    logger.info({ userId, applicationId }, 'Application rolled back');

    return { success: true };
  },

  /**
   * Toggle auto status for application
   */
  async toggleAutoStatus(userId: string, applicationId: string) {
    const application = await this.getApplicationById(userId, applicationId);

    await db
      .update(applications)
      .set({
        autoUpdateStatus: !application.autoUpdateStatus,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    return await this.getApplicationById(userId, applicationId);
  },

  /**
   * Get application history with filters
   */
  async getApplicationHistory(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      search?: string;
      stage?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    let whereConditions: SQL<unknown> | undefined = eq(applications.userId, userId);

    // Add date filters
    if (options.startDate && options.endDate) {
      whereConditions = and(
        whereConditions,
        between(applications.createdAt, options.startDate, options.endDate)
      );
    } else if (options.startDate) {
      whereConditions = and(
        whereConditions,
        gte(applications.createdAt, options.startDate)
      );
    } else if (options.endDate) {
      whereConditions = and(
        whereConditions,
        lte(applications.createdAt, options.endDate)
      );
    }

    // Add stage filter
    if (options.stage) {
      whereConditions = and(whereConditions, eq(applications.stage, options.stage as any));
    }

    // Add search filter (case-insensitive)
    if (options.search) {
      const lowerSearch = prepareCaseInsensitiveSearch(options.search);
      whereConditions = and(
        whereConditions,
        or(
          sql`LOWER(${jobs.company}) LIKE ${`%${lowerSearch}%`}`,
          sql`LOWER(${jobs.position}) LIKE ${`%${lowerSearch}%`}`
        )
      );
    }

    const items = await db
      .select({
        id: applications.id,
        stage: applications.stage,
        notes: applications.notes,
        appliedAt: applications.appliedAt,
        lastUpdated: applications.lastUpdated,
        createdAt: applications.createdAt,
        jobId: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(whereConditions)
      .orderBy(desc(applications.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(whereConditions);

    const total = Number(totalResult[0]?.count || 0);

    return {
      items: items.map((item) => ({
        id: item.id,
        stage: item.stage,
        notes: item.notes,
        appliedAt: item.appliedAt,
        lastUpdated: item.lastUpdated,
        createdAt: item.createdAt,
        job: {
          id: item.jobId,
          company: item.company,
          position: item.position,
          location: item.location,
          salary: item.salary,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Export applications to CSV
   */
  async exportApplicationsToCSV(applications: any[]): Promise<string> {
    const headers = ['Company', 'Position', 'Location', 'Salary', 'Stage', 'Applied At', 'Notes'];

    const escapeCSVCell = (cell: any): string => {
      let value = String(cell ?? '');
      // Escape double quotes
      value = value.replace(/"/g, '""');
      // Replace newlines with spaces
      value = value.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
      return `"${value}"`;
    };

    const rows = applications.map((app) => [
      // Support both nested (app.job.company) and flat (app.company) structures
      app.job?.company ?? app.company ?? '',
      app.job?.position ?? app.position ?? '',
      app.job?.location ?? app.location ?? '',
      app.job?.salary ?? app.salary ?? '',
      app.stage ?? '',
      app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '',
      app.notes ?? '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSVCell).join(',')),
    ].join('\n');

    return csvContent;
  },

  /**
   * Export applications to PDF
   * Returns a Buffer containing the PDF document
   */
  async exportApplicationsToPDF(applications: any[]): Promise<Buffer> {
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
        doc.fontSize(20).font('Helvetica-Bold').text('Job Applications Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        // Table headers
        doc.fontSize(12).font('Helvetica-Bold');

        if (applications.length === 0) {
          doc.fontSize(12).font('Helvetica').text('No applications found.', { align: 'center' });
        } else {
          // Iterate through applications
          applications.forEach((app, index) => {
            if (index > 0) {
              doc.moveDown();
              doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
              doc.moveDown();
            }

            // Application details
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
            doc.text(`${index + 1}. ${app.job.company} - ${app.job.position}`, { continued: false });
            doc.moveDown(0.5);

            doc.fontSize(10).font('Helvetica').fillColor('#666666');

            // Location
            if (app.job.location) {
              doc.text(`Location: ${app.job.location}`);
            }

            // Salary
            if (app.job.salary) {
              doc.text(`Salary: ${app.job.salary}`);
            }

            // Stage
            doc.fillColor('#000000').font('Helvetica-Bold').text(`Stage: `, { continued: true });
            doc.font('Helvetica').text(app.stage);

            // Applied date
            if (app.appliedAt) {
              doc.font('Helvetica-Bold').text(`Applied: `, { continued: true });
              doc.font('Helvetica').text(new Date(app.appliedAt).toLocaleDateString());
            }

            // Notes
            if (app.notes) {
              doc.moveDown(0.5);
              doc.font('Helvetica-Bold').text('Notes: ', { continued: true });
              doc.font('Helvetica').text(app.notes, { width: 495 });
            }

            // Check if we need a new page
            if (doc.y > 700 && index < applications.length - 1) {
              doc.addPage();
            }
          });
        }

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).font('Helvetica').fillColor('#999999');
          doc.text(
            `Page ${i + 1} of ${pageCount}`,
            50,
            doc.page.height - 30,
            { align: 'center' }
          );
        }

        // Finalize the PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Update custom document URLs for an application
   */
  async updateCustomDocuments(
    userId: string,
    applicationId: string,
    resumeUrl?: string | null,
    coverLetterUrl?: string | null
  ) {
    // Verify application belongs to user
    await this.getApplicationById(userId, applicationId);

    // Update the application with custom document URLs
    const updated = await db
      .update(applications)
      .set({
        customResumeUrl: resumeUrl,
        customCoverLetterUrl: coverLetterUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId)
        )
      )
      .returning();

    return updated[0];
  },
};
