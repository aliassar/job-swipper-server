import { timerService } from '../../src/services/timer.service';

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
    await timerService.processPendingTimers();
    console.log('Successfully processed pending timers');

    return res.status(200).json({ success: true, message: 'Timers processed' });
  } catch (error) {
    console.error('Error processing timers:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
