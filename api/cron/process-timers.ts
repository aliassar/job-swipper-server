import { timerService } from '../../src/services/timer.service';
import { timerHandlers } from '../../src/services/timer-handlers.service';
import { logger } from '../../src/middleware/logger';

/**
 * Vercel Cron Job: Process Pending Timers
 * 
 * This endpoint is called by Vercel cron every minute to process
 * any pending timers that are ready to execute.
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/process-timers",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Processing pending timers...');

    // Get all pending timers
    const timers = await timerService.getPendingTimers();

    console.log(`Found ${timers.length} pending timers to process`);

    // Process each timer based on its type
    for (const timer of timers) {
      try {
        console.log(`Processing timer ${timer.id} of type ${timer.type}`);

        // CRITICAL: Mark as executed FIRST to prevent double-processing
        // If handler crashes, timer won't retry infinitely (failed timers should be tracked separately)
        // This also prevents race condition where rollback cancels timer after we fetched but before we process
        await timerService.markTimerExecuted(timer.id);

        switch (timer.type) {
          case 'auto_apply_delay':
            await timerHandlers.handleAutoApplyDelay(timer);
            break;

          case 'cv_verification':
            await timerHandlers.handleCvVerificationTimeout(timer);
            break;

          case 'message_verification':
            await timerHandlers.handleMessageVerificationTimeout(timer);
            break;

          case 'doc_deletion':
            await timerHandlers.handleDocDeletion(timer);
            break;

          case 'follow_up_reminder':
            await timerHandlers.handleFollowUpReminder(timer);
            break;

          default:
            console.log(`Unknown timer type: ${timer.type}`);
        }

        console.log(`Timer ${timer.id} processed successfully`);
      } catch (error) {
        console.error(`Error processing timer ${timer.id}:`, error);
        logger.error({ error, timerId: timer.id, timerType: timer.type }, 'Failed to process timer');
        // Timer already marked as executed - track failures separately for manual review
      }
    }

    console.log('Successfully processed pending timers');

    return res.status(200).json({
      success: true,
      message: 'Timers processed',
      processed: timers.length
    });
  } catch (error) {
    console.error('Error processing timers:', error);
    logger.error({ error }, 'Fatal error in timer processing');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
